'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { soundManager } from '@/lib/utils/audioAlert';
import {
  subscribeCrossDeviceSync,
  broadcastTransferApprovalResolved,
  TransferApprovalPayload,
} from '@/lib/supabase/realtimeSync';
import {
  subscribeCurrentDeviceToPush,
  isWebPushSupported,
} from '@/lib/utils/webPushManager';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  X,
  Bell,
} from 'lucide-react';

const STORAGE_KEY_PENDING_TRANSFERS = 'bakery_pending_transfers';

export function getStoredPendingTransfers(): TransferApprovalPayload[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_TRANSFERS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveStoredPendingTransfers(list: TransferApprovalPayload[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_PENDING_TRANSFERS, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('bakery_pending_transfers_updated'));
  } catch {}
}

export default function AdminTransferApprovalWatcher() {
  const { isAdmin, user } = useAuth();
  const [pendingList, setPendingList] = useState<TransferApprovalPayload[]>([]);
  const [activeRequest, setActiveRequest] = useState<TransferApprovalPayload | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [subscribingPush, setSubscribingPush] = useState(false);
  const notifiedOrderNumsRef = useRef<Set<string>>(new Set());

  // Tự động kích hoạt Web Push nếu quyền đã được cấp trước đó
  useEffect(() => {
    if (!isAdmin) return;
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        subscribeCurrentDeviceToPush('Tài khoản Admin').catch(() => {});
      } else if (Notification.permission === 'default' && isWebPushSupported()) {
        setShowPushPrompt(true);
      }
    }
  }, [isAdmin]);

  const handleEnablePush = async () => {
    setSubscribingPush(true);
    try {
      const res = await subscribeCurrentDeviceToPush('Tài khoản Admin');
      if (res.success) {
        setShowPushPrompt(false);
        try {
          soundManager.playPaymentSuccessChime();
        } catch {}
        alert('🔔 ĐÃ BẬT THÔNG BÁO KHÓA MÀN HÌNH THÀNH CÔNG!\n\nKhi nhân viên thu ngân gửi duyệt chuyển khoản, điện thoại sẽ rung và đổ chuông ngay cả khi đang khóa màn hình.');
      } else {
        alert(`⚠️ ${res.message}`);
      }
    } finally {
      setSubscribingPush(false);
    }
  };

  // Đọc danh sách yêu cầu chờ duyệt từ Local Storage
  const loadPendingFromStorage = useCallback(() => {
    const list = getStoredPendingTransfers();
    setPendingList(list);

    if (list.length > 0) {
      // Tìm đơn đầu tiên chưa hiển thị để kích hoạt popup
      const unnotified = list.find((item) => !notifiedOrderNumsRef.current.has(item.order_number));
      if (unnotified) {
        notifiedOrderNumsRef.current.add(unnotified.order_number);
        setActiveRequest(unnotified);
        if (isAdmin) {
          try {
            soundManager.playUrgentAlert();
          } catch {}
        }
      } else if (!activeRequest) {
        setActiveRequest(list[0]);
      }
    } else {
      setActiveRequest(null);
    }
  }, [activeRequest, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;

    loadPendingFromStorage();

    const unsubscribe = subscribeCrossDeviceSync({
      onTransferApprovalRequest: (payload) => {
        if (!payload?.order_number) return;
        notifiedOrderNumsRef.current.add(payload.order_number);

        setPendingList((prev) => {
          const exists = prev.some((p) => p.order_number === payload.order_number);
          const updated = exists ? prev : [payload, ...prev];
          saveStoredPendingTransfers(updated);
          return updated;
        });

        setActiveRequest(payload);

        try {
          soundManager.playUrgentAlert();
        } catch {}
      },
      onTransferApprovalResolved: (payload) => {
        if (!payload?.order_number) return;
        setPendingList((prev) => {
          const updated = prev.filter((p) => p.order_number !== payload.order_number);
          saveStoredPendingTransfers(updated);
          return updated;
        });
        setActiveRequest((current) => (current?.order_number === payload.order_number ? null : current));
      },
    });

    const handleCustomEventReq = (e: any) => {
      if (e.detail?.order_number) {
        const payload: TransferApprovalPayload = e.detail;
        notifiedOrderNumsRef.current.add(payload.order_number);
        setPendingList((prev) => {
          const exists = prev.some((p) => p.order_number === payload.order_number);
          const updated = exists ? prev : [payload, ...prev];
          saveStoredPendingTransfers(updated);
          return updated;
        });
        setActiveRequest(payload);
        try {
          soundManager.playUrgentAlert();
        } catch {}
      }
    };

    const handleCustomEventRes = (e: any) => {
      if (e.detail?.order_number) {
        const num = e.detail.order_number;
        setPendingList((prev) => {
          const updated = prev.filter((p) => p.order_number !== num);
          saveStoredPendingTransfers(updated);
          return updated;
        });
        setActiveRequest((current) => (current?.order_number === num ? null : current));
      }
    };

    const handleStorageUpdate = () => {
      loadPendingFromStorage();
    };

    window.addEventListener('transfer_approval_requested', handleCustomEventReq as EventListener);
    window.addEventListener('transfer_approval_resolved', handleCustomEventRes as EventListener);
    window.addEventListener('bakery_pending_transfers_updated', handleStorageUpdate);

    // Quét định kỳ 5 giây để phòng sót đơn
    const interval = setInterval(loadPendingFromStorage, 5000);

    return () => {
      unsubscribe();
      window.removeEventListener('transfer_approval_requested', handleCustomEventReq as EventListener);
      window.removeEventListener('transfer_approval_resolved', handleCustomEventRes as EventListener);
      window.removeEventListener('bakery_pending_transfers_updated', handleStorageUpdate);
      clearInterval(interval);
    };
  }, [isAdmin, loadPendingFromStorage]);

  // Hành động: XÁC NHẬN ĐÃ NHẬN TIỀN
  const handleApprove = async (req: TransferApprovalPayload) => {
    setProcessing(true);
    try {
      const adminName = user?.name || 'Chủ Tiệm (Admin)';
      await broadcastTransferApprovalResolved({
        order_number: req.order_number,
        action: 'approved',
        amount: req.amount,
        resolved_by: adminName,
        resolved_at: new Date().toISOString(),
      });

      try {
        soundManager.playPaymentSuccessChime();
      } catch {}

      // Xóa khỏi danh sách chờ
      const remaining = pendingList.filter((p) => p.order_number !== req.order_number);
      setPendingList(remaining);
      saveStoredPendingTransfers(remaining);
      setActiveRequest(remaining.length > 0 ? remaining[0] : null);
    } catch (err) {
      console.error('Lỗi khi duyệt chuyển khoản:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Hành động: TỪ CHỐI / CHƯA THẤY TIỀN
  const handleReject = async (req: TransferApprovalPayload) => {
    setProcessing(true);
    try {
      const adminName = user?.name || 'Chủ Tiệm (Admin)';
      await broadcastTransferApprovalResolved({
        order_number: req.order_number,
        action: 'rejected',
        amount: req.amount,
        reason: 'Chủ tiệm kiểm tra tài khoản chưa thấy nổi số dư',
        resolved_by: adminName,
        resolved_at: new Date().toISOString(),
      });

      // Xóa khỏi danh sách chờ
      const remaining = pendingList.filter((p) => p.order_number !== req.order_number);
      setPendingList(remaining);
      saveStoredPendingTransfers(remaining);
      setActiveRequest(remaining.length > 0 ? remaining[0] : null);
    } catch (err) {
      console.error('Lỗi khi từ chối duyệt chuyển khoản:', err);
    } finally {
      setProcessing(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <>
      {/* ── 1. MODAL DUYỆT CHUYỂN KHOẢN NỔI BẬT DÀNH CHO ADMIN ── */}
      {activeRequest && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl border-2 border-amber-500 max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 shadow-inner">
                  <ShieldCheck className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      Xác Thực 2 Bước
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      {new Date(activeRequest.requested_at || Date.now()).toLocaleTimeString('vi-VN')}
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-zinc-900 leading-tight">
                    Yêu Cầu Xác Nhận Tiền Chuyển Khoản
                  </h3>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveRequest(null)}
                className="p-1 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
                title="Tạm thu nhỏ"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chi tiết giao dịch */}
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-500">Mã đơn hàng:</span>
                <span className="font-mono font-black text-sm text-zinc-900 bg-white px-2 py-0.5 rounded-lg border border-zinc-200">
                  #{activeRequest.order_number}
                </span>
              </div>

              <div className="flex justify-between items-baseline pt-1">
                <span className="text-xs font-bold text-zinc-500">Số tiền cần nhận:</span>
                <span className="font-black text-2xl text-emerald-600">
                  {Number(activeRequest.amount || 0).toLocaleString('vi-VN')}₫
                </span>
              </div>

              {activeRequest.transfer_code && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-medium">Cú pháp chuyển tiền:</span>
                  <span className="font-mono font-black text-amber-900 bg-amber-200/60 px-2 py-0.5 rounded">
                    {activeRequest.transfer_code}
                  </span>
                </div>
              )}

              {activeRequest.customer_name && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-500 font-medium">Khách hàng:</span>
                  <span className="font-bold text-zinc-800">{activeRequest.customer_name}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-xs text-zinc-500 border-t border-amber-200/60 pt-2">
                <span>Thu ngân gửi duyệt:</span>
                <span className="font-bold text-zinc-700">{activeRequest.requested_by || 'Thu ngân quầy POS'}</span>
              </div>
            </div>

            {/* Hướng dẫn cho Admin */}
            <p className="text-[11px] text-zinc-500 text-center italic">
              💡 Vui lòng kiểm tra ứng dụng ngân hàng trên điện thoại của bạn xem tiền đã vào tài khoản chưa trước khi bấm xác nhận.
            </p>

            {/* Nút hành động */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={processing}
                onClick={() => handleReject(activeRequest)}
                className="flex-1 py-3 rounded-2xl border border-rose-200 hover:bg-rose-50 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Chưa Nhận Được (Từ Chối)</span>
              </button>

              <button
                type="button"
                disabled={processing}
                onClick={() => handleApprove(activeRequest)}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Xác Nhận Đã Nhận Tiền</span>
              </button>
            </div>

            {/* Nếu còn nhiều yêu cầu khác trong hàng đợi */}
            {pendingList.length > 1 && (
              <div className="text-center pt-1 border-t border-zinc-100">
                <span className="text-[11px] font-bold text-amber-700">
                  Còn {pendingList.length - 1} yêu cầu khác đang chờ trong hàng đợi
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 2. NÚT HUY HIỆU NỔI GÓC DƯỚI (KHI THU NHỎ HOẶC ĐANG CÓ YÊU CẦU CHỜ) ── */}
      {pendingList.length > 0 && !activeRequest && (
        <div className="fixed bottom-6 right-6 z-[9990] animate-bounce">
          <button
            type="button"
            onClick={() => setActiveRequest(pendingList[0])}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xl shadow-amber-600/40 cursor-pointer transition"
          >
            <Bell className="w-4 h-4" />
            <span>Có {pendingList.length} yêu cầu duyệt CK</span>
            <span className="w-5 h-5 rounded-full bg-white text-amber-800 text-[10px] font-black flex items-center justify-center">
              {pendingList.length}
            </span>
          </button>
        </div>
      )}

      {/* ── 3. BANNER NHẮC BẬT THÔNG BÁO KHÓA MÀN HÌNH CHO ADMIN ── */}
      {showPushPrompt && (
        <div className="fixed top-3 right-3 z-[9995] max-w-sm w-[calc(100vw-24px)] animate-in slide-in-from-top duration-300">
          <div className="bg-amber-600 text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-amber-500">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-white animate-bounce" />
              </div>
              <div className="text-left min-w-0">
                <div className="text-xs font-black truncate">Bật Chuông Khi Khóa Màn Hình</div>
                <div className="text-[10px] text-amber-100 line-clamp-1">Nhận yêu cầu duyệt tiền cả khi tắt máy</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={subscribingPush}
                onClick={handleEnablePush}
                className="px-3 py-1.5 bg-white hover:bg-amber-50 active:bg-amber-100 text-amber-900 font-black text-xs rounded-xl shadow-xs cursor-pointer transition whitespace-nowrap"
              >
                {subscribingPush ? 'Đang bật...' : 'Bật Ngay'}
              </button>
              <button
                type="button"
                onClick={() => setShowPushPrompt(false)}
                className="p-1 text-white/75 hover:text-white rounded-lg cursor-pointer"
                title="Để sau"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
