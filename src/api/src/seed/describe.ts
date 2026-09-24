import type { Rule } from '../schemas/rule.js';

/** Human wording for a rule, used by the docs generator. */
export function describeRuleText(rule: Rule): string {
  switch (rule.type) {
    case 'once':
      return 'once';
    case 'daily':
      return 'every day';
    case 'weekly':
      return `weekly on ${rule.byWeekday.join(', ')}`;
    case 'monthly_day':
      return `monthly on day ${rule.dayOfMonth}`;
    case 'monthly_nth': {
      const position = rule.nth === -1 ? 'last' : ['', '1st', '2nd', '3rd', '4th'][rule.nth];
      return `monthly on the ${position} ${rule.weekday}`;
    }
    case 'interval':
      return `every ${rule.every} ${rule.unit}`;
  }
}
