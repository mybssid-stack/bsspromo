import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { vouchers } from '@/db/schema';
import { jsonErr, jsonOk } from '@/lib/api';
import { catat } from '@/lib/audit';
import { autentikasiCS, ipDiizinkan } from '@/lib/cs-auth';
import { tanggalID } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Skema = z.object({
  code: z.string().min(4).max(40),
  csName: z.string().max(80).optional(),
  device: z.string().max(160).optional(),
  serviceTicketNo: z.string().max(40).optional(),
  idempotencyKey: z.string().max(128).optional(),
});

/**
 * Menandai voucher terpakai. Dipanggil standby.php setelah nota tersimpan.
 *
 * Inti keamanannya SATU kueri atomik. Pola "SELECT dulu, cek status, baru
 * UPDATE" akan meloloskan dua CS yang memindai QR yang sama pada detik yang
 * sama — keduanya membaca ACTIVE sebelum salah satunya sempat menulis.
 * Di sini, database sendiri yang menjadi wasitnya.
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
  if (!parsed.success) return jsonErr('BAD_INPUT', 'Data penukaran tidak lengkap.');

  const { code: kodeMentah, csName, device, serviceTicketNo } = parsed.data;
  const code = kodeMentah.trim().toUpperCase();

  const hasil = await db.execute(sql`
    UPDATE vouchers v
    SET status            = 'REDEEMED',
        redeemed_at       = now(),
        redeemed_by_name  = ${csName ?? null},
        redeem_device     = ${device ?? null},
        service_ticket_no = ${serviceTicketNo ?? null},
        warranty_start_at = now(),
        warranty_end_at   = now() + ((SELECT c.warranty_days FROM claims c WHERE c.id = v.claim_id) || ' days')::interval
    WHERE v.code = ${code}
      AND v.status = 'ACTIVE'
      AND v.valid_until > now()
    RETURNING v.redeemed_at, v.warranty_start_at, v.warranty_end_at, v.id
  `);

  if (hasil.rows.length > 0) {
    const r = hasil.rows[0] as {
      id: string;
      redeemed_at: string;
      warranty_start_at: string;
      warranty_end_at: string;
    };

    await catat({
      actorType: 'API_CLIENT',
      actorId: auth.clientKey,
      action: 'voucher.redeem',
      entity: 'vouchers',
      entityId: r.id,
      after: { code, csName, serviceTicketNo },
    });

    return jsonOk({
      redeemedAt: new Date(r.redeemed_at).toISOString(),
      warrantyStartAt: new Date(r.warranty_start_at).toISOString(),
      warrantyEndAt: new Date(r.warranty_end_at).toISOString(),
    });
  }

  // Nol baris. Baru sekarang dicari tahu kenapa, untuk pesan yang tepat.
  const adaRows = await db.select().from(vouchers).where(eq(vouchers.code, code)).limit(1);
  const v = adaRows[0];

  if (!v) return jsonErr('NOT_FOUND', 'Kode voucher tidak ditemukan.', 404);

  if (v.status === 'REDEEMED') {
    const siapa = v.redeemedByName ? ` oleh ${v.redeemedByName}` : '';
    const nota = v.serviceTicketNo ? ` (nota ${v.serviceTicketNo})` : '';
    return jsonErr(
      'ALREADY_REDEEMED',
      `Voucher sudah dipakai pada ${tanggalID(v.redeemedAt)}${siapa}${nota}.`,
      409,
    );
  }
  if (v.status === 'VOID') return jsonErr('VOUCHER_VOID', 'Voucher dibatalkan admin.', 409);
  if (v.validUntil.getTime() < Date.now() || v.status === 'EXPIRED') {
    return jsonErr('VOUCHER_EXPIRED', `Voucher kedaluwarsa pada ${tanggalID(v.validUntil)}.`, 409);
  }
  return jsonErr('NOT_REDEEMABLE', 'Voucher tidak bisa ditukar.', 409);
}
