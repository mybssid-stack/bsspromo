import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { claims, vouchers } from '@/db/schema';
import { jsonErr, jsonOk } from '@/lib/api';
import { batasiLaju, ipDari } from '@/lib/ratelimit';
import { namaUnit } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Cek status voucher dari halaman publik.
 *
 * Sengaja HANYA mengembalikan status, masa berlaku, dan tipe unit. Nama,
 * nomor HP, dan alamat tidak ikut — endpoint ini terbuka untuk siapa saja,
 * dan kode voucher bisa terbaca orang lain dari layar pemiliknya. Untuk
 * membuka voucher utuh tetap butuh token di tautan /v/{code}?t=...
 */
export async function GET(req: Request) {
  const ip = ipDari(req);
  const rl = await batasiLaju(`vstatus:${ip}`, 20, 60);
  if (!rl.success) return jsonErr('RATE_LIMITED', 'Terlalu banyak percobaan. Tunggu sebentar.', 429);

  const code = (new URL(req.url).searchParams.get('code') ?? '').trim().toUpperCase();
  if (code.length < 4) return jsonErr('BAD_INPUT', 'Masukkan kode vouchernya dulu.');

  const rows = await db
    .select({ v: vouchers, c: claims })
    .from(vouchers)
    .innerJoin(claims, eq(claims.id, vouchers.claimId))
    .where(eq(vouchers.code, code))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return jsonOk({
      found: false,
      message: 'Kode voucher tidak ditemukan. Periksa lagi ejaannya, atau hubungi CS.',
    });
  }

  const kedaluwarsa = row.v.validUntil.getTime() < Date.now();
  const status = row.v.status === 'ACTIVE' && kedaluwarsa ? 'EXPIRED' : row.v.status;

  return jsonOk({
    found: true,
    code: row.v.code,
    status,
    device: namaUnit(row.c.brand, row.c.model),
    validUntil: row.v.validUntil.toISOString(),
    redeemedAt: row.v.redeemedAt?.toISOString() ?? null,
    warrantyEndAt: row.v.warrantyEndAt?.toISOString() ?? null,
  });
}
