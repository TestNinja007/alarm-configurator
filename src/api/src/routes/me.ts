import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { clock } from '../clock.js';
import { query, queryOne } from '../db/pool.js';
import { notFound } from '../errors.js';
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

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireUser);

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
