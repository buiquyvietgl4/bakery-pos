'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, UserAccount, UserRole } from '@/lib/auth/AuthContext';
import {
  Shield,
  ChefHat,
  ShoppingCart,
  Lock,
  KeyRound,
  X,
  Check,
  Delete,
  ArrowRight,
  Users,
  UserCheck,
  Search,
  ChevronLeft,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';

export default function LoginModal() {
  const {
    isLoginModalOpen,
    loginTargetRole,
    closeLoginModal,
    loginAdmin,
    loginKitchen,
    loginCashier,
    loginStaff,
    resetAdminPasswordWithRecoveryKey,
    user,
    securityConfig,
    accounts,
    loginWithPin,
    loginWithCredentials,
    loginAsAccount,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'cashier' | 'kitchen' | 'accounts' | 'admin'>('cashier');
  const [adminPassword, setAdminPassword] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Tab Nhân Viên / Tài khoản cá nhân
  const [selectedAccount, setSelectedAccount] = useState<UserAccount | null>(null);
  const [useCustomCredentials, setUseCustomCredentials] = useState(false);
  const [customUsername, setCustomUsername] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');

  // Trạng thái khôi phục mật khẩu Admin khẩn cấp bằng Khóa Cứng Root
  const [isRecoveringAdmin, setIsRecoveringAdmin] = useState(false);
  const [rescueKeyInput, setRescueKeyInput] = useState('');
  const [newAdminPassInput, setNewAdminPassInput] = useState('');
  const [rescueSuccessMsg, setRescueSuccessMsg] = useState('');

  useEffect(() => {
    if (isLoginModalOpen) {
      if (loginTargetRole === 'admin') setActiveTab('admin');
      else if (loginTargetRole === 'kitchen') setActiveTab('kitchen');
      else if (loginTargetRole === 'manager') setActiveTab('accounts');
      else setActiveTab('cashier');

      setAdminPassword('');
      setPinInput('');
      setErrorMsg('');
      setIsRecoveringAdmin(false);
      setRescueKeyInput('');
      setNewAdminPassInput('');
      setRescueSuccessMsg('');
      setSelectedAccount(null);
      setUseCustomCredentials(false);
      setCustomUsername('');
      setCustomPassword('');
      setShowPassword(false);
      setAccountSearch('');
    }
  }, [isLoginModalOpen, loginTargetRole]);

  if (!isLoginModalOpen) return null;

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const res = loginAdmin(adminPassword);
    if (!res.success) {
      setErrorMsg(res.error || 'Mật khẩu Chủ Tiệm không đúng');
    }
  };

  const handleRescueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setRescueSuccessMsg('');
    try {
      const res = await resetAdminPasswordWithRecoveryKey(rescueKeyInput, newAdminPassInput);
      if (res.success) {
        setRescueSuccessMsg(res.message || 'Khôi phục quyền Quản Trị thành công! Đang vào hệ thống...');
        setTimeout(() => {
          closeLoginModal();
        }, 1200);
      } else {
        setErrorMsg(res.error || 'Khóa Cứng Root hoặc Tệp Chìa Khóa không hợp lệ!');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi xác thực khóa cứng Root');
    }
  };

  const handleKitchenSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    const pinRes = loginWithPin(pinInput);
    if (pinRes.success && (pinRes.user?.role === 'kitchen' || pinRes.user?.role === 'admin' || pinRes.user?.role === 'manager')) {
      return;
    }
    const res = loginKitchen(pinInput);
    if (!res.success) {
      setErrorMsg(res.error || 'Mã PIN bếp không đúng');
    }
  };

  const handleCashierSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    // Thử xác thực với tài khoản cá nhân có mã PIN trước
    const pinRes = loginWithPin(pinInput);
    if (pinRes.success) {
      return;
    }
    // Fallback vào mã PIN chung
    const res = loginCashier(pinInput);
    if (!res.success) {
      setErrorMsg(res.error || 'Mã PIN bán hàng không đúng');
    }
  };

  const handleAccountPinSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedAccount) return;
    setErrorMsg('');
    const res = loginAsAccount(selectedAccount, pinInput);
    if (!res.success) {
      setErrorMsg(res.error || 'Mã PIN hoặc mật khẩu không chính xác!');
    }
  };

  const handleCustomCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const res = loginWithCredentials(customUsername, customPassword);
    if (!res.success) {
      setErrorMsg(res.error || 'Tên đăng nhập hoặc mật khẩu không đúng!');
    }
  };

  const handleKeypadPress = (val: string) => {
    setErrorMsg('');
    if (val === 'clear') {
      setPinInput('');
    } else if (val === 'backspace') {
      setPinInput((prev) => prev.slice(0, -1));
    } else {
      if (pinInput.length < 12) {
        const nextPin = pinInput + val;
        setPinInput(nextPin);

        if (activeTab === 'kitchen') {
          if (nextPin.length >= 4) {
            const expectedPin = (securityConfig?.kitchenPin || '5678').trim();
            const expectedPass = (securityConfig?.kitchenPasswordHash || '567890').trim();
            if (
              nextPin === expectedPin ||
              nextPin === expectedPass ||
              nextPin === '5678' ||
              nextPin === '567890'
            ) {
              setTimeout(() => {
                const res = loginKitchen(nextPin);
                if (!res.success) setErrorMsg(res.error || 'Mã PIN không đúng');
              }, 150);
              return;
            }
            // Thử kiểm tra tài khoản cá nhân vai trò Bếp hoặc Admin
            const pinRes = loginWithPin(nextPin);
            if (pinRes.success && (pinRes.user?.role === 'kitchen' || pinRes.user?.role === 'admin' || pinRes.user?.role === 'manager')) {
              return;
            }
          }
        } else if (activeTab === 'cashier') {
          if (nextPin.length >= 4) {
            // Kiểm tra khớp mã PIN của bất kỳ tài khoản nhân viên nào
            const pinRes = loginWithPin(nextPin);
            if (pinRes.success) {
              return;
            }
            const expectedPin = (securityConfig?.staffPin || '1234').trim();
            const expectedPass = (securityConfig?.staffPasswordHash || '123456').trim();
            if (
              nextPin === expectedPin ||
              nextPin === expectedPass ||
              nextPin === '1234' ||
              nextPin === '123456'
            ) {
              setTimeout(() => {
                const res = loginCashier(nextPin);
                if (!res.success) setErrorMsg(res.error || 'Mã PIN không đúng');
              }, 150);
            }
          }
        } else if (activeTab === 'accounts' && selectedAccount) {
          if (nextPin.length >= 4) {
            const res = loginAsAccount(selectedAccount, nextPin);
            if (res.success) {
              return;
            }
          }
        }
      }
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
        return { label: 'Nhân Viên', icon: '👤', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
    }
  };

  const activeAccountsList = (accounts || []).filter((a) => a.isActive !== false);
  const filteredAccounts = activeAccountsList.filter((a) => {
    if (!accountSearch.trim()) return true;
    const q = accountSearch.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      a.username.toLowerCase().includes(q) ||
      (a.phone && a.phone.includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in duration-200 border border-amber-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-zinc-900">Đăng Nhập Phân Quyền</h3>
              <p className="text-[11px] text-zinc-500">Chọn vai trò hoặc tài khoản để vào hệ thống</p>
            </div>
          </div>
          <button
            onClick={closeLoginModal}
            className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Tabs: Bán hàng, Bếp, Tài khoản nhân viên, Quản trị */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-zinc-100 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('cashier');
              setPinInput('');
              setErrorMsg('');
              setSelectedAccount(null);
            }}
            className={`py-2 px-1 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'cashier'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span className="truncate text-[11px]">Bán Hàng</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('kitchen');
              setPinInput('');
              setErrorMsg('');
              setSelectedAccount(null);
            }}
            className={`py-2 px-1 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'kitchen'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" />
            <span className="truncate text-[11px]">Làm Bếp</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('accounts');
              setPinInput('');
              setErrorMsg('');
              setSelectedAccount(null);
              setUseCustomCredentials(false);
            }}
            className={`py-2 px-1 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'accounts'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span className="truncate text-[11px]">Nhân Viên</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              setPinInput('');
              setErrorMsg('');
              setSelectedAccount(null);
            }}
            className={`py-2 px-1 rounded-xl flex flex-col sm:flex-row items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="truncate text-[11px]">Chủ Tiệm</span>
          </button>
        </div>

        {/* TAB 1: THU NGÂN / BÁN HÀNG (Nhập PIN nhanh nhận diện tự động từng người) */}
        {activeTab === 'cashier' && (
          <form onSubmit={handleCashierSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                🛒 Nhập Mã PIN Bán Hàng (Tự Nhận Diện Nhân Viên):
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Nhập mã PIN cá nhân (hoặc PIN chung mặc định <span className="font-mono font-bold">1234</span>). Hệ thống sẽ tự động gán tên thu ngân lên đơn hàng.
              </p>
            </div>

            <div className="space-y-2 text-center">
              <div className="flex justify-between items-center text-xs px-1">
                <span className="font-bold text-zinc-700">Mã PIN:</span>
                <span className="text-[10px] text-zinc-500 font-mono font-bold">PIN cá nhân hoặc 1234</span>
              </div>

              <div className="relative max-w-[280px] mx-auto">
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={pinInput}
                  onChange={(e) => {
                    setErrorMsg('');
                    const val = e.target.value.trim();
                    setPinInput(val);
                    if (val.length >= 4) {
                      const pinRes = loginWithPin(val);
                      if (pinRes.success) return;
                      const expectedPin = (securityConfig?.staffPin || '1234').trim();
                      const expectedPass = (securityConfig?.staffPasswordHash || '123456').trim();
                      if (val === expectedPin || val === expectedPass || val === '1234' || val === '123456') {
                        setTimeout(() => loginCashier(val), 150);
                      }
                    }
                  }}
                  placeholder="••••"
                  className="w-full text-center tracking-[0.4em] font-black text-xl py-2.5 px-3 bg-zinc-50 border-2 border-amber-300 focus:border-amber-600 rounded-2xl focus:ring-2 focus:ring-amber-200 focus:outline-hidden text-zinc-900"
                />
              </div>

              {/* Chấm tròn PIN */}
              <div className="flex justify-center items-center gap-2 py-1">
                {Array.from({ length: Math.max(4, Math.min(pinInput.length, 6)) }).map((_, idx) => {
                  const hasVal = pinInput.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-3 h-3 rounded-full transition-all ${
                        hasVal ? 'bg-amber-600 scale-110 shadow-xs' : 'bg-zinc-200 border border-zinc-300'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-2 pt-1 max-w-[280px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(num)}
                    className="py-3 bg-white hover:bg-amber-50 active:bg-amber-100 rounded-xl border border-zinc-200 text-base font-black text-zinc-800 transition shadow-2xs cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleKeypadPress('clear')}
                  className="py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-600 transition cursor-pointer"
                >
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="py-3 bg-white hover:bg-amber-50 active:bg-amber-100 rounded-xl border border-zinc-200 text-base font-black text-zinc-800 transition shadow-2xs cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('backspace')}
                  className="py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 flex items-center justify-center transition cursor-pointer"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 text-center justify-center">
                <span>⚠️ {errorMsg}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeLoginModal}
                className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                Vào Ca Bán Hàng <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: NHÂN VIÊN BẾP */}
        {activeTab === 'kitchen' && (
          <form onSubmit={handleKitchenSubmit} className="space-y-4">
            <div className="p-3 bg-orange-50/80 rounded-2xl border border-orange-200 text-xs text-orange-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                🍳 Quyền Thợ Bánh / Bếp (KDS):
              </p>
              <p className="text-[11px] text-orange-800 leading-relaxed">
                Nhập mã PIN của thợ bánh để vào màn hình KDS làm bánh, định mức BOM. Mặc định: <span className="font-mono font-bold">5678</span>.
              </p>
            </div>

            <div className="space-y-2 text-center">
              <div className="flex justify-between items-center text-xs px-1">
                <span className="font-bold text-zinc-700">Mã PIN Nhân Viên Bếp:</span>
                <span className="text-[10px] text-zinc-500 font-mono font-bold">Mặc định: 5678</span>
              </div>

              <div className="relative max-w-[280px] mx-auto">
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={pinInput}
                  onChange={(e) => {
                    setErrorMsg('');
                    const val = e.target.value.trim();
                    setPinInput(val);
                    if (val.length >= 4) {
                      const expectedPin = (securityConfig?.kitchenPin || '5678').trim();
                      const expectedPass = (securityConfig?.kitchenPasswordHash || '567890').trim();
                      if (val === expectedPin || val === expectedPass || val === '5678' || val === '567890') {
                        setTimeout(() => loginKitchen(val), 150);
                        return;
                      }
                      const pinRes = loginWithPin(val);
                      if (pinRes.success && (pinRes.user?.role === 'kitchen' || pinRes.user?.role === 'admin' || pinRes.user?.role === 'manager')) {
                        return;
                      }
                    }
                  }}
                  placeholder="••••"
                  className="w-full text-center tracking-[0.4em] font-black text-xl py-2.5 px-3 bg-zinc-50 border-2 border-orange-300 focus:border-orange-600 rounded-2xl focus:ring-2 focus:ring-orange-200 focus:outline-hidden text-zinc-900"
                />
              </div>

              {/* Chấm tròn PIN */}
              <div className="flex justify-center items-center gap-2 py-1">
                {Array.from({ length: Math.max(4, Math.min(pinInput.length, 6)) }).map((_, idx) => {
                  const hasVal = pinInput.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-3 h-3 rounded-full transition-all ${
                        hasVal ? 'bg-orange-600 scale-110 shadow-xs' : 'bg-zinc-200 border border-zinc-300'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-2 pt-1 max-w-[280px] mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleKeypadPress(num)}
                    className="py-3 bg-white hover:bg-orange-50 active:bg-orange-100 rounded-xl border border-zinc-200 text-base font-black text-zinc-800 transition shadow-2xs cursor-pointer"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handleKeypadPress('clear')}
                  className="py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-600 transition cursor-pointer"
                >
                  Xóa
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('0')}
                  className="py-3 bg-white hover:bg-orange-50 active:bg-orange-100 rounded-xl border border-zinc-200 text-base font-black text-zinc-800 transition shadow-2xs cursor-pointer"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => handleKeypadPress('backspace')}
                  className="py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 flex items-center justify-center transition cursor-pointer"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 text-center justify-center">
                <span>⚠️ {errorMsg}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeLoginModal}
                className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-2 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md shadow-orange-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                Vào Màn Hình Bếp <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: TÀI KHOẢN NHÂN VIÊN CÁ NHÂN (CHỌN TÊN HOẶC ĐĂNG NHẬP RIÊNG) */}
        {activeTab === 'accounts' && (
          <div className="space-y-3.5">
            {useCustomCredentials ? (
              /* Đăng nhập bằng Tên tài khoản & Mật khẩu / PIN */
              <form onSubmit={handleCustomCredentialsSubmit} className="space-y-3.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-100">
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomCredentials(false);
                      setErrorMsg('');
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" /> Quay lại chọn tài khoản
                  </button>
                  <span className="text-[11px] text-zinc-400 font-medium">Đăng nhập tự do</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Tên Đăng Nhập:</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={customUsername}
                    onChange={(e) => setCustomUsername(e.target.value)}
                    placeholder="ví dụ: admin, lan_thu_ngan..."
                    className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold text-zinc-700">Mật Khẩu hoặc Mã PIN:</label>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5">
                    <span>⚠️ {errorMsg}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeLoginModal}
                    className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="flex-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> Đăng Nhập
                  </button>
                </div>
              </form>
            ) : selectedAccount ? (
              /* Đã chọn một nhân viên cụ thể -> Nhập PIN / Mật khẩu của người đó */
              <form onSubmit={handleAccountPinSubmit} className="space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-100">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAccount(null);
                      setPinInput('');
                      setErrorMsg('');
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" /> Chọn người khác
                  </button>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getRoleBadge(selectedAccount.role).color}`}>
                    {getRoleBadge(selectedAccount.role).icon} {getRoleBadge(selectedAccount.role).label}
                  </span>
                </div>

                {/* Profile người dùng đang chọn */}
                <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-200 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
                    {selectedAccount.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-black text-zinc-900 truncate">{selectedAccount.name}</h4>
                    <p className="text-[11px] text-zinc-500 font-mono">@{selectedAccount.username}</p>
                    {selectedAccount.customPermissions && Object.keys(selectedAccount.customPermissions).length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded-md mt-0.5">
                        <Sparkles className="w-2.5 h-2.5" /> Có quyền tùy chỉnh riêng
                      </span>
                    )}
                  </div>
                </div>

                {/* Ô nhập PIN */}
                <div className="space-y-2 text-center">
                  <div className="flex justify-between items-center text-xs px-1">
                    <span className="font-bold text-zinc-700">Nhập Mã PIN hoặc Mật Khẩu:</span>
                    <span className="text-[10px] text-zinc-400">Tối thiểu 4 ký tự</span>
                  </div>

                  <div className="relative max-w-[280px] mx-auto">
                    <input
                      type="password"
                      inputMode="numeric"
                      autoFocus
                      value={pinInput}
                      onChange={(e) => {
                        setErrorMsg('');
                        const val = e.target.value.trim();
                        setPinInput(val);
                        if (val.length >= 4) {
                          const res = loginAsAccount(selectedAccount, val);
                          if (res.success) return;
                        }
                      }}
                      placeholder="••••"
                      className="w-full text-center tracking-[0.3em] font-black text-xl py-2.5 px-3 bg-zinc-50 border-2 border-indigo-300 focus:border-indigo-600 rounded-2xl focus:ring-2 focus:ring-indigo-200 focus:outline-hidden text-zinc-900"
                    />
                  </div>

                  {/* Chấm tròn PIN */}
                  <div className="flex justify-center items-center gap-2 py-1">
                    {Array.from({ length: Math.max(4, Math.min(pinInput.length, 6)) }).map((_, idx) => {
                      const hasVal = pinInput.length > idx;
                      return (
                        <div
                          key={idx}
                          className={`w-3 h-3 rounded-full transition-all ${
                            hasVal ? 'bg-indigo-600 scale-110 shadow-xs' : 'bg-zinc-200 border border-zinc-300'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Keypad */}
                  <div className="grid grid-cols-3 gap-2 pt-1 max-w-[280px] mx-auto">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleKeypadPress(num)}
                        className="py-3 bg-white hover:bg-indigo-50 active:bg-indigo-100 rounded-xl border border-zinc-200 text-base font-black text-zinc-800 transition shadow-2xs cursor-pointer"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('clear')}
                      className="py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-600 transition cursor-pointer"
                    >
                      Xóa
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('0')}
                      className="py-3 bg-white hover:bg-indigo-50 active:bg-indigo-100 rounded-xl border border-zinc-200 text-base font-black text-zinc-800 transition shadow-2xs cursor-pointer"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('backspace')}
                      className="py-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-zinc-600 flex items-center justify-center transition cursor-pointer"
                    >
                      <Delete className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5 text-center justify-center">
                    <span>⚠️ {errorMsg}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setSelectedAccount(null); setPinInput(''); }}
                    className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                  >
                    Quay Lại
                  </button>
                  <button
                    type="submit"
                    className="flex-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    Vào Hệ Thống <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            ) : (
              /* Danh sách nhân viên để bấm chọn */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-700">Chọn tài khoản nhân viên vào ca:</p>
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomCredentials(true);
                      setErrorMsg('');
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                  >
                    Nhập tên đăng nhập ➔
                  </button>
                </div>

                {/* Tìm kiếm nhanh */}
                {activeAccountsList.length > 3 && (
                  <div className="relative">
                    <input
                      type="text"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="Tìm theo tên hoặc tên đăng nhập..."
                      className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    />
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                  </div>
                )}

                {/* Grid danh sách tài khoản */}
                <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-0.5">
                  {filteredAccounts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-500 bg-zinc-50 rounded-2xl border border-dashed border-zinc-200">
                      Không tìm thấy tài khoản phù hợp
                    </div>
                  ) : (
                    filteredAccounts.map((acc) => {
                      const badge = getRoleBadge(acc.role);
                      const hasCustom = acc.customPermissions && Object.keys(acc.customPermissions).length > 0;
                      return (
                        <button
                          key={acc.id}
                          type="button"
                          onClick={() => {
                            setSelectedAccount(acc);
                            setPinInput('');
                            setErrorMsg('');
                          }}
                          className="w-full text-left p-2.5 rounded-2xl border border-zinc-200 hover:border-indigo-400 hover:bg-indigo-50/50 active:scale-[0.99] transition flex items-center justify-between group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-zinc-100 group-hover:bg-indigo-600 group-hover:text-white text-zinc-700 font-black text-sm flex items-center justify-center transition shadow-2xs">
                              {acc.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-zinc-900 group-hover:text-indigo-950 truncate">
                                  {acc.name}
                                </span>
                                {hasCustom && (
                                  <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.2 rounded-sm border border-amber-200" title="Được cấp quyền tùy chỉnh">
                                    ⭐ Quyền riêng
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-zinc-400 font-mono">@{acc.username}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${badge.color}`}>
                              {badge.icon} {badge.label}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-indigo-600 transition" />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={closeLoginModal}
                    className="w-full py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ADMIN LOGIN */}
        {activeTab === 'admin' && (
          isRecoveringAdmin ? (
            <form onSubmit={handleRescueSubmit} className="space-y-3.5">
              <div className="p-3 bg-amber-50/90 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-1">
                <p className="font-black flex items-center gap-1.5 text-amber-900 text-xs">
                  <Shield className="w-4 h-4 text-amber-600" /> CỨU HỘ ADMIN BẰNG MÃ 1 LẦN (OTP)
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Nhập mã cứu hộ được tạo trực tiếp từ máy tính chứa mã nguồn gốc (chạy file <b>TAO_MA_CUU_HO.bat</b>). <b>Mỗi mã chỉ có hiệu lực dùng 1 lần duy nhất</b> và sẽ tự động hủy ngay sau khi đăng nhập.
                </p>
              </div>

              {/* Ô nhập Mã Dùng 1 Lần */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Mã Cứu Hộ Dùng 1 Lần *</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    value={rescueKeyInput}
                    onChange={(e) => setRescueKeyInput(e.target.value)}
                    placeholder="Nhập mã 1 lần (ví dụ: ROOT-8492-3105)..."
                    className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <KeyRound className="w-4 h-4 text-amber-500 absolute right-3.5 top-3" />
                </div>
                <p className="text-[10px] text-zinc-400 italic">
                  💡 Gợi ý: Mở máy tính chứa mã nguồn gốc của bạn, nhấp đúp file <span className="font-mono text-zinc-700 font-bold">TAO_MA_CUU_HO.bat</span> để nhận mã 1 lần.
                </p>
              </div>

              {/* Đặt lại mật khẩu mới */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Mật khẩu Quản Trị mới muốn đặt:</label>
                <input
                  type="password"
                  value={newAdminPassInput}
                  onChange={(e) => setNewAdminPassInput(e.target.value)}
                  placeholder="Để trống sẽ tự động đặt về: admin123"
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {rescueSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
                  <span>✅ {rescueSuccessMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5">
                  <span>⚠️ {errorMsg}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setIsRecoveringAdmin(false); setErrorMsg(''); }}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Quay Lại
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Shield className="w-4 h-4" /> Xác Thực & Khôi Phục Admin
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-4">
              <div className="p-3 bg-rose-50/70 rounded-2xl border border-rose-200 text-xs text-rose-950 space-y-1">
                <p className="font-bold flex items-center gap-1 text-rose-800">
                  👑 Quyền Chủ Tiệm (Toàn quyền hệ thống):
                </p>
                <p className="text-[11px] text-rose-900 leading-relaxed">
                  Toàn quyền truy cập cả 3 phân hệ: Quầy Bán Hàng (POS), Bếp Bánh (KDS), và Quản Trị & Kế Toán Doanh Thu.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Tài khoản Admin:</label>
                <input
                  type="text"
                  disabled
                  value="admin (Chủ Tiệm)"
                  className="w-full px-3.5 py-2.5 bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-600 cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-bold text-zinc-700">Mật khẩu Quản Trị:</label>
                  <span className="text-[10px] text-zinc-500 font-mono font-bold">Mặc định: admin123</span>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required
                    autoFocus
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Nhập mật khẩu admin..."
                    className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-sm font-black text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                  />
                  <KeyRound className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3" />
                </div>
              </div>

              {/* Nút kích hoạt khóa cứu hộ 1 lần */}
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => { setIsRecoveringAdmin(true); setErrorMsg(''); }}
                  className="text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-600" />
                  <span>🆘 Quên mật khẩu? Khôi phục bằng Mã Cứu Hộ 1 Lần</span>
                </button>
              </div>

              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-1.5">
                  <span>⚠️ {errorMsg}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeLoginModal}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-2 py-3 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shadow-md shadow-rose-700/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Check className="w-4 h-4" /> Đăng Nhập Quản Trị
                </button>
              </div>
            </form>
          )
        )}
      </div>
    </div>
  );
}
