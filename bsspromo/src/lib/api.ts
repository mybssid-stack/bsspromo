import { NextResponse } from 'next/server';

/** Bentuk respons yang sama untuk semua endpoint — memudahkan sisi klien. */
export function jsonOk<T extends object>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, ...data }, { status: 200, ...init });
}

export function jsonErr(code: string, message: string, status = 400, extra?: object) {
  return NextResponse.json({ ok: false, code, message, ...extra }, { status });
}

/** Verifikasi Cloudflare Turnstile. Lolos otomatis kalau belum dikonfigurasi. */
export async function cekTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      cache: 'no-store',
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
