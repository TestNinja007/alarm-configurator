import { randomUUID, randomBytes } from 'node:crypto';
import { clock } from '../clock.js';
import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';

export const SESSION_COOKIE = 'sid';
/** Readable by the SPA on purpose: it must echo the value in X-CSRF-Token. */
export const CSRF_COOKIE = 'csrf';
export const CSRF_HEADER = 'x-csrf-token';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

export interface ActiveSession {
  id: string;
  csrfToken: string;
  user: SessionUser;
}

export async function createSession(userId: string): Promise<{ id: string; csrfToken: string }> {
  const id = randomUUID();
  const csrfToken = randomBytes(24).toString('base64url');
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + config.sessionTtlDays * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, csrfToken, now, expiresAt],
  );

  return { id, csrfToken };
}

export async function loadSession(sessionId: string): Promise<ActiveSession | undefined> {
  const row = await queryOne<{
    id: string;
    csrf_token: string;
    user_id: string;
    email: string;
    name: string;
  }>(
    `SELECT s.id, s.csrf_token, u.id AS user_id, u.email, u.name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > $2`,
    [sessionId, clock.now()],
  );

  if (!row) return undefined;

  return {
    id: row.id,
    csrfToken: row.csrf_token,
    user: { id: row.user_id, email: row.email, name: row.name },
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

/** Cookie options shared by both cookies; secure is off because the app runs on plain http. */
export const cookieOptions = {
  path: '/',
  sameSite: 'lax' as const,
  secure: false,
  maxAge: config.sessionTtlDays * 24 * 60 * 60,
};
