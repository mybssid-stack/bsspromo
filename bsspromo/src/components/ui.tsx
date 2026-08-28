import type { ReactNode } from 'react';

export function Badge({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'ok' | 'muted' }) {
  const kelas =
    tone === 'ok'
      ? 'bg-ok-bg text-ok'
      : tone === 'muted'
        ? 'bg-line-2 text-muted'
        : 'bg-bss-tint text-bss';
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold tracking-wide ${kelas}`}>
      {children}
    </span>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

export function Alert({
  tone = 'red',
  children,
}: {
  tone?: 'red' | 'ok' | 'info';
  children: ReactNode;
}) {
  const kelas =
    tone === 'ok'
      ? 'bg-ok-bg text-ok border-ok/20'
      : tone === 'info'
        ? 'bg-line-2 text-ink-2 border-line'
        : 'bg-bss-tint text-bss-dark border-bss-line';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${kelas}`} role="status">
      {children}
    </div>
  );
}
