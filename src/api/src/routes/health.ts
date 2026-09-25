import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { clock } from '../clock.js';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { mailReachable } from '../mail/mailer.js';

const HealthSchema = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded')]),
  version: Type.String(),
  database: Type.Union([Type.Literal('up'), Type.Literal('down')]),
  testSupport: Type.Boolean(),
  demoMode: Type.Boolean(),
  registrationOpen: Type.Boolean(),
  mail: Type.Object({
    transport: Type.String(),
    reachable: Type.Boolean(),
  }),
  clock: Type.Object({
    mode: Type.Union([Type.Literal('system'), Type.Literal('fixed')]),
    now: Type.String({ format: 'date-time' }),
  }),
});

/**
 * T-04. Health is always mounted and always present in the OpenAPI document,
 * including when TEST_SUPPORT is off — its `testSupport` field is how a caller
 * discovers whether the gated routes exist.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        summary: 'Service health',
        tags: ['health'],
        response: { 200: HealthSchema },
      },
    },
    async () => {
      let database: 'up' | 'down' = 'up';
      try {
        await pool.query('SELECT 1');
      } catch {
        database = 'down';
      }

      return {
        status: database === 'up' ? ('ok' as const) : ('degraded' as const),
        version: config.version,
        database,
        testSupport: config.testSupport,
        demoMode: config.demoMode,
        registrationOpen: config.registrationOpen,
        mail: { transport: config.mail.transport, reachable: await mailReachable() },
        clock: clock.describe(),
      };
    },
  );
}
