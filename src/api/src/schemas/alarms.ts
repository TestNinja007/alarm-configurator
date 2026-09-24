import { Type, type Static } from '@sinclair/typebox';
import { TimestampSchema, UuidSchema } from './common.js';
import { RuleSchema } from './rule.js';

/** R-11: 24-hour HH:mm, 00:00 through 23:59. 24:00 does not match. */
export const TimeOfDaySchema = Type.String({
  pattern: '^([01][0-9]|2[0-3]):[0-5][0-9]$',
  examples: ['07:30', '23:59'],
});

// Character classes rather than \d, so the pattern survives being read as a
// plain string by both Ajv and the OpenAPI document.
export const DateOnlySchema = Type.String({
  pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
  examples: ['2026-06-15'],
});

export const AlarmSchema = Type.Object(
  {
    id: UuidSchema,
    folderId: UuidSchema,
    name: Type.String(),
    note: Type.Union([Type.String(), Type.Null()]),
    enabled: Type.Boolean(),
    timeOfDay: TimeOfDaySchema,
    timezone: Type.String(),
    startDate: DateOnlySchema,
    endDate: Type.Union([DateOnlySchema, Type.Null()]),
    endAfterOccurrences: Type.Union([Type.Integer(), Type.Null()]),
    rule: RuleSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  }
);
export type Alarm = Static<typeof AlarmSchema>;

/** The schedule half of an alarm, shared by create, update and preview. */
const scheduleProperties = {
  timeOfDay: TimeOfDaySchema,
  timezone: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  startDate: DateOnlySchema,
  endDate: Type.Optional(Type.Union([DateOnlySchema, Type.Null()])),
  endAfterOccurrences: Type.Optional(
    Type.Union([Type.Integer({ minimum: 1, maximum: 1000 }), Type.Null()]),
  ),
  rule: RuleSchema,
};

export const CreateAlarmBodySchema = Type.Object(
  {
    folderId: UuidSchema,
    name: Type.String({ minLength: 1, maxLength: 80 }),
    note: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
    enabled: Type.Optional(Type.Boolean()),
    ...scheduleProperties,
  },
  { additionalProperties: false }
);
export type CreateAlarmBody = Static<typeof CreateAlarmBodySchema>;

/** Updates replace the alarm wholesale; enable/disable has its own routes. */
export const UpdateAlarmBodySchema = Type.Object(
  {
    folderId: UuidSchema,
    name: Type.String({ minLength: 1, maxLength: 80 }),
    note: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
    ...scheduleProperties,
  },
  { additionalProperties: false }
);
export type UpdateAlarmBody = Static<typeof UpdateAlarmBodySchema>;

export const ListAlarmsQuerySchema = Type.Object(
  {
    folderId: Type.Optional(UuidSchema),
    enabled: Type.Optional(Type.Boolean()),
    q: Type.Optional(Type.String({ maxLength: 100 })),
    sort: Type.Optional(
      Type.Union([Type.Literal('name'), Type.Literal('created'), Type.Literal('next')]),
    ),
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  },
  { additionalProperties: false }
);
export type ListAlarmsQuery = Static<typeof ListAlarmsQuerySchema>;

export const AlarmListSchema = Type.Object({
  items: Type.Array(AlarmSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});

export const OccurrenceSchema = Type.Object({
  utc: Type.String({ examples: ['2026-10-04T13:30:00Z'] }),
  local: Type.String({ examples: ['2026-10-04T09:30:00-04:00'] }),
});

export const OccurrenceListSchema = Type.Object({ items: Type.Array(OccurrenceSchema) });

/**
 * Preview takes an unsaved alarm: only the schedule matters, so folderId and
 * name are neither required nor consulted. Nothing is persisted and neither
 * R-08 nor R-09 is evaluated.
 */
export const PreviewBodySchema = Type.Object(
  {
    ...scheduleProperties,
    from: Type.Optional(Type.String({ format: 'date-time' })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 10 })),
  },
  { additionalProperties: false },
);
export type PreviewBody = Static<typeof PreviewBodySchema>;

export const OccurrencesQuerySchema = Type.Object(
  {
    from: Type.Optional(Type.String({ format: 'date-time' })),
    to: Type.Optional(Type.String({ format: 'date-time' })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 10 })),
  },
  { additionalProperties: false },
);
export type OccurrencesQuery = Static<typeof OccurrencesQuerySchema>;

export const FolderSummarySchema = Type.Object({
  alarmCount: Type.Integer(),
  enabledCount: Type.Integer(),
  occurrencesNext7Days: Type.Integer(),
  nextOccurrence: Type.Union([OccurrenceSchema, Type.Null()]),
});

export const ConflictPairSchema = Type.Object({
  alarmAId: UuidSchema,
  alarmAName: Type.String(),
  alarmBId: UuidSchema,
  alarmBName: Type.String(),
  firstUtc: Type.String(),
  collisionCount: Type.Integer(),
});

export const ConflictListSchema = Type.Object({
  items: Type.Array(ConflictPairSchema),
  windowDays: Type.Integer(),
});

export const BulkEnableBodySchema = Type.Object(
  {
    ids: Type.Array(UuidSchema, { minItems: 1, maxItems: 100 }),
    enabled: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type BulkEnableBody = Static<typeof BulkEnableBodySchema>;
