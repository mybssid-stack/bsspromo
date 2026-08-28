# BSS Promo LCD — Panduan Pemasangan

Semua sudah dibangun dan diuji. Yang tersisa hanya menyambungkan tiga tempat:
**Neon** (database), **Vercel** (aplikasi), **cPanel** (toko).

Urutannya penting. Jangan lompat.

---

## Ringkasan: berkas apa saja yang ada

| Berkas | Untuk apa | Ke mana |
|---|---|---|
| `neon-schema.sql` | Skema database | Paste ke Neon SQL Editor |
| `.env.local` | Semua kunci & rahasia | Root project Next.js + Vercel |
| `bsspromo/` | Aplikasi Next.js lengkap | Vercel |
| `back_office_php/standby.php` | Halaman scan QR untuk CS | cPanel `public_html/` |
| `back_office_php/bss-bridge/` | Jembatan cek nomor pelanggan lama | cPanel `public_html/bss-bridge/` |

---

## A · Neon (10 menit)

1. Buat project baru di [console.neon.tech](https://console.neon.tech). Region **Singapore
   (ap-southeast-1)** — paling dekat ke Indonesia.
2. Buka **SQL Editor**, paste seluruh isi `neon-schema.sql`, klik **Run**.
   Hasil akhirnya harus menampilkan: `tabel 14`, `promo_items 12`, `admin_users 1`, `api_clients 1`.
3. Buka **Connection Details**, salin dua connection string:
   - yang **ada** `-pooler` di nama host → `DATABASE_URL`
   - yang **tanpa** `-pooler` → `DATABASE_URL_UNPOOLED`
4. Tempel keduanya ke `.env.local`.

Login admin awal: **owner@mybss.cloud**. Sandinya acak dan sengaja TIDAK
ditulis di berkas mana pun — repositori ini publik, jadi yang ada di sana hanya
hash-nya. Sandi aslinya diserahkan terpisah lewat percakapan.

Ganti kapan saja (atau kalau sandinya hilang):

```bash
node scripts/hash-password.mjs "SandiBaruKamu"
```

Lalu di Neon SQL Editor:

```sql
UPDATE admin_users SET password_hash = '<hasil perintah di atas>'
WHERE email = 'owner@mybss.cloud';
```

---

## B · Vercel (15 menit)

1. Salin `.env.local` ke dalam folder `bsspromo/` (kalau belum ada di sana).
2. Push `bsspromo/` ke GitHub, lalu **Import Project** di Vercel.
3. **Settings → Environment Variables**: masukkan semua isi `.env.local` untuk
   environment *Production*. Yang wajib ada minimal:
   `DATABASE_URL`, `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`,
   `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`, `QR_SIGNING_SECRET`, `VOUCHER_URL_SECRET`,
   `CS_API_SECRET`, `AUTH_SECRET`, `PHONE_HASH_PEPPER`, `NEXT_PUBLIC_BASE_URL`.
4. **Settings → Functions → Region**: pilih **Singapore (sin1)**.
5. Deploy. Catat URL hasilnya, misal `https://bsspromo.vercel.app`.
6. **Balik lagi** dan perbarui dua nilai dengan URL asli tadi:
   - `NEXT_PUBLIC_BASE_URL` di Vercel
   - `PROMO_API_BASE` di `standby.php` (lihat bagian C)
   Lalu redeploy sekali.

Upstash dan Turnstile boleh dikosongkan — aplikasi tetap jalan. Pembatas laju
otomatis turun ke penghitung dalam memori, dan verifikasi anti-bot dilewati.

---

## C · cPanel — INI BAGIAN YANG KAMU TANYAKAN

### C.1 Berkas yang di-UPLOAD (5 berkas)

Lewat File Manager cPanel:

```
public_html/
├── standby.php                      ← BARU, taruh sejajar dengan config.php
└── bss-bridge/                      ← BARU, buat foldernya
    ├── config.local.php
    ├── lookup.php
    ├── phone.php
    ├── rebuild_phone_index.php
    └── .htaccess
```

Semua berkas ini **baru**. Tidak ada satu pun berkas back office lama yang
ditimpa.

### C.2 Berkas yang harus kamu EDIT — hanya DUA

#### 1. `bss-bridge/config.local.php`

Ini satu-satunya tempat kredensial. Isinya sudah saya isikan dari `config.php`
kamu, jadi **kemungkinan besar tidak perlu diubah sama sekali**. Periksa saja:

```php
define('BSS_DB_DSN',  'mysql:host=localhost;dbname=mybe5217_bss;charset=utf8mb4');
define('BSS_DB_USER', 'mybe5217_bss');
define('BSS_DB_PASS', '<password DB dari config.php>');   // ← isi seperti di config.php
```

Tiga rahasia di bawahnya (`BRIDGE_KEY`, `BRIDGE_SECRET`, `CRON_SECRET_B`) sudah
cocok dengan `.env.local`. Jangan diubah sebelah pihak saja — kalau diubah,
ubah juga di Vercel.

#### 2. `standby.php` — SATU BARIS

```php
if (!defined('PROMO_API_BASE')) define('PROMO_API_BASE', 'https://bsspromo.vercel.app');
//                                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                                       ganti dengan URL Vercel kamu yang sebenarnya
```

Dua rahasia di bawahnya (`PROMO_API_SECRET`, `PROMO_QR_SECRETS`) sudah cocok
dengan `.env.local`. Biarkan.

**Selesai. Tidak ada berkas lain yang perlu diedit.** `config.php`,
`pages/input_service.php`, `ajax/pekerjaan_ajax.php` — semuanya tidak disentuh.

### C.3 Cron job (1 kali pasang)

**cPanel → Cron Jobs → Add New Cron Job**, setiap 15 menit (`*/15 * * * *`):

```bash
/usr/local/bin/php /home/NAMA_USER_CPANEL/public_html/bss-bridge/rebuild_phone_index.php
```

Ganti `NAMA_USER_CPANEL` dengan nama user cPanel kamu.

Cron ini yang membuat nomor HP pelanggan lama bisa dikenali otomatis. Kalau
belum jalan, pelanggan lama tetap bisa klaim — cuma harus mengetik namanya
sendiri.

Jalankan sekali secara manual dulu untuk mengisi indeks pertama kali:

```
https://mybss.cloud/bss-bridge/rebuild_phone_index.php?secret=<CRON_SECRET dari .env.local>
```

Hasil yang benar terlihat seperti ini (dari uji coba dengan data asli kamu):

```
indeks nomor selesai: 2174 baris pelanggan dibaca, 2130 nomor ditulis,
44 baris tanpa nomor sah, 0 entri yatim dibuang, total indeks 1943, 0.12 detik
```

### C.4 HTTPS wajib

Kamera tidak bisa dibuka di halaman non-HTTPS. Pastikan **cPanel → SSL/TLS
Status** menunjukkan sertifikat aktif untuk `mybss.cloud`. Kalau `standby.php`
dibuka lewat `http://`, tombol kamera akan gagal dan CS terpaksa mengetik kode
manual terus.

### C.5 Opsional — tautan di dashboard

CS cukup mem-bookmark `https://mybss.cloud/standby.php` di HP-nya. Kalau mau
muncul sebagai menu, tambahkan satu baris di `pages/home.php`. Tidak wajib.

---

## D · Midtrans (5 menit)

1. Masuk [dashboard.midtrans.com](https://dashboard.midtrans.com) → mode
   **Production**.
2. **Settings → Configuration → Payment Notification URL**:
   ```
   https://bsspromo.vercel.app/api/webhooks/midtrans
   ```
3. **Finish / Unfinish / Error Redirect URL**: kosongkan saja. Aplikasi
   mengarahkan sendiri lewat Snap callback.
4. **Settings → Snap Preferences**: aktifkan metode yang kamu mau (QRIS,
   GoPay, VA, kartu). Aplikasi menerima apa pun yang aktif di sana.

Tanpa langkah 2, pembayaran akan berhasil di sisi pelanggan tapi voucher tidak
pernah terbit — karena voucher hanya diterbitkan oleh webhook.

---

## E · Uji coba sebelum diumumkan

Jalankan berurutan:

1. **Buka landing page.** Ketik `vivo` — kartu promo harus muncul dalam
   sekejap. Ketik `xiomi` (sengaja salah) — Xiaomi tetap harus muncul.
2. **Klaim dengan nomor pelanggan lama** (mis. `082334106052`). Nama dan
   alamatnya harus terisi otomatis. Kalau tidak, cron C.3 belum jalan.
3. **Klaim dengan nomor baru.** Form harus meminta nama.
4. **Bayar beneran** dengan nominal terkecil. Setelah lunas, halaman harus
   berpindah sendiri ke voucher.
5. **Simpan voucher.** Di HP harus muncul lembar bagikan; di desktop langsung
   terunduh.
6. **Buka `standby.php` di HP**, masuk pakai akun BSS, pindai QR di layar
   pelanggan. Semua kolom harus terisi kecuali kunci layar.
7. **Simpan nota.** Cek di menu Perbaikan back office — notanya harus muncul
   dengan status LUNAS.
8. **Pindai QR yang sama lagi.** Harus ditolak: "Voucher sudah dipakai di nota
   BSS-XXXX".
9. **Cetak ulang:** buka `/admin/voucher`, masukkan kode voucher + nomor HP
   yang salah → harus ditolak. Masukkan nomor yang benar → tautan keluar.

---

## Kalau ada yang tidak beres

| Gejala | Sebab paling sering |
|---|---|
| Pelanggan lama tidak dikenali | Cron `rebuild_phone_index.php` belum jalan, atau `BSS_BRIDGE_URL` salah |
| Bayar sukses tapi voucher tidak terbit | Payment Notification URL di Midtrans belum diisi (langkah D.2) |
| `standby.php`: "Server promo tidak bisa dihubungi" | `PROMO_API_BASE` masih menunjuk URL contoh |
| `standby.php`: "Tanda tangan tidak cocok" | `PROMO_API_SECRET` ≠ `CS_API_SECRET` di Vercel |
| QR ditolak "TIDAK SAH" | `PROMO_QR_SECRETS['k1']` ≠ `QR_SIGNING_SECRET` di Vercel |
| "Waktu server terpaut lebih dari 2 menit" | Jam server cPanel meleset — minta hosting menyalakan NTP |
| Kamera tidak mau terbuka | Halaman dibuka lewat `http://`, bukan `https://` |
| Landing page kosong | `neon-schema.sql` belum dijalankan, atau `DATABASE_URL` salah |

---

## Hal yang perlu kamu tahu, bukan pertanyaan teknis

**Cetak ulang voucher wajib lewat CS.** Vercel tidak bisa menjalankan Baileys —
Baileys butuh proses yang hidup terus-menerus dan menyimpan sesi WhatsApp,
sedangkan fungsi Vercel mati begitu satu request selesai. Jadi tidak ada kirim
ulang otomatis ke WhatsApp. Alurnya: pelanggan menelepon → CS membuka
`/admin/voucher` → mengetik nomor HP yang disebutkan → **sistem** yang
mencocokkan, bukan CS. Kalau tidak cocok, tautan tidak keluar. Semua percobaan
tercatat di tabel `voucher_reissues`, termasuk yang gagal.

**Uang promo masuk rekening Midtrans, bukan laci toko.** Tapi nota tetap
dicatat LUNAS penuh — kalau tidak, CS akan menagih pelanggan dua kali saat unit
diambil. Karena `bss_service_antrian` cuma punya ember `bayar_cash` dan
`bayar_qris`, nilainya masuk `bayar_qris` supaya `total_bayar = bayar_cash +
bayar_qris` tetap benar. Akibatnya omset promo muncul di ember QRIS pada
laporan harian. Untuk rekonsiliasi, semua barisnya bisa dipisahkan lewat kolom
`sumber = 'promo_web'` atau lewat tabel `bss_promo_klaim`.
