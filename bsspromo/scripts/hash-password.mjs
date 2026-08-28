#!/usr/bin/env node
/**
 * Membuat hash kata sandi admin untuk kolom admin_users.password_hash.
 *
 *   node scripts/hash-password.mjs "SandiBaruKu"
 *
 * Lalu di Neon SQL Editor:
 *   UPDATE admin_users SET password_hash = '<hasil>' WHERE email = 'owner@mybss.cloud';
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const N = 16384, r = 8, p = 1, KEYLEN = 64;

const sandi = process.argv[2];
if (!sandi) {
  console.error('Pakai: node scripts/hash-password.mjs "SandiBaruKu"');
  process.exit(1);
}
if (sandi.length < 10) {
  console.error('Sandi minimal 10 karakter.');
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = await scrypt(sandi, salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
console.log(`scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`);
