import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveGlobalProductionSql,
  fetchAndApplyGlobalSqlProfile,
  getMultiSqlConfig,
  saveDatabaseProfile,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_PRODUCTION_KEY,
} from '@/lib/supabase/databaseProfileManager';

describe('Global Production SQL Synchronization', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('saveGlobalProductionSql cập nhật cấu hình local và chuẩn bị dữ liệu đồng bộ', async () => {
    // Mock fetch cho /api/system/database-profile
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as any);

    const testUrl = 'https://custom-bakery-db.supabase.co';
    const testKey = 'sb_publishable_newKey1234567890';

    const res = await saveGlobalProductionSql(testUrl, testKey, 'CSDL Chính (Vận Hành)');

    expect(res.success).toBe(true);
    const config = getMultiSqlConfig();
    const prod = config.profiles.find((p) => p.id === 'production');
    expect(prod).toBeDefined();
    expect(prod?.url).toBe(testUrl);
    expect(prod?.anonKey).toBe(testKey);

    // Xác nhận đã gọi API đồng bộ server
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/system/database-profile',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('fetchAndApplyGlobalSqlProfile phát hiện và tự động áp dụng CSDL mới từ server API', async () => {
    const updatedUrl = 'https://store-two-db.supabase.co';
    const updatedKey = 'sb_publishable_newStoreKey999';

    // Mock API server trả về CSDL mới
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          url: updatedUrl,
          anonKey: updatedKey,
          updatedAt: new Date().toISOString(),
        },
      }),
    } as any);

    const res = await fetchAndApplyGlobalSqlProfile();

    expect(res.changed).toBe(true);
    expect(res.updatedProfile?.url).toBe(updatedUrl);
    expect(res.updatedProfile?.anonKey).toBe(updatedKey);

    // Kiểm tra cấu hình đã được nạp vào localStorage
    const config = getMultiSqlConfig();
    const currentProd = config.profiles.find((p) => p.id === 'production');
    expect(currentProd?.url).toBe(updatedUrl);
    expect(currentProd?.anonKey).toBe(updatedKey);
  });

  it('fetchAndApplyGlobalSqlProfile bảo vệ cấu hình tùy biến của client khi server chỉ trả về fallback mặc định (isDefault: true)', async () => {
    // Client đã cấu hình CSDL tùy biến
    const userCustomUrl = 'https://my-own-bakery.supabase.co';
    const userCustomKey = 'sb_publishable_myKey777';

    saveDatabaseProfile(
      {
        id: 'production',
        name: 'CSDL Chính (Vận Hành)',
        description: 'Tùy biến của tôi',
        url: userCustomUrl,
        anonKey: userCustomKey,
        isCustomized: true,
        version: 1000,
      },
      'fetch_from_new'
    );

    // Mock server API chỉ trả về fallback mặc định
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        isDefault: true,
        isCustom: false,
        data: {
          url: DEFAULT_PRODUCTION_URL,
          anonKey: DEFAULT_PRODUCTION_KEY,
          version: 0,
          isDefault: true,
          isCustom: false,
        },
      }),
    } as any);

    const res = await fetchAndApplyGlobalSqlProfile();

    // Client TUYỆT ĐỐI KHÔNG BỊ GHI ĐÈ BỞI DEFAULT FALLBACK CỦA SERVER!
    expect(res.changed).toBe(false);

    const cfg = getMultiSqlConfig();
    const prod = cfg.profiles.find((p) => p.id === 'production');
    expect(prod?.url).toBe(userCustomUrl);
    expect(prod?.anonKey).toBe(userCustomKey);
  });

  it('fetchAndApplyGlobalSqlProfile không bị ghi đè nếu server gửi cấu hình có version cũ hơn client', async () => {
    const userCustomUrl = 'https://latest-db.supabase.co';
    const userCustomKey = 'sb_publishable_latestKey111';

    saveDatabaseProfile(
      {
        id: 'production',
        name: 'CSDL Chính (Vận Hành)',
        description: 'Cấu hình mới nhất',
        url: userCustomUrl,
        anonKey: userCustomKey,
        isCustomized: true,
        version: 5000,
        updatedAt: '2026-10-08T16:00:00.000Z',
      },
      'fetch_from_new'
    );

    // Mock server API trả về cấu hình cũ hơn (version 3000 < 5000)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        isCustom: true,
        isDefault: false,
        data: {
          url: 'https://older-db.supabase.co',
          anonKey: 'sb_publishable_olderKey222',
          version: 3000,
          updatedAt: '2026-10-08T15:00:00.000Z',
          isCustom: true,
          isDefault: false,
        },
      }),
    } as any);

    const res = await fetchAndApplyGlobalSqlProfile();

    expect(res.changed).toBe(false);

    const cfg = getMultiSqlConfig();
    const prod = cfg.profiles.find((p) => p.id === 'production');
    expect(prod?.url).toBe(userCustomUrl);
    expect(prod?.anonKey).toBe(userCustomKey);
  });
});
