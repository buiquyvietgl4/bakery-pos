import { describe, it, expect, beforeEach } from 'vitest';
import {
  cleanSupabaseUrl,
  extractProjectRef,
  getMultiSqlConfig,
  getActiveProfile,
  isProfileOutOfSyncWithEnv,
  fetchDatabaseLiveStats,
  cloneCloudDatabaseTables,
  saveDatabaseProfile,
  switchActiveEnvironment,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_TESTING_URL,
} from '@/lib/supabase/databaseProfileManager';

describe('Database Profile Manager & Cloud DB Utilities', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('cleanSupabaseUrl', () => {
    it('chuẩn hóa URL Supabase bỏ dấu gạch chéo cuối và đuôi rest/v1', () => {
      expect(cleanSupabaseUrl('https://xyz.supabase.co/')).toBe('https://xyz.supabase.co');
      expect(cleanSupabaseUrl('https://xyz.supabase.co/rest/v1')).toBe('https://xyz.supabase.co');
      expect(cleanSupabaseUrl('https://xyz.supabase.co/rest/v1/')).toBe('https://xyz.supabase.co');
      expect(cleanSupabaseUrl('https://xyz.supabase.co/rest')).toBe('https://xyz.supabase.co');
      expect(cleanSupabaseUrl('   https://xyz.supabase.co///  ')).toBe('https://xyz.supabase.co');
    });

    it('xử lý chuỗi rỗng an toàn', () => {
      expect(cleanSupabaseUrl('')).toBe('');
      expect(cleanSupabaseUrl(null as any)).toBe('');
      expect(cleanSupabaseUrl(undefined as any)).toBe('');
    });
  });

  describe('extractProjectRef', () => {
    it('trích xuất chính xác Project Ref từ URL Supabase', () => {
      expect(extractProjectRef('https://fhiuojcvsouwugatnmve.supabase.co')).toBe('fhiuojcvsouwugatnmve');
      expect(extractProjectRef('https://azgjnahbibrcbjooepef.supabase.co/rest/v1')).toBe('azgjnahbibrcbjooepef');
      expect(extractProjectRef('fhiuojcvsouwugatnmve.supabase.co')).toBe('fhiuojcvsouwugatnmve');
    });

    it('trả về chuỗi an toàn nếu không khớp chuẩn Supabase', () => {
      expect(extractProjectRef('')).toBe('');
      expect(extractProjectRef('https://custom-server.com')).toBe('custom-server');
    });
  });

  describe('Multi SQL Config Defaults & Profiles', () => {
    it('khởi tạo mặc định có đủ CSDL Chính và CSDL Dự Phòng', () => {
      const config = getMultiSqlConfig();
      expect(config.activeProfileId).toBe('production');
      expect(config.profiles.length).toBeGreaterThanOrEqual(2);

      const prod = config.profiles.find((p) => p.id === 'production');
      expect(prod).toBeDefined();
      expect(prod?.url).toContain('supabase.co');

      const test = config.profiles.find((p) => p.id === 'testing');
      expect(test).toBeDefined();
      expect(test?.url).toBe(DEFAULT_TESTING_URL);
    });

    it('getActiveProfile trả về profile production mặc định', () => {
      const active = getActiveProfile();
      expect(active.id).toBe('production');
      expect(active.url).toBe(DEFAULT_PRODUCTION_URL);
    });

    it('kiểm tra tính toàn vẹn trạng thái so với biến môi trường', () => {
      const syncInfo = isProfileOutOfSyncWithEnv();
      expect(syncInfo).toHaveProperty('isOutOfSync');
      expect(syncInfo).toHaveProperty('envUrl');
      expect(syncInfo).toHaveProperty('activeUrl');
    });

    it('cho phép lưu CSDL Thử Nghiệm ở trạng thái để trống (url và key rỗng)', () => {
      const cfg = saveDatabaseProfile({
        id: 'testing',
        name: 'CSDL Thử Nghiệm',
        description: 'Test blank',
        url: '',
        anonKey: '',
        isDefault: false,
      });
      const testProf = cfg.profiles.find((p) => p.id === 'testing');
      expect(testProf?.url).toBe('');
      expect(testProf?.anonKey).toBe('');
    });

    it('bảo vệ tách biệt: từ chối lưu CSDL Thử Nghiệm nếu có URL trùng với CSDL Chính', () => {
      expect(() => {
        saveDatabaseProfile({
          id: 'testing',
          name: 'CSDL Thử Nghiệm',
          description: 'Trùng CSDL Chính',
          url: DEFAULT_PRODUCTION_URL,
          anonKey: 'any-key',
          isDefault: false,
        });
      }).toThrowError(/không được dùng chung Project/);
    });

    it('chặn kích hoạt CSDL Thử Nghiệm nếu URL đang để trống', () => {
      saveDatabaseProfile({
        id: 'testing',
        name: 'CSDL Thử Nghiệm',
        description: 'Test blank',
        url: '',
        anonKey: '',
        isDefault: false,
      });

      expect(() => {
        switchActiveEnvironment('testing');
      }).toThrowError(/đang để trống URL/);
    });
  });

  describe('fetchDatabaseLiveStats validation', () => {
    it('trả về trạng thái rỗng an toàn khi URL hoặc Key không hợp lệ', async () => {
      const stats = await fetchDatabaseLiveStats('', '');
      expect(stats.isEmpty).toBe(true);
      expect(stats.isConnected).toBe(false);
      expect(stats.productsCount).toBe(0);
      expect(stats.ordersCount).toBe(0);
      expect(stats.error).toBeDefined();
    });
  });

  describe('cloneCloudDatabaseTables validation', () => {
    it('từ chối sao chép nếu thiếu thông tin Nguồn hoặc Đích', async () => {
      const res1 = await cloneCloudDatabaseTables({
        sourceUrl: '',
        sourceKey: '',
        targetUrl: 'https://test.supabase.co',
        targetKey: 'key',
      });
      expect(res1.success).toBe(false);
      expect(res1.error).toContain('Thiếu thông tin CSDL Nguồn');

      const res2 = await cloneCloudDatabaseTables({
        sourceUrl: 'https://test.supabase.co',
        sourceKey: 'key',
        targetUrl: '',
        targetKey: '',
      });
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('Thiếu thông tin CSDL Đích');
    });

    it('từ chối sao chép nếu CSDL Nguồn và Đích trùng nhau', async () => {
      const res = await cloneCloudDatabaseTables({
        sourceUrl: 'https://same.supabase.co',
        sourceKey: 'key1',
        targetUrl: 'https://same.supabase.co',
        targetKey: 'key2',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('không được trùng nhau');
    });
  });
});
