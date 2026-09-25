import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  destroySession,
} from '../auth/sessions.js';
import { clock } from '../clock.js';
import { config } from '../config.js';
import { isUniqueViolation, query, queryOne } from '../db/pool.js';
import { AppError, conflict, notFound, unauthenticated, validationError } from '../errors.js';
import {
  LoginBodySchema,
  RegisterBodySchema,
  SessionSchema,
  type LoginBody,
  type RegisterBody,
} from '../schemas/auth.js';
import { errorResponses } from '../schemas/common.js';
import { consumeLoginAttempt, clearLoginAttempts, consumeRegistration } from '../auth/rateLimit.js';
import { issueCode, verifyCode, CODE_TTL_MINUTES } from '../auth/verification.js';
import { sendVerificationCode } from '../mail/messages.js';
import {
  PendingVerificationSchema,
  ResendVerificationBodySchema,
  VerifyEmailBodySchema,
  type ResendVerificationBody,
  type VerifyEmailBody,
} from '../schemas/auth.js';


/** Deliberately permissive: enough to reject obvious nonsense, not a parser. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: RegisterBody }>(
    '/auth/register',
    {
      schema: {
        summary: 'Create an account and sign in',
        description:
          'Only available when REGISTRATION_OPEN=1. There is no address ' +
          'verification and no password reset, because the application makes no ' +
          'external network calls at runtime.',
        tags: ['auth'],
        body: RegisterBodySchema,
        response: { 201: PendingVerificationSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      // Absent rather than refused when closed, so a probe cannot tell the
      // difference between "switched off" and "does not exist".
      if (!config.registrationOpen) throw notFound('Route');

      const email = request.body.email.trim();
      const name = request.body.name.trim();

      if (!consumeRegistration(email)) {
        throw new AppError('rate_limited', 'Too many sign-up attempts. Try again later.');
      }

      if (!EMAIL_PATTERN.test(email)) {
        throw validationError([
          { field: 'email', code: 'invalid_email', message: 'Enter a valid email address.' },
        ]);
      }

      // A password that is merely the email address back again defeats the
      // length floor without being caught by it.
      if (request.body.password.toLowerCase().includes(email.toLowerCase())) {
        throw validationError([
          {
            field: 'password',
            code: 'too_similar',
            message: 'The password must not contain your email address.',
          },
        ]);
      }

      const id = randomUUID();
      const now = clock.now();

      try {
        await query(
          `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $5)`,
          [id, email, name, await hashPassword(request.body.password), now],
        );
      } catch (error) {
        if (isUniqueViolation(error, 'users_email_lower_key')) {
          throw conflict('That email address is already registered.', {
            fields: [
              { field: 'email', code: 'duplicate_email', message: 'This address already has an account.' },
            ],
          });
        }
        throw error;
      }

      // The account exists but cannot be signed into until the code is
      // entered, so no session is issued here.
      const { code, expiresAt } = await issueCode(id);
      await sendVerificationCode({ to: email, name, code });

      reply.status(201);
      return {
        email,
        verificationRequired: true,
        expiresAt: expiresAt.toISOString(),
        // Only when the app is not really sending mail. With a working SMTP
        // transport this is absent, or anyone could register an address they
        // do not own and read its code straight off the response.
        code: config.mail.transport === 'smtp' ? undefined : code,
      };
    },
  );


  app.post<{ Body: VerifyEmailBody }>(
    '/auth/verify',
    {
      schema: {
        summary: 'Confirm an email address and sign in',
        tags: ['auth'],
        body: VerifyEmailBodySchema,
        response: { 200: SessionSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      if (!config.registrationOpen) throw notFound('Route');

      const email = request.body.email.trim();
      const row = await queryOne<{ id: string; email: string; name: string; email_verified_at: Date | null }>(
        `SELECT id, email, name, email_verified_at
           FROM users WHERE lower(btrim(email)) = lower(btrim($1))`,
        [email],
      );

      // An unknown address and a wrong code answer identically, so this
      // endpoint cannot be used to discover which addresses are registered.
      const wrongCode = () =>
        validationError([
          { field: 'code', code: 'incorrect', message: 'That code is not correct.' },
        ]);

      if (!row) throw wrongCode();

      if (row.email_verified_at) {
        throw conflict('That address is already confirmed.', {
          fields: [
            { field: 'email', code: 'already_verified', message: 'This account is already active.' },
          ],
        });
      }

      const result = await verifyCode(row.id, request.body.code);

      if (!result.ok) {
        switch (result.reason) {
          case 'expired':
          case 'no_code':
            throw validationError([
              {
                field: 'code',
                code: 'expired',
                message: 'That code has expired. Ask for a new one.',
              },
            ]);
          case 'too_many_attempts':
            throw new AppError('rate_limited', 'Too many incorrect codes. Ask for a new one.');
          default:
            throw wrongCode();
        }
      }

      // Confirming the address is what signs the account in for the first time.
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

  app.post<{ Body: ResendVerificationBody }>(
    '/auth/resend-verification',
    {
      schema: {
        summary: 'Issue a fresh verification code',
        description: 'Answers the same way whether or not the address is registered.',
        tags: ['auth'],
        body: ResendVerificationBodySchema,
        response: { 200: PendingVerificationSchema, ...errorResponses },
      },
    },
    async (request) => {
      if (!config.registrationOpen) throw notFound('Route');

      const email = request.body.email.trim();

      if (!consumeRegistration(email)) {
        throw new AppError('rate_limited', 'Too many requests for this address. Try again later.');
      }

      const row = await queryOne<{ id: string; name: string; email_verified_at: Date | null }>(
        `SELECT id, name, email_verified_at
           FROM users WHERE lower(btrim(email)) = lower(btrim($1))`,
        [email],
      );

      const expiresAt = new Date(clock.now().getTime() + CODE_TTL_MINUTES * 60 * 1000);

      // An unknown or already-confirmed address gets the same shape of answer
      // as a real one, minus any code. Saying "no such account" here would
      // turn this into an address checker.
      if (!row || row.email_verified_at) {
        return { email, verificationRequired: true, expiresAt: expiresAt.toISOString() };
      }

      const issued = await issueCode(row.id);
      await sendVerificationCode({ to: email, name: row.name, code: issued.code });

      return {
        email,
        verificationRequired: true,
        expiresAt: issued.expiresAt.toISOString(),
        code: config.mail.transport === 'smtp' ? undefined : issued.code,
      };
    },
  );

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

      const row = await queryOne<{
        id: string;
        email: string;
        name: string;
        password_hash: string;
        email_verified_at: Date | null;
      }>(
        `SELECT id, email, name, password_hash, email_verified_at
           FROM users WHERE lower(btrim(email)) = lower(btrim($1))`,
        [email],
      );

      // The same message either way, so the response cannot be used to probe
      // which addresses have accounts.
      const ok = row ? await verifyPassword(request.body.password, row.password_hash) : false;
      if (!row || !ok) throw unauthenticated('Email or password is incorrect.');

      // Only told to someone who has already proved they know the password,
      // so it reveals nothing to an outsider.
      if (!row.email_verified_at) {
        throw new AppError('unauthenticated', 'This account still needs its email confirmed.', {
          details: { reason: 'email_not_verified', email: row.email },
        });
      }

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
