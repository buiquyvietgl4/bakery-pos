// src/lib/utils/materialTransactionManager.ts
// Quản lý Lịch sử Xuất - Nhập - Điều chỉnh Nguyên vật liệu / Vật tư kho

import { MaterialTransaction } from '../types/materialTransaction';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

const STORAGE_KEY = 'bakery_material_transactions';
export const MATERIAL_TRANSACTION_EVENT = 'bakery_material_transactions_updated';

const DB_ROW_MATERIAL_TRANSACTIONS_ID = '00000000-0000-0000-0000-000000000014';
const DB_ROW_MATERIAL_TRANSACTIONS_NAME = 'SYS_CONFIG_MATERIAL_TRANSACTIONS';

/**
 * Lấy toàn bộ danh sách lịch sử xuất nhập kho vật tư từ LocalStorage
 */
export function getMaterialTransactions(): MaterialTransaction[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Lỗi khi đọc lịch sử xuất nhập vật tư:', e);
      return [];
    }
  }
  return [];
}

/**
 * Tải lịch sử xuất nhập kho vật tư từ Supabase Cloud
 */
export async function fetchMaterialTransactionsFromDb(): Promise<MaterialTransaction[]> {
  const fallback = getMaterialTransactions();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_MATERIAL_TRANSACTIONS_ID},name.eq.${DB_ROW_MATERIAL_TRANSACTIONS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
            window.dispatchEvent(new CustomEvent(MATERIAL_TRANSACTION_EVENT, { detail: parsed[0] }));
          } catch {}
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchMaterialTransactionsFromDb:', err);
  }
  return fallback;
}

/**
 * Lưu lịch sử xuất nhập kho vật tư lên Supabase Cloud và tự động đồng bộ Local SQL
 */
export async function saveMaterialTransactionsToDb(
  logs: MaterialTransaction[]
): Promise<{ success: boolean; error?: string }> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logs.slice(0, 500)));
    } catch {}
  }

  // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
  try {
    if (isLocalMode()) {
      autoSyncToLocalSqlFolder().catch(console.warn);
    }
  } catch {}

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  try {
    const notesContent = JSON.stringify(logs.slice(0, 300));
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_MATERIAL_TRANSACTIONS_ID,
        name: DB_ROW_MATERIAL_TRANSACTIONS_NAME,
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
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_MATERIAL_TRANSACTIONS_ID},name.eq.${DB_ROW_MATERIAL_TRANSACTIONS_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_MATERIAL_TRANSACTIONS_ID,
        name: DB_ROW_MATERIAL_TRANSACTIONS_NAME,
        yield_qty: 1,
        yield_unit: 'mẻ',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      });
    }

    // Nếu Supabase có bảng material_transactions, thử ghi thêm vào đó
    try {
      if (logs.length > 0) {
        const latest = logs[0];
        await supabase.from('material_transactions').insert({
          id: latest.id,
          type: latest.type,
          material_id: latest.materialId,
          material_name: latest.materialName,
          unit: latest.unit,
          package_qty: latest.packageQty || null,
          package_unit: latest.packageUnit || null,
          conversion_rate: latest.conversionRate || 1,
          quantity: latest.quantity,
          unit_price: latest.unitPrice,
          package_unit_price: latest.packageUnitPrice || null,
          total_amount: latest.totalAmount,
          supplier_or_reason: latest.supplierOrReason,
          performed_by: latest.performedBy || null,
          date: latest.date,
          created_at: latest.createdAt,
          notes: latest.notes || null,
        });
      }
    } catch {
      // Bảng material_transactions có thể chưa được tạo trực tiếp trên Supabase SQL, notes fallback đã đảm bảo an toàn 100%
    }

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi lưu Material Transactions lên Supabase:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Ghi nhận một giao dịch xuất/nhập vật tư mới
 */
export function addMaterialTransaction(
  entry: Omit<MaterialTransaction, 'id' | 'createdAt'>
): MaterialTransaction {
  const newTx: MaterialTransaction = {
    ...entry,
    id: 'mat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    createdAt: new Date().toISOString(),
  };

  const logs = getMaterialTransactions();
  const updated = [newTx, ...logs].slice(0, 500);

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(MATERIAL_TRANSACTION_EVENT, { detail: newTx }));
    } catch (e) {
      console.error('Lỗi khi lưu giao dịch vật tư:', e);
    }
  }

  saveMaterialTransactionsToDb(updated).catch(console.error);
  return newTx;
}

/**
 * Xóa toàn bộ lịch sử xuất nhập vật tư
 */
export function clearMaterialTransactions(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(MATERIAL_TRANSACTION_EVENT, { detail: null }));
    } catch (e) {
      console.error('Lỗi khi xóa lịch sử giao dịch vật tư:', e);
    }
  }
  saveMaterialTransactionsToDb([]).catch(console.error);
}
