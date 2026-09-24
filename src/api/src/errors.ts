/**
 * One error envelope for every non-2xx response:
 *
 *   { "error": { "code", "message", "requestId", "fields"?, "details"? } }
 *
 * `fields` carries per-field validation failures. `details` carries the
 * structured payload that 409s need (the conflicting alarm and instant for
 * R-08, the alarm count for R-10) and that `fields` has no room for.
 */

export type ErrorCode =
  | 'validation_error'
  | 'unauthenticated'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'malformed_request'
  | 'internal';

export const statusForCode: Record<ErrorCode, number> = {
  validation_error: 422,
  unauthenticated: 401,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  malformed_request: 400,
  internal: 500,
};

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: FieldError[];
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options: { fields?: FieldError[]; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = options.fields;
    this.details = options.details;
  }

  get statusCode(): number {
    return statusForCode[this.code];
  }
}

export const notFound = (what = 'Resource') => new AppError('not_found', `${what} not found.`);

export const unauthenticated = (message = 'Authentication required.') =>
  new AppError('unauthenticated', message);

export const validationError = (fields: FieldError[], message = 'The request failed validation.') =>
  new AppError('validation_error', message, { fields });

export const conflict = (
  message: string,
  options: { fields?: FieldError[]; details?: Record<string, unknown> } = {},
) => new AppError('conflict', message, options);
