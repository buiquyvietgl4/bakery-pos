'use client';

import React, { useState, useMemo } from 'react';
import {
  RotateCcw,
  X,
  Search,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Plus,
  Minus,
  ArrowRight,
  ShieldCheck,
  Printer,
  ShoppingBag,
  Clock,
  User,
  Phone,
  Banknote,
  QrCode,
  Layers,
  Sparkles,
} from 'lucide-react';
import { CachedProduct } from '@/lib/db/dexie';
import { ManagerPinModal } from '@/components/pos/ManagerPinModal';
import { OrderReturnItem, OrderReturnRecord, ReturnReason } from '@/lib/types/orderReturn';

interface ReturnExchangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOrder?: any | null;
  ordersList: any[];
  availableProducts: CachedProduct[];
  cashierName: string;
  onExecuteReturn: (returnRecord: OrderReturnRecord) => Promise<void> | void;
}

export const ReturnExchangeModal: React.FC<ReturnExchangeModalProps> = ({
  isOpen,
  onClose,
  initialOrder,
  ordersList,
  availableProducts,
  cashierName,
  onExecuteReturn,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<any | null>(() => initialOrder || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [returnType, setReturnType] = useState<'refund' | 'exchange'>('refund');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'transfer'>('cash');
  const [exchangePaymentMethod, setExchangePaymentMethod] = useState<'cash' | 'transfer'>('cash');

  // Trạng thái các món trả lại: Map<itemIndex, { qty: number, reason: ReturnReason, restocked: boolean, notes: string }>
  const [returnItemsState, setReturnItemsState] = useState<
    Record<
      number,
      {
        qty: number;
        reason: ReturnReason;
        restocked: boolean;
        notes: string;
      }
    >
  >({});

  // Trạng thái món đổi mới (nếu là exchange)
  const [exchangeProducts, setExchangeProducts] = useState<
    Array<{
      product: CachedProduct;
      quantity: number;
    }>
  >([]);
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState('');

  // Quản lý PIN bảo mật
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Phiếu hoàn tất đã in
  const [completedReturnRecord, setCompletedReturnRecord] = useState<OrderReturnRecord | null>(null);

  // Tự động nạp initialOrder khi prop thay đổi
  React.useEffect(() => {
    if (initialOrder) {
      setSelectedOrder(initialOrder);
      setReturnItemsState({});
      setExchangeProducts([]);
      setCompletedReturnRecord(null);
    }
  }, [initialOrder]);

  // Lọc tìm hóa đơn
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return ordersList.slice(0, 8);
    const q = searchQuery.toLowerCase().trim();
    return ordersList.filter((o) => {
      const num = (o.order_number || o.orderNumber || '').toLowerCase();
      const phone = (o.customer_phone || o.customerPhone || '').toLowerCase();
      const name = (o.customer_name || o.customerName || '').toLowerCase();
      return num.includes(q) || phone.includes(q) || name.includes(q);
    });
  }, [ordersList, searchQuery]);

  // Lọc sản phẩm đổi
  const filteredExchangeProducts = useMemo(() => {
    if (!exchangeSearchQuery.trim()) return availableProducts.slice(0, 10);
    const q = exchangeSearchQuery.toLowerCase().trim();
    return availableProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [availableProducts, exchangeSearchQuery]);

  // Danh sách món trong đơn đã chọn
  const orderItems = useMemo(() => {
    if (!selectedOrder) return [];
    if (Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0) {
      return selectedOrder.items;
    }
    return [
      {
        product_name_snapshot: selectedOrder.cakeName || 'Đơn bánh',
        quantity: 1,
        unit_price: selectedOrder.total_amount || selectedOrder.totalPrice || 0,
      },
    ];
  }, [selectedOrder]);

  // Tính tổng tiền hoàn lại từ các món đã chọn trả
  const refundTotalAmount = useMemo(() => {
    let sum = 0;
    orderItems.forEach((it: any, idx: number) => {
      const state = returnItemsState[idx];
      if (state && state.qty > 0) {
        const price = Number(
          it.unit_price ||
          it.product?.selling_price ||
          it.price ||
          it.unitPrice ||
          (it.quantity ? (Number(it.line_total || it.total_price || selectedOrder?.total_amount || 0) / Number(it.quantity)) : 0) ||
          0
        );
        sum += price * state.qty;
      }
    });

    // Nếu đơn có giảm giá %, áp giảm giá tỷ lệ lên số tiền hoàn
    if (selectedOrder) {
      const discountPct = Number(selectedOrder.discount_pct || selectedOrder.discountPercent || 0);
      if (discountPct > 0) {
        sum = Math.round(sum * (1 - discountPct / 100));
      }
    }
    return sum;
  }, [orderItems, returnItemsState, selectedOrder]);

  // Tổng tiền các món đổi mới
  const exchangeTotalAmount = useMemo(() => {
    return exchangeProducts.reduce((s, ep) => s + (ep.product.selling_price || 0) * ep.quantity, 0);
  }, [exchangeProducts]);

  // Chênh lệch tiền (Exchange difference)
  // > 0: Khách cần đóng thêm, < 0: Tiệm hoàn lại cho khách, = 0: Đổi ngang
  const exchangeDifference = useMemo(() => {
    return exchangeTotalAmount - refundTotalAmount;
  }, [exchangeTotalAmount, refundTotalAmount]);

  const hasAnyItemSelected = useMemo(() => {
    return Object.values(returnItemsState).some((s) => s.qty > 0);
  }, [returnItemsState]);

  const handleItemQtyChange = (idx: number, delta: number, maxQty: number) => {
    setReturnItemsState((prev) => {
      const current = prev[idx] || {
        qty: 0,
        reason: 'customer_changed_mind',
        restocked: true,
        notes: '',
      };
      const newQty = Math.max(0, Math.min(maxQty, current.qty + delta));
      return {
        ...prev,
        [idx]: { ...current, qty: newQty },
      };
    });
  };

  const handleItemReasonChange = (idx: number, reason: ReturnReason) => {
    setReturnItemsState((prev) => {
      const current = prev[idx] || {
        qty: 1,
        reason,
        restocked: reason === 'customer_changed_mind' || reason === 'wrong_item',
        notes: '',
      };
      // Mặc định: bánh hỏng hoặc hết hạn thì KHÔNG nhập lại kho (restocked = false)
      const restocked = reason !== 'damaged' && reason !== 'expired';
      return {
        ...prev,
        [idx]: { ...current, reason, restocked },
      };
    });
  };

  const handleItemRestockToggle = (idx: number) => {
    setReturnItemsState((prev) => {
      const current = prev[idx];
      if (!current) return prev;
      return {
        ...prev,
        [idx]: { ...current, restocked: !current.restocked },
      };
    });
  };

  const handleAddExchangeProduct = (p: CachedProduct) => {
    setExchangeProducts((prev) => {
      const exist = prev.find((ep) => ep.product.id === p.id);
      if (exist) {
        return prev.map((ep) => (ep.product.id === p.id ? { ...ep, quantity: ep.quantity + 1 } : ep));
      }
      return [...prev, { product: p, quantity: 1 }];
    });
  };

  const handleRemoveExchangeProduct = (productId: string) => {
    setExchangeProducts((prev) => prev.filter((ep) => ep.product.id !== productId));
  };

  const handleConfirmAction = () => {
    if (!selectedOrder) return;
    if (!hasAnyItemSelected) return;
    if (returnType === 'exchange' && exchangeProducts.length === 0) return;

    // Yêu cầu nhập PIN Quản Lý
    setIsPinModalOpen(true);
  };

  const handlePinSuccess = async () => {
    setIsPinModalOpen(false);
    setIsProcessing(true);

    try {
      const orderNum = selectedOrder.order_number || selectedOrder.orderNumber;
      const orderId = selectedOrder.id || orderNum;

      // Chuẩn hóa danh sách các món hoàn trả
      const returnedItemsList: OrderReturnItem[] = [];
      orderItems.forEach((it: any, idx: number) => {
        const state = returnItemsState[idx];
        if (state && state.qty > 0) {
          const uPrice = Number(
            it.unit_price ||
            it.product?.selling_price ||
            it.price ||
            it.unitPrice ||
            (it.quantity ? (Number(it.line_total || it.total_price || selectedOrder?.total_amount || 0) / Number(it.quantity)) : 0) ||
            0
          );
          returnedItemsList.push({
            id: it.id || `item-${idx}`,
            product_id: it.product_id || it.product?.id,
            product_name: it.product_name_snapshot || it.product?.name || it.name || 'Sản phẩm',
            quantity: state.qty,
            unit_price: uPrice,
            refund_subtotal: uPrice * state.qty,
            restocked: state.restocked,
            condition: state.reason === 'damaged' || state.reason === 'expired' ? 'damaged' : 'intact',
            reason: state.reason,
            notes: state.notes,
          });
        }
      });

      const effectiveRefundAmount = returnType === 'refund' ? refundTotalAmount : Math.max(0, -exchangeDifference);

      const returnRecord: OrderReturnRecord = {
        id: `RET-${Date.now().toString().slice(-6)}`,
        order_id: orderId,
        order_number: orderNum,
        return_type: returnType,
        items: returnedItemsList,
        refund_amount: effectiveRefundAmount,
        refund_method: returnType === 'refund' ? refundMethod : exchangePaymentMethod,
        exchange_replacement_items:
          returnType === 'exchange'
            ? exchangeProducts.map((ep) => ({
                product_id: ep.product.id,
                product_name: ep.product.name,
                quantity: ep.quantity,
                unit_price: ep.product.selling_price || 0,
                line_total: (ep.product.selling_price || 0) * ep.quantity,
              }))
            : undefined,
        exchange_difference: returnType === 'exchange' ? exchangeDifference : undefined,
        reason_summary: returnedItemsList.map((ri) => `${ri.quantity}x ${ri.product_name} (${ri.reason})`).join(', '),
        approved_by: cashierName,
        created_at: new Date().toISOString(),
      };

      await onExecuteReturn(returnRecord);
      setCompletedReturnRecord(returnRecord);
    } catch (err) {
      console.error('Lỗi khi thực hiện đổi trả:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-stone-950/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl flex flex-col max-h-[92dvh] animate-in zoom-in duration-200 border border-stone-200/60">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shadow-xs">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-lg text-zinc-900 leading-none">Đổi Trả Hàng & Hoàn Tiền</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Xử lý trả hàng hoàn tiền, đổi món bánh, hoàn nhập kho hoặc ghi nhận hao hụt
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

          {/* NỘI DUNG CHÍNH */}
          <div className="overflow-y-auto flex-1 py-3 space-y-4 pr-1 overscroll-contain">
            {completedReturnRecord ? (
              /* PHIẾU HOÀN TẤT ĐỔI TRẢ & IN BIÊN NHẬN */
              <div className="space-y-4 text-center py-4">
                <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="font-black text-xl text-zinc-900">
                  {completedReturnRecord.return_type === 'refund'
                    ? 'Đã Hoàn Tiền Thành Công!'
                    : 'Đã Đổi Món Bánh Thành Công!'}
                </h4>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Giao dịch đổi trả mã <b>{completedReturnRecord.id}</b> đã được lưu vào hệ thống, hạch toán két ca bán và
                  đồng bộ CSDL SQL.
                </p>

                {/* Printable Receipt Box */}
                <div
                  id="printable-return-receipt"
                  className="max-w-md mx-auto p-4 bg-amber-50/50 rounded-2xl border border-zinc-300 text-left font-mono text-xs space-y-2.5 text-zinc-800"
                >
                  <div className="text-center pb-2 border-b border-dashed border-zinc-300">
                    <div className="font-black text-sm uppercase">PHIẾU XÁC NHẬN ĐỔI TRẢ</div>
                    <div className="text-[10px] text-zinc-500">Mã phiếu: {completedReturnRecord.id}</div>
                    <div className="text-[10px] text-zinc-500">Đơn gốc: #{completedReturnRecord.order_number}</div>
                    <div className="text-[10px] text-zinc-500">
                      Thời gian: {new Date(completedReturnRecord.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="font-bold text-[11px] text-rose-800">MÓN TRẢ LẠI:</div>
                    {completedReturnRecord.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>
                          {it.quantity}x {it.product_name}
                        </span>
                        <span className="font-bold">-{it.refund_subtotal.toLocaleString('vi-VN')}₫</span>
                      </div>
                    ))}
                  </div>

                  {completedReturnRecord.exchange_replacement_items && (
                    <div className="space-y-1 pt-1.5 border-t border-dashed border-zinc-300">
                      <div className="font-bold text-[11px] text-emerald-800">MÓN ĐỔI MỚI:</div>
                      {completedReturnRecord.exchange_replacement_items.map((it, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {it.quantity}x {it.product_name}
                          </span>
                          <span className="font-bold">+{it.line_total.toLocaleString('vi-VN')}₫</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t-2 border-zinc-400 space-y-1">
                    {completedReturnRecord.return_type === 'refund' ? (
                      <div className="flex justify-between text-sm font-black text-rose-700">
                        <span>TỔNG TIỀN HOÀN LẠI:</span>
                        <span>{completedReturnRecord.refund_amount.toLocaleString('vi-VN')}₫</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between font-bold">
                          <span>Chênh lệch:</span>
                          <span>
                            {completedReturnRecord.exchange_difference! > 0
                              ? `Khách đóng thêm: +${completedReturnRecord.exchange_difference!.toLocaleString('vi-VN')}₫`
                              : completedReturnRecord.exchange_difference! < 0
                              ? `Hoàn lại khách: ${completedReturnRecord.exchange_difference!.toLocaleString('vi-VN')}₫`
                              : 'Đổi ngang (0₫)'}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="text-[10px] text-zinc-500">
                      Hình thức:{' '}
                      {completedReturnRecord.refund_method === 'cash'
                        ? '💵 Tiền mặt từ két'
                        : '🏦 Chuyển khoản ngân hàng'}
                    </div>
                    <div className="text-[10px] text-zinc-500">Duyệt bởi: {completedReturnRecord.approved_by}</div>
                  </div>
                </div>

                <div className="flex justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const printEl = document.getElementById('printable-return-receipt');
                      if (printEl) {
                        const win = window.open('', '', 'width=400,height=600');
                        if (win) {
                          win.document.write(`<html><head><title>Phiếu Đổi Trả</title><style>body{font-family:monospace;padding:16px;font-size:12px;}</style></head><body>${printEl.outerHTML}</body></html>`);
                          win.document.close();
                          win.print();
                        }
                      }
                    }}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>In Phiếu Đổi Trả</span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-zinc-700 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* 1. KHU VỰC TÌM KIẾM / CHỌN HÓA ĐƠN NẾU CHƯA CHỌN */}
                {!selectedOrder ? (
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-zinc-700 block">
                      Tìm kiếm hóa đơn cần đổi trả (nhập mã đơn hoặc số điện thoại):
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="VD: BK-260922-01 hoặc 0988..."
                        className="w-full pl-9 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-amber-500"
                      />
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {filteredOrders.length === 0 ? (
                        <div className="text-center py-6 text-zinc-400 text-xs">
                          Không tìm thấy hóa đơn nào phù hợp
                        </div>
                      ) : (
                        filteredOrders.map((o) => (
                          <div
                            key={o.id || o.order_number}
                            onClick={() => setSelectedOrder(o)}
                            className="p-3 bg-stone-50 hover:bg-amber-50/80 border border-stone-200 hover:border-amber-400 rounded-2xl flex items-center justify-between cursor-pointer transition"
                          >
                            <div className="flex items-center gap-2.5">
                              <Receipt className="w-4 h-4 text-zinc-400" />
                              <div>
                                <div className="font-bold text-xs text-zinc-900">
                                  #{o.order_number || o.orderNumber}
                                </div>
                                <div className="text-[11px] text-zinc-500">
                                  {o.customer_name || o.customerName || 'Khách vãng lai'}{' '}
                                  {o.customer_phone ? `(${o.customer_phone})` : ''}
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="font-black text-xs text-amber-700">
                                {(o.total_amount || o.totalPrice || 0).toLocaleString('vi-VN')}₫
                              </div>
                              <div className="text-[10px] text-zinc-400">
                                {new Date(o.created_at || Date.now()).toLocaleDateString('vi-VN')}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  /* 2. ĐÃ CHỌN HÓA ĐƠN -> HIỂN THỊ CHI TIẾT & CHỌN MÓN */
                  <div className="space-y-4">
                    {/* Header hóa đơn đã chọn */}
                    <div className="p-3.5 bg-gradient-to-r from-stone-50 to-amber-50/50 rounded-2xl border border-stone-200/90 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs px-2 py-0.5 rounded-lg bg-amber-600 text-white">
                            #{selectedOrder.order_number || selectedOrder.orderNumber}
                          </span>
                          <span className="font-bold text-xs text-zinc-900">
                            {selectedOrder.customer_name || selectedOrder.customerName || 'Khách vãng lai'}
                          </span>
                          {selectedOrder.customer_phone && (
                            <span className="text-xs text-zinc-500">({selectedOrder.customer_phone})</span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-500 mt-1">
                          Tổng tiền đơn:{' '}
                          <b className="text-amber-800">
                            {(selectedOrder.total_amount || selectedOrder.totalPrice || 0).toLocaleString('vi-VN')}₫
                          </b>{' '}
                          • PT thanh toán:{' '}
                          <b>
                            {selectedOrder.payment_method === 'cash'
                              ? 'Tiền mặt'
                              : selectedOrder.payment_method === 'split'
                              ? 'Kết hợp TM+CK'
                              : 'Chuyển khoản'}
                          </b>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrder(null);
                          setReturnItemsState({});
                          setExchangeProducts([]);
                        }}
                        className="text-xs text-amber-800 font-bold hover:underline cursor-pointer"
                      >
                        Chọn đơn khác
                      </button>
                    </div>

                    {/* Lựa chọn loại hình đổi trả */}
                    <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-2xl">
                      <button
                        type="button"
                        onClick={() => setReturnType('refund')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          returnType === 'refund'
                            ? 'bg-white text-rose-700 shadow-sm border border-rose-200'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Trả Hàng & Hoàn Tiền (Refund)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReturnType('exchange')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          returnType === 'exchange'
                            ? 'bg-white text-emerald-700 shadow-sm border border-emerald-200'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Đổi Sang Bánh Khác (Exchange)</span>
                      </button>
                    </div>

                    {/* BẢNG CHỌN MÓN CẦN TRẢ */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-zinc-700">
                        <span>1. Chọn các món khách trả lại:</span>
                        <span className="text-[11px] text-zinc-400">Chọn số lượng {'>'} 0 để hoàn trả</span>
                      </div>

                      <div className="space-y-2">
                        {orderItems.map((it: any, idx: number) => {
                          const state = returnItemsState[idx] || {
                            qty: 0,
                            reason: 'customer_changed_mind' as ReturnReason,
                            restocked: true,
                            notes: '',
                          };
                          const maxQty = Number(it.quantity || 1);
                          const unitPrice = Number(
                            it.unit_price ||
                            it.product?.selling_price ||
                            it.price ||
                            it.unitPrice ||
                            (it.quantity ? (Number(it.line_total || it.total_price || selectedOrder?.total_amount || 0) / Number(it.quantity)) : 0) ||
                            0
                          );

                          return (
                            <div
                              key={idx}
                              className={`p-3 rounded-2xl border transition ${
                                state.qty > 0
                                  ? 'bg-rose-50/40 border-rose-300 ring-1 ring-rose-200'
                                  : 'bg-stone-50/70 border-stone-200/80'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-bold text-xs text-zinc-900">
                                    {it.product_name_snapshot || it.product?.name || it.name || 'Bánh'}
                                  </div>
                                  <div className="text-[11px] text-zinc-500">
                                    Đã mua: <b>{maxQty} cái</b> • Giá: {unitPrice.toLocaleString('vi-VN')}₫/cái
                                  </div>
                                </div>

                                {/* Bộ đếm số lượng trả */}
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center bg-white border border-stone-200 rounded-xl p-0.5">
                                    <button
                                      type="button"
                                      disabled={state.qty === 0}
                                      onClick={() => handleItemQtyChange(idx, -1, maxQty)}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:bg-stone-100 disabled:opacity-30 cursor-pointer"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="w-8 text-center font-black text-xs text-zinc-900">
                                      {state.qty}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={state.qty >= maxQty}
                                      onClick={() => handleItemQtyChange(idx, 1, maxQty)}
                                      className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-600 hover:bg-stone-100 disabled:opacity-30 cursor-pointer"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Tùy chọn lý do & kho khi món được chọn */}
                              {state.qty > 0 && (
                                <div className="mt-2.5 pt-2 border-t border-rose-200/70 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <label className="text-[10px] font-bold text-zinc-600 block mb-0.5">
                                      Lý do trả hàng:
                                    </label>
                                    <select
                                      value={state.reason}
                                      onChange={(e) => handleItemReasonChange(idx, e.target.value as ReturnReason)}
                                      className="w-full px-2 py-1 bg-white border border-rose-200 rounded-lg text-xs font-semibold text-zinc-800"
                                    >
                                      <option value="customer_changed_mind">Khách đổi ý / muốn đổi món</option>
                                      <option value="damaged">Bánh bị lỗi / móp méo / hỏng</option>
                                      <option value="expired">Bánh cận hạn / quá hạn</option>
                                      <option value="wrong_item">Thu ngân lấy nhầm món</option>
                                      <option value="other">Lý do khác</option>
                                    </select>
                                  </div>

                                  <div>
                                    <label className="text-[10px] font-bold text-zinc-600 block mb-0.5">
                                      Xử lý tồn kho:
                                    </label>
                                    <div
                                      onClick={() => handleItemRestockToggle(idx)}
                                      className="px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg flex items-center gap-2 cursor-pointer hover:bg-stone-50"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={state.restocked}
                                        onChange={() => {}}
                                        className="rounded text-amber-600"
                                      />
                                      <span className="text-[11px] font-medium text-zinc-800">
                                        {state.restocked ? '✓ Nhập hoàn lại kho bán' : '⚠️ Bánh hỏng (Đưa vào hao hụt)'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* NẾU LÀ ĐỔI SANG MÓN KHÁC (EXCHANGE): CHỌN BÁNH MỚI */}
                    {returnType === 'exchange' && hasAnyItemSelected && (
                      <div className="space-y-3 p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-200/80">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                            <ShoppingBag className="w-4 h-4 text-emerald-600" />
                            2. Chọn món bánh khách đổi sang:
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            {exchangeProducts.length} món đổi
                          </span>
                        </div>

                        {/* Search món đổi */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                          <input
                            type="text"
                            value={exchangeSearchQuery}
                            onChange={(e) => setExchangeSearchQuery(e.target.value)}
                            placeholder="Gõ tên bánh để tìm nhanh..."
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-emerald-200 rounded-xl text-xs focus:outline-emerald-500"
                          />
                        </div>

                        {/* Gợi ý món đổi */}
                        <div className="flex gap-1.5 overflow-x-auto pb-1">
                          {filteredExchangeProducts.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleAddExchangeProduct(p)}
                              className="px-2.5 py-1.5 rounded-xl bg-white border border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 text-left shrink-0 transition cursor-pointer text-xs"
                            >
                              <div className="font-bold text-zinc-900 truncate max-w-[130px]">{p.name}</div>
                              <div className="text-[10px] font-black text-emerald-700">
                                {(p.selling_price || 0).toLocaleString('vi-VN')}₫
                              </div>
                            </button>
                          ))}
                        </div>

                        {/* Danh sách món đổi đã chọn */}
                        {exchangeProducts.length > 0 && (
                          <div className="bg-white rounded-xl p-2 border border-emerald-200 divide-y divide-emerald-100 text-xs">
                            {exchangeProducts.map((ep) => (
                              <div key={ep.product.id} className="flex items-center justify-between py-1.5">
                                <div>
                                  <span className="font-bold text-zinc-900">{ep.product.name}</span>
                                  <span className="text-zinc-500 text-[10px] ml-2">
                                    {(ep.product.selling_price || 0).toLocaleString('vi-VN')}₫
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-emerald-700">x{ep.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveExchangeProduct(ep.product.id)}
                                    className="text-rose-500 hover:text-rose-700 p-1"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* CARD TỔNG KẾT TÀI CHÍNH & PHƯƠNG THỨC HOÀN/THU */}
                    {hasAnyItemSelected && (
                      <div className="p-3.5 bg-stone-50 rounded-2xl border-2 border-stone-200 space-y-3">
                        <div className="text-xs space-y-1.5">
                          <div className="flex justify-between text-zinc-600">
                            <span>Giá trị các món trả lại:</span>
                            <span className="font-bold text-rose-700">
                              -{refundTotalAmount.toLocaleString('vi-VN')}₫
                            </span>
                          </div>

                          {returnType === 'exchange' && (
                            <div className="flex justify-between text-zinc-600">
                              <span>Giá trị các món đổi mới:</span>
                              <span className="font-bold text-emerald-700">
                                +{exchangeTotalAmount.toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                          )}

                          {/* Dòng kết luận thanh toán */}
                          <div className="pt-2 border-t border-stone-200 flex justify-between items-center text-sm font-black">
                            {returnType === 'refund' ? (
                              <>
                                <span className="text-rose-900 uppercase">SỐ TIỀN HOÀN LẠI KHÁCH:</span>
                                <span className="text-xl text-rose-700">
                                  {refundTotalAmount.toLocaleString('vi-VN')}₫
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-zinc-800 uppercase">CHÊNH LỆCH THANH TOÁN:</span>
                                <span
                                  className={`text-xl ${
                                    exchangeDifference > 0
                                      ? 'text-emerald-700'
                                      : exchangeDifference < 0
                                      ? 'text-rose-700'
                                      : 'text-zinc-700'
                                  }`}
                                >
                                  {exchangeDifference > 0
                                    ? `Khách trả thêm: +${exchangeDifference.toLocaleString('vi-VN')}₫`
                                    : exchangeDifference < 0
                                    ? `Hoàn lại khách: ${Math.abs(exchangeDifference).toLocaleString('vi-VN')}₫`
                                    : 'Đổi ngang (0₫)'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Lựa chọn hình thức hoàn/thu tiền */}
                        {(returnType === 'refund' || exchangeDifference !== 0) && (
                          <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-xs">
                            <span className="font-bold text-zinc-700">
                              {returnType === 'refund' || exchangeDifference < 0
                                ? 'Hình thức hoàn tiền:'
                                : 'Khách trả thêm bằng:'}
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  returnType === 'refund'
                                    ? setRefundMethod('cash')
                                    : setExchangePaymentMethod('cash')
                                }
                                className={`px-3 py-1.5 rounded-xl font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                                  (returnType === 'refund' ? refundMethod : exchangePaymentMethod) === 'cash'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                                    : 'bg-white border-stone-200 text-zinc-700 hover:bg-stone-100'
                                }`}
                              >
                                <Banknote className="w-3.5 h-3.5" /> Tiền mặt từ két
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  returnType === 'refund'
                                    ? setRefundMethod('transfer')
                                    : setExchangePaymentMethod('transfer')
                                }
                                className={`px-3 py-1.5 rounded-xl font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                                  (returnType === 'refund' ? refundMethod : exchangePaymentMethod) === 'transfer'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                                    : 'bg-white border-stone-200 text-zinc-700 hover:bg-stone-100'
                                }`}
                              >
                                <QrCode className="w-3.5 h-3.5" /> Chuyển khoản
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Actions */}
          {!completedReturnRecord && (
            <div className="flex gap-3 pt-3 border-t border-zinc-100 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={!selectedOrder || !hasAnyItemSelected || isProcessing}
                onClick={handleConfirmAction}
                className="flex-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs sm:text-sm font-black shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {isProcessing
                    ? 'Đang xử lý...'
                    : returnType === 'refund'
                    ? `Duyệt Hoàn Tiền (${refundTotalAmount.toLocaleString('vi-VN')}₫)`
                    : `Duyệt Đổi Bánh (Lệch: ${exchangeDifference.toLocaleString('vi-VN')}₫)`}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal PIN Quản Lý Phê Duyệt */}
      <ManagerPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        title="Duyệt Đổi Trả / Hoàn Tiền"
        subtitle="Vui lòng nhập mã PIN Quản Lý để xác nhận xuất quỹ hoàn tiền hoặc điều chỉnh đơn"
        actionDescription={`Duyệt giao dịch ${returnType === 'refund' ? 'Hoàn tiền' : 'Đổi hàng'} cho đơn #${
          selectedOrder?.order_number || selectedOrder?.orderNumber
        }`}
      />
    </>
  );
};
