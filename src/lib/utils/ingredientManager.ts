// src/lib/utils/ingredientManager.ts
// Quản lý kho nguyên vật liệu và cơ chế xóa triệt để (Anti-Resurrection Tombstone)
// Ngăn chặn hoàn toàn việc nguyên liệu bị phục hồi/xuất hiện lại sau khi xóa khi tải lại trang hoặc đổi thiết bị.

import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

export const BAKERY_INGREDIENTS_KEY = 'bakery_ingredients';
export const BAKERY_DELETED_INGREDIENT_IDS_KEY = 'bakery_deleted_ingredient_ids';
export const INGREDIENTS_UPDATED_EVENT = 'bakery_ingredients_updated';

export const DB_ROW_DELETED_INGREDIENTS_ID = '00000000-0000-0000-0000-000000000045';
export const DB_ROW_DELETED_INGREDIENTS_NAME = 'SYS_CONFIG_DELETED_INGREDIENTS';

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  category?: string;
  stock_qty?: number;
  reorder_level?: number;
  avg_cost?: number;
  wastage_pct?: number;
  packaging_unit?: string;
  conversion_rate?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Lấy danh sách Set các ID và Tên nguyên vật liệu đã bị người dùng chủ động xóa.
 */
export function getDeletedIngredientIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(BAKERY_DELETED_INGREDIENT_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map((item) => String(item).toLowerCase().trim()));
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc bakery_deleted_ingredient_ids:', e);
  }
  return new Set();
}

/**
 * Lọc bỏ các nguyên liệu đã bị xóa hoặc là row cấu hình hệ thống
 */
export function filterActiveIngredients(ingredients: any[]): any[] {
  if (!Array.isArray(ingredients)) return [];
  const deletedSet = getDeletedIngredientIds();

  return ingredients.filter((ing) => {
    if (!ing) return false;
    const name = String(ing.name || '').trim();
    const id = String(ing.id || '').trim();
    if (name.startsWith('SYS_') || id.startsWith('SYS_')) return false;
    if (ing.category === 'system_config') return false;

    // Kiểm tra danh sách đen xóa
    if (id && deletedSet.has(id.toLowerCase())) return false;
    if (name && deletedSet.has(name.toLowerCase())) return false;

    return true;
  });
}

/**
 * Đồng bộ danh sách đen nguyên liệu đã xóa lên Supabase SQL
 */
export async function syncDeletedIngredientIdsToDb(deletedIds: string[]): Promise<void> {
  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_DELETED_INGREDIENTS_ID,
        name: DB_ROW_DELETED_INGREDIENTS_NAME,
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
    console.warn('Lỗi syncDeletedIngredientIdsToDb:', err);
  }
}

/**
 * Tải danh sách nguyên liệu đã xóa từ Supabase SQL
 */
export async function fetchDeletedIngredientIdsFromDb(): Promise<string[]> {
  if (isLocalMode()) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_DELETED_INGREDIENTS_ID},name.eq.${DB_ROW_DELETED_INGREDIENTS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        if (typeof window !== 'undefined') {
          const localSet = getDeletedIngredientIds();
          parsed.forEach((id) => localSet.add(String(id).toLowerCase().trim()));
          localStorage.setItem(BAKERY_DELETED_INGREDIENT_IDS_KEY, JSON.stringify(Array.from(localSet)));
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchDeletedIngredientIdsFromDb:', err);
  }
  return [];
}

/**
 * Đánh dấu nguyên liệu vào danh sách đen xóa vĩnh viễn
 */
export function markIngredientAsDeleted(id: string, name?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedIngredientIds();
    if (id) set.add(String(id).toLowerCase().trim());
    if (name) set.add(String(name).toLowerCase().trim());

    const arr = Array.from(set);
    localStorage.setItem(BAKERY_DELETED_INGREDIENT_IDS_KEY, JSON.stringify(arr));

    // Cập nhật ngay trong localStorage('bakery_ingredients')
    const rawIngs = localStorage.getItem(BAKERY_INGREDIENTS_KEY);
    if (rawIngs) {
      const parsed = JSON.parse(rawIngs);
      if (Array.isArray(parsed)) {
        const remaining = parsed.filter(
          (i) =>
            String(i.id).toLowerCase().trim() !== String(id).toLowerCase().trim() &&
            String(i.name).toLowerCase().trim() !== String(name || '').toLowerCase().trim()
        );
        localStorage.setItem(BAKERY_INGREDIENTS_KEY, JSON.stringify(remaining));
      }
    }

    // Đồng bộ lên Supabase Cloud SQL nếu không ở Local Mode
    syncDeletedIngredientIdsToDb(arr).catch(() => {});
  } catch (e) {
    console.warn('Lỗi ghi bakery_deleted_ingredient_ids:', e);
  }
}

/**
 * Gỡ bỏ ID/Tên nguyên liệu khỏi danh sách đen khi người dùng tạo lại nguyên liệu mới cùng tên/ID.
 */
export function unmarkIngredientDeleted(id: string, name?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedIngredientIds();
    let changed = false;
    if (id && set.delete(String(id).toLowerCase().trim())) changed = true;
    if (name && set.delete(String(name).toLowerCase().trim())) changed = true;

    if (changed) {
      const arr = Array.from(set);
      localStorage.setItem(BAKERY_DELETED_INGREDIENT_IDS_KEY, JSON.stringify(arr));
      syncDeletedIngredientIdsToDb(arr).catch(() => {});
    }
  } catch (e) {
    console.warn('Lỗi bỏ đánh dấu nguyên liệu đã xóa:', e);
  }
}

/**
 * Xóa nguyên liệu triệt để trên tất cả các tầng: LocalStorage, Recipes BOM, và Supabase SQL (nếu Online).
 */
export async function deleteIngredientEverywhere(id: string, name: string): Promise<boolean> {
  // 1. Đánh dấu vào danh sách đen Tombstone
  markIngredientAsDeleted(id, name);

  // 2. Dọn dẹp trong công thức recipes lưu ở localStorage
  if (typeof window !== 'undefined') {
    try {
      const rawRecs = localStorage.getItem('bakery_recipes');
      if (rawRecs) {
        const parsed = JSON.parse(rawRecs);
        if (Array.isArray(parsed)) {
          const updatedRecs = parsed.map((r: any) => ({
            ...r,
            items: Array.isArray(r.items)
              ? r.items.filter(
                  (item: any) =>
                    String(item.ingredient_id || item.ingredientId || '').toLowerCase().trim() !== id.toLowerCase().trim() &&
                    String(item.name || '').toLowerCase().trim() !== name.toLowerCase().trim()
                )
              : [],
          }));
          localStorage.setItem('bakery_recipes', JSON.stringify(updatedRecs));
        }
      }
    } catch {}
  }

  // 3. Nếu ở chế độ Local Mode -> tự động cập nhật thư mục Local SQL
  if (isLocalMode()) {
    try {
      await autoSyncToLocalSqlFolder();
    } catch {}
  }

  // 4. Nếu ở chế độ Online (Supabase Cloud):
  // Phải xóa liên kết trong recipe_items TRƯỚC để tránh lỗi Khóa ngoại (FK 23503)
  if (typeof navigator !== 'undefined' && navigator.onLine && !isLocalMode()) {
    try {
      // Xóa các dòng định mức recipe_items đang liên kết với vật tư này
      await supabase.from('recipe_items').delete().eq('ingredient_id', id);
      // Xóa vật tư khỏi bảng ingredients
      const { error: delErr } = await supabase.from('ingredients').delete().eq('id', id);
      if (delErr) {
        console.warn('Lỗi khi xóa ingredient trên Supabase:', delErr);
      }
    } catch (err) {
      console.warn('Lỗi kết nối khi xóa ingredient trên Supabase:', err);
    }
  }

  // 5. Phát sự kiện cập nhật để các component khác làm mới
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INGREDIENTS_UPDATED_EVENT));
  }

  return true;
}
