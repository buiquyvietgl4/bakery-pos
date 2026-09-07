'use client';

import React, { createContext, useContext, useState } from 'react';

export type UserRole = 'staff' | 'admin';

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  email?: string;
}

export interface SecurityConfig {
  adminUsername: string;
  adminPasswordHash: string;
  adminName: string;
  staffUsername: string;
  staffPin: string;
  staffPasswordHash: string;
  staffName: string;
}

const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  adminUsername: 'admin',
  adminPasswordHash: 'admin123',
  adminName: 'Chủ Tiệm (Admin)',
  staffUsername: 'nhanvien',
  staffPin: '1234',
  staffPasswordHash: '123456',
  staffName: 'Nhân Viên Quầy & Bếp',
};

const DEFAULT_STAFF_USER: CurrentUser = {
  id: '00000000-0000-0000-0000-000000000002',
  username: 'nhanvien',
  name: 'Nhân Viên Quầy & Bếp',
  role: 'staff',
  email: 'nhanvien@tiembanh.local',
};

interface AuthContextType {
  user: CurrentUser;
  isAdmin: boolean;
  isStaff: boolean;
  isLoginModalOpen: boolean;
  loginTargetRole: UserRole;
  openLoginModal: (defaultRole?: UserRole) => void;
  closeLoginModal: () => void;
  loginAdmin: (password: string) => { success: boolean; error?: string };
  loginStaff: (pinOrPassword: string) => { success: boolean; error?: string };
  logout: () => void;
  updateAdminCredentials: (oldPass: string, newPass: string, newName?: string) => { success: boolean; error?: string };
  updateStaffCredentials: (newPin: string, newPass?: string, newName?: string) => { success: boolean; error?: string };
  securityConfig: SecurityConfig;
  resetSecurityDefaults: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: DEFAULT_STAFF_USER,
  isAdmin: false,
  isStaff: true,
  isLoginModalOpen: false,
  loginTargetRole: 'admin',
  openLoginModal: () => {},
  closeLoginModal: () => {},
  loginAdmin: () => ({ success: false }),
  loginStaff: () => ({ success: false }),
  logout: () => {},
  updateAdminCredentials: () => ({ success: false }),
  updateStaffCredentials: () => ({ success: false }),
  securityConfig: DEFAULT_SECURITY_CONFIG,
  resetSecurityDefaults: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bakery_security_config');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return DEFAULT_SECURITY_CONFIG;
  });

  const [user, setUserState] = useState<CurrentUser>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bakery_current_user');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return DEFAULT_STAFF_USER;
  });

  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginTargetRole, setLoginTargetRole] = useState<UserRole>('admin');

  const saveSecurityConfig = (cfg: SecurityConfig) => {
    setSecurityConfig(cfg);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_security_config', JSON.stringify(cfg));
    }
  };

  const saveCurrentUser = (u: CurrentUser) => {
    setUserState(u);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_current_user', JSON.stringify(u));
    }
  };

  const openLoginModal = (defaultRole: UserRole = 'admin') => {
    setLoginTargetRole(defaultRole);
    setIsLoginModalOpen(true);
  };

  const closeLoginModal = () => {
    setIsLoginModalOpen(false);
  };

  const loginAdmin = (password: string) => {
    if (password.trim() === securityConfig.adminPasswordHash) {
      const adminUser: CurrentUser = {
        id: '00000000-0000-0000-0000-000000000001',
        username: securityConfig.adminUsername,
        name: securityConfig.adminName,
        role: 'admin',
        email: 'admin@tiembanh.local',
      };
      saveCurrentUser(adminUser);
      setIsLoginModalOpen(false);
      return { success: true };
    }
    return { success: false, error: 'Mật khẩu Chủ Tiệm không chính xác!' };
  };

  const loginStaff = (pinOrPassword: string) => {
    const input = pinOrPassword.trim();
    if (input === securityConfig.staffPin || input === securityConfig.staffPasswordHash) {
      const staffUser: CurrentUser = {
        id: '00000000-0000-0000-0000-000000000002',
        username: securityConfig.staffUsername,
        name: securityConfig.staffName,
        role: 'staff',
        email: 'nhanvien@tiembanh.local',
      };
      saveCurrentUser(staffUser);
      setIsLoginModalOpen(false);
      return { success: true };
    }
    return { success: false, error: 'Mã PIN hoặc mật khẩu nhân viên không đúng!' };
  };

  const logout = () => {
    saveCurrentUser(DEFAULT_STAFF_USER);
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
    if (user.role === 'admin') {
      saveCurrentUser({ ...user, name: updated.adminName });
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
    if (user.role === 'staff') {
      saveCurrentUser({ ...user, name: updated.staffName });
    }
    return { success: true };
  };

  const resetSecurityDefaults = () => {
    saveSecurityConfig(DEFAULT_SECURITY_CONFIG);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin: user.role === 'admin',
        isStaff: user.role === 'staff',
        isLoginModalOpen,
        loginTargetRole,
        openLoginModal,
        closeLoginModal,
        loginAdmin,
        loginStaff,
        logout,
        updateAdminCredentials,
        updateStaffCredentials,
        securityConfig,
        resetSecurityDefaults,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
