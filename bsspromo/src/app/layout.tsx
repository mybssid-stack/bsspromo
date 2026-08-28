import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ganti LCD mulai Rp 185.000 — BSS Service',
  description:
    'Ganti LCD HP dengan harga promo. Bayar online, datang ke toko, tunjukkan voucher. Garansi 7 hari.',
  robots: { index: true, follow: true },
  icons: { icon: '/bss-logo.jpg', apple: '/bss-logo.jpg' },
  openGraph: {
    title: 'Promo Ganti LCD — BSS Service',
    description: 'Bayar online, datang ke toko, tunjukkan voucher. Garansi 7 hari.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#e11b22',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
