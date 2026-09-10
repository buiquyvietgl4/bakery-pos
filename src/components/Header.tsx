'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingBag, ChefHat, BarChart3, Wifi, WifiOff, Cake, Shield, Users, Lock, LogOut, KeyRound, Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import LoginModal from '@/components/LoginModal';
import NotificationSettingsModal from '@/components/NotificationSettingsModal';
import { phoneNotificationService } from '@/lib/utils/phoneNotification';
import { autoOrderWatcher } from '@/lib/supabase/autoOrderWatcher';
import { getUnreadNotificationCount, subscribeNotificationHistory } from '@/lib/utils/notificationHistory';
import { getStoreBranding, BRANDING_UPDATED_EVENT, StoreBrandingConfig } from '@/lib/utils/storeBranding';

export default function Header() {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [isNotifSettingsOpen, setIsNotifSettingsOpen] = useState(false);
  const [notifModalTab, setNotifModalTab] = useState<'history' | 'pwa' | 'telegram' | 'kiosk'>('history');
  const [unreadNotifs, setUnreadNotifs] = useState<number>(0);
  const [branding, setBranding] = useState<StoreBrandingConfig>(getStoreBranding());
  const { user, isAdmin, isStaff, logout, openLoginModal } = useAuth();

  useEffect(() => {
    setBranding(getStoreBranding());
    const handleBranding = (e: any) => {
      if (e.detail) setBranding(e.detail);
      else setBranding(getStoreBranding());
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, handleBranding);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, handleBranding);
  }, []);

  useEffect(() => {
    setMounted(true);
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      phoneNotificationService.initServiceWorker();
      setNotifPermission(phoneNotificationService.getPermission());
      localStorage.removeItem('bakery_auto_demo_enabled');
      autoOrderWatcher.start();

      // Lắng nghe số thông báo chưa đọc
      const updateUnread = () => {
        setUnreadNotifs(getUnreadNotificationCount());
      };
      updateUnread();
      const unsubHistory = subscribeNotificationHistory(updateUnread);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        unsubHistory();
      };
    }
  }, []);

  const navItems = [
    { href: '/pos', label: 'Bán hàng (POS)', icon: ShoppingBag, requiresAdmin: false },
    { href: '/kitchen', label: 'Bếp bánh (KDS)', icon: ChefHat, requiresAdmin: false },
    { href: '/admin', label: 'Quản trị & Kế toán', icon: BarChart3, requiresAdmin: true },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#fbf7f2]/95 backdrop-blur-xl border-b border-amber-200/50 shadow-xs w-full overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-2 sm:px-6 flex items-center justify-between h-16 w-full gap-1 sm:gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 sm:gap-3 font-bold text-lg text-amber-950 group shrink-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-orange-400 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 group-hover:scale-105 group-hover:shadow-amber-500/35 transition-all duration-300 shrink-0 overflow-hidden">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.storeName} className="w-full h-full object-contain p-0.5" />
              ) : (
                <Cake className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-xs" />
              )}
            </div>
            <div className="shrink-0 flex flex-col justify-center max-w-[170px] sm:max-w-xs">
              <span className="block text-xs sm:text-base font-black tracking-tight text-amber-950 whitespace-nowrap leading-tight truncate uppercase">
                {branding.storeName || 'TIỆM BÁNH ABC'}
              </span>
              <span className="hidden sm:block text-[10px] sm:text-[11px] font-bold text-amber-600 tracking-wide uppercase mt-0.5 whitespace-nowrap truncate">
                {branding.slogan || 'Artisan Bakery & POS'}
              </span>
            </div>
          </Link>

          {/* Navigation Tabs - Modern Segmented Pills */}
          <nav className="flex items-center gap-0.5 sm:gap-1 p-1 bg-[#ebe0d3]/70 rounded-2xl border border-amber-200/40 shrink-0">
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
                    className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl text-xs font-bold text-zinc-400 hover:text-amber-800 hover:bg-white/80 transition cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="hidden sm:inline">{item.label}</span>
                    <span className="text-[10px] bg-zinc-200/80 text-zinc-600 px-1.5 py-0.2 rounded font-mono hidden sm:inline">Khóa</span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 ${
                    isActive
                      ? 'bg-white text-amber-800 shadow-xs shadow-zinc-200'
                      : 'text-zinc-600 hover:text-amber-900 hover:bg-white/50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-amber-600' : 'text-zinc-400'}`} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Right side: Role Account Badge & Online Status */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {mounted && (
              <>
                {isAdmin ? (
                  // Đang là Admin
                  <div className="flex items-center gap-1 bg-amber-50/90 p-1 sm:pl-2.5 rounded-xl border border-amber-200/80 text-xs shadow-2xs">
                    <span className="flex items-center gap-1 font-black text-amber-900 text-[11px] sm:text-xs">
                      <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="hidden md:inline">Chủ Tiệm</span>
                    </span>
                    <button
                      type="button"
                      onClick={logout}
                      title="Khóa quyền Admin (Chuyển về quyền Nhân viên khi giao máy cho thu ngân)"
                      className="p-1 sm:px-2 sm:py-0.5 rounded-lg bg-white border border-amber-200/80 hover:bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <LogOut className="w-3 h-3 text-amber-700" />
                      <span className="hidden md:inline">Khóa Admin</span>
                    </button>
                  </div>
                ) : (
                  // Đang là Nhân viên
                  <div className="flex items-center gap-1 bg-stone-100/90 p-1 sm:pl-2 rounded-xl border border-stone-200 text-xs shadow-2xs">
                    <span className="hidden md:flex items-center gap-1 font-bold text-zinc-700 text-[11px] sm:text-xs">
                      <Users className="w-3.5 h-3.5 text-orange-600" />
                      <span>Nhân viên</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openLoginModal('admin')}
                      className="p-1.5 sm:px-2 sm:py-0.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                      title="Nhập mật khẩu để mở quyền Chủ Tiệm"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span className="hidden sm:inline">Mở Admin</span>
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Online / Offline Badge */}
            {isOnline ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="hidden lg:inline">Live Sync</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span className="hidden sm:inline">Offline</span>
              </span>
            )}

            {/* Nút Bật & Cài Đặt Thông Báo & Lịch Sử */}
            {mounted && notifPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={async () => {
                  if (notifPermission !== 'granted') {
                    await phoneNotificationService.requestPermission();
                    setNotifPermission(phoneNotificationService.getPermission());
                  }
                  setNotifModalTab('history');
                  setIsNotifSettingsOpen(true);
                }}
                className={`relative flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                  unreadNotifs > 0
                    ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-pink-600 text-white border-transparent shadow-xs ring-2 ring-rose-300/40 hover:scale-105'
                    : notifPermission === 'granted'
                    ? 'bg-amber-50/90 text-amber-900 border-amber-300 hover:bg-amber-100 shadow-2xs'
                    : 'bg-gradient-to-r from-rose-500 to-pink-500 text-white border-transparent shadow-xs animate-pulse hover:scale-105'
                }`}
                title="Bấm để xem lịch sử thông báo hoặc cài đặt báo chuông khi tắt màn hình"
              >
                <Bell className={`w-3.5 h-3.5 ${unreadNotifs > 0 ? 'text-white animate-bounce' : notifPermission === 'granted' ? 'text-amber-700' : 'text-white animate-bounce'}`} />
                <span className="hidden sm:inline">
                  {unreadNotifs > 0 ? 'Thông Báo' : notifPermission === 'granted' ? 'Báo Đơn' : 'Bật Báo'}
                </span>
                {unreadNotifs > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-white text-rose-700 text-[10px] font-black shadow-2xs">
                    {unreadNotifs}
                  </span>
                ) : notifPermission === 'granted' ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                ) : (
                  <span className="text-[10px] bg-white/20 px-1 rounded-sm sm:inline hidden">Bật</span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Modal Cài Đặt Báo Đơn & Xem Lịch Sử Thông Báo */}
      <NotificationSettingsModal
        isOpen={isNotifSettingsOpen}
        defaultTab={notifModalTab}
        onClose={() => setIsNotifSettingsOpen(false)}
      />

      {/* Modal Đăng Nhập / Mở Khóa Quyền */}
      <LoginModal />
    </>
  );
}
