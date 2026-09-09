import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import PhoneNotificationBanner from '@/components/PhoneNotificationBanner';
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
    <html lang="vi" className="h-full bg-[#f3eae0] antialiased">
      <head>
        <meta name="theme-color" content="#d97706" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="min-h-full flex flex-col font-sans text-[#2d241e] bg-[#f3eae0] selection:bg-amber-200 selection:text-amber-950">
        <AuthProvider>
          <Header />
          <PhoneNotificationBanner />
          <main className="flex-1 flex flex-col">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
