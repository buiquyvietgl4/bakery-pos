'use client';

import React, { useState, useMemo } from 'react';
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
  const [showPinMap, setShowPinMap] = useState<Record<string, boolean>>({});

  // Trạng thái Modal Tạo / Sửa tài khoản
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('cashier');
  const [formPin, setFormPin] = useState('');
  const [formPassword, setFormPassword] = useState('');
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
    setFormPin('');
    setFormPassword('');
    setFormPhone('');
    setFormIsActive(true);
    setIsCustomPermsEnabled(false);
    setCustomPerms({ ...DEFAULT_PERMISSIONS.cashier });
    setIsModalOpen(true);
  };

  // Mở modal chỉnh sửa
  const handleOpenEditModal = (acc: UserAccount) => {
    setEditingAccountId(acc.id);
    setFormName(acc.name);
    setFormUsername(acc.username);
    setFormRole(acc.role);
    setFormPin(acc.pin || '');
    setFormPassword(acc.password || '');
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

  // Khi người dùng thay đổi vai trò trong form modal
  const handleRoleChange = (newRole: UserRole) => {
    setFormRole(newRole);
    if (!isCustomPermsEnabled) {
      const base = rolePermissions[newRole] || DEFAULT_PERMISSIONS[newRole] || DEFAULT_PERMISSIONS.staff;
      setCustomPerms({ ...base });
    }
  };

  // Toggle từng quyền tùy chọn
  const handleTogglePerm = (key: PermissionKey) => {
    setCustomPerms(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // Xử lý lưu form
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
    if (formPin && formPin.trim().length < 4) {
      showNotify('error', 'Mã PIN đăng nhập nhanh phải có tối thiểu 4 chữ số!');
      return;
    }

    const permissionPayload = isCustomPermsEnabled ? { ...customPerms } : undefined;

    if (editingAccountId) {
      // Cập nhật tài khoản hiện có
      const res = updateAccount(editingAccountId, {
        name: formName.trim(),
        username: formUsername.trim().toLowerCase(),
        role: formRole,
        pin: formPin.trim() || undefined,
        password: formPassword.trim() || undefined,
        phone: formPhone.trim() || undefined,
        isActive: formIsActive,
        customPermissions: permissionPayload,
      });

      if (res.success) {
        showNotify('success', `Đã cập nhật thông tin tài khoản "${formName}" thành công!`);
        setIsModalOpen(false);
      } else {
        showNotify('error', res.error || 'Cập nhật tài khoản thất bại!');
      }
    } else {
      // Tạo tài khoản mới
      const res = createAccount({
        name: formName.trim(),
        username: formUsername.trim().toLowerCase(),
        role: formRole,
        pin: formPin.trim() || undefined,
        password: formPassword.trim() || undefined,
        phone: formPhone.trim() || undefined,
        isActive: formIsActive,
        customPermissions: permissionPayload,
      });

      if (res.success) {
        showNotify('success', `Đã tạo tài khoản mới cho "${formName}" thành công!`);
        setIsModalOpen(false);
      } else {
        showNotify('error', res.error || 'Tạo tài khoản thất bại!');
      }
    }
  };

  // Xử lý xóa tài khoản
  const handleDelete = (acc: UserAccount) => {
    if (acc.username === 'admin' && acc.role === 'admin') {
      showNotify('error', 'Không thể xóa tài khoản Quản Trị Viên (Admin) gốc của hệ thống!');
      return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa tài khoản "${acc.name}" (@${acc.username}) khỏi hệ thống?`)) {
      const res = deleteAccount(acc.id);
      if (res.success) {
        showNotify('success', `Đã xóa tài khoản "${acc.name}" thành công!`);
      } else {
        showNotify('error', res.error || 'Xóa tài khoản thất bại!');
      }
    }
  };

  // Lọc tài khoản theo tìm kiếm và vai trò
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchQuery =
        !searchQuery ||
        acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (acc.phone && acc.phone.includes(searchQuery));

      const matchRole = filterRole === 'all' || acc.role === filterRole;
      return matchQuery && matchRole;
    });
  }, [accounts, searchQuery, filterRole]);

  const activeCount = accounts.filter(a => a.isActive).length;
  const inactiveCount = accounts.length - activeCount;

  return (
    <div className="space-y-6">
      {/* THÔNG BÁO ALERT */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-3 transition-all animate-in fade-in duration-200 ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* HEADER QUẢN LÝ TÀI KHOẢN */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-zinc-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-zinc-900 flex items-center gap-2">
                Quản Lý Danh Sách Tài Khoản &amp; Phân Quyền Cá Nhân
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Tạo tài khoản riêng cho từng nhân viên, thiết lập mã PIN bán hàng và tùy biến cấp quyền cho từng người.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-zinc-100 text-zinc-700 text-xs font-bold">
              👥 Tổng: <b>{accounts.length}</b> tài khoản
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Đang hoạt động: <b>{activeCount}</b>
            </span>
            {inactiveCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Tạm khóa: <b>{inactiveCount}</b>
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition active:scale-95 cursor-pointer shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Thêm Tài Khoản Mới</span>
        </button>
      </div>

      {/* THANH TÌM KIẾM & BỘ LỌC */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-zinc-200">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên nhân viên, tên đăng nhập, số điện thoại..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:border-amber-500 transition"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-zinc-500 shrink-0">Lọc vai trò:</label>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:bg-white focus:outline-none focus:border-amber-500 transition cursor-pointer"
          >
            <option value="all">Tất cả vai trò ({accounts.length})</option>
            <option value="admin">Chủ Tiệm (Admin)</option>
            <option value="manager">Quản Lý Tiệm (Manager)</option>
            <option value="cashier">Thu Ngân / Bán Hàng</option>
            <option value="kitchen">Nhân Viên Bếp</option>
            <option value="staff">Nhân Viên Hỗ Trợ</option>
          </select>
        </div>
      </div>

      {/* BẢNG DANH SÁCH TÀI KHOẢN */}
      <div className="bg-white rounded-3xl border border-zinc-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-4">Người Dùng &amp; Tên Đăng Nhập</th>
                <th className="p-4 text-center">Vai Trò</th>
                <th className="p-4">Cơ Chế Phân Quyền</th>
                <th className="p-4 text-center">Mã PIN &amp; Mật Khẩu</th>
                <th className="p-4 text-center">Trạng Thái</th>
                <th className="p-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-zinc-800">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-bold text-sm">Không tìm thấy tài khoản nào phù hợp</p>
                    <p className="text-xs text-zinc-400 mt-1">Hãy thử tìm kiếm với từ khóa khác hoặc bấm "+ Thêm Tài Khoản Mới".</p>
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const roleMeta = ROLE_INFO[acc.role] || ROLE_INFO.staff;
                  const isShowPin = Boolean(showPinMap[acc.id]);
                  const hasCustom = Boolean(acc.customPermissions && Object.keys(acc.customPermissions).length > 0);
                  const isCurrentLoggedUser = user?.id === acc.id;

                  // Đếm số quyền được cấp
                  let grantedCount = 0;
                  const base = rolePermissions[acc.role] || DEFAULT_PERMISSIONS[acc.role] || DEFAULT_PERMISSIONS.staff;
                  const activePerms = hasCustom ? { ...base, ...acc.customPermissions } : base;
                  PERMISSION_DEFINITIONS.forEach(p => {
                    if (acc.role === 'admin' || activePerms[p.key]) grantedCount++;
                  });

                  return (
                    <tr
                      key={acc.id}
                      className={`hover:bg-zinc-50/70 transition ${
                        !acc.isActive ? 'bg-zinc-50/40 opacity-75' : ''
                      }`}
                    >
                      {/* Cột 1: Thông tin người dùng */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-xl shrink-0">
                            {roleMeta.icon}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-zinc-900">{acc.name}</span>
                              {isCurrentLoggedUser && (
                                <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-zinc-400 text-xs mt-0.5">
                              <span className="font-mono text-zinc-600 font-bold">@{acc.username}</span>
                              {acc.phone && <span>• 📞 {acc.phone}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Cột 2: Vai trò */}
                      <td className="p-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${roleMeta.badgeClass}`}
                        >
                          <span>{roleMeta.icon}</span>
                          <span>{roleMeta.label}</span>
                        </span>
                      </td>

                      {/* Cột 3: Quyền hạn */}
                      <td className="p-4">
                        {hasCustom ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black">
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              Tùy chỉnh riêng ({grantedCount}/7 quyền)
                            </span>
                            <div className="flex items-center gap-1 flex-wrap">
                              {PERMISSION_DEFINITIONS.map(p => {
                                const isAllowed = acc.role === 'admin' || activePerms[p.key];
                                return (
                                  <span
                                    key={p.key}
                                    title={`${p.label}: ${isAllowed ? 'Được phép' : 'Bị khóa'}`}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      isAllowed
                                        ? 'bg-emerald-100 text-emerald-900'
                                        : 'bg-zinc-100 text-zinc-400 line-through'
                                    }`}
                                  >
                                    {p.label.split(' ')[0]}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-zinc-100 text-zinc-700 text-[11px] font-bold">
                              Theo mặc định vai trò ({grantedCount}/7 quyền)
                            </span>
                            <p className="text-[10px] text-zinc-400">{roleMeta.desc}</p>
                          </div>
                        )}
                      </td>

                      {/* Cột 4: PIN & Mật khẩu */}
                      <td className="p-4 text-center">
                        <div className="inline-flex items-center gap-2 bg-zinc-100/80 px-2.5 py-1.5 rounded-xl border border-zinc-200">
                          <div className="text-left font-mono text-xs">
                            {acc.pin ? (
                              <div>
                                <span className="text-[10px] text-zinc-500 block">PIN:</span>
                                <span className="font-black text-zinc-900 tracking-wider">
                                  {isShowPin ? acc.pin : '••••'}
                                </span>
                              </div>
                            ) : (
                              <span className="text-zinc-400 italic text-[11px]">Chưa đặt PIN</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setShowPinMap((prev) => ({ ...prev, [acc.id]: !prev[acc.id] }))
                            }
                            className="p-1 text-zinc-400 hover:text-zinc-700 transition cursor-pointer"
                            title={isShowPin ? 'Ẩn mã PIN' : 'Hiện mã PIN'}
                          >
                            {isShowPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      {/* Cột 5: Trạng thái On/Off */}
                      <td className="p-4 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (acc.username === 'admin' && acc.isActive) {
                              showNotify('error', 'Không thể tạm khóa tài khoản Quản Trị Viên (Admin) gốc!');
                              return;
                            }
                            toggleAccountActive(acc.id);
                            showNotify(
                              'success',
                              `Đã ${acc.isActive ? 'tạm khóa' : 'mở kích hoạt'} tài khoản "${acc.name}"!`
                            );
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black transition cursor-pointer ${
                            acc.isActive
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                              : 'bg-zinc-200 text-zinc-600 border border-zinc-300 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200'
                          }`}
                          title={acc.isActive ? 'Bấm để tạm khóa tài khoản' : 'Bấm để kích hoạt lại tài khoản'}
                        >
                          {acc.isActive ? (
                            <>
                              <Unlock className="w-3 h-3 text-emerald-600" />
                              <span>Hoạt động</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3 text-zinc-500" />
                              <span>Tạm khóa</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Cột 6: Thao tác Edit/Delete */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(acc)}
                            className="p-2 rounded-xl border border-zinc-200 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200 text-zinc-600 transition cursor-pointer"
                            title="Chỉnh sửa thông tin & phân quyền"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {acc.username === 'admin' && acc.role === 'admin' ? (
                            <span
                              title="Tài khoản Admin gốc được hệ thống bảo vệ cố định"
                              className="p-2 rounded-xl bg-zinc-100 text-zinc-300 border border-zinc-200 cursor-not-allowed inline-block"
                            >
                              <Lock className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDelete(acc)}
                              className="p-2 rounded-xl border border-zinc-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-zinc-400 transition cursor-pointer"
                              title="Xóa tài khoản này"
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
      </div>

      {/* MODAL THÊM / CHỈNH SỬA TÀI KHOẢN */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-xs px-6 py-4 border-b border-zinc-100 flex items-center justify-between z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  {editingAccountId ? <Edit2 className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-black text-base text-zinc-900">
                    {editingAccountId ? 'Chỉnh Sửa Tài Khoản Nhân Viên' : 'Tạo Tài Khoản Nhân Viên Mới'}
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Điền thông tin và lựa chọn quyền hạn cho tài khoản.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveForm} className="p-6 space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Họ và tên */}
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">
                    Họ và Tên Nhân Viên <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="VD: Trần Thị Thu Ngân"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 font-bold focus:bg-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Tên đăng nhập */}
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">
                    Tên Đăng Nhập (Username) <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingAccountId !== null && formUsername === 'admin'}
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="VD: thungan01 (viết liền, không dấu)"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-zinc-900 font-bold focus:bg-white focus:outline-none focus:border-amber-500 disabled:bg-zinc-100 disabled:cursor-not-allowed"
                  />
                </div>

                {/* Số điện thoại */}
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Số Điện Thoại:</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="VD: 0912345678"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-900 focus:bg-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Vai trò */}
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">
                    Chọn Vai Trò (Role) <span className="text-rose-500">*</span>:
                  </label>
                  <select
                    value={formRole}
                    disabled={editingAccountId !== null && formUsername === 'admin'}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-900 focus:bg-white focus:outline-none focus:border-amber-500 cursor-pointer disabled:bg-zinc-100 disabled:cursor-not-allowed"
                  >
                    <option value="cashier">🛒 Thu Ngân / Bán Hàng (POS)</option>
                    <option value="kitchen">🍳 Nhân Viên Bếp Làm Bánh (Kitchen KDS)</option>
                    <option value="manager">👔 Quản Lý Tiệm (Manager - Xem Báo Cáo &amp; Duyệt)</option>
                    <option value="staff">👤 Nhân Viên Hỗ Trợ (Staff)</option>
                    <option value="admin">👑 Chủ Tiệm (Admin - Toàn Quyền)</option>
                  </select>
                </div>

                {/* Mã PIN đăng nhập nhanh */}
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">
                    Mã PIN Đăng Nhập Nhanh (4 - 6 số):
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={formPin}
                    onChange={(e) => setFormPin(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="VD: 1234 (Bấm số trên quầy POS)"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-zinc-900 font-black tracking-widest text-center focus:bg-white focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">Dùng để bấm nhanh trên bàn phím số quầy thu ngân.</p>
                </div>

                {/* Mật khẩu */}
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Mật Khẩu Đăng Nhập:</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Nhập mật khẩu (nếu cần đăng nhập bằng pass)"
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-mono text-zinc-900 focus:bg-white focus:outline-none focus:border-amber-500"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">Có thể để trống nếu nhân viên chỉ dùng mã PIN.</p>
                </div>
              </div>

              {/* Trạng thái Kích hoạt */}
              <div className="flex items-center justify-between p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div>
                  <span className="font-bold text-zinc-900 block">Kích hoạt tài khoản:</span>
                  <span className="text-[11px] text-zinc-500">
                    Khi tắt, tài khoản này sẽ bị khóa và không thể đăng nhập vào hệ thống.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* KHU VỰC CẤP QUYỀN TÙY CHỈNH CHO TÀI KHOẢN (CUSTOM PERMISSIONS) */}
              <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-amber-200/60">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-700" />
                    <span className="font-black text-amber-950 text-xs">
                      Cấp Quyền Hạn Cho Tài Khoản Này:
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomPermsEnabled(false);
                        const base = rolePermissions[formRole] || DEFAULT_PERMISSIONS[formRole] || DEFAULT_PERMISSIONS.staff;
                        setCustomPerms({ ...base });
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        !isCustomPermsEnabled
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'bg-white border border-amber-200 text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      Theo vai trò ({ROLE_INFO[formRole]?.label.split(' ')[0]})
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsCustomPermsEnabled(true)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        isCustomPermsEnabled
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-white border border-amber-200 text-amber-800 hover:bg-amber-100'
                      }`}
                    >
                      ⭐ Tùy chỉnh riêng
                    </button>
                  </div>
                </div>

                {!isCustomPermsEnabled ? (
                  <div className="p-3 bg-white rounded-xl border border-amber-200 text-zinc-600">
                    <p className="font-bold text-amber-900 mb-1">
                      ℹ️ Đang áp dụng quyền mặc định của vai trò "{ROLE_INFO[formRole]?.label}":
                    </p>
                    <p className="text-[11px] leading-relaxed text-zinc-500">
                      Tài khoản sẽ tự động đồng bộ theo các quyền được thiết lập tại bảng Ma Trận Phân Quyền. Nếu muốn cấp thêm hoặc bớt quyền riêng cho cá nhân này, hãy chọn nút <b>"⭐ Tùy chỉnh riêng"</b> ở trên.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 bg-white p-3 rounded-xl border border-emerald-200">
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
                      <span className="text-[11px] font-bold text-emerald-800">
                        Bật / Tắt từng quyền cho nhân viên này:
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCustomPerms({
                              pos: true,
                              cakeOrder: true,
                              kitchenKds: true,
                              adminAccess: formRole === 'admin',
                              reports: true,
                              bomCost: true,
                              paymentSettings: true,
                            });
                          }}
                          className="text-[10px] text-emerald-700 hover:underline font-bold"
                        >
                          Chọn tất cả
                        </button>
                        <span>•</span>
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
                          className="text-[10px] text-rose-700 hover:underline font-bold"
                        >
                          Bỏ chọn hết
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {PERMISSION_DEFINITIONS.map((p) => {
                        const Icon = p.icon;
                        const isGranted = formRole === 'admin' ? true : customPerms[p.key];

                        return (
                          <div
                            key={p.key}
                            onClick={() => {
                              if (formRole !== 'admin') handleTogglePerm(p.key);
                            }}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition cursor-pointer select-none ${
                              isGranted
                                ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                                : 'bg-zinc-50 border-zinc-200 text-zinc-400 hover:bg-zinc-100'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                  isGranted ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-500'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <span className="font-bold text-xs block leading-tight">{p.label}</span>
                                <span className="text-[9px] text-zinc-400 leading-tight block">{p.desc}</span>
                              </div>
                            </div>

                            <span
                              className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 font-bold text-xs ${
                                isGranted ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-400'
                              }`}
                            >
                              {isGranted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-600 font-bold transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition shadow-xs cursor-pointer flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingAccountId ? 'Cập Nhật Tài Khoản' : 'Tạo Tài Khoản Mới'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
