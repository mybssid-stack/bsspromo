import crypto from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { legacyCustomerCache } from '@/db/schema';
import { env } from './env';

/**
 * Lookup pelanggan lama di MySQL cPanel lewat Bridge API PHP.
 *
 * Prinsip yang tidak boleh dilanggar: kegagalan di sini TIDAK PERNAH
 * menghentikan pelanggan. Bridge mati, timeout, atau belum dipasang sama
 * sekali → hasilnya cuma "tidak ditemukan", dan pelanggan mengisi nama
 * sendiri. Infrastruktur yang rewel bukan urusan orang yang mau bayar.
 */

export type HasilLookup = {
  found: boolean;
  name?: string;
  address?: string;
  legacyRef?: string;
  /** dari mana jawabannya: bridge langsung, cache, atau gagal total */
  sumber: 'bridge' | 'cache' | 'kosong';
};

/**
 * Apakah nama dari database lama layak dipakai sebagai nama pelanggan?
 *
 * Data lama BSS berisi baris seperti id 1622: nama "085655748212", alamat
 * kosong — seseorang didaftarkan dengan nomor HP-nya sebagai nama. Kalau
 * ditelan mentah, pelanggan melihat kotak hijau "TERDAFTAR DI DATABASE BSS"
 * berisi nomor HP-nya sendiri sebagai nama, terkunci, tanpa cara
 * membetulkan — dan nama itu ikut tercetak di voucher dan nota servis.
 *
 * Jadi nama yang jelas-jelas bukan nama diperlakukan seperti tidak ketemu:
 * pelanggan diminta mengetik namanya sendiri sekali, dan mulai saat itu
 * datanya benar.
 */
function namaLayak(nama: string | undefined): boolean {
  const n = (nama ?? '').trim();
  if (n.length < 2) return false;

  // Tujuh digit atau lebih hampir pasti nomor telepon, bukan nama orang.
  const jumlahAngka = (n.match(/\d/g) ?? []).length;
  if (jumlahAngka >= 7) return false;

  // Harus memuat setidaknya dua huruf berurutan.
  if (!/[A-Za-z]{2}/.test(n)) return false;

  return true;
}

const TTL_KETEMU_MS = 24 * 60 * 60 * 1000; // 24 jam
const TTL_KOSONG_MS = 10 * 60 * 1000;      // 10 menit

async function dariCache(phone: string): Promise<HasilLookup | null> {
  try {
    const rows = await db
      .select()
      .from(legacyCustomerCache)
      .where(and(eq(legacyCustomerCache.phoneE164, phone), gt(legacyCustomerCache.expiresAt, new Date())))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      found: r.found,
      name: r.fullName ?? undefined,
      address: r.address ?? undefined,
      legacyRef: r.legacyRef ?? undefined,
      sumber: 'cache',
    };
  } catch {
    return null;
  }
}

async function simpanCache(phone: string, h: HasilLookup): Promise<void> {
  try {
    const expires = new Date(Date.now() + (h.found ? TTL_KETEMU_MS : TTL_KOSONG_MS));
    await db
      .insert(legacyCustomerCache)
      .values({
        phoneE164: phone,
        found: h.found,
        fullName: h.name ?? null,
        address: h.address ?? null,
        legacyRef: h.legacyRef ?? null,
        expiresAt: expires,
      })
      .onConflictDoUpdate({
        target: legacyCustomerCache.phoneE164,
        set: {
          found: h.found,
          fullName: h.name ?? null,
          address: h.address ?? null,
          legacyRef: h.legacyRef ?? null,
          fetchedAt: new Date(),
          expiresAt: expires,
        },
      });
  } catch {
    /* cache gagal bukan alasan menggagalkan lookup */
  }
}

export async function lookupPelangganLama(phoneE164: string): Promise<HasilLookup> {
  const cached = await dariCache(phoneE164);
  if (cached) return cached;

  if (!env.bridgeUrl || !env.bridgeSecret) {
    return { found: false, sumber: 'kosong' };
  }

  const body = JSON.stringify({ phone: phoneE164 });
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = crypto
    .createHmac('sha256', env.bridgeSecret)
    .update(`${ts}.${nonce}.${crypto.createHash('sha256').update(body).digest('hex')}`)
    .digest('hex');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), env.bridgeTimeoutMs);

  try {
    const res = await fetch(env.bridgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-BSS-Key': env.bridgeKey,
        'X-BSS-Timestamp': ts,
        'X-BSS-Nonce': nonce,
        'X-BSS-Signature': sig,
      },
      body,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) return { found: false, sumber: 'kosong' };

    const data = (await res.json()) as {
      found?: boolean;
      customer?: { ref?: string; name?: string; address?: string };
    };

    const hasil: HasilLookup =
      data?.found && data.customer && namaLayak(data.customer.name)
        ? {
            found: true,
            name: String(data.customer.name).slice(0, 150),
            address: data.customer.address ? String(data.customer.address).slice(0, 300) : undefined,
            legacyRef: data.customer.ref ? String(data.customer.ref) : undefined,
            sumber: 'bridge',
          }
        : { found: false, sumber: 'bridge' };

    await simpanCache(phoneE164, hasil);
    return hasil;
  } catch {
    // Timeout / DNS / SSL — semuanya berakhir sama: lanjut isi manual.
    return { found: false, sumber: 'kosong' };
  } finally {
    clearTimeout(timer);
  }
}
