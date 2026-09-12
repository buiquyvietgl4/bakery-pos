// src/lib/utils/paymentSync.ts

import { supabase } from '@/lib/supabase/client';
import { broadcastVietqrConfig, broadcastEwalletConfig } from '@/lib/supabase/realtimeSync';

export interface VietqrConfig {
  bankId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  template: string;
  transferSyntax: string;
  updated_at?: string;
  updated_by?: string;
}

export interface EwalletItem {
  phone: string;
  name: string;
  qrUrl: string;
}

export interface EwalletConfig {
  activeWallet?: 'momo' | 'zalopay' | 'viettelmoney';
  momo: EwalletItem;
  zalopay: EwalletItem;
  viettelmoney: EwalletItem;
  transferSyntax?: string;
  updated_at?: string;
  updated_by?: string;
}

const STORAGE_KEY_VIETQR = 'bakery_vietqr_config';
const STORAGE_KEY_EWALLET = 'bakery_ewallet_config';

export const VIETQR_UPDATED_EVENT = 'bakery_vietqr_updated';
export const EWALLET_UPDATED_EVENT = 'bakery_ewallet_updated';

const DB_ROW_VIETQR_ID = '00000000-0000-0000-0000-000000000004';
const DB_ROW_VIETQR_NAME = 'SYS_CONFIG_VIETQR';

const DB_ROW_EWALLET_ID = '00000000-0000-0000-0000-000000000005';
const DB_ROW_EWALLET_NAME = 'SYS_CONFIG_EWALLET';

export const DEFAULT_VIETQR_CONFIG: VietqrConfig = {
  bankId: 'MB',
  bankName: 'MBBank (Ngân hàng Quân Đội)',
  accountNo: '0988888888',
  accountName: 'TIEM BANH HANH PHUC',
  template: 'compact2',
  transferSyntax: 'DH',
};

export const DEFAULT_EWALLET_CONFIG: EwalletConfig = {
  activeWallet: 'momo',
  momo: { phone: '', name: '', qrUrl: '' },
  zalopay: { phone: '', name: '', qrUrl: '' },
  viettelmoney: { phone: '', name: '', qrUrl: '' },
  transferSyntax: 'VIMO',
};

let inMemoryVietqr: VietqrConfig | null = null;
let inMemoryEwallet: EwalletConfig | null = null;

// ── VIETQR HELPERS ──
export function getVietqrConfig(): VietqrConfig {
  if (inMemoryVietqr) return inMemoryVietqr;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VIETQR);
      if (raw) {
        const parsed = JSON.parse(raw);
        const res: VietqrConfig = { ...DEFAULT_VIETQR_CONFIG, ...parsed };
        inMemoryVietqr = res;
        return res;
      }
    } catch {}
  }
  return DEFAULT_VIETQR_CONFIG;
}

export function saveVietqrConfigLocally(config: Partial<VietqrConfig>): VietqrConfig {
  const current = getVietqrConfig();
  const updated: VietqrConfig = { ...current, ...config };
  inMemoryVietqr = updated;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_VIETQR, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(VIETQR_UPDATED_EVENT, { detail: updated }));
    } catch {}
  }
  return updated;
}

export async function fetchVietqrConfigFromDb(): Promise<VietqrConfig> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getVietqrConfig();
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_VIETQR_ID},name.eq.${DB_ROW_VIETQR_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data && data.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed === 'object' && parsed.accountNo) {
          const loaded: VietqrConfig = {
            ...DEFAULT_VIETQR_CONFIG,
            ...parsed,
          };
          saveVietqrConfigLocally(loaded);
          return loaded;
        }
      } catch (e) {
        console.warn('Lỗi phân tích cú pháp JSON VietQR từ SQL:', e);
      }
    }
  } catch (err) {
    console.warn('Lỗi kết nối fetchVietqrConfigFromDb:', err);
  }

  return getVietqrConfig();
}

export async function saveVietqrConfigToDb(
  config: Partial<VietqrConfig>,
  updatedBy = 'admin'
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = getVietqrConfig();
    const fullConfig: VietqrConfig = {
      ...current,
      ...config,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    // 1. Lưu cục bộ
    saveVietqrConfigLocally(fullConfig);

    // 2. Lưu lên Supabase SQL
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_VIETQR_ID,
        name: DB_ROW_VIETQR_NAME,
        notes: JSON.stringify(fullConfig),
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      console.warn('Upsert VietQR gặp lỗi, thử update trực tiếp:', upsertErr);
      const { data: updatedRows, error: updateErr } = await supabase
        .from('recipes')
        .update({
          name: DB_ROW_VIETQR_NAME,
          notes: JSON.stringify(fullConfig),
          is_active: false,
        })
        .eq('id', DB_ROW_VIETQR_ID)
        .select('id');

      if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
        await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_VIETQR_ID},name.eq.${DB_ROW_VIETQR_NAME}`);
        await supabase.from('recipes').insert({
          id: DB_ROW_VIETQR_ID,
          name: DB_ROW_VIETQR_NAME,
          notes: JSON.stringify(fullConfig),
          is_active: false,
        });
      }
    }

    // 3. Phát sóng Realtime cho toàn bộ các thiết bị (POS, Kitchen, Admin trên mọi máy khác)
    await broadcastVietqrConfig(fullConfig);

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi lưu VietQR lên Supabase:', err);
    return { success: false, error: err.message || 'Lỗi không xác định' };
  }
}

// ── EWALLET HELPERS ──
export function getEwalletConfig(): EwalletConfig {
  if (inMemoryEwallet) return inMemoryEwallet;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_EWALLET);
      if (raw) {
        const parsed = JSON.parse(raw);
        const res: EwalletConfig = { ...DEFAULT_EWALLET_CONFIG, ...parsed };
        inMemoryEwallet = res;
        return res;
      }
    } catch {}
  }
  return DEFAULT_EWALLET_CONFIG;
}

export function saveEwalletConfigLocally(config: Partial<EwalletConfig>): EwalletConfig {
  const current = getEwalletConfig();
  const updated: EwalletConfig = { ...current, ...config };
  inMemoryEwallet = updated;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_EWALLET, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(EWALLET_UPDATED_EVENT, { detail: updated }));
    } catch {}
  }
  return updated;
}

export async function fetchEwalletConfigFromDb(): Promise<EwalletConfig> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getEwalletConfig();
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_EWALLET_ID},name.eq.${DB_ROW_EWALLET_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data && data.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed === 'object') {
          const loaded: EwalletConfig = {
            ...DEFAULT_EWALLET_CONFIG,
            ...parsed,
          };
          saveEwalletConfigLocally(loaded);
          return loaded;
        }
      } catch (e) {
        console.warn('Lỗi phân tích cú pháp JSON E-Wallet từ SQL:', e);
      }
    }
  } catch (err) {
    console.warn('Lỗi kết nối fetchEwalletConfigFromDb:', err);
  }

  return getEwalletConfig();
}

export async function saveEwalletConfigToDb(
  config: Partial<EwalletConfig>,
  updatedBy = 'admin'
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = getEwalletConfig();
    const fullConfig: EwalletConfig = {
      ...current,
      ...config,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    // 1. Lưu cục bộ
    saveEwalletConfigLocally(fullConfig);

    // 2. Lưu lên Supabase SQL
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_EWALLET_ID,
        name: DB_ROW_EWALLET_NAME,
        notes: JSON.stringify(fullConfig),
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      console.warn('Upsert E-Wallet gặp lỗi, thử update trực tiếp:', upsertErr);
      const { data: updatedRows, error: updateErr } = await supabase
        .from('recipes')
        .update({
          name: DB_ROW_EWALLET_NAME,
          notes: JSON.stringify(fullConfig),
          is_active: false,
        })
        .eq('id', DB_ROW_EWALLET_ID)
        .select('id');

      if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
        await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_EWALLET_ID},name.eq.${DB_ROW_EWALLET_NAME}`);
        await supabase.from('recipes').insert({
          id: DB_ROW_EWALLET_ID,
          name: DB_ROW_EWALLET_NAME,
          notes: JSON.stringify(fullConfig),
          is_active: false,
        });
      }
    }

    // 3. Phát sóng Realtime cho toàn bộ các thiết bị
    await broadcastEwalletConfig(fullConfig);

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi lưu E-Wallet lên Supabase:', err);
    return { success: false, error: err.message || 'Lỗi không xác định' };
  }
}