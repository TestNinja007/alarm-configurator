import { DateTime } from 'luxon';
import { hashPassword } from '../auth/password.js';
import { resetLoginAttempts } from '../auth/rateLimit.js';
import { config } from '../config.js';
import { withTransaction } from '../db/pool.js';
import { clearCapturedMessages } from '../mail/mailer.js';
import { SEED_ALARMS, SEED_FOLDERS } from './fixtures.js';
import { SEED_USERS } from './users.js';

export type SeedProfile = 'empty' | 'demo';

/**
 * Every seeded timestamp derives from SEED_ANCHOR rather than from the wall
 * clock — including createdAt and updatedAt — so reseeding twice produces
 * byte-identical rows.
 */
export function anchor(): DateTime {
  const parsed = DateTime.fromISO(config.seedAnchor, { zone: 'utc' });
  if (!parsed.isValid) {
    throw new Error(`SEED_ANCHOR is not a valid ISO instant: ${config.seedAnchor}`);
  }
  return parsed;
}

/** A start or end date, as a calendar date offset from the anchor. */
export function anchorDate(offsetDays: number): string {
  return anchor().plus({ days: offsetDays }).toISODate()!;
}

/**
 * Restores the database to the given profile.
 *
 * Both profiles clear every domain table first; users cascade to sessions,
 * folders, alarms, drafts and UI state. `empty` then stops, leaving the two
 * users and nothing else.
 */
export async function seed(profile: SeedProfile = 'demo'): Promise<void> {
  const createdAt = anchor().toJSDate();
  const hashes = await Promise.all(SEED_USERS.map((user) => hashPassword(user.password)));
  const userIdByKey = new Map(SEED_USERS.map((user) => [user.externalKey, user.id]));

  await withTransaction(async (client) => {
    await client.query('TRUNCATE users RESTART IDENTITY CASCADE');

    for (const [index, user] of SEED_USERS.entries()) {
      await client.query(
        `INSERT INTO users (id, external_key, email, name, password_hash, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [user.id, user.externalKey, user.email, user.name, hashes[index], createdAt],
      );
    }

    if (profile === 'empty') return;

    const folderIdByKey = new Map<string, string>();

    for (const folder of SEED_FOLDERS) {
      folderIdByKey.set(folder.externalKey, folder.id);
      await client.query(
        `INSERT INTO folders (id, external_key, user_id, name, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [folder.id, folder.externalKey, userIdByKey.get(folder.userKey), folder.name, createdAt],
      );
    }

    for (const alarm of SEED_ALARMS) {
      await client.query(
        `INSERT INTO alarms (id, external_key, folder_id, name, note, enabled, time_of_day,
                             timezone, start_date, end_date, end_after_occurrences, rule,
                             created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)`,
        [
          alarm.id,
          alarm.externalKey,
          folderIdByKey.get(alarm.folderKey),
          alarm.name,
          alarm.note,
          alarm.enabled,
          alarm.timeOfDay,
          alarm.timezone,
          anchorDate(alarm.startOffsetDays),
          alarm.endOffsetDays === null ? null : anchorDate(alarm.endOffsetDays),
          alarm.endAfterOccurrences,
          JSON.stringify(alarm.rule),
          createdAt,
        ],
      );
    }
  });

  // The limiter is in-process state, so a reset would otherwise leave a test
  // locked out of an account that has just been recreated.
  resetLoginAttempts();
  clearCapturedMessages();
}
