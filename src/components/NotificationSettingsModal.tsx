'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  X, Bell, Send, CheckCircle2, AlertCircle, Smartphone, HelpCircle,
  Sparkles, Database, Trash2, RefreshCw, Radio, Check, ShieldCheck,
  History, Clock, CheckCheck, ExternalLink, Cake, Flame, Inbox, Package,
  AlertTriangle, MessageSquare, Settings, ArrowLeft
} from 'lucide-react';
import {
  getTelegramConfig,
  fetchTelegramConfigFromDb,
  saveTelegramConfigToDb,
  deleteTelegramConfigFromDb,
  sendTelegramMessage,
  TelegramConfig,
} from '@/lib/utils/telegramNotify';
import {
  checkPushSubscriptionStatus,
  subscribeCurrentDeviceToPush,
  unsubscribeCurrentDeviceFromPush,
  triggerTestPush,
  isWebPushSupported,
  PushStatusInfo,
} from '@/lib/utils/webPushManager';
import { screenWakeLock } from '@/lib/utils/wakeLock';
import {
  getNotificationHistory,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotificationHistory,
  getUnreadNotificationCount,
  subscribeNotificationHistory,
  formatRelativeNotificationTime,
  NotificationLogItem,
} from '@/lib/utils/notificationHistory';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'history' | 'pwa' | 'telegram' | 'kiosk';
}

export default function NotificationSettingsModal({ isOpen, onClose, defaultTab }: Props) {
  // Tab: 'history' (Mới: Lịch sử xem lại) | 'pwa' | 'telegram' | 'kiosk'
  const [activeTab, setActiveTab] = useState<'history' | 'pwa' | 'telegram' | 'kiosk'>(defaultTab || 'history');

  // Lịch sử thông báo states
  const [historyList, setHistoryList] = useState<NotificationLogItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'unread' | 'orders' | 'kitchen' | 'urgent' | 'push_tele'>('all');
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Telegram states
  const [config, setConfig] = useState<TelegramConfig>({ enabled: false, botToken: '', chatId: '' });
  const [isTestingTele, setIsTestingTele] = useState(false);
  const [isSavingTele, setIsSavingTele] = useState(false);
  const [isLoadingTeleFromDb, setIsLoadingTeleFromDb] = useState(false);
  const [teleTestResult, setTeleTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [teleSavedSuccess, setTeleSavedSuccess] = useState(false);

  // PWA Push states
  const [pushStatus, setPushStatus] = useState<PushStatusInfo>({
    isSupported: true,
    permission: 'default',
    isSubscribed: false,
    totalDevices: 0,
  });
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [isPushTesting, setIsPushTesting] = useState(false);
  const [pushActionResult, setPushActionResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Kiosk WakeLock state
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  // Load status on modal open
  useEffect(() => {
    if (isOpen) {
      if (defaultTab) {
        setActiveTab(defaultTab);
      }

      // 1. Tải Lịch Sử Thông Báo
      const refreshHistory = () => {
        setHistoryList(getNotificationHistory());
        setUnreadCount(getUnreadNotificationCount());
      };
      refreshHistory();
      const unsubNotif = subscribeNotificationHistory(refreshHistory);

      // 2. Tải Telegram
      setConfig(getTelegramConfig());
      setTeleTestResult(null);
      setTeleSavedSuccess(false);
      setIsLoadingTeleFromDb(true);
      fetchTelegramConfigFromDb()
        .then((dbCfg) => {
          if (dbCfg) setConfig(dbCfg);
        })
        .finally(() => setIsLoadingTeleFromDb(false));

      // 3. Tải PWA Web Push status
      refreshPushStatus();

      return () => {
        unsubNotif();
      };
    }
  }, [isOpen, defaultTab]);

  // Thống kê số lượng từng danh mục
  const counts = useMemo(() => {
    const unread = historyList.filter((n) => !n.isRead).length;
    const orders = historyList.filter((n) => n.type === 'new_order' || !!n.orderNumber).length;
    const kitchen = historyList.filter(
      (n) =>
        n.type === 'bake_start' ||
        n.type === 'bake_done' ||
        n.type === 'bake_discharge' ||
        (n.sender && (n.sender.includes('Lò') || n.sender.includes('Bếp')))
    ).length;
    const urgent = historyList.filter((n) => n.type === 'urgent_alert').length;
    const pushTele = historyList.filter((n) => n.type === 'telegram' || n.type === 'pwa' || n.type === 'test').length;
    return { unread, orders, kitchen, urgent, pushTele };
  }, [historyList]);

  // Lọc danh sách theo tab con
  const filteredHistory = useMemo(() => {
    return historyList.filter((item) => {
      if (historyFilter === 'unread') return !item.isRead;
      if (historyFilter === 'orders') return item.type === 'new_order' || !!item.orderNumber;
      if (historyFilter === 'kitchen') {
        return (
          item.type === 'bake_start' ||
          item.type === 'bake_done' ||
          item.type === 'bake_discharge' ||
          (item.sender && (item.sender.includes('Lò') || item.sender.includes('Bếp')))
        );
      }
      if (historyFilter === 'urgent') return item.type === 'urgent_alert';
      if (historyFilter === 'push_tele') return item.type === 'telegram' || item.type === 'pwa' || item.type === 'test';
      return true;
    });
  }, [historyList, historyFilter]);

  const refreshPushStatus = async () => {
    setIsPushLoading(true);
    try {
      const status = await checkPushSubscriptionStatus();
      setPushStatus(status);
    } catch (err) {
      console.warn('Lỗi load push status:', err);
    } finally {
      setIsPushLoading(false);
    }
  };

  if (!isOpen) return null;

  // ── XỬ LÝ PWA WEB PUSH ──
  const handleSubscribePWA = async () => {
    setIsPushLoading(true);
    setPushActionResult(null);
    const res = await subscribeCurrentDeviceToPush();
    setIsPushLoading(false);

    if (res.success) {
      setPushActionResult({ success: true, msg: res.message });
      await refreshPushStatus();
    } else {
      setPushActionResult({ success: false, msg: res.message });
    }
  };

  const handleUnsubscribePWA = async () => {
    if (!confirm('Bạn có chắc muốn hủy nhận thông báo PWA trên thiết bị này?')) return;
    setIsPushLoading(true);
    setPushActionResult(null);
    const res = await unsubscribeCurrentDeviceFromPush();
    setIsPushLoading(false);

    setPushActionResult({ success: res.success, msg: res.message });
    await refreshPushStatus();
  };

  const handleTestPWAPush = async () => {
    setIsPushTesting(true);
    setPushActionResult(null);
    const res = await triggerTestPush();
    setIsPushTesting(false);

    if (res.success) {
      setPushActionResult({
        success: true,
        msg: `✅ Đã gửi lệnh thông báo! Hãy vuốt xem thanh thông báo hoặc khóa màn hình để kiểm tra nhé! (${res.stats?.sentCount || 0} thiết bị đã nhận)`,
      });
    } else {
      setPushActionResult({
        success: false,
        msg: res.message || 'Chưa gửi được thông báo. Hãy đảm bảo bạn đã bấm "Bật Thông Báo" trước!',
      });
    }
  };

  // ── XỬ LÝ TELEGRAM ──
  const handleSaveTele = async () => {
    setIsSavingTele(true);
    setTeleTestResult(null);
    const res = await saveTelegramConfigToDb(config, 'admin');
    setIsSavingTele(false);

    if (res.success) {
      setTeleSavedSuccess(true);
      setTimeout(() => setTeleSavedSuccess(false), 4000);
    } else {
      setTeleTestResult({ success: false, msg: res.error || 'Lỗi khi lưu lên cơ sở dữ liệu SQL' });
    }
  };

  const handleDeleteOldTele = async () => {
    if (!confirm('Bạn có chắc muốn XÓA MÃ CŨ trên cơ sở dữ liệu SQL không?\nTất cả thiết bị sẽ tự động đồng bộ và xóa cấu hình bot cũ này.')) {
      return;
    }

    setIsSavingTele(true);
    setTeleTestResult(null);
    const res = await deleteTelegramConfigFromDb('admin');
    setIsSavingTele(false);

    if (res.success) {
      setConfig({ enabled: false, botToken: '', chatId: '' });
      setTeleTestResult({ success: true, msg: 'Đã xóa mã bot cũ trên SQL và đồng bộ xóa khỏi mọi thiết bị!' });
    } else {
      setTeleTestResult({ success: false, msg: res.error || 'Lỗi khi xóa mã cũ trên SQL' });
    }
  };

  const handleTestTelegram = async () => {
    if (!config.botToken || !config.chatId) {
      setTeleTestResult({ success: false, msg: 'Vui lòng nhập đầy đủ Bot Token và Chat ID!' });
      return;
    }
    setIsTestingTele(true);
    setTeleTestResult(null);

    const testText = `🎂 <b>TIỆM BÁNH ABC: KIỂM TRA KẾT NỐI</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ <i>Chúc mừng! Điện thoại của bạn đã kết nối nhận thông báo đơn hàng & lò nướng thành công!</i>\n\n` +
      `📱 <b>Ngay cả khi bạn TẮT ỨNG DỤNG, KHÓA MÀN HÌNH HOẶC ĐÚT TÚI QUẦN</b>, chuông vẫn reo đầy đủ!\n` +
      `⏰ Thời gian: ${new Date().toLocaleTimeString('vi-VN')} ngày ${new Date().toLocaleDateString('vi-VN')}`;

    const res = await sendTelegramMessage(testText, { ...config, enabled: true });
    setIsTestingTele(false);
    if (res.success) {
      setTeleTestResult({ success: true, msg: 'Đã gửi thành công! Hãy kiểm tra điện thoại của bạn ngay!' });
      await saveTelegramConfigToDb({ ...config, enabled: true }, 'admin');
      setConfig((prev) => ({ ...prev, enabled: true }));
    } else {
      setTeleTestResult({ success: false, msg: res.error || 'Gửi thất bại, vui lòng kiểm tra lại Bot Token hoặc Chat ID' });
    }
  };

  return (
    <div className="fixed inset-0 z-[10000000] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#fbf7f2] border border-amber-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header - Thiết kế gọn gàng, có nút chuyển đổi Cài Đặt Nhận Báo riêng để tiết kiệm không gian */}
        <div className="flex items-center justify-between p-3.5 sm:p-5 bg-gradient-to-r from-amber-600 via-amber-700 to-orange-600 text-white shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-md shrink-0">
              {activeTab === 'history' ? (
                <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              ) : (
                <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-spin-slow" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h3 className="text-sm sm:text-base font-black tracking-tight">
                  {activeTab === 'history' ? 'Lịch Sử Thông Báo' : 'Cài Đặt Cách Nhận Báo'}
                </h3>
                {activeTab === 'history' && counts.unread > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                    {counts.unread} mới
                  </span>
                )}
              </div>
              <p className="text-[11px] text-amber-100 font-medium line-clamp-1 hidden sm:block">
                {activeTab === 'history'
                  ? 'Tra cứu toàn bộ thông báo đơn hàng, nướng mẻ & xuất xưởng'
                  : 'Cấu hình Bot Telegram, PWA Web Push & Giữ sáng màn hình'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Nút bấm chuyển đổi riêng biệt: Khi xem Lịch sử thì có nút 'Cài Đặt Báo', khi ở Cài đặt thì có nút 'Xem Lịch Sử' */}
            {activeTab === 'history' ? (
              <button
                type="button"
                onClick={() => setActiveTab('telegram')}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs border border-white/25"
                title="Cài đặt kênh nhận thông báo (Telegram Bot, PWA, Âm báo)"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Cài Đặt Báo</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 text-white text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs border border-white/25"
                title="Quay lại danh sách lịch sử thông báo"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Xem Lịch Sử</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              title="Đóng"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Thanh chọn kênh cài đặt: CHỈ HIỆN KHI Ở CHẾ ĐỘ CÀI ĐẶT (Tiết kiệm 100% không gian khi đang xem Lịch sử) */}
        {activeTab !== 'history' && (
          <div className="grid grid-cols-3 gap-1.5 p-2 bg-amber-100/70 border-b border-amber-200/80 shrink-0">
            {/* Kênh 1: Telegram */}
            <button
              type="button"
              onClick={() => setActiveTab('telegram')}
              className={`py-2 px-1.5 sm:px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'telegram'
                  ? 'bg-sky-600 text-white shadow-xs font-black'
                  : 'text-sky-950 hover:bg-sky-100/60 bg-white/50 border border-sky-200/60'
              }`}
            >
              <Send className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Telegram Bot</span>
              {config.enabled && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 ring-1 ring-white" />
              )}
            </button>

            {/* Kênh 2: PWA */}
            <button
              type="button"
              onClick={() => setActiveTab('pwa')}
              className={`py-2 px-1.5 sm:px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'pwa'
                  ? 'bg-amber-700 text-white shadow-xs font-black'
                  : 'text-zinc-700 hover:bg-amber-200/60 bg-white/50 border border-amber-200/50'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">PWA Trực Tiếp</span>
            </button>

            {/* Kênh 3: Kiosk Sáng */}
            <button
              type="button"
              onClick={() => setActiveTab('kiosk')}
              className={`py-2 px-1.5 sm:px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'kiosk'
                  ? 'bg-amber-800 text-white shadow-xs font-black'
                  : 'text-zinc-700 hover:bg-amber-200/60 bg-white/50 border border-amber-200/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Màn Hình Sáng</span>
            </button>
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-sm flex-1">
          {/* ════════ TAB 0: LỊCH SỬ THÔNG BÁO (NOTIFICATION LOG) ════════ */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {/* Thanh bộ lọc và thao tác nhanh: TINH GỌN, 1 HÀNG CUỘN NGANG ÊM ÁI */}
              <div className="bg-white rounded-2xl p-2.5 sm:p-3 border border-amber-200/80 shadow-xs space-y-2">
                {/* 1. Dải nút lọc cuộn ngang êm ái (Single-row Horizontal Scrollable Pills) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer shrink-0 ${
                      historyFilter === 'all'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200/60'
                    }`}
                  >
                    Tất cả ({historyList.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setHistoryFilter('unread')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      historyFilter === 'unread'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 text-rose-800 hover:bg-rose-100 border border-rose-200/60'
                    }`}
                  >
                    <span>Chưa đọc</span>
                    {counts.unread > 0 && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        historyFilter === 'unread' ? 'bg-white/30 text-white' : 'bg-rose-600 text-white'
                      }`}>
                        {counts.unread}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setHistoryFilter('orders')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      historyFilter === 'orders'
                        ? 'bg-pink-600 text-white shadow-xs'
                        : 'bg-pink-50 text-pink-800 hover:bg-pink-100 border border-pink-200/60'
                    }`}
                  >
                    <span>🎂 Đơn Hàng</span>
                    <span className="text-[10px] opacity-80">({counts.orders})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHistoryFilter('kitchen')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      historyFilter === 'kitchen'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-orange-50 text-orange-800 hover:bg-orange-100 border border-orange-200/60'
                    }`}
                  >
                    <span>🔥 Bếp & Lò</span>
                    <span className="text-[10px] opacity-80">({counts.kitchen})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHistoryFilter('urgent')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      historyFilter === 'urgent'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200/60'
                    }`}
                  >
                    <span>🚨 Đơn Gấp</span>
                    <span className="text-[10px] opacity-80">({counts.urgent})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHistoryFilter('push_tele')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      historyFilter === 'push_tele'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200/60'
                    }`}
                  >
                    <span>📱 Push & Bot</span>
                    <span className="text-[10px] opacity-80">({counts.pushTele})</span>
                  </button>
                </div>

                {/* 2. Dòng thao tác nhanh & trạng thái siêu gọn gàng */}
                <div className="flex items-center justify-between pt-1.5 border-t border-stone-100 text-xs">
                  <div className="text-[11px] text-zinc-500 font-medium">
                    {historyFilter === 'unread' ? (
                      <span className="text-rose-600 font-bold">Có {counts.unread} thông báo chưa xem</span>
                    ) : historyFilter === 'urgent' ? (
                      <span className="text-red-600 font-bold">{counts.urgent} cảnh báo khẩn cấp</span>
                    ) : (
                      <span>Hiển thị <b>{filteredHistory.length}</b> thông báo</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {counts.unread > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllAsRead()}
                        className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300/80 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs"
                        title="Đánh dấu toàn bộ thông báo là đã xem"
                      >
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Đã xem tất cả</span>
                      </button>
                    )}

                    {historyList.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('Bạn có chắc muốn xóa toàn bộ lịch sử thông báo không?')) {
                            clearNotificationHistory();
                          }
                        }}
                        className="p-1 px-2 rounded-lg bg-zinc-50 hover:bg-rose-50 text-zinc-500 hover:text-rose-700 border border-zinc-200 hover:border-rose-300 text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer active:scale-95"
                        title="Xóa toàn bộ danh sách lịch sử"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Xóa</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Danh sách thẻ thông báo (Tăng không gian cuộn) */}
              <div className="space-y-2.5 max-h-[58vh] sm:max-h-[62vh] overflow-y-auto pr-1">
                {filteredHistory.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-amber-200 space-y-2">
                    <Inbox className="w-12 h-12 text-amber-300 mx-auto" />
                    <p className="font-bold text-amber-950 text-sm">Không có thông báo nào trong danh mục này</p>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                      Khi có đơn đặt hàng mới, đơn cần làm gấp, hoặc khi lò nướng báo bánh chín ra lò, mọi thông báo sẽ tự động được lưu và hiển thị tại đây.
                    </p>
                  </div>
                ) : (
                  filteredHistory.map((item) => {
                    // Phân loại Icon & Màu nhận diện
                    let icon = <Bell className="w-4 h-4" />;
                    let iconBg = 'bg-amber-100 text-amber-800';
                    let tagText = 'Thông báo';
                    let tagBg = 'bg-amber-100 text-amber-900 border-amber-300';

                    if (item.type === 'new_order') {
                      icon = <Cake className="w-4 h-4" />;
                      iconBg = 'bg-pink-100 text-pink-700';
                      tagText = 'Đơn Mới';
                      tagBg = 'bg-pink-100 text-pink-800 border-pink-300';
                    } else if (item.type === 'bake_start') {
                      icon = <Flame className="w-4 h-4" />;
                      iconBg = 'bg-orange-100 text-orange-700';
                      tagText = 'Bắt Đầu Nướng';
                      tagBg = 'bg-orange-100 text-orange-800 border-orange-300';
                    } else if (item.type === 'bake_done') {
                      icon = <Sparkles className="w-4 h-4" />;
                      iconBg = 'bg-amber-100 text-amber-800';
                      tagText = 'Bánh Đã Chín Ra Lò';
                      tagBg = 'bg-amber-100 text-amber-900 border-amber-300';
                    } else if (item.type === 'bake_discharge') {
                      icon = <CheckCircle2 className="w-4 h-4" />;
                      iconBg = 'bg-emerald-100 text-emerald-700';
                      tagText = 'Đã Ra Lò';
                      tagBg = 'bg-emerald-100 text-emerald-800 border-emerald-300';
                    } else if (item.type === 'urgent_alert') {
                      icon = <AlertCircle className="w-4 h-4" />;
                      iconBg = 'bg-rose-100 text-rose-700 animate-pulse';
                      tagText = 'Báo Động Gấp';
                      tagBg = 'bg-rose-100 text-rose-800 border-rose-300';
                    } else if (item.type === 'telegram') {
                      icon = <Send className="w-4 h-4" />;
                      iconBg = 'bg-sky-100 text-sky-700';
                      tagText = 'Telegram Bot';
                      tagBg = 'bg-sky-100 text-sky-800 border-sky-300';
                    } else if (item.type === 'pwa' || item.type === 'test') {
                      icon = <Smartphone className="w-4 h-4" />;
                      iconBg = 'bg-indigo-100 text-indigo-700';
                      tagText = item.type === 'test' ? 'Thử Nghiệm' : 'PWA Push';
                      tagBg = 'bg-indigo-100 text-indigo-800 border-indigo-300';
                    }

                    return (
                      <div
                        key={item.id}
                        className={`p-3 sm:p-3.5 rounded-2xl border transition-all duration-200 relative flex gap-3 items-start ${
                          item.isRead
                            ? 'bg-white/70 border-amber-200/60 opacity-80 hover:opacity-100'
                            : 'bg-white border-amber-300 shadow-xs border-l-4 border-l-amber-600'
                        }`}
                      >
                        {/* Icon đại diện */}
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold shadow-2xs ${iconBg}`}>
                          {icon}
                        </div>

                        {/* Thân thông báo */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${tagBg}`}>
                                {tagText}
                              </span>
                              {item.channel && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium">
                                  {item.channel === 'pwa' ? '📱 PWA' : item.channel === 'telegram' ? '✈️ Bot' : '🔔 Ứng Dụng'}
                                </span>
                              )}
                              {!item.isRead && (
                                <span className="flex items-center gap-1 text-[10px] font-black text-rose-600">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                  Chưa xem
                                </span>
                              )}
                            </div>

                            {/* Mốc thời gian */}
                            <div className="text-[11px] text-zinc-400 font-medium flex items-center gap-1" title={item.createdAtFormatted}>
                              <Clock className="w-3 h-3" />
                              <span>{formatRelativeNotificationTime(item.timestamp)}</span>
                              <span className="hidden sm:inline">({item.createdAtFormatted.split(' ')[0]})</span>
                            </div>
                          </div>

                          {/* Tiêu đề */}
                          <h4 className={`text-xs sm:text-sm font-bold leading-snug ${item.isRead ? 'text-zinc-800' : 'text-zinc-950 font-black'}`}>
                            {item.title}
                          </h4>

                          {/* Nội dung thông báo */}
                          <p className="text-xs text-zinc-600 leading-relaxed break-words whitespace-pre-line">
                            {item.message}
                          </p>

                          {/* Chi tiết phụ: Người gửi / Mã đơn / Ghi chú */}
                          {(item.extraDetails || item.sender || item.orderNumber) && (
                            <div className="pt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                              {item.sender && (
                                <span className="bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/50 text-amber-900 font-semibold">
                                  👤 {item.sender}
                                </span>
                              )}
                              {item.orderNumber && (
                                <span className="bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60 text-blue-900 font-black">
                                  #{item.orderNumber}
                                </span>
                              )}
                              {item.extraDetails && (
                                <span className="italic text-zinc-500 truncate max-w-xs">
                                  {item.extraDetails}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Hàng nút bấm xem chi tiết / đổi trạng thái */}
                          <div className="pt-2 flex items-center justify-between border-t border-zinc-100 mt-2">
                            <div className="flex items-center gap-2">
                              {item.url && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    markAsRead(item.id);
                                    onClose();
                                    if (typeof window !== 'undefined' && item.url) {
                                      window.location.href = item.url;
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Xem chi tiết</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (item.isRead) {
                                    const current = getNotificationHistory();
                                    const updated = current.map((n) => (n.id === item.id ? { ...n, isRead: false } : n));
                                    try {
                                      localStorage.setItem('bakery_notification_history', JSON.stringify(updated));
                                      window.dispatchEvent(new CustomEvent('bakery_notif_history_change'));
                                    } catch {}
                                  } else {
                                    markAsRead(item.id);
                                  }
                                }}
                                className="px-2 py-0.5 rounded text-[11px] font-medium text-zinc-500 hover:text-zinc-800 transition cursor-pointer"
                              >
                                {item.isRead ? 'Đánh dấu chưa đọc' : 'Đã xem'}
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => deleteNotification(item.id)}
                              className="p-1 rounded text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                              title="Xóa thông báo này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ════════ TAB 1: PWA WEB PUSH TRỰC TIẾP ════════ */}
          {activeTab === 'pwa' && (
            <div className="space-y-4">
              {/* Thẻ trạng thái kết nối */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-amber-200 shadow-xs space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black shadow-xs ${
                      pushStatus.isSubscribed ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                    }`}>
                      <Radio className="w-5 h-5 animate-pulse" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-zinc-950 text-sm sm:text-base">
                          Thông Báo Đẩy PWA (W3C Web Push)
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Thông báo trực tiếp từ biểu tượng Tiệm Bánh ra màn hình khóa điện thoại
                      </p>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-black shrink-0 flex items-center gap-1.5 ${
                    pushStatus.isSubscribed
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-zinc-100 text-zinc-600 border border-zinc-300'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${pushStatus.isSubscribed ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`}></span>
                    {pushStatus.isSubscribed ? 'Đã Kết Nối' : 'Chưa Bật'}
                  </span>
                </div>

                {/* Thông tin số lượng thiết bị */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-amber-50/70 p-3 rounded-xl border border-amber-200">
                  <div>
                    <span className="text-zinc-500 block text-[11px]">Thiết bị này:</span>
                    <span className="font-black text-zinc-800">
                      {pushStatus.isSubscribed ? '✅ Đang nhận chuông' : '⚪ Chưa đăng ký'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[11px]">Tổng máy trong tiệm:</span>
                    <span className="font-black text-amber-700 text-sm">
                      {pushStatus.totalDevices} thiết bị đang nhận
                    </span>
                  </div>
                </div>

                {/* Các nút bấm thao tác PWA */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  {!pushStatus.isSubscribed ? (
                    <button
                      type="button"
                      onClick={handleSubscribePWA}
                      disabled={isPushLoading}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
                    >
                      <Bell className={`w-4 h-4 ${isPushLoading ? 'animate-spin' : 'animate-bounce'}`} />
                      <span>{isPushLoading ? 'Đang kích hoạt...' : '🔔 Bật Thông Báo Trực Tiếp Cho Máy Này'}</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleTestPWAPush}
                        disabled={isPushTesting}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
                      >
                        <Radio className={`w-4 h-4 ${isPushTesting ? 'animate-spin' : ''}`} />
                        <span>{isPushTesting ? 'Đang phát sóng...' : '🚀 Bấm Thử Gửi Thông Báo Ra MH Khóa'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleUnsubscribePWA}
                        disabled={isPushLoading}
                        className="py-2.5 px-3 rounded-xl bg-zinc-100 hover:bg-rose-50 text-zinc-600 hover:text-rose-700 border border-zinc-200 hover:border-rose-200 text-xs font-bold transition cursor-pointer"
                      >
                        Hủy nhận
                      </button>
                    </>
                  )}
                </div>

                {/* Kết quả thao tác PWA */}
                {pushActionResult && (
                  <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                    pushActionResult.success
                      ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                      : 'bg-rose-50 text-rose-900 border border-rose-200'
                  }`}>
                    {pushActionResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span className="leading-relaxed">{pushActionResult.msg}</span>
                  </div>
                )}
              </div>

              {/* Hướng dẫn cài đặt PWA theo hệ điều hành */}
              <div className="bg-white rounded-2xl p-4 sm:p-5 border border-amber-200 shadow-xs space-y-3">
                <h4 className="font-black text-amber-950 text-sm flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-amber-600" />
                  Hướng Dẫn Cài Đặt Lên Điện Thoại Để Nhận Chuông Khi Khóa Máy:
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1.5">
                    <span className="font-bold text-amber-900 block flex items-center gap-1.5">
                      🍎 Trên iPhone (Bắt buộc dùng Safari):
                    </span>
                    <p className="text-[11px] text-zinc-700 leading-relaxed">
                      1. Mở trang web bằng trình duyệt <b>Safari</b>.<br />
                      2. Bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên hất lên ở dưới cùng màn hình).<br />
                      3. Chọn dòng: <b>"Thêm vào Màn hình chính" (Add to Home Screen)</b>.<br />
                      4. Thoát ra mở <b>icon Tiệm Bánh</b> vừa tạo ngoài màn hình chính ➔ Bấm nút <b>"Bật Thông Báo"</b> ở trên.
                    </p>
                    <span className="text-[10px] text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded font-medium block">
                      * Yêu cầu iOS 16.4 trở lên theo quy chuẩn Apple.
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                    <span className="font-bold text-zinc-800 block flex items-center gap-1.5">
                      🤖 Trên Android (Chrome):
                    </span>
                    <p className="text-[11px] text-zinc-700 leading-relaxed">
                      1. Mở trình duyệt <b>Chrome</b>.<br />
                      2. Bấm menu <b>3 chấm góc trên bên phải</b>.<br />
                      3. Chọn dòng: <b>"Cài đặt ứng dụng"</b> hoặc <b>"Thêm vào MH chính"</b>.<br />
                      4. Mở app từ màn hình chính và bấm nút <b>"Bật Thông Báo"</b> ở trên.<br />
                      5. Vào Cài đặt máy ➔ Pin ➔ Tiệm Bánh ➔ Chọn <i>"Không giới hạn"</i>.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-sky-50 text-sky-950 border border-sky-200 text-xs flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed text-[11px]">
                    <b>Bảo mật tuyệt đối:</b> Hệ thống sử dụng cặp khóa mã hóa VAPID tiêu chuẩn quốc tế. Thông báo được gửi thẳng qua hạ tầng APNs của Apple và FCM của Google, không chia sẻ bất kỳ thông tin nào cho bên thứ ba.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ════════ TAB 2: TELEGRAM BOT ════════ */}
          {activeTab === 'telegram' && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-amber-200/80 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-500 text-white flex items-center justify-center font-black shadow-xs">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-amber-950 text-sm sm:text-base">Thông Báo Qua Telegram</span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">Dự phòng</span>
                    </div>
                    <p className="text-[11px] text-zinc-500">Gửi tin nhắn chi tiết tới cá nhân hoặc nhóm thợ bánh</p>
                  </div>
                </div>

                {/* Toggle Enable */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* Input Token & Chat ID */}
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    1. Telegram Bot Token:
                  </label>
                  <input
                    type="text"
                    value={config.botToken}
                    onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                    placeholder="Ví dụ: 7891234567:AAHxyz... (Lấy từ @BotFather)"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    2. Telegram Chat ID:
                  </label>
                  <input
                    type="text"
                    value={config.chatId}
                    onChange={(e) => setConfig({ ...config, chatId: e.target.value })}
                    placeholder="Ví dụ: 123456789 (Lấy từ @userinfobot hoặc ID nhóm)"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                {/* Hướng dẫn 3 bước lấy Bot Telegram */}
                <div className="p-3 rounded-xl bg-sky-50/80 border border-sky-200 text-xs text-sky-950 space-y-1">
                  <p className="font-bold flex items-center gap-1 text-sky-800">
                    <HelpCircle className="w-3.5 h-3.5 text-sky-600" />
                    Cách tạo Telegram nhận thông báo miễn phí trong 1 phút:
                  </p>
                  <ol className="list-decimal pl-4 space-y-0.5 text-[11px] text-sky-900">
                    <li>Mở Telegram, tìm <b>@BotFather</b> và gửi lệnh <code>/newbot</code> để lấy <b>Token</b>.</li>
                    <li>Tìm <b>@userinfobot</b> và bấm Start để lấy <b>Chat ID</b> của bạn (hoặc thêm bot vào Nhóm thợ bánh).</li>
                    <li>Nhắn 1 tin nhắn bất kỳ cho Bot của bạn (ví dụ: "xin chao") để mở quyền nhận tin.</li>
                  </ol>
                </div>

                {/* Trạng thái đồng bộ SQL */}
                <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50/80 border border-amber-200 text-xs">
                  <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                    <Database className="w-3.5 h-3.5 text-amber-600" />
                    <span>Đồng bộ SQL Đa Thiết Bị:</span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                    {isLoadingTeleFromDb ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                        <span>Đang nạp từ SQL...</span>
                      </>
                    ) : (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Đã kết nối SQL</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Nút Kiểm tra kết nối & Lưu SQL & Xóa mã cũ */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={isTestingTele || isSavingTele}
                    className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className={`w-3.5 h-3.5 ${isTestingTele ? 'animate-spin' : ''}`} />
                    <span>{isTestingTele ? 'Đang gửi...' : '🔔 Bấm Thử Gửi Tin Nhắn'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveTele}
                    disabled={isSavingTele}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSavingTele ? 'animate-spin' : ''}`} />
                    <span>{isSavingTele ? 'Đang lưu SQL...' : 'Lưu & Đồng Bộ SQL'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteOldTele}
                    disabled={isSavingTele}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                    title="Xóa bản ghi bot cũ trên SQL và xóa trên mọi thiết bị"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    <span>Xóa Mã Cũ</span>
                  </button>
                </div>

                {/* Kết quả Test */}
                {teleTestResult && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    teleTestResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}>
                    {teleTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                    <span>{teleTestResult.msg}</span>
                  </div>
                )}

                {teleSavedSuccess && (
                  <div className="p-2.5 rounded-xl text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Đã lưu vào cơ sở dữ liệu SQL và đồng bộ tức thì tới toàn bộ thiết bị đang sử dụng!</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════ TAB 3: MÀN HÌNH SÁNG (KIOSK MODE) ════════ */}
          {activeTab === 'kiosk' && (
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-amber-200/80 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-amber-950 text-sm sm:text-base">Giữ Màn Hình Luôn Sáng (Kiosk Mode)</span>
                    </div>
                    <p className="text-[11px] text-zinc-500">Đặt điện thoại / iPad ở quầy bán bánh hoặc bếp, màn hình không bao giờ tự tắt</p>
                  </div>
                </div>

                {/* Toggle WakeLock */}
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isWakeLockActive}
                    onChange={async (e) => {
                      if (e.target.checked) {
                        const ok = await screenWakeLock.requestWakeLock();
                        setIsWakeLockActive(ok);
                        if (!ok) alert('Trình duyệt trên máy này chưa hỗ trợ tính năng Giữ Màn Hình Sáng.');
                      } else {
                        screenWakeLock.releaseWakeLock();
                        setIsWakeLockActive(false);
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>
              <p className="text-[11px] text-zinc-600 bg-amber-50/70 p-2.5 rounded-xl border border-amber-200/60 leading-relaxed">
                💡 <b>Mẹo cho tiệm bánh:</b> Bật chế độ này khi cắm sạc điện thoại hoặc máy tính bảng đặt tại quầy/bếp. Màn hình sẽ luôn mở, chuông báo Đing-Đoong và danh sách đơn mới sẽ luôn sẵn sàng 24/7 mà không sợ máy rơi vào chế độ ngủ!
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-zinc-100 border-t border-amber-200/80 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-zinc-500 font-medium">Hệ thống bảo mật & kết nối mã hóa W3C</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-bold transition cursor-pointer"
          >
            Đóng Cửa Sổ
          </button>
        </div>
      </div>
    </div>
  );
}
