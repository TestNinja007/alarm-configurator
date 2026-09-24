# Seed data

Generated from `src/api/src/seed/fixtures.ts`. Do not edit by hand; change the
fixtures and run `npm run docs:seed`.

Every date below is derived from `SEED_ANCHOR`, shown here resolved against its
default of `2026-06-15T18:00:00Z`. Change the variable and every date moves with it.

Two profiles exist. `empty` creates the two users and nothing else. `demo`
creates everything on this page. Resetting twice produces byte-identical rows.

## Users

| Key | Id | Email | Password | Name |
| --- | --- | --- | --- | --- |
| `user-one` | `11111111-1111-4111-8111-111111111111` | user-one@example.com | `Password123!` | Ada Mercer |
| `user-two` | `22222222-2222-4222-8222-222222222222` | user-two@example.com | `Password123!` | Bo Ferreira |

## Folders

| Key | Id | Owner | Name | Alarms |
| --- | --- | --- | --- | --- |
| `folder-morning` | `33333333-3333-4333-8333-000000000001` | `user-one` | Morning | 5 |
| `folder-work` | `33333333-3333-4333-8333-000000000002` | `user-one` | Work | 6 |
| `folder-household` | `33333333-3333-4333-8333-000000000003` | `user-one` | Household | 1 |
| `folder-personal` | `33333333-3333-4333-8333-000000000004` | `user-two` | Personal | 2 |

## Alarms

Every row has a distinct minute-of-hour and every zone used is a whole-hour
offset from UTC, so no two seeded alarms can ever share an instant. The demo
profile therefore never violates R-08, and every folder’s conflicts panel starts
empty.

### Morning (`folder-morning`, owner `user-one`)

| Key | Id | Name | Time | Zone | Starts | Ends | Repeats | Enabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alarm-wake-up` | `44444444-4444-4444-8444-000000000001` | Wake up | 06:01 | America/Toronto | 2026-06-15 | never | every day | yes |
| `alarm-stretch` | `44444444-4444-4444-8444-000000000002` | Stretch | 06:02 | America/Toronto | 2026-06-15 | never | weekly on MO, WE, FR | yes |
| `alarm-weekend-lie-in` | `44444444-4444-4444-8444-000000000003` | Weekend lie-in | 09:03 | America/Toronto | 2026-06-15 | never | weekly on SA, SU | yes |
| `alarm-dst-crossing` | `44444444-4444-4444-8444-000000000004` | DST crossing | 01:04 | America/Toronto | 2026-06-15 | never | weekly on SU | yes |
| `alarm-one-off-appointment` | `44444444-4444-4444-8444-000000000005` | One-off appointment | 08:05 | America/Toronto | 2026-07-05 | never | once | yes |

Why these records exist:

- **Wake up** — The simplest rule type.
- **Stretch** — A weekly rule with several weekdays.
- **Weekend lie-in** — A weekly rule on weekend days only.
- **DST crossing** — R-07: 01:04 on 1 November 2026 happens twice in Toronto, and the engine must pick the first.
- **One-off appointment** — A once rule, which produces exactly one occurrence.

### Work (`folder-work`, owner `user-one`)

| Key | Id | Name | Time | Zone | Starts | Ends | Repeats | Enabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alarm-standup` | `44444444-4444-4444-8444-000000000006` | Standup | 09:06 | America/Toronto | 2026-06-15 | never | weekly on MO, TU, WE, TH, FR | yes |
| `alarm-invoice-on-the-31st` | `44444444-4444-4444-8444-000000000007` | Invoice on the 31st | 17:07 | America/Toronto | 2026-06-15 | never | monthly on day 31 | yes |
| `alarm-last-friday-retro` | `44444444-4444-4444-8444-000000000008` | Last Friday retro | 16:08 | America/Toronto | 2026-06-15 | never | monthly on the last FR | yes |
| `alarm-sprint-planning` | `44444444-4444-4444-8444-000000000009` | Sprint planning | 10:09 | Europe/Lisbon | 2026-06-15 | after 10 | every 2 weeks | yes |
| `alarm-quarterly-review` | `44444444-4444-4444-8444-000000000010` | Quarterly review | 11:10 | America/Toronto | 2026-06-15 | never | every 3 months | yes |
| `alarm-retired-campaign` | `44444444-4444-4444-8444-000000000011` | Retired campaign | 08:11 | America/Toronto | 2026-05-16 | 2026-07-30 | every day | no |

Why these records exist:

- **Standup** — A weekday-only weekly rule.
- **Invoice on the 31st** — R-04: February, April, June, September and November are skipped outright.
- **Last Friday retro** — R-05: the last weekday of a month, which is not the same as the fourth.
- **Sprint planning** — An interval in weeks, in a second time zone, that stops after a count rather than a date.
- **Quarterly review** — An interval in months, anchored on the start date.
- **Retired campaign** — The disabled alarm. Also the only seeded alarm with an endDate, and R-08 ignores it entirely.

### Household (`folder-household`, owner `user-one`)

| Key | Id | Name | Time | Zone | Starts | Ends | Repeats | Enabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alarm-bin-day` | `44444444-4444-4444-8444-000000000012` | Bin day | 07:12 | America/Toronto | 2026-06-15 | never | weekly on TU | yes |

Why these records exist:

- **Bin day** — A-08: this folder holds exactly one alarm, so the conflicts panel and the bulk controls stay hidden until a second is added.

### Personal (`folder-personal`, owner `user-two`)

| Key | Id | Name | Time | Zone | Starts | Ends | Repeats | Enabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `alarm-medication` | `44444444-4444-4444-8444-000000000013` | Medication | 08:20 | America/Toronto | 2026-06-15 | never | every day | yes |
| `alarm-yoga` | `44444444-4444-4444-8444-000000000014` | Yoga | 19:21 | America/Toronto | 2026-06-15 | never | weekly on TU, TH | yes |

Why these records exist:

- **Medication** — Belongs to user two. User one must receive 404 for it, never 403.
- **Yoga** — The second of user two’s alarms, so their folder also has two.

## Referring to these records

Ids are fixed, so a test can use them directly. Each row also carries an
`external_key` column holding the slug in the first column above, which survives
a rename of the display name:

```sql
SELECT id FROM alarms WHERE external_key = 'alarm-invoice-on-the-31st';
```
