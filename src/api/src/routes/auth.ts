import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { verifyPassword } from '../auth/password.js';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  destroySession,
} from '../auth/sessions.js';
import { queryOne } from '../db/pool.js';
import { AppError, unauthenticated } from '../errors.js';
import { LoginBodySchema, SessionSchema, type LoginBody } from '../schemas/auth.js';
import { errorResponses } from '../schemas/common.js';
import { consumeLoginAttempt, clearLoginAttempts } from '../auth/rateLimit.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      schema: {
        summary: 'Sign in and start a session',
        tags: ['auth'],
        body: LoginBodySchema,
        response: { 200: SessionSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const email = request.body.email.trim();

      // Fixed-threshold limiter, so 429 is reachable deterministically.
      if (!consumeLoginAttempt(email)) {
        throw new AppError('rate_limited', 'Too many failed sign-in attempts. Try again later.');
      }

      const row = await queryOne<{ id: string; email: string; name: string; password_hash: string }>(
        'SELECT id, email, name, password_hash FROM users WHERE lower(btrim(email)) = lower(btrim($1))',
        [email],
      );

      // The same message either way, so the response cannot be used to probe
      // which addresses have accounts.
      const ok = row ? await verifyPassword(request.body.password, row.password_hash) : false;
      if (!row || !ok) throw unauthenticated('Email or password is incorrect.');

      clearLoginAttempts(email);

      const session = await createSession(row.id);
      reply
        .setCookie(SESSION_COOKIE, session.id, { ...cookieOptions, httpOnly: true })
        .setCookie(CSRF_COOKIE, session.csrfToken, { ...cookieOptions, httpOnly: false });

      return {
        user: { id: row.id, email: row.email, name: row.name },
        csrfToken: session.csrfToken,
      };
    },
  );

  app.post(
    '/auth/logout',
    {
      preHandler: requireUser,
      schema: {
        summary: 'End the current session',
        tags: ['auth'],
        response: { 204: Type.Null(), ...errorResponses },
      },
    },
    async (request, reply) => {
      if (request.session) await destroySession(request.session.id);
      reply
        .clearCookie(SESSION_COOKIE, { path: '/' })
        .clearCookie(CSRF_COOKIE, { path: '/' })
        .status(204);
      return null;
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: requireUser,
      schema: {
        summary: 'The signed-in user',
        tags: ['auth'],
        response: { 200: SessionSchema, ...errorResponses },
      },
    },
    async (request) => ({
      user: request.user!,
      csrfToken: request.session!.csrfToken,
    }),
  );
}
