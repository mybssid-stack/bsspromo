import { desc } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { promoItems } from '@/db/schema';
import { sesiSekarang } from '@/lib/admin-auth';
import { jsonErr, jsonOk } from '@/lib/api';
import { catat } from '@/lib/audit';
import { ipDari } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Baru = z.object({
  brand: z.string().min(1).max(60),
  model: z.string().min(1).max(80),
  aliases: z.array(z.string().max(60)).max(20).optional(),
  partType: z.string().max(30).optional(),
  qualityGrade: z.string().max(40).optional(),
  priceNormalIdr: z.number().int().min(0).max(100_000_000),
  pricePromoIdr: z.number().int().min(0).max(100_000_000),
  warrantyDays: z.number().int().min(0).max(365).optional(),
  stock: z.number().int().min(0).max(100000).nullable().optional(),
  isActive: z.boolean().optional(),
  note: z.string().max(300).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

function bikinSlug(brand: string, model: string): string {
  return `${brand}-${model}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

export async function GET() {
  const s = await sesiSekarang();
  if (!s) return jsonErr('UNAUTHORIZED', 'Belum masuk.', 401);

  const rows = await db.select().from(promoItems).orderBy(promoItems.sortOrder, desc(promoItems.createdAt));
  return jsonOk({ items: rows });
}

export async function POST(req: Request) {
  const s = await sesiSekarang();
  if (!s) return jsonErr('UNAUTHORIZED', 'Belum masuk.', 401);
  if (s.role === 'CS') return jsonErr('FORBIDDEN', 'Peran CS tidak boleh mengubah harga.', 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonErr('BAD_JSON', 'Format permintaan tidak dikenali.');
  }
  const parsed = Baru.safeParse(raw);
  if (!parsed.success) {
    return jsonErr('BAD_INPUT', parsed.error.issues[0]?.message ?? 'Data tidak valid.');
  }
  const d = parsed.data;
  if (d.pricePromoIdr > d.priceNormalIdr) {
    return jsonErr('HARGA_SALAH', 'Harga promo tidak boleh lebih tinggi dari harga normal.');
  }

  try {
    const [row] = await db
      .insert(promoItems)
      .values({
        brand: d.brand.trim(),
        model: d.model.trim(),
        aliases: d.aliases ?? [],
        slug: bikinSlug(d.brand, d.model),
        partType: d.partType?.trim() || 'LCD',
        qualityGrade: d.qualityGrade?.trim() || null,
        priceNormalIdr: d.priceNormalIdr,
        pricePromoIdr: d.pricePromoIdr,
        warrantyDays: d.warrantyDays ?? 7,
        stock: d.stock ?? null,
        isActive: d.isActive ?? true,
        note: d.note?.trim() || null,
        sortOrder: d.sortOrder ?? 0,
      })
      .returning();

    await catat({
      actorType: 'ADMIN',
      actorId: s.sub,
      action: 'promo.create',
      entity: 'promo_items',
      entityId: row.id,
      after: row,
      ip: ipDari(req),
    });
    return jsonOk({ item: row });
  } catch (e) {
    const pesan = String(e);
    if (pesan.includes('duplicate key') || pesan.includes('unique')) {
      return jsonErr('SLUG_DIPAKAI', 'Merek + tipe ini sudah ada di daftar.', 409);
    }
    console.error('promo.create', e);
    return jsonErr('SERVER_ERROR', 'Gagal menyimpan.', 500);
  }
}
