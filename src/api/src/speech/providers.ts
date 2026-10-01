import { config } from '../config.js';

/**
 * Turning text into audio.
 *
 * Three providers, chosen by TTS_PROVIDER:
 *
 *   none        no server-side audio at all; the browser speaks for itself
 *   mock        generates a real, playable WAV locally. No account, no network,
 *               no cost, and deterministic — the same text always produces the
 *               same bytes, which is what makes the caching testable.
 *   elevenlabs  the real thing
 *
 * The mock exists so the whole path — request, cache, storage, playback — can
 * be exercised before anyone has a key, and so tests never depend on a third
 * party being up or on a quota not being spent.
 */

export interface SynthesisResult {
  bytes: Buffer;
  contentType: string;
}

export type Voice = 'male' | 'female';

export class SynthesisError extends Error {
  readonly retryable: boolean;
  constructor(message: string, options: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'SynthesisError';
    this.retryable = options.retryable ?? false;
  }
}

/* -------------------------------------------------------------- mock ----- */

const SAMPLE_RATE = 8000;

/** A PCM WAV header for the given payload length. */
function wavHeader(dataLength: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate, 16-bit mono
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);
  return header;
}

/**
 * A tone whose length grows with the sentence, so a listener can tell one
 * message from another and a test can assert that longer text really did
 * produce a longer file.
 */
function mockAudio(text: string, voice: Voice): SynthesisResult {
  // Roughly a syllable's worth of audio per three characters, floored so even
  // a single word produces something audible.
  const seconds = Math.min(10, Math.max(0.4, text.length / 12));
  const samples = Math.floor(SAMPLE_RATE * seconds);
  // A lower tone for the male preference, so the two are distinguishable.
  const frequency = voice === 'male' ? 150 : 260;

  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    // Faded at both ends, or the abrupt start and stop click unpleasantly.
    const fade = Math.min(1, i / 400, (samples - i) / 400);
    const value = Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE) * 0.3 * fade;
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }

  return {
    bytes: Buffer.concat([wavHeader(data.length), data]),
    contentType: 'audio/wav',
  };
}

/* --------------------------------------------------------- elevenlabs ----- */

/**
 * Two of ElevenLabs' stock voices. They are referenced by id rather than by
 * name because names are editable in their dashboard and ids are not.
 */
const ELEVENLABS_VOICES: Record<Voice, string> = {
  // Adam
  male: process.env.ELEVENLABS_VOICE_MALE ?? 'pNInz6obpgDQGcFmaJgB',
  // Rachel
  female: process.env.ELEVENLABS_VOICE_FEMALE ?? '21m00Tcm4TlvDq8ikWAM',
};

const ELEVENLABS_TIMEOUT_MS = 20_000;

async function elevenLabsAudio(text: string, voice: Voice): Promise<SynthesisResult> {
  const key = config.tts.apiKey;
  if (!key) throw new SynthesisError('TTS_API_KEY is required when TTS_PROVIDER=elevenlabs.');

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICES[voice]}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: config.tts.model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // 429 is a spent quota and 5xx is their problem; both are worth retrying
    // later, while a 401 or a 422 will fail identically every time.
    throw new SynthesisError(
      `ElevenLabs refused the request: ${response.status} ${detail.slice(0, 200)}`,
      { retryable: response.status === 429 || response.status >= 500 },
    );
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: 'audio/mpeg',
  };
}

/* ------------------------------------------------------------------------- */

export function serverSpeechEnabled(): boolean {
  return config.tts.provider !== 'none';
}

export async function synthesize(text: string, voice: Voice): Promise<SynthesisResult> {
  switch (config.tts.provider) {
    case 'mock':
      return mockAudio(text, voice);
    case 'elevenlabs':
      return elevenLabsAudio(text, voice);
    default:
      throw new SynthesisError('Server-side speech is switched off.');
  }
}
