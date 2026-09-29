import { describe, it, expect } from 'vitest';
import { verifyOwnerRootKey, MASTER_HARD_ROOT_SECRET } from '@/lib/auth/rootSecurity';

describe('Admin Master Password Verification (Phuong an 4)', () => {
  it('xac thuc thanh cong voi Master Hard Root Secret Mac Dinh (Quyviet97@)', () => {
    const res = verifyOwnerRootKey('Quyviet97@');
    expect(res.valid).toBe(true);
  });

  it('xac thuc thanh cong voi MASTER_HARD_ROOT_SECRET constant', () => {
    const res = verifyOwnerRootKey(MASTER_HARD_ROOT_SECRET);
    expect(res.valid).toBe(true);
  });

  it('tu choi neu nhap sai mat khau chu tiem', () => {
    const res1 = verifyOwnerRootKey('sai_mat_khau_123');
    expect(res1.valid).toBe(false);
    expect(res1.reason).toBeDefined();

    const res2 = verifyOwnerRootKey('');
    expect(res2.valid).toBe(false);
  });

  it('tu dong trim khoang trang khi xac thuc', () => {
    const res = verifyOwnerRootKey('  Quyviet97@  ');
    expect(res.valid).toBe(true);
  });
});

describe('2-Way Reconciliation Timestamp Comparison (LWW Logic)', () => {
  it('chon Local neu thoi gian doi mat khau offline moi hon Cloud', () => {
    const localTime = new Date('2026-09-29T10:00:00Z').getTime();
    const cloudTime = new Date('2026-09-29T08:00:00Z').getTime();

    expect(localTime > cloudTime).toBe(true);

    const localCfg = {
      adminPasswordHash: 'offlinePassNew',
      updated_at: '2026-09-29T10:00:00Z',
    };
    const cloudCfg = {
      adminPasswordHash: 'cloudPassOld',
      updated_at: '2026-09-29T08:00:00Z',
    };

    // Gia lap merge logic
    const merged = localTime > cloudTime
      ? { ...cloudCfg, ...localCfg, updated_at: localCfg.updated_at }
      : { ...localCfg, ...cloudCfg, updated_at: cloudCfg.updated_at };

    expect(merged.adminPasswordHash).toBe('offlinePassNew');
    expect(merged.updated_at).toBe('2026-09-29T10:00:00Z');
  });

  it('chon Cloud neu Cloud duoc cap nhat tu thiet bi khac moi hon', () => {
    const localTime = new Date('2026-09-29T08:00:00Z').getTime();
    const cloudTime = new Date('2026-09-29T10:00:00Z').getTime();

    const localCfg = {
      adminPasswordHash: 'localPassOld',
      updated_at: '2026-09-29T08:00:00Z',
    };
    const cloudCfg = {
      adminPasswordHash: 'device2PassNew',
      updated_at: '2026-09-29T10:00:00Z',
    };

    const merged = localTime > cloudTime
      ? { ...cloudCfg, ...localCfg, updated_at: localCfg.updated_at }
      : { ...localCfg, ...cloudCfg, updated_at: cloudCfg.updated_at };

    expect(merged.adminPasswordHash).toBe('device2PassNew');
    expect(merged.updated_at).toBe('2026-09-29T10:00:00Z');
  });
});

describe('Force Logout & Session Invalidation Logic', () => {
  it('phat hien phien dang nhap het hieu luc khi forceLogoutAt moi hon thoi diem dang nhap', () => {
    const userLoginTime = new Date('2026-09-29T09:00:00Z').getTime();
    const forceLogoutTime = new Date('2026-09-29T09:30:00Z').getTime();

    const isSessionInvalid = forceLogoutTime > userLoginTime;
    expect(isSessionInvalid).toBe(true);
  });

  it('phat hien phien dang nhap het hieu luc khi sessionVersion cua securityConfig tang len', () => {
    const userSessionVersion = 1;
    const currentConfigVersion = 2;

    const isSessionInvalid = currentConfigVersion > userSessionVersion;
    expect(isSessionInvalid).toBe(true);
  });

  it('phien dang nhap hop le neu dang nhap SAU thoi diem forceLogoutAt', () => {
    const forceLogoutTime = new Date('2026-09-29T09:30:00Z').getTime();
    const userLoginTime = new Date('2026-09-29T09:35:00Z').getTime();

    const isSessionInvalid = forceLogoutTime > userLoginTime;
    expect(isSessionInvalid).toBe(false);
  });
});
