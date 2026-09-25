-- Email verification.
--
-- Accounts created through registration start unverified and cannot sign in
-- until a code is entered. The seeded accounts are verified outright: they
-- exist to be signed into, and there is no inbox for them.

ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

-- Everything that already exists predates verification and stays usable.
UPDATE users SET email_verified_at = created_at;

CREATE TABLE email_verifications (
    user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- Stored in the clear on purpose. The application cannot send email, so a
    -- sandbox instance has to be able to show the code back to the person who
    -- asked for it, and a test hook has to be able to read it. It is a
    -- short-lived, single-purpose value, not a credential.
    code       text        NOT NULL,
    attempts   integer     NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL,
    CONSTRAINT email_verifications_code_format CHECK (code ~ '^[0-9]{6}$')
);
