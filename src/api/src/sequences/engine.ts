/**
 * Expanding a sequence into the instants its steps fire at.
 *
 * The counterpart to the recurrence engine, and deliberately a separate one.
 * That engine answers "when does 07:00 next happen in Europe/London", which
 * needs a calendar, a zone and a daylight-saving rule. This answers "what
 * happens 1,860 seconds after somebody pressed a button", which needs none of
 * those: an offset in seconds added to an instant is the same arithmetic
 * everywhere on earth, and no clock change can move it.
 *
 * Pure, so the whole mechanism can be tested without a database, a browser or
 * a clock. Everything it needs is in its arguments.
 */

/** A step as stored, with the generated columns left out. */
export interface SequenceStep {
  id: string;
  position: number;
  kind: 'action' | 'pause';
  label: string;
  durationSeconds: number;
  speechText: string | null;
}

export type RepeatMode = 'once' | 'duration' | 'count';

export interface SequenceSpec {
  id: string;
  name: string;
  repeatMode: RepeatMode;
  /** Seconds from activation to stop after. Only for `duration`. */
  repeatSeconds: number | null;
  /** How many times to run the chain through. Only for `count`. */
  repeatCount: number | null;
  /** Spoken once at the end, before the run closes. */
  closingText: string | null;
  steps: SequenceStep[];
}

export interface StepOccurrence {
  sequenceId: string;
  sequenceName: string;
  /** Null on the closing announcement, which is not one of the steps. */
  stepId: string | null;
  /** 1-based. Which time through the chain this is. */
  cycle: number;
  /** 1-based position within the cycle; 0 on the closing announcement. */
  position: number;
  kind: 'action' | 'pause' | 'closing';
  label: string;
  speechText: string | null;
  /** Seconds after the run started. */
  offsetSeconds: number;
  /** How long this step lasts. Zero on the closing announcement. */
  durationSeconds: number;
  /** The instant it fires, as an ISO string in UTC. */
  utc: string;
}

/**
 * The ceiling on how many instants one run may produce.
 *
 * Every second for eight hours is 28,800 steps, which is a legitimate thing to
 * ask for and an unreasonable thing to hand to a browser in one response. The
 * window limit normally keeps this far out of reach; this is the backstop for
 * when it does not, and it truncates rather than throwing, because a run that
 * is longer than we will enumerate is still a valid run.
 */
export const MAX_STEP_OCCURRENCES = 2000;

export interface StepWindow {
  /** Only occurrences at or after this instant. */
  from: Date;
  /** Only occurrences at or before this instant. */
  to?: Date;
  limit?: number;
}

/** Total length of one pass through the chain, in seconds. */
export function cycleSeconds(steps: SequenceStep[]): number {
  return steps.reduce((total, step) => total + step.durationSeconds, 0);
}

/**
 * When the run ends, as an offset in seconds from activation.
 *
 * For `duration` this is the window the person asked for, whether or not it
 * lands on a cycle boundary - "for the next eight hours" means eight hours,
 * not eight hours rounded up to the next stretch.
 */
export function runLengthSeconds(spec: SequenceSpec): number {
  const cycle = cycleSeconds(spec.steps);
  if (cycle === 0) return 0;

  switch (spec.repeatMode) {
    case 'once':
      return cycle;
    case 'count':
      return cycle * Math.max(1, spec.repeatCount ?? 1);
    case 'duration':
      return Math.max(0, spec.repeatSeconds ?? 0);
  }
}

/** The instant a run would end, given when it started. */
export function runEndsAt(spec: SequenceSpec, startedAt: Date): Date {
  return new Date(startedAt.getTime() + runLengthSeconds(spec) * 1000);
}

function ordered(steps: SequenceStep[]): SequenceStep[] {
  return [...steps].sort((a, b) => a.position - b.position);
}

/**
 * Every step instant a run produces, in order.
 *
 * `window.from` filters rather than reschedules: the offsets are always
 * measured from `startedAt`, so asking for the next ten minutes of a run that
 * began an hour ago returns the steps due in that ten minutes with the offsets
 * they have always had. A step is in or out; it is never moved.
 */
export function stepOccurrencesFor(
  spec: SequenceSpec,
  startedAt: Date,
  window: StepWindow,
): StepOccurrence[] {
  const steps = ordered(spec.steps);
  const cycle = cycleSeconds(steps);

  // A sequence with no steps, or whose steps somehow total nothing, has
  // nothing to fire. Returning early also keeps the loop below from spinning
  // forever on a zero-length cycle.
  if (steps.length === 0 || cycle === 0) return [];

  const limit = Math.min(window.limit ?? MAX_STEP_OCCURRENCES, MAX_STEP_OCCURRENCES);
  const runLength = runLengthSeconds(spec);
  const origin = startedAt.getTime();
  const fromOffset = (window.from.getTime() - origin) / 1000;
  const toOffset = window.to ? (window.to.getTime() - origin) / 1000 : Number.POSITIVE_INFINITY;

  const found: StepOccurrence[] = [];
  const maxCycles =
    spec.repeatMode === 'count'
      ? Math.max(1, spec.repeatCount ?? 1)
      : spec.repeatMode === 'once'
        ? 1
        : // `duration`: however many cycles fit, plus the one straddling the
          // end, whose steps are filtered individually below.
          Math.ceil(runLength / cycle);

  for (let cycleIndex = 0; cycleIndex < maxCycles; cycleIndex += 1) {
    let offset = cycleIndex * cycle;

    for (const step of steps) {
      const at = offset;
      offset += step.durationSeconds;

      /*
       * A step fires only if it starts strictly inside the run. On the last
       * cycle of a `duration` sequence this is what stops a stretch being
       * announced after the window has closed - "every 45 minutes for eight
       * hours" should not produce a reminder at eight hours and five minutes.
       */
      if (spec.repeatMode === 'duration' && at >= runLength) break;

      if (at < fromOffset || at > toOffset) continue;

      found.push({
        sequenceId: spec.id,
        sequenceName: spec.name,
        stepId: step.id,
        cycle: cycleIndex + 1,
        position: step.position,
        kind: step.kind,
        label: step.label,
        speechText: step.speechText,
        offsetSeconds: at,
        durationSeconds: step.durationSeconds,
        utc: new Date(origin + at * 1000).toISOString(),
      });

      if (found.length >= limit) return found;
    }
  }

  /*
   * The closing announcement, at the moment the run ends.
   *
   * Not one of the steps: it has no duration, it happens once however many
   * cycles there were, and it is the thing that tells somebody the run is over
   * rather than merely quiet.
   */
  if (spec.closingText && runLength >= 0) {
    if (runLength >= fromOffset && runLength <= toOffset && found.length < limit) {
      found.push({
        sequenceId: spec.id,
        sequenceName: spec.name,
        stepId: null,
        cycle: maxCycles,
        position: 0,
        kind: 'closing',
        label: 'Finished',
        speechText: spec.closingText,
        offsetSeconds: runLength,
        durationSeconds: 0,
        utc: new Date(origin + runLength * 1000).toISOString(),
      });
    }
  }

  return found;
}

/** The step due next at or after `from`, or undefined once the run is over. */
export function nextStep(
  spec: SequenceSpec,
  startedAt: Date,
  from: Date,
): StepOccurrence | undefined {
  return stepOccurrencesFor(spec, startedAt, { from, limit: 1 })[0];
}

/**
 * Whether a run that began at `startedAt` is finished as of `now`.
 *
 * The server's answer to "should this still be running", so a run is not left
 * active because the browser that started it was closed before the end.
 */
export function hasFinished(spec: SequenceSpec, startedAt: Date, now: Date): boolean {
  return now.getTime() >= runEndsAt(spec, startedAt).getTime();
}
