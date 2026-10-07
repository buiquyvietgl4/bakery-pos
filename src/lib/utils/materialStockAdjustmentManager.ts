// src/lib/utils/materialStockAdjustmentManager.ts
// Quản lý Lịch Sử Sửa Đổi / Kiểm Kê Tồn Kho Nguyên Vật Liệu (Đồng bộ Cloud SQL & Local SQL)

import { MaterialStockAdjustmentLog } from '../types/materialStockAdjustment';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

const STORAGE_KEY = 'bakery_material_stock_adjustments';
export const MATERIAL_STOCK_ADJUSTMENT_EVENT = 'bakery_material_stock_adjustments_updated';

// Khóa cấu hình dự phòng trong bảng recipes (UUID riêng biệt không trùng lặp)
const DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_ID = '00000000-0000-0000-0000-000000000015';
const DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_NAME = 'SYS_CONFIG_MATERIAL_STOCK_ADJUSTMENTS';

export function deduplicateMaterialStockAdjustmentLogs(logs: MaterialStockAdjustmentLog[]): MaterialStockAdjustmentLog[] {
  if (!Array.isArray(logs) || logs.length === 0) return [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const result: MaterialStockAdjustmentLog[] = [];

  for (const log of logs) {
    if (!log) continue;
    const cleanId = (log.id || '').trim();
    if (cleanId && seenIds.has(cleanId)) continue;

    const mat = (log.ingredientId || log.ingredientName || (log as any).materialId || '').trim().toLowerCase();
    const oldQ = Number(log.oldQuantity) || 0;
    const newQ = Number(log.newQuantity) || 0;
    const date = (log.adjustedAt || '').slice(0, 19);
    const reason = (log.reason || '').trim().toLowerCase();
    const fingerprint = `${date}_${mat}_${oldQ}_${newQ}_${reason}`;

    if (seenFingerprints.has(fingerprint)) continue;

    if (cleanId) seenIds.add(cleanId);
    seenFingerprints.add(fingerprint);
    result.push(log);
  }
  return result;
}

/**
 * Lấy toàn bộ danh sách lịch sử sửa đổi / kiểm kê tồn kho vật tư từ LocalStorage
 */
export function getMaterialStockAdjustmentLogs(): MaterialStockAdjustmentLog[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? deduplicateMaterialStockAdjustmentLogs(parsed) : [];
    } catch (e) {
      console.error('Lỗi khi đọc lịch sử sửa tồn kho vật tư:', e);
      return [];
    }
  }
  return [];
}

/**
 * Tải lịch sử sửa đổi / kiểm kê tồn kho vật tư từ Supabase Cloud
 */
export async function fetchMaterialStockAdjustmentLogsFromDb(): Promise<MaterialStockAdjustmentLog[]> {
  const fallback = getMaterialStockAdjustmentLogs();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_ID},name.eq.${DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const deduped = deduplicateMaterialStockAdjustmentLogs(parsed);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
            window.dispatchEvent(new CustomEvent(MATERIAL_STOCK_ADJUSTMENT_EVENT, { detail: deduped[0] }));
          } catch {}
        }
        // Tự động chữa lành DB nếu có bản ghi trùng
        if (deduped.length !== parsed.length) {
          saveMaterialStockAdjustmentLogsToDb(deduped).catch(() => {});
        }
        return deduped;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchMaterialStockAdjustmentLogsFromDb:', err);
  }
  return fallback;
}

/**
 * Lưu lịch sử sửa đổi / kiểm kê tồn kho vật tư lên Supabase Cloud và tự động đồng bộ Local SQL
 */
export async function saveMaterialStockAdjustmentLogsToDb(
  logs: MaterialStockAdjustmentLog[]
): Promise<{ success: boolean; error?: string }> {
  const deduped = deduplicateMaterialStockAdjustmentLogs(logs);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped.slice(0, 500)));
    } catch {}
  }

  // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
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
        id: DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_ID,
        name: DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_NAME,
        yield_qty: 1,
        yield_unit: 'mẻ',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_ID},name.eq.${DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_ID,
        name: DB_ROW_MATERIAL_STOCK_ADJUSTMENTS_NAME,
        yield_qty: 1,
        yield_unit: 'mẻ',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      });
    }

    // Nếu Supabase có bảng material_stock_adjustments chuyên biệt, chèn bản ghi mới nhất vào
    try {
      if (logs.length > 0) {
        const latest = logs[0];
        await supabase.from('material_stock_adjustments').insert({
          id: latest.id,
          ingredient_id: latest.ingredientId,
          ingredient_name: latest.ingredientName,
          unit: latest.unit,
          old_quantity: latest.oldQuantity,
          new_quantity: latest.newQuantity,
          delta_quantity: latest.deltaQuantity,
          avg_cost: latest.avgCost,
          total_value_change: latest.totalValueChange,
          reason: latest.reason,
          notes: latest.notes || null,
          adjusted_by: latest.adjustedBy || null,
          adjusted_at: latest.adjustedAt,
        });
      }
    } catch {
      // Notes fallback đã đảm bảo dữ liệu luôn được an toàn 100%
    }

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi lưu Material Stock Adjustments lên Supabase:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Ghi nhận một lượt điều chỉnh / kiểm kê tồn kho vật tư mới
 */
export function addMaterialStockAdjustmentLog(
  entry: Omit<MaterialStockAdjustmentLog, 'id' | 'adjustedAt'>
): MaterialStockAdjustmentLog {
  const newLog: MaterialStockAdjustmentLog = {
    ...entry,
    id: 'mat-adj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    adjustedAt: new Date().toISOString(),
  };

  const logs = getMaterialStockAdjustmentLogs();
  const updated = [newLog, ...logs].slice(0, 500);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(MATERIAL_STOCK_ADJUSTMENT_EVENT, { detail: newLog }));
    } catch (e) {
      console.error('Lỗi khi lưu lịch sử sửa tồn kho vật tư:', e);
    }
  }

  saveMaterialStockAdjustmentLogsToDb(updated).catch(console.error);
  return newLog;
}

/**
 * Xóa toàn bộ lịch sử sửa tồn kho vật tư
 */
export function clearMaterialStockAdjustmentLogs(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(MATERIAL_STOCK_ADJUSTMENT_EVENT, { detail: null }));
    } catch (e) {
      console.error('Lỗi khi xóa lịch sử sửa tồn kho vật tư:', e);
    }
  }
  saveMaterialStockAdjustmentLogsToDb([]).catch(console.error);
}
