import { DateTime } from 'luxon';
import type { Rule, Weekday } from '../schemas/rule.js';

/**
 * The recurrence engine.
 *
 * Every calculation happens in the alarm's own zone and is only then converted
 * to a UTC instant. The container's local time is never consulted.
 *
 * Two behaviours are load-bearing and come from Luxon's defaults, verified
 * rather than assumed:
 *
 *   R-06  A local time inside a spring-forward gap moves forward by the length
 *         of the gap. In Toronto 02:30 becomes 03:30; in Lord Howe, whose gap
 *         is thirty minutes, 02:15 becomes 02:45.
 *   R-07  A local time that happens twice resolves to the first of the two,
 *         the one with the earlier UTC offset.
 */

export interface Occurrence {
  /** ISO-8601 UTC, seconds precision, e.g. 2026-10-04T13:30:00Z */
  utc: string;
  /** The same instant in the alarm's zone, with its offset. */
  local: string;
}

export interface ScheduleSpec {
  timeOfDay: string;
  timezone: string;
  startDate: string;
  endDate?: string | null;
  endAfterOccurrences?: number | null;
  rule: Rule;
}

export interface OccurrenceWindow {
  /** Inclusive lower bound. Occurrences at exactly `from` are included. */
  from?: Date;
  /** Inclusive upper bound. */
  to?: Date;
  limit: number;
}

const WEEKDAY_NUMBERS: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

/**
 * A guard against a rule that produces almost nothing across a long span, for
 * instance monthly_day 31 queried over centuries. Generous enough that no
 * legitimate request reaches it.
 */
const MAX_CANDIDATES = 200_000;

export class RecurrenceError extends Error {}

function parseLocalDate(date: string, zone: string): DateTime {
  return DateTime.fromISO(date, { zone });
}

/**
 * Turns a local calendar date plus the alarm's wall-clock time into an instant.
 * This is the single place where R-06 and R-07 take effect.
 */
function resolveInstant(date: DateTime, timeOfDay: string, zone: string): DateTime {
  const [rawHour, rawMinute] = timeOfDay.split(':');
  const hour = Number.parseInt(rawHour ?? '', 10);
  const minute = Number.parseInt(rawMinute ?? '', 10);

  return DateTime.fromObject(
    { year: date.year, month: date.month, day: date.day, hour, minute },
    { zone },
  );
}

/** Candidate local dates for the rule, ascending, starting at startDate. */
function* candidateDates(spec: ScheduleSpec): Generator<DateTime> {
  const zone = spec.timezone;
  const start = parseLocalDate(spec.startDate, zone);
  if (!start.isValid) throw new RecurrenceError(`Invalid startDate: ${spec.startDate}`);

  const rule = spec.rule;

  switch (rule.type) {
    case 'once': {
      yield start;
      return;
    }

    case 'daily': {
      for (let cursor = start, i = 0; i < MAX_CANDIDATES; i += 1, cursor = cursor.plus({ days: 1 })) {
        yield cursor;
      }
      return;
    }

    case 'weekly': {
      const wanted = new Set(rule.byWeekday.map((day) => WEEKDAY_NUMBERS[day]));
      for (let cursor = start, i = 0; i < MAX_CANDIDATES; i += 1, cursor = cursor.plus({ days: 1 })) {
        if (wanted.has(cursor.weekday)) yield cursor;
      }
      return;
    }

    case 'monthly_day': {
      // R-04: a month shorter than dayOfMonth is skipped outright. February
      // never yields a 31st, and nothing is clamped back to the 28th or 30th.
      let month = start.startOf('month');
      for (let i = 0; i < MAX_CANDIDATES; i += 1, month = month.plus({ months: 1 })) {
        if (rule.dayOfMonth > month.daysInMonth!) continue;
        const candidate = month.set({ day: rule.dayOfMonth });
        if (candidate < start) continue;
        yield candidate;
      }
      return;
    }

    case 'monthly_nth': {
      const weekday = WEEKDAY_NUMBERS[rule.weekday];
      let month = start.startOf('month');
      for (let i = 0; i < MAX_CANDIDATES; i += 1, month = month.plus({ months: 1 })) {
        const candidate = nthWeekdayOfMonth(month, weekday, rule.nth);
        // R-05: a month that has no such weekday is skipped rather than
        // clamped. This is why 5 is not an accepted value for nth.
        if (!candidate) continue;
        if (candidate < start) continue;
        yield candidate;
      }
      return;
    }

    case 'interval': {
      if (rule.unit === 'months') {
        // The anchor day comes from startDate, and short months are skipped
        // exactly as in R-04 rather than clamped.
        const anchorDay = start.day;
        for (let i = 0; i < MAX_CANDIDATES; i += 1) {
          const month = start.startOf('month').plus({ months: i * rule.every });
          if (anchorDay > month.daysInMonth!) continue;
          yield month.set({ day: anchorDay });
        }
        return;
      }

      const step = rule.unit === 'weeks' ? { weeks: rule.every } : { days: rule.every };
      for (let cursor = start, i = 0; i < MAX_CANDIDATES; i += 1, cursor = cursor.plus(step)) {
        yield cursor;
      }
      return;
    }
  }
}

/**
 * The nth occurrence of a weekday within a month, or undefined when the month
 * does not contain one. `nth` of -1 means the last.
 */
function nthWeekdayOfMonth(month: DateTime, weekday: number, nth: number): DateTime | undefined {
  if (nth === -1) {
    const lastDay = month.endOf('month').startOf('day');
    const delta = (lastDay.weekday - weekday + 7) % 7;
    return lastDay.minus({ days: delta });
  }

  const firstDay = month.startOf('month');
  const delta = (weekday - firstDay.weekday + 7) % 7;
  const candidate = firstDay.plus({ days: delta + (nth - 1) * 7 });
  return candidate.month === month.month ? candidate : undefined;
}

function formatOccurrence(instant: DateTime): Occurrence {
  return {
    utc: instant.toUTC().toISO({ suppressMilliseconds: true })!,
    local: instant.toISO({ suppressMilliseconds: true })!,
  };
}

/**
 * Occurrences for a schedule within a window.
 *
 * `endAfterOccurrences` counts from the very first occurrence the rule ever
 * produces, not from the start of the requested window, so iteration always
 * begins at startDate when a count limit is set.
 */
export function occurrencesFor(spec: ScheduleSpec, window: OccurrenceWindow): Occurrence[] {
  const zone = spec.timezone;
  if (!DateTime.local().setZone(zone).isValid) {
    throw new RecurrenceError(`Invalid time zone: ${zone}`);
  }

  const endDate = spec.endDate ? parseLocalDate(spec.endDate, zone).endOf('day') : undefined;
  const maxCount = spec.endAfterOccurrences ?? undefined;

  const fromMillis = window.from?.getTime() ?? Number.NEGATIVE_INFINITY;
  const toMillis = window.to?.getTime() ?? Number.POSITIVE_INFINITY;

  const results: Occurrence[] = [];
  let produced = 0;

  for (const date of candidateDates(spec)) {
    // R-04's end condition: an endDate stops the rule, inclusive of that day.
    if (endDate && date > endDate) break;
    if (maxCount !== undefined && produced >= maxCount) break;

    const instant = resolveInstant(date, spec.timeOfDay, zone);
    if (!instant.isValid) continue;

    produced += 1;

    const millis = instant.toMillis();
    if (millis > toMillis) break;
    if (millis < fromMillis) continue;

    results.push(formatOccurrence(instant));
    if (results.length >= window.limit) break;
  }

  return results;
}

/** The first occurrence at or after `from`, or undefined when the rule is spent. */
export function nextOccurrence(spec: ScheduleSpec, from: Date): Occurrence | undefined {
  return occurrencesFor(spec, { from, limit: 1 })[0];
}

/**
 * R-08: the UTC instants two schedules share inside a window. Used both to
 * refuse colliding writes and to populate the conflicts panel.
 */
export function collidingInstants(
  a: ScheduleSpec,
  b: ScheduleSpec,
  window: { from: Date; to: Date },
): string[] {
  // The limit is only a safety valve; a daily alarm yields at most ~90 entries
  // across the 90-day window the rule cares about.
  const options = { ...window, limit: MAX_OCCURRENCES_PER_COMPARISON };
  const first = new Set(occurrencesFor(a, options).map((occurrence) => occurrence.utc));
  if (first.size === 0) return [];

  return occurrencesFor(b, options)
    .map((occurrence) => occurrence.utc)
    .filter((utc) => first.has(utc));
}

const MAX_OCCURRENCES_PER_COMPARISON = 1000;
