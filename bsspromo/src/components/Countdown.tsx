'use client';

import { useEffect, useState } from 'react';

/**
 * Hitung mundur ke akhir promo.
 *
 * Dirender kosong dulu di server lalu diisi setelah komponen hidup di
 * browser. Kalau angkanya ikut dirender di server, HTML hasil server dan
 * hasil klien akan berbeda beberapa detik dan React melempar hydration
 * mismatch — tampilannya berkedip dan konsol penuh peringatan.
 */
export default function Countdown({ sampai }: { sampai: string }) {
  const [sisa, setSisa] = useState<number | null>(null);

  useEffect(() => {
    const target = Date.parse(sampai);
    if (!Number.isFinite(target)) return;

    const hitung = () => setSisa(Math.max(0, target - Date.now()));
    hitung();
    const t = setInterval(hitung, 1000);
    return () => clearInterval(t);
  }, [sampai]);

  const kotak = [
    { nilai: sisa === null ? null : Math.floor(sisa / 86400000), label: 'HARI' },
    { nilai: sisa === null ? null : Math.floor(sisa / 3600000) % 24, label: 'JAM' },
    { nilai: sisa === null ? null : Math.floor(sisa / 60000) % 60, label: 'MENIT' },
    { nilai: sisa === null ? null : Math.floor(sisa / 1000) % 60, label: 'DETIK' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-2">
        Berakhir dalam
      </span>
      <div className="flex gap-2">
        {kotak.map((k, i) => (
          <div
            key={k.label}
            // Kotak terakhir (detik) diberi warna merah: itu satu-satunya angka
            // yang bergerak terus, jadi mata langsung tahu ini hitungan hidup.
            className={`flex min-w-[58px] flex-col items-center rounded-xl px-3 py-2 ${
              i === 3 ? 'bg-bss text-white' : 'bg-ink text-white'
            }`}
          >
            <span className="tnum display text-[20px] font-bold leading-none">
              {k.nilai === null ? '––' : String(k.nilai).padStart(2, '0')}
            </span>
            <span className="mt-1 text-[9px] font-bold tracking-wider opacity-70">{k.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
