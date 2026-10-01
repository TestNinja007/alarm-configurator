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
| `REGISTRATION_OPEN` | `1` | Anyone may create an account on the public instance. Closed everywhere else. |

Session cookies are marked `Secure` whenever `NODE_ENV=production`, and the
server trusts `X-Forwarded-*` so it sees the real protocol behind the platform's
proxy.

## Seeded users

| Email | Password | Role | Tier |
| --- | --- | --- | --- |
| `user-one@example.com` | `Password123!` | user | advanced |
| `user-two@example.com` | `Password123!` | user | basic |
| `admin@example.com` | `Password123!` | admin | advanced |

User two exists to prove isolation: a request for another user's folder or alarm
returns 404, never 403. The two ordinary accounts sit on different tiers on
purpose — one where every feature is reachable, one where the limits are
reachable — so neither has to be reconfigured before it is useful.

## Roles and tiers

Two independent things. A **role** says what you may administer; a **tier** says
what you may create. Collapsing them would make "an administrator on the basic
tier" unrepresentable, which is a perfectly ordinary account.

| | basic | regular | advanced |
| --- | --- | --- | --- |
| Folders | 2 | 10 | unlimited |
| Alarms per folder | 5 | 50 | unlimited |
| Repeat within a day | no | yes | yes |
| Shortest interval | — | 5 minutes | 1 second |
| Generated speech | no | no | yes |

Exceeding a count is **409** with `details.tier`, `details.limit` and
`details.resource`. Asking for a feature the tier lacks is **422** with code
`tier_limit` on the offending field. Generated speech is **404** instead — the
client falls back to the browser's own voice, exactly as it does when a provider
is unreachable, so this is a degradation rather than an error to handle.

**Limits are counted, not cached.** A tier change takes effect on the next
request, including for a session already signed in.

**A downgrade never deletes anything.** An alarm created on a higher tier keeps
working, but cannot be saved again until it fits the current one. Taking away
what somebody already made would be worse than refusing to let them change it.

### Administering accounts

`GET /admin/users` and `PATCH /admin/users/{id}` change role, tier and
suspension. Both answer **404 to a non-administrator** — the same way another
person's folder does, so nothing confirms the routes exist.

An administrator cannot demote or suspend themselves: either would lock them out
of the page with no way back. Both are 409.

**Suspending ends every session at once** rather than waiting for one to expire,
and a suspended account cannot sign in — 401 with `details.reason` of
`account_suspended`. Its folders and alarms are untouched, so restoring it
restores everything.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string. Required. In Docker the database is also published on host port 5433 so a test framework can query it directly. |
| `PORT` | `8080` | The API serves the built SPA on this port too, so everything is one origin. |
| `TEST_SUPPORT` | `0` | `1` mounts the `/api/v1/test/*` hooks. With any other value they are absent from the router and from the OpenAPI document. |
| `SEED_ANCHOR` | `2026-06-15T18:00:00Z` | Every seeded date derives from this instant, so reseeding twice produces identical data. |
| `DEMO_MODE` | `0` | `1` shows the public-sandbox banner on every page. The deployed instance sets it; leave it off locally. |
| `REGISTRATION_OPEN` | `0` | `1` opens registration and shows the sign-up link. Off locally, so the seeded-users baseline stays unchanged. |
| `MAIL_TRANSPORT` | `capture` | `capture`, `log` or `smtp`. See [Email](#email). |
| `MAIL_HOST` / `MAIL_PORT` | `127.0.0.1` / `1025` | The SMTP server. Compose points these at Mailpit. |
| `MAIL_USER` / `MAIL_PASSWORD` | — | Only needed by a real provider. |
| `MAIL_FROM` | a `.test` address | The From header. |
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

### Ending a series

`endDate` alone runs the alarm through the end of that day. Adding the optional
`endTime` stops it at a precise instant instead, so an alarm at 22:00 with
`endDate` 3 June and `endTime` 12:00 last fires on the 2nd.

`endTime` without `endDate` is 422 with code `needs_date` — a time on its own
has nothing to attach to.

This is a different thing from `endTimeOfDay` below, which closes the repeat
window on *every* day. The wizard labels them accordingly: "End time" under
Ends, and "Until" under Repeat during the day.

### Required fields in the wizard

Each step checks what it needs before it will advance, so a missing name is
caught on step one rather than three screens later at submit. Going **back** is
never blocked. The server validates everything again regardless — the step
check is a convenience, not the enforcement.

### Repeating within a day

The `rule` decides which **days** an alarm falls on. Three optional fields decide
which **times** on each of those days:

| Field | Meaning |
| --- | --- |
| `endTimeOfDay` | Closes the window each day. Not the same as `endDate`, which ends the series. |
| `repeatEvery` | 1 to 1440. |
| `repeatUnit` | `seconds`, `minutes` or `hours`. |

All three arrive together or none does; a partial set is 422 on `repeatEvery`.
`endTimeOfDay` must be later in the day than `timeOfDay` — the window does not
wrap past midnight, because one that did would make it ambiguous which day an
occurrence belonged to.

In the wizard both live on the Repetition step, one under the other: **Repeats**
chooses which days, **Repeat during each day** chooses the times on them. They
were split across two steps at first, which sent people hunting for "every N
minutes" in the rule list where only days, weeks and months appear.

They stay two controls rather than one merged list, because merging them would
make "every 15 minutes between 09:00 and 17:00 **on weekdays**" impossible to
express. The walk is inclusive of both ends:
09:00 to 09:10 every 5 minutes gives 09:00, 09:05 and 09:10. A step that would
overshoot simply stops early.

Occurrences inside a window still obey R-06 and R-07, resolved one at a time
rather than sliding the window as a block. That means a spring-forward can fold
two wall-clock times onto one instant — 02:00 and 03:00 are both `07:00Z` in
Toronto on 8 March — so each day's instants are de-duplicated and sorted before
any is returned. An alarm never reports the same instant twice.

Every occurrence counts individually towards `endAfterOccurrences`, not one per
day.

**A window may produce at most 4,000 occurrences a day**, and a request over
that is 422 on `endTimeOfDay` with code `window_too_dense`. The message says
how wide the window may be at that interval. In practice:

| Interval | Widest window |
| --- | --- |
| Every second | about 1h 6m |
| Every 10 seconds | about 11 hours |
| Every minute | a full day |

The ceiling exists because of R-08 rather than because of the clock: conflict
detection compares two alarms' entire occurrence sets across ninety days, and
this bounds that at 360,000 each. Both ends of a window count, so ten hours at
ten-second intervals is 3,601 occurrences rather than 3,600 — which is why the
limit is not the rounder-looking number.

### Conflicts, and why enabling is special

R-08 refuses to *create or update* an alarm into a collision. Enabling an alarm
does not run that check. That is deliberate, and it is the only way a collision
can come to exist: create the second alarm disabled, then enable it. Without
this gap the conflicts panel could never have anything to show, because every
write path would have refused the state it is meant to display.

### Registration and email verification

Open only where `REGISTRATION_OPEN=1`; elsewhere the routes are not mounted, so
they return 404 rather than an error that would confirm they exist.

Registration is two steps. `POST /auth/register` creates the account, issues a
six-digit code and emails it, but **returns no session** — the account cannot be
signed into until `POST /auth/verify` accepts the code. Confirming is what signs
you in for the first time.

| Case | Response |
| --- | --- |
| Success | 201, the account is signed in immediately |
| Password under 10 characters | 422 on `password` |
| Password containing the email address | 422 on `password`, code `too_similar` |
| Malformed email | 422 on `email` |
| Address already registered, in any casing | 409 on `email`, code `duplicate_email` |
| More than 5 attempts for one address in 15 minutes | 429 |
| Signing in before confirming | 401, `details.reason` is `email_not_verified` |
| Wrong code | 422 on `code` |
| Wrong code, 5 times | 429 — the correct code is refused too until a new one is issued |
| Code older than 15 minutes | 422 on `code`, code `expired` |
| Verifying an unknown address | 422, **identical** to a wrong code, so this is not an address checker |
| Resend | Issues a new code and invalidates the previous one |

Email comparison is case-insensitive and the name is trimmed, matching the rest
of the application.

### Resetting a forgotten password

`POST /auth/forgot-password` emails a six-digit code;
`POST /auth/reset-password` accepts it, sets the new password and signs in.

| Case | Response |
| --- | --- |
| Unknown address | 200, **identical** to a real one — this is not an address checker |
| Address that never confirmed its email | 200, and no code is issued; there is nothing to reset into |
| Wrong code | 422 on `code` |
| Wrong code, 5 times | 429 — the correct code is refused too until a new one is issued |
| Code older than 15 minutes | 422 on `code`, code `expired` |
| Reusing a spent code | 422 — single use |
| New password containing the address | 422, the same rule as registration |
| More than 5 requests for one address in 15 minutes | 429 |

**Every existing session for the account is destroyed on a successful reset.**
Somebody resetting a password may be doing it precisely because another party
has the old one, and leaving that party signed in would defeat the exercise. The
caller gets a fresh session, since the one it arrived with was among those
destroyed.

Six digits rather than a long token is only defensible because of the limits
around it: fifteen minutes, five attempts, single use, and a new code replaces
the old one.

One caveat for a sandbox: where `MAIL_TRANSPORT` is not really sending, the
response carries the code, and its presence reveals whether the address has an
account. Wherever mail is genuinely sent — which is every deployment — no code
is returned and the two answers are identical.

### Settings

`/settings` groups everything about the account rather than about alarms:
the display name, the password, desktop notifications, and deleting the
account — in that order, so the irreversible one is last.

The email address is fixed once confirmed, since changing it would mean
re-verifying and there is nothing in this application that needs it.

**Changing a password while signed in** is a different route from resetting a
forgotten one. It requires the current password, refuses a new password that
matches the old one or contains the email address, and ends **every other**
session while keeping the caller's own. Someone changing their password
deliberately should not be thrown off the device they are doing it on; a reset,
where the account may already be compromised, ends every session including the
caller's.

### Deleting an account

`DELETE /api/v1/me` removes the account and cascades to its sessions, folders,
alarms, wizard draft, UI state and any outstanding verification code.

| Case | Response |
| --- | --- |
| Wrong password | 401 — checked before anything else, so a wrong password never reveals how much the account holds |
| Without `?confirm=true` | 409 carrying `folderCount` and `alarmCount` |
| A seeded account | 409, code `seeded_account` |
| Success | 204, cookies cleared, the address becomes available again |

Seeded accounts are protected because their credentials are published in this
file: without the guard, the first visitor to the public instance could delete
the demonstration data out from under everybody else, and `POST /test/reset` is
not available there to put it back.

## Email

`MAIL_TRANSPORT` picks how messages leave:

| Value | Behaviour |
| --- | --- |
| `capture` | Held in memory, nothing sent. The default, so `npm start` needs no mail server. |
| `log` | Captured and printed. |
| `smtp` | A real SMTP conversation, to Mailpit locally. |
| `brevo` | Posts to Brevo's API over HTTPS. What the deployment uses. |

`docker compose up --build` runs **Mailpit** alongside the app and points the
API at it. Messages never leave the machine, so the offline guarantee still
holds under test, and Mailpit's own UI and API are on <http://localhost:8025> —
which is where a test can read a real inbox.

Two ways to get a code without reading mail, both requiring `TEST_SUPPORT=1`:

- `GET /api/v1/test/verification-code?email=…` — the outstanding code
- `GET /api/v1/test/mail` — everything the `capture` transport is holding

**The code is returned in the registration response only when
`MAIL_TRANSPORT` is not `smtp`.** That keeps a sandbox with no mail provider
usable, and it is withheld the moment real sending is configured — otherwise
anyone could register an address they do not own and read its code straight off
the response.

`GET /api/v1/health` reports the transport and whether the mail server answered
the last time anyone checked, so a deployment that cannot send is visible rather
than silently swallowing sign-ups. `reachable` is `null` until the first
background check completes.

Health never waits on the mail server. It reports a cached answer refreshed at
most once a minute in the background, because a health endpoint that depends on
a third party responding is a health endpoint that can take the whole site down.

### Why the deployment does not use SMTP

Hosting platforms block outbound SMTP ports to deter spam, and Render is one of
them. A connection to `smtp-relay.brevo.com:587` from there times out no matter
how correct the credentials are — health reported
`ETIMEDOUT Connection timeout`, which is a refused connection rather than a
refused login.

So the deployment sends through the same provider over HTTPS instead, which
nothing blocks. `MAIL_TRANSPORT=brevo` plus `MAIL_API_KEY` (the REST key,
beginning `xkeysib-`) and `MAIL_FROM` set to a verified sender.

Locally, `smtp` against Mailpit is still the better choice: it is a real SMTP
conversation with a real inbox to read, and nothing leaves the machine.

### On the original "no external network calls" rule

The brief written for the initial build forbade outbound calls at runtime, for
good reason: a system under test that depends on a third party inherits that
third party's failures. Sending genuine email breaks that rule, so it is a
setting rather than a default. Under `docker compose`, mail goes to a container
on the same network and nothing leaves the machine; only a deployment pointed at
a real provider makes an outbound call.

## Speaking an alarm aloud

An alarm can carry a message of up to 200 characters, read out by the browser's
own speech synthesis when it fires. Nothing is generated in advance, nothing is
stored but the words, and no external service is involved — the voices belong to
the operating system, so this costs nothing and works offline.

| Field | Meaning |
| --- | --- |
| `speechText` | 1 to 200 characters. Empty means silent. |
| `speechVoice` | `male` or `female`. A preference, not a named voice. |

A voice without text is 422 with code `needs_text`.

### Messages that change with each repetition

An alarm firing several times a day should not need a message written per
repetition — and if it did, changing the repeat interval would leave those
messages quietly wrong. So `speechText` is a template, filled from where the
occurrence sits in its own day:

| Token | Becomes |
| --- | --- |
| `{ordinal}` | first, second, third… |
| `{n}` | 1, 2, 3… |
| `{total}` | how many times it fires that day |
| `{remaining}` | how many are left after this one |

`speechFinalText` replaces it on the last occurrence of the day, which is what
makes "last warning" read naturally rather than "third warning".

So one alarm firing three times, written once:

```
speechText      "Hey, this is your {ordinal} warning of {total}. Get it done."
speechFinalText "Hey, this is your last warning. Get it done now."
```

says *first warning of 3*, *second warning of 3*, then *last warning* — and
still says the right thing if it later fires five times.

Unknown tokens are left as written rather than blanked, so a typo is audible
instead of silently eating part of the sentence.

`GET /me/upcoming` carries `indexInDay` and `countInDay` for this. `countInDay`
is the total for that day even when the requested window clips it: being third
of five should not become third of two because someone asked a narrow question.

**Gender is a preference, not a guarantee.** `SpeechSynthesisVoice` exposes only
`voiceURI`, `name`, `lang`, `localService` and `default` — there is no gender
field in the standard and none in practice. The preference is matched against
the names of the voices installed on the machine doing the speaking, which
differ from one computer to another, and falls back to whatever is available
rather than failing. The wizard names the voice it would actually use, and says
that another computer may choose differently.

Voices load asynchronously in Chromium, so the first `getVoices()` after a page
load returns nothing. Anything showing which voice will be used has to subscribe
to `voiceschanged` or it reports the fallback for ever.

### Generated audio

The browser's own voices differ from machine to machine. A provider gives every
listener the same voice, at the cost of an API key and a quota.

`TTS_PROVIDER` picks how:

| Value | Behaviour |
| --- | --- |
| `none` | No server audio. The browser speaks for itself. The default. |
| `mock` | Generates a real, playable WAV locally. No account, no network, no cost. |
| `elevenlabs` | The provider. Needs `TTS_API_KEY`. |

`mock` exists so the whole path — request, cache, storage, playback, fallback —
can be exercised before anyone has a key, and so tests never depend on a third
party being up or on a quota not being spent. Its tone is lower for `male` than
`female` and longer for longer text, so one message is audibly different from
another and a test can assert that a longer sentence really did produce a
longer file.

**Audio is cached** in `speech_audio`, keyed by a sha256 of provider, voice and
the exact words. A free tier is measured in characters a month, and previewing
a message while editing it would otherwise exhaust one in an afternoon. The
response says `generated: true` the first time and `false` thereafter, which is
the thing worth asserting. It lives in Postgres rather than on disk because the
application's disk is ephemeral: a redeploy would throw the cache away and the
next preview would pay for everything again.

| Endpoint | |
| --- | --- |
| `POST /speech` | `{ text, voice }` → an id and a url. 60 per user per 15 minutes. |
| `GET /speech/{id}` | The bytes. Immutable, since the id is a hash of the content. |
| `GET /speech/settings` | Whether server audio is on, and which provider. |

**Every failure falls back to the browser's voice.** A missing key, a spent
quota, a timeout, a refused autoplay — an alarm that says nothing because the
provider was down is worse than one that speaks in the wrong voice.

## Desktop notifications

While the app is open in a tab, alarms raise native notifications on Windows and
macOS. The page polls `GET /me/upcoming` every 30 seconds, sets a timer for
anything due within the next two minutes, and fires it.

This is **not** push. Nothing arrives once the browser is closed. Real push would
need a service worker and a server awake around the clock, which a free instance
that sleeps after fifteen minutes cannot be.

The scheduler runs in a provider around the whole signed-in app, so alarms fire
on any page. It must be a single shared instance: it remembers what has already
fired in a ref, so two of them would each keep their own copy and both raise a
notification for the same occurrence. The controls live under Settings. Permission is requested from a button rather
than on load, because browsers ignore the request otherwise, and there is a
"send a test notification" button so a person can confirm it works without
waiting for an alarm.

For tests, `notification-permission-state` carries the state as data attributes:

```
data-permission="granted|denied|default|unsupported"
data-active="true|false"
data-upcoming-count="3"
```

Occurrences that have already fired are remembered in `localStorage`, keyed by
alarm and instant, so a reload cannot repeat them. Entries older than a day are
pruned.

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
| POST | `/auth/register` | Creates an unverified account and emails a code. No session. 404 unless `REGISTRATION_OPEN=1`. |
| POST | `/auth/verify` | Confirms the code and signs in. |
| POST | `/auth/resend-verification` | Issues a fresh code, invalidating the previous one. |
| POST | `/auth/forgot-password` | Emails a reset code. Answers identically for an unknown address. |
| POST | `/auth/reset-password` | Sets a new password and signs in, destroying every other session. |
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
| PATCH | `/me/profile` | Changes the display name. |
| PUT | `/me/password` | Changes the password, given the current one. |
| DELETE | `/me` | Deletes the account and everything in it. Needs `?confirm=true` and the password. |
| GET | `/me/upcoming` | Occurrences due soon across every enabled alarm, for the notification scheduler. |
| GET | `/health` | Always mounted, whatever `TEST_SUPPORT` is set to (T-04). |
| GET | `/openapi.json` | OpenAPI 3.1, generated from the schemas the server validates with. |
| POST | `/test/reset` | T-01. `{ "profile": "empty" \| "demo" }`, default `demo`. |
| GET/PUT | `/test/clock` | T-02. `{ "now": "..." }` pins it, `{ "mode": "system" }` releases it. |
| POST | `/test/users` | T-03. Returns a throwaway account's credentials. |
| GET | `/test/verification-code` | The outstanding email-confirmation code for an address. |
| GET | `/test/password-reset-code` | The outstanding password reset code for an address. |
| GET/DELETE | `/test/mail` | Messages held by the `capture` transport. |

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
| — | Leaving the wizard: **Cancel** backs out, and in an edit it asks first if anything changed. In a create it keeps the draft, which is what **Discard draft** is for. | done |
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
| [`docs/ideas.md`](docs/ideas.md) | Things discussed but not built, and what would be needed first. |
| [`docs/decisions/`](docs/decisions/) | Why TypeBox, why a discriminated union, why one clock, why enabling skips the R-08 check, why no ORM. |

## Checks

`npm run ci` runs the same four steps as the GitHub Actions workflow — lint,
type-check, build, unit tests — so the code can be validated without a remote.

## Tests in this repository

Unit tests for the recurrence engine only, under
`src/api/src/recurrence/engine.test.ts`, run with `npm test`. 21 tests covering
R-04 through R-08. There is deliberately no end-to-end,
API, UI or performance suite here — that is the separate framework's job.
