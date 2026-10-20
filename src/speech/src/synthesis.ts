import { createHash } from 'node:crypto';
import type { SpeechConfig } from './config.js';
import { synthesize, type Voice } from './providers.js';
import type { AudioStore, StoredAudio } from './store.js';

/**
 * Generated audio, kept so the same sentence is never paid for twice.
 *
 * Moved from the main API's speech cache. The key covers the provider as well
 * as the voice and the words, so switching provider produces new audio rather
 * than serving the old provider's.
 */

export interface Synthesised extends StoredAudio {
  /** False when it came from the store rather than the provider. */
  generated: boolean;
}

export function audioKey(provider: string, voice: Voice, text: string): string {
  return createHash('sha256').update(`${provider}\u0000${voice}\u0000${text}`).digest('hex');
}

/**
 * The audio for a message, generating it only if this exact text in this
 * exact voice from this provider has not been generated before.
 */
export async function audioFor(
  text: string,
  voice: Voice,
  tts: SpeechConfig['tts'],
  store: AudioStore,
): Promise<Synthesised> {
  const id = audioKey(tts.provider, voice, text);

  const existing = await store.find(id);
  if (existing) return { ...existing, generated: false };

  const fresh = await synthesize(text, voice, tts);
  const audio: StoredAudio = {
    id,
    provider: tts.provider,
    voice,
    text,
    contentType: fresh.contentType,
    bytes: fresh.bytes,
  };
  await store.save(audio);

  return { ...audio, generated: true };
}
