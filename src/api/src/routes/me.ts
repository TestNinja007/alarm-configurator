import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
} from '../auth/sessions.js';
import { clock } from '../clock.js';
import { query, queryOne } from '../db/pool.js';
import { conflict, notFound, unauthenticated, validationError } from '../errors.js';
import { UiStateSchema } from '../schemas/auth.js';
import { UuidSchema, errorResponses } from '../schemas/common.js';

/**
 * A-03 and A-04: the two pieces of per-user state the UI keeps on the server
 * rather than in the browser, so that a reload or a fresh sign-in restores it.
 */

const DraftSchema = Type.Object({
  step: Type.Integer({ minimum: 1, maximum: 4 }),
  payload: Type.Record(Type.String(), Type.Unknown()),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
});

const DraftEnvelopeSchema = Type.Object({
  draft: Type.Union([DraftSchema, Type.Null()]),
});

const SaveDraftBodySchema = Type.Object(
  {
    step: Type.Integer({ minimum: 1, maximum: 4 }),
    payload: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);

const SaveUiStateBodySchema = Type.Object(
  {
    folderId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    sort: Type.Optional(
      Type.Union([
        Type.Literal('name'),
        Type.Literal('created'),
        Type.Literal('next'),
        Type.Null(),
      ]),
    ),
    enabled: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  },
  { additionalProperties: false },
);

interface DraftRow {
  step: number;
  payload: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface UiStateRow {
  folder_id: string | null;
  sort: 'name' | 'created' | 'next' | null;
  enabled: boolean | null;
  updated_at: Date;
}

const UpdateProfileBodySchema = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 80 }) },
  { additionalProperties: false },
);

const ChangePasswordBodySchema = Type.Object(
  {
    currentPassword: Type.String({ minLength: 1, maxLength: 200 }),
    newPassword: Type.String({ minLength: 10, maxLength: 200 }),
  },
  { additionalProperties: false },
);

const ProfileSchema = Type.Object({
  id: UuidSchema,
  email: Type.String(),
  name: Type.String(),
  role: Type.Union([Type.Literal('user'), Type.Literal('admin')]),
  tier: Type.Union([Type.Literal('basic'), Type.Literal('regular'), Type.Literal('advanced')]),
});

const DeleteAccountBodySchema = Type.Object(
  { password: Type.String({ minLength: 1, maxLength: 200 }) },
  { additionalProperties: false },
);

const DeleteAccountQuerySchema = Type.Object({
  confirm: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
});

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireUser);


  app.patch<{ Body: { name: string } }>(
    '/me/profile',
    {
      schema: {
        summary: 'Change the display name',
        tags: ['auth'],
        body: UpdateProfileBodySchema,
        response: { 200: ProfileSchema, ...errorResponses },
      },
    },
    async (request) => {
      const name = request.body.name.trim();
      if (name.length === 0) {
        throw validationError([
          { field: 'name', code: 'required', message: 'Enter a name.' },
        ]);
      }

      const row = await queryOne<{
        id: string;
        email: string;
        name: string;
        role: 'user' | 'admin';
        tier: 'basic' | 'regular' | 'advanced';
      }>(
        `UPDATE users SET name = $1, updated_at = $2 WHERE id = $3
         RETURNING id, email, name, role, tier`,
        [name, clock.now(), request.user!.id],
      );
      if (!row) throw notFound('Account');
      return row;
    },
  );

  app.put<{ Body: { currentPassword: string; newPassword: string } }>(
    '/me/password',
    {
      schema: {
        summary: 'Change the password while signed in',
        description:
          'Requires the current password. Every other session is ended; this one ' +
          'survives, so the caller is not signed out of the device they are using.',
        tags: ['auth'],
        body: ChangePasswordBodySchema,
        response: { 204: Type.Null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;

      const row = await queryOne<{ password_hash: string; email: string }>(
        'SELECT password_hash, email FROM users WHERE id = $1',
        [userId],
      );
      if (!row) throw notFound('Account');

      if (!(await verifyPassword(request.body.currentPassword, row.password_hash))) {
        throw validationError([
          {
            field: 'currentPassword',
            code: 'incorrect',
            message: 'That is not your current password.',
          },
        ]);
      }

      if (request.body.newPassword === request.body.currentPassword) {
        throw validationError([
          {
            field: 'newPassword',
            code: 'unchanged',
            message: 'The new password must be different from the current one.',
          },
        ]);
      }

      // The same rule registration and reset apply, so it cannot be sidestepped here.
      if (request.body.newPassword.toLowerCase().includes(row.email.toLowerCase())) {
        throw validationError([
          {
            field: 'newPassword',
            code: 'too_similar',
            message: 'The password must not contain your email address.',
          },
        ]);
      }

      await query('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [
        await hashPassword(request.body.newPassword),
        clock.now(),
        userId,
      ]);

      // Other devices are signed out, but not this one: the person changing
      // their password on purpose should not be thrown out for doing so.
      await query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [
        userId,
        request.session!.id,
      ]);

      reply.status(204);
      return null;
    },
  );

  app.delete<{ Body: { password: string }; Querystring: { confirm?: 'true' | 'false' } }>(
    '/me',
    {
      schema: {
        summary: 'Delete the signed-in account and everything in it',
        description:
          'Requires ?confirm=true and the account password. Without the flag it ' +
          'returns 409 describing what would be removed.',
        tags: ['auth'],
        body: DeleteAccountBodySchema,
        querystring: DeleteAccountQuerySchema,
        response: { 204: Type.Null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;

      const account = await queryOne<{
        password_hash: string;
        external_key: string | null;
        folder_count: number;
        alarm_count: number;
      }>(
        `SELECT u.password_hash,
                u.external_key,
                count(DISTINCT f.id) AS folder_count,
                count(a.id)          AS alarm_count
           FROM users u
           LEFT JOIN folders f ON f.user_id = u.id
           LEFT JOIN alarms  a ON a.folder_id = f.id
          WHERE u.id = $1
          GROUP BY u.id`,
        [userId],
      );
      if (!account) throw notFound('Account');

      // The seeded accounts are shared: their credentials are published, so
      // anyone could otherwise delete the demo out from under everyone else.
      if (account.external_key) {
        throw conflict('Seeded demonstration accounts cannot be deleted.', {
          fields: [
            {
              field: 'account',
              code: 'seeded_account',
              message: 'This account is part of the demonstration data.',
            },
          ],
        });
      }

      // Checked before the confirmation flag, so a wrong password never
      // reveals how much the account holds.
      if (!(await verifyPassword(request.body.password, account.password_hash))) {
        throw unauthenticated('That password is not correct.');
      }

      if (request.query.confirm !== 'true') {
        throw conflict(
          'Deleting your account also deletes every folder and alarm in it. Repeat the request with ?confirm=true.',
          {
            details: {
              folderCount: account.folder_count,
              alarmCount: account.alarm_count,
            },
          },
        );
      }

      // Sessions, folders, alarms, drafts, UI state and any outstanding
      // verification code all cascade from the user row.
      await query('DELETE FROM users WHERE id = $1', [userId]);

      reply
        .clearCookie(SESSION_COOKIE, { path: '/' })
        .clearCookie(CSRF_COOKIE, { path: '/' })
        .status(204);
      return null;
    },
  );

  app.get(
    '/me/alarm-draft',
    {
      schema: {
        summary: 'The in-progress create wizard, if there is one',
        tags: ['drafts'],
        response: { 200: DraftEnvelopeSchema, ...errorResponses },
      },
    },
    async (request) => {
      const row = await queryOne<DraftRow>(
        'SELECT step, payload, created_at, updated_at FROM alarm_drafts WHERE user_id = $1',
        [request.user!.id],
      );

      return {
        draft: row
          ? {
              step: row.step,
              payload: row.payload,
              createdAt: row.created_at.toISOString(),
              updatedAt: row.updated_at.toISOString(),
            }
          : null,
      };
    },
  );

  app.put<{ Body: { step: number; payload: Record<string, unknown> } }>(
    '/me/alarm-draft',
    {
      schema: {
        summary: 'Save the wizard draft',
        tags: ['drafts'],
        body: SaveDraftBodySchema,
        response: { 200: DraftEnvelopeSchema, ...errorResponses },
      },
    },
    async (request) => {
      const now = clock.now();
      const row = await queryOne<DraftRow>(
        `INSERT INTO alarm_drafts (user_id, step, payload, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (user_id) DO UPDATE
                 SET step = EXCLUDED.step,
                     payload = EXCLUDED.payload,
                     updated_at = EXCLUDED.updated_at
           RETURNING step, payload, created_at, updated_at`,
        [request.user!.id, request.body.step, JSON.stringify(request.body.payload), now],
      );

      return {
        draft: {
          step: row!.step,
          payload: row!.payload,
          createdAt: row!.created_at.toISOString(),
          updatedAt: row!.updated_at.toISOString(),
        },
      };
    },
  );

  app.delete(
    '/me/alarm-draft',
    {
      schema: {
        summary: 'Discard the wizard draft',
        tags: ['drafts'],
        response: { 204: Type.Null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      await query('DELETE FROM alarm_drafts WHERE user_id = $1', [request.user!.id]);
      reply.status(204);
      return null;
    },
  );

  app.get(
    '/me/ui-state',
    {
      schema: {
        summary: 'The stored folder filter and sort order',
        tags: ['ui-state'],
        response: { 200: UiStateSchema, ...errorResponses },
      },
    },
    async (request) => {
      const row = await queryOne<UiStateRow>(
        'SELECT folder_id, sort, enabled, updated_at FROM ui_state WHERE user_id = $1',
        [request.user!.id],
      );

      return {
        folderId: row?.folder_id ?? null,
        sort: row?.sort ?? null,
        enabled: row?.enabled ?? null,
        updatedAt: row?.updated_at.toISOString() ?? null,
      };
    },
  );

  app.put<{
    Body: { folderId?: string | null; sort?: 'name' | 'created' | 'next' | null; enabled?: boolean | null };
  }>(
    '/me/ui-state',
    {
      schema: {
        summary: 'Store the folder filter and sort order',
        tags: ['ui-state'],
        body: SaveUiStateBodySchema,
        response: { 200: UiStateSchema, ...errorResponses },
      },
    },
    async (request) => {
      // A folder the user does not own must not be storable, or the stored
      // state would leak the existence of another account's folder.
      if (request.body.folderId) {
        const owned = await queryOne<{ id: string }>(
          'SELECT id FROM folders WHERE id = $1 AND user_id = $2',
          [request.body.folderId, request.user!.id],
        );
        if (!owned) throw notFound('Folder');
      }

      const row = await queryOne<UiStateRow>(
        `INSERT INTO ui_state (user_id, folder_id, sort, enabled, updated_at)
              VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE
                 SET folder_id = EXCLUDED.folder_id,
                     sort = EXCLUDED.sort,
                     enabled = EXCLUDED.enabled,
                     updated_at = EXCLUDED.updated_at
           RETURNING folder_id, sort, enabled, updated_at`,
        [
          request.user!.id,
          request.body.folderId ?? null,
          request.body.sort ?? null,
          request.body.enabled ?? null,
          clock.now(),
        ],
      );

      return {
        folderId: row!.folder_id,
        sort: row!.sort,
        enabled: row!.enabled,
        updatedAt: row!.updated_at.toISOString(),
      };
    },
  );
}
