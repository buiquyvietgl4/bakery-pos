'use client';

import React, { useState } from 'react';
import { X, Printer, Tag, Check, Copy, Sparkles, Clock, MapPin, Phone, User } from 'lucide-react';
import { printHtml } from '@/lib/utils/printHelper';
import { formatPickupDateTime } from '@/lib/supabase/realtimeSync';

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

  if (!isOpen || !data) return null;

  const orderNum = data.orderNumber || 'BK-NEW';
  const createdDate = data.createdAt ? new Date(data.createdAt) : new Date();
  const dateStr = `${String(createdDate.getDate()).padStart(2, '0')}/${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
  const timeStr = `${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')}`;

  const handlePrint = () => {
    const el = document.getElementById('printable-cake-sticker');
    if (!el) return;

    printHtml(el.outerHTML, {
      title: `Tem_${orderNum}`,
      pageSize: labelSize,
      customCss: `
        html, body {
          width: 50mm !important;
          height: ${labelSize === '50x30' ? '30mm' : '40mm'} !important;
          max-width: 50mm !important;
          max-height: ${labelSize === '50x30' ? '30mm' : '40mm'} !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        #printable-cake-sticker {
          width: 50mm !important;
          height: ${labelSize === '50x30' ? '30mm' : '40mm'} !important;
          max-width: 50mm !important;
          max-height: ${labelSize === '50x30' ? '30mm' : '40mm'} !important;
          box-shadow: none !important;
          border: none !important;
          border-radius: 0 !important;
          margin: 0 !important;
          padding: 1.5mm 2mm !important;
          box-sizing: border-box !important;
          page-break-after: avoid !important;
          break-after: avoid !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
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
            className="w-72 bg-white rounded-xl border border-zinc-300 p-3 shadow-md text-black flex flex-col justify-between font-sans select-none overflow-hidden"
            style={{
              aspectRatio: labelSize === '50x30' ? '5 / 3' : '5 / 4',
            }}
          >
            {/* Header tem */}
            <div className="border-b border-black pb-1 flex justify-between items-center text-[10px] leading-tight">
              <div>
                <span className="font-black uppercase tracking-wide">TIỆM BÁNH HOÀNG GIA</span>
                <span className="block text-[8px] text-zinc-600 font-medium">Hotline: 0901.234.567</span>
              </div>
              <span className="font-mono font-black text-[9px] bg-black text-white px-1.5 py-0.5 rounded">
                #{orderNum}
              </span>
            </div>

            {/* Thân tem: Tên bánh cực to & rõ */}
            <div className="py-1">
              <h4 className="font-black text-xs leading-snug line-clamp-2 text-zinc-950 uppercase">
                {data.cakeName}
              </h4>

              {/* Lời nhắn / Ghi chữ bánh */}
              {data.cakeMessage && (
                <p className="text-[9px] font-bold text-zinc-800 italic mt-0.5 line-clamp-1 border-l-2 border-black pl-1">
                  ✍️ "{data.cakeMessage}"
                </p>
              )}

              {/* Khách hàng & Hẹn giờ */}
              {(data.customerName || data.pickupTime) && (
                <div className="text-[8.5px] mt-1 space-y-0.5 text-zinc-800">
                  {data.customerName && (
                    <div className="font-semibold truncate">
                      👤 {data.customerName} {data.customerPhone ? `• ${data.customerPhone}` : ''}
                    </div>
                  )}
                  {data.pickupTime && (
                    <div className="font-black text-zinc-900 truncate">
                      ⏰ Hẹn giao: {formatPickupDateTime(data.pickupTime) || data.pickupTime}
                    </div>
                  )}
                  {labelSize === '50x40' && data.shippingAddress && (
                    <div className="text-[8px] text-zinc-600 truncate">
                      📍 {data.shippingAddress}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer tem: Barcode SVG + NSX & HSD */}
            <div className="pt-1 border-t border-black/80 flex flex-col items-center">
              {/* Giả lập Barcode SVG sắc nét */}
              <div className="w-full flex items-center justify-center h-4">
                <svg className="w-40 h-full" viewBox="0 0 160 20" preserveAspectRatio="none">
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

              <div className="w-full flex justify-between items-center text-[7.5px] font-bold text-zinc-600 mt-0.5">
                <span>NSX: {dateStr} {timeStr}</span>
                <span>HSD: 48 Giờ (Bảo quản 2-5°C)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Hướng dẫn máy in */}
        <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed">
          💡 <b>Gợi ý in:</b> Chọn máy in tem nhiệt (Xprinter, Gprinter, HPRT). Trong hộp thoại in của trình duyệt, chọn kích thước giấy là <b>50x30mm</b> và đặt lề (Margins) là <b>None</b>.
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
  );
};

export default CakeStickerModal;
