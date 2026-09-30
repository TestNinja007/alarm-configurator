-- An optional time of day on the series end.
--
-- Until now end_date meant "through the end of that day". With end_time the
-- series can stop at a precise instant instead: 2026-10-15 at 17:00.
--
-- This is a different thing from end_time_of_day, which closes the repeat
-- window on EVERY day. This one ends the series once.

ALTER TABLE alarms ADD COLUMN end_time text;

ALTER TABLE alarms
    ADD CONSTRAINT alarms_end_time_format
        CHECK (end_time IS NULL OR end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

    -- A time with no date has nothing to attach to.
    ADD CONSTRAINT alarms_end_time_needs_date
        CHECK (end_time IS NULL OR end_date IS NOT NULL);
