-- Roles and subscription tiers.
--
-- Two independent things, deliberately not one column. A role says what you may
-- administer; a tier says what you may create. Collapsing them would make "an
-- administrator on the basic tier" unrepresentable, and that is a perfectly
-- ordinary account for someone running the service.

ALTER TABLE users
    ADD COLUMN role text NOT NULL DEFAULT 'user',
    ADD COLUMN tier text NOT NULL DEFAULT 'basic',
    -- An account can be suspended without being deleted, which keeps its
    -- folders and alarms intact in case it is restored.
    ADD COLUMN suspended_at timestamptz;

ALTER TABLE users
    ADD CONSTRAINT users_role_values CHECK (role IN ('user', 'admin')),
    ADD CONSTRAINT users_tier_values CHECK (tier IN ('basic', 'regular', 'advanced'));

-- Existing accounts predate tiers and should not suddenly lose what they have,
-- so they start on the most permissive one. New sign-ups default to basic.
UPDATE users SET tier = 'advanced';
