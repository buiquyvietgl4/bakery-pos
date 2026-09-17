'use client';

import React, { useState, useEffect } from 'react';
import { useAuth, UserRole } from '@/lib/auth/AuthContext';
import { Shield, ChefHat, ShoppingCart, Lock, KeyRound, X, Check, Delete, ArrowRight } from 'lucide-react';

export default function LoginModal() {
  const {
    isLoginModalOpen,
    loginTargetRole,
    closeLoginModal,
    loginAdmin,
    loginKitchen,
    loginCashier,
    loginStaff,
    user,
    securityConfig,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'cashier' | 'kitchen' | 'admin'>('cashier');
  const [adminPassword, setAdminPassword] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isLoginModalOpen) {
      if (loginTargetRole === 'admin') setActiveTab('admin');
      else if (loginTargetRole === 'kitchen') setActiveTab('kitchen');
      else setActiveTab('cashier');

      setAdminPassword('');
      setPinInput('');
      setErrorMsg('');
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

  const handleKitchenSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    const res = loginKitchen(pinInput);
    if (!res.success) {
      setErrorMsg(res.error || 'Mã PIN bếp không đúng');
    }
  };

  const handleCashierSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    const res = loginCashier(pinInput);
    if (!res.success) {
      setErrorMsg(res.error || 'Mã PIN bán hàng không đúng');
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
          }
        } else if (activeTab === 'cashier') {
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
      }
    }
  };

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
              <p className="text-[11px] text-zinc-500">Chọn vai trò tài khoản để vào hệ thống</p>
            </div>
          </div>
          <button
            onClick={closeLoginModal}
            className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Tab Selection: Bán hàng, Bếp, Quản trị */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('cashier');
              setPinInput('');
              setErrorMsg('');
            }}
            className={`py-2 rounded-xl flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'cashier'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span className="truncate">Bán Hàng</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('kitchen');
              setPinInput('');
              setErrorMsg('');
            }}
            className={`py-2 rounded-xl flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'kitchen'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" />
            <span className="truncate">Làm Bếp</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              setPinInput('');
              setErrorMsg('');
            }}
            className={`py-2 rounded-xl flex items-center justify-center gap-1 transition cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="truncate">Chủ Tiệm</span>
          </button>
        </div>

        {/* TAB 1: THU NGÂN / BÁN HÀNG */}
        {activeTab === 'cashier' && (
          <form onSubmit={handleCashierSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                🛒 Quyền Thu Ngân (Chỉ Bán Hàng POS):
              </p>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Tài khoản phục vụ đứng quầy thu ngân, nhận đơn bánh, xem đơn chờ ship và thu tiền. Tự động khóa màn hình Bếp và Quản trị.
              </p>
            </div>

            <div className="space-y-2 text-center">
              <div className="flex justify-between items-center text-xs px-1">
                <span className="font-bold text-zinc-700">Mã PIN Bán Hàng:</span>
                <span className="text-[10px] text-zinc-500 font-mono font-bold">Mặc định: 1234</span>
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
                    const expectedPin = (securityConfig?.staffPin || '1234').trim();
                    const expectedPass = (securityConfig?.staffPasswordHash || '123456').trim();
                    if (val === expectedPin || val === expectedPass || val === '1234' || val === '123456') {
                      setTimeout(() => loginCashier(val), 150);
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
                🍳 Quyền Nhân Viên Bếp (Vào được POS & Bếp):
              </p>
              <p className="text-[11px] text-orange-800 leading-relaxed">
                Tài khoản dành riêng cho thợ bánh làm KDS, xem công thức định mức BOM, nướng bánh và cũng có thể xem POS quầy.
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
                    const expectedPin = (securityConfig?.kitchenPin || '5678').trim();
                    const expectedPass = (securityConfig?.kitchenPasswordHash || '567890').trim();
                    if (val === expectedPin || val === expectedPass || val === '5678' || val === '567890') {
                      setTimeout(() => loginKitchen(val), 150);
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

        {/* TAB 3: ADMIN LOGIN */}
        {activeTab === 'admin' && (
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
        )}
      </div>
    </div>
  );
}
