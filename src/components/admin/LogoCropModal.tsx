// src/components/admin/LogoCropModal.tsx

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, Check, ZoomIn, ZoomOut, RotateCw, Move, 
  Sparkles, RefreshCw, Eye, Crop, Store, Receipt
} from 'lucide-react';

interface LogoCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  storeName?: string;
  slogan?: string;
  onClose: () => void;
  onCropComplete: (croppedBase64: string, blob?: Blob) => void;
}

export const LogoCropModal: React.FC<LogoCropModalProps> = ({
  isOpen,
  imageSrc,
  storeName = 'Tiệm Bánh ABC',
  slogan = 'Artisan Bakery & POS',
  onClose,
  onCropComplete,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [maskShape, setMaskShape] = useState<'rounded' | 'circle' | 'square'>('rounded');

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Kích thước khung cắt hiển thị (pixel trong viewport)
  const CROP_BOX_SIZE = 260; // Khung vuông 1:1 chuẩn
  const OUTPUT_SIZE = 512; // Kích thước pixel xuất ra chuẩn HD

  // Reset trạng thái khi đổi ảnh
  useEffect(() => {
    if (isOpen && imageSrc) {
      setZoom(1);
      setRotation(0);
      setPan({ x: 0, y: 0 });
      setImageLoaded(false);

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageRef.current = img;
        setImageLoaded(true);
      };
      img.src = imageSrc;
    }
  }, [isOpen, imageSrc]);

  // Cắt ảnh ra Canvas và cập nhật live preview
  const generateCroppedCanvas = useCallback((): HTMLCanvasElement | null => {
    const img = imageRef.current;
    if (!img) return null;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Xóa nền sạch
    ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

    // Tỉ lệ quy đổi từ khung preview sang canvas xuất
    const scaleFactor = OUTPUT_SIZE / CROP_BOX_SIZE;

    // Tọa độ tâm canvas
    ctx.save();
    ctx.translate(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    // Áp dụng dịch chuyển và zoom
    const drawWidth = img.width * zoom * scaleFactor * (CROP_BOX_SIZE / Math.max(img.width, img.height));
    const drawHeight = img.height * zoom * scaleFactor * (CROP_BOX_SIZE / Math.max(img.width, img.height));

    const drawX = pan.x * scaleFactor - drawWidth / 2;
    const drawY = pan.y * scaleFactor - drawHeight / 2;

    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();

    return canvas;
  }, [zoom, rotation, pan]);

  // Cập nhật live preview mỗi khi người dùng zoom, xoay, kéo
  useEffect(() => {
    if (!imageLoaded) return;
    const canvas = generateCroppedCanvas();
    if (canvas) {
      try {
        const url = canvas.toDataURL('image/png', 0.95);
        setPreviewDataUrl(url);
      } catch (e) {
        console.error('Lỗi tạo preview canvas:', e);
      }
    }
  }, [imageLoaded, generateCroppedCanvas]);

  // Xử lý kéo thả bằng chuột (Mouse Drag)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Xử lý kéo thả bằng ngón tay trên màn hình cảm ứng / điện thoại (Touch Drag)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      const touch = e.touches[0];
      setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPan({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Xử lý cuộn chuột để zoom (Wheel Zoom)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((prev) => Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.5), 4));
  };

  // Nút xoay 90 độ
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Nút đặt lại vị trí gốc
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  // Phím mũi tên di chuyển pixel chính xác
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') setPan((p) => ({ ...p, y: p.y - 2 }));
      else if (e.key === 'ArrowDown') setPan((p) => ({ ...p, y: p.y + 2 }));
      else if (e.key === 'ArrowLeft') setPan((p) => ({ ...p, x: p.x - 2 }));
      else if (e.key === 'ArrowRight') setPan((p) => ({ ...p, x: p.x + 2 }));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Xác nhận cắt ảnh và áp dụng
  const handleApply = () => {
    const canvas = generateCroppedCanvas();
    if (!canvas) {
      onClose();
      return;
    }

    canvas.toBlob((blob) => {
      const base64 = canvas.toDataURL('image/png', 0.95);
      onCropComplete(base64, blob || undefined);
      onClose();
    }, 'image/png', 0.95);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-950/70 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[92vh]"
        onMouseUp={handleMouseUp}
      >
        {/* HEADER MODAL */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-zinc-900 tracking-tight flex items-center gap-2">
                Căn Chỉnh Khung Ảnh Logo
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 uppercase">
                  Tỉ lệ 1:1 chuẩn Web
                </span>
              </h3>
              <p className="text-xs text-zinc-500">
                Kéo di chuyển hoặc thu phóng để vùng logo vừa khít vào ô hiển thị trên website và hóa đơn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/80 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* NỘI DUNG CHÍNH (CHIA 2 CỘT TRÊN MÀN HÌNH LỚN) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* CỘT TRÁI: KHUNG CẮT ẢNH TƯƠNG TÁC (7 CỘT) */}
          <div className="md:col-span-7 flex flex-col items-center space-y-4">
            
            {/* VIEWPORT CẮT ẢNH */}
            <div 
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              className="relative w-[300px] h-[300px] sm:w-[320px] sm:h-[320px] rounded-2xl bg-zinc-900 overflow-hidden flex items-center justify-center select-none cursor-grab active:cursor-grabbing shadow-inner border border-zinc-700"
            >
              {/* Ảnh gốc đang được di chuyển/zoom */}
              {imageSrc && (
                <div
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.08s ease-out',
                  }}
                  className="pointer-events-none select-none"
                >
                  <img
                    src={imageSrc}
                    alt="Logo Crop Source"
                    className="max-w-none select-none pointer-events-none"
                    style={{
                      maxHeight: `${CROP_BOX_SIZE}px`,
                      maxWidth: `${CROP_BOX_SIZE}px`,
                      objectFit: 'contain',
                    }}
                    draggable={false}
                  />
                </div>
              )}

              {/* LỚP MẶT NẠ LÀM TỐI VÙNG NGOÀI (CROP MASK OVERLAY) */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Lưới cắt 1:1 ở giữa */}
                <div 
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ width: `${CROP_BOX_SIZE}px`, height: `${CROP_BOX_SIZE}px` }}
                >
                  {/* Đường viền khung cắt */}
                  <div 
                    className={`w-full h-full border-2 border-dashed border-amber-400 shadow-[0_0_0_9999px_rgba(10,10,10,0.7)] transition-all ${
                      maskShape === 'rounded' ? 'rounded-2xl' : maskShape === 'circle' ? 'rounded-full' : 'rounded-none'
                    }`}
                  />

                  {/* Lưới căn 1/3 (Rule of Thirds Guidelines) */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30 pointer-events-none">
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-r border-b border-white" />
                    <div className="border-b border-white" />
                    <div className="border-r border-white" />
                    <div className="border-r border-white" />
                    <div />
                  </div>

                  {/* 4 dấu góc định vị */}
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-amber-400" />
                  <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-amber-400" />
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-amber-400" />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-amber-400" />
                </div>
              </div>

              {/* HƯỚNG DẪN THAO TÁC TRỰC QUAN */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[11px] text-white/90 font-medium pointer-events-none flex items-center gap-1.5 whitespace-nowrap">
                <Move className="w-3 h-3 text-amber-400" /> Kéo để di chuyển • Cuộn để phóng to
              </div>
            </div>

            {/* THANH ĐIỀU KHIỂN THU PHÓNG & GÓC XOAY */}
            <div className="w-full max-w-[320px] space-y-3 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200">
              
              {/* THANH ZOOM */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.max(Number((prev - 0.1).toFixed(2)), 0.5))}
                  className="p-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                  title="Thu nhỏ"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="range"
                    min="0.5"
                    max="3.5"
                    step="0.05"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-amber-600"
                  />
                  <span className="text-xs font-mono font-bold text-zinc-600 w-10 text-right">
                    {Math.round(zoom * 100)}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setZoom((prev) => Math.min(Number((prev + 0.1).toFixed(2)), 3.5))}
                  className="p-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                  title="Phóng to"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              {/* NÚT XOAY & ĐẶT LẠI */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={handleRotate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-amber-600" />
                  Xoay 90° ({rotation}°)
                </button>

                {/* Chọn dáng viền xem trước */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-zinc-200 text-[11px] font-bold text-zinc-600">
                  <button
                    type="button"
                    onClick={() => setMaskShape('rounded')}
                    className={`px-2 py-0.5 rounded-lg cursor-pointer ${maskShape === 'rounded' ? 'bg-amber-500 text-white' : 'hover:bg-zinc-100'}`}
                  >
                    Bo góc
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaskShape('circle')}
                    className={`px-2 py-0.5 rounded-lg cursor-pointer ${maskShape === 'circle' ? 'bg-amber-500 text-white' : 'hover:bg-zinc-100'}`}
                  >
                    Tròn
                  </button>
                  <button
                    type="button"
                    onClick={() => setMaskShape('square')}
                    className={`px-2 py-0.5 rounded-lg cursor-pointer ${maskShape === 'square' ? 'bg-amber-500 text-white' : 'hover:bg-zinc-100'}`}
                  >
                    Vuông
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 cursor-pointer"
                  title="Đặt lại vị trí gốc"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Gốc
                </button>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: XEM TRƯỚC THỰC TẾ TRÊN GIAO DIỆN (5 CỘT) */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wider">
              <Eye className="w-4 h-4 text-amber-600" />
              Xem Trước Vừa Đúng Giao Diện Web
            </div>

            {/* PREVIEW 1: TRÊN THANH HEADER WEBSITE */}
            <div className="bg-[#fbf7f2] border border-amber-200/80 rounded-2xl p-3.5 shadow-xs space-y-2">
              <div className="text-[11px] font-bold text-zinc-500 uppercase flex items-center gap-1">
                <Store className="w-3.5 h-3.5 text-amber-600" />
                Hiển thị trên Header Website (Thực tế):
              </div>

              {/* Mô phỏng Header thực tế */}
              <div className="bg-white rounded-xl p-2.5 border border-amber-100 shadow-xs flex items-center gap-3">
                {/* Logo Box đúng chuẩn Header: w-10 h-10 rounded-2xl gradient */}
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-orange-400 flex items-center justify-center text-white shadow-md shadow-amber-500/25 shrink-0 overflow-hidden p-0.5">
                  {previewDataUrl ? (
                    <img 
                      src={previewDataUrl} 
                      alt="Preview" 
                      className="w-full h-full object-contain rounded-xl"
                    />
                  ) : (
                    <div className="w-full h-full bg-amber-400/50 animate-pulse rounded-xl" />
                  )}
                </div>

                {/* Tên tiệm & Slogan bên cạnh */}
                <div className="flex flex-col justify-center overflow-hidden">
                  <span className="text-xs font-black tracking-tight text-amber-950 uppercase leading-tight truncate">
                    {storeName || 'TIỆM BÁNH ABC'}
                  </span>
                  <span className="text-[10px] font-bold text-amber-600 tracking-wide uppercase mt-0.5 truncate">
                    {slogan || 'Artisan Bakery & POS'}
                  </span>
                </div>
              </div>
            </div>

            {/* PREVIEW 2: TRÊN HÓA ĐƠN IN NHIỆT (BILL) */}
            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 shadow-xs space-y-2">
              <div className="text-[11px] font-bold text-zinc-500 uppercase flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-zinc-700" />
                Hiển thị trên Hóa Đơn & Tem Bánh:
              </div>

              {/* Giả lập giấy in nhiệt */}
              <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-2xs text-center space-y-1 font-mono">
                <div className="w-12 h-12 mx-auto rounded-xl overflow-hidden border border-zinc-200 p-0.5">
                  {previewDataUrl && (
                    <img 
                      src={previewDataUrl} 
                      alt="Receipt Logo" 
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
                <div className="text-[11px] font-black uppercase text-zinc-900 tracking-wider">
                  {storeName || 'TIỆM BÁNH ABC'}
                </div>
                <div className="text-[9px] text-zinc-500">
                  HÓA ĐƠN TÍNH TIỀN #001
                </div>
              </div>
            </div>

            {/* GỢI Ý MẸO */}
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Mẹo căn logo đẹp nhất:
              </div>
              <ul className="text-[11px] text-amber-800 list-disc pl-4 space-y-0.5">
                <li>Thu phóng sao cho biểu tượng chính nằm trọn trong ô lưới 1/3.</li>
                <li>Khung đã được thiết kế <strong>tỉ lệ 1:1</strong> chuẩn kích thước hiển thị của Header.</li>
                <li>Sau khi lưu, hệ thống sẽ tự động đồng bộ sang tất cả máy POS và KDS.</li>
              </ul>
            </div>

          </div>

        </div>

        {/* FOOTER MODAL - CÁC NÚT THAO TÁC */}
        <div className="px-5 py-3.5 bg-zinc-50 border-t border-zinc-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-700 text-xs font-bold hover:bg-zinc-100 transition cursor-pointer"
          >
            Hủy Bỏ
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            Áp Dụng & Cắt Logo Vừa Vặn
          </button>
        </div>

      </div>
    </div>
  );
};
