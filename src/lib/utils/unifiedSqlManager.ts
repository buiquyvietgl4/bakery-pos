// src/lib/utils/unifiedSqlManager.ts
// Bộ Quản Lý 4 Môi Trường CSDL Đơn Giản Hóa:
// 1. Cloud SQL Chính (fhiuojcvsouwugatnmve)
// 2. Cloud SQL Test (azgjnahbibrcbjooepef)
// 3. Local SQL Chính (SQL backup/SQL LOCAL)
// 4. Local SQL Test (SQL backup/SQL TEST)
// Khi chọn môi trường nào, hệ thống CHỈ LÀM VIỆC VỚI DỮ LIỆU CỦA MÔI TRƯỜNG ĐÓ, cách ly 100%, không đồng bộ chéo.

import {
  getSqlModeConfig,
  switchDatabaseMode,
  switchLocalEnvironment,
  isLocalMode,
  isLocalTestMode,
} from './sqlModeManager';
import {
  getActiveProfile,
  switchActiveEnvironment,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_TESTING_URL,
  extractProjectRef,
} from '../supabase/databaseProfileManager';

export type UnifiedSqlEnvId =
  | 'cloud_production'
  | 'cloud_testing'
  | 'local_production'
  | 'local_testing';

export interface UnifiedSqlEnvInfo {
  id: UnifiedSqlEnvId;
  name: string;
  shortName: string;
  badgeLabel: string;
  category: 'cloud' | 'local';
  isTest: boolean;
  targetDescription: string;
  storageLocation: string;
  description: string;
  accentColor: string;
  colorScheme: {
    badgeBg: string;
    badgeText: string;
    borderActive: string;
    bgActive: string;
    iconBg: string;
  };
}

export const EVENT_UNIFIED_SQL_ENV_CHANGED = 'bakery_unified_sql_env_changed';

export const UNIFIED_SQL_ENVS: Record<UnifiedSqlEnvId, UnifiedSqlEnvInfo> = {
  cloud_production: {
    id: 'cloud_production',
    name: '1. Cloud SQL Chính (Vận Hành)',
    shortName: 'Cloud SQL Chính',
    badgeLabel: 'CLOUD CHÍNH',
    category: 'cloud',
    isTest: false,
    targetDescription: 'Cơ sở dữ liệu đám mây chính thức của tiệm',
    storageLocation: 'fhiuojcvsouwugatnmve.supabase.co',
    description: 'Dành cho bán hàng thật hàng ngày. Dữ liệu đơn hàng, ca bán và doanh thu lưu trữ trên Cloud Supabase chính.',
    accentColor: 'emerald',
    colorScheme: {
      badgeBg: 'bg-emerald-100 border-emerald-300',
      badgeText: 'text-emerald-900',
      borderActive: 'border-emerald-600',
      bgActive: 'bg-emerald-50/70',
      iconBg: 'bg-emerald-600 text-white',
    },
  },
  cloud_testing: {
    id: 'cloud_testing',
    name: '2. Cloud SQL Test (Thử Nghiệm)',
    shortName: 'Cloud SQL Test',
    badgeLabel: 'CLOUD TEST',
    category: 'cloud',
    isTest: true,
    targetDescription: 'Cơ sở dữ liệu đám mây thử nghiệm độc lập',
    storageLocation: 'azgjnahbibrcbjooepef.supabase.co',
    description: 'Dành cho test tính năng mới, tạo đơn ảo trên Cloud. Hoàn toàn cách ly, không ảnh hưởng CSDL Chính.',
    accentColor: 'amber',
    colorScheme: {
      badgeBg: 'bg-amber-100 border-amber-300',
      badgeText: 'text-amber-900',
      borderActive: 'border-amber-500',
      bgActive: 'bg-amber-50/70',
      iconBg: 'bg-amber-600 text-white',
    },
  },
  local_production: {
    id: 'local_production',
    name: '3. Local SQL Chính (Vận Hành)',
    shortName: 'Local SQL Chính',
    badgeLabel: 'LOCAL CHÍNH',
    category: 'local',
    isTest: false,
    targetDescription: 'Thư mục tệp tin máy tính cục bộ',
    storageLocation: 'SQL backup\\SQL LOCAL',
    description: 'Dành cho bán hàng thật offline trên máy tính tiệm khi mất mạng hoặc không dùng Internet. Lưu file SQL máy tính.',
    accentColor: 'blue',
    colorScheme: {
      badgeBg: 'bg-blue-100 border-blue-300',
      badgeText: 'text-blue-900',
      borderActive: 'border-blue-600',
      bgActive: 'bg-blue-50/70',
      iconBg: 'bg-blue-600 text-white',
    },
  },
  local_testing: {
    id: 'local_testing',
    name: '4. Local SQL Test (Thử Nghiệm)',
    shortName: 'Local SQL Test',
    badgeLabel: 'LOCAL TEST',
    category: 'local',
    isTest: true,
    targetDescription: 'Thư mục tệp tin máy tính thử nghiệm',
    storageLocation: 'SQL backup\\SQL TEST',
    description: 'Dành cho test tính năng, giả lập lỗi và tạo đơn ảo offline trên máy tính. Không ảnh hưởng Local Chính.',
    accentColor: 'purple',
    colorScheme: {
      badgeBg: 'bg-purple-100 border-purple-300',
      badgeText: 'text-purple-900',
      borderActive: 'border-purple-600',
      bgActive: 'bg-purple-50/70',
      iconBg: 'bg-purple-600 text-white',
    },
  },
};

/**
 * Lấy ID môi trường SQL đang kích hoạt
 */
export function getActiveUnifiedSqlEnv(): UnifiedSqlEnvId {
  if (typeof window === 'undefined') return 'cloud_production';
  try {
    const sqlMode = getSqlModeConfig();
    if (sqlMode.mode === 'local') {
      return sqlMode.activeLocalEnv === 'testing' ? 'local_testing' : 'local_production';
    } else {
      const activeProfile = getActiveProfile();
      return activeProfile?.id === 'testing' ? 'cloud_testing' : 'cloud_production';
    }
  } catch {
    return 'cloud_production';
  }
}

/**
 * Lấy chi tiết thông tin của môi trường SQL đang kích hoạt
 */
export function getActiveUnifiedSqlEnvInfo(): UnifiedSqlEnvInfo {
  const activeId = getActiveUnifiedSqlEnv();
  return UNIFIED_SQL_ENVS[activeId] || UNIFIED_SQL_ENVS.cloud_production;
}

/**
 * Chuyển đổi môi trường SQL (Chỉ làm việc trên CSDL được chọn, cách ly 100%, không đồng bộ chép đè)
 */
export function switchUnifiedSqlEnv(targetEnv: UnifiedSqlEnvId): void {
  if (typeof window === 'undefined') return;

  const currentEnv = getActiveUnifiedSqlEnv();
  if (currentEnv === targetEnv) return;

  if (targetEnv === 'cloud_production') {
    switchDatabaseMode('online');
    switchActiveEnvironment('production', 'fetch_from_new');
  } else if (targetEnv === 'cloud_testing') {
    switchDatabaseMode('online');
    switchActiveEnvironment('testing', 'fetch_from_new');
  } else if (targetEnv === 'local_production') {
    switchDatabaseMode('local');
    switchLocalEnvironment('production', 'load_vault');
  } else if (targetEnv === 'local_testing') {
    switchDatabaseMode('local');
    switchLocalEnvironment('testing', 'load_vault');
  }

  window.dispatchEvent(
    new CustomEvent(EVENT_UNIFIED_SQL_ENV_CHANGED, {
      detail: { activeEnv: targetEnv },
    })
  );
}
