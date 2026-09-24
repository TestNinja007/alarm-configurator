import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { clock } from '../clock.js';
import { config } from '../config.js';
import { isUniqueViolation, query, queryOne } from '../db/pool.js';
import { conflict, notFound } from '../errors.js';
import { toAlarm, type AlarmRow } from '../domain/mappers.js';
import { validateSchedule } from '../domain/validation.js';
import { normaliseRule } from '../schemas/rule.js';
import {
  AlarmListSchema,
  AlarmSchema,
  CreateAlarmBodySchema,
  ListAlarmsQuerySchema,
  UpdateAlarmBodySchema,
  type CreateAlarmBody,
  type ListAlarmsQuery,
  type UpdateAlarmBody,
} from '../schemas/alarms.js';
import { IdParamsSchema, errorResponses, type IdParams } from '../schemas/common.js';

const ALARM_COLUMNS = `
  a.id, a.folder_id, a.name, a.note, a.enabled, a.time_of_day, a.timezone,
  a.start_date, a.end_date, a.end_after_occurrences, a.rule, a.created_at, a.updated_at
`;

/** Loads an alarm only if it sits in a folder the user owns. */
async function loadAlarm(userId: string, alarmId: string): Promise<AlarmRow | undefined> {
  return queryOne<AlarmRow>(
    `SELECT ${ALARM_COLUMNS}
       FROM alarms a
       JOIN folders f ON f.id = a.folder_id
      WHERE a.id = $1 AND f.user_id = $2`,
    [alarmId, userId],
  );
}

async function assertOwnsFolder(userId: string, folderId: string): Promise<void> {
  const row = await queryOne<{ id: string }>(
    'SELECT id FROM folders WHERE id = $1 AND user_id = $2',
    [folderId, userId],
  );
  // A folder belonging to somebody else reads as missing, never as forbidden.
  if (!row) throw notFound('Folder');
}

function duplicateNameConflict() {
  return conflict('An alarm with that name already exists in this folder.', {
    fields: [
      {
        field: 'name',
        code: 'duplicate_name',
        message: 'Alarm names must be unique within a folder.',
      },
    ],
  });
}

export async function alarmRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireUser);

  app.get<{ Querystring: ListAlarmsQuery }>(
    '/alarms',
    {
      schema: {
        summary: 'List alarms',
        tags: ['alarms'],
        querystring: ListAlarmsQuerySchema,
        response: { 200: AlarmListSchema, ...errorResponses },
      },
    },
    async (request) => {
      // A-01: a fixed, documented pause so the list's skeleton state is real.
      if (config.listDelayMs > 0) await delay(config.listDelayMs);

      const page = request.query.page ?? 1;
      const pageSize = request.query.pageSize ?? 25;

      const conditions: string[] = ['f.user_id = $1'];
      const params: (string | number | boolean)[] = [request.user!.id];

      if (request.query.folderId) {
        params.push(request.query.folderId);
        conditions.push(`a.folder_id = $${params.length}`);
      }
      if (request.query.enabled !== undefined) {
        params.push(request.query.enabled);
        conditions.push(`a.enabled = $${params.length}`);
      }
      const search = request.query.q?.trim();
      if (search) {
        params.push(`%${search}%`);
        conditions.push(`a.name ILIKE $${params.length}`);
      }

      const where = conditions.join(' AND ');

      const totalRow = await queryOne<{ total: number }>(
        `SELECT count(*)::bigint AS total
           FROM alarms a JOIN folders f ON f.id = a.folder_id
          WHERE ${where}`,
        params,
      );

      // sort=next needs the recurrence engine and is wired up in stage 2;
      // until then it falls back to creation order.
      const orderBy =
        request.query.sort === 'name'
          ? 'lower(a.name) ASC, a.id ASC'
          : 'a.created_at ASC, a.id ASC';

      params.push(pageSize, (page - 1) * pageSize);
      const rows = await query<AlarmRow>(
        `SELECT ${ALARM_COLUMNS}
           FROM alarms a JOIN folders f ON f.id = a.folder_id
          WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return {
        items: rows.rows.map(toAlarm),
        total: totalRow?.total ?? 0,
        page,
        pageSize,
      };
    },
  );

  app.post<{ Body: CreateAlarmBody }>(
    '/alarms',
    {
      schema: {
        summary: 'Create an alarm',
        tags: ['alarms'],
        body: CreateAlarmBodySchema,
        response: { 201: AlarmSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      await assertOwnsFolder(request.user!.id, request.body.folderId);
      const { timezone } = validateSchedule(request.body);

      const id = randomUUID();
      const now = clock.now();

      try {
        await query(
          `INSERT INTO alarms (id, folder_id, name, note, enabled, time_of_day, timezone,
                               start_date, end_date, end_after_occurrences, rule,
                               created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
          [
            id,
            request.body.folderId,
            request.body.name.trim(),
            request.body.note?.trim() || null,
            request.body.enabled ?? true,
            request.body.timeOfDay,
            timezone,
            request.body.startDate,
            request.body.endDate ?? null,
            request.body.endAfterOccurrences ?? null,
            JSON.stringify(normaliseRule(request.body.rule)),
            now,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error, 'alarms_folder_name_key')) throw duplicateNameConflict();
        throw error;
      }

      reply.status(201);
      return toAlarm((await loadAlarm(request.user!.id, id))!);
    },
  );

  app.get<{ Params: IdParams }>(
    '/alarms/:id',
    {
      schema: {
        summary: 'Get an alarm',
        tags: ['alarms'],
        params: IdParamsSchema,
        response: { 200: AlarmSchema, ...errorResponses },
      },
    },
    async (request) => {
      const row = await loadAlarm(request.user!.id, request.params.id);
      if (!row) throw notFound('Alarm');
      return toAlarm(row);
    },
  );

  app.put<{ Params: IdParams; Body: UpdateAlarmBody }>(
    '/alarms/:id',
    {
      schema: {
        summary: 'Replace an alarm',
        tags: ['alarms'],
        params: IdParamsSchema,
        body: UpdateAlarmBodySchema,
        response: { 200: AlarmSchema, ...errorResponses },
      },
    },
    async (request) => {
      const existing = await loadAlarm(request.user!.id, request.params.id);
      if (!existing) throw notFound('Alarm');

      await assertOwnsFolder(request.user!.id, request.body.folderId);
      const { timezone } = validateSchedule(request.body);

      try {
        await query(
          `UPDATE alarms
              SET folder_id = $1, name = $2, note = $3, time_of_day = $4, timezone = $5,
                  start_date = $6, end_date = $7, end_after_occurrences = $8, rule = $9,
                  updated_at = $10
            WHERE id = $11`,
          [
            request.body.folderId,
            request.body.name.trim(),
            request.body.note?.trim() || null,
            request.body.timeOfDay,
            timezone,
            request.body.startDate,
            request.body.endDate ?? null,
            request.body.endAfterOccurrences ?? null,
            JSON.stringify(normaliseRule(request.body.rule)),
            clock.now(),
            request.params.id,
          ],
        );
      } catch (error) {
        if (isUniqueViolation(error, 'alarms_folder_name_key')) throw duplicateNameConflict();
        throw error;
      }

      return toAlarm((await loadAlarm(request.user!.id, request.params.id))!);
    },
  );

  app.delete<{ Params: IdParams }>(
    '/alarms/:id',
    {
      schema: {
        summary: 'Delete an alarm',
        tags: ['alarms'],
        params: IdParamsSchema,
        response: { 204: Type.Null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      const existing = await loadAlarm(request.user!.id, request.params.id);
      if (!existing) throw notFound('Alarm');
      await query('DELETE FROM alarms WHERE id = $1', [request.params.id]);
      reply.status(204);
      return null;
    },
  );

  const toggles = [
    { path: '/alarms/:id/enable', enabled: true },
    { path: '/alarms/:id/disable', enabled: false },
  ];

  for (const toggle of toggles) {
    app.post<{ Params: IdParams }>(
      toggle.path,
      {
        schema: {
          summary: toggle.enabled ? 'Enable an alarm' : 'Disable an alarm',
          tags: ['alarms'],
          params: IdParamsSchema,
          response: { 200: AlarmSchema, ...errorResponses },
        },
      },
      async (request) => {
        const existing = await loadAlarm(request.user!.id, request.params.id);
        if (!existing) throw notFound('Alarm');

        // R-08 is deliberately not re-checked here: enabling is the one path
        // that may create a collision, which is what gives the conflicts panel
        // something to report. See README, "Conflicts".
        await query('UPDATE alarms SET enabled = $1, updated_at = $2 WHERE id = $3', [
          toggle.enabled,
          clock.now(),
          request.params.id,
        ]);

        return toAlarm((await loadAlarm(request.user!.id, request.params.id))!);
      },
    );
  }
}
