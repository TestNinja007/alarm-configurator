import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Verifier } from '@pact-foundation/pact';
import type { FastifyInstance } from 'fastify';
import type { SpeechConfig } from './config.js';
import { buildServer } from './server.js';
import { MemoryAudioStore } from './store.js';

/**
 * The contract, from the provider's side: does this service really do what the
 * main API was promised?
 *
 * The main API's contract test recorded every request it makes and every answer
 * it needs, in pacts/alarm-api-speech-service.json. This replays each recorded
 * request against the real server - real routing, real validation, real token
 * check - and fails if any answer differs from what was promised.
 *
 * Neither service runs the other. If someone renames a field here, this fails;
 * if the main API starts relying on something new, its test records it and
 * this fails until the service provides it. Either way, before a deploy.
 *
 * Storage is the in-memory store, deliberately: the contract is about the HTTP
 * conversation, not about persistence, and the job running this has no
 * database. The pytest layer checks what is really stored.
 */

const here = dirname(fileURLToPath(import.meta.url));
const PACT = resolve(here, '..', '..', '..', 'pacts', 'alarm-api-speech-service.json');

/** A fresh secret each run - so a pass proves the real token check ran. */
const TOKEN = randomBytes(24).toString('hex');
const PLACEHOLDER = 'Bearer valid-service-token';

const config: SpeechConfig = {
  port: 0,
  host: '127.0.0.1',
  databaseUrl: undefined,
  schema: 'speech',
  serviceToken: TOKEN,
  tts: { provider: 'mock', apiKey: undefined, model: 'contract' },
  maxLength: 200,
};

let store = new MemoryAudioStore();
let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  // The store is swapped per state rather than per test, so the server is
  // given a stable object that delegates to whichever store is current.
  app = buildServer({
    config,
    store: {
      find: (id) => store.find(id),
      save: (audio) => store.save(audio),
      ping: () => store.ping(),
      close: () => store.close(),
    },
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app?.close();
});

describe('the speech service honours its contract with the main API', () => {
  it('has a contract to verify', () => {
    /*
     * Written by the main API's contract test. Asserted rather than assumed:
     * without it the verifier has nothing to replay, and a provider check that
     * checks nothing is the "passes by never running" trap in another form.
     */
    expect(existsSync(PACT), `run the main API's contract test first: ${PACT}`).toBe(true);
  });

  it('answers every recorded request as promised', async () => {
    await new Verifier({
      provider: 'speech-service',
      providerBaseUrl: baseUrl,
      pactUrls: [PACT],
      logLevel: 'warn',

      /*
       * Each recorded interaction names the state the service must be in.
       * These put it there - nothing more. A state handler that did real work
       * would be testing itself rather than the service.
       */
      stateHandlers: {
        'speech generation is enabled': async () => {
          config.tts.provider = 'mock';
        },
        'speech generation is switched off': async () => {
          config.tts.provider = 'none';
        },
        'audio exists': async (params) => {
          const { id, base64, contentType } = params as { id: string; base64: string; contentType: string };
          store = new MemoryAudioStore();
          await store.save({
            id,
            provider: 'mock',
            voice: 'female',
            text: 'Stand up',
            contentType,
            bytes: Buffer.from(base64, 'base64'),
          });
        },
        'no audio exists': async () => {
          store = new MemoryAudioStore();
        },
      },

      /*
       * The contract says "a valid token" without containing one - a secret
       * has no business in a committed file. Here the placeholder becomes this
       * run's real token on the way in. Anything else, such as the wrong token
       * in the 401 interaction, is left exactly as recorded.
       */
      requestFilter: (request, _response, next) => {
        if (request.headers.authorization === PLACEHOLDER) {
          request.headers.authorization = `Bearer ${TOKEN}`;
        }
        next();
      },
    }).verifyProvider();
  });
});
