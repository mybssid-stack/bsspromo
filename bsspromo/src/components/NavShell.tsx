'use client';

import { useEffect, useState } from 'react';

/**
 * Satu navigasi untuk dua ukuran layar.
 *
 * Menu-nya SATU daftar. Di layar lebar tampil sebagai baris tautan di header;
 * di layar sempit daftar yang sama muncul sebagai bilah tab di bawah. Tujuan
 * dan urutannya identik, jadi tidak mungkin ada bagian yang cuma bisa diakses
 * dari salah satu ukuran layar — itu penyebab tampilan mobile dan desktop
 * terasa seperti dua produk berbeda.
 */
const MENU = [
  { id: 'bagian-harga', label: 'Harga Promo', pendek: 'Promo', ikon: IkonTag },
  { id: 'bagian-cara', label: 'Cara Klaim', pendek: 'Cara Klaim', ikon: IkonLangkah },
  { id: 'bagian-voucher', label: 'Cek Voucher', pendek: 'Voucher', ikon: IkonTiket },
  { id: 'bagian-garansi', label: 'Garansi', pendek: 'Garansi', ikon: IkonPerisai },
];

export default function NavShell({ waCs, namaToko }: { waCs: string; namaToko: string }) {
  const [aktif, setAktif] = useState('bagian-harga');

  // Menyorot tab sesuai bagian yang sedang terlihat.
  useEffect(() => {
    const target = MENU.map((m) => document.getElementById(m.id)).filter(Boolean) as HTMLElement[];
    if (target.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        const terlihat = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (terlihat) setAktif(terlihat.target.id);
      },
      { rootMargin: '-76px 0px -55% 0px', threshold: 0 },
    );
    target.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  const keBagian = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* ── Header: sama di semua ukuran ── */}
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bss-logo.jpg"
            alt=""
            width={38}
            height={38}
            className="h-[38px] w-[38px] shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="display truncate text-[15px] font-bold leading-tight sm:text-[16px]">
              {namaToko}
            </p>
            <p className="truncate text-[9.5px] font-bold uppercase tracking-[0.13em] text-muted-2 sm:text-[10px]">
              Business Smartphone Solution
            </p>
          </div>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {MENU.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => keBagian(m.id)}
                className={`rounded-lg px-3 py-2 text-[13.5px] font-bold transition ${
                  aktif === m.id ? 'text-bss' : 'text-ink-2 hover:bg-line-2'
                }`}
              >
                {m.label}
              </button>
            ))}
          </nav>

          <a
            href="/admin"
            className="ml-auto shrink-0 rounded-lg border border-line px-3.5 py-2 text-[13px] font-bold transition hover:bg-line-2 md:ml-2"
          >
            Admin
          </a>
        </div>
      </header>

      {/* ── Bilah tab bawah: daftar menu yang SAMA, hanya di layar sempit ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/97 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navigasi bagian"
      >
        <div className="grid grid-cols-5">
          {MENU.map((m) => {
            const Ikon = m.ikon;
            const on = aktif === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => keBagian(m.id)}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition ${
                  on ? 'text-bss' : 'text-muted'
                }`}
              >
                <span className={`h-[3px] w-6 rounded-full ${on ? 'bg-bss' : 'bg-transparent'}`} />
                <Ikon />
                {m.pendek}
              </button>
            );
          })}
          <a
            href={waCs ? `https://wa.me/${waCs}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold text-ok"
          >
            <span className="h-[3px] w-6 rounded-full bg-transparent" />
            <IkonChat />
            Chat CS
          </a>
        </div>
      </nav>

      {/* ── Tombol WhatsApp mengambang: hanya layar lebar, karena di layar
             sempit tempatnya sudah ada di bilah tab ── */}
      {waCs && (
        <a
          href={`https://wa.me/${waCs}?text=${encodeURIComponent('Halo BSS, saya mau tanya promo ganti LCD')}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Chat CS via WhatsApp"
          className="fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 md:flex"
        >
          <IkonChat besar />
        </a>
      )}
    </>
  );
}

function IkonTag() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7a2 2 0 0 1 2-2h5l9 9-7 7-9-9V7Z" strokeLinejoin="round" />
      <circle cx="7.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IkonLangkah() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
    </svg>
  );
}
function IkonTiket() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" />
    </svg>
  );
}
function IkonPerisai() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l7 3v6c0 4.2-2.9 7.8-7 9-4.1-1.2-7-4.8-7-9V6l7-3Z" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IkonChat({ besar = false }: { besar?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={besar ? 'h-7 w-7' : 'h-[18px] w-[18px]'}
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.3-1.4A10 10 0 1 0 12 2Zm5.5 14.2c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.4-1-2.6 0-1.2.6-1.8.9-2 .2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.2 0 .4-.1.5l-.3.4c-.1.1-.3.3-.1.6.1.2.6 1.1 1.4 1.7 1 .8 1.7 1.1 2 1.2.2.1.4.1.5-.1l.8-.9c.2-.2.3-.1.5-.1l1.8.9c.2.1.4.2.4.3.1.1.1.6-.1 1.2Z" />
    </svg>
  );
}
