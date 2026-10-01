import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { requireUser } from '../auth/guard.js';
import { config } from '../config.js';
import { AppError, notFound, validationError } from '../errors.js';
import { audioFor, findAudio } from '../speech/cache.js';
import { SynthesisError, serverSpeechEnabled } from '../speech/providers.js';
import { consumeSynthesis } from '../auth/rateLimit.js';
import { limitsFor, tierOf } from '../domain/tiers.js';
import { errorResponses } from '../schemas/common.js';

/**
 * Server-generated speech.
 *
 * Two steps on purpose. Asking for audio returns an id, and the audio itself is
 * fetched from a plain GET — so the browser can cache it, an <audio> element
 * can point straight at it, and the same sentence is not re-sent every time an
 * alarm fires.
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

export async function speechRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { text: string; voice: 'male' | 'female' } }>(
    '/speech',
    {
      preHandler: requireUser,
      schema: {
        summary: 'Generate audio for a message, or return what was generated before',
        description: 'Only available when TTS_PROVIDER is not "none".',
        tags: ['speech'],
        body: SynthesiseBodySchema,
        response: { 200: SynthesisedSchema, ...errorResponses },
      },
    },
    async (request) => {
      // Absent rather than refused when switched off, so it reads the same as
      // a route that was never built.
      if (!serverSpeechEnabled()) throw notFound('Route');

      // Not an error the caller must handle: the client falls back to the
      // browser's own voice, exactly as it does when a provider is unreachable.
      const tier = await tierOf(request.user!.id);
      if (!limitsFor(tier).generatedSpeech) throw notFound('Route');

      const text = request.body.text.trim();
      if (!text) {
        throw validationError([
          { field: 'text', code: 'blank', message: 'There is nothing to say.' },
        ]);
      }

      // Generating audio costs money at a real provider, so a caller cannot be
      // allowed to sit in a loop doing it.
      if (!consumeSynthesis(request.user!.id)) {
        throw new AppError('rate_limited', 'Too many speech requests. Try again shortly.');
      }

      try {
        const audio = await audioFor(text, request.body.voice);
        return {
          id: audio.id,
          url: `/api/v1/speech/${audio.id}`,
          contentType: audio.contentType,
          bytes: audio.bytes.length,
          generated: audio.generated,
        };
      } catch (error) {
        if (error instanceof SynthesisError) {
          // The client falls back to the browser's own voice, so this is a
          // degradation rather than a failure — but it must say so plainly.
          request.log.error({ err: error }, 'Speech synthesis failed');
          throw new AppError(
            error.retryable ? 'rate_limited' : 'internal',
            `Speech could not be generated: ${error.message}`,
          );
        }
        throw error;
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
      if (!serverSpeechEnabled()) throw notFound('Route');

      const audio = await findAudio(request.params.id);
      if (!audio) throw notFound('Audio');

      // The key is a hash of the exact words, so the bytes can never change
      // under a given id and the browser may hold on to them.
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
        summary: 'Whether the server generates speech, and with what',
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
    async (request) => ({
      // Reports what *this* account can do, not merely what the server offers.
      enabled: serverSpeechEnabled() && limitsFor(await tierOf(request.user!.id)).generatedSpeech,
      provider: config.tts.provider,
      maxLength: SPEECH_MAX_LENGTH,
    }),
  );
}
