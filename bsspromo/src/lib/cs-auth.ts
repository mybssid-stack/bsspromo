import crypto from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { env } from './env';

/**
 * Autentikasi request dari standby.php (cPanel) ke Next.js.
 *
 * Bentuk tanda tangan — HARUS sama persis dengan promo_api() di standby.php:
 *   signature = hex( hmac_sha256( ts + "." + nonce + "." + sha256(body), SECRET ) )
 *
 * Tiga lapis: kunci benar, waktu masih dekat (anti replay lama), nonce belum
 * pernah dipakai (anti replay cepat). Ketiganya perlu — signature saja bisa
 * direkam lalu dikirim ulang oleh siapa pun yang menyadap jaringan.
 */

const TOLERANSI_DETIK = 120;

export type HasilAuth =
  | { ok: true; clientKey: string; body: string }
  | { ok: false; status: number; code: string; message: string };

export async function autentikasiCS(req: Request): Promise<HasilAuth> {
  const body = await req.text();

  const key = req.headers.get('x-bss-key') ?? '';
  const ts = req.headers.get('x-bss-timestamp') ?? '';
  const nonce = req.headers.get('x-bss-nonce') ?? '';
  const sig = req.headers.get('x-bss-signature') ?? '';

  if (!key || !ts || !nonce || !sig) {
    return { ok: false, status: 401, code: 'MISSING_AUTH', message: 'Header tanda tangan tidak lengkap.' };
  }
  if (key !== env.csApiClientKey) {
    return { ok: false, status: 401, code: 'UNKNOWN_CLIENT', message: 'Client key tidak dikenal.' };
  }

  const selisih = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(selisih) || selisih > TOLERANSI_DETIK) {
    return {
      ok: false,
      status: 401,
      code: 'STALE_TIMESTAMP',
      message: 'Waktu server cPanel dan Vercel terpaut lebih dari 2 menit.',
    };
  }

  const expected = crypto
    .createHmac('sha256', env.csApiSecret)
    .update(`${ts}.${nonce}.${crypto.createHash('sha256').update(body).digest('hex')}`)
    .digest('hex');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, status: 401, code: 'BAD_SIGNATURE', message: 'Tanda tangan tidak cocok.' };
  }

  // Nonce sekali pakai. PRIMARY KEY di api_nonces yang jadi wasitnya, bukan
  // "SELECT dulu lalu INSERT" — dua request kembar bisa lolos di celah itu.
  try {
    const hasil = await db.execute(sql`
      INSERT INTO api_nonces (nonce, client_key)
      VALUES (${nonce}, ${key})
      ON CONFLICT (nonce) DO NOTHING
      RETURNING nonce
    `);
    if (hasil.rows.length === 0) {
      return { ok: false, status: 409, code: 'REPLAY', message: 'Nonce sudah pernah dipakai.' };
    }
  } catch {
    // Kegagalan mencatat nonce tidak boleh mematikan layanan CS di depan
    // pelanggan. Tanda tangan + jendela waktu masih menahan pemalsuan.
  }

  try {
    await db.execute(sql`UPDATE api_clients SET last_used_at = now() WHERE client_key = ${key}`);
  } catch {
    /* tidak penting */
  }

  return { ok: true, clientKey: key, body };
}

/** Pembatasan IP opsional — isi CS_API_ALLOWED_IPS kalau IP cPanel tetap. */
export function ipDiizinkan(req: Request): boolean {
  const daftar = env.csApiAllowedIps;
  if (daftar.length === 0) return true;
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    '';
  return daftar.includes(ip);
}
