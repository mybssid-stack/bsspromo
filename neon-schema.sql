-- ═══════════════════════════════════════════════════════════════════════════
--  BSS PROMO LCD — SKEMA NEON POSTGRES  (v1.0 · 2026-08-29)
--  Paste SELURUH file ini ke Neon SQL Editor lalu Run. Aman dijalankan ulang.
--
--  Zona waktu operasional : Asia/Jakarta (WIB, UTC+7)
--    Blueprint menulis WITA, tapi back office (config.php) memakai
--    Asia/Jakarta dan seluruh alamat pelanggan ada di Lumajang, Jawa Timur
--    = WIB. Kalau PHP dan Postgres beda zona, klaim jam 23:30 WIB akan
--    tercatat sebagai tanggal BESOK di nomor klaim. Disamakan ke WIB.
--    Ingin kembali ke WITA? Ganti 'Asia/Jakarta' di next_claim_no()
--    DAN date_default_timezone_set() di config.php — dua-duanya.
--  Mata uang             : IDR, integer, tanpa desimal
--  MySQL cPanel          : READ-ONLY, bukan bagian dari file ini
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Fungsi bantu umum
-- ───────────────────────────────────────────────────────────────────────────

-- Menjaga kolom updated_at tanpa perlu diingat aplikasi.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Nomor lokal untuk ditampilkan: 6282252001234 -> 0822-5200-1234
CREATE OR REPLACE FUNCTION phone_display(e164 text) RETURNS text AS $$
  SELECT regexp_replace('0' || substr($1, 3), '(\d{4})(\d{4})(\d+)', '\1-\2-\3');
$$ LANGUAGE sql IMMUTABLE;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Pengaturan aplikasi  (judul promo, masa berlaku, syarat)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Admin
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text UNIQUE NOT NULL,
  -- Format: scrypt$N$r$p$saltBase64$hashBase64 (scrypt bawaan Node).
  -- Blueprint menyebut Argon2id; Argon2 di Node butuh modul native yang
  -- sering gagal dibangun di Vercel. scrypt ada di dalam Node, sama-sama
  -- memory-hard, dan tidak bisa gagal dipasang.
  -- Buat hash baru: node scripts/hash-password.mjs "SandiBaru"
  password_hash  text NOT NULL,
  full_name      text NOT NULL,
  role           text NOT NULL DEFAULT 'ADMIN'
                 CHECK (role IN ('SUPERADMIN','ADMIN','CS')),
  is_active      boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Daftar harga promo  (CRUD dari /admin/harga)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand             text NOT NULL,
  model             text NOT NULL,
  aliases           text[] NOT NULL DEFAULT '{}',
  slug              text UNIQUE NOT NULL,
  part_type         text NOT NULL DEFAULT 'LCD',
  quality_grade     text,
  price_normal_idr  integer NOT NULL CHECK (price_normal_idr >= 0),
  price_promo_idr   integer NOT NULL CHECK (price_promo_idr  >= 0),
  warranty_days     smallint NOT NULL DEFAULT 7,
  stock             integer,                          -- NULL = tanpa batas
  is_active         boolean NOT NULL DEFAULT true,
  image_url         text,
  note              text,
  sort_order        integer NOT NULL DEFAULT 0,
  search_text       text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promo_not_higher CHECK (price_promo_idr <= price_normal_idr)
);

-- CATATAN PENTING (beda dari draft blueprint):
-- search_text TIDAK bisa dibuat GENERATED ALWAYS karena array_to_string() di
-- PostgreSQL bersifat STABLE, bukan IMMUTABLE — kolom generated akan ditolak
-- dengan "generation expression is not immutable". Jadi diisi lewat trigger.
CREATE OR REPLACE FUNCTION promo_items_fill_search() RETURNS trigger AS $$
BEGIN
  NEW.search_text := lower(
      NEW.brand || ' ' || NEW.model || ' ' ||
      coalesce(NEW.quality_grade, '') || ' ' ||
      coalesce(array_to_string(NEW.aliases, ' '), '')
  );
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_promo_items_search ON promo_items;
CREATE TRIGGER trg_promo_items_search
  BEFORE INSERT OR UPDATE ON promo_items
  FOR EACH ROW EXECUTE FUNCTION promo_items_fill_search();

CREATE INDEX IF NOT EXISTS promo_items_trgm ON promo_items USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS promo_items_live ON promo_items (is_active, sort_order);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Pelanggan  (master baru; MySQL tetap read-only)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164   text UNIQUE NOT NULL CHECK (phone_e164 ~ '^628[1-9][0-9]{6,10}$'),
  phone_hash   text NOT NULL,          -- sha256(phone + PHONE_HASH_PEPPER)
  full_name    text NOT NULL,
  address      text,
  origin       text NOT NULL CHECK (origin IN ('BSS_LEGACY','NEW')),
  legacy_ref   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_hash ON customers (phone_hash);

DROP TRIGGER IF EXISTS trg_customers_touch ON customers;
CREATE TRIGGER trg_customers_touch BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Cache hasil lookup ke MySQL lewat Bridge API.
-- TTL: 24 jam bila ditemukan, 10 menit bila tidak ditemukan.
CREATE TABLE IF NOT EXISTS legacy_customer_cache (
  phone_e164   text PRIMARY KEY,
  found        boolean NOT NULL,
  full_name    text,
  address      text,
  legacy_ref   text,
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS legacy_cache_exp ON legacy_customer_cache (expires_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Klaim promo
-- ───────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE claim_status AS ENUM
    ('DRAFT','AWAITING_PAYMENT','PAID','EXPIRED','CANCELLED','FAILED','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_no           text UNIQUE NOT NULL,            -- BSS-PRM-260829-0001
  customer_id        uuid NOT NULL REFERENCES customers(id),
  promo_item_id      uuid NOT NULL REFERENCES promo_items(id),

  -- SNAPSHOT: harga & identitas dibekukan saat klaim dibuat.
  brand              text NOT NULL,
  model              text NOT NULL,
  part_type          text NOT NULL,
  quality_grade      text,
  price_normal_idr   integer NOT NULL,
  amount_idr         integer NOT NULL CHECK (amount_idr > 0),
  warranty_days      smallint NOT NULL DEFAULT 7,
  name_snapshot      text NOT NULL,
  phone_snapshot     text NOT NULL,
  address_snapshot   text,
  name_source        text NOT NULL CHECK (name_source IN ('BSS_LEGACY','MANUAL')),

  status             claim_status NOT NULL DEFAULT 'DRAFT',
  expires_at         timestamptz NOT NULL,
  paid_at            timestamptz,
  ip                 inet,
  user_agent         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claims_customer ON claims (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS claims_status   ON claims (status, created_at DESC);

-- Satu nomor tidak boleh menumpuk klaim yang belum dibayar untuk item yang sama.
-- Klaim yang SUDAH dibayar sengaja tidak ikut dikunci: pelanggan lama boleh
-- membeli promo lagi bulan depan. Tambahkan 'PAID' ke daftar di bawah kalau
-- promo memang dibatasi sekali seumur hidup per nomor.
CREATE UNIQUE INDEX IF NOT EXISTS claims_one_live_per_customer_item
  ON claims (customer_id, promo_item_id)
  WHERE status IN ('DRAFT','AWAITING_PAYMENT');

DROP TRIGGER IF EXISTS trg_claims_touch ON claims;
CREATE TRIGGER trg_claims_touch BEFORE UPDATE ON claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Penomoran klaim: urut per hari WITA, tanpa perlu cron reset sequence.
CREATE TABLE IF NOT EXISTS claim_counters (
  day      date PRIMARY KEY,
  last_no  integer NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_claim_no() RETURNS text AS $$
DECLARE d date; n integer;
BEGIN
  d := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  INSERT INTO claim_counters (day, last_no) VALUES (d, 1)
  ON CONFLICT (day) DO UPDATE SET last_no = claim_counters.last_no + 1
  RETURNING last_no INTO n;
  RETURN 'BSS-PRM-' || to_char(d, 'YYMMDD') || '-' || lpad(n::text, 4, '0');
END $$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Pembayaran (Midtrans)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id           uuid NOT NULL REFERENCES claims(id),
  order_id           text UNIQUE NOT NULL,            -- BSS-PRM-260829-0001-A1
  attempt            smallint NOT NULL DEFAULT 1,
  gross_amount_idr   integer NOT NULL,
  snap_token         text,
  snap_redirect_url  text,
  payment_type       text,
  bank               text,
  va_number          text,
  store              text,
  transaction_id     text,
  transaction_status text,
  fraud_status       text,
  status_code        text,
  settlement_at      timestamptz,
  expiry_at          timestamptz,
  raw_response       jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_attempt_uniq UNIQUE (claim_id, attempt)
);
CREATE INDEX IF NOT EXISTS payments_claim ON payments (claim_id);

DROP TRIGGER IF EXISTS trg_payments_touch ON payments;
CREATE TRIGGER trg_payments_touch BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Semua notifikasi mentah Midtrans disimpan, tidak pernah dihapus.
-- dedupe_key = sha256(order_id|transaction_status|status_code|transaction_id)
-- membuat webhook idempoten: kiriman ulang Midtrans tertolak di level UNIQUE.
CREATE TABLE IF NOT EXISTS payment_events (
  id           bigserial PRIMARY KEY,
  order_id     text NOT NULL,
  dedupe_key   text UNIQUE NOT NULL,
  signature_ok boolean NOT NULL,
  payload      jsonb NOT NULL,
  processed    boolean NOT NULL DEFAULT false,
  error        text,
  received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_events_order ON payment_events (order_id, received_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Voucher
-- ───────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE voucher_status AS ENUM ('ACTIVE','REDEEMED','EXPIRED','VOID');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS vouchers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text UNIQUE NOT NULL,           -- BSSV-7K3M-9QX2
  claim_id            uuid UNIQUE NOT NULL REFERENCES claims(id),
  status              voucher_status NOT NULL DEFAULT 'ACTIVE',
  qr_jws              text NOT NULL,
  image_path          text,
  valid_until         timestamptz NOT NULL,
  redeemed_at         timestamptz,
  redeemed_by         uuid REFERENCES admin_users(id),
  redeemed_by_name    text,
  redeem_device       text,
  service_ticket_no   text,                           -- nota_dinas dari sistem PHP
  warranty_start_at   timestamptz,
  warranty_end_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vouchers_status ON vouchers (status, valid_until);

-- Kode voucher: Crockford Base32 tanpa I, L, O, U (biar tidak salah baca/ketik).
CREATE OR REPLACE FUNCTION gen_voucher_code() RETURNS text AS $$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea; s text; i int; c text;
BEGIN
  LOOP
    b := gen_random_bytes(8);
    s := '';
    FOR i IN 0..7 LOOP
      s := s || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);
    END LOOP;
    c := 'BSSV-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM vouchers WHERE code = c);
  END LOOP;
  RETURN c;
END $$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Cetak ulang voucher — WAJIB lewat CS
--    Vercel tidak menjalankan Baileys, jadi tidak ada kirim ulang otomatis
--    lewat WhatsApp. Pelanggan yang kehilangan gambar voucher harus menghubungi
--    CS; CS menyebutkan nomor HP, sistem mencocokkan dengan phone_snapshot
--    klaim, lalu menerbitkan tautan sekali pakai berumur pendek.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voucher_reissues (
  id               bigserial PRIMARY KEY,
  voucher_id       uuid NOT NULL REFERENCES vouchers(id),
  requested_phone  text NOT NULL,        -- nomor yang disebut penelepon (sudah dinormalisasi)
  phone_match      boolean NOT NULL,     -- hasil cocok dengan phone_snapshot klaim
  channel          text NOT NULL DEFAULT 'CS_MANUAL'
                   CHECK (channel IN ('CS_MANUAL','ADMIN_PANEL')),
  approved_by      uuid REFERENCES admin_users(id),
  approved_by_name text NOT NULL,
  link_token_hash  text NOT NULL,        -- sha256(token); token asli tidak disimpan
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz,
  note             text,
  ip               inet,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voucher_reissues_voucher ON voucher_reissues (voucher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voucher_reissues_token   ON voucher_reissues (link_token_hash);

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Klien API eksternal (standby.php di cPanel)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_clients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key   text UNIQUE NOT NULL,
  secret_hash  text NOT NULL,                 -- sha256(secret) hex
  label        text NOT NULL,
  scopes       text[] NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Anti-replay untuk request bertanda tangan HMAC.
CREATE TABLE IF NOT EXISTS api_nonces (
  nonce      text PRIMARY KEY,
  client_key text NOT NULL,
  used_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_nonces_used ON api_nonces (used_at);
-- Cron harian: DELETE FROM api_nonces WHERE used_at < now() - interval '10 minutes';

-- ───────────────────────────────────────────────────────────────────────────
-- 10. Audit
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id         bigserial PRIMARY KEY,
  actor_type text NOT NULL,          -- ADMIN | SYSTEM | API_CLIENT | PUBLIC
  actor_id   text,
  action     text NOT NULL,          -- promo.update, voucher.redeem, payment.settle
  entity     text,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  ip         inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_action ON audit_logs (action, created_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 11. View untuk halaman admin
-- ───────────────────────────────────────────────────────────────────────────

-- Daftar pelanggan yang BENAR-BENAR sudah membayar (dipakai /admin/pembayaran).
CREATE OR REPLACE VIEW v_paid_claims AS
SELECT
  c.claim_no,
  c.paid_at,
  c.name_snapshot                     AS nama,
  c.phone_snapshot                    AS phone_e164,
  phone_display(c.phone_snapshot)     AS phone_display,
  c.address_snapshot                  AS alamat,
  c.brand, c.model, c.part_type, c.quality_grade,
  c.amount_idr,
  c.warranty_days,
  p.payment_type,
  p.order_id,
  v.code                              AS voucher_code,
  v.status                            AS voucher_status,
  v.valid_until,
  v.redeemed_at,
  v.service_ticket_no
FROM claims c
LEFT JOIN LATERAL (
  SELECT * FROM payments pp
  WHERE pp.claim_id = c.id AND pp.transaction_status IN ('settlement','capture')
  ORDER BY pp.settlement_at DESC NULLS LAST LIMIT 1
) p ON true
LEFT JOIN vouchers v ON v.claim_id = c.id
WHERE c.status = 'PAID'
ORDER BY c.paid_at DESC NULLS LAST;

-- Voucher yang siap ditukar hari ini (dipakai /admin/voucher).
CREATE OR REPLACE VIEW v_voucher_ops AS
SELECT
  v.code, v.status, v.valid_until, v.redeemed_at, v.redeemed_by_name,
  v.service_ticket_no, v.warranty_start_at, v.warranty_end_at,
  c.claim_no, c.name_snapshot AS nama,
  phone_display(c.phone_snapshot) AS phone_display,
  c.brand, c.model, c.quality_grade, c.amount_idr
FROM vouchers v
JOIN claims c ON c.id = v.claim_id
ORDER BY v.created_at DESC;

-- ═══════════════════════════════════════════════════════════════════════════
--  SEED — jalan sekali, aman diulang
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO app_settings (key, value) VALUES
  ('promo.title',                '"Ganti LCD mulai Rp 185.000, garansi 7 hari"'::jsonb),
  ('promo.subtitle',             '"Cari tipe HP kamu, bayar online, tunjukkan voucher di toko. Beres dalam 45 menit sambil ngopi."'::jsonb),
  ('promo.is_active',            'true'::jsonb),
  -- Tanggal dihitung saat SQL ini dijalankan, bukan ditulis tetap.
  -- Tanggal tetap bikin promo tampil "sudah tutup" atau "belum mulai" hanya
  -- karena skemanya dipasang di hari yang berbeda dari yang diperkirakan.
  -- start_at null = langsung aktif; end_at 30 hari ke depan = hitung mundur
  -- di landing page langsung punya angka yang masuk akal.
  ('promo.start_at',             'null'::jsonb),
  ('promo.end_at',               to_jsonb(to_char((now() AT TIME ZONE 'Asia/Jakarta') + interval '30 days',
                                                  'YYYY-MM-DD"T"23:59:59+07:00'))),
  ('promo.terms',                '["Garansi 7 hari sejak LCD terpasang","Voucher berlaku 30 hari sejak pembayaran","Voucher hanya bisa dipakai satu kali","Kehilangan gambar voucher? Hubungi CS BSS — kirim ulang wajib verifikasi nomor HP"]'::jsonb),
  ('promo.voucher_valid_days',   '30'::jsonb),
  ('promo.claim_expiry_minutes', '30'::jsonb),
  ('store.name',                 '"BSS Service"'::jsonb),
  ('store.wa_cs',                '"6282252001234"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Admin awal: owner@mybss.cloud
--
-- Sandinya ACAK dan TIDAK ADA di berkas ini — repo ini publik, jadi yang boleh
-- masuk ke sini hanya hash-nya. Sandi aslinya diserahkan terpisah.
--
-- Lupa / ingin ganti? Buat hash baru, lalu tempel ke sini:
--   node scripts/hash-password.mjs "SandiBaruKamu"
--   UPDATE admin_users SET password_hash = '<hasil>' WHERE email = 'owner@mybss.cloud';
INSERT INTO admin_users (email, password_hash, full_name, role) VALUES
  ('owner@mybss.cloud',
   'scrypt$16384$8$1$wG9UEr+2tSF9RnlKAxqB6Q==$8vGmZCe9IwLlktiHN3cn/pxxW81L8aqUmRpTWyW1WLmPQ6Bhkwv4LDDwRpND84qUK3QcZF/HiSYWp3GmDXv7hg==',
   'Owner BSS', 'SUPERADMIN')
ON CONFLICT (email) DO NOTHING;

-- Klien API untuk standby.php.  client_key: php-cs-01
-- secret_hash = sha256(CS_API_SECRET) — nilai secret ada di .env.local
INSERT INTO api_clients (client_key, secret_hash, label, scopes) VALUES
  ('php-cs-01',
   'a39727bb88efd0758c5d0f718545269e64212e8530156fa845d54ae71c3832cb',
   'standby.php — CS counter BSS Lumajang',
   ARRAY['voucher:read','voucher:redeem'])
ON CONFLICT (client_key) DO NOTHING;

-- Daftar harga promo — angkanya diambil dari berkas desain BSS.
-- Kolom aliases dipakai mesin pencari: pelanggan mengetik "y12s" atau
-- "note8" dan tetap menemukan tipenya. Tambahkan sebanyak mungkin ejaan
-- yang biasa dipakai orang, termasuk yang salah.
INSERT INTO promo_items
  (brand, model, aliases, slug, part_type, quality_grade,
   price_normal_idr, price_promo_idr, warranty_days, stock, sort_order) VALUES
  ('Xiaomi',  'Redmi 9A',      ARRAY['redmi9a','9a','redmi 9 a'],                'xiaomi-redmi-9a',     'LCD', 'Original', 295000, 185000, 7, 15, 10),
  ('Vivo',    'Vivo Y12',      ARRAY['y12','y12s','vivo y12s','y-12'],           'vivo-y12',            'LCD', 'Original', 320000, 199000, 7, 12, 20),
  ('Oppo',    'Oppo A16',      ARRAY['a16','oppo a16k','a16e'],                  'oppo-a16',            'LCD', 'Original', 330000, 205000, 7,  4, 30),
  ('Infinix', 'Infinix Hot 10',ARRAY['hot 10','hot10','infinix hot10'],          'infinix-hot-10',      'LCD', 'Original', 340000, 209000, 7, 10, 40),
  ('Oppo',    'Oppo A57',      ARRAY['a57','oppo a57 2022'],                     'oppo-a57',            'LCD', 'Original', 350000, 219000, 7,  9, 50),
  ('Realme',  'Realme C25',    ARRAY['c25','realme c25s','c25y'],                'realme-c25',          'LCD', 'Original', 360000, 229000, 7,  3, 60),
  ('Samsung', 'Samsung A10s',  ARRAY['a10s','samsung a10','a107'],               'samsung-a10s',        'LCD', 'Original', 375000, 235000, 7,  8, 70),
  ('Vivo',    'Vivo Y17',      ARRAY['y17','vivo y15','y12 y17'],                'vivo-y17',            'LCD', 'Original', 385000, 245000, 7,  7, 80),
  ('Xiaomi',  'Redmi Note 8',  ARRAY['note 8','note8','redmi note8'],            'xiaomi-redmi-note-8', 'LCD', 'Original', 420000, 279000, 7,  6, 90),
  ('Samsung', 'Samsung A12',   ARRAY['a12','samsung a12s','a125'],               'samsung-a12',         'LCD', 'Original', 445000, 289000, 7,  5, 100),
  ('Apple',   'iPhone 7 Plus', ARRAY['iphone 7+','7 plus','ip7 plus','7plus'],   'apple-iphone-7-plus', 'LCD', 'Original', 690000, 465000, 7,  2, 110),
  ('Apple',   'iPhone XR',     ARRAY['xr','ip xr','iphone10r','iphone 10r'],     'apple-iphone-xr',     'LCD', 'Original',1250000, 895000, 7,  2, 120)
ON CONFLICT (slug) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
--  VERIFIKASI — hasil yang diharapkan tampil setelah Run
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'tabel'        AS objek, count(*) AS jumlah FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'promo_items', count(*) FROM promo_items
UNION ALL
SELECT 'admin_users', count(*) FROM admin_users
UNION ALL
SELECT 'api_clients', count(*) FROM api_clients;

-- Uji fungsi penomoran (aman dipanggil, hanya menaikkan counter hari ini):
-- SELECT next_claim_no(), gen_voucher_code();
