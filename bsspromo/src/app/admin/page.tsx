import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { rupiah, tanggalID } from '@/lib/money';

import { wajibAdminHalaman } from '@/lib/admin-guard';

export const dynamic = 'force-dynamic';

type Angka = { label: string; nilai: string; catatan?: string };

async function ringkasan(): Promise<{ kartu: Angka[]; terbaru: RowTerbaru[] }> {
  const kosong = { kartu: [] as Angka[], terbaru: [] as RowTerbaru[] };
  try {
    const r = await db.execute(sql`
      SELECT
        (SELECT count(*) FROM claims WHERE status = 'PAID')                                AS lunas_total,
        (SELECT COALESCE(sum(amount_idr),0) FROM claims WHERE status = 'PAID')             AS omset_total,
        -- AT TIME ZONE dipakai DUA KALI dengan sengaja: yang pertama menggeser
        -- ke waktu dinding WIB untuk mencari awal bulan, yang kedua
        -- mengembalikannya jadi timestamptz supaya perbandingan dengan
        -- paid_at tidak diam-diam memakai zona waktu sesi Postgres.
        (SELECT count(*) FROM claims WHERE status = 'PAID'
           AND paid_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta')
                           AT TIME ZONE 'Asia/Jakarta'))                                   AS lunas_bulan,
        (SELECT COALESCE(sum(amount_idr),0) FROM claims WHERE status = 'PAID'
           AND paid_at >= (date_trunc('month', now() AT TIME ZONE 'Asia/Jakarta')
                           AT TIME ZONE 'Asia/Jakarta'))                                   AS omset_bulan,
        (SELECT count(*) FROM vouchers WHERE status = 'ACTIVE' AND valid_until > now())    AS voucher_aktif,
        (SELECT count(*) FROM vouchers WHERE status = 'REDEEMED')                          AS voucher_tukar,
        (SELECT count(*) FROM claims WHERE status = 'AWAITING_PAYMENT'
           AND expires_at > now())                                                         AS menunggu,
        (SELECT count(*) FROM promo_items WHERE is_active)                                 AS item_aktif
    `);
    const a = r.rows[0] as Record<string, string | number>;

    const t = await db.execute(sql`
      SELECT claim_no, nama, phone_display, brand, model, amount_idr, paid_at,
             voucher_code, voucher_status
      FROM v_paid_claims
      LIMIT 8
    `);

    return {
      kartu: [
        { label: 'Lunas bulan ini', nilai: String(a.lunas_bulan ?? 0), catatan: rupiah(Number(a.omset_bulan ?? 0)) },
        { label: 'Lunas sepanjang promo', nilai: String(a.lunas_total ?? 0), catatan: rupiah(Number(a.omset_total ?? 0)) },
        { label: 'Voucher aktif', nilai: String(a.voucher_aktif ?? 0), catatan: 'belum ditukar' },
        { label: 'Voucher ditukar', nilai: String(a.voucher_tukar ?? 0), catatan: 'unit sudah masuk' },
        { label: 'Menunggu bayar', nilai: String(a.menunggu ?? 0), catatan: 'belum kedaluwarsa' },
        { label: 'Tipe HP aktif', nilai: String(a.item_aktif ?? 0), catatan: 'di daftar harga' },
      ],
      terbaru: t.rows as unknown as RowTerbaru[],
    };
  } catch {
    return kosong;
  }
}

type RowTerbaru = {
  claim_no: string;
  nama: string;
  phone_display: string;
  brand: string;
  model: string;
  amount_idr: number;
  paid_at: string | null;
  voucher_code: string | null;
  voucher_status: string | null;
};

export default async function Dasbor() {
  await wajibAdminHalaman();
  const { kartu, terbaru } = await ringkasan();

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-[22px] font-black tracking-tight">Dasbor</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Angka di bawah hanya menghitung klaim yang benar-benar sudah dibayar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kartu.map((k) => (
          <div key={k.label} className="rounded-[18px] border border-line bg-white p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-2">{k.label}</p>
            <p className="tnum mt-2 text-[26px] font-black leading-none">{k.nilai}</p>
            {k.catatan && <p className="tnum mt-1.5 text-[13px] text-muted">{k.catatan}</p>}
          </div>
        ))}
      </div>

      <div className="rounded-[18px] border border-line bg-white">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-extrabold">Pembayaran terbaru</h2>
          <Link href="/admin/pembayaran" className="ml-auto text-[13px] font-bold text-bss">
            Lihat semua
          </Link>
        </div>

        {terbaru.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-muted">
            Belum ada pembayaran yang masuk.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted-2">
                  <th className="px-5 py-2.5 font-bold">Invoice</th>
                  <th className="px-5 py-2.5 font-bold">Pelanggan</th>
                  <th className="px-5 py-2.5 font-bold">Unit</th>
                  <th className="px-5 py-2.5 text-right font-bold">Jumlah</th>
                  <th className="px-5 py-2.5 font-bold">Voucher</th>
                  <th className="px-5 py-2.5 font-bold">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {terbaru.map((r) => (
                  <tr key={r.claim_no} className="border-b border-line-2 last:border-0">
                    <td className="px-5 py-3 font-bold">{r.claim_no}</td>
                    <td className="px-5 py-3">
                      {r.nama}
                      <span className="block text-[12px] text-muted">{r.phone_display}</span>
                    </td>
                    <td className="px-5 py-3">
                      {r.brand} {r.model}
                    </td>
                    <td className="tnum px-5 py-3 text-right font-bold">{rupiah(r.amount_idr)}</td>
                    <td className="px-5 py-3">
                      <span className="font-mono text-[12px]">{r.voucher_code ?? '—'}</span>
                      <span className="block text-[11px] font-bold uppercase text-muted-2">
                        {r.voucher_status ?? ''}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">{tanggalID(r.paid_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
