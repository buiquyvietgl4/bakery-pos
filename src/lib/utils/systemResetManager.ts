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
      // Nếu server không còn mốc Reset (vì đã khôi phục bản sao lưu) nhưng máy này vẫn còn localEpoch cũ > 0:
      // Tự động gỡ bỏ mốc Reset cục bộ để máy này đồng bộ và hiển thị đầy đủ dữ liệu đã khôi phục
      if (!error && !data && localEpoch > 0) {
        setLocalResetEpoch(0);
        try {
          localStorage.removeItem(STORAGE_KEY_SYSTEM_RESET_EPOCH);
          localStorage.removeItem('bakery_deleted_order_keys');
          localStorage.removeItem('bakery_kds_status_locks');
          sessionStorage.removeItem('bakery_wiped_reloaded_epoch');
        } catch {}
        return { shouldAbort: false, serverEpoch: 0 };
      }
      return { shouldAbort: false, serverEpoch: localEpoch };
    }

    let serverEpoch = 0;
    let serverMode: ResetMode = 'operational';
    try {
      const parsed = JSON.parse(data.notes);
      if (typeof parsed === 'object' && parsed !== null) {
        serverEpoch = Number(parsed.epoch) || 0;
        serverMode = parsed.mode === 'full' ? 'full' : 'operational';
      } else {
        serverEpoch = parseInt(data.notes, 10) || 0;
      }
    } catch {
      serverEpoch = parseInt(data.notes, 10) || 0;
    }

    if (serverEpoch > localEpoch) {
      console.warn(
        `🚨 [ZERO-RESURRECTION GUARD] Phát hiện CSDL đã được Reset Hệ Thống (Mode: ${serverMode}) tại mốc ${serverEpoch} (Máy cục bộ đang ở mốc cũ ${localEpoch})! LẬP TỨC HỦY TIẾN TRÌNH ĐẨY DỮ LIỆU CŨ VÀ LÀM SẠCH BỘ NHỚ TRÌNH DUYỆT!`
      );

      // Cập nhật epoch ngay trước và sau khi dọn dẹp để không bao giờ bị mất mốc epoch
      setLocalResetEpoch(serverEpoch);

      // Tự động xóa sạch bộ nhớ cũ trước mốc reset (Bảo tồn bất kỳ đơn hàng nào mới tạo SAU mốc serverEpoch)
      await clearAllClientStorage(serverMode, serverEpoch);

      // Khẳng định chắc chắn epoch sau khi dọn dẹp storage
      setLocalResetEpoch(serverEpoch);

      // Báo sự kiện làm mới giao diện
      window.dispatchEvent(new Event('bakery_orders_updated'));
      window.dispatchEvent(new CustomEvent('bakery_notif_history_change'));
      if (serverMode === 'full') {
        window.dispatchEvent(new Event('bakery_products_updated'));
        window.dispatchEvent(new Event('bakery_recipes_updated'));
      }
      window.dispatchEvent(new CustomEvent('bakery_system_wiped', { detail: { epoch: serverEpoch, mode: serverMode } }));

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
 * @param mode 'operational' hoặc 'full'
 * @param keepAfterEpoch Nếu truyền timestamp mốc reset, hệ thống sẽ BẢO TỒN các đơn/dữ liệu sinh ra SAU mốc này
 */
export async function clearAllClientStorage(
  mode: ResetMode = 'operational',
  keepAfterEpoch?: number
): Promise<void> {
  if (typeof window === 'undefined') return;

  // Đặt cờ toàn cục ngăn chặn mọi tiến trình nền gửi request
  (window as any).__IS_SYSTEM_WIPING__ = true;

  try {
    // 1. Dọn dẹp Dexie IndexedDB
    try {
      if (db.orders) {
        if (keepAfterEpoch && keepAfterEpoch > 0) {
          const allOrders = await db.orders.toArray();
          const staleIds = allOrders
            .filter((o: any) => {
              const t = new Date(o.created_at || o.createdAt || 0).getTime();
              return t <= keepAfterEpoch;
            })
            .map((o: any) => o.id);
          if (staleIds.length > 0) {
            await db.orders.bulkDelete(staleIds);
          }
        } else {
          await db.orders.clear();
        }
      }

      if (db.syncQueue) {
        if (keepAfterEpoch && keepAfterEpoch > 0) {
          const allQueue = await db.syncQueue.toArray();
          const staleQueueIds = allQueue
            .filter((q: any) => {
              const t = new Date(q.created_at || q.createdAt || q.payload?.created_at || 0).getTime();
              return t <= keepAfterEpoch;
            })
            .map((q: any) => q.id);
          if (staleQueueIds.length > 0) {
            await db.syncQueue.bulkDelete(staleQueueIds);
          }
        } else {
          await db.syncQueue.clear();
        }
      }

      if (mode === 'full' && db.products) {
        await db.products.clear();
      }
    } catch (dexieErr) {
      console.warn('Lỗi dọn Dexie:', dexieErr);
    }

    // 2. Dọn dẹp sessionStorage (giữ lại cờ chống reload lặp nếu có)
    try {
      const reloadGuard = sessionStorage.getItem('bakery_wiped_reloaded_epoch');
      sessionStorage.clear();
      if (reloadGuard) {
        sessionStorage.setItem('bakery_wiped_reloaded_epoch', reloadGuard);
      }
    } catch {}

    // 3. Dọn dẹp localStorage
    try {
      // Sao lưu các giá trị thiết yếu trước khi làm sạch để không làm mất cấu hình và không bị vòng lặp reset:
      const multiSqlConfig = localStorage.getItem('bakery_multi_sql_config');
      const currentUser = localStorage.getItem('bakery_current_user');
      const savedEpoch = String(keepAfterEpoch || getLocalResetEpoch() || 0);

      if (mode === 'operational') {
        for (const key of OPERATIONAL_DATA_KEYS) {
          if (key === 'bakery_notification_history') {
            localStorage.setItem('bakery_notification_history', '[]');
            localStorage.setItem('bakery_notifs_initialized', 'true');
            continue;
          }
          if (keepAfterEpoch && keepAfterEpoch > 0) {
            const raw = localStorage.getItem(key);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  // Giữ lại các bản ghi được tạo mới SAU mốc reset
                  const kept = parsed.filter((item: any) => {
                    const t = new Date(item.created_at || item.createdAt || 0).getTime();
                    return t > keepAfterEpoch;
                  });
                  if (kept.length > 0) {
                    localStorage.setItem(key, JSON.stringify(kept));
                  } else {
                    localStorage.removeItem(key);
                  }
                } else {
                  localStorage.removeItem(key);
                }
              } catch {
                localStorage.removeItem(key);
              }
            }
          } else {
            localStorage.removeItem(key);
          }
        }
        localStorage.setItem('bakery_notification_history', '[]');
        localStorage.setItem('bakery_notifs_initialized', 'true');
        if (savedEpoch && savedEpoch !== '0') {
          localStorage.setItem(STORAGE_KEY_SYSTEM_RESET_EPOCH, savedEpoch);
        }
        window.dispatchEvent(new CustomEvent('bakery_notif_history_change'));
      } else {
        // Mode Full: Xóa sạch toàn bộ, giữ lại cấu hình kết nối DB, User và mốc Reset Epoch
        localStorage.clear();
        if (multiSqlConfig) {
          localStorage.setItem('bakery_multi_sql_config', multiSqlConfig);
        }
        if (currentUser) {
          localStorage.setItem('bakery_current_user', currentUser);
        }
        if (savedEpoch && savedEpoch !== '0') {
          localStorage.setItem(STORAGE_KEY_SYSTEM_RESET_EPOCH, savedEpoch);
        }
        localStorage.setItem('bakery_notification_history', '[]');
        localStorage.setItem('bakery_notifs_initialized', 'true');
        window.dispatchEvent(new CustomEvent('bakery_notif_history_change'));
        window.dispatchEvent(new Event('bakery_products_updated'));
        window.dispatchEvent(new Event('bakery_recipes_updated'));
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
    const { gatherFullBakeryData } = await import('@/lib/utils/backupManager');
    const fullBackup = await gatherFullBakeryData();

    const backupPayload: Record<string, any> = {
      ...fullBackup,
      app: 'Bakery ERP - Hệ Thống Quản Lý Tiệm Bánh',
      exported_at: fullBackup.exportedAt,
      created_by: 'Bản Sao Lưu An Toàn Trước Khi Reset Hệ Thống',
      localStorage: {},
      dexie_orders: fullBackup.orders,
      dexie_products: fullBackup.products,
    };

    // Đóng gói tất cả keys trong localStorage để bảo đảm tương thích ngược 100%
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
    // 0. BƯỚC KIỂM TRA TIỀN TRÌNH: XÁC THỰC MẬT KHẨU ADMIN VỚI MÁY CHỦ (PRE-FLIGHT CHECK)
    // Nếu mật khẩu sai hoặc mất mạng, dừng ngay lập tức: không ngắt Auto Backup, không xóa, không phát sóng!
    const verifyRes = await fetch('/api/system/reset-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        adminPassword,
        epoch: newEpoch,
        validateOnly: true,
      }),
    });

    const verifyJson = await verifyRes.json();
    if (!verifyJson.success) {
      return {
        success: false,
        message: verifyJson.error || 'Mật khẩu Quản trị viên không chính xác!',
        error: verifyJson.error,
      };
    }

    // 1. 🔥 LỆNH BẢO VỆ TỐI HẬU: NGẮT NGAY AUTO BACKUP VÀ LẬP TỨC TẠO FILE SAO LƯU CUỐI CÙNG TRƯỚC KHI RESET
    // Khi mật khẩu đã xác thực chuẩn xác 100%, tiến hành ngắt watcher và chụp ảnh dữ liệu tối hậu
    const { 
      gatherFullBakeryData, 
      saveCriticalPreResetBackup, 
      saveTemporary7DayBackup, 
      stopAutoBackupWatcher, 
      startAutoBackupWatcher 
    } = await import('@/lib/utils/backupManager');
    stopAutoBackupWatcher(); // Tạm dừng Auto Backup để không ghi đè rỗng khi reset

    try {
      const fullBackup = await gatherFullBakeryData();
      const hasProducts = fullBackup.products && fullBackup.products.length > 0;
      const hasOrders = fullBackup.orders && fullBackup.orders.length > 0;
      if (hasProducts || hasOrders) {
        // 1a. Lưu bản an toàn vĩnh viễn (miễn nhiễm, không bao giờ bị xóa)
        await saveCriticalPreResetBackup(fullBackup);
        // 1b. Lưu bản sao lưu tạm thời 7 ngày (tự động dọn dẹp sau 7 ngày, hỗ trợ khôi phục / tải về)
        await saveTemporary7DayBackup(fullBackup);
      }
    } catch (saveErr) {
      console.warn('Lỗi lưu critical & temp pre-reset backup:', saveErr);
    }

    // 2. Tự động sao lưu tải file về máy qua trình duyệt nếu được chọn
    if (backupFirst) {
      await downloadPreResetBackup();
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
      // Khôi phục lại Auto Backup nếu server báo lỗi xóa SQL
      startAutoBackupWatcher();
      return {
        success: false,
        message: resJson.error || 'Lỗi từ máy chủ khi thực hiện reset CSDL',
        error: resJson.error,
      };
    }

    // 4. Phát sóng khẩn cấp tới mọi máy khác qua WebSocket Realtime SAU KHI CSDL SQL ĐÃ XÓA THÀNH CÔNG
    try {
      await broadcastSystemGlobalWipe({
        mode,
        epoch: newEpoch,
      });
    } catch (bErr) {
      console.warn('Lỗi phát sóng broadcastSystemGlobalWipe:', bErr);
    }

    // 5. Lưu local epoch mới
    setLocalResetEpoch(newEpoch);

    // 6. Xóa sạch bộ nhớ cục bộ của máy hiện tại (bảo tồn newEpoch)
    await clearAllClientStorage(mode, newEpoch);

    // 7. Đảm bảo chắc chắn local epoch được lưu
    setLocalResetEpoch(newEpoch);

    return {
      success: true,
      message:
        mode === 'operational'
          ? 'Đã xóa sạch toàn bộ dữ liệu bán hàng & vận hành thành công! Giữ lại Menu sản phẩm, công thức và cấu hình.'
          : 'Đã xóa trắng toàn bộ dữ liệu hệ thống (100% Factory Reset) thành công!',
    };
  } catch (err: any) {
    console.error('Lỗi executeSystemReset:', err);
    try {
      const { startAutoBackupWatcher } = await import('@/lib/utils/backupManager');
      startAutoBackupWatcher();
    } catch {}
    return {
      success: false,
      message: err?.message || 'Có lỗi xảy ra trong quá trình thiết lập lại hệ thống',
      error: String(err),
    };
  }
}
