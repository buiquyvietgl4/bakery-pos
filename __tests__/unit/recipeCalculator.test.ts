import { describe, it, expect } from 'vitest';
import { parseRecipeItem, formatScaledQty, normalizeRecipe } from '@/lib/utils/recipeCalculator';

describe('parseRecipeItem', () => {
  it('xử lý input rỗng hoặc falsy', () => {
    expect(parseRecipeItem(null)).toEqual({ numericQty: 0, unit: 'g', baseDisplay: '0' });
    expect(parseRecipeItem(undefined)).toEqual({ numericQty: 0, unit: 'g', baseDisplay: '0' });
  });

  it('xử lý item có quantity dạng số và unit tách biệt', () => {
    const res = parseRecipeItem({ quantity: 500, unit: 'g' });
    expect(res.numericQty).toBe(500);
    expect(res.unit).toBe('g');
  });

  it('xử lý item có qty >= 1000 định dạng baseDisplay có dấu phân cách', () => {
    const res = parseRecipeItem({ quantity: 1500, unit: 'g' });
    expect(res.numericQty).toBe(1500);
    expect(res.unit).toBe('g');
    expect(res.baseDisplay).toContain('1');
    expect(res.baseDisplay).toContain('500');
  });

  it('xử lý chuỗi kết hợp số và đơn vị (ví dụ: 500g, 200ml, 6 quả)', () => {
    const r1 = parseRecipeItem({ quantity: '500g' });
    expect(r1.numericQty).toBe(500);
    expect(r1.unit).toBe('g');

    const r2 = parseRecipeItem({ quantity: '200ml' });
    expect(r2.numericQty).toBe(200);
    expect(r2.unit).toBe('ml');

    const r3 = parseRecipeItem({ quantity: '6 quả' });
    expect(r3.numericQty).toBe(6);
    expect(r3.unit).toBe('quả');
  });

  it('xử lý số thập phân có dấu chấm hoặc dấu phẩy (ví dụ: 1.5 kg, 2,5 lit)', () => {
    const r1 = parseRecipeItem({ quantity: '1.5 kg' });
    expect(r1.numericQty).toBe(1.5);
    expect(r1.unit).toBe('kg');

    const r2 = parseRecipeItem({ quantity: '2,5 lít' });
    expect(r2.numericQty).toBe(2.5);
    expect(r2.unit).toBe('lít');
  });
});

describe('formatScaledQty', () => {
  it('xử lý 0 hoặc NaN', () => {
    expect(formatScaledQty(0)).toBe('0');
    expect(formatScaledQty(NaN)).toBe('0');
  });

  it('xử lý số nguyên', () => {
    expect(formatScaledQty(50)).toBe('50');
    const large = formatScaledQty(1200);
    expect(large).toContain('1');
    expect(large).toContain('200');
  });

  it('xử lý số thập phân', () => {
    const res = formatScaledQty(1.25);
    expect(res).toContain('1');
    expect(res).toContain('25');
  });
});

describe('normalizeRecipe', () => {
  it('tính toán chi phí giá vốn (BOM) và giá đề xuất', () => {
    const rawRecipe = {
      id: 'rec-test-01',
      name: 'Bánh Mì Test',
      yield_qty: 10,
      yield_unit: 'chiếc',
      target_food_cost_pct: 30, // 30%
      items: [
        { name: 'Bột mì', quantity: 1000, unit: 'g', line_cost: 20000 },
        { name: 'Bơ lạt', quantity: 200, unit: 'g', line_cost: 40000 },
      ]
    };

    const normalized: any = normalizeRecipe(rawRecipe);
    expect(normalized.yield_qty).toBe(10);
    // Tổng cost = 20000 + 40000 = 60000.
    // cost_per_unit = 60000 / 10 = 6000.
    expect(normalized.cost_per_unit).toBe(6000);
    // suggested_price = Math.round((6000 / 0.3) / 1000) * 1000 = 20000.
    expect(normalized.suggested_price).toBe(20000);
    expect(normalized.bake_time_minutes).toBe(25); // default
    expect(normalized.bake_temp_celsius).toBe(190); // default
  });

  it('giữ nguyên nếu input không phải object', () => {
    expect(normalizeRecipe(null)).toBe(null);
    expect(normalizeRecipe(undefined)).toBe(undefined);
  });
});
