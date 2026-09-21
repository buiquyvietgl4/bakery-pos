// src/lib/utils/storeBranding.ts

import { supabase } from '@/lib/supabase/client';
import { broadcastStoreBranding } from '@/lib/supabase/realtimeSync';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

export interface StoreBrandingConfig {
  storeName: string;
  slogan: string;
  logoUrl: string; // Base64 or URL
  phone: string;
  address: string;
  footerMessage: string;
  orderNumberPrefix?: string; // Tiền tố mã đơn (mặc định 'BK')
  orderCounter?: number; // Số thứ tự đơn hàng hiện tại (mặc định 0)
  orderCounterResetDate?: string; // Ngày reset gần nhất (YYYY-MM-DD)
  autoResetDaily?: boolean; // Tự động reset về 0 mỗi ngày mới
  updated_at?: string;
  updated_by?: string;
}

const STORAGE_KEY = 'bakery_store_branding';
export const BRANDING_UPDATED_EVENT = 'bakery_branding_updated';
const DB_ROW_ID = '00000000-0000-0000-0000-000000000003';
const DB_ROW_NAME = 'SYS_CONFIG_BRANDING';

export const DEFAULT_BRANDING: StoreBrandingConfig = {
  storeName: 'Tiệm Bánh ABC',
  slogan: 'Artisan Bakery & Coffee • Bánh Tươi Mỗi Ngày',
  logoUrl: '',
  phone: '0901 234 567',
  address: '123 Đường Bánh Ngọt, TP.HCM',
  footerMessage: 'Cảm ơn Quý khách & Hẹn gặp lại!',
  orderNumberPrefix: 'BK',
  orderCounter: 0,
  autoResetDaily: true,
};

let inMemoryBranding: StoreBrandingConfig | null = null;

/**
 * Lấy cấu hình thương hiệu tiệm bánh hiện tại từ bộ nhớ hoặc LocalStorage
 */
export function getStoreBranding(): StoreBrandingConfig {
  if (inMemoryBranding) return inMemoryBranding;
  if (typeof window === 'undefined') return DEFAULT_BRANDING;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const res: StoreBrandingConfig = { ...DEFAULT_BRANDING, ...parsed };
      inMemoryBranding = res;
      return res;
    }
  } catch (e) {
    console.error('Lỗi khi đọc cấu hình thương hiệu tiệm bánh:', e);
  }
  return DEFAULT_BRANDING;
}

/**
 * Lưu cấu hình thương hiệu tiệm bánh cục bộ và phát sự kiện đồng bộ
 */
export function saveStoreBranding(config: Partial<StoreBrandingConfig>): StoreBrandingConfig {
  const current = getStoreBranding();
  const updated: StoreBrandingConfig = { ...current, ...config };
  inMemoryBranding = updated;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT, { detail: updated }));

      // Đồng bộ thông tin tiệm vào cấu hình máy in nếu có
      try {
        const pRaw = localStorage.getItem('bakery_printer_config');
        if (pRaw) {
          const pConfig = JSON.parse(pRaw);
          pConfig.storeName = updated.storeName;
          pConfig.storeAddress = updated.address;
          pConfig.storeHotline = updated.phone;
          localStorage.setItem('bakery_printer_config', JSON.stringify(pConfig));
          window.dispatchEvent(new CustomEvent('bakery_printer_config_updated', { detail: pConfig }));
        }
      } catch {}
    } catch (e) {
      console.error('Lỗi khi lưu cấu hình thương hiệu tiệm bánh:', e);
    }
  }
  return updated;
}

/**
 * Tải cấu hình thương hiệu từ Supabase SQL (Đồng bộ đa thiết bị)
 */
export async function fetchStoreBrandingFromDb(): Promise<StoreBrandingConfig> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getStoreBranding();
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_ID},name.eq.${DB_ROW_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data && data.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed === 'object') {
          const loaded: StoreBrandingConfig = {
            storeName: parsed.storeName || DEFAULT_BRANDING.storeName,
            slogan: parsed.slogan || DEFAULT_BRANDING.slogan,
            logoUrl: parsed.logoUrl || '',
            phone: parsed.phone || DEFAULT_BRANDING.phone,
            address: parsed.address || DEFAULT_BRANDING.address,
            footerMessage: parsed.footerMessage || DEFAULT_BRANDING.footerMessage,
            orderNumberPrefix: parsed.orderNumberPrefix || DEFAULT_BRANDING.orderNumberPrefix,
            orderCounter: typeof parsed.orderCounter === 'number' ? parsed.orderCounter : 0,
            orderCounterResetDate: parsed.orderCounterResetDate,
            autoResetDaily: parsed.autoResetDaily !== undefined ? parsed.autoResetDaily : true,
            updated_at: parsed.updated_at,
            updated_by: parsed.updated_by,
          };
          saveStoreBranding(loaded);
          return loaded;
        }
      } catch (e) {
        console.warn('Lỗi phân tích cú pháp JSON thương hiệu từ SQL:', e);
      }
    }
  } catch (err) {
    console.warn('Lỗi kết nối fetchStoreBrandingFromDb:', err);
  }

  return getStoreBranding();
}

/**
 * Lưu cấu hình thương hiệu lên Supabase SQL và phát sóng Realtime cho toàn bộ các thiết bị
 */
export async function saveStoreBrandingToDb(
  config: Partial<StoreBrandingConfig>,
  updatedBy: string = 'admin'
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = getStoreBranding();
    const fullConfig: StoreBrandingConfig = {
      ...current,
      ...config,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    // 1. Lưu cục bộ trước để phản hồi ngay lập tức
    saveStoreBranding(fullConfig);

    // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
    try {
      autoSyncToLocalSqlFolder().catch(() => {});
    } catch {}

    // 2. Dùng upsert với onConflict: 'id' để không bao giờ bị lỗi duplicate key
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_ID,
        name: DB_ROW_NAME,
        notes: JSON.stringify(fullConfig),
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      console.warn('Upsert thương hiệu gặp lỗi, thử update trực tiếp:', upsertErr);

      // Cách 2: Thử update trực tiếp theo id
      const { data: updatedRows, error: updateErr } = await supabase
        .from('recipes')
        .update({
          name: DB_ROW_NAME,
          notes: JSON.stringify(fullConfig),
          is_active: false,
        })
        .eq('id', DB_ROW_ID)
        .select('id');

      // Cách 3: Nếu chưa có dòng nào thì xóa dòng cũ và insert mới
      if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
        await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_ID},name.eq.${DB_ROW_NAME}`);
        const { error: insertErr } = await supabase.from('recipes').insert({
          id: DB_ROW_ID,
          name: DB_ROW_NAME,
          notes: JSON.stringify(fullConfig),
          is_active: false,
        });

        if (insertErr) {
          console.error('Lỗi khi lưu cấu hình thương hiệu vào Supabase SQL:', insertErr);
          return { success: false, error: 'Lỗi lưu vào CSDL: ' + insertErr.message };
        }
      } else if (updateErr) {
        console.error('Lỗi update cấu hình thương hiệu vào Supabase SQL:', updateErr);
        return { success: false, error: 'Lỗi lưu vào CSDL: ' + updateErr.message };
      }
    }

    // 3. Phát sóng Realtime cho toàn bộ các thiết bị đang kết nối
    await broadcastStoreBranding(fullConfig);

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi ngoại lệ khi lưu thương hiệu lên SQL:', err);
    return { success: false, error: err.message || 'Lỗi lưu thương hiệu lên SQL' };
  }
}

/**
 * Lấy mã số đơn hàng xem trước (chưa tăng bộ đếm, dùng khi mở giao diện thanh toán)
 * Ví dụ: BK-20260919-001
 */
export function peekNextOrderNumber(customPrefix?: string): string {
  const current = getStoreBranding();
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  let currentCounter = Number(current.orderCounter || 0);

  // Nếu bật tự động reset theo ngày và ngày hiện tại khác ngày reset gần nhất
  if (current.autoResetDaily && current.orderCounterResetDate && current.orderCounterResetDate !== todayStr) {
    currentCounter = 0;
  }

  const nextCounter = currentCounter + 1;
  const prefix = customPrefix || current.orderNumberPrefix || 'BK';
  const seqPart = String(nextCounter).padStart(3, '0');

  return `${prefix}-${datePart}-${seqPart}`;
}

/**
 * Sinh mã số đơn hàng tiếp theo và tăng bộ đếm thêm 1 (Ví dụ: BK-20260919-001, BK-20260919-002...)
 */
export function getNextOrderNumber(customPrefix?: string): string {
  const current = getStoreBranding();
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  let currentCounter = Number(current.orderCounter || 0);

  // Nếu sang ngày mới và bật tự động reset theo ngày
  if (current.autoResetDaily && current.orderCounterResetDate && current.orderCounterResetDate !== todayStr) {
    currentCounter = 0;
  }

  const nextCounter = currentCounter + 1;

  // Cập nhật bộ đếm cục bộ
  saveStoreBranding({
    orderCounter: nextCounter,
    orderCounterResetDate: todayStr,
  });

  // Đồng bộ lên Supabase nếu online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    saveStoreBrandingToDb({
      ...current,
      orderCounter: nextCounter,
      orderCounterResetDate: todayStr,
    }).catch(() => {});
  }

  const prefix = customPrefix || current.orderNumberPrefix || 'BK';
  const seqPart = String(nextCounter).padStart(3, '0');

  return `${prefix}-${datePart}-${seqPart}`;
}

/**
 * Đặt lại (reset) bộ đếm mã số đơn hàng về 0 (hoặc một số cụ thể)
 */
export async function resetOrderCounter(val: number = 0): Promise<{ success: boolean; error?: string }> {
  const current = getStoreBranding();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const updatedConfig: Partial<StoreBrandingConfig> = {
    orderCounter: val,
    orderCounterResetDate: todayStr,
  };

  saveStoreBranding(updatedConfig);

  try {
    const res = await saveStoreBrandingToDb(updatedConfig);
    return res;
  } catch (err: any) {
    return { success: false, error: err?.message || 'Có lỗi xảy ra khi lưu lên CSDL' };
  }
}

