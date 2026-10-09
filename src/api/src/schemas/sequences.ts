import { Type, type Static } from '@sinclair/typebox';

/**
 * Alarm sequences, over the wire.
 *
 * Durations are seconds throughout. The examples this was built from run from
 * five seconds to eight hours, and one unit that covers both beats a
 * value-and-unit pair that every caller has to reassemble.
 */

export const StepKindSchema = Type.Union([Type.Literal('action'), Type.Literal('pause')]);

export const SequenceStepSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    position: Type.Integer({ minimum: 1 }),
    kind: StepKindSchema,
    label: Type.String({ minLength: 1, maxLength: 120 }),
    durationSeconds: Type.Integer({ minimum: 1, maximum: 14400 }),
    speechText: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
  },
  { $id: 'SequenceStep', additionalProperties: false },
);

/** A step as submitted: no id, and position comes from the array order. */
export const StepInputSchema = Type.Object(
  {
    kind: Type.Optional(StepKindSchema),
    label: Type.String({ minLength: 1, maxLength: 120 }),
    durationSeconds: Type.Integer({ minimum: 1, maximum: 14400 }),
    speechText: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
  },
  { additionalProperties: false },
);

export const RepeatModeSchema = Type.Union([
  Type.Literal('once'),
  Type.Literal('duration'),
  Type.Literal('count'),
]);

export const SequenceRunSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    startedAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    endedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    endedReason: Type.Union([
      Type.Literal('completed'),
      Type.Literal('stopped'),
      Type.Null(),
    ]),
  },
  { $id: 'SequenceRun', additionalProperties: false },
);

export const SequenceSchema = Type.Object(
  {
    id: Type.String({ format: 'uuid' }),
    name: Type.String(),
    repeatMode: RepeatModeSchema,
    repeatSeconds: Type.Union([Type.Integer(), Type.Null()]),
    repeatCount: Type.Union([Type.Integer(), Type.Null()]),
    closingText: Type.Union([Type.String(), Type.Null()]),
    steps: Type.Array(SequenceStepSchema),
    /** One pass through the chain. */
    cycleSeconds: Type.Integer(),
    /** Activation to finish, which for `duration` is the window asked for. */
    runSeconds: Type.Integer(),
    /** The run in progress, or null when it is not running. */
    activeRun: Type.Union([SequenceRunSchema, Type.Null()]),
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
  },
  { $id: 'Sequence', additionalProperties: false },
);

export const SequenceListSchema = Type.Object(
  { items: Type.Array(SequenceSchema) },
  { additionalProperties: false },
);

/**
 * `repeatSeconds` belongs to `duration` and `repeatCount` to `count`, and the
 * database refuses a row that mixes them. The check also happens in the
 * handler so the refusal is a 422 naming the field rather than a 500 from a
 * constraint.
 */
export const CreateSequenceBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    repeatMode: Type.Optional(RepeatModeSchema),
    repeatSeconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86400 })),
    repeatCount: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
    closingText: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
    steps: Type.Array(StepInputSchema, { minItems: 1, maxItems: 100 }),
  },
  { additionalProperties: false },
);

export const UpdateSequenceBodySchema = CreateSequenceBodySchema;

export type CreateSequenceBody = Static<typeof CreateSequenceBodySchema>;
export type StepInput = Static<typeof StepInputSchema>;

/**
 * A sequence step due soon, for the browser's scheduler.
 *
 * Deliberately not squeezed into the alarm-shaped occurrence: a step has no
 * timezone, no folder and no position in a day, and filling those in with
 * invented values would make every reader of that type wonder which fields it
 * could trust. Two kinds of thing, one scheduler.
 */
export const UpcomingStepSchema = Type.Object(
  {
    sequenceId: Type.String({ format: 'uuid' }),
    sequenceName: Type.String(),
    runId: Type.String({ format: 'uuid' }),
    stepId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    kind: Type.Union([StepKindSchema, Type.Literal('closing')]),
    label: Type.String(),
    speechText: Type.Union([Type.String(), Type.Null()]),
    cycle: Type.Integer(),
    position: Type.Integer(),
    offsetSeconds: Type.Integer(),
    durationSeconds: Type.Integer(),
    utc: Type.String(),
  },
  { $id: 'UpcomingStep', additionalProperties: false },
);
