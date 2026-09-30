-- Password reset codes.
--
-- Deliberately a separate table from email_verifications rather than a shared
-- one with a "purpose" column: the two have different lifetimes and different
-- consequences, and keeping them apart means a verification code can never be
-- accepted as a reset code by accident.

CREATE TABLE password_resets (
    user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- Stored in the clear for the same reason as a verification code: the
    -- application must be able to show it back on a sandbox with no mail
    -- provider, and a test hook must be able to read it. It is short-lived and
    -- single-use.
    code       text        NOT NULL,
    attempts   integer     NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT password_resets_code_format CHECK (code ~ '^[0-9]{6}$')
);
