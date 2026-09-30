/**
 * Turning an alarm's message into what is actually said for one occurrence.
 *
 * An alarm that fires several times a day should not need one message written
 * per repetition — and if it did, changing the repeat interval would silently
 * leave those messages wrong. So the message is a template, and the numbers
 * come from where the occurrence sits in its own day.
 *
 * "This is your {ordinal} of {total} warnings" on an alarm firing three times
 * says first, second, then third, and keeps saying the right thing if it later
 * fires five times.
 */

export interface OccurrencePlacement {
  /** 1-based position within its own day. */
  indexInDay: number;
  /** How many times the alarm fires that day in total. */
  countInDay: number;
}

const ORDINALS = [
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
  'ninth', 'tenth', 'eleventh', 'twelfth',
];

/** "first", "second", … falling back to "13th" once the words run out. */
export function ordinal(n: number): string {
  const word = ORDINALS[n - 1];
  if (word) return word;

  // 11th, 12th and 13th break the otherwise regular pattern.
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;

  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

export const SPEECH_TOKENS = ['{n}', '{ordinal}', '{total}', '{remaining}'] as const;

/**
 * Fills the tokens in a message.
 *
 * Unknown tokens are left exactly as written rather than blanked, so a typo is
 * audible instead of silently swallowing part of the sentence.
 */
export function fillTokens(template: string, placement: OccurrencePlacement): string {
  const remaining = Math.max(0, placement.countInDay - placement.indexInDay);

  return template
    .replaceAll('{n}', String(placement.indexInDay))
    .replaceAll('{ordinal}', ordinal(placement.indexInDay))
    .replaceAll('{total}', String(placement.countInDay))
    .replaceAll('{remaining}', String(remaining));
}

/**
 * What an occurrence says: the closing line on the last of the day when one is
 * set, otherwise the ordinary message. Both are templated.
 */
export function speechFor(
  alarm: { speechText?: string | null; speechFinalText?: string | null },
  placement: OccurrencePlacement,
): string | undefined {
  if (!alarm.speechText?.trim()) return undefined;

  const isLast = placement.indexInDay >= placement.countInDay;
  const template =
    isLast && alarm.speechFinalText?.trim() ? alarm.speechFinalText : alarm.speechText;

  return fillTokens(template.trim(), placement);
}
