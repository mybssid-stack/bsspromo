import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { claims, voucherReissues, vouchers } from '@/db/schema';
import { sesiSekarang } from '@/lib/admin-auth';
import { jsonErr, jsonOk } from '@/lib/api';
import { catat } from '@/lib/audit';
import { formatPhoneLocal, normalizePhoneID } from '@/lib/phone';
import { voucherToken, voucherUrl } from '@/lib/qr-jws';
import { ipDari } from '@/lib/ratelimit';
import { namaUnit } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Skema = z.object({
  code: z.string().min(4).max(40),
  phone: z.string().min(6).max(30),
  note: z.string().max(200).optional(),
});

/**
 * Cetak ulang voucher yang hilang.
 *
 * Kenapa harus lewat CS dan tidak bisa otomatis: Vercel tidak bisa
 * menjalankan Baileys (butuh proses hidup terus-menerus dan penyimpanan sesi
 * WhatsApp; fungsi serverless mati begitu request selesai). Jadi tidak ada
 * jalur kirim-ulang otomatis ke WhatsApp pelanggan.
 *
 * Gantinya: pelanggan menelepon CS, CS menanyakan nomor HP-nya, dan sistem
 * yang mencocokkan — bukan CS yang menilai. Setiap penerbitan ulang tercatat
 * lengkap dengan siapa yang menyetujui, cocok atau tidak nomornya.
 */
export async function POST(req: Request) {
  const s = await sesiSekarang();
  if (!s) return jsonErr('UNAUTHORIZED', 'Belum masuk.', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonErr('BAD_JSON', 'Format permintaan tidak dikenali.');
  }
  const parsed = Skema.safeParse(raw);
  if (!parsed.success) return jsonErr('BAD_INPUT', 'Kode voucher dan nomor HP wajib diisi.');

  const code = parsed.data.code.trim().toUpperCase();
  const diminta = normalizePhoneID(parsed.data.phone);
  if (!diminta) return jsonErr('BAD_PHONE', 'Nomor HP yang disebutkan pelanggan tidak valid.');

  const rows = await db
    .select({ v: vouchers, c: claims })
    .from(vouchers)
    .innerJoin(claims, eq(claims.id, vouchers.claimId))
    .where(eq(vouchers.code, code))
    .limit(1);
  const row = rows[0];
  if (!row) return jsonErr('NOT_FOUND', 'Kode voucher tidak ditemukan.', 404);

  const cocok = row.c.phoneSnapshot === diminta;
  const kedaluwarsa = new Date(Date.now() + 60 * 60 * 1000);

  // Percobaan yang GAGAL pun dicatat. Kalau ada yang berkali-kali menebak
  // nomor untuk voucher orang lain, jejaknya ada.
  await db.insert(voucherReissues).values({
    voucherId: row.v.id,
    requestedPhone: diminta,
    phoneMatch: cocok,
    channel: 'ADMIN_PANEL',
    approvedBy: s.sub,
    approvedByName: s.name,
    linkTokenHash: crypto.createHash('sha256').update(voucherToken(code)).digest('hex'),
    expiresAt: kedaluwarsa,
    note: parsed.data.note ?? null,
    ip: ipDari(req) !== '0.0.0.0' ? ipDari(req) : null,
  });

  await catat({
    actorType: 'ADMIN',
    actorId: s.sub,
    action: cocok ? 'voucher.reissue' : 'voucher.reissue_denied',
    entity: 'vouchers',
    entityId: row.v.id,
    after: { code, requestedPhone: diminta, match: cocok },
    ip: ipDari(req),
  });

  if (!cocok) {
    return jsonErr(
      'PHONE_MISMATCH',
      'Nomor yang disebutkan TIDAK cocok dengan pemilik voucher. Jangan kirim tautannya.',
      403,
    );
  }

  return jsonOk({
    url: voucherUrl(code),
    customerName: row.c.nameSnapshot,
    phoneDisplay: formatPhoneLocal(row.c.phoneSnapshot),
    device: namaUnit(row.c.brand, row.c.model),
    voucherStatus: row.v.status,
    validUntil: row.v.validUntil.toISOString(),
  });
}
