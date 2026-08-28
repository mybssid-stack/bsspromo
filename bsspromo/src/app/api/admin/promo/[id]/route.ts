import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { promoItems } from '@/db/schema';
import { sesiSekarang } from '@/lib/admin-auth';
import { jsonErr, jsonOk } from '@/lib/api';
import { catat } from '@/lib/audit';
import { ipDari } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Ubah = z.object({
  brand: z.string().min(1).max(60).optional(),
  model: z.string().min(1).max(80).optional(),
  aliases: z.array(z.string().max(60)).max(20).optional(),
  partType: z.string().max(30).optional(),
  qualityGrade: z.string().max(40).nullable().optional(),
  priceNormalIdr: z.number().int().min(0).max(100_000_000).optional(),
  pricePromoIdr: z.number().int().min(0).max(100_000_000).optional(),
  warrantyDays: z.number().int().min(0).max(365).optional(),
  stock: z.number().int().min(0).max(100000).nullable().optional(),
  isActive: z.boolean().optional(),
  note: z.string().max(300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await sesiSekarang();
  if (!s) return jsonErr('UNAUTHORIZED', 'Belum masuk.', 401);
  if (s.role === 'CS') return jsonErr('FORBIDDEN', 'Peran CS tidak boleh mengubah harga.', 403);

  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonErr('BAD_JSON', 'Format permintaan tidak dikenali.');
  }
  const parsed = Ubah.safeParse(raw);
  if (!parsed.success) return jsonErr('BAD_INPUT', 'Data tidak valid.');

  const lamaRows = await db.select().from(promoItems).where(eq(promoItems.id, id)).limit(1);
  const lama = lamaRows[0];
  if (!lama) return jsonErr('NOT_FOUND', 'Item tidak ditemukan.', 404);

  const gabung = { ...lama, ...parsed.data };
  if (gabung.pricePromoIdr > gabung.priceNormalIdr) {
    return jsonErr('HARGA_SALAH', 'Harga promo tidak boleh lebih tinggi dari harga normal.');
  }

  const [baru] = await db
    .update(promoItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(promoItems.id, id))
    .returning();

  await catat({
    actorType: 'ADMIN',
    actorId: s.sub,
    action: 'promo.update',
    entity: 'promo_items',
    entityId: id,
    before: lama,
    after: baru,
    ip: ipDari(req),
  });

  return jsonOk({ item: baru });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const s = await sesiSekarang();
  if (!s) return jsonErr('UNAUTHORIZED', 'Belum masuk.', 401);
  if (s.role !== 'SUPERADMIN') {
    return jsonErr('FORBIDDEN', 'Hanya superadmin yang boleh menghapus.', 403);
  }

  const { id } = await ctx.params;

  // Item yang pernah dipakai klaim TIDAK dihapus, hanya dinonaktifkan —
  // menghapusnya akan memutus foreign key dan mengaburkan riwayat penjualan.
  try {
    const [row] = await db.delete(promoItems).where(eq(promoItems.id, id)).returning();
    if (!row) return jsonErr('NOT_FOUND', 'Item tidak ditemukan.', 404);
    await catat({
      actorType: 'ADMIN',
      actorId: s.sub,
      action: 'promo.delete',
      entity: 'promo_items',
      entityId: id,
      before: row,
      ip: ipDari(req),
    });
    return jsonOk({ deleted: true });
  } catch {
    const [row] = await db
      .update(promoItems)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(promoItems.id, id))
      .returning();
    return jsonOk({
      deleted: false,
      item: row,
      message: 'Item sudah pernah dipakai klaim, jadi dinonaktifkan (bukan dihapus).',
    });
  }
}
