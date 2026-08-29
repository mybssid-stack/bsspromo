import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { paymentEvents, payments } from '@/db/schema';
import { cekSignatureWebhook } from '@/lib/midtrans';
import { terapkanStatusPembayaran } from '@/lib/settle';

// Wajib nodejs: butuh raw body & crypto.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Notifikasi = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status?: string;
  fraud_status?: string;
  transaction_id?: string;
  payment_type?: string;
  settlement_time?: string;
  expiry_time?: string;
  va_numbers?: { bank?: string; va_number?: string }[];
  permata_va_number?: string;
  bank?: string;
  store?: string;
  biller_code?: string;
  bill_key?: string;
};

/**
 * Satu-satunya sumber kebenaran status pembayaran.
 *
 * Aturan main dengan Midtrans: balas 200 = "sudah saya terima, jangan kirim
 * lagi". Balas 5xx = "coba lagi nanti". Jadi galat pemrosesan HARUS dijawab
 * 5xx, bukan 200 — kalau tidak, pembayaran yang gagal diproses hilang untuk
 * selamanya. Notifikasi mentah selalu disimpan lebih dulu supaya bisa
 * diputar ulang manual kalau perlu.
 */
export async function POST(req: Request) {
  const raw = await req.text();

  let n: Notifikasi;
  try {
    n = JSON.parse(raw) as Notifikasi;
  } catch {
    return Response.json({ ok: false, code: 'BAD_JSON' }, { status: 400 });
  }
  if (!n.order_id || !n.signature_key) {
    return Response.json({ ok: false, code: 'BAD_PAYLOAD' }, { status: 400 });
  }

  const sahTandaTangan = cekSignatureWebhook(n);

  const dedupeKey = crypto
    .createHash('sha256')
    .update(
      [n.order_id, n.transaction_status ?? '', n.status_code ?? '', n.transaction_id ?? ''].join('|'),
    )
    .digest('hex');

  // Simpan dulu, pikir kemudian. Semua notifikasi masuk arsip, termasuk yang
  // tanda tangannya palsu — itu justru bukti kalau ada yang mencoba menyusup.
  let perluProses = true;
  try {
    const hasil = await db
      .insert(paymentEvents)
      .values({
        orderId: n.order_id,
        dedupeKey,
        signatureOk: sahTandaTangan,
        payload: n as never,
      })
      .onConflictDoNothing({ target: paymentEvents.dedupeKey })
      .returning({ id: paymentEvents.id });

    if (hasil.length === 0) {
      // Notifikasi kembar. Kalau yang lama SUDAH selesai diproses, cukup
      // jawab 200. Kalau belum (percobaan sebelumnya gagal), proses lagi.
      const lama = await db
        .select({ processed: paymentEvents.processed })
        .from(paymentEvents)
        .where(eq(paymentEvents.dedupeKey, dedupeKey))
        .limit(1);
      perluProses = lama[0] ? !lama[0].processed : true;
      if (!perluProses) {
        return Response.json({ ok: true, note: 'duplikat, sudah diproses' });
      }
    }
  } catch (e) {
    console.error('webhook.arsip', e);
  }

  if (!sahTandaTangan) {
    console.warn('webhook: tanda tangan tidak sah untuk', n.order_id);
    return Response.json({ ok: false, code: 'BAD_SIGNATURE' }, { status: 401 });
  }

  try {
    const bayarRows = await db.select().from(payments).where(eq(payments.orderId, n.order_id)).limit(1);
    const bayar = bayarRows[0];
    if (!bayar) {
      // Order asing (mis. transaksi uji dari dashboard Midtrans). Diarsipkan
      // saja; balas 200 supaya Midtrans berhenti mengulang selamanya.
      await db.update(paymentEvents).set({ processed: true, error: 'order tidak dikenal' })
        .where(eq(paymentEvents.dedupeKey, dedupeKey));
      return Response.json({ ok: true, note: 'order tidak dikenal' });
    }

    // Penjaga tambahan: nominal harus sama dengan yang kita tagih.
    const nominal = Math.round(Number(n.gross_amount));
    if (Number.isFinite(nominal) && nominal !== bayar.grossAmountIdr) {
      await db.update(paymentEvents)
        .set({ processed: true, error: `nominal beda: ${nominal} vs ${bayar.grossAmountIdr}` })
        .where(eq(paymentEvents.dedupeKey, dedupeKey));
      console.error('webhook: nominal tidak cocok', n.order_id, nominal, bayar.grossAmountIdr);
      return Response.json({ ok: false, code: 'AMOUNT_MISMATCH' }, { status: 409 });
    }

    const keputusan = await terapkanStatusPembayaran(bayar, n, 'webhook');

    await db
      .update(paymentEvents)
      .set({ processed: true, error: null })
      .where(eq(paymentEvents.dedupeKey, dedupeKey));

    return Response.json({ ok: true, decision: keputusan });
  } catch (e) {
    console.error('webhook.proses', e);
    try {
      await db
        .update(paymentEvents)
        .set({ processed: false, error: e instanceof Error ? e.message.slice(0, 500) : 'galat' })
        .where(eq(paymentEvents.dedupeKey, dedupeKey));
    } catch {
      /* abaikan */
    }
    // 5xx supaya Midtrans mengirim ulang.
    return Response.json({ ok: false, code: 'PROCESSING_ERROR' }, { status: 500 });
  }
}

/** Beberapa panel Midtrans mengetes URL dengan GET. */
export async function GET() {
  return Response.json({ ok: true, service: 'midtrans-webhook' });
}
