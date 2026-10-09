import { describe, expect, it } from 'vitest';
import {
  MAX_STEP_OCCURRENCES,
  cycleSeconds,
  hasFinished,
  nextStep,
  runEndsAt,
  runLengthSeconds,
  stepOccurrencesFor,
  type SequenceSpec,
  type SequenceStep,
} from './engine.js';

/**
 * The sequence engine, against the two sequences it was specified from.
 *
 * Both are worked through step by step rather than checked for a count,
 * because the count is the easiest thing to get right by accident and the
 * ordering is the thing that matters: a chain whose steps are correct but
 * whose offsets drift by one step length is wrong in a way no total reveals.
 */

const START = new Date('2026-10-09T09:00:00.000Z');

function step(
  id: string,
  position: number,
  label: string,
  durationSeconds: number,
  extra: Partial<SequenceStep> = {},
): SequenceStep {
  return {
    id,
    position,
    label,
    durationSeconds,
    kind: 'action',
    speechText: label,
    ...extra,
  };
}

/** Back stretch 30s, pause 10s, hip stretch 30s, pause 10s, leg stretch 5s. */
const MORNING_STRETCH: SequenceSpec = {
  id: 'seq-stretch',
  name: 'Morning stretch',
  repeatMode: 'once',
  repeatSeconds: null,
  repeatCount: null,
  closingText: null,
  steps: [
    step('s1', 1, 'Back stretch', 30),
    step('s2', 2, 'Pause', 10, { kind: 'pause', speechText: null }),
    step('s3', 3, 'Hip stretch', 30),
    step('s4', 4, 'Pause', 10, { kind: 'pause', speechText: null }),
    step('s5', 5, 'Leg stretch', 5),
  ],
};

/** Stand up for a minute, work for 44, for eight hours, then done. */
const STAND_UP: SequenceSpec = {
  id: 'seq-stand',
  name: 'Stand up',
  repeatMode: 'duration',
  repeatSeconds: 8 * 60 * 60,
  repeatCount: null,
  closingText: "You're done for the day",
  steps: [
    step('u1', 1, 'Stand up', 60, { speechText: 'Stand up' }),
    step('u2', 2, 'Back to work', 44 * 60, { speechText: 'Now go back to work' }),
  ],
};

const far = { from: START, to: new Date(START.getTime() + 24 * 60 * 60 * 1000) };

describe('one pass through a chain', () => {
  it('fires each step at the sum of the durations before it', () => {
    const found = stepOccurrencesFor(MORNING_STRETCH, START, far);

    expect(found.map((o) => [o.label, o.offsetSeconds])).toEqual([
      ['Back stretch', 0],
      ['Pause', 30],
      ['Hip stretch', 40],
      ['Pause', 70],
      ['Leg stretch', 80],
    ]);
  });

  it('places the first step at the moment of activation, not one step later', () => {
    // Off-by-one here would mean pressing Activate and waiting thirty seconds
    // in silence, wondering whether it worked.
    const [first] = stepOccurrencesFor(MORNING_STRETCH, START, far);

    expect(first.offsetSeconds).toBe(0);
    expect(first.utc).toBe(START.toISOString());
  });

  it('runs the chain once and does not come round again', () => {
    const found = stepOccurrencesFor(MORNING_STRETCH, START, far);

    expect(found).toHaveLength(5);
    expect(new Set(found.map((o) => o.cycle))).toEqual(new Set([1]));
  });

  it('ends when the last step ends, not when it begins', () => {
    // 30 + 10 + 30 + 10 + 5. The run is over once the leg stretch is done.
    expect(cycleSeconds(MORNING_STRETCH.steps)).toBe(85);
    expect(runLengthSeconds(MORNING_STRETCH)).toBe(85);
    expect(runEndsAt(MORNING_STRETCH, START).toISOString()).toBe('2026-10-09T09:01:25.000Z');
  });

  it('carries the speech for an action and nothing for a pause', () => {
    const found = stepOccurrencesFor(MORNING_STRETCH, START, far);
    const pauses = found.filter((o) => o.kind === 'pause');

    expect(pauses).toHaveLength(2);
    expect(pauses.every((o) => o.speechText === null)).toBe(true);
    expect(found.filter((o) => o.kind === 'action').every((o) => o.speechText)).toBe(true);
  });

  it('reads the chain in position order, however the steps arrive', () => {
    /*
     * Rows come back in whatever order the database gives, which is not
     * necessarily the order of the chain. Sorting on the way in is the only
     * thing that makes the rest of this engine's arithmetic mean anything.
     */
    const shuffled: SequenceSpec = {
      ...MORNING_STRETCH,
      steps: [
        MORNING_STRETCH.steps[3],
        MORNING_STRETCH.steps[0],
        MORNING_STRETCH.steps[4],
        MORNING_STRETCH.steps[1],
        MORNING_STRETCH.steps[2],
      ],
    };

    expect(stepOccurrencesFor(shuffled, START, far).map((o) => o.label)).toEqual(
      stepOccurrencesFor(MORNING_STRETCH, START, far).map((o) => o.label),
    );
  });
});

describe('repeating for a duration', () => {
  it('cycles every 45 minutes', () => {
    const found = stepOccurrencesFor(STAND_UP, START, far).filter((o) => o.kind !== 'closing');

    expect(found.slice(0, 4).map((o) => [o.label, o.offsetSeconds])).toEqual([
      ['Stand up', 0],
      ['Back to work', 60],
      ['Stand up', 2700],
      ['Back to work', 2760],
    ]);
  });

  it('stops at eight hours rather than finishing the cycle it is in', () => {
    /*
     * The clause worth testing. 8 hours is 28,800 seconds and a cycle is
     * 2,700, so ten whole cycles fit with 1,800 seconds left over - enough
     * room for the eleventh "Stand up" at 27,000 and its "Back to work" at
     * 27,060, but not for a twelfth cycle at 29,700.
     *
     * An implementation that ran whole cycles only would stop at 27,000 and
     * lose forty minutes. One that finished the straddling cycle would still
     * be telling somebody to stand up fifteen minutes after they were told
     * they were done.
     */
    const found = stepOccurrencesFor(STAND_UP, START, far).filter((o) => o.kind !== 'closing');
    const last = found[found.length - 1];

    expect(last.offsetSeconds).toBeLessThan(8 * 60 * 60);
    expect(found.every((o) => o.offsetSeconds < 8 * 60 * 60)).toBe(true);
    expect(last.offsetSeconds).toBe(27_060);
  });

  it('speaks the closing line exactly at the end, once', () => {
    const closing = stepOccurrencesFor(STAND_UP, START, far).filter((o) => o.kind === 'closing');

    expect(closing).toHaveLength(1);
    expect(closing[0].speechText).toBe("You're done for the day");
    expect(closing[0].offsetSeconds).toBe(8 * 60 * 60);
    expect(closing[0].utc).toBe('2026-10-09T17:00:00.000Z');
    // It announces rather than occupies: nothing waits on it.
    expect(closing[0].durationSeconds).toBe(0);
    expect(closing[0].stepId).toBeNull();
  });

  it('puts the closing line last', () => {
    const found = stepOccurrencesFor(STAND_UP, START, far);

    expect(found[found.length - 1].kind).toBe('closing');
  });

  it('says the run is over only once the window has passed', () => {
    const justBefore = new Date(START.getTime() + (8 * 60 * 60 - 1) * 1000);
    const exactly = new Date(START.getTime() + 8 * 60 * 60 * 1000);

    expect(hasFinished(STAND_UP, START, justBefore)).toBe(false);
    expect(hasFinished(STAND_UP, START, exactly)).toBe(true);
  });
});

describe('repeating a number of times', () => {
  const thrice: SequenceSpec = {
    ...MORNING_STRETCH,
    repeatMode: 'count',
    repeatCount: 3,
    closingText: 'All three done',
  };

  it('runs the chain that many times and no more', () => {
    const found = stepOccurrencesFor(thrice, START, far).filter((o) => o.kind !== 'closing');

    expect(found).toHaveLength(15);
    expect(found.filter((o) => o.cycle === 3)).toHaveLength(5);
    expect(found.some((o) => o.cycle === 4)).toBe(false);
  });

  it('ends after the last cycle, not after the first', () => {
    expect(runLengthSeconds(thrice)).toBe(85 * 3);
  });
});

describe('the window filters and never reschedules', () => {
  it('returns the steps due inside it, with the offsets they always had', () => {
    /*
     * The run began an hour ago; this asks what is due in the next minute.
     * The answer has to carry the original offsets - a step that is 2,700
     * seconds into the run is still 2,700 seconds in when you ask about it
     * later. Recomputing from `from` would restart the sequence on every poll,
     * which is the obvious bug in a scheduler like this.
     */
    const from = new Date(START.getTime() + 2700 * 1000);
    const to = new Date(from.getTime() + 60 * 1000);

    const found = stepOccurrencesFor(STAND_UP, START, { from, to });

    expect(found.map((o) => [o.label, o.offsetSeconds])).toEqual([
      ['Stand up', 2700],
      ['Back to work', 2760],
    ]);
  });

  it('asked about a moment after the run, answers with nothing', () => {
    const after = new Date(START.getTime() + 9 * 60 * 60 * 1000);

    expect(stepOccurrencesFor(STAND_UP, START, { from: after })).toEqual([]);
    expect(nextStep(STAND_UP, START, after)).toBeUndefined();
  });

  it('includes a step starting exactly on the lower bound', () => {
    // A poll landing precisely on a step must not miss it; the next poll
    // would be too late and the step would never fire.
    const exactly = new Date(START.getTime() + 2700 * 1000);

    expect(nextStep(STAND_UP, START, exactly)?.offsetSeconds).toBe(2700);
  });

  it('honours a limit without losing the order', () => {
    const found = stepOccurrencesFor(STAND_UP, START, { ...far, limit: 3 });

    expect(found).toHaveLength(3);
    expect(found.map((o) => o.offsetSeconds)).toEqual([0, 60, 2700]);
  });
});

describe('what it refuses to do', () => {
  it('a sequence with no steps produces nothing', () => {
    const empty: SequenceSpec = { ...MORNING_STRETCH, steps: [] };

    expect(stepOccurrencesFor(empty, START, far)).toEqual([]);
    expect(runLengthSeconds(empty)).toBe(0);
  });

  it('a one-second cycle over a long window is truncated, not spun on', () => {
    /*
     * Every second for eight hours is 28,800 instants. The constraint allows
     * it and a browser cannot be handed it, so it truncates at the ceiling.
     * The real guard is the caller's window; this is the backstop, and the
     * thing being asserted is that it terminates at all.
     */
    const dense: SequenceSpec = {
      id: 'seq-dense',
      name: 'Every second',
      repeatMode: 'duration',
      repeatSeconds: 8 * 60 * 60,
      repeatCount: null,
      closingText: null,
      steps: [step('d1', 1, 'Tick', 1)],
    };

    const found = stepOccurrencesFor(dense, START, far);

    expect(found).toHaveLength(MAX_STEP_OCCURRENCES);
    expect(found[0].offsetSeconds).toBe(0);
    expect(found[1].offsetSeconds).toBe(1);
  });

  it('a duration shorter than one cycle still fires what fits', () => {
    // Asked for two minutes of a 45-minute cycle: the stand-up happens, the
    // closing line follows, and the 44-minute work step never starts.
    const brief: SequenceSpec = { ...STAND_UP, repeatSeconds: 120 };
    const found = stepOccurrencesFor(brief, START, far);

    expect(found.map((o) => [o.label, o.offsetSeconds])).toEqual([
      ['Stand up', 0],
      ['Back to work', 60],
      ['Finished', 120],
    ]);
  });
});
