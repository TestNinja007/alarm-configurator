import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { UpcomingList, UpcomingOccurrence } from '../api/types';

/**
 * Raises a desktop notification when an alarm comes due, for as long as the app
 * is open in a tab.
 *
 * This is deliberately not push. Nothing arrives with the browser closed: the
 * page polls for what is coming up, sets a timer for each one, and fires it.
 * Real push needs a service worker and a server that is awake around the clock.
 *
 * Two constants shape the behaviour:
 *   POLL_INTERVAL_MS  how often the upcoming list is refreshed
 *   LOOKAHEAD_MS      how far ahead a timer is set, which must exceed the poll
 *                     interval or an occurrence could fall between two polls
 */
export const POLL_INTERVAL_MS = 30_000;
export const LOOKAHEAD_MS = 120_000;

/** Fired occurrences are remembered here so a reload cannot repeat them. */
const FIRED_STORAGE_KEY = 'alarm-configurator:fired-occurrences';
const ENABLED_STORAGE_KEY = 'alarm-configurator:notifications-enabled';

export type NotificationPermissionState = 'unsupported' | 'default' | 'granted' | 'denied';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private windows and blocked site data both throw rather than return null.
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Not being able to remember is survivable; the app still works.
  }
}

function loadFired(): Set<string> {
  const raw = readStorage(FIRED_STORAGE_KEY);
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveFired(fired: Set<string>): void {
  // Anything more than a day old can never come round again, so it is dropped
  // rather than left to grow without limit.
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const kept = [...fired].filter((key) => {
    const utc = key.slice(key.indexOf(':') + 1);
    const at = Date.parse(utc);
    return Number.isNaN(at) || at >= cutoff;
  });
  writeStorage(FIRED_STORAGE_KEY, JSON.stringify(kept));
}

const keyFor = (occurrence: UpcomingOccurrence) => `${occurrence.alarmId}:${occurrence.utc}`;

function currentPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationPermissionState;
}

export function useAlarmNotifications() {
  const [permission, setPermission] = useState<NotificationPermissionState>(currentPermission);
  const [enabled, setEnabled] = useState(() => readStorage(ENABLED_STORAGE_KEY) === '1');
  const [lastFired, setLastFired] = useState<string | undefined>();

  const fired = useRef<Set<string>>(loadFired());
  const timers = useRef<Map<string, number>>(new Map());

  const active = enabled && permission === 'granted';

  const upcoming = useQuery({
    queryKey: ['upcoming'],
    queryFn: () => api.get<UpcomingList>('/me/upcoming?withinMinutes=60'),
    enabled: active,
    refetchInterval: active ? POLL_INTERVAL_MS : false,
    // A backgrounded tab still needs to raise alarms, which is the whole point.
    refetchIntervalInBackground: true,
  });

  const show = useCallback((occurrence: UpcomingOccurrence) => {
    const key = keyFor(occurrence);
    if (fired.current.has(key)) return;

    fired.current.add(key);
    saveFired(fired.current);
    setLastFired(key);

    try {
      const notification = new Notification(occurrence.alarmName, {
        body: occurrence.note
          ? `${occurrence.note}\n${occurrence.local}`
          : `${occurrence.folderName} — ${occurrence.local}`,
        // Replaces rather than stacks if the same alarm somehow fires twice.
        tag: key,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Construction throws in a few browsers when permission was revoked
      // between the check and the call.
    }
  }, []);

  // Set a timer for everything due inside the lookahead window.
  useEffect(() => {
    if (!active || !upcoming.data) return;

    for (const occurrence of upcoming.data.items) {
      const key = keyFor(occurrence);
      if (fired.current.has(key) || timers.current.has(key)) continue;

      const delay = Date.parse(occurrence.utc) - Date.now();
      if (delay > LOOKAHEAD_MS) continue;

      // Something already due — because the tab was asleep, or the poll landed
      // late — fires immediately rather than being skipped.
      const timer = window.setTimeout(() => {
        timers.current.delete(key);
        show(occurrence);
      }, Math.max(0, delay));

      timers.current.set(key, timer);
    }
  }, [active, upcoming.data, show]);

  // Drop every pending timer when notifications are switched off.
  useEffect(() => {
    if (active) return;
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
  }, [active]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const request = useCallback(async () => {
    if (!('Notification' in window)) return;
    // Browsers only honour this from a user gesture, which is why it is a
    // button rather than something that happens on load.
    const result = await Notification.requestPermission();
    setPermission(result as NotificationPermissionState);
    if (result === 'granted') {
      setEnabled(true);
      writeStorage(ENABLED_STORAGE_KEY, '1');
    }
  }, []);

  const toggle = useCallback((next: boolean) => {
    setEnabled(next);
    writeStorage(ENABLED_STORAGE_KEY, next ? '1' : '0');
  }, []);

  /** Fires one immediately, so a person can confirm notifications work. */
  const sendTest = useCallback(() => {
    if (currentPermission() !== 'granted') return;
    try {
      new Notification('Alarm Configurator', {
        body: 'Notifications are working. Alarms will appear like this.',
        tag: 'alarm-configurator-test',
      });
      setLastFired('test');
    } catch {
      // Ignored for the same reason as above.
    }
  }, []);

  return {
    permission,
    enabled,
    active,
    upcomingCount: upcoming.data?.items.length ?? 0,
    nextOccurrence: upcoming.data?.items[0],
    lastFired,
    request,
    toggle,
    sendTest,
  };
}
