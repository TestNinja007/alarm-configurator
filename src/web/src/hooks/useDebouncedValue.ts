import { useEffect, useState } from 'react';

/**
 * A-06: name search is debounced by exactly 300 ms. The delay is a constant,
 * so a test can wait for it rather than guess at it.
 */
export const SEARCH_DEBOUNCE_MS = 300;

export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
