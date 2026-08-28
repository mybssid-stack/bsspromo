import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { claims, vouchers, payments } from '@/db/schema';
import { signQR, type QrPayload } from './qr-jws';
import { ambilPengaturan } from './settings';

/**
 * Terbitkan voucher untuk klaim yang sudah lunas.
 *
 * Idempoten: dipanggil dua kali untuk klaim yang sama akan mengembalikan
 * voucher yang sudah ada, bukan membuat yang kedua. Ini penting karena
 * Midtrans bisa mengirim webhook 'settlement' lebih dari sekali.
 */
export async function terbitkanVoucher(claimId: string): Promise<{ code: string; jws: string } | null> {
  const adaRows = await db.select().from(vouchers).where(eq(vouchers.claimId, claimId)).limit(1);
  if (adaRows[0]) return { code: adaRows[0].code, jws: adaRows[0].qrJws };

  const claimRows = await db.select().from(claims).where(eq(claims.id, claimId)).limit(1);
  const claim = claimRows[0];
  if (!claim) return null;

  const bayarRows = await db
    .select()
    .from(payments)
    .where(eq(payments.claimId, claimId))
    .orderBy(sql`settlement_at desc nulls last`)
    .limit(1);
  const bayar = bayarRows[0];

  const p = await ambilPengaturan();
  const masaHari = Number(p['promo.voucher_valid_days']) || 30;
  const berlakuSampai = new Date(Date.now() + masaHari * 24 * 60 * 60 * 1000);

  // Kode dibuat oleh database supaya bentrok kode mustahil terjadi.
  const kodeRes = await db.execute(sql`SELECT gen_voucher_code() AS code`);
  const code = String((kodeRes.rows[0] as { code: string }).code);

  const sekarang = Math.floor(Date.now() / 1000);
  const payload: QrPayload = {
    v: 1,
    t: 'BSSPROMO',
    vc: code,
    inv: claim.claimNo,
    cn: claim.nameSnapshot,
    ph: claim.phoneSnapshot,
    // Alamat dipotong supaya matriks QR tidak terlalu rapat. Alamat lengkap
    // tetap bisa diambil standby.php lewat endpoint inspect.
    ad: (claim.addressSnapshot ?? '').slice(0, 90),
    br: claim.brand,
    md: claim.model,
    pt: claim.partType,
    qg: claim.qualityGrade ?? '',
    amt: claim.amountIdr,
    pm: bayar?.paymentType ?? 'qris',
    ps: 'PAID',
    wd: claim.warrantyDays,
    pd: (claim.paidAt ?? new Date()).toISOString(),
    iat: sekarang,
    exp: Math.floor(berlakuSampai.getTime() / 1000),
  };

  const jws = signQR(payload);

  try {
    await db.insert(vouchers).values({
      code,
      claimId,
      qrJws: jws,
      validUntil: berlakuSampai,
    });
  } catch {
    // Balapan: proses lain menerbitkan lebih dulu. Ambil punya dia.
    const ulang = await db.select().from(vouchers).where(eq(vouchers.claimId, claimId)).limit(1);
    if (ulang[0]) return { code: ulang[0].code, jws: ulang[0].qrJws };
    throw new Error('Gagal menerbitkan voucher.');
  }

  return { code, jws };
}
