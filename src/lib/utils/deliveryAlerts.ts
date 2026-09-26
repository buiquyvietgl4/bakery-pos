// src/lib/utils/deliveryAlerts.ts
// Quản lý cảnh báo giờ giao cho Bếp KDS và Quầy POS (Linh hoạt tùy chỉnh thời gian báo trước)

import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { broadcastDeliveryAlertConfig } from '@/lib/supabase/realtimeSync';
import {
  DeliveryAlertConfig,
  DEFAULT_DELIVERY_ALERT_CONFIG,
} from '@/lib/types/deliveryAlert';

export type { DeliveryAlertConfig };
export { DEFAULT_DELIVERY_ALERT_CONFIG };

export const STORAGE_KEY_DELIVERY_ALERT = 'bakery_delivery_alert_config';
export const SYS_CONFIG_DELIVERY_ALERT = '00000000-0000-0000-0000-000000000016';
export const SYS_CONFIG_DELIVERY_ALERT_NAME = 'SYS_CONFIG_DELIVERY_ALERT';
export const EVENT_DELIVERY_ALERT_CONFIG_UPDATED = 'bakery_delivery_alert_config_updated';

/**
 * Lấy cấu hình thời gian cảnh báo từ LocalStorage
 */
export function getDeliveryAlertConfig(): DeliveryAlertConfig {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DELIVERY_ALERT);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          kitchenLeadMinutes: Math.max(5, Number(parsed.kitchenLeadMinutes ?? DEFAULT_DELIVERY_ALERT_CONFIG.kitchenLeadMinutes)),
          shippingLeadMinutes: Math.max(5, Number(parsed.shippingLeadMinutes ?? DEFAULT_DELIVERY_ALERT_CONFIG.shippingLeadMinutes)),
          enableKitchenSound: parsed.enableKitchenSound ?? DEFAULT_DELIVERY_ALERT_CONFIG.enableKitchenSound,
          enableShippingSound: parsed.enableShippingSound ?? DEFAULT_DELIVERY_ALERT_CONFIG.enableShippingSound,
          updatedAt: parsed.updatedAt,
          updatedBy: parsed.updatedBy,
        };
      }
    } catch (e) {
      console.warn('Lỗi đọc cấu hình cảnh báo giao hàng:', e);
    }
  }
  return DEFAULT_DELIVERY_ALERT_CONFIG;
}

/**
 * Lưu cấu hình cảnh báo vào LocalStorage và bắn event
 */
export function saveDeliveryAlertConfigLocally(config: DeliveryAlertConfig): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_DELIVERY_ALERT, JSON.stringify(config));
      window.dispatchEvent(new CustomEvent(EVENT_DELIVERY_ALERT_CONFIG_UPDATED, { detail: config }));
    } catch (e) {
      console.warn('Lỗi lưu cấu hình cảnh báo giao hàng cục bộ:', e);
    }
  }
}

/**
 * Tải cấu hình cảnh báo từ Cloud Supabase SQL
 */
export async function fetchDeliveryAlertConfigFromDb(): Promise<DeliveryAlertConfig> {
  const fallback = getDeliveryAlertConfig();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return fallback;

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${SYS_CONFIG_DELIVERY_ALERT},name.eq.${SYS_CONFIG_DELIVERY_ALERT_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed === 'object') {
          const loadedConfig: DeliveryAlertConfig = {
            kitchenLeadMinutes: Math.max(5, Number(parsed.kitchenLeadMinutes ?? fallback.kitchenLeadMinutes)),
            shippingLeadMinutes: Math.max(5, Number(parsed.shippingLeadMinutes ?? fallback.shippingLeadMinutes)),
            enableKitchenSound: parsed.enableKitchenSound ?? fallback.enableKitchenSound,
            enableShippingSound: parsed.enableShippingSound ?? fallback.enableShippingSound,
            updatedAt: parsed.updatedAt,
            updatedBy: parsed.updatedBy,
          };
          saveDeliveryAlertConfigLocally(loadedConfig);
          return loadedConfig;
        }
      } catch (parseErr) {
        console.warn('Lỗi parse JSON SYS_CONFIG_DELIVERY_ALERT:', parseErr);
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchDeliveryAlertConfigFromDb:', err);
  }

  return fallback;
}

/**
 * Lưu cấu hình cảnh báo lên SQL (cả Cloud Supabase và Local SQL)
 */
export async function saveDeliveryAlertConfigToDb(
  config: DeliveryAlertConfig,
  updatedBy: string = 'admin'
): Promise<{ success: boolean; error?: string }> {
  const fullConfig: DeliveryAlertConfig = {
    ...config,
    kitchenLeadMinutes: Math.max(5, Number(config.kitchenLeadMinutes || 60)),
    shippingLeadMinutes: Math.max(5, Number(config.shippingLeadMinutes || 30)),
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  saveDeliveryAlertConfigLocally(fullConfig);

  // 1. Chế độ Local SQL: Ghi đĩa cục bộ
  if (isLocalMode()) {
    autoSyncToLocalSqlFolder().catch(() => {});
    return { success: true };
  }

  // 2. Chế độ Offline tạm thời
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  // 3. Chế độ Cloud Supabase SQL
  try {
    const notesContent = JSON.stringify(fullConfig);
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: SYS_CONFIG_DELIVERY_ALERT,
        name: SYS_CONFIG_DELIVERY_ALERT_NAME,
        yield_qty: 1,
        yield_unit: 'cấu hình',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      await supabase.from('recipes').delete().or(`id.eq.${SYS_CONFIG_DELIVERY_ALERT},name.eq.${SYS_CONFIG_DELIVERY_ALERT_NAME}`);
      await supabase.from('recipes').insert({
        id: SYS_CONFIG_DELIVERY_ALERT,
        name: SYS_CONFIG_DELIVERY_ALERT_NAME,
        yield_qty: 1,
        yield_unit: 'cấu hình',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
        updated_at: new Date().toISOString(),
      });
    }

    // Phát sóng Realtime cho toàn bộ thiết bị
    broadcastDeliveryAlertConfig(fullConfig).catch(() => {});
    return { success: true };
  } catch (err: any) {
    console.warn('Lỗi saveDeliveryAlertConfigToDb:', err);
    return { success: false, error: err?.message || 'Lỗi lưu cấu hình cảnh báo' };
  }
}

export type UrgencyLevel = 'overdue' | 'due_soon' | 'upcoming' | 'completed' | 'unknown';

export interface UrgencyInfo {
  level: UrgencyLevel;
  minutesLeft: number; // âm nếu quá hạn
  formattedRemaining: string;
  badgeText: string;
  badgeColorClass: string;
  borderClass: string;
  isUrgent: boolean; // Khẩn cấp chung (quá hạn hoặc rơi vào mốc cảnh báo)
  isKitchenUrgent: boolean; // Cảnh báo Bếp: Còn <= kitchenLeadMinutes và đơn chưa vào Phần 3 (chưa ready)
  isShippingUrgent: boolean; // Cảnh báo Quầy: Còn <= shippingLeadMinutes để chuẩn bị giao đồ
}

/**
 * Phân tích chuỗi ngày giờ hẹn giao sang đối tượng Date chuẩn
 */
export function parsePickupDate(pickupStr?: string): Date | null {
  if (!pickupStr || typeof pickupStr !== 'string') return null;
  const str = pickupStr.trim();
  if (!str) return null;

  // 1. Chuỗi chuẩn ISO
  if (str.includes('T') || str.includes('Z')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Định dạng: "HH:mm ngày YYYY-MM-DD" hoặc "HH:mm, YYYY-MM-DD"
  const mYmd = str.match(/(\d{1,2}):(\d{2})\s*(?:ngày|,)?\s*(\d{4})-(\d{1,2})-(\d{1,2})/i);
  if (mYmd) {
    const [, h, min, y, mo, d] = mYmd;
    const parsed = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(min), 0);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // 3. Định dạng: "HH:mm ngày DD/MM/YYYY"
  const mDmyFull = str.match(/(\d{1,2}):(\d{2})\s*(?:ngày|,)?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (mDmyFull) {
    const [, h, min, d, mo, y] = mDmyFull;
    const parsed = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(min), 0);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // 4. Định dạng: "HH:mm ngày mai"
  const mTomorrow = str.match(/(\d{1,2}):(\d{2})\s*ngày mai/i);
  if (mTomorrow) {
    const [, h, min] = mTomorrow;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(Number(h), Number(min), 0, 0);
    return tomorrow;
  }

  // 5. Định dạng: "HH:mm hôm nay"
  const mToday = str.match(/(\d{1,2}):(\d{2})\s*hôm nay/i);
  if (mToday) {
    const [, h, min] = mToday;
    const today = new Date();
    today.setHours(Number(h), Number(min), 0, 0);
    return today;
  }

  // 6. Định dạng: "HH:mm ngày DD/MM" (năm hiện tại)
  const mDmy = str.match(/(\d{1,2}):(\d{2})\s*(?:ngày|,)?\s*(?:\([^)]*\))?\s*(\d{1,2})\/(\d{1,2})/i);
  if (mDmy) {
    const [, h, min, d, mo] = mDmy;
    const now = new Date();
    const parsed = new Date(now.getFullYear(), Number(mo) - 1, Number(d), Number(h), Number(min), 0);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // Fallback Date
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
}

/**
 * Kiểm tra xem đơn hàng đã được giao thành công hoặc đã hủy hay chưa.
 */
export function isOrderCompletedOrCancelled(orderOrStatus?: any): boolean {
  if (!orderOrStatus) return false;

  // Nếu truyền trực tiếp chuỗi status
  if (typeof orderOrStatus === 'string') {
    const s = orderOrStatus.toLowerCase().trim();
    return (
      s === 'completed' ||
      s === 'cancelled' ||
      s === 'canceled' ||
      s === 'delivered' ||
      s === 'done' ||
      s === 'đã giao' ||
      s === 'đã giao khách' ||
      s === 'đã hoàn thành' ||
      s === 'hoàn thành' ||
      s === 'đã hủy' ||
      s === 'hủy'
    );
  }

  // Nếu truyền object đơn hàng
  const o = orderOrStatus;
  const s = String(o.status || '').toLowerCase().trim();
  if (
    s === 'completed' ||
    s === 'cancelled' ||
    s === 'canceled' ||
    s === 'delivered' ||
    s === 'done' ||
    s === 'đã giao' ||
    s === 'đã giao khách' ||
    s === 'đã hoàn thành' ||
    s === 'hoàn thành' ||
    s === 'đã hủy' ||
    s === 'hủy'
  ) {
    return true;
  }

  // Kiểm tra delivery_status
  const ds = String(o.delivery_status || '').toLowerCase().trim();
  if (ds === 'delivered' || ds === 'completed' || ds === 'done') {
    return true;
  }

  // Kiểm tra cờ is_delivered
  if (o.is_delivered === true) {
    return true;
  }

  // Kiểm tra ghi chú có chứa đánh dấu hoàn tất giao
  const notes = String(o.notes || '');
  if (notes.includes('[✓ ĐÃ GIAO') || notes.includes('ĐÃ GIAO KHÁCH THÀNH CÔNG')) {
    return true;
  }

  return false;
}

/**
 * Tính toán mức độ khẩn cấp của đơn hàng dựa trên thời gian hẹn giao và cấu hình mốc giờ
 */
export function getDeliveryUrgency(
  pickupAt?: string,
  statusOrOrder?: string | any,
  referenceNow: Date = new Date(),
  customConfig?: DeliveryAlertConfig
): UrgencyInfo {
  const isDone = isOrderCompletedOrCancelled(statusOrOrder);
  if (isDone) {
    const statusStr = typeof statusOrOrder === 'string'
      ? statusOrOrder
      : String(statusOrOrder?.status || '');
    const isCancelled = statusStr.toLowerCase().includes('cancel') || statusStr.toLowerCase().includes('hủy');
    return {
      level: 'completed',
      minutesLeft: 999999,
      formattedRemaining: isCancelled ? 'Đã hủy' : 'Đã giao xong',
      badgeText: isCancelled ? 'Đã hủy' : '✓ Đã hoàn thành',
      badgeColorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      borderClass: 'border-zinc-200',
      isUrgent: false,
      isKitchenUrgent: false,
      isShippingUrgent: false,
    };
  }

  const target = parsePickupDate(pickupAt);
  if (!target) {
    return {
      level: 'unknown',
      minutesLeft: 999999,
      formattedRemaining: 'Chưa rõ giờ hẹn',
      badgeText: 'Chưa rõ giờ hẹn',
      badgeColorClass: 'bg-zinc-100 text-zinc-600 border-zinc-200',
      borderClass: 'border-zinc-200',
      isUrgent: false,
      isKitchenUrgent: false,
      isShippingUrgent: false,
    };
  }

  const alertCfg = customConfig || getDeliveryAlertConfig();
  const kitchenLead = alertCfg.kitchenLeadMinutes || 60;
  const shippingLead = alertCfg.shippingLeadMinutes || 30;

  const diffMs = target.getTime() - referenceNow.getTime();
  const minutesLeft = Math.round(diffMs / 60000);

  // Kiểm tra đơn đã vào Phần 3: Sẵn Sàng Giao (status === 'ready') chưa
  const statusStr = typeof statusOrOrder === 'string'
    ? statusOrOrder.toLowerCase().trim()
    : String(statusOrOrder?.status || '').toLowerCase().trim();
  const isAlreadyInReadyStage = statusStr === 'ready';

  const isOverdue = minutesLeft < 0;
  // Bếp cần làm gấp: Quá hạn HOẶC còn <= kitchenLeadMinutes MÀ CHƯA VÀO CỘT 3
  const isKitchenUrgent = isOverdue || (minutesLeft <= kitchenLead && !isAlreadyInReadyStage);
  // Quầy cần chuẩn bị giao: Quá hạn HOẶC còn <= shippingLeadMinutes
  const isShippingUrgent = isOverdue || minutesLeft <= shippingLead;
  // Khẩn cấp chung: Bếp gấp, hoặc Quầy gấp, hoặc Quá hạn
  const isUrgent = isOverdue || isKitchenUrgent || isShippingUrgent;

  if (isOverdue) {
    const overdueMins = Math.abs(minutesLeft);
    const timeStr = overdueMins >= 60 
      ? `${Math.floor(overdueMins / 60)}h${overdueMins % 60 > 0 ? `${overdueMins % 60}p` : ''}` 
      : `${overdueMins} phút`;
    return {
      level: 'overdue',
      minutesLeft,
      formattedRemaining: `Quá hạn ${timeStr}`,
      badgeText: `🚨 QUÁ HẠN GIAO ${timeStr}!`,
      badgeColorClass: 'bg-rose-600 text-white border-rose-700 shadow-xs animate-pulse',
      borderClass: 'border-rose-500 ring-2 ring-rose-400/50 bg-rose-50/40',
      isUrgent: true,
      isKitchenUrgent: true,
      isShippingUrgent: true,
    };
  } else if (minutesLeft <= Math.max(kitchenLead, shippingLead)) {
    const timeStr = minutesLeft === 0 ? 'ngay bây giờ' : `${minutesLeft} phút`;
    let badge = `⚠️ CẦN GIAO TRONG ${timeStr}!`;
    if (isKitchenUrgent && !isAlreadyInReadyStage) {
      badge = `🚨 BẾP LÀM GẤP: CÒN ${timeStr}!`;
    } else if (isShippingUrgent) {
      badge = `📦 CHUẨN BỊ GIAO: CÒN ${timeStr}!`;
    }

    return {
      level: 'due_soon',
      minutesLeft,
      formattedRemaining: `Còn ${timeStr}`,
      badgeText: badge,
      badgeColorClass: isKitchenUrgent && !isAlreadyInReadyStage
        ? 'bg-rose-600 text-white border-rose-700 shadow-xs font-black animate-pulse'
        : 'bg-amber-500 text-white border-amber-600 shadow-xs font-black',
      borderClass: isKitchenUrgent && !isAlreadyInReadyStage
        ? 'border-rose-500 ring-2 ring-rose-400/50 bg-rose-50/30'
        : 'border-amber-500 ring-2 ring-amber-400/50 bg-amber-50/30',
      isUrgent,
      isKitchenUrgent,
      isShippingUrgent,
    };
  } else {
    const hours = Math.floor(minutesLeft / 60);
    const mins = minutesLeft % 60;
    const timeStr = hours >= 24 
      ? `${Math.floor(hours / 24)} ngày` 
      : `${hours}h${mins > 0 ? `${mins}p` : ''}`;
    return {
      level: 'upcoming',
      minutesLeft,
      formattedRemaining: `Còn ${timeStr}`,
      badgeText: `🕒 Còn ${timeStr}`,
      badgeColorClass: 'bg-blue-50 text-blue-700 border-blue-200',
      borderClass: 'border-zinc-200',
      isUrgent: false,
      isKitchenUrgent: false,
      isShippingUrgent: false,
    };
  }
}

/**
 * Lấy danh sách các đơn khẩn cấp (cần làm gấp cho bếp hoặc cần ship cho quầy)
 */
export function getUrgentPreorders<T = any>(
  orders: T[],
  referenceNow: Date = new Date(),
  config?: DeliveryAlertConfig
): T[] {
  if (!Array.isArray(orders)) return [];
  const cfg = config || getDeliveryAlertConfig();
  return orders.filter((o: any) => {
    if (!o) return false;
    if (isOrderCompletedOrCancelled(o)) return false;
    const pickup = o.preorder_pickup_at || o.pickupDateTime || o.pickup_time;
    if (!pickup) return false;
    const urgency = getDeliveryUrgency(pickup, o, referenceNow, cfg);
    return urgency.isUrgent;
  });
}

/**
 * Lấy danh sách các đơn BẾP CẦN LÀM GẤP (chưa vào Cột 3 Chờ giao và sát giờ)
 */
export function getKitchenUrgentPreorders<T = any>(
  orders: T[],
  referenceNow: Date = new Date(),
  config?: DeliveryAlertConfig
): T[] {
  if (!Array.isArray(orders)) return [];
  const cfg = config || getDeliveryAlertConfig();
  return orders.filter((o: any) => {
    if (!o) return false;
    if (isOrderCompletedOrCancelled(o)) return false;
    const pickup = o.preorder_pickup_at || o.pickupDateTime || o.pickup_time;
    if (!pickup) return false;
    const urgency = getDeliveryUrgency(pickup, o, referenceNow, cfg);
    return urgency.isKitchenUrgent;
  });
}

/**
 * Lấy danh sách các đơn QUẦY CẦN CHUẨN BỊ GIAO ĐỒ (sát giờ ship)
 */
export function getShippingUrgentPreorders<T = any>(
  orders: T[],
  referenceNow: Date = new Date(),
  config?: DeliveryAlertConfig
): T[] {
  if (!Array.isArray(orders)) return [];
  const cfg = config || getDeliveryAlertConfig();
  return orders.filter((o: any) => {
    if (!o) return false;
    if (isOrderCompletedOrCancelled(o)) return false;
    const pickup = o.preorder_pickup_at || o.pickupDateTime || o.pickup_time;
    if (!pickup) return false;
    const urgency = getDeliveryUrgency(pickup, o, referenceNow, cfg);
    return urgency.isShippingUrgent;
  });
}

/**
 * Sắp xếp danh sách đơn đặt bánh: Đơn quá hạn & sắp giao lên đầu tiên
 */
export function sortPreordersByUrgency<T = any>(
  orders: T[],
  referenceNow: Date = new Date(),
  config?: DeliveryAlertConfig
): T[] {
  if (!Array.isArray(orders)) return [];
  const cfg = config || getDeliveryAlertConfig();
  return [...orders].sort((a: any, b: any) => {
    const isDoneA = isOrderCompletedOrCancelled(a);
    const isDoneB = isOrderCompletedOrCancelled(b);
    if (isDoneA && !isDoneB) return 1;
    if (!isDoneA && isDoneB) return -1;

    const pickupA = a?.preorder_pickup_at || a?.pickupDateTime;
    const pickupB = b?.preorder_pickup_at || b?.pickupDateTime;

    const urgA = getDeliveryUrgency(pickupA, a, referenceNow, cfg);
    const urgB = getDeliveryUrgency(pickupB, b, referenceNow, cfg);

    return urgA.minutesLeft - urgB.minutesLeft;
  });
}

export const MAX_CACHED_ORDERS = 500;
export const MAX_CACHED_PREORDERS = 300;

/**
 * Cắt tỉa an toàn bộ đệm đơn hàng mà KHÔNG BAO GIỜ loại bỏ đơn đang hoạt động (chưa hoàn thành)
 */
export function pruneOrdersCache(orders: any[], maxLimit: number = MAX_CACHED_ORDERS): any[] {
  if (!Array.isArray(orders)) return [];
  if (orders.length <= maxLimit) {
    return [...orders].sort(
      (a, b) => new Date(b.created_at || b.updated_at || 0).getTime() - new Date(a.created_at || a.updated_at || 0).getTime()
    );
  }
  const active: any[] = [];
  const inactive: any[] = [];
  orders.forEach((o) => {
    if (isOrderCompletedOrCancelled(o)) {
      inactive.push(o);
    } else {
      active.push(o);
    }
  });
  inactive.sort(
    (a, b) => new Date(b.created_at || b.updated_at || 0).getTime() - new Date(a.created_at || a.updated_at || 0).getTime()
  );
  const remainingSlots = Math.max(0, maxLimit - active.length);
  const merged = [...active, ...inactive.slice(0, remainingSlots)];
  return merged.sort(
    (a, b) => new Date(b.created_at || b.updated_at || 0).getTime() - new Date(a.created_at || a.updated_at || 0).getTime()
  );
}

/**
 * Cắt tỉa an toàn danh sách đơn đặt trước (preorders) mà KHÔNG BAO GIỜ loại bỏ đơn chưa hoàn thành,
 * và sắp xếp ưu tiên theo thời gian hẹn giao
 */
export function prunePreordersCache(preorders: any[], maxLimit: number = MAX_CACHED_PREORDERS): any[] {
  if (!Array.isArray(preorders)) return [];
  const active: any[] = [];
  const inactive: any[] = [];
  preorders.forEach((p) => {
    if (isOrderCompletedOrCancelled(p)) {
      inactive.push(p);
    } else {
      active.push(p);
    }
  });
  const remainingSlots = Math.max(0, maxLimit - active.length);
  const merged = [...active, ...inactive.slice(0, remainingSlots)];
  return merged.sort((a, b) => {
    const timeA = new Date(a.preorder_pickup_at || a.pickup_time || a.pickupDateTime || a.created_at || 0).getTime();
    const timeB = new Date(b.preorder_pickup_at || b.pickup_time || b.pickupDateTime || b.created_at || 0).getTime();
    return timeB - timeA;
  });
}
