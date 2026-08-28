import FormPengaturan from '@/components/admin/FormPengaturan';
import { ambilPengaturan } from '@/lib/settings';

import { wajibAdminHalaman } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

export default async function HalamanPengaturan() {
  await wajibAdminHalaman();
  const p = await ambilPengaturan();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-black tracking-tight">Pengaturan promo</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Judul, masa berlaku, dan syarat yang tampil di landing page.
        </p>
      </div>
      <FormPengaturan awal={p} />
    </div>
  );
}
