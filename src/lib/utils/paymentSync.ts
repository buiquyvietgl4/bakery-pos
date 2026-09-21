// src/lib/utils/paymentSync.ts

import { supabase } from '@/lib/supabase/client';
import { broadcastVietqrConfig, broadcastEwalletConfig } from '@/lib/supabase/realtimeSync';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

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
  if (isLocalMode()) return getVietqrConfig();
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

    // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
    try {
      autoSyncToLocalSqlFolder().catch(() => {});
    } catch {}

    if (isLocalMode()) {
      return { success: true };
    }

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
  if (isLocalMode()) return getEwalletConfig();
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

    // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
    try {
      autoSyncToLocalSqlFolder().catch(() => {});
    } catch {}

    if (isLocalMode()) {
      return { success: true };
    }

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

// ── CẤU HÌNH WEBHOOK TỰ ĐỘNG BÁO TIỀN VỀ (SEPAY / PAYOS / CASSO) ──
export interface AutoBankWebhookConfig {
  enabled: boolean;
  provider: 'auto' | 'sepay' | 'payos' | 'casso' | 'custom';
  apiKey?: string;
  secretKey?: string;
  autoConfirmOrder: boolean;
  soundAlert: boolean;
  speechAlert: boolean;
  accountNumber?: string;
  updated_at?: string;
  updated_by?: string;
}

export const DEFAULT_AUTO_BANK_CONFIG: AutoBankWebhookConfig = {
  enabled: true,
  provider: 'auto',
  apiKey: '',
  secretKey: '',
  autoConfirmOrder: true,
  soundAlert: true,
  speechAlert: true,
  accountNumber: '',
};

export const STORAGE_KEY_AUTOBANK = 'bakery_autobank_config';
export const AUTOBANK_CONFIG_UPDATED_EVENT = 'bakery_autobank_config_updated';

let inMemoryAutoBank: AutoBankWebhookConfig | null = null;

export function getAutoBankConfig(): AutoBankWebhookConfig {
  if (inMemoryAutoBank) return inMemoryAutoBank;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_AUTOBANK);
      if (raw) {
        const parsed = JSON.parse(raw);
        const res: AutoBankWebhookConfig = { ...DEFAULT_AUTO_BANK_CONFIG, ...parsed };
        inMemoryAutoBank = res;
        return res;
      }
    } catch {}
  }
  return DEFAULT_AUTO_BANK_CONFIG;
}

export function saveAutoBankConfigLocally(config: Partial<AutoBankWebhookConfig>): AutoBankWebhookConfig {
  const current = getAutoBankConfig();
  const updated: AutoBankWebhookConfig = { ...current, ...config };
  inMemoryAutoBank = updated;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_AUTOBANK, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(AUTOBANK_CONFIG_UPDATED_EVENT, { detail: updated }));
    } catch {}
  }
  return updated;
}

export const DB_ROW_AUTOBANK_ID = '00000000-0000-0000-0000-000000000006';
export const DB_ROW_AUTOBANK_NAME = 'SYS_CONFIG_AUTOBANK';

export async function fetchAutoBankConfigFromDb(): Promise<AutoBankWebhookConfig> {
  if (isLocalMode()) return getAutoBankConfig();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getAutoBankConfig();
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_AUTOBANK_ID},name.eq.${DB_ROW_AUTOBANK_NAME}`)
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.notes) {
      return getAutoBankConfig();
    }

    const parsed = JSON.parse(data.notes);
    const merged: AutoBankWebhookConfig = { ...DEFAULT_AUTO_BANK_CONFIG, ...parsed };
    saveAutoBankConfigLocally(merged);
    return merged;
  } catch (err) {
    console.warn('Lỗi đọc AutoBank config từ DB, sử dụng bộ nhớ cục bộ:', err);
    return getAutoBankConfig();
  }
}

export async function saveAutoBankConfigToDb(
  config: Partial<AutoBankWebhookConfig>
): Promise<{ success: boolean; error?: string }> {
  const current = getAutoBankConfig();
  const fullConfig: AutoBankWebhookConfig = {
    ...current,
    ...config,
    updated_at: new Date().toISOString(),
  };

  saveAutoBankConfigLocally(fullConfig);

  // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
  try {
    autoSyncToLocalSqlFolder().catch(() => {});
  } catch {}

  if (isLocalMode() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { success: true };
  }

  try {
    const { data: updatedRows, error: updateErr } = await supabase
      .from('recipes')
      .update({
        notes: JSON.stringify(fullConfig),
        is_active: false,
      })
      .eq('id', DB_ROW_AUTOBANK_ID)
      .select('id');

    if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_AUTOBANK_ID},name.eq.${DB_ROW_AUTOBANK_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_AUTOBANK_ID,
        name: DB_ROW_AUTOBANK_NAME,
        notes: JSON.stringify(fullConfig),
        is_active: false,
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi lưu AutoBank config lên Supabase:', err);
    return { success: false, error: err.message || 'Lỗi không xác định' };
  }
}

// ── 4. PHÂN HỆ XÁC THỰC CHUYỂN KHOẢN (3 CHẾ ĐỘ: NONE / TWO-STEP / BANK WEBHOOK) ──

export type TransferVerificationMode = 'none' | 'two_step' | 'bank_webhook';

export interface TwoStepSettings {
  skipForAdmin?: boolean;       // Nếu nhân viên đứng bán là Admin thì bỏ qua bước duyệt
  alertSound?: boolean;         // Phát chuông cảnh báo tới tài khoản Admin khi có yêu cầu
  autoCompleteOnApprove?: boolean; // Tự động hoàn thành đơn hàng tại POS khi Admin bấm duyệt
}

export interface TransferVerificationConfig {
  mode: TransferVerificationMode;
  twoStep: TwoStepSettings;
  two_step?: TwoStepSettings; // alias thuận tiện cho snake_case
  webhook: AutoBankWebhookConfig;
  updated_at?: string;
  updated_by?: string;
}

export const STORAGE_KEY_TRANSFER_VERIFY = 'bakery_transfer_verification_config';
export const TRANSFER_VERIFY_UPDATED_EVENT = 'bakery_transfer_verification_config_updated';

const DEFAULT_TWO_STEP: TwoStepSettings = {
  skipForAdmin: true,
  alertSound: true,
  autoCompleteOnApprove: true,
};

export const DEFAULT_TRANSFER_VERIFICATION_CONFIG: TransferVerificationConfig = {
  mode: 'none',
  twoStep: DEFAULT_TWO_STEP,
  two_step: DEFAULT_TWO_STEP,
  webhook: DEFAULT_AUTO_BANK_CONFIG,
};

let inMemoryTransferVerify: TransferVerificationConfig | null = null;

export function getTransferVerificationConfig(): TransferVerificationConfig {
  if (inMemoryTransferVerify) return inMemoryTransferVerify;
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TRANSFER_VERIFY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Hợp nhất với cấu hình auto bank nếu trước đó người dùng đã lưu
        const autoBank = getAutoBankConfig();
        const mergedTwoStep: TwoStepSettings = {
          ...DEFAULT_TWO_STEP,
          ...(parsed.twoStep || parsed.two_step || {}),
        };
        const res: TransferVerificationConfig = {
          ...DEFAULT_TRANSFER_VERIFICATION_CONFIG,
          ...parsed,
          twoStep: mergedTwoStep,
          two_step: mergedTwoStep,
          webhook: {
            ...DEFAULT_AUTO_BANK_CONFIG,
            ...autoBank,
            ...(parsed.webhook || {}),
          },
        };
        inMemoryTransferVerify = res;
        return res;
      }
    } catch {}
  }
  return DEFAULT_TRANSFER_VERIFICATION_CONFIG;
}

export function saveTransferVerificationConfigLocally(
  config: Partial<TransferVerificationConfig>
): TransferVerificationConfig {
  const current = getTransferVerificationConfig();
  const mergedTwoStep: TwoStepSettings = {
    ...current.twoStep,
    ...(config.twoStep || config.two_step || {}),
  };
  const updated: TransferVerificationConfig = {
    ...current,
    ...config,
    twoStep: mergedTwoStep,
    two_step: mergedTwoStep,
    webhook: {
      ...current.webhook,
      ...(config.webhook || {}),
    },
    updated_at: new Date().toISOString(),
  };

  inMemoryTransferVerify = updated;

  // Đồng thời cập nhật bộ nhớ của autoBankWebhookConfig nếu có sửa đổi webhook
  if (config.webhook) {
    saveAutoBankConfigLocally(config.webhook);
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_TRANSFER_VERIFY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(TRANSFER_VERIFY_UPDATED_EVENT, { detail: updated }));
    } catch {}
  }
  return updated;
}

export const DB_ROW_TRANSFER_VERIFY_ID = '00000000-0000-0000-0000-000000000007';
export const DB_ROW_TRANSFER_VERIFY_NAME = 'SYS_CONFIG_TRANSFER_VERIFY';

export async function fetchTransferVerificationConfigFromDb(): Promise<TransferVerificationConfig> {
  if (isLocalMode()) return getTransferVerificationConfig();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getTransferVerificationConfig();
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_TRANSFER_VERIFY_ID},name.eq.${DB_ROW_TRANSFER_VERIFY_NAME}`)
      .limit(1)
      .maybeSingle();

    if (error || !data || !data.notes) {
      return getTransferVerificationConfig();
    }

    const parsed = JSON.parse(data.notes);
    const autoBank = getAutoBankConfig();
    const merged: TransferVerificationConfig = {
      ...DEFAULT_TRANSFER_VERIFICATION_CONFIG,
      ...parsed,
      twoStep: {
        ...DEFAULT_TRANSFER_VERIFICATION_CONFIG.twoStep,
        ...(parsed.twoStep || {}),
      },
      webhook: {
        ...DEFAULT_AUTO_BANK_CONFIG,
        ...autoBank,
        ...(parsed.webhook || {}),
      },
    };
    saveTransferVerificationConfigLocally(merged);
    return merged;
  } catch (err) {
    console.warn('Lỗi nạp cấu hình Transfer Verification từ DB:', err);
    return getTransferVerificationConfig();
  }
}

export async function saveTransferVerificationConfigToDb(
  config: Partial<TransferVerificationConfig>,
  updatedBy = 'admin'
): Promise<{ success: boolean; error?: string }> {
  const current = getTransferVerificationConfig();
  const fullConfig: TransferVerificationConfig = {
    ...current,
    ...config,
    twoStep: {
      ...current.twoStep,
      ...(config.twoStep || {}),
    },
    webhook: {
      ...current.webhook,
      ...(config.webhook || {}),
    },
    updated_at: new Date().toISOString(),
  };

  saveTransferVerificationConfigLocally(fullConfig);

  // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
  try {
    autoSyncToLocalSqlFolder().catch(() => {});
  } catch {}

  // Lưu đồng thời bảng AutoBank webhook để đảm bảo tương thích ngược
  if (fullConfig.webhook) {
    await saveAutoBankConfigToDb(fullConfig.webhook).catch(() => {});
  }

  if (isLocalMode() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { success: true };
  }

  try {
    const { data: updatedRows, error: updateErr } = await supabase
      .from('recipes')
      .update({
        notes: JSON.stringify(fullConfig),
        is_active: false,
      })
      .eq('id', DB_ROW_TRANSFER_VERIFY_ID)
      .select('id');

    if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_TRANSFER_VERIFY_ID},name.eq.${DB_ROW_TRANSFER_VERIFY_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_TRANSFER_VERIFY_ID,
        name: DB_ROW_TRANSFER_VERIFY_NAME,
        notes: JSON.stringify(fullConfig),
        is_active: false,
      });
    }

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi lưu Transfer Verification config lên Supabase:', err);
    return { success: false, error: err.message || 'Lỗi không xác định' };
  }
}
