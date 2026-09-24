# 2. A discriminated union for repetition rules

## Status
Accepted.

## Context
`rule` is a union of six shapes. Expressed as a plain `anyOf`, Ajv reports the
failures of *every* branch when one does not match. Sending
`{"type":"interval","every":400,"unit":"days"}` produced seven field errors:
the real one about `every`, plus complaints that `byWeekday`, `dayOfMonth` and
`nth` were missing, plus two about `type` not matching a constant.

The specification asks for field-level errors that attach to a specific field
(A-02). Seven errors for one mistake does not meet that.

## Decision
`RuleSchema` is `oneOf` with `discriminator: { propertyName: 'type' }`, and
Fastify's Ajv runs with `discriminator: true`. Only the branch named by `type`
is validated.

Unions of literals inside the rules — the weekday codes, the accepted `nth`
values — are `enum` rather than `anyOf` of `const`, for the same reason.

## Consequences
The same payload now yields exactly one error, `rule.every must be <= 365`. An
unrecognised `type` yields one error too: `value of tag "type" must be in oneOf`.

The OpenAPI document gains a real discriminator, which client generators use.

Ajv's strict mode requires `type: "object"` alongside `discriminator`, so the
union carries it explicitly.
