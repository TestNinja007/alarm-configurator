import { describe, expect, it } from 'vitest';
import { RecurrenceError, occurrencesFor, type ScheduleSpec } from './engine.js';
import { isIanaTimeZone } from './timezone.js';

/**
 * R-12's definition of an IANA name, and the engine refusing anything else.
 *
 * The refusals are the values the previous check, Luxon's setZone, accepted:
 * each was verified to pass it before this check replaced it.
 */

describe('isIanaTimeZone accepts IANA names', () => {
  it.each([
    'America/Toronto',
    'Europe/Lisbon',
    'Australia/Lord_Howe',
    'America/Argentina/Buenos_Aires',
    'America/Indiana/Tell_City',
    'Antarctica/DumontDUrville',
  ])('a zone: %j', (zone) => {
    expect(isIanaTimeZone(zone)).toBe(true);
  });

  it.each(['Asia/Kolkata', 'Asia/Calcutta', 'Europe/Kyiv', 'Europe/Kiev', 'US/Eastern', 'Canada/Newfoundland'])(
    'a zone or a link to one: %j',
    (zone) => {
      expect(isIanaTimeZone(zone)).toBe(true);
    },
  );

  it.each(['UTC', 'Etc/UTC', 'GMT', 'Etc/GMT', 'Zulu', 'Etc/GMT-3', 'Etc/GMT+12', 'Etc/GMT-14'])(
    'UTC and the fixed offsets under their IANA names: %j',
    (zone) => {
      expect(isIanaTimeZone(zone)).toBe(true);
    },
  );

  it.each(['EST', 'EST5EDT', 'PST8PDT', 'CET', 'GB-Eire', 'NZ-CHAT', 'W-SU', 'GMT+0', 'Japan'])(
    'the single-word names IANA keeps for compatibility: %j',
    (zone) => {
      expect(isIanaTimeZone(zone)).toBe(true);
    },
  );

  it.each(['america/toronto', 'AMERICA/TORONTO', 'utc', 'etc/gmt-3', 'est5edt'])(
    'in any case, as ECMA-402 matches them: %j',
    (zone) => {
      expect(isIanaTimeZone(zone)).toBe(true);
    },
  );

  it('every zone the runtime offers, which is what the browser suggests in the form', () => {
    const offered = Intl.supportedValuesOf('timeZone');
    expect(offered.length).toBeGreaterThan(300);
    expect(offered.filter((zone) => !isIanaTimeZone(zone))).toEqual([]);
  });
});

describe('isIanaTimeZone refuses what is not an IANA name', () => {
  it.each(['system', 'local', 'default', 'System', 'LOCAL'])(
    "Luxon's name for the server's own zone: %j",
    (zone) => {
      expect(isIanaTimeZone(zone)).toBe(false);
    },
  );

  it.each(['UTC+3', 'utc-5', 'UTC+05:30', 'UTC+0', 'UTC-00:00'])("Luxon's fixed offsets: %j", (zone) => {
    expect(isIanaTimeZone(zone)).toBe(false);
  });

  it.each(['+03:00', '-05:00', '+0300', '+03', '-00:00'])(
    'offsets, which Intl itself accepts: %j',
    (zone) => {
      expect(isIanaTimeZone(zone)).toBe(false);
    },
  );

  it.each(['BST', 'IST', 'PST', 'CST', 'JST', 'AET', 'EAT', 'bst'])(
    "ICU's legacy abbreviations, which Intl itself accepts: %j",
    (zone) => {
      expect(isIanaTimeZone(zone)).toBe(false);
    },
  );

  it.each(['SystemV/AST4', 'SystemV/EST5EDT'])('an area IANA has withdrawn: %j', (zone) => {
    expect(isIanaTimeZone(zone)).toBe(false);
  });

  it("IANA's Factory zone, which is a placeholder rather than a place", () => {
    expect(isIanaTimeZone('Factory')).toBe(false);
  });

  it.each([
    '',
    ' ',
    'Z',
    'GMT+3',
    'Etc/GMT+13',
    'Not/AZone',
    'Mars/Olympus_Mons',
    'America/',
    '/Toronto',
    'America//Toronto',
    'America/Toronto/',
    ' America/Toronto',
    'Eastern Standard Time',
  ])('a string that was never a name: %j', (zone) => {
    expect(isIanaTimeZone(zone)).toBe(false);
  });
});

describe("isIanaTimeZone's known gap", () => {
  it.each(['US/Pacific-New', 'Canada/East-Saskatchewan'])(
    'still accepts %j, which IANA withdrew and ICU still knows',
    (zone) => {
      // Pinned so the gap described on isIanaTimeZone stays true. If a later
      // ICU forgets these names, this fails and that comment should change.
      expect(isIanaTimeZone(zone)).toBe(true);
    },
  );
});

describe('the engine computes only in IANA zones', () => {
  function spec(timezone: string): ScheduleSpec {
    return { timeOfDay: '07:30', timezone, startDate: '2026-06-15', rule: { type: 'daily' } };
  }

  it.each(['system', 'local', 'default', 'UTC+3', '+03:00', 'BST'])(
    'refuses a stored %j rather than guessing at it',
    (zone) => {
      expect(() => occurrencesFor(spec(zone), { limit: 1 })).toThrow(RecurrenceError);
    },
  );

  it('computes UTC and Etc/UTC to the same instants', () => {
    const instants = (zone: string) =>
      occurrencesFor(spec(zone), { limit: 3 }).map((occurrence) => occurrence.utc);

    expect(instants('UTC')).toEqual([
      '2026-06-15T07:30:00Z',
      '2026-06-16T07:30:00Z',
      '2026-06-17T07:30:00Z',
    ]);
    expect(instants('Etc/UTC')).toEqual(instants('UTC'));
  });

  it('computes a name written in another case exactly as the name itself', () => {
    const local = (zone: string) =>
      occurrencesFor(spec(zone), { limit: 2 }).map((occurrence) => occurrence.local);

    expect(local('america/toronto')).toEqual(local('America/Toronto'));
  });
});
