'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, Truck, MapPin, Phone, User, Clock, Cake, Package, 
  CheckCircle2, Banknote, Eye, Tag, AlertTriangle, Search,
  Store, Copy, Check, Sparkles, ExternalLink
} from 'lucide-react';
import { formatPickupDateTime, parsePreorderFromNotes } from '@/lib/supabase/realtimeSync';
import { getDeliveryUrgency, sortPreordersByUrgency } from '@/lib/utils/deliveryAlerts';
import { cleanCakeNameAndSize, getAddonIcon } from '@/lib/utils/customCakeCosting';
import { DeliveryPaymentModal } from '@/components/kitchen/DeliveryPaymentModal';

export interface PosReadyShippingModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: any[];
  currentTime?: Date;
  vietqrConfig?: any;
  onCompleteOrder: (order: any, method: 'cash' | 'bank_transfer', proofImageBase64?: string) => void;
  onOpenSticker: (order: any) => void;
  onOpenDetail: (order: any) => void;
}

export const PosReadyShippingModal: React.FC<PosReadyShippingModalProps> = ({
  isOpen,
  onClose,
  orders,
  currentTime = new Date(),
  vietqrConfig,
  onCompleteOrder,
  onOpenSticker,
  onOpenDetail,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'shipping' | 'pickup'>('all');
  const [deliveryPaymentOrder, setDeliveryPaymentOrder] = useState<any | null>(null);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  const handleCopyPhone = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(phone);
      setCopiedPhone(phone);
      setTimeout(() => setCopiedPhone(null), 2000);
    }
  };

  const filteredOrders = useMemo(() => {
    let list = (orders || []).filter((o) => {
      if (!o || o.status !== 'ready') return false;
      if (o.parent_order_number || o.order_number?.endsWith('-LAM') || o.notes?.includes('BỔ SUNG CHO ĐƠN')) {
        return false;
      }
      return true;
    });

    if (filterType === 'shipping') {
      list = list.filter((o) => {
        const fromN = parsePreorderFromNotes(o.notes);
        return o.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
      });
    } else if (filterType === 'pickup') {
      list = list.filter((o) => {
        const fromN = parsePreorderFromNotes(o.notes);
        return o.delivery_method !== 'shipping' && fromN.delivery_method !== 'shipping';
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((o) => {
        const fromN = parsePreorderFromNotes(o.notes);
        const orderNo = (o.order_number || o.orderNumber || '').toLowerCase();
        const custName = (o.customer_name || fromN.customer_name || '').toLowerCase();
        const custPhone = (o.customer_phone || fromN.customer_phone || '').toLowerCase();
        const cake = (o.cake_name || fromN.cake_name || o.items?.[0]?.product_name_snapshot || '').toLowerCase();
        const addr = (o.shipping_address || fromN.shipping_address || '').toLowerCase();
        return orderNo.includes(q) || custName.includes(q) || custPhone.includes(q) || cake.includes(q) || addr.includes(q);
      });
    }

    return sortPreordersByUrgency(list, currentTime);
  }, [orders, filterType, searchQuery, currentTime]);

  const counts = useMemo(() => {
    let ship = 0;
    let pick = 0;
    for (const o of orders) {
      if (!o || o.status !== 'ready') continue;
      if (o.parent_order_number || o.order_number?.endsWith('-LAM') || o.notes?.includes('BỔ SUNG CHO ĐƠN')) continue;
      const fromN = parsePreorderFromNotes(o.notes);
      if (o.delivery_method === 'shipping' || fromN.delivery_method === 'shipping') ship++;
      else pick++;
    }
    return { all: orders.length, shipping: ship, pickup: pick };
  }, [orders]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-zinc-950 text-zinc-100 rounded-3xl border border-emerald-500/30 max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 bg-zinc-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Truck className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  Đơn Chờ Ship & Chờ Giao Quầy
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-zinc-950 font-black text-xs">
                  {orders.length} đơn
                </span>
                <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-2 py-0.5 rounded-md hidden sm:inline">
                  Bước 3 Bếp Sẵn Sàng
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Đơn bánh thợ bếp đã làm xong, sẵn sàng đóng gói giao cho Shipper hoặc khách đến lấy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter bar & Search */}
        <div className="p-3 sm:px-5 bg-zinc-900/60 border-b border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0">
          {/* Tabs Filter */}
          <div className="flex items-center gap-1.5 p-1 bg-zinc-950 rounded-2xl border border-zinc-800 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filterType === 'all'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Tất cả ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('shipping')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer ${
                filterType === 'shipping'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Ship tận nơi ({counts.shipping})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('pickup')}
              className={`px-3 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer ${
                filterType === 'pickup'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Lấy tại quầy ({counts.pickup})</span>
            </button>
          </div>

          {/* Search box */}
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm mã đơn, tên khách, SĐT, địa chỉ..."
              className="w-full pl-9 pr-8 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-100 placeholder-zinc-500 focus:outline-hidden focus:border-emerald-500"
            />
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5">
          {filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-zinc-500 text-xs italic bg-zinc-900/30 rounded-3xl border border-dashed border-zinc-800/80 p-6 max-w-md mx-auto my-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 text-zinc-500 flex items-center justify-center mx-auto">
                <Truck className="w-6 h-6" />
              </div>
              <p className="font-bold text-zinc-300 text-sm">Chưa có đơn nào ở Bước 3 chờ ship</p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Khi thợ bếp bấm hoàn thành làm bánh ở màn hình Bếp (KDS) và chuyển sang Bước 3, đơn sẽ tự động hiển thị ở đây ngay tức thì để bạn kiểm tra và giao hàng.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredOrders.map((order) => {
                const fromN = parsePreorderFromNotes(order.notes);
                const isPreorder = order.order_type === 'preorder' || order.order_number?.startsWith('BK-PRE') || !!order.preorder_pickup_at || fromN.delivery_method !== undefined;
                const isShip = order.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
                const shipAddr = order.shipping_address || fromN.shipping_address;

                // Tính toán tiền
                const totalAmt = Number(order.total_amount ?? (order as any).totalPrice ?? fromN.total_amount ?? 0);
                const depAmt = Number(order.deposit_amount ?? (order as any).depositAmount ?? fromN.deposit_amount ?? 0);
                const parsedRem = order.remaining_amount !== undefined 
                  ? Number(order.remaining_amount) 
                  : ((order as any).remainingAmount !== undefined 
                      ? Number((order as any).remainingAmount) 
                      : (fromN.remaining_amount !== undefined ? Number(fromN.remaining_amount) : Math.max(0, totalAmt - depAmt)));
                const isPaid100 = order.payment_status === 'paid' || parsedRem <= 0;
                const remAmt = isPaid100 ? 0 : parsedRem;

                const urgency = getDeliveryUrgency(order.preorder_pickup_at, order.status, currentTime);
                const mainItem = order.items?.[0];
                const cakeFullName = mainItem?.product_name_snapshot || order.cake_name || fromN.cake_name || 'Bánh Kem Sinh Nhật';
                const parsedCake = cleanCakeNameAndSize(cakeFullName, order.cake_size || fromN.cake_size || order.size || '');

                const custPhone = order.customer_phone || fromN.customer_phone;
                const custName = order.customer_name || fromN.customer_name || 'Khách tiệm';

                // Kiểm tra đơn có đang chờ bếp làm thêm số lượng bổ sung (thiếu bánh tồn)
                const needBakeQty = Number(order.need_bake_qty || 0);
                const isWaitingBake = Boolean(
                  needBakeQty > 0 &&
                  order.bake_status !== 'done' &&
                  !order.notes?.includes('ĐÃ BẾP LÀM XONG ĐỦ')
                );
                const totalOrderQty = Number(order.orderQuantity || mainItem?.quantity || ((order.ready_stock_qty || 0) + needBakeQty) || 1);
                const readyStockQty = order.ready_stock_qty !== undefined ? Number(order.ready_stock_qty) : Math.max(0, totalOrderQty - needBakeQty);
                const isDoneBake = Boolean(
                  order.bake_status === 'done' &&
                  (order.notes?.includes('ĐÃ BẾP LÀM XONG ĐỦ') || totalOrderQty > 1 || (order.need_bake_qty !== undefined && Number(order.need_bake_qty) > 0))
                );

                return (
                  <div
                    key={order.id || order.order_number}
                    className={`rounded-2xl p-4 shadow-lg space-y-3 border flex flex-col justify-between transition ${
                      urgency.isUrgent
                        ? 'bg-zinc-900 border-2 border-rose-500 ring-2 ring-rose-500/40 shadow-rose-950/40'
                        : isWaitingBake
                        ? 'bg-zinc-900/95 border-2 border-amber-500/80 shadow-amber-950/40 ring-1 ring-amber-500/30'
                        : isPaid100
                        ? 'bg-zinc-900/90 border border-emerald-500/50 shadow-emerald-950/20'
                        : 'bg-zinc-900/90 border-2 border-amber-500/60 shadow-amber-950/30'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Ribbon giao gấp */}
                      {urgency.isUrgent && (
                        <div className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center justify-between shadow-xs ${urgency.badgeColorClass}`}>
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{urgency.badgeText}</span>
                          </span>
                          <span className="text-[9px] uppercase font-black bg-black/30 px-1.5 py-0.5 rounded">GIAO GẤP</span>
                        </div>
                      )}

                      {/* Mã đơn & Badge phương thức */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-sm text-emerald-400">
                          #{order.order_number}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          isShip 
                            ? 'bg-blue-950 text-blue-300 border-blue-800' 
                            : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        }`}>
                          {isPreorder ? (isShip ? '🚚 Chờ ship' : '🏪 Khách đến lấy') : 'Chờ giao quầy'}
                        </span>
                      </div>

                      {/* Tên bánh & Thông tin */}
                      <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/90 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-black text-sm text-zinc-100 uppercase leading-snug">
                            {parsedCake.name}
                          </h3>
                          {isWaitingBake ? (
                            <span className="shrink-0 px-2 py-0.5 rounded-lg bg-amber-600 text-white font-black text-xs">
                              Có sẵn: {readyStockQty}/{totalOrderQty} cái
                            </span>
                          ) : totalOrderQty > 1 ? (
                            <span className="shrink-0 px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-black text-xs">
                              {totalOrderQty}x
                            </span>
                          ) : null}
                        </div>

                        {/* Banner cảnh báo đang chờ bếp làm bù */}
                        {isWaitingBake ? (
                          <div className="p-2 rounded-xl bg-amber-950/80 border border-amber-500/60 text-amber-200 text-xs space-y-1">
                            <div className="flex items-center justify-between font-black text-amber-300">
                              <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                                <span>Đang chờ bếp làm thêm {needBakeQty} cái</span>
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40">
                                Sẵn: {readyStockQty}/{totalOrderQty}
                              </span>
                            </div>
                            <div className="text-[11px] text-amber-300/80 flex items-center justify-between font-medium">
                              <span>📦 Có sẵn chờ ship: <b>{readyStockQty} cái</b></span>
                              <span className="text-amber-400">⏳ Bếp cần làm bù: <b>{needBakeQty} cái</b></span>
                            </div>
                          </div>
                        ) : isDoneBake ? (
                          <div className="p-1.5 px-2.5 rounded-lg bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 text-[11px] font-extrabold flex items-center justify-between">
                            <span>✓ Đã làm xong đủ: <b>{totalOrderQty} cái bánh</b></span>
                            <span className="text-emerald-400">Đã gộp đủ • Sẵn sàng</span>
                          </div>
                        ) : null}

                        {parsedCake.size && (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 font-extrabold text-[11px]">
                            <span>📐 Size: {parsedCake.size}</span>
                          </div>
                        )}

                        {order.cake_message && (
                          <div className="text-emerald-200 text-xs font-semibold pt-1 border-t border-zinc-800/80 truncate">
                            ✍️ Chữ: &ldquo;{order.cake_message}&rdquo;
                          </div>
                        )}
                      </div>

                      {/* Khách hàng & Hẹn giao */}
                      <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-xs space-y-1.5">
                        {order.preorder_pickup_at && (
                          <div className="flex items-center justify-between text-emerald-300 font-bold">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Hẹn: {formatPickupDateTime(order.preorder_pickup_at)}</span>
                            </span>
                            {!urgency.isUrgent && urgency.formattedRemaining && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${urgency.badgeColorClass}`}>
                                {urgency.formattedRemaining}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-0.5">
                          <span className="text-zinc-200 font-bold flex items-center gap-1 truncate max-w-[150px]">
                            <User className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span>{custName}</span>
                          </span>

                          {custPhone && (
                            <div className="flex items-center gap-1">
                              <a
                                href={`tel:${custPhone}`}
                                className="text-emerald-400 hover:text-emerald-300 font-mono font-bold text-xs flex items-center gap-0.5"
                                title="Bấm để gọi điện thoại"
                              >
                                <Phone className="w-3 h-3" />
                                <span>{custPhone}</span>
                              </a>
                              <button
                                type="button"
                                onClick={(e) => handleCopyPhone(custPhone, e)}
                                className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800"
                                title="Sao chép SĐT"
                              >
                                {copiedPhone === custPhone ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                        </div>

                        {isShip && shipAddr && (
                          <div className="text-[11px] text-blue-300 pt-0.5 flex items-start gap-1">
                            <MapPin className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{shipAddr}</span>
                          </div>
                        )}
                      </div>

                      {/* Trạng thái tiền: 100% vs Cần thu */}
                      {isPaid100 ? (
                        <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-700/80 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-emerald-300 font-black text-xs">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>ĐÃ THANH TOÁN 100%</span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-900/80 px-2 py-0.5 rounded-md border border-emerald-600/50">
                            Cần thu: 0₫
                          </span>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-xl bg-rose-950/80 border-2 border-rose-600/80 shadow-md shadow-rose-950/40 space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-rose-200 font-extrabold flex items-center gap-1.5">
                              <Banknote className="w-4 h-4 text-rose-400 animate-pulse" />
                              <span>SỐ TIỀN CẦN THU:</span>
                            </span>
                            <span className="font-black text-white text-base tracking-wide bg-rose-600 px-2 py-0.5 rounded-lg">
                              {remAmt.toLocaleString('vi-VN')}₫
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-rose-300/80 pt-0.5 border-t border-rose-900/50">
                            <span>Đã cọc: {depAmt.toLocaleString('vi-VN')}₫</span>
                            <span>Tổng tiền: {totalAmt.toLocaleString('vi-VN')}₫</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="pt-2 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenDetail(order)}
                          className="py-2 px-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>Chi tiết</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenSticker(order)}
                          className="py-2 px-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                        >
                          <Tag className="w-3.5 h-3.5 text-amber-400" />
                          <span>In Tem Nhãn</span>
                        </button>
                      </div>

                      {isWaitingBake ? (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            disabled
                            className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-400 font-bold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed opacity-80 border border-zinc-700 shadow-inner"
                            title={`Đơn đang chờ bếp nướng làm thêm ${needBakeQty} cái bánh bổ sung. Khi thợ bếp hoàn thành và duyệt đủ ${totalOrderQty} cái mới mở khóa giao hàng.`}
                          >
                            <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                            <span>Chờ Bếp Làm Bù ({needBakeQty} cái) • Chưa Thể Giao</span>
                          </button>
                          <p className="text-[10px] text-amber-400/90 text-center italic">
                            ⚠️ Bếp chưa làm xong số lượng bù. Vui lòng chờ bếp hoàn tất để mở khóa giao hàng.
                          </p>
                        </div>
                      ) : isPaid100 ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Xác nhận hoàn tất giao đơn #${order.order_number} cho khách?`)) {
                              onCompleteOrder(order, 'cash');
                            }
                          }}
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-95"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Hoàn Thành Giao Bánh</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeliveryPaymentOrder(order)}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-rose-600/30 cursor-pointer active:scale-95 animate-pulse"
                        >
                          <Banknote className="w-4 h-4" />
                          <span>Giao Bánh & Thu Tiền ({remAmt.toLocaleString('vi-VN')}₫)</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal Thu Tiền Khi Giao Hàng Cho Đơn Chưa Trả Hết */}
      {deliveryPaymentOrder && (
        <DeliveryPaymentModal
          isOpen={!!deliveryPaymentOrder}
          onClose={() => setDeliveryPaymentOrder(null)}
          order={deliveryPaymentOrder}
          vietqrConfig={vietqrConfig}
          onConfirmPaymentAndComplete={(o, method, proofImage) => {
            onCompleteOrder(o, method, proofImage);
            setDeliveryPaymentOrder(null);
          }}
        />
      )}
    </div>
  );
};

export default PosReadyShippingModal;
