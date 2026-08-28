'use client';

import { useEffect, useRef, useState } from 'react';
import type { ItemPromo } from './SearchPromo';
import { Alert, Badge, Spinner } from './ui';

declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        opsi?: {
          onSuccess?: () => void;
          onPending?: () => void;
          onError?: () => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

const rupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID');

/** Muat snap.js sekali saja, saat benar-benar dibutuhkan. */
function muatSnap(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.snap) return resolve();
    const src = process.env.NEXT_PUBLIC_MIDTRANS_SNAP_URL ?? 'https://app.midtrans.com/snap/snap.js';
    const ada = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (ada) {
      ada.addEventListener('load', () => resolve());
      ada.addEventListener('error', () => reject(new Error('snap gagal dimuat')));
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.setAttribute('data-client-key', process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY ?? '');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('snap gagal dimuat'));
    document.head.appendChild(s);
  });
}

type Tahap = 'nomor' | 'data' | 'konfirmasi' | 'menunggu';

export default function ClaimModal({ item, onTutup }: { item: ItemPromo; onTutup: () => void }) {
  const [tahap, setTahap] = useState<Tahap>('nomor');
  const [phone, setPhone] = useState('');
  const [nama, setNama] = useState('');
  const [alamat, setAlamat] = useState('');
  const [terdaftar, setTerdaftar] = useState(false);
  const [mengecek, setMengecek] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');
  const [claimNo, setClaimNo] = useState('');
  const [claimTok, setClaimTok] = useState('');
  const [statusBayar, setStatusBayar] = useState('Menunggu pembayaran…');

  const sudahLookup = useRef('');

  // Esc menutup, dan scroll halaman dikunci supaya latar tidak ikut bergerak.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && tahap !== 'menunggu') onTutup();
    };
    document.addEventListener('keydown', onKey);
    const asli = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = asli;
    };
  }, [onTutup, tahap]);

  // ── Cek nomor ke database pelanggan lama ────────────────────────────────
  useEffect(() => {
    const bersih = phone.replace(/\D/g, '');
    if (bersih.length < 9 || tahap !== 'nomor') return;
    if (sudahLookup.current === bersih) return;

    const t = setTimeout(async () => {
      sudahLookup.current = bersih;
      setMengecek(true);
      setGalat('');
      try {
        const res = await fetch('/api/v1/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        const d = (await res.json()) as {
          ok: boolean;
          valid?: boolean;
          found?: boolean;
          name?: string;
          address?: string;
          message?: string;
        };
        if (!d.ok) {
          setGalat(d.message ?? 'Gagal mengecek nomor.');
          return;
        }
        if (!d.valid) {
          setTerdaftar(false);
          return;
        }
        setTerdaftar(Boolean(d.found));
        if (d.found) {
          setNama(d.name ?? '');
          setAlamat(d.address ?? '');
        }
      } catch {
        // Bridge mati bukan urusan pelanggan — lanjut isi manual.
        setTerdaftar(false);
      } finally {
        setMengecek(false);
      }
    }, 420);

    return () => clearTimeout(t);
  }, [phone, tahap]);

  const nomorValid = /^(?:\+?62|0)8[1-9][0-9]{6,11}$/.test(phone.replace(/[\s.-]/g, ''));

  function lanjutDariNomor() {
    if (!nomorValid) {
      setGalat('Nomor HP belum benar. Contoh: 0822 5200 1234');
      return;
    }
    setGalat('');
    setTahap(terdaftar ? 'konfirmasi' : 'data');
  }

  function lanjutDariData() {
    if (nama.trim().length < 2) {
      setGalat('Nama minimal 2 huruf.');
      return;
    }
    setGalat('');
    setTahap('konfirmasi');
  }

  // ── Buat tagihan lalu buka Snap ─────────────────────────────────────────
  async function bayar() {
    setSibuk(true);
    setGalat('');
    try {
      const res = await fetch('/api/v1/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: item.slug,
          phone,
          name: terdaftar ? undefined : nama,
          address: alamat || undefined,
        }),
      });
      const d = (await res.json()) as {
        ok: boolean;
        message?: string;
        claimNo?: string;
        claimToken?: string;
        snapToken?: string;
        redirectUrl?: string;
      };

      if (!d.ok || !d.snapToken) {
        setGalat(d.message ?? 'Gagal membuat tagihan.');
        setSibuk(false);
        return;
      }

      setClaimNo(d.claimNo!);
      setClaimTok(d.claimToken!);
      setTahap('menunggu');

      try {
        await muatSnap();
        window.snap!.pay(d.snapToken, {
          onSuccess: () => setStatusBayar('Pembayaran diterima. Menyiapkan voucher…'),
          onPending: () => setStatusBayar('Menunggu pembayaran selesai…'),
          onError: () => setStatusBayar('Pembayaran gagal. Coba metode lain.'),
          onClose: () => setStatusBayar('Jendela pembayaran ditutup. Belum ada pembayaran masuk.'),
        });
      } catch {
        // Snap.js diblokir (adblock / jaringan). Pakai halaman Midtrans.
        if (d.redirectUrl) window.location.href = d.redirectUrl;
        else setGalat('Tidak bisa membuka jendela pembayaran. Matikan pemblokir iklan lalu coba lagi.');
      }
    } catch {
      setGalat('Jaringan bermasalah. Coba lagi.');
    } finally {
      setSibuk(false);
    }
  }

  // ── Tunggu webhook Midtrans, bukan callback browser ─────────────────────
  // Callback onSuccess di atas hanya untuk teks di layar. Yang menentukan
  // voucher terbit atau tidak adalah status di database kami.
  useEffect(() => {
    if (tahap !== 'menunggu' || !claimNo || !claimTok) return;
    let hidup = true;
    let jeda = 2500;

    const cek = async () => {
      if (!hidup) return;
      try {
        const res = await fetch(
          `/api/v1/claim/${encodeURIComponent(claimNo)}/status?k=${encodeURIComponent(claimTok)}`,
          { cache: 'no-store' },
        );
        const d = (await res.json()) as {
          ok: boolean;
          status?: string;
          voucher?: { code: string; url: string } | null;
        };
        if (d.ok && d.status === 'PAID' && d.voucher) {
          window.location.href = d.voucher.url;
          return;
        }
        if (d.ok && d.status === 'FAILED') {
          setStatusBayar('Pembayaran gagal atau kedaluwarsa. Silakan ulangi klaim.');
          return;
        }
      } catch {
        /* diamkan, coba lagi */
      }
      // Melambat pelan-pelan supaya tidak membanjiri server kalau pelanggan
      // meninggalkan tab terbuka setengah jam.
      jeda = Math.min(jeda * 1.25, 15000);
      if (hidup) setTimeout(cek, jeda);
    };

    const t = setTimeout(cek, jeda);
    return () => {
      hidup = false;
      clearTimeout(t);
    };
  }, [tahap, claimNo, claimTok]);

  const langkah = tahap === 'nomor' ? 1 : tahap === 'data' ? 2 : tahap === 'konfirmasi' ? 3 : 4;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Klaim promo"
      onClick={(e) => {
        if (e.target === e.currentTarget && tahap !== 'menunggu') onTutup();
      }}
    >
      <div className="anim-up max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[22px] bg-white shadow-2xl sm:rounded-[22px]">
        {/* Kepala */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              Langkah {langkah} dari 4
            </p>
            <h2 className="text-[17px] font-extrabold leading-tight">
              {item.brand} {item.model}
            </h2>
          </div>
          <button
            type="button"
            onClick={onTutup}
            disabled={tahap === 'menunggu'}
            aria-label="Tutup"
            className="ml-auto rounded-lg p-2 text-muted-2 transition hover:bg-line-2 hover:text-ink disabled:opacity-30"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          {galat && <Alert>{galat}</Alert>}

          {/* ── 1. Nomor HP ── */}
          {tahap === 'nomor' && (
            <>
              <div>
                <label htmlFor="hp" className="mb-2 block text-[12px] font-bold uppercase tracking-wide text-muted">
                  Nomor HP / WhatsApp
                </label>
                <div className="relative">
                  <input
                    id="hp"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0822 5200 1234"
                    autoFocus
                    className="w-full rounded-xl border border-line py-3.5 pl-4 pr-11 text-[16px] font-semibold outline-none transition focus:border-bss focus:ring-4 focus:ring-bss/10"
                  />
                  {mengecek && (
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-2">
                      <Spinner />
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                  Dicocokkan otomatis dengan data pelanggan BSS. Kalau sudah pernah servis di sini,
                  nama dan alamat terisi sendiri.
                </p>
              </div>

              {terdaftar && (
                <div className="anim-up rounded-xl border border-ok/20 bg-ok-bg px-4 py-3">
                  <Badge tone="ok">TERDAFTAR DI DATABASE BSS</Badge>
                  <p className="mt-2 text-[15px] font-bold text-ink">{nama}</p>
                  {alamat && <p className="text-[13px] text-muted">{alamat}</p>}
                </div>
              )}

              <button
                type="button"
                onClick={lanjutDariNomor}
                disabled={!nomorValid}
                className="w-full rounded-xl bg-bss py-3.5 text-[15px] font-bold text-white transition hover:bg-bss-dark disabled:bg-line disabled:text-muted-2"
              >
                Lanjut
              </button>
            </>
          )}

          {/* ── 2. Data baru ── */}
          {tahap === 'data' && (
            <>
              <Alert tone="info">
                Nomor ini belum terdaftar. Isi data sekali saja — berikutnya sudah otomatis.
              </Alert>
              <div>
                <label htmlFor="nm" className="mb-2 block text-[12px] font-bold uppercase tracking-wide text-muted">
                  Nama lengkap
                </label>
                <input
                  id="nm"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  autoFocus
                  autoComplete="name"
                  placeholder="Nama sesuai panggilan sehari-hari"
                  className="w-full rounded-xl border border-line px-4 py-3.5 text-[16px] font-semibold outline-none transition focus:border-bss focus:ring-4 focus:ring-bss/10"
                />
              </div>
              <div>
                <label htmlFor="al" className="mb-2 block text-[12px] font-bold uppercase tracking-wide text-muted">
                  Alamat <span className="font-medium normal-case text-muted-2">(boleh dikosongkan)</span>
                </label>
                <input
                  id="al"
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  placeholder="Desa / kecamatan saja sudah cukup"
                  className="w-full rounded-xl border border-line px-4 py-3.5 text-[15px] outline-none transition focus:border-bss focus:ring-4 focus:ring-bss/10"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTahap('nomor')}
                  className="rounded-xl border border-line px-5 py-3.5 text-[15px] font-bold text-muted transition hover:bg-line-2"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={lanjutDariData}
                  className="flex-1 rounded-xl bg-bss py-3.5 text-[15px] font-bold text-white transition hover:bg-bss-dark"
                >
                  Lanjut
                </button>
              </div>
            </>
          )}

          {/* ── 3. Konfirmasi ── */}
          {tahap === 'konfirmasi' && (
            <>
              <div className="rounded-xl border border-line bg-canvas p-4">
                <Baris k="Nama" v={nama} />
                <Baris k="Nomor HP" v={phone} />
                {alamat && <Baris k="Alamat" v={alamat} />}
                <Baris k="Unit" v={`${item.brand} ${item.model}`} />
                <Baris
                  k="Pekerjaan"
                  v={`Ganti ${item.partType}${item.qualityGrade ? ` · ${item.qualityGrade}` : ''}`}
                />
                <Baris k="Garansi" v={`${item.warrantyDays} hari sejak terpasang`} />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-bss-line bg-bss-tint px-4 py-4">
                <span className="text-[12px] font-bold uppercase tracking-wide text-bss-dark">
                  Total bayar
                </span>
                <span className="tnum text-[22px] font-extrabold text-bss">
                  {rupiah(item.pricePromo)}
                </span>
              </div>

              <p className="text-[12.5px] leading-relaxed text-muted">
                Setelah pembayaran berhasil, voucher ber-QR langsung terbit. Simpan gambarnya, lalu
                tunjukkan ke CS saat datang ke toko.
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTahap(terdaftar ? 'nomor' : 'data')}
                  className="rounded-xl border border-line px-5 py-3.5 text-[15px] font-bold text-muted transition hover:bg-line-2"
                >
                  Kembali
                </button>
                <button
                  type="button"
                  onClick={bayar}
                  disabled={sibuk}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-bss py-3.5 text-[15px] font-bold text-white transition hover:bg-bss-dark disabled:opacity-60"
                >
                  {sibuk && <Spinner />}
                  {sibuk ? 'Menyiapkan…' : 'Lanjut ke pembayaran'}
                </button>
              </div>
            </>
          )}

          {/* ── 4. Menunggu ── */}
          {tahap === 'menunggu' && (
            <div className="py-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-bss-tint text-bss">
                <Spinner className="h-6 w-6" />
              </div>
              <p className="mt-4 text-[16px] font-bold">{statusBayar}</p>
              <p className="mt-1 text-[13px] text-muted">
                Nomor invoice <span className="font-bold text-ink">{claimNo}</span>
              </p>
              <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
                Jangan tutup halaman ini. Begitu pembayaran terkonfirmasi, kamu langsung diarahkan
                ke voucher.
              </p>
              <a
                href={`/klaim/${encodeURIComponent(claimNo)}?k=${encodeURIComponent(claimTok)}`}
                className="mt-5 inline-block text-[13px] font-bold text-bss underline underline-offset-4"
              >
                Buka halaman status pembayaran
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Baris({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2 text-[13.5px] last:border-0">
      <span className="shrink-0 text-muted">{k}</span>
      <span className="text-right font-semibold text-ink">{v}</span>
    </div>
  );
}
