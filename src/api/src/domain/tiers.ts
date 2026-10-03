import { conflict, validationError } from '../errors.js';
import { query, queryOne } from '../db/pool.js';

/**
 * What each tier allows.
 *
 * Enforced on the server and nowhere else that matters. The UI hides what a
 * tier cannot do, but hiding a control is a courtesy — the limit is only real
 * because the API refuses.
 */

export type Tier = 'basic' | 'regular' | 'advanced';
export type Role = 'user' | 'admin';

export interface TierLimits {
  /** Null means no limit. */
  maxFolders: number | null;
  maxAlarmsPerFolder: number | null;
  /** Whether an alarm may repeat within a day at all. */
  repeatWithinDay: boolean;
  /** The shortest permitted interval, in seconds. Null when not permitted. */
  minRepeatSeconds: number | null;
  /** Whether a provider generates the audio, rather than the browser speaking. */
  generatedSpeech: boolean;
}

export const TIERS: Record<Tier, TierLimits> = {
  basic: {
    maxFolders: 2,
    maxAlarmsPerFolder: 5,
    repeatWithinDay: false,
    minRepeatSeconds: null,
    generatedSpeech: false,
  },
  regular: {
    maxFolders: 10,
    maxAlarmsPerFolder: 50,
    repeatWithinDay: true,
    minRepeatSeconds: 300,
    generatedSpeech: false,
  },
  advanced: {
    maxFolders: null,
    maxAlarmsPerFolder: null,
    repeatWithinDay: true,
    minRepeatSeconds: 1,
    generatedSpeech: true,
  },
};

export function limitsFor(tier: Tier): TierLimits {
  return TIERS[tier] ?? TIERS.basic;
}

export async function tierOf(userId: string): Promise<Tier> {
  const row = await queryOne<{ tier: Tier }>('SELECT tier FROM users WHERE id = $1', [userId]);
  return row?.tier ?? 'basic';
}

/**
 * Refuses a new folder once the tier's allowance is used up.
 *
 * Deliberately counts rather than trusting a stored total: a count cannot drift
 * out of step with reality the way a cached number can.
 */
export async function assertCanAddFolder(userId: string, tier: Tier): Promise<void> {
  const limit = limitsFor(tier).maxFolders;
  if (limit === null) return;

  const row = await queryOne<{ count: number }>(
    'SELECT count(*)::bigint AS count FROM folders WHERE user_id = $1',
    [userId],
  );

  if ((row?.count ?? 0) >= limit) {
    throw conflict(
      `The ${tier} tier allows ${limit} folder${limit === 1 ? '' : 's'}.`,
      {
        fields: [
          { field: 'name', code: 'tier_limit', message: `Upgrade to create more than ${limit}.` },
        ],
        details: { tier, limit, resource: 'folders' },
      },
    );
  }
}

/**
 * The unfiled bucket counts as one more folder, and carries the same cap. An
 * uncapped staging area would let a basic account hold any number of alarms
 * by never filing them.
 */
export async function assertCanAddAlarm(
  userId: string,
  folderId: string | null,
  tier: Tier,
  excludeAlarmId?: string,
): Promise<void> {
  const limit = limitsFor(tier).maxAlarmsPerFolder;
  if (limit === null) return;

  const params: string[] = [folderId ?? userId];
  const scope = folderId ? 'folder_id = $1' : 'user_id = $1 AND folder_id IS NULL';
  let sql = `SELECT count(*)::bigint AS count FROM alarms WHERE ${scope}`;
  if (excludeAlarmId) {
    params.push(excludeAlarmId);
    sql += ' AND id <> $2';
  }

  const row = await queryOne<{ count: number }>(sql, params);

  if ((row?.count ?? 0) >= limit) {
    throw conflict(
      `The ${tier} tier allows ${limit} alarm${limit === 1 ? '' : 's'} per folder` +
        `${folderId ? '' : ', and unfiled alarms count as a folder of their own'}.`,
      {
        fields: [
          { field: 'name', code: 'tier_limit', message: `Upgrade to create more than ${limit}.` },
        ],
        details: { tier, limit, resource: 'alarms' },
      },
    );
  }
}

/**
 * Checks the parts of a schedule a tier may not be entitled to.
 *
 * A downgrade does not delete anything, so an alarm created on a higher tier
 * keeps working — but it cannot be saved again until it fits the current one.
 * That is the honest behaviour: taking away what someone already made would be
 * worse than refusing to let them change it.
 */
export function assertScheduleAllowed(
  tier: Tier,
  schedule: {
    repeatEvery?: number | null;
    repeatUnit?: 'seconds' | 'minutes' | 'hours' | null;
    endTimeOfDay?: string | null;
  },
): void {
  const limits = limitsFor(tier);
  const wantsRepeat = Boolean(schedule.endTimeOfDay && schedule.repeatEvery && schedule.repeatUnit);
  if (!wantsRepeat) return;

  if (!limits.repeatWithinDay) {
    throw validationError([
      {
        field: 'repeatEvery',
        code: 'tier_limit',
        message: `Repeating within a day is not available on the ${tier} tier.`,
      },
    ]);
  }

  const seconds =
    schedule.repeatUnit === 'hours'
      ? (schedule.repeatEvery ?? 0) * 3600
      : schedule.repeatUnit === 'minutes'
        ? (schedule.repeatEvery ?? 0) * 60
        : (schedule.repeatEvery ?? 0);

  if (limits.minRepeatSeconds !== null && seconds < limits.minRepeatSeconds) {
    const minutes = Math.round(limits.minRepeatSeconds / 60);
    throw validationError([
      {
        field: 'repeatEvery',
        code: 'tier_limit',
        message:
          limits.minRepeatSeconds >= 60
            ? `The ${tier} tier allows repeats no more often than every ${minutes} minutes.`
            : `The ${tier} tier allows repeats no more often than every ${limits.minRepeatSeconds} seconds.`,
      },
    ]);
  }
}

/** Used by the admin listing, which wants counts alongside each account. */
export async function usageFor(userId: string): Promise<{ folders: number; alarms: number }> {
  const row = await queryOne<{ folders: number; alarms: number }>(
    `SELECT count(DISTINCT f.id)::bigint AS folders,
            count(a.id)::bigint          AS alarms
       FROM folders f
       LEFT JOIN alarms a ON a.folder_id = f.id
      WHERE f.user_id = $1`,
    [userId],
  );
  return { folders: row?.folders ?? 0, alarms: row?.alarms ?? 0 };
}

export async function isAdmin(userId: string): Promise<boolean> {
  const row = await queryOne<{ role: Role }>('SELECT role FROM users WHERE id = $1', [userId]);
  return row?.role === 'admin';
}

/** Suspended accounts keep everything but cannot sign in. */
export async function suspend(userId: string, at: Date | null): Promise<void> {
  await query('UPDATE users SET suspended_at = $1, updated_at = $2 WHERE id = $3', [
    at,
    new Date(),
    userId,
  ]);
}
