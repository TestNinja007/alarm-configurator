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

export const config = {
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
  sessionSecret: process.env.SESSION_SECRET ?? 'insecure-development-session-secret',
  sessionTtlDays: integer('SESSION_TTL_DAYS', 7),
  /** Directory holding the built SPA; absent during API-only development. */
  webDistDir: resolve(repoRoot, 'src', 'web', 'dist'),
  version: '0.1.0',
} as const;
