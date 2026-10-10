import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

export type NotificationType =
  | 'new_order'
  | 'urgent_alert'
  | 'bake_start'
  | 'bake_done'
  | 'bake_discharge'
  | 'telegram'
  | 'pwa'
  | 'system'
  | 'info'
  | 'test';

export interface NotificationLogItem {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  createdAtFormatted: string;
  isRead: boolean;
  sender?: string;
  orderNumber?: string;
  url?: string;
  extraDetails?: string;
  channel?: 'in_app' | 'pwa' | 'telegram' | 'native' | 'system';
}

export const STORAGE_KEY_NOTIFICATION_HISTORY = 'bakery_notification_history';
const STORAGE_KEY = STORAGE_KEY_NOTIFICATION_HISTORY;
const MAX_LOGS = 100;
const EVENT_NAME = 'bakery_notif_history_change';

export const DB_ROW_NOTIFICATION_HISTORY_ID = '00000000-0000-0000-0000-000000000013';
export const DB_ROW_NOTIFICATION_HISTORY_NAME = 'SYS_CONFIG_NOTIFICATION_HISTORY';

/**
 * Định dạng ngày giờ dạng HH:mm:ss dd/MM/yyyy
 */
export function formatNotificationTime(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  const d = pad(date.getDate());
  const mo = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  return `${h}:${m}:${s} ${d}/${mo}/${y}`;
}

/**
 * Định dạng thời gian tương đối (vd: "Vừa xong", "5 phút trước")
 */
export function formatRelativeNotificationTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 45) return 'Vừa xong';
  if (diffSec < 90) return '1 phút trước';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;

  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'Hôm qua';
  if (diffDay < 7) return `${diffDay} ngày trước`;

  const d = new Date(timestamp);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

const INITIAL_DEMO_NOTIFS: NotificationLogItem[] = [];

function dispatchChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

function normalizeNotifText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Kiểm tra xem 2 thông báo có phải là bản sao trùng lặp của cùng 1 sự kiện hay không
 * (Ví dụ: 1 thông báo từ ứng dụng in_app và 1 thông báo từ PWA Web Push cho cùng đơn hàng)
 */
export function isDuplicateNotification(a: NotificationLogItem, b: NotificationLogItem): boolean {
  if (!a || !b) return false;

  // 1. Cùng id
  if (a.id && b.id && a.id.trim() === b.id.trim()) return true;

  const timeDiff = Math.abs(a.timestamp - b.timestamp);

  // 2. Nếu cùng orderNumber
  if (a.orderNumber && b.orderNumber && a.orderNumber.trim() === b.orderNumber.trim()) {
    // Nếu một bên là 'in_app' và một bên là 'pwa' cho cùng 1 đơn hàng -> 100% TRÙNG LẶP!
    if ((a.channel === 'pwa' && b.channel !== 'pwa') || (b.channel === 'pwa' && a.channel !== 'pwa')) {
      return true;
    }

    // Nếu xảy ra trong vòng 10 phút:
    if (timeDiff < 10 * 60 * 1000) {
      // Cùng loại sự kiện (cùng new_order hoặc cùng urgent_alert)
      if (a.type === b.type) return true;

      // Hoặc tiêu đề chuẩn hóa tương đồng
      const normA = normalizeNotifText(a.title);
      const normB = normalizeNotifText(b.title);
      if (normA && normB && (normA === normB || normA.includes(normB) || normB.includes(normA))) {
        return true;
      }
    }
  }

  // 3. Nếu không có orderNumber (ví dụ sự kiện lò nướng: bake_done, bake_start, bake_discharge, hoặc thông báo test)
  if (timeDiff < 60 * 1000) {
    // Một bên là pwa và một bên là in_app trong vòng 60 giây và cùng loại sự kiện
    if (((a.channel === 'pwa' && b.channel !== 'pwa') || (b.channel === 'pwa' && a.channel !== 'pwa')) && a.type === b.type) {
      return true;
    }

    const normA = normalizeNotifText(a.title);
    const normB = normalizeNotifText(b.title);
    if (normA && normB && (normA === normB || normA.includes(normB) || normB.includes(normA))) {
      return true;
    }
  }

  return false;
}

export function deduplicateNotifications(list: NotificationLogItem[]): NotificationLogItem[] {
  if (!Array.isArray(list) || list.length === 0) return [];
  const result: NotificationLogItem[] = [];

  for (const item of list) {
    if (!item) continue;
    // Loại bỏ hoàn toàn thông báo demo cũ
    if (item.id === 'notif-init-welcome' || item.id === 'notif-init-kds') continue;

    // Tìm xem đã có thông báo trùng lặp nào trong result chưa
    const existingIdx = result.findIndex((existing) => isDuplicateNotification(existing, item));
    if (existingIdx >= 0) {
      const existing = result[existingIdx];
      // Ưu tiên giữ bản ghi in_app vì có thông tin chi tiết đầy đủ hơn bản ghi pwa
      if (item.channel !== 'pwa' && existing.channel === 'pwa') {
        result[existingIdx] = {
          ...item,
          id: existing.id || item.id,
          isRead: existing.isRead || item.isRead,
        };
      }
      // Đã có bản ghi đại diện, loại bỏ bản ghi trùng
      continue;
    }

    result.push(item);
  }
  return result;
}

/**
 * Lấy toàn bộ danh sách lịch sử thông báo
 */
export function getNotificationHistory(): NotificationLogItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const deduped = deduplicateNotifications(parsed);
        if (deduped.length !== parsed.length) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
          } catch {}
        }
        return deduped;
      }
      return [];
    }

    // Khi raw là null (chưa có key trong localStorage) -> Không bao giờ nạp dữ liệu mẫu
    localStorage.setItem('bakery_notifs_initialized', 'true');
    localStorage.setItem(STORAGE_KEY, '[]');
    return [];
  } catch (e) {
    console.warn('Lỗi đọc lịch sử thông báo:', e);
    return [];
  }
}

/**
 * Lưu danh sách thông báo lên Supabase Cloud SQL
 */
export async function saveNotificationHistoryToDb(list: NotificationLogItem[]): Promise<void> {
  // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
  try {
    autoSyncToLocalSqlFolder().catch(() => {});
  } catch {}

  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    const deduped = deduplicateNotifications(list);
    const trimmed = deduped.slice(0, MAX_LOGS);
    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_NOTIFICATION_HISTORY_ID,
        name: DB_ROW_NOTIFICATION_HISTORY_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: JSON.stringify(trimmed),
        is_active: false,
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('Lỗi khi saveNotificationHistoryToDb:', err);
  }
}

/**
 * Tải lịch sử thông báo từ Supabase Cloud SQL
 */
export async function fetchNotificationHistoryFromDb(): Promise<NotificationLogItem[]> {
  if (isLocalMode()) return getNotificationHistory();
  if (typeof navigator !== 'undefined' && !navigator.onLine) return getNotificationHistory();

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_NOTIFICATION_HISTORY_ID},name.eq.${DB_ROW_NOTIFICATION_HISTORY_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error) {
      if (data?.notes) {
        const parsed = JSON.parse(data.notes);
        if (Array.isArray(parsed)) {
          const deduped = deduplicateNotifications(parsed);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
              localStorage.setItem('bakery_notifs_initialized', 'true');
              dispatchChange();
            } catch {}
          }
          if (deduped.length !== parsed.length) {
            saveNotificationHistoryToDb(deduped).catch(() => {});
          }
          return deduped;
        }
      } else {
        // CSDL không có bản ghi (đã bị xóa do reset hoặc chưa lưu)
        if (typeof window !== 'undefined') {
          const resetEpoch = localStorage.getItem('bakery_system_reset_epoch');
          const isInit = localStorage.getItem('bakery_notifs_initialized');
          if (resetEpoch || isInit) {
            try {
              localStorage.setItem(STORAGE_KEY, '[]');
              localStorage.setItem('bakery_notifs_initialized', 'true');
              dispatchChange();
            } catch {}
            return [];
          }
        }
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchNotificationHistoryFromDb:', err);
  }
  return getNotificationHistory();
}

/**
 * Lưu danh sách thông báo vào LocalStorage và đồng bộ Cloud SQL
 */
function saveNotificationHistory(list: NotificationLogItem[]) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = list.slice(0, MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    dispatchChange();
    saveNotificationHistoryToDb(trimmed).catch(console.error);
  } catch (e) {
    console.warn('Lỗi lưu lịch sử thông báo:', e);
  }
}

/**
 * Thêm một thông báo mới vào lịch sử (tự động loại trừ trùng lặp giữa Ứng dụng và PWA)
 */
export function addNotificationLog(
  item: Omit<NotificationLogItem, 'id' | 'timestamp' | 'createdAtFormatted' | 'isRead'> & {
    id?: string;
    timestamp?: number;
    isRead?: boolean;
  }
): NotificationLogItem {
  const current = getNotificationHistory();

  const now = item.timestamp || Date.now();
  const targetId = item.id || `notif-${now}-${Math.random().toString(36).substring(2, 7)}`;

  const newLog: NotificationLogItem = {
    id: targetId,
    type: item.type,
    title: item.title,
    message: item.message,
    timestamp: now,
    createdAtFormatted: formatNotificationTime(new Date(now)),
    isRead: item.isRead !== undefined ? item.isRead : false,
    sender: item.sender || 'Hệ thống',
    orderNumber: item.orderNumber,
    url: item.url,
    extraDetails: item.extraDetails,
    channel: item.channel || 'in_app',
  };

  // 1. Kiểm tra xem đã có thông báo trùng lặp với newLog trong lịch sử chưa
  const dupIdx = current.findIndex((n) => isDuplicateNotification(n, newLog));

  let updated: NotificationLogItem[];
  if (dupIdx >= 0) {
    const existing = current[dupIdx];
    // Nếu item mới là in_app và item cũ là pwa -> nâng cấp nội dung in_app giàu thông tin hơn
    if (newLog.channel !== 'pwa' && existing.channel === 'pwa') {
      const merged: NotificationLogItem = {
        ...newLog,
        id: existing.id,
        isRead: existing.isRead,
      };
      updated = [merged, ...current.filter((_, idx) => idx !== dupIdx)];
      saveNotificationHistory(updated);
      return merged;
    }
    // Nếu bản ghi hiện tại đã là in_app (chất lượng cao) hoặc đã tồn tại -> không tạo thêm bản sao
    return existing;
  }

  // 2. Kiểm tra nếu có cùng ID chính xác
  const existingIdIdx = current.findIndex((n) => n.id === targetId);
  if (existingIdIdx >= 0) {
    updated = [newLog, ...current.filter((_, idx) => idx !== existingIdIdx)];
  } else {
    updated = [newLog, ...current];
  }

  saveNotificationHistory(updated);
  return newLog;
}

/**
 * Đánh dấu một thông báo là đã đọc
 */
export function markAsRead(id: string): void {
  const current = getNotificationHistory();
  let changed = false;
  const updated = current.map((item) => {
    if (item.id === id && !item.isRead) {
      changed = true;
      return { ...item, isRead: true };
    }
    return item;
  });
  if (changed) {
    saveNotificationHistory(updated);
  }
}

/**
 * Đánh dấu tất cả thông báo là đã đọc
 */
export function markAllAsRead(): void {
  const current = getNotificationHistory();
  const updated = current.map((item) => ({ ...item, isRead: true }));
  saveNotificationHistory(updated);
}

/**
 * Xóa một thông báo khỏi lịch sử
 */
export function deleteNotification(id: string): void {
  const current = getNotificationHistory();
  const updated = current.filter((item) => item.id !== id);
  saveNotificationHistory(updated);
}

/**
 * Xóa toàn bộ lịch sử thông báo
 */
export function clearNotificationHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, '[]');
    localStorage.setItem('bakery_notifs_initialized', 'true');
    dispatchChange();

    if (!isLocalMode() && navigator.onLine) {
      supabase
        .from('recipes')
        .delete()
        .or(`id.eq.${DB_ROW_NOTIFICATION_HISTORY_ID},name.eq.${DB_ROW_NOTIFICATION_HISTORY_NAME}`)
        .then(() => {}, () => {});
    }
  } catch (e) {
    console.warn('Lỗi xóa toàn bộ lịch sử thông báo:', e);
  }
}

/**
 * Đếm số lượng thông báo chưa đọc
 */
export function getUnreadNotificationCount(): number {
  const list = getNotificationHistory();
  return list.filter((n) => !n.isRead).length;
}

/**
 * Đăng ký lắng nghe thay đổi của lịch sử thông báo (trong cùng tab hoặc giữa các tab)
 */
export function subscribeNotificationHistory(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };

  window.addEventListener(EVENT_NAME, handleCustom);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(EVENT_NAME, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
