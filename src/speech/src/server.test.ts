import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SpeechConfig } from './config.js';
import { buildServer } from './server.js';
import { MemoryAudioStore } from './store.js';

/**
 * The speech service, tested in isolation.
 *
 * No database, no network, no main API: an in-memory store and either the
 * mock provider or a stubbed `fetch` standing in for ElevenLabs. That is what
 * "testing a service in isolation" means - its dependencies replaced by things
 * the test controls, so each failure can be produced on demand rather than
 * waited for.
 */

const TOKEN = 'test-service-token';

function configWith(overrides: Partial<SpeechConfig['tts']> = {}, token: string | undefined = TOKEN): SpeechConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    databaseUrl: undefined,
    schema: 'speech',
    serviceToken: token,
    tts: { provider: 'mock', apiKey: undefined, model: 'test-model', ...overrides },
    maxLength: 200,
  };
}

function serve(config = configWith()) {
  const store = new MemoryAudioStore();
  return { app: buildServer({ config, store }), store };
}

const auth = { authorization: `Bearer ${TOKEN}` };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('who may call it', () => {
  it('answers a health check without a token', async () => {
    const { app } = serve();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', provider: 'mock' });
  });

  it('refuses every versioned route without a token', async () => {
    const { app } = serve();

    for (const [method, url] of [
      ['GET', '/v1/settings'],
      ['POST', '/v1/syntheses'],
      ['GET', `/v1/audio/${'a'.repeat(64)}`],
    ] as const) {
      const response = await app.inject({ method, url, payload: method === 'POST' ? { text: 'x', voice: 'female' } : undefined });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
      expect(response.json().error.code).toBe('unauthenticated');
    }
  });

  it('refuses the wrong token', async () => {
    const { app } = serve();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/settings',
      headers: { authorization: 'Bearer not-the-token' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('fails closed when no token is configured, rather than open', async () => {
    /*
     * A missing configuration value must not mean "anyone may call". index.ts
     * refuses to start without a token; this is the same rule for anything
     * that builds the server another way, and the more important of the two.
     */
    // Built explicitly. `configWith({}, undefined)` looks like "no token" and
    // is not: passing undefined to a parameter with a default USES the
    // default, so the first version of this test configured a token and was
    // checking the open path while claiming to check the closed one.
    const noToken: SpeechConfig = { ...configWith(), serviceToken: undefined };
    expect(noToken.serviceToken, 'the setup must really have no token').toBeUndefined();

    const { app } = serve(noToken);
    const response = await app.inject({ method: 'GET', url: '/v1/settings', headers: auth });

    expect(response.statusCode).toBe(401);
  });
});

describe('generating and caching', () => {
  it('generates on the first request and serves from the store on the second', async () => {
    const { app, store } = serve();
    const body = { text: 'Stand up', voice: 'female' };

    const first = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: body });
    const second = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: body });

    expect(first.statusCode).toBe(200);
    expect(first.json().generated).toBe(true);
    expect(second.json().generated).toBe(false);
    expect(second.json().id).toBe(first.json().id);
    // Paid for once.
    expect(store.size).toBe(1);
  });

  it('treats a different voice as different audio', async () => {
    const { app } = serve();
    const female = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'Hello', voice: 'female' } });
    const male = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'Hello', voice: 'male' } });

    expect(male.json().id).not.toBe(female.json().id);
  });

  it('serves the bytes it generated, with headers that let them be cached', async () => {
    const { app } = serve();
    const made = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'Back to work', voice: 'male' } });
    const { id, bytes, contentType } = made.json();

    const audio = await app.inject({ method: 'GET', url: `/v1/audio/${id}`, headers: auth });

    expect(audio.statusCode).toBe(200);
    expect(audio.headers['content-type']).toBe(contentType);
    expect(audio.rawPayload.length).toBe(bytes);
    // A WAV file, really - not merely something labelled as one.
    expect(audio.rawPayload.subarray(0, 4).toString()).toBe('RIFF');
    expect(audio.headers['cache-control']).toContain('immutable');
  });

  it('answers 404 for audio it never made, and 422 for an id that cannot be one', async () => {
    const { app } = serve();

    const unknown = await app.inject({ method: 'GET', url: `/v1/audio/${'0'.repeat(64)}`, headers: auth });
    const malformed = await app.inject({ method: 'GET', url: '/v1/audio/not-a-hash', headers: auth });

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe('not_found');
    expect(malformed.statusCode).toBe(422);
  });

  it('refuses blank text and text over the limit', async () => {
    const { app } = serve();

    const blank = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: '   ', voice: 'female' } });
    const long = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'x'.repeat(201), voice: 'female' } });

    expect(blank.statusCode).toBe(422);
    expect(long.statusCode).toBe(422);
  });
});

describe('when generation is switched off or the provider fails', () => {
  it('says so in its settings, and refuses with 503 rather than pretending', async () => {
    const { app } = serve(configWith({ provider: 'none' }));

    const settings = await app.inject({ method: 'GET', url: '/v1/settings', headers: auth });
    const attempt = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'x', voice: 'female' } });

    expect(settings.json()).toEqual({ enabled: false, provider: 'none', maxLength: 200 });
    expect(attempt.statusCode).toBe(503);
    expect(attempt.json().error.code).toBe('unavailable');
  });

  it('a spent quota at the provider is 503 with Retry-After - it may clear up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('quota exceeded', { status: 429 })));
    const { app } = serve(configWith({ provider: 'elevenlabs', apiKey: 'key' }));

    const response = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'Stand up', voice: 'female' } });

    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('30');
  });

  it('a provider that cannot be reached is also 503 - worth trying later', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const { app } = serve(configWith({ provider: 'elevenlabs', apiKey: 'key' }));

    const response = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'Stand up', voice: 'female' } });

    expect(response.statusCode).toBe(503);
  });

  it('a refused request is 502 with no Retry-After - asking again will not help', async () => {
    /*
     * The distinction worth testing. A bad key fails identically every time,
     * so telling the caller to retry would turn one failure into a loop of
     * them, each one billed.
     */
    vi.stubGlobal('fetch', vi.fn(async () => new Response('invalid key', { status: 401 })));
    const { app } = serve(configWith({ provider: 'elevenlabs', apiKey: 'wrong' }));

    const response = await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'Stand up', voice: 'female' } });

    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe('upstream_refused');
    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('a failed generation stores nothing, so the next request tries again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const { app, store } = serve(configWith({ provider: 'elevenlabs', apiKey: 'key' }));

    await app.inject({ method: 'POST', url: '/v1/syntheses', headers: auth, payload: { text: 'Stand up', voice: 'female' } });

    // Caching a failure would make one outage permanent for that sentence.
    expect(store.size).toBe(0);
  });
});
