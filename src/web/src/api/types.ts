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

export interface Occurrence {
  utc: string;
  local: string;
}

/** The schedule half of an alarm, which is all POST /alarms/preview needs. */
export interface PreviewRequest {
  timeOfDay: string;
  timezone?: string;
  startDate: string;
  endDate?: string | null;
  endAfterOccurrences?: number | null;
  rule: Rule;
  from?: string;
}

export interface ConflictPair {
  alarmAId: string;
  alarmAName: string;
  alarmBId: string;
  alarmBName: string;
  firstUtc: string;
  collisionCount: number;
}

export interface FolderSummary {
  alarmCount: number;
  enabledCount: number;
  occurrencesNext7Days: number;
  nextOccurrence: Occurrence | null;
}

export interface AlarmDraft {
  step: number;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface UiState {
  folderId: string | null;
  sort: AlarmSort | null;
  enabled: boolean | null;
  updatedAt: string | null;
}

/** Registration's answer: the account exists but is not usable yet. */
export interface PendingVerification {
  email: string;
  verificationRequired: boolean;
  expiresAt: string;
  /** Present only where the server is not really sending mail. */
  code?: string;
}
