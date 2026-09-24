import { Type, type Static } from '@sinclair/typebox';

export const FieldErrorSchema = Type.Object(
  {
    field: Type.String(),
    code: Type.String(),
    message: Type.String(),
  }
);

export const ErrorResponseSchema = Type.Object(
  {
    error: Type.Object({
      code: Type.Union([
        Type.Literal('validation_error'),
        Type.Literal('unauthenticated'),
        Type.Literal('not_found'),
        Type.Literal('conflict'),
        Type.Literal('rate_limited'),
        Type.Literal('malformed_request'),
        Type.Literal('internal'),
      ]),
      message: Type.String(),
      requestId: Type.String(),
      fields: Type.Optional(Type.Array(FieldErrorSchema)),
      details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
  }
);

export const UuidSchema = Type.String({ format: 'uuid', minLength: 36, maxLength: 36 });

export const IdParamsSchema = Type.Object({ id: UuidSchema });
export type IdParams = Static<typeof IdParamsSchema>;

/** Every non-2xx response in this application uses the same envelope. */
export const errorResponses = {
  400: ErrorResponseSchema,
  401: ErrorResponseSchema,
  404: ErrorResponseSchema,
  409: ErrorResponseSchema,
  422: ErrorResponseSchema,
  429: ErrorResponseSchema,
  500: ErrorResponseSchema,
};

export const TimestampSchema = Type.String({ format: 'date-time' });
