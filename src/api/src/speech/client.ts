/**
 * The main API's client for the speech service.
 *
 * The only code in this application that knows the speech service exists. It
 * turns everything that can go wrong across a network into one of a few kinds
 * the route can act on, because a caller of another service has to handle
 * failures that a function call never had: the service being down, being slow,
 * refusing, or disagreeing about what was asked for.
 *
 * `fetch` is injected so the contract tests can point this at Pact's mock
 * service and the resilience tests can produce each failure on demand.
 */

export type Voice = 'male' | 'female';

export interface ServiceSettings {
  enabled: boolean;
  provider: string;
  maxLength: number;
}

export interface Synthesis {
  id: string;
  contentType: string;
  bytes: number;
  generated: boolean;
}

export interface Audio {
  contentType: string;
  bytes: Buffer;
}

/**
 * What kind of failure, because each wants a different answer:
 *
 *   unavailable    down, too slow, or busy - it may clear up. 503.
 *   refused        up, and said no in a way that will repeat. 502.
 *   misconfigured  our token was rejected. An operator problem, not the
 *                  caller's, and the one most worth shouting about. 502.
 */
export type FailureKind = 'unavailable' | 'refused' | 'misconfigured';

export class SpeechServiceError extends Error {
  readonly kind: FailureKind;
  readonly retryAfterSeconds: number | undefined;

  constructor(message: string, kind: FailureKind, options: { retryAfterSeconds?: number; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'SpeechServiceError';
    this.kind = kind;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export interface SpeechClientOptions {
  /** Unset means no speech service, and speech is simply off. */
  url: string | undefined;
  token: string | undefined;
  /** For synthesis, which waits on the provider. Longer than the service's own provider timeout. */
  timeoutMs: number;
  /** For settings, which the browser asks for once and should never wait long on. */
  settingsTimeoutMs: number;
  fetch?: typeof fetch;
}

export interface SpeechClient {
  /** Whether a speech service is configured at all. */
  readonly configured: boolean;
  settings(): Promise<ServiceSettings>;
  synthesise(text: string, voice: Voice): Promise<Synthesis>;
  /** Undefined when the service has no audio with that id. */
  audio(id: string): Promise<Audio | undefined>;
}

function retryAfter(response: Response): number | undefined {
  const raw = response.headers.get('retry-after');
  const seconds = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(seconds) ? seconds : undefined;
}

async function describe(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export function createSpeechClient(options: SpeechClientOptions): SpeechClient {
  const fetchImpl = options.fetch ?? fetch;
  const base = options.url?.replace(/\/+$/, '');

  async function call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    if (!base) {
      throw new SpeechServiceError('No speech service is configured.', 'unavailable');
    }
    try {
      return await fetchImpl(`${base}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          authorization: `Bearer ${options.token ?? ''}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      /*
       * Refused connection, DNS failure, or our own timeout firing. All three
       * look the same from here and mean the same thing to the caller: the
       * service is not answering right now.
       */
      const timedOut = (error as Error).name === 'TimeoutError';
      throw new SpeechServiceError(
        timedOut
          ? `The speech service did not answer within ${timeoutMs}ms.`
          : `The speech service could not be reached: ${(error as Error).message}`,
        'unavailable',
        { cause: error },
      );
    }
  }

  /** The failures every endpoint shares. */
  async function failure(response: Response): Promise<SpeechServiceError> {
    const message = await describe(response);
    if (response.status === 401) {
      return new SpeechServiceError(
        `The speech service rejected this API's token: ${message}`,
        'misconfigured',
      );
    }
    // Any 5xx but 502 is the service itself struggling, which may pass.
    if (response.status >= 500 && response.status !== 502) {
      return new SpeechServiceError(message, 'unavailable', {
        retryAfterSeconds: retryAfter(response),
      });
    }
    // 502 from the service is its provider refusing; a 4xx here is a request
    // the service will refuse every time. Neither is helped by retrying.
    return new SpeechServiceError(message, 'refused');
  }

  return {
    configured: Boolean(base),

    async settings() {
      const response = await call('/v1/settings', { method: 'GET' }, options.settingsTimeoutMs);
      if (!response.ok) throw await failure(response);
      return (await response.json()) as ServiceSettings;
    },

    async synthesise(text, voice) {
      const response = await call(
        '/v1/syntheses',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, voice }),
        },
        options.timeoutMs,
      );
      if (!response.ok) throw await failure(response);
      return (await response.json()) as Synthesis;
    },

    async audio(id) {
      const response = await call(`/v1/audio/${encodeURIComponent(id)}`, { method: 'GET' }, options.timeoutMs);
      if (response.status === 404) return undefined;
      if (!response.ok) throw await failure(response);
      return {
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        bytes: Buffer.from(await response.arrayBuffer()),
      };
    },
  };
}
