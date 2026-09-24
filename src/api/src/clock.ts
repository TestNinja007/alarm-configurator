/**
 * T-02: every server-side reading of "now" goes through this module.
 *
 * Nothing else in the codebase may call Date.now() or new Date() with no
 * arguments, and no domain timestamp is allowed to come from the database's
 * own now(). That is what makes the test clock authoritative.
 */

type ClockState = { mode: 'system' } | { mode: 'fixed'; now: Date };

let state: ClockState = { mode: 'system' };

export const clock = {
  now(): Date {
    return state.mode === 'system' ? new Date() : new Date(state.now.getTime());
  },

  /** Pins the clock to a fixed instant until released. */
  setFixed(now: Date): void {
    state = { mode: 'fixed', now };
  },

  /** Hands control back to the system clock. */
  release(): void {
    state = { mode: 'system' };
  },

  describe(): { mode: 'system' | 'fixed'; now: string } {
    return { mode: state.mode, now: clock.now().toISOString() };
  },
};
