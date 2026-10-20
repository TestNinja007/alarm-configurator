import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The speech service's configuration.
 *
 * Read from its own environment, not the main API's. The two run as separate
 * processes and share nothing but the network between them - which is the
 * point of the extraction - so neither reads the other's settings.
 */

const here = dirname(fileURLToPath(import.meta.url));
// The repository's .env, as the main API reads it, so one file can drive both
// processes locally. A real environment variable always wins.
loadEnv({ path: resolve(here, '..', '..', '..', '.env') });

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) throw new Error(`${name} must be an integer, not "${raw}".`);
  return value;
}

export type Provider = 'none' | 'mock' | 'elevenlabs';

export interface SpeechConfig {
  port: number;
  host: string;
  /**
   * The database this service keeps its cache in. Its tables live in their own
   * schema, so this may be the same server and database as the main API's -
   * see "Data: schema per service" in CLAUDE.md.
   */
  databaseUrl: string | undefined;
  schema: string;
  /**
   * What a caller must present. The main API is the only intended caller; a
   * token keeps the service from being an open, metered text-to-speech
   * endpoint for anyone who can reach its port.
   */
  serviceToken: string | undefined;
  tts: {
    provider: Provider;
    apiKey: string | undefined;
    model: string;
  };
  maxLength: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SpeechConfig {
  const provider = (env.TTS_PROVIDER ?? 'none') as Provider;
  if (!['none', 'mock', 'elevenlabs'].includes(provider)) {
    throw new Error(`TTS_PROVIDER must be none, mock or elevenlabs, not "${provider}".`);
  }

  return {
    port: integer('SPEECH_PORT', 8090),
    host: env.SPEECH_HOST ?? '127.0.0.1',
    databaseUrl: env.SPEECH_DATABASE_URL ?? env.DATABASE_URL,
    schema: env.SPEECH_SCHEMA ?? 'speech',
    serviceToken: env.SPEECH_SERVICE_TOKEN,
    tts: {
      provider,
      apiKey: env.TTS_API_KEY,
      model: env.TTS_MODEL ?? 'eleven_multilingual_v2',
    },
    maxLength: 200,
  };
}
