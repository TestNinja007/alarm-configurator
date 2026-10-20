# Working on this repository

The source of truth for decisions that are **not** derivable from the code.
Loaded automatically each session, version-controlled, and yours to edit.

**If a decision is made in conversation, it is written here immediately.**

The test effort has its own decisions — the two-stack split, TestQuality, and
what is out of scope — in `CLAUDE.md` of the
[alarm-test-framework](https://github.com/TestNinja007/alarm-test-framework)
repository, checked out alongside this one. Only the decisions that change how
*this* repository is worked on are repeated here; a second copy of the rest
would drift, which is DEF-15 one layer up.

---

## Deployment

**Render deploys do not happen on push.** Pushing to `main` does not make it
live; a deploy is a separate manual step. Never state that a change is live
without checking — the served asset hashes against a local build will tell you.

**Docker is not in the production path.** `render.yaml` sets `runtime: node`
and says why in a comment: the Dockerfile has never been exercised, so the
blueprint deliberately avoids it. CI builds and starts the app the same way
Render does.

`docker compose up --build` is still the first command the README offers for
running locally, and it has never been run. That is a newcomer's-first-command
problem, not a shipping one. Do not describe the container as the environment
production runs.

## Verifying a change

CI runs **this** repository's lint, which is not the test framework's. Running
the framework's and reporting it clean left this repository's CI red for four
commits.

```bash
npm run lint        # both workspaces: @alarm/api and @alarm/web
npm run typecheck
npm test            # vitest
npm run build
```

A change to `src/web/` needs a rebuild and a restart before the test framework
will see it — the API serves the built assets.

## Test support

The hooks under `/api/v1/test/*` are gated by `TEST_SUPPORT` and are off in
`render.yaml`, because they need no authentication — with them on, anyone who
read the README could reset the public demo.

Running locally for the test framework:

```bash
TEST_SUPPORT=1 REGISTRATION_OPEN=1 npm start --workspace @alarm/api
```

## Where things stand

*Last updated 20 October 2026. Update this when it stops being true.*

The application is covered by two test stacks in the
[alarm-test-framework](https://github.com/TestNinja007/alarm-test-framework)
repository — 78 Playwright specs across three engines and 68 pytest tests
against the database — plus 91 tests here: 75 in the main API and 16 in the
speech service, including the contract tests between the two.

**It is two services now, not one.** Generated speech runs as its own service
under `src/speech`; see "The speech service" below. Everything else is still a
single application, deliberately.

**22 defects found, 20 fixed, 1 open, 1 by design.** The open one is DEF-08:
multi-second maxima on database-backed endpoints under load, cause not
established. Its symptoms reach this repository as pool acquisition failures,
which now answer 503 with `Retry-After` rather than an unhandled 500 — correct
reporting of a fault, which is not a fix for it.

### Sequences: built, and not yet covered by a test

The mechanism works end to end — the chain fires on relative time, speaks each
step, stays silent through a pause, runs its cycles and closes its own run.
Verified by driving the interface with the voice and notifications recorded.

**It has no requirements and no test cases.** Nothing in the documented rules
mentions a sequence, so the traceability matrix does not know the feature
exists, and the suite would not notice if it broke. Those are the owner's to
write; two cases suggest themselves, because both are bugs that got past the
unit tests and were only found by running the thing:

- Activating a sequence must fire its first step. It is due at the instant of
  activation, so a poll arriving milliseconds later had already passed it — the
  symptom was pressing Activate and nothing happening.
- A finished run must stop reporting itself as running. It only closed on a
  scheduler poll, and the interface reads `/sequences`.

Also untouched: the tier cap (one sequence, five steps on basic), and what
Deactivate should offer beyond stopping immediately.

### Waiting on a person rather than on code

**Verification and reset codes are stored as issued, not hashed**
(`src/api/src/auth/verification.ts`, `passwordReset.ts`). No documented rule
says otherwise, so it is not a defect; it should be a decision. The reasoning
both ways is in the test that pins the current behaviour.

### Running it locally

The test framework needs this application up with its hooks on, and nothing
restarts it automatically. A stopped application makes the pytest layer skip
almost everything, which is easy to misread as the tests having changed.

```bash
npm run build
TEST_SUPPORT=1 REGISTRATION_OPEN=1 npm start --workspace @alarm/api
```

## Alarm sequences

*Decided in conversation 9 October 2026, before any of it was built.*

A new feature, and a new concept rather than a variation on an alarm. A
**sequence** is an ordered chain of steps that starts when somebody presses
Activate and runs on **relative** time — "one minute from now, then forty-four
minutes after that" — where every alarm today fires at a wall-clock time. It
lives in its own **Alarm Configuration** tab.

The worked examples it has to serve:

- *Morning stretch* — back stretch 30s, pause 10s, hip stretch 30s, pause 10s,
  leg stretch 5s. One pass, then it stops.
- *Stand up* — every 45 minutes for eight hours, speak "stand up", a minute
  later speak "now go back to work", and at the end of the window speak
  "you're done for the day" and deactivate.

### The two decisions made up front

**Available on the basic tier, with a cap.** One sequence and five steps on
basic; more on paid tiers. Chosen over gating it entirely *because of
testability*: within-day repetition is gated to paid tiers, paid tiers are out
of scope, and that is exactly why R-26 and TC45 are uncovered. Putting
sequences behind the same gate would have made a much larger feature
unverifiable from the day it shipped. A cap keeps it reachable by the suite and
still leaves something to upgrade for.

**Completion tracking is a later slice.** The check-mark prompt after each
action, the log, and partial credit are wanted, and are not in the first build.
The sequence has to run before the design for recording that it ran is worth
settling.

### Deliberately still open

The user expects to settle these while it is built, not before:

- What Deactivate offers — stop after the current sequence, stay on, or auto
  shut off.
- Whether a sequence can occupy a calendar slot against a daily goal. Named as
  wanted and explicitly deferred.

### What already exists and should not be rebuilt

Within-day repetition is already in the schema and the API: `repeat_every`,
`repeat_unit` (seconds, minutes or hours), `end_time_of_day`, with a ceiling of
3,600 occurrences a day. Most of the *stand up* example is expressible as one
existing alarm with a spoken message. What sequences add is the chain, the
relative timing, the closing step and — later — the tracking.

## The speech service

*Decided in conversation 20 October 2026, and built the same day.*

Server-generated speech was **extracted into its own service** under
`src/speech` — the one part of the application run as a microservice.
Everything else stays a monolith, deliberately.

### Why, stated honestly

The application does not need microservices: one app with one owner has none of
the problems they solve. This is done **to learn and demonstrate microservices
testing** — contract tests, a service tested in isolation, behaviour when a
dependency is down. That is a legitimate reason, and it is the one to give.
"The app needed microservices" would not be true.

### Why speech, and not mail or a full conversion

Measured, not guessed. Speech was ~370 lines owning exactly one table
(`speech_audio`), which nothing references, and **no backend code outside it
imported it** — its only consumer was the browser. Mail was tangled into four
callers including the health check, which is how DEF-02 happened. Converting
everything would rewrite a working application for no product benefit.

### The shape

- **The browser does not change.** `/speech`, `/speech/:id` and
  `/speech/settings` keep their exact external shape.
- **The main API keeps the user's concerns** — signing in, the tier gate, the
  per-user rate limit — and calls the speech service over HTTP.
- **The speech service owns the speech concerns** — the provider, the cache,
  the bytes — behind a service token, so the main API is its only caller.
- **When the speech service is down or unconfigured, speech degrades rather
  than fails**: settings report it unavailable and the browser uses its own
  voice. That fallback already existed; it now also covers a dependency being
  down.

### Data: schema per service

The speech service owns a `speech` schema and touches nothing else; the main
API's schema no longer holds speech data.

This is **schema per service** on a shared server — one of the three recognised
ways to keep a service's data private, alongside private tables and a database
server per service. It was chosen because the local database user can create a
schema but not a database or a role. **The isolation is therefore by convention
and by test, not by permission**: both services connect as the same role.
Making it a permission boundary needs one superuser command — a separate role
owning the `speech` schema — and is the upgrade path, not done.

### Testing

- **Contract tests (Pact)** check the main API's expectations of the speech
  service against what the service really returns, without running both. They
  need no database: the service's storage sits behind an interface with an
  in-memory implementation.
- **The speech service is tested in isolation**, with the mock provider, so
  nothing depends on ElevenLabs being up or a quota being unspent.
- **The database layer verifies what is stored**, in the speech schema.

**Generated speech is a paid-tier feature** (`generatedSpeech: false` on basic),
and paid tiers are out of scope. So the full path *through the main API as a
user* stays untested by the suite, as R-26 does. The service and the contract
between the two are fully testable, which is what this extraction is for.

### What building it found

- **A security test that tested the opposite of its claim.** The "fails closed
  without a token" test called `configWith({}, undefined)` - and passing
  `undefined` to a parameter with a default *uses the default*. It configured a
  token and checked the open path. Fixed, then proved by breaking the server to
  fail open and watching the test catch it.
- **A contract that was too narrow.** The audio interaction first pinned
  `audio/wav`, which is only what the mock provider makes; ElevenLabs returns
  `audio/mpeg`. It would have failed the first time it met real audio, and it
  constrained bytes the main API never reads. It now specifies a status and an
  audio Content-Type, nothing more.
- **Database tests that passed for the wrong reason.** Helpers that asked about
  a table by name alone quietly found the speech service's copy once the table
  existed in two schemas. Every schema question now names its schema.

### Still open

- **Deploying the speech service.** `render.yaml` still describes one service.
  Production behaviour is unchanged by the extraction - generated speech was
  already off there, since `TTS_PROVIDER` was never set - so nothing broke, but
  the speech service exists only locally and in CI.
- **A separate database role for the speech schema**, which would make the
  isolation a permission rather than a convention. Needs a superuser.
- **Test cases for it.** Like sequences, the speech service has no requirements
  and no designed cases - only the engineering tests written alongside it.

## Conventions that are easy to get wrong

**Every non-2xx response uses one envelope**, built from `AppError`:
`{ error: { code, message, requestId, fields?, details? } }`. `fields` carries
per-field validation failures; `details` carries structured payloads a 409
needs.

**`details` is serialised to the client.** An internal message — a database
error, a stack, anything naming infrastructure — does not belong there. Carry
it as the error's `cause` and log it.

**Rule A-02 is field-level validation, inline, client *and* server side.** The
sign-in form promised it and did neither until DEF-21; if you add a form,
both halves apply.

**A form may not reveal which addresses have accounts.** An unknown address
and a wrong password answer identically. Client-side validation here checks
emptiness only — anything about whether credentials are *correct* stays on the
server.
