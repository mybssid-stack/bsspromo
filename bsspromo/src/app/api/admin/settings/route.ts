import { z } from 'zod';
import { sesiSekarang } from '@/lib/admin-auth';
import { jsonErr, jsonOk } from '@/lib/api';
import { catat } from '@/lib/audit';
import { ambilPengaturan, simpanPengaturan } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Ubah = z.object({
  'promo.title': z.string().max(120).optional(),
  'promo.subtitle': z.string().max(200).optional(),
  'promo.is_active': z.boolean().optional(),
  'promo.start_at': z.string().max(40).nullable().optional(),
  'promo.end_at': z.string().max(40).nullable().optional(),
  'promo.terms': z.array(z.string().max(200)).max(12).optional(),
  'promo.voucher_valid_days': z.number().int().min(1).max(365).optional(),
  'promo.claim_expiry_minutes': z.number().int().min(5).max(1440).optional(),
  'store.name': z.string().max(80).optional(),
  'store.wa_cs': z.string().max(20).optional(),
});

export async function GET() {
  const s = await sesiSekarang();
  if (!s) return jsonErr('UNAUTHORIZED', 'Belum masuk.', 401);
  return jsonOk({ settings: await ambilPengaturan() });
}

export async function PATCH(req: Request) {
  const s = await sesiSekarang();
  if (!s) return jsonErr('UNAUTHORIZED', 'Belum masuk.', 401);
  if (s.role === 'CS') return jsonErr('FORBIDDEN', 'Peran CS tidak boleh mengubah pengaturan.', 403);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonErr('BAD_JSON', 'Format permintaan tidak dikenali.');
  }
  const parsed = Ubah.safeParse(raw);
  if (!parsed.success) return jsonErr('BAD_INPUT', 'Pengaturan tidak valid.');

  const sebelum = await ambilPengaturan();
  await simpanPengaturan(parsed.data, s.sub);
  const sesudah = await ambilPengaturan();

  await catat({
    actorType: 'ADMIN',
    actorId: s.sub,
    action: 'settings.update',
    entity: 'app_settings',
    before: sebelum,
    after: sesudah,
  });

  return jsonOk({ settings: sesudah });
}
