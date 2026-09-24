import { clock } from '../clock.js';
import { query } from '../db/pool.js';
import { collidingInstants, type ScheduleSpec } from '../recurrence/engine.js';
import type { AlarmRow } from './mappers.js';

/**
 * R-08: two enabled alarms in one folder may not share a UTC instant within the
 * next 90 days.
 *
 * The window is evaluated per request against the server clock, so moving the
 * test clock moves the window, and a pair that collides in month five only
 * becomes a conflict once time has caught up with it.
 */
export const CONFLICT_WINDOW_DAYS = 90;

export interface Collision {
  alarmId: string;
  alarmName: string;
  utc: string;
}

export function conflictWindow(): { from: Date; to: Date } {
  const from = clock.now();
  const to = new Date(from.getTime() + CONFLICT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { from, to };
}

export function specFromRow(row: AlarmRow): ScheduleSpec {
  return {
    timeOfDay: row.time_of_day,
    timezone: row.timezone,
    startDate: row.start_date,
    endDate: row.end_date,
    endAfterOccurrences: row.end_after_occurrences,
    rule: row.rule,
  };
}

/** Every enabled alarm in the folder, optionally excluding one by id. */
async function enabledSiblings(folderId: string, excludeAlarmId?: string): Promise<AlarmRow[]> {
  const params: (string | null)[] = [folderId];
  let sql = `SELECT id, folder_id, name, note, enabled, time_of_day, timezone, start_date,
                    end_date, end_after_occurrences, rule, created_at, updated_at
               FROM alarms
              WHERE folder_id = $1 AND enabled = true`;

  if (excludeAlarmId) {
    params.push(excludeAlarmId);
    sql += ` AND id <> $2`;
  }

  return (await query<AlarmRow>(sql, params)).rows;
}

/**
 * The first collision a candidate schedule would have with an existing enabled
 * alarm in the same folder, or undefined when there is none.
 *
 * Only called for alarms that are themselves enabled: a disabled alarm is
 * invisible to this rule in both directions.
 */
export async function findCollision(
  folderId: string,
  candidate: ScheduleSpec,
  excludeAlarmId?: string,
): Promise<Collision | undefined> {
  const window = conflictWindow();
  const siblings = await enabledSiblings(folderId, excludeAlarmId);

  let earliest: Collision | undefined;

  for (const sibling of siblings) {
    const shared = collidingInstants(candidate, specFromRow(sibling), window);
    const first = shared[0];
    if (!first) continue;

    // Report the earliest instant; ties break on the lower alarm id so the
    // response is stable across requests.
    if (
      !earliest ||
      first < earliest.utc ||
      (first === earliest.utc && sibling.id < earliest.alarmId)
    ) {
      earliest = { alarmId: sibling.id, alarmName: sibling.name, utc: first };
    }
  }

  return earliest;
}

export interface ConflictPair {
  alarmAId: string;
  alarmAName: string;
  alarmBId: string;
  alarmBName: string;
  /** The earliest instant the two share inside the window. */
  firstUtc: string;
  /** How many instants they share in total, across the whole window. */
  collisionCount: number;
}

/**
 * Every colliding pair currently present in a folder. Non-empty only because
 * enabling an alarm does not run the check that creating one does; see the
 * README section on conflicts.
 */
export async function conflictsInFolder(folderId: string): Promise<ConflictPair[]> {
  const window = conflictWindow();
  const alarms = await enabledSiblings(folderId);
  const pairs: ConflictPair[] = [];

  for (let i = 0; i < alarms.length; i += 1) {
    for (let j = i + 1; j < alarms.length; j += 1) {
      const a = alarms[i]!;
      const b = alarms[j]!;
      const shared = collidingInstants(specFromRow(a), specFromRow(b), window);
      const first = shared[0];
      if (!first) continue;

      // One entry per colliding pair rather than one per instant: two daily
      // alarms on the same minute collide ninety times in the window, and
      // ninety identical rows would tell the reader nothing the first does not.
      pairs.push({
        alarmAId: a.id,
        alarmAName: a.name,
        alarmBId: b.id,
        alarmBName: b.name,
        firstUtc: first,
        collisionCount: shared.length,
      });
    }
  }

  pairs.sort((left, right) => left.firstUtc.localeCompare(right.firstUtc));
  return pairs;
}
