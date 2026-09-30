-- Speech that changes with each repetition.
--
-- speech_text is a template spoken on every occurrence; speech_final_text, if
-- present, replaces it on the last occurrence of the day. Between them they
-- cover "first warning, second warning, last warning" without the person
-- having to write one message per repetition, and without the messages needing
-- to be rewritten when the number of repetitions changes.

ALTER TABLE alarms ADD COLUMN speech_final_text text;

ALTER TABLE alarms
    ADD CONSTRAINT alarms_speech_final_text_length
        CHECK (speech_final_text IS NULL OR char_length(btrim(speech_final_text)) BETWEEN 1 AND 200),

    -- A closing line with nothing before it has nothing to close.
    ADD CONSTRAINT alarms_speech_final_needs_text
        CHECK (speech_final_text IS NULL OR speech_text IS NOT NULL);
