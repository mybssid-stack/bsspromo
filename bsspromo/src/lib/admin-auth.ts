import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { env } from './env';

export const ADMIN_COOKIE = 'bss_admin';
const MASA_BERLAKU = '8h';

export type AdminSession = {
  sub: string;      // admin_users.id
  email: string;
  name: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'CS';
};

function kunci(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export async function buatSesi(s: AdminSession): Promise<string> {
  return await new SignJWT({ email: s.email, name: s.name, role: s.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(MASA_BERLAKU)
    .sign(kunci());
}

export async function bacaToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, kunci());
    return {
      sub: String(payload.sub ?? ''),
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
      role: (payload.role as AdminSession['role']) ?? 'ADMIN',
    };
  } catch {
    return null;
  }
}

/** Dipakai di Server Component & Route Handler. */
export async function sesiSekarang(): Promise<AdminSession | null> {
  const jar = await cookies();
  return bacaToken(jar.get(ADMIN_COOKIE)?.value);
}

/** Untuk route admin: lempar 401 kalau belum masuk. */
export async function wajibAdmin(): Promise<AdminSession> {
  const s = await sesiSekarang();
  if (!s) throw new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }), { status: 401 });
  return s;
}

