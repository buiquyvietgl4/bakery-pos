// src/lib/supabase/databaseProfileManager.ts
// Quản lý Đa Môi Trường CSDL SQL (Multi-Environment: Production vs Testing)
// Đảm bảo cô lập dữ liệu 100% giữa CSDL Chính và CSDL Thử Nghiệm, chống trộn lẫn dữ liệu.

import { createClient } from '@supabase/supabase-js';
import { isLocalMode } from '@/lib/utils/sqlModeManager';

export type DatabaseEnvironmentId = 'production' | 'testing' | string;

export interface DatabaseProfile {
  id: DatabaseEnvironmentId;
  name: string;
  description: string;
  url: string;
  anonKey: string;
  isDefault?: boolean;
  isCustomized?: boolean;
  version?: number;
  updatedAt?: string;
}

export interface MultiSqlConfig {
  activeProfileId: DatabaseEnvironmentId;
  profiles: DatabaseProfile[];
}

export const STORAGE_KEY_MULTI_SQL_CONFIG = 'bakery_multi_sql_config';
export const STORAGE_KEY_CUSTOM_PROD_URL = 'bakery_custom_prod_url';
export const STORAGE_KEY_CUSTOM_PROD_KEY = 'bakery_custom_prod_key';
export const STORAGE_KEY_PROFILE_VAULT_PREFIX = 'bakery_vault_profile_';
export const STORAGE_KEY_RECONCILE_LOCKED = 'bakery_reconcile_locked';
export const EVENT_DB_PROFILE_CHANGED = 'bakery_db_profile_changed';

// Đồng bộ CSDL Chính lên toàn bộ các thiết bị vào chung link app
export const DB_ROW_GLOBAL_SQL_ID = '00000000-0000-0000-0000-000000000098';
export const DB_ROW_GLOBAL_SQL_NAME = 'SYS_CONFIG_DATABASE_PROFILE';
export const EVENT_GLOBAL_SQL_SYNCED = 'bakery_global_sql_synced';
export const STORAGE_KEY_LAST_GLOBAL_SQL_SYNC = 'bakery_last_global_sql_sync_ts';

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
  'bakery_order_returns',
  'bakery_held_orders',
  'bakery_pending_returns',
  'bakery_resolved_returns',
  'bakery_resolved_transfers',
  'bakery_deleted_order_keys',
  'bakery_deleted_ingredient_ids',
  'bakery_deleted_recipe_ids',
  'bakery_deleted_product_ids',
  'bakery_oven_batches',
  'bakery_product_metadata_map',
  'bakery_admin_pin',
];

export function cleanSupabaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let clean = rawUrl.trim();
  clean = clean.replace(/\/+$/, '');
  clean = clean.replace(/\/rest\/v1\/?$/i, '');
  clean = clean.replace(/\/rest\/?$/i, '');
  clean = clean.replace(/\/+$/, '');
  return clean;
}

export const DEFAULT_PRODUCTION_URL = cleanSupabaseUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhiuojcvsouwugatnmve.supabase.co'
);
export const DEFAULT_PRODUCTION_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED'
).trim();

export const DEFAULT_TESTING_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
export const DEFAULT_TESTING_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';

export const DEFAULT_PROFILES: DatabaseProfile[] = [
  {
    id: 'production',
    name: 'CSDL Chính (Vận Hành)',
    description: 'Cơ sở dữ liệu đám mây chính thức của cửa hàng bánh (fhiuojcvsouwugatnmve). Dùng cho bán hàng thật, tính tiền và sổ sách kế toán.',
    url: DEFAULT_PRODUCTION_URL,
    anonKey: DEFAULT_PRODUCTION_KEY,
    isDefault: true,
  },
  {
    id: 'testing',
    name: 'CSDL Dự Phòng / Thử Nghiệm',
    description: 'Môi trường Sandbox hoặc CSDL dự phòng (azgjnahbibrcbjooepef). Dùng để thử tính năng mới, tạo đơn ảo, thử công thức hoặc đối chiếu dữ liệu.',
    url: DEFAULT_TESTING_URL,
    anonKey: DEFAULT_TESTING_KEY,
    isDefault: false,
  },
];

export function getDefaultMultiSqlConfig(): MultiSqlConfig {
  return {
    activeProfileId: 'production',
    profiles: DEFAULT_PROFILES.map((p) => ({ ...p })),
  };
}

export const DEFAULT_MULTI_SQL_CONFIG: MultiSqlConfig = getDefaultMultiSqlConfig();

/**
 * Lấy toàn bộ cấu hình Đa CSDL SQL
 */
export function getMultiSqlConfig(): MultiSqlConfig {
  if (typeof window === 'undefined') return getDefaultMultiSqlConfig();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MULTI_SQL_CONFIG);
    const profileMap = new Map<string, DatabaseProfile>();
    DEFAULT_PROFILES.forEach((p) => profileMap.set(p.id, { ...p }));

    let activeProfileId = 'production';

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.profiles)) {
        activeProfileId = parsed.activeProfileId || 'production';
        parsed.profiles.forEach((p: DatabaseProfile) => {
          if (p && p.id) {
            profileMap.set(p.id, { ...profileMap.get(p.id), ...p });
          }
        });
      }
    }

    // Ưu tiên đọc key lưu cứng riêng biệt STORAGE_KEY_CUSTOM_PROD_URL / KEY
    const customProdUrl = localStorage.getItem(STORAGE_KEY_CUSTOM_PROD_URL);
    const customProdKey = localStorage.getItem(STORAGE_KEY_CUSTOM_PROD_KEY);
    if (customProdUrl) {
      const prod = profileMap.get('production');
      if (prod) {
        prod.url = cleanSupabaseUrl(customProdUrl);
        if (customProdKey) prod.anonKey = customProdKey.trim();
        prod.isCustomized = true;
      }
    }

    let hasFixedConfig = false;

    // NGUYÊN TẮC TÁCH BIỆT: CSDL Test tuyệt đối KHÔNG ĐƯỢC dùng chung Project với CSDL Chính.
    // Nếu CSDL Chính trùng với CSDL Test, CSDL Chính luôn được ưu tiên, CSDL Test sẽ tự động để trống.
    const prod = profileMap.get('production');
    const test = profileMap.get('testing');
    if (prod && test && test.url) {
      const prodUrl = cleanSupabaseUrl(prod.url);
      const testUrl = cleanSupabaseUrl(test.url);
      if (prodUrl && testUrl && prodUrl === testUrl) {
        test.url = '';
        test.anonKey = '';
        test.isCustomized = false;
        hasFixedConfig = true;
      }
    }

    const profiles = Array.from(profileMap.values());
    if (hasFixedConfig || customProdUrl) {
      try {
        localStorage.setItem(
          STORAGE_KEY_MULTI_SQL_CONFIG,
          JSON.stringify({
            activeProfileId,
            profiles,
          })
        );
      } catch {}
    }

    return {
      activeProfileId,
      profiles,
    };
  } catch (err) {
    console.warn('Lỗi đọc cấu hình multiSql:', err);
  }
  return getDefaultMultiSqlConfig();
}

/**
 * Lấy Profile CSDL đang hoạt động (Active)
 */
export function getActiveProfile(): DatabaseProfile {
  const config = getMultiSqlConfig();
  const active = config.profiles.find((p) => p.id === config.activeProfileId);
  if (active && active.id === 'testing' && (!active.url || !cleanSupabaseUrl(active.url))) {
    return config.profiles.find((p) => p.id === 'production') || DEFAULT_PROFILES[0];
  }
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

async function getDexieDb() {
  if (typeof window === 'undefined') return null;
  try {
    const mod = await import('@/lib/db/dexie');
    return mod.db || null;
  } catch {
    return null;
  }
}

/**
 * Xóa sạch dữ liệu cục bộ của tiệm (Clean Slate) bao gồm cả localStorage và Dexie IndexedDB
 * Ngăn chặn 100% tình trạng dữ liệu của CSDL cũ bị lưu đọng và trộn lẫn sang CSDL mới
 */
export async function clearProfileLocalData(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    for (const key of BAKERY_DATA_KEYS) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('Lỗi clear profile local data:', err);
  }
  try {
    const dexDb = await getDexieDb();
    if (dexDb) {
      await Promise.allSettled([
        dexDb.products?.clear(),
        dexDb.orders?.clear(),
        dexDb.syncQueue?.clear(),
      ]);
    }
  } catch (dexErr) {
    console.warn('Lỗi clear Dexie local data:', dexErr);
  }
}

/**
 * Phiên bản xóa đồng bộ (Sync) kích hoạt xóa Dexie ngầm
 */
export function clearProfileLocalDataSync(): void {
  if (typeof window === 'undefined') return;
  try {
    for (const key of BAKERY_DATA_KEYS) {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('Lỗi clear profile local data sync:', err);
  }
  try {
    getDexieDb().then((dexDb) => {
      if (dexDb) {
        dexDb.products?.clear().catch(() => {});
        dexDb.orders?.clear().catch(() => {});
        dexDb.syncQueue?.clear().catch(() => {});
      }
    }).catch(() => {});
  } catch {}
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

// Helper: Đồng bộ cấu hình CSDL xuống file trên máy chủ để file TAO_MA_CUU_HO.bat luôn đọc được URL mới nhất
function syncProfileToServer(profile: DatabaseProfile, activeProfileId: string) {
  if (typeof window === 'undefined') return;
  try {
    fetch('/api/system/database-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: profile.url,
        anonKey: profile.anonKey,
        activeProfileId,
        name: profile.name,
      }),
    }).catch(() => {});
  } catch {}
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
  // TÁCH BIỆT: Tuyệt đối không dùng chung 1 project giữa testing và production
  const cleanUpdatedUrl = cleanSupabaseUrl(updatedProfile.url);
  if (updatedProfile.id === 'testing' && cleanUpdatedUrl) {
    const prod = config.profiles.find((p) => p.id === 'production');
    if (prod?.url && cleanUpdatedUrl === cleanSupabaseUrl(prod.url)) {
      throw new Error('CSDL Thử Nghiệm không được dùng chung Project với CSDL Chính!');
    }
  } else if (updatedProfile.id === 'production' && cleanUpdatedUrl) {
    const test = config.profiles.find((p) => p.id === 'testing');
    if (test?.url && cleanUpdatedUrl === cleanSupabaseUrl(test.url)) {
      // Tự động giải phóng CSDL Thử Nghiệm để CSDL Chính được ưu tiên tuyệt đối
      test.url = '';
      test.anonKey = '';
      test.isCustomized = false;
    }
  }

  const isCustom = updatedProfile.isCustomized ?? (cleanUpdatedUrl ? cleanUpdatedUrl !== DEFAULT_PRODUCTION_URL : false);
  const currentVersion = updatedProfile.version || Date.now();
  const currentUpdatedAt = updatedProfile.updatedAt || new Date().toISOString();

  const newProfile: DatabaseProfile = {
    ...updatedProfile,
    url: cleanUpdatedUrl,
    anonKey: updatedProfile.anonKey ? updatedProfile.anonKey.trim() : '',
    isCustomized: isCustom,
    version: currentVersion,
    updatedAt: currentUpdatedAt,
  };

  const index = config.profiles.findIndex((p) => p.id === updatedProfile.id);
  if (index >= 0) {
    config.profiles[index] = newProfile;
  } else {
    config.profiles.push(newProfile);
  }

  // Nếu là production, lưu thêm vào khóa cứng riêng biệt STORAGE_KEY_CUSTOM_PROD_URL / KEY
  if (updatedProfile.id === 'production') {
    if (cleanUpdatedUrl && cleanUpdatedUrl !== DEFAULT_PRODUCTION_URL) {
      localStorage.setItem(STORAGE_KEY_CUSTOM_PROD_URL, cleanUpdatedUrl);
      if (newProfile.anonKey) {
        localStorage.setItem(STORAGE_KEY_CUSTOM_PROD_KEY, newProfile.anonKey);
      }
    } else if (cleanUpdatedUrl === DEFAULT_PRODUCTION_URL) {
      localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_URL);
      localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_KEY);
    }
  }

  // Nếu profile vừa sửa chính là profile đang active, xử lý hướng dữ liệu
  if (config.activeProfileId === updatedProfile.id) {
    handleDataSyncAction(updatedProfile.id, syncAction);
    syncProfileToServer(newProfile, config.activeProfileId);
  }

  localStorage.setItem(STORAGE_KEY_MULTI_SQL_CONFIG, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent(EVENT_DB_PROFILE_CHANGED, { detail: config }));
  return config;
}

/**
 * Lưu CSDL Chính và đồng bộ lên toàn bộ hệ thống (Toàn bộ các máy truy cập chung link web)
 */
export async function saveGlobalProductionSql(
  url: string,
  anonKey: string,
  name: string = 'CSDL Chính (Vận Hành)'
): Promise<{ success: boolean; error?: string; config: MultiSqlConfig }> {
  const cleanUrl = cleanSupabaseUrl(url);
  const cleanKey = (anonKey || '').trim();

  if (!cleanUrl || !cleanKey) {
    return { success: false, error: 'URL hoặc API Key không hợp lệ', config: getMultiSqlConfig() };
  }

  const currentCfg = getMultiSqlConfig();
  const testProf = currentCfg.profiles.find((p) => p.id === 'testing');
  // Nếu CSDL Chính trùng với CSDL Thử Nghiệm, giải phóng CSDL Thử Nghiệm để CSDL Chính được dùng độc quyền
  if (testProf?.url && cleanUrl === cleanSupabaseUrl(testProf.url)) {
    testProf.url = '';
    testProf.anonKey = '';
    testProf.isCustomized = false;
  }

  // Lưu ngay vào khóa cứng riêng biệt
  if (cleanUrl !== DEFAULT_PRODUCTION_URL) {
    localStorage.setItem(STORAGE_KEY_CUSTOM_PROD_URL, cleanUrl);
    localStorage.setItem(STORAGE_KEY_CUSTOM_PROD_KEY, cleanKey);
  } else {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_URL);
    localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_KEY);
  }

  const nowIso = new Date().toISOString();
  const nowVersion = Date.now();
  const payload = {
    url: cleanUrl,
    anonKey: cleanKey,
    name,
    updatedAt: nowIso,
    updatedBy: 'admin',
    version: nowVersion,
    isCustomized: true,
  };

  // 1. Cập nhật cấu hình trên máy hiện tại
  const updatedProfile: DatabaseProfile = {
    id: 'production',
    name,
    description: `Cơ sở dữ liệu đám mây chính thức của tiệm (${cleanUrl.replace(/^https?:\/\//, '').split('.')[0] || 'Cloud'}).`,
    url: cleanUrl,
    anonKey: cleanKey,
    isDefault: false,
    isCustomized: true,
    version: nowVersion,
    updatedAt: nowIso,
  };

  const newConfig = saveDatabaseProfile(updatedProfile, 'fetch_from_new');
  await clearProfileLocalData();

  // 2. Đồng bộ xuống server API (/api/system/database-profile)
  try {
    await fetch('/api/system/database-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: cleanUrl,
        anonKey: cleanKey,
        activeProfileId: 'production',
        name,
        version: nowVersion,
        updatedAt: nowIso,
      }),
    });
  } catch (err) {
    console.warn('[saveGlobalProductionSql] Lỗi gọi API server:', err);
  }

  // 3. Ghi chỉ mục SYS_CONFIG_DATABASE_PROFILE lên Cloud Supabase
  // 3a. Ghi vào CSDL đích mới
  try {
    const targetClient = createClient(cleanUrl, cleanKey, { auth: { persistSession: false } });
    await targetClient.from('recipes').upsert(
      {
        id: DB_ROW_GLOBAL_SQL_ID,
        name: DB_ROW_GLOBAL_SQL_NAME,
        notes: JSON.stringify(payload),
        is_active: false,
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('[saveGlobalProductionSql] Lỗi ghi chỉ mục CSDL đích:', err);
  }

  // 3b. Ghi vào CSDL gốc mặc định (DEFAULT_PRODUCTION_URL) để các máy vào bằng link gốc nhận được chuyển tiếp
  try {
    const rootUrl = cleanSupabaseUrl(DEFAULT_PRODUCTION_URL);
    const rootKey = (DEFAULT_PRODUCTION_KEY || '').trim();
    if (rootUrl && rootKey && (rootUrl !== cleanUrl || rootKey !== cleanKey)) {
      const rootClient = createClient(rootUrl, rootKey, { auth: { persistSession: false } });
      await rootClient.from('recipes').upsert(
        {
          id: DB_ROW_GLOBAL_SQL_ID,
          name: DB_ROW_GLOBAL_SQL_NAME,
          notes: JSON.stringify(payload),
          is_active: false,
        },
        { onConflict: 'id' }
      );
    }
  } catch (err) {
    console.warn('[saveGlobalProductionSql] Lỗi ghi chỉ mục CSDL gốc:', err);
  }

  // 4. Lưu dấu thời gian đồng bộ và phát sự kiện
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_LAST_GLOBAL_SQL_SYNC, nowIso);
      window.dispatchEvent(new CustomEvent(EVENT_GLOBAL_SQL_SYNCED, { detail: payload }));
    } catch {}
  }

  return { success: true, config: newConfig };
}

/**
 * Kiểm tra và tự động cập nhật CSDL Chính từ máy chủ / Cloud về thiết bị này
 * Giúp các máy con/máy khác truy cập chung link web tự động chuyển sang CSDL mới
 */
export async function fetchAndApplyGlobalSqlProfile(): Promise<{
  changed: boolean;
  updatedProfile?: DatabaseProfile;
}> {
  if (typeof window === 'undefined') return { changed: false };
  if (isLocalMode()) return { changed: false };

  const config = getMultiSqlConfig();
  const currentProd = config.profiles.find((p) => p.id === 'production');
  const currentProdUrl = cleanSupabaseUrl(currentProd?.url || '');
  const currentProdKey = (currentProd?.anonKey || '').trim();
  const currentVersion = typeof currentProd?.version === 'number' ? currentProd.version : 0;
  const currentUpdatedAtMs = currentProd?.updatedAt ? new Date(currentProd.updatedAt).getTime() : 0;
  const isCustomized = Boolean(currentProd?.isCustomized || (currentProdUrl && currentProdUrl !== DEFAULT_PRODUCTION_URL));

  // 1. Kiểm tra qua API máy chủ (/api/system/database-profile)
  try {
    const res = await fetch('/api/system/database-profile', { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success && json.data && json.data.url && json.data.anonKey) {
        const serverUrl = cleanSupabaseUrl(json.data.url);
        const serverKey = (json.data.anonKey || '').trim();
        const serverUpdatedAt = json.data.updatedAt || '';
        const serverUpdatedAtMs = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : 0;
        const serverVersion = typeof json.data.version === 'number' ? json.data.version : 0;
        const serverIsCustom =
          json.isCustom === true ||
          json.data?.isCustom === true ||
          (json.isDefault !== true && json.data?.isDefault !== true && Boolean(serverUrl && serverUrl !== DEFAULT_PRODUCTION_URL));
        const serverIsDefault =
          json.isDefault === true ||
          json.data?.isDefault === true ||
          (!serverIsCustom && serverUrl === DEFAULT_PRODUCTION_URL);

        if (currentProd && serverUrl) {
          // Trường hợp 1: Server là fallback mặc định (chưa có cấu hình tùy biến lưu trên server)
          if (serverIsDefault || !serverIsCustom) {
            if (isCustomized) {
              // BẢO VỆ CẤU HÌNH NGƯỜI DÙNG: Client đã được cấu hình CSDL tùy biến,
              // TUYỆT ĐỐI KHÔNG GHI ĐÈ URL MẶC ĐỊNH LÊN CLIENT!
              // Tự động push cấu hình hiện tại của client lên server để đồng bộ
              try {
                fetch('/api/system/database-profile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    url: currentProdUrl,
                    anonKey: currentProdKey,
                    activeProfileId: 'production',
                    name: currentProd.name,
                    version: currentVersion || Date.now(),
                    updatedAt: currentProd.updatedAt || new Date().toISOString(),
                  }),
                }).catch(() => {});
              } catch {}
            }
          } else {
            // Trường hợp 2: Server có cấu hình tùy biến thực sự từ Admin
            // So sánh version/timestamp: chỉ cập nhật nếu Server thực sự mới hơn Client
            const isServerNewer =
              serverVersion > currentVersion ||
              (serverVersion === 0 && serverUpdatedAtMs > currentUpdatedAtMs);
            const isDiff = serverUrl !== currentProdUrl || serverKey !== currentProdKey;

            if (isServerNewer && isDiff) {
              console.log(
                `[GlobalSqlSync] Phát hiện CSDL Chính mới từ máy chủ: ${serverUrl}. Đang tự động đồng bộ...`
              );
              currentProd.url = serverUrl;
              currentProd.anonKey = serverKey;
              currentProd.version = serverVersion || Date.now();
              currentProd.updatedAt = serverUpdatedAt || new Date().toISOString();
              currentProd.isCustomized = true;

              // Lưu khóa cứng riêng biệt
              if (serverUrl !== DEFAULT_PRODUCTION_URL) {
                localStorage.setItem(STORAGE_KEY_CUSTOM_PROD_URL, serverUrl);
                localStorage.setItem(STORAGE_KEY_CUSTOM_PROD_KEY, serverKey);
              } else {
                localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_URL);
                localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_KEY);
              }

              // Nếu trùng CSDL Test, tự động giải phóng CSDL Test
              const test = config.profiles.find((p) => p.id === 'testing');
              if (test && test.url && cleanSupabaseUrl(test.url) === serverUrl) {
                test.url = '';
                test.anonKey = '';
                test.isCustomized = false;
              }

              localStorage.setItem(STORAGE_KEY_MULTI_SQL_CONFIG, JSON.stringify(config));

              if (config.activeProfileId === 'production' && !isLocalMode()) {
                clearProfileLocalData();
                window.dispatchEvent(new CustomEvent(EVENT_DB_PROFILE_CHANGED, { detail: config }));
              }
              window.dispatchEvent(new CustomEvent(EVENT_GLOBAL_SQL_SYNCED, { detail: currentProd }));
              return { changed: true, updatedProfile: currentProd };
            }
          }
        }
      }
    }
  } catch (err) {
    // Bỏ qua lỗi mạng
  }

  // 2. Kiểm tra dự phòng qua Cloud Supabase SYS_CONFIG_DATABASE_PROFILE
  try {
    const queryUrl = cleanSupabaseUrl(currentProd?.url || DEFAULT_PRODUCTION_URL);
    const queryKey = (currentProd?.anonKey || DEFAULT_PRODUCTION_KEY || '').trim();

    if (queryUrl && queryKey) {
      const probeClient = createClient(queryUrl, queryKey, { auth: { persistSession: false } });
      const { data, error } = await probeClient
        .from('recipes')
        .select('notes')
        .or(`id.eq.${DB_ROW_GLOBAL_SQL_ID},name.eq.${DB_ROW_GLOBAL_SQL_NAME}`)
        .limit(1)
        .maybeSingle();

      if (!error && data && data.notes) {
        const parsed = JSON.parse(data.notes);
        if (parsed && parsed.url && parsed.anonKey) {
          const cloudUrl = cleanSupabaseUrl(parsed.url);
          const cloudKey = (parsed.anonKey || '').trim();
          const cloudUpdatedAt = parsed.updatedAt || '';
          const cloudUpdatedAtMs = cloudUpdatedAt ? new Date(cloudUpdatedAt).getTime() : 0;
          const cloudVersion = typeof parsed.version === 'number' ? parsed.version : 0;

          if (cloudUrl && currentProd) {
            // Không bao giờ để CSDL cũ đè URL mặc định lên cấu hình tùy biến của client
            if (isCustomized && cloudUrl === DEFAULT_PRODUCTION_URL) {
              // Bỏ qua
            } else {
              const isCloudNewer =
                cloudVersion > currentVersion ||
                (cloudVersion === 0 && cloudUpdatedAtMs > currentUpdatedAtMs);
              const isDiff = cloudUrl !== currentProdUrl || cloudKey !== currentProdKey;

              if (isCloudNewer && isDiff) {
                console.log(
                  `[GlobalSqlSync] Phát hiện CSDL Chính mới từ Cloud SYS_CONFIG: ${cloudUrl}. Đang đồng bộ...`
                );
                currentProd.url = cloudUrl;
                currentProd.anonKey = cloudKey;
                currentProd.version = cloudVersion || Date.now();
                currentProd.updatedAt = cloudUpdatedAt || new Date().toISOString();
                currentProd.isCustomized = true;

                // Lưu khóa cứng riêng biệt
                if (cloudUrl !== DEFAULT_PRODUCTION_URL) {
                  localStorage.setItem(STORAGE_KEY_CUSTOM_PROD_URL, cloudUrl);
                  localStorage.setItem(STORAGE_KEY_CUSTOM_PROD_KEY, cloudKey);
                } else {
                  localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_URL);
                  localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_KEY);
                }

                // Nếu trùng CSDL Test, tự động giải phóng CSDL Test
                const test = config.profiles.find((p) => p.id === 'testing');
                if (test && test.url && cleanSupabaseUrl(test.url) === cloudUrl) {
                  test.url = '';
                  test.anonKey = '';
                  test.isCustomized = false;
                }

                localStorage.setItem(STORAGE_KEY_MULTI_SQL_CONFIG, JSON.stringify(config));

                if (config.activeProfileId === 'production' && !isLocalMode()) {
                  clearProfileLocalData();
                  window.dispatchEvent(new CustomEvent(EVENT_DB_PROFILE_CHANGED, { detail: config }));
                }
                window.dispatchEvent(new CustomEvent(EVENT_GLOBAL_SQL_SYNCED, { detail: currentProd }));
                return { changed: true, updatedProfile: currentProd };
              }
            }
          }
        }
      }
    }
  } catch (err) {
    // Bỏ qua lỗi probe cloud
  }

  return { changed: false };
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

  // Không cho phép kích hoạt môi trường testing nếu URL để trống
  if (targetId === 'testing') {
    const testProf = config.profiles.find((p) => p.id === 'testing');
    if (!testProf?.url || !cleanSupabaseUrl(testProf.url)) {
      throw new Error('CSDL Thử Nghiệm đang để trống URL! Không thể kích hoạt môi trường thử nghiệm khi chưa cấu hình.');
    }
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
  const targetProf = config.profiles.find((p) => p.id === targetId);
  if (targetProf) {
    syncProfileToServer(targetProf, targetId);
  }
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
  if (profileId === 'production') {
    localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_URL);
    localStorage.removeItem(STORAGE_KEY_CUSTOM_PROD_KEY);
  }
  const config = getMultiSqlConfig();
  const defaultItem = DEFAULT_PROFILES.find((p) => p.id === profileId);

  if (defaultItem) {
    const index = config.profiles.findIndex((p) => p.id === profileId);
    if (index >= 0) {
      config.profiles[index] = {
        ...defaultItem,
        isCustomized: false,
        version: Date.now(),
        updatedAt: new Date().toISOString(),
      };
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

/**
 * Trích xuất Project ID / Project Ref từ URL Supabase (VD: fhiuojcvsouwugatnmve)
 */
export function extractProjectRef(url: string): string {
  if (!url || typeof url !== 'string') return '';
  try {
    const clean = cleanSupabaseUrl(url);
    const parsed = new URL(clean.startsWith('http') ? clean : `https://${clean}`);
    const host = parsed.hostname;
    const parts = host.split('.');
    if (parts.length > 0 && parts[0]) return parts[0];
  } catch {
    const match = url.match(/https?:\/\/([a-zA-Z0-9_-]+)\.supabase\.co/i);
    if (match) return match[1];
  }
  return url;
}

/**
 * Kiểm tra xem Profile Vận Hành hiện tại có bị lệch so với Biến Môi Trường (.env.local) không
 */
export function isProfileOutOfSyncWithEnv(): {
  isOutOfSync: boolean;
  envUrl: string;
  activeUrl: string;
} {
  const envUrl = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_PRODUCTION_URL);
  const activeProfile = getActiveProfile();
  const activeUrl = cleanSupabaseUrl(activeProfile?.url || '');
  return {
    isOutOfSync: Boolean(envUrl && activeUrl && envUrl !== activeUrl),
    envUrl,
    activeUrl,
  };
}

/**
 * Đồng bộ ngay Profile Chính về theo đúng Biến Môi Trường (.env.local)
 */
export function syncProductionProfileWithEnv(): MultiSqlConfig {
  const envUrl = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_PRODUCTION_URL);
  const envKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_PRODUCTION_KEY
  ).trim();

  return saveDatabaseProfile(
    {
      id: 'production',
      name: 'CSDL Chính (Vận Hành)',
      description: 'Cơ sở dữ liệu đám mây chính thức của cửa hàng bánh (fhiuojcvsouwugatnmve). Dùng cho bán hàng thật, tính tiền và sổ sách kế toán.',
      url: envUrl,
      anonKey: envKey,
      isDefault: true,
    },
    'fetch_from_new'
  );
}

export interface DatabaseLiveStats {
  productsCount: number;
  ordersCount: number;
  recipesCount: number;
  ingredientsCount: number;
  recipeItemsCount: number;
  orderItemsCount: number;
  latencyMs: number;
  projectRef: string;
  isEmpty: boolean;
  isConnected: boolean;
  error?: string;
}

/**
 * Đo kiểm tra trạng thái và đếm số lượng bản ghi thực tế từ CSDL Supabase
 */
export async function fetchDatabaseLiveStats(
  url: string,
  anonKey: string
): Promise<DatabaseLiveStats> {
  const cleanUrl = cleanSupabaseUrl(url);
  const cleanKey = (anonKey || '').trim();
  const projectRef = extractProjectRef(cleanUrl);

  if (!cleanUrl || !cleanKey) {
    return {
      productsCount: 0,
      ordersCount: 0,
      recipesCount: 0,
      ingredientsCount: 0,
      recipeItemsCount: 0,
      orderItemsCount: 0,
      latencyMs: 0,
      projectRef: projectRef || 'Chưa cấu hình',
      isEmpty: true,
      isConnected: false,
      error: 'Chưa nhập URL hoặc Khóa API Supabase',
    };
  }

  const startTime = performance.now();
  try {
    const testClient = createClient(cleanUrl, cleanKey, {
      auth: { persistSession: false },
    });

    const [prodRes, orderRes, recRes, ingRes, rItemRes, oItemRes] = await Promise.all([
      testClient.from('products').select('*', { count: 'exact', head: true }),
      testClient.from('orders').select('*', { count: 'exact', head: true }),
      testClient.from('recipes').select('*', { count: 'exact', head: true }),
      testClient.from('ingredients').select('*', { count: 'exact', head: true }),
      testClient.from('recipe_items').select('*', { count: 'exact', head: true }),
      testClient.from('order_items').select('*', { count: 'exact', head: true }),
    ]);

    const latencyMs = Math.round(performance.now() - startTime);

    const hasAnyError = Boolean(
      prodRes.error || orderRes.error || recRes.error || ingRes.error
    );
    const errorMsg =
      prodRes.error?.message ||
      orderRes.error?.message ||
      recRes.error?.message ||
      ingRes.error?.message;

    const productsCount = prodRes.count ?? 0;
    const ordersCount = orderRes.count ?? 0;
    const recipesCount = recRes.count ?? 0;
    const ingredientsCount = ingRes.count ?? 0;
    const recipeItemsCount = rItemRes.count ?? 0;
    const orderItemsCount = oItemRes.count ?? 0;

    const isEmpty =
      productsCount === 0 && ordersCount === 0 && recipesCount === 0 && ingredientsCount === 0;

    return {
      productsCount,
      ordersCount,
      recipesCount,
      ingredientsCount,
      recipeItemsCount,
      orderItemsCount,
      latencyMs,
      projectRef,
      isEmpty,
      isConnected: !hasAnyError,
      error: errorMsg,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      productsCount: 0,
      ordersCount: 0,
      recipesCount: 0,
      ingredientsCount: 0,
      recipeItemsCount: 0,
      orderItemsCount: 0,
      latencyMs,
      projectRef,
      isEmpty: true,
      isConnected: false,
      error: err?.message || 'Không thể kết nối đến máy chủ Supabase',
    };
  }
}

export interface CloneCloudProgressCallback {
  (step: string, percentage: number): void;
}

/**
 * 1-Click Sao chép toàn bộ CSDL đám mây giữa 2 Supabase Project bất kỳ
 * Tự động loại bỏ các Generated Columns (food_cost_pct, line_total, line_cost) để chống lỗi Postgres 428C9.
 */
export async function cloneCloudDatabaseTables(params: {
  sourceUrl: string;
  sourceKey: string;
  targetUrl: string;
  targetKey: string;
  onProgress?: CloneCloudProgressCallback;
}): Promise<{
  success: boolean;
  stats: {
    ingredients: number;
    recipes: number;
    recipe_items: number;
    products: number;
    orders: number;
    order_items: number;
  };
  error?: string;
}> {
  const { sourceUrl, sourceKey, targetUrl, targetKey, onProgress } = params;
  const cleanSourceUrl = cleanSupabaseUrl(sourceUrl);
  const cleanSourceKey = sourceKey.trim();
  const cleanTargetUrl = cleanSupabaseUrl(targetUrl);
  const cleanTargetKey = targetKey.trim();

  const emptyStats = {
    ingredients: 0,
    recipes: 0,
    recipe_items: 0,
    products: 0,
    orders: 0,
    order_items: 0,
  };

  if (!cleanSourceUrl || !cleanSourceKey) {
    return { success: false, stats: emptyStats, error: 'Thiếu thông tin CSDL Nguồn (Source)' };
  }
  if (!cleanTargetUrl || !cleanTargetKey) {
    return { success: false, stats: emptyStats, error: 'Thiếu thông tin CSDL Đích (Target)' };
  }
  if (cleanSourceUrl === cleanTargetUrl) {
    return { success: false, stats: emptyStats, error: 'CSDL Nguồn và CSDL Đích không được trùng nhau' };
  }

  const stats = { ...emptyStats };

  try {
    const s1 = createClient(cleanSourceUrl, cleanSourceKey, { auth: { persistSession: false } });
    const s2 = createClient(cleanTargetUrl, cleanTargetKey, { auth: { persistSession: false } });

    // 1. INGREDIENTS
    onProgress?.('Đang sao chép Nguyên liệu (Ingredients)...', 10);
    const { data: ings, error: errIngs } = await s1.from('ingredients').select('*');
    if (errIngs) throw new Error(`Lỗi đọc nguyên liệu từ CSDL nguồn: ${errIngs.message}`);
    if (ings && ings.length > 0) {
      const cleanIngs = ings.map((i: any) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        category: i.category,
        stock_qty: i.stock_qty,
        reorder_level: i.reorder_level,
        avg_cost: i.avg_cost,
        wastage_pct: i.wastage_pct,
        is_active: i.is_active,
        created_at: i.created_at,
        updated_at: i.updated_at,
      }));
      const { error: errI2 } = await s2.from('ingredients').upsert(cleanIngs, { onConflict: 'id' });
      if (errI2) throw new Error(`Lỗi ghi nguyên liệu sang CSDL đích: ${errI2.message}`);
      stats.ingredients = cleanIngs.length;
    }

    // 2. RECIPES
    onProgress?.('Đang sao chép Công thức BOM & Cấu hình (Recipes)...', 25);
    const { data: recs, error: errRecs } = await s1.from('recipes').select('*');
    if (errRecs) throw new Error(`Lỗi đọc công thức từ CSDL nguồn: ${errRecs.message}`);
    if (recs && recs.length > 0) {
      const cleanRecs = recs.map((r: any) => ({
        id: r.id,
        name: r.name,
        product_id: r.product_id,
        yield_qty: r.yield_qty,
        yield_unit: r.yield_unit,
        total_material_cost: r.total_material_cost,
        cost_per_unit: r.cost_per_unit,
        notes: r.notes,
        is_active: r.is_active,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      const { error: errR2 } = await s2.from('recipes').upsert(cleanRecs, { onConflict: 'id' });
      if (errR2) throw new Error(`Lỗi ghi công thức sang CSDL đích: ${errR2.message}`);
      stats.recipes = cleanRecs.length;
    }

    // 3. RECIPE_ITEMS
    onProgress?.('Đang sao chép Định mức chi tiết BOM (Recipe Items)...', 40);
    const { data: rItems, error: errRItems } = await s1.from('recipe_items').select('*');
    if (errRItems) throw new Error(`Lỗi đọc định mức BOM từ CSDL nguồn: ${errRItems.message}`);
    if (rItems && rItems.length > 0) {
      const cleanRItems = rItems.map((ri: any) => ({
        id: ri.id,
        recipe_id: ri.recipe_id,
        ingredient_id: ri.ingredient_id,
        quantity: ri.quantity,
        unit: ri.unit,
        line_cost: ri.line_cost,
        created_at: ri.created_at,
      }));
      const { error: errRI2 } = await s2.from('recipe_items').upsert(cleanRItems, { onConflict: 'id' });
      if (errRI2) throw new Error(`Lỗi ghi định mức BOM sang CSDL đích: ${errRI2.message}`);
      stats.recipe_items = cleanRItems.length;
    }

    // 4. PRODUCTS (Omit food_cost_pct generated column)
    onProgress?.('Đang sao chép Danh mục sản phẩm bánh (Products)...', 60);
    const { data: prods, error: errProds } = await s1.from('products').select('*');
    if (errProds) throw new Error(`Lỗi đọc sản phẩm từ CSDL nguồn: ${errProds.message}`);
    if (prods && prods.length > 0) {
      const cleanProds = prods.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        image_url: p.image_url,
        base_cost_price: p.base_cost_price,
        selling_price: p.selling_price,
        is_active: p.is_active,
        is_preorder_only: p.is_preorder_only,
        recipe_id: p.recipe_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));
      const { error: errP2 } = await s2.from('products').upsert(cleanProds, { onConflict: 'id' });
      if (errP2) throw new Error(`Lỗi ghi sản phẩm sang CSDL đích: ${errP2.message}`);
      stats.products = cleanProds.length;
    }

    // 5. ORDERS (Batch 50)
    onProgress?.('Đang sao chép Lịch sử đơn hàng (Orders)...', 75);
    const { data: orders, error: errOrders } = await s1.from('orders').select('*');
    if (errOrders) throw new Error(`Lỗi đọc đơn hàng từ CSDL nguồn: ${errOrders.message}`);
    if (orders && orders.length > 0) {
      const cleanOrders = orders.map((o: any) => ({
        id: o.id,
        local_id: o.local_id,
        order_number: o.order_number,
        created_by: o.created_by,
        store_id: o.store_id,
        order_type: o.order_type,
        status: o.status,
        preorder_pickup_at: o.preorder_pickup_at,
        subtotal: o.subtotal,
        discount_amount: o.discount_amount,
        discount_pct: o.discount_pct,
        total_amount: o.total_amount,
        total_cogs: o.total_cogs,
        notes: o.notes,
        shift_id: o.shift_id,
        sync_status: o.sync_status,
        created_at: o.created_at,
        updated_at: o.updated_at,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        cake_message: o.cake_message,
      }));
      for (let i = 0; i < cleanOrders.length; i += 50) {
        const chunk = cleanOrders.slice(i, i + 50);
        const { error: errO2 } = await s2.from('orders').upsert(chunk, { onConflict: 'id' });
        if (errO2) throw new Error(`Lỗi ghi đơn hàng (lô ${i + 1}-${i + chunk.length}): ${errO2.message}`);
      }
      stats.orders = cleanOrders.length;
    }

    // 6. ORDER_ITEMS (Batch 50, Omit line_total and line_cost)
    onProgress?.('Đang sao chép Chi tiết món ăn đơn hàng (Order Items)...', 90);
    const { data: oItems, error: errOItems } = await s1.from('order_items').select('*');
    if (errOItems) throw new Error(`Lỗi đọc chi tiết đơn hàng từ CSDL nguồn: ${errOItems.message}`);
    if (oItems && oItems.length > 0) {
      const cleanOItems = oItems.map((oi: any) => ({
        id: oi.id,
        order_id: oi.order_id,
        product_id: oi.product_id,
        variant_id: oi.variant_id,
        product_name_snapshot: oi.product_name_snapshot,
        quantity: oi.quantity,
        unit_price: oi.unit_price,
        unit_cost: oi.unit_cost,
        notes: oi.notes,
      }));
      for (let i = 0; i < cleanOItems.length; i += 50) {
        const chunk = cleanOItems.slice(i, i + 50);
        const { error: errOI2 } = await s2.from('order_items').upsert(chunk, { onConflict: 'id' });
        if (errOI2) throw new Error(`Lỗi ghi chi tiết món (lô ${i + 1}-${i + chunk.length}): ${errOI2.message}`);
      }
      stats.order_items = cleanOItems.length;
    }

    onProgress?.('Hoàn tất sao chép 100% dữ liệu sang CSDL đích!', 100);
    return { success: true, stats };
  } catch (err: any) {
    return { success: false, stats, error: err?.message || 'Có lỗi xảy ra trong quá trình đồng bộ CSDL' };
  }
}

