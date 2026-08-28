import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Migrasi WAJIB lewat koneksi langsung (tanpa -pooler).
    url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!,
  },
} satisfies Config;
