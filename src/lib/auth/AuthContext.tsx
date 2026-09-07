'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export type UserRole = 'staff' | 'admin';

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
}

interface AuthContextType {
  user: CurrentUser;
  setRole: (role: UserRole) => void;
  setUser: (user: CurrentUser) => void;
  isAdmin: boolean;
  isStaff: boolean;
  logout: () => void;
}

const defaultAdminUser: CurrentUser = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Chủ Tiệm (Admin)',
  role: 'admin',
  email: 'admin@tiembanh.com',
};

const defaultStaffUser: CurrentUser = {
  id: '00000000-0000-0000-0000-000000000002',
  name: 'Nhân Viên Quầy & Bếp',
  role: 'staff',
  email: 'nhanvien@tiembanh.com',
};

const AuthContext = createContext<AuthContextType>({
  user: defaultAdminUser,
  setRole: () => {},
  setUser: () => {},
  isAdmin: true,
  isStaff: false,
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<CurrentUser>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bakery_user');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {}
      }
    }
    return defaultAdminUser;
  });

  const setUser = (u: CurrentUser) => {
    setUserState(u);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_user', JSON.stringify(u));
    }
  };

  const setRole = (role: UserRole) => {
    const newUser = role === 'admin' ? defaultAdminUser : defaultStaffUser;
    setUser(newUser);
  };

  const logout = () => {
    setUser(defaultStaffUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        setRole,
        isAdmin: user.role === 'admin',
        isStaff: user.role === 'staff',
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
