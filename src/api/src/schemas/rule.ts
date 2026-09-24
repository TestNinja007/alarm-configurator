import { Type, type Static } from '@sinclair/typebox';

export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

// An enum rather than a union of literals: a union makes Ajv report one error
// per branch, so a single bad weekday would arrive as eight field errors.
const WeekdaySchema = Type.Unsafe<Weekday>({
  type: 'string',
  enum: [...WEEKDAYS],
});

export const OnceRuleSchema = Type.Object({ type: Type.Literal('once') });

export const DailyRuleSchema = Type.Object({ type: Type.Literal('daily') });

export const WeeklyRuleSchema = Type.Object({
  type: Type.Literal('weekly'),
  // R-03: an empty list is rejected; duplicates are de-duplicated, not rejected,
  // so uniqueItems is deliberately not set here.
  byWeekday: Type.Array(WeekdaySchema, { minItems: 1, maxItems: 7 }),
});

export const MonthlyDayRuleSchema = Type.Object({
  type: Type.Literal('monthly_day'),
  dayOfMonth: Type.Integer({ minimum: 1, maximum: 31 }),
});

export const MonthlyNthRuleSchema = Type.Object({
  type: Type.Literal('monthly_nth'),
  // R-05: 1..4 and -1 only. 5 is absent because a fifth weekday may not exist.
  nth: Type.Unsafe<1 | 2 | 3 | 4 | -1>({ type: 'integer', enum: [1, 2, 3, 4, -1] }),
  weekday: WeekdaySchema,
});

export const IntervalRuleSchema = Type.Object({
  type: Type.Literal('interval'),
  // R-02
  every: Type.Integer({ minimum: 1, maximum: 365 }),
  unit: Type.Union([Type.Literal('days'), Type.Literal('weeks'), Type.Literal('months')]),
});

/**
 * A discriminated union rather than a bare anyOf. Without the discriminator
 * Ajv reports every branch's failures at once, so "every must be <= 365" would
 * arrive buried among six irrelevant complaints about missing properties from
 * the other rule types. With it, only the branch named by `type` is checked and
 * the client gets exactly one field error (A-02). It also gives the OpenAPI
 * document a real discriminator.
 */
export const RuleSchema = Type.Unsafe<
  | Static<typeof OnceRuleSchema>
  | Static<typeof DailyRuleSchema>
  | Static<typeof WeeklyRuleSchema>
  | Static<typeof MonthlyDayRuleSchema>
  | Static<typeof MonthlyNthRuleSchema>
  | Static<typeof IntervalRuleSchema>
>({
  type: 'object',
  oneOf: [
    OnceRuleSchema,
    DailyRuleSchema,
    WeeklyRuleSchema,
    MonthlyDayRuleSchema,
    MonthlyNthRuleSchema,
    IntervalRuleSchema,
  ],
  discriminator: { propertyName: 'type' },
});

export type Rule = Static<typeof RuleSchema>;
export type WeeklyRule = Static<typeof WeeklyRuleSchema>;
export type MonthlyDayRule = Static<typeof MonthlyDayRuleSchema>;
export type MonthlyNthRule = Static<typeof MonthlyNthRuleSchema>;
export type IntervalRule = Static<typeof IntervalRuleSchema>;

/**
 * R-03: duplicate weekdays are de-duplicated rather than rejected. The stored
 * list is also sorted into MO..SU order so equal rules compare equal.
 */
export function normaliseRule(rule: Rule): Rule {
  if (rule.type !== 'weekly') return rule;
  const seen = new Set(rule.byWeekday);
  return { type: 'weekly', byWeekday: WEEKDAYS.filter((day) => seen.has(day)) };
}
