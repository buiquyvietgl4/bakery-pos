// src/lib/utils/notificationHistory.ts
// Quản lý lưu trữ bền vững (Offline-first) và truy vấn Lịch Sử Thông Báo

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

const STORAGE_KEY = 'bakery_notification_history';
const MAX_LOGS = 100;
const EVENT_NAME = 'bakery_notif_history_change';

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

/**
 * Danh sách thông báo mẫu khởi tạo khi ứng dụng lần đầu chạy
 */
const INITIAL_DEMO_NOTIFS: NotificationLogItem[] = [
  {
    id: 'notif-init-welcome',
    type: 'system',
    title: '🎉 Hệ Thống Thông Báo Đã Sẵn Sàng',
    message: 'Toàn bộ thông báo đơn hàng mới, lò nướng bắt đầu nướng, bánh chín ra lò và đơn giao gấp sẽ được tự động lưu trữ tại đây.',
    timestamp: Date.now() - 5 * 60 * 1000,
    createdAtFormatted: formatNotificationTime(new Date(Date.now() - 5 * 60 * 1000)),
    isRead: false,
    sender: 'Hệ thống Quản Trị',
    channel: 'system',
  },
  {
    id: 'notif-init-kds',
    type: 'bake_done',
    title: '🍞 Bánh Đã Chín Ra Lò: Bánh Mì Bơ Tỏi Phô Mai',
    message: 'Mẻ nướng 10 cái đã hoàn thành và đạt nhiệt độ tiêu chuẩn. Thợ bánh đã cho ra khay.',
    timestamp: Date.now() - 15 * 60 * 1000,
    createdAtFormatted: formatNotificationTime(new Date(Date.now() - 15 * 60 * 1000)),
    isRead: true,
    sender: 'Lò Nướng #1',
    channel: 'in_app',
    url: '/kitchen',
  },
];

function dispatchChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
}

/**
 * Lấy toàn bộ danh sách lịch sử thông báo
 */
export function getNotificationHistory(): NotificationLogItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_NOTIFS));
      return INITIAL_DEMO_NOTIFS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (e) {
    console.warn('Lỗi đọc lịch sử thông báo:', e);
    return [];
  }
}

/**
 * Lưu danh sách thông báo vào LocalStorage
 */
function saveNotificationHistory(list: NotificationLogItem[]) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = list.slice(0, MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    dispatchChange();
  } catch (e) {
    console.warn('Lỗi lưu lịch sử thông báo:', e);
  }
}

/**
 * Thêm một thông báo mới vào lịch sử
 */
export function addNotificationLog(
  item: Omit<NotificationLogItem, 'id' | 'timestamp' | 'createdAtFormatted' | 'isRead'> & {
    id?: string;
    timestamp?: number;
    isRead?: boolean;
  }
): NotificationLogItem {
  const current = getNotificationHistory();

  const targetId = item.id || `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const existingIdx = current.findIndex((n) => n.id === targetId);

  const now = item.timestamp || Date.now();
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

  let updated: NotificationLogItem[];
  if (existingIdx >= 0) {
    updated = [newLog, ...current.filter((_, idx) => idx !== existingIdx)];
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
    localStorage.removeItem(STORAGE_KEY);
    dispatchChange();
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
