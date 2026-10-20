import { describe, expect, it, vi } from 'vitest';
import { SpeechServiceError, createSpeechClient } from './client.js';

/**
 * The main API's view of the speech service going wrong.
 *
 * A function call either returns or throws. A call to another service can also
 * be refused at the door, hang until someone gives up, come back busy, or come
 * back with an answer that will never change - and each wants a different
 * response. These produce every one on demand, with a fake `fetch`, because
 * waiting for a real service to fail in each of these ways is not a test plan.
 *
 * What is NOT here: whether the speech service really answers the way these
 * fakes pretend. That is the contract tests' job, and why both exist.
 */

const URL = 'http://speech.internal:8090';

function client(fetchImpl: typeof fetch, overrides: { url?: string | undefined; timeoutMs?: number } = {}) {
  return createSpeechClient({
    url: 'url' in overrides ? overrides.url : URL,
    token: 'service-token',
    timeoutMs: overrides.timeoutMs ?? 1_000,
    settingsTimeoutMs: 500,
    fetch: fetchImpl,
  });
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

async function failureOf(promise: Promise<unknown>): Promise<SpeechServiceError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SpeechServiceError) return error;
    throw error;
  }
  throw new Error('expected the call to fail, and it succeeded');
}

describe('talking to it', () => {
  it('sends its token, and to the versioned path', async () => {
    const fetchImpl = vi.fn(async () => json(200, { enabled: true, provider: 'mock', maxLength: 200 }));

    await client(fetchImpl as unknown as typeof fetch).settings();

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL}/v1/settings`);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer service-token');
  });

  it('tolerates a trailing slash on the configured address', async () => {
    const fetchImpl = vi.fn(async () => json(200, { enabled: true, provider: 'mock', maxLength: 200 }));

    await client(fetchImpl as unknown as typeof fetch, { url: `${URL}/` }).settings();

    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`${URL}/v1/settings`);
  });

  it('reports audio it does not have as missing, not as a failure', async () => {
    const found = await client((async () => json(404, { error: { code: 'not_found', message: 'none' } })) as typeof fetch).audio('a'.repeat(64));

    expect(found).toBeUndefined();
  });
});

describe('when there is no speech service', () => {
  it('says so, so the routes can behave as if speech were never built', async () => {
    const fetchImpl = vi.fn();
    const none = client(fetchImpl as unknown as typeof fetch, { url: undefined });

    expect(none.configured).toBe(false);
    expect((await failureOf(none.settings())).kind).toBe('unavailable');
    // And it never tried the network to find that out.
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('when the speech service is down or struggling - may recover, 503', () => {
  it('a refused connection is unavailable', async () => {
    const refused = (async () => {
      throw new TypeError('fetch failed: connect ECONNREFUSED 127.0.0.1:8090');
    }) as typeof fetch;

    const failure = await failureOf(client(refused).synthesise('Stand up', 'female'));

    expect(failure.kind).toBe('unavailable');
    expect(failure.message).toContain('could not be reached');
  });

  it('a service that never answers is cut off at the timeout, not waited on forever', async () => {
    /*
     * The failure a function call can never have: the other side simply does
     * not answer. Without a timeout, every request that touches speech hangs
     * with it - which is how one slow dependency takes a whole site down.
     * This fake honours the abort signal the way a real fetch does.
     */
    const hangs = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;

    const started = Date.now();
    const failure = await failureOf(client(hangs, { timeoutMs: 150 }).synthesise('Stand up', 'female'));
    const waited = Date.now() - started;

    expect(failure.kind).toBe('unavailable');
    expect(failure.message).toContain('did not answer within 150ms');
    expect(waited).toBeLessThan(1_000);
  });

  it('a 503 is unavailable, and carries how long to wait', async () => {
    const busy = (async () =>
      json(503, { error: { code: 'unavailable', message: 'quota exceeded' } }, { 'retry-after': '30' })) as typeof fetch;

    const failure = await failureOf(client(busy).synthesise('Stand up', 'female'));

    expect(failure.kind).toBe('unavailable');
    expect(failure.retryAfterSeconds).toBe(30);
    // The service's own explanation travels, for whoever reads the log.
    expect(failure.message).toBe('quota exceeded');
  });

  it('a 500 from the service itself is unavailable too', async () => {
    const broken = (async () => json(500, { error: { code: 'internal', message: 'Unexpected error.' } })) as typeof fetch;

    expect((await failureOf(client(broken).synthesise('x', 'male'))).kind).toBe('unavailable');
  });
});

describe('when the speech service answers and the answer will not change - 502', () => {
  it('a 502 is refused: its provider said no, and will say no again', async () => {
    const refused = (async () =>
      json(502, { error: { code: 'upstream_refused', message: 'invalid key' } })) as typeof fetch;

    const failure = await failureOf(client(refused).synthesise('Stand up', 'female'));

    expect(failure.kind).toBe('refused');
    expect(failure.retryAfterSeconds).toBeUndefined();
  });

  it('a 401 is misconfiguration - this API holds the wrong token', async () => {
    /*
     * Singled out because nothing else will ever say it. Every request fails,
     * forever, until someone changes a setting - and the user only hears the
     * browser's voice, which sounds like everything is fine.
     */
    const rejected = (async () =>
      json(401, { error: { code: 'unauthenticated', message: 'A valid service token is required.' } })) as typeof fetch;

    const failure = await failureOf(client(rejected).settings());

    expect(failure.kind).toBe('misconfigured');
    expect(failure.message).toContain("rejected this API's token");
  });

  it('a body that is not the usual error shape still produces a readable failure', async () => {
    const odd = (async () => new Response('<html>Bad Gateway</html>', { status: 502 })) as typeof fetch;

    const failure = await failureOf(client(odd).synthesise('x', 'female'));

    expect(failure.kind).toBe('refused');
    expect(failure.message).toBe('HTTP 502');
  });
});
