-- The speech service's cache, in the speech service's own schema.
--
-- The same shape the table had in the main API's database before the service
-- was extracted. It moved rather than changed: what is different is who owns
-- it. Nothing in the main API's schema references it, and nothing here
-- references the main API's, which is what lets the two be deployed and
-- migrated independently.
--
-- `search_path` is set to this service's schema on every connection, so these
-- unqualified names land there.

CREATE TABLE speech_audio (
    -- sha256 of provider, voice and words: the same request always lands on
    -- the same row, which is what makes the cache a cache.
    id           text        PRIMARY KEY,
    provider     text        NOT NULL,
    voice        text        NOT NULL,
    text         text        NOT NULL,
    content_type text        NOT NULL,
    bytes        bytea       NOT NULL,
    created_at   timestamptz NOT NULL,
    last_used_at timestamptz NOT NULL,

    CONSTRAINT speech_audio_id_is_a_hash CHECK (id ~ '^[0-9a-f]{64}$'),
    CONSTRAINT speech_audio_voice_values CHECK (voice IN ('male', 'female'))
);

-- For clearing out audio nobody has played in a while.
CREATE INDEX speech_audio_last_used_idx ON speech_audio (last_used_at);
