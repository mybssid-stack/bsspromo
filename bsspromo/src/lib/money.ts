import { TZ } from './env';

/** 235000 -> "Rp 235.000" */
export function rupiah(n: number): string {
  return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
}

/** Tanggal WIB yang mudah dibaca: "29 Agu 2026, 13:42" */
export function tanggalID(input: Date | string | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Tanggal saja: "29 Agustus 2026" */
export function tanggalPanjang(input: Date | string | null | undefined): string {
  if (!input) return '—';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** Nama metode bayar Midtrans dalam bahasa manusia. */
export function namaMetode(pm: string | null | undefined): string {
  const map: Record<string, string> = {
    qris: 'QRIS',
    gopay: 'GoPay',
    shopeepay: 'ShopeePay',
    bank_transfer: 'Transfer Bank',
    echannel: 'Mandiri Bill',
    permata: 'Permata VA',
    credit_card: 'Kartu Kredit',
    cstore: 'Gerai Retail',
    akulaku: 'Akulaku',
    bca_klikpay: 'BCA KlikPay',
  };
  const k = String(pm ?? '').toLowerCase();
  return map[k] ?? (k ? k.toUpperCase() : '—');
}

/**
 * Nama unit yang enak dibaca dari merek + model.
 *
 * Admin (dan berkas desain) sering menuliskan mereknya lagi di kolom model:
 * brand "Vivo" + model "Vivo Y12". Digabung mentah-mentah hasilnya
 * "Vivo Vivo Y12" — muncul di judul modal klaim, di voucher, sampai di
 * rincian item yang dikirim ke Midtrans.
 *
 * Membetulkan datanya saja tidak cukup: kolom itu diisi manusia lewat
 * halaman admin, jadi besok bisa terulang. Jadi pengulangannya dibereskan
 * di sini, saat ditampilkan.
 */
export function namaUnit(brand: string | null | undefined, model: string | null | undefined): string {
  const b = String(brand ?? '').trim();
  const m = String(model ?? '').trim();
  if (!b) return m;
  if (!m) return b;

  // Bandingkan tanpa memedulikan huruf besar/kecil, dan pastikan yang cocok
  // adalah KATA utuh — supaya "Oppo" tidak dianggap mengawali "Oppomart".
  const awal = m.slice(0, b.length).toLowerCase();
  const sesudah = m.charAt(b.length);
  if (awal === b.toLowerCase() && (sesudah === '' || /[\s-]/.test(sesudah))) {
    return m;
  }
  return `${b} ${m}`;
}
