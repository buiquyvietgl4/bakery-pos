'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, X, AlertTriangle, Upload, Image as ImageIcon } from 'lucide-react';

interface TransferProofCameraModalProps {
  orderNumber: string;
  amount: number;
  onConfirm: (imageBase64: string) => void;
  onClose: () => void;
}

export function TransferProofCameraModal({
  orderNumber,
  amount,
  onConfirm,
  onClose,
}: TransferProofCameraModalProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Khởi động Camera thiết bị (nếu hỗ trợ)
  const startCamera = useCallback(async (mode: 'environment' | 'user' = 'environment') => {
    setCameraError(null);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Trình duyệt không hỗ trợ truy cập Camera WebRTC trực tiếp. Vui lòng bấm nút mở Máy Ảnh bên dưới.');
        setCameraActive(false);
        return;
      }

      let stream: MediaStream | null = null;
      // Thử cấp 1: Camera sau với độ phân giải lý tưởng
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (e1) {
        // Thử cấp 2: Chỉ yêu cầu facingMode cơ bản
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: mode },
            audio: false,
          });
        } catch (e2) {
          // Thử cấp 3: Mọi video camera có sẵn
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!stream) {
        throw new Error('Không lấy được luồng video');
      }

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {}
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('Không thể mở camera trực tiếp:', err);
      setCameraError('Chưa cấp quyền Camera hoặc Camera đang bận. Vui lòng bấm vào khung bên dưới để mở Máy Ảnh chụp trực tiếp!');
      setCameraActive(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stopCamera();
    };
  }, [facingMode, startCamera, stopCamera]);

  // Nén ảnh về kích thước nhẹ (~100-150KB) để lưu database an toàn
  const compressImage = (dataUrl: string, callback: (compressed: string) => void) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxDim = 1024;
      let w = img.width;
      let h = img.height;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const result = canvas.toDataURL('image/jpeg', 0.75);
        callback(result);
      } else {
        callback(dataUrl);
      }
    };
    img.onerror = () => callback(dataUrl);
    img.src = dataUrl;
  };

  // Chụp từ video feed
  const handleSnap = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const rawUrl = canvas.toDataURL('image/jpeg', 0.85);
        compressImage(rawUrl, (compressed) => {
          setCapturedImage(compressed);
          stopCamera();
        });
      }
    } catch (e) {
      console.error('Lỗi khi chụp ảnh:', e);
    }
  };

  // Chọn ảnh từ camera gốc của điện thoại qua input capture
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = reader.result as string;
      compressImage(rawUrl, (compressed) => {
        setCapturedImage(compressed);
        stopCamera();
      });
    };
    reader.readAsDataURL(file);
  };

  // Chụp lại
  const handleRetake = () => {
    setCapturedImage(null);
    startCamera(facingMode);
  };

  // Đổi camera trước / sau
  const toggleFacing = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-3xl border border-zinc-200 max-w-md w-full p-4 sm:p-5 shadow-2xl space-y-3.5 flex flex-col max-h-[92dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 pb-2 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-zinc-900 leading-tight">
                Chụp Ảnh Bill Chuyển Khoản
              </h3>
              <div className="flex items-center gap-2 text-xs text-zinc-500 pt-0.5">
                <span className="font-mono font-bold text-amber-700">#{orderNumber}</span>
                <span>•</span>
                <span className="font-black text-emerald-600">{(amount || 0).toLocaleString('vi-VN')}₫</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Khung chụp / Xem trước ảnh */}
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center border border-zinc-800 shrink-0">
          {capturedImage ? (
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={capturedImage}
                alt="Bill chuyển khoản đối soát"
                className="w-full h-full object-contain"
              />
              <div className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-emerald-600 text-white font-black text-[10px] uppercase shadow">
                ✓ Đã chụp
              </div>
            </div>
          ) : cameraActive ? (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="w-full h-full object-cover"
            />
          ) : (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="p-6 text-center text-white space-y-3 cursor-pointer hover:bg-zinc-900 transition flex flex-col items-center justify-center h-full"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Camera className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-300">
                  {cameraError || 'Đang chuẩn bị Camera...'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  👉 <b>Chạm vào đây</b> để mở Camera điện thoại chụp bill ngay
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startCamera(facingMode);
                }}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại WebRTC
              </button>
            </div>
          )}

          {/* Nút lật camera trước / sau */}
          {cameraActive && !capturedImage && (
            <button
              type="button"
              onClick={toggleFacing}
              className="absolute top-2 right-2 p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 transition cursor-pointer"
              title="Đổi camera trước / sau"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Thông báo hướng dẫn */}
        <p className="text-[11px] text-zinc-500 text-center italic shrink-0">
          {capturedImage
            ? 'Kiểm tra thông tin trên màn hình đã rõ ràng rồi bấm "Xác Nhận Đơn Hàng".'
            : 'Hướng camera vào màn hình điện thoại của khách có thông báo chuyển khoản thành công.'}
        </p>

        {/* Input file ẩn hỗ trợ mở camera gốc điện thoại */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Nút hành động */}
        <div className="space-y-2 pt-1 shrink-0">
          {!capturedImage ? (
            <div className="flex gap-2">
              {cameraActive && (
                <button
                  type="button"
                  onClick={handleSnap}
                  className="flex-1 py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-600/30 flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <Camera className="w-4 h-4" />
                  <span>Chụp Ảnh Màn Hình Khách</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`${
                  cameraActive
                    ? 'px-4 border border-zinc-300 hover:bg-zinc-50 text-zinc-700'
                    : 'flex-1 bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/30 border border-transparent'
                } py-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition`}
              >
                <Camera className="w-4 h-4" />
                <span>{cameraActive ? 'Mở Camera Điện Thoại' : '📸 Mở Camera Điện Thoại Chụp Bill'}</span>
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3.5 rounded-2xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <RefreshCw className="w-4 h-4 text-zinc-500" />
                <span>Chụp Lại</span>
              </button>

              <button
                type="button"
                onClick={() => onConfirm(capturedImage)}
                className="flex-2 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Xác Nhận Đơn Hàng</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
