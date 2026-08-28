import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/**
 * Koneksi database.
 *
 * PRODUKSI (Neon) memakai driver HTTP, bukan TCP. Ini bukan preferensi gaya —
 * di serverless, tiap request bisa jadi proses baru. Driver TCP biasa akan
 * membuka koneksi baru terus sampai Postgres kehabisan slot ("too many
 * connections") tepat saat trafik ramai. Driver HTTP Neon tidak punya masalah
 * itu karena tidak ada koneksi yang dipelihara.
 *
 * PENGEMBANGAN LOKAL boleh memakai Postgres biasa di localhost. Driver Neon
 * tidak bisa bicara ke Postgres biasa (dia menuntut WebSocket ke endpoint
 * Neon), jadi kalau host-nya localhost, dipakai node-postgres. Deteksinya dari
 * connection string, bukan NODE_ENV — orang bisa saja menunjuk .env.local ke
 * Neon sungguhan saat mengembangkan, dan itu harus tetap jalan.
 *
 * Klien dibuat MALAS (saat pertama dipakai), bukan saat berkas ini di-import.
 * Alasannya konkret: `neon()` melempar galat begitu dipanggil tanpa connection
 * string. Kalau dipanggil di tingkat modul, `next build` ikut mati di tahap
 * "Collecting page data" dengan pesan yang tidak menyebut variabel mana yang
 * kurang — persis yang terjadi saat deploy pertama ke Vercel sebelum
 * Environment Variables sempat diisi.
 */
type Klien = ReturnType<typeof drizzleNeon<typeof schema>>;

let klien: Klien | null = null;

function lokal(url: string): boolean {
  return /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
}

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

  if (lokal(url)) {
    // require() disengaja: import statis akan menarik `pg` ikut ke bundel
    // serverless produksi, padahal di sana tidak pernah dipakai.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require('pg') as typeof import('pg');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require('drizzle-orm/node-postgres') as typeof import('drizzle-orm/node-postgres');
    klien = drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Klien;
    return klien;
  }

  klien = drizzleNeon(neon(url), { schema });
  return klien;
}

/**
 * Proxy supaya seluruh kode pemanggil tetap menulis `db.select(...)` seperti
 * biasa, tanpa perlu tahu klien aslinya baru dibuat saat itu juga.
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
