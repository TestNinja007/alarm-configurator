import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MatchersV3, PactV4 } from '@pact-foundation/pact';
import { SpeechServiceError, createSpeechClient } from './client.js';

/**
 * The contract, from the consumer's side: what this API needs the speech
 * service to do.
 *
 * Each interaction is run against a mock service that Pact stands up, which
 * answers exactly as described. If the client works against that, the
 * description is recorded in pacts/alarm-api-speech-service.json. The speech
 * service then replays every recorded request against its real implementation
 * and checks the answers match - see src/speech/src/contract.pact.test.ts.
 *
 * The point is that neither side runs the other. The client is tested against
 * a promise; the service is tested against the same promise; and if either
 * drifts, one of the two fails before anything is deployed.
 *
 * A rule worth keeping: describe only what the client *uses*. Asserting a field
 * the client never reads would make the service unable to change it, for no
 * benefit to anyone - that is how contract tests turn into a straitjacket.
 */

const here = dirname(fileURLToPath(import.meta.url));

const pact = new PactV4({
  consumer: 'alarm-api',
  provider: 'speech-service',
  dir: resolve(here, '..', '..', '..', '..', 'pacts'),
  logLevel: 'warn',
});

const { boolean, integer, regex, string } = MatchersV3;

/**
 * A placeholder meaning "the valid token". The provider verification swaps it
 * for the real one, because the contract is about the shape of the
 * conversation, not about a particular secret - which must never be written
 * into a file committed to the repository.
 */
const VALID = 'Bearer valid-service-token';

const AUDIO_ID = '05aaac78250cac9358d3bf5958ebb3d9e75902026becdc13f2730a62a7ecbf38';
/** A tiny, real WAV header - enough to be recognisably audio, small enough to read. */
const AUDIO_BYTES = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', 'base64');

function clientFor(url: string, token = 'valid-service-token') {
  return createSpeechClient({ url, token, timeoutMs: 5_000, settingsTimeoutMs: 5_000 });
}

describe('the speech service, as the main API relies on it', () => {
  it('reports its settings', async () => {
    await pact
      .addInteraction()
      .given('speech generation is enabled')
      .uponReceiving('a request for the speech settings')
      .withRequest('GET', '/v1/settings', (builder) => builder.headers({ authorization: VALID }))
      .willRespondWith(200, (builder) =>
        builder.jsonBody({
          enabled: boolean(true),
          provider: string('mock'),
          maxLength: integer(200),
        }),
      )
      .executeTest(async (mock) => {
        const settings = await clientFor(mock.url).settings();
        expect(settings.enabled).toBe(true);
        expect(settings.maxLength).toBe(200);
      });
  });

  it('generates speech and says where it came from', async () => {
    await pact
      .addInteraction()
      .given('speech generation is enabled')
      .uponReceiving('a request to generate speech')
      .withRequest('POST', '/v1/syntheses', (builder) =>
        builder
          .headers({ authorization: VALID, 'content-type': 'application/json' })
          .jsonBody({ text: 'Stand up', voice: 'female' }),
      )
      .willRespondWith(200, (builder) =>
        builder.jsonBody({
          // The client builds a URL from this, so its shape is part of the
          // contract: a hash, not merely some string.
          id: regex('^[0-9a-f]{64}$', AUDIO_ID),
          contentType: string('audio/wav'),
          bytes: integer(10710),
          generated: boolean(true),
        }),
      )
      .executeTest(async (mock) => {
        const synthesis = await clientFor(mock.url).synthesise('Stand up', 'female');
        expect(synthesis.id).toMatch(/^[0-9a-f]{64}$/);
        expect(synthesis.generated).toBe(true);
      });
  });

  it('refuses with 503 when generation is switched off', async () => {
    /*
     * The client turns any 503 into "unavailable, may recover", so the status
     * is the contract. The message travels to the log, so it must be present -
     * but its words are the service's business.
     */
    await pact
      .addInteraction()
      .given('speech generation is switched off')
      .uponReceiving('a request to generate speech while generation is off')
      .withRequest('POST', '/v1/syntheses', (builder) =>
        builder
          .headers({ authorization: VALID, 'content-type': 'application/json' })
          .jsonBody({ text: 'Stand up', voice: 'female' }),
      )
      .willRespondWith(503, (builder) =>
        builder.jsonBody({ error: { message: string('Speech generation is switched off here.') } }),
      )
      .executeTest(async (mock) => {
        const error = await clientFor(mock.url)
          .synthesise('Stand up', 'female')
          .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(SpeechServiceError);
        expect((error as SpeechServiceError).kind).toBe('unavailable');
      });
  });

  it('serves audio it has, as the bytes and their type', async () => {
    /*
     * The state carries the bytes themselves, base64-encoded. The provider
     * stores exactly those before replaying the request, so the example lives
     * in one place - this file - rather than being copied into both.
     */
    await pact
      .addInteraction()
      .given('audio exists', { id: AUDIO_ID, base64: AUDIO_BYTES.toString('base64'), contentType: 'audio/wav' })
      .uponReceiving('a request for audio that exists')
      .withRequest('GET', `/v1/audio/${AUDIO_ID}`, (builder) => builder.headers({ authorization: VALID }))
      /*
       * Status and a Content-Type of some audio - and nothing about the bytes.
       *
       * Two narrower versions came first. One pinned audio/wav, which is only
       * what the mock provider makes: ElevenLabs returns audio/mpeg, so that
       * contract would have failed the first time it met real audio. Then a
       * declared body, which Pact verifies by sniffing the bytes' format - so
       * any declared body pins a format, whatever it is labelled.
       *
       * This API passes the bytes and their type straight through without
       * reading them, so the honest contract says nothing about them. Pact
       * treats an absent expected body as "any body is fine", which is exactly
       * what the consumer relies on.
       */
      .willRespondWith(200, (builder) =>
        builder.headers({ 'Content-Type': regex('^audio/[a-z0-9.+-]+$', 'audio/wav') }),
      )
      .executeTest(async (mock) => {
        const audio = await clientFor(mock.url).audio(AUDIO_ID);
        expect(audio?.contentType).toMatch(/^audio[/]/);
        expect(Buffer.isBuffer(audio?.bytes)).toBe(true);
      });
  });

  it('answers 404 for audio it does not have', async () => {
    const missing = 'f'.repeat(64);
    await pact
      .addInteraction()
      .given('no audio exists')
      .uponReceiving('a request for audio that does not exist')
      .withRequest('GET', `/v1/audio/${missing}`, (builder) => builder.headers({ authorization: VALID }))
      .willRespondWith(404)
      .executeTest(async (mock) => {
        // Missing is an answer, not a failure: the client returns nothing.
        expect(await clientFor(mock.url).audio(missing)).toBeUndefined();
      });
  });

  it('answers 401 to a caller with the wrong token', async () => {
    /*
     * In the contract because the client treats 401 specially - as this API
     * being misconfigured, the failure nothing else will ever report. If the
     * service ever answered a bad token differently, that diagnosis would
     * silently stop working.
     */
    await pact
      .addInteraction()
      .given('speech generation is enabled')
      .uponReceiving('a request carrying the wrong service token')
      .withRequest('GET', '/v1/settings', (builder) =>
        builder.headers({ authorization: 'Bearer not-the-token' }),
      )
      .willRespondWith(401, (builder) =>
        builder.jsonBody({ error: { message: string('A valid service token is required.') } }),
      )
      .executeTest(async (mock) => {
        const error = await clientFor(mock.url, 'not-the-token')
          .settings()
          .catch((caught: unknown) => caught);
        expect((error as SpeechServiceError).kind).toBe('misconfigured');
      });
  });
});
