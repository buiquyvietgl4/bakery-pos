'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, ChefHat, BarChart3, Wifi, WifiOff, Cake, Shield, Users, Lock, LogOut, KeyRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import LoginModal from '@/components/LoginModal';

export default function Header() {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);
  const { user, isAdmin, isStaff, logout, openLoginModal } = useAuth();

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
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-amber-100 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-amber-900 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-400 flex items-center justify-center text-white shadow-md shadow-amber-500/20 group-hover:scale-105 transition">
              <Cake className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-sm sm:text-base font-extrabold tracking-tight">TIỆM BÁNH ABC</span>
              <span className="block text-[10px] sm:text-[11px] font-semibold text-amber-600">Bakery ERP & POS Mini</span>
            </div>
          </Link>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);

              // Nếu là Nhân viên bấm vào Quản trị: Hiện nút khóa bảo mật & kích hoạt đăng nhập Admin
              if (mounted && item.requiresAdmin && !isAdmin) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => openLoginModal('admin')}
                    title="Khu vực dành riêng cho Chủ Tiệm (Bấm để nhập mật khẩu)"
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold text-zinc-400 hover:text-amber-800 hover:bg-amber-50/80 transition cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="hidden sm:inline">{item.label}</span>
                    <span className="text-[10px] bg-zinc-200 text-zinc-600 px-1.5 py-0.2 rounded font-mono">Khóa</span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
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

          {/* Right side: Role Account Badge & Online Status */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {mounted && (
              <>
                {isAdmin ? (
                  // Đang là Admin
                  <div className="flex items-center gap-1 sm:gap-1.5 bg-amber-50 p-1 pl-2 sm:pl-2.5 rounded-xl border border-amber-200 text-xs">
                    <span className="flex items-center gap-1 font-black text-amber-800 text-[11px] sm:text-xs">
                      <Shield className="w-3.5 h-3.5 text-amber-600" />
                      <span className="hidden md:inline">Chủ Tiệm</span>
                    </span>
                    <button
                      type="button"
                      onClick={logout}
                      title="Khóa quyền Admin (Chuyển về quyền Nhân viên khi giao máy cho thu ngân)"
                      className="p-1 sm:px-2 sm:py-0.5 rounded-lg bg-white border border-amber-200 hover:bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <LogOut className="w-3 h-3 text-amber-700" />
                      <span className="hidden sm:inline">Khóa Admin</span>
                    </button>
                  </div>
                ) : (
                  // Đang là Nhân viên
                  <div className="flex items-center gap-1 bg-zinc-100 p-1 pl-2 rounded-xl border border-zinc-200 text-xs">
                    <span className="flex items-center gap-1 font-bold text-zinc-700 text-[11px] sm:text-xs">
                      <Users className="w-3.5 h-3.5 text-orange-600" />
                      <span className="hidden md:inline">Nhân viên</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openLoginModal('admin')}
                      className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                      title="Nhập mật khẩu để mở quyền Chủ Tiệm"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Mở Admin</span>
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Online / Offline Badge */}
            {isOnline ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <Wifi className="w-3 h-3" />
                <span className="hidden lg:inline">Online</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Modal Đăng Nhập / Mở Khóa Quyền */}
      <LoginModal />
    </>
  );
}
