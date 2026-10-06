import { serviceUnavailable } from '../errors.js';

/*
 * Recognising a pool acquisition failure, kept apart from the pool itself.
 *
 * Its own module so it can be tested without importing pool.ts, which
 * constructs a pg.Pool and reads DATABASE_URL at module load. A pure function
 * over an unknown error needs neither, and a test that needs a database to
 * check a regex is a test nobody runs.
 */

/**
 * Matched on the message because node-postgres gives no code for it: an
 * acquisition timeout arrives as a plain Error.
 *
 * That is fragile, and the fragility is one-directional - a message
 * node-postgres renames stops being recognised and the caller gets the old
 * 500 back, which is the behaviour being replaced rather than something
 * worse. acquisitionFailure.test.ts names these three strings so such a rename breaks a
 * test instead of quietly restoring the defect.
 *
 * All three seen in practice:
 *   - timeout exceeded when trying to connect   (queue drained, max reached)
 *   - Connection terminated due to connection timeout
 *   - Connection terminated unexpectedly        (a pooled connection died)
 */
const ACQUISITION_FAILURE =
  /timeout exceeded when trying to connect|connection terminated (due to connection timeout|unexpectedly)/i;

export function isAcquisitionFailure(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null | undefined;
  // A real query error has a code. Checked first so a query failure whose
  // message happens to mention a timeout can never be mistaken for this.
  if (typeof candidate?.code === 'string' && candidate.code !== '') return false;
  return typeof candidate?.message === 'string' && ACQUISITION_FAILURE.test(candidate.message);
}

/**
 * The error to throw instead: a 503 when the pool could not produce a
 * connection, and otherwise exactly what came in.
 *
 * DEF-19: this used to travel to the generic handler as an unhandled 500, so
 * a caller could not tell "the server is briefly out of connections, try
 * again" from "your request was wrong" - and those want opposite responses.
 *
 * Returning the original unchanged when it is not an acquisition failure is
 * the half that must not be got wrong. Translating too eagerly would turn
 * genuine faults into "try again", and a caller would retry forever against a
 * request that can never succeed.
 */
export function translateAcquisitionFailure(error: unknown): unknown {
  if (!isAcquisitionFailure(error)) return error;
  return serviceUnavailable('The database is not accepting connections right now.', {
    retryAfter: 1,
    details: { cause: 'pool_acquisition_timeout' },
  });
}
