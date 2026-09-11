// src/components/admin/StoreBrandingSettings.tsx

import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, Image as ImageIcon, Upload, Save, CheckCircle2, 
  Trash2, Phone, MapPin, Sparkles, Receipt, FileText, Cake
} from 'lucide-react';
import { 
  getStoreBranding, 
  saveStoreBranding, 
  fetchStoreBrandingFromDb,
  saveStoreBrandingToDb,
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

    setIsUploadingLogo(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setConfig((prev) => ({ ...prev, logoUrl: base64 }));

        // Tự động đẩy lên Supabase Storage bucket bakery-images nếu online
        try {
          const fileName = `branding/logo_${Date.now()}.png`;
          const { data: sData, error: sErr } = await supabase.storage
            .from('bakery-images')
            .upload(fileName, file, { contentType: file.type || 'image/png', upsert: true });

          if (!sErr && sData?.path) {
            const { data: uData } = supabase.storage.from('bakery-images').getPublicUrl(sData.path);
            if (uData?.publicUrl) {
              setConfig((prev) => ({ ...prev, logoUrl: uData.publicUrl }));
            }
          }
        } catch {}
      }
      setIsUploadingLogo(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setConfig((prev) => ({ ...prev, logoUrl: '' }));
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
            </span>
            {config.logoUrl && (
              <button
                type="button"
                onClick={handleRemoveLogo}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa logo (Dùng icon mặc định)
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5">
            {/* VÙNG HIỂN THỊ LOGO HIỆN TẠI */}
            <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl border-2 border-dashed border-amber-300 bg-white p-2 shrink-0 shadow-inner">
              {config.logoUrl ? (
                <img
                  src={config.logoUrl}
                  alt="Store Logo"
                  className="w-full h-full object-contain rounded-xl"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-amber-600">
                  <Cake className="w-8 h-8" />
                  <span className="text-[9px] font-bold mt-1 text-amber-700">Icon Gốc</span>
                </div>
              )}
            </div>

            {/* NÚT TẢI LÊN */}
            <div className="flex-1 space-y-2 text-center sm:text-left">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingLogo}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-2xs hover:shadow transition flex items-center justify-center sm:justify-start gap-2 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                {isUploadingLogo ? 'Đang tải logo...' : 'Tải Ảnh Logo Lên (PNG, JPG, SVG)'}
              </button>
              <p className="text-xs text-zinc-500">
                Khuyên dùng ảnh logo vuông hoặc tròn nền trong suốt (PNG), kích thước từ 200x200px đến 800x800px.
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

        {/* KHỐI 4: XEM TRƯỚC THỰC TẾ (LIVE PREVIEWS) */}
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
                    <img src={config.logoUrl} alt="logo" className="w-full h-full object-contain" />
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

    </div>
  );
};
