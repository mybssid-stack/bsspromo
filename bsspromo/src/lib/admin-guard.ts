import { redirect } from 'next/navigation';
import { sesiSekarang, type AdminSession } from './admin-auth';

/**
 * Penjaga untuk Server Component halaman admin.
 *
 * Middleware saja tidak cukup jadi satu-satunya pertahanan: salah menaruh
 * berkas middleware (mis. di root, bukan di src/) atau matcher yang meleset
 * akan membuka seluruh halaman admin tanpa suara — persis bug yang tertangkap
 * saat uji coba. Pemeriksaan di sini ikut jalan saat halamannya dirender,
 * jadi tidak bisa terlewat.
 *
 * Berkas terpisah dari admin-auth.ts karena middleware berjalan di Edge dan
 * tidak boleh ikut menarik next/navigation.
 */
export async function wajibAdminHalaman(): Promise<AdminSession> {
  const s = await sesiSekarang();
  if (!s) redirect('/admin/login');
  return s;
}
