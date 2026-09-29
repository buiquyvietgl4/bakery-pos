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
  ArrowRight,
  Users,
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
    resetAdminPasswordWithRecoveryKey,
    user,
    accounts,
    loginWithCredentials,
    loginAsAccount,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'staff' | 'admin'>('staff');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Tab Nhân Viên / Tài khoản cá nhân
  const [selectedAccount, setSelectedAccount] = useState<UserAccount | null>(null);
  const [accountPassword, setAccountPassword] = useState('');
  const [showAccountPass, setShowAccountPass] = useState(false);

  // Form đăng nhập tự do (Username + Password)
  const [useCustomCredentials, setUseCustomCredentials] = useState(false);
  const [customUsername, setCustomUsername] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [showCustomPass, setShowCustomPass] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');

  // Trạng thái khôi phục mật khẩu Admin khẩn cấp bằng Khóa Cứng Root
  const [isRecoveringAdmin, setIsRecoveringAdmin] = useState(false);
  const [rescueKeyInput, setRescueKeyInput] = useState('');
  const [newAdminPassInput, setNewAdminPassInput] = useState('');
  const [rescueSuccessMsg, setRescueSuccessMsg] = useState('');

  useEffect(() => {
    if (isLoginModalOpen) {
      if (loginTargetRole === 'admin') {
        setActiveTab('admin');
      } else {
        setActiveTab('staff');
      }

      setAdminPassword('');
      setShowAdminPass(false);
      setErrorMsg('');
      setIsRecoveringAdmin(false);
      setRescueKeyInput('');
      setNewAdminPassInput('');
      setRescueSuccessMsg('');

      setSelectedAccount(null);
      setAccountPassword('');
      setShowAccountPass(false);

      setUseCustomCredentials(false);
      setCustomUsername('');
      setCustomPassword('');
      setShowCustomPass(false);
      setAccountSearch('');
    }
  }, [isLoginModalOpen, loginTargetRole]);

  if (!isLoginModalOpen) return null;

  // Đăng nhập Chủ Tiệm
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const res = loginAdmin(adminPassword);
    if (!res.success) {
      setErrorMsg(res.error || 'Mật khẩu Chủ Tiệm không đúng');
    }
  };

  // Cứu hộ Admin khẩn cấp
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

  // Đăng nhập bằng tài khoản được chọn từ danh sách
  const handleAccountPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setErrorMsg('');
    const res = loginAsAccount(selectedAccount, accountPassword);
    if (!res.success) {
      setErrorMsg(res.error || 'Mật khẩu không chính xác!');
    }
  };

  // Đăng nhập bằng Username & Password
  const handleCustomCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const res = loginWithCredentials(customUsername, customPassword);
    if (!res.success) {
      setErrorMsg(res.error || 'Tên đăng nhập hoặc mật khẩu không đúng!');
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
      <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in duration-200 border border-zinc-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-zinc-900">Đăng Nhập Hệ Thống</h3>
              <p className="text-[11px] text-zinc-500">Đăng nhập tài khoản bằng mật khẩu để vào ca</p>
            </div>
          </div>
          <button
            onClick={closeLoginModal}
            className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2 Tabs: Nhân Viên Vào Ca & Chủ Tiệm */}
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-2xl text-xs font-bold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('staff');
              setErrorMsg('');
              setSelectedAccount(null);
              setAccountPassword('');
            }}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'staff'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Nhân Viên Vào Ca</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              setErrorMsg('');
              setSelectedAccount(null);
            }}
            className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-rose-700 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Chủ Tiệm (Admin)</span>
          </button>
        </div>

        {/* ── TAB 1: NHÂN VIÊN VÀO CA ── */}
        {activeTab === 'staff' && (
          <div className="space-y-4">
            {useCustomCredentials ? (
              /* Đăng nhập tự do bằng Username & Password */
              <form onSubmit={handleCustomCredentialsSubmit} className="space-y-3.5">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-100">
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomCredentials(false);
                      setErrorMsg('');
                    }}
                    className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" /> Quay lại chọn tài khoản
                  </button>
                  <span className="text-[11px] text-zinc-400 font-medium">Nhập trực tiếp</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Tên Đăng Nhập:</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={customUsername}
                    onChange={(e) => setCustomUsername(e.target.value)}
                    placeholder="ví dụ: admin, lan_thungan, bep..."
                    className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold text-zinc-700">Mật Khẩu:</label>
                  </div>
                  <div className="relative">
                    <input
                      type={showCustomPass ? 'text' : 'password'}
                      required
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCustomPass(!showCustomPass)}
                      className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      {showCustomPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    className="flex-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> Đăng Nhập
                  </button>
                </div>
              </form>
            ) : selectedAccount ? (
              /* Đã chọn một nhân viên cụ thể -> Nhập Mật khẩu của người đó */
              <form onSubmit={handleAccountPasswordSubmit} className="space-y-4">
                <div className="flex items-center justify-between pb-1 border-b border-zinc-100">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAccount(null);
                      setAccountPassword('');
                      setErrorMsg('');
                    }}
                    className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" /> Chọn người khác
                  </button>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getRoleBadge(selectedAccount.role).color}`}>
                    {getRoleBadge(selectedAccount.role).icon} {getRoleBadge(selectedAccount.role).label}
                  </span>
                </div>

                {/* Profile người dùng đang chọn */}
                <div className="p-3 bg-amber-50/70 rounded-2xl border border-amber-200 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
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

                {/* Ô nhập Mật Khẩu */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-700 block">
                    Nhập Mật Khẩu Của Bạn:
                  </label>
                  <div className="relative">
                    <input
                      type={showAccountPass ? 'text' : 'password'}
                      required
                      autoFocus
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      placeholder="Nhập mật khẩu..."
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border-2 border-amber-300 focus:border-amber-600 rounded-xl text-sm font-bold text-zinc-900 focus:outline-hidden pr-10 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccountPass(!showAccountPass)}
                      className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      {showAccountPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
                    onClick={() => { setSelectedAccount(null); setAccountPassword(''); }}
                    className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                  >
                    Quay Lại
                  </button>
                  <button
                    type="submit"
                    className="flex-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    Vào Ca Làm Việc <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            ) : (
              /* Danh sách nhân viên để bấm chọn */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-zinc-700">Chọn tài khoản của bạn để vào ca:</p>
                  <button
                    type="button"
                    onClick={() => {
                      setUseCustomCredentials(true);
                      setErrorMsg('');
                    }}
                    className="text-[11px] font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                  >
                    Nhập tên đăng nhập ➔
                  </button>
                </div>

                {/* Tìm kiếm nhanh nếu nhiều tài khoản */}
                {activeAccountsList.length > 3 && (
                  <div className="relative">
                    <input
                      type="text"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="Tìm theo tên hoặc username..."
                      className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                    />
                    <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
                  </div>
                )}

                {/* Grid danh sách tài khoản */}
                <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-0.5">
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
                            setAccountPassword('');
                            setErrorMsg('');
                          }}
                          className="w-full text-left p-2.5 rounded-2xl border border-zinc-200 hover:border-amber-400 hover:bg-amber-50/50 active:scale-[0.99] transition flex items-center justify-between group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-zinc-100 group-hover:bg-amber-600 group-hover:text-white text-zinc-700 font-black text-sm flex items-center justify-center transition shadow-2xs">
                              {acc.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-xs text-zinc-900 group-hover:text-amber-950 truncate">
                                  {acc.name}
                                </span>
                                {hasCustom && (
                                  <span className="text-[9px] text-amber-600 bg-amber-50 px-1 py-0.2 rounded-sm border border-amber-200">
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
                            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-600 transition" />
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

        {/* ── TAB 2: CHỦ TIỆM (ADMIN) ── */}
        {activeTab === 'admin' && (
          isRecoveringAdmin ? (
            <form onSubmit={handleRescueSubmit} className="space-y-3.5">
              <div className="p-3 bg-amber-50/90 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-1">
                <p className="font-black flex items-center gap-1.5 text-amber-900 text-xs">
                  <Shield className="w-4 h-4 text-amber-600" /> CỨU HỘ ADMIN BẰNG MÃ 1 LẦN (OTP)
                </p>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Nhập mã cứu hộ được tạo trực tiếp từ máy tính gốc (chạy file <b>TAO_MA_CUU_HO.bat</b>). Mã chỉ có hiệu lực 1 lần duy nhất.
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
                    placeholder="Ví dụ: ROOT-8492-3105..."
                    className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <KeyRound className="w-4 h-4 text-amber-500 absolute right-3.5 top-3" />
                </div>
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
                  <Shield className="w-4 h-4" /> Xác Thực & Đổi Mật Khẩu
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
                  Toàn quyền truy cập cả 3 phân hệ: Quầy Bán Hàng (POS), Bếp Bánh (KDS), và Quản Trị & Kế Toán.
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
                    type={showAdminPass ? 'text' : 'password'}
                    required
                    autoFocus
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Nhập mật khẩu admin..."
                    className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-sm font-black text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500 pr-10 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPass(!showAdminPass)}
                    className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    {showAdminPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
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
