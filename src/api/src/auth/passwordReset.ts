import { randomInt } from 'node:crypto';
import { clock } from '../clock.js';
import { query, queryOne } from '../db/pool.js';
import { hashPassword } from './password.js';

/**
 * Password reset codes.
 *
 * Six digits rather than a long opaque token, matching the verification flow
 * so the two behave the same way for a person and for a test. Six digits is
 * only defensible because of the limits around it: fifteen minutes, five
 * attempts, and a fresh code replaces the old one. Without those it would be
 * far too little entropy for something that hands over an account.
 */

export const RESET_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

export type ResetResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'no_code' | 'expired' | 'too_many_attempts' | 'incorrect' };

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Issues a fresh code, replacing any outstanding one. */
export async function issueResetCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateCode();
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO password_resets (user_id, code, attempts, expires_at, created_at)
          VALUES ($1, $2, 0, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
             SET code = EXCLUDED.code,
                 attempts = 0,
                 expires_at = EXCLUDED.expires_at,
                 created_at = EXCLUDED.created_at`,
    [userId, code, expiresAt, now],
  );

  return { code, expiresAt };
}

/** The outstanding code, for the sandbox UI and the test hook. */
export async function peekResetCode(userId: string): Promise<string | undefined> {
  const row = await queryOne<{ code: string }>(
    'SELECT code FROM password_resets WHERE user_id = $1 AND expires_at > $2',
    [userId, clock.now()],
  );
  return row?.code;
}

/**
 * Checks a code and, when it matches, sets the new password.
 *
 * Every existing session is destroyed at the same time. Someone resetting a
 * password may be doing it because another party has the old one, and leaving
 * that party signed in would defeat the whole exercise.
 */
export async function resetPassword(
  userId: string,
  submitted: string,
  newPassword: string,
): Promise<ResetResult> {
  const row = await queryOne<{ code: string; attempts: number; expires_at: Date }>(
    'SELECT code, attempts, expires_at FROM password_resets WHERE user_id = $1',
    [userId],
  );

  if (!row) return { ok: false, reason: 'no_code' };
  if (row.expires_at.getTime() <= clock.now().getTime()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  if (row.code !== submitted.trim()) {
    await query('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = $1', [userId]);
    return { ok: false, reason: 'incorrect' };
  }

  const now = clock.now();
  await query('UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3', [
    await hashPassword(newPassword),
    now,
    userId,
  ]);
  await query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);

  return { ok: true, userId };
}
