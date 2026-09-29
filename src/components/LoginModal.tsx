'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth, UserAccount, UserRole } from '@/lib/auth/AuthContext';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  LogIn,
  X,
  Shield,
  ChefHat,
  ShoppingCart,
  Users,
  Sparkles,
  ArrowRight,
  AlertCircle,
  KeyRound,
  Check,
  ChevronLeft,
} from 'lucide-react';

export default function LoginModal() {
  const {
    isLoginModalOpen,
    loginTargetRole,
    closeLoginModal,
    resetAdminPasswordWithRecoveryKey,
    accounts,
    loginWithCredentials,
    securityConfig,
  } = useAuth();

  // State trường đăng nhập
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Khôi phục quyền Admin khẩn cấp (Root/Telegram OTP)
  const [isRecoveringAdmin, setIsRecoveringAdmin] = useState(false);
  const [rescueKeyInput, setRescueKeyInput] = useState('');
  const [newAdminPassInput, setNewAdminPassInput] = useState('');
  const [rescueSuccessMsg, setRescueSuccessMsg] = useState('');
  const [rescueErrorMsg, setRescueErrorMsg] = useState('');

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Khi modal mở, tự động gợi ý username theo mục tiêu (nếu có)
  useEffect(() => {
    if (isLoginModalOpen) {
      setErrorMsg('');
      setPassword('');
      setShowPassword(false);
      setIsRecoveringAdmin(false);
      setRescueKeyInput('');
      setNewAdminPassInput('');
      setRescueSuccessMsg('');
      setRescueErrorMsg('');

      if (loginTargetRole === 'admin') {
        setUsername(securityConfig.adminUsername || 'admin');
        setTimeout(() => passwordInputRef.current?.focus(), 100);
      } else if (loginTargetRole === 'kitchen') {
        const kitchenAcc = accounts.find((a) => a.role === 'kitchen' && a.isActive !== false);
        setUsername(kitchenAcc ? kitchenAcc.username : 'bep');
        setTimeout(() => passwordInputRef.current?.focus(), 100);
      } else if (loginTargetRole === 'cashier') {
        const cashierAcc = accounts.find((a) => a.role === 'cashier' && a.isActive !== false);
        setUsername(cashierAcc ? cashierAcc.username : 'nhanvien');
        setTimeout(() => passwordInputRef.current?.focus(), 100);
      } else {
        setUsername('');
        setTimeout(() => usernameInputRef.current?.focus(), 100);
      }
    }
  }, [isLoginModalOpen, loginTargetRole, securityConfig.adminUsername, accounts]);

  if (!isLoginModalOpen) return null;

  // Xử lý gửi form đăng nhập chuẩn (Username + Password)
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim()) {
      setErrorMsg('Vui lòng nhập tên tài khoản hoặc số điện thoại!');
      usernameInputRef.current?.focus();
      return;
    }

    if (!password.trim()) {
      setErrorMsg('Vui lòng nhập mật khẩu đăng nhập!');
      passwordInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    try {
      const res = loginWithCredentials(username.trim(), password.trim());
      if (!res.success) {
        setErrorMsg(res.error || 'Tài khoản hoặc mật khẩu không chính xác!');
        passwordInputRef.current?.focus();
      } else {
        // Đăng nhập thành công, AuthContext sẽ tự động cập nhật user và đóng modal
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Xử lý khôi phục Admin khẩn cấp
  const handleRescueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRescueErrorMsg('');
    setRescueSuccessMsg('');

    const trimmedKey = rescueKeyInput.trim();
    if (!trimmedKey) {
      setRescueErrorMsg('Vui lòng nhập mã OTP cứu hộ hoặc khóa cứng Root!');
      return;
    }
    if (!newAdminPassInput.trim() || newAdminPassInput.length < 4) {
      setRescueErrorMsg('Mật khẩu mới phải có ít nhất 4 ký tự!');
      return;
    }

    // Chốt chặn tại trình duyệt: Kiểm tra xem mã này đã từng được sử dụng chưa
    if (typeof window !== 'undefined') {
      try {
        const rawBurned = localStorage.getItem('bakery_burned_otp_codes');
        if (rawBurned) {
          const burnedList = JSON.parse(rawBurned);
          const cleanKey = trimmedKey.toUpperCase();
          const normKey = cleanKey.replace(/^(ADM-|ROOT-)/i, '').trim();
          if (Array.isArray(burnedList) && burnedList.some((c: string) => c === cleanKey || c === normKey || c === `ADM-${normKey}`)) {
            setRescueErrorMsg('MÃ CỨU HỘ NÀY ĐÃ ĐƯỢC SỬ DỤNG TRƯỚC ĐÓ VÀ ĐÃ BỊ HỦY! Vui lòng mở ứng dụng cứu hộ trên máy tính để lấy mã mới.');
            return;
          }
        }
      } catch {}
    }

    try {
      const res = await resetAdminPasswordWithRecoveryKey(trimmedKey, newAdminPassInput.trim());
      if (res.success) {
        setRescueSuccessMsg(res.message || 'Khôi phục thành công! Đang chuyển vào hệ thống...');
        setRescueKeyInput('');
        setNewAdminPassInput('');
        setTimeout(() => {
          closeLoginModal();
        }, 1200);
      } else {
        setRescueErrorMsg(res.error || 'Mã xác thực không hợp lệ hoặc đã hết hạn!');
      }
    } catch (err: any) {
      setRescueErrorMsg(err?.message || 'Lỗi hệ thống khi khôi phục quyền Admin!');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return { label: 'Chủ Tiệm', icon: '👑', color: 'bg-rose-100 text-rose-800 border-rose-200' };
      case 'manager':
        return { label: 'Quản Lý', icon: '👔', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'kitchen':
        return { label: 'Thợ Bếp', icon: '🍳', color: 'bg-orange-100 text-orange-800 border-orange-200' };
      case 'cashier':
        return { label: 'Thu Ngân', icon: '🛒', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      default:
        return { label: 'Nhân Viên', icon: '👤', color: 'bg-teal-100 text-teal-800 border-teal-200' };
    }
  };

  const activeAccounts = (accounts || []).filter((a) => a.isActive !== false);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in duration-200 border border-zinc-200">
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-black shadow-md shadow-amber-600/20">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-zinc-900">Đăng Nhập Hệ Thống</h3>
              <p className="text-xs text-zinc-500">Nhập tài khoản và mật khẩu để vào ca làm việc</p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeLoginModal}
            className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
            title="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cửa sổ Khôi Phục Admin Khẩn Cấp */}
        {isRecoveringAdmin ? (
          <form onSubmit={handleRescueSubmit} className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <button
                type="button"
                onClick={() => {
                  setIsRecoveringAdmin(false);
                  setRescueErrorMsg('');
                  setRescueSuccessMsg('');
                }}
                className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Quay lại đăng nhập
              </button>
              <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                Cứu Hộ Khẩn Cấp
              </span>
            </div>

            <div className="p-3 bg-rose-50/80 rounded-2xl border border-rose-200 text-xs text-rose-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-rose-600 shrink-0" />
                Dành cho Chủ Tiệm quên mật khẩu Admin:
              </p>
              <p className="text-[11px] text-rose-800 leading-relaxed">
                Mở ứng dụng <strong>Tao_Ma_Admin_1_Lan</strong> trên máy tính để lấy mã đăng nhập 1 lần (hoặc dùng Khóa Root) đặt lại mật khẩu mới.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700">Mã Đăng Nhập 1 Lần / Khóa Root:</label>
              <input
                type="text"
                required
                autoFocus
                value={rescueKeyInput}
                onChange={(e) => setRescueKeyInput(e.target.value)}
                placeholder="Nhập mã (vd: ADM-123456 hoặc 123456)..."
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 uppercase"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-zinc-700">Mật Khẩu Admin Mới:</label>
              <input
                type="password"
                required
                value={newAdminPassInput}
                onChange={(e) => setNewAdminPassInput(e.target.value)}
                placeholder="Tối thiểu 4 ký tự..."
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>

            {rescueErrorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{rescueErrorMsg}</span>
              </div>
            )}

            {rescueSuccessMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{rescueSuccessMsg}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/30 flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <KeyRound className="w-4 h-4" /> Đặt Lại Mật Khẩu Admin & Vào Hệ Thống
            </button>
          </form>
        ) : (
          /* FORM ĐĂNG NHẬP CHÍNH (TÀI KHOẢN & MẬT KHẨU) */
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            {/* Trường 1: Tài Khoản / Tên Đăng Nhập */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-700 block">
                Tài Khoản / Tên Đăng Nhập:
              </label>
              <div className="relative">
                <input
                  ref={usernameInputRef}
                  type="text"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Nhập tên tài khoản (vd: admin, thungan, bep...)"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                />
                <User className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
              </div>
            </div>

            {/* Trường 2: Mật Khẩu */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-zinc-700">Mật Khẩu:</label>
                <button
                  type="button"
                  onClick={() => setIsRecoveringAdmin(true)}
                  className="text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="Nhập mật khẩu..."
                  className="w-full pl-10 pr-10 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                />
                <Lock className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Báo lỗi nếu sai tài khoản / mật khẩu */}
            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Hàng nút bấm: Đăng nhập & Đóng */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeLoginModal}
                className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer transition"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>Đăng Nhập</span>
              </button>
            </div>

            {/* PHẦN CHỌN NHANH TÀI KHOẢN (ĐIỀN TỰ ĐỘNG USERNAME) */}
            {activeAccounts.length > 0 && (
              <div className="pt-3 border-t border-zinc-100 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-zinc-600 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Hoặc bấm để điền nhanh tài khoản:</span>
                  </span>
                  <span className="text-[10px] text-zinc-400">Tự động điền TK</span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto pr-0.5">
                  {activeAccounts.map((acc) => {
                    const badge = getRoleBadge(acc.role);
                    const isSelected = username.trim().toLowerCase() === acc.username.toLowerCase();
                    return (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => {
                          setUsername(acc.username);
                          setPassword('');
                          setErrorMsg('');
                          setTimeout(() => passwordInputRef.current?.focus(), 50);
                        }}
                        className={`p-2 rounded-xl border text-left transition flex items-center justify-between gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/80 ring-1 ring-amber-500'
                            : 'border-zinc-200 bg-zinc-50/60 hover:bg-amber-50/40 hover:border-amber-300'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-[11px] text-zinc-900 truncate">{acc.name}</p>
                          <p className="text-[10px] text-zinc-400 font-mono truncate">@{acc.username}</p>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-bold border shrink-0 ${badge.color}`}>
                          {badge.icon}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
