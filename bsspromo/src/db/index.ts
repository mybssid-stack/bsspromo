import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Koneksi Neon lewat HTTP, bukan TCP.
 *
 * Ini bukan preferensi gaya — di serverless, tiap request bisa jadi proses
 * baru. Driver TCP biasa akan membuka koneksi baru terus sampai Postgres
 * kehabisan slot ("too many connections") tepat saat trafik ramai. Driver
 * HTTP Neon tidak punya masalah itu karena tidak ada koneksi yang dipelihara.
 *
 * Klien dibuat MALAS (saat pertama dipakai), bukan saat berkas ini di-import.
 *
 * Alasannya konkret: `neon()` melempar galat begitu dipanggil tanpa
 * connection string. Kalau dipanggil di tingkat modul, `next build` ikut mati
 * di tahap "Collecting page data" dengan pesan yang sama sekali tidak
 * menyebut variabel mana yang kurang — persis yang terjadi saat deploy
 * pertama ke Vercel sebelum Environment Variables sempat diisi.
 *
 * Dengan cara ini, build tetap jalan (semua route memang force-dynamic dan
 * tidak menyentuh database saat build), dan kalau DATABASE_URL benar-benar
 * lupa diisi, yang muncul adalah pesan yang menyebutkan namanya.
 */
type Klien = ReturnType<typeof drizzle<typeof schema>>;

let klien: Klien | null = null;

function ambilKlien(): Klien {
  if (klien) return klien;

  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error(
      'DATABASE_URL belum diisi. Lokal: salin .env.example jadi .env.local lalu ' +
        'isi connection string dari Neon Console. Di Vercel: Settings → ' +
        'Environment Variables → tambahkan DATABASE_URL untuk environment ' +
        'Production, lalu redeploy.',
    );
  }

  klien = drizzle(neon(url), { schema });
  return klien;
}

/**
 * Proxy supaya seluruh kode pemanggil tetap menulis `db.select(...)` seperti
 * biasa, tanpa perlu tahu bahwa klien aslinya baru dibuat saat itu juga.
 */
export const db = new Proxy({} as Klien, {
  get(_target, prop, receiver) {
    return Reflect.get(ambilKlien(), prop, receiver);
  },
  has(_target, prop) {
    return Reflect.has(ambilKlien(), prop);
  },
});

export { schema };
