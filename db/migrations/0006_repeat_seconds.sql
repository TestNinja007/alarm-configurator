-- Seconds as a repeat unit.
--
-- The density ceiling is expressed in the application rather than here,
-- because it depends on the window length as well as the unit: at most 3,600
-- occurrences a day, which is every second for an hour, every ten seconds for
-- ten hours, or every minute for a full day.

ALTER TABLE alarms DROP CONSTRAINT alarms_repeat_unit_values;

ALTER TABLE alarms
    ADD CONSTRAINT alarms_repeat_unit_values
        CHECK (repeat_unit IS NULL OR repeat_unit IN ('seconds', 'minutes', 'hours'));
