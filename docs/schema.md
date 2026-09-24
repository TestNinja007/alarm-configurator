# Database schema

The schema is meant to be read and queried directly by a test framework, so it
avoids clever encodings: one column per field, no JSON blobs where a column
would do, and constraints that spell out the rules rather than leaving them to
application code.

Connection string: `DATABASE_URL`. Under `docker compose` the database is also
published on host port **5433**:

```
postgresql://alarm_app:alarm_app@127.0.0.1:5433/alarm_configurator
```

## How time is stored

This is the part most worth understanding before writing assertions.

| Kind | Column type | Holds |
| --- | --- | --- |
| Instants | `timestamptz` | A UTC instant. `created_at`, `updated_at`, `expires_at`. |
| Calendar dates | `date` | A date in the **alarm's own zone**, not an instant. `start_date`, `end_date`. |
| Wall-clock time | `text` | The literal `HH:mm` the user typed, e.g. `06:01`. |
| Zone | `text` | An IANA name, e.g. `America/Toronto`. |

An alarm's occurrences are **not stored**. They are computed from
`time_of_day` + `timezone` + `start_date` + `rule` on each request, because a
stored list would be wrong the moment a time-zone database update changed a
DST rule. To assert on occurrences, call
`GET /api/v1/alarms/{id}/occurrences` rather than querying a table.

No domain timestamp comes from the database's own `now()`. Every one is written
by the application from its clock abstraction, which is what lets `PUT
/api/v1/test/clock` control them.

## Entity relationships

```mermaid
erDiagram
    users ||--o{ sessions     : "signs in with"
    users ||--o{ folders      : owns
    users ||--o| alarm_drafts : "has at most one"
    users ||--o| ui_state     : "has at most one"
    folders ||--o{ alarms     : contains
    folders ||--o{ ui_state   : "last selected by"

    users {
        uuid        id PK
        text        external_key UK "seed slug, null for real users"
        text        email          "unique on lower(btrim(email))"
        text        name
        text        password_hash  "scrypt$N$r$p$salt$hash"
        timestamptz created_at
        timestamptz updated_at
    }

    sessions {
        uuid        id PK          "the value of the sid cookie"
        uuid        user_id FK
        text        csrf_token     "echoed in X-CSRF-Token"
        timestamptz created_at
        timestamptz expires_at
    }

    folders {
        uuid        id PK
        text        external_key UK
        uuid        user_id FK
        text        name           "unique per user on lower(btrim(name))"
        timestamptz created_at
        timestamptz updated_at
    }

    alarms {
        uuid        id PK
        text        external_key UK
        uuid        folder_id FK   "ON DELETE CASCADE"
        text        name           "unique per folder on lower(btrim(name))"
        text        note           "nullable, <= 500 chars"
        boolean     enabled
        text        time_of_day    "HH:mm, 24-hour"
        text        timezone       "IANA name"
        date        start_date     "local date in timezone"
        date        end_date       "nullable, exclusive with end_after_occurrences"
        integer     end_after_occurrences "nullable, 1..1000"
        jsonb       rule           "discriminated on type"
        timestamptz created_at
        timestamptz updated_at
    }

    alarm_drafts {
        uuid        user_id PK
        integer     step           "1..4"
        jsonb       payload        "partial wizard state"
        timestamptz created_at
        timestamptz updated_at
    }

    ui_state {
        uuid        user_id PK
        uuid        folder_id FK   "nullable, ON DELETE SET NULL"
        text        sort           "name | created | next"
        boolean     enabled        "nullable filter"
        timestamptz updated_at
    }
```

## Tables

### `users`

Two seeded accounts plus any created through `POST /api/v1/test/users`.
Throwaway users have a null `external_key`. Passwords are scrypt hashes in the
form `scrypt$N$r$p$<salt base64>$<hash base64>`.

Email uniqueness is enforced case-insensitively by an index on
`lower(btrim(email))`, not by collation, so it is visible in `\d users`.

### `sessions`

One row per sign-in. The `sid` cookie carries the row id. A session is valid
while `expires_at > clock.now()`, which is the application's clock — so pinning
the test clock past a session's expiry invalidates it. Sign in *after* pinning.

### `folders`

`folders_user_name_key` is a unique index on `(user_id, lower(btrim(name)))`.

### `alarms`

Deleting a folder deletes its alarms through `ON DELETE CASCADE`; the API also
demands `?confirm=true` before it will issue that delete (R-10).

Constraints worth knowing, because they will reject a hand-written `INSERT`
that the API would also have rejected:

| Constraint | Enforces |
| --- | --- |
| `alarms_folder_name_key` | R-09, unique on `(folder_id, lower(btrim(name)))` |
| `alarms_time_of_day_format` | R-11, `^([01][0-9]\|2[0-3]):[0-5][0-9]$` |
| `alarms_end_exclusive` | `end_date` and `end_after_occurrences` are mutually exclusive |
| `alarms_end_after_start` | R-01 |
| `alarms_end_after_occurrences_range` | 1 to 1000 |
| `alarms_name_length` | 1 to 80 characters after trimming |
| `alarms_note_length` | at most 500 characters |

R-08 is **not** a database constraint. It depends on the current instant and on
expanding two recurrence rules, neither of which belongs in a check constraint,
so it is enforced in the application on create and update only.

### The `rule` column

`jsonb`, a discriminated union keyed on `type`. Exactly one shape per type, with
no extra keys:

```json
{ "type": "once" }
{ "type": "daily" }
{ "type": "weekly",      "byWeekday": ["MO", "WE", "FR"] }
{ "type": "monthly_day", "dayOfMonth": 31 }
{ "type": "monthly_nth", "nth": -1, "weekday": "FR" }
{ "type": "interval",    "every": 2, "unit": "weeks" }
```

`byWeekday` is stored de-duplicated and sorted into `MO TU WE TH FR SA SU`
order, so two equal rules compare equal as JSON (R-03). `nth` is 1, 2, 3, 4 or
-1; 5 is not accepted (R-05). Weekday codes are the two-letter forms above.

Querying by rule type:

```sql
SELECT name, rule FROM alarms WHERE rule->>'type' = 'monthly_day';
SELECT name FROM alarms WHERE rule @> '{"type":"weekly","byWeekday":["MO"]}';
```

### `schema_migrations`

One row per applied file from `db/migrations`, recorded by the runner in
`src/api/src/db/migrate.ts`. Migrations are applied in filename order, each in
its own transaction, and running them twice is a no-op.

## Useful queries

```sql
-- Every alarm with its folder and owner.
SELECT u.email, f.name AS folder, a.name, a.time_of_day, a.timezone, a.enabled
  FROM alarms a
  JOIN folders f ON f.id = a.folder_id
  JOIN users   u ON u.id = f.user_id
 ORDER BY u.email, f.name, a.name;

-- A seeded record by its stable slug rather than its display name.
SELECT * FROM alarms WHERE external_key = 'alarm-last-friday-retro';

-- Whether a wizard draft is currently stored, and how far it got.
SELECT u.email, d.step, d.payload->>'name' AS draft_name
  FROM alarm_drafts d JOIN users u ON u.id = d.user_id;
```
