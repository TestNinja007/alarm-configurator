import { Type, type Static } from '@sinclair/typebox';
import { TimestampSchema, UuidSchema } from './common.js';

export const FolderSchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String(),
    alarmCount: Type.Integer(),
    enabledCount: Type.Integer(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  }
);
export type Folder = Static<typeof FolderSchema>;

export const FolderListSchema = Type.Object({ items: Type.Array(FolderSchema) });

export const CreateFolderBodySchema = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 60 }) },
  { additionalProperties: false }
);
export type CreateFolderBody = Static<typeof CreateFolderBodySchema>;

export const RenameFolderBodySchema = CreateFolderBodySchema;

export const DeleteFolderQuerySchema = Type.Object({
  // R-10: deletion is refused without this flag, whatever the folder holds.
  confirm: Type.Optional(Type.Union([Type.Literal('true'), Type.Literal('false')])),
});
export type DeleteFolderQuery = Static<typeof DeleteFolderQuerySchema>;
