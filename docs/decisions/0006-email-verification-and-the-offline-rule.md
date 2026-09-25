# 6. Email verification, and relaxing the offline rule

## Status
Accepted. This supersedes part of the original brief, with the repository
owner's agreement.

## Context
The brief written for the initial build said "No external network calls at
runtime. Everything runs offline through Docker." That is the right instinct for
a system under test: a test that fails because a third party was slow tells you
nothing about your own code.

Verification by email cannot honour it literally. The owner asked for real
email anyway, on the grounds that it adds surface worth testing — API testing
against a mail server, and security testing around codes, enumeration and
brute force.

## Decision
Delivery is a setting, not a default.

`MAIL_TRANSPORT=capture` holds messages in memory and is the default, so a bare
`npm start` needs no mail server at all. `smtp` opens a genuine SMTP
conversation. Under `docker compose` that points at **Mailpit**, a container on
the same network: real SMTP, real message, and nothing leaves the machine — so
the offline guarantee still holds for every test that runs the compose stack.
Only a deployment configured against a provider makes an outbound call.

## Consequences
The flow is testable at several levels. A test can read Mailpit's API like an
inbox, or skip the inbox entirely with
`GET /api/v1/test/verification-code`. Codes expire on the application clock, so
`PUT /api/v1/test/clock` can age one out deterministically rather than by
waiting fifteen minutes.

The code is included in the registration response **only** when the transport
is not `smtp`. That keeps a sandbox without a provider usable, and closes the
hole the moment real sending is switched on: otherwise anyone could register an
address they do not own and read its code from the response.

Verification failures answer identically for an unknown address and a wrong
code, so the endpoint cannot be used to discover which addresses are
registered. Login is the one place that admits an account is unverified, and
only to a caller who has already supplied the correct password.

Codes are stored in the clear. They are short-lived, single-purpose, and a
sandbox has to be able to show one back to the person who asked for it. Hashing
them would prevent exactly that without protecting anything worth protecting.
