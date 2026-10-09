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

*Last updated 6 October 2026. Update this when it stops being true.*

The application is covered by two test stacks in the
[alarm-test-framework](https://github.com/TestNinja007/alarm-test-framework)
repository — 78 Playwright specs across three engines and 62 pytest tests
against the database — plus 38 unit tests here. CI is green on both.

**22 defects found, 20 fixed, 1 open, 1 by design.** The open one is DEF-08:
multi-second maxima on database-backed endpoints under load, cause not
established. Its symptoms reach this repository as pool acquisition failures,
which now answer 503 with `Retry-After` rather than an unhandled 500 — correct
reporting of a fault, which is not a fix for it.

One thing waiting on a human rather than on code: **verification and reset
codes are stored as issued, not hashed** (`src/api/src/auth/verification.ts`,
`passwordReset.ts`). No documented rule says otherwise, so it is not a defect;
it should be a decision. The reasoning both ways is in the test that pins the
current behaviour.

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
