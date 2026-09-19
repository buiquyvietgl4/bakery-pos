// src/lib/utils/shiftSync.ts
// Quản lý và đồng bộ Két Tiền Quầy / Ca Bán Hàng (Shift) giữa các thiết bị thông qua CSDL Cloud Supabase

import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';

export interface ShiftState {
  isOpen: boolean;
  openedAt: string | null;
  openingCash: number;
  cashSales: number;
  transferSales: number;
  orderCount: number;
}

export const STORAGE_KEY_CURRENT_SHIFT = 'bakery_current_shift';
export const SYS_CONFIG_CURRENT_SHIFT = '00000000-0000-0000-0000-000000000012';
export const EVENT_CURRENT_SHIFT_UPDATED = 'bakery_current_shift_updated';

export const DEFAULT_SHIFT: ShiftState = {
  isOpen: true,
  openedAt: new Date().toISOString(),
  openingCash: 500000,
  cashSales: 0,
  transferSales: 0,
  orderCount: 0,
};

/**
 * Lấy ca hiện tại từ LocalStorage
 */
export function getCurrentShiftLocally(): ShiftState {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CURRENT_SHIFT);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          isOpen: parsed.isOpen ?? true,
          openedAt: parsed.openedAt || new Date().toISOString(),
          openingCash: Number(parsed.openingCash ?? 500000),
          cashSales: Number(parsed.cashSales ?? 0),
          transferSales: Number(parsed.transferSales ?? 0),
          orderCount: Number(parsed.orderCount ?? 0),
        };
      }
    } catch {}
  }
  return DEFAULT_SHIFT;
}

/**
 * Lưu ca vào LocalStorage và bắn event
 */
export function saveCurrentShiftLocally(shift: ShiftState): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT_SHIFT, JSON.stringify(shift));
      window.dispatchEvent(new CustomEvent(EVENT_CURRENT_SHIFT_UPDATED, { detail: shift }));
    } catch (e) {
      console.warn('Lỗi lưu ca bán hàng cục bộ:', e);
    }
  }
}

/**
 * Tải ca bán hàng mới nhất từ Supabase Cloud
 */
export async function fetchCurrentShiftFromDb(): Promise<ShiftState> {
  const fallback = getCurrentShiftLocally();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .eq('id', SYS_CONFIG_CURRENT_SHIFT)
      .maybeSingle();

    if (!error && data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed === 'object') {
          const cloudShift: ShiftState = {
            isOpen: parsed.isOpen ?? true,
            openedAt: parsed.openedAt || fallback.openedAt,
            openingCash: Number(parsed.openingCash ?? 500000),
            cashSales: Number(parsed.cashSales ?? 0),
            transferSales: Number(parsed.transferSales ?? 0),
            orderCount: Number(parsed.orderCount ?? 0),
          };
          saveCurrentShiftLocally(cloudShift);
          return cloudShift;
        }
      } catch (parseErr) {
        console.warn('Lỗi parse JSON SYS_CONFIG_CURRENT_SHIFT:', parseErr);
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchCurrentShiftFromDb:', err);
  }

  return fallback;
}

/**
 * Lưu ca bán hàng lên Supabase Cloud để đồng bộ cho toàn bộ máy quầy / Vercel
 */
export async function saveCurrentShiftToDb(shift: ShiftState): Promise<void> {
  saveCurrentShiftLocally(shift);

  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    await supabase.from('recipes').upsert({
      id: SYS_CONFIG_CURRENT_SHIFT,
      name: 'SYS_CONFIG_CURRENT_SHIFT',
      notes: JSON.stringify(shift),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Lỗi saveCurrentShiftToDb:', err);
  }
}
