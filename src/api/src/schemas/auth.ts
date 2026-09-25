import { Type, type Static } from '@sinclair/typebox';
import { TimestampSchema, UuidSchema } from './common.js';

export const LoginBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 1, maxLength: 254 }),
    password: Type.String({ minLength: 1, maxLength: 200 }),
  },
  { additionalProperties: false }
);
export type LoginBody = Static<typeof LoginBodySchema>;

export const UserSchema = Type.Object(
  {
    id: UuidSchema,
    email: Type.String(),
    name: Type.String(),
  }
);

export const SessionSchema = Type.Object({
  user: UserSchema,
  csrfToken: Type.String(),
});

export const UiStateSchema = Type.Object(
  {
    folderId: Type.Union([UuidSchema, Type.Null()]),
    sort: Type.Union([
      Type.Literal('name'),
      Type.Literal('created'),
      Type.Literal('next'),
      Type.Null(),
    ]),
    enabled: Type.Union([Type.Boolean(), Type.Null()]),
    updatedAt: Type.Union([TimestampSchema, Type.Null()]),
  }
);
export type UiState = Static<typeof UiStateSchema>;

/**
 * Registration. The password floor is length rather than a character-class
 * rule: length is what actually resists guessing, and composition rules mostly
 * teach people to write Password1!.
 */
export const RegisterBodySchema = Type.Object(
  {
    email: Type.String({ minLength: 3, maxLength: 254 }),
    name: Type.String({ minLength: 1, maxLength: 80 }),
    password: Type.String({ minLength: 10, maxLength: 200 }),
  },
  { additionalProperties: false },
);
export type RegisterBody = Static<typeof RegisterBodySchema>;
