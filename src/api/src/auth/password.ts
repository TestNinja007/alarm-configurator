/**
 * Password hashing with scrypt from Node's standard library.
 *
 * argon2 would be the fashionable choice, but it needs a native build step;
 * scrypt is memory-hard, built in, and has no install-time dependencies, which
 * keeps `docker compose up --build` offline and boring.
 *
 * Stored format: scrypt$N$r$p$<salt base64>$<hash base64>
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 32;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number.parseInt(rawN ?? '', 10);
  const r = Number.parseInt(rawR ?? '', 10);
  const p = Number.parseInt(rawP ?? '', 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(rawSalt ?? '', 'base64');
  const expected = Buffer.from(rawHash ?? '', 'base64');
  const derived = await scrypt(password, salt, expected.length || KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: PARAMS.maxmem,
  });

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
