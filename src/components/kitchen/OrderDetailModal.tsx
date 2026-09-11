'use client';

import React from 'react';
import { 
  X, Cake, Clock, User, Phone, MapPin, Tag, Camera, 
  MessageSquare, Sparkles, CheckCircle2, Flame, AlertTriangle,
  ArrowRight, DollarSign, ExternalLink
} from 'lucide-react';
import { formatPickupDateTime, parsePreorderFromNotes, cleanDisplayNotes } from '@/lib/supabase/realtimeSync';

export interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onPrintSticker?: (order: any) => void;
  onAction?: (order: any) => void;
  actionText?: string;
  actionIcon?: React.ReactNode;
  actionColorClass?: string;
  onOpenLightbox?: (imgUrl: string) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  onClose,
  order,
  onPrintSticker,
  onAction,
  actionText,
  actionIcon,
  actionColorClass,
  onOpenLightbox,
}) => {
  if (!isOpen || !order) return null;

  const fromN = parsePreorderFromNotes(order.notes);
  const isShip = order.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
  const shipAddr = order.shipping_address || fromN.shipping_address;
  const isPreorder = order.order_type === 'preorder' || order.order_number?.startsWith('BK-PRE') || !!order.preorder_pickup_at;

  const mainItem = order.items?.[0];
  const cakeFullName = mainItem?.product_name_snapshot || order.cake_name || fromN.cake_name || 'Bánh Kem Theo Yêu Cầu';
  
  // Trích xuất kích thước nếu có
  let cakeName = cakeFullName;
  let cakeSize = fromN.cake_size || '';
  const sizeMatch = cakeFullName.match(/\(([^)]+)\)/);
  if (sizeMatch) {
    if (!cakeSize) cakeSize = sizeMatch[1];
    cakeName = cakeFullName.replace(/\s*\([^)]+\)/g, '').trim();
  }

  const cakeMsg = order.cake_message || fromN.cake_message;
  const specialReq = fromN.special_request || cleanDisplayNotes(order.notes);
  const refImg = order.reference_image_url || fromN.reference_image_url;

  // Tài chính
  const totalAmt = order.total_amount || fromN.total_amount || 0;
  const depAmt = order.deposit_amount || fromN.deposit_amount || 0;
  const remAmt = order.remaining_amount !== undefined 
    ? order.remaining_amount 
    : (fromN.remaining_amount !== undefined ? fromN.remaining_amount : Math.max(0, totalAmt - depAmt));
  const isFullyPaid = remAmt <= 0;

  // Trạng thái hiển thị tiếng Việt
  const statusLabels: Record<string, { text: string; bg: string; textCol: string }> = {
    pending: { text: '1. Mới Nhận (Chờ Làm)', bg: 'bg-amber-950/80', textCol: 'text-amber-400' },
    preparing: { text: '2. Đang Nướng / Làm Bánh', bg: 'bg-blue-950/80', textCol: 'text-blue-400' },
    ready: { text: '3. Sẵn Sàng Giao (Chờ Ship/Nhận)', bg: 'bg-emerald-950/80', textCol: 'text-emerald-400' },
    completed: { text: '4. Đã Hoàn Thành', bg: 'bg-zinc-800', textCol: 'text-zinc-300' },
  };
  const statusInfo = statusLabels[order.status] || { text: order.status, bg: 'bg-zinc-800', textCol: 'text-zinc-300' };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-lg w-full p-5 sm:p-6 shadow-2xl space-y-4 text-white animate-in zoom-in-95 duration-150 my-auto">
        
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-black text-lg text-amber-400">
                #{order.order_number}
              </span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                isPreorder 
                  ? 'bg-pink-950/80 text-pink-300 border-pink-700' 
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
              }`}>
                {isPreorder ? '🎂 BÁNH ĐẶT TRƯỚC' : '🏪 BÁN TẠI QUẦY'}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border border-current ${statusInfo.bg} ${statusInfo.textCol}`}>
                {statusInfo.text}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">Chi tiết thông tin đặt bánh & yêu cầu khách hàng</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nội dung chi tiết */}
        <div className="space-y-3.5 max-h-[68vh] overflow-y-auto pr-1">
          
          {/* 1. KHỐI TÊN BÁNH & KÍCH THƯỚC */}
          <div className="bg-zinc-950/90 rounded-2xl p-4 border border-zinc-800/90 space-y-2.5">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Cake className="w-3.5 h-3.5 text-pink-400" /> Thông tin bánh cần làm
            </div>
            
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-black text-base sm:text-lg text-zinc-100 uppercase leading-snug">
                  {cakeName}
                </h3>
                {mainItem?.quantity && mainItem.quantity > 1 && (
                  <span className="shrink-0 px-2 py-0.5 rounded-lg bg-pink-600 text-white font-black text-xs">
                    SL: {mainItem.quantity}
                  </span>
                )}
              </div>
              {cakeSize && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-pink-950/70 border border-pink-700/80 text-pink-300 text-xs font-bold">
                  <span>📐 Kích thước:</span>
                  <span className="font-black text-pink-200">{cakeSize}</span>
                </div>
              )}
            </div>

            {/* Chữ ghi lên bánh */}
            {cakeMsg && (
              <div className="pt-2 border-t border-zinc-800/80">
                <div className="text-xs bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-700 text-pink-200 font-bold flex items-start gap-2">
                  <span className="text-base shrink-0">✍️</span>
                  <div>
                    <span className="text-zinc-400 font-medium text-[11px] block">Nội dung ghi lên bánh:</span>
                    <span className="text-sm font-black text-white">&ldquo;{cakeMsg}&rdquo;</span>
                  </div>
                </div>
              </div>
            )}

            {/* Yêu cầu trang trí / Hương vị */}
            {specialReq && specialReq !== cakeMsg && (
              <div className="pt-2 border-t border-zinc-800/80">
                <div className="text-xs bg-amber-950/30 p-2.5 rounded-xl border border-amber-800/50 text-amber-200 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-amber-400 font-bold text-[11px] block">Yêu cầu trang trí & làm bánh:</span>
                    <span className="font-semibold text-zinc-200">{specialReq}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Ảnh mẫu bánh khách gửi */}
            {refImg && (
              <div className="pt-2 border-t border-zinc-800/80 flex items-center gap-3">
                <div
                  className="relative group cursor-pointer shrink-0"
                  onClick={() => onOpenLightbox ? onOpenLightbox(refImg) : window.open(refImg, '_blank')}
                >
                  <img
                    src={refImg}
                    alt="Mẫu bánh khách gửi"
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-pink-400 shadow-lg hover:scale-105 transition"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white text-center rounded-b-xl font-bold py-0.5">
                    🔍 Xem lớn
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-pink-300 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-pink-400" /> Ảnh mẫu bánh khách gửi
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Bấm vào ảnh để phóng to đối chiếu chi tiết màu sắc, tạo hình kem và phụ kiện.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 2. KHỐI THỜI GIAN & HÌNH THỨC GIAO HÀNG */}
          <div className="bg-zinc-950/90 rounded-2xl p-4 border border-zinc-800/90 space-y-2.5 text-xs">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> Thời gian & Địa điểm giao
            </div>

            {order.preorder_pickup_at && (
              <div className="flex items-center justify-between bg-blue-950/40 p-2.5 rounded-xl border border-blue-900/50">
                <div className="flex items-center gap-2 text-blue-300 font-bold">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>Hạn giao bánh:</span>
                </div>
                <span className="font-black text-sm text-white">
                  {formatPickupDateTime(order.preorder_pickup_at) || order.preorder_pickup_at}
                </span>
              </div>
            )}

            {/* Khách hàng */}
            {(order.customer_name || order.customer_phone) && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900 border border-zinc-800">
                <div className="flex items-center gap-2 text-zinc-300">
                  <User className="w-4 h-4 text-zinc-400" />
                  <span>Khách: <strong className="text-white">{order.customer_name || 'Khách đặt'}</strong></span>
                </div>
                {order.customer_phone && (
                  <a
                    href={`tel:${order.customer_phone}`}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 font-bold text-[11px] transition"
                  >
                    <Phone className="w-3 h-3" />
                    <span>{order.customer_phone}</span>
                  </a>
                )}
              </div>
            )}

            {/* Hình thức & Địa chỉ */}
            <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isShip ? 'bg-blue-900 text-blue-200 border border-blue-700' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                }`}>
                  {isShip ? '🚚 Giao tận nơi (Ship bánh)' : '🏪 Nhận tại tiệm'}
                </span>
              </div>
              {isShip && shipAddr && (
                <div className="text-blue-300 flex items-start gap-1.5 pt-1 text-[11px]">
                  <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <span>{shipAddr}</span>
                </div>
              )}
            </div>
          </div>

          {/* 3. KHỐI TÀI CHÍNH & TIỀN CỌC */}
          <div className="bg-zinc-950/90 rounded-2xl p-4 border border-zinc-800/90 space-y-2 text-xs">
            <div className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Thanh toán & Tiền cọc
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block">Tổng tiền</span>
                <span className="font-bold text-zinc-200 text-xs">
                  {totalAmt > 0 ? `${totalAmt.toLocaleString('vi-VN')}₫` : 'Theo giá niêm yết'}
                </span>
              </div>
              <div className="bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block">Đã đặt cọc</span>
                <span className="font-bold text-emerald-400 text-xs">
                  {depAmt > 0 ? `${depAmt.toLocaleString('vi-VN')}₫` : '0₫'}
                </span>
              </div>
              <div className={`p-2 rounded-xl border ${
                isFullyPaid 
                  ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300' 
                  : 'bg-rose-950/50 border-rose-800 text-rose-300'
              }`}>
                <span className="text-[10px] block opacity-80">
                  {isFullyPaid ? 'Trạng thái' : 'Cần thu khi giao'}
                </span>
                <span className="font-black text-xs">
                  {isFullyPaid ? 'Đã trả 100%' : `${remAmt.toLocaleString('vi-VN')}₫`}
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Modal Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
          {onPrintSticker && (
            <button
              type="button"
              onClick={() => onPrintSticker(order)}
              className="px-3.5 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 active:scale-95"
            >
              <Tag className="w-4 h-4 text-amber-400" />
              <span>In Tem Hộp</span>
            </button>
          )}

          {onAction && actionText && (
            <button
              type="button"
              onClick={() => {
                onAction(order);
                onClose();
              }}
              className={`flex-1 py-2.5 rounded-2xl font-black text-xs sm:text-sm text-white flex items-center justify-center gap-2 transition shadow-lg cursor-pointer active:scale-95 ${
                actionColorClass || 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
              }`}
            >
              {actionIcon || <ArrowRight className="w-4 h-4" />}
              <span>{actionText}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition cursor-pointer shrink-0 active:scale-95"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};

export default OrderDetailModal;
