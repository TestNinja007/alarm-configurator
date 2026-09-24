import { DateTime } from 'luxon';
import { type FieldError, validationError } from '../errors.js';

export const DEFAULT_TIMEZONE = 'America/Toronto';

/** R-12: the timezone must be a real IANA name. */
export function isValidTimezone(timezone: string): boolean {
  return DateTime.local().setZone(timezone).isValid;
}

/** True when the string is a real calendar date, not merely YYYY-MM-DD shaped. */
export function isRealDate(value: string): boolean {
  return DateTime.fromISO(value, { zone: 'utc' }).isValid;
}

export interface ScheduleInput {
  timeOfDay: string;
  timezone?: string | null;
  startDate: string;
  endDate?: string | null;
  endAfterOccurrences?: number | null;
}

/**
 * Cross-field rules that a per-field JSON Schema cannot express. Each failure
 * is attached to the specific field the client should highlight (A-02).
 */
export function validateSchedule(input: ScheduleInput): { timezone: string } {
  const fields: FieldError[] = [];
  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE;

  if (!isValidTimezone(timezone)) {
    fields.push({
      field: 'timezone',
      code: 'invalid_timezone',
      message: `"${timezone}" is not a valid IANA time zone name.`,
    });
  }

  if (!isRealDate(input.startDate)) {
    fields.push({
      field: 'startDate',
      code: 'invalid_date',
      message: 'startDate is not a real calendar date.',
    });
  }

  if (input.endDate != null && !isRealDate(input.endDate)) {
    fields.push({
      field: 'endDate',
      code: 'invalid_date',
      message: 'endDate is not a real calendar date.',
    });
  }

  // R-01: an end before the start is reported on endDate, not on startDate.
  if (
    input.endDate != null &&
    isRealDate(input.endDate) &&
    isRealDate(input.startDate) &&
    input.endDate < input.startDate
  ) {
    fields.push({
      field: 'endDate',
      code: 'before_start',
      message: 'endDate must not be earlier than startDate.',
    });
  }

  // endDate and endAfterOccurrences are mutually exclusive.
  if (input.endDate != null && input.endAfterOccurrences != null) {
    fields.push({
      field: 'endAfterOccurrences',
      code: 'mutually_exclusive',
      message: 'Set either endDate or endAfterOccurrences, not both.',
    });
  }

  if (fields.length > 0) throw validationError(fields);

  return { timezone };
}
