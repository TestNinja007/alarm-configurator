import { randomInt } from 'node:crypto';
import { clock } from '../clock.js';
import { query, queryOne } from '../db/pool.js';

/**
 * Email verification codes.
 *
 * The application makes no external network calls at runtime, so it cannot
 * send email. A code is issued and stored, and the caller retrieves it either
 * from the sandbox UI (DEMO_MODE) or from the test hook (TEST_SUPPORT). That
 * is honest about what this is: the flow is real, the delivery is not.
 */

export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no_code' | 'expired' | 'too_many_attempts' | 'incorrect' };

/** Six digits, uniformly distributed, leading zeros preserved. */
function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Issues a fresh code, replacing any outstanding one. Replacing rather than
 * adding means a resend invalidates the previous code, which is what anyone
 * reading the email would expect.
 */
export async function issueCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateCode();
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO email_verifications (user_id, code, attempts, expires_at, created_at)
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

/** The outstanding code for a user, for the sandbox UI and the test hook. */
export async function peekCode(userId: string): Promise<string | undefined> {
  const row = await queryOne<{ code: string }>(
    'SELECT code FROM email_verifications WHERE user_id = $1 AND expires_at > $2',
    [userId, clock.now()],
  );
  return row?.code;
}

/**
 * Checks a submitted code and, when it matches, marks the account verified and
 * discards the code.
 *
 * A wrong code costs an attempt. Running out of attempts is deliberately not
 * the same answer as a wrong code, so the caller can tell the difference
 * between "try again" and "ask for a new one".
 */
export async function verifyCode(userId: string, submitted: string): Promise<VerifyResult> {
  const row = await queryOne<{ code: string; attempts: number; expires_at: Date }>(
    'SELECT code, attempts, expires_at FROM email_verifications WHERE user_id = $1',
    [userId],
  );

  if (!row) return { ok: false, reason: 'no_code' };
  if (row.expires_at.getTime() <= clock.now().getTime()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };

  if (row.code !== submitted.trim()) {
    await query('UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = $1', [
      userId,
    ]);
    return { ok: false, reason: 'incorrect' };
  }

  await query('UPDATE users SET email_verified_at = $1, updated_at = $1 WHERE id = $2', [
    clock.now(),
    userId,
  ]);
  await query('DELETE FROM email_verifications WHERE user_id = $1', [userId]);

  return { ok: true };
}
