-- Speaking a message when an alarm fires.
--
-- The browser's own speech synthesis does the work, so nothing is stored but
-- the words and a voice preference. No audio is generated or kept.
--
-- The preference is male or female rather than a specific voice because the
-- voices available differ from machine to machine: a voice chosen on one
-- computer may simply not exist on another.

ALTER TABLE alarms
    ADD COLUMN speech_text  text,
    ADD COLUMN speech_voice text;

ALTER TABLE alarms
    ADD CONSTRAINT alarms_speech_text_length
        CHECK (speech_text IS NULL OR char_length(btrim(speech_text)) BETWEEN 1 AND 200),

    ADD CONSTRAINT alarms_speech_voice_values
        CHECK (speech_voice IS NULL OR speech_voice IN ('male', 'female')),

    -- A voice with nothing to say is meaningless.
    ADD CONSTRAINT alarms_speech_voice_needs_text
        CHECK (speech_voice IS NULL OR speech_text IS NOT NULL);
