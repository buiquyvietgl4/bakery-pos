// src/lib/utils/heldOrderManager.ts
// Quản lý Đơn Hàng Tạm Giữ tại quầy POS (Đồng bộ Cloud SQL Supabase & Local)

import { HeldOrder } from '@/lib/types/heldOrder';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

const STORAGE_KEY = 'bakery_held_orders';
export const HELD_ORDERS_UPDATED_EVENT = 'bakery_held_orders_updated';

export const DB_ROW_HELD_ORDERS_ID = '00000000-0000-0000-0000-000000000029';
export const DB_ROW_HELD_ORDERS_NAME = 'SYS_CONFIG_HELD_ORDERS';

/**
 * Chuẩn hóa đơn tạm giữ phòng ngừa trường hợp dữ liệu cũ hoặc từ nguồn khác
 */
export function normalizeHeldOrder(raw: any, idx: number = 0): HeldOrder {
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const items = rawItems.map((it: any, itemIdx: number) => {
    const product = it?.product || {
      id: it?.product_id || it?.id || `PROD-TEMP-${itemIdx}`,
      name: it?.name || it?.product_name || 'Bánh',
      selling_price: it?.price || it?.selling_price || 0,
      retail_price: it?.price || it?.selling_price || 0,
      category_id: it?.category_id || '',
      is_active: true,
    };
    return {
      product,
      quantity: Number(it?.quantity) || 1,
      notes: it?.notes || '',
    };
  });

  const total =
    raw?.totalAmount ??
    items.reduce((s: number, i: any) => s + (i.product?.selling_price || 0) * (i.quantity || 1), 0);
  const count =
    raw?.itemCount ??
    items.reduce((s: number, i: any) => s + (i.quantity || 1), 0);

  return {
    id: raw?.id || `HOLD-${Date.now()}-${idx}`,
    holdCode: raw?.holdCode || `#T${idx + 1}`,
    label: raw?.label || raw?.notes || raw?.customer_name || 'Đơn lưu tạm',
    createdAt: raw?.createdAt || raw?.created_at || new Date().toISOString(),
    items,
    discountMode: raw?.discountMode || 'percent',
    discountPercent: raw?.discountPercent || 0,
    discountCustomAmount: raw?.discountCustomAmount || 0,
    fulfillmentType: raw?.fulfillmentType || 'takeaway',
    posCustomerName: raw?.posCustomerName || raw?.customer_name || '',
    posCustomerPhone: raw?.posCustomerPhone || raw?.customer_phone || '',
    posShippingAddress: raw?.posShippingAddress || '',
    posPickupDate: raw?.posPickupDate || '',
    posPickupTime: raw?.posPickupTime || '',
    posCakeMessage: raw?.posCakeMessage || '',
    posShippingFee: raw?.posShippingFee || 0,
    posDepositAmount: raw?.posDepositAmount ?? null,
    cartNotes: raw?.cartNotes || raw?.notes || '',
    totalAmount: total,
    itemCount: count,
  };
}

export function deduplicateHeldOrders(orders: HeldOrder[]): HeldOrder[] {
  if (!Array.isArray(orders) || orders.length === 0) return [];
  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const result: HeldOrder[] = [];

  for (const o of orders) {
    if (!o) continue;
    const cleanId = (o.id || '').trim();
    const cleanCode = (o.holdCode || '').trim();

    if (cleanId && seenIds.has(cleanId)) continue;
    if (cleanCode && seenCodes.has(cleanCode)) continue;

    if (cleanId) seenIds.add(cleanId);
    if (cleanCode) seenCodes.add(cleanCode);
    result.push(o);
  }
  return result;
}

export function normalizeHeldOrders(rawList: any[]): HeldOrder[] {
  if (!Array.isArray(rawList)) return [];
  const mapped = rawList.map((item, idx) => normalizeHeldOrder(item, idx));
  return deduplicateHeldOrders(mapped);
}

/**
 * Lấy danh sách đơn tạm giữ từ LocalStorage
 */
export function getHeldOrders(): HeldOrder[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return normalizeHeldOrders(parsed);
    } catch (e) {
      console.error('Lỗi khi đọc danh sách đơn tạm giữ:', e);
      return [];
    }
  }
  return [];
}

/**
 * Lưu danh sách đơn tạm giữ vào LocalStorage và phát sự kiện
 */
export function saveHeldOrdersLocally(orders: HeldOrder[]): void {
  if (typeof window !== 'undefined') {
    try {
      const cleaned = normalizeHeldOrders(orders);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      window.dispatchEvent(new CustomEvent(HELD_ORDERS_UPDATED_EVENT, { detail: cleaned }));
    } catch {}
  }
}

/**
 * Tải danh sách đơn tạm giữ từ Supabase Cloud SQL
 */
export async function fetchHeldOrdersFromDb(): Promise<HeldOrder[]> {
  const fallback = getHeldOrders();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return fallback;

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_HELD_ORDERS_ID},name.eq.${DB_ROW_HELD_ORDERS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        const cleaned = normalizeHeldOrders(parsed);
        saveHeldOrdersLocally(cleaned);
        // Tự động chữa lành DB nếu có bản ghi trùng lặp
        if (cleaned.length !== parsed.length) {
          saveHeldOrdersToDb(cleaned).catch(() => {});
        }
        return cleaned;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchHeldOrdersFromDb:', err);
  }
  return fallback;
}

/**
 * Lưu danh sách đơn tạm giữ lên Supabase Cloud SQL
 */
export async function saveHeldOrdersToDb(
  orders: HeldOrder[]
): Promise<{ success: boolean; error?: string }> {
  const cleaned = normalizeHeldOrders(orders);
  saveHeldOrdersLocally(cleaned);

  if (isLocalMode()) {
    try {
      autoSyncToLocalSqlFolder().catch(console.warn);
    } catch {}
    return { success: true };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  try {
    const notesContent = JSON.stringify(cleaned.slice(0, 50));
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_HELD_ORDERS_ID,
        name: DB_ROW_HELD_ORDERS_NAME,
        yield_qty: 1,
        yield_unit: 'config',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      console.warn('Lỗi upsert SYS_CONFIG_HELD_ORDERS:', upsertErr);
      return { success: false, error: upsertErr.message };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('Lỗi khi saveHeldOrdersToDb:', err);
    return { success: false, error: err?.message };
  }
}
