'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ClaimModal from './ClaimModal';
import { Badge, Spinner } from './ui';

export type ItemPromo = {
  slug: string;
  brand: string;
  model: string;
  partType: string;
  qualityGrade: string | null;
  priceNormal: number;
  pricePromo: number;
  warrantyDays: number;
  note: string | null;
  habis: boolean;
};

const rupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID');

export default function SearchPromo({ awal }: { awal: ItemPromo[] }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ItemPromo[]>(awal);
  const [memuat, setMemuat] = useState(false);
  const [sudahCari, setSudahCari] = useState(false);
  const [dipilih, setDipilih] = useState<ItemPromo | null>(null);

  // Setiap permintaan membawa nomor urut. Respons yang datang terlambat
  // untuk kata kunci lama diabaikan — tanpa ini, hasil "vi" bisa menimpa
  // hasil "vivo y12" kalau jaringan sedang tersendat.
  const urut = useRef(0);
  const batal = useRef<AbortController | null>(null);

  const cari = useCallback(async (kata: string) => {
    const ke = ++urut.current;
    batal.current?.abort();
    const ctrl = new AbortController();
    batal.current = ctrl;

    setMemuat(true);
    try {
      const res = await fetch(`/api/v1/promo/search?q=${encodeURIComponent(kata)}`, {
        signal: ctrl.signal,
      });
      const data = (await res.json()) as { ok: boolean; items?: ItemPromo[] };
      if (ke !== urut.current) return;
      setItems(data.items ?? []);
      setSudahCari(kata.trim().length > 0);
    } catch {
      if (ke === urut.current) setItems([]);
    } finally {
      if (ke === urut.current) setMemuat(false);
    }
  }, []);

  // Debounce: kueri baru dijalankan 320 ms setelah orang berhenti mengetik.
  // Tanpa ini, "vivo y12" mengirim 8 permintaan berturut-turut.
  useEffect(() => {
    const t = setTimeout(() => {
      void cari(q);
    }, 320);
    return () => clearTimeout(t);
  }, [q, cari]);

  return (
    <div>
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ketik tipe HP kamu — misal: Vivo Y12"
          aria-label="Cari tipe HP"
          autoComplete="off"
          className="w-full rounded-2xl border border-line bg-white py-4 pl-12 pr-12 text-[15px] font-medium shadow-sm outline-none transition placeholder:font-normal placeholder:text-muted-2 focus:border-bss focus:ring-4 focus:ring-bss/10"
        />
        {memuat && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-2">
            <Spinner />
          </span>
        )}
      </div>

      <div className="mt-3 min-h-[18px] text-[13px] text-muted">
        {sudahCari
          ? items.length > 0
            ? `${items.length} tipe cocok`
            : 'Tipe itu belum masuk daftar promo.'
          : 'Ketik untuk mencari, atau lihat pilihan populer di bawah.'}
      </div>

      {sudahCari && items.length === 0 && !memuat && (
        <div className="anim-up mt-4 rounded-2xl border border-dashed border-line bg-white p-6 text-center">
          <p className="text-[15px] font-semibold text-ink">Tipe HP itu belum ada di promo</p>
          <p className="mt-1 text-sm text-muted">
            Bukan berarti tidak bisa dikerjakan. Tanya CS untuk harga normalnya — kami menerima
            hampir semua merek.
          </p>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((it, i) => (
          <article
            key={it.slug}
            className="anim-up flex flex-col rounded-[18px] border border-line bg-white p-5 shadow-sm transition hover:border-muted-2/50 hover:shadow-md"
            style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
                  {it.brand}
                </p>
                <h3 className="text-[17px] font-extrabold leading-tight text-ink">{it.model}</h3>
              </div>
              <Badge>{it.partType}</Badge>
            </div>

            <p className="mt-1 text-[13px] text-muted">
              {it.qualityGrade ? `Kualitas ${it.qualityGrade} · ` : ''}Garansi {it.warrantyDays} hari
            </p>

            <div className="mt-4 flex items-end gap-2">
              <span className="tnum text-[22px] font-extrabold tracking-tight text-bss">
                {rupiah(it.pricePromo)}
              </span>
              {it.priceNormal > it.pricePromo && (
                <span className="tnum mb-1 text-[13px] text-muted-2 line-through">
                  {rupiah(it.priceNormal)}
                </span>
              )}
            </div>
            {it.priceNormal > it.pricePromo && (
              <p className="mt-1 text-[12px] font-semibold text-ok">
                Hemat {rupiah(it.priceNormal - it.pricePromo)}
              </p>
            )}

            {it.note && <p className="mt-3 text-[12px] text-muted">{it.note}</p>}

            <button
              type="button"
              disabled={it.habis}
              onClick={() => setDipilih(it)}
              className="mt-4 w-full rounded-xl bg-bss py-3 text-[14px] font-bold text-white transition hover:bg-bss-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-muted-2"
            >
              {it.habis ? 'Stok kosong' : 'Klaim Promo'}
            </button>
          </article>
        ))}
      </div>

      {dipilih && <ClaimModal item={dipilih} onTutup={() => setDipilih(null)} />}
    </div>
  );
}
