-- Server-side state that the awkward conditions depend on.

-- A-03: one in-progress create wizard per user. The payload is whatever the
-- wizard has collected so far, which is by definition incomplete, so it is
-- stored as jsonb rather than as columns that would all have to be nullable.
CREATE TABLE alarm_drafts (
    user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    step       integer     NOT NULL DEFAULT 1,
    payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    CONSTRAINT alarm_drafts_step_range CHECK (step BETWEEN 1 AND 4)
);

-- A-04: the last folder filter and sort order, reapplied at next sign-in.
CREATE TABLE ui_state (
    user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    folder_id  uuid        REFERENCES folders (id) ON DELETE SET NULL,
    sort       text,
    enabled    boolean,
    updated_at timestamptz NOT NULL,
    CONSTRAINT ui_state_sort_values CHECK (sort IS NULL OR sort IN ('name', 'created', 'next'))
);
