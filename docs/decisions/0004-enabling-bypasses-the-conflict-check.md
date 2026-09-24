# 4. Enabling an alarm does not run the R-08 check

## Status
Accepted. This resolves a contradiction in the specification, and was confirmed
with the repository owner before it was built.

## Context
R-08 says a create or update that would collide returns 409. The UI section asks
for "a conflicts panel showing R-08 collisions".

If every write path refuses collisions, no two enabled alarms in a folder can
ever share an instant, so the panel would always be empty. It would be
unreachable UI, and there would be nothing for a test to assert against.

R-08 contains one gap: "Disabled alarms are ignored by this check."

## Decision
Create and update run the check. Enable and disable — including bulk — do not.

The route to a collision is therefore explicit and deterministic:

1. create alarm A, enabled;
2. create alarm B with a colliding schedule, disabled, which is permitted
   because R-08 ignores disabled alarms;
3. enable B.

## Consequences
The guarantee is narrower than "two enabled alarms never collide". It is: *no
create or update introduces a collision*. The README says so in as many words,
so the behaviour reads as a decision rather than as a defect to be found later.

The conflicts panel has a reachable, deterministic path to non-empty state that
needs no clock manipulation.

The alternative — enable also returning 409 — would leave the panel reachable
only by moving the test clock so that a collision outside the 90-day window
slides into it. That is a far more awkward setup for a test, and it would make
a panel whose normal state is unreachable.
