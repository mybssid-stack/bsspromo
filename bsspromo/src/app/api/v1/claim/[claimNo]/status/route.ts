import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { claims, payments, vouchers } from '@/db/schema';
import { jsonErr, jsonOk } from '@/lib/api';
import { statusTransaksi } from '@/lib/midtrans';
import { cekClaimToken, voucherToken } from '@/lib/qr-jws';
import { batasiLaju } from '@/lib/ratelimit';
import { terapkanStatusPembayaran } from '@/lib/settle';
import { namaUnit } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Dipanggil berkala oleh halaman tunggu-bayar.
 *
 * Kebenaran status HANYA dari database, yang hanya diubah webhook Midtrans.
 * Halaman ini tidak pernah percaya pada callback onSuccess di browser —
 * callback itu bisa dipanggil siapa saja lewat konsol.
 */
export async function GET(req: Request, ctx: { params: Promise<{ claimNo: string }> }) {
  const { claimNo } = await ctx.params;
  const token = new URL(req.url).searchParams.get('k') ?? '';

  if (!cekClaimToken(claimNo, token)) {
    return jsonErr('FORBIDDEN', 'Tautan status tidak sah.', 403);
  }

  let claim = (await db.select().from(claims).where(eq(claims.claimNo, claimNo)).limit(1))[0];
  if (!claim) return jsonErr('NOT_FOUND', 'Nomor klaim tidak ditemukan.', 404);

  let bayarRows = await db
    .select()
    .from(payments)
    .where(eq(payments.claimId, claim.id))
    .orderBy(desc(payments.attempt))
    .limit(1);

  /**
   * Jaring pengaman kalau webhook tidak pernah sampai.
   *
   * Webhook adalah jalur utama, tapi ia bergantung pada hal-hal di luar
   * kendali kita: header override dihormati Midtrans, DNS domain sudah jadi,
   * fungsi Vercel tidak sedang bermasalah. Kalau salah satunya meleset, uang
   * pelanggan sudah terpotong tapi vouchernya tidak pernah terbit — kegagalan
   * paling mahal di seluruh sistem ini.
   *
   * Jadi saat halaman status bertanya dan klaimnya masih belum lunas, kita
   * tanyakan langsung ke Midtrans. Jawabannya sama-sama terpercaya: koneksinya
   * keluar dari server kita memakai Server Key, bukan kiriman masuk yang bisa
   * dipalsukan.
   *
   * Dibatasi satu kali per 15 detik per klaim supaya polling pelanggan tidak
   * berubah jadi banjir permintaan ke Midtrans.
   */
  const bayar = bayarRows[0];
  if (
    bayar &&
    (claim.status === 'AWAITING_PAYMENT' || claim.status === 'DRAFT') &&
    (await batasiLaju(`cocokkan:${claim.claimNo}`, 1, 15)).success
  ) {
    const dariMidtrans = await statusTransaksi(bayar.orderId);
    if (dariMidtrans) {
      try {
        await terapkanStatusPembayaran(bayar, dariMidtrans, 'pencocokan');
        claim = (await db.select().from(claims).where(eq(claims.id, claim.id)).limit(1))[0] ?? claim;
        bayarRows = await db
          .select()
          .from(payments)
          .where(eq(payments.claimId, claim.id))
          .orderBy(desc(payments.attempt))
          .limit(1);
      } catch (e) {
        // Gagal mencocokkan tidak boleh membuat halaman status ikut mati —
        // pelanggan tetap harus melihat keadaan terakhir yang kita tahu.
        console.error('cocokkan status', claim.claimNo, e);
      }
    }
  }

  const voucherRows = await db.select().from(vouchers).where(eq(vouchers.claimId, claim.id)).limit(1);
  const v = voucherRows[0];

  return jsonOk({
    claimNo: claim.claimNo,
    status: claim.status,
    amount: claim.amountIdr,
    device: namaUnit(claim.brand, claim.model),
    customerName: claim.nameSnapshot,
    paidAt: claim.paidAt?.toISOString() ?? null,
    expiresAt: claim.expiresAt.toISOString(),
    payment: bayarRows[0]
      ? {
          orderId: bayarRows[0].orderId,
          type: bayarRows[0].paymentType,
          status: bayarRows[0].transactionStatus,
        }
      : null,
    voucher: v
      ? { code: v.code, url: `/v/${v.code}?t=${voucherToken(v.code)}`, status: v.status }
      : null,
  });
}
