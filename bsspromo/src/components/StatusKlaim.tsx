'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Spinner } from './ui';

type Status = {
  status: string;
  amount: number;
  device: string;
  customerName: string;
  payment: { orderId: string; type: string | null; status: string | null } | null;
  voucher: { code: string; url: string } | null;
};

const rupiah = (n: number) => 'Rp ' + (n || 0).toLocaleString('id-ID');

const LABEL: Record<string, string> = {
  DRAFT: 'Klaim dibuat',
  AWAITING_PAYMENT: 'Menunggu pembayaran',
  PAID: 'Lunas',
  EXPIRED: 'Kedaluwarsa',
  CANCELLED: 'Dibatalkan',
  FAILED: 'Gagal',
  REFUNDED: 'Dikembalikan',
};

export default function StatusKlaim({ claimNo, token }: { claimNo: string; token: string }) {
  const [d, setD] = useState<Status | null>(null);
  const [galat, setGalat] = useState('');

  useEffect(() => {
    let hidup = true;
    let jeda = 3000;

    const cek = async () => {
      if (!hidup) return;
      try {
        const res = await fetch(
          `/api/v1/claim/${encodeURIComponent(claimNo)}/status?k=${encodeURIComponent(token)}`,
          { cache: 'no-store' },
        );
        const j = (await res.json()) as Status & { ok: boolean; message?: string };
        if (!hidup) return;
        if (!j.ok) {
          setGalat(j.message ?? 'Gagal membaca status.');
          return;
        }
        setD(j);
        if (j.status === 'PAID' && j.voucher) {
          window.location.href = j.voucher.url;
          return;
        }
        if (j.status === 'PAID' || j.status === 'FAILED' || j.status === 'EXPIRED') return;
      } catch {
        /* coba lagi */
      }
      jeda = Math.min(jeda * 1.2, 15000);
      if (hidup) setTimeout(cek, jeda);
    };

    void cek();
    return () => {
      hidup = false;
    };
  }, [claimNo, token]);

  if (galat) return <Alert>{galat}</Alert>;

  if (!d) {
    return (
      <div className="py-16 text-center text-muted">
        <Spinner className="h-6 w-6" />
        <p className="mt-3 text-[14px]">Membaca status…</p>
      </div>
    );
  }

  const menunggu = d.status === 'DRAFT' || d.status === 'AWAITING_PAYMENT';

  return (
    <div>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-2">
        Invoice {claimNo}
      </p>
      <h1 className="mt-1 text-[24px] font-black tracking-tight">
        {LABEL[d.status] ?? d.status}
      </h1>

      <div className="mt-5 rounded-[18px] border border-line bg-white p-5">
        <Baris k="Nama" v={d.customerName} />
        <Baris k="Unit" v={d.device} />
        <Baris k="Jumlah" v={rupiah(d.amount)} />
        {d.payment?.type && <Baris k="Metode" v={d.payment.type} />}
      </div>

      {menunggu && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-4">
          <Spinner className="mt-0.5 h-4 w-4 text-bss" />
          <p className="text-[13.5px] leading-relaxed text-muted">
            Halaman ini memantau pembayaran secara otomatis. Begitu dana terkonfirmasi, voucher
            terbit dan kamu langsung diarahkan ke sana. Aman ditinggal, jangan ditutup.
          </p>
        </div>
      )}

      {(d.status === 'FAILED' || d.status === 'EXPIRED') && (
        <div className="mt-5">
          <Alert>
            Pembayaran tidak selesai. Tidak ada dana yang terpotong. Silakan ulangi klaim dari
            halaman promo.
          </Alert>
        </div>
      )}

      <div className="mt-7 text-center">
        <Link href="/" className="text-[13px] font-bold text-bss underline underline-offset-4">
          Kembali ke halaman promo
        </Link>
      </div>
    </div>
  );
}

function Baris({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line-2 py-2.5 last:border-0">
      <span className="text-[13px] text-muted">{k}</span>
      <span className="text-right text-[13.5px] font-bold text-ink">{v}</span>
    </div>
  );
}
