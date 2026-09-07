'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, ChefHat, BarChart3, Wifi, WifiOff, Cake, UserCheck, Shield, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';

export default function Header() {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { user, setRole, isAdmin } = useAuth();

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const navItems = [
    { href: '/pos', label: 'Bán hàng (POS)', icon: ShoppingBag, requiresAdmin: false },
    { href: '/kitchen', label: 'Bếp bánh (KDS)', icon: ChefHat, requiresAdmin: false },
    { href: '/admin', label: 'Quản trị & Kế toán', icon: BarChart3, requiresAdmin: true },
  ];

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-amber-100 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-amber-900 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-400 flex items-center justify-center text-white shadow-md shadow-amber-500/20 group-hover:scale-105 transition">
            <Cake className="w-6 h-6" />
          </div>
          <div>
            <span className="block text-base font-extrabold tracking-tight">TIỆM BÁNH ABC</span>
            <span className="block text-[11px] font-semibold text-amber-600">Bakery ERP & POS Mini</span>
          </div>
        </Link>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);
            // If user is Staff, highlight that Admin tab is restricted or hide it
            if (mounted && item.requiresAdmin && !isAdmin) {
              return (
                <span
                  key={item.href}
                  title="Chỉ dành cho Chủ tiệm (Admin)"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-zinc-400 opacity-60 cursor-not-allowed"
                >
                  <Shield className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                  isActive
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
                    : 'text-zinc-600 hover:bg-amber-50 hover:text-amber-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right side: Role Switcher & Online Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Role Switcher */}
          <div className="flex items-center bg-zinc-100 p-1 rounded-xl border border-zinc-200 text-xs">
            <button
              onClick={() => setRole('admin')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition ${
                isAdmin
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
              title="Chuyển quyền sang Chủ Tiệm (Toàn quyền, xem giá vốn, lãi lỗ)"
            >
              <Shield className="w-3 h-3" />
              <span className="hidden md:inline">Admin</span>
            </button>
            <button
              onClick={() => setRole('staff')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold transition ${
                !isAdmin
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
              title="Chuyển quyền sang Nhân Viên (Chỉ bán hàng và làm bếp, ẩn giá vốn)"
            >
              <Users className="w-3 h-3" />
              <span className="hidden md:inline">Nhân viên</span>
            </button>
          </div>

          {/* Online / Offline Status Badge */}
          {isOnline ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Online</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
