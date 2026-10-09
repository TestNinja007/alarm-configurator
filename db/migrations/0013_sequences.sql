-- Alarm sequences: an ordered chain that runs on relative time.
--
-- A new table rather than more columns on `alarms`, because the thing being
-- stored is different in kind. An alarm fires at a wall-clock time in a named
-- zone and its occurrences are computed from a recurrence rule. A sequence
-- step fires a number of seconds after the step before it, and the chain as a
-- whole starts whenever somebody presses Activate. There is no time of day on
-- a step and no zone, and adding nullable columns for "sometimes relative"
-- would leave every existing query having to know which kind it was looking
-- at.

CREATE TABLE sequences (
    id             uuid        PRIMARY KEY,
    user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name           text        NOT NULL,

    -- How the chain repeats once it reaches the end.
    --
    --   once      run the steps through and stop. Morning stretch.
    --   duration  keep cycling until repeat_seconds have elapsed since
    --             activation, then speak closing_text and stop. Stand up
    --             every 45 minutes for eight hours.
    --   count     cycle repeat_count times, then stop.
    repeat_mode    text        NOT NULL DEFAULT 'once',
    repeat_seconds integer,
    repeat_count   integer,

    -- Spoken once, after the last cycle, before deactivating. "You're done
    -- for the day."
    closing_text   text,

    created_at     timestamptz NOT NULL,
    updated_at     timestamptz NOT NULL,

    CONSTRAINT sequences_name_not_blank
        CHECK (btrim(name) <> ''),
    CONSTRAINT sequences_name_length
        CHECK (char_length(name) <= 120),
    CONSTRAINT sequences_repeat_mode_values
        CHECK (repeat_mode IN ('once', 'duration', 'count')),

    -- Each mode carries exactly the field it needs and not the others. Without
    -- this, a sequence can say "repeat for 8 hours" and "repeat 3 times" at
    -- once, and whichever the application happens to read first wins.
    CONSTRAINT sequences_repeat_fields_match_mode CHECK (
        (repeat_mode = 'once'     AND repeat_seconds IS NULL AND repeat_count IS NULL)
     OR (repeat_mode = 'duration' AND repeat_seconds IS NOT NULL AND repeat_count IS NULL)
     OR (repeat_mode = 'count'    AND repeat_count IS NOT NULL AND repeat_seconds IS NULL)
    ),

    -- One second to twenty-four hours. A window longer than a day belongs to
    -- a recurring alarm, not to something started by pressing a button.
    CONSTRAINT sequences_repeat_seconds_range
        CHECK (repeat_seconds IS NULL OR repeat_seconds BETWEEN 1 AND 86400),
    CONSTRAINT sequences_repeat_count_range
        CHECK (repeat_count IS NULL OR repeat_count BETWEEN 1 AND 1000),
    CONSTRAINT sequences_closing_text_length
        CHECK (closing_text IS NULL OR char_length(closing_text) <= 200)
);

-- Case-insensitive after trimming, the same comparison folders and alarms use
-- (R-09, R-21, R-22). "Morning stretch" and " morning STRETCH " are one name.
CREATE UNIQUE INDEX sequences_user_name_key
    ON sequences (user_id, lower(btrim(name)));

CREATE INDEX sequences_user_id_idx ON sequences (user_id);


CREATE TABLE sequence_steps (
    id               uuid        PRIMARY KEY,
    sequence_id      uuid        NOT NULL REFERENCES sequences (id) ON DELETE CASCADE,

    -- Where in the chain. Dense from 1, renumbered on insert and delete, so
    -- the order is readable from the data rather than inferred from a float
    -- or from insertion time.
    position         integer     NOT NULL,

    --   action  something to do, which is announced
    --   pause   the gap between two actions, usually silent
    kind             text        NOT NULL DEFAULT 'action',

    -- What it is, for the person reading the list. "Back stretch".
    label            text        NOT NULL,

    -- How long this step lasts before the next begins. Seconds, because the
    -- examples run from five seconds to forty-five minutes.
    duration_seconds integer     NOT NULL,

    -- Spoken when the step begins. Null is silent, which is the normal case
    -- for a pause.
    speech_text      text,

    created_at       timestamptz NOT NULL,
    updated_at       timestamptz NOT NULL,

    CONSTRAINT sequence_steps_kind_values
        CHECK (kind IN ('action', 'pause')),
    CONSTRAINT sequence_steps_label_not_blank
        CHECK (btrim(label) <> ''),
    CONSTRAINT sequence_steps_label_length
        CHECK (char_length(label) <= 120),
    CONSTRAINT sequence_steps_position_positive
        CHECK (position >= 1),

    -- One second to four hours. A step longer than the longest sensible
    -- window is a mistake rather than an intention.
    CONSTRAINT sequence_steps_duration_range
        CHECK (duration_seconds BETWEEN 1 AND 14400),
    CONSTRAINT sequence_steps_speech_length
        CHECK (speech_text IS NULL OR char_length(speech_text) <= 200)
);

-- Two steps cannot share a place in the chain. Deferrable because reordering
-- is a swap, and a swap passes through a state where two rows hold the same
-- position until the statement finishes.
ALTER TABLE sequence_steps
    ADD CONSTRAINT sequence_steps_position_key
        UNIQUE (sequence_id, position) DEFERRABLE INITIALLY IMMEDIATE;

CREATE INDEX sequence_steps_sequence_id_idx
    ON sequence_steps (sequence_id, position);


-- A run is one press of Activate.
--
-- Kept as rows rather than in the browser so that closing the tab does not
-- lose a running sequence, and so the server can say what should be firing
-- without being told. `started_at` is the origin every step offset is measured
-- from.
CREATE TABLE sequence_runs (
    id           uuid        PRIMARY KEY,
    sequence_id  uuid        NOT NULL REFERENCES sequences (id) ON DELETE CASCADE,
    user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

    started_at   timestamptz NOT NULL,

    -- Set when the run ends, by whichever route. Null means running.
    ended_at     timestamptz,

    --   completed  reached the end of the chain
    --   stopped    deactivated by hand before the end
    ended_reason text,

    CONSTRAINT sequence_runs_ended_reason_values
        CHECK (ended_reason IS NULL OR ended_reason IN ('completed', 'stopped')),

    -- A reason without an end, or an end without a reason, is a half-written
    -- row that every reader then has to interpret.
    CONSTRAINT sequence_runs_ended_together
        CHECK ((ended_at IS NULL) = (ended_reason IS NULL)),

    CONSTRAINT sequence_runs_ended_after_started
        CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- At most one run of a given sequence going at a time. A partial unique index
-- rather than application logic, because "activate" arriving twice - a double
-- click, two tabs - is the ordinary case and not an unlikely one.
CREATE UNIQUE INDEX sequence_runs_one_active_per_sequence
    ON sequence_runs (sequence_id)
    WHERE ended_at IS NULL;

CREATE INDEX sequence_runs_user_active_idx
    ON sequence_runs (user_id)
    WHERE ended_at IS NULL;
