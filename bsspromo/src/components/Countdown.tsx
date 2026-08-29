'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Hitung mundur akhir promo, digambarkan sebagai papan balik (split-flap)
 * seperti papan jadwal stasiun.
 *
 * Angkanya baru diisi setelah komponen hidup di browser. Kalau ikut dirender
 * di server, HTML dari server dan dari klien akan berbeda beberapa detik dan
 * React melempar hydration mismatch — tampilannya berkedip dan konsol penuh
 * peringatan.
 */
export default function Countdown({ sampai }: { sampai: string }) {
  const [sisa, setSisa] = useState<number | null>(null);

  useEffect(() => {
    const target = Date.parse(sampai);
    if (!Number.isFinite(target)) return;

    const hitung = () => setSisa(Math.max(0, target - Date.now()));
    hitung();

    // Disetel ke 250 ms, bukan 1000 ms. Timer 1 detik pelan-pelan meleset
    // (browser menahan timer di tab latar), sehingga papannya kadang melompat
    // dua angka sekaligus. Dengan tik lebih rapat, nilai detiknya tetap sama
    // di sebagian besar tik — dan komponen kartu hanya beranimasi kalau
    // angkanya benar-benar berubah, jadi tidak ada kerja yang terbuang.
    const t = setInterval(hitung, 250);
    return () => clearInterval(t);
  }, [sampai]);

  const unit = [
    { nilai: sisa === null ? null : Math.floor(sisa / 86400000), label: 'HARI' },
    { nilai: sisa === null ? null : Math.floor(sisa / 3600000) % 24, label: 'JAM' },
    { nilai: sisa === null ? null : Math.floor(sisa / 60000) % 60, label: 'MENIT' },
    { nilai: sisa === null ? null : Math.floor(sisa / 1000) % 60, label: 'DETIK' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted-2">
        Berakhir dalam
      </span>
      <div className="flex gap-2.5">
        {unit.map((u, i) => (
          <KartuBalik
            key={u.label}
            nilai={u.nilai}
            label={u.label}
            // Kotak detik merah: itu satu-satunya angka yang bergerak terus,
            // jadi mata langsung tahu hitungannya hidup.
            merah={i === 3}
          />
        ))}
      </div>
    </div>
  );
}

function KartuBalik({
  nilai,
  label,
  merah,
}: {
  nilai: number | null;
  label: string;
  merah: boolean;
}) {
  const teks = nilai === null ? '––' : String(nilai).padStart(2, '0');

  const [tampil, setTampil] = useState(teks);
  const [lama, setLama] = useState(teks);
  const [putaran, setPutaran] = useState(0);
  const jeda = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTampil((sekarang) => {
      if (teks === sekarang) return sekarang;
      setLama(sekarang);
      // Kunci animasi dinaikkan supaya React membuat ulang elemen daunnya —
      // tanpa itu, animasi CSS yang sudah selesai tidak akan diputar lagi.
      setPutaran((n) => n + 1);
      if (jeda.current) clearTimeout(jeda.current);
      jeda.current = setTimeout(() => setPutaran(0), 620);
      return teks;
    });
  }, [teks]);

  useEffect(() => () => { if (jeda.current) clearTimeout(jeda.current); }, []);

  const sedangBerputar = putaran > 0;

  return (
    <div className="flex flex-col items-center">
      <div
        className={`flip ${merah ? 'flip-merah' : ''} h-[62px] w-[58px] rounded-xl shadow-sm sm:h-[68px] sm:w-[64px]`}
        role="timer"
        aria-label={`${teks} ${label.toLowerCase()}`}
      >
        {/* Lapisan statis: atas menampilkan angka BARU (tersingkap saat daun
            jatuh), bawah masih menampilkan angka LAMA (tertutup belakangan). */}
        <div className="flip-sisi flip-atas">
          <b className="text-[22px] sm:text-[24px]">{tampil}</b>
        </div>
        <div className="flip-sisi flip-bawah">
          <b className="text-[22px] sm:text-[24px]">{sedangBerputar ? lama : tampil}</b>
        </div>

        {sedangBerputar && (
          <>
            <div key={`a${putaran}`} className="flip-sisi flip-atas flip-daun-atas">
              <b className="text-[22px] sm:text-[24px]">{lama}</b>
            </div>
            <div key={`b${putaran}`} className="flip-sisi flip-bawah flip-daun-bawah">
              <b className="text-[22px] sm:text-[24px]">{tampil}</b>
            </div>
          </>
        )}
      </div>
      <span className="mt-1.5 text-[9.5px] font-bold tracking-wider text-muted-2">{label}</span>
    </div>
  );
}
