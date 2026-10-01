import { createHash } from 'node:crypto';
import { clock } from '../clock.js';
import { config } from '../config.js';
import { query, queryOne } from '../db/pool.js';
import { synthesize, type SynthesisResult, type Voice } from './providers.js';

/**
 * Generated audio, kept so the same sentence is never paid for twice.
 *
 * The key covers the provider as well as the voice and the words: switching
 * provider should produce new audio rather than serve the old provider's.
 */

export interface CachedAudio extends SynthesisResult {
  id: string;
  /** False when it came from the cache, which is what a test wants to assert. */
  generated: boolean;
}

export function audioKey(text: string, voice: Voice): string {
  return createHash('sha256')
    .update(`${config.tts.provider}\u0000${voice}\u0000${text}`)
    .digest('hex');
}

interface AudioRow {
  content_type: string;
  bytes: Buffer;
}

export async function findAudio(id: string): Promise<SynthesisResult | undefined> {
  const row = await queryOne<AudioRow>(
    'SELECT content_type, bytes FROM speech_audio WHERE id = $1',
    [id],
  );
  if (!row) return undefined;

  // Touched so entries that nobody plays can be identified later.
  await query('UPDATE speech_audio SET last_used_at = $1 WHERE id = $2', [clock.now(), id]);

  return { bytes: row.bytes, contentType: row.content_type };
}

/**
 * The audio for a message, generating it only if this exact text in this exact
 * voice has not been generated before.
 */
export async function audioFor(text: string, voice: Voice): Promise<CachedAudio> {
  const id = audioKey(text, voice);

  const existing = await findAudio(id);
  if (existing) return { ...existing, id, generated: false };

  const fresh = await synthesize(text, voice);
  const now = clock.now();

  await query(
    `INSERT INTO speech_audio (id, provider, voice, text, content_type, bytes, created_at, last_used_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (id) DO NOTHING`,
    [id, config.tts.provider, voice, text, fresh.contentType, fresh.bytes, now],
  );

  return { ...fresh, id, generated: true };
}
