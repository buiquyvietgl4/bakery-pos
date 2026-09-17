'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Printer,
  Sparkles,
  RotateCcw,
  Save,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  ChevronUp,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Type,
  Plus,
  Trash2,
  Sliders,
  Grid,
  Tag,
  Receipt,
  Move,
  Info,
} from 'lucide-react';
import {
  LabelPaperSize,
  ReceiptPaperSize,
  StickerTemplateConfig,
  ReceiptTemplateConfig,
  StickerElementConfig,
  ReceiptBlockConfig,
} from '@/lib/types/printTemplate';
import {
  getStickerTemplate,
  saveStickerTemplate,
  resetStickerTemplate,
  getReceiptTemplate,
  saveReceiptTemplate,
  resetReceiptTemplate,
} from '@/lib/utils/printTemplateManager';
import { printHtml } from '@/lib/utils/printHelper';
import { getStoreBranding } from '@/lib/utils/storeBranding';

interface PrintTemplateDesignerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'sticker' | 'receipt';
}

export const PrintTemplateDesignerModal: React.FC<PrintTemplateDesignerModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'sticker',
}) => {
  const [activeTab, setActiveTab] = useState<'sticker' | 'receipt'>(initialTab);

  // ── STICKER TEMPLATE STATE ──
  const [stickerLabelSize, setStickerLabelSize] = useState<LabelPaperSize>('50x30');
  const [stickerConfig, setStickerConfig] = useState<StickerTemplateConfig>(() => getStickerTemplate('50x30'));
  const [selectedElementId, setSelectedElementId] = useState<string | null>('cake_name');
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // ── RECEIPT TEMPLATE STATE ──
  const [receiptPaperSize, setReceiptPaperSize] = useState<ReceiptPaperSize>('80mm');
  const [receiptConfig, setReceiptConfig] = useState<ReceiptTemplateConfig>(() => getReceiptTemplate('80mm'));
  const [expandedReceiptBlockId, setExpandedReceiptBlockId] = useState<string | null>('header_store');

  // ── STATUS & TOAST STATE ──
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // ── DRAG ENGINE REFS ──
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragInfoRef = useRef<{
    elementId: string;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);

  const branding = getStoreBranding();

  // Load config khi mở modal hoặc đổi size
  useEffect(() => {
    if (isOpen) {
      setStickerConfig(getStickerTemplate(stickerLabelSize));
      setReceiptConfig(getReceiptTemplate(receiptPaperSize));
    }
  }, [isOpen, stickerLabelSize, receiptPaperSize]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const showToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 2500);
  };

  if (!isOpen) return null;

  // ── HÀM XỬ LÝ TEM DÁN (STICKER) ──
  const handleStickerSizeChange = (size: LabelPaperSize) => {
    setStickerLabelSize(size);
    setStickerConfig(getStickerTemplate(size));
  };

  const handleUpdateElement = (id: string, updates: Partial<StickerElementConfig>) => {
    setStickerConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, ...updates } : el)),
    }));
  };

  const handleToggleElementVisibility = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStickerConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((el) => (el.id === id ? { ...el, visible: !el.visible } : el)),
    }));
  };

  const handleAddCustomTextElement = () => {
    const newId = `custom_${Date.now()}`;
    const newElement: StickerElementConfig = {
      id: newId,
      label: 'Khung chữ mới',
      visible: true,
      x: 20,
      y: 50,
      width: 60,
      fontSize: 7,
      fontWeight: 'bold',
      align: 'center',
      customText: 'Nội dung chữ tự nhập',
    };
    setStickerConfig((prev) => ({
      ...prev,
      elements: [...prev.elements, newElement],
    }));
    setSelectedElementId(newId);
    showToast('Đã thêm khung chữ mới! Hãy kéo thả vị trí trên tem');
  };

  const handleDeleteCustomElement = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStickerConfig((prev) => ({
      ...prev,
      elements: prev.elements.filter((el) => el.id !== id),
    }));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  const handleSaveSticker = () => {
    saveStickerTemplate(stickerConfig);
    showToast('Đã lưu mẫu tem dán thành công! Tự động áp dụng khi in');
  };

  const handleResetSticker = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục mẫu tem về mặc định ban đầu không?')) {
      const def = resetStickerTemplate(stickerLabelSize);
      setStickerConfig(def);
      showToast('Đã khôi phục mẫu tem về mặc định!');
    }
  };

  // ── XỬ LÝ KÉO THẢ TỌA ĐỘ TRÊN CANVAS (POINTER EVENTS) ──
  const handlePointerDownElement = (e: React.PointerEvent, elementId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedElementId(elementId);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();
    const el = stickerConfig.elements.find((item) => item.id === elementId);
    if (!el) return;

    dragInfoRef.current = {
      elementId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: el.x,
      initialY: el.y,
      canvasWidth: canvasRect.width,
      canvasHeight: canvasRect.height,
    };

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMoveCanvas = (e: React.PointerEvent) => {
    if (!dragInfoRef.current) return;
    const { elementId, startX, startY, initialX, initialY, canvasWidth, canvasHeight } = dragInfoRef.current;

    const deltaPixelX = e.clientX - startX;
    const deltaPixelY = e.clientY - startY;

    // Chuyển pixel sang tỉ lệ % của canvas
    const deltaPercentX = (deltaPixelX / canvasWidth) * 100;
    const deltaPercentY = (deltaPixelY / canvasHeight) * 100;

    let newX = Math.round(initialX + deltaPercentX);
    let newY = Math.round(initialY + deltaPercentY);

    // Giới hạn trong khuôn khổ con tem (0 - 95%)
    newX = Math.max(0, Math.min(95, newX));
    newY = Math.max(0, Math.min(95, newY));

    // Lưới Snap nếu bật Grid (bước 1%)
    setStickerConfig((prev) => ({
      ...prev,
      elements: prev.elements.map((item) => (item.id === elementId ? { ...item, x: newX, y: newY } : item)),
    }));
  };

  const handlePointerUpCanvas = (e: React.PointerEvent) => {
    if (dragInfoRef.current) {
      dragInfoRef.current = null;
    }
  };

  // ── XỬ LÝ HÓA ĐƠN IN NHIỆT (RECEIPT) ──
  const handleReceiptSizeChange = (size: ReceiptPaperSize) => {
    setReceiptPaperSize(size);
    setReceiptConfig(getReceiptTemplate(size));
  };

  const handleToggleReceiptBlockVisibility = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReceiptConfig((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b)),
    }));
  };

  const handleMoveReceiptBlock = (index: number, direction: 'up' | 'down') => {
    const newBlocks = [...receiptConfig.blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newBlocks.length) return;

    const temp = newBlocks[index];
    newBlocks[index] = newBlocks[targetIndex];
    newBlocks[targetIndex] = temp;

    // Cập nhật lại số order
    newBlocks.forEach((b, idx) => {
      b.order = idx + 1;
    });

    setReceiptConfig((prev) => ({
      ...prev,
      blocks: newBlocks,
    }));
  };

  const handleToggleReceiptOption = (blockId: string, optionKey: string) => {
    setReceiptConfig((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          options: {
            ...b.options,
            [optionKey]: !b.options?.[optionKey],
          },
        };
      }),
    }));
  };

  const handleSaveReceipt = () => {
    saveReceiptTemplate(receiptConfig);
    showToast('Đã lưu mẫu hóa đơn thành công! Tự động áp dụng khi thanh toán & in');
  };

  const handleResetReceipt = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục mẫu hóa đơn về mặc định không?')) {
      const def = resetReceiptTemplate(receiptPaperSize);
      setReceiptConfig(def);
      showToast('Đã khôi phục mẫu hóa đơn về mặc định!');
    }
  };

  // ── IN THỬ NGAY MẪU ĐANG THIẾT KẾ ──
  const handlePrintTestSticker = () => {
    const el = document.getElementById('designer-preview-sticker');
    if (!el) return;
    printHtml(el.outerHTML, {
      title: 'In_Thu_Tem_Dan',
      pageSize: stickerLabelSize,
      customCss: `
        html, body {
          width: 50mm !important;
          height: ${stickerLabelSize === '50x30' ? '30mm' : '40mm'} !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        #designer-preview-sticker {
          width: 50mm !important;
          height: ${stickerLabelSize === '50x30' ? '30mm' : '40mm'} !important;
          border: none !important;
          box-shadow: none !important;
        }
      `,
    });
  };

  const handlePrintTestReceipt = () => {
    const el = document.getElementById('designer-preview-receipt');
    if (!el) return;
    printHtml(el.outerHTML, {
      title: 'In_Thu_Hoa_Don',
      pageSize: receiptPaperSize === '58mm' ? 'auto' : '80mm',
      customCss: `
        html, body {
          width: ${receiptPaperSize === '58mm' ? '58mm' : '80mm'} !important;
          margin: 0 auto !important;
          padding: 2mm !important;
        }
        #designer-preview-receipt {
          border: none !important;
          box-shadow: none !important;
          background: #ffffff !important;
        }
      `,
    });
  };

  const selectedElement = stickerConfig.elements.find((el) => el.id === selectedElementId);

  // Dữ liệu giả lập mẫu cho xem trước
  const sampleStickerData = {
    orderCode: 'BK-8902',
    cakeName: 'BÁNH BÔNG LAN TRỨNG MUỐI HOÀNG GIA',
    cakeMessage: 'Chúc Mừng Sinh Nhật Mẹ Yêu 50 Tuổi',
    customerInfo: 'Chị Mai Lan • 0918.765.432',
    pickupTime: '17:30 ngày 18/09/2026',
    deliveryMethod: '🚚 Giao tận nơi (Ship bánh)',
    shippingAddress: '128 Nguyễn Trãi, P.3, Quận 5, TP.HCM',
    filling: 'Sốt phô mai tươi & Chà bông gà cay',
    priceAndCod: 'Giá: 350.000₫ • Còn thu: 175.000₫',
    dates: 'Ngày đặt: 17/09 • HSD: 20/09/2026',
  };

  return (
    <div className="fixed inset-0 z-[10000020] bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-5xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[96dvh] flex flex-col border border-zinc-200 text-zinc-900 overflow-hidden">
        
        {/* ── HEADER MODAL ── */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-amber-200">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-xl text-zinc-900 flex items-center gap-2">
                Trình Thiết Kế Mẫu In Kéo Thả
              </h3>
              <p className="text-xs text-zinc-500 font-medium">Tự chọn nội dung hiển thị & kéo thả vị trí chữ theo ý bạn</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-2 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── TABS CHUYỂN ĐỔI: TEM DÁN HOẶC HÓA ĐƠN ── */}
        <div className="flex items-center justify-between bg-zinc-100/80 p-1.5 rounded-2xl border border-zinc-200 shrink-0">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('sticker')}
              className={`px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'sticker'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-white/60'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span>Tem Dán Hộp Bánh (Sticker)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('receipt')}
              className={`px-4 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer ${
                activeTab === 'receipt'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-zinc-600 hover:bg-white/60'
              }`}
            >
              <Receipt className="w-4 h-4" />
              <span>Hóa Đơn In Nhiệt (Bill POS)</span>
            </button>
          </div>

          {/* Toast thông báo lưu */}
          {saveToast && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>{saveToast}</span>
            </div>
          )}
        </div>

        {/* ── BODY NỘI DUNG CHÍNH (CUỘN ĐỘC LẬP) ── */}
        <div className="flex-1 overflow-y-auto pr-1 min-h-0">
          
          {/* ============================================================================ */}
          {/* TAB 1: THIẾT KẾ TEM DÁN HỘP BÁNH (STICKER VISUAL CANVAS)                     */}
          {/* ============================================================================ */}
          {activeTab === 'sticker' && (
            <div className="space-y-4">
              {/* Thanh điều khiển phụ của Tem */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-600">Khổ tem:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleStickerSizeChange('50x30')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                        stickerLabelSize === '50x30'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      50 x 30 mm (Chuẩn)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStickerSizeChange('50x40')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                        stickerLabelSize === '50x40'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      50 x 40 mm (Tem Lớn)
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGrid(!showGrid)}
                    className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 transition cursor-pointer ${
                      showGrid ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-zinc-500 border-zinc-200'
                    }`}
                    title="Bật/tắt lưới căn chỉnh"
                  >
                    <Grid className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Lưới căn</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleAddCustomTextElement}
                    className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm khung chữ</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetSticker}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                    title="Khôi phục mẫu gốc"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Mặc định</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintTestSticker}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In thử</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSticker}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu Mẫu Tem</span>
                  </button>
                </div>
              </div>

              {/* Bố cục chia 2 cột: Cột trái (Toolbox & Thuộc tính) | Cột phải (Visual Canvas kéo thả) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                {/* ── CỘT TRÁI: DANH SÁCH TRƯỜNG & THUỘC TÍNH (5 CỘT) ── */}
                <div className="lg:col-span-5 space-y-3">
                  {/* Hộp điều chỉnh thuộc tính khung đang chọn */}
                  {selectedElement ? (
                    <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2.5 text-xs">
                      <div className="flex items-center justify-between border-b border-amber-200/70 pb-1.5">
                        <span className="font-black text-amber-950 flex items-center gap-1">
                          <Sliders className="w-3.5 h-3.5 text-amber-600" />
                          Đang chỉnh: {selectedElement.label}
                        </span>
                        {selectedElement.id.startsWith('custom_') && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteCustomElement(selectedElement.id, e)}
                            className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-100 transition"
                            title="Xóa khung chữ này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Nếu là khung chữ tự tạo: Cho sửa nội dung */}
                      {selectedElement.id.startsWith('custom_') && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-600">Nội dung chữ:</label>
                          <input
                            type="text"
                            value={selectedElement.customText || ''}
                            onChange={(e) => handleUpdateElement(selectedElement.id, { customText: e.target.value })}
                            className="w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg text-xs"
                          />
                        </div>
                      )}

                      {/* Chỉnh Font Size & Độ đậm & Căn lề */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-600">Cỡ chữ (pt):</label>
                          <input
                            type="number"
                            min="5"
                            max="16"
                            step="0.5"
                            value={selectedElement.fontSize}
                            onChange={(e) => handleUpdateElement(selectedElement.id, { fontSize: parseFloat(e.target.value) || 7 })}
                            className="w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-center"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-600">Độ đậm:</label>
                          <select
                            value={selectedElement.fontWeight}
                            onChange={(e) => handleUpdateElement(selectedElement.id, { fontWeight: e.target.value as any })}
                            className="w-full px-1.5 py-1 bg-white border border-zinc-200 rounded-lg font-bold text-xs"
                          >
                            <option value="normal">Bình thường</option>
                            <option value="bold">In đậm</option>
                            <option value="black">Cực đậm</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-zinc-600">Căn lề:</label>
                          <div className="flex rounded-lg border border-zinc-200 overflow-hidden bg-white">
                            <button
                              type="button"
                              onClick={() => handleUpdateElement(selectedElement.id, { align: 'left' })}
                              className={`flex-1 p-1 flex items-center justify-center ${selectedElement.align === 'left' ? 'bg-amber-200 text-amber-900 font-bold' : 'text-zinc-500'}`}
                            >
                              <AlignLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateElement(selectedElement.id, { align: 'center' })}
                              className={`flex-1 p-1 flex items-center justify-center ${selectedElement.align === 'center' ? 'bg-amber-200 text-amber-900 font-bold' : 'text-zinc-500'}`}
                            >
                              <AlignCenter className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateElement(selectedElement.id, { align: 'right' })}
                              className={`flex-1 p-1 flex items-center justify-center ${selectedElement.align === 'right' ? 'bg-amber-200 text-amber-900 font-bold' : 'text-zinc-500'}`}
                            >
                              <AlignRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Tọa độ X và Y chỉnh bằng số hoặc phím bấm */}
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/50">
                        <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-zinc-200">
                          <span className="text-[10px] font-bold text-zinc-500">Cách trái (X):</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateElement(selectedElement.id, { x: Math.max(0, selectedElement.x - 2) })}
                              className="px-1.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded font-black text-[10px]"
                            >
                              -
                            </button>
                            <span className="font-mono font-black text-xs">{selectedElement.x}%</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateElement(selectedElement.id, { x: Math.min(95, selectedElement.x + 2) })}
                              className="px-1.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded font-black text-[10px]"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-zinc-200">
                          <span className="text-[10px] font-bold text-zinc-500">Cách trên (Y):</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleUpdateElement(selectedElement.id, { y: Math.max(0, selectedElement.y - 2) })}
                              className="px-1.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded font-black text-[10px]"
                            >
                              -
                            </button>
                            <span className="font-mono font-black text-xs">{selectedElement.y}%</span>
                            <button
                              type="button"
                              onClick={() => handleUpdateElement(selectedElement.id, { y: Math.min(95, selectedElement.y + 2) })}
                              className="px-1.5 py-0.5 bg-zinc-100 hover:bg-zinc-200 rounded font-black text-[10px]"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-zinc-50 border border-dashed border-zinc-300 rounded-2xl text-center text-xs text-zinc-500">
                      Bấm vào khung chữ trên tem để mở thuộc tính căn chỉnh
                    </div>
                  )}

                  {/* Danh sách các trường có thể Bật/Tắt */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-zinc-700 flex items-center justify-between">
                      <span>Bật/tắt các trường trên tem:</span>
                      <span className="text-[10px] font-normal text-zinc-400">Tích chọn để hiển thị</span>
                    </label>
                    <div className="max-h-56 overflow-y-auto space-y-1 bg-zinc-50 p-2 rounded-2xl border border-zinc-200 text-xs">
                      {stickerConfig.elements.map((el) => (
                        <div
                          key={el.id}
                          onClick={() => setSelectedElementId(el.id)}
                          className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer ${
                            selectedElementId === el.id
                              ? 'bg-amber-100 text-amber-950 font-bold shadow-xs'
                              : 'bg-white hover:bg-zinc-100 text-zinc-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="text-zinc-400">
                              <Move className="w-3.5 h-3.5" />
                            </span>
                            <span className="truncate">{el.label}</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => handleToggleElementVisibility(el.id, e)}
                            className={`p-1 rounded-lg transition ${
                              el.visible ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-zinc-400 hover:text-zinc-600'
                            }`}
                            title={el.visible ? 'Đang hiện' : 'Đang ẩn'}
                          >
                            {el.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── CỘT PHẢI: KHUNG XEM TRƯỚC KÉO THẢ TRỰC TIẾP (7 CỘT) ── */}
                <div className="lg:col-span-7 flex flex-col items-center justify-center p-4 sm:p-6 bg-zinc-100/90 rounded-3xl border border-dashed border-zinc-300 select-none">
                  <div className="text-xs font-bold text-zinc-500 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Mô phỏng mặt tem ({stickerLabelSize}mm) - Bấm giữ chuột để kéo thả vị trí</span>
                  </div>

                  {/* VÙNG CON TEM KÉO THẢ (CANVAS) */}
                  <div
                    ref={canvasRef}
                    onPointerMove={handlePointerMoveCanvas}
                    onPointerUp={handlePointerUpCanvas}
                    className={`relative bg-white rounded-xl shadow-xl border-2 border-zinc-400 overflow-hidden cursor-crosshair touch-none transition-all ${
                      showGrid ? 'bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:12px_12px]' : ''
                    } ${
                      stickerLabelSize === '50x30'
                        ? 'w-[360px] h-[216px]' // Tỉ lệ 5:3
                        : 'w-[360px] h-[288px]' // Tỉ lệ 5:4
                    }`}
                  >
                    {/* Render từng phần tử trên con tem */}
                    {stickerConfig.elements
                      .filter((el) => el.visible)
                      .map((el) => {
                        const isSelected = selectedElementId === el.id;

                        // Xác định nội dung mẫu hiển thị
                        let displayVal = el.label;
                        if (el.id === 'store_name') displayVal = branding.storeName || 'TIỆM BÁNH HOÀNG GIA';
                        else if (el.id === 'store_hotline') displayVal = `Hotline: ${branding.phone || '0901.234.567'}`;
                        else if (el.id === 'order_code') displayVal = `#${sampleStickerData.orderCode}`;
                        else if (el.id === 'cake_name') displayVal = sampleStickerData.cakeName;
                        else if (el.id === 'cake_message') displayVal = `✍️ "${sampleStickerData.cakeMessage}"`;
                        else if (el.id === 'customer_info') displayVal = `👤 ${sampleStickerData.customerInfo}`;
                        else if (el.id === 'pickup_time') displayVal = `⏰ ${sampleStickerData.pickupTime}`;
                        else if (el.id === 'delivery_method') displayVal = sampleStickerData.deliveryMethod;
                        else if (el.id === 'shipping_address') displayVal = `📍 ${sampleStickerData.shippingAddress}`;
                        else if (el.id === 'filling_flavor') displayVal = `🍓 ${sampleStickerData.filling}`;
                        else if (el.id === 'price_and_cod') displayVal = `💰 ${sampleStickerData.priceAndCod}`;
                        else if (el.id === 'dates') displayVal = sampleStickerData.dates;
                        else if (el.id === 'barcode') displayVal = '||||| |||| |||||||| ||||';
                        else if (el.customText) displayVal = el.customText;

                        return (
                          <div
                            key={el.id}
                            onPointerDown={(e) => handlePointerDownElement(e, el.id)}
                            style={{
                              position: 'absolute',
                              left: `${el.x}%`,
                              top: `${el.y}%`,
                              width: el.width ? `${el.width}%` : 'auto',
                              fontSize: `${el.fontSize * 1.3}px`, // Tỉ lệ hiển thị trên canvas màn hình
                              fontWeight: el.fontWeight === 'black' ? 900 : el.fontWeight === 'bold' ? 700 : 400,
                              fontStyle: el.fontStyle || 'normal',
                              textAlign: el.align,
                              lineHeight: 1.15,
                            }}
                            className={`group cursor-grab active:cursor-grabbing select-none transition-shadow ${
                              isSelected
                                ? 'outline-2 outline-dashed outline-amber-500 bg-amber-50/80 rounded px-1 z-20 shadow-md'
                                : 'hover:outline-1 hover:outline-dashed hover:outline-zinc-300 rounded px-1 z-10'
                            }`}
                            title={`Kéo thả: ${el.label} (X: ${el.x}%, Y: ${el.y}%)`}
                          >
                            {el.id === 'barcode' ? (
                              <div className="w-full h-5 flex items-center justify-center">
                                <svg className="w-28 h-full" viewBox="0 0 160 20" preserveAspectRatio="none">
                                  <rect x="0" y="0" width="2" height="20" fill="black" />
                                  <rect x="4" y="0" width="1" height="20" fill="black" />
                                  <rect x="7" y="0" width="3" height="20" fill="black" />
                                  <rect x="12" y="0" width="2" height="20" fill="black" />
                                  <rect x="16" y="0" width="4" height="20" fill="black" />
                                  <rect x="22" y="0" width="1" height="20" fill="black" />
                                  <rect x="25" y="0" width="3" height="20" fill="black" />
                                  <rect x="30" y="0" width="2" height="20" fill="black" />
                                  <rect x="34" y="0" width="4" height="20" fill="black" />
                                  <rect x="40" y="0" width="2" height="20" fill="black" />
                                </svg>
                              </div>
                            ) : (
                              <span className="truncate block text-zinc-950">{displayVal}</span>
                            )}

                            {isSelected && (
                              <div className="absolute -top-4 left-0 bg-amber-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded shadow-xs pointer-events-none whitespace-nowrap">
                                {el.label}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>

                  {/* Thẻ in ẩn dành cho việc in thử tem dán */}
                  <div id="designer-preview-sticker" className="hidden">
                    <div
                      style={{
                        position: 'relative',
                        width: '50mm',
                        height: stickerLabelSize === '50x30' ? '30mm' : '40mm',
                        backgroundColor: '#ffffff',
                        color: '#000000',
                        fontFamily: 'sans-serif',
                        overflow: 'hidden',
                      }}
                    >
                      {stickerConfig.elements
                        .filter((el) => el.visible)
                        .map((el) => {
                          let val = el.label;
                          if (el.id === 'store_name') val = branding.storeName || 'TIỆM BÁNH HOÀNG GIA';
                          else if (el.id === 'store_hotline') val = `Hotline: ${branding.phone || '0901.234.567'}`;
                          else if (el.id === 'order_code') val = `#${sampleStickerData.orderCode}`;
                          else if (el.id === 'cake_name') val = sampleStickerData.cakeName;
                          else if (el.id === 'cake_message') val = `✍️ "${sampleStickerData.cakeMessage}"`;
                          else if (el.id === 'customer_info') val = `👤 ${sampleStickerData.customerInfo}`;
                          else if (el.id === 'pickup_time') val = `⏰ ${sampleStickerData.pickupTime}`;
                          else if (el.id === 'delivery_method') val = sampleStickerData.deliveryMethod;
                          else if (el.id === 'shipping_address') val = `📍 ${sampleStickerData.shippingAddress}`;
                          else if (el.id === 'filling_flavor') val = `🍓 ${sampleStickerData.filling}`;
                          else if (el.id === 'price_and_cod') val = `💰 ${sampleStickerData.priceAndCod}`;
                          else if (el.id === 'dates') val = sampleStickerData.dates;
                          else if (el.customText) val = el.customText;

                          return (
                            <div
                              key={el.id}
                              style={{
                                position: 'absolute',
                                left: `${el.x}%`,
                                top: `${el.y}%`,
                                width: el.width ? `${el.width}%` : 'auto',
                                fontSize: `${el.fontSize}pt`,
                                fontWeight: el.fontWeight === 'black' ? 900 : el.fontWeight === 'bold' ? 700 : 400,
                                fontStyle: el.fontStyle || 'normal',
                                textAlign: el.align,
                                lineHeight: 1.15,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {val}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-500 mt-3 text-center">
                    💡 <b>Mẹo:</b> Nhấp giữ vào bất kỳ dòng chữ nào và di chuột để dịch chuyển vị trí trên tem.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================================ */}
          {/* TAB 2: THIẾT KẾ HÓA ĐƠN IN NHIỆT (RECEIPT BLOCK REORDER)                      */}
          {/* ============================================================================ */}
          {activeTab === 'receipt' && (
            <div className="space-y-4">
              {/* Thanh điều khiển phụ của Hóa đơn */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-600">Khổ giấy in bill:</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handleReceiptSizeChange('80mm')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                        receiptPaperSize === '80mm'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      K80 (80mm - Thông dụng)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReceiptSizeChange('58mm')}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                        receiptPaperSize === '58mm'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      K58 (58mm - Máy in mini)
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleResetReceipt}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                    title="Khôi phục mẫu mặc định"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Mặc định</span>
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintTestReceipt}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In thử bill</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveReceipt}
                    className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Lưu Mẫu Hóa Đơn</span>
                  </button>
                </div>
              </div>

              {/* Bố cục 2 cột: Cột trái (Kéo đổi thứ tự khối & Bật tắt) | Cột phải (Xem trước Bill cuộn) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                
                {/* ── CỘT TRÁI: THỨ TỰ KHỐI & TÙY CHỌN DÒNG (6 CỘT) ── */}
                <div className="lg:col-span-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-zinc-800">
                      Sắp xếp thứ tự các khối trên hóa đơn:
                    </label>
                    <span className="text-[10px] text-zinc-500">Bấm ▲ / ▼ để di chuyển vị trí</span>
                  </div>

                  <div className="space-y-1.5">
                    {receiptConfig.blocks.map((block, index) => {
                      const isExpanded = expandedReceiptBlockId === block.id;

                      return (
                        <div
                          key={block.id}
                          className={`rounded-2xl border transition-all ${
                            block.visible ? 'bg-white border-zinc-200 shadow-xs' : 'bg-zinc-50/70 border-zinc-200 opacity-60'
                          }`}
                        >
                          {/* Header của khối */}
                          <div className="p-2.5 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-700 font-black text-[11px] flex items-center justify-center shrink-0">
                                {index + 1}
                              </span>
                              <span className="font-bold text-xs text-zinc-900 truncate">
                                {block.label}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {/* Nút Lên / Xuống */}
                              <button
                                type="button"
                                disabled={index === 0}
                                onClick={() => handleMoveReceiptBlock(index, 'up')}
                                className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none text-zinc-600 transition"
                                title="Đưa lên trên"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                disabled={index === receiptConfig.blocks.length - 1}
                                onClick={() => handleMoveReceiptBlock(index, 'down')}
                                className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 disabled:pointer-events-none text-zinc-600 transition"
                                title="Đưa xuống dưới"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>

                              {/* Bật / Tắt khối */}
                              <button
                                type="button"
                                onClick={(e) => handleToggleReceiptBlockVisibility(block.id, e)}
                                className={`p-1.5 rounded-lg transition ${
                                  block.visible ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'text-zinc-400 hover:text-zinc-600'
                                }`}
                                title={block.visible ? 'Đang bật khối' : 'Đang tắt khối'}
                              >
                                {block.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                              </button>

                              {/* Mở rộng tùy chọn */}
                              <button
                                type="button"
                                onClick={() => setExpandedReceiptBlockId(isExpanded ? null : block.id)}
                                className="px-2 py-1 rounded-lg text-[11px] font-bold text-zinc-500 hover:bg-zinc-100 transition"
                              >
                                {isExpanded ? 'Thu gọn' : 'Chi tiết'}
                              </button>
                            </div>
                          </div>

                          {/* Chi tiết tùy chọn con bên trong khối */}
                          {isExpanded && block.options && (
                            <div className="p-3 bg-zinc-50/80 border-t border-zinc-100 rounded-b-2xl space-y-2 text-xs">
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                Tùy chọn hiển thị chi tiết dòng:
                              </p>
                              <div className="grid grid-cols-2 gap-2">
                                {block.options.showLogo !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showLogo}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showLogo')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>In Logo Tiệm</span>
                                  </label>
                                )}
                                {block.options.showSlogan !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showSlogan}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showSlogan')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>In Slogan</span>
                                  </label>
                                )}
                                {block.options.showHotline !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showHotline}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showHotline')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>In Hotline</span>
                                  </label>
                                )}
                                {block.options.showAddress !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showAddress}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showAddress')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>In Địa chỉ</span>
                                  </label>
                                )}
                                {block.options.showCashier !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showCashier}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showCashier')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Tên Thu Ngân</span>
                                  </label>
                                )}
                                {block.options.showCakeMessage !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showCakeMessage}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showCakeMessage')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Lời nhắn viết bánh</span>
                                  </label>
                                )}
                                {block.options.showDiscount !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showDiscount}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showDiscount')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Dòng Giảm Giá</span>
                                  </label>
                                )}
                                {block.options.showShippingFee !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showShippingFee}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showShippingFee')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Dòng Phí Ship</span>
                                  </label>
                                )}
                                {block.options.showChangeAmount !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showChangeAmount}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showChangeAmount')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Dòng Tiền Thừa</span>
                                  </label>
                                )}
                                {block.options.showVietQrCod !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showVietQrCod}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showVietQrCod')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Mã VietQR COD</span>
                                  </label>
                                )}
                                {block.options.showFooterMessage !== undefined && (
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={block.options.showFooterMessage}
                                      onChange={() => handleToggleReceiptOption(block.id, 'showFooterMessage')}
                                      className="rounded text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Lời Cảm Ơn</span>
                                  </label>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── CỘT PHẢI: XEM TRƯỚC HÓA ĐƠN CUỘN THỰC TẾ (6 CỘT) ── */}
                <div className="lg:col-span-6 flex flex-col items-center bg-zinc-100/90 rounded-3xl p-4 border border-dashed border-zinc-300">
                  <div className="text-xs font-bold text-zinc-500 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>Xem trước hóa đơn cuộn {receiptPaperSize}</span>
                  </div>

                  {/* KHUNG BILL CUỘN THỰC TẾ */}
                  <div
                    id="designer-preview-receipt"
                    className={`bg-white rounded-xl shadow-xl border border-zinc-300 text-black font-mono text-xs p-4 space-y-3 ${
                      receiptPaperSize === '58mm' ? 'w-[260px]' : 'w-[320px]'
                    }`}
                  >
                    {/* Render các khối theo thứ tự sắp xếp */}
                    {receiptConfig.blocks
                      .filter((b) => b.visible)
                      .map((block) => {
                        if (block.id === 'header_store') {
                          return (
                            <div key={block.id} className="text-center space-y-1 border-b border-dashed border-zinc-300 pb-2">
                              {block.options?.showLogo && branding.logoUrl && (
                                <div className="flex justify-center mb-1">
                                  <img src={branding.logoUrl} alt="Logo" className="h-8 w-auto mx-auto object-contain" />
                                </div>
                              )}
                              <h2 className="font-black text-sm uppercase tracking-wider">{branding.storeName || 'TIỆM BÁNH HOÀNG GIA'}</h2>
                              {block.options?.showSlogan && branding.slogan && (
                                <p className="text-[9px] text-zinc-500 italic">{branding.slogan}</p>
                              )}
                              {block.options?.showAddress && (
                                <p className="text-[10px] text-zinc-600">{branding.address || '123 Đường Bánh Ngọt, TP.HCM'}</p>
                              )}
                              {block.options?.showHotline && (
                                <p className="text-[10px] text-zinc-600">Hotline: {branding.phone || '0901.234.567'}</p>
                              )}
                            </div>
                          );
                        }

                        if (block.id === 'order_meta') {
                          return (
                            <div key={block.id} className="text-center space-y-0.5 border-b border-dashed border-zinc-300 pb-2 text-[11px]">
                              <p className="font-black text-xs uppercase text-zinc-900">PHIẾU HẸN GIAO BÁNH KEM</p>
                              <p className="font-bold text-amber-800">#BK-20260918-789</p>
                              <div className="text-[10px] text-zinc-500 flex justify-between pt-1">
                                <span>17:30 17/09/2026</span>
                                {block.options?.showCashier && <span>Thu ngân: Thu Ngân 01</span>}
                              </div>
                            </div>
                          );
                        }

                        if (block.id === 'customer_info') {
                          return (
                            <div key={block.id} className="space-y-1 border-b border-dashed border-zinc-300 pb-2 text-[11px]">
                              <div className="font-bold">Khách: Chị Mai Lan (0918.765.432)</div>
                              <div className="font-bold text-pink-800">HẸN GIAO: 17:30 ngày 18/09/2026</div>
                              {block.options?.showAddress && (
                                <div className="text-[10px] bg-blue-50/70 p-1.5 rounded border border-blue-200">
                                  <b>Địa chỉ ship:</b> 128 Nguyễn Trãi, P.3, Quận 5
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (block.id === 'items_table') {
                          return (
                            <div key={block.id} className="space-y-1.5 border-b border-dashed border-zinc-300 pb-2 text-[11px]">
                              <div className="flex justify-between font-bold">
                                <span>Bánh Bông Lan Trứng Muối (18cm) x1</span>
                                <span>350.000₫</span>
                              </div>
                              {block.options?.showCakeMessage && (
                                <div className="text-[10px] text-pink-700 italic pl-1">
                                  ✍️ Chữ: "Chúc Mừng Sinh Nhật Mẹ Yêu"
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (block.id === 'pricing_summary') {
                          return (
                            <div key={block.id} className="space-y-1 text-xs pt-1">
                              <div className="flex justify-between text-zinc-600">
                                <span>Tiền bánh:</span>
                                <span>350.000₫</span>
                              </div>
                              {block.options?.showDiscount && (
                                <div className="flex justify-between text-emerald-600 font-bold">
                                  <span>Giảm giá (Khách quen):</span>
                                  <span>-20.000₫</span>
                                </div>
                              )}
                              {block.options?.showShippingFee && (
                                <div className="flex justify-between text-blue-700 font-bold">
                                  <span>Phí ship:</span>
                                  <span>+30.000₫</span>
                                </div>
                              )}
                              <div className="flex justify-between font-black text-sm border-t border-dashed border-zinc-300 pt-1">
                                <span>TỔNG CỘNG:</span>
                                <span className="text-amber-700 font-black">360.000₫</span>
                              </div>
                              <div className="flex justify-between text-emerald-600 font-bold">
                                <span>Đã thanh toán tiền cọc:</span>
                                <span>-180.000₫</span>
                              </div>
                              <div className="flex justify-between font-black text-rose-600 bg-rose-50 p-1.5 rounded border border-rose-200">
                                <span>CÒN THU KHI GIAO (COD):</span>
                                <span>180.000₫</span>
                              </div>
                            </div>
                          );
                        }

                        if (block.id === 'payment_details') {
                          return (
                            <div key={block.id} className="border-t border-dashed border-zinc-300 pt-1.5 space-y-1 text-[11px]">
                              <div className="flex justify-between">
                                <span>Hình thức:</span>
                                <span className="font-bold">💵 Tiền mặt</span>
                              </div>
                              <div className="flex justify-between text-zinc-600">
                                <span>Tiền khách cọc đưa:</span>
                                <span>200.000₫</span>
                              </div>
                              {block.options?.showChangeAmount && (
                                <div className="flex justify-between text-emerald-700 font-bold">
                                  <span>Tiền thừa trả khách:</span>
                                  <span>20.000₫</span>
                                </div>
                              )}
                              <div className="text-center py-1 bg-emerald-50 text-emerald-800 font-black text-[10px] rounded border border-emerald-200">
                                ✓ ĐÃ THANH TOÁN TIỀN CỌC (180.000₫)
                              </div>
                            </div>
                          );
                        }

                        if (block.id === 'vietqr_cod' && block.options?.showVietQrCod) {
                          return (
                            <div key={block.id} className="text-center py-2 border-t border-dashed border-zinc-300 space-y-1">
                              <p className="text-[9px] font-bold uppercase text-rose-600">Mã VietQR Thu COD</p>
                              <div className="inline-block p-1 bg-white border border-zinc-300 rounded">
                                <div className="w-20 h-20 bg-zinc-200 flex items-center justify-center text-[9px] font-mono text-zinc-500 mx-auto">
                                  [QR CODE COD]
                                </div>
                              </div>
                              <p className="text-[10px] font-black text-rose-600">Số tiền: 180.000₫</p>
                            </div>
                          );
                        }

                        if (block.id === 'footer_greeting' && block.options?.showFooterMessage) {
                          return (
                            <div key={block.id} className="text-center pt-2 text-[10px] text-zinc-500 border-t border-dashed border-zinc-300">
                              <p>{branding.footerMessage || 'Cảm ơn Quý Khách & Hẹn Gặp Lại!'}</p>
                            </div>
                          );
                        }

                        return null;
                      })}
                  </div>

                  <p className="text-[11px] text-zinc-500 mt-3 text-center">
                    💡 <b>Mẹo:</b> Sử dụng các nút ▲ / ▼ ở cột trái để đổi thứ tự các khối theo chiều dọc.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── FOOTER MODAL ── */}
        <div className="flex items-center justify-between pt-3 border-t border-zinc-100 shrink-0">
          <div className="text-xs text-zinc-500">
            Cấu hình được lưu tự động trên thiết bị này và áp dụng tức thì cho mọi đơn hàng.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white font-black text-xs sm:text-sm transition cursor-pointer shadow-sm"
          >
            Đóng Trình Thiết Kế
          </button>
        </div>

      </div>
    </div>
  );
};
