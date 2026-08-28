/**
 * Pembatas laju.
 *
 * Kalau Upstash sudah diisi → sliding window terdistribusi (benar di semua
 * instance). Kalau belum → penghitung dalam memori proses. Yang kedua lemah
 * (tiap lambda punya hitungan sendiri) tapi tetap menahan banjir dari satu
 * penyerang, dan yang penting: aplikasi tidak perlu Upstash untuk bisa jalan.
 */

type Hasil = { success: boolean; sisa: number };

const memori = new Map<string, number[]>();

function memoriCek(kunci: string, batas: number, jendelaMs: number): Hasil {
  const now = Date.now();
  const arr = (memori.get(kunci) ?? []).filter((t) => now - t < jendelaMs);
  if (arr.length >= batas) {
    memori.set(kunci, arr);
    return { success: false, sisa: 0 };
  }
  arr.push(now);
  memori.set(kunci, arr);

  // Sapu bersih sesekali supaya Map tidak tumbuh selamanya.
  if (memori.size > 5000) {
    for (const [k, v] of memori) {
      if (v.every((t) => now - t >= jendelaMs)) memori.delete(k);
    }
  }
  return { success: true, sisa: batas - arr.length };
}

let upstash: { limit: (k: string) => Promise<{ success: boolean; remaining: number }> } | null = null;
let upstashSiap = false;

async function siapkanUpstash() {
  if (upstashSiap) return;
  upstashSiap = true;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ]);
    const rl = new Ratelimit({
      redis: new Redis({ url, token }),
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      prefix: 'bsspromo',
      analytics: false,
    });
    upstash = { limit: (k: string) => rl.limit(k) };
  } catch {
    upstash = null;
  }
}

/**
 * @param kunci  pengenal unik (mis. "claim:1.2.3.4" atau "lookup:<hash nomor>")
 * @param batas  jumlah permintaan yang diizinkan
 * @param detik  panjang jendela
 */
export async function batasiLaju(kunci: string, batas = 10, detik = 60): Promise<Hasil> {
  await siapkanUpstash();
  if (upstash) {
    try {
      const r = await upstash.limit(kunci);
      return { success: r.success, sisa: r.remaining };
    } catch {
      /* Redis ngadat → jatuh ke memori */
    }
  }
  return memoriCek(kunci, batas, detik * 1000);
}

export function ipDari(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}
