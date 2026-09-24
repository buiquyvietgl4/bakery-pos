// src/lib/utils/systemResetManager.ts
// Điều phối cơ chế Reset Toàn Bộ Dữ Liệu & Zero-Resurrection Protocol
// Ngăn chặn 100% rủi ro máy khác đẩy ngược dữ liệu cũ lên CSDL sau khi reset.

import { db } from '@/lib/db/dexie';
import { supabase } from '@/lib/supabase/client';
import { broadcastSystemGlobalWipe } from '@/lib/supabase/realtimeSync';

export type ResetMode = 'operational' | 'full';

export const STORAGE_KEY_SYSTEM_RESET_EPOCH = 'bakery_system_reset_epoch';
export const DB_ROW_RESET_EPOCH_ID = '00000000-0000-0000-0000-000000000099';
export const DB_ROW_RESET_EPOCH_NAME = 'SYSTEM_RESET_EPOCH';

// Khóa chỉ dành cho dữ liệu bán hàng & vận hành (giữ lại Menu, Công thức, Nguyên liệu, Cài đặt)
export const OPERATIONAL_DATA_KEYS = [
  'bakery_orders',
  'bakery_preorders',
  'bakery_expenses',
  'bakery_cashflow',
  'bakery_spoilage',
  'bakery_spoilage_logs',
  'bakery_stock_adjustments',
  'bakery_stock_adjustment_logs',
  'bakery_accounting_closings',
  'bakery_closing_records',
  'bakery_pending_transfers',
  'bakery_current_shift',
  'bakery_shift_history',
  'bakery_notification_history',
  'bakery_deleted_order_keys',
  'bakery_kds_status_locks',
  'bakery_urgent_alerts',
  'bakery_recent_completed_orders',
];

/**
 * Lấy mốc thời gian Reset Hệ Thống lưu tại trình duyệt cục bộ
 */
export function getLocalResetEpoch(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SYSTEM_RESET_EPOCH);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Lưu mốc thời gian Reset Hệ Thống vào trình duyệt cục bộ
 */
export function setLocalResetEpoch(epoch: number): void {
  if (typeof window === 'undefined' || !epoch) return;
  try {
    localStorage.setItem(STORAGE_KEY_SYSTEM_RESET_EPOCH, String(epoch));
  } catch {}
}

/**
 * PUSH GUARD: Kiểm tra xem CSDL Cloud/Server có đợt Reset Hệ Thống mới hơn máy này hay không.
 * Nếu phát hiện CSDL đã bị reset lúc máy này vắng mặt/offline:
 * -> LẬP TỨC CHẶN ĐỨNG TOÀN BỘ TIẾN TRÌNH PUSH (ABORT SYNC)
 * -> Tự động xóa sạch bộ nhớ cũ trên máy này để không làm nhiễm bẩn CSDL
 */
export async function checkServerResetEpoch(): Promise<{ shouldAbort: boolean; serverEpoch: number }> {
  if (typeof window === 'undefined') return { shouldAbort: false, serverEpoch: 0 };

  // Nếu máy đang trong tiến trình xóa thì chặn mọi lệnh sync khác
  if ((window as any).__IS_SYSTEM_WIPING__) {
    return { shouldAbort: true, serverEpoch: Date.now() };
  }

  const localEpoch = getLocalResetEpoch();

  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { shouldAbort: false, serverEpoch: localEpoch };
    }

    // Đọc epoch từ CSDL Supabase
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_RESET_EPOCH_ID},name.eq.${DB_ROW_RESET_EPOCH_NAME}`)
      .maybeSingle();

    if (error || !data || !data.notes) {
      return { shouldAbort: false, serverEpoch: localEpoch };
    }

    const serverEpoch = parseInt(data.notes, 10) || 0;
    if (serverEpoch > localEpoch) {
      console.warn(
        `🚨 [ZERO-RESURRECTION GUARD] Phát hiện CSDL đã được Reset Hệ Thống tại mốc ${serverEpoch} (Máy cục bộ đang ở mốc cũ ${localEpoch})! LẬP TỨC HỦY TIẾN TRÌNH ĐẨY DỮ LIỆU CŨ VÀ LÀM SẠCH BỘ NHỚ TRÌNH DUYỆT!`
      );

      // Cập nhật epoch ngay để không lặp lại
      setLocalResetEpoch(serverEpoch);

      // Tự động xóa sạch bộ nhớ cũ trên máy này (Chế độ Full hoặc Operational)
      await clearAllClientStorage('operational');

      // Báo sự kiện làm mới giao diện
      window.dispatchEvent(new Event('bakery_orders_updated'));
      window.dispatchEvent(new CustomEvent('bakery_system_wiped', { detail: { epoch: serverEpoch, mode: 'operational' } }));

      return { shouldAbort: true, serverEpoch };
    }

    return { shouldAbort: false, serverEpoch };
  } catch (err) {
    console.warn('Lỗi kiểm tra checkServerResetEpoch:', err);
    return { shouldAbort: false, serverEpoch: localEpoch };
  }
}

/**
 * Xóa sạch sẽ toàn bộ các vùng lưu trữ trình duyệt (localStorage, sessionStorage, IndexedDB Dexie, CacheStorage)
 */
export async function clearAllClientStorage(mode: ResetMode = 'operational'): Promise<void> {
  if (typeof window === 'undefined') return;

  // Đặt cờ toàn cục ngăn chặn mọi tiến trình nền gửi request
  (window as any).__IS_SYSTEM_WIPING__ = true;

  try {
    // 1. Dọn dẹp Dexie IndexedDB
    try {
      if (db.orders) await db.orders.clear();
      if (db.syncQueue) await db.syncQueue.clear();
      if (mode === 'full' && db.products) {
        await db.products.clear();
      }
    } catch (dexieErr) {
      console.warn('Lỗi dọn Dexie:', dexieErr);
    }

    // 2. Dọn dẹp sessionStorage
    try {
      sessionStorage.clear();
    } catch {}

    // 3. Dọn dẹp localStorage
    try {
      if (mode === 'operational') {
        for (const key of OPERATIONAL_DATA_KEYS) {
          localStorage.removeItem(key);
        }
      } else {
        // Mode Full: Xóa sạch toàn bộ, giữ lại cấu hình kết nối DB nếu có
        const multiSqlConfig = localStorage.getItem('bakery_multi_sql_config');
        localStorage.clear();
        if (multiSqlConfig) {
          localStorage.setItem('bakery_multi_sql_config', multiSqlConfig);
        }
      }
    } catch (lsErr) {
      console.warn('Lỗi dọn localStorage:', lsErr);
    }

    // 4. Dọn dẹp CacheStorage (nếu có service worker cache)
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }
    } catch {}
  } finally {
    // Bỏ cờ sau khi hoàn thành
    setTimeout(() => {
      (window as any).__IS_SYSTEM_WIPING__ = false;
    }, 1500);
  }
}

/**
 * Tạo và tải về file sao lưu dự phòng JSON trước khi xóa
 */
export async function downloadPreResetBackup(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const backupPayload: Record<string, any> = {
      app: 'Bakery ERP - Hệ Thống Quản Lý Tiệm Bánh',
      exported_at: new Date().toISOString(),
      created_by: 'Bản Sao Lưu An Toàn Trước Khi Reset Hệ Thống',
      localStorage: {},
    };

    // Đóng gói tất cả keys trong localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('bakery_')) {
        try {
          const val = localStorage.getItem(key);
          backupPayload.localStorage[key] = val ? JSON.parse(val) : val;
        } catch {
          backupPayload.localStorage[key] = localStorage.getItem(key);
        }
      }
    }

    // Đóng gói đơn hàng từ Dexie
    try {
      backupPayload.dexie_orders = await db.orders.toArray();
      backupPayload.dexie_products = await db.products.toArray();
    } catch {}

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `SAO_LUU_TIEM_BANH_TRUOC_KHI_RESET_${nowStr}.bakery.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.warn('Lỗi tải backup trước khi reset:', err);
    return false;
  }
}

/**
 * ĐIỀU PHỐI RESET TOÀN BỘ DỮ LIỆU:
 * 1. Tải bản sao lưu (nếu chọn)
 * 2. Phát sóng khẩn cấp SYSTEM_GLOBAL_WIPE sang mọi máy khác
 * 3. Gọi API server xóa CSDL SQL và cập nhật server_reset_epoch
 * 4. Xóa sạch bộ nhớ cục bộ trên máy thao tác
 */
export async function executeSystemReset(options: {
  mode: ResetMode;
  adminPassword: string;
  backupFirst?: boolean;
}): Promise<{ success: boolean; message: string; error?: string }> {
  const { mode, adminPassword, backupFirst = true } = options;
  const newEpoch = Date.now();

  try {
    // 1. Tự động sao lưu trước khi xóa nếu được chọn
    if (backupFirst) {
      await downloadPreResetBackup();
    }

    // 2. Phát sóng khẩn cấp tới mọi máy khác qua WebSocket Realtime
    try {
      await broadcastSystemGlobalWipe({
        mode,
        epoch: newEpoch,
      });
    } catch (bErr) {
      console.warn('Lỗi phát sóng broadcastSystemGlobalWipe:', bErr);
    }

    // 3. Gọi API Server thực hiện xóa trên Database SQL
    const res = await fetch('/api/system/reset-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        adminPassword,
        epoch: newEpoch,
      }),
    });

    const resJson = await res.json();
    if (!resJson.success) {
      return {
        success: false,
        message: resJson.error || 'Lỗi từ máy chủ khi thực hiện reset CSDL',
        error: resJson.error,
      };
    }

    // 4. Lưu local epoch mới
    setLocalResetEpoch(newEpoch);

    // 5. Xóa sạch bộ nhớ cục bộ của máy hiện tại
    await clearAllClientStorage(mode);

    return {
      success: true,
      message:
        mode === 'operational'
          ? 'Đã xóa sạch toàn bộ dữ liệu bán hàng & vận hành thành công! Giữ lại Menu sản phẩm, công thức và cấu hình.'
          : 'Đã xóa trắng toàn bộ dữ liệu hệ thống (100% Factory Reset) thành công!',
    };
  } catch (err: any) {
    console.error('Lỗi executeSystemReset:', err);
    return {
      success: false,
      message: err?.message || 'Có lỗi xảy ra trong quá trình thiết lập lại hệ thống',
      error: String(err),
    };
  }
}
