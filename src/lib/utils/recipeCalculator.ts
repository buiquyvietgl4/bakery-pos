// src/lib/utils/recipeCalculator.ts

export interface ParsedRecipeItem {
  numericQty: number;
  unit: string;
  baseDisplay: string;
}

/**
 * Phân tích an toàn định lượng nguyên liệu từ bất kỳ định dạng nào:
 * - Số nguyên/thập phân: 500, 1.5
 * - Chuỗi kèm đơn vị: '500g', '200ml', '6 quả', '1.5 kg', '250 g'
 * - Object có quantity và unit riêng biệt
 */
export function parseRecipeItem(item: any): ParsedRecipeItem {
  if (!item) return { numericQty: 0, unit: 'g', baseDisplay: '0' };

  let rawQty = item.quantity !== undefined && item.quantity !== null 
    ? item.quantity 
    : item.qty;
  let unit = (item.unit || '').trim();

  // 1. Nếu rawQty đã là số chuẩn
  if (typeof rawQty === 'number' && !isNaN(rawQty)) {
    const finalUnit = unit || 'g';
    return {
      numericQty: rawQty,
      unit: finalUnit,
      baseDisplay: rawQty >= 1000 ? rawQty.toLocaleString('vi-VN') : `${rawQty}`,
    };
  }

  // 2. Nếu rawQty là chuỗi (ví dụ: '500g', '200ml', '6 quả', '1.5 kg', '250 g', '8 quả')
  const rawStr = String(rawQty || '').trim();
  const match = rawStr.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/);
  if (match) {
    const num = parseFloat(match[1].replace(',', '.'));
    let parsedUnit = match[2].trim();
    if (!parsedUnit && unit) parsedUnit = unit;
    if (!parsedUnit) parsedUnit = 'g';

    const cleanNum = isNaN(num) ? 0 : num;
    return {
      numericQty: cleanNum,
      unit: parsedUnit,
      baseDisplay: cleanNum >= 1000 ? cleanNum.toLocaleString('vi-VN') : `${cleanNum}`,
    };
  }

  return {
    numericQty: 0,
    unit: unit || 'g',
    baseDisplay: rawStr || '0',
  };
}

/**
 * Định dạng khối lượng nguyên liệu sau khi nhân tỉ lệ mẻ bánh
 * - Số nguyên: 100 -> "100", 1200 -> "1.200"
 * - Số thập phân: 1.25 -> "1,3" hoặc "1,25"
 */
export function formatScaledQty(val: number): string {
  if (isNaN(val) || val === 0) return '0';
  if (Number.isInteger(val)) {
    return val >= 1000 ? val.toLocaleString('vi-VN') : `${val}`;
  }
  // Số thập phân: Nếu >= 10 thì làm tròn 1 chữ số, nhỏ hơn 10 làm tròn tối đa 2 chữ số
  const rounded = val >= 10 ? Number(val.toFixed(1)) : Number(val.toFixed(2));
  return rounded.toLocaleString('vi-VN');
}

/**
 * Chuẩn hóa toàn bộ một công thức bánh để luôn có quantity dạng số và unit tách biệt
 */
export function normalizeRecipe<T = any>(recipe: T): T {
  if (!recipe || typeof recipe !== 'object') return recipe;
  const rec = recipe as any;
  const items = (rec.items || []).map((item: any) => {
    const parsed = parseRecipeItem(item);
    return {
      ...item,
      quantity: parsed.numericQty,
      qty: parsed.numericQty,
      unit: parsed.unit,
    };
  });
  return {
    ...rec,
    items,
  };
}
