'use client';

import { useState } from 'react';
import { Alert, Spinner } from '../ui';

type Pengaturan = Record<string, unknown>;

export default function FormPengaturan({ awal }: { awal: Pengaturan }) {
  const [judul, setJudul] = useState(String(awal['promo.title'] ?? ''));
  const [sub, setSub] = useState(String(awal['promo.subtitle'] ?? ''));
  const [aktif, setAktif] = useState(Boolean(awal['promo.is_active']));
  const [mulai, setMulai] = useState(String(awal['promo.start_at'] ?? '').slice(0, 10));
  const [selesai, setSelesai] = useState(String(awal['promo.end_at'] ?? '').slice(0, 10));
  const [hari, setHari] = useState(String(awal['promo.voucher_valid_days'] ?? 30));
  const [menit, setMenit] = useState(String(awal['promo.claim_expiry_minutes'] ?? 30));
  const [namaToko, setNamaToko] = useState(String(awal['store.name'] ?? ''));
  const [waCs, setWaCs] = useState(String(awal['store.wa_cs'] ?? ''));
  const [syarat, setSyarat] = useState(
    (Array.isArray(awal['promo.terms']) ? (awal['promo.terms'] as string[]) : []).join('\n'),
  );

  const [sibuk, setSibuk] = useState(false);
  const [pesan, setPesan] = useState('');
  const [galat, setGalat] = useState('');

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true);
    setPesan('');
    setGalat('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          'promo.title': judul,
          'promo.subtitle': sub,
          'promo.is_active': aktif,
          // Disimpan dengan offset WIB supaya batas hari sama dengan jam toko.
          'promo.start_at': mulai ? `${mulai}T00:00:00+07:00` : null,
          'promo.end_at': selesai ? `${selesai}T23:59:59+07:00` : null,
          'promo.voucher_valid_days': Number(hari) || 30,
          'promo.claim_expiry_minutes': Number(menit) || 30,
          'promo.terms': syarat.split('\n').map((s) => s.trim()).filter(Boolean),
          'store.name': namaToko,
          'store.wa_cs': waCs.replace(/\D/g, ''),
        }),
      });
      const d = (await res.json()) as { ok: boolean; message?: string };
      if (!d.ok) setGalat(d.message ?? 'Gagal menyimpan.');
      else setPesan('Pengaturan tersimpan.');
    } catch {
      setGalat('Jaringan bermasalah.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <form onSubmit={simpan} className="max-w-2xl space-y-5">
      {galat && <Alert>{galat}</Alert>}
      {pesan && <Alert tone="ok">{pesan}</Alert>}

      <div className="rounded-[18px] border border-line bg-white p-5">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={aktif}
            onChange={(e) => setAktif(e.target.checked)}
            className="h-5 w-5 accent-[#e11b22]"
          />
          <span className="text-[14px] font-bold">
            Promo aktif
            <span className="block text-[12.5px] font-normal text-muted">
              Kalau dimatikan, landing page tetap terbuka tapi tidak bisa klaim.
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-4 rounded-[18px] border border-line bg-white p-5">
        <Isian label="Judul promo" value={judul} onChange={setJudul} />
        <Isian label="Sub judul" value={sub} onChange={setSub} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Isian label="Mulai" value={mulai} onChange={setMulai} type="date" />
          <Isian label="Berakhir" value={selesai} onChange={setSelesai} type="date" />
          <Isian label="Voucher berlaku (hari)" value={hari} onChange={setHari} />
          <Isian label="Batas bayar (menit)" value={menit} onChange={setMenit} />
        </div>
        <div>
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">
            Syarat &amp; ketentuan (satu baris satu poin)
          </span>
          <textarea
            value={syarat}
            onChange={(e) => setSyarat(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] leading-relaxed outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
          />
        </div>
      </div>

      <div className="grid gap-4 rounded-[18px] border border-line bg-white p-5 sm:grid-cols-2">
        <Isian label="Nama toko" value={namaToko} onChange={setNamaToko} />
        <Isian label="WhatsApp CS (62…)" value={waCs} onChange={setWaCs} placeholder="6282252001234" />
      </div>

      <button
        type="submit"
        disabled={sibuk}
        className="flex items-center gap-2 rounded-xl bg-bss px-7 py-3 text-[14px] font-bold text-white transition hover:bg-bss-dark disabled:opacity-60"
      >
        {sibuk && <Spinner />}
        Simpan pengaturan
      </button>
    </form>
  );
}

function Isian({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
      />
    </label>
  );
}
