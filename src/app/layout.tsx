import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import { AuthProvider } from '@/lib/auth/AuthContext';

export const metadata: Metadata = {
  title: 'Tiệm Bánh ABC — ERP & POS Mini',
  description: 'Hệ thống Bán hàng, Kho vật tư & Kế toán tự động cho tiệm bánh',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full bg-zinc-50 antialiased">
      <head>
        <meta name="theme-color" content="#d97706" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="min-h-full flex flex-col font-sans text-zinc-900 selection:bg-amber-100 selection:text-amber-900">
        <AuthProvider>
          <Header />
          <main className="flex-1 flex flex-col">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
