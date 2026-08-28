import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { ADMIN_COOKIE, buatSesi } from '@/lib/admin-auth';
import { jsonErr, jsonOk } from '@/lib/api';
import { catat } from '@/lib/audit';
import { verifyPassword } from '@/lib/password';
import { batasiLaju, ipDari } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Skema = z.object({ email: z.string().email().max(160), password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const ip = ipDari(req);
  const rl = await batasiLaju(`admin-login:${ip}`, 8, 300);
  if (!rl.success) return jsonErr('RATE_LIMITED', 'Terlalu banyak percobaan masuk. Tunggu 5 menit.', 429);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonErr('BAD_JSON', 'Format permintaan tidak dikenali.');
  }
  const parsed = Skema.safeParse(raw);
  if (!parsed.success) return jsonErr('BAD_INPUT', 'Email atau kata sandi belum diisi.');

  const rows = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.email, parsed.data.email.toLowerCase()), eq(adminUsers.isActive, true)))
    .limit(1);
  const user = rows[0];

  // Pesan galat sengaja sama untuk email salah maupun sandi salah — supaya
  // tidak bisa dipakai menebak email admin mana yang terdaftar.
  const sah = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !sah) {
    await catat({ actorType: 'ADMIN', action: 'admin.login_failed', after: { email: parsed.data.email }, ip });
    return jsonErr('BAD_CREDENTIALS', 'Email atau kata sandi salah.', 401);
  }

  const token = await buatSesi({
    sub: user.id,
    email: user.email,
    name: user.fullName,
    role: user.role as 'SUPERADMIN' | 'ADMIN' | 'CS',
  });

  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await catat({ actorType: 'ADMIN', actorId: user.id, action: 'admin.login', ip });

  const res = jsonOk({ name: user.fullName, role: user.role });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  return res;
}
