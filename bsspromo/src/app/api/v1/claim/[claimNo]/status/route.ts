import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { claims, payments, vouchers } from '@/db/schema';
import { jsonErr, jsonOk } from '@/lib/api';
import { cekClaimToken, voucherToken } from '@/lib/qr-jws';

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

  const rows = await db.select().from(claims).where(eq(claims.claimNo, claimNo)).limit(1);
  const claim = rows[0];
  if (!claim) return jsonErr('NOT_FOUND', 'Nomor klaim tidak ditemukan.', 404);

  const bayarRows = await db
    .select()
    .from(payments)
    .where(eq(payments.claimId, claim.id))
    .orderBy(desc(payments.attempt))
    .limit(1);

  const voucherRows = await db.select().from(vouchers).where(eq(vouchers.claimId, claim.id)).limit(1);
  const v = voucherRows[0];

  return jsonOk({
    claimNo: claim.claimNo,
    status: claim.status,
    amount: claim.amountIdr,
    device: `${claim.brand} ${claim.model}`,
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
