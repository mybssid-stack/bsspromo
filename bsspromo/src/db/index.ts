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
 */
const sqlClient = neon(process.env.DATABASE_URL!);

export const db = drizzle(sqlClient, { schema });
export { schema };
