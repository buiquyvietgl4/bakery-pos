// src/lib/utils/storeBranding.ts

import { supabase } from '@/lib/supabase/client';
import { broadcastStoreBranding } from '@/lib/supabase/realtimeSync';

export interface StoreBrandingConfig {
  storeName: string;
  slogan: string;
  logoUrl: string; // Base64 or URL
  phone: string;
  address: string;
  footerMessage: string;
  updated_at?: string;
  updated_by?: string;
}

const STORAGE_KEY = 'bakery_store_branding';
export const BRANDING_UPDATED_EVENT = 'bakery_branding_updated';
const DB_ROW_ID = '00000000-0000-0000-0000-000000000002';
const DB_ROW_NAME = 'SYS_CONFIG_BRANDING';

export const DEFAULT_BRANDING: StoreBrandingConfig = {
  storeName: 'Tiệm Bánh ABC',
  slogan: 'Artisan Bakery & Coffee • Bánh Tươi Mỗi Ngày',
  logoUrl: '',
  phone: '0901 234 567',
  address: '123 Đường Bánh Ngọt, TP.HCM',
  footerMessage: 'Cảm ơn Quý khách & Hẹn gặp lại!',
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
      .eq('name', DB_ROW_NAME)
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

    // 2. Xóa bản ghi cũ trên SQL để tránh trùng lặp
    await supabase.from('recipes').delete().eq('name', DB_ROW_NAME);

    // 3. Chèn bản ghi cấu hình thương hiệu mới vào Supabase SQL
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

    // 4. Phát sóng Realtime cho toàn bộ các thiết bị đang kết nối
    await broadcastStoreBranding(fullConfig);

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi ngoại lệ khi lưu thương hiệu lên SQL:', err);
    return { success: false, error: err.message || 'Lỗi lưu thương hiệu lên SQL' };
  }
}
