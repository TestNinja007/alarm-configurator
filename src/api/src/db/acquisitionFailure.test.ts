import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.js';
import { translateAcquisitionFailure } from './acquisitionFailure.js';

/**
 * DEF-19 — a pool failure must become a 503, not an unhandled 500.
 *
 * The part worth guarding is the recognition, not the mapping. node-postgres
 * gives an acquisition timeout no error code, so it is matched on its message,
 * and a message it renames in some future release would silently stop being
 * recognised. These tests name the three strings this depends on, so that
 * change breaks a test here instead of quietly restoring the 500.
 *
 * The other half is just as important and easier to get wrong: a real query
 * error must travel untouched. Translating too eagerly would turn genuine
 * faults into "try again", which is worse than the defect - a caller would
 * retry forever against a request that can never succeed.
 */

describe('translateAcquisitionFailure', () => {
  const unavailable = (error: unknown) => translateAcquisitionFailure(error);

  it.each([
    'timeout exceeded when trying to connect',
    'Connection terminated due to connection timeout: Connection terminated unexpectedly',
    'Connection terminated unexpectedly',
  ])('recognises %s', (message) => {
    const translated = unavailable(new Error(message));

    expect(translated).toBeInstanceOf(AppError);
    const appError = translated as AppError;
    expect(appError.code).toBe('service_unavailable');
    expect(appError.statusCode).toBe(503);
    // The caller is told when to come back rather than left to guess.
    expect(appError.details?.retryAfter).toBe(1);
    expect(appError.details?.cause).toBe('pool_acquisition_timeout');
  });

  it('is case-insensitive, because the casing has varied between versions', () => {
    const translated = unavailable(new Error('TIMEOUT EXCEEDED WHEN TRYING TO CONNECT'));
    expect((translated as AppError).code).toBe('service_unavailable');
  });

  it('keeps the original message as cause, and out of the response', () => {
    /*
     * The distinction this preserves is the whole question for DEF-08: a
     * drained queue and a connection that died point at different causes, and
     * the first version of this translation discarded which one it was.
     */
    const original = new Error('Connection terminated unexpectedly');
    const translated = unavailable(original) as AppError;

    expect(translated.cause, 'the log needs to know which failure this was').toBe(original);

    // And it stays out of details, which is serialised to the caller. An
    // internal database message is not the caller's business.
    expect(JSON.stringify(translated.details)).not.toContain('terminated');
    expect(translated.details).toEqual({ cause: 'pool_acquisition_timeout', retryAfter: 1 });
  });

  it('leaves a real query error alone, code and all', () => {
    // A unique violation is the clearest case: it has a code, it is the
    // caller's own doing, and 503 would be a lie that invites a retry.
    const original = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'alarms_user_id_name_key',
    });

    expect(unavailable(original)).toBe(original);
  });

  it('leaves a coded error alone even when its message looks like a timeout', () => {
    /*
     * The precedence that matters. A query error whose message happens to
     * contain these words is still a query error, and the presence of a code
     * is what settles it.
     */
    const original = Object.assign(new Error('Connection terminated unexpectedly'), {
      code: '57P01',
    });

    expect(unavailable(original)).toBe(original);
  });

  it('leaves anything that is not a database error alone', () => {
    for (const other of [
      new Error('something else entirely'),
      new TypeError('cannot read properties of undefined'),
      'a string that was thrown',
      undefined,
      null,
    ]) {
      expect(unavailable(other)).toBe(other);
    }
  });
});
