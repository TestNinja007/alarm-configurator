import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { config } from '../config.js';
import { AppError, badGateway, notFound, serviceUnavailable, validationError } from '../errors.js';
import {
  SpeechServiceError,
  createSpeechClient,
  type SpeechClient,
} from '../speech/client.js';
import { consumeSynthesis } from '../auth/rateLimit.js';
import { limitsFor, tierOf } from '../domain/tiers.js';
import { errorResponses } from '../schemas/common.js';

/**
 * Server-generated speech, as the browser sees it.
 *
 * The same three routes with the same shapes as before the speech service was
 * extracted - the browser does not know anything moved. What changed is behind
 * them: this file keeps the concerns that belong to the *user* (signing in, the
 * tier gate, the per-user rate limit) and delegates everything about *speech*
 * (the provider, the cache, the bytes) to the speech service over HTTP.
 *
 * Two steps on purpose. Asking for audio returns an id; the audio itself is a
 * plain GET, so the browser can cache it and an <audio> element can point
 * straight at it.
 */

const SPEECH_MAX_LENGTH = 200;

const SynthesiseBodySchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: SPEECH_MAX_LENGTH }),
    voice: Type.Union([Type.Literal('male'), Type.Literal('female')]),
  },
  { additionalProperties: false },
);

const SynthesisedSchema = Type.Object({
  id: Type.String(),
  url: Type.String(),
  contentType: Type.String(),
  bytes: Type.Integer(),
  /** False when it came from the cache rather than the provider. */
  generated: Type.Boolean(),
});

/**
 * Turn the speech service's failure into this API's error.
 *
 * Every one of these ends with the browser speaking in its own voice - it falls
 * back on any failure - so the user hears something either way. The status
 * still has to be honest, because it is what an operator reads: 503 says the
 * service is struggling and may recover, 502 says it answered and the answer
 * will not change.
 */
function translate(error: unknown, log: FastifyBaseLogger): never {
  if (!(error instanceof SpeechServiceError)) throw error;

  if (error.kind === 'unavailable') {
    log.warn({ err: error }, 'Speech service unavailable; the browser will use its own voice');
    throw serviceUnavailable('Speech is not available right now.', {
      retryAfter: error.retryAfterSeconds ?? 30,
      details: { cause: 'speech_service_unavailable' },
      cause: error,
    });
  }

  if (error.kind === 'misconfigured') {
    // Logged as an error, not a warning: no request will ever succeed until
    // someone fixes the token, and nothing else will say so.
    log.error({ err: error }, 'The speech service rejected this API - check SPEECH_SERVICE_TOKEN');
  } else {
    log.error({ err: error }, 'The speech service refused to generate speech');
  }
  throw badGateway('Speech could not be generated.', { cause: error });
}

export async function speechRoutes(
  app: FastifyInstance,
  options: { client?: SpeechClient } = {},
): Promise<void> {
  // Injectable so the routes can be tested against a client that fails on
  // demand, without a speech service running.
  const client =
    options.client ??
    createSpeechClient({
      url: config.speechService.url,
      token: config.speechService.token,
      timeoutMs: config.speechService.timeoutMs,
      settingsTimeoutMs: config.speechService.settingsTimeoutMs,
    });

  app.post<{ Body: { text: string; voice: 'male' | 'female' } }>(
    '/speech',
    {
      preHandler: requireUser,
      schema: {
        summary: 'Generate audio for a message, or return what was generated before',
        description: 'Only available when a speech service is configured.',
        tags: ['speech'],
        body: SynthesiseBodySchema,
        response: { 200: SynthesisedSchema, ...errorResponses },
      },
    },
    async (request) => {
      // Absent rather than refused when there is no speech service, so it
      // reads the same as a route that was never built.
      if (!client.configured) throw notFound('Route');

      // Generated speech is a paid feature. Not an error the caller must
      // handle: the browser falls back to its own voice.
      const tier = await tierOf(request.user!.id);
      if (!limitsFor(tier).generatedSpeech) throw notFound('Route');

      const text = request.body.text.trim();
      if (!text) {
        throw validationError([
          { field: 'text', code: 'blank', message: 'There is nothing to say.' },
        ]);
      }

      // Per *user*, so it stays here rather than moving to the speech service,
      // which does not know who is asking - only that this API is.
      if (!consumeSynthesis(request.user!.id)) {
        throw new AppError('rate_limited', 'Too many speech requests. Try again shortly.');
      }

      try {
        const audio = await client.synthesise(text, request.body.voice);
        return {
          id: audio.id,
          url: `/api/v1/speech/${audio.id}`,
          contentType: audio.contentType,
          bytes: audio.bytes,
          generated: audio.generated,
        };
      } catch (error) {
        translate(error, request.log);
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    '/speech/:id',
    {
      preHandler: requireUser,
      schema: {
        summary: 'The generated audio',
        tags: ['speech'],
        params: Type.Object({ id: Type.String({ minLength: 64, maxLength: 64 }) }),
        response: { 200: Type.Any(), ...errorResponses },
      },
    },
    async (request, reply) => {
      if (!client.configured) throw notFound('Route');

      let audio;
      try {
        audio = await client.audio(request.params.id);
      } catch (error) {
        translate(error, request.log);
      }
      if (!audio) throw notFound('Audio');

      // The id is a hash of the exact words, so the bytes can never change
      // under it and the browser may hold on to them.
      return reply
        .header('Content-Type', audio.contentType)
        .header('Cache-Control', 'private, max-age=86400, immutable')
        .send(audio.bytes);
    },
  );

  app.get(
    '/speech/settings',
    {
      preHandler: requireUser,
      schema: {
        summary: 'Whether the server generates speech for this account, and with what',
        tags: ['speech'],
        response: {
          200: Type.Object({
            enabled: Type.Boolean(),
            provider: Type.String(),
            maxLength: Type.Integer(),
          }),
          ...errorResponses,
        },
      },
    },
    async (request) => {
      const off = { enabled: false, provider: 'none', maxLength: SPEECH_MAX_LENGTH };
      if (!client.configured) return off;

      /*
       * Asked of the speech service each time rather than assumed, so a
       * service that has gone away is reported as unavailable *before* the
       * browser tries to use it - and the browser uses its own voice from the
       * start rather than failing on the first alarm.
       *
       * Never an error. The browser asks for this once per session, and a
       * settings call that failed would leave it not knowing what to do.
       */
      try {
        const service = await client.settings();
        return {
          // What *this account* can do, not merely what the service offers.
          enabled: service.enabled && limitsFor(await tierOf(request.user!.id)).generatedSpeech,
          provider: service.provider,
          maxLength: service.maxLength,
        };
      } catch (error) {
        request.log.warn({ err: error }, 'Speech settings unavailable; reporting speech as off');
        return { ...off, provider: 'unavailable' };
      }
    },
  );
}
