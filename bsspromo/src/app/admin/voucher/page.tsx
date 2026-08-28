import { sql } from 'drizzle-orm';
import { db } from '@/db';
import CetakUlang from '@/components/admin/CetakUlang';
import { rupiah, tanggalID } from '@/lib/money';

import { wajibAdminHalaman } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

type Row = {
  code: string;
  status: string;
  valid_until: string;
  redeemed_at: string | null;
  redeemed_by_name: string | null;
  service_ticket_no: string | null;
  warranty_end_at: string | null;
  claim_no: string;
  nama: string;
  phone_display: string;
  brand: string;
  model: string;
  quality_grade: string | null;
  amount_idr: number;
};

export default async function HalamanVoucher({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await wajibAdminHalaman();
  const { q } = await searchParams;
  const cari = (q ?? '').trim();

  let rows: Row[] = [];
  try {
    const hasil = cari
      ? await db.execute(sql`
          SELECT * FROM v_voucher_ops
          WHERE code ILIKE ${'%' + cari.toUpperCase() + '%'}
             OR nama ILIKE ${'%' + cari + '%'}
             OR phone_display ILIKE ${'%' + cari + '%'}
             OR claim_no ILIKE ${'%' + cari.toUpperCase() + '%'}
          LIMIT 200
        `)
      : await db.execute(sql`SELECT * FROM v_voucher_ops LIMIT 200`);
    rows = hasil.rows as unknown as Row[];
  } catch {
    rows = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-black tracking-tight">Voucher</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Termasuk cetak ulang untuk pelanggan yang kehilangan gambar vouchernya.
        </p>
      </div>

      <CetakUlang />

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={cari}
          placeholder="Cari kode voucher, nama, nomor HP, atau invoice"
          className="w-full max-w-md rounded-xl border border-line bg-white px-4 py-2.5 text-[14px] outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
        />
        <button className="rounded-xl bg-ink px-5 py-2.5 text-[14px] font-bold text-white">
          Cari
        </button>
      </form>

      <div className="overflow-x-auto rounded-[18px] border border-line bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted-2">
              <th className="px-5 py-3 font-bold">Kode</th>
              <th className="px-5 py-3 font-bold">Status</th>
              <th className="px-5 py-3 font-bold">Pelanggan</th>
              <th className="px-5 py-3 font-bold">Unit</th>
              <th className="px-5 py-3 text-right font-bold">Nilai</th>
              <th className="px-5 py-3 font-bold">Berlaku s/d</th>
              <th className="px-5 py-3 font-bold">Ditukar</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-[13.5px] text-muted">
                  Belum ada voucher.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.code} className="border-b border-line-2 last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-mono font-bold">{r.code}</span>
                    <span className="block text-[11.5px] text-muted-2">{r.claim_no}</span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusPil status={r.status} />
                  </td>
                  <td className="px-5 py-3">
                    {r.nama}
                    <span className="block text-[12px] text-muted">{r.phone_display}</span>
                  </td>
                  <td className="px-5 py-3">
                    {r.brand} {r.model}
                  </td>
                  <td className="tnum px-5 py-3 text-right font-bold">{rupiah(r.amount_idr)}</td>
                  <td className="px-5 py-3 text-muted">{tanggalID(r.valid_until)}</td>
                  <td className="px-5 py-3 text-muted">
                    {r.redeemed_at ? (
                      <>
                        {tanggalID(r.redeemed_at)}
                        <span className="block text-[11.5px]">
                          {r.redeemed_by_name ?? ''}
                          {r.service_ticket_no ? ` · ${r.service_ticket_no}` : ''}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPil({ status }: { status: string }) {
  const gaya: Record<string, string> = {
    ACTIVE: 'bg-ok-bg text-ok',
    REDEEMED: 'bg-line-2 text-muted',
    EXPIRED: 'bg-bss-tint text-bss-dark',
    VOID: 'bg-bss-tint text-bss-dark',
  };
  return (
    <span
      className={`rounded-md px-2 py-1 text-[11px] font-black uppercase tracking-wide ${gaya[status] ?? 'bg-line-2 text-muted'}`}
    >
      {status}
    </span>
  );
}
