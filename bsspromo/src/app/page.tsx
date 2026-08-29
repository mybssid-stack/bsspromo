import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { promoItems } from '@/db/schema';
import CekVoucher from '@/components/CekVoucher';
import Countdown from '@/components/Countdown';
import NavShell from '@/components/NavShell';
import SearchPromo, { type ItemPromo } from '@/components/SearchPromo';
import { env } from '@/lib/env';
import { rupiah, tanggalPanjang } from '@/lib/money';
import { ambilPengaturan, promoSedangJalan } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * Satu halaman untuk semua ukuran layar.
 *
 * Tidak ada cabang "kalau mobile tampilkan X, kalau desktop tampilkan Y".
 * Bagian dan isinya identik; yang berubah cuma jumlah kolom dan ukuran huruf
 * lewat breakpoint Tailwind. Itu satu-satunya cara memastikan kedua tampilan
 * tidak pelan-pelan menjadi dua produk yang berbeda.
 */
async function ambilItem(): Promise<ItemPromo[]> {
  try {
    const rows = await db
      .select()
      .from(promoItems)
      .where(eq(promoItems.isActive, true))
      .orderBy(asc(promoItems.sortOrder))
      .limit(24);
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
      stock: r.stock,
    }));
  } catch (e) {
    // Database belum terpasang tidak boleh membuat halaman promo mati total.
    console.error('[beranda] gagal memuat daftar harga:', e);
    return [];
  }
}

const FAQ = [
  {
    t: 'Berapa lama pengerjaannya?',
    d: 'Sekitar 45 menit untuk sebagian besar tipe, selama sparepart-nya ada di tempat. Kamu bisa menunggu di toko.',
  },
  {
    t: 'Garansinya menghitung dari kapan?',
    d: 'Dari saat LCD terpasang dan unit diserahkan, bukan dari saat kamu membayar. Jadi tidak berkurang walau vouchernya ditukar seminggu kemudian.',
  },
  {
    t: 'Kalau saya batal datang, uangnya bagaimana?',
    d: 'Voucher berlaku 30 hari. Kalau lewat dan belum sempat datang, hubungi CS sebelum masa berlakunya habis.',
  },
  {
    t: 'Gambar vouchernya hilang, bagaimana?',
    d: 'Hubungi CS. Untuk keamanan, CS akan menanyakan nomor HP yang kamu pakai saat membayar, lalu mengirim ulang tautannya kalau cocok.',
  },
  {
    t: 'Data di HP saya aman?',
    d: 'Ganti LCD tidak menyentuh penyimpanan. Kunci layar diminta hanya supaya teknisi bisa mengecek layar barunya berfungsi normal sebelum unit diserahkan.',
  },
];

export default async function Beranda() {
  const [p, items] = await Promise.all([ambilPengaturan(), ambilItem()]);
  const aktif = promoSedangJalan(p);
  const syarat = Array.isArray(p['promo.terms']) ? (p['promo.terms'] as string[]) : [];
  const waCs = String(p['store.wa_cs'] || env.csWhatsapp || '');
  const namaToko = String(p['store.name'] || env.storeName);
  const akhir = p['promo.end_at'] ? String(p['promo.end_at']) : null;

  const termurah = items.length > 0 ? Math.min(...items.map((i) => i.pricePromo)) : null;
  const populer = items.slice(0, 5).map((i) => i.model);

  return (
    <div className="pad-tabbar">
      <NavShell waCs={waCs} namaToko={namaToko} />

      <main>
        {/* ══ Hero ══ */}
        <section className="border-b border-line bg-gradient-to-b from-bss-tint/60 to-white">
          <div className="mx-auto max-w-6xl px-4 pb-10 pt-9 sm:px-6 sm:pb-14 sm:pt-14">
            {!aktif && (
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-bss-tint px-3.5 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-bss" />
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-bss">
                  Promo sedang tutup
                </span>
              </div>
            )}

            <h1 className="display max-w-3xl text-[clamp(28px,6vw,54px)] font-bold leading-[1.08]">
              {String(p['promo.title'])}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted sm:text-[17px]">
              {String(p['promo.subtitle'])}
            </p>

            {aktif && akhir && (
              <div className="mt-7">
                <Countdown sampai={akhir} />
              </div>
            )}
          </div>
        </section>

        {/* ══ Harga & pencarian ══ */}
        <section id="bagian-harga" className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          {aktif ? (
            <>
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="display text-[22px] font-bold sm:text-[26px]">Harga promo</h2>
                  <p className="mt-1 text-[14px] text-muted">
                    {termurah !== null
                      ? `${items.length} tipe HP, mulai ${rupiah(termurah)} sudah termasuk pemasangan.`
                      : 'Cari tipe HP kamu untuk melihat harganya.'}
                  </p>
                </div>
                {akhir && (
                  <p className="text-[12.5px] text-muted">
                    Berlaku sampai {tanggalPanjang(akhir)}
                  </p>
                )}
              </div>
              <SearchPromo awal={items} populer={populer} />
            </>
          ) : (
            <div className="rounded-[18px] border border-line bg-white p-9 text-center">
              <h2 className="display text-[20px] font-bold">Promo sedang tidak berjalan</h2>
              <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-muted">
                Servis tetap buka seperti biasa dengan harga normal. Hubungi CS untuk penawaran.
              </p>
            </div>
          )}
        </section>

        {/* ══ Cara klaim ══ */}
        <section id="bagian-cara" className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-11 sm:px-6 sm:py-16">
            <h2 className="display text-[22px] font-bold sm:text-[26px]">Tiga langkah, selesai</h2>
            <p className="mt-1 text-[14px] text-muted">
              Semua online. Kamu cuma datang untuk pemasangan.
            </p>

            <ol className="mt-7 grid gap-4 sm:grid-cols-3">
              {[
                {
                  t: 'Pilih & bayar',
                  d: 'Cari tipe HP kamu, klaim promonya, bayar lewat QRIS, e-wallet, transfer bank, atau kartu.',
                },
                {
                  t: 'Simpan voucher',
                  d: 'Voucher ber-QR langsung terbit setelah pembayaran masuk. Simpan gambarnya ke galeri.',
                },
                {
                  t: 'Datang ke toko',
                  d: 'CS memindai QR-nya, semua data terisi otomatis. Kamu tinggal menunggu sambil ngopi.',
                },
              ].map((s, i) => (
                <li key={s.t} className="rounded-[18px] border border-line bg-canvas p-6">
                  <span className="display flex h-9 w-9 items-center justify-center rounded-lg bg-bss text-[15px] font-bold text-white">
                    {i + 1}
                  </span>
                  <h3 className="display mt-4 text-[16.5px] font-bold">{s.t}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ══ Cek voucher ══ */}
        <section id="bagian-voucher" className="mx-auto max-w-6xl px-4 py-11 sm:px-6 sm:py-14">
          <div className="grid gap-5 lg:grid-cols-2">
            <CekVoucher />
            <div className="rounded-[18px] border border-line bg-white p-6 sm:p-7">
              <h3 className="display text-[18px] font-bold">Kenapa dipindai, bukan diketik?</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                QR di voucher membawa seluruh data servismu dalam bentuk terenkripsi. Begitu CS
                memindainya, form penerimaan unit terisi sendiri — nama, tipe HP, pekerjaan, dan
                status bayar. CS cuma menanyakan kunci layar.
              </p>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
                Artinya tidak ada salah ketik harga, tidak ada tagihan dobel, dan antreanmu di meja
                CS selesai di bawah dua menit.
              </p>
            </div>
          </div>
        </section>

        {/* ══ Garansi & FAQ ══ */}
        <section id="bagian-garansi" className="border-y border-line bg-white">
          <div className="mx-auto max-w-6xl px-4 py-11 sm:px-6 sm:py-16">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <div>
                <h2 className="display text-[22px] font-bold sm:text-[26px]">
                  Garansi &amp; ketentuan
                </h2>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
                  Dikerjakan teknisi bersertifikat, memakai LCD grade original.
                </p>
                {syarat.length > 0 && (
                  <ul className="mt-5 space-y-2.5">
                    {syarat.map((s) => (
                      <li key={s} className="flex gap-3 text-[13.5px] leading-relaxed text-ink-2">
                        <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-bss" />
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="display text-[17px] font-bold">Pertanyaan yang sering masuk</h3>
                <div className="mt-4 divide-y divide-line rounded-[18px] border border-line">
                  {FAQ.map((f) => (
                    <details key={f.t} className="group px-5 py-4">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-bold text-ink">
                        {f.t}
                        <span className="shrink-0 text-muted-2 transition group-open:rotate-45">
                          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
                          </svg>
                        </span>
                      </summary>
                      <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">{f.d}</p>
                    </details>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ Kaki ══ */}
        <footer className="mx-auto max-w-6xl px-4 py-11 sm:px-6 sm:py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-md">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/bss-logo.jpg" alt="" width={40} height={40} className="h-10 w-10 rounded-lg object-cover" />
                <div>
                  <p className="display text-[16px] font-bold">{namaToko}</p>
                  <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-2">
                    Business Smartphone Solution
                  </p>
                </div>
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                Kehilangan gambar voucher? Hubungi CS. Demi keamanan, CS akan menanyakan nomor HP
                yang dipakai saat membayar sebelum mengirim ulang tautannya.
              </p>
            </div>

            {waCs && (
              <a
                href={`https://wa.me/${waCs}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-5 py-3 text-[14px] font-bold text-ink transition hover:bg-line-2"
              >
                Tanya CS via WhatsApp
              </a>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}
