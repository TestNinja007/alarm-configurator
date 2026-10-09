import { randomUUID } from 'node:crypto';

/** 204 carries no body, and Fastify wants a schema for it all the same. */
const NoContentSchema = { type: 'null' } as const;
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth/guard.js';
import { clock } from '../clock.js';
import { isUniqueViolation, query, queryOne, withTransaction } from '../db/pool.js';
import { conflict, notFound, validationError } from '../errors.js';
import {
  cycleSeconds,
  runLengthSeconds,
  type SequenceSpec,
  type SequenceStep,
} from '../sequences/engine.js';
import {
  CreateSequenceBodySchema,
  SequenceListSchema,
  SequenceSchema,
  UpdateSequenceBodySchema,
  type CreateSequenceBody,
} from '../schemas/sequences.js';
import { IdParamsSchema, errorResponses, type IdParams } from '../schemas/common.js';

interface SequenceRow {
  id: string;
  name: string;
  repeat_mode: 'once' | 'duration' | 'count';
  repeat_seconds: number | null;
  repeat_count: number | null;
  closing_text: string | null;
  created_at: Date;
  updated_at: Date;
}

interface StepRow {
  id: string;
  sequence_id: string;
  position: number;
  kind: 'action' | 'pause';
  label: string;
  duration_seconds: number;
  speech_text: string | null;
}

interface RunRow {
  id: string;
  sequence_id: string;
  started_at: Date;
  ended_at: Date | null;
  ended_reason: 'completed' | 'stopped' | null;
}

const toStep = (row: StepRow): SequenceStep => ({
  id: row.id,
  position: row.position,
  kind: row.kind,
  label: row.label,
  durationSeconds: row.duration_seconds,
  speechText: row.speech_text,
});

export const specFrom = (row: SequenceRow, steps: StepRow[]): SequenceSpec => ({
  id: row.id,
  name: row.name,
  repeatMode: row.repeat_mode,
  repeatSeconds: row.repeat_seconds,
  repeatCount: row.repeat_count,
  closingText: row.closing_text,
  steps: steps.map(toStep),
});

function toSequence(row: SequenceRow, steps: StepRow[], run: RunRow | null) {
  const spec = specFrom(row, steps);
  const runSeconds = runLengthSeconds(spec);

  return {
    id: row.id,
    name: row.name,
    repeatMode: row.repeat_mode,
    repeatSeconds: row.repeat_seconds,
    repeatCount: row.repeat_count,
    closingText: row.closing_text,
    steps: spec.steps,
    cycleSeconds: cycleSeconds(spec.steps),
    runSeconds,
    activeRun: run
      ? {
          id: run.id,
          startedAt: run.started_at.toISOString(),
          endsAt: new Date(run.started_at.getTime() + runSeconds * 1000).toISOString(),
          endedAt: run.ended_at ? run.ended_at.toISOString() : null,
          endedReason: run.ended_reason,
        }
      : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * The repeat fields have to match the mode.
 *
 * The database refuses a mismatch too, and that refusal would arrive as a 500
 * from a check constraint. Doing it here makes it a 422 that names the field
 * the caller got wrong, which is what A-02 asks for.
 */
function validateRepeat(body: CreateSequenceBody) {
  const mode = body.repeatMode ?? 'once';

  if (mode === 'duration' && body.repeatSeconds === undefined) {
    throw validationError([
      {
        field: 'repeatSeconds',
        code: 'required',
        message: 'A sequence that repeats for a duration needs that duration in seconds.',
      },
    ]);
  }
  if (mode === 'count' && body.repeatCount === undefined) {
    throw validationError([
      {
        field: 'repeatCount',
        code: 'required',
        message: 'A sequence that repeats a number of times needs that number.',
      },
    ]);
  }
  if (mode !== 'duration' && body.repeatSeconds !== undefined) {
    throw validationError([
      {
        field: 'repeatSeconds',
        code: 'not_applicable',
        message: 'Only a sequence repeating for a duration carries one.',
      },
    ]);
  }
  if (mode !== 'count' && body.repeatCount !== undefined) {
    throw validationError([
      {
        field: 'repeatCount',
        code: 'not_applicable',
        message: 'Only a sequence repeating a number of times carries one.',
      },
    ]);
  }

  return mode;
}

async function loadOne(userId: string, id: string) {
  const row = await queryOne<SequenceRow>(
    `SELECT id, name, repeat_mode, repeat_seconds, repeat_count, closing_text,
            created_at, updated_at
       FROM sequences WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  // Not found rather than forbidden, so identifiers cannot be probed for
  // existence - the same answer R-34 gives for an alarm.
  if (!row) throw notFound('Sequence');

  const steps = (
    await query<StepRow>(
      `SELECT id, sequence_id, position, kind, label, duration_seconds, speech_text
         FROM sequence_steps WHERE sequence_id = $1 ORDER BY position`,
      [id],
    )
  ).rows;

  const run =
    (await queryOne<RunRow>(
      `SELECT id, sequence_id, started_at, ended_at, ended_reason
         FROM sequence_runs WHERE sequence_id = $1 AND ended_at IS NULL`,
      [id],
    )) ?? null;

  return { row, steps, run };
}

export async function sequenceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireUser);

  app.get(
    '/sequences',
    {
      schema: {
        summary: 'Every sequence this account has',
        tags: ['sequences'],
        response: { 200: SequenceListSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.user!.id;

      const rows = (
        await query<SequenceRow>(
          `SELECT id, name, repeat_mode, repeat_seconds, repeat_count, closing_text,
                  created_at, updated_at
             FROM sequences WHERE user_id = $1 ORDER BY lower(btrim(name)), id`,
          [userId],
        )
      ).rows;

      if (rows.length === 0) return { items: [] };

      const ids = rows.map((r) => r.id);
      // Two queries for the whole list rather than two per sequence.
      const steps = (
        await query<StepRow>(
          `SELECT id, sequence_id, position, kind, label, duration_seconds, speech_text
             FROM sequence_steps WHERE sequence_id = ANY($1::uuid[]) ORDER BY position`,
          [ids],
        )
      ).rows;
      const runs = (
        await query<RunRow>(
          `SELECT id, sequence_id, started_at, ended_at, ended_reason
             FROM sequence_runs WHERE sequence_id = ANY($1::uuid[]) AND ended_at IS NULL`,
          [ids],
        )
      ).rows;

      return {
        items: rows.map((row) =>
          toSequence(
            row,
            steps.filter((s) => s.sequence_id === row.id),
            runs.find((r) => r.sequence_id === row.id) ?? null,
          ),
        ),
      };
    },
  );

  app.get<{ Params: IdParams }>(
    '/sequences/:id',
    {
      schema: {
        summary: 'One sequence, with its steps and any run in progress',
        tags: ['sequences'],
        params: IdParamsSchema,
        response: { 200: SequenceSchema, ...errorResponses },
      },
    },
    async (request) => {
      const { row, steps, run } = await loadOne(request.user!.id, request.params.id);
      return toSequence(row, steps, run);
    },
  );

  app.post<{ Body: CreateSequenceBody }>(
    '/sequences',
    {
      schema: {
        summary: 'Create a sequence and its chain of steps',
        tags: ['sequences'],
        body: CreateSequenceBodySchema,
        response: { 201: SequenceSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const mode = validateRepeat(request.body);
      const now = clock.now();
      const id = randomUUID();

      try {
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO sequences
               (id, user_id, name, repeat_mode, repeat_seconds, repeat_count,
                closing_text, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
            [
              id,
              userId,
              request.body.name.trim(),
              mode,
              mode === 'duration' ? request.body.repeatSeconds : null,
              mode === 'count' ? request.body.repeatCount : null,
              request.body.closingText ?? null,
              now,
            ],
          );

          // Position comes from the order they arrived in, dense from 1, so
          // the chain is readable from the rows without a second lookup.
          for (const [index, step] of request.body.steps.entries()) {
            await client.query(
              `INSERT INTO sequence_steps
                 (id, sequence_id, position, kind, label, duration_seconds,
                  speech_text, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
              [
                randomUUID(),
                id,
                index + 1,
                step.kind ?? 'action',
                step.label.trim(),
                step.durationSeconds,
                step.speechText ?? null,
                now,
              ],
            );
          }
        });
      } catch (error) {
        if (isUniqueViolation(error, 'sequences_user_name_key')) {
          throw conflict('A sequence with that name already exists.', {
            fields: [
              { field: 'name', code: 'taken', message: 'You already have a sequence called that.' },
            ],
          });
        }
        throw error;
      }

      const { row, steps, run } = await loadOne(userId, id);
      reply.status(201);
      return toSequence(row, steps, run);
    },
  );

  app.put<{ Params: IdParams; Body: CreateSequenceBody }>(
    '/sequences/:id',
    {
      schema: {
        summary: 'Replace a sequence and its chain',
        tags: ['sequences'],
        params: IdParamsSchema,
        body: UpdateSequenceBodySchema,
        response: { 200: SequenceSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.user!.id;
      const { run } = await loadOne(userId, request.params.id);
      const mode = validateRepeat(request.body);

      /*
       * Not while it is running. Changing the chain under a run would leave
       * the browser holding timers for steps that no longer exist, and the
       * offsets of everything after the edit would move - so the person would
       * be told to do something at a moment that was computed from a sequence
       * that is gone.
       */
      if (run) {
        throw conflict('Stop the sequence before changing it.', {
          details: { runId: run.id, startedAt: run.started_at.toISOString() },
        });
      }

      const now = clock.now();

      try {
        await withTransaction(async (client) => {
          await client.query(
            `UPDATE sequences
                SET name = $3, repeat_mode = $4, repeat_seconds = $5, repeat_count = $6,
                    closing_text = $7, updated_at = $8
              WHERE id = $1 AND user_id = $2`,
            [
              request.params.id,
              userId,
              request.body.name.trim(),
              mode,
              mode === 'duration' ? request.body.repeatSeconds : null,
              mode === 'count' ? request.body.repeatCount : null,
              request.body.closingText ?? null,
              now,
            ],
          );

          // Replaced wholesale rather than reconciled. The chain is short and
          // ordered, and a diff would have to decide what "the same step" means
          // when two steps have the same label.
          await client.query('DELETE FROM sequence_steps WHERE sequence_id = $1', [
            request.params.id,
          ]);

          for (const [index, step] of request.body.steps.entries()) {
            await client.query(
              `INSERT INTO sequence_steps
                 (id, sequence_id, position, kind, label, duration_seconds,
                  speech_text, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
              [
                randomUUID(),
                request.params.id,
                index + 1,
                step.kind ?? 'action',
                step.label.trim(),
                step.durationSeconds,
                step.speechText ?? null,
                now,
              ],
            );
          }
        });
      } catch (error) {
        if (isUniqueViolation(error, 'sequences_user_name_key')) {
          throw conflict('A sequence with that name already exists.', {
            fields: [
              { field: 'name', code: 'taken', message: 'You already have a sequence called that.' },
            ],
          });
        }
        throw error;
      }

      const loaded = await loadOne(userId, request.params.id);
      return toSequence(loaded.row, loaded.steps, loaded.run);
    },
  );

  app.delete<{ Params: IdParams }>(
    '/sequences/:id',
    {
      schema: {
        summary: 'Delete a sequence, its steps and its run history',
        tags: ['sequences'],
        params: IdParamsSchema,
        response: { 204: NoContentSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      await loadOne(request.user!.id, request.params.id);
      await query('DELETE FROM sequences WHERE id = $1 AND user_id = $2', [
        request.params.id,
        request.user!.id,
      ]);
      reply.status(204);
      return null;
    },
  );

  app.post<{ Params: IdParams }>(
    '/sequences/:id/activate',
    {
      schema: {
        summary: 'Start the chain, from now',
        description:
          'Every step offset is measured from the instant this is called. Activating a ' +
          'sequence that is already running is a conflict rather than a second run.',
        tags: ['sequences'],
        params: IdParamsSchema,
        response: { 200: SequenceSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.user!.id;
      // Loaded to prove ownership and to see whether there is anything to
      // run; the sequence itself is read again after the run is recorded.
      const { steps, run } = await loadOne(userId, request.params.id);

      if (run) {
        throw conflict('That sequence is already running.', {
          details: { runId: run.id, startedAt: run.started_at.toISOString() },
        });
      }
      if (steps.length === 0) {
        throw conflict('A sequence with no steps has nothing to run.');
      }

      const startedAt = clock.now();
      try {
        await query(
          `INSERT INTO sequence_runs (id, sequence_id, user_id, started_at)
           VALUES ($1,$2,$3,$4)`,
          [randomUUID(), request.params.id, userId, startedAt],
        );
      } catch (error) {
        /*
         * The partial unique index caught a second activate that arrived
         * between the check above and this insert - a double click, or two
         * tabs. The answer is the same as the check's, because what the caller
         * wanted was one run and there is one.
         */
        if (isUniqueViolation(error)) {
          throw conflict('That sequence is already running.');
        }
        throw error;
      }

      const loaded = await loadOne(userId, request.params.id);
      return toSequence(loaded.row, loaded.steps, loaded.run);
    },
  );

  app.post<{ Params: IdParams }>(
    '/sequences/:id/deactivate',
    {
      schema: {
        summary: 'Stop the chain now',
        description:
          'Ends the run in progress. A sequence that is not running is left alone rather ' +
          'than reported as an error, so pressing stop twice is harmless.',
        tags: ['sequences'],
        params: IdParamsSchema,
        response: { 200: SequenceSchema, ...errorResponses },
      },
    },
    async (request) => {
      const userId = request.user!.id;
      const { run } = await loadOne(userId, request.params.id);

      if (run) {
        await query(
          `UPDATE sequence_runs SET ended_at = $2, ended_reason = 'stopped' WHERE id = $1`,
          [run.id, clock.now()],
        );
      }

      const loaded = await loadOne(userId, request.params.id);
      return toSequence(loaded.row, loaded.steps, loaded.run);
    },
  );
}
