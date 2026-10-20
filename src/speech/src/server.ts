import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { SpeechConfig } from './config.js';
import { SynthesisError, synthesisEnabled } from './providers.js';
import type { AudioStore } from './store.js';
import { audioFor } from './synthesis.js';

/**
 * The speech service's HTTP interface.
 *
 * Versioned under /v1 because this is an interface between two services, and
 * the main API has to be able to keep working while it changes. An unversioned
 * internal API is one where every change is a coordinated deploy of both.
 *
 * Every /v1 route needs the service token. /health does not, so a platform can
 * check the service is up without holding a secret.
 */

const SynthesiseBody = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 200 }),
    voice: Type.Union([Type.Literal('male'), Type.Literal('female')]),
  },
  { additionalProperties: false },
);

const Synthesised = Type.Object({
  /** A hash of provider, voice and words: the same request always gets the same id. */
  id: Type.String(),
  contentType: Type.String(),
  bytes: Type.Integer(),
  /** False when it came from the store rather than being generated now. */
  generated: Type.Boolean(),
});

const Settings = Type.Object({
  enabled: Type.Boolean(),
  provider: Type.String(),
  maxLength: Type.Integer(),
});

const ErrorBody = Type.Object({
  error: Type.Object({ code: Type.String(), message: Type.String() }),
});

type ErrorCode = 'unauthenticated' | 'validation_error' | 'not_found' | 'unavailable' | 'upstream_refused';

function fail(reply: FastifyReply, status: number, code: ErrorCode, message: string) {
  return reply.status(status).send({ error: { code, message } });
}

/** Constant-time, so the token cannot be recovered a character at a time by timing. */
function tokenMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface ServerOptions {
  config: SpeechConfig;
  store: AudioStore;
  logger?: boolean;
}

export function buildServer({ config, store, logger = false }: ServerOptions): FastifyInstance {
  const app = Fastify({ logger });

  // Validation failures in the same envelope as everything else, so the main
  // API maps one shape of error rather than Fastify's default plus its own.
  app.setErrorHandler((error, _request, reply) => {
    if ((error as { validation?: unknown }).validation) {
      return fail(reply, 422, 'validation_error', (error as Error).message);
    }
    reply.log.error({ err: error }, 'Unhandled error in the speech service');
    return reply.status(500).send({ error: { code: 'internal', message: 'Unexpected error.' } });
  });

  app.get('/health', async () => ({
    status: (await store.ping()) ? 'ok' : 'degraded',
    provider: config.tts.provider,
  }));

  app.register(async (v1) => {
    v1.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
      const expected = config.serviceToken;
      const header = request.headers.authorization ?? '';
      const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

      // No token configured means no caller can be trusted, rather than every
      // caller being trusted. index.ts refuses to start without one; this is
      // the same rule for anything that builds the server another way.
      if (!expected || !presented || !tokenMatches(presented, expected)) {
        return fail(reply, 401, 'unauthenticated', 'A valid service token is required.');
      }
    });

    v1.get(
      '/settings',
      { schema: { response: { 200: Settings } } },
      async (): Promise<Static<typeof Settings>> => ({
        enabled: synthesisEnabled(config.tts),
        provider: config.tts.provider,
        maxLength: config.maxLength,
      }),
    );

    v1.post<{ Body: Static<typeof SynthesiseBody> }>(
      '/syntheses',
      {
        schema: {
          body: SynthesiseBody,
          response: { 200: Synthesised, 422: ErrorBody, 502: ErrorBody, 503: ErrorBody },
        },
      },
      async (request, reply) => {
        if (!synthesisEnabled(config.tts)) {
          return fail(reply, 503, 'unavailable', 'Speech generation is switched off here.');
        }

        const text = request.body.text.trim();
        if (!text) return fail(reply, 422, 'validation_error', 'There is nothing to say.');

        try {
          const audio = await audioFor(text, request.body.voice, config.tts, store);
          return {
            id: audio.id,
            contentType: audio.contentType,
            bytes: audio.bytes.length,
            generated: audio.generated,
          };
        } catch (error) {
          if (error instanceof SynthesisError) {
            /*
             * Two different failures, told apart because they want opposite
             * responses from the caller. A spent quota or a provider outage
             * may clear up: 503 and try later. A bad key or a refused request
             * will fail identically every time: 502, and do not keep asking.
             */
            if (error.retryable) {
              reply.header('Retry-After', '30');
              return fail(reply, 503, 'unavailable', error.message);
            }
            return fail(reply, 502, 'upstream_refused', error.message);
          }
          throw error;
        }
      },
    );

    v1.get<{ Params: { id: string } }>(
      '/audio/:id',
      {
        schema: {
          params: Type.Object({ id: Type.String({ pattern: '^[0-9a-f]{64}$' }) }),
        },
      },
      async (request, reply) => {
        const audio = await store.find(request.params.id);
        if (!audio) return fail(reply, 404, 'not_found', 'No audio with that id.');

        // The id is a hash of the exact words, so the bytes can never change
        // under it and anything downstream may cache them indefinitely.
        return reply
          .header('Content-Type', audio.contentType)
          .header('Cache-Control', 'private, max-age=86400, immutable')
          .send(audio.bytes);
      },
    );
  }, { prefix: '/v1' });

  return app;
}
