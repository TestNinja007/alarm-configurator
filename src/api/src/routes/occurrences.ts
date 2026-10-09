import { DateTime } from 'luxon';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/guard.js';
import {
  hasFinished,
  stepOccurrencesFor,
  type SequenceSpec,
} from '../sequences/engine.js';
import { clock } from '../clock.js';
import { query, queryOne } from '../db/pool.js';
import { notFound, validationError } from '../errors.js';
import type { AlarmRow } from '../domain/mappers.js';
import { conflictsInFolder, specFromRow, CONFLICT_WINDOW_DAYS } from '../domain/conflicts.js';
import { validateSchedule } from '../domain/validation.js';
import { nextOccurrence, occurrencesFor, placedOccurrencesFor } from '../recurrence/engine.js';
import { normaliseRule } from '../schemas/rule.js';
import {
  ConflictListSchema,
  FolderSummarySchema,
  UpcomingListSchema,
  UpcomingQuerySchema,
  type UpcomingQuery,
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
  a.start_date, a.end_date, a.end_time, a.end_after_occurrences,
  a.speech_text, a.speech_final_text, a.speech_voice,
  a.end_time_of_day, a.repeat_every, a.repeat_unit,
  a.rule, a.created_at, a.updated_at
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
       FROM alarms a
      WHERE a.id = $1 AND a.user_id = $2`,
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
  if (!row) throw notFound('Group');
}

/**
 * How far into the past the step window reaches, so a step that has only just
 * come due still reaches the browser. Comfortably longer than one poll
 * interval and far shorter than the shortest step a sequence may hold.
 */
const STEP_GRACE_MS = 30_000;

/**
 * Steps of every running sequence that fall in the window.
 *
 * This is also where a run ends on its own. The browser that pressed Activate
 * may be closed long before the last step, so "is it still running" cannot be
 * the browser's opinion - the server compares the elapsed time against the
 * run's length and closes it. That is what makes a sequence deactivate itself
 * once its steps are done, rather than staying active until somebody presses
 * stop.
 */
async function upcomingSequenceSteps(userId: string, now: Date, until: Date) {
  const runs = (
    await query<{
      run_id: string;
      sequence_id: string;
      started_at: Date;
      name: string;
      repeat_mode: 'once' | 'duration' | 'count';
      repeat_seconds: number | null;
      repeat_count: number | null;
      closing_text: string | null;
    }>(
      `SELECT r.id AS run_id, r.sequence_id, r.started_at,
              s.name, s.repeat_mode, s.repeat_seconds, s.repeat_count, s.closing_text
         FROM sequence_runs r
         JOIN sequences s ON s.id = r.sequence_id
        WHERE r.user_id = $1 AND r.ended_at IS NULL`,
      [userId],
    )
  ).rows;

  if (runs.length === 0) return [];

  const steps = (
    await query<{
      id: string;
      sequence_id: string;
      position: number;
      kind: 'action' | 'pause';
      label: string;
      duration_seconds: number;
      speech_text: string | null;
    }>(
      `SELECT id, sequence_id, position, kind, label, duration_seconds, speech_text
         FROM sequence_steps WHERE sequence_id = ANY($1::uuid[]) ORDER BY position`,
      [runs.map((r) => r.sequence_id)],
    )
  ).rows;

  const found = [];
  const finished: string[] = [];

  for (const run of runs) {
    const spec: SequenceSpec = {
      id: run.sequence_id,
      name: run.name,
      repeatMode: run.repeat_mode,
      repeatSeconds: run.repeat_seconds,
      repeatCount: run.repeat_count,
      closingText: run.closing_text,
      steps: steps
        .filter((step) => step.sequence_id === run.sequence_id)
        .map((step) => ({
          id: step.id,
          position: step.position,
          kind: step.kind,
          label: step.label,
          durationSeconds: step.duration_seconds,
          speechText: step.speech_text,
        })),
    };

    /*
     * Closed only once the whole run is past, not once its last step has
     * fired: a `duration` sequence ends at the window it was given, and the
     * closing announcement lands exactly there.
     */
    if (hasFinished(spec, run.started_at, now)) {
      finished.push(run.run_id);
      continue;
    }

    /*
     * The window reaches slightly into the past, which the alarm path does not
     * need and this one does.
     *
     * A sequence's first step fires at the instant of activation, so by the
     * time the browser polls - even a few milliseconds later - `now` is
     * already past it and a window starting at `now` drops it. The symptom is
     * the worst one this feature could have: you press Activate and nothing
     * happens.
     *
     * The browser already fires anything already due immediately rather than
     * skipping it, and it remembers what it has fired, so handing it a step
     * from a moment ago is safe and is the only way it gets the first one.
     */
    const graceFrom = new Date(now.getTime() - STEP_GRACE_MS);

    for (const step of stepOccurrencesFor(spec, run.started_at, { from: graceFrom, to: until })) {
      found.push({ ...step, runId: run.run_id });
    }
  }

  if (finished.length > 0) {
    await query(
      `UPDATE sequence_runs
          SET ended_at = $2, ended_reason = 'completed'
        WHERE id = ANY($1::uuid[]) AND ended_at IS NULL`,
      [finished, now],
    );
  }

  return found.sort((left, right) => left.utc.localeCompare(right.utc));
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
            endTime: request.body.endTime ?? null,
            endAfterOccurrences: request.body.endAfterOccurrences ?? null,
            endTimeOfDay: request.body.endTimeOfDay ?? null,
            repeatEvery: request.body.repeatEvery ?? null,
            repeatUnit: request.body.repeatUnit ?? null,
            rule: normaliseRule(request.body.rule),
          },
          { from, limit: request.body.limit ?? 10 },
        ),
      };
    },
  );


  app.get<{ Querystring: UpcomingQuery }>(
    '/me/upcoming',
    {
      schema: {
        summary: 'Occurrences due soon across every enabled alarm',
        description:
          'What the browser polls in order to raise a notification when an alarm ' +
          'comes due. Disabled alarms are ignored, as are alarms in other people’s folders.',
        tags: ['occurrences'],
        querystring: UpcomingQuerySchema,
        response: { 200: UpcomingListSchema, ...errorResponses },
      },
    },
    async (request) => {
      const withinMinutes = request.query.withinMinutes ?? 60;
      const now = clock.now();
      const until = new Date(now.getTime() + withinMinutes * 60 * 1000);

      const rows = (
        await query<AlarmRow & { folder_name: string | null }>(
          `SELECT ${ALARM_COLUMNS}, f.name AS folder_name
             FROM alarms a
             LEFT JOIN folders f ON f.id = a.folder_id
            WHERE a.user_id = $1 AND a.enabled = true`,
          [request.user!.id],
        )
      ).rows;

      const items = rows
        .flatMap((row) =>
          placedOccurrencesFor(specFromRow(row), { from: now, to: until, limit: 50 }).map(
            (occurrence) => ({
              alarmId: row.id,
              alarmName: row.name,
              folderId: row.folder_id,
              folderName: row.folder_name,
              timezone: row.timezone,
              note: row.note,
              speechText: row.speech_text,
              speechFinalText: row.speech_final_text,
              speechVoice: row.speech_voice,
              indexInDay: occurrence.indexInDay,
              countInDay: occurrence.countInDay,
              utc: occurrence.utc,
              local: occurrence.local,
            }),
          ),
        )
        // Soonest first, so a client that takes only the head of the list
        // still gets the next thing to fire.
        .sort((left, right) => left.utc.localeCompare(right.utc))
        .slice(0, request.query.limit ?? 50);

      return {
        items,
        sequenceSteps: await upcomingSequenceSteps(request.user!.id, now, until),
        now: now.toISOString(),
        withinMinutes,
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
        items: await conflictsInFolder(request.user!.id, request.params.id),
        windowDays: CONFLICT_WINDOW_DAYS,
      };
    },
  );
}
