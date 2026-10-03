import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { clock } from '../clock.js';
import { query, queryOne } from '../db/pool.js';
import { conflict, notFound } from '../errors.js';
import { TIERS, isAdmin, type Role, type Tier } from '../domain/tiers.js';
import { IdParamsSchema, UuidSchema, errorResponses, type IdParams } from '../schemas/common.js';

/**
 * Administering accounts.
 *
 * Every route here is invisible to an ordinary user: they answer 404 rather
 * than 403, the same way another person's folder does. Telling someone a route
 * exists but is forbidden confirms the shape of the system to anyone poking at
 * it, and the error-code list has no 403 anyway.
 */

const AdminUserSchema = Type.Object({
  id: UuidSchema,
  email: Type.String(),
  name: Type.String(),
  role: Type.Union([Type.Literal('user'), Type.Literal('admin')]),
  tier: Type.Union([Type.Literal('basic'), Type.Literal('regular'), Type.Literal('advanced')]),
  verified: Type.Boolean(),
  suspended: Type.Boolean(),
  seeded: Type.Boolean(),
  folders: Type.Integer(),
  alarms: Type.Integer(),
  createdAt: Type.String({ format: 'date-time' }),
});

const UpdateUserBodySchema = Type.Object(
  {
    role: Type.Optional(Type.Union([Type.Literal('user'), Type.Literal('admin')])),
    tier: Type.Optional(
      Type.Union([Type.Literal('basic'), Type.Literal('regular'), Type.Literal('advanced')]),
    ),
    suspended: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  tier: Tier;
  email_verified_at: Date | null;
  suspended_at: Date | null;
  external_key: string | null;
  folders: number;
  alarms: number;
  created_at: Date;
}

function toAdminUser(row: AdminUserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    tier: row.tier,
    verified: row.email_verified_at !== null,
    suspended: row.suspended_at !== null,
    // Seeded accounts are shared demonstration data, so the UI can protect them.
    seeded: row.external_key !== null,
    folders: row.folders,
    alarms: row.alarms,
    createdAt: row.created_at.toISOString(),
  };
}

const USER_COLUMNS = `
  u.id, u.email, u.name, u.role, u.tier, u.email_verified_at, u.suspended_at,
  u.external_key, u.created_at,
  count(DISTINCT f.id)::bigint AS folders,
  count(DISTINCT a.id)::bigint AS alarms
`;

/** Refuses anyone who is not an administrator, by pretending not to exist. */
async function requireAdmin(request: FastifyRequest): Promise<void> {
  if (!(await isAdmin(request.user!.id))) throw notFound('Route');
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireUser);
  app.addHook('preHandler', requireAdmin);

  app.get(
    '/admin/users',
    {
      schema: {
        summary: 'Every account, with its role, tier and usage',
        tags: ['admin'],
        response: {
          200: Type.Object({
            items: Type.Array(AdminUserSchema),
            tiers: Type.Record(Type.String(), Type.Unknown()),
          }),
          ...errorResponses,
        },
      },
    },
    async () => {
      const rows = await query<AdminUserRow>(
        `SELECT ${USER_COLUMNS}
           FROM users u
           LEFT JOIN folders f ON f.user_id = u.id
           LEFT JOIN alarms  a ON a.user_id = u.id
          GROUP BY u.id
          ORDER BY u.created_at ASC`,
      );

      // The limits travel with the listing so the UI never hard-codes them.
      return { items: rows.rows.map(toAdminUser), tiers: TIERS };
    },
  );

  app.patch<{ Params: IdParams; Body: { role?: Role; tier?: Tier; suspended?: boolean } }>(
    '/admin/users/:id',
    {
      schema: {
        summary: 'Change an account’s role, tier or suspension',
        tags: ['admin'],
        params: IdParamsSchema,
        body: UpdateUserBodySchema,
        response: { 200: AdminUserSchema, ...errorResponses },
      },
    },
    async (request) => {
      const target = await queryOne<{ id: string; role: Role; external_key: string | null }>(
        'SELECT id, role, external_key FROM users WHERE id = $1',
        [request.params.id],
      );
      if (!target) throw notFound('Account');

      // Removing your own administrator rights locks you out of this page with
      // no way back, so it is refused rather than merely discouraged.
      if (target.id === request.user!.id && request.body.role === 'user') {
        throw conflict('You cannot remove your own administrator role.', {
          fields: [
            { field: 'role', code: 'self_demotion', message: 'Ask another administrator.' },
          ],
        });
      }

      if (target.id === request.user!.id && request.body.suspended === true) {
        throw conflict('You cannot suspend your own account.', {
          fields: [{ field: 'suspended', code: 'self_suspension', message: 'Ask another administrator.' }],
        });
      }

      const now = clock.now();
      await query(
        `UPDATE users
            SET role = COALESCE($1, role),
                tier = COALESCE($2, tier),
                suspended_at = CASE
                  WHEN $3::boolean IS NULL THEN suspended_at
                  WHEN $3::boolean THEN COALESCE(suspended_at, $4)
                  ELSE NULL
                END,
                updated_at = $4
          WHERE id = $5`,
        [
          request.body.role ?? null,
          request.body.tier ?? null,
          request.body.suspended ?? null,
          now,
          request.params.id,
        ],
      );

      // Suspending must take effect at once, not whenever the session expires.
      if (request.body.suspended === true) {
        await query('DELETE FROM sessions WHERE user_id = $1', [request.params.id]);
      }

      const refreshed = await queryOne<AdminUserRow>(
        `SELECT ${USER_COLUMNS}
           FROM users u
           LEFT JOIN folders f ON f.user_id = u.id
           LEFT JOIN alarms  a ON a.user_id = u.id
          WHERE u.id = $1
          GROUP BY u.id`,
        [request.params.id],
      );

      return toAdminUser(refreshed!);
    },
  );
}
