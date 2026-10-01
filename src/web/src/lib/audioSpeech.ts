import { api } from '../api/client';
import { speak, type VoicePreference } from './speech';

/**
 * Playing server-generated speech, falling back to the browser's own voice.
 *
 * The server is preferred when it is configured, because the same voice then
 * comes out of every machine — the browser's voices depend on the operating
 * system. But a provider can be unreachable, out of quota or simply switched
 * off, and an alarm that stays silent because of that is worse than one that
 * speaks in the wrong voice. So every failure falls through.
 */

interface SpeechSettings {
  enabled: boolean;
  provider: string;
  maxLength: number;
}

interface Synthesised {
  id: string;
  url: string;
  contentType: string;
  bytes: number;
  generated: boolean;
}

let settings: SpeechSettings | undefined;
let settingsPromise: Promise<SpeechSettings> | undefined;

/** Asked once per session; the deployment does not change underneath it. */
export async function speechSettings(): Promise<SpeechSettings> {
  if (settings) return settings;
  settingsPromise ??= api
    .get<SpeechSettings>('/speech/settings')
    .then((result) => {
      settings = result;
      return result;
    })
    .catch(() => {
      const off: SpeechSettings = { enabled: false, provider: 'none', maxLength: 200 };
      settings = off;
      return off;
    });
  return settingsPromise;
}

/** The element is reused so an alarm firing cuts off the one before it. */
let player: HTMLAudioElement | undefined;

function play(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    player ??= new Audio();
    player.pause();
    player.src = url;
    player.onended = () => resolve();
    player.onerror = () => reject(new Error('Audio failed to play'));
    // Playback can be refused outright when the page has had no interaction.
    player.play().catch(reject);
  });
}

/**
 * Says something, using the server's voice when there is one.
 *
 * Returns how it was said, which is worth knowing: a caller that asked for a
 * generated voice and got the browser's has been silently downgraded.
 */
export async function say(
  text: string,
  voice: VoicePreference,
): Promise<'server' | 'browser' | 'silent'> {
  const trimmed = text.trim();
  if (!trimmed) return 'silent';

  const current = await speechSettings();

  if (current.enabled) {
    try {
      const audio = await api.post<Synthesised>('/speech', { text: trimmed, voice });
      await play(audio.url);
      return 'server';
    } catch {
      // Falls through deliberately: quota, network, autoplay policy and a
      // missing key all end up here, and none of them should mean silence.
    }
  }

  speak(trimmed, voice);
  return 'browser';
}

/** Warms the cache so an alarm does not wait on generation when it fires. */
export async function prepare(text: string, voice: VoicePreference): Promise<void> {
  const current = await speechSettings();
  if (!current.enabled || !text.trim()) return;
  try {
    await api.post<Synthesised>('/speech', { text: text.trim(), voice });
  } catch {
    // Warming is an optimisation; failing to warm changes nothing.
  }
}
