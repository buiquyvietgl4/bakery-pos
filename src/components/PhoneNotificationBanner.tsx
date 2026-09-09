'use client';

import { useState, useEffect, useRef } from 'react';
import { Cake, Clock, X, Eye, Bell, ChevronRight, MessageSquare, AlertTriangle } from 'lucide-react';
import { PhoneNotificationPayload, phoneNotificationService } from '@/lib/utils/phoneNotification';

export default function PhoneNotificationBanner() {
  const [notification, setNotification] = useState<PhoneNotificationPayload | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const touchStartY = useRef<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startTimer = (delay = 8000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => setNotification(null), 300);
    }, delay);
  };

  const pauseTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  useEffect(() => {
    const handlePhoneBanner = (event: CustomEvent<PhoneNotificationPayload>) => {
      setIsVisible(false);
      setTimeout(() => {
        setNotification(event.detail);
        setIsVisible(true);
        startTimer(8000);
      }, 120);
    };

    window.addEventListener('phone_message_banner', handlePhoneBanner as EventListener);
    return () => {
      window.removeEventListener('phone_message_banner', handlePhoneBanner as EventListener);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const closeBanner = () => {
    setIsVisible(false);
    setTimeout(() => setNotification(null), 300);
  };

  // Hỗ trợ vuốt lên (Swipe Up) để đóng thông báo như trên điện thoại iPhone / Android
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (diff > 40) {
      closeBanner();
    }
  };

  if (!notification) return null;

  const isUrgent = notification.type === 'urgent_alert';

  return (
    <div
      role="alert"
      aria-live="assertive"
      onMouseEnter={pauseTimer}
      onMouseLeave={() => startTimer(4000)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`fixed top-3 sm:top-5 left-2.5 right-2.5 sm:left-auto sm:right-6 sm:w-[460px] z-[999999] transition-all duration-300 transform ${
        isVisible ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-8 opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <div
        style={{ backgroundColor: isUrgent ? '#1c1014' : '#16161a' }}
        className={`w-full rounded-[24px] p-4 text-white shadow-[0_25px_60px_-15px_rgba(0,0,0,0.95)] border transition-all duration-200 ${
          isUrgent
            ? 'bg-zinc-950 border-rose-500/70 ring-4 ring-rose-500/25'
            : 'bg-zinc-950 border-white/20 ring-1 ring-white/10'
        }`}
      >
        {/* Hàng 1: Tiêu đề App & Thời gian (Giống giao diện thông báo đẩy điện thoại) */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center text-white text-xs shadow-sm shrink-0 ${
                isUrgent
                  ? 'bg-gradient-to-tr from-rose-600 to-red-500'
                  : 'bg-gradient-to-tr from-amber-500 via-orange-500 to-rose-500'
              }`}
            >
              {isUrgent ? <AlertTriangle className="w-3.5 h-3.5" /> : <Cake className="w-3.5 h-3.5" />}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-zinc-300">
              <span>{notification.appTitle || 'TIỆM BÁNH HẠNH PHÚC'}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400 font-semibold normal-case">vừa xong</span>
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              closeBanner();
            }}
            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-zinc-300 hover:text-white transition cursor-pointer"
            title="Đóng thông báo"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Hàng 2: Nội dung tin nhắn (Giống tin nhắn Zalo / SMS) */}
        <div
          onClick={() => {
            if (notification.onAction) notification.onAction();
            closeBanner();
          }}
          className="pt-2.5 pb-1 space-y-1.5 cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <h4
              className={`text-sm font-extrabold flex items-center gap-1.5 ${
                isUrgent ? 'text-rose-400' : 'text-amber-300'
              }`}
            >
              <span>{notification.title}</span>
              {notification.orderNumber && (
                <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-white font-bold">
                  {notification.orderNumber}
                </span>
              )}
            </h4>
            {notification.pickupTime && (
              <span className="text-[11px] font-bold text-pink-300 flex items-center gap-1 bg-pink-950/60 px-2 py-0.5 rounded-full border border-pink-500/30">
                <Clock className="w-3 h-3" /> {notification.pickupTime}
              </span>
            )}
          </div>

          {notification.sender && (
            <div className="text-xs font-bold text-zinc-200">
              👤 {notification.sender}
            </div>
          )}

          <p className="text-xs text-zinc-300 font-medium leading-relaxed bg-white/5 p-2 rounded-xl border border-white/5">
            💬 {notification.message}
          </p>

          {notification.extraDetails && (
            <div className="text-[11px] text-amber-200/90 font-semibold italic truncate">
              ✍️ "{notification.extraDetails}"
            </div>
          )}
        </div>

        {/* Hàng 3: Các nút thao tác nhanh */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10 gap-2">
          <div className="text-[10px] text-zinc-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Chạm để mở • Vuốt lên để ẩn</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeBanner();
              }}
              className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              Bỏ qua
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (notification.onAction) notification.onAction();
                closeBanner();
              }}
              className={`px-3 py-1 rounded-xl text-xs font-black shadow-md flex items-center gap-1 transition active:scale-95 cursor-pointer ${
                isUrgent
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-zinc-950 font-black'
              }`}
            >
              <span>{notification.actionLabel || 'Xem Chi Tiết'}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Thanh gạt Home Indicator (Đặc trưng thông báo điện thoại iPhone/Android) */}
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mt-2" />
      </div>
    </div>
  );
}
