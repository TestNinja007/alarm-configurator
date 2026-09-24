import { DateTime } from 'luxon';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/guard.js';
import { clock } from '../clock.js';
import { query, queryOne } from '../db/pool.js';
import { notFound, validationError } from '../errors.js';
import type { AlarmRow } from '../domain/mappers.js';
import { conflictsInFolder, specFromRow, CONFLICT_WINDOW_DAYS } from '../domain/conflicts.js';
import { validateSchedule } from '../domain/validation.js';
import { nextOccurrence, occurrencesFor } from '../recurrence/engine.js';
import { normaliseRule } from '../schemas/rule.js';
import {
  ConflictListSchema,
  FolderSummarySchema,
  OccurrenceListSchema,
  OccurrencesQuerySchema,
  PreviewBodySchema,
  type OccurrencesQuery,
  type PreviewBody,
} from '../schemas/alarms.js';
import { IdParamsSchema, errorResponses, type IdParams } from '../schemas/common.js';

const MAX_WINDOW_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

const ALARM_COLUMNS = `
  a.id, a.folder_id, a.name, a.note, a.enabled, a.time_of_day, a.timezone,
  a.start_date, a.end_date, a.end_after_occurrences, a.rule, a.created_at, a.updated_at
`;

function parseInstant(value: string | undefined, field: string): Date | undefined {
  if (value === undefined) return undefined;
  const parsed = DateTime.fromISO(value, { zone: 'utc' });
  if (!parsed.isValid) {
    throw validationError([
      { field, code: 'invalid_instant', message: `${field} must be an ISO-8601 instant.` },
    ]);
  }
  return parsed.toJSDate();
}

async function loadOwnedAlarm(userId: string, alarmId: string): Promise<AlarmRow> {
  const row = await queryOne<AlarmRow>(
    `SELECT ${ALARM_COLUMNS}
       FROM alarms a JOIN folders f ON f.id = a.folder_id
      WHERE a.id = $1 AND f.user_id = $2`,
    [alarmId, userId],
  );
  if (!row) throw notFound('Alarm');
  return row;
}

async function assertOwnsFolder(userId: string, folderId: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM folders WHERE id = $1 AND user_id = $2',
    [folderId, userId],
  );
  if (!row) throw notFound('Folder');
}

export async function occurrenceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireUser);

  app.post<{ Body: PreviewBody }>(
    '/alarms/preview',
    {
      schema: {
        summary: 'Preview the next occurrences of an unsaved alarm',
        tags: ['occurrences'],
        body: PreviewBodySchema,
        response: { 200: OccurrenceListSchema, ...errorResponses },
      },
    },
    async (request) => {
      // Nothing is persisted and no folder is consulted, so neither R-08 nor
      // R-09 applies; only the schedule itself is validated.
      const { timezone } = validateSchedule(request.body);
      const from = parseInstant(request.body.from, 'from') ?? clock.now();

      return {
        items: occurrencesFor(
          {
            timeOfDay: request.body.timeOfDay,
            timezone,
            startDate: request.body.startDate,
            endDate: request.body.endDate ?? null,
            endAfterOccurrences: request.body.endAfterOccurrences ?? null,
            rule: normaliseRule(request.body.rule),
          },
          { from, limit: request.body.limit ?? 10 },
        ),
      };
    },
  );

  app.get<{ Params: IdParams; Querystring: OccurrencesQuery }>(
    '/alarms/:id/occurrences',
    {
      schema: {
        summary: 'Occurrences of a saved alarm',
        tags: ['occurrences'],
        params: IdParamsSchema,
        querystring: OccurrencesQuerySchema,
        response: { 200: OccurrenceListSchema, ...errorResponses },
      },
    },
    async (request) => {
      const alarm = await loadOwnedAlarm(request.user!.id, request.params.id);

      const from = parseInstant(request.query.from, 'from') ?? clock.now();
      const to = parseInstant(request.query.to, 'to') ?? new Date(from.getTime() + MAX_WINDOW_DAYS * DAY_MS);

      if (to.getTime() < from.getTime()) {
        throw validationError([
          { field: 'to', code: 'before_from', message: 'to must not be earlier than from.' },
        ]);
      }

      if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) {
        throw validationError([
          {
            field: 'to',
            code: 'window_too_large',
            message: `The window between from and to may not exceed ${MAX_WINDOW_DAYS} days.`,
          },
        ]);
      }

      return {
        items: occurrencesFor(specFromRow(alarm), {
          from,
          to,
          limit: request.query.limit ?? 10,
        }),
      };
    },
  );

  app.get<{ Params: IdParams }>(
    '/folders/:id/summary',
    {
      schema: {
        summary: 'Counts and the next occurrence for a folder',
        tags: ['folders'],
        params: IdParamsSchema,
        response: { 200: FolderSummarySchema, ...errorResponses },
      },
    },
    async (request) => {
      await assertOwnsFolder(request.user!.id, request.params.id);

      const rows = (
        await query<AlarmRow>(
          `SELECT ${ALARM_COLUMNS} FROM alarms a WHERE a.folder_id = $1`,
          [request.params.id],
        )
      ).rows;

      const now = clock.now();
      const weekEnd = new Date(now.getTime() + 7 * DAY_MS);
      const enabled = rows.filter((row) => row.enabled);

      // Both bounds are inclusive: an occurrence at exactly `now`, or at
      // exactly now + 7 days, is counted.
      let occurrencesNext7Days = 0;
      let next: { utc: string; local: string } | undefined;

      for (const row of enabled) {
        const spec = specFromRow(row);
        occurrencesNext7Days += occurrencesFor(spec, {
          from: now,
          to: weekEnd,
          limit: Number.MAX_SAFE_INTEGER,
        }).length;

        const candidate = nextOccurrence(spec, now);
        if (candidate && (!next || candidate.utc < next.utc)) next = candidate;
      }

      return {
        alarmCount: rows.length,
        enabledCount: enabled.length,
        occurrencesNext7Days,
        nextOccurrence: next ?? null,
      };
    },
  );

  app.get<{ Params: IdParams }>(
    '/folders/:id/conflicts',
    {
      schema: {
        summary: 'R-08 collisions currently present in a folder',
        tags: ['folders'],
        params: IdParamsSchema,
        response: { 200: ConflictListSchema, ...errorResponses },
      },
    },
    async (request) => {
      await assertOwnsFolder(request.user!.id, request.params.id);
      return {
        items: await conflictsInFolder(request.params.id),
        windowDays: CONFLICT_WINDOW_DAYS,
      };
    },
  );
}
