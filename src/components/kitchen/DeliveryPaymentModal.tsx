'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  X, CheckCircle2, Banknote, QrCode, Copy, Check, 
  MapPin, Phone, User, Cake, AlertCircle, Sparkles,
  Camera, RefreshCw, ShieldCheck, ArrowRight, Clock
} from 'lucide-react';
import { parsePreorderFromNotes, broadcastTransferApprovalRequest, subscribeCrossDeviceSync, TransferApprovalPayload, TransferApprovalResolvedPayload, parseOrderBakeShortage } from '@/lib/supabase/realtimeSync';
import { getTransferVerificationConfig, TransferVerificationConfig, TRANSFER_VERIFY_UPDATED_EVENT } from '@/lib/utils/paymentSync';
import { TransferProofCameraModal } from '@/components/pos/TransferProofCameraModal';
import { useAuth } from '@/lib/auth/AuthContext';
import { soundManager } from '@/lib/utils/audioAlert';

export interface DeliveryPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  vietqrConfig?: any;
  onConfirmPaymentAndComplete: (order: any, method: 'cash' | 'bank_transfer', proofImageBase64?: string) => void;
}

export const DeliveryPaymentModal: React.FC<DeliveryPaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  vietqrConfig,
  onConfirmPaymentAndComplete,
}) => {
  const { user, isAdmin } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer'>('cash');
  const [copiedAccountNo, setCopiedAccountNo] = useState(false);
  const [copiedSyntax, setCopiedSyntax] = useState(false);

  // Cấu hình xác thực chuyển khoản
  const [transferVerifyConfig, setTransferVerifyConfig] = useState<TransferVerificationConfig>(() => getTransferVerificationConfig());
  const [isWaitingAdminApproval, setIsWaitingAdminApproval] = useState(false);
  const [adminApproved, setAdminApproved] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  // Modal Camera chụp bill khẩn cấp
  const [isProofCameraOpen, setIsProofCameraOpen] = useState(false);
  const [proofImage, setProofImage] = useState<string | null>(null);

  const activeOrderNumRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen && order) {
      setPaymentMethod('cash');
      setCopiedAccountNo(false);
      setCopiedSyntax(false);
      setIsWaitingAdminApproval(false);
      setAdminApproved(false);
      setResendStatus(null);
      setProofImage(null);
      setIsProofCameraOpen(false);
      activeOrderNumRef.current = order.order_number;
    }
  }, [isOpen, order]);

  // Lắng nghe cập nhật cấu hình xác thực
  useEffect(() => {
    const handleConfigUpdate = (e: any) => {
      if (e.detail) setTransferVerifyConfig(e.detail);
      else setTransferVerifyConfig(getTransferVerificationConfig());
    };
    window.addEventListener(TRANSFER_VERIFY_UPDATED_EVENT, handleConfigUpdate);
    return () => window.removeEventListener(TRANSFER_VERIFY_UPDATED_EVENT, handleConfigUpdate);
  }, []);

  // Lắng nghe phản hồi duyệt của Admin qua realtimeSync
  useEffect(() => {
    if (!isOpen || !order) return;

    const handleApprovalResolved = (payload: TransferApprovalResolvedPayload) => {
      if (!payload || !payload.order_number) return;
      if (payload.order_number === order.order_number) {
        if (payload.action === 'approved') {
          setAdminApproved(true);
          setIsWaitingAdminApproval(false);
          soundManager.playPaymentSuccessChime();
          setTimeout(() => {
            onConfirmPaymentAndComplete(order, 'bank_transfer');
            onClose();
          }, 1200);
        } else if (payload.action === 'rejected') {
          setIsWaitingAdminApproval(false);
          setAdminApproved(false);
          alert(`❌ ADMIN THÔNG BÁO:\n\n${payload.reason || 'Chưa nhận được tiền chuyển khoản'}.\n\nVui lòng kiểm tra lại với khách hàng hoặc đổi sang hình thức Tiền mặt.`);
        }
      }
    };

    const handleCustomResolved = (e: any) => {
      if (e.detail) handleApprovalResolved(e.detail);
    };

    window.addEventListener('transfer_approval_resolved', handleCustomResolved);
    const unsub = subscribeCrossDeviceSync({
      onTransferApprovalResolved: handleApprovalResolved,
    });

    return () => {
      window.removeEventListener('transfer_approval_resolved', handleCustomResolved);
      unsub();
    };
  }, [isOpen, order, onConfirmPaymentAndComplete, onClose]);

  if (!isOpen || !order) return null;

  const fromN = parsePreorderFromNotes(order.notes);
  const isShip = order.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
  const shipAddr = order.shipping_address || fromN.shipping_address;

  const mainItem = order.items?.[0];
  const cakeFullName = mainItem?.product_name_snapshot || order.cake_name || fromN.cake_name || 'Bánh Kem Theo Yêu Cầu';

  const totalAmt = order.total_amount || fromN.total_amount || 0;
  const depAmt = order.deposit_amount || fromN.deposit_amount || 0;
  const remAmt = order.remaining_amount !== undefined 
    ? order.remaining_amount 
    : (fromN.remaining_amount !== undefined ? fromN.remaining_amount : Math.max(0, totalAmt - depAmt));

  // Cấu hình VietQR
  const vConfig = vietqrConfig || {
    bankId: 'MB',
    bankName: 'MB Bank',
    accountNo: '0981247020',
    accountName: 'BUI QUY VIET',
    template: 'compact2',
  };

  const transferSyntax = `DH ${order.order_number}`;

  const qrImageUrl = vConfig.bankId && vConfig.accountNo
    ? `https://api.vietqr.io/image/${vConfig.bankId}-${vConfig.accountNo}-${vConfig.template || 'compact2'}.jpg?amount=${remAmt}&addInfo=${encodeURIComponent(transferSyntax)}&accountName=${encodeURIComponent(vConfig.accountName || '')}`
    : '';

  const handleCopyAccountNo = () => {
    if (vConfig.accountNo) {
      navigator.clipboard.writeText(vConfig.accountNo);
      setCopiedAccountNo(true);
      setTimeout(() => setCopiedAccountNo(false), 2000);
    }
  };

  const handleCopySyntax = () => {
    navigator.clipboard.writeText(transferSyntax);
    setCopiedSyntax(true);
    setTimeout(() => setCopiedSyntax(false), 2000);
  };

  const isTwoStepMode = transferVerifyConfig.mode === 'two_step';
  const skipForAdmin = (
    (transferVerifyConfig.twoStep?.skipForAdmin !== undefined 
      ? transferVerifyConfig.twoStep.skipForAdmin 
      : (transferVerifyConfig.two_step?.skipForAdmin ?? true)) && isAdmin
  );
  const requireAdminApproval = isTwoStepMode && !skipForAdmin && !proofImage && !adminApproved;

  // Gửi hoặc gửi lại yêu cầu xác thực 2 bước tới Admin
  const handleSendOrResendApproval = async () => {
    try {
      const payload: TransferApprovalPayload = {
        order_number: order.order_number,
        amount: remAmt,
        customer_name: order.customer_name || 'Khách nhận bánh',
        transfer_code: transferSyntax,
        requested_by: user?.name || 'Nhân Viên Bếp/Giao Bánh',
        requested_at: new Date().toISOString(),
      };
      await broadcastTransferApprovalRequest(payload);
      setIsWaitingAdminApproval(true);
      setResendStatus('Đã phát yêu cầu tới Admin!');
      setTimeout(() => setResendStatus(null), 2500);
    } catch {
      setResendStatus('Lỗi kết nối phát sóng');
      setTimeout(() => setResendStatus(null), 2500);
    }
  };

  const shortage = parseOrderBakeShortage(order);
  const isWaitingBake = shortage.isWaitingBake;

  const handleConfirm = async () => {
    if (isWaitingBake) {
      alert(`Đơn #${order.order_number} đang chờ bếp nướng làm thêm ${shortage.needBakeQty} cái bánh bổ sung. Vui lòng đợi thợ bếp làm xong trước khi thu tiền và giao bánh!`);
      return;
    }

    if (paymentMethod === 'bank_transfer' && requireAdminApproval && !isWaitingAdminApproval) {
      // Bấm lần đầu ở chế độ 2 bước: phát yêu cầu tới Admin
      await handleSendOrResendApproval();
      return;
    }

    onConfirmPaymentAndComplete(order, paymentMethod, proofImage || undefined);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
        <div className="bg-zinc-900 border border-zinc-700/80 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 text-white animate-in zoom-in-95 duration-150 my-auto">
          
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-md">
                <Banknote className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 border border-amber-800">
                  Bước 3: Thu Tiền & Giao Hàng
                </span>
                <h3 className="font-black text-lg text-white mt-0.5">
                  Xác Nhận Thanh Toán Khi Giao
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

          {/* Thông tin tóm tắt đơn */}
          <div className="bg-zinc-950/80 rounded-2xl p-3.5 border border-zinc-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-sm text-amber-400">
                #{order.order_number}
              </span>
              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                isShip ? 'bg-blue-900 text-blue-200 border border-blue-700' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
              }`}>
                {isShip ? '🚚 Ship tận nơi' : '🏪 Lấy tại tiệm'}
              </span>
            </div>

            <div className="font-bold text-zinc-200 truncate flex items-center gap-1.5">
              <Cake className="w-3.5 h-3.5 text-pink-400 shrink-0" />
              <span className="truncate">{cakeFullName}</span>
            </div>

            {(order.customer_name || shipAddr) && (
              <div className="text-[11px] text-zinc-400 space-y-1 pt-1 border-t border-zinc-800/80">
                {order.customer_name && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-zinc-500" />
                    <span>Khách: <strong className="text-zinc-200">{order.customer_name}</strong> {order.customer_phone ? `(${order.customer_phone})` : ''}</span>
                  </div>
                )}
                {isShip && shipAddr && (
                  <div className="flex items-start gap-1.5 text-blue-300">
                    <MapPin className="w-3 h-3 text-blue-400 shrink-0 mt-0.5" />
                    <span className="truncate">{shipAddr}</span>
                  </div>
                )}
              </div>
            )}

            {/* Hộp số tiền cần thu */}
            <div className="pt-2 border-t border-zinc-800/80">
              <div className="p-3 rounded-xl bg-gradient-to-r from-amber-950/60 to-rose-950/60 border border-amber-600/50 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-amber-300/90 font-bold block uppercase tracking-wider">
                    Số tiền cần thu khi giao
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {totalAmt > 0 && `Tổng ${totalAmt.toLocaleString('vi-VN')}₫ • Đã cọc ${depAmt.toLocaleString('vi-VN')}₫`}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-black text-xl text-amber-300">
                    {remAmt.toLocaleString('vi-VN')}₫
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Lựa chọn phương thức thanh toán */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-300 block">
              Chọn hình thức khách thanh toán số tiền còn lại:
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'bg-amber-600/20 border-amber-500 text-amber-300 ring-1 ring-amber-500/50'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Banknote className="w-5 h-5 text-amber-400" />
                  {paymentMethod === 'cash' && <Check className="w-4 h-4 text-amber-400" />}
                </div>
                <div>
                  <span className="font-black text-xs block text-white">1. Tiền Mặt</span>
                  <span className="text-[10px] text-zinc-400">Thu tiền mặt trực tiếp</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('bank_transfer')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                  paymentMethod === 'bank_transfer'
                    ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-500/50'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:bg-zinc-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <QrCode className="w-5 h-5 text-blue-400" />
                  {paymentMethod === 'bank_transfer' && <Check className="w-4 h-4 text-blue-400" />}
                </div>
                <div>
                  <span className="font-black text-xs block text-white">2. Chuyển Khoản</span>
                  <span className="text-[10px] text-zinc-400">Quét mã QR VietQR</span>
                </div>
              </button>
            </div>
          </div>

          {/* Khung hiển thị QR code và Xác thực 2 bước nếu chọn Chuyển khoản */}
          {paymentMethod === 'bank_transfer' && (
            <div className="bg-zinc-950 p-3.5 rounded-2xl border border-blue-800/60 space-y-3 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-blue-300 flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-blue-400" /> Quét mã để thanh toán đúng {remAmt.toLocaleString('vi-VN')}₫
                </span>
                <span className="text-[10px] font-mono bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-800">
                  VietQR Chuẩn
                </span>
              </div>

              {qrImageUrl && (
                <div className="flex justify-center p-2 bg-white rounded-xl shadow-inner max-w-[180px] mx-auto">
                  <img
                    src={qrImageUrl}
                    alt="Mã QR thanh toán đơn hàng"
                    className="w-full h-auto object-contain rounded"
                  />
                </div>
              )}

              <div className="space-y-1 text-[11px] text-zinc-300 bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Số tài khoản:</span>
                  <button
                    type="button"
                    onClick={handleCopyAccountNo}
                    className="font-black text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                    title="Bấm để chép STK"
                  >
                    <span>{vConfig.accountNo}</span>
                    {copiedAccountNo ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Chủ tài khoản:</span>
                  <span className="font-bold text-white uppercase">{vConfig.accountName}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-zinc-800">
                  <span className="text-zinc-400">Nội dung CK:</span>
                  <button
                    type="button"
                    onClick={handleCopySyntax}
                    className="font-bold text-blue-300 hover:text-blue-200 flex items-center gap-1 cursor-pointer"
                    title="Bấm để chép nội dung"
                  >
                    <span>{transferSyntax}</span>
                    {copiedSyntax ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              {/* Ảnh bill đã chụp đối soát nếu có */}
              {proofImage && (
                <div className="flex items-center justify-between p-2 rounded-xl bg-purple-900/40 border border-purple-500/50 text-xs text-purple-200">
                  <div className="flex items-center gap-2">
                    <img src={proofImage} alt="Ảnh bill" className="w-8 h-8 rounded-lg object-cover border border-purple-400" />
                    <div>
                      <span className="font-black block text-purple-100">📸 Đã chụp bill đối soát!</span>
                      <span className="text-[10px] text-purple-300">Đơn hàng đủ điều kiện hoàn tất ngay</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsProofCameraOpen(true)}
                    className="px-2 py-1 rounded-lg bg-purple-800 hover:bg-purple-700 text-[10px] font-bold text-white cursor-pointer"
                  >
                    Chụp lại
                  </button>
                </div>
              )}

              {/* Khối quản lý Xác thực 2 bước Admin duyệt */}
              {isTwoStepMode && !skipForAdmin && !proofImage && (
                <div className="space-y-2 pt-1 border-t border-blue-900/60">
                  {adminApproved ? (
                    <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500 text-emerald-200 space-y-1 text-center animate-in zoom-in-95">
                      <div className="flex items-center justify-center gap-1.5 font-black text-xs text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 animate-bounce" />
                        <span>✅ ADMIN ĐÃ XÁC NHẬN TIỀN VỀ!</span>
                      </div>
                      <p className="text-[11px] text-emerald-300/80">Hệ thống đang tự động hoàn tất giao hàng...</p>
                    </div>
                  ) : isWaitingAdminApproval ? (
                    <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500 text-amber-200 space-y-2 animate-in zoom-in-95">
                      <div className="flex items-center justify-center gap-2 font-black text-xs text-amber-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping inline-block" />
                        <span>⏳ ĐANG CHỜ ADMIN XÁC NHẬN TIỀN VỀ...</span>
                      </div>
                      <p className="text-[10px] text-amber-300/80 text-center">
                        Yêu cầu duyệt đã gửi tới Admin. Đơn sẽ tự hoàn tất khi Admin duyệt.
                      </p>

                      <div className="flex gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={handleSendOrResendApproval}
                          className="flex-1 py-2 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-[11px] flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{resendStatus || '🔄 Gửi Lại Yêu Cầu'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsProofCameraOpen(true)}
                          className="py-2 px-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-[11px] flex items-center justify-center gap-1 border border-zinc-700 transition cursor-pointer shrink-0"
                          title="Chụp ảnh bill nếu admin chưa kịp duyệt"
                        >
                          <Camera className="w-3.5 h-3.5 text-amber-400" />
                          <span>Chụp Bill Ngay</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-950/60 border border-amber-600/40 text-xs">
                      <span className="flex items-center gap-1.5 text-[11px] text-amber-300 font-bold">
                        <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                        Xác thực 2 bước: Cần Admin duyệt
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsProofCameraOpen(true)}
                        className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-bold flex items-center gap-1 border border-zinc-700 cursor-pointer"
                      >
                        <Camera className="w-3 h-3 text-amber-400" /> Chụp bill
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Cảnh báo nếu đang chờ bếp làm thêm số lượng bổ sung */}
          {isWaitingBake && (
            <div className="p-3 rounded-2xl bg-amber-950/80 border border-amber-500/60 text-amber-200 text-xs flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
              <div>
                <span className="font-bold text-amber-300">Đang chờ bếp nướng làm thêm {shortage.needBakeQty} cái</span>
                <p className="text-[10px] text-amber-300/80 mt-0.5">
                  Đơn chưa nướng xong số lượng bù. Không thể xác nhận giao và thu tiền lúc này.
                </p>
              </div>
            </div>
          )}

          {/* Nút hành động */}
          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition cursor-pointer active:scale-95 border border-zinc-700"
            >
              Quay lại
            </button>

            <button
              type="button"
              disabled={isWaitingBake}
              onClick={handleConfirm}
              className={`py-3 px-4 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg ${
                isWaitingBake
                  ? 'bg-zinc-800 text-zinc-500 border border-zinc-700 cursor-not-allowed opacity-60 shadow-none'
                  : paymentMethod === 'bank_transfer' && requireAdminApproval && !isWaitingAdminApproval
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30 cursor-pointer active:scale-95'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 cursor-pointer active:scale-95'
              }`}
            >
              {isWaitingBake ? (
                <>
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Chờ Bếp Làm Bù</span>
                </>
              ) : paymentMethod === 'bank_transfer' && requireAdminApproval && !isWaitingAdminApproval ? (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Gửi Duyệt 2 Bước</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác Nhận & Hoàn Thành</span>
                </>
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Modal Chụp Ảnh Bill Đối Soát Khẩn Cấp */}
      {isProofCameraOpen && (
        <TransferProofCameraModal
          orderNumber={order.order_number || 'BK-SHIP'}
          amount={remAmt}
          onConfirm={(imgBase64) => {
            setProofImage(imgBase64);
            setIsProofCameraOpen(false);
            // Sau khi chụp ảnh bill, tự động hoàn tất luôn
            onConfirmPaymentAndComplete(order, 'bank_transfer', imgBase64);
            onClose();
          }}
          onClose={() => setIsProofCameraOpen(false)}
        />
      )}
    </>
  );
};

export default DeliveryPaymentModal;
