'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, X, RotateCcw, Cake, Clock, MessageSquare, User, FileText, Check } from 'lucide-react';
import { formatPickupDateTime } from '@/lib/supabase/realtimeSync';
import { KDSOrderSummary } from './ConfirmDoneModal';

export const CAKE_DAMAGE_REASONS = [
  '🔥 Cháy khét / Sống cốt bánh',
  '🧁 Hỏng kem / Trang trí sai mẫu / Lem màu',
  '✍️ Ghi sai tên / Thông điệp trên bánh',
  '💥 Rơi vỡ / Móp méo / Bẹp hộp bánh',
  '⏰ Bánh để lâu bị chua / Chảy nước / Hỏng vị',
  'Khách đổi yêu cầu đột xuất',
  'Khác (ghi chú chi tiết)...',
] as const;

interface CancelRemakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notes: string, logSpoilage: boolean) => void;
  order: KDSOrderSummary | null;
}

export function CancelRemakeModal({
  isOpen,
  onClose,
  onConfirm,
  order,
}: CancelRemakeModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>(CAKE_DAMAGE_REASONS[0]);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [logSpoilage, setLogSpoilage] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setSelectedReason(CAKE_DAMAGE_REASONS[0]);
      setCustomNotes('');
      setLogSpoilage(true);
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(selectedReason, customNotes.trim(), logSpoilage);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-zinc-900 border border-rose-700/60 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 text-white animate-in zoom-in-95 duration-150 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shadow-md shrink-0">
              <RotateCcw className="w-7 h-7 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-950 text-rose-300 border border-rose-800">
                Báo Hỏng & Làm Lại
              </span>
              <h3 className="font-black text-lg sm:text-xl text-white mt-0.5">
                Hủy Bánh Hỏng & Làm Lại Từ Đầu
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông tin bánh & đơn hàng */}
        <div className="bg-zinc-950/80 rounded-2xl p-4 border border-zinc-800/90 space-y-2 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-mono font-black text-sm text-rose-400">
              Đơn hàng: #{order.order_number}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
              Sẽ chuyển về: 1. Mới Nhận
            </span>
          </div>

          <div className="space-y-1">
            {order.items && order.items.length > 0 ? (
              order.items.map((it, idx) => (
                <div key={idx} className="font-bold text-zinc-200">
                  <span className="text-amber-400 font-extrabold mr-1.5">{it.quantity}x</span>
                  {it.product_name_snapshot}
                </div>
              ))
            ) : (
              <div className="font-bold text-zinc-200">
                🎂 {order.cake_name || 'Bánh Kem Theo Yêu Cầu'}
              </div>
            )}

            {order.cake_message && (
              <div className="text-[11px] text-pink-300 italic bg-pink-950/40 px-2 py-1 rounded border border-pink-900/50 mt-1 flex items-start gap-1">
                <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 text-pink-400" />
                <span>Chữ ghi bánh: &ldquo;{order.cake_message}&rdquo;</span>
              </div>
            )}
          </div>

          {(order.customer_name || order.preorder_pickup_at) && (
            <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 flex flex-wrap items-center justify-between gap-2">
              {order.customer_name && (
                <span>Khách: <strong className="text-zinc-200">{order.customer_name}</strong></span>
              )}
              {order.preorder_pickup_at && (
                <span className="text-amber-300 font-bold">
                  ⏰ Hẹn: {formatPickupDateTime(order.preorder_pickup_at) || order.preorder_pickup_at}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Form chọn lý do hủy làm lại */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              <span>Chọn lý do bánh bị hỏng / hủy làm lại:</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {CAKE_DAMAGE_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setSelectedReason(reason)}
                  className={`p-2 rounded-xl text-left text-xs font-semibold transition cursor-pointer flex items-center justify-between border ${
                    selectedReason === reason
                      ? 'bg-rose-950/80 border-rose-500 text-rose-200 shadow-xs'
                      : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                >
                  <span className="truncate pr-1">{reason}</span>
                  {selectedReason === reason && (
                    <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0"></span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Ghi chú chi tiết thêm */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-zinc-400" />
              <span>Ghi chú thêm cho mẻ làm lại (tùy chọn):</span>
            </label>
            <textarea
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              placeholder="VD: Cốt bánh bị xẹp đáy, thợ bánh nướng lại nhiệt 175°C..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-zinc-700/80 text-white placeholder-zinc-500 text-xs focus:outline-hidden focus:border-rose-500 transition resize-none"
            />
          </div>

          {/* Tùy chọn ghi vào nhật ký hao hụt bánh */}
          <div className="p-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-start gap-3">
            <input
              type="checkbox"
              id="logSpoilageCheckbox"
              checked={logSpoilage}
              onChange={(e) => setLogSpoilage(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-rose-600 focus:ring-rose-500 cursor-pointer"
            />
            <label htmlFor="logSpoilageCheckbox" className="text-xs cursor-pointer select-none">
              <div className="font-bold text-zinc-200">
                Ghi nhận vào Sổ Hao Hụt Bánh (Spoilage Loss)
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Tự động lưu lại lý do và chi phí mẻ bánh hỏng vào báo cáo quản trị để chủ tiệm theo dõi tỷ lệ hao hụt.
              </div>
            </label>
          </div>

          {/* Nút thao tác */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 border border-zinc-700"
            >
              <X className="w-4 h-4" />
              <span>Quay lại (Không hủy)</span>
            </button>

            <button
              type="submit"
              className="py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-rose-600/30 cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Xác Nhận Hủy & Làm Lại</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
