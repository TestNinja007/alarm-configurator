import { DateTime } from 'luxon';
import { type FieldError, validationError } from '../errors.js';
import { MAX_PER_DAY, stepSeconds } from '../recurrence/engine.js';

export const DEFAULT_TIMEZONE = 'America/Toronto';

/** R-12: the timezone must be a real IANA name. */
export function isValidTimezone(timezone: string): boolean {
  return DateTime.local().setZone(timezone).isValid;
}

/** Seconds since midnight, from an HH:mm string. */
function toSeconds(timeOfDay: string): number {
  const [hour, minute] = timeOfDay.split(':');
  return (Number.parseInt(hour ?? '', 10) * 60 + Number.parseInt(minute ?? '', 10)) * 60;
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
  endTime?: string | null;
  endAfterOccurrences?: number | null;
  speechText?: string | null;
  speechVoice?: 'male' | 'female' | null;
  endTimeOfDay?: string | null;
  repeatEvery?: number | null;
  repeatUnit?: 'seconds' | 'minutes' | 'hours' | null;
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

  // A time with no date has nothing to attach to.
  if (input.endTime != null && input.endDate == null) {
    fields.push({
      field: 'endTime',
      code: 'needs_date',
      message: 'Choose an end date as well as an end time.',
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

  // A voice with nothing to say is meaningless.
  if (input.speechVoice != null && !input.speechText?.trim()) {
    fields.push({
      field: 'speechText',
      code: 'needs_text',
      message: 'Write what the alarm should say, or clear the voice.',
    });
  }

  if (input.speechText != null && input.speechText.trim().length === 0) {
    fields.push({
      field: 'speechText',
      code: 'blank',
      message: 'Write something to say, or leave it empty entirely.',
    });
  }

  // The within-day window: three fields that only mean anything together.
  const windowParts = [input.endTimeOfDay, input.repeatEvery, input.repeatUnit];
  const supplied = windowParts.filter((part) => part !== undefined && part !== null).length;

  if (supplied > 0 && supplied < windowParts.length) {
    fields.push({
      field: 'repeatEvery',
      code: 'incomplete_window',
      message:
        'To repeat within a day, give all of endTimeOfDay, repeatEvery and repeatUnit.',
    });
  }

  if (supplied === windowParts.length && input.endTimeOfDay) {
    const start = toSeconds(input.timeOfDay);
    const end = toSeconds(input.endTimeOfDay);

    if (end <= start) {
      // The window does not wrap past midnight: one that did would make it
      // ambiguous which day an occurrence belonged to.
      fields.push({
        field: 'endTimeOfDay',
        code: 'not_after_start',
        message: 'The end of the window must be later in the day than the start.',
      });
    } else if (input.repeatEvery && input.repeatUnit) {
      // Density is bounded by what R-08 can afford to compare across ninety
      // days, so a short interval buys a short window and vice versa.
      const step = stepSeconds(input.repeatEvery, input.repeatUnit);
      const perDay = Math.floor((end - start) / step) + 1;

      if (perDay > MAX_PER_DAY) {
        // Floor rather than round, or a window of 9h 59m 50s reports as "9h 60m".
        const widest = step * (MAX_PER_DAY - 1);
        const hours = Math.floor(widest / 3600);
        const minutes = Math.floor((widest % 3600) / 60);
        fields.push({
          field: 'endTimeOfDay',
          code: 'window_too_dense',
          message:
            `That window would fire ${perDay} times a day; the most is ${MAX_PER_DAY}. ` +
            `At this interval the window can be at most ${hours}h ${minutes}m.`,
        });
      }
    }
  }

  if (fields.length > 0) throw validationError(fields);

  return { timezone };
}
