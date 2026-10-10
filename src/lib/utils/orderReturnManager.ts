// src/lib/utils/orderReturnManager.ts
// Quản lý Phiếu Đổi Trả / Hoàn Tiền (Đồng bộ Cloud SQL Supabase & Local)

import { OrderReturnRecord } from '@/lib/types/orderReturn';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

const STORAGE_KEY = 'bakery_order_returns';
export const ORDER_RETURNS_UPDATED_EVENT = 'bakery_order_returns_updated';

export const DB_ROW_ORDER_RETURNS_ID = '00000000-0000-0000-0000-000000000027';
export const DB_ROW_ORDER_RETURNS_NAME = 'SYS_CONFIG_ORDER_RETURNS';

export function deduplicateOrderReturns(records: OrderReturnRecord[]): OrderReturnRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const result: OrderReturnRecord[] = [];

  for (const r of records) {
    if (!r) continue;
    const cleanId = (r.id || '').trim();

    // Loại bỏ dữ liệu mẫu kiểm thử
    if (
      cleanId.startsWith('RET-QC-') ||
      cleanId.startsWith('RET-REAL-') ||
      r.order_number?.startsWith('TEST-QC-') ||
      r.order_number?.startsWith('ORD-REAL-')
    ) continue;

    const fp = `${r.order_id || r.order_number}_${r.refund_amount}_${(r.created_at || '').slice(0, 19)}`;

    if (cleanId && seenIds.has(cleanId)) continue;
    if (fp && seenFingerprints.has(fp)) continue;

    if (cleanId) seenIds.add(cleanId);
    if (fp) seenFingerprints.add(fp);
    result.push(r);
  }
  return result;
}

/**
 * Lấy danh sách phiếu đổi trả từ LocalStorage
 */
export function getOrderReturns(): OrderReturnRecord[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? deduplicateOrderReturns(parsed) : [];
    } catch (e) {
      console.error('Lỗi khi đọc danh sách phiếu đổi trả:', e);
      return [];
    }
  }
  return [];
}

/**
 * Lưu danh sách phiếu đổi trả vào LocalStorage và phát sự kiện
 */
export function saveOrderReturnsLocally(records: OrderReturnRecord[]): void {
  if (typeof window !== 'undefined') {
    try {
      const deduped = deduplicateOrderReturns(records);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
      window.dispatchEvent(new CustomEvent(ORDER_RETURNS_UPDATED_EVENT, { detail: deduped }));
    } catch {}
  }
}

/**
 * Tải danh sách phiếu đổi trả từ Supabase Cloud SQL
 */
export async function fetchOrderReturnsFromDb(): Promise<OrderReturnRecord[]> {
  const fallback = getOrderReturns();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return fallback;

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_ORDER_RETURNS_ID},name.eq.${DB_ROW_ORDER_RETURNS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        const deduped = deduplicateOrderReturns(parsed);
        saveOrderReturnsLocally(deduped);
        // Tự động chữa lành DB nếu có bản ghi trùng lặp
        if (deduped.length !== parsed.length) {
          saveOrderReturnsToDb(deduped).catch(() => {});
        }
        return deduped;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchOrderReturnsFromDb:', err);
  }
  return fallback;
}

/**
 * Lưu danh sách phiếu đổi trả lên Supabase Cloud SQL
 */
export async function saveOrderReturnsToDb(
  records: OrderReturnRecord[]
): Promise<{ success: boolean; error?: string }> {
  const deduped = deduplicateOrderReturns(records);
  saveOrderReturnsLocally(deduped);

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
    const notesContent = JSON.stringify(deduped.slice(0, 300));
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_ORDER_RETURNS_ID,
        name: DB_ROW_ORDER_RETURNS_NAME,
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
      console.warn('Lỗi upsert SYS_CONFIG_ORDER_RETURNS, chuyển sang xóa và tạo mới:', upsertErr);
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_ORDER_RETURNS_ID},name.eq.${DB_ROW_ORDER_RETURNS_NAME}`);
      const { error: insertErr } = await supabase.from('recipes').insert({
        id: DB_ROW_ORDER_RETURNS_ID,
        name: DB_ROW_ORDER_RETURNS_NAME,
        yield_qty: 1,
        yield_unit: 'config',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
        updated_at: new Date().toISOString(),
      });
      if (insertErr) {
        console.error('Lỗi insert fallback SYS_CONFIG_ORDER_RETURNS:', insertErr);
        return { success: false, error: insertErr.message };
      }
    }
    return { success: true };
  } catch (err: any) {
    console.warn('Lỗi khi saveOrderReturnsToDb:', err);
    return { success: false, error: err?.message };
  }
}
