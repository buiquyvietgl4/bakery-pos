'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { soundManager } from '@/lib/utils/audioAlert';
import {
  subscribeCrossDeviceSync,
  broadcastTransferApprovalResolved,
  fetchPendingTransfersFromDb,
  removePendingTransferFromDb,
  TransferApprovalPayload,
  ReturnApprovalPayload,
  ReturnApprovalResolvedPayload,
  broadcastReturnApprovalResolved,
  fetchPendingReturnsFromDb,
  removePendingReturnFromDb,
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
  RotateCcw,
  ArrowRightLeft,
} from 'lucide-react';

const STORAGE_KEY_PENDING_TRANSFERS = 'bakery_pending_transfers';
const STORAGE_KEY_RESOLVED_TRANSFERS = 'bakery_resolved_transfers';
const STORAGE_KEY_PENDING_RETURNS = 'bakery_pending_returns';
const STORAGE_KEY_RESOLVED_RETURNS = 'bakery_resolved_returns';

function getStoredResolvedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESOLVED_TRANSFERS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function markOrderAsResolved(orderNumber: string) {
  if (typeof window === 'undefined' || !orderNumber) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESOLVED_TRANSFERS);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(orderNumber)) {
      arr.push(orderNumber);
      localStorage.setItem(STORAGE_KEY_RESOLVED_TRANSFERS, JSON.stringify(arr.slice(-150)));
    }
  } catch {}
}

export function getStoredPendingTransfers(): TransferApprovalPayload[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_TRANSFERS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const resolved = getStoredResolvedSet();
    return list.filter((item: any) => item && item.order_number && !resolved.has(item.order_number));
  } catch {
    return [];
  }
}

export function saveStoredPendingTransfers(list: TransferApprovalPayload[]) {
  if (typeof window === 'undefined') return;
  try {
    const resolved = getStoredResolvedSet();
    const cleanList = list.filter((item) => item && item.order_number && !resolved.has(item.order_number));
    localStorage.setItem(STORAGE_KEY_PENDING_TRANSFERS, JSON.stringify(cleanList));
  } catch {}
}

function getStoredResolvedReturnsSet(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESOLVED_RETURNS);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function markReturnAsResolved(orderNumber: string) {
  if (typeof window === 'undefined' || !orderNumber) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESOLVED_RETURNS);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    if (!arr.includes(orderNumber)) {
      arr.push(orderNumber);
      localStorage.setItem(STORAGE_KEY_RESOLVED_RETURNS, JSON.stringify(arr.slice(-150)));
    }
  } catch {}
}

export function getStoredPendingReturns(): ReturnApprovalPayload[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PENDING_RETURNS);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    const resolved = getStoredResolvedReturnsSet();
    return list.filter((item: any) => item && item.order_number && !resolved.has(item.order_number));
  } catch {
    return [];
  }
}

export function saveStoredPendingReturns(list: ReturnApprovalPayload[]) {
  if (typeof window === 'undefined') return;
  try {
    const resolved = getStoredResolvedReturnsSet();
    const cleanList = list.filter((item) => item && item.order_number && !resolved.has(item.order_number));
    localStorage.setItem(STORAGE_KEY_PENDING_RETURNS, JSON.stringify(cleanList));
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
  const dismissedOrderNumsRef = useRef<Set<string>>(new Set());
  const resolvedOrderNumsRef = useRef<Set<string>>(getStoredResolvedSet());

  // Trạng thái yêu cầu duyệt Đổi Trả / Hoàn Tiền
  const [pendingReturnList, setPendingReturnList] = useState<ReturnApprovalPayload[]>([]);
  const [activeReturnRequest, setActiveReturnRequest] = useState<ReturnApprovalPayload | null>(null);
  const notifiedReturnOrderNumsRef = useRef<Set<string>>(new Set());
  const dismissedReturnOrderNumsRef = useRef<Set<string>>(new Set());
  const resolvedReturnOrderNumsRef = useRef<Set<string>>(getStoredResolvedReturnsSet());

  // Xóa sạch query parameters trên thanh URL (ngăn trình duyệt refresh nạp lại đơn đã xử lý)
  const cleanUrlParams = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      let changed = false;
      ['approvalOrder', 'order_number', 'amount', 'customer', 'code', 'by'].forEach((k) => {
        if (url.searchParams.has(k)) {
          url.searchParams.delete(k);
          changed = true;
        }
      });
      if (changed) {
        const clean = url.pathname + (url.search ? url.search : '') + url.hash;
        window.history.replaceState({}, '', clean);
      }
    } catch {}
  }, []);

  // Đọc danh sách yêu cầu chờ duyệt đổi trả từ Local Storage & Database
  const loadPendingReturnsFromStorageAndDb = useCallback(async () => {
    resolvedReturnOrderNumsRef.current = getStoredResolvedReturnsSet();

    let list = getStoredPendingReturns().filter(
      (p) => !resolvedReturnOrderNumsRef.current.has(p.order_number) && !dismissedReturnOrderNumsRef.current.has(p.order_number)
    );

    try {
      const dbList = await fetchPendingReturnsFromDb();
      if (Array.isArray(dbList) && dbList.length > 0) {
        const mergedMap = new Map<string, ReturnApprovalPayload>();
        list.forEach((item) => mergedMap.set(item.order_number, item));
        dbList.forEach((item) => {
          if (item && item.order_number && !resolvedReturnOrderNumsRef.current.has(item.order_number) && !dismissedReturnOrderNumsRef.current.has(item.order_number)) {
            mergedMap.set(item.order_number, item);
          }
        });
        list = Array.from(mergedMap.values());
        saveStoredPendingReturns(list);
      }
    } catch {}

    setPendingReturnList(list);

    if (list.length > 0) {
      let targetOrder = activeReturnRequest && list.some((p) => p.order_number === activeReturnRequest.order_number) ? activeReturnRequest : list[0];
      if (targetOrder) {
        if (!notifiedReturnOrderNumsRef.current.has(targetOrder.order_number)) {
          notifiedReturnOrderNumsRef.current.add(targetOrder.order_number);
          if (isAdmin) {
            try {
              soundManager.playUrgentAlert();
            } catch {}
          }
        }
        setActiveReturnRequest(targetOrder);
      }
    } else {
      setActiveReturnRequest(null);
    }
  }, [activeReturnRequest, isAdmin]);

  // Đọc danh sách yêu cầu chờ duyệt từ Local Storage & Database
  const loadPendingFromStorageAndDb = useCallback(async () => {
    // Luôn nạp lại set đã duyệt
    resolvedOrderNumsRef.current = getStoredResolvedSet();

    // 1. Đọc từ Local Storage
    let list = getStoredPendingTransfers().filter(
      (p) => !resolvedOrderNumsRef.current.has(p.order_number) && !dismissedOrderNumsRef.current.has(p.order_number)
    );

    // 2. Kiểm tra nếu mở từ Deep Link URL Web Push (?approvalOrder=...)
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const approvalOrder = params.get('approvalOrder') || params.get('order_number');
        if (approvalOrder) {
          if (resolvedOrderNumsRef.current.has(approvalOrder) || dismissedOrderNumsRef.current.has(approvalOrder)) {
            cleanUrlParams();
          } else {
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
        }
      } catch {}
    }

    // 3. Đồng bộ thêm từ Database Supabase
    try {
      const dbList = await fetchPendingTransfersFromDb();
      if (Array.isArray(dbList) && dbList.length > 0) {
        const mergedMap = new Map<string, TransferApprovalPayload>();
        list.forEach((item) => mergedMap.set(item.order_number, item));
        dbList.forEach((item) => {
          if (item && item.order_number && !resolvedOrderNumsRef.current.has(item.order_number) && !dismissedOrderNumsRef.current.has(item.order_number)) {
            mergedMap.set(item.order_number, item);
          }
        });
        list = Array.from(mergedMap.values());
        saveStoredPendingTransfers(list);
      }
    } catch {}

    setPendingList(list);

    if (list.length > 0) {
      // Ưu tiên đơn chưa xử lý
      let targetOrder = activeRequest && list.some((p) => p.order_number === activeRequest.order_number) ? activeRequest : list[0];

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
      cleanUrlParams();
    }
  }, [activeRequest, isAdmin, cleanUrlParams]);

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
        if (resolvedOrderNumsRef.current.has(payload.order_number) || dismissedOrderNumsRef.current.has(payload.order_number)) {
          return;
        }

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
        const num = payload.order_number;
        markOrderAsResolved(num);
        resolvedOrderNumsRef.current.add(num);
        dismissedOrderNumsRef.current.add(num);
        cleanUrlParams();

        setPendingList((prev) => {
          const updated = prev.filter((p) => p.order_number !== num);
          saveStoredPendingTransfers(updated);
          return updated;
        });
        setActiveRequest((current) => (current?.order_number === num ? null : current));
      },
      onReturnApprovalRequest: (payload) => {
        if (!payload?.order_number) return;
        if (resolvedReturnOrderNumsRef.current.has(payload.order_number) || dismissedReturnOrderNumsRef.current.has(payload.order_number)) {
          return;
        }

        notifiedReturnOrderNumsRef.current.add(payload.order_number);

        setPendingReturnList((prev) => {
          const exists = prev.some((p) => p.order_number === payload.order_number);
          const updated = exists ? [payload, ...prev.filter(p => p.order_number !== payload.order_number)] : [payload, ...prev];
          saveStoredPendingReturns(updated);
          return updated;
        });

        setActiveReturnRequest(payload);

        if (isAdmin) {
          try {
            soundManager.playUrgentAlert();
          } catch {}
        }
      },
      onReturnApprovalResolved: (payload) => {
        if (!payload?.order_number) return;
        const num = payload.order_number;
        markReturnAsResolved(num);
        resolvedReturnOrderNumsRef.current.add(num);
        dismissedReturnOrderNumsRef.current.add(num);

        setPendingReturnList((prev) => {
          const updated = prev.filter((p) => p.order_number !== num);
          saveStoredPendingReturns(updated);
          return updated;
        });
        setActiveReturnRequest((current) => (current?.order_number === num ? null : current));
      },
    });

    const handleCustomEventReq = (e: any) => {
      if (e.detail?.order_number) {
        const payload: TransferApprovalPayload = e.detail;
        if (resolvedOrderNumsRef.current.has(payload.order_number) || dismissedOrderNumsRef.current.has(payload.order_number)) {
          return;
        }

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
        markOrderAsResolved(num);
        resolvedOrderNumsRef.current.add(num);
        dismissedOrderNumsRef.current.add(num);
        cleanUrlParams();

        setPendingList((prev) => {
          const updated = prev.filter((p) => p.order_number !== num);
          saveStoredPendingTransfers(updated);
          return updated;
        });
        setActiveRequest((current) => (current?.order_number === num ? null : current));
      }
    };

    const handleReturnCustomReq = (e: any) => {
      if (e.detail?.order_number) {
        const payload: ReturnApprovalPayload = e.detail;
        if (resolvedReturnOrderNumsRef.current.has(payload.order_number) || dismissedReturnOrderNumsRef.current.has(payload.order_number)) {
          return;
        }
        notifiedReturnOrderNumsRef.current.add(payload.order_number);
        setPendingReturnList((prev) => {
          const exists = prev.some((p) => p.order_number === payload.order_number);
          const updated = exists ? [payload, ...prev.filter(p => p.order_number !== payload.order_number)] : [payload, ...prev];
          saveStoredPendingReturns(updated);
          return updated;
        });
        setActiveReturnRequest(payload);
        if (isAdmin) {
          try {
            soundManager.playUrgentAlert();
          } catch {}
        }
      }
    };

    const handleReturnCustomRes = (e: any) => {
      if (e.detail?.order_number) {
        const num = e.detail.order_number;
        markReturnAsResolved(num);
        resolvedReturnOrderNumsRef.current.add(num);
        dismissedReturnOrderNumsRef.current.add(num);
        setPendingReturnList((prev) => {
          const updated = prev.filter((p) => p.order_number !== num);
          saveStoredPendingReturns(updated);
          return updated;
        });
        setActiveReturnRequest((current) => (current?.order_number === num ? null : current));
      }
    };

    window.addEventListener('transfer_approval_requested', handleCustomEventReq as EventListener);
    window.addEventListener('transfer_approval_resolved', handleCustomEventRes as EventListener);
    window.addEventListener('return_approval_requested', handleReturnCustomReq as EventListener);
    window.addEventListener('return_approval_resolved', handleReturnCustomRes as EventListener);

    // Nạp ban đầu danh sách đổi trả
    loadPendingReturnsFromStorageAndDb();

    // Quét định kỳ 15 giây để đồng bộ nhẹ nhàng, không gây lag hay giật
    const interval = setInterval(() => {
      loadPendingFromStorageAndDb();
      loadPendingReturnsFromStorageAndDb();
    }, 15000);

    return () => {
      unsubscribe();
      window.removeEventListener('transfer_approval_requested', handleCustomEventReq as EventListener);
      window.removeEventListener('transfer_approval_resolved', handleCustomEventRes as EventListener);
      window.removeEventListener('return_approval_requested', handleReturnCustomReq as EventListener);
      window.removeEventListener('return_approval_resolved', handleReturnCustomRes as EventListener);
      clearInterval(interval);
    };
  }, [isAdmin, loadPendingFromStorageAndDb, loadPendingReturnsFromStorageAndDb, cleanUrlParams]);

  // Hành động Admin: DUYỆT ĐỔI TRẢ
  const handleApproveReturn = async (req: ReturnApprovalPayload) => {
    setProcessing(true);
    try {
      const orderNo = req.order_number;
      markReturnAsResolved(orderNo);
      resolvedReturnOrderNumsRef.current.add(orderNo);
      dismissedReturnOrderNumsRef.current.add(orderNo);

      const remaining = pendingReturnList.filter((p) => p.order_number !== orderNo);
      setPendingReturnList(remaining);
      saveStoredPendingReturns(remaining);
      setActiveReturnRequest(remaining.length > 0 ? remaining[0] : null);

      removePendingReturnFromDb(orderNo).catch(console.error);

      const adminName = user?.name || 'Chủ Tiệm (Admin)';
      await broadcastReturnApprovalResolved({
        id: req.id,
        order_number: orderNo,
        action: 'approved',
        resolved_by: adminName,
        resolved_at: new Date().toISOString(),
      });

      try {
        soundManager.playPaymentSuccessChime();
      } catch {}
    } catch (err) {
      console.error('Lỗi khi duyệt đổi trả:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Hành động Admin: TỪ CHỐI ĐỔI TRẢ
  const handleRejectReturn = async (req: ReturnApprovalPayload) => {
    setProcessing(true);
    try {
      const orderNo = req.order_number;
      markReturnAsResolved(orderNo);
      resolvedReturnOrderNumsRef.current.add(orderNo);
      dismissedReturnOrderNumsRef.current.add(orderNo);

      const remaining = pendingReturnList.filter((p) => p.order_number !== orderNo);
      setPendingReturnList(remaining);
      saveStoredPendingReturns(remaining);
      setActiveReturnRequest(remaining.length > 0 ? remaining[0] : null);

      removePendingReturnFromDb(orderNo).catch(console.error);

      const adminName = user?.name || 'Chủ Tiệm (Admin)';
      await broadcastReturnApprovalResolved({
        id: req.id,
        order_number: orderNo,
        action: 'rejected',
        reason: 'Chủ tiệm từ chối yêu cầu đổi trả',
        resolved_by: adminName,
        resolved_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Lỗi khi từ chối đổi trả:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Hành động: XÁC NHẬN ĐÃ NHẬN TIỀN
  const handleApprove = async (req: TransferApprovalPayload) => {
    setProcessing(true);
    try {
      const orderNo = req.order_number;
      // 1. Ghi nhớ ngay là đã duyệt để không bao giờ lặp lại
      markOrderAsResolved(orderNo);
      resolvedOrderNumsRef.current.add(orderNo);
      dismissedOrderNumsRef.current.add(orderNo);

      // 2. Xóa sạch URL params
      cleanUrlParams();

      // 3. Xóa khỏi state và local storage ngay tức khắc
      const remaining = pendingList.filter((p) => p.order_number !== orderNo);
      setPendingList(remaining);
      saveStoredPendingTransfers(remaining);
      setActiveRequest(remaining.length > 0 ? remaining[0] : null);

      // 4. Xóa khỏi Supabase Database
      removePendingTransferFromDb(orderNo).catch(console.error);

      // 5. Phát sóng realtime về quầy thu ngân
      const adminName = user?.name || 'Chủ Tiệm (Admin)';
      await broadcastTransferApprovalResolved({
        order_number: orderNo,
        action: 'approved',
        amount: req.amount,
        resolved_by: adminName,
        resolved_at: new Date().toISOString(),
      });

      try {
        soundManager.playPaymentSuccessChime();
      } catch {}
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
      const orderNo = req.order_number;
      // 1. Ghi nhớ ngay là đã xử lý
      markOrderAsResolved(orderNo);
      resolvedOrderNumsRef.current.add(orderNo);
      dismissedOrderNumsRef.current.add(orderNo);

      // 2. Xóa sạch URL params
      cleanUrlParams();

      // 3. Xóa khỏi state và local storage
      const remaining = pendingList.filter((p) => p.order_number !== orderNo);
      setPendingList(remaining);
      saveStoredPendingTransfers(remaining);
      setActiveRequest(remaining.length > 0 ? remaining[0] : null);

      // 4. Xóa khỏi Database
      removePendingTransferFromDb(orderNo).catch(console.error);

      // 5. Phát sóng realtime
      const adminName = user?.name || 'Chủ Tiệm (Admin)';
      await broadcastTransferApprovalResolved({
        order_number: orderNo,
        action: 'rejected',
        amount: req.amount,
        reason: 'Chủ tiệm kiểm tra tài khoản chưa thấy nổi số dư',
        resolved_by: adminName,
        resolved_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Lỗi khi từ chối duyệt chuyển khoản:', err);
    } finally {
      setProcessing(false);
    }
  };

  // NẾU CHƯA ĐĂNG NHẬP ADMIN MÀ CÓ YÊU CẦU DUYỆT ĐANG CHỜ
  if (!isAdmin) {
    const returnReq = activeReturnRequest || pendingReturnList[0];
    if (returnReq && !resolvedReturnOrderNumsRef.current.has(returnReq.order_number) && !dismissedReturnOrderNumsRef.current.has(returnReq.order_number)) {
      return (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-[99999] w-[92%] max-w-md animate-in slide-in-from-top-4 duration-300">
          <div
            onClick={() => openLoginModal('admin')}
            className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 text-white shadow-2xl flex items-center justify-between gap-3 border-2 border-rose-300 cursor-pointer hover:scale-[1.02] active:scale-95 transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <RotateCcw className="w-6 h-6 animate-pulse text-white" />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-rose-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Yêu Cầu Duyệt Đổi Trả
                </div>
                <div className="text-xs font-black">
                  Đơn #{returnReq.order_number} • {returnReq.return_type === 'refund' ? `${(returnReq.refund_amount || 0).toLocaleString('vi-VN')}₫` : `Đổi bánh`}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl bg-white text-rose-900 font-black text-xs flex items-center gap-1 shadow-md shrink-0"
              >
                <KeyRound className="w-3.5 h-3.5 text-rose-700" />
                <span>Duyệt</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissedReturnOrderNumsRef.current.add(returnReq.order_number);
                  setActiveReturnRequest(null);
                  setPendingReturnList((prev) => prev.filter((p) => p.order_number !== returnReq.order_number));
                }}
                className="p-1 text-white/80 hover:text-white rounded-lg"
                title="Ẩn thông báo này"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (activeRequest || pendingList.length > 0) {
      const req = activeRequest || pendingList[0];
      if (req && !resolvedOrderNumsRef.current.has(req.order_number) && !dismissedOrderNumsRef.current.has(req.order_number)) {
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

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl bg-white text-amber-900 font-black text-xs flex items-center gap-1 shadow-md shrink-0"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                  <span>Duyệt</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissedOrderNumsRef.current.add(req.order_number);
                    cleanUrlParams();
                    setActiveRequest(null);
                    setPendingList((prev) => prev.filter((p) => p.order_number !== req.order_number));
                  }}
                  className="p-1 text-white/80 hover:text-white rounded-lg"
                  title="Ẩn thông báo này"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      }
    }
    return null;
  }

  // GIAO DIỆN KHI ĐÃ ĐĂNG NHẬP ADMIN
  return (
    <>
      {/* ── 1.0 MODAL DUYỆT ĐỔI TRẢ / HOÀN TIỀN DÀNH CHO ADMIN ── */}
      {activeReturnRequest && !resolvedReturnOrderNumsRef.current.has(activeReturnRequest.order_number) && !dismissedReturnOrderNumsRef.current.has(activeReturnRequest.order_number) && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl border-2 border-rose-500 max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 shadow-inner">
                  <RotateCcw className="w-6 h-6 animate-pulse" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                      Xác Thực Đổi Trả
                    </span>
                    <span className="text-xs text-zinc-400 font-mono">
                      {pendingReturnList.length > 1 && `(${pendingReturnList.length} yêu cầu đang chờ)`}
                    </span>
                  </div>
                  <h3 className="font-black text-base sm:text-lg text-zinc-900 mt-0.5">
                    {activeReturnRequest.return_type === 'refund' ? 'Duyệt Hoàn Tiền Cho Khách?' : 'Duyệt Đổi Bánh Đơn Hàng?'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (activeReturnRequest) {
                    dismissedReturnOrderNumsRef.current.add(activeReturnRequest.order_number);
                  }
                  const remaining = pendingReturnList.filter((p) => p.order_number !== activeReturnRequest?.order_number);
                  setPendingReturnList(remaining);
                  setActiveReturnRequest(null);
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
                title="Đóng cửa sổ này"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Thông tin chi tiết */}
            <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-200/80 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-600">Mã đơn hàng:</span>
                <span className="font-mono font-black text-rose-900 text-sm">
                  #{activeReturnRequest.order_number}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-600">Loại giao dịch:</span>
                <span className="font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-900 text-xs">
                  {activeReturnRequest.return_type === 'refund' ? 'Hoàn tiền trả hàng' : 'Đổi món bánh'}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-600">
                  {activeReturnRequest.return_type === 'refund'
                    ? 'Số tiền hoàn lại:'
                    : (activeReturnRequest.exchange_difference || 0) > 0
                    ? 'Khách đóng thêm:'
                    : (activeReturnRequest.exchange_difference || 0) < 0
                    ? 'Hoàn lại khách:'
                    : 'Chênh lệch:'}
                </span>
                <span className={`font-black text-lg sm:text-xl ${
                  activeReturnRequest.return_type === 'refund' || (activeReturnRequest.exchange_difference || 0) < 0
                    ? 'text-rose-600'
                    : (activeReturnRequest.exchange_difference || 0) > 0
                    ? 'text-emerald-600'
                    : 'text-zinc-700'
                }`}>
                  {activeReturnRequest.return_type === 'refund'
                    ? `${(activeReturnRequest.refund_amount || 0).toLocaleString('vi-VN')}₫`
                    : (activeReturnRequest.exchange_difference || 0) > 0
                    ? `+${(activeReturnRequest.exchange_difference || 0).toLocaleString('vi-VN')}₫`
                    : (activeReturnRequest.exchange_difference || 0) < 0
                    ? `-${(Math.abs(activeReturnRequest.exchange_difference || 0)).toLocaleString('vi-VN')}₫`
                    : '0₫ (Đổi ngang)'}
                </span>
              </div>

              <div className="pt-2 border-t border-rose-200/60 space-y-1.5 text-xs">
                <div>
                  <span className="text-zinc-500 font-medium">Món khách trả:</span>
                  <p className="font-bold text-zinc-900 mt-0.5">{activeReturnRequest.items_summary}</p>
                </div>
                {activeReturnRequest.exchange_summary && (
                  <div>
                    <span className="text-zinc-500 font-medium">Món đổi mới:</span>
                    <p className="font-bold text-amber-900 mt-0.5">{activeReturnRequest.exchange_summary}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center text-[11px] text-zinc-500 pt-1 border-t border-rose-200/60">
                <span>Thu ngân yêu cầu:</span>
                <span className="font-semibold text-zinc-700">{activeReturnRequest.cashier || 'Quầy thu ngân'}</span>
              </div>
            </div>

            {/* Nút thao tác: Duyệt hoặc Từ chối */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={processing}
                onClick={() => handleRejectReturn(activeReturnRequest)}
                className="py-3.5 px-4 rounded-2xl border-2 border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4 text-zinc-500" />
                <span>Từ Chối Duyệt</span>
              </button>

              <button
                type="button"
                disabled={processing}
                onClick={() => handleApproveReturn(activeReturnRequest)}
                className="py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 transition cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Phê Duyệt Đổi Trả</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 1. MODAL DUYỆT CHUYỂN KHOẢN NỔI BẬT DÀNH CHO ADMIN ── */}
      {activeRequest && !resolvedOrderNumsRef.current.has(activeRequest.order_number) && !dismissedOrderNumsRef.current.has(activeRequest.order_number) && (
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
                onClick={() => {
                  if (activeRequest) {
                    dismissedOrderNumsRef.current.add(activeRequest.order_number);
                  }
                  cleanUrlParams();
                  const remaining = pendingList.filter((p) => p.order_number !== activeRequest?.order_number);
                  setPendingList(remaining);
                  setActiveRequest(null);
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
                title="Đóng cửa sổ này"
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
