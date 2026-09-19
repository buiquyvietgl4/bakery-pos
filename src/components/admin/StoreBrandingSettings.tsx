// src/components/admin/StoreBrandingSettings.tsx

import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, Image as ImageIcon, Upload, Save, CheckCircle2, 
  Trash2, Phone, MapPin, Sparkles, Receipt, FileText, Cake,
  Hash, RotateCcw, Crop
} from 'lucide-react';
import { LogoCropModal } from './LogoCropModal';
import { 
  getStoreBranding, 
  saveStoreBranding, 
  fetchStoreBrandingFromDb,
  saveStoreBrandingToDb,
  peekNextOrderNumber,
  resetOrderCounter,
  StoreBrandingConfig, 
  BRANDING_UPDATED_EVENT 
} from '@/lib/utils/storeBranding';
import { supabase } from '@/lib/supabase/client';

export const StoreBrandingSettings: React.FC = () => {
  const [config, setConfig] = useState<StoreBrandingConfig>(getStoreBranding());
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isResettingCounter, setIsResettingCounter] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [rawImageForCrop, setRawImageForCrop] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfig(getStoreBranding());
    fetchStoreBrandingFromDb().then((loaded) => {
      if (loaded) setConfig(loaded);
    });
    const handleUpdate = (e: any) => {
      if (e.detail) setConfig(e.detail);
      else setConfig(getStoreBranding());
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, handleUpdate);
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setRawImageForCrop(base64);
        setIsCropModalOpen(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBase64: string, blob?: Blob) => {
    setIsUploadingLogo(true);
    setConfig((prev) => ({ ...prev, logoUrl: croppedBase64 }));

    // Tự động đẩy file đã cắt lên Supabase Storage bucket bakery-images nếu online
    if (blob) {
      try {
        const fileName = `branding/logo_${Date.now()}.png`;
        const { data: sData, error: sErr } = await supabase.storage
          .from('bakery-images')
          .upload(fileName, blob, { contentType: 'image/png', upsert: true });

        if (!sErr && sData?.path) {
          const { data: uData } = supabase.storage.from('bakery-images').getPublicUrl(sData.path);
          if (uData?.publicUrl) {
            setConfig((prev) => ({ ...prev, logoUrl: uData.publicUrl }));
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải logo lên Supabase storage:', err);
      }
    }
    setIsUploadingLogo(false);
  };

  const handleOpenCropWithCurrent = () => {
    if (!config.logoUrl) return;
    setRawImageForCrop(config.logoUrl);
    setIsCropModalOpen(true);
  };

  const handleRemoveLogo = () => {
    setConfig((prev) => ({ ...prev, logoUrl: '' }));
  };

  const handleResetOrderCounter = async () => {
    const confirmed = window.confirm(
      '⚠️ BẠN CÓ CHẮC MUỐN ĐẶT LẠI MÃ SỐ ĐƠN HÀNG VỀ 0?\n\n' +
      '• Sau khi reset, đơn hàng tiếp theo tạo ra tại quầy sẽ bắt đầu lại từ số #001.\n' +
      '• Toàn bộ các thiết bị POS và Bếp sẽ tự động đồng bộ ngay lập tức.\n\n' +
      'Bấm OK để thực hiện reset về 0.'
    );
    if (!confirmed) return;

    setIsResettingCounter(true);
    setResetSuccessMsg(null);
    try {
      const res = await resetOrderCounter(0);
      if (res.success) {
        setConfig((prev) => ({ ...prev, orderCounter: 0 }));
        setResetSuccessMsg('✅ Đã đặt lại mã số đơn hàng về 0! Đơn tiếp theo sẽ là #001.');
        setTimeout(() => setResetSuccessMsg(null), 5000);
      } else {
        alert('❌ Có lỗi khi reset: ' + (res.error || 'Vui lòng thử lại'));
      }
    } catch (e: any) {
      alert('❌ Lỗi: ' + (e?.message || 'Không thể kết nối CSDL'));
    } finally {
      setIsResettingCounter(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await saveStoreBrandingToDb(config);
      if (res.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 4000);
      } else {
        setSaveError(res.error || 'Có lỗi khi lưu lên cơ sở dữ liệu Supabase');
      }
    } catch (err: any) {
      setSaveError(err?.message || 'Có lỗi xảy ra khi lưu');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs space-y-6">
      
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-wider">
            <Building2 className="w-4 h-4" />
            Nhận Diện Thương Hiệu Cửa Hàng
          </div>
          <h3 className="text-xl font-black text-zinc-900 tracking-tight mt-0.5">
            Cài Đặt Tên Tiệm & Logo Quán
          </h3>
          <p className="text-xs text-zinc-500">
            Khi thay đổi, toàn bộ Header ứng dụng, Hóa đơn in nhiệt, Tem nhãn dán bánh và Phiếu chốt sổ sẽ tự động đồng bộ theo trên tất cả các máy.
          </p>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          Đã lưu lên CSDL Supabase và phát sóng đồng bộ thương hiệu tức thì tới tất cả thiết bị!
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-center gap-2 animate-fade-in">
          ⚠️ {saveError}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* KHỐI 1: TÊN TIỆM & SLOGAN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-700">
              Tên tiệm bánh (Hiển thị chính): <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={config.storeName}
              onChange={(e) => setConfig({ ...config, storeName: e.target.value })}
              placeholder="Ví dụ: Tiệm Bánh Hạnh Phúc, Tiệm Bánh ABC..."
              className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-black text-zinc-900 shadow-2xs focus:bg-white focus:border-amber-500 focus:outline-none"
            />
            <span className="text-[11px] text-zinc-400">Xuất hiện trên Menu, Header, Hóa đơn tính tiền và Tem dán bánh</span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-700">
              Slogan / Lời giới thiệu ngắn:
            </label>
            <input
              type="text"
              value={config.slogan}
              onChange={(e) => setConfig({ ...config, slogan: e.target.value })}
              placeholder="Ví dụ: Artisan Bakery & Coffee • Bánh Tươi Mỗi Ngày"
              className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-2xs focus:bg-white focus:border-amber-500 focus:outline-none"
            />
            <span className="text-[11px] text-zinc-400">Xuất hiện phụ đề dưới tên tiệm ở góc trên cùng của thanh Header</span>
          </div>
        </div>

        {/* KHỐI 2: LOGO TIỆM BÁNH */}
        <div className="p-5 bg-amber-50/40 rounded-2xl border border-amber-200 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-950 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-amber-700" />
              Logo Tiệm Bánh
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900 font-bold uppercase tracking-wider">
                Tỉ lệ 1:1 chuẩn Header Web
              </span>
            </span>
            {config.logoUrl && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenCropWithCurrent}
                  className="text-xs text-amber-700 hover:text-amber-900 bg-amber-100/80 hover:bg-amber-200 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition"
                  title="Cắt hoặc điều chỉnh lại khung logo"
                >
                  <Crop className="w-3.5 h-3.5" /> Căn Chỉnh Khung
                </button>
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="text-xs text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Xóa logo
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5">
            {/* VÙNG HIỂN THỊ LOGO HIỆN TẠI (CLICK ĐỂ CĂN CHỈNH) */}
            <div 
              onClick={() => config.logoUrl ? handleOpenCropWithCurrent() : fileInputRef.current?.click()}
              className="group relative flex items-center justify-center w-24 h-24 rounded-2xl border-2 border-dashed border-amber-300 bg-white p-2 shrink-0 shadow-inner cursor-pointer hover:border-amber-500 transition overflow-hidden"
              title={config.logoUrl ? "Bấm vào để căn chỉnh lại khung ảnh" : "Bấm để tải ảnh lên"}
            >
              {config.logoUrl ? (
                <>
                  <img
                    src={config.logoUrl}
                    alt="Store Logo"
                    className="w-full h-full object-contain rounded-xl"
                  />
                  <div className="absolute inset-0 bg-black/40 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity rounded-2xl">
                    <Crop className="w-4 h-4 mb-0.5" />
                    Chỉnh Khung
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-amber-600">
                  <Cake className="w-8 h-8" />
                  <span className="text-[9px] font-bold mt-1 text-amber-700">Icon Gốc</span>
                </div>
              )}
            </div>

            {/* NÚT TẢI LÊN & HƯỚNG DẪN */}
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 hover:shadow transition flex items-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <Upload className="w-4 h-4" />
                  {isUploadingLogo ? 'Đang xử lý logo...' : 'Chọn Ảnh Logo Mới'}
                </button>

                {config.logoUrl && (
                  <button
                    type="button"
                    onClick={handleOpenCropWithCurrent}
                    className="px-3.5 py-2.5 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/70 rounded-xl text-xs font-bold shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Crop className="w-4 h-4 text-amber-700" />
                    Căn Chỉnh Khung Ảnh Hiện Tại
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Khi chọn ảnh xong, cửa sổ <strong>căn chỉnh khung ảnh</strong> sẽ tự động hiện lên để bạn zoom và di chuyển cho vừa khít với ô hiển thị logo trên Web và Hóa đơn.
              </p>
            </div>
          </div>
        </div>

        {/* KHỐI 3: THÔNG TIN LIÊN HỆ & HÓA ĐƠN */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-700 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-amber-600" />
              Hotline / Số điện thoại quán:
            </label>
            <input
              type="text"
              value={config.phone}
              onChange={(e) => setConfig({ ...config, phone: e.target.value })}
              placeholder="0901 234 567"
              className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-900 shadow-2xs focus:bg-white focus:border-amber-500 focus:outline-none"
            />
            <span className="text-[11px] text-zinc-400">In trên đầu hóa đơn & tem dán bánh để khách liên hệ</span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-zinc-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              Địa chỉ tiệm bánh:
            </label>
            <input
              type="text"
              value={config.address}
              onChange={(e) => setConfig({ ...config, address: e.target.value })}
              placeholder="123 Đường Bánh Ngọt, Phường 5, Quận 3, TP.HCM"
              className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-semibold text-zinc-900 shadow-2xs focus:bg-white focus:border-amber-500 focus:outline-none"
            />
            <span className="text-[11px] text-zinc-400">In trên hóa đơn giao hàng & phiếu hẹn lấy bánh</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-zinc-700">
            Lời cảm ơn in dưới chân hóa đơn:
          </label>
          <input
            type="text"
            value={config.footerMessage}
            onChange={(e) => setConfig({ ...config, footerMessage: e.target.value })}
            placeholder="Cảm ơn Quý khách & Hẹn gặp lại!"
            className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-2xs focus:bg-white focus:border-amber-500 focus:outline-none"
          />
        </div>

        {/* KHỐI 4: QUẢN LÝ & RESET MÃ SỐ ĐƠN HÀNG VỀ 0 */}
        <div className="p-5 bg-gradient-to-br from-amber-50/80 via-orange-50/40 to-stone-50 rounded-2xl border-2 border-amber-200/90 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-3">
            <div>
              <span className="text-xs font-black text-amber-900 flex items-center gap-2 uppercase tracking-wide">
                <Hash className="w-4 h-4 text-amber-600" />
                Quản Lý Mã Số Đơn Hàng & Bộ Đếm
              </span>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Mã đơn trên hóa đơn in nhiệt và loa đọc thông báo sẽ tự động tăng dần theo thứ tự (ví dụ: #001, #002, #003...)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-600">Số đơn hiện tại:</span>
              <span className="px-3 py-1 bg-amber-600 text-white rounded-xl font-black text-xs font-mono shadow-2xs">
                #{String(config.orderCounter || 0).padStart(3, '0')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tiền tố mã đơn */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-700">
                Tiền tố mã đơn hàng (Mặc định BK):
              </label>
              <input
                type="text"
                value={config.orderNumberPrefix || 'BK'}
                onChange={(e) => setConfig({ ...config, orderNumberPrefix: e.target.value.toUpperCase().trim() })}
                placeholder="BK, DH, TIEMBANH..."
                className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-2.5 text-sm font-black text-zinc-900 shadow-2xs focus:border-amber-500 focus:outline-none uppercase font-mono"
              />
              <span className="text-[11px] text-zinc-400">Ví dụ: BK $\rightarrow$ mã đơn tạo ra dạng BK-20260919-001</span>
            </div>

            {/* Xem trước mã đơn tiếp theo */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-zinc-700">
                Mã đơn hàng tiếp theo sẽ phát sinh:
              </label>
              <div className="w-full bg-amber-100/60 border border-amber-300 rounded-xl px-4 py-2.5 text-sm font-black text-amber-900 font-mono flex items-center justify-between">
                <span>{peekNextOrderNumber(config.orderNumberPrefix)}</span>
                <span className="text-[10px] text-amber-700 font-sans font-bold bg-white/80 px-2 py-0.5 rounded-md">
                  Đơn tiếp theo
                </span>
              </div>
              <span className="text-[11px] text-zinc-500">Loa thông báo sẽ đọc 3 số đuôi: &quot;đơn hàng {String(Number(config.orderCounter || 0) + 1).padStart(3, '0')}&quot;</span>
            </div>
          </div>

          {/* Hàng hành động Reset */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-amber-200">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoResetDaily"
                checked={config.autoResetDaily !== false}
                onChange={(e) => setConfig({ ...config, autoResetDaily: e.target.checked })}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="autoResetDaily" className="text-xs font-bold text-zinc-800 cursor-pointer select-none">
                Tự động đặt lại mã đơn về 0 vào mỗi ngày mới (bắt đầu #001 mỗi sáng)
              </label>
            </div>

            {/* Nút Reset Mã Đơn Về 0 */}
            <button
              type="button"
              onClick={handleResetOrderCounter}
              disabled={isResettingCounter}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              title="Đặt lại bộ đếm số đơn hàng về 0 để bắt đầu lại từ đơn #001"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isResettingCounter ? 'animate-spin' : ''}`} />
              <span>{isResettingCounter ? 'Đang reset...' : '🔄 Reset Mã Số Đơn Hàng Về 0'}</span>
            </button>
          </div>

          {resetSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-100 border border-emerald-300 text-xs font-bold text-emerald-900 flex items-center gap-2 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{resetSuccessMsg}</span>
            </div>
          )}
        </div>

        {/* KHỐI 5: XEM TRƯỚC THỰC TẾ (LIVE PREVIEWS) */}
        <div className="space-y-3 pt-2 border-t border-zinc-200">
          <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-600" />
            Xem Trước Nhận Diện Thương Hiệu Sau Khi Lưu:
          </span>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* PREVIEW 1: THANH HEADER */}
            <div className="p-3 bg-zinc-100/70 rounded-2xl border border-zinc-200 space-y-2">
              <span className="text-[11px] font-bold text-zinc-500 block">1. Thanh Header ứng dụng:</span>
              <div className="p-2.5 bg-[#fbf7f2] rounded-xl border border-amber-200/60 flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-orange-400 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                  {config.logoUrl ? (
                    <img src={config.logoUrl} alt="logo" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <Cake className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-black text-amber-950 truncate uppercase">{config.storeName || 'TIỆM BÁNH'}</div>
                  <div className="text-[10px] font-bold text-amber-600 truncate">{config.slogan || 'Artisan Bakery'}</div>
                </div>
              </div>
            </div>

            {/* PREVIEW 2: HÓA ĐƠN IN NHIỆT 80MM */}
            <div className="p-3 bg-zinc-100/70 rounded-2xl border border-zinc-200 space-y-2">
              <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5" /> 2. Hóa đơn in nhiệt (Bill):
              </span>
              <div className="p-3 bg-white rounded-xl border border-dashed border-zinc-300 text-center font-mono text-[11px] space-y-1">
                {config.logoUrl && (
                  <img src={config.logoUrl} alt="Logo" className="w-8 h-8 object-contain mx-auto mb-1" />
                )}
                <div className="font-black text-xs uppercase">{config.storeName || 'TIỆM BÁNH'}</div>
                <div className="text-[10px] text-zinc-500">{config.address}</div>
                <div className="text-[10px] text-zinc-500">Hotline: {config.phone}</div>
                <div className="text-[10px] text-zinc-400 border-t border-dashed border-zinc-200 pt-1 mt-1">
                  {config.footerMessage}
                </div>
              </div>
            </div>

            {/* PREVIEW 3: TEM NHÃN DÁN BÁNH */}
            <div className="p-3 bg-zinc-100/70 rounded-2xl border border-zinc-200 space-y-2">
              <span className="text-[11px] font-bold text-zinc-500 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> 3. Tem dán hộp bánh:
              </span>
              <div className="p-2.5 bg-white rounded-xl border border-zinc-400 font-sans text-xs space-y-1">
                <div className="flex justify-between items-center border-b border-black pb-1">
                  <div>
                    <div className="font-black text-[10px] uppercase">{config.storeName || 'TIỆM BÁNH'}</div>
                    <div className="text-[8px] text-zinc-500">Hotline: {config.phone}</div>
                  </div>
                  <span className="bg-black text-white text-[9px] font-mono px-1 rounded">#DH-1008</span>
                </div>
                <div className="text-[11px] font-black uppercase text-zinc-900 pt-0.5">BÁNH BÔNG LAN TRỨNG MUỐI</div>
              </div>
            </div>

          </div>
        </div>

        {/* NÚT LƯU */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-3 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg flex items-center gap-2 transition cursor-pointer"
          >
            {isSaving ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Đang lưu lên CSDL Supabase...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Lưu Cài Đặt & Đồng Bộ Toàn Bộ Quán
              </>
            )}
          </button>
        </div>

      </form>

      {/* CỬA SỔ CĂN CHỈNH KHUNG ẢNH LOGO CHUẨN 1:1 THEO WEB */}
      <LogoCropModal
        isOpen={isCropModalOpen}
        imageSrc={rawImageForCrop}
        storeName={config.storeName}
        slogan={config.slogan}
        onClose={() => setIsCropModalOpen(false)}
        onCropComplete={handleCropComplete}
      />

    </div>
  );
};
