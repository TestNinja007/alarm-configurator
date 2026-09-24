import type { Rule } from '../schemas/rule.js';

/**
 * The demo dataset, documented record by record in docs/seed.md.
 *
 * Every id is fixed and every date is expressed as a number of days from
 * SEED_ANCHOR, so reseeding twice produces identical rows.
 *
 * Two invariants hold by construction, and both are worth knowing before
 * editing this file:
 *
 *   * Every alarm has a distinct minute-of-hour, and every zone used here is a
 *     whole-hour offset from UTC. Two alarms therefore cannot share an instant
 *     whatever the date, so the demo profile never violates R-08.
 *   * Names are unique within a folder, case-insensitively, so it never
 *     violates R-09 either.
 */

export interface SeedFolder {
  id: string;
  externalKey: string;
  userKey: 'user-one' | 'user-two';
  name: string;
}

export interface SeedAlarm {
  id: string;
  externalKey: string;
  folderKey: string;
  name: string;
  note: string | null;
  enabled: boolean;
  timeOfDay: string;
  timezone: string;
  /** Days from SEED_ANCHOR. Negative means before it. */
  startOffsetDays: number;
  endOffsetDays: number | null;
  endAfterOccurrences: number | null;
  rule: Rule;
  /** Why this record exists, reproduced in docs/seed.md. */
  purpose: string;
}

export const SEED_FOLDERS: SeedFolder[] = [
  {
    id: '33333333-3333-4333-8333-000000000001',
    externalKey: 'folder-morning',
    userKey: 'user-one',
    name: 'Morning',
  },
  {
    id: '33333333-3333-4333-8333-000000000002',
    externalKey: 'folder-work',
    userKey: 'user-one',
    name: 'Work',
  },
  {
    id: '33333333-3333-4333-8333-000000000003',
    externalKey: 'folder-household',
    userKey: 'user-one',
    name: 'Household',
  },
  {
    id: '33333333-3333-4333-8333-000000000004',
    externalKey: 'folder-personal',
    userKey: 'user-two',
    name: 'Personal',
  },
];

export const SEED_ALARMS: SeedAlarm[] = [
  // --- Morning: five alarms -----------------------------------------------
  {
    id: '44444444-4444-4444-8444-000000000001',
    externalKey: 'alarm-wake-up',
    folderKey: 'folder-morning',
    name: 'Wake up',
    note: 'Every single day.',
    enabled: true,
    timeOfDay: '06:01',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'daily' },
    purpose: 'The simplest rule type.',
  },
  {
    id: '44444444-4444-4444-8444-000000000002',
    externalKey: 'alarm-stretch',
    folderKey: 'folder-morning',
    name: 'Stretch',
    note: null,
    enabled: true,
    timeOfDay: '06:02',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'weekly', byWeekday: ['MO', 'WE', 'FR'] },
    purpose: 'A weekly rule with several weekdays.',
  },
  {
    id: '44444444-4444-4444-8444-000000000003',
    externalKey: 'alarm-weekend-lie-in',
    folderKey: 'folder-morning',
    name: 'Weekend lie-in',
    note: null,
    enabled: true,
    timeOfDay: '09:03',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'weekly', byWeekday: ['SA', 'SU'] },
    purpose: 'A weekly rule on weekend days only.',
  },
  {
    id: '44444444-4444-4444-8444-000000000004',
    externalKey: 'alarm-dst-crossing',
    folderKey: 'folder-morning',
    name: 'DST crossing',
    note: 'Runs every Sunday, including the one the clocks change on.',
    enabled: true,
    timeOfDay: '01:04',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'weekly', byWeekday: ['SU'] },
    purpose:
      'R-07: 01:04 on 1 November 2026 happens twice in Toronto, and the engine must pick the first.',
  },
  {
    id: '44444444-4444-4444-8444-000000000005',
    externalKey: 'alarm-one-off-appointment',
    folderKey: 'folder-morning',
    name: 'One-off appointment',
    note: null,
    enabled: true,
    timeOfDay: '08:05',
    timezone: 'America/Toronto',
    startOffsetDays: 20,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'once' },
    purpose: 'A once rule, which produces exactly one occurrence.',
  },

  // --- Work: six alarms ----------------------------------------------------
  {
    id: '44444444-4444-4444-8444-000000000006',
    externalKey: 'alarm-standup',
    folderKey: 'folder-work',
    name: 'Standup',
    note: null,
    enabled: true,
    timeOfDay: '09:06',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'weekly', byWeekday: ['MO', 'TU', 'WE', 'TH', 'FR'] },
    purpose: 'A weekday-only weekly rule.',
  },
  {
    id: '44444444-4444-4444-8444-000000000007',
    externalKey: 'alarm-invoice-on-the-31st',
    folderKey: 'folder-work',
    name: 'Invoice on the 31st',
    note: 'Skips every month shorter than 31 days.',
    enabled: true,
    timeOfDay: '17:07',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'monthly_day', dayOfMonth: 31 },
    purpose: 'R-04: February, April, June, September and November are skipped outright.',
  },
  {
    id: '44444444-4444-4444-8444-000000000008',
    externalKey: 'alarm-last-friday-retro',
    folderKey: 'folder-work',
    name: 'Last Friday retro',
    note: null,
    enabled: true,
    timeOfDay: '16:08',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'monthly_nth', nth: -1, weekday: 'FR' },
    purpose: 'R-05: the last weekday of a month, which is not the same as the fourth.',
  },
  {
    id: '44444444-4444-4444-8444-000000000009',
    externalKey: 'alarm-sprint-planning',
    folderKey: 'folder-work',
    name: 'Sprint planning',
    note: null,
    enabled: true,
    timeOfDay: '10:09',
    timezone: 'Europe/Lisbon',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: 10,
    rule: { type: 'interval', every: 2, unit: 'weeks' },
    purpose:
      'An interval in weeks, in a second time zone, that stops after a count rather than a date.',
  },
  {
    id: '44444444-4444-4444-8444-000000000010',
    externalKey: 'alarm-quarterly-review',
    folderKey: 'folder-work',
    name: 'Quarterly review',
    note: null,
    enabled: true,
    timeOfDay: '11:10',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'interval', every: 3, unit: 'months' },
    purpose: 'An interval in months, anchored on the start date.',
  },
  {
    id: '44444444-4444-4444-8444-000000000011',
    externalKey: 'alarm-retired-campaign',
    folderKey: 'folder-work',
    name: 'Retired campaign',
    note: 'Left disabled on purpose.',
    enabled: false,
    timeOfDay: '08:11',
    timezone: 'America/Toronto',
    startOffsetDays: -30,
    endOffsetDays: 45,
    endAfterOccurrences: null,
    rule: { type: 'daily' },
    purpose:
      'The disabled alarm. Also the only seeded alarm with an endDate, and R-08 ignores it entirely.',
  },

  // --- Household: exactly one alarm, so A-08 can be exercised --------------
  {
    id: '44444444-4444-4444-8444-000000000012',
    externalKey: 'alarm-bin-day',
    folderKey: 'folder-household',
    name: 'Bin day',
    note: null,
    enabled: true,
    timeOfDay: '07:12',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'weekly', byWeekday: ['TU'] },
    purpose:
      'A-08: this folder holds exactly one alarm, so the conflicts panel and the bulk controls stay hidden until a second is added.',
  },

  // --- User two, to prove isolation ---------------------------------------
  {
    id: '44444444-4444-4444-8444-000000000013',
    externalKey: 'alarm-medication',
    folderKey: 'folder-personal',
    name: 'Medication',
    note: null,
    enabled: true,
    timeOfDay: '08:20',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'daily' },
    purpose: 'Belongs to user two. User one must receive 404 for it, never 403.',
  },
  {
    id: '44444444-4444-4444-8444-000000000014',
    externalKey: 'alarm-yoga',
    folderKey: 'folder-personal',
    name: 'Yoga',
    note: null,
    enabled: true,
    timeOfDay: '19:21',
    timezone: 'America/Toronto',
    startOffsetDays: 0,
    endOffsetDays: null,
    endAfterOccurrences: null,
    rule: { type: 'weekly', byWeekday: ['TU', 'TH'] },
    purpose: 'The second of user two’s alarms, so their folder also has two.',
  },
];
