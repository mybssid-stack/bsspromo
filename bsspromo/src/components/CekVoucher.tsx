'use client';

import { useState } from 'react';
import { Spinner } from './ui';

type Hasil = {
  found: boolean;
  message?: string;
  code?: string;
  status?: string;
  device?: string;
  validUntil?: string;
  redeemedAt?: string | null;
  warrantyEndAt?: string | null;
};

const tanggal = (s?: string | null) =>
  s
    ? new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date(s))
    : '—';

const PESAN: Record<string, { judul: string; ket: (h: Hasil) => string; nada: 'ok' | 'netral' | 'merah' }> = {
  ACTIVE: {
    judul: 'Aktif, siap dipakai',
    ket: (h) => `Bawa ke toko sebelum ${tanggal(h.validUntil)}.`,
    nada: 'ok',
  },
  REDEEMED: {
    judul: 'Sudah ditukar di toko',
    ket: (h) =>
      `Ditukar ${tanggal(h.redeemedAt)}.` +
      (h.warrantyEndAt ? ` Garansi berlaku sampai ${tanggal(h.warrantyEndAt)}.` : ''),
    nada: 'netral',
  },
  EXPIRED: {
    judul: 'Kedaluwarsa',
    ket: (h) => `Masa berlakunya habis ${tanggal(h.validUntil)}. Hubungi CS untuk pilihan lain.`,
    nada: 'merah',
  },
  VOID: {
    judul: 'Dibatalkan',
    ket: () => 'Voucher ini dibatalkan admin. Hubungi CS untuk penjelasannya.',
    nada: 'merah',
  },
};

export default function CekVoucher() {
  const [kode, setKode] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);

  async function cek(e: React.FormEvent) {
    e.preventDefault();
    if (kode.trim().length < 4) return;
    setSibuk(true);
    setHasil(null);
    try {
      const res = await fetch(`/api/v1/voucher/status?code=${encodeURIComponent(kode.trim())}`);
      const d = (await res.json()) as Hasil & { ok: boolean; message?: string };
      setHasil(d.ok ? d : { found: false, message: d.message ?? 'Gagal mengecek.' });
    } catch {
      setHasil({ found: false, message: 'Jaringan bermasalah. Coba lagi.' });
    } finally {
      setSibuk(false);
    }
  }

  const info = hasil?.found && hasil.status ? PESAN[hasil.status] : null;
  const warna =
    info?.nada === 'ok'
      ? 'border-ok/25 bg-ok-bg'
      : info?.nada === 'merah'
        ? 'border-bss-line bg-bss-tint'
        : 'border-line bg-line-2';

  return (
    <div className="rounded-[18px] border border-line bg-white p-6 sm:p-7">
      <h3 className="display text-[18px] font-bold">Cek status voucher</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
        Masukkan kode voucher untuk melihat apakah masih aktif atau sudah ditukar.
      </p>

      <form onSubmit={cek} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={kode}
          onChange={(e) => setKode(e.target.value.toUpperCase())}
          placeholder="BSSV-XXXX-XXXX"
          aria-label="Kode voucher"
          className="w-full rounded-xl border border-line px-4 py-3 font-mono text-[15px] tracking-wide outline-none transition focus:border-bss focus:ring-4 focus:ring-bss/10"
        />
        <button
          type="submit"
          disabled={sibuk || kode.trim().length < 4}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-ink px-7 py-3 text-[14.5px] font-bold text-white transition hover:bg-ink-2 disabled:opacity-50"
        >
          {sibuk && <Spinner />}
          Cek
        </button>
      </form>

      {hasil && (
        <div className={`anim-up mt-4 rounded-xl border px-4 py-4 ${warna}`}>
          {hasil.found && info ? (
            <>
              <p className="display text-[15.5px] font-bold text-ink">{info.judul}</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{info.ket(hasil)}</p>
              <p className="mt-2 text-[12.5px] text-muted">
                {hasil.device} · <span className="font-mono">{hasil.code}</span>
              </p>
            </>
          ) : (
            <p className="text-[13.5px] leading-relaxed text-ink-2">{hasil.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
