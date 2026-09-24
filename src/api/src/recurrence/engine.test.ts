import { describe, expect, it } from 'vitest';
import { collidingInstants, occurrencesFor, type ScheduleSpec } from './engine.js';

/**
 * Unit tests for the recurrence engine, focused on R-04 through R-07. These are
 * the only tests in this repository; end-to-end, API and UI coverage belongs to
 * the separate test framework.
 */

const TORONTO = 'America/Toronto';

function spec(overrides: Partial<ScheduleSpec>): ScheduleSpec {
  return {
    timeOfDay: '09:30',
    timezone: TORONTO,
    startDate: '2026-01-01',
    rule: { type: 'daily' },
    ...overrides,
  };
}

const utc = (list: { utc: string }[]) => list.map((occurrence) => occurrence.utc);
const local = (list: { local: string }[]) => list.map((occurrence) => occurrence.local);

describe('R-04 monthly_day skips months that are too short', () => {
  it('skips February entirely for day 31', () => {
    const result = occurrencesFor(
      spec({ startDate: '2026-01-01', rule: { type: 'monthly_day', dayOfMonth: 31 } }),
      { limit: 7 },
    );

    expect(local(result)).toEqual([
      '2026-01-31T09:30:00-05:00',
      '2026-03-31T09:30:00-04:00',
      '2026-05-31T09:30:00-04:00',
      '2026-07-31T09:30:00-04:00',
      '2026-08-31T09:30:00-04:00',
      '2026-10-31T09:30:00-04:00',
      '2026-12-31T09:30:00-05:00',
    ]);
  });

  it('never produces a 31st in February, even in a leap year', () => {
    const result = occurrencesFor(
      spec({ startDate: '2028-01-01', rule: { type: 'monthly_day', dayOfMonth: 31 } }),
      { limit: 24 },
    );

    expect(result.some((occurrence) => occurrence.local.startsWith('2028-02'))).toBe(false);
  });

  it('does not clamp day 30 back to the 28th in February', () => {
    const result = occurrencesFor(
      spec({ startDate: '2026-01-01', rule: { type: 'monthly_day', dayOfMonth: 30 } }),
      { limit: 3 },
    );

    // January, then March. February is absent rather than clamped to the 28th.
    expect(local(result)).toEqual([
      '2026-01-30T09:30:00-05:00',
      '2026-03-30T09:30:00-04:00',
      '2026-04-30T09:30:00-04:00',
    ]);
  });

  it('includes February for day 29 only in a leap year', () => {
    const leap = occurrencesFor(
      spec({ startDate: '2028-02-01', rule: { type: 'monthly_day', dayOfMonth: 29 } }),
      { limit: 1 },
    );
    expect(local(leap)[0]).toBe('2028-02-29T09:30:00-05:00');

    const common = occurrencesFor(
      spec({ startDate: '2026-02-01', rule: { type: 'monthly_day', dayOfMonth: 29 } }),
      { limit: 1 },
    );
    expect(local(common)[0]).toBe('2026-03-29T09:30:00-04:00');
  });

  it('applies the same skipping to an interval anchored on the 31st', () => {
    const result = occurrencesFor(
      spec({
        startDate: '2026-01-31',
        rule: { type: 'interval', every: 1, unit: 'months' },
      }),
      { limit: 4 },
    );

    expect(local(result)).toEqual([
      '2026-01-31T09:30:00-05:00',
      '2026-03-31T09:30:00-04:00',
      '2026-05-31T09:30:00-04:00',
      '2026-07-31T09:30:00-04:00',
    ]);
  });
});

describe('R-05 monthly_nth', () => {
  it('finds the last Friday of each month', () => {
    const result = occurrencesFor(
      spec({ startDate: '2026-01-01', rule: { type: 'monthly_nth', nth: -1, weekday: 'FR' } }),
      { limit: 4 },
    );

    expect(local(result)).toEqual([
      '2026-01-30T09:30:00-05:00',
      '2026-02-27T09:30:00-05:00',
      '2026-03-27T09:30:00-04:00',
      '2026-04-24T09:30:00-04:00',
    ]);
  });

  it('finds the first Monday of each month', () => {
    const result = occurrencesFor(
      spec({ startDate: '2026-01-01', rule: { type: 'monthly_nth', nth: 1, weekday: 'MO' } }),
      { limit: 3 },
    );

    expect(local(result)).toEqual([
      '2026-01-05T09:30:00-05:00',
      '2026-02-02T09:30:00-05:00',
      '2026-03-02T09:30:00-05:00',
    ]);
  });

  it('treats the 4th and the last as different days when a month has five', () => {
    // May 2026 has five Fridays: 1, 8, 15, 22, 29.
    const fourth = occurrencesFor(
      spec({ startDate: '2026-05-01', rule: { type: 'monthly_nth', nth: 4, weekday: 'FR' } }),
      { limit: 1 },
    );
    const last = occurrencesFor(
      spec({ startDate: '2026-05-01', rule: { type: 'monthly_nth', nth: -1, weekday: 'FR' } }),
      { limit: 1 },
    );

    expect(local(fourth)[0]).toBe('2026-05-22T09:30:00-04:00');
    expect(local(last)[0]).toBe('2026-05-29T09:30:00-04:00');
  });
});

describe('R-06 spring forward', () => {
  it('moves a time inside the gap forward by the length of the gap', () => {
    // Toronto jumps 02:00 -> 03:00 on 8 March 2026, so 02:30 does not exist.
    const result = occurrencesFor(
      spec({ timeOfDay: '02:30', startDate: '2026-03-07', rule: { type: 'daily' } }),
      { limit: 3 },
    );

    expect(local(result)).toEqual([
      '2026-03-07T02:30:00-05:00',
      '2026-03-08T03:30:00-04:00',
      '2026-03-09T02:30:00-04:00',
    ]);
  });

  it('shifts by thirty minutes where the gap is thirty minutes', () => {
    // Lord Howe Island moves the clock forward by half an hour.
    const result = occurrencesFor(
      spec({
        timeOfDay: '02:15',
        timezone: 'Australia/Lord_Howe',
        startDate: '2026-10-04',
        rule: { type: 'daily' },
      }),
      { limit: 1 },
    );

    expect(local(result)[0]).toBe('2026-10-04T02:45:00+11:00');
  });

  it('leaves times outside the gap untouched', () => {
    const result = occurrencesFor(
      spec({ timeOfDay: '01:30', startDate: '2026-03-08', rule: { type: 'daily' } }),
      { limit: 1 },
    );

    expect(utc(result)[0]).toBe('2026-03-08T06:30:00Z');
  });
});

describe('R-07 fall back', () => {
  it('uses the first of two identical local times', () => {
    // Toronto repeats 01:00-02:00 on 1 November 2026. 01:30 happens at
    // 05:30Z (EDT, -04:00) and again at 06:30Z (EST, -05:00).
    const result = occurrencesFor(
      spec({ timeOfDay: '01:30', startDate: '2026-11-01', rule: { type: 'daily' } }),
      { limit: 1 },
    );

    expect(utc(result)[0]).toBe('2026-11-01T05:30:00Z');
    expect(local(result)[0]).toBe('2026-11-01T01:30:00-04:00');
  });

  it('keeps the wall-clock time stable across the transition', () => {
    const result = occurrencesFor(
      spec({ timeOfDay: '01:30', startDate: '2026-10-31', rule: { type: 'daily' } }),
      { limit: 3 },
    );

    // The local time never moves; only the offset and the instant do.
    expect(local(result)).toEqual([
      '2026-10-31T01:30:00-04:00',
      '2026-11-01T01:30:00-04:00',
      '2026-11-02T01:30:00-05:00',
    ]);
    expect(utc(result)).toEqual([
      '2026-10-31T05:30:00Z',
      '2026-11-01T05:30:00Z',
      '2026-11-02T06:30:00Z',
    ]);
  });

  it('carries a weekly alarm across a DST boundary without moving the local time', () => {
    const result = occurrencesFor(
      spec({
        timeOfDay: '07:00',
        startDate: '2026-10-26',
        rule: { type: 'weekly', byWeekday: ['MO'] },
      }),
      { limit: 3 },
    );

    expect(local(result)).toEqual([
      '2026-10-26T07:00:00-04:00',
      '2026-11-02T07:00:00-05:00',
      '2026-11-09T07:00:00-05:00',
    ]);
    expect(utc(result)).toEqual([
      '2026-10-26T11:00:00Z',
      '2026-11-02T12:00:00Z',
      '2026-11-09T12:00:00Z',
    ]);
  });
});

describe('window and end conditions', () => {
  it('treats from and to as inclusive bounds', () => {
    const result = occurrencesFor(
      spec({ timeOfDay: '09:30', startDate: '2026-06-01', rule: { type: 'daily' } }),
      {
        from: new Date('2026-06-02T13:30:00Z'),
        to: new Date('2026-06-04T13:30:00Z'),
        limit: 10,
      },
    );

    expect(utc(result)).toEqual([
      '2026-06-02T13:30:00Z',
      '2026-06-03T13:30:00Z',
      '2026-06-04T13:30:00Z',
    ]);
  });

  it('stops on endDate, inclusive of that day', () => {
    const result = occurrencesFor(
      spec({ startDate: '2026-06-01', endDate: '2026-06-03', rule: { type: 'daily' } }),
      { limit: 10 },
    );

    expect(local(result)).toHaveLength(3);
    expect(local(result).at(-1)).toBe('2026-06-03T09:30:00-04:00');
  });

  it('counts endAfterOccurrences from the first occurrence, not from the window', () => {
    const all = spec({ startDate: '2026-06-01', endAfterOccurrences: 3, rule: { type: 'daily' } });

    expect(occurrencesFor(all, { limit: 10 })).toHaveLength(3);

    // Asking from the second day still yields only what remains of the three.
    const rest = occurrencesFor(all, { from: new Date('2026-06-02T00:00:00Z'), limit: 10 });
    expect(utc(rest)).toEqual(['2026-06-02T13:30:00Z', '2026-06-03T13:30:00Z']);
  });

  it('produces exactly one occurrence for a once rule', () => {
    const result = occurrencesFor(
      spec({ startDate: '2026-06-01', rule: { type: 'once' } }),
      { limit: 10 },
    );

    expect(local(result)).toEqual(['2026-06-01T09:30:00-04:00']);
  });
});

describe('R-08 collisions', () => {
  it('finds a shared instant across different zones and local times', () => {
    // 07:00 in Toronto and 08:00 in Halifax are the same instant in summer.
    const toronto = spec({ timeOfDay: '07:00', startDate: '2026-06-01', rule: { type: 'daily' } });
    const halifax = spec({
      timeOfDay: '08:00',
      timezone: 'America/Halifax',
      startDate: '2026-06-01',
      rule: { type: 'daily' },
    });

    const shared = collidingInstants(toronto, halifax, {
      from: new Date('2026-06-01T00:00:00Z'),
      to: new Date('2026-06-03T00:00:00Z'),
    });

    expect(shared).toEqual(['2026-06-01T11:00:00Z', '2026-06-02T11:00:00Z']);
  });

  it('reports no collision when the instants merely look similar', () => {
    const a = spec({ timeOfDay: '07:00', startDate: '2026-06-01', rule: { type: 'daily' } });
    const b = spec({ timeOfDay: '07:01', startDate: '2026-06-01', rule: { type: 'daily' } });

    expect(
      collidingInstants(a, b, {
        from: new Date('2026-06-01T00:00:00Z'),
        to: new Date('2026-07-01T00:00:00Z'),
      }),
    ).toEqual([]);
  });

  it('collides two different local times that the spring-forward gap merges', () => {
    // 02:30 moves to 03:30 on 8 March, landing on the same instant as an
    // alarm set for 03:30 that day.
    const inGap = spec({ timeOfDay: '02:30', startDate: '2026-03-08', rule: { type: 'once' } });
    const afterGap = spec({ timeOfDay: '03:30', startDate: '2026-03-08', rule: { type: 'once' } });

    expect(
      collidingInstants(inGap, afterGap, {
        from: new Date('2026-03-08T00:00:00Z'),
        to: new Date('2026-03-09T00:00:00Z'),
      }),
    ).toEqual(['2026-03-08T07:30:00Z']);
  });
});
