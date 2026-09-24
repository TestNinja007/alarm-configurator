import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,200}$/;

/**
 * Every response carries X-Request-Id. A client-supplied value is echoed back
 * when it is plausibly an identifier; anything else is replaced rather than
 * reflected, so the header can never be used to inject arbitrary bytes.
 */
export function registerRequestId(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const supplied = request.headers['x-request-id'];
    const candidate = Array.isArray(supplied) ? supplied[0] : supplied;
    request.requestId =
      candidate && SAFE_REQUEST_ID.test(candidate) ? candidate : randomUUID();
    reply.header('X-Request-Id', request.requestId);
  });
}
