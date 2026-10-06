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
  | 'service_unavailable'
  | 'internal';

export const statusForCode: Record<ErrorCode, number> = {
  validation_error: 422,
  unauthenticated: 401,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  malformed_request: 400,
  service_unavailable: 503,
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
    options: {
      fields?: FieldError[];
      details?: Record<string, unknown>;
      /*
       * The error this one replaces, kept for the log and deliberately NOT
       * for the response. `details` is serialised to the client, so an
       * internal database message does not belong there.
       */
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
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

/**
 * The server cannot serve this request right now, but the request was fine.
 *
 * 503 rather than 500 because the two want opposite responses from a caller:
 * a 500 means stop and look at what you sent, a 503 means the same request
 * may well work shortly. `retryAfter` is carried in seconds and becomes a
 * Retry-After header, so a client does not have to guess.
 */
export const serviceUnavailable = (
  message: string,
  options: { retryAfter?: number; details?: Record<string, unknown>; cause?: unknown } = {},
) =>
  new AppError('service_unavailable', message, {
    details: { ...options.details, retryAfter: options.retryAfter ?? 1 },
    cause: options.cause,
  });

export const conflict = (
  message: string,
  options: { fields?: FieldError[]; details?: Record<string, unknown> } = {},
) => new AppError('conflict', message, options);
