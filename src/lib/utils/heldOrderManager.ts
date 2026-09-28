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
 * Lấy danh sách đơn tạm giữ từ LocalStorage
 */
export function getHeldOrders(): HeldOrder[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
      window.dispatchEvent(new CustomEvent(HELD_ORDERS_UPDATED_EVENT, { detail: orders }));
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
        saveHeldOrdersLocally(parsed);
        return parsed;
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
  saveHeldOrdersLocally(orders);

  try {
    if (isLocalMode()) {
      autoSyncToLocalSqlFolder().catch(console.warn);
    }
  } catch {}

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  try {
    const notesContent = JSON.stringify(orders.slice(0, 50));
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
