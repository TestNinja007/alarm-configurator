import type { SpeechConfig } from './config.js';

/**
 * Turning text into audio.
 *
 * Moved here from the main API unchanged in behaviour. Three providers, chosen
 * by TTS_PROVIDER:
 *
 *   none        no audio at all; the browser speaks for itself
 *   mock        a real, playable WAV generated locally. No account, no network,
 *               no cost, and deterministic - the same text always produces the
 *               same bytes, which is what makes the cache and the contract
 *               tests possible without depending on a third party.
 *   elevenlabs  the real thing
 *
 * Configuration is passed in rather than imported, so a test can build a
 * provider with whatever settings it needs without touching the environment.
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
export function mockAudio(text: string, voice: Voice): SynthesisResult {
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
 * Two of ElevenLabs' stock voices, referenced by id rather than by name
 * because names are editable in their dashboard and ids are not.
 */
const ELEVENLABS_VOICES: Record<Voice, string> = {
  male: process.env.ELEVENLABS_VOICE_MALE ?? 'pNInz6obpgDQGcFmaJgB', // Adam
  female: process.env.ELEVENLABS_VOICE_FEMALE ?? '21m00Tcm4TlvDq8ikWAM', // Rachel
};

/**
 * How long to wait for ElevenLabs. The main API waits a little longer than
 * this for the speech service, so a slow provider is reported by the service
 * that knows why, rather than by a caller that only knows it gave up.
 */
export const ELEVENLABS_TIMEOUT_MS = 20_000;

async function elevenLabsAudio(
  text: string,
  voice: Voice,
  tts: SpeechConfig['tts'],
): Promise<SynthesisResult> {
  if (!tts.apiKey) {
    throw new SynthesisError('TTS_API_KEY is required when TTS_PROVIDER=elevenlabs.');
  }

  let response: Response;
  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICES[voice]}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': tts.apiKey,
          'content-type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: tts.model,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
        signal: AbortSignal.timeout(ELEVENLABS_TIMEOUT_MS),
      },
    );
  } catch (error) {
    // Unreachable or too slow: worth trying again later, unlike a refusal.
    throw new SynthesisError(`ElevenLabs could not be reached: ${(error as Error).message}`, {
      retryable: true,
    });
  }

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

export function synthesisEnabled(tts: SpeechConfig['tts']): boolean {
  return tts.provider !== 'none';
}

export async function synthesize(
  text: string,
  voice: Voice,
  tts: SpeechConfig['tts'],
): Promise<SynthesisResult> {
  switch (tts.provider) {
    case 'mock':
      return mockAudio(text, voice);
    case 'elevenlabs':
      return elevenLabsAudio(text, voice, tts);
    default:
      throw new SynthesisError('Speech generation is switched off.');
  }
}
