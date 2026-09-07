'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth/AuthContext';
import { Shield, Users, Lock, KeyRound, X, Check, Delete, ArrowRight } from 'lucide-react';

export default function LoginModal() {
  const {
    isLoginModalOpen,
    loginTargetRole,
    closeLoginModal,
    loginAdmin,
    loginStaff,
    user,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'admin' | 'staff'>('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isLoginModalOpen) {
      setActiveTab(loginTargetRole);
      setAdminPassword('');
      setStaffPin('');
      setErrorMsg('');
    }
  }, [isLoginModalOpen, loginTargetRole]);

  if (!isLoginModalOpen) return null;

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const res = loginAdmin(adminPassword);
    if (!res.success) {
      setErrorMsg(res.error || 'Mật khẩu không đúng');
    }
  };

  const handleStaffSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    const res = loginStaff(staffPin);
    if (!res.success) {
      setErrorMsg(res.error || 'Mã PIN không đúng');
    }
  };

  const handleKeypadPress = (val: string) => {
    setErrorMsg('');
    if (val === 'clear') {
      setStaffPin('');
    } else if (val === 'backspace') {
      setStaffPin((prev) => prev.slice(0, -1));
    } else {
      if (staffPin.length < 6) {
        const nextPin = staffPin + val;
        setStaffPin(nextPin);
        if (nextPin.length === 4) {
          // Auto submit when 4 digits entered
          setTimeout(() => {
            const res = loginStaff(nextPin);
            if (!res.success) {
              setErrorMsg(res.error || 'Mã PIN không đúng');
            }
          }, 150);
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
              <p className="text-[11px] text-zinc-500">Chọn loại tài khoản để truy cập hệ thống</p>
            </div>
          </div>
          <button
            onClick={closeLoginModal}
            className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              setErrorMsg('');
            }}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Shield className="w-4 h-4" /> Chủ Tiệm (Admin)
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('staff');
              setErrorMsg('');
            }}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'staff'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Users className="w-4 h-4" /> Nhân Viên (Staff)
          </button>
        </div>

        {/* TAB 1: ADMIN LOGIN */}
        {activeTab === 'admin' && (
          <form onSubmit={handleAdminSubmit} className="space-y-4">
            <div className="p-3 bg-amber-50/60 rounded-2xl border border-amber-200/80 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                👑 Quyền Chủ Tiệm (Toàn quyền hệ thống):
              </p>
              <p className="text-[11px] text-amber-800">
                Toàn quyền xem báo cáo tài chính P&L, quản lý giá vốn COGS, định mức BOM, kiểm kê kho và cài đặt tài khoản ngân hàng.
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
                <span className="text-[10px] text-zinc-400 font-mono">Mặc định: admin123</span>
              </div>
              <div className="relative">
                <input
                  type="password"
                  required
                  autoFocus
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Nhập mật khẩu admin..."
                  className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-sm font-black text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
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
                className="flex-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Check className="w-4 h-4" /> Đăng Nhập Quản Trị
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: STAFF LOGIN (PIN PAD) */}
        {activeTab === 'staff' && (
          <form onSubmit={handleStaffSubmit} className="space-y-4">
            <div className="p-3 bg-orange-50/60 rounded-2xl border border-orange-200/80 text-xs text-orange-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                👤 Quyền Nhân Viên Bán Hàng & Bếp:
              </p>
              <p className="text-[11px] text-orange-800">
                Chuyên phục vụ quầy Thu ngân (POS) và làm bếp (KDS). Tự động khóa toàn bộ báo cáo doanh thu & giá vốn bí mật.
              </p>
            </div>

            <div className="space-y-2 text-center">
              <div className="flex justify-between items-center text-xs px-1">
                <span className="font-bold text-zinc-700">Mã PIN Đăng Nhập Nhanh:</span>
                <span className="text-[10px] text-zinc-400 font-mono">Mặc định: 1234</span>
              </div>

              {/* Display PIN circles */}
              <div className="flex justify-center items-center gap-3 py-2 bg-zinc-50 rounded-2xl border border-zinc-200">
                {[0, 1, 2, 3].map((idx) => {
                  const hasVal = staffPin.length > idx;
                  return (
                    <div
                      key={idx}
                      className={`w-4 h-4 rounded-full transition-all ${
                        hasVal
                          ? 'bg-amber-600 scale-110 shadow-xs'
                          : 'bg-zinc-200 border border-zinc-300'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Number keypad for touch screens */}
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
                  Xóa hết
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
                  title="Xóa ký tự"
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
                className="flex-2 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                Vào Ca Bán Hàng <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
