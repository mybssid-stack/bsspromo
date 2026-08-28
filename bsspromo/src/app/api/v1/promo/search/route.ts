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
 * Dua jalur pencocokan digabung:
 *   1. ILIKE — untuk potongan kata yang diketik lengkap ("note 8").
 *   2. word_similarity — untuk salah eja ("xiomi" → Xiaomi, "samsong" →
 *      Samsung, "opo" → Oppo).
 *
 * Dipakai word_similarity(), BUKAN similarity(). Bedanya penting di sini:
 * similarity() membandingkan seluruh string, sementara search_text kami
 * panjang (merek + model + kualitas + semua alias). Akibatnya skor apa pun
 * jadi encer — diuji dengan katalog nyata, bahkan kata "xiaomi" yang dieja
 * BENAR cuma dapat 0.241, di bawah ambang 0.28 yang semula dipakai.
 * word_similarity() mencari padanan terbaik di batas kata, jadi "xiaomi"
 * dapat 1.000 dan "xiomi" 0.444.
 *
 * Ambang 0.4 dipilih dari pengukuran, bukan tebakan: salah eja yang wajar
 * ("samsong" 0.625, "xiomi" 0.444) lolos, sementara merek yang memang tidak
 * ada ("nokia" 0.333, "huawei" 0.143, "kulkas" 0.000) tidak ikut terjaring.
 *
 * Katalog promo isinya puluhan baris, jadi pemindaian berurutan di sini
 * hitungannya mikrodetik. Kalau suatu saat jadi ribuan tipe, ganti ke
 * operator `<%` yang bisa memakai indeks GIN.
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
                sql`word_similarity(${q}, ${promoItems.searchText}) > 0.4`,
              ),
            ),
          )
          .orderBy(
            desc(sql`word_similarity(${q}, ${promoItems.searchText})`),
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
        stock: r.stock,
      })),
    });
  } catch (e) {
    console.error('promo/search', e);
    return jsonErr('SERVER_ERROR', 'Pencarian sedang bermasalah. Coba lagi sebentar.', 500);
  }
}
