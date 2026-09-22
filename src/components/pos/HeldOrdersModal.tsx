'use client';

import React, { useState } from 'react';
import {
  Clock,
  X,
  RotateCcw,
  Trash2,
  AlertCircle,
  Package,
  Calendar,
  Truck,
  Store,
  Tag,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { HeldOrder } from '@/lib/types/heldOrder';

interface HeldOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldOrders: HeldOrder[];
  activeCartCount: number;
  onRestoreOrder: (heldOrder: HeldOrder, holdCurrentFirst?: boolean) => void;
  onDeleteOrder: (id: string) => void;
  onClearAll: () => void;
}

export const HeldOrdersModal: React.FC<HeldOrdersModalProps> = ({
  isOpen,
  onClose,
  heldOrders,
  activeCartCount,
  onRestoreOrder,
  onDeleteOrder,
  onClearAll,
}) => {
  const [selectedOrderToRestore, setSelectedOrderToRestore] = useState<HeldOrder | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);

  if (!isOpen) return null;

  const formatRelativeTime = (isoString: string) => {
    try {
      const created = new Date(isoString).getTime();
      const now = Date.now();
      const diffSec = Math.floor((now - created) / 1000);
      if (diffSec < 60) return `${diffSec} giây trước`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin} phút trước`;
      const diffHour = Math.floor(diffMin / 60);
      return `${diffHour} giờ trước`;
    } catch {
      return '';
    }
  };

  const handleRestoreClick = (order: HeldOrder) => {
    if (activeCartCount > 0) {
      // Giỏ hàng hiện tại đang có món -> Hiển thị cảnh báo thông minh
      setSelectedOrderToRestore(order);
    } else {
      onRestoreOrder(order, false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl flex flex-col max-h-[92dvh] animate-in zoom-in duration-200 border border-stone-200/60">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-xs">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-lg text-zinc-900 leading-none">Đơn Tạm Lưu (Hold Orders)</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white font-black text-xs">
                  {heldOrders.length}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Các đơn hàng đang tạm giữ tại quầy để phục vụ khách khác
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-stone-100 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CẢNH BÁO XUNG ĐỘT KHI GIỎ HÀNG HIỆN TẠI ĐANG CÓ MÓN */}
        {selectedOrderToRestore && (
          <div className="my-3 p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-3 animate-in fade-in duration-150 shrink-0">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-black text-sm text-amber-900">
                  Giỏ hàng hiện tại đang có {activeCartCount} món!
                </h4>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Bạn muốn xử lý giỏ hàng hiện tại như thế nào trước khi khôi phục đơn{' '}
                  <b>{selectedOrderToRestore.holdCode}</b> ({selectedOrderToRestore.label || 'Đơn tạm'})?
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  onRestoreOrder(selectedOrderToRestore, true);
                  setSelectedOrderToRestore(null);
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>💾 Tạm lưu giỏ hiện tại rồi mở đơn này</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onRestoreOrder(selectedOrderToRestore, false);
                  setSelectedOrderToRestore(null);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-white border border-stone-300 hover:bg-stone-100 text-zinc-700 font-bold text-xs transition cursor-pointer"
              >
                <span>🗑️ Ghi đè (bỏ giỏ hiện tại)</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrderToRestore(null)}
                className="px-3 py-2 rounded-xl text-zinc-500 hover:text-zinc-800 text-xs font-bold transition cursor-pointer"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        )}

        {/* Nội dung danh sách đơn tạm */}
        <div className="overflow-y-auto flex-1 py-3 space-y-3 pr-1 overscroll-contain">
          {heldOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400 space-y-2.5">
              <div className="w-16 h-16 rounded-3xl bg-zinc-100 flex items-center justify-center text-zinc-400">
                <Clock className="w-8 h-8 stroke-1.5" />
              </div>
              <span className="font-bold text-sm text-zinc-700">Không có đơn hàng nào đang tạm lưu</span>
              <p className="text-xs text-zinc-400 text-center max-w-xs leading-relaxed">
                Khi khách hàng đang tính tiền cần chọn thêm hoặc quên ví, bấm nút <b>"Tạm Lưu"</b> ở góc giỏ hàng để lưu tạm.
              </p>
            </div>
          ) : (
            heldOrders.map((order) => {
              const isConfirmingDelete = confirmDeleteId === order.id;

              return (
                <div
                  key={order.id}
                  className="p-4 rounded-2xl bg-stone-50/90 border border-stone-200/90 hover:border-amber-300 hover:shadow-md transition-all space-y-3 group"
                >
                  {/* Top Bar of Card */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-stone-200/60">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-amber-600 text-white shadow-2xs">
                        {order.holdCode}
                      </span>
                      {order.label ? (
                        <span className="font-bold text-xs text-zinc-900 bg-amber-100/70 text-amber-900 px-2 py-0.5 rounded-md">
                          {order.label}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500 italic">Đơn chưa đặt tên</span>
                      )}
                      <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(order.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          order.fulfillmentType === 'shipping'
                            ? 'bg-blue-100 text-blue-800'
                            : order.fulfillmentType === 'pickup'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {order.fulfillmentType === 'shipping' ? (
                          <>
                            <Truck className="w-3 h-3" /> Ship hàng
                          </>
                        ) : order.fulfillmentType === 'pickup' ? (
                          <>
                            <Calendar className="w-3 h-3" /> Hẹn giờ
                          </>
                        ) : (
                          <>
                            <Store className="w-3 h-3" /> Tại quầy
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Customer info if pre-filled */}
                  {(order.posCustomerName || order.posCustomerPhone) && (
                    <div className="text-xs text-zinc-700 bg-white px-2.5 py-1.5 rounded-xl border border-stone-200/70 flex items-center gap-2">
                      <span className="font-bold">Khách:</span>
                      <span>{order.posCustomerName || 'Chưa tên'}</span>
                      {order.posCustomerPhone && <span className="text-zinc-500">({order.posCustomerPhone})</span>}
                    </div>
                  )}

                  {/* Items List Breakdown */}
                  <div className="bg-white rounded-xl p-2.5 border border-stone-200/80 space-y-1 text-xs">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center py-0.5 text-zinc-800">
                        <span className="truncate pr-2">
                          <b className="text-amber-700 font-bold mr-1">{it.quantity}x</b>
                          {it.product.name}
                        </span>
                        <span className="font-semibold shrink-0">
                          {((it.product.selling_price || 0) * it.quantity).toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    ))}
                    {order.discountPercent > 0 && (
                      <div className="flex justify-between text-[11px] text-emerald-600 font-bold pt-1 border-t border-stone-100">
                        <span>Giảm giá:</span>
                        <span>-{order.discountPercent}%</span>
                      </div>
                    )}
                    {order.discountCustomAmount > 0 && (
                      <div className="flex justify-between text-[11px] text-emerald-600 font-bold pt-1 border-t border-stone-100">
                        <span>Giảm giá:</span>
                        <span>-{order.discountCustomAmount.toLocaleString('vi-VN')}₫</span>
                      </div>
                    )}
                  </div>

                  {/* Footer of Card */}
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-[11px] text-zinc-500 block">Tổng thanh toán:</span>
                      <span className="font-black text-base text-amber-700">
                        {(order.totalAmount || 0).toLocaleString('vi-VN')}₫
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1 animate-in fade-in">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteOrder(order.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            Xác nhận xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 text-zinc-500 hover:text-zinc-800 rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(order.id)}
                          className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                          title="Xóa đơn tạm"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRestoreClick(order)}
                        className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Khôi phục đơn</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-100 shrink-0 text-xs">
          {heldOrders.length > 0 ? (
            showClearAllConfirm ? (
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-600 text-xs font-bold">Xóa tất cả đơn tạm?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClearAll();
                    setShowClearAllConfirm(false);
                  }}
                  className="px-2.5 py-1 bg-rose-600 text-white rounded-lg font-bold"
                >
                  Xóa hết
                </button>
                <button
                  type="button"
                  onClick={() => setShowClearAllConfirm(false)}
                  className="px-2 py-1 text-zinc-500 font-bold"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearAllConfirm(true)}
                className="text-zinc-400 hover:text-rose-600 font-bold transition cursor-pointer flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa tất cả
              </button>
            )
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-stone-100 hover:bg-stone-200 text-zinc-700 rounded-xl font-bold transition cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
