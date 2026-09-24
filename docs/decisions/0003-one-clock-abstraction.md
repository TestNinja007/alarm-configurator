# 3. One clock abstraction for every server-side "now"

## Status
Accepted.

## Context
T-02 requires that a test can set the server clock and have every time-dependent
behaviour follow: which occurrences are "next", whether an R-08 collision falls
inside the 90-day window, what `created_at` records.

This only works if there is exactly one way to read the current time.

## Decision
`src/api/src/clock.ts` is the only source of "now". Nothing else calls
`Date.now()` or `new Date()` with no arguments. Domain timestamps are written by
the application, never by the database: no column uses `DEFAULT now()`, and no
`INSERT` calls `now()`.

## Consequences
Pinning the clock genuinely moves the application. A folder created while the
clock is pinned to 2026-10-30 records exactly that instant.

It also has a sharp edge, documented in the README: session expiry is evaluated
against the same clock, so pinning the clock past an existing session's expiry
invalidates it. Tests should pin the clock and then sign in, in that order.

`schema_migrations.applied_at` keeps a database default, since it records an
operational fact rather than a domain one.

The clock is process memory. The application runs as a single process; if it
were ever clustered, this would need to move to shared state.
