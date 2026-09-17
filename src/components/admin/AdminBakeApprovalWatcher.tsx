'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { soundManager } from '@/lib/utils/audioAlert';
import { supabase } from '@/lib/supabase/client';
import { db } from '@/lib/db/dexie';
import { 
  subscribeCrossDeviceSync, 
  broadcastOrderStatusUpdate, 
  broadcastBakeApprovalResolved, 
  BakeApprovalPayload,
  parseOrderBakeShortage
} from '@/lib/supabase/realtimeSync';
import { 
  Bell, Shield, CheckCircle2, XCircle, X, Clock, Cake, 
  AlertTriangle, ChefHat, Sparkles 
} from 'lucide-react';

export default function AdminBakeApprovalWatcher() {
  const { isAdmin, user } = useAuth();
  const [pendingList, setPendingList] = useState<BakeApprovalPayload[]>([]);
  const [activeRequest, setActiveRequest] = useState<BakeApprovalPayload | null>(null);
  const [processing, setProcessing] = useState(false);
  const notifiedOrderNumsRef = useRef<Set<string>>(new Set());

  // Quét danh sách đơn hàng chờ Admin duyệt từ localStorage
  const scanPendingApprovalsFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('bakery_orders');
      if (!raw) return;
      const orders = JSON.parse(raw);
      if (!Array.isArray(orders)) return;

      const pendings: BakeApprovalPayload[] = [];
      orders.forEach((o: any) => {
        if (!o || o.status === 'completed' || o.status === 'cancelled') return;
        const isBakePending = Boolean(
          o.bake_approval_status === 'pending' || 
          o.notes?.includes('YÊU CẦU DUYỆT NƯỚNG XONG')
        );

        const shortage = parseOrderBakeShortage(o);
        const effectiveNeedBake = shortage.needBakeQty > 0 ? shortage.needBakeQty : Number(o.need_bake_qty || 0);

        if (isBakePending && effectiveNeedBake > 0) {
          const cakeName = o.cake_name || o.items?.[0]?.product_name_snapshot || 'Bánh sinh nhật';
          pendings.push({
            order_number: o.order_number,
            cake_name: cakeName,
            need_bake_qty: effectiveNeedBake,
            requested_by: o.bake_approval_requested_by || 'Thợ Bếp / Nhân Viên',
            requested_at: o.bake_approval_requested_at || o.updated_at || new Date().toISOString(),
            order_data: o,
          });
        }
      });

      setPendingList(pendings);

      // Nếu có đơn mới chưa hiển thị thì đưa lên làm activeRequest và phát âm thanh
      if (pendings.length > 0) {
        const unnotified = pendings.find((p) => !notifiedOrderNumsRef.current.has(p.order_number));
        if (unnotified) {
          notifiedOrderNumsRef.current.add(unnotified.order_number);
          setActiveRequest(unnotified);
          if (isAdmin) {
            try {
              soundManager.playUrgentAlert();
            } catch {}
          }
        } else if (!activeRequest) {
          setActiveRequest(pendings[0]);
        }
      } else {
        setActiveRequest(null);
      }
    } catch (err) {
      console.warn('Lỗi quét đơn chờ duyệt nướng xong:', err);
    }
  }, [activeRequest, isAdmin]);

  // Lắng nghe sự kiện thời gian thực từ Supabase Broadcast & Local Storage
  useEffect(() => {
    if (!isAdmin) return;

    scanPendingApprovalsFromStorage();

    const unsubscribe = subscribeCrossDeviceSync({
      onBakeApprovalRequest: (payload) => {
        if (!payload?.order_number) return;
        notifiedOrderNumsRef.current.add(payload.order_number);
        setPendingList((prev) => {
          const exists = prev.some((p) => p.order_number === payload.order_number);
          if (exists) return prev;
          return [payload, ...prev];
        });
        setActiveRequest(payload);
        try {
          soundManager.playUrgentAlert();
        } catch {}
      },
      onBakeApprovalResolved: (payload) => {
        if (!payload?.order_number) return;
        setPendingList((prev) => prev.filter((p) => p.order_number !== payload.order_number));
        setActiveRequest((current) => (current?.order_number === payload.order_number ? null : current));
      },
    });

    const handleLocalUpdate = () => {
      scanPendingApprovalsFromStorage();
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'bakery_orders') {
        scanPendingApprovalsFromStorage();
      }
    };

    const handleBakeReqEvent = (e: any) => {
      if (e.detail) {
        const payload = e.detail;
        notifiedOrderNumsRef.current.add(payload.order_number);
        setPendingList((prev) => {
          const exists = prev.some((p) => p.order_number === payload.order_number);
          if (exists) return prev;
          return [payload, ...prev];
        });
        setActiveRequest(payload);
        try {
          soundManager.playUrgentAlert();
        } catch {}
      }
    };

    const handleBakeResEvent = (e: any) => {
      if (e.detail?.order_number) {
        const num = e.detail.order_number;
        setPendingList((prev) => prev.filter((p) => p.order_number !== num));
        setActiveRequest((current) => (current?.order_number === num ? null : current));
      }
    };

    window.addEventListener('bakery_orders_updated', handleLocalUpdate);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('bake_approval_requested', handleBakeReqEvent as EventListener);
    window.addEventListener('bake_approval_resolved', handleBakeResEvent as EventListener);

    // Kiểm tra định kỳ 6 giây một lần để chống sót yêu cầu
    const interval = setInterval(scanPendingApprovalsFromStorage, 6000);

    return () => {
      unsubscribe();
      window.removeEventListener('bakery_orders_updated', handleLocalUpdate);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('bake_approval_requested', handleBakeReqEvent as EventListener);
      window.removeEventListener('bake_approval_resolved', handleBakeResEvent as EventListener);
      clearInterval(interval);
    };
  }, [isAdmin, scanPendingApprovalsFromStorage]);

  // Hành động 1: CHẤP NHẬN DUYỆT NƯỚNG XONG (Mở khóa giao ngay)
  const handleApprove = async (req: BakeApprovalPayload) => {
    if (processing) return;
    setProcessing(true);
    const orderNum = req.order_number;

    try {
      let fullQty = req.need_bake_qty || 1;
      let updatedNotes = '';

      // 1. Cập nhật localStorage
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((o: any) => {
              if (o.order_number === orderNum || o.orderNumber === orderNum || o.id === orderNum) {
                fullQty = o.orderQuantity || ((o.ready_stock_qty || 0) + (o.need_bake_qty || req.need_bake_qty || 0)) || fullQty;
                let n = o.notes || '';
                n = n
                  .replace(/\[⏳\s*YÊU CẦU DUYỆT NƯỚNG XONG:\s*\d+\s*CÁI\]/gi, '')
                  .replace(/\[⏳\s*CHỜ BẾP LÀM \d+ CÁI(?:\s*\(ĐÃ CÓ SẴN \d+(?:\/\d+)? CÁI\))?\]/gi, `[✓ ĐÃ BẾP LÀM XONG ĐỦ ${fullQty} CÁI]`)
                  .replace(/CHỜ BẾP LÀM \d+ CÁI/gi, `ĐÃ BẾP LÀM XONG ĐỦ ${fullQty} CÁI`);
                if (!n.includes('ĐÃ BẾP LÀM XONG ĐỦ')) {
                  n = `[✓ ĐÃ BẾP LÀM XONG ĐỦ ${fullQty} CÁI] ${n}`.trim();
                }
                updatedNotes = n;

                return {
                  ...o,
                  need_bake_qty: 0,
                  bake_status: 'done',
                  bake_approval_status: 'approved',
                  ready_stock_qty: fullQty,
                  notes: updatedNotes,
                  updated_at: new Date().toISOString(),
                };
              }
              if (o.order_number === `${orderNum}-LAM` || o.parent_order_number === orderNum) {
                return {
                  ...o,
                  status: 'completed',
                  need_bake_qty: 0,
                  bake_status: 'done',
                  bake_approval_status: 'approved',
                  updated_at: new Date().toISOString(),
                };
              }
              return o;
            });
            localStorage.setItem('bakery_orders', JSON.stringify(updated));
          }
        }
      }

      // 2. Cập nhật Dexie Offline DB
      try {
        (db.orders.where('order_number').equals(orderNum) as any).modify({
          need_bake_qty: 0,
          bake_status: 'done',
          bake_approval_status: 'approved',
          ready_stock_qty: fullQty,
          notes: updatedNotes,
          updated_at: new Date().toISOString(),
        });
      } catch {}

      // 3. Cập nhật Supabase Cloud Database
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await supabase.from('orders').update({
            notes: updatedNotes,
            updated_at: new Date().toISOString(),
          }).eq('order_number', orderNum);

          await supabase.from('orders').update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          }).eq('order_number', `${orderNum}-LAM`);
        } catch (sbErr) {
          console.warn('Lỗi update Supabase khi Admin duyệt:', sbErr);
        }
      }

      // 4. Phát sóng Realtime sang tất cả các thiết bị khác (Màn hình thợ bếp, POS)
      await broadcastOrderStatusUpdate(orderNum, 'ready', {
        order_number: orderNum,
        need_bake_qty: 0,
        bake_status: 'done',
        bake_approval_status: 'approved',
        ready_stock_qty: fullQty,
        notes: updatedNotes,
      });

      await broadcastBakeApprovalResolved({
        order_number: orderNum,
        action: 'approved',
        resolved_by: user?.name || 'Chủ Tiệm (Admin)',
      });

      window.dispatchEvent(new Event('bakery_orders_updated'));
      soundManager.playNewOrderChime();

      // Dọn khỏi danh sách chờ
      setPendingList((prev) => prev.filter((p) => p.order_number !== orderNum));
      setActiveRequest(null);
    } catch (e) {
      console.error('Lỗi khi duyệt nướng xong:', e);
      alert('Có lỗi xảy ra khi phê duyệt đơn hàng. Vui lòng thử lại!');
    } finally {
      setProcessing(false);
    }
  };

  // Hành động 2: TỪ CHỐI YÊU CẦU DUYỆT
  const handleReject = async (req: BakeApprovalPayload) => {
    if (processing) return;
    setProcessing(true);
    const orderNum = req.order_number;

    try {
      // 1. Cập nhật localStorage
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((o: any) => {
              if (o.order_number === orderNum || o.orderNumber === orderNum || o.id === orderNum) {
                let n = (o.notes || '').replace(/\[⏳\s*YÊU CẦU DUYỆT NƯỚNG XONG:\s*\d+\s*CÁI\]/gi, '').trim();
                return {
                  ...o,
                  bake_approval_status: 'rejected',
                  notes: n,
                  updated_at: new Date().toISOString(),
                };
              }
              return o;
            });
            localStorage.setItem('bakery_orders', JSON.stringify(updated));
          }
        }
      }

      // 2. Phát sóng Realtime
      await broadcastBakeApprovalResolved({
        order_number: orderNum,
        action: 'rejected',
        resolved_by: user?.name || 'Chủ Tiệm (Admin)',
      });

      window.dispatchEvent(new Event('bakery_orders_updated'));

      setPendingList((prev) => prev.filter((p) => p.order_number !== orderNum));
      setActiveRequest(null);
    } catch (e) {
      console.error('Lỗi khi từ chối duyệt:', e);
    } finally {
      setProcessing(false);
    }
  };

  // Nếu không phải Admin hoặc không có yêu cầu nào thì ẩn hoàn toàn
  if (!isAdmin || !activeRequest) return null;

  return (
    <aside aria-label="Yêu cầu duyệt nướng xong" className="fixed top-20 right-4 sm:right-6 z-50 max-w-sm sm:max-w-md w-[calc(100vw-2rem)] animate-in slide-in-from-top-4 duration-200">
      <div className="bg-[#1c1511] text-zinc-100 border-2 border-amber-500 rounded-3xl p-4 sm:p-5 shadow-2xl shadow-amber-950/80 space-y-3.5 backdrop-blur-md">
        {/* Header Thông báo */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center shadow-lg shadow-amber-600/40 animate-pulse shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                  Thời Gian Thực
                </span>
                <span className="text-[11px] text-zinc-400 font-medium">Chỉ Admin</span>
              </div>
              <h4 className="font-black text-sm sm:text-base text-amber-100 mt-0.5">
                Yêu Cầu Duyệt Nướng Xong Bánh
              </h4>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveRequest(null)}
            className="text-zinc-400 hover:text-zinc-200 p-1 rounded-xl hover:bg-zinc-800 transition cursor-pointer"
            title="Tạm đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nội dung đơn hàng */}
        <div className="bg-zinc-900/90 rounded-2xl p-3 border border-zinc-800 text-xs space-y-1.5">
          <div className="flex justify-between items-center text-zinc-300">
            <span>Mã đơn hàng:</span>
            <span className="font-mono font-bold text-amber-400">#{activeRequest.order_number}</span>
          </div>
          <div className="flex justify-between items-center text-zinc-300">
            <span>Món bánh:</span>
            <span className="font-bold text-white truncate max-w-[200px]">
              {activeRequest.cake_name}
            </span>
          </div>
          <div className="flex justify-between items-center text-amber-300 pt-1 border-t border-zinc-800">
            <span className="flex items-center gap-1">
              <ChefHat className="w-3.5 h-3.5 text-amber-400" /> Báo nướng xong thêm:
            </span>
            <span className="font-black text-amber-400 bg-amber-950/80 px-2 py-0.5 rounded-md border border-amber-500/40">
              {activeRequest.need_bake_qty} cái bánh
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 pt-0.5 flex justify-between">
            <span>Người gửi: {activeRequest.requested_by || 'Nhân viên bếp'}</span>
            <span>{new Date(activeRequest.requested_at || Date.now()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>

        {/* Nút Phê Duyệt / Từ Chối */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            disabled={processing}
            onClick={() => handleReject(activeRequest)}
            className="py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-rose-950/60 hover:text-rose-300 hover:border-rose-700/60 border border-zinc-700 text-zinc-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <XCircle className="w-4 h-4 text-rose-400" /> Từ Chối
          </button>
          <button
            type="button"
            disabled={processing}
            onClick={() => handleApprove(activeRequest)}
            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-950/50 cursor-pointer active:scale-95 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4 text-white" /> Chấp Nhận & Mở Khóa
          </button>
        </div>

        {/* Hiển thị số lượng yêu cầu còn lại nếu có nhiều hơn 1 đơn */}
        {pendingList.length > 1 && (
          <div className="text-center pt-0.5">
            <span className="text-[10px] text-amber-400/80 bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-800/40">
              Còn {pendingList.length - 1} yêu cầu khác đang chờ duyệt
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
