import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { appSettings } from '@/db/schema';

/** Nilai bawaan dipakai kalau baris di app_settings belum ada / terhapus. */
const BAWAAN = {
  'promo.title': 'Promo Ganti LCD',
  'promo.subtitle': 'Harga spesial, garansi 7 hari',
  'promo.is_active': true,
  'promo.start_at': null as string | null,
  'promo.end_at': null as string | null,
  'promo.terms': [
    'Garansi 7 hari sejak LCD terpasang',
    'Voucher berlaku 30 hari sejak pembayaran',
    'Voucher hanya bisa dipakai satu kali',
  ] as string[],
  'promo.voucher_valid_days': 30,
  'promo.claim_expiry_minutes': 30,
  'store.name': 'BSS.id',
  'store.wa_cs': '',
};

export type KunciSetting = keyof typeof BAWAAN;
export type Pengaturan = typeof BAWAAN;

export async function ambilPengaturan(): Promise<Pengaturan> {
  const hasil = { ...BAWAAN };
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(inArray(appSettings.key, Object.keys(BAWAAN)));
    for (const r of rows) {
      (hasil as Record<string, unknown>)[r.key] = r.value;
    }
  } catch {
    // Database belum siap → pakai bawaan supaya halaman tetap terbuka.
  }
  return hasil;
}

export async function simpanPengaturan(
  patch: Partial<Record<KunciSetting, unknown>>,
  olehId?: string,
): Promise<void> {
  const entries = Object.entries(patch).filter(([k]) => k in BAWAAN);
  for (const [key, value] of entries) {
    await db
      .insert(appSettings)
      .values({ key, value: value as never, updatedBy: olehId ?? null })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: value as never, updatedAt: new Date(), updatedBy: olehId ?? null },
      });
  }
}

/** Apakah promo sedang berjalan menurut tanggal & saklar aktif. */
export function promoSedangJalan(p: Pengaturan): boolean {
  if (!p['promo.is_active']) return false;
  const now = Date.now();
  const mulai = p['promo.start_at'] ? Date.parse(p['promo.start_at']) : null;
  const selesai = p['promo.end_at'] ? Date.parse(p['promo.end_at']) : null;
  if (mulai && Number.isFinite(mulai) && now < mulai) return false;
  if (selesai && Number.isFinite(selesai) && now > selesai) return false;
  return true;
}
