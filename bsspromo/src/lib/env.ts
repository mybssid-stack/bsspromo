/**
 * Pembacaan variabel lingkungan dengan pesan galat yang jelas.
 *
 * Kenapa tidak langsung process.env di mana-mana: kalau satu variabel lupa
 * dipasang di Vercel, error-nya muncul sebagai "undefined is not a string"
 * di tengah alur bayar. Di sini gagalnya jelas dan cepat.
 */

function must(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Variabel lingkungan ${name} belum diisi. Cek .env.local (lokal) atau ` +
        `Vercel → Settings → Environment Variables (produksi).`,
    );
  }
  return v.trim();
}

function opt(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export const env = {
  get databaseUrl() {
    return must('DATABASE_URL');
  },

  // ── Midtrans ───────────────────────────────────────────────────────────
  get midtransServerKey() {
    return must('MIDTRANS_SERVER_KEY');
  },
  get midtransClientKey() {
    return must('MIDTRANS_CLIENT_KEY');
  },
  get midtransIsProduction() {
    return opt('MIDTRANS_IS_PRODUCTION', 'false') === 'true';
  },
  get midtransSnapBase() {
    return this.midtransIsProduction
      ? 'https://app.midtrans.com/snap/v1'
      : 'https://app.sandbox.midtrans.com/snap/v1';
  },
  get midtransApiBase() {
    return this.midtransIsProduction
      ? 'https://api.midtrans.com'
      : 'https://api.sandbox.midtrans.com';
  },

  // ── QR & voucher ───────────────────────────────────────────────────────
  get qrKeyId() {
    return opt('QR_KEY_ID', 'k1');
  },
  get qrSigningSecret() {
    return must('QR_SIGNING_SECRET');
  },
  get voucherUrlSecret() {
    return must('VOUCHER_URL_SECRET');
  },
  get voucherValidDays() {
    return Number(opt('VOUCHER_VALID_DAYS', '30')) || 30;
  },

  // ── API untuk standby.php ──────────────────────────────────────────────
  get csApiClientKey() {
    return opt('CS_API_CLIENT_KEY', 'php-cs-01');
  },
  get csApiSecret() {
    return must('CS_API_SECRET');
  },
  get csApiAllowedIps(): string[] {
    return opt('CS_API_ALLOWED_IPS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  },

  // ── Bridge ke MySQL cPanel ─────────────────────────────────────────────
  get bridgeUrl() {
    return opt('BSS_BRIDGE_URL');
  },
  get bridgeKey() {
    return opt('BSS_BRIDGE_KEY', 'prod-vercel-01');
  },
  get bridgeSecret() {
    return opt('BSS_BRIDGE_SECRET');
  },
  get bridgeTimeoutMs() {
    return Number(opt('BSS_BRIDGE_TIMEOUT_MS', '3000')) || 3000;
  },

  // ── Keamanan ───────────────────────────────────────────────────────────
  get authSecret() {
    return must('AUTH_SECRET');
  },
  get phoneHashPepper() {
    return must('PHONE_HASH_PEPPER');
  },
  get cronSecret() {
    return opt('CRON_SECRET');
  },
  get turnstileSecret() {
    return opt('TURNSTILE_SECRET_KEY');
  },

  // ── Umum ───────────────────────────────────────────────────────────────
  get baseUrl() {
    return opt('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
  },
  get storeName() {
    return opt('NEXT_PUBLIC_STORE_NAME', 'BSS.id');
  },
  get csWhatsapp() {
    return opt('NEXT_PUBLIC_CS_WHATSAPP', '');
  },
} as const;

/** Zona waktu operasional toko. Lumajang, Jawa Timur = WIB. */
export const TZ = 'Asia/Jakarta';
