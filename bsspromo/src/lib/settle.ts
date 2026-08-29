import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { claims, payments, promoItems } from '@/db/schema';
import { catat } from './audit';
import { keputusanPembayaran } from './midtrans';
import { terbitkanVoucher } from './voucher';

/**
 * Menerapkan status pembayaran ke klaim.
 *
 * Dipakai DUA pemanggil: webhook Midtrans, dan pencocokan langsung dari
 * halaman status. Sengaja satu fungsi — kalau logikanya disalin dua kali,
 * cepat atau lambat keduanya berbeda, dan bedanya baru ketahuan saat ada
 * pelanggan yang uangnya sudah masuk tapi vouchernya tidak terbit.
 *
 * Idempoten: aman dipanggil berulang untuk transaksi yang sama.
 */
export type NotifPembayaran = {
  transaction_status?: string;
  fraud_status?: string;
  status_code?: string;
  transaction_id?: string;
  payment_type?: string;
  settlement_time?: string;
  gross_amount?: string;
  va_numbers?: { bank?: string; va_number?: string }[];
  permata_va_number?: string;
  bank?: string;
  store?: string;
};

export async function terapkanStatusPembayaran(
  bayar: { id: string; claimId: string; grossAmountIdr: number },
  n: NotifPembayaran,
  sumber: 'webhook' | 'pencocokan',
): Promise<'PAID' | 'PENDING' | 'FAILED'> {
  const va = n.va_numbers?.[0];

  await db
    .update(payments)
    .set({
      paymentType: n.payment_type ?? null,
      bank: va?.bank ?? n.bank ?? null,
      vaNumber: va?.va_number ?? n.permata_va_number ?? null,
      store: n.store ?? null,
      transactionId: n.transaction_id ?? null,
      transactionStatus: n.transaction_status ?? null,
      fraudStatus: n.fraud_status ?? null,
      statusCode: n.status_code ?? null,
      // Midtrans mengirim waktu tanpa zona ("2026-08-29 14:03:11"); itu WIB.
      settlementAt: n.settlement_time
        ? new Date(n.settlement_time.replace(' ', 'T') + '+07:00')
        : null,
      rawResponse: n as never,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, bayar.id));

  const keputusan = keputusanPembayaran(n);

  if (keputusan === 'PAID') {
    const rows = await db.select().from(claims).where(eq(claims.id, bayar.claimId)).limit(1);
    const claim = rows[0];

    if (claim && claim.status !== 'PAID') {
      await db
        .update(claims)
        .set({ status: 'PAID', paidAt: new Date(), updatedAt: new Date() })
        .where(eq(claims.id, claim.id));

      // Hanya untuk item yang memang dibatasi stoknya.
      await db
        .update(promoItems)
        .set({ stock: sql`GREATEST(${promoItems.stock} - 1, 0)` })
        .where(eq(promoItems.id, claim.promoItemId));

      await catat({
        actorType: 'SYSTEM',
        action: 'payment.settle',
        entity: 'claims',
        entityId: claim.id,
        after: { sumber, type: n.payment_type, amount: bayar.grossAmountIdr },
      });
    }

    // Idempoten: mengembalikan voucher yang sudah ada kalau sudah pernah dibuat.
    await terbitkanVoucher(bayar.claimId);
  } else if (keputusan === 'FAILED') {
    // Klaim yang SUDAH lunas tidak boleh diturunkan statusnya oleh notifikasi
    // percobaan bayar lain yang kebetulan gagal atau kedaluwarsa.
    await db
      .update(claims)
      .set({ status: 'FAILED', updatedAt: new Date() })
      .where(sql`${claims.id} = ${bayar.claimId} AND ${claims.status} <> 'PAID'`);
  }

  return keputusan;
}
