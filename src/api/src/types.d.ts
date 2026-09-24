// Pulls in @fastify/swagger's augmentation of FastifySchema, which adds the
// OpenAPI fields (summary, tags, description) the routes annotate themselves with.
import '@fastify/swagger';
import type { ActiveSession, SessionUser } from './auth/sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    session?: ActiveSession;
    user?: SessionUser;
  }
}
