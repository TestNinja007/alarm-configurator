import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthenticated } from '../errors.js';
import { CSRF_HEADER, SESSION_COOKIE, loadSession } from './sessions.js';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Loads the session, rejects unauthenticated requests, and enforces the
 * double-submit CSRF token on state-changing verbs.
 *
 * A CSRF failure is reported as 401 unauthenticated: the spec's error-code
 * list has no 403, and a rejected token means the request could not be proven
 * to come from the session it claims.
 */
export async function requireUser(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE];
  if (!sessionId) throw unauthenticated();

  const session = await loadSession(sessionId);
  if (!session) throw unauthenticated('Session is missing or expired.');

  if (STATE_CHANGING.has(request.method)) {
    const supplied = request.headers[CSRF_HEADER];
    const token = Array.isArray(supplied) ? supplied[0] : supplied;
    if (!token || token !== session.csrfToken) {
      throw unauthenticated('Missing or invalid CSRF token.');
    }
  }

  request.session = session;
  request.user = session.user;
}

/** Narrows the request once requireUser has run. */
export function currentUser(request: FastifyRequest) {
  if (!request.user) throw unauthenticated();
  return request.user;
}
