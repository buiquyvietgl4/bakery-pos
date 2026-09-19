// src/lib/utils/deliveryAlerts.ts

export type UrgencyLevel = 'overdue' | 'due_soon' | 'upcoming' | 'completed' | 'unknown';

export interface UrgencyInfo {
  level: UrgencyLevel;
  minutesLeft: number; // âm nếu quá hạn
  formattedRemaining: string;
  badgeText: string;
  badgeColorClass: string;
  borderClass: string;
  isUrgent: boolean; // true nếu quá hạn hoặc cần giao trong 60 phút
}

/**
 * Phân tích chuỗi ngày giờ hẹn giao sang đối tượng Date chuẩn
 * Hỗ trợ linh hoạt các định dạng:
 * - "17:30 ngày 2026-09-08" (từ form đặt bánh POS)
 * - "17:30 ngày mai (08/09)" hoặc "17:30 hôm nay"
 * - "17:30 ngày 08/09/2026"
 * - ISO string: "2026-09-08T17:30:00.000Z"
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
 * Hỗ trợ đa dạng các định dạng dữ liệu (status, delivery_status, ghi chú tiếng Việt, cờ delivered...).
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
 * Tính toán mức độ khẩn cấp của đơn hàng dựa trên thời gian hẹn giao
 */
export function getDeliveryUrgency(
  pickupAt?: string,
  statusOrOrder?: string | any,
  referenceNow: Date = new Date()
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
    };
  }

  const diffMs = target.getTime() - referenceNow.getTime();
  const minutesLeft = Math.round(diffMs / 60000);

  if (minutesLeft < 0) {
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
    };
  } else if (minutesLeft <= 60) {
    const timeStr = minutesLeft === 0 ? 'ngay bây giờ' : `${minutesLeft} phút`;
    return {
      level: 'due_soon',
      minutesLeft,
      formattedRemaining: `Còn ${timeStr}`,
      badgeText: `⚠️ CẦN GIAO TRONG ${timeStr}!`,
      badgeColorClass: 'bg-amber-500 text-white border-amber-600 shadow-xs font-black',
      borderClass: 'border-amber-500 ring-2 ring-amber-400/50 bg-amber-50/30',
      isUrgent: true,
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
    };
  }
}

/**
 * Lấy danh sách các đơn khẩn cấp (sắp giao trong 60 phút hoặc đã quá hạn)
 */
export function getUrgentPreorders<T = any>(orders: T[], referenceNow: Date = new Date()): T[] {
  if (!Array.isArray(orders)) return [];
  return orders.filter((o: any) => {
    if (!o) return false;
    if (isOrderCompletedOrCancelled(o)) return false;
    const pickup = o.preorder_pickup_at || o.pickupDateTime || o.pickup_time;
    if (!pickup) return false;
    const urgency = getDeliveryUrgency(pickup, o, referenceNow);
    return urgency.isUrgent;
  });
}

/**
 * Sắp xếp danh sách đơn đặt bánh: Đơn quá hạn & sắp giao lên đầu tiên
 */
export function sortPreordersByUrgency<T = any>(orders: T[], referenceNow: Date = new Date()): T[] {
  if (!Array.isArray(orders)) return [];
  return [...orders].sort((a: any, b: any) => {
    const isDoneA = isOrderCompletedOrCancelled(a);
    const isDoneB = isOrderCompletedOrCancelled(b);
    if (isDoneA && !isDoneB) return 1;
    if (!isDoneA && isDoneB) return -1;

    const pickupA = a?.preorder_pickup_at || a?.pickupDateTime;
    const pickupB = b?.preorder_pickup_at || b?.pickupDateTime;

    const urgA = getDeliveryUrgency(pickupA, a, referenceNow);
    const urgB = getDeliveryUrgency(pickupB, b, referenceNow);

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
