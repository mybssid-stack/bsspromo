import crypto from 'node:crypto';
import { env } from './env';

/**
 * Isi QR voucher. Nama field sengaja dipendekkan supaya matriks QR tidak
 * terlalu rapat — QR yang rapat susah dipindai dari layar HP yang retak.
 */
export type QrPayload = {
  v: 1;
  t: 'BSSPROMO';
  vc: string;   // kode voucher
  inv: string;  // nomor invoice / claim_no
  cn: string;   // nama pelanggan
  ph: string;   // nomor HP kanonik 62...
  ad: string;   // alamat (dipotong 90 karakter)
  br: string;   // merek
  md: string;   // model
  pt: string;   // jenis part, mis. LCD
  qg: string;   // kualitas, mis. Standart
  amt: number;  // nominal dibayar
  pm: string;   // metode bayar
  ps: 'PAID';
  wd: number;   // garansi (hari)
  pd: string;   // waktu bayar ISO
  iat: number;
  exp: number;
};

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Tanda tangani payload jadi JWS compact: header.payload.signature */
export function signQR(payload: QrPayload): string {
  const header = b64u(
    JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: env.qrKeyId }),
  );
  const body = b64u(JSON.stringify(payload));
  const signing = `${header}.${body}`;
  const sig = crypto
    .createHmac('sha256', env.qrSigningSecret)
    .update(signing)
    .digest('base64url');
  return `${signing}.${sig}`;
}

export type VerifyResult =
  | { ok: true; data: QrPayload }
  | { ok: false; reason: string };

/** Kebalikan signQR. Dipakai kalau suatu saat Next.js perlu membaca QR juga. */
export function verifyQR(jws: string): VerifyResult {
  const parts = String(jws ?? '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'FORMAT' };
  const [h, p, s] = parts;

  const expected = crypto
    .createHmac('sha256', env.qrSigningSecret)
    .update(`${h}.${p}`)
    .digest('base64url');

  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  let data: QrPayload;
  try {
    data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'BAD_PAYLOAD' };
  }
  if (data.t !== 'BSSPROMO') return { ok: false, reason: 'WRONG_TYPE' };
  if ((data.exp ?? 0) < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'EXPIRED' };
  }
  return { ok: true, data };
}

/**
 * Token tautan permanen voucher: /v/{code}?t={token}
 * Deterministik, jadi tautannya tidak berubah — pelanggan boleh menyimpannya.
 */
export function voucherToken(code: string): string {
  return crypto
    .createHmac('sha256', env.voucherUrlSecret)
    .update(`voucher:${code}`)
    .digest('base64url')
    .slice(0, 32);
}

export function cekVoucherToken(code: string, token: string): boolean {
  const expected = voucherToken(code);
  const a = Buffer.from(String(token ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function voucherUrl(code: string): string {
  return `${env.baseUrl}/v/${encodeURIComponent(code)}?t=${voucherToken(code)}`;
}

/**
 * Token untuk halaman status klaim: /klaim/{claimNo}?k={token}
 * Nomor klaim itu berurutan, jadi tanpa token siapa pun bisa menebak
 * BSS-PRM-260829-0001 dan mengintip nama & nomor HP orang lain.
 */
export function claimToken(claimNo: string): string {
  return crypto
    .createHmac('sha256', env.voucherUrlSecret)
    .update(`claim:${claimNo}`)
    .digest('base64url')
    .slice(0, 24);
}

export function cekClaimToken(claimNo: string, token: string): boolean {
  const expected = claimToken(claimNo);
  const a = Buffer.from(String(token ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** sha256(nomor + pepper) — dipakai untuk log & rate limit tanpa menyimpan nomor. */
export function hashPhone(e164: string): string {
  return crypto
    .createHash('sha256')
    .update(e164 + env.phoneHashPepper)
    .digest('hex');
}
