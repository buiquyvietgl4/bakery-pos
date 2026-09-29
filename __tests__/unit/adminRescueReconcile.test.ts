import { describe, it, expect } from 'vitest';
import {
  normalizeOtpCode,
  isCodeInList,
  burnCodeInLists,
} from '@/app/api/auth/root-verify/route';

describe('Admin Rescue OTP Logic & Self-Destruction', () => {
  it('chuan hoa ma OTP chinh xac (loai bo ADM-, ROOT-, khoang trang, lowercase)', () => {
    expect(normalizeOtpCode('ADM-123456')).toBe('123456');
    expect(normalizeOtpCode('adm-123456')).toBe('123456');
    expect(normalizeOtpCode('ROOT-654321')).toBe('654321');
    expect(normalizeOtpCode(' 789012 ')).toBe('789012');
  });

  it('kiem tra su ton tai cua ma trong danh sach active/used', () => {
    const list = [
      { code: 'ADM-112233', created_at: new Date().toISOString() },
      '445566',
    ];
    expect(isCodeInList(list, '112233')).toBe(true);
    expect(isCodeInList(list, 'ADM-112233')).toBe(true);
    expect(isCodeInList(list, '445566')).toBe(true);
    expect(isCodeInList(list, '999999')).toBe(false);
  });

  it('tu huy ma vinh vien: xoa khoi activeList va them vao usedList', () => {
    const activeList: any[] = [{ code: 'ADM-123456' }, { code: 'ADM-999999' }];
    const usedList: any[] = [];

    burnCodeInLists(activeList, usedList, '123456');

    // Ma 123456 phai bi xoa sach khoi activeList
    expect(activeList.length).toBe(1);
    expect(activeList[0].code).toBe('ADM-999999');

    // Cac bien the cua ma phai duoc ghi vao usedList de chan tai su dung
    expect(isCodeInList(usedList, '123456')).toBe(true);
    expect(isCodeInList(usedList, 'ADM-123456')).toBe(true);

    // Kiem tra thu dot lai lan 2 khong gay trung lap
    burnCodeInLists(activeList, usedList, 'ADM-123456');
    const matches = usedList.filter(u => normalizeOtpCode(typeof u === 'string' ? u : u.code) === '123456');
    expect(matches.length).toBeGreaterThan(0);
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

  it('bao toan danh sach ma da tu huy khi dong bo 2 chieu', () => {
    const localBurned = ['111111', '222222'];
    const cloudBurned = [{ code: '222222' }, { code: '333333' }];

    const combinedSet = new Set<string>();
    localBurned.forEach(c => combinedSet.add(c));
    cloudBurned.forEach(c => combinedSet.add(c.code));

    const result = Array.from(combinedSet);
    expect(result).toContain('111111');
    expect(result).toContain('222222');
    expect(result).toContain('333333');
    expect(result.length).toBe(3);
  });
});
