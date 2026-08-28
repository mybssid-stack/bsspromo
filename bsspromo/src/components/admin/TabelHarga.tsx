'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Spinner } from '../ui';

type Item = {
  id: string;
  brand: string;
  model: string;
  aliases: string[];
  slug: string;
  partType: string;
  qualityGrade: string | null;
  priceNormalIdr: number;
  pricePromoIdr: number;
  warrantyDays: number;
  stock: number | null;
  isActive: boolean;
  note: string | null;
  sortOrder: number;
};

const rupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID');

const KOSONG = {
  brand: '',
  model: '',
  aliases: '',
  partType: 'LCD',
  qualityGrade: 'Standart',
  priceNormalIdr: '',
  pricePromoIdr: '',
  warrantyDays: '7',
  stock: '',
  note: '',
};

export default function TabelHarga() {
  const [items, setItems] = useState<Item[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState('');
  const [pesan, setPesan] = useState('');
  const [form, setForm] = useState({ ...KOSONG });
  const [simpan, setSimpan] = useState(false);
  const [ubahId, setUbahId] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const res = await fetch('/api/admin/promo', { cache: 'no-store' });
      const d = (await res.json()) as { ok: boolean; items?: Item[]; message?: string };
      if (!d.ok) setGalat(d.message ?? 'Gagal memuat.');
      else setItems(d.items ?? []);
    } catch {
      setGalat('Jaringan bermasalah.');
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  async function tambah(e: React.FormEvent) {
    e.preventDefault();
    setSimpan(true);
    setGalat('');
    setPesan('');
    try {
      const res = await fetch('/api/admin/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: form.brand,
          model: form.model,
          aliases: form.aliases
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
          partType: form.partType,
          qualityGrade: form.qualityGrade || undefined,
          priceNormalIdr: Number(form.priceNormalIdr) || 0,
          pricePromoIdr: Number(form.pricePromoIdr) || 0,
          warrantyDays: Number(form.warrantyDays) || 7,
          stock: form.stock === '' ? null : Number(form.stock),
          note: form.note || undefined,
        }),
      });
      const d = (await res.json()) as { ok: boolean; message?: string };
      if (!d.ok) {
        setGalat(d.message ?? 'Gagal menambah.');
        return;
      }
      setForm({ ...KOSONG });
      setPesan('Tipe HP ditambahkan.');
      await muat();
    } finally {
      setSimpan(false);
    }
  }

  async function ubah(id: string, patch: Partial<Item>) {
    setUbahId(id);
    setGalat('');
    try {
      const res = await fetch(`/api/admin/promo/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const d = (await res.json()) as { ok: boolean; message?: string };
      if (!d.ok) setGalat(d.message ?? 'Gagal menyimpan.');
      else await muat();
    } finally {
      setUbahId(null);
    }
  }

  async function hapus(it: Item) {
    if (!confirm(`Hapus ${it.brand} ${it.model} dari daftar promo?`)) return;
    const res = await fetch(`/api/admin/promo/${it.id}`, { method: 'DELETE' });
    const d = (await res.json()) as { ok: boolean; message?: string; deleted?: boolean };
    if (!d.ok) setGalat(d.message ?? 'Gagal menghapus.');
    else {
      setPesan(d.message ?? 'Terhapus.');
      await muat();
    }
  }

  return (
    <div className="space-y-5">
      {galat && <Alert>{galat}</Alert>}
      {pesan && <Alert tone="ok">{pesan}</Alert>}

      {/* ── Tambah ── */}
      <form onSubmit={tambah} className="rounded-[18px] border border-line bg-white p-5">
        <h2 className="text-[15px] font-extrabold">Tambah tipe HP</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Isian label="Merek *" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} placeholder="Vivo" />
          <Isian label="Model *" value={form.model} onChange={(v) => setForm({ ...form, model: v })} placeholder="Y12" />
          <Isian
            label="Nama lain (pisah koma)"
            value={form.aliases}
            onChange={(v) => setForm({ ...form, aliases: v })}
            placeholder="y12s, y15, y17"
          />
          <Isian label="Jenis part" value={form.partType} onChange={(v) => setForm({ ...form, partType: v })} />
          <Isian
            label="Kualitas"
            value={form.qualityGrade}
            onChange={(v) => setForm({ ...form, qualityGrade: v })}
            placeholder="Standart / Premium / Original"
          />
          <Isian
            label="Harga normal *"
            value={form.priceNormalIdr}
            onChange={(v) => setForm({ ...form, priceNormalIdr: v.replace(/\D/g, '') })}
            placeholder="265000"
          />
          <Isian
            label="Harga promo *"
            value={form.pricePromoIdr}
            onChange={(v) => setForm({ ...form, pricePromoIdr: v.replace(/\D/g, '') })}
            placeholder="235000"
          />
          <Isian
            label="Garansi (hari)"
            value={form.warrantyDays}
            onChange={(v) => setForm({ ...form, warrantyDays: v.replace(/\D/g, '') })}
          />
          <Isian
            label="Stok (kosong = tak terbatas)"
            value={form.stock}
            onChange={(v) => setForm({ ...form, stock: v.replace(/\D/g, '') })}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <Isian label="Catatan" value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
          </div>
        </div>
        <button
          type="submit"
          disabled={simpan}
          className="mt-4 flex items-center gap-2 rounded-xl bg-bss px-6 py-3 text-[14px] font-bold text-white transition hover:bg-bss-dark disabled:opacity-60"
        >
          {simpan && <Spinner />}
          Tambahkan
        </button>
      </form>

      {/* ── Daftar ── */}
      <div className="rounded-[18px] border border-line bg-white">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-[15px] font-extrabold">{items.length} tipe terdaftar</h2>
        </div>

        {memuat ? (
          <p className="px-5 py-10 text-center text-muted">
            <Spinner /> memuat…
          </p>
        ) : items.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13.5px] text-muted">Belum ada tipe HP.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted-2">
                  <th className="px-5 py-2.5 font-bold">Unit</th>
                  <th className="px-5 py-2.5 text-right font-bold">Normal</th>
                  <th className="px-5 py-2.5 text-right font-bold">Promo</th>
                  <th className="px-5 py-2.5 text-right font-bold">Stok</th>
                  <th className="px-5 py-2.5 text-center font-bold">Aktif</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-line-2 last:border-0">
                    <td className="px-5 py-3">
                      <span className="font-bold">
                        {it.brand} {it.model}
                      </span>
                      <span className="block text-[12px] text-muted">
                        {it.partType}
                        {it.qualityGrade ? ` · ${it.qualityGrade}` : ''} · garansi {it.warrantyDays} hari
                      </span>
                    </td>
                    <td className="tnum px-5 py-3 text-right text-muted">{rupiah(it.priceNormalIdr)}</td>
                    <td className="px-5 py-3 text-right">
                      <input
                        type="text"
                        defaultValue={String(it.pricePromoIdr)}
                        onBlur={(e) => {
                          const v = Number(e.target.value.replace(/\D/g, ''));
                          if (v && v !== it.pricePromoIdr) void ubah(it.id, { pricePromoIdr: v });
                        }}
                        className="tnum w-28 rounded-lg border border-line px-2 py-1.5 text-right font-bold outline-none focus:border-bss"
                      />
                    </td>
                    <td className="tnum px-5 py-3 text-right text-muted">
                      {it.stock === null ? '∞' : it.stock}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => void ubah(it.id, { isActive: !it.isActive })}
                        disabled={ubahId === it.id}
                        className={`rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-wide ${
                          it.isActive ? 'bg-ok-bg text-ok' : 'bg-line-2 text-muted-2'
                        }`}
                      >
                        {it.isActive ? 'Aktif' : 'Mati'}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void hapus(it)}
                        className="text-[12.5px] font-bold text-bss hover:underline"
                      >
                        Hapus
                      </button>
                    </td>
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

function Isian({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-line px-3 py-2.5 text-[14px] outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
      />
    </label>
  );
}
