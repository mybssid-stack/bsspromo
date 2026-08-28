import { z } from 'zod';
import { jsonErr, jsonOk } from '@/lib/api';
import { lookupPelangganLama } from '@/lib/bridge';
import { normalizePhoneID } from '@/lib/phone';
import { hashPhone } from '@/lib/qr-jws';
import { batasiLaju, ipDari } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Skema = z.object({ phone: z.string().min(6).max(30) });

/**
 * Cek nomor HP ke database pelanggan lama (MySQL cPanel) lewat Bridge API.
 *
 * Respons SELALU 200 selama nomornya valid. "Tidak ketemu" bukan galat —
 * itu jawaban yang sah dan membuat form pindah ke mode isi manual.
 */
export async function POST(req: Request) {
  const ip = ipDari(req);
  const rl = await batasiLaju(`lookup:${ip}`, 20, 60);
  if (!rl.success) return jsonErr('RATE_LIMITED', 'Terlalu banyak percobaan. Tunggu sebentar.', 429);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr('BAD_JSON', 'Format permintaan tidak dikenali.');
  }

  const parsed = Skema.safeParse(body);
  if (!parsed.success) return jsonErr('BAD_INPUT', 'Nomor HP tidak dikirim dengan benar.');

  const e164 = normalizePhoneID(parsed.data.phone);
  if (!e164) {
    return jsonOk({
      valid: false,
      found: false,
      message: 'Nomor HP belum lengkap atau bukan nomor Indonesia.',
    });
  }

  // Batas per nomor, bukan cuma per IP: satu orang di warnet tidak boleh
  // memindai ribuan nomor untuk memanen nama & alamat pelanggan BSS.
  const rlNomor = await batasiLaju(`lookup-nomor:${hashPhone(e164)}`, 8, 60);
  if (!rlNomor.success) {
    return jsonErr('RATE_LIMITED', 'Terlalu banyak percobaan untuk nomor ini.', 429);
  }

  const hasil = await lookupPelangganLama(e164);

  return jsonOk({
    valid: true,
    phone: e164,
    found: hasil.found,
    name: hasil.found ? hasil.name ?? '' : '',
    address: hasil.found ? hasil.address ?? '' : '',
  });
}
