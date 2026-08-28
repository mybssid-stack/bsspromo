import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_COOKIE, bacaToken } from '@/lib/admin-auth';

/**
 * Penjaga halaman admin.
 *
 * Middleware hanya memeriksa TIKET-nya sah (tanda tangan JWT), bukan hak
 * aksesnya. Pemeriksaan peran tetap dilakukan lagi di setiap route API —
 * middleware bisa terlewat pada rute yang tidak cocok matcher-nya, jadi
 * tidak boleh jadi satu-satunya pertahanan.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin/login')) return NextResponse.next();

  const sesi = await bacaToken(req.cookies.get(ADMIN_COOKIE)?.value);
  if (!sesi) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
