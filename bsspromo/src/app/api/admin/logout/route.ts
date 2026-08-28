import { ADMIN_COOKIE } from '@/lib/admin-auth';
import { jsonOk } from '@/lib/api';

export const runtime = 'nodejs';

export async function POST() {
  const res = jsonOk({});
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
