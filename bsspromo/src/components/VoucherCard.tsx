'use client';

import { useRef, useState } from 'react';
import { Spinner } from './ui';

export type DataVoucher = {
  code: string;
  invoiceNo: string;
  status: string;
  nama: string;
  phoneDisplay: string;
  brand: string;
  model: string;
  partType: string;
  qualityGrade: string;
  amount: number;
  metode: string;
  warrantyDays: number;
  paidAt: string;
  validUntil: string;
  qrDataUrl: string;
  storeName: string;
  waCs: string;
};

const rupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID');

export default function VoucherCard({ d }: { d: DataVoucher }) {
  const kartu = useRef<HTMLDivElement>(null);
  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState('');

  const ditukar = d.status === 'REDEEMED';
  const mati = d.status === 'EXPIRED' || d.status === 'VOID';

  async function simpan() {
    if (!kartu.current) return;
    setSibuk(true);
    setPesan('');
    try {
      const { toBlob } = await import('html-to-image');
      const blob = await toBlob(kartu.current, {
        // pixelRatio 2 supaya tetap tajam saat di-zoom di galeri HP.
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      if (!blob) throw new Error('gagal render');

      const file = new File([blob], `voucher-${d.code}.png`, { type: 'image/png' });

      // Jalur HP: buka lembar bagikan bawaan → "Simpan Gambar".
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: `Voucher ${d.code}` });
          setSibuk(false);
          return;
        } catch (e) {
          // Pengguna membatalkan itu bukan galat.
          if ((e as Error)?.name === 'AbortError') {
            setSibuk(false);
            return;
          }
        }
      }

      // Jalur desktop.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `voucher-${d.code}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setPesan('Voucher tersimpan.');
    } catch {
      setPesan('Gagal menyimpan otomatis. Screenshot halaman ini saja — sama sahnya.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* ── Kartu voucher (yang dirasterisasi jadi PNG) ── */}
      <div
        ref={kartu}
        className="overflow-hidden rounded-[20px] border border-line bg-white shadow-sm"
      >
        <div className="bg-bss px-6 py-5 text-white">
          <p className="text-[10.5px] font-black uppercase tracking-[0.18em] opacity-90">
            Voucher Promo Ganti {d.partType}
          </p>
          <p className="mt-1 text-[19px] font-black leading-tight">{d.storeName}</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">
            Business Smartphone Solution
          </p>
        </div>

        {(ditukar || mati) && (
          <div className={`px-6 py-3 text-center text-[13px] font-extrabold ${ditukar ? 'bg-line-2 text-muted' : 'bg-bss-tint text-bss-dark'}`}>
            {ditukar ? 'SUDAH DITUKAR' : d.status === 'VOID' ? 'DIBATALKAN' : 'KEDALUWARSA'}
          </div>
        )}

        <div className="px-6 py-5">
          <Baris k="Nama" v={d.nama} />
          <Baris k="Nomor HP" v={d.phoneDisplay} />
          <Baris k="Unit" v={`${d.brand} ${d.model}`} kuat />
          <Baris
            k="Pekerjaan"
            v={`Ganti ${d.partType}${d.qualityGrade ? ` · ${d.qualityGrade}` : ''}`}
          />
          <Baris k="Invoice" v={d.invoiceNo} />
          <Baris k="Garansi" v={`${d.warrantyDays} hari sejak terpasang`} />
          <Baris k="Berlaku sampai" v={d.validUntil} />

          <div className="mt-4 flex items-center justify-between rounded-xl bg-canvas px-4 py-3">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-2">
                Dibayar · {d.metode}
              </p>
              <p className="tnum text-[20px] font-black text-ink">{rupiah(d.amount)}</p>
            </div>
            <span className="rounded-md bg-ok-bg px-2.5 py-1.5 text-[12px] font-black tracking-wide text-ok">
              LUNAS
            </span>
          </div>
        </div>

        {/* Kuadran QR: latar putih murni + ruang sunyi, supaya kamera CS
            tetap bisa mengunci meski layar pelanggan retak. */}
        <div className="border-t border-line bg-white px-6 pb-6 pt-5 text-center">
          <div className="mx-auto w-fit rounded-xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.qrDataUrl} alt={`QR voucher ${d.code}`} width={216} height={216} />
          </div>
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-2">
            Ditunjukkan ke CS BSS
          </p>
          <p className="tnum mt-1 text-[21px] font-black tracking-[0.1em] text-ink">{d.code}</p>
          <p className="mt-1 text-[11px] text-muted">
            Kalau QR tidak terbaca, sebutkan kode di atas.
          </p>
        </div>
      </div>

      {/* ── Tombol (di luar kartu, tidak ikut ter-render) ── */}
      <button
        type="button"
        onClick={simpan}
        disabled={sibuk}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-bss py-3.5 text-[15px] font-bold text-white transition hover:bg-bss-dark disabled:opacity-60"
      >
        {sibuk && <Spinner />}
        {sibuk ? 'Menyiapkan gambar…' : 'Simpan voucher ke galeri'}
      </button>

      {pesan && <p className="text-center text-[13px] text-muted">{pesan}</p>}

      {d.waCs && (
        <a
          href={`https://wa.me/${d.waCs}?text=${encodeURIComponent(`Halo BSS, saya punya voucher promo ${d.code}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-line py-3.5 text-center text-[14px] font-bold text-ink transition hover:bg-line-2"
        >
          Tanya CS via WhatsApp
        </a>
      )}
    </div>
  );
}

function Baris({ k, v, kuat = false }: { k: string; v: string; kuat?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line-2 py-2.5 last:border-0">
      <span className="shrink-0 text-[12.5px] text-muted">{k}</span>
      <span className={`text-right ${kuat ? 'text-[15px] font-black' : 'text-[13.5px] font-semibold'} text-ink`}>
        {v}
      </span>
    </div>
  );
}
