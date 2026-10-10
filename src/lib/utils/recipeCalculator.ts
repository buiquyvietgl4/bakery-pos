// src/lib/utils/recipeCalculator.ts

import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { broadcastRecipeChange } from '@/lib/supabase/realtimeSync';
import { filterActiveIngredients, getDeletedIngredientIds } from '@/lib/utils/ingredientManager';
import { DEFAULT_BAKERY_RECIPES, BakeryRecipe } from '@/lib/constants/bakeryData';

export const RECIPES_UPDATED_EVENT = 'bakery_recipes_updated';
export const BAKERY_RECIPES_KEY = 'bakery_recipes';
const STORAGE_KEY_RECIPES = BAKERY_RECIPES_KEY;
export const BAKERY_RECIPES_INITIALIZED_KEY = 'bakery_recipes_initialized';

export const BAKERY_DELETED_RECIPE_IDS_KEY = 'bakery_deleted_recipe_ids';
export const DB_ROW_DELETED_RECIPES_ID = '00000000-0000-0000-0000-000000000046';
export const DB_ROW_DELETED_RECIPES_NAME = 'SYS_CONFIG_DELETED_RECIPES';

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
    const itemCost = Number(item.cost !== undefined ? item.cost : (item.line_cost !== undefined ? item.line_cost : 0)) || 0;
    return {
      ...item,
      quantity: parsed.numericQty,
      qty: parsed.numericQty,
      unit: parsed.unit,
      cost: itemCost,
      line_cost: itemCost,
    };
  });

  const totalCost = items.reduce((sum: number, it: any) => sum + (Number(it.cost) || 0), 0);
  const yieldQty = Number(rec.yield_qty) > 0 ? Number(rec.yield_qty) : 1;
  const costPerUnit = Number(rec.cost_per_unit) > 0 ? Number(rec.cost_per_unit) : Math.round(totalCost / yieldQty);
  const targetFoodCost = Number(rec.target_food_cost_pct) > 0 ? Number(rec.target_food_cost_pct) : 35;
  const suggestedPrice = Number(rec.suggested_price) > 0
    ? Number(rec.suggested_price)
    : Math.round((costPerUnit / (targetFoodCost / 100)) / 1000) * 1000;

  return {
    ...rec,
    yield_qty: yieldQty,
    yield_unit: rec.yield_unit || 'chiếc',
    cost_per_unit: costPerUnit,
    target_food_cost_pct: targetFoodCost,
    suggested_price: suggestedPrice,
    bake_time_minutes: Number(rec.bake_time_minutes) || 25,
    bake_temp_celsius: Number(rec.bake_temp_celsius) || 190,
    items,
  };
}

/**
 * Lấy danh sách Set các ID và Tên công thức bánh đã bị người dùng chủ động xóa.
 */
export function getDeletedRecipeIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(BAKERY_DELETED_RECIPE_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map((item) => String(item).toLowerCase().trim()));
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc bakery_deleted_recipe_ids:', e);
  }
  return new Set();
}

/**
 * Lọc bỏ các công thức đã bị xóa hoặc là row cấu hình hệ thống SYS_
 */
export function filterActiveRecipes(recipes: any[]): any[] {
  if (!Array.isArray(recipes)) return [];
  const deletedSet = getDeletedRecipeIds();

  return recipes.filter((rec) => {
    if (!rec) return false;
    const name = String(rec.name || '').trim();
    const id = String(rec.id || '').trim();
    if (name.startsWith('SYS_') || id.startsWith('SYS_')) return false;
    if (rec.is_active === false) return false;

    // Kiểm tra danh sách đen xóa
    if (id && deletedSet.has(id.toLowerCase())) return false;
    if (name && deletedSet.has(name.toLowerCase())) return false;

    return true;
  });
}

/**
 * Đồng bộ danh sách đen công thức bánh đã xóa lên Supabase SQL
 */
export async function syncDeletedRecipeIdsToDb(deletedIds: string[]): Promise<void> {
  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_DELETED_RECIPES_ID,
        name: DB_ROW_DELETED_RECIPES_NAME,
        yield_qty: 1,
        yield_unit: 'config',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: JSON.stringify(deletedIds),
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('Lỗi syncDeletedRecipeIdsToDb:', err);
  }
}

/**
 * Tải danh sách công thức bánh đã xóa từ Supabase SQL
 */
export async function fetchDeletedRecipeIdsFromDb(): Promise<string[]> {
  if (isLocalMode()) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_DELETED_RECIPES_ID},name.eq.${DB_ROW_DELETED_RECIPES_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        if (typeof window !== 'undefined') {
          const localSet = getDeletedRecipeIds();
          parsed.forEach((id) => localSet.add(String(id).toLowerCase().trim()));
          localStorage.setItem(BAKERY_DELETED_RECIPE_IDS_KEY, JSON.stringify(Array.from(localSet)));
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchDeletedRecipeIdsFromDb:', err);
  }
  return [];
}

/**
 * Đánh dấu công thức bánh vào danh sách đen xóa vĩnh viễn (Anti-Resurrection Tombstone)
 */
export function markRecipeAsDeleted(id: string, name?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedRecipeIds();
    if (id) set.add(String(id).toLowerCase().trim());
    if (name) set.add(String(name).toLowerCase().trim());

    const arr = Array.from(set);
    localStorage.setItem(BAKERY_DELETED_RECIPE_IDS_KEY, JSON.stringify(arr));

    // Cập nhật ngay trong localStorage('bakery_recipes')
    const rawRecs = localStorage.getItem(BAKERY_RECIPES_KEY);
    if (rawRecs) {
      const parsed = JSON.parse(rawRecs);
      if (Array.isArray(parsed)) {
        const remaining = parsed.filter(
          (r) =>
            String(r.id).toLowerCase().trim() !== String(id).toLowerCase().trim() &&
            String(r.name).toLowerCase().trim() !== String(name || '').toLowerCase().trim()
        );
        localStorage.setItem(BAKERY_RECIPES_KEY, JSON.stringify(remaining));
      }
    }

    // Đồng bộ lên Supabase Cloud SQL nếu không ở Local Mode
    syncDeletedRecipeIdsToDb(arr).catch(() => {});
  } catch (e) {
    console.warn('Lỗi ghi bakery_deleted_recipe_ids:', e);
  }
}

/**
 * Gỡ một công thức bánh khỏi danh sách đen khi người dùng tạo mới lại
 */
export function unmarkRecipeDeleted(id: string, name?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedRecipeIds();
    let changed = false;
    if (id && set.has(String(id).toLowerCase().trim())) {
      set.delete(String(id).toLowerCase().trim());
      changed = true;
    }
    if (name && set.has(String(name).toLowerCase().trim())) {
      set.delete(String(name).toLowerCase().trim());
      changed = true;
    }

    if (changed) {
      const arr = Array.from(set);
      localStorage.setItem(BAKERY_DELETED_RECIPE_IDS_KEY, JSON.stringify(arr));
      syncDeletedRecipeIdsToDb(arr).catch(() => {});
    }
  } catch (e) {
    console.warn('Lỗi unmarkRecipeDeleted:', e);
  }
}

/**
 * Xóa toàn diện một công thức bánh:
 * 1. Đưa vào danh sách đen Tombstone (ngăn chặn tái sinh từ cache/mặc định)
 * 2. Xóa khỏi localStorage('bakery_recipes')
 * 3. Xóa trên Supabase Cloud SQL (cả recipes và recipe_items)
 * 4. Phát sóng realtimeSync cho các thiết bị khác
 * 5. Tự động đồng bộ file Local SQL
 */
export async function deleteRecipeEverywhere(id: string, name?: string): Promise<void> {
  markRecipeAsDeleted(id, name);
  autoSyncToLocalSqlFolder().catch(() => {});
  broadcastRecipeChange('delete', { id, name });

  // Tự động xóa sản phẩm tương ứng trong danh mục Bánh & Thực đơn khi xóa BOM
  try {
    const { deleteProductByBomRef } = await import('@/lib/utils/productManager');
    await deleteProductByBomRef(id, name);
  } catch (e) {
    console.warn('Lỗi deleteProductByBomRef khi xóa recipe:', e);
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.onLine && !isLocalMode()) {
      try {
        await supabase.from('recipe_items').delete().eq('recipe_id', id);
      } catch {}
      await supabase.from('recipes').delete().eq('id', id);
    }
  } catch (err) {
    console.error('Lỗi khi xóa recipe trên Supabase:', err);
  }
}

/**
 * Xóa sạch toàn bộ công thức bánh bán lẻ:
 * 1. Đưa tất cả vào danh sách đen Tombstone
 * 2. Làm sạch localStorage('bakery_recipes') thành '[]' và đặt initialized = 'true'
 * 3. Xóa trên Supabase Cloud SQL
 * 4. Phát sóng realtimeSync và đồng bộ Local SQL
 */
export async function deleteAllRecipesEverywhere(recipesToDelete: BakeryRecipe[]): Promise<void> {
  if (Array.isArray(recipesToDelete)) {
    recipesToDelete.forEach((r) => markRecipeAsDeleted(r.id, r.name));
  }

  // Tự động xóa tất cả các sản phẩm bánh tương ứng trong danh mục Bánh & Thực đơn
  try {
    const { deleteProductByBomRef } = await import('@/lib/utils/productManager');
    if (Array.isArray(recipesToDelete)) {
      for (const r of recipesToDelete) {
        await deleteProductByBomRef(r.id, r.name);
      }
    }
  } catch (e) {
    console.warn('Lỗi deleteProductByBomRef khi deleteAllRecipesEverywhere:', e);
  }

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_RECIPES, '[]');
      localStorage.setItem(BAKERY_RECIPES_INITIALIZED_KEY, 'true');
      window.dispatchEvent(new CustomEvent(RECIPES_UPDATED_EVENT, { detail: [] }));
    } catch {}
  }
  autoSyncToLocalSqlFolder().catch(() => {});
  broadcastRecipeChange('delete', { id: 'ALL', name: 'ALL' });

  try {
    if (typeof navigator !== 'undefined' && navigator.onLine && !isLocalMode()) {
      const ids = Array.isArray(recipesToDelete) ? recipesToDelete.map((r) => r.id).filter(Boolean) : [];
      if (ids.length > 0) {
        try {
          await supabase.from('recipe_items').delete().in('recipe_id', ids);
        } catch {}
        await supabase.from('recipes').delete().in('id', ids);
      }
    }
  } catch (err) {
    console.error('Lỗi khi xóa tất cả recipes trên Supabase:', err);
  }
}

/**
 * Reset sạch toàn bộ công thức bánh lưu trong bộ nhớ cục bộ
 */
export function resetAllStoredRecipes(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_RECIPES, '[]');
      localStorage.setItem(BAKERY_RECIPES_INITIALIZED_KEY, 'true');
      window.dispatchEvent(new CustomEvent(RECIPES_UPDATED_EVENT, { detail: [] }));
    } catch (e) {
      console.error('Lỗi reset bakery_recipes vào localStorage:', e);
    }
  }
}

/**
 * Lấy danh sách công thức đang lưu trong bộ nhớ cục bộ
 */
export function getStoredRecipes(): BakeryRecipe[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RECIPES);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return filterActiveRecipes(parsed.map(normalizeRecipe));
        }
      }
    } catch {}
  }
  return [];
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
    // Tải danh sách đen công thức đã bị xóa từ Supabase trước
    await fetchDeletedRecipeIdsFromDb().catch(() => {});

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
      return filterActiveRecipes(fallback);
    }

    const cleanRecipes = filterActiveRecipes(
      recipesRes.data.filter((r: any) => !r.name?.startsWith('SYS_') && r.is_active !== false)
    );

    if (cleanRecipes.length === 0) {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_RECIPES, '[]');
        localStorage.setItem(BAKERY_RECIPES_INITIALIZED_KEY, 'true');
        window.dispatchEvent(new CustomEvent(RECIPES_UPDATED_EVENT, { detail: [] }));
      }
      return [];
    }

    const ings = filterActiveIngredients(ingsRes.data || []);
    const ingMap = new Map(ings.map((i: any) => [i.id, i]));
    const deletedIngSet = getDeletedIngredientIds();

    const items = itemsRes.data || [];
    const itemsByRecipe = new Map<string, any[]>();
    items.forEach((it: any) => {
      if (it.ingredient_id && deletedIngSet.has(String(it.ingredient_id).toLowerCase().trim())) return;
      if (!itemsByRecipe.has(it.recipe_id)) itemsByRecipe.set(it.recipe_id, []);
      const ing = ingMap.get(it.ingredient_id);
      const itemName = ing?.name || it.ingredient_name || 'Nguyên liệu';
      if (deletedIngSet.has(itemName.toLowerCase().trim())) return;

      itemsByRecipe.get(it.recipe_id)!.push({
        id: it.id,
        ingredient_id: it.ingredient_id,
        name: itemName,
        quantity: Number(it.quantity) || 0,
        qty: Number(it.quantity) || 0,
        unit: it.unit || ing?.unit || 'g',
        cost: Number(it.line_cost) || 0,
      });
    });

    const fullRecipes: BakeryRecipe[] = cleanRecipes.map((r: any) => {
      let itemsList = itemsByRecipe.get(r.id) || [];
      let bakeTime = Number(r.bake_time_minutes) || 25;
      let bakeTemp = Number(r.bake_temp_celsius) || 190;
      let noteText = r.notes || '';

      if (r.notes && typeof r.notes === 'string' && r.notes.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(r.notes);
          if (parsed.bake_time_minutes) bakeTime = Number(parsed.bake_time_minutes);
          if (parsed.bake_temp_celsius) bakeTemp = Number(parsed.bake_temp_celsius);
          if (parsed.notes !== undefined) noteText = parsed.notes;
          if (itemsList.length === 0 && Array.isArray(parsed.items) && parsed.items.length > 0) {
            itemsList = parsed.items.map((it: any) => ({
              ...it,
              quantity: Number(it.quantity || it.qty || 0),
              qty: Number(it.quantity || it.qty || 0),
              unit: it.unit || 'g',
              cost: Number(it.line_cost || it.cost || 0),
            }));
          }
        } catch {}
      }

      // Nếu vẫn rỗng, kiểm tra mảng fallback mặc định
      if (itemsList.length === 0 && Array.isArray(fallback)) {
        const matchedFb = fallback.find(
          (fb: any) => fb.name?.toLowerCase().trim() === r.name?.toLowerCase().trim() || fb.id === r.id
        );
        if (matchedFb && Array.isArray(matchedFb.items) && matchedFb.items.length > 0) {
          itemsList = matchedFb.items.map((it: any) => ({
            ...it,
            quantity: Number(it.quantity || it.qty || 0),
            qty: Number(it.quantity || it.qty || 0),
            unit: it.unit || 'g',
            cost: Number(it.line_cost || it.cost || 0),
          }));
        }
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

    const finalRecipes = filterActiveRecipes(fullRecipes);

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY_RECIPES, JSON.stringify(finalRecipes));
        localStorage.setItem(BAKERY_RECIPES_INITIALIZED_KEY, 'true');
        window.dispatchEvent(new CustomEvent(RECIPES_UPDATED_EVENT, { detail: finalRecipes }));
      } catch {}
    }

    return finalRecipes;
  } catch (err) {
    console.error('Lỗi khi fetchRecipesFromDb:', err);
    return filterActiveRecipes(fallback);
  }
}
