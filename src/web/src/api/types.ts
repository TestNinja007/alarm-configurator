export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type Rule =
  | { type: 'once' }
  | { type: 'daily' }
  | { type: 'weekly'; byWeekday: Weekday[] }
  | { type: 'monthly_day'; dayOfMonth: number }
  | { type: 'monthly_nth'; nth: 1 | 2 | 3 | 4 | -1; weekday: Weekday }
  | { type: 'interval'; every: number; unit: 'days' | 'weeks' | 'months' };

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  user: User;
  csrfToken: string;
}

export interface Folder {
  id: string;
  name: string;
  alarmCount: number;
  enabledCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Alarm {
  id: string;
  folderId: string;
  name: string;
  note: string | null;
  enabled: boolean;
  timeOfDay: string;
  timezone: string;
  startDate: string;
  endDate: string | null;
  endAfterOccurrences: number | null;
  rule: Rule;
  createdAt: string;
  updatedAt: string;
}

export interface AlarmList {
  items: Alarm[];
  total: number;
  page: number;
  pageSize: number;
}

export type AlarmSort = 'name' | 'created' | 'next';

/** Renders a rule as the short phrase shown in the list's Repeats column. */
export function describeRule(rule: Rule): string {
  switch (rule.type) {
    case 'once':
      return 'Once';
    case 'daily':
      return 'Every day';
    case 'weekly':
      return `Weekly on ${rule.byWeekday.join(', ')}`;
    case 'monthly_day':
      return `Monthly on day ${rule.dayOfMonth}`;
    case 'monthly_nth': {
      const position =
        rule.nth === -1 ? 'last' : (['', '1st', '2nd', '3rd', '4th'][rule.nth] ?? `${rule.nth}`);
      return `Monthly on the ${position} ${rule.weekday}`;
    }
    case 'interval':
      return `Every ${rule.every} ${rule.every === 1 ? rule.unit.replace(/s$/, '') : rule.unit}`;
  }
}
