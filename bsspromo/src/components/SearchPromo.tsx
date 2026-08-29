'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ClaimModal from './ClaimModal';
import { Spinner } from './ui';

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
  stock: number | null;
};

const rupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const diskon = (normal: number, promo: number) =>
  normal > promo ? Math.round(100 - (promo * 100) / normal) : 0;

export default function SearchPromo({
  awal,
  populer,
}: {
  awal: ItemPromo[];
  populer: string[];
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ItemPromo[]>(awal);
  const [memuat, setMemuat] = useState(false);
  const [sudahCari, setSudahCari] = useState(false);
  const [dipilih, setDipilih] = useState<ItemPromo | null>(null);

  // Setiap permintaan membawa nomor urut. Respons yang datang terlambat untuk
  // kata kunci lama diabaikan — tanpa ini, hasil "vi" bisa menimpa hasil
  // "vivo y12" kalau jaringan sedang tersendat.
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

  // Debounce: kueri baru jalan 320 ms setelah orang berhenti mengetik. Tanpa
  // ini, "vivo y12" mengirim delapan permintaan berturut-turut.
  useEffect(() => {
    const t = setTimeout(() => {
      void cari(q);
    }, 320);
    return () => clearTimeout(t);
  }, [q, cari]);

  return (
    <div>
      {/* ── Bilah pencarian ── */}
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2 sm:left-5"
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
          placeholder="Ketik tipe HP kamu — vivo y12, oppo a57, redmi 9a…"
          aria-label="Cari tipe HP"
          autoComplete="off"
          className="w-full rounded-2xl border border-line bg-white py-4 pl-12 pr-24 text-[15px] font-semibold shadow-sm outline-none transition placeholder:font-normal placeholder:text-muted-2 focus:border-bss focus:ring-4 focus:ring-bss/10 sm:py-5 sm:pl-14 sm:text-[16px]"
        />
        <span className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2 sm:right-5">
          {memuat && <Spinner className="text-muted-2" />}
          <span className="hidden rounded-lg bg-line-2 px-2.5 py-1.5 text-[11.5px] font-bold text-muted sm:inline">
            {items.length} tipe
          </span>
        </span>
      </div>

      {/* ── Tipe populer ── */}
      {populer.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-muted">Populer:</span>
          {populer.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setQ(p)}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition ${
                q.toLowerCase() === p.toLowerCase()
                  ? 'border-bss bg-bss text-white'
                  : 'border-line bg-white text-ink-2 hover:border-muted-2'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* ── Hasil ── */}
      {sudahCari && items.length === 0 && !memuat && (
        <div className="anim-up mt-6 rounded-[18px] border border-dashed border-line bg-white p-7 text-center">
          <p className="display text-[17px] font-bold">Tipe itu belum masuk daftar promo</p>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted">
            Bukan berarti tidak bisa dikerjakan — kami menerima hampir semua merek. Tanya CS untuk
            harga normalnya.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it, i) => {
          const potong = diskon(it.priceNormal, it.pricePromo);
          return (
            <article
              key={it.slug}
              className="anim-up flex flex-col rounded-[18px] border border-line bg-white p-5 shadow-sm transition hover:border-muted-2/60 hover:shadow-md"
              style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10.5px] font-extrabold uppercase tracking-[0.13em] text-muted-2">
                  {it.brand}
                </p>
                {potong > 0 && (
                  <span className="rounded-md bg-bss px-2 py-1 text-[11px] font-extrabold text-white">
                    -{potong}%
                  </span>
                )}
              </div>

              <h3 className="display mt-1 text-[19px] font-bold leading-tight text-ink">
                {it.model}
              </h3>
              <p className="mt-0.5 text-[13px] text-muted">Ganti {it.partType} + pasang</p>

              <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {it.priceNormal > it.pricePromo && (
                  <span className="tnum text-[13.5px] text-muted-2 line-through">
                    {rupiah(it.priceNormal)}
                  </span>
                )}
                <span className="tnum display text-[23px] font-bold tracking-tight text-bss">
                  {rupiah(it.pricePromo)}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-md bg-ok-bg px-2 py-1 text-[11px] font-bold text-ok">
                  Garansi {it.warrantyDays} hari
                </span>
                {/* Jumlah stok sengaja tidak ditampilkan. Angka pasti seperti
                    "tinggal 2 unit" menjanjikan ketepatan yang tidak bisa
                    dipegang: stok di sini hanya berkurang saat ada yang bayar
                    online, sementara unit yang sama juga terpakai pelanggan
                    yang datang langsung ke toko. Cukup tersedia atau habis. */}
                <span
                  className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                    it.habis ? 'bg-line-2 text-muted-2' : 'bg-line-2 text-muted'
                  }`}
                >
                  {it.habis ? 'Habis' : 'Tersedia'}
                </span>
              </div>

              {it.note && <p className="mt-2 text-[12px] text-muted">{it.note}</p>}

              <button
                type="button"
                disabled={it.habis}
                onClick={() => setDipilih(it)}
                className="tiket"
                style={{ marginTop: '18px' }}
              >
                <span className="tiket-kilau" aria-hidden />
                <span className="tiket-perforasi" aria-hidden />
                {it.habis ? 'Stok kosong' : 'Klaim Promo'}
              </button>
            </article>
          );
        })}
      </div>

      {dipilih && <ClaimModal item={dipilih} onTutup={() => setDipilih(null)} />}
    </div>
  );
}
