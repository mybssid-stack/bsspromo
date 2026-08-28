'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Spinner } from '@/components/ui';

function FormMasuk() {
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [sandi, setSandi] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    setSibuk(true);
    setGalat('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password: sandi }),
      });
      const d = (await res.json()) as { ok: boolean; message?: string };
      if (!d.ok) {
        setGalat(d.message ?? 'Gagal masuk.');
        setSibuk(false);
        return;
      }
      window.location.href = params.get('next') || '/admin';
    } catch {
      setGalat('Jaringan bermasalah.');
      setSibuk(false);
    }
  }

  return (
    <form onSubmit={kirim} className="w-full max-w-sm space-y-4">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-bss text-[14px] font-black text-white">
          BSS
        </div>
        <h1 className="mt-4 text-[22px] font-black tracking-tight">Promo Console</h1>
        <p className="mt-1 text-[13.5px] text-muted">Masuk untuk mengatur promo dan voucher.</p>
      </div>

      {galat && <Alert>{galat}</Alert>}

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="username"
        required
        className="w-full rounded-xl border border-line bg-white px-4 py-3.5 text-[15px] outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
      />
      <input
        type="password"
        value={sandi}
        onChange={(e) => setSandi(e.target.value)}
        placeholder="Kata sandi"
        autoComplete="current-password"
        required
        className="w-full rounded-xl border border-line bg-white px-4 py-3.5 text-[15px] outline-none focus:border-bss focus:ring-4 focus:ring-bss/10"
      />
      <button
        type="submit"
        disabled={sibuk}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-bss py-3.5 text-[15px] font-bold text-white transition hover:bg-bss-dark disabled:opacity-60"
      >
        {sibuk && <Spinner />}
        Masuk
      </button>
    </form>
  );
}

export default function HalamanLogin() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <Suspense fallback={null}>
        <FormMasuk />
      </Suspense>
    </main>
  );
}
