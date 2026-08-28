import Link from 'next/link';
import StatusKlaim from '@/components/StatusKlaim';
import { cekClaimToken } from '@/lib/qr-jws';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Status Pembayaran — BSS Service',
  robots: { index: false, follow: false },
};

export default async function HalamanStatus({
  params,
  searchParams,
}: {
  params: Promise<{ claimNo: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { claimNo: mentah } = await params;
  const { k } = await searchParams;
  const claimNo = decodeURIComponent(mentah).toUpperCase();

  if (!k || !cekClaimToken(claimNo, k)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-[22px] font-black">Tautan status tidak sah</h1>
        <p className="mt-2 text-[14px] text-muted">
          Buka halaman ini lewat tautan yang muncul setelah kamu klaim promo.
        </p>
        <Link href="/" className="mx-auto mt-6 rounded-xl bg-bss px-6 py-3 text-[14px] font-bold text-white">
          Ke halaman promo
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-10">
      <StatusKlaim claimNo={claimNo} token={k} />
    </main>
  );
}
