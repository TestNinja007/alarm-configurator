-- Repeating within a day.
--
-- The rule column still decides which DAYS an alarm falls on. These three
-- columns decide which TIMES within each of those days, so "every 5 minutes
-- between 09:00 and 17:00, on weekdays" is a weekly rule plus a window.
--
-- end_time_of_day is not the same thing as end_date: the first closes the
-- window each day, the second ends the series altogether.

ALTER TABLE alarms
    ADD COLUMN end_time_of_day text,
    ADD COLUMN repeat_every    integer,
    ADD COLUMN repeat_unit     text;

ALTER TABLE alarms
    -- Same shape as time_of_day (R-11).
    ADD CONSTRAINT alarms_end_time_of_day_format
        CHECK (end_time_of_day IS NULL OR end_time_of_day ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),

    ADD CONSTRAINT alarms_repeat_unit_values
        CHECK (repeat_unit IS NULL OR repeat_unit IN ('minutes', 'hours')),

    -- One occurrence a minute for a full day is the ceiling; anything denser
    -- would make the conflict check and the summary counts unreasonable.
    ADD CONSTRAINT alarms_repeat_every_range
        CHECK (repeat_every IS NULL OR repeat_every BETWEEN 1 AND 1440),

    -- The three are meaningless apart, so they arrive together or not at all.
    ADD CONSTRAINT alarms_repeat_fields_together
        CHECK (
            (end_time_of_day IS NULL AND repeat_every IS NULL AND repeat_unit IS NULL)
            OR
            (end_time_of_day IS NOT NULL AND repeat_every IS NOT NULL AND repeat_unit IS NOT NULL)
        ),

    -- The window must run forwards. It does not wrap past midnight: a window
    -- that crossed days would make "which day is this occurrence on" ambiguous
    -- for every rule above it.
    ADD CONSTRAINT alarms_repeat_window_forward
        CHECK (end_time_of_day IS NULL OR end_time_of_day > time_of_day);
