/**
 * A deliberately dull fixed-window limiter on failed sign-ins, so the
 * rate_limited error code is reachable without any randomness.
 *
 * Ten failures per email address per fifteen minutes. A successful sign-in
 * clears the counter. State lives in memory; the app runs as a single process.
 */
import { clock } from '../clock.js';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

interface Window {
  count: number;
  startedAt: number;
}

const windows = new Map<string, Window>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

/** Records an attempt. Returns false once the limit for the window is exhausted. */
export function consumeLoginAttempt(email: string): boolean {
  const now = clock.now().getTime();
  const id = key(email);
  const existing = windows.get(id);

  if (!existing || now - existing.startedAt >= WINDOW_MS) {
    windows.set(id, { count: 1, startedAt: now });
    return true;
  }

  if (existing.count >= MAX_ATTEMPTS) return false;

  existing.count += 1;
  return true;
}

/**
 * A separate, tighter window for sign-ups, keyed on the address being
 * registered. A public instance with open registration would otherwise collect
 * junk accounts as fast as anyone cared to send them.
 */
const MAX_REGISTRATIONS = 5;
const registrations = new Map<string, Window>();

export function consumeRegistration(email: string): boolean {
  const now = clock.now().getTime();
  const id = key(email);
  const existing = registrations.get(id);

  if (!existing || now - existing.startedAt >= WINDOW_MS) {
    registrations.set(id, { count: 1, startedAt: now });
    return true;
  }

  if (existing.count >= MAX_REGISTRATIONS) return false;

  existing.count += 1;
  return true;
}

export function clearLoginAttempts(email: string): void {
  windows.delete(key(email));
}

/** Used by the test-support reset so profiles start from a clean slate. */
export function resetLoginAttempts(): void {
  windows.clear();
  registrations.clear();
}
