'use client';

import React, { useState, useEffect } from 'react';
import { X, Printer, Tag, Check, Copy, Sparkles, Clock, MapPin, Phone, User, Settings } from 'lucide-react';
import { printHtml } from '@/lib/utils/printHelper';
import { formatPickupDateTime } from '@/lib/supabase/realtimeSync';
import { PrinterSettingsModal } from './PrinterSettingsModal';
import { getStoreBranding, fetchStoreBrandingFromDb, BRANDING_UPDATED_EVENT, StoreBrandingConfig } from '@/lib/utils/storeBranding';

export interface CakeStickerData {
  orderNumber?: string;
  cakeName: string;
  customerName?: string;
  customerPhone?: string;
  cakeMessage?: string;
  pickupTime?: string;
  deliveryMethod?: 'pickup' | 'shipping' | string;
  shippingAddress?: string;
  createdAt?: string;
  price?: number;
  notes?: string;
}

interface CakeStickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CakeStickerData | null;
}

export const CakeStickerModal: React.FC<CakeStickerModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const [labelSize, setLabelSize] = useState<'50x30' | '50x40'>('50x30');
  const [copied, setCopied] = useState(false);
  const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);
  const [branding, setBranding] = useState<StoreBrandingConfig>(getStoreBranding());

  useEffect(() => {
    setBranding(getStoreBranding());
    fetchStoreBrandingFromDb().then((b) => {
      if (b) setBranding(b);
    });
    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent<StoreBrandingConfig>).detail;
      if (detail) setBranding(detail);
      else setBranding(getStoreBranding());
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, handleUpdate);
  }, []);

  if (!isOpen || !data) return null;

  const orderNum = data.orderNumber || 'BK-NEW';
  const createdDate = data.createdAt ? new Date(data.createdAt) : new Date();
  const dateStr = `${String(createdDate.getDate()).padStart(2, '0')}/${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
  const timeStr = `${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`;

  const isShipping =
    data.deliveryMethod === 'shipping' ||
    (data.shippingAddress && data.shippingAddress.trim().length > 0);

  // Rút gọn mã đơn hàng cho huy hiệu để nhường chỗ cho Tên tiệm & Hotline không bị tràn/cắt
  const getOrderShortCode = (num: string): string => {
    if (!num) return 'NEW';
    const parts = num.split('-');
    if (parts.length >= 3) {
      const prefix = parts.slice(1, -1).find((p) => isNaN(Number(p))) || '';
      const last = parts[parts.length - 1];
      return prefix ? `${prefix}-${last}` : last;
    }
    if (parts.length === 2) {
      return parts[1];
    }
    return num.length > 10 ? num.slice(-6) : num;
  };

  const orderShortCode = getOrderShortCode(orderNum);
  const showSubOrderNum = orderNum.length > 10 && orderNum !== orderShortCode;

  const handlePrint = () => {
    const el = document.getElementById('printable-cake-sticker');
    if (!el) return;

    const is30 = labelSize === '50x30';

    printHtml(el.outerHTML, {
      title: `Tem_${orderNum}`,
      pageSize: labelSize,
      customCss: `
        @page {
          size: 50mm ${is30 ? '30mm' : '40mm'};
          margin: 0 !important;
        }
        *, *::before, *::after {
          box-sizing: border-box !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          width: 50mm !important;
          height: ${is30 ? '30mm' : '40mm'} !important;
          max-width: 50mm !important;
          max-height: ${is30 ? '30mm' : '40mm'} !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #ffffff !important;
          color: #000000 !important;
        }
        #printable-cake-sticker {
          width: 50mm !important;
          height: ${is30 ? '30mm' : '40mm'} !important;
          max-width: 50mm !important;
          max-height: ${is30 ? '30mm' : '40mm'} !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          margin: 0 !important;
          padding: ${is30 ? '0.7mm 1.5mm 0.7mm 1.5mm' : '1.2mm 2mm 1.2mm 2mm'} !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          overflow: hidden !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        #printable-cake-sticker .sticker-header {
          border-bottom: 1px solid #000000 !important;
          padding-bottom: ${is30 ? '0.5mm' : '1mm'} !important;
          margin-bottom: ${is30 ? '0.5mm' : '1mm'} !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          line-height: 1 !important;
          flex-shrink: 0 !important;
          width: 100% !important;
        }
        #printable-cake-sticker .sticker-store-info {
          display: flex !important;
          flex-direction: column !important;
          justify-content: center !important;
          min-width: 0 !important;
          flex: 1 1 auto !important;
          padding-right: 1.5mm !important;
        }
        #printable-cake-sticker .sticker-store-name {
          font-size: ${is30 ? '7.5pt' : '9.5pt'} !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          color: #000000 !important;
          display: block !important;
          line-height: 1.1 !important;
          letter-spacing: -0.1px !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        #printable-cake-sticker .sticker-hotline {
          font-size: ${is30 ? '5.2pt' : '6.5pt'} !important;
          font-weight: 600 !important;
          color: #222222 !important;
          display: block !important;
          line-height: 1.1 !important;
          margin-top: 0.3mm !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
        }
        #printable-cake-sticker .sticker-badge-group {
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-end !important;
          justify-content: center !important;
          flex-shrink: 0 !important;
        }
        #printable-cake-sticker .sticker-order-badge {
          font-family: monospace !important;
          font-size: ${is30 ? '6.8pt' : '8pt'} !important;
          font-weight: 900 !important;
          background-color: #000000 !important;
          color: #ffffff !important;
          padding: 1px 3.5px !important;
          border-radius: 2px !important;
          line-height: 1 !important;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #printable-cake-sticker .sticker-order-sub {
          font-family: monospace !important;
          font-size: ${is30 ? '4.5pt' : '5.5pt'} !important;
          font-weight: 700 !important;
          color: #444444 !important;
          line-height: 1 !important;
          margin-top: 0.3mm !important;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
        }
        #printable-cake-sticker .sticker-body {
          padding: 0 !important;
          margin: 0 !important;
          flex: 1 1 auto !important;
          min-height: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: ${is30 ? 'space-between' : 'space-around'} !important;
          overflow: hidden !important;
        }
        #printable-cake-sticker .sticker-cake-name-wrapper {
          margin: 0 !important;
          padding: 0 !important;
          flex-shrink: 0 !important;
        }
        #printable-cake-sticker .sticker-cake-name {
          font-size: ${
            is30
              ? data.cakeName.length > 40
                ? '6pt'
                : data.cakeName.length > 26
                ? '6.6pt'
                : '7.5pt'
              : data.cakeName.length > 40
              ? '7.5pt'
              : data.cakeName.length > 26
              ? '8.2pt'
              : '9.2pt'
          } !important;
          font-weight: 900 !important;
          text-transform: uppercase !important;
          line-height: 1.15 !important;
          color: #000000 !important;
          margin: 0 !important;
          padding: 0 !important;
          word-break: break-word !important;
          overflow: hidden !important;
          display: -webkit-box !important;
          -webkit-line-clamp: 2 !important;
          -webkit-box-orient: vertical !important;
        }
        #printable-cake-sticker .sticker-cake-msg {
          font-size: ${is30 ? '5.2pt' : '6.5pt'} !important;
          font-weight: 700 !important;
          line-height: 1.15 !important;
          margin: ${is30 ? '0.4mm 0' : '0.8mm 0'} !important;
          padding: ${is30 ? '0.4mm 1.5mm' : '0.8mm 2mm'} !important;
          background: #f4f4f5 !important;
          border: 0.5px solid #d4d4d8 !important;
          border-radius: 2px !important;
          color: #09090b !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          display: flex !important;
          align-items: center !important;
          gap: 2px !important;
          flex-shrink: 0 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #printable-cake-sticker .sticker-info-block {
          margin: 0 !important;
          padding: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          gap: ${is30 ? '0.3mm' : '0.7mm'} !important;
          flex-shrink: 0 !important;
        }
        #printable-cake-sticker .sticker-info-line {
          font-size: ${is30 ? '5.3pt' : '6.6pt'} !important;
          line-height: 1.15 !important;
          color: #000000 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          margin: 0 !important;
          display: flex !important;
          align-items: center !important;
          gap: 2px !important;
        }
        #printable-cake-sticker .sticker-info-line b {
          font-weight: 900 !important;
        }
        #printable-cake-sticker .sticker-icon {
          font-size: ${is30 ? '5.6pt' : '7pt'} !important;
          line-height: 1 !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: ${is30 ? '7.5px' : '9.5px'} !important;
          flex-shrink: 0 !important;
        }
        #printable-cake-sticker .sticker-footer {
          border-top: 1px solid #000000 !important;
          padding-top: ${is30 ? '0.5mm' : '1mm'} !important;
          margin-top: ${is30 ? '0.4mm' : '0.8mm'} !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          width: 100% !important;
          flex-shrink: 0 !important;
        }
        #printable-cake-sticker .sticker-barcode-wrapper {
          width: 100% !important;
          height: ${is30 ? '5.5mm' : '8.5mm'} !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          overflow: hidden !important;
          margin-bottom: ${is30 ? '0.4mm' : '0.8mm'} !important;
        }
        #printable-cake-sticker .sticker-barcode-svg {
          width: ${is30 ? '38mm' : '44mm'} !important;
          height: 100% !important;
          max-height: 100% !important;
          display: block !important;
        }
        #printable-cake-sticker .sticker-dates {
          width: 100% !important;
          display: flex !important;
          justify-content: space-between !important;
          align-items: center !important;
          font-size: ${is30 ? '4.8pt' : '5.8pt'} !important;
          font-weight: 700 !important;
          color: #000000 !important;
          line-height: 1 !important;
          margin: 0 !important;
          padding: 0 !important;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
        }
        #printable-cake-sticker .sticker-dates span {
          white-space: nowrap !important;
          display: inline-block !important;
        }
      `,
    });
  };

  const handleCopyOrderNum = () => {
    if (orderNum) {
      navigator.clipboard.writeText(orderNum);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
        <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in duration-150 border border-zinc-200 text-zinc-900">
          {/* Header Modal */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base sm:text-lg text-zinc-900 flex items-center gap-2">
                  In Tem Dán Hộp Bánh
                </h3>
                <p className="text-xs text-zinc-500 font-medium">Khổ tem in nhiệt Barcode / Sticker</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cấu hình chọn khổ tem */}
          <div className="flex items-center justify-between bg-zinc-50 p-2 rounded-2xl border border-zinc-200/80 text-xs">
            <span className="font-bold text-zinc-600 pl-1">Khổ giấy in nhiệt:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setLabelSize('50x30')}
                className={`px-3 py-1.5 rounded-xl font-black transition cursor-pointer ${
                  labelSize === '50x30'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                50 x 30 mm (Chuẩn)
              </button>
              <button
                type="button"
                onClick={() => setLabelSize('50x40')}
                className={`px-3 py-1.5 rounded-xl font-black transition cursor-pointer ${
                  labelSize === '50x40'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                50 x 40 mm (Tem lớn)
              </button>
            </div>
          </div>

          {/* Khung Xem Trước Tem Nhãn Thực Tế (Preview Container) */}
          <div className="p-4 bg-zinc-100/80 rounded-2xl border border-dashed border-zinc-300 flex flex-col items-center justify-center">
            <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Bản xem trước tem dán ({labelSize}mm)
            </div>

            {/* CHÍNH THỨC CON TEM CÓ ID PRINTABLE */}
            <div
              id="printable-cake-sticker"
              className={`w-72 bg-white rounded-xl border border-zinc-400/80 shadow-md text-black flex flex-col justify-between font-sans select-none overflow-hidden ${
                labelSize === '50x30' ? 'p-2 h-[173px]' : 'p-2.5 h-[230px]'
              }`}
            >
              {/* Header tem */}
              <div className="sticker-header border-b border-black pb-1 flex justify-between items-center text-[10px] leading-tight shrink-0">
                <div className="sticker-store-info min-w-0 pr-1.5">
                  <span className="sticker-store-name font-black uppercase tracking-tight block truncate">
                    {branding.storeName || 'TIỆM BÁNH HOÀNG GIA'}
                  </span>
                  <span className="sticker-hotline block text-[8px] text-zinc-600 font-semibold truncate mt-0.5">
                    Hotline: {branding.phone || '0901.234.567'}
                  </span>
                </div>
                <div className="sticker-badge-group flex flex-col items-end shrink-0">
                  <span className="sticker-order-badge font-mono font-black text-[9px] bg-black text-white px-1.5 py-0.5 rounded leading-none">
                    #{orderShortCode}
                  </span>
                  {showSubOrderNum && (
                    <span className="sticker-order-sub font-mono text-[6.5px] text-zinc-500 font-bold leading-none mt-0.5" title={orderNum}>
                      {orderNum}
                    </span>
                  )}
                </div>
              </div>

              {/* Thân tem: Tên bánh cực to & rõ */}
              <div className="sticker-body py-0.5 flex-1 flex flex-col justify-between overflow-hidden min-h-0">
                <div className="sticker-cake-name-wrapper shrink-0">
                  <h4
                    className={`sticker-cake-name font-black leading-tight line-clamp-2 text-zinc-950 uppercase ${
                      data.cakeName.length > 35
                        ? 'text-[9.5px]'
                        : data.cakeName.length > 25
                        ? 'text-[10.5px]'
                        : 'text-xs'
                    }`}
                  >
                    {data.cakeName}
                  </h4>
                </div>

                {/* Lời nhắn / Ghi chữ bánh */}
                {data.cakeMessage && (
                  <div className="sticker-cake-msg text-[8.5px] font-bold text-zinc-800 italic px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 rounded flex items-center gap-1 shrink-0">
                    <span className="sticker-icon shrink-0 not-italic text-[8px]">✍️</span>
                    <span className="truncate"><b>Ghi chữ:</b> &ldquo;{data.cakeMessage}&rdquo;</span>
                  </div>
                )}

                {/* Khách hàng & Hẹn giờ & Địa chỉ nhận bánh */}
                <div className="sticker-info-block text-[8px] space-y-0.5 text-zinc-900 leading-tight shrink-0">
                  {data.customerName && (
                    <div className="sticker-info-line flex items-center gap-1 font-semibold truncate">
                      <span className="sticker-icon shrink-0 text-[8px]">👤</span>
                      <span className="truncate"><b>Khách:</b> {data.customerName} {data.customerPhone ? `• ${data.customerPhone}` : ''}</span>
                    </div>
                  )}
                  {data.pickupTime && (
                    <div className="sticker-info-line flex items-center gap-1 font-black truncate">
                      <span className="sticker-icon shrink-0 text-[8px]">⏰</span>
                      <span className="truncate">
                        <b>{isShipping ? 'Hẹn giao:' : 'Hẹn lấy:'}</b> {formatPickupDateTime(data.pickupTime) || data.pickupTime}
                      </span>
                    </div>
                  )}
                  {/* NẾU TẠI TIỆM GHI TẠI TIỆM, NẾU SHIP GHI ĐỊA CHỈ NHẬN */}
                  <div className={`sticker-info-line flex items-center gap-1 font-black truncate ${isShipping ? 'text-blue-900' : 'text-zinc-950'}`}>
                    <span className="sticker-icon shrink-0 text-[8px]">{isShipping ? '🚚' : '🏪'}</span>
                    <span className="truncate">
                      <b>{isShipping ? 'Giao tận nơi:' : 'Nhận tại tiệm:'}</b>{' '}
                      {isShipping
                        ? (data.shippingAddress || 'Theo địa chỉ khách yêu cầu')
                        : (branding.address ? `Tại ${branding.address}` : 'Tại cửa hàng')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer tem: Barcode SVG + NSX & HSD */}
              <div className="sticker-footer pt-1 border-t border-black/80 flex flex-col items-center shrink-0">
                {/* Giả lập Barcode SVG sắc nét */}
                <div className="sticker-barcode-wrapper w-full flex items-center justify-center h-3 mb-0.5 shrink-0">
                  <svg className="sticker-barcode-svg w-36 h-full" viewBox="0 0 160 20" preserveAspectRatio="none">
                    <rect x="0" y="0" width="2" height="20" fill="black" />
                    <rect x="4" y="0" width="1" height="20" fill="black" />
                    <rect x="7" y="0" width="3" height="20" fill="black" />
                    <rect x="12" y="0" width="1" height="20" fill="black" />
                    <rect x="15" y="0" width="2" height="20" fill="black" />
                    <rect x="19" y="0" width="4" height="20" fill="black" />
                    <rect x="25" y="0" width="1" height="20" fill="black" />
                    <rect x="28" y="0" width="2" height="20" fill="black" />
                    <rect x="32" y="0" width="3" height="20" fill="black" />
                    <rect x="37" y="0" width="1" height="20" fill="black" />
                    <rect x="40" y="0" width="2" height="20" fill="black" />
                    <rect x="44" y="0" width="4" height="20" fill="black" />
                    <rect x="50" y="0" width="1" height="20" fill="black" />
                    <rect x="53" y="0" width="3" height="20" fill="black" />
                    <rect x="58" y="0" width="2" height="20" fill="black" />
                    <rect x="62" y="0" width="1" height="20" fill="black" />
                    <rect x="65" y="0" width="3" height="20" fill="black" />
                    <rect x="70" y="0" width="2" height="20" fill="black" />
                    <rect x="74" y="0" width="4" height="20" fill="black" />
                    <rect x="80" y="0" width="1" height="20" fill="black" />
                    <rect x="83" y="0" width="2" height="20" fill="black" />
                    <rect x="87" y="0" width="3" height="20" fill="black" />
                    <rect x="92" y="0" width="1" height="20" fill="black" />
                    <rect x="95" y="0" width="3" height="20" fill="black" />
                    <rect x="100" y="0" width="2" height="20" fill="black" />
                    <rect x="104" y="0" width="4" height="20" fill="black" />
                    <rect x="110" y="0" width="1" height="20" fill="black" />
                    <rect x="113" y="0" width="2" height="20" fill="black" />
                    <rect x="117" y="0" width="3" height="20" fill="black" />
                    <rect x="122" y="0" width="1" height="20" fill="black" />
                    <rect x="125" y="0" width="2" height="20" fill="black" />
                    <rect x="130" y="0" width="3" height="20" fill="black" />
                    <rect x="135" y="0" width="1" height="20" fill="black" />
                    <rect x="138" y="0" width="3" height="20" fill="black" />
                    <rect x="143" y="0" width="2" height="20" fill="black" />
                    <rect x="147" y="0" width="4" height="20" fill="black" />
                    <rect x="153" y="0" width="2" height="20" fill="black" />
                    <rect x="157" y="0" width="2" height="20" fill="black" />
                  </svg>
                </div>

                <div className="sticker-dates w-full flex justify-between items-center text-[7px] font-bold text-zinc-700 whitespace-nowrap shrink-0">
                  <span className="whitespace-nowrap">NSX: {dateStr} {timeStr}</span>
                  <span className="whitespace-nowrap">HSD: 48h (2-5°C)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Hướng dẫn máy in & Nút Cài đặt */}
          <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200/80 text-[11px] text-amber-950 flex items-center justify-between gap-2">
            <div className="leading-relaxed">
              💡 <b>Khổ in:</b> Khổ {labelSize}mm. Tương thích máy in nhiệt Bluetooth, USB, iPhone (AirPrint) & Android.
            </div>
            <button
              type="button"
              onClick={() => setIsPrinterSettingsOpen(true)}
              className="shrink-0 px-2.5 py-1.5 rounded-xl bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1 shadow-2xs transition cursor-pointer active:scale-95"
              title="Mở cấu hình máy in và kiểm tra kết nối"
            >
              <Settings className="w-3.5 h-3.5 text-amber-700" />
              <span>Cài đặt máy in</span>
            </button>
          </div>

          {/* Nút hành động */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopyOrderNum}
              className="px-3.5 py-3 rounded-2xl border border-zinc-200 hover:bg-zinc-50 text-xs font-bold text-zinc-600 flex items-center justify-center gap-1.5 transition cursor-pointer"
              title="Sao chép mã đơn"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Đã chép' : 'Chép mã'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-600/30 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>In Tem Nhãn ({labelSize})</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL CÀI ĐẶT VÀ KIỂM TRA MÁY IN */}
      <PrinterSettingsModal
        isOpen={isPrinterSettingsOpen}
        onClose={() => setIsPrinterSettingsOpen(false)}
      />
    </>
  );
};

export default CakeStickerModal;
