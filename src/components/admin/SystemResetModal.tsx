// src/components/admin/SystemResetModal.tsx
// Modal Xác Nhận Reset Toàn Bộ Dữ Liệu Hệ Thống 2 Lớp (Bảo Vệ Tối Cao)
// Tích hợp Zero-Resurrection Protocol & Tự động sao lưu an toàn

'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Trash2,
  ShieldAlert,
  Download,
  Lock,
  RefreshCw,
  CheckCircle2,
  X,
  Database,
  Layers,
  Sparkles,
} from 'lucide-react';
import { executeSystemReset, ResetMode } from '@/lib/utils/systemResetManager';

interface SystemResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetComplete?: () => void;
}

export const SystemResetModal: React.FC<SystemResetModalProps> = ({
  isOpen,
  onClose,
  onResetComplete,
}) => {
  const [mode, setMode] = useState<ResetMode>('operational');
  const [backupFirst, setBackupFirst] = useState(true);
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  if (!isOpen) return null;

  const REQUIRED_CONFIRM_PHRASE = 'XÓA HẾT DỮ LIỆU';
  const isConfirmPhraseValid = confirmText.trim().toUpperCase() === REQUIRED_CONFIRM_PHRASE;
  const canSubmit = isConfirmPhraseValid && adminPassword.trim().length > 0 && !loading;

  const handleExecute = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await executeSystemReset({
        mode,
        adminPassword: adminPassword.trim(),
        backupFirst,
      });

      if (!res.success) {
        setErrorMsg(res.message || 'Lỗi khi reset hệ thống');
        setLoading(false);
        return;
      }

      setSuccessMsg(res.message);
      setLoading(false);

      try {
        const { getLocalResetEpoch } = await import('@/lib/utils/systemResetManager');
        const epoch = getLocalResetEpoch();
        if (epoch > 0) {
          sessionStorage.setItem('bakery_wiped_reloaded_epoch', String(epoch));
        }
      } catch {}

      // Bắt đầu đếm ngược làm mới giao diện
      let count = 3;
      setCountdown(count);
      const timer = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(timer);
          if (onResetComplete) onResetComplete();
          window.location.replace('/admin');
        }
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Có lỗi bất ngờ xảy ra khi reset');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-red-600/50 text-zinc-100 rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl shadow-red-950/50 space-y-5 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-600/20 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/40 flex items-center justify-center shrink-0 shadow-lg shadow-red-950/80">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Reset Toàn Bộ Dữ Liệu</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-600 text-white font-extrabold uppercase tracking-wider">
                  Nguy Hiểm
                </span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Xóa dữ liệu trên CSDL và làm sạch bộ nhớ của toàn bộ các máy truy cập
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading || countdown !== null}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition cursor-pointer disabled:opacity-30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* THÔNG BÁO THÀNH CÔNG */}
        {successMsg && (
          <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 text-xs sm:text-sm font-bold flex items-start gap-3 shadow-lg">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div>{successMsg}</div>
              <div className="text-emerald-400 text-xs font-mono">
                Tất cả các máy khác đã nhận lệnh làm sạch qua WebSocket. Đang khởi động lại sau{' '}
                <span className="text-white font-black text-sm">{countdown}s</span>...
              </div>
            </div>
          </div>
        )}

        {/* THÔNG BÁO LỖI */}
        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-950/80 border border-red-500/80 text-red-200 text-xs font-bold flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {!successMsg && (
          <div className="space-y-4">
            {/* LỰA CHỌN PHẠM VI XÓA */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-500" />
                <span>1. Chọn Phạm Vi Xóa Dữ Liệu:</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Option 1: Operational Only (Recommended) */}
                <div
                  onClick={() => setMode('operational')}
                  className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between gap-2 ${
                    mode === 'operational'
                      ? 'border-amber-500 bg-amber-950/30'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-amber-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Xóa Đơn Hàng & Vận Hành
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      Khuyên Dùng
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Xóa sạch đơn hàng, ca làm, hao hụt, doanh thu thử nghiệm. <b className="text-zinc-200">GIỮ LẠI</b> toàn bộ Menu bánh, công thức và cấu hình.
                  </p>
                </div>

                {/* Option 2: Full Factory Reset */}
                <div
                  onClick={() => setMode('full')}
                  className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex flex-col justify-between gap-2 ${
                    mode === 'full'
                      ? 'border-red-600 bg-red-950/40'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-red-400 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      Xóa Trắng Toàn Diện 100%
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/30 text-red-300 font-bold border border-red-500/40">
                      Factory Reset
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Xóa TẤT CẢ mọi thứ: Sản phẩm, công thức, nguyên liệu, đơn hàng. Hệ thống trở về trạng thái mới tinh.
                  </p>
                </div>
              </div>
            </div>

            {/* CHECKBOX SAO LƯU DỰ PHÒNG */}
            <div className="p-3.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex items-center gap-3">
              <input
                type="checkbox"
                id="backupFirst"
                checked={backupFirst}
                onChange={(e) => setBackupFirst(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
              <label htmlFor="backupFirst" className="text-xs text-zinc-300 font-medium cursor-pointer select-none flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Tự động tải về 1 bản sao lưu an toàn (file .json) vào máy tính trước khi xóa</span>
              </label>
            </div>

            {/* CẢNH BÁO CƠ CHẾ CHỐNG ĐẨY NGƯỢC */}
            <div className="p-3 rounded-2xl bg-red-950/30 border border-red-900/60 text-[11px] text-red-300 space-y-1">
              <div className="font-bold flex items-center gap-1 text-red-400">
                <Database className="w-3.5 h-3.5" />
                <span>Cơ chế Zero-Resurrection Protocol:</span>
              </div>
              <p className="text-zinc-400 leading-normal">
                Khi thực hiện, hệ thống sẽ phát sóng lệnh khẩn cấp qua WebSocket để xóa sạch bộ nhớ của các máy POS 2, Bếp, Tablet và lưu mốc Epoch trên CSDL để chặn tuyệt đối các máy offline đẩy ngược dữ liệu cũ lên lại.
              </p>
            </div>

            {/* XÁC THỰC 2 LỚP */}
            <div className="space-y-3 pt-1 border-t border-zinc-900">
              <div>
                <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 mb-1.5">
                  <Lock className="w-3.5 h-3.5 text-zinc-400" />
                  <span>2. Mật Khẩu Quản Trị Viên (Admin):</span>
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Nhập mật khẩu Admin (mặc định: admin123)..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 text-xs font-mono focus:border-red-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 flex items-center justify-between mb-1.5">
                  <span>3. Gõ chính xác cụm từ xác nhận:</span>
                  <span className="font-mono text-red-400 font-bold bg-red-950/80 px-2 py-0.5 rounded border border-red-800/80">
                    {REQUIRED_CONFIRM_PHRASE}
                  </span>
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={`Gõ đúng "${REQUIRED_CONFIRM_PHRASE}" để kích hoạt nút xóa...`}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border text-xs font-bold transition focus:outline-hidden ${
                    isConfirmPhraseValid
                      ? 'border-emerald-500 text-emerald-300 font-mono'
                      : 'border-zinc-800 text-white placeholder-zinc-500'
                  }`}
                />
              </div>
            </div>

            {/* FOOTER ACTIONS */}
            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-bold transition cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleExecute}
                disabled={!canSubmit}
                className={`px-5 py-2.5 rounded-xl font-black text-xs flex items-center gap-2 shadow-lg transition cursor-pointer ${
                  canSubmit
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/40 active:scale-95 animate-pulse'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700/50'
                }`}
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang Xóa Hệ Thống...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Xác Nhận Reset Toàn Bộ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
