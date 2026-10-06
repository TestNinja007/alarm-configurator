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
