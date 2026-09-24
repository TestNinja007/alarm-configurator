-- Core schema: users, sessions, folders, alarms.
--
-- Storage conventions (see docs/schema.md):
--   * every instant column is `timestamptz` and holds a UTC instant;
--   * `start_date` / `end_date` are calendar dates in the alarm's own timezone,
--     never instants, because "ends on the 3rd" is a local-date concept;
--   * `time_of_day` is the literal local wall-clock string the user typed.

CREATE TABLE users (
    id            uuid        PRIMARY KEY,
    external_key  text        UNIQUE,
    email         text        NOT NULL,
    name          text        NOT NULL,
    password_hash text        NOT NULL,
    created_at    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL
);

-- Email comparison is case-insensitive; the stored value keeps the user's casing.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(btrim(email)));

CREATE TABLE sessions (
    id         uuid        PRIMARY KEY,
    user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    csrf_token text        NOT NULL,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE folders (
    id           uuid        PRIMARY KEY,
    external_key text        UNIQUE,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name         text        NOT NULL,
    created_at   timestamptz NOT NULL,
    updated_at   timestamptz NOT NULL,
    CONSTRAINT folders_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60)
);

-- R-09's folder-level analogue: folder names are unique per user, case-insensitively,
-- after trimming. Expressed as an index so it is visible to anyone reading the schema.
CREATE UNIQUE INDEX folders_user_name_key ON folders (user_id, lower(btrim(name)));

CREATE TABLE alarms (
    id                    uuid        PRIMARY KEY,
    external_key          text        UNIQUE,
    folder_id             uuid        NOT NULL REFERENCES folders (id) ON DELETE CASCADE,
    name                  text        NOT NULL,
    note                  text,
    enabled               boolean     NOT NULL DEFAULT true,
    time_of_day           text        NOT NULL,
    timezone              text        NOT NULL,
    start_date            date        NOT NULL,
    end_date              date,
    end_after_occurrences integer,
    rule                  jsonb       NOT NULL,
    created_at            timestamptz NOT NULL,
    updated_at            timestamptz NOT NULL,

    CONSTRAINT alarms_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
    CONSTRAINT alarms_note_length CHECK (note IS NULL OR char_length(note) <= 500),

    -- R-11: 24-hour HH:mm, 00:00 through 23:59. 24:00 fails this check.
    CONSTRAINT alarms_time_of_day_format CHECK (time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

    -- endDate and endAfterOccurrences are mutually exclusive.
    CONSTRAINT alarms_end_exclusive CHECK (end_date IS NULL OR end_after_occurrences IS NULL),

    -- R-01, enforced in the database as well as in the request schema.
    CONSTRAINT alarms_end_after_start CHECK (end_date IS NULL OR end_date >= start_date),

    CONSTRAINT alarms_end_after_occurrences_range
        CHECK (end_after_occurrences IS NULL OR end_after_occurrences BETWEEN 1 AND 1000)
);

-- R-09: alarm names are unique within a folder, case-insensitively, after trimming.
CREATE UNIQUE INDEX alarms_folder_name_key ON alarms (folder_id, lower(btrim(name)));

CREATE INDEX alarms_folder_id_idx ON alarms (folder_id);
CREATE INDEX alarms_enabled_idx ON alarms (folder_id, enabled);
