import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { db } from '@/db';
import { claims, payments, vouchers } from '@/db/schema';
import VoucherCard, { type DataVoucher } from '@/components/VoucherCard';
import { env } from '@/lib/env';
import { namaMetode, tanggalID, tanggalPanjang } from '@/lib/money';
import { formatPhoneLocal } from '@/lib/phone';
import { cekVoucherToken } from '@/lib/qr-jws';
import { ambilPengaturan } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Voucher Promo — BSS Service',
  robots: { index: false, follow: false },
};

export default async function HalamanVoucher({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { code: kodeMentah } = await params;
  const { t } = await searchParams;
  const code = decodeURIComponent(kodeMentah).toUpperCase();

  // Tanpa token yang benar, halaman ini tidak terbuka. Kode voucher saja
  // tidak cukup — kalau cukup, siapa pun yang melihat kode di layar orang
  // lain bisa membuka nama, nomor HP, dan alamat pemiliknya.
  if (!t || !cekVoucherToken(code, t)) {
    return <Ditolak />;
  }

  const rows = await db
    .select({ v: vouchers, c: claims })
    .from(vouchers)
    .innerJoin(claims, eq(claims.id, vouchers.claimId))
    .where(eq(vouchers.code, code))
    .limit(1);

  const row = rows[0];
  if (!row) notFound();

  const bayarRows = await db
    .select()
    .from(payments)
    .where(eq(payments.claimId, row.c.id))
    .orderBy(desc(payments.attempt))
    .limit(1);

  const p = await ambilPengaturan();

  // QR dibuat di server: matriksnya selalu sama, tidak bergantung browser.
  // Level koreksi galat M — cukup tahan terhadap layar retak tanpa membuat
  // matriks jadi terlalu rapat untuk dipindai dari jarak biasa.
  const qrDataUrl = await QRCode.toDataURL(row.v.qrJws, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 8,
    color: { dark: '#14161AFF', light: '#FFFFFFFF' },
  });

  const statusEfektif =
    row.v.status === 'ACTIVE' && row.v.validUntil.getTime() < Date.now() ? 'EXPIRED' : row.v.status;

  const data: DataVoucher = {
    code: row.v.code,
    invoiceNo: row.c.claimNo,
    status: statusEfektif,
    nama: row.c.nameSnapshot,
    phoneDisplay: formatPhoneLocal(row.c.phoneSnapshot),
    brand: row.c.brand,
    model: row.c.model,
    partType: row.c.partType,
    qualityGrade: row.c.qualityGrade ?? '',
    amount: row.c.amountIdr,
    metode: namaMetode(bayarRows[0]?.paymentType),
    warrantyDays: row.c.warrantyDays,
    paidAt: tanggalID(row.c.paidAt),
    validUntil: tanggalPanjang(row.v.validUntil),
    qrDataUrl,
    storeName: String(p['store.name'] || env.storeName),
    waCs: String(p['store.wa_cs'] || env.csWhatsapp || ''),
  };

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-6">
      <div className="mb-5 text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-2">
          Pembayaran berhasil
        </p>
        <h1 className="mt-1 text-[24px] font-black tracking-tight">Voucher kamu siap</h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
          Simpan gambarnya sekarang. Tunjukkan ke CS saat datang ke toko.
        </p>
      </div>

      <VoucherCard d={data} />

      {row.v.status === 'REDEEMED' && (
        <div className="mt-5 rounded-xl border border-line bg-white px-4 py-3 text-[13px] text-muted">
          Voucher ini sudah ditukar pada {tanggalID(row.v.redeemedAt)}
          {row.v.serviceTicketNo ? ` dengan nota ${row.v.serviceTicketNo}` : ''}.
          {row.v.warrantyEndAt && (
            <> Garansi berlaku sampai {tanggalPanjang(row.v.warrantyEndAt)}.</>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-line bg-white px-4 py-4 text-[12.5px] leading-relaxed text-muted">
        <p className="mb-1 font-bold text-ink">Halaman ini permanen</p>
        Simpan tautannya (bookmark) supaya bisa dibuka kapan saja. Kalau tautannya hilang, hubungi
        CS — untuk keamanan, CS akan menanyakan nomor HP yang dipakai saat membayar sebelum
        mengirim ulang.
      </div>

      <div className="mt-6 text-center">
        <Link href="/" className="text-[13px] font-bold text-bss underline underline-offset-4">
          Kembali ke halaman promo
        </Link>
      </div>
    </main>
  );
}

function Ditolak() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-[22px] font-black">Tautan voucher tidak lengkap</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Voucher hanya bisa dibuka lewat tautan lengkap yang dikirimkan setelah pembayaran. Kalau
        tautannya hilang, hubungi CS BSS dan sebutkan nomor HP yang dipakai saat membayar.
      </p>
      <Link
        href="/"
        className="mx-auto mt-6 rounded-xl bg-bss px-6 py-3 text-[14px] font-bold text-white"
      >
        Ke halaman promo
      </Link>
    </main>
  );
}
