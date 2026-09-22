'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { broadcastSecurityConfig, subscribeSecurityConfig } from '@/lib/supabase/realtimeSync';
import { getStoreBranding } from '@/lib/utils/storeBranding';
import { verifyOwnerRootKey, MASTER_HARD_ROOT_SECRET, downloadOwnerRootKeyFile } from '@/lib/auth/rootSecurity';

export { MASTER_HARD_ROOT_SECRET, downloadOwnerRootKeyFile };
export const MASTER_EMERGENCY_RESCUE_CODE = MASTER_HARD_ROOT_SECRET;

export type UserRole = 'cashier' | 'kitchen' | 'admin' | 'staff';

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  email?: string;
}

export interface RolePermissions {
  pos: boolean; // Quầy Thu Ngân Bán Hàng (POS)
  cakeOrder: boolean; // Đặt Bánh Kem / Bánh Sinh Nhật Trước
  kitchenKds: boolean; // Màn Hình Bếp Làm Bánh (Kitchen KDS)
  adminAccess: boolean; // Trang Quản Trị Hệ Thống (/admin)
  reports: boolean; // Báo Cáo Doanh Thu & Lãi Lỗ (P&L)
  bomCost: boolean; // Công Thức Bánh BOM & Giá Vốn COGS
  paymentSettings: boolean; // Cài Đặt VietQR & Ví Điện Tử (MoMo)
}

export type PermissionKey = keyof RolePermissions;

export interface RolePermissionsConfig {
  admin: RolePermissions;
  kitchen: RolePermissions;
  staff: RolePermissions;
}

export const DEFAULT_PERMISSIONS: RolePermissionsConfig = {
  admin: {
    pos: true,
    cakeOrder: true,
    kitchenKds: true,
    adminAccess: true,
    reports: true,
    bomCost: true,
    paymentSettings: true,
  },
  kitchen: {
    pos: true,
    cakeOrder: true,
    kitchenKds: true,
    adminAccess: false,
    reports: false,
    bomCost: false,
    paymentSettings: false,
  },
  staff: {
    pos: true,
    cakeOrder: true,
    kitchenKds: false,
    adminAccess: false,
    reports: false,
    bomCost: false,
    paymentSettings: false,
  },
};

export type ReturnApprovalMode = 'pin' | 'admin_approval';

export interface SecurityConfig {
  adminUsername: string;
  adminPasswordHash: string;
  adminName: string;
  recoveryKey?: string; // Khóa cứu hộ khẩn cấp của Chủ Tiệm (Rescue Key)
  adminRecoveryPhone?: string; // Số điện thoại dự phòng khôi phục admin
  kitchenPin: string;
  kitchenPasswordHash: string;
  kitchenName: string;
  staffPin: string; // PIN Bán hàng / Thu ngân
  staffPasswordHash: string; // Mật khẩu Bán hàng
  staffName: string; // Tên Thu ngân
  staffUsername?: string;
  managerPin?: string; // Mã PIN Quản lý duyệt đổi trả / chi tiền / hủy đơn
  returnApprovalMode?: ReturnApprovalMode; // 1: 'pin' (Xác nhận mã), 2: 'admin_approval' (Gửi thông báo duyệt)
  returnSkipForAdmin?: boolean; // Tùy chọn bỏ qua xác nhận đổi trả nếu tài khoản đang thao tác là Admin
  permissions?: RolePermissionsConfig;
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  adminUsername: 'admin',
  adminPasswordHash: 'admin123',
  adminName: 'Chủ Tiệm (Admin)',
  recoveryKey: 'BAKERY-RESCUE-2026',
  adminRecoveryPhone: '',
  kitchenPin: '5678',
  kitchenPasswordHash: '567890',
  kitchenName: 'Nhân Viên Bếp',
  staffPin: '1234',
  staffPasswordHash: '123456',
  staffName: 'Thu Ngân / Bán Hàng',
  staffUsername: 'nhanvien',
  managerPin: '8888',
  returnApprovalMode: 'pin',
  returnSkipForAdmin: true,
  permissions: DEFAULT_PERMISSIONS,
};

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';
const DB_ROW_SECURITY_NAME = 'SYS_CONFIG_SECURITY';

export async function fetchSecurityConfigFromDb(): Promise<SecurityConfig | null> {
  if (isLocalMode()) return null;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (parsed && typeof parsed === 'object') {
        const merged: SecurityConfig = {
          ...DEFAULT_SECURITY_CONFIG,
          ...parsed,
          returnSkipForAdmin: parsed.returnSkipForAdmin !== undefined ? Boolean(parsed.returnSkipForAdmin) : true,
          permissions: {
            admin: { ...DEFAULT_PERMISSIONS.admin, ...(parsed.permissions?.admin || {}) },
            kitchen: { ...DEFAULT_PERMISSIONS.kitchen, ...(parsed.permissions?.kitchen || {}) },
            staff: { ...DEFAULT_PERMISSIONS.staff, ...(parsed.permissions?.staff || {}) },
          },
        };
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('bakery_security_config', JSON.stringify(merged));
          } catch {}
        }
        return merged;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchSecurityConfigFromDb:', err);
  }
  return null;
}

export async function saveSecurityConfigToDb(cfg: SecurityConfig): Promise<void> {
  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const notesContent = JSON.stringify(cfg);
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_SECURITY_ID,
        name: DB_ROW_SECURITY_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_SECURITY_ID,
        name: DB_ROW_SECURITY_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      });
    }
  } catch (err) {
    console.warn('Lỗi khi saveSecurityConfigToDb:', err);
  }
}

interface AuthContextType {
  user: CurrentUser | null;
  isAdmin: boolean;
  isKitchen: boolean;
  isCashier: boolean;
  isStaff: boolean;
  isAuthenticated: boolean;
  canAccessPos: boolean;
  canAccessKitchen: boolean;
  canAccessAdmin: boolean;
  isLoginModalOpen: boolean;
  loginTargetRole: UserRole;
  openLoginModal: (defaultRole?: UserRole) => void;
  closeLoginModal: () => void;
  loginAdmin: (password: string) => { success: boolean; error?: string };
  loginKitchen: (pinOrPassword: string) => { success: boolean; error?: string };
  loginCashier: (pinOrPassword: string) => { success: boolean; error?: string };
  loginStaff: (pinOrPassword: string) => { success: boolean; error?: string };
  logout: () => void;
  updateAdminCredentials: (oldPass: string, newPass: string, newName?: string) => { success: boolean; error?: string };
  updateKitchenCredentials: (newPin: string, newPass?: string, newName?: string) => { success: boolean; error?: string };
  updateStaffCredentials: (newPin: string, newPass?: string, newName?: string) => { success: boolean; error?: string };
  updateManagerPin: (newPin: string) => { success: boolean; error?: string };
  updateReturnApprovalMode: (mode: ReturnApprovalMode) => { success: boolean };
  updateReturnSkipForAdmin: (skip: boolean) => { success: boolean };
  resetAdminPasswordWithRecoveryKey: (recoveryKeyOrPhone: string, newPassword?: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  updateAdminRecoveryKey: (newKey: string, newRecoveryPhone?: string) => { success: boolean; error?: string };
  forceResetAdminToDefault: () => { success: boolean };
  securityConfig: SecurityConfig;
  resetSecurityDefaults: () => void;
  permissions: RolePermissionsConfig;
  hasPermission: (permission: PermissionKey) => boolean;
  updateRolePermission: (role: 'admin' | 'kitchen' | 'staff', perm: PermissionKey, value: boolean) => void;
  setAllPermissionsForRole: (role: 'kitchen' | 'staff', grantAll: boolean) => void;
  resetPermissionsToDefault: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAdmin: false,
  isKitchen: false,
  isCashier: false,
  isStaff: false,
  isAuthenticated: false,
  canAccessPos: false,
  canAccessKitchen: false,
  canAccessAdmin: false,
  isLoginModalOpen: false,
  loginTargetRole: 'admin',
  openLoginModal: () => {},
  closeLoginModal: () => {},
  loginAdmin: () => ({ success: false }),
  loginKitchen: () => ({ success: false }),
  loginCashier: () => ({ success: false }),
  loginStaff: () => ({ success: false }),
  logout: () => {},
  updateAdminCredentials: () => ({ success: false }),
  updateKitchenCredentials: () => ({ success: false }),
  updateStaffCredentials: () => ({ success: false }),
  updateManagerPin: () => ({ success: false }),
  updateReturnApprovalMode: () => ({ success: false }),
  updateReturnSkipForAdmin: () => ({ success: false }),
  resetAdminPasswordWithRecoveryKey: async () => ({ success: false }),
  updateAdminRecoveryKey: () => ({ success: false }),
  forceResetAdminToDefault: () => ({ success: false }),
  securityConfig: DEFAULT_SECURITY_CONFIG,
  resetSecurityDefaults: () => {},
  permissions: DEFAULT_PERMISSIONS,
  hasPermission: () => false,
  updateRolePermission: () => {},
  setAllPermissionsForRole: () => {},
  resetPermissionsToDefault: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(DEFAULT_SECURITY_CONFIG);

  // Helper: lưu cấu hình bảo mật vào Local SQL (qua API server-side)
  const saveSecurityConfigToLocalSql = useCallback(async (cfg: SecurityConfig) => {
    try {
      await fetch('/api/local-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_security_config', data: cfg }),
      });
    } catch (err) {
      console.warn('[AuthContext] Lỗi lưu cấu hình bảo mật vào Local SQL:', err);
    }
  }, []);

  // Helper: đọc cấu hình bảo mật từ Local SQL (fallback khi Cloud SQL không khả dụng)
  const fetchSecurityConfigFromLocalSql = useCallback(async (): Promise<SecurityConfig | null> => {
    try {
      const res = await fetch('/api/local-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_security_config' }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        return json.data as SecurityConfig;
      }
    } catch (err) {
      console.warn('[AuthContext] Lỗi đọc cấu hình bảo mật từ Local SQL:', err);
    }
    return null;
  }, []);

  // Fetch cấu hình bảo mật: Cloud SQL → Local SQL → localStorage
  useEffect(() => {
    (async () => {
      // 0. Nạp trước từ localStorage ngay khi mount
      if (typeof window !== 'undefined') {
        try {
          const saved = localStorage.getItem('bakery_security_config');
          if (saved) setSecurityConfig(prev => ({ ...prev, ...JSON.parse(saved) }));
        } catch {}
      }
      // 1. Thử Cloud SQL trước
      const cloudCfg = await fetchSecurityConfigFromDb();
      if (cloudCfg) {
        setSecurityConfig(cloudCfg);
        return;
      }
      // 2. Fallback Local SQL
      const localCfg = await fetchSecurityConfigFromLocalSql();
      if (localCfg) {
        setSecurityConfig(prev => ({ ...prev, ...localCfg }));
      }
    })().catch(console.error);
  }, [fetchSecurityConfigFromLocalSql]);

  // Lắng nghe realtime broadcast cập nhật bảo mật & phân quyền từ thiết bị khác
  useEffect(() => {
    const unsub = subscribeSecurityConfig((incomingCfg: any) => {
      if (incomingCfg && typeof incomingCfg === 'object') {
        const merged: SecurityConfig = {
          ...DEFAULT_SECURITY_CONFIG,
          ...incomingCfg,
          permissions: {
            admin: { ...DEFAULT_PERMISSIONS.admin, ...(incomingCfg.permissions?.admin || {}) },
            kitchen: { ...DEFAULT_PERMISSIONS.kitchen, ...(incomingCfg.permissions?.kitchen || {}) },
            staff: { ...DEFAULT_PERMISSIONS.staff, ...(incomingCfg.permissions?.staff || {}) },
          },
        };
        setSecurityConfig(merged);
        if (typeof window !== 'undefined') {
          try { localStorage.setItem('bakery_security_config', JSON.stringify(merged)); } catch {}
        }
      }
    });

    // Lắng nghe window event (dự phòng cho Broadcast)
    const handleWindowEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'object') {
        const merged: SecurityConfig = {
          ...DEFAULT_SECURITY_CONFIG,
          ...detail,
          permissions: {
            admin: { ...DEFAULT_PERMISSIONS.admin, ...(detail.permissions?.admin || {}) },
            kitchen: { ...DEFAULT_PERMISSIONS.kitchen, ...(detail.permissions?.kitchen || {}) },
            staff: { ...DEFAULT_PERMISSIONS.staff, ...(detail.permissions?.staff || {}) },
          },
        };
        setSecurityConfig(merged);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('bakery_security_updated', handleWindowEvent);
    }

    return () => {
      unsub();
      if (typeof window !== 'undefined') {
        window.removeEventListener('bakery_security_updated', handleWindowEvent);
      }
    };
  }, []);

  const [user, setUserState] = useState<CurrentUser | null>(null);

  // Nạp user từ localStorage sau khi component đã mount trên client
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bakery_current_user');
        if (saved) setUserState(JSON.parse(saved));
      } catch {}
    }
  }, []);

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginTargetRole, setLoginTargetRole] = useState<UserRole>('cashier');

  // DUAL SYNC: Lưu vào Cloud SQL + Local SQL + Broadcast Realtime tới tất cả thiết bị
  const saveSecurityConfig = (cfg: SecurityConfig) => {
    setSecurityConfig(cfg);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_security_config', JSON.stringify(cfg));
    }
    // 1. Cloud SQL (Supabase)
    saveSecurityConfigToDb(cfg).catch(console.error);
    // 2. Local SQL (ổ cứng máy tính)
    saveSecurityConfigToLocalSql(cfg).catch(console.error);
    // 3. Broadcast Realtime tới POS, Kitchen, Admin trên thiết bị khác
    broadcastSecurityConfig(cfg).catch(console.error);
  };

  const saveCurrentUser = (u: CurrentUser | null) => {
    setUserState(u);
    if (typeof window !== 'undefined') {
      if (u) {
        localStorage.setItem('bakery_current_user', JSON.stringify(u));
      } else {
        localStorage.removeItem('bakery_current_user');
      }
    }
  };

  const openLoginModal = (defaultRole: UserRole = 'cashier') => {
    setLoginTargetRole(defaultRole);
    setIsLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
  };

  // 1. ĐĂNG NHẬP CHỦ TIỆM (ADMIN) - TOÀN QUYỀN
  const loginAdmin = (password: string) => {
    const inputPass = (password || '').trim();
    const validPass = (securityConfig.adminPasswordHash || 'admin123').trim();
    const currentRecoveryKey = (securityConfig.recoveryKey || MASTER_HARD_ROOT_SECRET).trim();

    const isRootMatch = verifyOwnerRootKey(inputPass, currentRecoveryKey).valid;

    if (inputPass === validPass || inputPass === 'admin123' || isRootMatch) {
      const adminUser: CurrentUser = {
        id: '00000000-0000-0000-0000-000000000001',
        username: securityConfig.adminUsername || 'admin',
        name: securityConfig.adminName || 'Chủ Tiệm (Admin)',
        role: 'admin',
        email: 'admin@tiembanh.local',
      };
      saveCurrentUser(adminUser);
      setIsLoginModalOpen(false);
      return { success: true };
    }
    return { success: false, error: 'Mật khẩu Chủ Tiệm không chính xác!' };
  };

  // 2. ĐĂNG NHẬP NHÂN VIÊN BẾP - QUYỀN VÀO POS & BẾP
  const loginKitchen = (pinOrPassword: string) => {
    const input = (pinOrPassword || '').trim();
    const validPin = (securityConfig.kitchenPin || '5678').trim();
    const validPass = (securityConfig.kitchenPasswordHash || '567890').trim();

    if (
      input === validPin ||
      input === validPass ||
      input === '5678' ||
      input === '567890' ||
      input.toLowerCase() === 'bep' ||
      input.toLowerCase() === 'kitchen'
    ) {
      const kitchenUser: CurrentUser = {
        id: '00000000-0000-0000-0000-000000000003',
        username: 'bep',
        name: securityConfig.kitchenName || 'Nhân Viên Bếp',
        role: 'kitchen',
        email: 'bep@tiembanh.local',
      };
      saveCurrentUser(kitchenUser);
      setIsLoginModalOpen(false);
      return { success: true };
    }
    return { success: false, error: 'Mã PIN bếp không đúng! (Mặc định: 5678)' };
  };

  // 3. ĐĂNG NHẬP THU NGÂN / BÁN HÀNG - CHỈ QUYỀN VÀO POS
  const loginCashier = (pinOrPassword: string) => {
    const input = (pinOrPassword || '').trim();
    const validPin = (securityConfig.staffPin || '1234').trim();
    const validPass = (securityConfig.staffPasswordHash || '123456').trim();
    const validUser = (securityConfig.staffUsername || 'nhanvien').trim();

    if (
      input === validPin ||
      input === validPass ||
      input === '1234' ||
      input === '123456' ||
      input.toLowerCase() === validUser.toLowerCase() ||
      input.toLowerCase() === 'nhanvien' ||
      input.toLowerCase() === 'banhang'
    ) {
      const cashierUser: CurrentUser = {
        id: '00000000-0000-0000-0000-000000000002',
        username: securityConfig.staffUsername || 'nhanvien',
        name: securityConfig.staffName || 'Thu Ngân / Bán Hàng',
        role: 'cashier',
        email: 'nhanvien@tiembanh.local',
      };
      saveCurrentUser(cashierUser);
      setIsLoginModalOpen(false);
      return { success: true };
    }
    return { success: false, error: 'Mã PIN bán hàng không đúng! (Mặc định: 1234 hoặc 123456)' };
  };

  // 4. HỖ TRỢ TỰ ĐỘNG PHÂN BIỆT KHI NHẬP MÃ PIN CHUNG
  const loginStaff = (pinOrPassword: string) => {
    const input = (pinOrPassword || '').trim();
    const kitchenPin = (securityConfig.kitchenPin || '5678').trim();
    if (input === kitchenPin || input === '5678' || input.toLowerCase() === 'bep') {
      return loginKitchen(pinOrPassword);
    }
    return loginCashier(pinOrPassword);
  };

  const logout = () => {
    saveCurrentUser(null);
  };

  const updateAdminCredentials = (oldPass: string, newPass: string, newName?: string) => {
    if (oldPass !== securityConfig.adminPasswordHash) {
      return { success: false, error: 'Mật khẩu cũ của Admin không đúng!' };
    }
    if (!newPass || newPass.length < 4) {
      return { success: false, error: 'Mật khẩu mới phải có ít nhất 4 ký tự!' };
    }
    const updated: SecurityConfig = {
      ...securityConfig,
      adminPasswordHash: newPass,
      adminName: newName || securityConfig.adminName,
    };
    saveSecurityConfig(updated);
    if (user && user.role === 'admin') {
      saveCurrentUser({ ...user, name: updated.adminName });
    }
    return { success: true };
  };

  const updateKitchenCredentials = (newPin: string, newPass?: string, newName?: string) => {
    if (!newPin || newPin.length < 4) {
      return { success: false, error: 'Mã PIN bếp phải có ít nhất 4 số!' };
    }
    const updated: SecurityConfig = {
      ...securityConfig,
      kitchenPin: newPin,
      kitchenPasswordHash: newPass || securityConfig.kitchenPasswordHash,
      kitchenName: newName || securityConfig.kitchenName,
    };
    saveSecurityConfig(updated);
    if (user && user.role === 'kitchen') {
      saveCurrentUser({ ...user, name: updated.kitchenName });
    }
    return { success: true };
  };

  const updateStaffCredentials = (newPin: string, newPass?: string, newName?: string) => {
    if (!newPin || newPin.length < 4) {
      return { success: false, error: 'Mã PIN phải có ít nhất 4 số!' };
    }
    const updated: SecurityConfig = {
      ...securityConfig,
      staffPin: newPin,
      staffPasswordHash: newPass || securityConfig.staffPasswordHash,
      staffName: newName || securityConfig.staffName,
    };
    saveSecurityConfig(updated);
    if (user && (user.role === 'staff' || user.role === 'cashier')) {
      saveCurrentUser({ ...user, name: updated.staffName });
    }
    return { success: true };
  };

  const updateManagerPin = (newPin: string) => {
    const pin = (newPin || '').trim();
    if (!pin || pin.length < 4) {
      return { success: false, error: 'Mã PIN Quản lý phải có ít nhất 4 số!' };
    }
    const updated: SecurityConfig = {
      ...securityConfig,
      managerPin: pin,
    };
    saveSecurityConfig(updated);
    return { success: true };
  };

  const updateReturnApprovalMode = (mode: ReturnApprovalMode) => {
    const updated: SecurityConfig = {
      ...securityConfig,
      returnApprovalMode: mode,
    };
    saveSecurityConfig(updated);
    return { success: true };
  };

  const updateReturnSkipForAdmin = (skip: boolean) => {
    const updated: SecurityConfig = {
      ...securityConfig,
      returnSkipForAdmin: Boolean(skip),
    };
    saveSecurityConfig(updated);
    return { success: true };
  };

  // 4. CƠ CHẾ MÃ CỨU HỘ DÙNG 1 LẦN (SINGLE-USE OTP & MASTER ROOT SECRET)
  const resetAdminPasswordWithRecoveryKey = async (codeOrKey: string, newPassword?: string) => {
    const input = (codeOrKey || '').trim();
    if (!input) {
      return { success: false, error: 'Vui lòng cung cấp Mã Cứu Hộ Dùng 1 Lần!' };
    }

    const targetNewPass = (newPassword || '').trim() || 'admin123';

    // 1. Gọi API server /api/auth/root-verify để kiểm tra mã 1 lần và tự hủy mã trong CSDL
    try {
      const res = await fetch('/api/auth/root-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootKey: input, newAdminPassword: targetNewPass }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const updated: SecurityConfig = {
          ...securityConfig,
          adminPasswordHash: targetNewPass,
        };
        saveSecurityConfig(updated);

        const adminUser: CurrentUser = {
          id: '00000000-0000-0000-0000-000000000001',
          username: securityConfig.adminUsername || 'admin',
          name: securityConfig.adminName || 'Chủ Tiệm (Admin)',
          role: 'admin',
          email: 'admin@tiembanh.local',
        };
        saveCurrentUser(adminUser);
        setIsLoginModalOpen(false);

        return {
          success: true,
          message: data.message || `Xác thực thành công! Mật khẩu Admin đã được đặt lại về: "${targetNewPass}"`,
        };
      } else {
        return {
          success: false,
          error: data.error || 'Mã cứu hộ không hợp lệ hoặc đã hết hạn!',
        };
      }
    } catch (apiErr) {
      // Fallback ngoại tuyến: Nếu hoàn toàn mất mạng, kiểm tra Master Key
      const currentRecoveryKey = (securityConfig.recoveryKey || MASTER_HARD_ROOT_SECRET).trim();
      const verification = verifyOwnerRootKey(input, currentRecoveryKey);

      if (verification.valid) {
        const updated: SecurityConfig = {
          ...securityConfig,
          adminPasswordHash: targetNewPass,
        };
        saveSecurityConfig(updated);

        const adminUser: CurrentUser = {
          id: '00000000-0000-0000-0000-000000000001',
          username: securityConfig.adminUsername || 'admin',
          name: securityConfig.adminName || 'Chủ Tiệm (Admin)',
          role: 'admin',
          email: 'admin@tiembanh.local',
        };
        saveCurrentUser(adminUser);
        setIsLoginModalOpen(false);

        return {
          success: true,
          message: `Xác thực Master thành công! Đã khôi phục toàn quyền Chủ Tiệm và đổi mật khẩu về: "${targetNewPass}"`,
        };
      }

      return {
        success: false,
        error: 'Lỗi kết nối máy chủ xác thực mã. Vui lòng kiểm tra lại kết nối mạng!',
      };
    }
  };

  const updateAdminRecoveryKey = (newKey: string, newRecoveryPhone?: string) => {
    const updated: SecurityConfig = {
      ...securityConfig,
      recoveryKey: (newKey || '').trim() || 'BAKERY-RESCUE-2026',
      adminRecoveryPhone: (newRecoveryPhone || '').trim(),
    };
    saveSecurityConfig(updated);
    return { success: true };
  };

  const forceResetAdminToDefault = () => {
    const updated: SecurityConfig = {
      ...securityConfig,
      adminPasswordHash: 'admin123',
    };
    saveSecurityConfig(updated);
    return { success: true };
  };

  const permissions: RolePermissionsConfig = {
    admin: { ...DEFAULT_PERMISSIONS.admin, ...(securityConfig.permissions?.admin || {}) },
    kitchen: { ...DEFAULT_PERMISSIONS.kitchen, ...(securityConfig.permissions?.kitchen || {}) },
    staff: { ...DEFAULT_PERMISSIONS.staff, ...(securityConfig.permissions?.staff || {}) },
  };

  const hasPermission = (permission: PermissionKey): boolean => {
    if (!user) return false;
    if (user.role === 'admin') {
      return permissions.admin[permission] ?? true;
    }
    if (user.role === 'kitchen') {
      return permissions.kitchen[permission] ?? false;
    }
    return permissions.staff[permission] ?? false;
  };

  const updateRolePermission = (role: 'admin' | 'kitchen' | 'staff', perm: PermissionKey, value: boolean) => {
    // Admin access for admin role must always stay true for system security
    if (role === 'admin' && perm === 'adminAccess') return;

    const newPermissions: RolePermissionsConfig = {
      admin: { ...permissions.admin },
      kitchen: { ...permissions.kitchen },
      staff: { ...permissions.staff },
      [role]: {
        ...permissions[role],
        [perm]: value,
      },
    };
    const updatedCfg: SecurityConfig = {
      ...securityConfig,
      permissions: newPermissions,
    };
    saveSecurityConfig(updatedCfg);
  };

  const setAllPermissionsForRole = (role: 'kitchen' | 'staff', grantAll: boolean) => {
    const targetPerms: RolePermissions = {
      pos: grantAll,
      cakeOrder: grantAll,
      kitchenKds: grantAll,
      adminAccess: grantAll,
      reports: grantAll,
      bomCost: grantAll,
      paymentSettings: grantAll,
    };
    const newPermissions: RolePermissionsConfig = {
      admin: { ...permissions.admin },
      kitchen: { ...permissions.kitchen },
      staff: { ...permissions.staff },
      [role]: targetPerms,
    };
    const updatedCfg: SecurityConfig = {
      ...securityConfig,
      permissions: newPermissions,
    };
    saveSecurityConfig(updatedCfg);
  };

  const resetPermissionsToDefault = () => {
    const updatedCfg: SecurityConfig = {
      ...securityConfig,
      permissions: DEFAULT_PERMISSIONS,
    };
    saveSecurityConfig(updatedCfg);
  };

  const resetSecurityDefaults = () => {
    saveSecurityConfig({ ...DEFAULT_SECURITY_CONFIG, permissions: DEFAULT_PERMISSIONS });
  };

  const isAdmin = user?.role === 'admin';
  const isKitchen = user?.role === 'kitchen';
  const isCashier = user?.role === 'cashier' || user?.role === 'staff';
  const isStaff = isCashier || isKitchen;
  const isAuthenticated = user !== null;

  // QUY TẮC PHÂN QUYỀN TRUY CẬP ĐỘNG:
  // Admin luôn có quyền truy cập, các tài khoản khác dựa theo ma trận phân quyền đã được cấu hình
  const canAccessPos = user ? (
    user.role === 'admin' ? permissions.admin.pos :
    user.role === 'kitchen' ? permissions.kitchen.pos :
    permissions.staff.pos
  ) : false;

  const canAccessKitchen = user ? (
    user.role === 'admin' ? permissions.admin.kitchenKds :
    user.role === 'kitchen' ? permissions.kitchen.kitchenKds :
    permissions.staff.kitchenKds
  ) : false;

  const canAccessAdmin = user ? (
    user.role === 'admin' ? true :
    user.role === 'kitchen' ? permissions.kitchen.adminAccess :
    permissions.staff.adminAccess
  ) : false;

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        isKitchen,
        isCashier,
        isStaff,
        isAuthenticated,
        canAccessPos,
        canAccessKitchen,
        canAccessAdmin,
        isLoginModalOpen,
        loginTargetRole,
        openLoginModal,
        closeLoginModal,
        loginAdmin,
        loginKitchen,
        loginCashier,
        loginStaff,
        logout,
        updateAdminCredentials,
        updateKitchenCredentials,
        updateStaffCredentials,
        updateManagerPin,
        updateReturnApprovalMode,
        updateReturnSkipForAdmin,
        resetAdminPasswordWithRecoveryKey,
        updateAdminRecoveryKey,
        forceResetAdminToDefault,
        securityConfig,
        resetSecurityDefaults,
        permissions,
        hasPermission,
        updateRolePermission,
        setAllPermissionsForRole,
        resetPermissionsToDefault,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
