// src/lib/utils/sqlModeManager.ts
// Quản lý chế độ Cơ Sở Dữ Liệu: Online (Supabase Cloud) vs Local (Thư mục máy tính Cục bộ)
// Đảm bảo dữ liệu 2 chế độ hoàn toàn tách biệt, không gây xung đột hoặc đè nhầm dữ liệu.

export type DatabaseMode = 'online' | 'local';

export interface SqlModeConfig {
  mode: DatabaseMode;
  localFolderName: string;
  localFolderPath?: string;
  autoSyncToFolder: boolean;
  lastLocalSyncAt?: string;
  lastOnlineSyncAt?: string;
}

const STORAGE_KEY_MODE_CONFIG = 'bakery_sql_mode_config';
export const DB_MODE_CHANGED_EVENT = 'bakery_db_mode_changed';

const SNAPSHOT_KEY_ONLINE = 'bakery_snapshot_online';
const SNAPSHOT_KEY_LOCAL = 'bakery_snapshot_local';

const BAKERY_DATA_KEYS = [
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
];

const DEFAULT_CONFIG: SqlModeConfig = {
  mode: 'online',
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
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
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
  const updated: SqlModeConfig = { ...current, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY_MODE_CONFIG, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(DB_MODE_CHANGED_EVENT, { detail: updated }));
  } catch (e) {
    console.error('Lỗi khi lưu cấu hình sqlMode:', e);
  }
  return updated;
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
      localStorage.setItem(SNAPSHOT_KEY_LOCAL, JSON.stringify(currentSnapshot));
    }
  } catch (e) {
    console.warn('Lỗi khi lưu snapshot chế độ hiện tại:', e);
  }

  // 2. Nạp dữ liệu của chế độ đích
  try {
    const targetKey = targetMode === 'online' ? SNAPSHOT_KEY_ONLINE : SNAPSHOT_KEY_LOCAL;
    const rawTarget = localStorage.getItem(targetKey);
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
    localStorage.setItem(SNAPSHOT_KEY_LOCAL, JSON.stringify(onlineData));
    if (currentMode === 'local') {
      applyDataSnapshot(onlineData);
    }
  }
}
