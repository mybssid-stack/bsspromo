'use client';

export default function TombolKeluar() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.href = '/admin/login';
      }}
      className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-bold text-muted transition hover:bg-line-2 hover:text-ink"
    >
      Keluar
    </button>
  );
}
