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

  it('fetchAndApplyGlobalSqlProfile không thay đổi nếu CSDL trên server trùng khớp với CSDL hiện tại', async () => {
    const currentConfig = getMultiSqlConfig();
    const prod = currentConfig.profiles.find((p) => p.id === 'production')!;

    // Mock API server trả về cùng CSDL
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          url: prod.url,
          anonKey: prod.anonKey,
          updatedAt: prod.updatedAt,
        },
      }),
    } as any);

    const res = await fetchAndApplyGlobalSqlProfile();
    expect(res.changed).toBe(false);
  });
});
