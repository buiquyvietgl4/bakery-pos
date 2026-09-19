// src/lib/utils/sqlModeManager.ts
// Quản lý chế độ Cơ Sở Dữ Liệu: Online (Supabase Cloud) vs Local (Thư mục máy tính Cục bộ)
// Hỗ trợ cơ chế 2 CSDL Local: 1 Chính (Vận hành) và 1 Test (Thử nghiệm) với thư mục và két lưu trữ độc lập.

export type DatabaseMode = 'online' | 'local';

export type LocalSqlEnvironmentId = 'production' | 'testing';

export interface LocalSqlEnvironmentConfig {
  id: LocalSqlEnvironmentId;
  name: string;
  description: string;
  folderName?: string;
  folderPath?: string;
  lastSyncAt?: string;
}

export interface SqlModeConfig {
  mode: DatabaseMode;
  activeLocalEnv: LocalSqlEnvironmentId;
  localEnvs: Record<LocalSqlEnvironmentId, LocalSqlEnvironmentConfig>;
  localFolderName: string;
  localFolderPath?: string;
  autoSyncToFolder: boolean;
  lastLocalSyncAt?: string;
  lastOnlineSyncAt?: string;
}

export const STORAGE_KEY_MODE_CONFIG = 'bakery_sql_mode_config';
export const DB_MODE_CHANGED_EVENT = 'bakery_db_mode_changed';
export const EVENT_LOCAL_SQL_ENV_CHANGED = 'bakery_local_sql_env_changed';

export const SNAPSHOT_KEY_ONLINE = 'bakery_snapshot_online';
export const SNAPSHOT_KEY_LOCAL = 'bakery_snapshot_local';
export const VAULT_KEY_LOCAL_PRODUCTION = 'bakery_vault_local_production';
export const VAULT_KEY_LOCAL_TESTING = 'bakery_vault_local_testing';

export const BAKERY_DATA_KEYS = [
  'bakery_products',
  'bakery_products_custom',
  'bakery_stocks',
  'bakery_orders',
  'bakery_preorders',
  'bakery_recipes',
  'bakery_ingredients',
  'bakery_expenses',
  'bakery_pos_expenses',
  'bakery_cashflow',
  'bakery_spoilage',
  'bakery_spoilage_logs',
  'bakery_stock_adjustments',
  'bakery_stock_adjustment_logs',
  'bakery_material_transactions',
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
];

export const STORAGE_KEYS_BACKUP = BAKERY_DATA_KEYS;

const DEFAULT_LOCAL_ENVS: Record<LocalSqlEnvironmentId, LocalSqlEnvironmentConfig> = {
  production: {
    id: 'production',
    name: 'Local SQL Chính (Vận Hành)',
    description: 'Dữ liệu bán hàng, công thức và sổ sách kế toán thực tế của tiệm bánh.',
    folderName: '',
    folderPath: '',
  },
  testing: {
    id: 'testing',
    name: 'Local SQL Thử Nghiệm (Test)',
    description: 'Môi trường test độc lập để thử nghiệm tính năng, tạo đơn ảo mà không ảnh hưởng CSDL chính.',
    folderName: '',
    folderPath: '',
  },
};

const DEFAULT_CONFIG: SqlModeConfig = {
  mode: 'online',
  activeLocalEnv: 'production',
  localEnvs: DEFAULT_LOCAL_ENVS,
  localFolderName: '',
  localFolderPath: '',
  autoSyncToFolder: true,
};

/**
 * Lấy cấu hình chế độ CSDL hiện tại
 */
export function getSqlModeConfig(): SqlModeConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MODE_CONFIG);
    if (raw) {
      const parsed = JSON.parse(raw);
      const activeEnv: LocalSqlEnvironmentId = parsed.activeLocalEnv || 'production';
      const localEnvs: Record<LocalSqlEnvironmentId, LocalSqlEnvironmentConfig> = {
        production: {
          ...DEFAULT_LOCAL_ENVS.production,
          ...(parsed.localEnvs?.production || {}),
        },
        testing: {
          ...DEFAULT_LOCAL_ENVS.testing,
          ...(parsed.localEnvs?.testing || {}),
        },
      };

      // Tự động gán fallback từ cấu hình cũ nếu có
      if (parsed.localFolderPath && !localEnvs.production.folderPath) {
        localEnvs.production.folderPath = parsed.localFolderPath;
        localEnvs.production.folderName = parsed.localFolderName || '';
      }

      const currentEnvConfig = localEnvs[activeEnv] || localEnvs.production;

      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        activeLocalEnv: activeEnv,
        localEnvs,
        localFolderName: currentEnvConfig.folderName || '',
        localFolderPath: currentEnvConfig.folderPath || '',
        lastLocalSyncAt: currentEnvConfig.lastSyncAt || parsed.lastLocalSyncAt,
      };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

/**
 * Lưu cấu hình chế độ CSDL
 */
export function saveSqlModeConfig(patch: Partial<SqlModeConfig>): SqlModeConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  const current = getSqlModeConfig();
  const updated: SqlModeConfig = {
    ...current,
    ...patch,
  };

  // Đồng bộ lại các trường tương thích ngược
  const activeEnv = updated.activeLocalEnv || 'production';
  if (updated.localEnvs && updated.localEnvs[activeEnv]) {
    if (patch.localFolderPath !== undefined) {
      updated.localEnvs[activeEnv].folderPath = patch.localFolderPath;
    }
    if (patch.localFolderName !== undefined) {
      updated.localEnvs[activeEnv].folderName = patch.localFolderName;
    }
    updated.localFolderName = updated.localEnvs[activeEnv].folderName || '';
    updated.localFolderPath = updated.localEnvs[activeEnv].folderPath || '';
    if (updated.localEnvs[activeEnv].lastSyncAt) {
      updated.lastLocalSyncAt = updated.localEnvs[activeEnv].lastSyncAt;
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY_MODE_CONFIG, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(DB_MODE_CHANGED_EVENT, { detail: updated }));
    window.dispatchEvent(new CustomEvent(EVENT_LOCAL_SQL_ENV_CHANGED, { detail: updated }));
  } catch (e) {
    console.error('Lỗi khi lưu cấu hình sqlMode:', e);
  }
  return updated;
}

/**
 * Lấy môi trường Local SQL đang kích hoạt
 */
export function getActiveLocalEnv(): LocalSqlEnvironmentId {
  return getSqlModeConfig().activeLocalEnv || 'production';
}

/**
 * Lấy chi tiết cấu hình của môi trường Local đang kích hoạt
 */
export function getActiveLocalEnvConfig(): LocalSqlEnvironmentConfig {
  const cfg = getSqlModeConfig();
  return cfg.localEnvs[cfg.activeLocalEnv] || cfg.localEnvs.production;
}

/**
 * Cập nhật cấu hình riêng của một môi trường Local SQL (chính hoặc test)
 */
export function saveLocalEnvConfig(envId: LocalSqlEnvironmentId, patch: Partial<LocalSqlEnvironmentConfig>): SqlModeConfig {
  const cfg = getSqlModeConfig();
  const updatedEnvs = {
    ...cfg.localEnvs,
    [envId]: {
      ...cfg.localEnvs[envId],
      ...patch,
    },
  };
  return saveSqlModeConfig({ localEnvs: updatedEnvs });
}

/**
 * Kiểm tra nhanh hệ thống đang ở chế độ Local hay Online
 */
export function isLocalMode(): boolean {
  return getSqlModeConfig().mode === 'local';
}

export function isOnlineMode(): boolean {
  return getSqlModeConfig().mode === 'online';
}

/**
 * Kiểm tra xem có đang ở chế độ Local Test không
 */
export function isLocalTestMode(): boolean {
  const cfg = getSqlModeConfig();
  return cfg.mode === 'local' && cfg.activeLocalEnv === 'testing';
}

/**
 * Thu thập bản chụp dữ liệu hiện tại từ LocalStorage
 */
export function captureDataSnapshot(): Record<string, any> {
  const snapshot: Record<string, any> = {};
  if (typeof window === 'undefined') return snapshot;
  try {
    for (const key of BAKERY_DATA_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        snapshot[key] = val;
      }
    }
  } catch {}
  return snapshot;
}

/**
 * Áp dụng một bản chụp dữ liệu vào LocalStorage
 */
export function applyDataSnapshot(snapshot: Record<string, any>): void {
  if (typeof window === 'undefined' || !snapshot) return;
  try {
    for (const key of BAKERY_DATA_KEYS) {
      if (snapshot[key] !== undefined) {
        localStorage.setItem(key, snapshot[key]);
      } else {
        localStorage.removeItem(key);
      }
    }
    // Phát các sự kiện cập nhật để các component làm mới
    window.dispatchEvent(new Event('bakery_products_updated'));
    window.dispatchEvent(new Event('bakery_stocks_updated'));
    window.dispatchEvent(new Event('bakery_orders_updated'));
    window.dispatchEvent(new Event('bakery_recipes_updated'));
    window.dispatchEvent(new Event('bakery_expenses_updated'));
    window.dispatchEvent(new Event('bakery_cashflow_updated'));
    window.dispatchEvent(new Event('bakery_spoilage_updated'));
    window.dispatchEvent(new Event('bakery_stock_adjustments_updated'));
    window.dispatchEvent(new Event('bakery_closing_updated'));
  } catch (e) {
    console.error('Lỗi khi nạp snapshot dữ liệu:', e);
  }
}

/**
 * Lấy khóa két an toàn (Vault) tương ứng với môi trường Local
 */
export function getLocalVaultKey(env: LocalSqlEnvironmentId): string {
  return env === 'testing' ? VAULT_KEY_LOCAL_TESTING : VAULT_KEY_LOCAL_PRODUCTION;
}

/**
 * Chuyển đổi giữa 2 môi trường Local SQL (Chính <-> Test)
 * Tự động cất dữ liệu vào Vault riêng và trích xuất dữ liệu của môi trường đích
 */
export function switchLocalEnvironment(
  targetEnv: LocalSqlEnvironmentId,
  action: 'clone_from_current' | 'clean_slate' | 'load_vault' = 'load_vault'
): SqlModeConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  const currentConfig = getSqlModeConfig();
  const currentEnv = currentConfig.activeLocalEnv;

  // 1. Sao lưu dữ liệu hiện tại vào Vault của môi trường hiện tại
  const currentSnapshot = captureDataSnapshot();
  const currentVaultKey = getLocalVaultKey(currentEnv);
  try {
    localStorage.setItem(currentVaultKey, JSON.stringify(currentSnapshot));
    // Tương thích ngược: nếu đang là production thì lưu cả vào SNAPSHOT_KEY_LOCAL
    if (currentEnv === 'production') {
      localStorage.setItem(SNAPSHOT_KEY_LOCAL, JSON.stringify(currentSnapshot));
    }
  } catch (e) {
    console.warn('Lỗi khi lưu vault local hiện tại:', e);
  }

  // 2. Xử lý nạp dữ liệu cho môi trường đích
  const targetVaultKey = getLocalVaultKey(targetEnv);

  if (action === 'clone_from_current') {
    // Sao chép nguyên trạng dữ liệu hiện tại sang môi trường mới
    try {
      localStorage.setItem(targetVaultKey, JSON.stringify(currentSnapshot));
    } catch (e) {
      console.warn('Lỗi khi clone snapshot sang target:', e);
    }
    applyDataSnapshot(currentSnapshot);
  } else if (action === 'clean_slate') {
    // Tạo môi trường trắng tinh (chỉ giữ branding cơ bản)
    const branding = localStorage.getItem('bakery_store_branding') || null;
    const cleanSnapshot: Record<string, any> = {};
    if (branding) cleanSnapshot['bakery_store_branding'] = branding;
    try {
      localStorage.setItem(targetVaultKey, JSON.stringify(cleanSnapshot));
    } catch {}
    applyDataSnapshot(cleanSnapshot);
  } else {
    // Nạp từ Vault đích
    try {
      let rawTarget = localStorage.getItem(targetVaultKey);
      // Fallback nếu target là production mà chưa có vault_production thì lấy SNAPSHOT_KEY_LOCAL
      if (!rawTarget && targetEnv === 'production') {
        rawTarget = localStorage.getItem(SNAPSHOT_KEY_LOCAL);
      }

      if (rawTarget) {
        const parsedTarget = JSON.parse(rawTarget);
        applyDataSnapshot(parsedTarget);
      } else if (targetEnv === 'testing') {
        // Lần đầu vào test mà chưa có gì: Tự động clone dữ liệu chính sang để có đồ test ngay
        localStorage.setItem(targetVaultKey, JSON.stringify(currentSnapshot));
      }
    } catch (e) {
      console.warn('Lỗi khi nạp vault target:', e);
    }
  }

  // 3. Cập nhật cấu hình
  const updated = saveSqlModeConfig({
    activeLocalEnv: targetEnv,
  });

  // Thông báo tới máy chủ nếu đang kết nối API
  try {
    fetch('/api/local-sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set_active_env', env: targetEnv }),
    }).catch(() => {});
  } catch {}

  return updated;
}

/**
 * Sao chép toàn bộ dữ liệu từ Local Chính sang Local Test (1-Click Clone)
 */
export function copyLocalProductionToTesting(): { success: boolean; message?: string } {
  if (typeof window === 'undefined') return { success: false, message: 'No window' };
  const currentConfig = getSqlModeConfig();
  let prodSnapshot: any = null;

  if (currentConfig.activeLocalEnv === 'production') {
    prodSnapshot = captureDataSnapshot();
  } else {
    const raw = localStorage.getItem(VAULT_KEY_LOCAL_PRODUCTION) || localStorage.getItem(SNAPSHOT_KEY_LOCAL);
    if (raw) {
      try {
        prodSnapshot = JSON.parse(raw);
      } catch {}
    }
  }

  if (prodSnapshot) {
    try {
      localStorage.setItem(VAULT_KEY_LOCAL_TESTING, JSON.stringify(prodSnapshot));
      if (currentConfig.activeLocalEnv === 'testing') {
        applyDataSnapshot(prodSnapshot);
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
  return { success: false, message: 'Không tìm thấy dữ liệu CSDL Chính để sao chép' };
}

/**
 * Chuyển đổi an toàn giữa 2 chế độ Online và Local
 * Tự động cô lập và hoán đổi snapshot dữ liệu để không bị lẫn lộn
 */
export function switchDatabaseMode(targetMode: DatabaseMode): SqlModeConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  const currentConfig = getSqlModeConfig();
  if (currentConfig.mode === targetMode) return currentConfig;

  // 1. Sao lưu dữ liệu của chế độ hiện tại vào Snapshot tương ứng
  const currentSnapshot = captureDataSnapshot();
  try {
    if (currentConfig.mode === 'online') {
      localStorage.setItem(SNAPSHOT_KEY_ONLINE, JSON.stringify(currentSnapshot));
    } else {
      const activeEnv = currentConfig.activeLocalEnv || 'production';
      localStorage.setItem(getLocalVaultKey(activeEnv), JSON.stringify(currentSnapshot));
      localStorage.setItem(SNAPSHOT_KEY_LOCAL, JSON.stringify(currentSnapshot));
    }
  } catch (e) {
    console.warn('Lỗi khi lưu snapshot chế độ hiện tại:', e);
  }

  // 2. Nạp dữ liệu của chế độ đích
  try {
    let targetKey = SNAPSHOT_KEY_ONLINE;
    if (targetMode === 'local') {
      const activeEnv = currentConfig.activeLocalEnv || 'production';
      targetKey = getLocalVaultKey(activeEnv);
    }

    let rawTarget = localStorage.getItem(targetKey);
    if (!rawTarget && targetMode === 'local') {
      rawTarget = localStorage.getItem(SNAPSHOT_KEY_LOCAL);
    }

    if (rawTarget) {
      const parsedTarget = JSON.parse(rawTarget);
      applyDataSnapshot(parsedTarget);
    }
  } catch (e) {
    console.warn('Lỗi khi nạp snapshot chế độ đích:', e);
  }

  // 3. Cập nhật và lưu config chế độ mới
  return saveSqlModeConfig({ mode: targetMode });
}

/**
 * Sao chép (Clone) snapshot từ Online sang Local
 * Dùng khi người dùng chủ động muốn lấy dữ liệu Online nạp vào môi trường Local
 */
export function copyOnlineSnapshotToLocal(): void {
  if (typeof window === 'undefined') return;
  const currentMode = getSqlModeConfig().mode;
  let onlineData: any = null;

  if (currentMode === 'online') {
    onlineData = captureDataSnapshot();
  } else {
    const raw = localStorage.getItem(SNAPSHOT_KEY_ONLINE);
    if (raw) onlineData = JSON.parse(raw);
  }

  if (onlineData) {
    const activeEnv = getActiveLocalEnv();
    localStorage.setItem(getLocalVaultKey(activeEnv), JSON.stringify(onlineData));
    localStorage.setItem(SNAPSHOT_KEY_LOCAL, JSON.stringify(onlineData));
    if (currentMode === 'local') {
      applyDataSnapshot(onlineData);
    }
  }
}
