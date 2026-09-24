import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { hashPassword } from '../auth/password.js';
import { clock } from '../clock.js';
import { query } from '../db/pool.js';
import { validationError } from '../errors.js';
import { seed, type SeedProfile } from '../seed/index.js';
import { errorResponses } from '../schemas/common.js';

/**
 * T-01 to T-03. These routes are only registered when TEST_SUPPORT=1; with the
 * flag off they are absent from the router and from the OpenAPI document, so a
 * request for one produces an ordinary 404.
 *
 * None of them require a session: a test that has just reset the database has
 * no valid session to authenticate with.
 */

const ResetBodySchema = Type.Object(
  {
    profile: Type.Optional(Type.Union([Type.Literal('empty'), Type.Literal('demo')])),
  },
  { additionalProperties: false },
);

const ClockBodySchema = Type.Object(
  {
    now: Type.Optional(Type.String({ format: 'date-time' })),
    mode: Type.Optional(Type.Literal('system')),
  },
  { additionalProperties: false },
);

const ClockStateSchema = Type.Object({
  mode: Type.Union([Type.Literal('system'), Type.Literal('fixed')]),
  now: Type.String({ format: 'date-time' }),
});

const TestUserSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.String(),
  password: Type.String(),
});

export async function testRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { profile?: SeedProfile } }>(
    '/test/reset',
    {
      schema: {
        summary: 'Restore the database to a seed profile',
        description: 'Only available when TEST_SUPPORT=1.',
        tags: ['test-support'],
        body: ResetBodySchema,
        response: {
          200: Type.Object({ profile: Type.String(), durationMs: Type.Integer() }),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const profile = request.body?.profile ?? 'demo';
      const startedAt = Date.now();
      await seed(profile);
      // Wall-clock duration, deliberately not the test clock: this reports how
      // long the reset actually took.
      return { profile, durationMs: Date.now() - startedAt };
    },
  );

  app.put<{ Body: { now?: string; mode?: 'system' } }>(
    '/test/clock',
    {
      schema: {
        summary: 'Pin or release the server clock',
        description:
          'Send { "now": "..." } to pin the clock, or { "mode": "system" } to release it. ' +
          'Only available when TEST_SUPPORT=1.',
        tags: ['test-support'],
        body: ClockBodySchema,
        response: { 200: ClockStateSchema, ...errorResponses },
      },
    },
    async (request) => {
      if (request.body.mode === 'system') {
        clock.release();
        return clock.describe();
      }

      if (!request.body.now) {
        throw validationError([
          {
            field: 'now',
            code: 'required',
            message: 'Provide either now or mode: "system".',
          },
        ]);
      }

      const parsed = DateTime.fromISO(request.body.now, { zone: 'utc' });
      if (!parsed.isValid) {
        throw validationError([
          { field: 'now', code: 'invalid_instant', message: 'now must be an ISO-8601 instant.' },
        ]);
      }

      clock.setFixed(parsed.toJSDate());
      return clock.describe();
    },
  );

  app.get(
    '/test/clock',
    {
      schema: {
        summary: 'The current clock state',
        tags: ['test-support'],
        response: { 200: ClockStateSchema, ...errorResponses },
      },
    },
    async () => clock.describe(),
  );

  app.post(
    '/test/users',
    {
      schema: {
        summary: 'Create a throwaway user and return its credentials',
        description:
          'The account is removed by the next reset. Only available when TEST_SUPPORT=1.',
        tags: ['test-support'],
        response: { 201: TestUserSchema, ...errorResponses },
      },
    },
    async (_request, reply) => {
      const id = randomUUID();
      // Unique by construction, so parallel tests never collide on the address.
      const email = `throwaway-${id}@example.test`;
      const password = `Tmp-${id.slice(0, 12)}!`;
      const name = `Throwaway ${id.slice(0, 8)}`;

      await query(
        `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [id, email, name, await hashPassword(password), clock.now()],
      );

      reply.status(201);
      // The account starts with no folders, so the A-08 setup dependency can be
      // exercised from nothing.
      return { id, email, name, password };
    },
  );
}
