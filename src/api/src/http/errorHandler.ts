import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError, type ErrorCode, type FieldError, statusForCode } from '../errors.js';

interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    fields?: FieldError[];
    details?: Record<string, unknown>;
  };
}

function body(
  code: ErrorCode,
  message: string,
  requestId: string,
  extra: { fields?: FieldError[]; details?: Record<string, unknown> } = {},
): ErrorBody {
  const error: ErrorBody['error'] = { code, message, requestId };
  if (extra.fields?.length) error.fields = extra.fields;
  if (extra.details) error.details = extra.details;
  return { error };
}

/**
 * Turns Fastify's own schema validation output into field errors. Fastify
 * reports instancePath as a JSON pointer ("/endDate"); the envelope wants a
 * plain field name.
 */
function fieldsFromValidation(error: FastifyError): FieldError[] {
  const validation = error.validation ?? [];
  return validation.map((issue) => {
    const pointer = issue.instancePath ?? '';
    const missing = (issue.params as { missingProperty?: string } | undefined)?.missingProperty;
    const field = missing ?? pointer.replace(/^\//, '').replace(/\//g, '.') ?? '';
    return {
      field: field || 'body',
      code: missing ? 'required' : (issue.keyword ?? 'invalid'),
      message: issue.message ?? 'Invalid value.',
    };
  });
}

/** The 404 handler lives in server.ts, which also owns the SPA fallback. */
export function buildErrorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
): ErrorBody {
  return body(code, message, requestId);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send(
        body(error.code, error.message, request.requestId, {
          fields: error.fields,
          details: error.details,
        }),
      );
      return;
    }

    // Malformed JSON never reaches a route; Fastify rejects it while parsing.
    if (error.statusCode === 400 && /JSON/i.test(error.message)) {
      reply
        .status(400)
        .send(body('malformed_request', 'The request body is not valid JSON.', request.requestId));
      return;
    }

    if (error.validation) {
      reply.status(statusForCode.validation_error).send(
        body('validation_error', 'The request failed validation.', request.requestId, {
          fields: fieldsFromValidation(error),
        }),
      );
      return;
    }

    if (error.statusCode === 429) {
      reply
        .status(429)
        .send(body('rate_limited', 'Too many requests.', request.requestId));
      return;
    }

    request.log.error({ err: error, requestId: request.requestId }, 'Unhandled error');
    reply
      .status(500)
      .send(body('internal', 'An unexpected error occurred.', request.requestId));
  });
}
