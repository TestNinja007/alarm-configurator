import type { Alarm } from '../schemas/alarms.js';
import type { Rule } from '../schemas/rule.js';
import type { Folder } from '../schemas/folders.js';

export interface AlarmRow {
  id: string;
  folder_id: string;
  name: string;
  note: string | null;
  enabled: boolean;
  time_of_day: string;
  timezone: string;
  start_date: string;
  end_date: string | null;
  end_after_occurrences: number | null;
  rule: Rule;
  created_at: Date;
  updated_at: Date;
}

export interface FolderRow {
  id: string;
  name: string;
  alarm_count: number;
  enabled_count: number;
  created_at: Date;
  updated_at: Date;
}

export function toAlarm(row: AlarmRow): Alarm {
  return {
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    note: row.note,
    enabled: row.enabled,
    timeOfDay: row.time_of_day,
    timezone: row.timezone,
    startDate: row.start_date,
    endDate: row.end_date,
    endAfterOccurrences: row.end_after_occurrences,
    rule: row.rule,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    alarmCount: row.alarm_count,
    enabledCount: row.enabled_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
