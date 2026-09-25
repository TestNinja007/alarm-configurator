# Alarm Configurator

A small web application for configuring recurring alarms: folders hold alarms,
an alarm is a local time of day plus an IANA time zone plus a repetition rule,
and the server turns that into exact UTC instants.

It exists as a system under test. The application was built by Claude Code as
scaffolding for a test framework written by the repository owner, which lives in
a separate repository.

## Running it

```
docker compose up --build
```

> The compose stack is written but has not been run: it was developed against a
> local PostgreSQL instance. Everything below the Docker line has been verified;
> the container build has not.

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

## Deploying

[`render.yaml`](render.yaml) is a Render blueprint: a free Postgres plus a Node
web service that builds with `npm ci && npm run build` and starts with
`npm start`, which migrates, seeds if the database is empty, then serves.

The deployed configuration differs from local in three ways, all deliberate:

| Setting | Deployed | Why |
| --- | --- | --- |
| `TEST_SUPPORT` | `0` | The hooks need no authentication, so with them on anyone reading this page could reset the public instance. |
| `SEED_ON_START` | `if-empty` | Seeds on the first boot against an empty database, and never again, so a redeploy does not wipe it. |
| `SESSION_SECRET` | generated | Production refuses to start on a short or missing secret. |
| `DEMO_MODE` | `1` | Shows a banner saying the instance is a public sandbox with published credentials. Off locally, so it never sits in the way of a test run. |

Session cookies are marked `Secure` whenever `NODE_ENV=production`, and the
server trusts `X-Forwarded-*` so it sees the real protocol behind the platform's
proxy.

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
| `TEST_SUPPORT` | `0` | `1` mounts the `/api/v1/test/*` hooks. With any other value they are absent from the router and from the OpenAPI document. |
| `SEED_ANCHOR` | `2026-06-15T18:00:00Z` | Every seeded date derives from this instant, so reseeding twice produces identical data. |
| `DEMO_MODE` | `0` | `1` shows the public-sandbox banner on every page. The deployed instance sets it; leave it off locally. |
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
| GET | `/health` | Always mounted, whatever `TEST_SUPPORT` is set to (T-04). |
| GET | `/openapi.json` | OpenAPI 3.1, generated from the schemas the server validates with. |
| POST | `/test/reset` | T-01. `{ "profile": "empty" \| "demo" }`, default `demo`. |
| GET/PUT | `/test/clock` | T-02. `{ "now": "..." }` pins it, `{ "mode": "system" }` releases it. |
| POST | `/test/users` | T-03. Returns a throwaway account's credentials. |

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

## Test hooks

Mounted only when `TEST_SUPPORT=1`. With the flag off they are not registered
at all, so a request returns an ordinary 404 and they do not appear in the
OpenAPI document.

| ID | Hook |
| --- | --- |
| T-01 | `POST /test/reset` restores a seed profile. Measured at roughly 250 ms locally, well inside the 3-second budget. It also clears the sign-in rate limiter, which is in-process state a reset would otherwise leave behind. |
| T-02 | `PUT /test/clock` pins or releases the server clock. |
| T-03 | `POST /test/users` creates a throwaway account with no folders, so the A-08 setup dependency can be exercised from nothing. Removed by the next reset. |
| T-04 | `GET /health` reports version, database connectivity, whether test support is on, and the current clock state. Always available. |

### Pin the clock before signing in

Every server-side reading of "now" goes through one clock, including session
expiry. Pinning the clock past an existing session's expiry therefore
invalidates that session, and the next request returns 401. Pin first, then sign
in.

The clock genuinely drives the domain: a folder created while the clock is
pinned to `2026-10-30T12:00:00Z` records exactly that instant in `created_at`.
No domain timestamp comes from the database's own `now()`.

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

[`docs/schema.md`](docs/schema.md) documents the tables, the key columns, the
constraints and the UTC storage convention, with a Mermaid ER diagram. In short:
every instant column is `timestamptz` holding UTC; `start_date` and `end_date`
are calendar dates in the alarm's own zone, not instants; `time_of_day` is the
literal local wall-clock string; and `rule` is a `jsonb` discriminated union
keyed on `type`.

Occurrences are **not** stored. They are computed on each request, because a
stored list would be wrong the moment a time-zone database update changed a DST
rule.

## Documentation

| File | Contents |
| --- | --- |
| [`docs/seed.md`](docs/seed.md) | Every seeded record with its id, generated from the fixtures by `npm run docs:seed` so it cannot drift. |
| [`docs/schema.md`](docs/schema.md) | Tables, constraints, the time-storage convention and an ER diagram. |
| [`docs/decisions/`](docs/decisions/) | Why TypeBox, why a discriminated union, why one clock, why enabling skips the R-08 check, why no ORM. |

## Checks

`npm run ci` runs the same four steps as the GitHub Actions workflow — lint,
type-check, build, unit tests — so the code can be validated without a remote.

## Tests in this repository

Unit tests for the recurrence engine only, under
`src/api/src/recurrence/engine.test.ts`, run with `npm test`. 21 tests covering
R-04 through R-08. There is deliberately no end-to-end,
API, UI or performance suite here — that is the separate framework's job.
