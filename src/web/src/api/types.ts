export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export type Rule =
  | { type: 'once' }
  | { type: 'daily' }
  | { type: 'weekly'; byWeekday: Weekday[] }
  | { type: 'monthly_day'; dayOfMonth: number }
  | { type: 'monthly_nth'; nth: 1 | 2 | 3 | 4 | -1; weekday: Weekday }
  | { type: 'interval'; every: number; unit: 'days' | 'weeks' | 'months' };

export type Role = 'user' | 'admin';
export type Tier = 'basic' | 'regular' | 'advanced';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  tier: Tier;
}

export interface TierLimits {
  maxFolders: number | null;
  maxAlarmsPerFolder: number | null;
  repeatWithinDay: boolean;
  minRepeatSeconds: number | null;
  generatedSpeech: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  tier: Tier;
  verified: boolean;
  suspended: boolean;
  /** Seeded demonstration accounts, which the UI protects. */
  seeded: boolean;
  folders: number;
  alarms: number;
  createdAt: string;
}

export interface AdminUserList {
  items: AdminUser[];
  /** Published by the API so the UI never hard-codes the limits. */
  tiers: Record<string, TierLimits>;
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
  /** Null while unfiled: made in the moment, sorted into a folder later. */
  folderId: string | null;
  name: string;
  note: string | null;
  enabled: boolean;
  timeOfDay: string;
  timezone: string;
  startDate: string;
  endDate: string | null;
  endTime: string | null;
  endAfterOccurrences: number | null;
  speechText: string | null;
  speechFinalText: string | null;
  speechVoice: 'male' | 'female' | null;
  endTimeOfDay: string | null;
  repeatEvery: number | null;
  repeatUnit: 'seconds' | 'minutes' | 'hours' | null;
  rule: Rule;
  /** Removes itself once it has no occurrence left to fire. */
  selfDestruct: boolean;
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
/** The within-day window, as a phrase to sit alongside the rule. */
export function describeWindow(alarm: {
  timeOfDay: string;
  speechText?: string | null;
  speechFinalText?: string | null;
  speechVoice?: 'male' | 'female' | null;
  endTimeOfDay?: string | null;
  repeatEvery?: number | null;
  repeatUnit?: 'seconds' | 'minutes' | 'hours' | null;
}): string | undefined {
  if (!alarm.endTimeOfDay || !alarm.repeatEvery || !alarm.repeatUnit) return undefined;
  const unit = alarm.repeatEvery === 1 ? alarm.repeatUnit.replace(/s$/, '') : alarm.repeatUnit;
  return `every ${alarm.repeatEvery} ${unit} from ${alarm.timeOfDay} to ${alarm.endTimeOfDay}`;
}

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
  endTime?: string | null;
  endAfterOccurrences?: number | null;
  speechText?: string | null;
  speechFinalText?: string | null;
  speechVoice?: 'male' | 'female' | null;
  endTimeOfDay?: string | null;
  repeatEvery?: number | null;
  repeatUnit?: 'seconds' | 'minutes' | 'hours' | null;
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
  emailSent: boolean;
  expiresAt: string;
  /** Present only where the server is not really sending mail. */
  code?: string;
}

export interface UpcomingOccurrence {
  alarmId: string;
  alarmName: string;
  folderId: string | null;
  folderName: string | null;
  timezone: string;
  note: string | null;
  speechText: string | null;
  speechFinalText: string | null;
  speechVoice: 'male' | 'female' | null;
  indexInDay: number;
  countInDay: number;
  utc: string;
  local: string;
}

export interface UpcomingList {
  items: UpcomingOccurrence[];
  /** The server's idea of now, so a client can measure its own drift. */
  now: string;
  withinMinutes: number;
}

export interface PasswordResetIssued {
  email: string;
  expiresAt: string;
  emailSent: boolean;
  /** Present only where the server is not really sending mail. */
  code?: string;
}
