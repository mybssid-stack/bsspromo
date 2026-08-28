import crypto from 'node:crypto';
import { env } from './env';

/**
 * Klien Midtrans seadanya — hanya dua hal yang dipakai: membuat transaksi Snap
 * dan mengecek status. Tidak memakai SDK resmi supaya tidak ada dependensi
 * tambahan yang perlu diikuti versinya.
 */

function basicAuth(): string {
  return 'Basic ' + Buffer.from(env.midtransServerKey + ':').toString('base64');
}

export type ItemSnap = {
  id: string;
  price: number;
  quantity: number;
  name: string;
};

export type ParamSnap = {
  orderId: string;
  grossAmount: number;
  items: ItemSnap[];
  customer: { nama: string; phone: string; alamat?: string | null };
  /** Menit sebelum tagihan hangus di sisi Midtrans. */
  expiryMinutes: number;
  finishUrl?: string;
};

export type HasilSnap = { token: string; redirect_url: string };

export async function buatTransaksiSnap(p: ParamSnap): Promise<HasilSnap> {
  // Midtrans menolak nama item > 50 karakter dengan galat yang membingungkan.
  const items = p.items.map((i) => ({ ...i, name: i.name.slice(0, 50) }));

  // Penjaga terakhir: total item harus persis sama dengan gross_amount, kalau
  // tidak Midtrans menolak dengan "gross_amount is not equal to sum of item".
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  if (total !== p.grossAmount) {
    throw new Error(`Total item (${total}) tidak sama dengan gross_amount (${p.grossAmount}).`);
  }

  const [depan, ...sisa] = p.customer.nama.trim().split(/\s+/);

  const payload = {
    transaction_details: { order_id: p.orderId, gross_amount: p.grossAmount },
    item_details: items,
    customer_details: {
      first_name: depan || 'Pelanggan',
      last_name: sisa.join(' ') || undefined,
      phone: p.customer.phone,
      billing_address: p.customer.alamat
        ? { address: p.customer.alamat.slice(0, 200), country_code: 'IDN' }
        : undefined,
    },
    credit_card: { secure: true },
    expiry: { unit: 'minute', duration: p.expiryMinutes },
    callbacks: p.finishUrl ? { finish: p.finishUrl } : undefined,
  };

  const res = await fetch(`${env.midtransSnapBase}/transactions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: basicAuth(),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const data = (await res.json().catch(() => null)) as
    | (HasilSnap & { error_messages?: string[] })
    | null;

  if (!res.ok || !data?.token) {
    const pesan = data?.error_messages?.join(', ') ?? `HTTP ${res.status}`;
    throw new Error(`Midtrans menolak pembuatan transaksi: ${pesan}`);
  }
  return { token: data.token, redirect_url: data.redirect_url };
}

/** Cek status langsung ke Midtrans — sumber kebenaran saat webhook meragukan. */
export async function statusTransaksi(orderId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${env.midtransApiBase}/v2/${encodeURIComponent(orderId)}/status`, {
      headers: { Accept: 'application/json', Authorization: basicAuth() },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Verifikasi signature_key webhook.
 * sha512(order_id + status_code + gross_amount + server_key)
 *
 * gross_amount HARUS dipakai apa adanya seperti kiriman Midtrans ("235000.00"),
 * jangan di-parse jadi angka lalu di-format ulang — hasilnya tidak akan cocok.
 */
export function cekSignatureWebhook(n: {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}): boolean {
  const expected = crypto
    .createHash('sha512')
    .update(`${n.order_id}${n.status_code}${n.gross_amount}${env.midtransServerKey}`)
    .digest('hex');
  const a = Buffer.from(String(n.signature_key ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Terjemahan status Midtrans ke keputusan bisnis. */
export function keputusanPembayaran(n: {
  transaction_status?: string;
  fraud_status?: string;
  status_code?: string;
}): 'PAID' | 'PENDING' | 'FAILED' {
  const st = String(n.transaction_status ?? '').toLowerCase();
  const fraud = String(n.fraud_status ?? '').toLowerCase();

  if (st === 'capture') return fraud === 'accept' ? 'PAID' : fraud === 'challenge' ? 'PENDING' : 'FAILED';
  if (st === 'settlement') return 'PAID';
  if (st === 'pending') return 'PENDING';
  if (['deny', 'cancel', 'expire', 'failure'].includes(st)) return 'FAILED';
  return 'PENDING';
}
