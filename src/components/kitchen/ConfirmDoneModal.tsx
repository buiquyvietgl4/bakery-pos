'use client';

import React from 'react';
import { CheckCircle2, X, Clock, MessageSquare, User } from 'lucide-react';
import { formatPickupDateTime } from '@/lib/supabase/realtimeSync';

interface OrderItem {
  id: string;
  product_name_snapshot: string;
  quantity: number;
  notes?: string;
  unit_price?: number;
}

export interface KDSOrderSummary {
  id: string;
  order_number: string;
  order_type?: string;
  status: string;
  customer_name?: string;
  customer_phone?: string;
  cake_name?: string;
  cake_message?: string;
  preorder_pickup_at?: string;
  delivery_method?: 'pickup' | 'shipping';
  shipping_address?: string;
  notes?: string;
  items?: OrderItem[];
}

interface ConfirmDoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  order: KDSOrderSummary | null;
  targetStep: 'ready' | 'completed';
}

export function ConfirmDoneModal({
  isOpen,
  onClose,
  onConfirm,
  order,
  targetStep,
}: ConfirmDoneModalProps) {
  if (!isOpen || !order) return null;

  const isShip = order.delivery_method === 'shipping' || (order.notes && order.notes.includes('Giao tận nơi'));
  const isReadyStep = targetStep === 'ready';

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 text-white animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md ${
              isReadyStep 
                ? 'bg-blue-600/20 border border-blue-500/40 text-blue-400' 
                : 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400'
            }`}>
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                isReadyStep ? 'bg-blue-950 text-blue-300 border border-blue-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}>
                {isReadyStep ? 'Xác Nhận Xong Bước 2' : 'Xác Nhận Hoàn Tất Đơn'}
              </span>
              <h3 className="font-black text-lg sm:text-xl text-white mt-0.5">
                {isReadyStep ? 'Bánh Đã Làm Xong?' : 'Đã Giao Bánh Xong?'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông tin đơn hàng tóm tắt */}
        <div className="bg-zinc-950/80 rounded-2xl p-4 border border-zinc-800/90 space-y-2.5 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-mono font-black text-sm text-amber-400">
              #{order.order_number}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-300">
              {isShip ? '🚚 Ship tận nơi' : '🏪 Nhận tại quầy'}
            </span>
          </div>

          {/* Danh sách món / bánh */}
          <div className="space-y-1">
            {order.items && order.items.length > 0 ? (
              order.items.map((it, idx) => (
                <div key={idx} className="flex justify-between items-start font-bold text-zinc-200">
                  <span>
                    <span className="text-amber-400 font-extrabold mr-1.5">{it.quantity}x</span>
                    {it.product_name_snapshot}
                  </span>
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

          {/* Khách hàng & Hẹn giờ */}
          {(order.customer_name || order.preorder_pickup_at) && (
            <div className="pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400 space-y-1">
              {order.customer_name && (
                <div className="flex items-center gap-1.5 font-medium text-zinc-300">
                  <User className="w-3 h-3 text-zinc-500" />
                  <span>Khách: <strong>{order.customer_name}</strong> {order.customer_phone ? `(${order.customer_phone})` : ''}</span>
                </div>
              )}
              {order.preorder_pickup_at && (
                <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Hẹn: {formatPickupDateTime(order.preorder_pickup_at) || order.preorder_pickup_at}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hướng dẫn giải thích */}
        <p className="text-xs text-zinc-400 leading-relaxed">
          {isReadyStep ? (
            <span>
              Khi bấm xác nhận, đơn sẽ chuyển sang cột <strong className="text-blue-400">&ldquo;3. Sẵn Sàng Giao&rdquo;</strong>, tự động gửi chuông thông báo cho thu ngân và shipper rằng bánh đã làm xong.
            </span>
          ) : (
            <span>
              Khi bấm xác nhận, đơn sẽ được <strong className="text-emerald-400">hoàn tất thành công</strong> và đóng lại trên màn hình bếp KDS.
            </span>
          )}
        </p>

        {/* Nút hành động */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 border border-zinc-700"
          >
            <X className="w-4 h-4" />
            <span>Chưa xong, quay lại</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`py-3 px-4 rounded-2xl font-black text-xs text-white flex items-center justify-center gap-1.5 transition shadow-lg cursor-pointer active:scale-95 ${
              isReadyStep
                ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isReadyStep ? '✅ Xác Nhận Đã Xong' : '✅ Xác Nhận Đã Giao'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
