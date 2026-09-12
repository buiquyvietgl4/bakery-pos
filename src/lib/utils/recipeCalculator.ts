// src/lib/utils/recipeCalculator.ts

import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { DEFAULT_BAKERY_RECIPES, BakeryRecipe } from '@/lib/constants/bakeryData';

export const RECIPES_UPDATED_EVENT = 'bakery_recipes_updated';
const STORAGE_KEY_RECIPES = 'bakery_recipes';

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

/**
 * Lấy danh sách công thức đang lưu trong bộ nhớ cục bộ
 */
export function getStoredRecipes(): BakeryRecipe[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RECIPES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeRecipe);
        }
      }
    } catch {}
  }
  return DEFAULT_BAKERY_RECIPES.map(normalizeRecipe);
}

/**
 * Tải toàn bộ công thức BOM và định lượng từ Supabase Cloud
 */
export async function fetchRecipesFromDb(): Promise<BakeryRecipe[]> {
  const fallback = getStoredRecipes();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const [recipesRes, itemsRes, ingsRes] = await Promise.all([
      supabase
        .from('recipes')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('recipe_items')
        .select('*'),
      supabase
        .from('ingredients')
        .select('id, name, unit, avg_cost')
    ]);

    if (recipesRes.error || !recipesRes.data) {
      console.warn('Lỗi tải recipes từ Supabase:', recipesRes.error);
      return fallback;
    }

    const cleanRecipes = recipesRes.data.filter(
      (r: any) => !r.name?.startsWith('SYS_') && r.is_active !== false
    );

    if (cleanRecipes.length === 0) {
      return fallback;
    }

    const ings = ingsRes.data || [];
    const ingMap = new Map(ings.map((i: any) => [i.id, i]));

    const items = itemsRes.data || [];
    const itemsByRecipe = new Map<string, any[]>();
    items.forEach((it: any) => {
      if (!itemsByRecipe.has(it.recipe_id)) itemsByRecipe.set(it.recipe_id, []);
      const ing = ingMap.get(it.ingredient_id);
      itemsByRecipe.get(it.recipe_id)!.push({
        id: it.id,
        ingredient_id: it.ingredient_id,
        name: ing?.name || it.ingredient_name || 'Nguyên liệu',
        quantity: Number(it.quantity) || 0,
        qty: Number(it.quantity) || 0,
        unit: it.unit || ing?.unit || 'g',
        cost: Number(it.line_cost) || 0,
      });
    });

    const fullRecipes: BakeryRecipe[] = cleanRecipes.map((r: any) => {
      const itemsList = itemsByRecipe.get(r.id) || [];
      let bakeTime = Number(r.bake_time_minutes) || 25;
      let bakeTemp = Number(r.bake_temp_celsius) || 190;
      let noteText = r.notes || '';

      if (r.notes && typeof r.notes === 'string' && r.notes.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(r.notes);
          if (parsed.bake_time_minutes) bakeTime = Number(parsed.bake_time_minutes);
          if (parsed.bake_temp_celsius) bakeTemp = Number(parsed.bake_temp_celsius);
          if (parsed.notes !== undefined) noteText = parsed.notes;
        } catch {}
      }

      return normalizeRecipe({
        id: r.id,
        name: r.name,
        category: r.category || 'Bánh tươi',
        yield_qty: Number(r.yield_qty) || 1,
        yield_unit: r.yield_unit || 'chiếc',
        cost_per_unit: Number(r.cost_per_unit) || 0,
        target_food_cost_pct: r.target_food_cost_pct || 35,
        suggested_price: r.suggested_price || Math.round((Number(r.cost_per_unit) || 0) / 0.35),
        bake_time_minutes: bakeTime,
        bake_temp_celsius: bakeTemp,
        description: r.description || noteText,
        notes: noteText,
        items: itemsList,
      });
    });

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_RECIPES, JSON.stringify(fullRecipes));
        window.dispatchEvent(new CustomEvent(RECIPES_UPDATED_EVENT, { detail: fullRecipes }));
      } catch {}
    }

    return fullRecipes;
  } catch (err) {
    console.error('Lỗi khi fetchRecipesFromDb:', err);
    return fallback;
  }
}
