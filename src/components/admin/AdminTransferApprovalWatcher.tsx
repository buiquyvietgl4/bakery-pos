'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { soundManager } from '@/lib/utils/audioAlert';
import {
  subscribeCrossDeviceSync,
  broadcastTransferApprovalResolved,
  fetchPendingTransfersFromDb,
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
  KeyRound,
  Sparkles,
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
  const { isAdmin, user, openLoginModal } = useAuth();
  const [pendingList, setPendingList] = useState<TransferApprovalPayload[]>([]);
  const [activeRequest, setActiveRequest] = useState<TransferApprovalPayload | null>(null);
  const [processing, setProcessing] = useState(false);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [subscribingPush, setSubscribingPush] = useState(false);
  const notifiedOrderNumsRef = useRef<Set<string>>(new Set());

  // Đọc danh sách yêu cầu chờ duyệt từ Local Storage & Database
  const loadPendingFromStorageAndDb = useCallback(async () => {
    // 1. Đọc từ Local Storage
    let list = getStoredPendingTransfers();

    // 2. Đồng bộ thêm từ Database Supabase (phòng trường hợp điện thoại vừa mở sau khi tắt màn hình)
    try {
      const dbList = await fetchPendingTransfersFromDb();
      if (Array.isArray(dbList) && dbList.length > 0) {
        const mergedMap = new Map<string, TransferApprovalPayload>();
        list.forEach((item) => mergedMap.set(item.order_number, item));
        dbList.forEach((item) => mergedMap.set(item.order_number, item));
        list = Array.from(mergedMap.values());
        saveStoredPendingTransfers(list);
      }
    } catch {}

    // 3. Kiểm tra nếu mở từ Deep Link URL Web Push (?approvalOrder=...)
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const approvalOrder = params.get('approvalOrder') || params.get('order_number');
        if (approvalOrder) {
          const exists = list.find((p) => p.order_number === approvalOrder);
          if (!exists) {
            const urlItem: TransferApprovalPayload = {
              order_number: approvalOrder,
              amount: Number(params.get('amount')) || 0,
              customer_name: params.get('customer') || 'Khách thanh toán',
              transfer_code: params.get('code') || `DH ${approvalOrder}`,
              requested_by: params.get('by') || 'Thu ngân',
              requested_at: new Date().toISOString(),
            };
            list = [urlItem, ...list];
            saveStoredPendingTransfers(list);
          }
        }
      } catch {}
    }

    setPendingList(list);

    if (list.length > 0) {
      // Ưu tiên đơn mở từ Deep Link hoặc đơn chưa thông báo
      let targetOrder = activeRequest;
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlOrderNum = params.get('approvalOrder') || params.get('order_number');
        if (urlOrderNum) {
          targetOrder = list.find((item) => item.order_number === urlOrderNum) || list[0];
        }
      }

      if (!targetOrder) {
        const unnotified = list.find((item) => !notifiedOrderNumsRef.current.has(item.order_number));
        targetOrder = unnotified || list[0];
      }

      if (targetOrder) {
        if (!notifiedOrderNumsRef.current.has(targetOrder.order_number)) {
          notifiedOrderNumsRef.current.add(targetOrder.order_number);
          if (isAdmin) {
            try {
              soundManager.playUrgentAlert();
            } catch {}
          }
        }
        setActiveRequest(targetOrder);
      }
    } else {
      setActiveRequest(null);
    }
  }, [activeRequest, isAdmin]);

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

  // Khởi động lắng nghe sự kiện
  useEffect(() => {
    loadPendingFromStorageAndDb();

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

        if (isAdmin) {
          try {
            soundManager.playUrgentAlert();
          } catch {}
        }
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
        if (isAdmin) {
          try {
            soundManager.playUrgentAlert();
          } catch {}
        }
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
      loadPendingFromStorageAndDb();
    };

    window.addEventListener('transfer_approval_requested', handleCustomEventReq as EventListener);
    window.addEventListener('transfer_approval_resolved', handleCustomEventRes as EventListener);
    window.addEventListener('bakery_pending_transfers_updated', handleStorageUpdate);

    // Quét định kỳ 4 giây để đồng bộ và chống sót đơn khi điện thoại vừa mở lại
    const interval = setInterval(loadPendingFromStorageAndDb, 4000);

    return () => {
      unsubscribe();
      window.removeEventListener('transfer_approval_requested', handleCustomEventReq as EventListener);
      window.removeEventListener('transfer_approval_resolved', handleCustomEventRes as EventListener);
      window.removeEventListener('bakery_pending_transfers_updated', handleStorageUpdate);
      clearInterval(interval);
    };
  }, [isAdmin, loadPendingFromStorageAndDb]);

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

  // NẾU CHƯA ĐĂNG NHẬP ADMIN MÀ CÓ YÊU CẦU DUYỆT ĐANG CHỜ
  if (!isAdmin) {
    if (activeRequest || pendingList.length > 0) {
      const req = activeRequest || pendingList[0];
      return (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-[99999] w-[92%] max-w-md animate-in slide-in-from-top-4 duration-300">
          <div
            onClick={() => openLoginModal('admin')}
            className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white shadow-2xl flex items-center justify-between gap-3 border-2 border-amber-300 cursor-pointer hover:scale-[1.02] active:scale-95 transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6 animate-pulse text-white" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-amber-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Yêu Cầu Duyệt Tiền Về
                </div>
                <div className="text-xs font-black">
                  Đơn #{req.order_number} • {(req.amount || 0).toLocaleString('vi-VN')}₫
                </div>
              </div>
            </div>

            <button
              type="button"
              className="px-3 py-1.5 rounded-xl bg-white text-amber-900 font-black text-xs flex items-center gap-1 shadow-md shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-700" />
              <span>Duyệt Ngay</span>
            </button>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {/* ── 1. MODAL DUYỆT CHUYỂN KHOẢN NỔI BẬT DÀNH CHO ADMIN ── */}
      {activeRequest && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
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
                      {pendingList.length > 1 && `(${pendingList.length} yêu cầu đang chờ)`}
                    </span>
                  </div>
                  <h3 className="font-black text-base sm:text-lg text-zinc-900 mt-0.5">
                    Xác Nhận Tiền Chuyển Khoản Về?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveRequest(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
                title="Đóng tạm thời"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thẻ thông tin giao dịch cần đối soát */}
            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-600">Mã đơn hàng:</span>
                <span className="font-mono font-black text-amber-900 text-sm">
                  #{activeRequest.order_number}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-600">Số tiền khách chuyển:</span>
                <span className="font-black text-emerald-600 text-lg sm:text-xl">
                  {(activeRequest.amount || 0).toLocaleString('vi-VN')}₫
                </span>
              </div>

              {activeRequest.customer_name && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-600">Khách hàng:</span>
                  <span className="font-bold text-zinc-900">{activeRequest.customer_name}</span>
                </div>
              )}

              {activeRequest.transfer_code && (
                <div className="flex justify-between items-center text-xs pt-1 border-t border-amber-200/60">
                  <span className="text-zinc-600">Nội dung chuyển khoản:</span>
                  <span className="font-mono font-black text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {activeRequest.transfer_code}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center text-[11px] text-zinc-500 pt-1">
                <span>Người gửi yêu cầu:</span>
                <span className="font-semibold text-zinc-700">{activeRequest.requested_by || 'Thu ngân'}</span>
              </div>
            </div>

            {/* Hướng dẫn kiểm tra */}
            <p className="text-xs text-zinc-500 text-center italic">
              👉 Vui lòng mở <b>App Ngân hàng</b> trên điện thoại để kiểm tra số dư đã cộng <b>{(activeRequest.amount || 0).toLocaleString('vi-VN')}₫</b> với nội dung trên hay chưa.
            </p>

            {/* Nút thao tác: Duyệt hoặc Từ chối */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={processing}
                onClick={() => handleReject(activeRequest)}
                className="py-3.5 px-4 rounded-2xl border-2 border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>Chưa Thấy Tiền Về</span>
              </button>

              <button
                type="button"
                disabled={processing}
                onClick={() => handleApprove(activeRequest)}
                className="py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/30 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Đã Nhận Đủ Tiền</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. BANNER GỢI Ý BẬT WEB PUSH KHI KHÓA MÀN HÌNH NẾU CHƯA CẤP QUYỀN ── */}
      {showPushPrompt && (
        <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-4 sm:max-w-md z-40 bg-zinc-900 text-white p-3.5 rounded-2xl shadow-2xl border border-amber-500/50 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div className="text-xs">
              <p className="font-bold text-amber-300">Bật Thông Báo Khi Tắt Màn Hình</p>
              <p className="text-[11px] text-zinc-400">Để nhận chuông duyệt chuyển khoản ngay cả khi khóa máy.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={subscribingPush}
              onClick={handleEnablePush}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer transition shadow-xs disabled:opacity-50"
            >
              {subscribingPush ? 'Đang bật...' : 'Bật Ngay'}
            </button>
            <button
              type="button"
              onClick={() => setShowPushPrompt(false)}
              className="p-1 rounded-lg text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
