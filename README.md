# Alarm Configurator

A small web application for configuring recurring alarms: folders hold alarms,
an alarm is a local time of day plus an IANA time zone plus a repetition rule,
and the server turns that into exact UTC instants.

It exists as a system under test. The application was built by Claude Code as
scaffolding for a test framework written by the repository owner, which lives in
a separate repository.

> **Stage 2 of 3.** The recurrence engine, preview/occurrences/summary
> endpoints, the conflicts panel and the create wizard are now in place. Test
> hooks, seed profiles, OpenAPI and the remaining docs arrive in stage 3.
> Anything listed below but not yet built is marked *(stage 3)*.

## Running it

```
docker compose up --build
```

The app is at <http://localhost:8080> and the API at
<http://localhost:8080/api/v1>. Migrations and the seed run automatically before
the server starts.

To run it against a local PostgreSQL instead:

```
cp .env.example .env     # then set DATABASE_URL
npm install
npm run migrate
npm run seed
npm run build
npm start
```

## Seeded users

| Email | Password |
| --- | --- |
| `user-one@example.com` | `Password123!` |
| `user-two@example.com` | `Password123!` |

User two exists to prove isolation: a request for another user's folder or alarm
returns 404, never 403.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string. Required. In Docker the database is also published on host port 5433 so a test framework can query it directly. |
| `PORT` | `8080` | The API serves the built SPA on this port too, so everything is one origin. |
| `TEST_SUPPORT` | `0` | `1` mounts the `/api/v1/test/*` hooks *(stage 3)*. |
| `SEED_ANCHOR` | `2026-06-15T18:00:00Z` | Every seeded date derives from this instant, so reseeding twice produces identical data. |
| `LIST_DELAY_MS` | `600` | Fixed delay in front of the alarm list so the A-01 skeleton is observable. Never random. Set `0` to remove it. |
| `SESSION_SECRET` | — | Signs session cookies. |
| `SEED_PROFILE` | `demo` | Which profile the container seeds at startup: `demo` or `empty`. |

## Rules the application follows

| ID | Rule | Status |
| --- | --- | --- |
| R-01 | `endDate` before `startDate` is rejected with 422 and a field error on `endDate`. | done |
| R-02 | `every` below 1 or above 365 is rejected with 422 on `every`. | done |
| R-03 | `weekly` with an empty `byWeekday` is rejected with 422. Duplicate weekdays are de-duplicated, not rejected. | done |
| R-04 | `monthly_day` with `dayOfMonth` 29–31 skips months that are too short. February never produces a 31st. No clamping to the last day. | done |
| R-05 | `monthly_nth` accepts 1–4 and -1 only. A month without a fifth weekday is skipped. | done |
| R-06 | Spring forward: a local time that does not exist moves forward by the length of the gap (02:30 becomes 03:30 where the clock jumps 02:00 → 03:00). | done |
| R-07 | Fall back: a local time that happens twice uses the first, earlier-offset occurrence. | done |
| R-08 | Two enabled alarms in one folder may not share a UTC instant within the next 90 days. Colliding creates and updates return 409 with the conflicting alarm's id and the instant. Disabled alarms are ignored. | done |
| R-09 | Alarm names are unique within a folder, case-insensitively, after trimming. Violations return 409. | done |
| R-10 | Deleting a folder deletes its alarms and requires `?confirm=true`; without it, 409 carrying the alarm count. | done |
| R-11 | `timeOfDay` must be `HH:mm`, 00:00 to 23:59. `24:00` is rejected. | done |
| R-12 | `timezone` must be a valid IANA name; anything else is 422. | done |

### Conflicts, and why enabling is special

R-08 refuses to *create or update* an alarm into a collision. Enabling an alarm
does not run that check. That is deliberate, and it is the only way a collision
can come to exist: create the second alarm disabled, then enable it. Without
this gap the conflicts panel could never have anything to show, because every
write path would have refused the state it is meant to display.

## Error shape

Every non-2xx response uses one envelope:

```json
{ "error": { "code": "validation_error", "message": "…", "requestId": "…",
             "fields": [{ "field": "endDate", "code": "before_start", "message": "…" }],
             "details": { } } }
```

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login`, `/auth/logout` | |
| GET | `/auth/me` | Returns the user and the CSRF token. |
| GET/POST | `/folders` | |
| GET/PATCH/DELETE | `/folders/{id}` | Delete needs `?confirm=true` (R-10). |
| GET | `/folders/{id}/summary` | Counts, plus the next occurrence. |
| GET | `/folders/{id}/conflicts` | R-08 collisions, grouped one row per colliding pair. |
| GET/POST | `/alarms` | Filters: `folderId`, `enabled`, `q`, `sort`, `page`, `pageSize`. |
| GET/PUT/DELETE | `/alarms/{id}` | |
| POST | `/alarms/{id}/enable`, `/alarms/{id}/disable` | Does **not** run the R-08 check. |
| POST | `/alarms/bulk-enable` | `{ ids, enabled }`, all-or-nothing. |
| POST | `/alarms/preview` | Unsaved schedule in, occurrences out. Nothing persisted. |
| GET | `/alarms/{id}/occurrences` | `from`, `to`, `limit`. `to - from` may not exceed 366 days. |
| GET/PUT/DELETE | `/me/alarm-draft` | The wizard draft (A-03). |
| GET/PUT | `/me/ui-state` | Folder filter and sort order (A-04). |
| GET | `/health` | Always mounted, whatever `TEST_SUPPORT` is set to. |

Occurrence windows are inclusive at both ends: an occurrence at exactly `from`,
or at exactly `to`, is returned. The folder summary counts `[now, now + 7 days]`
on the same convention, over enabled alarms only.

`fields` carries per-field validation failures. `details` carries structured data
that has no field to attach to: the conflicting alarm and instant for R-08, the
alarm count for R-10.

Codes: `validation_error` (422), `unauthenticated` (401), `not_found` (404),
`conflict` (409), `rate_limited` (429), `internal` (500). Malformed JSON is 400
`malformed_request`. A rejected or missing CSRF token is reported as 401
`unauthenticated`, because the code list has no 403.

Every response carries `X-Request-Id`. A client-supplied value is echoed when it
matches `[A-Za-z0-9._-]{1,200}`; anything else is replaced with a fresh UUID
rather than reflected.

## Conditions this app creates for testing

All deterministic: no random delays, no random failures.

| ID | Condition | Status |
| --- | --- | --- |
| A-01 | The alarm list loads after first render, with a skeleton and an `aria-busy` container. The delay is `LIST_DELAY_MS`, default 600 ms. | done |
| A-02 | Field-level validation with inline errors, client- and server-side, including cross-field errors (R-01) that attach to one field. | done |
| A-03 | Four-step create wizard with a server-side draft that survives reload, and a resumable entry point. | done |
| A-04 | Per-user UI state: last folder filter and sort order stored server-side, reapplied at next login. | done |
| A-05 | Enabling or disabling a row updates optimistically, then reconciles with the server. | done |
| A-06 | Name search is debounced by 300 ms. | done |
| A-07 | Toasts appear on success and auto-dismiss after 5 seconds. | done |
| A-08 | An alarm cannot be created before a folder exists; the conflicts panel and bulk enable/disable appear only once a folder holds two or more alarms. | done |

## Test IDs

Every interactive element and every key container carries `data-testid`, in
kebab-case, `area-element` form:

- containers end in `-container`, `-page`, `-form`, `-region` or `-dialog`:
  `alarm-list-container`, `folders-page`, `folder-create-form`
- inputs end in `-input` or `-select`: `alarm-name-input`, `alarm-sort-select`
- buttons end in `-button`: `wizard-next-button`, `alarm-delete-button`
- repeated rows share one id and carry their own identity in a data attribute:
  `alarm-row` with `data-alarm-id`, `folder-row` with `data-folder-id`

Elements are also reachable by role and accessible name: the enable control is a
`switch` with `aria-checked`, dialogs trap focus, form inputs have real labels,
and errors are linked with `aria-describedby`.

## Database access for tests

`DATABASE_URL` holds the connection string. Under Docker the database is also
published on host port **5433**, so a framework can assert against it directly:

```
postgresql://alarm_app:alarm_app@127.0.0.1:5433/alarm_configurator
```

Schema notes, the UTC storage convention and an ER diagram land in
`docs/schema.md` *(stage 3)*. In short: every instant column is `timestamptz`
holding UTC; `start_date` and `end_date` are calendar dates in the alarm's own
zone, not instants; `time_of_day` is the literal local wall-clock string; and
`rule` is a `jsonb` discriminated union keyed on `type`.

## Tests in this repository

Unit tests for the recurrence engine only, under
`src/api/src/recurrence/engine.test.ts`, run with `npm test`. 21 tests covering
R-04 through R-08. There is deliberately no end-to-end,
API, UI or performance suite here — that is the separate framework's job.
