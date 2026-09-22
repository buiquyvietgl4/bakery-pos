'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
  CreditCard,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import { CachedProduct } from '@/lib/db/dexie';
import { ManagerPinModal } from '@/components/pos/ManagerPinModal';
import {
  OrderReturnItem,
  OrderReturnRecord,
  ReturnReason,
  ReturnPaymentMethod,
  ExchangePaymentDetail,
} from '@/lib/types/orderReturn';
import { getVietqrConfig, VietqrConfig, VIETQR_UPDATED_EVENT } from '@/lib/utils/paymentSync';

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
  const [exchangePaymentMethod, setExchangePaymentMethod] = useState<ReturnPaymentMethod>('cash');

  // Trạng thái thanh toán bù khi đổi bánh
  const [exchangeCashGiven, setExchangeCashGiven] = useState<number | null>(null);
  const [exchangeTransferCode, setExchangeTransferCode] = useState<string>('');
  const [copiedAccountNo, setCopiedAccountNo] = useState(false);
  const [copiedTransferCode, setCopiedTransferCode] = useState(false);
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [splitTransferAmount, setSplitTransferAmount] = useState<number>(0);
  const [splitCashGiven, setSplitCashGiven] = useState<number | null>(null);

  // Cấu hình VietQR
  const [vietqrConfig, setVietqrConfig] = useState<VietqrConfig>(() => getVietqrConfig());

  useEffect(() => {
    const handleVietqrEvt = (e: any) => {
      if (e.detail) setVietqrConfig(e.detail);
    };
    window.addEventListener(VIETQR_UPDATED_EVENT, handleVietqrEvt);
    return () => window.removeEventListener(VIETQR_UPDATED_EVENT, handleVietqrEvt);
  }, []);

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

  const handleUpdateExchangeQty = (productId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveExchangeProduct(productId);
      return;
    }
    setExchangeProducts((prev) =>
      prev.map((ep) => (ep.product.id === productId ? { ...ep, quantity: newQty } : ep))
    );
  };

  const handleStepExchangeQty = (productId: string, delta: number) => {
    setExchangeProducts((prev) => {
      return prev
        .map((ep) => {
          if (ep.product.id === productId) {
            const nextQty = ep.quantity + delta;
            return nextQty > 0 ? { ...ep, quantity: nextQty } : null;
          }
          return ep;
        })
        .filter(Boolean) as Array<{ product: CachedProduct; quantity: number }>;
    });
  };

  const handleRemoveExchangeProduct = (productId: string) => {
    setExchangeProducts((prev) => prev.filter((ep) => ep.product.id !== productId));
  };

  // Tự động đồng bộ số tiền cần bù khi exchangeDifference thay đổi
  useEffect(() => {
    if (exchangeDifference > 0) {
      setExchangeCashGiven(exchangeDifference);
      const half = Math.round(exchangeDifference / 2);
      setSplitCashAmount(half);
      setSplitTransferAmount(exchangeDifference - half);
      setSplitCashGiven(half);
      if (!exchangeTransferCode) {
        const syntax = vietqrConfig.transferSyntax || 'DH';
        setExchangeTransferCode(`${syntax}-DT${Date.now().toString().slice(-6)}`);
      }
    }
  }, [exchangeDifference, vietqrConfig.transferSyntax]);

  const handleSplitCashChange = (val: number) => {
    const clamped = Math.max(0, Math.min(exchangeDifference, val));
    setSplitCashAmount(clamped);
    setSplitTransferAmount(exchangeDifference - clamped);
  };

  const handleSplitTransferChange = (val: number) => {
    const clamped = Math.max(0, Math.min(exchangeDifference, val));
    setSplitTransferAmount(clamped);
    setSplitCashAmount(exchangeDifference - clamped);
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

      const effectiveMethod: ReturnPaymentMethod =
        returnType === 'refund'
          ? refundMethod
          : exchangeDifference > 0
          ? exchangePaymentMethod
          : refundMethod;

      const exchangePaymentDetail: ExchangePaymentDetail | undefined =
        returnType === 'exchange' && exchangeDifference > 0
          ? {
              method: exchangePaymentMethod,
              cashAmount:
                exchangePaymentMethod === 'cash'
                  ? exchangeDifference
                  : exchangePaymentMethod === 'split'
                  ? splitCashAmount
                  : 0,
              transferAmount:
                exchangePaymentMethod === 'transfer'
                  ? exchangeDifference
                  : exchangePaymentMethod === 'split'
                  ? splitTransferAmount
                  : 0,
              cashGiven:
                exchangePaymentMethod === 'cash'
                  ? (exchangeCashGiven ?? exchangeDifference)
                  : exchangePaymentMethod === 'split'
                  ? (splitCashGiven ?? splitCashAmount)
                  : 0,
              changeAmount:
                exchangePaymentMethod === 'cash'
                  ? Math.max(0, (exchangeCashGiven ?? exchangeDifference) - exchangeDifference)
                  : exchangePaymentMethod === 'split'
                  ? Math.max(0, (splitCashGiven ?? splitCashAmount) - splitCashAmount)
                  : 0,
              transferCode:
                exchangePaymentMethod === 'transfer' || exchangePaymentMethod === 'split'
                  ? exchangeTransferCode
                  : undefined,
            }
          : undefined;

      const returnRecord: OrderReturnRecord = {
        id: `RET-${Date.now().toString().slice(-6)}`,
        order_id: orderId,
        order_number: orderNum,
        return_type: returnType,
        items: returnedItemsList,
        refund_amount: effectiveRefundAmount,
        refund_method: effectiveMethod,
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
        exchange_payment_detail: exchangePaymentDetail,
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
                            {it.quantity}x {it.product_name} ({it.unit_price.toLocaleString('vi-VN')}₫)
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
                        <div className="flex justify-between font-bold text-sm">
                          <span>Chênh lệch:</span>
                          <span
                            className={
                              completedReturnRecord.exchange_difference! > 0
                                ? 'text-emerald-700 font-black'
                                : completedReturnRecord.exchange_difference! < 0
                                ? 'text-rose-700 font-black'
                                : ''
                            }
                          >
                            {completedReturnRecord.exchange_difference! > 0
                              ? `Khách bù thêm: +${completedReturnRecord.exchange_difference!.toLocaleString('vi-VN')}₫`
                              : completedReturnRecord.exchange_difference! < 0
                              ? `Hoàn lại khách: ${Math.abs(completedReturnRecord.exchange_difference!).toLocaleString('vi-VN')}₫`
                              : 'Đổi ngang (0₫)'}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="text-[11px] text-zinc-600 pt-1 border-t border-dashed border-zinc-200">
                      {completedReturnRecord.return_type === 'refund' ||
                      (completedReturnRecord.exchange_difference || 0) < 0 ? (
                        <div>
                          Hình thức hoàn:{' '}
                          <b>
                            {completedReturnRecord.refund_method === 'cash'
                              ? '💵 Tiền mặt từ két'
                              : '🏦 Chuyển khoản ngân hàng'}
                          </b>
                        </div>
                      ) : (completedReturnRecord.exchange_difference || 0) > 0 ? (
                        <div className="space-y-0.5">
                          <div>
                            Khách bù bằng:{' '}
                            <b>
                              {completedReturnRecord.exchange_payment_detail?.method === 'cash'
                                ? '💵 Tiền mặt'
                                : completedReturnRecord.exchange_payment_detail?.method === 'transfer'
                                ? '🏦 Chuyển khoản VietQR'
                                : '💳 Kết hợp (Tiền mặt + Chuyển khoản)'}
                            </b>
                          </div>
                          {completedReturnRecord.exchange_payment_detail?.method === 'cash' && (
                            <div className="text-[10px] text-zinc-500">
                              (Khách đưa:{' '}
                              {(completedReturnRecord.exchange_payment_detail.cashGiven || 0).toLocaleString('vi-VN')}₫ •
                              Thối: {(completedReturnRecord.exchange_payment_detail.changeAmount || 0).toLocaleString('vi-VN')}₫)
                            </div>
                          )}
                          {completedReturnRecord.exchange_payment_detail?.method === 'split' && (
                            <div className="text-[10px] text-zinc-500">
                              (Tiền mặt: {(completedReturnRecord.exchange_payment_detail.cashAmount || 0).toLocaleString('vi-VN')}₫ •
                              Chuyển khoản: {(completedReturnRecord.exchange_payment_detail.transferAmount || 0).toLocaleString('vi-VN')}₫)
                            </div>
                          )}
                          {completedReturnRecord.exchange_payment_detail?.transferCode && (
                            <div className="text-[10px] text-zinc-500">
                              Mã GD: {completedReturnRecord.exchange_payment_detail.transferCode}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>Đổi ngang giá (0₫)</div>
                      )}
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
                        {exchangeProducts.length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-[11px] font-bold text-emerald-900">
                              Danh sách bánh đổi (có thể chỉnh số lượng tùy ý):
                            </div>
                            <div className="space-y-1.5">
                              {exchangeProducts.map((ep) => (
                                <div
                                  key={ep.product.id}
                                  className="p-2.5 bg-white rounded-xl border border-emerald-200 shadow-2xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="min-w-0 pr-2">
                                      <div className="font-bold text-xs text-zinc-900 truncate">{ep.product.name}</div>
                                      <div className="text-[10px] text-zinc-500">
                                        Đơn giá: <b className="text-emerald-700">{(ep.product.selling_price || 0).toLocaleString('vi-VN')}₫</b>
                                        {ep.product.stock_qty !== undefined && (
                                          <span className="ml-2 text-zinc-400">
                                            (Kho còn: {ep.product.stock_qty})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <div className="text-xs font-black text-emerald-800">
                                        {((ep.product.selling_price || 0) * ep.quantity).toLocaleString('vi-VN')}₫
                                      </div>
                                    </div>
                                  </div>

                                  {/* Bộ điều khiển số lượng (Tăng, Giảm, Nhập trực tiếp số lượng) */}
                                  <div className="flex items-center justify-between pt-1 border-t border-emerald-50">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[11px] font-semibold text-zinc-500">Số lượng:</span>
                                      <div className="flex items-center bg-stone-100 rounded-lg p-0.5 border border-stone-200">
                                        <button
                                          type="button"
                                          onClick={() => handleStepExchangeQty(ep.product.id, -1)}
                                          className="w-6 h-6 rounded-md bg-white hover:bg-stone-200 flex items-center justify-center text-zinc-700 transition cursor-pointer shadow-2xs"
                                          title="Giảm 1"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <input
                                          type="number"
                                          min="1"
                                          value={ep.quantity}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value, 10);
                                            if (!isNaN(val) && val > 0) {
                                              handleUpdateExchangeQty(ep.product.id, val);
                                            }
                                          }}
                                          className="w-12 text-center font-black text-xs bg-transparent text-zinc-900 focus:outline-none"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => handleStepExchangeQty(ep.product.id, 1)}
                                          className="w-6 h-6 rounded-md bg-white hover:bg-stone-200 flex items-center justify-center text-zinc-700 transition cursor-pointer shadow-2xs"
                                          title="Tăng 1"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <span className="text-[10px] text-zinc-400 font-bold">cái</span>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleRemoveExchangeProduct(ep.product.id)}
                                      className="px-2 py-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>Xóa</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 bg-white/70 rounded-xl border border-dashed border-emerald-300 text-center text-xs text-emerald-700 font-medium">
                            Chưa chọn món đổi nào. Vui lòng bấm vào danh sách bánh bên trên để thêm món khách muốn lấy.
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
                              <span>Giá trị các món đổi mới ({exchangeProducts.reduce((s, e) => s + e.quantity, 0)} cái):</span>
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
                                    ? `Khách bù thêm: +${exchangeDifference.toLocaleString('vi-VN')}₫`
                                    : exchangeDifference < 0
                                    ? `Hoàn lại khách: ${Math.abs(exchangeDifference).toLocaleString('vi-VN')}₫`
                                    : 'Đổi ngang (0₫)'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* KHI KHÁCH BÙ THÊM TIỀN (exchangeDifference > 0): ĐẦY ĐỦ CÁC PHƯƠNG THỨC THANH TOÁN */}
                        {returnType === 'exchange' && exchangeDifference > 0 && (
                          <div className="space-y-3 pt-2 border-t border-stone-200">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-zinc-800 flex items-center gap-1">
                                <span>Phương thức khách bù thêm (+{exchangeDifference.toLocaleString('vi-VN')}₫):</span>
                              </label>
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-black px-2 py-0.5 rounded-full">
                                Bù tiền mặt / QR / Kết hợp
                              </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setExchangePaymentMethod('cash');
                                  setExchangeCashGiven(exchangeDifference);
                                }}
                                className={`py-2 px-2 rounded-xl font-bold border transition flex flex-col items-center gap-1 text-xs cursor-pointer ${
                                  exchangePaymentMethod === 'cash'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                    : 'bg-white border-stone-200 text-zinc-700 hover:bg-stone-50'
                                }`}
                              >
                                <Banknote className="w-4 h-4" />
                                <span>Tiền mặt</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setExchangePaymentMethod('transfer');
                                  if (!exchangeTransferCode) {
                                    const syntax = vietqrConfig.transferSyntax || 'DH';
                                    setExchangeTransferCode(`${syntax}-DT${Date.now().toString().slice(-6)}`);
                                  }
                                }}
                                className={`py-2 px-2 rounded-xl font-bold border transition flex flex-col items-center gap-1 text-xs cursor-pointer ${
                                  exchangePaymentMethod === 'transfer'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                    : 'bg-white border-stone-200 text-zinc-700 hover:bg-stone-50'
                                }`}
                              >
                                <QrCode className="w-4 h-4" />
                                <span>Chuyển khoản QR</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setExchangePaymentMethod('split');
                                  const half = Math.round(exchangeDifference / 2);
                                  setSplitCashAmount(half);
                                  setSplitTransferAmount(exchangeDifference - half);
                                  setSplitCashGiven(half);
                                  if (!exchangeTransferCode) {
                                    const syntax = vietqrConfig.transferSyntax || 'DH';
                                    setExchangeTransferCode(`${syntax}-DT${Date.now().toString().slice(-6)}`);
                                  }
                                }}
                                className={`py-2 px-2 rounded-xl font-bold border transition flex flex-col items-center gap-1 text-xs cursor-pointer ${
                                  exchangePaymentMethod === 'split'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                    : 'bg-white border-stone-200 text-zinc-700 hover:bg-stone-50'
                                }`}
                              >
                                <CreditCard className="w-4 h-4" />
                                <span>Kết hợp (TM+CK)</span>
                              </button>
                            </div>

                            {/* 1. THANH TOÁN TIỀN MẶT KHI BÙ */}
                            {exchangePaymentMethod === 'cash' && (
                              <div className="space-y-2.5 p-3 bg-white rounded-xl border border-stone-200 shadow-2xs">
                                <div className="flex justify-between items-center text-xs">
                                  <span className="font-bold text-zinc-700">Tiền khách đưa:</span>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      value={exchangeCashGiven ?? exchangeDifference}
                                      onChange={(e) => setExchangeCashGiven(Number(e.target.value) || 0)}
                                      onFocus={(e) => e.target.select()}
                                      className="w-32 px-2.5 py-1 text-right font-black text-sm bg-stone-50 border border-zinc-200 rounded-lg text-zinc-900 focus:bg-white focus:outline-amber-500"
                                    />
                                    <span className="font-bold text-xs text-zinc-500">₫</span>
                                  </div>
                                </div>

                                {/* Gợi ý mệnh giá nhanh */}
                                <div className="flex flex-wrap gap-1.5 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => setExchangeCashGiven(exchangeDifference)}
                                    className="px-2 py-0.5 bg-stone-50 border border-stone-200 hover:border-amber-400 rounded-lg text-[10px] font-bold text-zinc-700 cursor-pointer"
                                  >
                                    Vừa đủ ({exchangeDifference.toLocaleString('vi-VN')}₫)
                                  </button>
                                  {[20000, 50000, 100000, 200000, 500000].map(
                                    (amt) =>
                                      amt >= exchangeDifference && (
                                        <button
                                          key={amt}
                                          type="button"
                                          onClick={() => setExchangeCashGiven(amt)}
                                          className="px-2 py-0.5 bg-stone-50 border border-stone-200 hover:border-amber-400 rounded-lg text-[10px] font-bold text-zinc-700 cursor-pointer"
                                        >
                                          {amt.toLocaleString('vi-VN')}₫
                                        </button>
                                      )
                                  )}
                                </div>

                                <div className="flex justify-between items-center pt-2 border-t border-stone-100 text-xs">
                                  <span className="font-bold text-zinc-500">Tiền thừa trả khách:</span>
                                  <span className="font-black text-sm text-emerald-600">
                                    {Math.max(0, (exchangeCashGiven ?? exchangeDifference) - exchangeDifference).toLocaleString('vi-VN')}₫
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* 2. CHUYỂN KHOẢN VIETQR KHI BÙ */}
                            {exchangePaymentMethod === 'transfer' && (
                              <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs space-y-2.5">
                                <div className="flex items-center justify-between text-xs pb-1 border-b border-blue-100">
                                  <span className="font-bold text-blue-900 flex items-center gap-1.5">
                                    <QrCode className="w-3.5 h-3.5 text-blue-600" /> Quét Mã VietQR Chuyển Khoản
                                  </span>
                                  <span className="font-black text-blue-700">
                                    {exchangeDifference.toLocaleString('vi-VN')}₫
                                  </span>
                                </div>

                                <div className="flex flex-col sm:flex-row items-center gap-3">
                                  <div className="w-32 h-32 shrink-0 bg-white p-1 rounded-xl border border-stone-200 shadow-xs flex items-center justify-center">
                                    <img
                                      src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-${vietqrConfig.template || 'compact2'}.jpg?amount=${exchangeDifference}&addInfo=${encodeURIComponent(exchangeTransferCode || `${vietqrConfig.transferSyntax || 'DH'}-DT${Date.now().toString().slice(-6)}`)}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                                      alt="VietQR Đổi Trả"
                                      className="w-full h-full object-contain rounded-lg"
                                    />
                                  </div>

                                  <div className="text-xs space-y-1.5 flex-1 min-w-0">
                                    <div className="flex justify-between">
                                      <span className="text-zinc-500">Ngân hàng:</span>
                                      <span className="font-bold text-zinc-900">{vietqrConfig.bankId}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-zinc-500">Số tài khoản:</span>
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono font-bold text-zinc-900">{vietqrConfig.accountNo}</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(vietqrConfig.accountNo);
                                            setCopiedAccountNo(true);
                                            setTimeout(() => setCopiedAccountNo(false), 2000);
                                          }}
                                          className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                                        >
                                          {copiedAccountNo ? '✓ Đã chép' : 'Chép'}
                                        </button>
                                      </div>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-zinc-500">Chủ tài khoản:</span>
                                      <span className="font-bold text-zinc-900 truncate max-w-[140px]">{vietqrConfig.accountName}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-zinc-500">Nội dung CK:</span>
                                      <div className="flex items-center gap-1">
                                        <span className="font-mono font-black text-amber-700">{exchangeTransferCode}</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            navigator.clipboard?.writeText(exchangeTransferCode);
                                            setCopiedTransferCode(true);
                                            setTimeout(() => setCopiedTransferCode(false), 2000);
                                          }}
                                          className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                                        >
                                          {copiedTransferCode ? '✓ Đã chép' : 'Chép'}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* 3. THANH TOÁN KẾT HỢP (TM + CK) KHI BÙ */}
                            {exchangePaymentMethod === 'split' && (
                              <div className="p-3 bg-white rounded-xl border border-amber-200 shadow-2xs space-y-3">
                                <div className="flex items-center justify-between text-xs pb-1 border-b border-amber-100">
                                  <span className="font-bold text-amber-950 flex items-center gap-1.5">
                                    <CreditCard className="w-3.5 h-3.5 text-amber-600" /> Kết hợp Tiền mặt + Chuyển khoản
                                  </span>
                                  <span className="font-black text-amber-800">
                                    Cần bù: {exchangeDifference.toLocaleString('vi-VN')}₫
                                  </span>
                                </div>

                                {/* Nút chia nhanh */}
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-[10px] font-bold text-zinc-500">Chia nhanh:</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const half = Math.round(exchangeDifference / 2);
                                      setSplitCashAmount(half);
                                      setSplitTransferAmount(exchangeDifference - half);
                                      setSplitCashGiven(half);
                                    }}
                                    className="px-2 py-0.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-[10px] font-bold text-zinc-800 cursor-pointer"
                                  >
                                    50% - 50%
                                  </button>
                                  {[20000, 50000, 100000, 200000].map(
                                    (c) =>
                                      c < exchangeDifference && (
                                        <button
                                          key={c}
                                          type="button"
                                          onClick={() => {
                                            setSplitCashAmount(c);
                                            setSplitTransferAmount(exchangeDifference - c);
                                            setSplitCashGiven(c);
                                          }}
                                          className="px-2 py-0.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-[10px] font-bold text-zinc-800 cursor-pointer"
                                        >
                                          TM {c >= 1000 ? `${c / 1000}k` : c}
                                        </button>
                                      )
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                  {/* Cột Tiền Mặt */}
                                  <div className="p-2 rounded-lg bg-amber-50/60 border border-amber-200 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-700 block">💵 Tiền mặt:</label>
                                    <input
                                      type="number"
                                      value={splitCashAmount}
                                      onChange={(e) => handleSplitCashChange(Number(e.target.value) || 0)}
                                      className="w-full px-2 py-1 text-right font-black text-xs bg-white border border-amber-300 rounded-md text-amber-950 focus:outline-amber-500"
                                    />
                                  </div>

                                  {/* Cột Chuyển Khoản */}
                                  <div className="p-2 rounded-lg bg-blue-50/60 border border-blue-200 space-y-1">
                                    <label className="text-[10px] font-bold text-zinc-700 block">🏦 Chuyển khoản:</label>
                                    <input
                                      type="number"
                                      value={splitTransferAmount}
                                      onChange={(e) => handleSplitTransferChange(Number(e.target.value) || 0)}
                                      className="w-full px-2 py-1 text-right font-black text-xs bg-white border border-blue-300 rounded-md text-blue-950 focus:outline-blue-500"
                                    />
                                  </div>
                                </div>

                                {/* Tiền khách đưa cho phần tiền mặt */}
                                {splitCashAmount > 0 && (
                                  <div className="p-2 rounded-lg bg-stone-50 border border-stone-200 flex justify-between items-center text-xs">
                                    <span className="font-bold text-zinc-600 text-[11px]">Khách đưa tiền mặt:</span>
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        value={splitCashGiven ?? splitCashAmount}
                                        onChange={(e) => setSplitCashGiven(Number(e.target.value) || 0)}
                                        onFocus={(e) => e.target.select()}
                                        className="w-24 px-2 py-0.5 text-right font-black text-xs bg-white border border-stone-300 rounded-md"
                                      />
                                      <span className="font-bold text-[11px] text-zinc-500">₫</span>
                                    </div>
                                  </div>
                                )}

                                {/* Mã VietQR cho phần chuyển khoản nếu có */}
                                {splitTransferAmount > 0 && (
                                  <div className="flex items-center gap-2.5 p-2 bg-blue-50/50 rounded-lg border border-blue-200">
                                    <img
                                      src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-${vietqrConfig.template || 'compact2'}.jpg?amount=${splitTransferAmount}&addInfo=${encodeURIComponent(exchangeTransferCode || `${vietqrConfig.transferSyntax || 'DH'}-DT${Date.now().toString().slice(-6)}`)}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                                      alt="VietQR Chia Tiền"
                                      className="w-16 h-16 object-contain bg-white rounded border border-blue-200 p-0.5"
                                    />
                                    <div className="text-[11px] space-y-0.5 flex-1 min-w-0">
                                      <div className="font-bold text-blue-900">Mã QR Chuyển Khoản {splitTransferAmount.toLocaleString('vi-VN')}₫</div>
                                      <div className="text-zinc-600 truncate">{vietqrConfig.bankId} • {vietqrConfig.accountNo}</div>
                                      <div className="font-mono text-[10px] text-amber-700 font-bold">ND: {exchangeTransferCode}</div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* KHI HOÀN TIỀN (returnType === 'refund' HOẶC exchangeDifference < 0) */}
                        {(returnType === 'refund' || exchangeDifference < 0) && (
                          <div className="space-y-2 pt-2 border-t border-stone-200">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-zinc-700">Hình thức hoàn tiền lại cho khách:</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setRefundMethod('cash')}
                                className={`py-2 px-3 rounded-xl font-bold border transition flex items-center justify-center gap-1.5 text-xs cursor-pointer ${
                                  refundMethod === 'cash'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                    : 'bg-white border-stone-200 text-zinc-700 hover:bg-stone-50'
                                }`}
                              >
                                <Banknote className="w-3.5 h-3.5" /> Tiền mặt từ két
                              </button>
                              <button
                                type="button"
                                onClick={() => setRefundMethod('transfer')}
                                className={`py-2 px-3 rounded-xl font-bold border transition flex items-center justify-center gap-1.5 text-xs cursor-pointer ${
                                  refundMethod === 'transfer'
                                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                    : 'bg-white border-stone-200 text-zinc-700 hover:bg-stone-50'
                                }`}
                              >
                                <QrCode className="w-3.5 h-3.5" /> Chuyển khoản ngân hàng
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
