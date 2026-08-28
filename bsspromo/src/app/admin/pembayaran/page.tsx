import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { namaMetode, rupiah, tanggalID } from '@/lib/money';

import { wajibAdminHalaman } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

type Row = {
  claim_no: string;
  paid_at: string | null;
  nama: string;
  phone_display: string;
  alamat: string | null;
  brand: string;
  model: string;
  quality_grade: string | null;
  amount_idr: number;
  payment_type: string | null;
  order_id: string | null;
  voucher_code: string | null;
  voucher_status: string | null;
  redeemed_at: string | null;
  service_ticket_no: string | null;
};

export default async function HalamanPembayaran({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await wajibAdminHalaman();
  const { q } = await searchParams;
  const cari = (q ?? '').trim();

  let rows: Row[] = [];
  let galat = '';
  try {
    const hasil = cari
      ? await db.execute(sql`
          SELECT * FROM v_paid_claims
          WHERE nama ILIKE ${'%' + cari + '%'}
             OR phone_e164 ILIKE ${'%' + cari.replace(/\D/g, '') + '%'}
             OR claim_no ILIKE ${'%' + cari.toUpperCase() + '%'}
             OR voucher_code ILIKE ${'%' + cari.toUpperCase() + '%'}
          LIMIT 200
        `)
      : await db.execute(sql`SELECT * FROM v_paid_claims LIMIT 200`);
    rows = hasil.rows as unknown as Row[];
  } catch (e) {
    galat = String(e);
  }

  const total = rows.reduce((s, r) => s + Number(r.amount_idr || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-black tracking-tight">Pembayaran</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Hanya klaim berstatus LUNAS yang tampil di sini — status ditentukan webhook Midtrans,
          bukan tampilan di browser pelanggan.
        </p>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={cari}
          placeholder="Cari nama, nomor HP, invoice, atau kode voucher"
          className="w-full max-w-md rounded-xl border border-line bg-white px-4 py-2.5 text-[14px] outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
        />
        <button className="rounded-xl bg-ink px-5 py-2.5 text-[14px] font-bold text-white">
          Cari
        </button>
      </form>

      <div className="flex flex-wrap gap-3">
        <Kartu label="Transaksi tampil" nilai={String(rows.length)} />
        <Kartu label="Nilai total" nilai={rupiah(total)} />
      </div>

      {galat && (
        <div className="rounded-xl border border-bss-line bg-bss-tint px-4 py-3 text-[13px] text-bss-dark">
          Gagal membaca data. Pastikan neon-schema.sql sudah dijalankan (view v_paid_claims wajib ada).
        </div>
      )}

      <div className="overflow-x-auto rounded-[18px] border border-line bg-white">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted-2">
              <th className="px-5 py-3 font-bold">Invoice</th>
              <th className="px-5 py-3 font-bold">Pelanggan</th>
              <th className="px-5 py-3 font-bold">Unit</th>
              <th className="px-5 py-3 text-right font-bold">Jumlah</th>
              <th className="px-5 py-3 font-bold">Metode</th>
              <th className="px-5 py-3 font-bold">Voucher</th>
              <th className="px-5 py-3 font-bold">Dibayar</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-[13.5px] text-muted">
                  {cari ? 'Tidak ada yang cocok.' : 'Belum ada pembayaran.'}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.claim_no} className="border-b border-line-2 last:border-0 align-top">
                  <td className="px-5 py-3">
                    <span className="font-bold">{r.claim_no}</span>
                    {r.order_id && (
                      <span className="block font-mono text-[11px] text-muted-2">{r.order_id}</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-semibold">{r.nama}</span>
                    <span className="block text-[12px] text-muted">{r.phone_display}</span>
                    {r.alamat && (
                      <span className="block max-w-56 truncate text-[11.5px] text-muted-2">
                        {r.alamat}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {r.brand} {r.model}
                    {r.quality_grade && (
                      <span className="block text-[11.5px] text-muted">{r.quality_grade}</span>
                    )}
                  </td>
                  <td className="tnum px-5 py-3 text-right font-bold">{rupiah(r.amount_idr)}</td>
                  <td className="px-5 py-3 text-muted">{namaMetode(r.payment_type)}</td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-[12px]">{r.voucher_code ?? '—'}</span>
                    <span
                      className={`mt-0.5 block text-[11px] font-black uppercase ${
                        r.voucher_status === 'REDEEMED' ? 'text-ok' : 'text-muted-2'
                      }`}
                    >
                      {r.voucher_status ?? ''}
                      {r.service_ticket_no ? ` · ${r.service_ticket_no}` : ''}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted">{tanggalID(r.paid_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kartu({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-2">{label}</p>
      <p className="tnum mt-0.5 text-[18px] font-black">{nilai}</p>
    </div>
  );
}
