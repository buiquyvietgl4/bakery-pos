import { StockAdjustmentLog } from '../types/stockAdjustment';
import { supabase } from '@/lib/supabase/client';

const STORAGE_KEY = 'bakery_stock_adjustment_logs';
export const STOCK_ADJUSTMENT_EVENT = 'bakery_stock_adjustment_logs_updated';

const DB_ROW_STOCK_ADJUSTMENTS_ID = '00000000-0000-0000-0000-000000000009';
const DB_ROW_STOCK_ADJUSTMENTS_NAME = 'SYS_CONFIG_STOCK_ADJUSTMENTS';

/**
 * Lấy toàn bộ danh sách lịch sử thay đổi tồn kho bánh
 */
export function getStockAdjustmentLogs(): StockAdjustmentLog[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Lỗi khi đọc lịch sử thay đổi tồn kho:', e);
      return [];
    }
  }
  return [];
}

/**
 * Tải lịch sử thay đổi tồn kho từ Supabase Cloud
 */
export async function fetchStockAdjustmentLogsFromDb(): Promise<StockAdjustmentLog[]> {
  const fallback = getStockAdjustmentLogs();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_STOCK_ADJUSTMENTS_ID},name.eq.${DB_ROW_STOCK_ADJUSTMENTS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            window.dispatchEvent(new CustomEvent(STOCK_ADJUSTMENT_EVENT, { detail: parsed[0] }));
          } catch {}
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchStockAdjustmentLogsFromDb:', err);
  }
  return fallback;
}

/**
 * Lưu lịch sử thay đổi tồn kho lên Supabase Cloud
 */
export async function saveStockAdjustmentLogsToDb(
  logs: StockAdjustmentLog[]
): Promise<{ success: boolean; error?: string }> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 500)));
    } catch {}
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  try {
    const notesContent = JSON.stringify(logs.slice(0, 300));
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_STOCK_ADJUSTMENTS_ID,
        name: DB_ROW_STOCK_ADJUSTMENTS_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_STOCK_ADJUSTMENTS_ID},name.eq.${DB_ROW_STOCK_ADJUSTMENTS_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_STOCK_ADJUSTMENTS_ID,
        name: DB_ROW_STOCK_ADJUSTMENTS_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      });
    }
    return { success: true };
  } catch (err: any) {
    console.error('Lỗi lưu Stock Adjustments lên Supabase:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Ghi nhận một lượt thay đổi số lượng tồn kho bánh mới vào lịch sử
 */
export function addStockAdjustmentLog(
  entry: Omit<StockAdjustmentLog, 'id' | 'adjustedAt'>
): StockAdjustmentLog {
  const newLog: StockAdjustmentLog = {
    ...entry,
    id: 'adj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    adjustedAt: new Date().toISOString(),
  };

  const logs = getStockAdjustmentLogs();
  const updated = [newLog, ...logs].slice(0, 500);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(STOCK_ADJUSTMENT_EVENT, { detail: newLog }));
    } catch (e) {
      console.error('Lỗi khi lưu lịch sử thay đổi tồn kho:', e);
    }
  }

  saveStockAdjustmentLogsToDb(updated).catch(console.error);
  return newLog;
}

/**
 * Xóa toàn bộ lịch sử thay đổi tồn kho
 */
export function clearStockAdjustmentLogs(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(STOCK_ADJUSTMENT_EVENT, { detail: null }));
    } catch (e) {
      console.error('Lỗi khi xóa lịch sử thay đổi tồn kho:', e);
    }
  }
  saveStockAdjustmentLogsToDb([]).catch(console.error);
}
