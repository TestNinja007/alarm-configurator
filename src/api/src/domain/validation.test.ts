import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.js';
import { DEFAULT_TIMEZONE, validateSchedule, type ScheduleInput } from './validation.js';

/**
 * R-12 at the gate every alarm passes through. Create, update and the preview
 * all call validateSchedule before anything else, so what it lets through is
 * what gets stored and computed.
 */

function schedule(timezone: string | null | undefined): ScheduleInput {
  return { timeOfDay: '07:30', timezone, startDate: '2026-06-15' };
}

/** The field errors reported against `timezone`, or none when it was accepted. */
function timezoneErrors(timezone: string): unknown[] {
  try {
    validateSchedule(schedule(timezone));
    return [];
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return (error.fields ?? []).filter((field) => field.field === 'timezone');
  }
}

describe('R-12 refuses a timezone that is not an IANA name', () => {
  it.each([
    // Luxon's names for the zone of whatever machine runs the server: UTC on
    // Render, the developer's own zone locally.
    'system',
    'local',
    'default',
    'SYSTEM',
    // Luxon's fixed offsets.
    'UTC+3',
    'utc-5',
    'UTC+05:30',
    // Offsets, which Intl accepts as zones since ECMA-402 added them.
    '+03:00',
    '-0500',
    '+03',
    // ICU's legacy abbreviations. BST is Bangladesh, not British Summer Time.
    'BST',
    'IST',
    'PST',
    'CST',
    'JST',
    // An area IANA withdrew, which ICU still recognises.
    'SystemV/AST4',
    // IANA's placeholder for "zone unknown".
    'Factory',
    // Names that were never anything.
    'Not/AZone',
    'Mars/Olympus_Mons',
    'America/',
  ])('refuses %j with a field error on timezone', (zone) => {
    expect(timezoneErrors(zone)).toEqual([
      {
        field: 'timezone',
        code: 'invalid_timezone',
        message: `"${zone}" is not a valid IANA time zone name.`,
      },
    ]);
  });
});

describe('R-12 accepts IANA names, and keeps them as written', () => {
  it.each([
    'America/Toronto',
    // UTC is an IANA name twice over: Etc/UTC is the zone, UTC a link to it.
    'UTC',
    'Etc/UTC',
    'GMT',
    // Etc/GMT-3 is three hours *ahead* of UTC: POSIX's sign, IANA's spelling.
    'Etc/GMT-3',
    // A zone and the older link to it are both IANA names.
    'Asia/Kolkata',
    'Asia/Calcutta',
    'US/Eastern',
    'EST5EDT',
    'America/Argentina/Buenos_Aires',
  ])('accepts %j', (zone) => {
    expect(validateSchedule(schedule(zone))).toEqual({ timezone: zone });
  });

  it.each(['america/toronto', 'utc', 'etc/utc'])(
    'matches %j case-insensitively, as ECMA-402 does, and stores it unchanged',
    (zone) => {
      expect(validateSchedule(schedule(zone))).toEqual({ timezone: zone });
    },
  );
});

describe('R-12 around the edges of the name', () => {
  it.each([undefined, null, '', '   '])('falls back to the default for %j', (zone) => {
    expect(validateSchedule(schedule(zone))).toEqual({ timezone: DEFAULT_TIMEZONE });
  });

  it('trims surrounding whitespace before checking and storing', () => {
    expect(validateSchedule(schedule('  Europe/Lisbon  '))).toEqual({
      timezone: 'Europe/Lisbon',
    });
  });
});
