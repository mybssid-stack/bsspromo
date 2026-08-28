/**
 * Normalisasi nomor HP Indonesia ke bentuk kanonik: 62 + nomor tanpa 0.
 *
 * WAJIB identik dengan normalize_phone_id() di PHP (bss-bridge/phone.php dan
 * standby.php). Kalau dua sisi beda satu langkah saja, pelanggan lama akan
 * dianggap pelanggan baru dan alamatnya tidak terisi otomatis.
 */
export function normalizePhoneID(input: string | null | undefined): string | null {
  if (!input) return null;

  // 1. Buang semua yang bukan angka. Tanda + ikut dibuang karena kode negara
  //    tetap terbaca dari angka 62 di depannya.
  let d = String(input).replace(/\D/g, '');
  if (!d) return null;

  // 2. Buang nol di depan kode negara: "0062822..." -> "62822..."
  d = d.replace(/^0+(?=62)/, '');

  // 3. "62082..." -> "6282..."
  while (/^620/.test(d)) d = '62' + d.slice(3);

  // 4. Bentuk lokal.
  if (/^0/.test(d)) d = '62' + d.replace(/^0+/, '');
  else if (/^8/.test(d)) d = '62' + d;

  // 5. Validasi akhir.
  if (!/^628[1-9]\d{6,10}$/.test(d)) return null;

  return d;
}

/** Untuk ditampilkan ke pengguna: 0822-5200-1234 */
export function formatPhoneLocal(e164: string): string {
  if (!e164 || e164.length < 5) return e164 ?? '';
  const local = '0' + e164.slice(2);
  return local.replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
}

/** Menutupi nomor untuk ditampilkan di layar publik: 0822-****-1234 */
export function maskPhone(e164: string): string {
  const f = formatPhoneLocal(e164);
  return f.replace(/-(\d{4})-/, '-****-');
}
