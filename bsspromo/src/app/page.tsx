import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { promoItems } from '@/db/schema';
import SearchPromo, { type ItemPromo } from '@/components/SearchPromo';
import { env } from '@/lib/env';
import { ambilPengaturan, promoSedangJalan } from '@/lib/settings';
import { tanggalPanjang } from '@/lib/money';

export const dynamic = 'force-dynamic';

async function ambilAwal(): Promise<ItemPromo[]> {
  try {
    const rows = await db
      .select()
      .from(promoItems)
      .where(eq(promoItems.isActive, true))
      .orderBy(asc(promoItems.sortOrder))
      .limit(12);
    return rows.map((r) => ({
      slug: r.slug,
      brand: r.brand,
      model: r.model,
      partType: r.partType,
      qualityGrade: r.qualityGrade,
      priceNormal: r.priceNormalIdr,
      pricePromo: r.pricePromoIdr,
      warrantyDays: r.warrantyDays,
      note: r.note,
      habis: r.stock !== null && r.stock <= 0,
    }));
  } catch {
    return [];
  }
}

export default async function Beranda() {
  const [p, items] = await Promise.all([ambilPengaturan(), ambilAwal()]);
  const aktif = promoSedangJalan(p);
  const syarat = p['promo.terms'];
  const waCs = String(p['store.wa_cs'] || env.csWhatsapp || '');

  return (
    <main className="min-h-screen">
      {/* ── Kepala ── */}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bss text-[13px] font-black text-white">
            BSS
          </div>
          <div>
            <p className="text-[15px] font-extrabold leading-none">{String(p['store.name'])}</p>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-2">
              Business Smartphone Solution
            </p>
          </div>
          {waCs && (
            <a
              href={`https://wa.me/${waCs}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto rounded-lg border border-line px-3.5 py-2 text-[13px] font-bold text-ink transition hover:bg-line-2"
            >
              Tanya CS
            </a>
          )}
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 pb-10 pt-10 sm:pt-14">
          <div className="inline-flex items-center gap-2 rounded-full bg-bss-tint px-3 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-bss" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-bss">
              {aktif ? 'Promo sedang berjalan' : 'Promo sedang tutup'}
            </span>
          </div>

          <h1 className="mt-4 max-w-2xl text-[30px] font-black leading-[1.12] tracking-tight sm:text-[42px]">
            {String(p['promo.title'])}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted sm:text-[16.5px]">
            {String(p['promo.subtitle'])}
          </p>

          {p['promo.end_at'] && aktif && (
            <p className="mt-3 text-[13px] font-semibold text-muted">
              Berlaku sampai {tanggalPanjang(String(p['promo.end_at']))}
            </p>
          )}

          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-semibold text-ink-2">
            <span className="flex items-center gap-2">
              <Centang /> Bayar aman via Midtrans
            </span>
            <span className="flex items-center gap-2">
              <Centang /> Voucher digital instan
            </span>
            <span className="flex items-center gap-2">
              <Centang /> Garansi 7 hari
            </span>
          </div>
        </div>
      </section>

      {/* ── Pencarian ── */}
      <section className="mx-auto max-w-5xl px-5 py-9">
        {aktif ? (
          <>
            <h2 className="mb-4 text-[19px] font-extrabold tracking-tight">Cari tipe HP kamu</h2>
            <SearchPromo awal={items} />
          </>
        ) : (
          <div className="rounded-[18px] border border-line bg-white p-8 text-center">
            <h2 className="text-[19px] font-extrabold">Promo sedang tidak berjalan</h2>
            <p className="mt-2 text-[14px] text-muted">
              Servis tetap buka seperti biasa dengan harga normal. Hubungi CS untuk penawaran.
            </p>
          </div>
        )}
      </section>

      {/* ── Cara klaim ── */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="text-[19px] font-extrabold tracking-tight">Tiga langkah, selesai</h2>
          <p className="mt-1 text-[14px] text-muted">
            Semua online. Kamu cuma datang untuk pemasangan.
          </p>

          <ol className="mt-7 grid gap-5 sm:grid-cols-3">
            {[
              {
                t: 'Pilih & bayar',
                d: 'Cari tipe HP, klaim promonya, bayar lewat QRIS, e-wallet, VA, atau kartu.',
              },
              {
                t: 'Simpan voucher',
                d: 'Voucher ber-QR langsung terbit. Simpan gambarnya ke galeri HP kamu.',
              },
              {
                t: 'Datang ke toko',
                d: 'CS memindai QR, semua data terisi otomatis. Kamu tinggal menunggu.',
              },
            ].map((s, i) => (
              <li key={s.t} className="rounded-[18px] border border-line bg-canvas p-5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bss text-[14px] font-black text-white">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-[15.5px] font-extrabold">{s.t}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Syarat ── */}
      {Array.isArray(syarat) && syarat.length > 0 && (
        <section className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="text-[19px] font-extrabold tracking-tight">Yang perlu kamu tahu</h2>
          <ul className="mt-4 space-y-2.5">
            {syarat.map((s) => (
              <li key={s} className="flex gap-3 text-[14px] leading-relaxed text-ink-2">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-bss" />
                {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Kaki ── */}
      <footer className="border-t border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 py-8 text-[13px] text-muted">
          <p className="font-bold text-ink">{String(p['store.name'])}</p>
          <p className="mt-1 max-w-lg leading-relaxed">
            Kehilangan gambar voucher? Hubungi CS. Demi keamanan, CS akan menanyakan nomor HP yang
            dipakai saat membayar sebelum mengirim ulang tautannya.
          </p>
          {waCs && (
            <a
              href={`https://wa.me/${waCs}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block font-bold text-bss underline underline-offset-4"
            >
              WhatsApp CS
            </a>
          )}
        </div>
      </footer>
    </main>
  );
}

function Centang() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 text-ok" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.7a1 1 0 0 0-1.4-1.4L9 10.16 7.7 8.88a1 1 0 1 0-1.4 1.42l2 2a1 1 0 0 0 1.4 0l4-4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
