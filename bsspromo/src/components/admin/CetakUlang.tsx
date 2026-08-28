'use client';

import { useState } from 'react';
import { Alert, Spinner } from '../ui';

type Hasil = {
  url: string;
  customerName: string;
  phoneDisplay: string;
  device: string;
  voucherStatus: string;
};

/**
 * Cetak ulang voucher.
 *
 * Sistem yang mencocokkan nomornya, bukan CS. CS cukup mengetik apa yang
 * disebutkan penelepon; kalau tidak cocok, tautannya tidak keluar sama
 * sekali. Percobaan yang gagal pun tercatat di tabel voucher_reissues.
 */
export default function CetakUlang() {
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [disalin, setDisalin] = useState(false);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true);
    setGalat('');
    setHasil(null);
    try {
      const res = await fetch('/api/admin/voucher/reissue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), phone: phone.trim() }),
      });
      const d = (await res.json()) as Hasil & { ok: boolean; message?: string };
      if (!d.ok) {
        setGalat(d.message ?? 'Gagal menerbitkan tautan.');
        return;
      }
      setHasil(d);
    } catch {
      setGalat('Jaringan bermasalah.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <div className="rounded-[18px] border border-line bg-white p-5">
      <h2 className="text-[15px] font-extrabold">Cetak ulang voucher</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        Pelanggan menelepon karena gambar vouchernya hilang. Tanyakan nomor HP yang dia pakai saat
        membayar, lalu ketik di sini. Tautan hanya keluar kalau nomornya cocok.
      </p>

      <form onSubmit={kirim} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Kode voucher — BSSV-XXXX-XXXX"
          required
          className="w-full rounded-xl border border-line px-4 py-2.5 font-mono text-[14px] uppercase outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Nomor HP yang disebutkan"
          inputMode="tel"
          required
          className="w-full rounded-xl border border-line px-4 py-2.5 text-[14px] outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
        />
        <button
          type="submit"
          disabled={sibuk}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-bss px-6 py-2.5 text-[14px] font-bold text-white transition hover:bg-bss-dark disabled:opacity-60"
        >
          {sibuk && <Spinner />}
          Cek &amp; terbitkan
        </button>
      </form>

      {galat && (
        <div className="mt-4">
          <Alert>{galat}</Alert>
        </div>
      )}

      {hasil && (
        <div className="mt-4 space-y-3 rounded-xl border border-ok/20 bg-ok-bg p-4">
          <p className="text-[13px] font-bold text-ok">
            Nomor cocok. Tautan boleh dikirim ke pelanggan.
          </p>
          <div className="text-[13px] text-ink">
            <p className="font-bold">{hasil.customerName}</p>
            <p className="text-muted">
              {hasil.phoneDisplay} · {hasil.device} · voucher {hasil.voucherStatus}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={hasil.url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-[12.5px]"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(hasil.url);
                setDisalin(true);
                setTimeout(() => setDisalin(false), 1800);
              }}
              className="shrink-0 rounded-lg bg-ink px-4 py-2 text-[13px] font-bold text-white"
            >
              {disalin ? 'Tersalin' : 'Salin tautan'}
            </button>
          </div>
          <p className="text-[12px] text-muted">
            Penerbitan ini sudah tercatat atas nama kamu.
          </p>
        </div>
      )}
    </div>
  );
}
