import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

/**
 * Hash password admin memakai scrypt bawaan Node.
 *
 * Blueprint menyebut Argon2id. Argon2 di Node butuh modul native
 * (@node-rs/argon2 / argon2) yang harus dikompilasi atau punya binary
 * prebuilt per platform — sumber gagal-build paling sering di Vercel.
 * scrypt ada DI DALAM Node, tidak bisa gagal dipasang, dan sama-sama
 * memory-hard. Untuk sejumlah kecil akun admin ini pilihan yang tepat.
 *
 * Format tersimpan: scrypt$N$r$p$saltBase64$hashBase64
 */
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(plain, salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parts = String(stored ?? '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, sN, sr, sp, saltB64, hashB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const got = await scrypt(plain, salt, expected.length, {
      N: Number(sN),
      r: Number(sr),
      p: Number(sp),
      maxmem: 64 * 1024 * 1024,
    });
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}
