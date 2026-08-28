import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { claims, customers, payments, promoItems } from '@/db/schema';
import { cekTurnstile, jsonErr, jsonOk } from '@/lib/api';
import { catat } from '@/lib/audit';
import { lookupPelangganLama } from '@/lib/bridge';
import { env } from '@/lib/env';
import { buatTransaksiSnap } from '@/lib/midtrans';
import { normalizePhoneID } from '@/lib/phone';
import { claimToken, hashPhone } from '@/lib/qr-jws';
import { batasiLaju, ipDari } from '@/lib/ratelimit';
import { ambilPengaturan, promoSedangJalan } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Skema = z.object({
  slug: z.string().min(1).max(120),
  phone: z.string().min(6).max(30),
  name: z.string().max(150).optional(),
  address: z.string().max(300).optional(),
  turnstileToken: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  const ip = ipDari(req);
  const ua = req.headers.get('user-agent') ?? '';

  const rl = await batasiLaju(`claim:${ip}`, 8, 60);
  if (!rl.success) return jsonErr('RATE_LIMITED', 'Terlalu banyak percobaan. Tunggu satu menit.', 429);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonErr('BAD_JSON', 'Format permintaan tidak dikenali.');
  }
  const parsed = Skema.safeParse(raw);
  if (!parsed.success) return jsonErr('BAD_INPUT', 'Data yang dikirim belum lengkap.');
  const input = parsed.data;

  if (!(await cekTurnstile(input.turnstileToken, ip))) {
    return jsonErr('BOT_CHECK', 'Verifikasi keamanan gagal. Muat ulang halaman.', 403);
  }

  const e164 = normalizePhoneID(input.phone);
  if (!e164) return jsonErr('BAD_PHONE', 'Nomor HP tidak valid. Contoh: 0822 5200 1234.');

  const rlNomor = await batasiLaju(`claim-nomor:${hashPhone(e164)}`, 5, 300);
  if (!rlNomor.success) {
    return jsonErr('RATE_LIMITED', 'Nomor ini sudah beberapa kali mencoba. Tunggu 5 menit.', 429);
  }

  const p = await ambilPengaturan();
  if (!promoSedangJalan(p)) return jsonErr('PROMO_TUTUP', 'Promo sedang tidak berjalan.', 409);

  try {
    // ── 1. Harga diambil dari DATABASE, tidak pernah dari browser ──────────
    const itemRows = await db
      .select()
      .from(promoItems)
      .where(and(eq(promoItems.slug, input.slug), eq(promoItems.isActive, true)))
      .limit(1);
    const item = itemRows[0];
    if (!item) return jsonErr('ITEM_TIDAK_ADA', 'Tipe HP ini sudah tidak ikut promo.', 404);
    if (item.stock !== null && item.stock <= 0) {
      return jsonErr('STOK_HABIS', `Stok LCD ${item.brand} ${item.model} sedang kosong.`, 409);
    }

    // ── 2. Identitas: pelanggan lama menang atas isian manual ──────────────
    const legacy = await lookupPelangganLama(e164);
    let nama: string;
    let alamat: string | null;
    let sumberNama: 'BSS_LEGACY' | 'MANUAL';
    let asal: 'BSS_LEGACY' | 'NEW';

    if (legacy.found && legacy.name) {
      nama = legacy.name;
      alamat = legacy.address ?? input.address?.trim() ?? null;
      sumberNama = 'BSS_LEGACY';
      asal = 'BSS_LEGACY';
    } else {
      const manual = (input.name ?? '').trim();
      if (manual.length < 2) {
        return jsonErr('NAMA_KOSONG', 'Nomor ini belum terdaftar. Isi nama dulu ya.', 422);
      }
      nama = manual.slice(0, 150);
      alamat = input.address?.trim() ? input.address.trim().slice(0, 300) : null;
      sumberNama = 'MANUAL';
      asal = 'NEW';
    }

    // ── 3. Pelanggan ───────────────────────────────────────────────────────
    const [pelanggan] = await db
      .insert(customers)
      .values({
        phoneE164: e164,
        phoneHash: hashPhone(e164),
        fullName: nama,
        address: alamat,
        origin: asal,
        legacyRef: legacy.legacyRef ?? null,
      })
      .onConflictDoUpdate({
        target: customers.phoneE164,
        set: { fullName: nama, address: alamat, updatedAt: new Date() },
      })
      .returning();

    // ── 4. Klaim: pakai ulang yang masih hidup, jangan bikin tumpukan ──────
    const menitKedaluwarsa = Number(p['promo.claim_expiry_minutes']) || 30;
    const hidupRows = await db
      .select()
      .from(claims)
      .where(
        and(
          eq(claims.customerId, pelanggan.id),
          eq(claims.promoItemId, item.id),
          inArray(claims.status, ['DRAFT', 'AWAITING_PAYMENT']),
          gt(claims.expiresAt, new Date()),
        ),
      )
      .limit(1);

    let claim = hidupRows[0];

    if (!claim) {
      // Bersihkan klaim lama yang sudah lewat waktu, kalau tidak indeks unik
      // akan menolak klaim baru untuk kombinasi pelanggan+item yang sama.
      await db
        .update(claims)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(claims.customerId, pelanggan.id),
            eq(claims.promoItemId, item.id),
            inArray(claims.status, ['DRAFT', 'AWAITING_PAYMENT']),
          ),
        );

      const noRes = await db.execute(sql`SELECT next_claim_no() AS no`);
      const claimNo = String((noRes.rows[0] as { no: string }).no);

      const dibuat = await db
        .insert(claims)
        .values({
          claimNo,
          customerId: pelanggan.id,
          promoItemId: item.id,
          brand: item.brand,
          model: item.model,
          partType: item.partType,
          qualityGrade: item.qualityGrade,
          priceNormalIdr: item.priceNormalIdr,
          amountIdr: item.pricePromoIdr,
          warrantyDays: item.warrantyDays,
          nameSnapshot: nama,
          phoneSnapshot: e164,
          addressSnapshot: alamat,
          nameSource: sumberNama,
          status: 'AWAITING_PAYMENT',
          expiresAt: new Date(Date.now() + menitKedaluwarsa * 60 * 1000),
          ip: ip !== '0.0.0.0' ? ip : null,
          userAgent: ua.slice(0, 400),
        })
        .returning();
      claim = dibuat[0];
    }

    // ── 5. Percobaan bayar baru ────────────────────────────────────────────
    // Midtrans menolak order_id yang sama dua kali, jadi tiap percobaan bayar
    // dapat nomor urut sendiri sementara nomor invoice BSS tetap satu.
    const urutRes = await db.execute(
      sql`SELECT COALESCE(MAX(attempt), 0) + 1 AS n FROM payments WHERE claim_id = ${claim.id}`,
    );
    const attempt = Number((urutRes.rows[0] as { n: number }).n) || 1;
    const orderId = `${claim.claimNo}-A${attempt}`;

    const [bayar] = await db
      .insert(payments)
      .values({
        claimId: claim.id,
        orderId,
        attempt,
        grossAmountIdr: claim.amountIdr,
        expiryAt: new Date(Date.now() + menitKedaluwarsa * 60 * 1000),
      })
      .returning();

    // ── 6. Snap ────────────────────────────────────────────────────────────
    const namaItem = `Ganti ${claim.partType} ${claim.brand} ${claim.model}`;
    const snap = await buatTransaksiSnap({
      orderId,
      grossAmount: claim.amountIdr,
      items: [
        {
          id: item.slug.slice(0, 50),
          price: claim.amountIdr,
          quantity: 1,
          name: namaItem,
        },
      ],
      customer: { nama: claim.nameSnapshot, phone: claim.phoneSnapshot, alamat: claim.addressSnapshot },
      expiryMinutes: menitKedaluwarsa,
      finishUrl: `${env.baseUrl}/klaim/${claim.claimNo}?k=${claimToken(claim.claimNo)}`,
    });

    await db
      .update(payments)
      .set({ snapToken: snap.token, snapRedirectUrl: snap.redirect_url })
      .where(eq(payments.id, bayar.id));

    await catat({
      actorType: 'PUBLIC',
      action: 'claim.create',
      entity: 'claims',
      entityId: claim.id,
      after: { claimNo: claim.claimNo, orderId, amount: claim.amountIdr },
      ip,
    });

    return jsonOk({
      claimNo: claim.claimNo,
      claimToken: claimToken(claim.claimNo),
      orderId,
      snapToken: snap.token,
      redirectUrl: snap.redirect_url,
      amount: claim.amountIdr,
      warrantyDays: claim.warrantyDays,
      device: `${claim.brand} ${claim.model}`,
      customerName: claim.nameSnapshot,
      nameSource: sumberNama,
      expiresAt: claim.expiresAt.toISOString(),
    });
  } catch (e) {
    console.error('claim.create', e);
    const pesan = e instanceof Error && e.message.startsWith('Midtrans')
      ? e.message
      : 'Gagal membuat tagihan. Coba lagi sebentar.';
    return jsonErr('SERVER_ERROR', pesan, 500);
  }
}
