// src/lib/utils/accountingSync.ts
// Đồng bộ 2 chiều Chi phí vận hành OPEX và Sổ quỹ thu chi dòng tiền qua Supabase Cloud

import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

export interface ExpenseItem {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  paymentMethod?: 'cash' | 'bank';
}

export interface CashflowTransaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  desc: string;
  date: string;
  method?: string;
}

const STORAGE_KEY_EXPENSES = 'bakery_expenses';
const STORAGE_KEY_CASHFLOW = 'bakery_cashflow';

export const EXPENSES_UPDATED_EVENT = 'bakery_expenses_updated';
export const CASHFLOW_UPDATED_EVENT = 'bakery_cashflow_updated';

const DB_ROW_EXPENSES_ID = '00000000-0000-0000-0000-000000000010';
const DB_ROW_EXPENSES_NAME = 'SYS_CONFIG_EXPENSES';

const DB_ROW_CASHFLOW_ID = '00000000-0000-0000-0000-000000000011';
const DB_ROW_CASHFLOW_NAME = 'SYS_CONFIG_CASHFLOW';

export const DEFAULT_EXPENSES: ExpenseItem[] = [];

export const DEFAULT_CASHFLOW: CashflowTransaction[] = [];

/**
 * Lọc sạch các khoản chi phí bị trùng lặp (theo ID hoặc theo nội dung ngày-nhóm-số tiền-mô tả)
 */
export function deduplicateExpenses(items: ExpenseItem[]): ExpenseItem[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const result: ExpenseItem[] = [];

  for (const item of items) {
    if (!item) continue;
    const cleanId = (item.id || '').trim();
    if (cleanId && seenIds.has(cleanId)) continue;

    const desc = (item.description || '').trim().toLowerCase();
    const cat = (item.category || '').trim().toLowerCase();
    const amount = Number(item.amount) || 0;
    const date = (item.date || '').slice(0, 10);
    const fingerprint = `${date}_${cat}_${amount}_${desc}`;

    if (seenFingerprints.has(fingerprint)) continue;

    if (cleanId) seenIds.add(cleanId);
    seenFingerprints.add(fingerprint);
    result.push(item);
  }
  return result;
}

/**
 * Lọc sạch các giao dịch sổ quỹ bị trùng lặp (theo ID hoặc theo nội dung)
 */
export function deduplicateCashflow(items: CashflowTransaction[]): CashflowTransaction[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const result: CashflowTransaction[] = [];

  for (const item of items) {
    if (!item) continue;
    const cleanId = (item.id || '').trim();
    if (cleanId && seenIds.has(cleanId)) continue;

    const desc = (item.desc || (item as any).description || '').trim().toLowerCase();
    const cat = (item.category || '').trim().toLowerCase();
    const type = (item.type || '').trim().toLowerCase();
    const amount = Number(item.amount) || 0;
    const date = (item.date || (item as any).created_at || '').slice(0, 10);
    const fingerprint = `${date}_${type}_${cat}_${amount}_${desc}`;

    if (seenFingerprints.has(fingerprint)) continue;

    if (cleanId) seenIds.add(cleanId);
    seenFingerprints.add(fingerprint);
    result.push(item);
  }
  return result;
}

// ── EXPENSES HELPERS ──
export function getExpenses(): ExpenseItem[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_EXPENSES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return deduplicateExpenses(parsed);
      }
    } catch {}
  }
  return DEFAULT_EXPENSES;
}

export function saveExpensesLocally(list: ExpenseItem[]): void {
  if (typeof window !== 'undefined') {
    try {
      const deduped = deduplicateExpenses(list);
      localStorage.setItem(STORAGE_KEY_EXPENSES, JSON.stringify(deduped));
      window.dispatchEvent(new CustomEvent(EXPENSES_UPDATED_EVENT, { detail: deduped }));
    } catch {}
  }
}

export async function fetchExpensesFromDb(): Promise<ExpenseItem[]> {
  const fallback = getExpenses();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_EXPENSES_ID},name.eq.${DB_ROW_EXPENSES_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const deduped = deduplicateExpenses(parsed);
        saveExpensesLocally(deduped);
        // Tự động chữa lành DB nếu trước đó có dữ liệu trùng
        if (deduped.length !== parsed.length) {
          saveExpensesToDb(deduped).catch(() => {});
        }
        return deduped;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchExpensesFromDb:', err);
  }
  return fallback;
}

export async function saveExpensesToDb(
  list: ExpenseItem[],
  updatedBy: string = 'Admin'
): Promise<{ success: boolean; error?: string }> {
  const deduped = deduplicateExpenses(list);
  saveExpensesLocally(deduped);

  if (isLocalMode()) {
    autoSyncToLocalSqlFolder().catch(() => {});
    return { success: true };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  try {
    const notesContent = JSON.stringify(deduped);
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_EXPENSES_ID,
        name: DB_ROW_EXPENSES_NAME,
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
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_EXPENSES_ID},name.eq.${DB_ROW_EXPENSES_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_EXPENSES_ID,
        name: DB_ROW_EXPENSES_NAME,
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
    console.error('Lỗi khi saveExpensesToDb:', err);
    return { success: false, error: err.message || 'Lỗi lưu chi phí' };
  }
}

// ── CASHFLOW HELPERS ──
export function getCashflow(): CashflowTransaction[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CASHFLOW);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return deduplicateCashflow(parsed);
      }
    } catch {}
  }
  return DEFAULT_CASHFLOW;
}

export function saveCashflowLocally(list: CashflowTransaction[]): void {
  if (typeof window !== 'undefined') {
    try {
      const deduped = deduplicateCashflow(list);
      localStorage.setItem(STORAGE_KEY_CASHFLOW, JSON.stringify(deduped));
      window.dispatchEvent(new CustomEvent(CASHFLOW_UPDATED_EVENT, { detail: deduped }));
    } catch {}
  }
}

export async function fetchCashflowFromDb(): Promise<CashflowTransaction[]> {
  const fallback = getCashflow();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_CASHFLOW_ID},name.eq.${DB_ROW_CASHFLOW_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const deduped = deduplicateCashflow(parsed);
        saveCashflowLocally(deduped);
        if (deduped.length !== parsed.length) {
          saveCashflowToDb(deduped).catch(() => {});
        }
        return deduped;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchCashflowFromDb:', err);
  }
  return fallback;
}

export async function saveCashflowToDb(
  list: CashflowTransaction[],
  updatedBy: string = 'Admin'
): Promise<{ success: boolean; error?: string }> {
  const deduped = deduplicateCashflow(list);
  saveCashflowLocally(deduped);

  if (isLocalMode()) {
    autoSyncToLocalSqlFolder().catch(() => {});
    return { success: true };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  try {
    const notesContent = JSON.stringify(deduped);
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_CASHFLOW_ID,
        name: DB_ROW_CASHFLOW_NAME,
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
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_CASHFLOW_ID},name.eq.${DB_ROW_CASHFLOW_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_CASHFLOW_ID,
        name: DB_ROW_CASHFLOW_NAME,
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
    console.error('Lỗi khi saveCashflowToDb:', err);
    return { success: false, error: err.message || 'Lỗi lưu dòng tiền' };
  }
}
