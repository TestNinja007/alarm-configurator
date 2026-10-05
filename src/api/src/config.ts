import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

// The repository root is three levels above src/api/src.
export const repoRoot = resolve(import.meta.dirname, '..', '..', '..');

loadDotenv({ path: resolve(repoRoot, '.env'), quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

const isProduction = process.env.NODE_ENV === 'production';

function sessionSecret(): string {
  const supplied = process.env.SESSION_SECRET;
  if (supplied && supplied.length >= 32) return supplied;
  // A public deployment must not fall back to a known development value.
  if (isProduction) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters in production.');
  }
  return supplied ?? 'insecure-development-session-secret';
}

export const config = {
  isProduction,
  databaseUrl: required('DATABASE_URL'),
  /**
   * Connections the pool will open, and how long a caller waits for one.
   *
   * Both were implicit, and the second one was absent entirely, which is what
   * DEF-08 is: with no acquisition timeout a caller that cannot get a
   * connection waits indefinitely rather than failing. Load testing measured
   * fifty-second maximums on database-backed endpoints while every percentile
   * threshold passed, and the functional suite then reproduced it at four
   * parallel workers — a far lower bar than the load profile suggested.
   *
   * A caller that has waited five seconds for a connection has already lost.
   * Telling it so converts a hang, which a client cannot act on, into an
   * error, which it can.
   */
  databasePoolMax: integer('DATABASE_POOL_MAX', 10),
  databaseAcquireTimeoutMs: integer('DATABASE_ACQUIRE_TIMEOUT_MS', 5_000),
  port: integer('PORT', 8080),
  host: process.env.HOST ?? '0.0.0.0',
  /**
   * Whether anyone may create an account. Off by default so the seeded-users
   * baseline the test framework is written against stays unchanged; the public
   * deployment turns it on.
   */
  registrationOpen: process.env.REGISTRATION_OPEN === '1',
  /**
   * Shows the public-sandbox banner in the UI. Off by default, and deliberately
   * so: a permanent banner on every page would sit in the middle of whatever a
   * test framework is trying to assert against locally.
   */
  demoMode: process.env.DEMO_MODE === '1',
  /** T-01..T-03 are only mounted when this is exactly "1". */
  testSupport: process.env.TEST_SUPPORT === '1',
  seedAnchor: process.env.SEED_ANCHOR ?? '2026-06-15T18:00:00Z',
  /**
   * A-01: a fixed, deliberate delay in front of the alarm list so the skeleton
   * state is observable. Never random. Set to 0 to remove it.
   */
  listDelayMs: integer('LIST_DELAY_MS', 600),
  sessionSecret: sessionSecret(),
  /**
   * Session cookies are Secure whenever the app is served over HTTPS. Defaults
   * to on in production, where a cookie sent in the clear would be a real
   * problem, and off locally, where there is no TLS to attach it to.
   */
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === '1'
    : isProduction,
  /**
   * Whether startup seeds the database.
   *   if-empty  seed only when there are no users yet (the production default)
   *   always    reseed on every boot, which is what a disposable container wants
   *   never     leave the database alone
   */
  seedOnStart: (process.env.SEED_ON_START ?? (isProduction ? 'if-empty' : 'always')) as
    | 'if-empty'
    | 'always'
    | 'never',
  seedProfile: (process.env.SEED_PROFILE ?? 'demo') as 'demo' | 'empty',
  sessionTtlDays: integer('SESSION_TTL_DAYS', 7),
  /**
   * Outbound email. `capture` is the default so a bare `npm start` needs no
   * mail server; docker compose runs Mailpit and sets this to smtp.
   */
  mail: {
    /**
     * `brevo` posts over HTTPS instead of speaking SMTP. Hosting platforms
     * routinely block outbound SMTP ports to deter spam — Render does, which
     * is why an SMTP transport times out there however correct the
     * credentials are — and port 443 is never blocked.
     */
    transport: (process.env.MAIL_TRANSPORT ?? 'capture') as 'smtp' | 'brevo' | 'capture' | 'log',
    host: process.env.MAIL_HOST ?? '127.0.0.1',
    port: integer('MAIL_PORT', 1025),
    secure: process.env.MAIL_SECURE === '1',
    /**
     * Skipping STARTTLS means the SMTP login is sent in the clear, so it
     * defaults to off. Only a local catcher like Mailpit, which speaks plain
     * SMTP and never leaves the machine, should turn it on.
     */
    ignoreTls: process.env.MAIL_IGNORE_TLS === '1',
    user: process.env.MAIL_USER,
    password: process.env.MAIL_PASSWORD,
    from: process.env.MAIL_FROM ?? 'Nudge <no-reply@nudge.test>',
    /** Brevo REST API key, the one beginning xkeysib-. Only used by `brevo`. */
    apiKey: process.env.MAIL_API_KEY,
  },
  /**
   * Server-side speech. `mock` generates real playable audio locally, so the
   * whole path can be exercised without an account, a key or a quota.
   */
  tts: {
    provider: (process.env.TTS_PROVIDER ?? 'none') as 'none' | 'mock' | 'elevenlabs',
    apiKey: process.env.TTS_API_KEY,
    model: process.env.TTS_MODEL ?? 'eleven_multilingual_v2',
  },
  /** Directory holding the built SPA; absent during API-only development. */
  webDistDir: resolve(repoRoot, 'src', 'web', 'dist'),
  version: '0.1.0',
} as const;
