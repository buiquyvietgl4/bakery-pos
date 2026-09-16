'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, X, Upload, Image as ImageIcon, Sparkles } from 'lucide-react';

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
  const [isProcessing, setIsProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Nén và chuẩn hóa ảnh về max 1200px chất lượng cao vừa đủ (~100-200KB)
  const processImageFile = useCallback((file: File) => {
    setIsProcessing(true);
    try {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          URL.revokeObjectURL(objectUrl);
          const maxDim = 1200;
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
            const result = canvas.toDataURL('image/jpeg', 0.8);
            setCapturedImage(result);
            stopCamera();
          } else {
            fallbackFileReader(file);
          }
        } catch (e) {
          fallbackFileReader(file);
        } finally {
          setIsProcessing(false);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        fallbackFileReader(file);
      };
      img.src = objectUrl;
    } catch {
      fallbackFileReader(file);
    }
  }, []);

  const fallbackFileReader = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
      setIsProcessing(false);
      stopCamera();
    };
    reader.onerror = () => setIsProcessing(false);
    reader.readAsDataURL(file);
  };

  // Khởi động Camera thiết bị (WebRTC)
  const startCamera = useCallback(async (mode: 'environment' | 'user' = 'environment') => {
    setCameraError(null);
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraActive(false);
        return;
      }

      // Giới hạn timeout 2.0s để không làm đơ giao diện trên mobile
      const getUserMediaWithTimeout = (constraints: MediaStreamConstraints, timeoutMs = 2000): Promise<MediaStream> => {
        return Promise.race([
          navigator.mediaDevices.getUserMedia(constraints),
          new Promise<MediaStream>((_, reject) =>
            setTimeout(() => reject(new Error('WebRTC timeout')), timeoutMs)
          ),
        ]);
      };

      let stream: MediaStream | null = null;
      try {
        stream = await getUserMediaWithTimeout({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        }, 2000);
      } catch {
        try {
          stream = await getUserMediaWithTimeout({
            video: { facingMode: mode },
            audio: false,
          }, 1500);
        } catch {
          try {
            stream = await getUserMediaWithTimeout({
              video: true,
              audio: false,
            }, 1000);
          } catch {}
        }
      }

      if (!stream) {
        setCameraActive(false);
        return;
      }

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch {}
        setCameraActive(true);
      }
    } catch (err: any) {
      console.warn('WebRTC stream không khả dụng trên thiết bị này:', err);
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

  // Chụp từ video feed trực tiếp
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
        setCapturedImage(rawUrl);
        stopCamera();
      }
    } catch (e) {
      console.error('Lỗi khi chụp ảnh trực tiếp:', e);
    }
  };

  // Chọn ảnh từ camera gốc điện thoại hoặc thư viện
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    // Reset để nếu người dùng chụp lại cùng file/ảnh vẫn kích hoạt onChange
    e.target.value = '';
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
    <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
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
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Khung chụp / Xem trước ảnh */}
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-4/3 flex items-center justify-center border border-zinc-800 shrink-0">
          {capturedImage ? (
            <div className="relative w-full h-full flex items-center justify-center bg-zinc-950">
              <img
                src={capturedImage}
                alt="Bill chuyển khoản đối soát"
                className="w-full h-full object-contain"
              />
              <div className="absolute top-2.5 right-2.5 px-3 py-1 rounded-full bg-emerald-600 text-white font-black text-[11px] uppercase shadow-md flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Đã chụp ảnh</span>
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
              className="p-5 text-center text-white space-y-3 cursor-pointer hover:bg-zinc-900 transition flex flex-col items-center justify-center h-full w-full select-none"
            >
              <div className="w-14 h-14 rounded-3xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                <Camera className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-black text-white">
                  Chạm để Bật Máy Ảnh Chụp Bill
                </p>
                <p className="text-xs text-amber-300 font-medium">
                  👉 Sử dụng camera điện thoại để chụp màn hình bill khách
                </p>
              </div>
              <span className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-600/30">
                📸 Bật Máy Ảnh Ngay
              </span>
            </div>
          )}

          {/* Nút lật camera trước / sau (khi đang có video stream) */}
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

          {/* Trạng thái đang xử lý nén ảnh */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white text-xs font-bold gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Đang xử lý ảnh bill...</span>
            </div>
          )}
        </div>

        {/* Thông báo hướng dẫn */}
        <p className="text-[11px] text-zinc-500 text-center italic shrink-0">
          {capturedImage
            ? 'Kiểm tra thông tin trên màn hình đã rõ ràng rồi bấm "Xác Nhận Đơn Hàng".'
            : 'Chụp lại màn hình điện thoại của khách có thông báo chuyển khoản thành công để đối soát.'}
        </p>

        {/* 2 Input file ẩn hỗ trợ mở camera gốc điện thoại HOẶC tải ảnh từ thư viện/Zalo */}
        {/* Lưu ý: Dùng sr-only + opacity-0 thay vì hidden để tương thích 100% với iOS Safari */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none"
          tabIndex={-1}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none"
          tabIndex={-1}
        />

        {/* Nút hành động */}
        <div className="space-y-2 pt-1 shrink-0">
          {!capturedImage ? (
            <div className="space-y-2">
              {/* Nếu camera WebRTC mở được -> hiện nút Chụp Màn Hình */}
              {cameraActive && (
                <button
                  type="button"
                  onClick={handleSnap}
                  className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-600/30 flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  <Camera className="w-4 h-4" />
                  <span>Chụp Màn Hình Trực Tiếp</span>
                </button>
              )}

              {/* 2 Lựa chọn chụp bằng Camera máy HOẶC chọn ảnh có sẵn từ Zalo/Gallery */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-3.5 px-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-600/30 flex items-center justify-center gap-2 cursor-pointer transition text-center"
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>{cameraActive ? 'Máy Ảnh Điện Thoại' : '📸 Chụp Bằng Máy Ảnh'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="py-3.5 px-3 rounded-2xl border border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition text-center shrink-0"
                  title="Tải ảnh bill từ thư viện máy hoặc Zalo"
                >
                  <Upload className="w-4 h-4 text-zinc-500" />
                  <span>Tải Ảnh / Zalo</span>
                </button>
              </div>
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
                onClick={() => {
                  stopCamera();
                  onConfirm(capturedImage);
                }}
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
