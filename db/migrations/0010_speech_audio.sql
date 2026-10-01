-- Generated speech audio.
--
-- Keyed by a hash of provider, voice and the exact words, so the same sentence
-- is only ever paid for once. A provider's free tier is measured in characters
-- a month, and previewing a message while editing it would otherwise burn
-- through one in an afternoon.
--
-- The bytes live here rather than on disk because the application's disk is
-- ephemeral: a redeploy would throw the cache away and the next preview would
-- pay for everything again.

CREATE TABLE speech_audio (
    -- sha256 of provider + voice + text.
    id           text        PRIMARY KEY,
    provider     text        NOT NULL,
    voice        text        NOT NULL,
    -- Kept for debugging and for knowing what was charged for.
    text         text        NOT NULL,
    content_type text        NOT NULL,
    bytes        bytea       NOT NULL,
    created_at   timestamptz NOT NULL,
    -- Touched on every hit, so unused entries can be identified later.
    last_used_at timestamptz NOT NULL
);

CREATE INDEX speech_audio_last_used_idx ON speech_audio (last_used_at);
