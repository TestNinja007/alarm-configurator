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
  port: integer('PORT', 8080),
  host: process.env.HOST ?? '0.0.0.0',
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
  /** Directory holding the built SPA; absent during API-only development. */
  webDistDir: resolve(repoRoot, 'src', 'web', 'dist'),
  version: '0.1.0',
} as const;
