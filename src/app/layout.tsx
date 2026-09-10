import type { Metadata, Viewport } from 'next';
import './globals.css';
import Header from '@/components/Header';
import PhoneNotificationBanner from '@/components/PhoneNotificationBanner';
import { AuthProvider } from '@/lib/auth/AuthContext';

export const metadata: Metadata = {
  title: 'Tiệm Bánh ABC — ERP & POS Mini',
  description: 'Hệ thống Bán hàng, Kho vật tư & Kế toán tự động cho tiệm bánh',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full bg-[#f3eae0] antialiased">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta name="theme-color" content="#d97706" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Khóa cử chỉ pinch zoom và double tap zoom trên thiết bị di động
              if (typeof window !== 'undefined') {
                document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, { passive: false });
                document.addEventListener('gesturechange', function (e) { e.preventDefault(); }, { passive: false });
                document.addEventListener('gestureend', function (e) { e.preventDefault(); }, { passive: false });
              }
            `,
          }}
        />
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
