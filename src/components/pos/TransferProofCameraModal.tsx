'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle2, X, Upload, AlertCircle, Video } from 'lucide-react';

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
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Kiểm tra thiết bị di động hay máy tính
  const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Dừng stream camera an toàn
  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {}
    }
    setCameraActive(false);
    setIsCameraLoading(false);
  }, []);

  // Khởi động Camera thiết bị (Webcam PC hoặc Camera Điện Thoại)
  const startCamera = useCallback(async (mode: 'environment' | 'user' = 'environment') => {
    setCameraError(null);
    setIsCameraLoading(true);

    try {
      // Dừng stream cũ nếu đang chạy
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError('Trình duyệt không hỗ trợ mở camera trực tiếp (WebRTC). Vui lòng chọn tải ảnh từ máy tính.');
        setIsCameraLoading(false);
        setCameraActive(false);
        return;
      }

      // Kiểm tra danh sách thiết bị camera có nhiều hơn 1 không
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      } catch {}

      let stream: MediaStream | null = null;

      // Cấu hình camera phù hợp cho Mobile hoặc Desktop
      if (isMobile) {
        // Mobile: ưu tiên camera sau để chụp màn hình bill
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: mode },
              audio: false,
            });
          } catch {
            stream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }
      } else {
        // Desktop / Laptop: Webcam thông thường
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!stream) {
        throw new Error('Không thể kết nối với luồng video');
      }

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('muted', 'true');
        videoRef.current.muted = true;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Lỗi auto-play video stream:', playErr);
        }
      }

      setCameraActive(true);
      setIsCameraLoading(false);
      setCameraError(null);
    } catch (err: any) {
      console.warn('Không thể mở camera:', err);
      setIsCameraLoading(false);
      setCameraActive(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Trình duyệt đang chặn camera. Vui lòng bấm vào biểu tượng Camera/Ổ khóa trên thanh địa chỉ để cấp quyền "Cho phép" (Allow).');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('Không tìm thấy webcam hoặc camera trên thiết bị. Bạn vui lòng sử dụng nút "Chọn ảnh từ máy" bên dưới.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Webcam đang bị ứng dụng khác (Zoom, Zalo, Teams...) chiếm dụng. Vui lòng tắt ứng dụng đó hoặc tải ảnh lên.');
      } else {
        setCameraError(`Chưa mở được camera (${err.message || 'Lỗi kết nối'}). Bạn có thể thử lại hoặc tải ảnh bill từ máy.`);
      }
    }
  }, [isMobile]);

  // Tự động bật camera khi mở modal
  useEffect(() => {
    // Trên desktop, mặc định là webcam thường (user/front)
    const initialMode = isMobile ? 'environment' : 'user';
    setFacingMode(initialMode);
    startCamera(initialMode);

    return () => {
      stopCamera();
    };
  }, [isMobile, startCamera, stopCamera]);

  // Nén và chuẩn hóa ảnh về max 1200px chất lượng cao (~100-200KB)
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
            const result = canvas.toDataURL('image/jpeg', 0.82);
            setCapturedImage(result);
            stopCamera();
          } else {
            fallbackFileReader(file);
          }
        } catch {
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
  }, [stopCamera]);

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

  // Chụp ảnh từ khung hình Webcam / Video trực tiếp
  const handleSnap = () => {
    if (!videoRef.current) return;
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const rawUrl = canvas.toDataURL('image/jpeg', 0.85);
        setCapturedImage(rawUrl);
        stopCamera();
      }
    } catch (e) {
      console.error('Lỗi khi chụp ảnh webcam:', e);
    }
  };

  // Nhận file ảnh từ input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
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
    startCamera(next);
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
          {/* 1. THẺ VIDEO WEBCAM: LUÔN NẰM TRONG DOM ĐỂ TRÁNH NULL REF KHI WEBRTC STREAM SẴN SÀNG */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              cameraActive && !capturedImage ? 'opacity-100 block' : 'opacity-0 hidden'
            }`}
          />

          {/* Khung căn chỉnh viewfinder khi camera đang bật */}
          {cameraActive && !capturedImage && (
            <div className="absolute inset-4 border-2 border-dashed border-white/50 rounded-xl pointer-events-none flex flex-col items-center justify-end pb-2">
              <span className="text-[10px] text-white/90 bg-black/50 px-2 py-0.5 rounded-full font-medium backdrop-blur-xs">
                Căn chỉnh màn hình bill chuyển khoản vào khung
              </span>
            </div>
          )}

          {/* 2. HIỂN THỊ ẢNH ĐÃ CHỤP */}
          {capturedImage && (
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
          )}

          {/* 3. TRẠNG THÁI ĐANG KẾT NỐI CAMERA */}
          {isCameraLoading && !capturedImage && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-4 text-center space-y-2.5 text-white">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center animate-pulse">
                <Video className="w-6 h-6 animate-spin" />
              </div>
              <p className="text-xs font-bold text-white">Đang kết nối camera/webcam...</p>
              <p className="text-[11px] text-zinc-400 max-w-[260px] leading-relaxed">
                Nếu trình duyệt hiển thị thông báo, vui lòng bấm <b>Cho phép (Allow)</b> để sử dụng camera.
              </p>
            </div>
          )}

          {/* 4. TRẠNG THÁI LỖI HOẶC CHƯA MỞ ĐƯỢC CAMERA */}
          {!cameraActive && !isCameraLoading && !capturedImage && (
            <div className="p-4 text-center text-white space-y-3 flex flex-col items-center justify-center h-full w-full select-none bg-zinc-950">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                {cameraError ? <AlertCircle className="w-6 h-6 text-rose-400" /> : <Camera className="w-6 h-6 text-amber-400" />}
              </div>

              <div className="space-y-1 max-w-[300px]">
                <p className="text-xs font-extrabold text-white">
                  {cameraError ? 'Không thể mở Camera' : 'Camera chưa bật'}
                </p>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  {cameraError || 'Bấm nút bên dưới để khởi động webcam máy tính hoặc tải ảnh bill từ máy.'}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Bật lại Webcam</span>
                </button>

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold border border-zinc-700 flex items-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Chọn ảnh từ máy</span>
                </button>
              </div>
            </div>
          )}

          {/* Nút lật camera trước / sau (khi có video stream và có nhiều camera) */}
          {cameraActive && !capturedImage && (hasMultipleCameras || isMobile) && (
            <button
              type="button"
              onClick={toggleFacing}
              className="absolute top-2 right-2 p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 transition cursor-pointer shadow-md"
              title="Đổi camera trước / sau"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {/* Trạng thái đang xử lý nén ảnh */}
          {isProcessing && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white text-xs font-bold gap-2 backdrop-blur-xs">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Đang xử lý ảnh bill...</span>
            </div>
          )}
        </div>

        {/* Thông báo hướng dẫn */}
        <p className="text-[11px] text-zinc-500 text-center italic shrink-0">
          {capturedImage
            ? 'Kiểm tra thông tin trên bill đã rõ ràng rồi bấm "Xác Nhận Đơn Hàng".'
            : 'Hướng camera vào màn hình thông báo chuyển khoản của khách rồi bấm "Chụp Ảnh Ngay".'}
        </p>

        {/* Các input file ẩn hỗ trợ fallback tải file */}
        {isMobile && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="sr-only opacity-0 absolute w-0 h-0 pointer-events-none"
            tabIndex={-1}
          />
        )}
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
              {/* Nút Chụp Ảnh Ngay khi Webcam đang phát video */}
              {cameraActive ? (
                <button
                  type="button"
                  onClick={handleSnap}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <Camera className="w-5 h-5" />
                  <span>📸 CHỤP ẢNH BILL NGAY</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="w-full py-3.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs sm:text-sm shadow-md shadow-amber-600/30 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
                >
                  <Camera className="w-5 h-5" />
                  <span>🎥 Mở Webcam / Camera</span>
                </button>
              )}

              {/* Các tùy chọn phụ: Tải ảnh từ thư mục máy / Zalo hoặc Mở máy ảnh điện thoại */}
              <div className="flex gap-2">
                {isMobile && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-3 px-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition text-center"
                    title="Mở ứng dụng chụp ảnh gốc của điện thoại"
                  >
                    <Camera className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>Máy Ảnh Điện Thoại</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex-1 py-3 px-3 rounded-2xl border border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition text-center"
                  title="Tải ảnh bill từ thư mục máy tính hoặc ảnh chụp màn hình Zalo"
                >
                  <Upload className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span>📁 Chọn Ảnh Từ Máy / Zalo</span>
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
