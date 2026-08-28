import Link from 'next/link';
import { sesiSekarang } from '@/lib/admin-auth';
import TombolKeluar from '@/components/TombolKeluar';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Promo Console — BSS',
  robots: { index: false, follow: false },
};

const MENU = [
  { href: '/admin', label: 'Dasbor' },
  { href: '/admin/harga', label: 'Harga' },
  { href: '/admin/pembayaran', label: 'Pembayaran' },
  { href: '/admin/voucher', label: 'Voucher' },
  { href: '/admin/pengaturan', label: 'Pengaturan' },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await sesiSekarang();

  // Halaman login memakai layout ini juga, tapi belum punya sesi.
  if (!s) return <>{children}</>;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-bss text-[12px] font-black text-white">
              BSS
            </div>
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-muted-2">
                Promo Console
              </p>
              <p className="text-[14px] font-extrabold leading-none">{s.name}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/"
                target="_blank"
                className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-bold transition hover:bg-line-2"
              >
                Lihat Landing
              </Link>
              <TombolKeluar />
            </div>
          </div>

          <nav className="-mb-px flex gap-1 overflow-x-auto">
            {MENU.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13.5px] font-bold text-muted transition hover:border-line hover:text-ink"
              >
                {m.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-7">{children}</main>
    </div>
  );
}
