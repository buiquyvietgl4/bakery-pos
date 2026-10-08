import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getFullCakeBomConfig,
  saveFullCakeBomConfig,
  resetFullCakeBomConfig,
  calculateCakeCostDetails,
  EMPTY_FULL_CAKE_BOM_CONFIG,
  CAKE_BOM_CONFIG_KEY,
  CAKE_BOM_INITIALIZED_KEY,
  CAKE_BOM_UPDATED_EVENT,
} from '@/lib/utils/cakeBomManager';
import { INITIAL_FULL_CAKE_BOM_CONFIG } from '@/lib/constants/defaultCakeBomData';

describe('BOM Bánh Sinh Nhật & Reset Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('EMPTY_FULL_CAKE_BOM_CONFIG chứa đầy đủ các mảng rỗng', () => {
    expect(EMPTY_FULL_CAKE_BOM_CONFIG.cakeBases).toEqual([]);
    expect(EMPTY_FULL_CAKE_BOM_CONFIG.creamCoatings).toEqual([]);
    expect(EMPTY_FULL_CAKE_BOM_CONFIG.fillings).toEqual([]);
    expect(EMPTY_FULL_CAKE_BOM_CONFIG.packagings).toEqual([]);
    expect(EMPTY_FULL_CAKE_BOM_CONFIG.freeAccessories).toEqual([]);
    expect(EMPTY_FULL_CAKE_BOM_CONFIG.decorAddons).toEqual([]);
    expect(EMPTY_FULL_CAKE_BOM_CONFIG.birthdayBomPresets).toEqual([]);
  });

  it('getFullCakeBomConfig trả về INITIAL khi chưa từng khởi tạo', () => {
    const config = getFullCakeBomConfig();
    expect(config.cakeBases.length).toBeGreaterThan(0);
  });

  it('getFullCakeBomConfig trả về EMPTY sau khi đã reset (không tự ý nạp lại mock data)', () => {
    localStorage.setItem(CAKE_BOM_INITIALIZED_KEY, 'true');
    localStorage.setItem(CAKE_BOM_CONFIG_KEY, JSON.stringify(EMPTY_FULL_CAKE_BOM_CONFIG));

    const config = getFullCakeBomConfig();
    expect(config.cakeBases).toEqual([]);
    expect(config.creamCoatings).toEqual([]);
    expect(config.birthdayBomPresets).toEqual([]);
  });

  it('resetFullCakeBomConfig ghi nhận cấu hình rỗng và phát sự kiện', () => {
    const listener = vi.fn();
    window.addEventListener(CAKE_BOM_UPDATED_EVENT, listener);

    resetFullCakeBomConfig();

    expect(localStorage.getItem(CAKE_BOM_INITIALIZED_KEY)).toBe('true');
    const saved = JSON.parse(localStorage.getItem(CAKE_BOM_CONFIG_KEY) || '{}');
    expect(saved.cakeBases).toEqual([]);
    expect(listener).toHaveBeenCalled();

    window.removeEventListener(CAKE_BOM_UPDATED_EVENT, listener);
  });

  it('calculateCakeCostDetails không bị crash với cấu hình rỗng (0 cốt bánh, 0 kem phủ)', () => {
    expect(() => {
      const result = calculateCakeCostDetails(
        {
          cakeBaseId: 'non-existent',
          creamCoatingId: 'non-existent',
        },
        EMPTY_FULL_CAKE_BOM_CONFIG
      );
      expect(result.totalCost).toBe(0);
      expect(result.baseCost).toBe(0);
      expect(result.creamCost).toBe(0);
    }).not.toThrow();
  });
});
