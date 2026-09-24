# 5. Hand-written SQL, no ORM

## Status
Accepted.

## Context
The specification says a test framework will query this database directly, and
asks for a readable schema: "no obscure column names, no JSON blobs for fields
that could be columns".

## Decision
`pg` with hand-written SQL. Migrations are plain `.sql` files applied by a
forty-line runner that records them in `schema_migrations`.

## Consequences
The schema is exactly what `db/migrations/*.sql` says, with no generated names,
no join tables an ORM invented, and no lazy-loading surprises. Anyone reading
the migration knows what the table looks like.

Rules live in the schema where they can be enforced there: R-09 and R-11 are a
unique index and a check constraint, not only application code. A test framework
writing directly to the database hits the same rules the API does.

R-08 is the exception and is enforced only in the application, because it
depends on the current instant and on expanding two recurrence rules.

The cost is that queries are written by hand and column-to-field mapping lives
in `domain/mappers.ts`. At this size that is a few dozen lines.
