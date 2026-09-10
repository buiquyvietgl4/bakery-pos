// src/lib/utils/storeBranding.ts

export interface StoreBrandingConfig {
  storeName: string;
  slogan: string;
  logoUrl: string; // Base64 or URL
  phone: string;
  address: string;
  footerMessage: string;
}

const STORAGE_KEY = 'bakery_store_branding';
export const BRANDING_UPDATED_EVENT = 'bakery_branding_updated';

export const DEFAULT_BRANDING: StoreBrandingConfig = {
  storeName: 'Tiệm Bánh ABC',
  slogan: 'Artisan Bakery & Coffee • Bánh Tươi Mỗi Ngày',
  logoUrl: '',
  phone: '0901 234 567',
  address: '123 Đường Bánh Ngọt, TP.HCM',
  footerMessage: 'Cảm ơn Quý khách & Hẹn gặp lại!',
};

/**
 * Lấy cấu hình thương hiệu tiệm bánh hiện tại
 */
export function getStoreBranding(): StoreBrandingConfig {
  if (typeof window === 'undefined') return DEFAULT_BRANDING;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Lỗi khi đọc cấu hình thương hiệu tiệm bánh:', e);
  }
  return DEFAULT_BRANDING;
}

/**
 * Lưu cấu hình thương hiệu tiệm bánh và phát sự kiện đồng bộ toàn hệ thống
 */
export function saveStoreBranding(config: Partial<StoreBrandingConfig>): StoreBrandingConfig {
  const current = getStoreBranding();
  const updated = { ...current, ...config };
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
