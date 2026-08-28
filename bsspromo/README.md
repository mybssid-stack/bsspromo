# BSS Promo LCD

Landing page promo ganti LCD dengan pembayaran Midtrans dan voucher QR yang
dipindai CS di toko.

Panduan pemasangan lengkap ada di `../PANDUAN-DEPLOY.md`.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env.local   # lalu isi DATABASE_URL dan kunci Midtrans
npm run dev
```

Buka http://localhost:3000. Halaman admin di /admin.

## Perintah

| Perintah | Kegunaan |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm run typecheck` | Periksa tipe tanpa build |
| `npm run hash -- "SandiBaru"` | Buat hash sandi admin |
| `npm run db:studio` | Jelajahi database lewat Drizzle Studio |

## Peta kode

```
src/
├─ app/
│  ├─ page.tsx                       landing + pencarian
│  ├─ klaim/[claimNo]/               halaman tunggu bayar
│  ├─ v/[code]/                      voucher permanen
│  ├─ admin/                         console: harga, pembayaran, voucher, pengaturan
│  └─ api/
│     ├─ v1/promo/search             pencarian (trigram, tahan salah ketik)
│     ├─ v1/lookup                   cek nomor ke MySQL lewat Bridge PHP
│     ├─ v1/claim                    buat klaim + tagihan Snap
│     ├─ v1/cs/voucher/inspect       dipanggil standby.php saat QR dipindai
│     ├─ v1/cs/voucher/redeem        dipanggil standby.php saat nota disimpan
│     └─ webhooks/midtrans           satu-satunya penentu status LUNAS
├─ db/schema.ts                      cerminan neon-schema.sql
└─ lib/
   ├─ phone.ts                       normalisasi nomor (kembar dgn PHP)
   ├─ qr-jws.ts                      tanda tangan QR HMAC-SHA256
   ├─ midtrans.ts                    Snap + verifikasi webhook
   ├─ cs-auth.ts                     autentikasi permintaan dari cPanel
   └─ bridge.ts                      lookup pelanggan lama + cache
```

## Tiga aturan yang tidak boleh dilanggar saat mengubah kode

1. **Harga tidak pernah datang dari browser.** Semua nominal dibaca ulang dari
   `promo_items` (saat klaim) atau dari JWS voucher (saat CS menyimpan nota).
2. **Status LUNAS hanya ditentukan webhook Midtrans.** Callback `onSuccess`
   di browser cuma untuk teks di layar — siapa pun bisa memanggilnya dari
   konsol.
3. **Normalisasi nomor harus identik di tiga tempat**: `src/lib/phone.ts`,
   `bss-bridge/phone.php`, dan `standby.php`. Kalau salah satu berubah,
   pelanggan lama berhenti dikenali.
