import TabelHarga from '@/components/admin/TabelHarga';

import { wajibAdminHalaman } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

export default async function HalamanHarga() {
  await wajibAdminHalaman();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-black tracking-tight">Daftar harga promo</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Mengubah harga di sini tidak mengubah klaim yang sudah dibuat — harga dibekukan saat
          pelanggan klaim.
        </p>
      </div>
      <TabelHarga />
    </div>
  );
}
