import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { claims, payments, vouchers } from '@/db/schema';
import { jsonErr, jsonOk } from '@/lib/api';
import { autentikasiCS, ipDiizinkan } from '@/lib/cs-auth';
import { formatPhoneLocal } from '@/lib/phone';
import { desc } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Skema = z.object({ code: z.string().min(4).max(40) });

/**
 * Dipanggil standby.php sesaat setelah QR terbaca.
 *
 * Tanda tangan QR sudah membuktikan datanya asli, tapi TIDAK membuktikan
 * vouchernya belum dipakai — QR yang sama bisa difoto dan dipakai ulang.
 * Itulah yang dicek di sini. Sekalian mengirim alamat lengkap, yang di QR
 * dipotong 90 karakter.
 */
export async function POST(req: Request) {
  if (!ipDiizinkan(req)) return jsonErr('IP_BLOCKED', 'IP tidak diizinkan.', 403);

  const auth = await autentikasiCS(req);
  if (!auth.ok) return jsonErr(auth.code, auth.message, auth.status);

  let body: unknown;
  try {
    body = JSON.parse(auth.body);
  } catch {
    return jsonErr('BAD_JSON', 'Format permintaan tidak dikenali.');
  }
  const parsed = Skema.safeParse(body);
  if (!parsed.success) return jsonErr('BAD_INPUT', 'Kode voucher tidak dikirim.');

  const code = parsed.data.code.trim().toUpperCase();

  const rows = await db
    .select({ v: vouchers, c: claims })
    .from(vouchers)
    .innerJoin(claims, eq(claims.id, vouchers.claimId))
    .where(eq(vouchers.code, code))
    .limit(1);

  const row = rows[0];
  if (!row) return jsonErr('NOT_FOUND', 'Kode voucher tidak ditemukan.', 404);

  const { v, c } = row;

  // Kedaluwarsa dihitung saat dibaca, bukan menunggu cron mengubah kolom.
  const statusEfektif =
    v.status === 'ACTIVE' && v.validUntil.getTime() < Date.now() ? 'EXPIRED' : v.status;

  const bayarRows = await db
    .select()
    .from(payments)
    .where(eq(payments.claimId, c.id))
    .orderBy(desc(payments.attempt))
    .limit(1);
  const bayar = bayarRows[0];

  return jsonOk({
    voucher: {
      code: v.code,
      status: statusEfektif,
      validUntil: v.validUntil.toISOString(),
      redeemedAt: v.redeemedAt?.toISOString() ?? null,
      redeemedByName: v.redeemedByName ?? null,
      serviceTicketNo: v.serviceTicketNo ?? null,
    },
    claim: {
      invoiceNo: c.claimNo,
      customer: {
        fullName: c.nameSnapshot,
        phone: c.phoneSnapshot,
        phoneDisplay: formatPhoneLocal(c.phoneSnapshot),
        address: c.addressSnapshot ?? '',
      },
      device: { brand: c.brand, model: c.model },
      service: {
        partType: c.partType,
        qualityGrade: c.qualityGrade ?? '',
        warrantyDays: c.warrantyDays,
      },
      payment: {
        amount: c.amountIdr,
        method: bayar?.paymentType ?? 'qris',
        status: c.status === 'PAID' ? 'PAID' : c.status,
        paidAt: c.paidAt?.toISOString() ?? null,
      },
    },
  });
}
