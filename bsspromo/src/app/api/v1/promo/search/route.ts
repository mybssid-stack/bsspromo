import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { promoItems } from '@/db/schema';
import { jsonErr, jsonOk } from '@/lib/api';
import { batasiLaju, ipDari } from '@/lib/ratelimit';
import { ambilPengaturan, promoSedangJalan } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pencarian promo untuk bilah pencarian di landing page.
 *
 * Dua jalur pencocokan sengaja digabung:
 *   1. ILIKE  — cocok untuk potongan kata yang diketik lengkap ("note 12").
 *   2. trigram similarity — menolong salah ketik ("xiomi" → "xiaomi") dan
 *      urutan kata yang terbalik.
 * Tanpa yang kedua, orang yang mengetik merek dengan ejaan sendiri akan
 * melihat halaman kosong dan menyangka HP-nya tidak didukung.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase().slice(0, 60);

  const rl = await batasiLaju(`search:${ipDari(req)}`, 60, 60);
  if (!rl.success) return jsonErr('RATE_LIMITED', 'Terlalu banyak permintaan. Tunggu sebentar.', 429);

  const p = await ambilPengaturan();
  if (!promoSedangJalan(p)) {
    return jsonOk({ items: [], promoAktif: false, total: 0 });
  }

  try {
    const kondisiAktif = eq(promoItems.isActive, true);

    const rows = q
      ? await db
          .select()
          .from(promoItems)
          .where(
            and(
              kondisiAktif,
              or(
                sql`${promoItems.searchText} ILIKE ${'%' + q + '%'}`,
                sql`similarity(${promoItems.searchText}, ${q}) > 0.28`,
              ),
            ),
          )
          .orderBy(
            desc(sql`similarity(${promoItems.searchText}, ${q})`),
            promoItems.sortOrder,
          )
          .limit(24)
      : await db
          .select()
          .from(promoItems)
          .where(kondisiAktif)
          .orderBy(promoItems.sortOrder)
          .limit(12);

    return jsonOk({
      promoAktif: true,
      total: rows.length,
      items: rows.map((r) => ({
        slug: r.slug,
        brand: r.brand,
        model: r.model,
        partType: r.partType,
        qualityGrade: r.qualityGrade,
        priceNormal: r.priceNormalIdr,
        pricePromo: r.pricePromoIdr,
        warrantyDays: r.warrantyDays,
        note: r.note,
        habis: r.stock !== null && r.stock <= 0,
      })),
    });
  } catch (e) {
    console.error('promo/search', e);
    return jsonErr('SERVER_ERROR', 'Pencarian sedang bermasalah. Coba lagi sebentar.', 500);
  }
}
