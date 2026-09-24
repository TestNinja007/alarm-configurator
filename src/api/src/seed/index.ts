import { DateTime } from 'luxon';
import { hashPassword } from '../auth/password.js';
import { config } from '../config.js';
import { withTransaction } from '../db/pool.js';
import { SEED_USERS } from './users.js';

export type SeedProfile = 'empty' | 'demo';

/**
 * Every seeded timestamp derives from SEED_ANCHOR rather than from the wall
 * clock, so reseeding twice produces byte-identical data.
 */
export function anchor(): Date {
  const parsed = DateTime.fromISO(config.seedAnchor, { zone: 'utc' });
  if (!parsed.isValid) {
    throw new Error(`SEED_ANCHOR is not a valid ISO instant: ${config.seedAnchor}`);
  }
  return parsed.toJSDate();
}

/**
 * Restores the database to the given profile. Both profiles start by clearing
 * every domain table; users cascade to sessions, folders and alarms.
 *
 * Stage 1 seeds the two users only. The demo profile's folders and alarms land
 * in stage 3, once the recurrence engine can guarantee they are collision-free.
 */
export async function seed(profile: SeedProfile = 'demo'): Promise<void> {
  const createdAt = anchor();
  const hashes = await Promise.all(SEED_USERS.map((user) => hashPassword(user.password)));

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

    // Demo folders and alarms are added in stage 3.
  });
}
