// src/lib/supabase/databaseProfileManager.ts
// Quản lý Đa Môi Trường CSDL SQL (Multi-Environment: Production vs Testing)
// Đảm bảo cô lập dữ liệu 100% giữa CSDL Chính và CSDL Thử Nghiệm, chống trộn lẫn dữ liệu.

import { createClient } from '@supabase/supabase-js';

export type DatabaseEnvironmentId = 'production' | 'testing' | string;

export interface DatabaseProfile {
  id: DatabaseEnvironmentId;
  name: string;
  description: string;
  url: string;
  anonKey: string;
  isDefault?: boolean;
  updatedAt?: string;
}

export interface MultiSqlConfig {
  activeProfileId: DatabaseEnvironmentId;
  profiles: DatabaseProfile[];
}

export const STORAGE_KEY_MULTI_SQL_CONFIG = 'bakery_multi_sql_config';
export const STORAGE_KEY_PROFILE_VAULT_PREFIX = 'bakery_vault_profile_';
export const STORAGE_KEY_RECONCILE_LOCKED = 'bakery_reconcile_locked';
export const EVENT_DB_PROFILE_CHANGED = 'bakery_db_profile_changed';

// Danh sách các key dữ liệu trong localStorage cần được cô lập theo từng CSDL
export const BAKERY_DATA_KEYS = [
  'bakery_products',
  'bakery_stocks',
  'bakery_orders',
  'bakery_preorders',
  'bakery_recipes',
  'bakery_ingredients',
  'bakery_expenses',
  'bakery_cashflow',
  'bakery_spoilage',
  'bakery_spoilage_logs',
  'bakery_stock_adjustments',
  'bakery_stock_adjustment_logs',
  'bakery_accounting_closings',
  'bakery_closing_records',
  'bakery_security_config',
  'bakery_vietqr_config',
  'bakery_ewallet_config',
  'bakery_printer_config',
  'bakery_telegram_config',
  'bakery_store_branding',
  'bakery_cake_costing_config',
  'bakery_full_bom_config',
  'bakery_tax_household_config',
  'bakery_tax_policy_config',
  'bakery_pending_transfers',
  'bakery_current_shift',
  'bakery_shift_history',
  'bakery_delivery_alert_config',
  'bakery_autobank_config',
  'bakery_transfer_verification_config',
  'bakery_notification_history',
];

export const DEFAULT_PRODUCTION_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://azgjnahbibrcbjooepef.supabase.co';
export const DEFAULT_PRODUCTION_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';

export const DEFAULT_PROFILES: DatabaseProfile[] = [
  {
    id: 'production',
    name: 'CSDL Chính (Vận Hành)',
    description: 'Cơ sở dữ liệu đám mây chính thức của cửa hàng bánh. Dùng cho bán hàng thật, tính tiền và sổ sách kế toán.',
    url: DEFAULT_PRODUCTION_URL,
    anonKey: DEFAULT_PRODUCTION_KEY,
    isDefault: true,
  },
  {
    id: 'testing',
    name: 'CSDL Thử Nghiệm (Test & Fix Lỗi)',
    description: 'Môi trường Sandbox độc lập. Dùng để thử tính năng mới, tạo đơn ảo, thử công thức hoặc tái hiện lỗi mà không ảnh hưởng CSDL Chính.',
    url: '',
    anonKey: '',
    isDefault: false,
  },
];

export const DEFAULT_MULTI_SQL_CONFIG: MultiSqlConfig = {
  activeProfileId: 'production',
  profiles: DEFAULT_PROFILES,
};

/**
 * Lấy toàn bộ cấu hình Đa CSDL SQL
 */
export function getMultiSqlConfig(): MultiSqlConfig {
  if (typeof window === 'undefined') return DEFAULT_MULTI_SQL_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MULTI_SQL_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.profiles)) {
        // Đảm bảo luôn có ít nhất 2 profile production và testing
        const profileMap = new Map<string, DatabaseProfile>();
        DEFAULT_PROFILES.forEach((p) => profileMap.set(p.id, p));
        parsed.profiles.forEach((p: DatabaseProfile) => {
          if (p && p.id) {
            profileMap.set(p.id, { ...profileMap.get(p.id), ...p });
          }
        });
        return {
          activeProfileId: parsed.activeProfileId || 'production',
          profiles: Array.from(profileMap.values()),
        };
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc cấu hình multiSql:', err);
  }
  return DEFAULT_MULTI_SQL_CONFIG;
}

/**
 * Lấy Profile CSDL đang hoạt động (Active)
 */
export function getActiveProfile(): DatabaseProfile {
  const config = getMultiSqlConfig();
  const active = config.profiles.find((p) => p.id === config.activeProfileId);
  return (
    active ||
    config.profiles.find((p) => p.id === 'production') ||
    DEFAULT_PROFILES[0]
  );
}

/**
 * Đóng gói toàn bộ dữ liệu localStorage hiện tại thành Snapshot
 */
export function captureProfileSnapshot(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  if (typeof window === 'undefined') return snapshot;
  try {
    for (const key of BAKERY_DATA_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        snapshot[key] = val;
      }
    }
  } catch (err) {
    console.warn('Lỗi capture snapshot:', err);
  }
  return snapshot;
}

/**
 * Nạp Snapshot dữ liệu vào localStorage
 */
export function applyProfileSnapshot(snapshot: Record<string, string>): void {
  if (typeof window === 'undefined' || !snapshot) return;
  try {
    for (const key of BAKERY_DATA_KEYS) {
      if (snapshot[key] !== undefined) {
        localStorage.setItem(key, snapshot[key]);
      } else {
        localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.warn('Lỗi apply snapshot:', err);
  }
}

/**
 * Xóa sạch dữ liệu cục bộ của tiệm (Clean Slate) để tránh trộn dữ liệu cũ
 */
export function clearProfileLocalData(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of BAKERY_DATA_KEYS) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('Lỗi clear profile local data:', err);
  }
}

/**
 * Kiểm tra trạng thái Khóa Bảo Vệ Chống Đẩy Bù (Reconcile Safety Lock)
 */
export function isReconcileLocked(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEY_RECONCILE_LOCKED) === 'true';
}

/**
 * Bật/Tắt Khóa Bảo Vệ Chống Đẩy Bù
 */
export function setReconcileLocked(locked: boolean): void {
  if (typeof window === 'undefined') return;
  if (locked) {
    localStorage.setItem(STORAGE_KEY_RECONCILE_LOCKED, 'true');
  } else {
    localStorage.removeItem(STORAGE_KEY_RECONCILE_LOCKED);
  }
}

/**
 * Lưu thông tin của một Profile CSDL
 */
export function saveDatabaseProfile(
  updatedProfile: DatabaseProfile,
  syncAction: 'fetch_from_new' | 'push_current' | 'clean_slate' = 'fetch_from_new'
): MultiSqlConfig {
  if (typeof window === 'undefined') return DEFAULT_MULTI_SQL_CONFIG;
  const config = getMultiSqlConfig();
  const index = config.profiles.findIndex((p) => p.id === updatedProfile.id);

  const newProfile = {
    ...updatedProfile,
    url: updatedProfile.url.trim().replace(/\/+$/, ''),
    anonKey: updatedProfile.anonKey.trim(),
    updatedAt: new Date().toISOString(),
  };

  if (index >= 0) {
    config.profiles[index] = newProfile;
  } else {
    config.profiles.push(newProfile);
  }

  // Nếu profile vừa sửa chính là profile đang active, xử lý hướng dữ liệu
  if (config.activeProfileId === updatedProfile.id) {
    handleDataSyncAction(updatedProfile.id, syncAction);
  }

  localStorage.setItem(STORAGE_KEY_MULTI_SQL_CONFIG, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent(EVENT_DB_PROFILE_CHANGED, { detail: config }));
  return config;
}

/**
 * Chuyển đổi môi trường hoạt động (Switch Environment)
 */
export function switchActiveEnvironment(
  targetId: DatabaseEnvironmentId,
  syncAction: 'fetch_from_new' | 'push_current' | 'clean_slate' = 'fetch_from_new'
): MultiSqlConfig {
  if (typeof window === 'undefined') return DEFAULT_MULTI_SQL_CONFIG;
  const config = getMultiSqlConfig();
  const currentId = config.activeProfileId;

  if (currentId === targetId) {
    return config;
  }

  // 1. Đóng gói dữ liệu môi trường hiện tại vào Vault riêng
  const currentSnapshot = captureProfileSnapshot();
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PROFILE_VAULT_PREFIX}${currentId}`,
      JSON.stringify(currentSnapshot)
    );
  } catch (e) {
    console.warn('Lỗi lưu vault môi trường hiện tại:', e);
  }

  // 2. Kích hoạt KHÓA BẢO VỆ CHỐNG ĐẨY BÙ (Auto-reconcile safety lock)
  setReconcileLocked(true);

  // 3. Xử lý dữ liệu cho môi trường đích
  if (syncAction === 'clean_slate') {
    clearProfileLocalData();
  } else if (syncAction === 'push_current') {
    // Giữ nguyên dữ liệu hiện tại để chuẩn bị đẩy lên DB mới
  } else {
    // 'fetch_from_new': Khôi phục từ Vault nếu có, nếu chưa có thì xóa sạch để nạp mới từ CSDL mới
    const targetVaultRaw = localStorage.getItem(`${STORAGE_KEY_PROFILE_VAULT_PREFIX}${targetId}`);
    if (targetVaultRaw) {
      try {
        const parsed = JSON.parse(targetVaultRaw);
        applyProfileSnapshot(parsed);
      } catch {
        clearProfileLocalData();
      }
    } else {
      clearProfileLocalData();
    }
  }

  // 4. Cập nhật activeProfileId
  config.activeProfileId = targetId;
  localStorage.setItem(STORAGE_KEY_MULTI_SQL_CONFIG, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent(EVENT_DB_PROFILE_CHANGED, { detail: config }));

  return config;
}

/**
 * Xử lý hành vi dữ liệu khi thay đổi thông tin kết nối
 */
function handleDataSyncAction(
  profileId: string,
  action: 'fetch_from_new' | 'push_current' | 'clean_slate'
) {
  setReconcileLocked(true);
  if (action === 'clean_slate' || action === 'fetch_from_new') {
    clearProfileLocalData();
    // Xóa vault cũ của profile này
    localStorage.removeItem(`${STORAGE_KEY_PROFILE_VAULT_PREFIX}${profileId}`);
  }
}

/**
 * Khôi phục cấu hình Profile về mặc định hệ thống
 */
export function resetProfileToDefault(profileId: DatabaseEnvironmentId): MultiSqlConfig {
  if (typeof window === 'undefined') return DEFAULT_MULTI_SQL_CONFIG;
  const config = getMultiSqlConfig();
  const defaultItem = DEFAULT_PROFILES.find((p) => p.id === profileId);

  if (defaultItem) {
    const index = config.profiles.findIndex((p) => p.id === profileId);
    if (index >= 0) {
      config.profiles[index] = { ...defaultItem };
    }
    localStorage.setItem(STORAGE_KEY_MULTI_SQL_CONFIG, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(EVENT_DB_PROFILE_CHANGED, { detail: config }));
  }
  return config;
}

/**
 * Tiện ích 1-Click: Sao chép dữ liệu (Menu bánh, công thức) giữa 2 profile
 */
export function cloneDataBetweenProfiles(sourceId: string, targetId: string): { success: boolean; count?: number; error?: string } {
  if (typeof window === 'undefined') return { success: false, error: 'Chỉ chạy trên trình duyệt' };
  try {
    const config = getMultiSqlConfig();
    let sourceData: Record<string, string> | null = null;

    if (config.activeProfileId === sourceId) {
      sourceData = captureProfileSnapshot();
    } else {
      const raw = localStorage.getItem(`${STORAGE_KEY_PROFILE_VAULT_PREFIX}${sourceId}`);
      if (raw) sourceData = JSON.parse(raw);
    }

    if (!sourceData) {
      return { success: false, error: `Không tìm thấy dữ liệu của nguồn "${sourceId}"` };
    }

    // Sao lưu vào Vault của target
    localStorage.setItem(`${STORAGE_KEY_PROFILE_VAULT_PREFIX}${targetId}`, JSON.stringify(sourceData));

    // Nếu target đang active, apply ngay
    if (config.activeProfileId === targetId) {
      applyProfileSnapshot(sourceData);
    }

    return { success: true, count: Object.keys(sourceData).length };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Lỗi khi sao chép dữ liệu' };
  }
}

/**
 * Kiểm tra kết nối đo độ trễ Ping tới Supabase (Ping Test)
 */
export async function testSupabaseConnection(
  url: string,
  anonKey: string
): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  try {
    const cleanUrl = url.trim().replace(/\/+$/, '');
    const cleanKey = anonKey.trim();

    if (!cleanUrl) {
      return { success: false, error: 'Chưa nhập URL Supabase Project' };
    }
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      return { success: false, error: 'URL phải bắt đầu bằng https:// hoặc http://' };
    }
    if (!cleanKey) {
      return { success: false, error: 'Chưa nhập Khóa API (Anon / Publishable Key)' };
    }

    const startTime = performance.now();
    const testClient = createClient(cleanUrl, cleanKey, {
      auth: { persistSession: false },
    });

    // Thử truy vấn 1 bảng tiêu chuẩn hoặc gọi getSession
    const { error } = await testClient.from('profiles').select('id', { count: 'exact', head: true });
    const latencyMs = Math.round(performance.now() - startTime);

    if (error) {
      if (
        error.message?.toLowerCase().includes('invalid api key') ||
        error.message?.toLowerCase().includes('jwt') ||
        error.code === 'PGRST301'
      ) {
        return { success: false, error: `Khóa API không hợp lệ: ${error.message}` };
      }
      // Bảng chưa tạo (chưa chạy migration) nhưng kết nối tới server Supabase thành công
      return {
        success: true,
        latencyMs,
        error: `Kết nối máy chủ OK (${latencyMs}ms), nhưng bảng 'profiles' chưa tồn tại. Bạn cần chạy Migration SQL.`,
      };
    }

    return { success: true, latencyMs };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Không thể kết nối tới URL này. Vui lòng kiểm tra lại mạng hoặc URL.',
    };
  }
}
