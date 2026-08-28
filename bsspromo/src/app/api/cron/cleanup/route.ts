import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { jsonErr, jsonOk } from '@/lib/api';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pemeliharaan harian: buang nonce & cache yang kedaluwarsa, tandai klaim dan
 * voucher yang lewat waktu.
 *
 * Dijadwalkan di vercel.json — `"schedule": "0 17 * * *"` berarti 17:00 UTC,
 * yaitu 00:00 WIB. Vercel Cron selalu memakai UTC, jadi jamnya sengaja digeser
 * tujuh jam; jangan diubah jadi "0 0 * * *" kecuali memang mau jalan jam 7 pagi.
 *
 * Otentikasinya lewat header Authorization: Vercel mengirim
 * `Bearer $CRON_SECRET` secara otomatis, jadi tidak ada rahasia yang perlu
 * ditulis di vercel.json (berkas itu JSON ketat — tidak menerima komentar
 * maupun properti tambahan seperti `comment`).
 */
export async function GET(req: Request) {
  const diberikan =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(req.url).searchParams.get('secret') ??
    '';

  if (!env.cronSecret || diberikan !== env.cronSecret) {
    return jsonErr('UNAUTHORIZED', 'Secret cron tidak cocok.', 401);
  }

  const hasil: Record<string, number> = {};

  const nonce = await db.execute(
    sql`DELETE FROM api_nonces WHERE used_at < now() - interval '10 minutes'`,
  );
  hasil.nonceDihapus = nonce.rowCount ?? 0;

  const cache = await db.execute(sql`DELETE FROM legacy_customer_cache WHERE expires_at < now()`);
  hasil.cacheDihapus = cache.rowCount ?? 0;

  const klaim = await db.execute(sql`
    UPDATE claims SET status = 'EXPIRED', updated_at = now()
    WHERE status IN ('DRAFT','AWAITING_PAYMENT') AND expires_at < now()
  `);
  hasil.klaimKedaluwarsa = klaim.rowCount ?? 0;

  const voucher = await db.execute(sql`
    UPDATE vouchers SET status = 'EXPIRED'
    WHERE status = 'ACTIVE' AND valid_until < now()
  `);
  hasil.voucherKedaluwarsa = voucher.rowCount ?? 0;

  // Penghitung nomor klaim harian, simpan 90 hari terakhir saja.
  await db.execute(sql`DELETE FROM claim_counters WHERE day < current_date - 90`);

  return jsonOk({ hasil });
}
