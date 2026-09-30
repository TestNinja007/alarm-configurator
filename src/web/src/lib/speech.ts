/**
 * Speaking an alarm's message aloud, using the browser's own synthesis.
 *
 * Nothing leaves the machine and nothing is generated in advance: the voices
 * belong to the operating system, so this costs nothing and works offline.
 *
 * The catch is gender. `SpeechSynthesisVoice` exposes only voiceURI, name,
 * lang, localService and default — there is no gender field in the standard
 * and none in practice. A stored preference is therefore matched against the
 * names of the voices that happen to be installed, which differ from machine
 * to machine, and falls back to whatever is available rather than failing.
 */

export type VoicePreference = 'male' | 'female';

export const SPEECH_MAX_LENGTH = 200;

/**
 * Voices shipped with Windows, macOS and the common browsers, grouped by the
 * gender they present as. Matched on the leading given name, so "Microsoft
 * Zira - English (United States)" and "Zira" both resolve.
 */
const KNOWN_VOICES: Record<VoicePreference, string[]> = {
  male: [
    'david', 'mark', 'richard', 'george', 'james', 'ryan', 'guy', 'christopher',
    'eric', 'daniel', 'alex', 'fred', 'oliver', 'thomas', 'aaron', 'arthur',
    'gordon', 'lee', 'liam', 'rishi', 'tom', 'diego', 'jorge', 'juan',
  ],
  female: [
    'zira', 'linda', 'hazel', 'susan', 'catherine', 'eva', 'michelle', 'jenny',
    'aria', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'fiona', 'serena',
    'allison', 'ava', 'susan', 'kate', 'sonia', 'natasha', 'clara', 'emily',
  ],
};

function presentsAs(voice: SpeechSynthesisVoice): VoicePreference | undefined {
  const name = voice.name.toLowerCase();
  if (KNOWN_VOICES.female.some((known) => name.includes(known))) return 'female';
  if (KNOWN_VOICES.male.some((known) => name.includes(known))) return 'male';
  return undefined;
}

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * The installed voices. Chrome populates these asynchronously, so a first call
 * can legitimately return nothing until `voiceschanged` fires.
 */
export function availableVoices(): SpeechSynthesisVoice[] {
  return speechSupported() ? window.speechSynthesis.getVoices() : [];
}

/**
 * The voice that will actually be used for a preference, or undefined when
 * nothing is installed yet.
 *
 * English voices are preferred over others of the right gender, because an
 * English sentence read by a voice built for another language is worse than
 * the wrong gender.
 */
export function resolveVoice(preference: VoicePreference): SpeechSynthesisVoice | undefined {
  const voices = availableVoices();
  if (voices.length === 0) return undefined;

  const matching = voices.filter((voice) => presentsAs(voice) === preference);
  const english = matching.filter((voice) => voice.lang.toLowerCase().startsWith('en'));

  return english[0] ?? matching[0] ?? voices.find((voice) => voice.default) ?? voices[0];
}

/** Speaks a message, replacing anything already being spoken. */
export function speak(text: string, preference: VoicePreference = 'female'): void {
  if (!speechSupported()) return;

  const trimmed = text.trim().slice(0, SPEECH_MAX_LENGTH);
  if (!trimmed) return;

  try {
    // An alarm that has just fired matters more than one still being read out.
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(trimmed);
    const voice = resolveVoice(preference);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    window.speechSynthesis.speak(utterance);
  } catch {
    // Synthesis is a nicety; failing to speak must never break the alarm.
  }
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/**
 * Voices arrive asynchronously in Chromium: the first getVoices() after load
 * returns an empty list, and a `voiceschanged` event follows. Anything that
 * displays which voice will be used has to re-render when that happens, or it
 * reports the fallback for ever.
 *
 * Shaped for useSyncExternalStore, which avoids writing state from an effect.
 */
export function subscribeToVoices(onChange: () => void): () => void {
  if (!speechSupported()) return () => undefined;
  window.speechSynthesis.addEventListener('voiceschanged', onChange);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', onChange);
}

/** A primitive that changes only when the set of installed voices does. */
export function voicesSnapshot(): string {
  return availableVoices()
    .map((voice) => voice.voiceURI)
    .join('|');
}
