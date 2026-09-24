import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { clock } from '../clock.js';
import { isUniqueViolation, query, queryOne } from '../db/pool.js';
import { conflict, notFound } from '../errors.js';
import { toFolder, type FolderRow } from '../domain/mappers.js';
import {
  CreateFolderBodySchema,
  DeleteFolderQuerySchema,
  FolderListSchema,
  FolderSchema,
  RenameFolderBodySchema,
  type CreateFolderBody,
  type DeleteFolderQuery,
} from '../schemas/folders.js';
import { IdParamsSchema, errorResponses, type IdParams } from '../schemas/common.js';

const FOLDER_COLUMNS = `
  f.id,
  f.name,
  f.created_at,
  f.updated_at,
  count(a.id)                                        AS alarm_count,
  count(a.id) FILTER (WHERE a.enabled)               AS enabled_count
`;

async function loadFolder(userId: string, folderId: string): Promise<FolderRow | undefined> {
  return queryOne<FolderRow>(
    `SELECT ${FOLDER_COLUMNS}
       FROM folders f
       LEFT JOIN alarms a ON a.folder_id = f.id
      WHERE f.id = $1 AND f.user_id = $2
      GROUP BY f.id`,
    [folderId, userId],
  );
}

export async function folderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireUser);

  app.get(
    '/folders',
    {
      schema: {
        summary: 'List the signed-in user\u2019s folders',
        tags: ['folders'],
        response: { 200: FolderListSchema, ...errorResponses },
      },
    },
    async (request) => {
      const result = await query<FolderRow>(
        `SELECT ${FOLDER_COLUMNS}
           FROM folders f
           LEFT JOIN alarms a ON a.folder_id = f.id
          WHERE f.user_id = $1
          GROUP BY f.id
          ORDER BY lower(f.name) ASC`,
        [request.user!.id],
      );
      return { items: result.rows.map(toFolder) };
    },
  );

  app.post<{ Body: CreateFolderBody }>(
    '/folders',
    {
      schema: {
        summary: 'Create a folder',
        tags: ['folders'],
        body: CreateFolderBodySchema,
        response: { 201: FolderSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const name = request.body.name.trim();
      const now = clock.now();
      const id = randomUUID();

      try {
        await query(
          `INSERT INTO folders (id, user_id, name, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $4)`,
          [id, request.user!.id, name, now],
        );
      } catch (error) {
        if (isUniqueViolation(error, 'folders_user_name_key')) {
          throw conflict('A folder with that name already exists.', {
            fields: [
              { field: 'name', code: 'duplicate_name', message: 'Folder names must be unique.' },
            ],
          });
        }
        throw error;
      }

      reply.status(201);
      return toFolder((await loadFolder(request.user!.id, id))!);
    },
  );

  app.get<{ Params: IdParams }>(
    '/folders/:id',
    {
      schema: {
        summary: 'Get a folder',
        tags: ['folders'],
        params: IdParamsSchema,
        response: { 200: FolderSchema, ...errorResponses },
      },
    },
    async (request) => {
      const row = await loadFolder(request.user!.id, request.params.id);
      // Another user's folder is indistinguishable from one that does not exist.
      if (!row) throw notFound('Folder');
      return toFolder(row);
    },
  );

  app.patch<{ Params: IdParams; Body: CreateFolderBody }>(
    '/folders/:id',
    {
      schema: {
        summary: 'Rename a folder',
        tags: ['folders'],
        params: IdParamsSchema,
        body: RenameFolderBodySchema,
        response: { 200: FolderSchema, ...errorResponses },
      },
    },
    async (request) => {
      const name = request.body.name.trim();
      let updated;
      try {
        updated = await queryOne<{ id: string }>(
          `UPDATE folders SET name = $1, updated_at = $2
            WHERE id = $3 AND user_id = $4
            RETURNING id`,
          [name, clock.now(), request.params.id, request.user!.id],
        );
      } catch (error) {
        if (isUniqueViolation(error, 'folders_user_name_key')) {
          throw conflict('A folder with that name already exists.', {
            fields: [
              { field: 'name', code: 'duplicate_name', message: 'Folder names must be unique.' },
            ],
          });
        }
        throw error;
      }

      if (!updated) throw notFound('Folder');
      return toFolder((await loadFolder(request.user!.id, request.params.id))!);
    },
  );

  app.delete<{ Params: IdParams; Querystring: DeleteFolderQuery }>(
    '/folders/:id',
    {
      schema: {
        summary: 'Delete a folder and every alarm inside it',
        tags: ['folders'],
        params: IdParamsSchema,
        querystring: DeleteFolderQuerySchema,
        response: { 204: Type.Null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      const folder = await loadFolder(request.user!.id, request.params.id);
      if (!folder) throw notFound('Folder');

      // R-10: the flag is required whatever the folder holds, including nothing.
      if (request.query.confirm !== 'true') {
        throw conflict(
          'Deleting a folder also deletes its alarms. Repeat the request with ?confirm=true.',
          { details: { alarmCount: folder.alarm_count } },
        );
      }

      // Alarms go with it through ON DELETE CASCADE.
      await query('DELETE FROM folders WHERE id = $1 AND user_id = $2', [
        request.params.id,
        request.user!.id,
      ]);

      reply.status(204);
      return null;
    },
  );
}
