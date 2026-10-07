import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNIFIED_SQL_ENVS,
  getActiveUnifiedSqlEnv,
  getActiveUnifiedSqlEnvInfo,
  switchUnifiedSqlEnv,
} from '@/lib/utils/unifiedSqlManager';
import { getSqlModeConfig, saveSqlModeConfig } from '@/lib/utils/sqlModeManager';
import { saveDatabaseProfile, getMultiSqlConfig } from '@/lib/supabase/databaseProfileManager';

describe('Unified SQL Environment Manager (4-Environment Isolation)', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('UNIFIED_SQL_ENVS definition', () => {
    it('định nghĩa đầy đủ và chính xác 4 môi trường CSDL độc lập', () => {
      const keys = Object.keys(UNIFIED_SQL_ENVS);
      expect(keys).toEqual([
        'cloud_production',
        'cloud_testing',
        'local_production',
        'local_testing',
      ]);

      // Cloud Chính
      expect(UNIFIED_SQL_ENVS.cloud_production.category).toBe('cloud');
      expect(UNIFIED_SQL_ENVS.cloud_production.isTest).toBe(false);
      expect(UNIFIED_SQL_ENVS.cloud_production.storageLocation).toContain('supabase.co');

      // Cloud Test
      expect(UNIFIED_SQL_ENVS.cloud_testing.category).toBe('cloud');
      expect(UNIFIED_SQL_ENVS.cloud_testing.isTest).toBe(true);
      expect(UNIFIED_SQL_ENVS.cloud_testing.storageLocation).toContain('supabase.co');

      // Local Chính
      expect(UNIFIED_SQL_ENVS.local_production.category).toBe('local');
      expect(UNIFIED_SQL_ENVS.local_production.isTest).toBe(false);
      expect(UNIFIED_SQL_ENVS.local_production.storageLocation).toContain('SQL LOCAL');

      // Local Test
      expect(UNIFIED_SQL_ENVS.local_testing.category).toBe('local');
      expect(UNIFIED_SQL_ENVS.local_testing.isTest).toBe(true);
      expect(UNIFIED_SQL_ENVS.local_testing.storageLocation).toContain('SQL TEST');
    });
  });

  describe('getActiveUnifiedSqlEnv detection', () => {
    it('nhận diện chính xác Cloud SQL Chính khi mặc định', () => {
      expect(getActiveUnifiedSqlEnv()).toBe('cloud_production');
      const info = getActiveUnifiedSqlEnvInfo();
      expect(info.shortName).toBe('Cloud SQL Chính');
    });

    it('nhận diện chính xác khi chuyển sang Local SQL Chính', () => {
      saveSqlModeConfig({ mode: 'local', activeLocalEnv: 'production' });
      expect(getActiveUnifiedSqlEnv()).toBe('local_production');
    });

    it('nhận diện chính xác khi chuyển sang Local SQL Test', () => {
      saveSqlModeConfig({ mode: 'local', activeLocalEnv: 'testing' });
      expect(getActiveUnifiedSqlEnv()).toBe('local_testing');
    });
  });

  describe('switchUnifiedSqlEnv isolation', () => {
    it('chuyển đổi độc lập sang local_testing', () => {
      switchUnifiedSqlEnv('local_testing');
      expect(getActiveUnifiedSqlEnv()).toBe('local_testing');
      const cfg = getSqlModeConfig();
      expect(cfg.mode).toBe('local');
      expect(cfg.activeLocalEnv).toBe('testing');
    });

    it('chuyển đổi độc lập sang local_production', () => {
      switchUnifiedSqlEnv('local_production');
      expect(getActiveUnifiedSqlEnv()).toBe('local_production');
      const cfg = getSqlModeConfig();
      expect(cfg.mode).toBe('local');
      expect(cfg.activeLocalEnv).toBe('production');
    });

    it('chuyển đổi độc lập quay về cloud_production', () => {
      switchUnifiedSqlEnv('local_testing');
      switchUnifiedSqlEnv('cloud_production');
      expect(getActiveUnifiedSqlEnv()).toBe('cloud_production');
      const cfg = getSqlModeConfig();
      expect(cfg.mode).toBe('online');
    });
  });
});
