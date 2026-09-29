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
import { getStoreBranding, DEFAULT_BRANDING, fetchStoreBrandingFromDb, BRANDING_UPDATED_EVENT, StoreBrandingConfig } from '@/lib/utils/storeBranding';
import { offlineSyncWorker } from '@/lib/supabase/offlineSyncWorker';

export default function Header() {
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [isNotifSettingsOpen, setIsNotifSettingsOpen] = useState(false);
  const [notifModalTab, setNotifModalTab] = useState<'history' | 'pwa' | 'telegram' | 'kiosk'>('history');
  const [unreadNotifs, setUnreadNotifs] = useState<number>(0);
  const [pendingOfflineCount, setPendingOfflineCount] = useState<number>(0);
  const [isFlushingQueue, setIsFlushingQueue] = useState<boolean>(false);
  const [branding, setBranding] = useState<StoreBrandingConfig>(DEFAULT_BRANDING);
  const { user, isAdmin, isKitchen, isCashier, canAccessKitchen, canAccessAdmin, logout, openLoginModal } = useAuth();

  useEffect(() => {
    setBranding(getStoreBranding());
    fetchStoreBrandingFromDb().then((b) => {
      if (b) setBranding(b);
    });
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
      offlineSyncWorker.start();

      // Đếm và cập nhật số đơn chờ đẩy offline
      offlineSyncWorker.getPendingOrdersCount().then(setPendingOfflineCount);
      const handleOfflineQueue = (e: any) => {
        if (typeof e?.detail?.count === 'number') {
          setPendingOfflineCount(e.detail.count);
        } else {
          offlineSyncWorker.getPendingOrdersCount().then(setPendingOfflineCount);
        }
      };
      window.addEventListener('bakery_offline_queue_changed', handleOfflineQueue);
      window.addEventListener('bakery_orders_updated', handleOfflineQueue);

      // Lắng nghe số thông báo chưa đọc
      const updateUnread = () => {
        setUnreadNotifs(getUnreadNotificationCount());
      };
      updateUnread();
      const unsubHistory = subscribeNotificationHistory(updateUnread);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('bakery_offline_queue_changed', handleOfflineQueue);
        window.removeEventListener('bakery_orders_updated', handleOfflineQueue);
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
        <div className="max-w-7xl mx-auto px-1.5 sm:px-6 flex items-center justify-between h-14 sm:h-16 w-full gap-1 sm:gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1 sm:gap-3 font-bold text-lg text-amber-950 group shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-orange-400 flex items-center justify-center text-white shadow-md shadow-amber-500/25 group-hover:scale-105 transition-all shrink-0 overflow-hidden">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.storeName} className="w-full h-full object-cover rounded-lg sm:rounded-xl" />
              ) : (
                <Cake className="w-4 h-4 sm:w-5 sm:h-5 drop-shadow-xs" />
              )}
            </div>
            <div className="shrink-0 flex flex-col justify-center max-w-[70px] xs:max-w-[100px] sm:max-w-xs">
              <span className="block text-[11px] sm:text-base font-black tracking-tight text-amber-950 whitespace-nowrap leading-tight truncate uppercase">
                {branding.storeName || 'TIỆM BÁNH ABC'}
              </span>
              <span className="hidden sm:block text-[10px] sm:text-[11px] font-bold text-amber-600 tracking-wide uppercase mt-0.5 whitespace-nowrap truncate">
                {branding.slogan || 'Artisan Bakery & POS'}
              </span>
            </div>
          </Link>

          {/* Navigation Tabs - Modern Segmented Pills */}
          <nav className="flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 bg-[#ebe0d3]/70 rounded-xl sm:rounded-2xl border border-amber-200/40 shrink-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);

              // 1. Chưa đăng nhập bất kỳ tài khoản nào: Khóa tất cả
              if (mounted && !user) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => openLoginModal(item.requiresAdmin ? 'admin' : (item.href === '/kitchen' ? 'kitchen' : 'cashier'))}
                    title="Vui lòng đăng nhập tài khoản để vào màn hình này"
                    className="flex items-center justify-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold text-zinc-400 hover:text-amber-800 hover:bg-white/80 transition cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="hidden sm:inline">{item.label}</span>
                    <span className="text-[10px] bg-zinc-200/80 text-zinc-600 px-1.5 py-0.2 rounded font-mono hidden sm:inline">Khóa</span>
                  </button>
                );
              }

              // 2. Tài khoản Bán Hàng (Cashier) bấm vào Bếp: Khóa bảo mật
              if (mounted && item.href === '/kitchen' && !canAccessKitchen) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => openLoginModal('kitchen')}
                    title="Khu vực Bếp dành cho Thợ Bếp & Chủ Tiệm (Bấm để đăng nhập)"
                    className="flex items-center justify-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold text-zinc-400 hover:text-orange-800 hover:bg-white/80 transition cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-orange-400" />
                    <span className="hidden sm:inline">{item.label}</span>
                    <span className="text-[10px] bg-orange-100 text-orange-700 font-bold px-1.5 py-0.2 rounded hidden sm:inline">Khóa</span>
                  </button>
                );
              }

              // 3. Tài khoản không có quyền Quản trị bấm vào Quản trị: Khóa bảo mật
              if (mounted && item.requiresAdmin && !canAccessAdmin) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => openLoginModal('admin')}
                    title="Khu vực dành riêng cho Quản Trị & Chủ Tiệm (Bấm để đăng nhập)"
                    className="flex items-center justify-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-xs font-bold text-zinc-400 hover:text-amber-800 hover:bg-white/80 transition cursor-pointer"
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
                  className={`flex items-center justify-center gap-1 sm:gap-2 p-1.5 sm:px-4 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 ${
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
                {!user ? (
                  // Chưa đăng nhập
                  <div className="flex items-center gap-1 bg-zinc-100 p-1 sm:pl-2 rounded-xl border border-zinc-200 text-xs shadow-2xs">
                    <span className="hidden md:flex items-center gap-1 font-bold text-zinc-500 text-[11px] sm:text-xs">
                      <Lock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>Chưa đăng nhập</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openLoginModal('staff')}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black flex items-center gap-1 shadow-2xs transition cursor-pointer"
                      title="Bấm để đăng nhập nhân viên hoặc quản trị"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Đăng Nhập</span>
                    </button>
                  </div>
                ) : (
                  // Đã đăng nhập tài khoản
                  <div className="flex items-center gap-0.5 sm:gap-2 bg-stone-100/90 p-0.5 sm:py-1.5 sm:px-3 rounded-xl border border-stone-200 text-xs shadow-2xs shrink-0">
                    <span className="flex items-center gap-1 sm:gap-1.5 font-bold text-zinc-800 text-[11px] sm:text-sm shrink-0 pl-0.5">
                      {isAdmin ? (
                        <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 shrink-0" />
                      ) : user.role === 'manager' ? (
                        <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600 shrink-0" />
                      ) : isKitchen ? (
                        <ChefHat className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600 shrink-0" />
                      ) : (
                        <ShoppingBag className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                      )}
                      
                      {/* 1. CHỈ TRÊN ĐIỆN THOẠI (sm:hidden): Dải chữ tên tài khoản chạy ngang kiểu banner thông báo */}
                      <div 
                        className="sm:hidden w-[48px] xs:w-[65px] overflow-hidden relative shrink-0 select-none cursor-help"
                        title={`Tài khoản: ${user?.name || 'Người dùng'} (@${user?.username || ''})`}
                      >
                        {/* Mờ viền 2 bên kiểu ticker banner */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-r from-stone-100/90 to-transparent z-10 pointer-events-none" />
                        <div className="absolute right-0 top-0 bottom-0 w-1.5 bg-gradient-to-l from-stone-100/90 to-transparent z-10 pointer-events-none" />

                        {/* Banner chạy ngang */}
                        <div className="animate-marquee-banner inline-flex items-center gap-2">
                          <span className="text-[11px] font-bold text-zinc-800 whitespace-nowrap">
                            {user?.name || 'Người dùng'}
                          </span>
                          <span className="text-[8px] text-amber-500 font-bold opacity-70 shrink-0">•</span>
                          <span className="text-[11px] font-bold text-zinc-800 whitespace-nowrap" aria-hidden="true">
                            {user?.name || 'Người dùng'}
                          </span>
                          <span className="text-[8px] text-amber-500 font-bold opacity-70 shrink-0" aria-hidden="true">•</span>
                        </div>
                      </div>

                      {/* 2. TRÊN MÁY TÍNH & TABLET (sm:inline-flex): Hiển thị tên đầy đủ, cỡ chữ chuẩn to rõ */}
                      <span 
                        className="hidden sm:inline-block max-w-[140px] md:max-w-[220px] lg:max-w-[300px] truncate text-xs sm:text-sm font-bold text-zinc-800"
                        title={`Tài khoản: ${user?.name || 'Người dùng'} (@${user?.username || ''})`}
                      >
                        {user?.name || 'Người dùng'}
                      </span>

                      {user.role === 'manager' && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold hidden sm:inline shrink-0">Quản Lý</span>
                      )}
                      {isAdmin && (
                        <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold hidden sm:inline shrink-0">Chủ Tiệm</span>
                      )}
                    </span>
                    {!isAdmin && (
                      <button
                        type="button"
                        onClick={() => openLoginModal('admin')}
                        className="w-6 h-6 sm:w-auto sm:h-auto p-1 sm:px-2.5 sm:py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 shadow-2xs transition cursor-pointer shrink-0"
                        title="Nhập mật khẩu để mở quyền Chủ Tiệm"
                      >
                        <KeyRound className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                        <span className="hidden sm:inline">Mở Admin</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={logout}
                      title="Đăng xuất khỏi ca làm"
                      className="w-6 h-6 sm:w-auto sm:h-auto p-1 sm:px-2 sm:py-1 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-600 text-[10px] sm:text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
                    >
                      <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-zinc-500 shrink-0" />
                      <span className="hidden sm:inline">Thoát</span>
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Offline Sync Queue & Live Sync Badge */}
            {pendingOfflineCount > 0 ? (
              <div className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-black bg-amber-100/90 text-amber-900 border border-amber-300 shadow-2xs shrink-0">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                <span>{pendingOfflineCount}<span className="hidden sm:inline"> đơn chờ đẩy</span></span>
                <button
                  type="button"
                  disabled={isFlushingQueue}
                  onClick={async () => {
                    setIsFlushingQueue(true);
                    try {
                      await offlineSyncWorker.flushPendingOrders();
                      const c = await offlineSyncWorker.getPendingOrdersCount();
                      setPendingOfflineCount(c);
                    } finally {
                      setIsFlushingQueue(false);
                    }
                  }}
                  className="px-1.5 py-0.5 rounded bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-[9px] sm:text-[10px] font-black cursor-pointer shadow-2xs transition shrink-0"
                  title="Bấm để đẩy ngay các đơn hàng offline lên Supabase SQL"
                >
                  {isFlushingQueue ? '...' : 'Đẩy'}
                </button>
              </div>
            ) : isOnline ? (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="hidden lg:inline">Live Sync</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs shrink-0">
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
                className={`relative flex items-center justify-center w-7 h-7 sm:w-auto sm:h-auto p-1 sm:px-2.5 sm:py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer shrink-0 ${
                  unreadNotifs > 0
                    ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-pink-600 text-white border-transparent shadow-xs ring-2 ring-rose-300/40 hover:scale-105'
                    : notifPermission === 'granted'
                    ? 'bg-amber-50/90 text-amber-900 border-amber-300 hover:bg-amber-100 shadow-2xs'
                    : 'bg-gradient-to-r from-rose-500 to-pink-500 text-white border-transparent shadow-xs animate-pulse hover:scale-105'
                }`}
                title="Bấm để xem lịch sử thông báo hoặc cài đặt báo chuông khi tắt màn hình"
              >
                <div className="relative flex items-center justify-center">
                  <Bell className={`w-3.5 h-3.5 ${unreadNotifs > 0 ? 'text-white animate-bounce' : notifPermission === 'granted' ? 'text-amber-700' : 'text-white animate-bounce'}`} />
                  {unreadNotifs > 0 ? (
                    <span className="sm:hidden absolute -top-1.5 -right-2 px-1 min-w-[13px] h-[13px] rounded-full bg-rose-600 text-white text-[8px] font-black flex items-center justify-center shadow-xs">
                      {unreadNotifs > 99 ? '99+' : unreadNotifs}
                    </span>
                  ) : notifPermission === 'granted' ? (
                    <span className="sm:hidden absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
                  ) : null}
                </div>
                <span className="hidden sm:inline">
                  {unreadNotifs > 0 ? 'Thông Báo' : notifPermission === 'granted' ? 'Báo Đơn' : 'Bật Báo'}
                </span>
                {unreadNotifs > 0 ? (
                  <span className="px-1.5 py-0.2 rounded-full bg-white text-rose-700 text-[10px] font-black shadow-2xs hidden sm:inline">
                    {unreadNotifs}
                  </span>
                ) : notifPermission === 'granted' ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 hidden sm:inline" />
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
