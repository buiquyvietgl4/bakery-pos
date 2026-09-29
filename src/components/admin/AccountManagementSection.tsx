'use client';

import React, { useState } from 'react';
import {
  useAuth,
  UserAccount,
  UserRole,
  RolePermissions,
  PermissionKey,
  DEFAULT_PERMISSIONS,
} from '@/lib/auth/AuthContext';
import {
  UserPlus,
  Users,
  Shield,
  KeyRound,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Check,
  X,
  Lock,
  Unlock,
  Sliders,
  Sparkles,
  Search,
  ShoppingCart,
  Cake,
  Flame,
  ShieldAlert,
  BarChart3,
  FileText,
  QrCode,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';

const ROLE_INFO: Record<
  UserRole,
  { label: string; icon: string; badgeClass: string; desc: string }
> = {
  admin: {
    label: 'Chủ Tiệm (Admin)',
    icon: '👑',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    desc: 'Toàn quyền quản trị, bảo mật & tài chính của toàn bộ hệ thống.',
  },
  manager: {
    label: 'Quản Lý Tiệm (Manager)',
    icon: '👔',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    desc: 'Bán hàng, quản lý kho BOM, xem báo cáo doanh thu & duyệt đổi trả.',
  },
  cashier: {
    label: 'Thu Ngân / Bán Hàng',
    icon: '🛒',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    desc: 'Bán hàng tại quầy POS, in bill hóa đơn và mở/đóng ca két tiền.',
  },
  kitchen: {
    label: 'Nhân Viên Bếp (Kitchen)',
    icon: '🍳',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
    desc: 'Xem màn hình bếp KDS, quản lý mẻ nướng bánh và nhận đơn làm bánh.',
  },
  staff: {
    label: 'Nhân Viên Hỗ Trợ',
    icon: '👤',
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
    desc: 'Hỗ trợ đóng gói, bán hàng và phục vụ tại tiệm.',
  },
};

const PERMISSION_DEFINITIONS: {
  key: PermissionKey;
  label: string;
  icon: any;
  desc: string;
}[] = [
  {
    key: 'pos',
    label: 'Quầy Thu Ngân Bán Hàng (POS)',
    icon: ShoppingCart,
    desc: 'Tạo đơn, nhận thanh toán, in bill, mở/đóng ca két tiền.',
  },
  {
    key: 'cakeOrder',
    label: 'Đặt Bánh Kem / Bánh Trước',
    icon: Cake,
    desc: 'Lưu chữ viết lên bánh, hẹn giờ lấy bánh, nhận tiền cọc.',
  },
  {
    key: 'kitchenKds',
    label: 'Màn Hình Bếp Làm Bánh (KDS)',
    icon: Flame,
    desc: 'Xem danh sách bánh cần làm theo thời gian thực, cập nhật tiến độ ra lò.',
  },
  {
    key: 'adminAccess',
    label: 'Trang Quản Trị Hệ Thống (/admin)',
    icon: ShieldAlert,
    desc: 'Truy cập vào trang cài đặt và cấu hình tổng quan.',
  },
  {
    key: 'reports',
    label: 'Báo Cáo Doanh Thu & Lãi Lỗ (P&L)',
    icon: BarChart3,
    desc: 'Xem tổng doanh thu, lợi nhuận, biểu đồ kinh doanh và chi phí.',
  },
  {
    key: 'bomCost',
    label: 'Công Thức Bánh BOM & Giá Vốn',
    icon: FileText,
    desc: 'Bảo mật công thức cốt bánh, định mức nguyên liệu và giá vốn.',
  },
  {
    key: 'paymentSettings',
    label: 'Cài Đặt VietQR & Ví Điện Tử',
    icon: QrCode,
    desc: 'Cấu hình số tài khoản ngân hàng nhận tiền và mã QR thanh toán.',
  },
];

export default function AccountManagementSection() {
  const {
    accounts,
    createAccount,
    updateAccount,
    deleteAccount,
    toggleAccountActive,
    user,
    permissions: rolePermissions,
  } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // Trạng thái Modal Tạo / Sửa tài khoản (Bao gồm thông tin + phân quyền tích hợp)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('cashier');
  const [formPassword, setFormPassword] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [formPhone, setFormPhone] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // Custom Permissions State
  const [isCustomPermsEnabled, setIsCustomPermsEnabled] = useState(false);
  const [customPerms, setCustomPerms] = useState<RolePermissions>({
    pos: true,
    cakeOrder: true,
    kitchenKds: false,
    adminAccess: false,
    reports: false,
    bomCost: false,
    paymentSettings: false,
  });

  // Modal Phân Quyền Riêng Nhanh
  const [permissionModalAccount, setPermissionModalAccount] = useState<UserAccount | null>(null);
  const [permModalCustomEnabled, setPermModalCustomEnabled] = useState(false);
  const [permModalPerms, setPermModalPerms] = useState<RolePermissions>({
    pos: true,
    cakeOrder: true,
    kitchenKds: false,
    adminAccess: false,
    reports: false,
    bomCost: false,
    paymentSettings: false,
  });

  // Modal Đổi Mật Khẩu Nhanh
  const [passwordModalAccount, setPasswordModalAccount] = useState<UserAccount | null>(null);
  const [newQuickPassword, setNewQuickPassword] = useState('');
  const [showQuickPass, setShowQuickPass] = useState(false);

  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotify = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Mở modal tạo mới
  const handleOpenCreateModal = () => {
    setEditingAccountId(null);
    setFormName('');
    setFormUsername('');
    setFormRole('cashier');
    setFormPassword('');
    setShowFormPassword(false);
    setFormPhone('');
    setFormIsActive(true);
    setIsCustomPermsEnabled(false);
    const base = rolePermissions.cashier || DEFAULT_PERMISSIONS.cashier;
    setCustomPerms({ ...base });
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa toàn bộ
  const handleOpenEditModal = (acc: UserAccount) => {
    setEditingAccountId(acc.id);
    setFormName(acc.name);
    setFormUsername(acc.username);
    setFormRole(acc.role);
    setFormPassword(acc.password || '');
    setShowFormPassword(false);
    setFormPhone(acc.phone || '');
    setFormIsActive(acc.isActive);

    if (acc.customPermissions && Object.keys(acc.customPermissions).length > 0) {
      setIsCustomPermsEnabled(true);
      const base = rolePermissions[acc.role] || DEFAULT_PERMISSIONS[acc.role] || DEFAULT_PERMISSIONS.staff;
      setCustomPerms({
        ...base,
        ...acc.customPermissions,
      });
    } else {
      setIsCustomPermsEnabled(false);
      const base = rolePermissions[acc.role] || DEFAULT_PERMISSIONS[acc.role] || DEFAULT_PERMISSIONS.staff;
      setCustomPerms({ ...base });
    }

    setIsModalOpen(true);
  };

  // Mở modal phân quyền nhanh cho tài khoản
  const handleOpenPermissionModal = (acc: UserAccount) => {
    setPermissionModalAccount(acc);
    if (acc.customPermissions && Object.keys(acc.customPermissions).length > 0) {
      setPermModalCustomEnabled(true);
      const base = rolePermissions[acc.role] || DEFAULT_PERMISSIONS[acc.role] || DEFAULT_PERMISSIONS.staff;
      setPermModalPerms({
        ...base,
        ...acc.customPermissions,
      });
    } else {
      setPermModalCustomEnabled(false);
      const base = rolePermissions[acc.role] || DEFAULT_PERMISSIONS[acc.role] || DEFAULT_PERMISSIONS.staff;
      setPermModalPerms({ ...base });
    }
  };

  const handleSavePermissionModal = () => {
    if (!permissionModalAccount) return;
    const updates: Partial<UserAccount> = {
      customPermissions: permModalCustomEnabled ? permModalPerms : undefined,
    };
    const res = updateAccount(permissionModalAccount.id, updates);
    if (res.success) {
      showNotify('success', `Đã cập nhật quyền truy cập cho tài khoản "${permissionModalAccount.name}" thành công!`);
      setPermissionModalAccount(null);
    } else {
      showNotify('error', res.error || 'Cập nhật phân quyền thất bại!');
    }
  };

  // Mở modal đổi mật khẩu nhanh
  const handleOpenPasswordModal = (acc: UserAccount) => {
    setPasswordModalAccount(acc);
    setNewQuickPassword('');
    setShowQuickPass(false);
  };

  const handleSaveQuickPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalAccount) return;
    if (!newQuickPassword || newQuickPassword.trim().length < 4) {
      showNotify('error', 'Mật khẩu phải có tối thiểu 4 ký tự!');
      return;
    }
    const res = updateAccount(passwordModalAccount.id, { password: newQuickPassword.trim() });
    if (res.success) {
      showNotify('success', `Đã đổi mật khẩu cho tài khoản "${passwordModalAccount.name}" thành công!`);
      setPasswordModalAccount(null);
    } else {
      showNotify('error', res.error || 'Đổi mật khẩu thất bại!');
    }
  };

  // Khi người dùng thay đổi vai trò trong form modal
  const handleRoleChange = (newRole: UserRole) => {
    setFormRole(newRole);
    if (!isCustomPermsEnabled) {
      const base = rolePermissions[newRole] || DEFAULT_PERMISSIONS[newRole] || DEFAULT_PERMISSIONS.staff;
      setCustomPerms({ ...base });
    }
  };

  // Toggle từng quyền tùy chọn trong Create/Edit modal
  const handleTogglePerm = (key: PermissionKey) => {
    setCustomPerms(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Toggle từng quyền trong Quick Permission modal
  const handleTogglePermModal = (key: PermissionKey) => {
    setPermModalPerms(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Xử lý lưu form Create / Edit
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formName.trim()) {
      showNotify('error', 'Vui lòng nhập họ và tên nhân viên!');
      return;
    }
    if (!formUsername.trim()) {
      showNotify('error', 'Vui lòng nhập tên đăng nhập!');
      return;
    }

    if (!editingAccountId) {
      if (!formPassword || formPassword.trim().length < 4) {
        showNotify('error', 'Vui lòng nhập mật khẩu đăng nhập (tối thiểu 4 ký tự)!');
        return;
      }
    } else if (formPassword && formPassword.trim().length < 4) {
      showNotify('error', 'Mật khẩu đăng nhập phải có tối thiểu 4 ký tự!');
      return;
    }

    const payloadCustomPermissions = isCustomPermsEnabled ? customPerms : undefined;

    if (editingAccountId) {
      const updates: Partial<UserAccount> = {
        name: formName.trim(),
        username: formUsername.trim().toLowerCase(),
        role: formRole,
        phone: formPhone.trim() || undefined,
        isActive: formIsActive,
        customPermissions: payloadCustomPermissions,
      };
      if (formPassword.trim()) {
        updates.password = formPassword.trim();
      }

      const res = updateAccount(editingAccountId, updates);
      if (res.success) {
        showNotify('success', `Đã cập nhật tài khoản "${formName}" thành công!`);
        setIsModalOpen(false);
      } else {
        showNotify('error', res.error || 'Cập nhật tài khoản thất bại!');
      }
    } else {
      const res = createAccount({
        name: formName.trim(),
        username: formUsername.trim().toLowerCase(),
        role: formRole,
        password: formPassword.trim(),
        phone: formPhone.trim() || undefined,
        isActive: formIsActive,
        customPermissions: payloadCustomPermissions,
      });

      if (res.success) {
        showNotify('success', `Đã tạo tài khoản "${formName}" thành công!`);
        setIsModalOpen(false);
      } else {
        showNotify('error', res.error || 'Tạo tài khoản thất bại!');
      }
    }
  };

  // Xóa tài khoản
  const handleDeleteAccount = (acc: UserAccount) => {
    if (acc.username === 'admin' && acc.role === 'admin') {
      showNotify('error', 'Không thể xóa tài khoản Quản Trị Viên (Admin) gốc của hệ thống!');
      return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa tài khoản "${acc.name}" (@${acc.username}) không? Hành động này không thể hoàn tác.`)) {
      const res = deleteAccount(acc.id);
      if (res.success) {
        showNotify('success', `Đã xóa tài khoản "${acc.name}" thành công!`);
      } else {
        showNotify('error', res.error || 'Xóa tài khoản thất bại!');
      }
    }
  };

  // Lọc tài khoản theo ô tìm kiếm và vai trò
  const filteredAccounts = (accounts || []).filter(acc => {
    const matchQuery =
      acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.phone && acc.phone.includes(searchQuery));
    const matchRole = filterRole === 'all' || acc.role === filterRole;
    return matchQuery && matchRole;
  });

  // Tính số lượng thống kê
  const stats = {
    total: (accounts || []).length,
    active: (accounts || []).filter(a => a.isActive).length,
    locked: (accounts || []).filter(a => !a.isActive).length,
  };

  const getEffectivePermissions = (acc: UserAccount): RolePermissions => {
    if (acc.customPermissions && Object.keys(acc.customPermissions).length > 0) {
      const base = rolePermissions[acc.role] || DEFAULT_PERMISSIONS[acc.role] || DEFAULT_PERMISSIONS.staff;
      return { ...base, ...acc.customPermissions };
    }
    return rolePermissions[acc.role] || DEFAULT_PERMISSIONS[acc.role] || DEFAULT_PERMISSIONS.staff;
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-200 shadow-xs p-5 sm:p-6 space-y-6">
      {/* ── THÔNG BÁO POPUP ── */}
      {notification && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-zinc-400 hover:text-zinc-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── HEADER PHÂN HỆ QUẢN LÝ TÀI KHOẢN ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-black shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-zinc-900 flex items-center gap-2">
                Quản Lý Tài Khoản & Phân Quyền Nhân Viên
              </h2>
              <p className="text-xs text-zinc-500">
                Tạo tài khoản cá nhân, cài đặt vai trò và cấp quyền truy cập chi tiết cho từng người
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Thống kê nhanh */}
          <div className="flex items-center gap-2 text-xs font-bold bg-zinc-100 px-3 py-1.5 rounded-2xl">
            <span className="text-zinc-600">Tổng: <b>{stats.total}</b></span>
            <span className="text-zinc-300">|</span>
            <span className="text-emerald-700">Đang bật: <b>{stats.active}</b></span>
            <span className="text-zinc-300">|</span>
            <span className="text-rose-700">Đã khóa: <b>{stats.locked}</b></span>
          </div>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-amber-600/20 active:scale-95 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm Tài Khoản Mới</span>
          </button>
        </div>
      </div>

      {/* ── THANH TÌM KIẾM & BỘ LỌC VAI TRÒ ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên nhân viên, tên đăng nhập hoặc số điện thoại..."
            className="w-full pl-9 pr-3.5 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
          />
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Lọc theo Vai Trò */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterRole('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              filterRole === 'all'
                ? 'bg-zinc-900 text-white shadow-2xs'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            Tất cả ({stats.total})
          </button>
          {(['admin', 'manager', 'cashier', 'kitchen', 'staff'] as UserRole[]).map((r) => {
            const count = (accounts || []).filter(a => a.role === r).length;
            const rInfo = ROLE_INFO[r];
            return (
              <button
                key={r}
                type="button"
                onClick={() => setFilterRole(r)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                  filterRole === r
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
              >
                <span>{rInfo.icon}</span>
                <span>{rInfo.label.split(' ')[0]} ({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── BẢNG DANH SÁCH TÀI KHOẢN NGƯỜI DÙNG ── */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-200">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
              <th className="p-3.5 min-w-[200px]">Họ Tên & Tên Đăng Nhập</th>
              <th className="p-3.5 min-w-[150px]">Vai Trò</th>
              <th className="p-3.5 min-w-[130px]">Mật Khẩu</th>
              <th className="p-3.5 min-w-[280px]">Quyền Hạn Truy Cập</th>
              <th className="p-3.5 text-center min-w-[100px]">Trạng Thái</th>
              <th className="p-3.5 text-right min-w-[160px]">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 font-medium text-zinc-800">
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Users className="w-8 h-8 text-zinc-300" />
                    <span>Không tìm thấy tài khoản nào phù hợp với bộ lọc</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredAccounts.map((acc) => {
                const rInfo = ROLE_INFO[acc.role] || ROLE_INFO.staff;
                const hasCustom = Boolean(acc.customPermissions && Object.keys(acc.customPermissions).length > 0);
                const isPasswordShown = Boolean(showPasswordMap[acc.id]);
                const effectivePerms = getEffectivePermissions(acc);

                return (
                  <tr
                    key={acc.id}
                    className={`hover:bg-amber-50/30 transition ${
                      !acc.isActive ? 'bg-zinc-50/70 opacity-60' : ''
                    }`}
                  >
                    {/* Tên & Username */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-900 font-black flex items-center justify-center shrink-0 shadow-2xs">
                          {acc.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                            <span>{acc.name}</span>
                            {user && user.id === acc.id && (
                              <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.2 rounded-full font-bold">
                                Bạn
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono">
                            @{acc.username}
                            {acc.phone && <span className="ml-2 font-sans text-zinc-500">📞 {acc.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Vai trò */}
                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border ${rInfo.badgeClass}`}
                      >
                        <span>{rInfo.icon}</span>
                        <span>{rInfo.label}</span>
                      </span>
                    </td>

                    {/* Mật khẩu */}
                    <td className="p-3.5 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-zinc-800">
                          {isPasswordShown ? (acc.password || '(Trống)') : '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasswordMap(prev => ({
                              ...prev,
                              [acc.id]: !prev[acc.id],
                            }));
                          }}
                          className="text-zinc-400 hover:text-zinc-600 p-1 rounded-md hover:bg-zinc-100 transition cursor-pointer"
                          title={isPasswordShown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        >
                          {isPasswordShown ? (
                            <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                          ) : (
                            <Eye className="w-3.5 h-3.5 text-zinc-400" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenPasswordModal(acc)}
                          className="text-amber-600 hover:text-amber-800 hover:underline text-[10px] font-bold ml-1 cursor-pointer"
                          title="Đổi mật khẩu tài khoản"
                        >
                          Đổi
                        </button>
                      </div>
                    </td>

                    {/* Quyền hạn truy cập */}
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {hasCustom ? (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-black text-[10px] border border-amber-200">
                              <Sparkles className="w-3 h-3 text-amber-600" /> Tùy chỉnh riêng
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 font-bold text-[10px] border border-zinc-200">
                              🌟 Chuẩn vai trò
                            </span>
                          )}

                          {/* Huy hiệu các quyền được cấp */}
                          {effectivePerms.pos && (
                            <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                              POS
                            </span>
                          )}
                          {effectivePerms.cakeOrder && (
                            <span className="px-1.5 py-0.2 rounded bg-pink-50 text-pink-700 text-[10px] font-bold border border-pink-200">
                              Đặt Bánh
                            </span>
                          )}
                          {effectivePerms.kitchenKds && (
                            <span className="px-1.5 py-0.2 rounded bg-orange-50 text-orange-700 text-[10px] font-bold border border-orange-200">
                              Bếp KDS
                            </span>
                          )}
                          {effectivePerms.adminAccess && (
                            <span className="px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                              Admin
                            </span>
                          )}
                          {effectivePerms.reports && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200">
                              Báo Cáo
                            </span>
                          )}
                          {effectivePerms.bomCost && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 text-[10px] font-bold border border-amber-200">
                              BOM
                            </span>
                          )}
                          {effectivePerms.paymentSettings && (
                            <span className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                              VietQR
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Trạng thái hoạt động */}
                    <td className="p-3.5 text-center">
                      <button
                        type="button"
                        disabled={acc.username === 'admin' && acc.isActive}
                        onClick={() => {
                          const res = toggleAccountActive(acc.id);
                          if (res.success) {
                            showNotify(
                              'success',
                              `Đã ${acc.isActive ? 'khóa' : 'kích hoạt'} tài khoản "${acc.name}"!`
                            );
                          } else {
                            showNotify('error', res.error || 'Thao tác thất bại');
                          }
                        }}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[10px] font-bold transition cursor-pointer ${
                          acc.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                            : 'bg-zinc-100 text-zinc-500 border border-zinc-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
                        } ${acc.username === 'admin' && acc.isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title={acc.username === 'admin' ? 'Tài khoản Admin chính không thể khóa' : (acc.isActive ? 'Bấm để tạm khóa' : 'Bấm để kích hoạt')}
                      >
                        {acc.isActive ? (
                          <>
                            <Unlock className="w-3 h-3 text-emerald-600" />
                            <span>Hoạt động</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3 text-zinc-400" />
                            <span>Đã khóa</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Thao tác */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenPermissionModal(acc)}
                          className="px-2.5 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                          title="Cài đặt quyền truy cập cho tài khoản này"
                        >
                          <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="hidden sm:inline">Phân Quyền</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(acc)}
                          className="p-1.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-600 transition cursor-pointer"
                          title="Chỉnh sửa thông tin tài khoản"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {acc.username !== 'admin' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAccount(acc)}
                            className="p-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-600 transition cursor-pointer"
                            title="Xóa tài khoản"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── MODAL 1: THÊM MỚI / CHỈNH SỬA TÀI KHOẢN (TÍCH HỢP CÀI ĐẶT QUYỀN) ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in duration-200 border border-zinc-200 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-zinc-900">
                    {editingAccountId ? 'Chỉnh Sửa Tài Khoản & Phân Quyền' : 'Thêm Tài Khoản Người Dùng Mới'}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Thiết lập thông tin đăng nhập, vai trò và tùy chỉnh quyền truy cập hệ thống
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-5">
              {/* PHẦN 1: THÔNG TIN CƠ BẢN */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <span>1. Thông Tin Cá Nhân & Đăng Nhập</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-700 block mb-1">
                      Họ và tên nhân viên *
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ví dụ: Nguyễn Văn A"
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 block mb-1">
                      Tên đăng nhập (Username) *
                    </label>
                    <input
                      type="text"
                      required
                      value={formUsername}
                      onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                      placeholder="Ví dụ: nguyenvana"
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-zinc-700">
                        {editingAccountId ? 'Mật khẩu mới (Để trống nếu giữ nguyên)' : 'Mật khẩu đăng nhập *'}
                      </label>
                    </div>
                    <div className="relative">
                      <input
                        type={showFormPassword ? 'text' : 'password'}
                        required={!editingAccountId}
                        value={formPassword}
                        onChange={(e) => setFormPassword(e.target.value)}
                        placeholder="Tối thiểu 4 ký tự..."
                        className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowFormPassword(!showFormPassword)}
                        className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                        title={showFormPassword ? 'Ẩn' : 'Hiện'}
                      >
                        {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-zinc-700 block mb-1">
                      Số điện thoại liên hệ (Tùy chọn)
                    </label>
                    <input
                      type="text"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="Ví dụ: 0912345678"
                      className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {/* Trạng thái hoạt động switch */}
                <div className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
                  <div>
                    <span className="text-xs font-bold text-zinc-800 block">Kích hoạt tài khoản</span>
                    <span className="text-[11px] text-zinc-500">Cho phép tài khoản này đăng nhập vào hệ thống</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* PHẦN 2: CHỌN VAI TRÒ */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <span>2. Chọn Vai Trò Hệ Thống</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {(['admin', 'manager', 'cashier', 'kitchen', 'staff'] as UserRole[]).map((r) => {
                    const rInfo = ROLE_INFO[r];
                    const isSelected = formRole === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleRoleChange(r)}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'border-amber-500 bg-amber-50/70 shadow-xs ring-2 ring-amber-400/30'
                            : 'border-zinc-200 hover:border-zinc-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-black text-zinc-900 flex items-center gap-1.5">
                            <span>{rInfo.icon}</span>
                            <span>{rInfo.label.split(' ')[0]}</span>
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-amber-600 font-black" />}
                        </div>
                        <p className="text-[10px] text-zinc-500 leading-tight">
                          {rInfo.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* PHẦN 3: CÀI ĐẶT QUYỀN TRUY CẬP (CUSTOM PERMISSIONS) */}
              <div className="space-y-3 pt-2 border-t border-zinc-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <span>3. Phân Quyền Truy Cập Tính Năng</span>
                    </h4>
                    <p className="text-[11px] text-zinc-500">
                      Chọn áp dụng theo vai trò chuẩn hoặc tùy chỉnh bật/tắt từng quyền riêng
                    </p>
                  </div>

                  {/* Switcher 2 chế độ quyền */}
                  <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl text-xs font-bold self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomPermsEnabled(false);
                        const base = rolePermissions[formRole] || DEFAULT_PERMISSIONS[formRole] || DEFAULT_PERMISSIONS.staff;
                        setCustomPerms({ ...base });
                      }}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        !isCustomPermsEnabled
                          ? 'bg-white text-zinc-900 shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      🌟 Theo vai trò ({ROLE_INFO[formRole].label.split(' ')[0]})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCustomPermsEnabled(true)}
                      className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                        isCustomPermsEnabled
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      ⚙️ Tùy chỉnh riêng
                    </button>
                  </div>
                </div>

                {/* Các nút thao tác nhanh khi ở chế độ tùy chỉnh riêng */}
                {isCustomPermsEnabled && (
                  <div className="flex items-center gap-2 pt-1 pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPerms({
                          pos: true,
                          cakeOrder: true,
                          kitchenKds: true,
                          adminAccess: true,
                          reports: true,
                          bomCost: true,
                          paymentSettings: true,
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-200 transition cursor-pointer"
                    >
                      ✅ Cấp toàn bộ quyền
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPerms({
                          pos: false,
                          cakeOrder: false,
                          kitchenKds: false,
                          adminAccess: false,
                          reports: false,
                          bomCost: false,
                          paymentSettings: false,
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-200 transition cursor-pointer"
                    >
                      ❌ Tắt toàn bộ quyền
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const base = rolePermissions[formRole] || DEFAULT_PERMISSIONS[formRole] || DEFAULT_PERMISSIONS.staff;
                        setCustomPerms({ ...base });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-[10px] border border-zinc-200 transition cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Đặt lại theo vai trò
                    </button>
                  </div>
                )}

                {/* Danh sách 7 quyền hệ thống */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {PERMISSION_DEFINITIONS.map((p) => {
                    const IconComp = p.icon;
                    const isGranted = isCustomPermsEnabled
                      ? Boolean(customPerms[p.key])
                      : Boolean((rolePermissions[formRole] || DEFAULT_PERMISSIONS[formRole] || DEFAULT_PERMISSIONS.staff)[p.key]);

                    return (
                      <div
                        key={p.key}
                        onClick={() => {
                          if (isCustomPermsEnabled) {
                            handleTogglePerm(p.key);
                          }
                        }}
                        className={`p-3 rounded-2xl border transition flex items-start gap-2.5 ${
                          isCustomPermsEnabled ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'
                        } ${
                          isGranted
                            ? 'bg-emerald-50/50 border-emerald-200'
                            : 'bg-zinc-50 border-zinc-200'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isGranted ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-zinc-200 text-zinc-500'
                          }`}
                        >
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-zinc-900">{p.label}</span>
                            {isCustomPermsEnabled ? (
                              <input
                                type="checkbox"
                                checked={isGranted}
                                onChange={() => handleTogglePerm(p.key)}
                                className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500 cursor-pointer"
                              />
                            ) : (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  isGranted
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-zinc-200 text-zinc-600'
                                }`}
                              >
                                {isGranted ? 'Bật' : 'Tắt'}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">
                            {p.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex gap-2.5 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingAccountId ? 'Lưu Thay Đổi' : 'Tạo Tài Khoản & Cấp Quyền'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: PHÂN QUYỀN NHANH CHO TÀI KHOẢN (QUICK PERMISSIONS MODAL) ── */}
      {permissionModalAccount && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-5 animate-in zoom-in duration-200 border border-zinc-200 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-zinc-900">
                    Cài Đặt Quyền Truy Cập: {permissionModalAccount.name}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    @{permissionModalAccount.username} • Vai trò: {ROLE_INFO[permissionModalAccount.role]?.label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermissionModalAccount(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chế độ cấp quyền */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
              <div>
                <span className="text-xs font-bold text-zinc-800 block">Chế độ phân quyền</span>
                <span className="text-[11px] text-zinc-500">
                  {permModalCustomEnabled ? 'Đang tùy chỉnh quyền riêng cho tài khoản này' : 'Đang dùng quyền chuẩn theo vai trò'}
                </span>
              </div>
              <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-zinc-200 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setPermModalCustomEnabled(false)}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    !permModalCustomEnabled ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Theo vai trò
                </button>
                <button
                  type="button"
                  onClick={() => setPermModalCustomEnabled(true)}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    permModalCustomEnabled ? 'bg-amber-600 text-white' : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Tùy chỉnh riêng
                </button>
              </div>
            </div>

            {/* Nút thao tác nhanh khi tùy chỉnh riêng */}
            {permModalCustomEnabled && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPermModalPerms({
                      pos: true,
                      cakeOrder: true,
                      kitchenKds: true,
                      adminAccess: true,
                      reports: true,
                      bomCost: true,
                      paymentSettings: true,
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-200 transition cursor-pointer"
                >
                  ✅ Cấp tất cả quyền
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPermModalPerms({
                      pos: false,
                      cakeOrder: false,
                      kitchenKds: false,
                      adminAccess: false,
                      reports: false,
                      bomCost: false,
                      paymentSettings: false,
                    });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold text-[10px] border border-rose-200 transition cursor-pointer"
                >
                  ❌ Tắt tất cả quyền
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const base = rolePermissions[permissionModalAccount.role] || DEFAULT_PERMISSIONS[permissionModalAccount.role] || DEFAULT_PERMISSIONS.staff;
                    setPermModalPerms({ ...base });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-[10px] border border-zinc-200 transition cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Đặt lại theo vai trò
                </button>
              </div>
            )}

            {/* Danh sách 7 quyền */}
            <div className="space-y-2">
              {PERMISSION_DEFINITIONS.map((p) => {
                const IconComp = p.icon;
                const isGranted = permModalCustomEnabled
                  ? Boolean(permModalPerms[p.key])
                  : Boolean((rolePermissions[permissionModalAccount.role] || DEFAULT_PERMISSIONS[permissionModalAccount.role] || DEFAULT_PERMISSIONS.staff)[p.key]);

                return (
                  <div
                    key={p.key}
                    onClick={() => {
                      if (permModalCustomEnabled) handleTogglePermModal(p.key);
                    }}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between ${
                      permModalCustomEnabled ? 'cursor-pointer hover:border-amber-300' : 'cursor-default'
                    } ${
                      isGranted ? 'bg-emerald-50/60 border-emerald-200' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isGranted ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-500'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-xs text-zinc-900 block">{p.label}</span>
                        <span className="text-[10px] text-zinc-500">{p.desc}</span>
                      </div>
                    </div>

                    {permModalCustomEnabled ? (
                      <input
                        type="checkbox"
                        checked={isGranted}
                        onChange={() => handleTogglePermModal(p.key)}
                        className="w-4 h-4 text-emerald-600 rounded-sm focus:ring-emerald-500 cursor-pointer"
                      />
                    ) : (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isGranted ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {isGranted ? 'Cho phép' : 'Khóa'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Buttons */}
            <div className="flex gap-2.5 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setPermissionModalAccount(null)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSavePermissionModal}
                className="flex-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Check className="w-4 h-4" /> Lưu Phân Quyền
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: ĐỔI MẬT KHẨU NHANH ── */}
      {passwordModalAccount && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in duration-200 border border-zinc-200">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-zinc-900">Đổi Mật Khẩu</h3>
                  <p className="text-[11px] text-zinc-500">{passwordModalAccount.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalAccount(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickPassword} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Mật khẩu mới (Tối thiểu 4 ký tự):</label>
                <div className="relative">
                  <input
                    type={showQuickPass ? 'text' : 'password'}
                    required
                    autoFocus
                    value={newQuickPassword}
                    onChange={(e) => setNewQuickPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowQuickPass(!showQuickPass)}
                    className="absolute right-3 top-2.5 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    {showQuickPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPasswordModalAccount(null)}
                  className="flex-1 py-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  Lưu Mật Khẩu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
