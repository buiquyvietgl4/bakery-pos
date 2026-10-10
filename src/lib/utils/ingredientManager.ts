// src/lib/utils/ingredientManager.ts
// Quản lý kho nguyên vật liệu và cơ chế xóa triệt để (Anti-Resurrection Tombstone)
// Ngăn chặn hoàn toàn việc nguyên liệu bị phục hồi/xuất hiện lại sau khi xóa khi tải lại trang hoặc đổi thiết bị.

import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { generateUUID } from '@/lib/utils/uuid';

export const BAKERY_INGREDIENTS_KEY = 'bakery_ingredients';
export const BAKERY_DELETED_INGREDIENT_IDS_KEY = 'bakery_deleted_ingredient_ids';
export const INGREDIENTS_UPDATED_EVENT = 'bakery_ingredients_updated';

export const DB_ROW_DELETED_INGREDIENTS_ID = '00000000-0000-0000-0000-000000000045';
export const DB_ROW_DELETED_INGREDIENTS_NAME = 'SYS_CONFIG_DELETED_INGREDIENTS';

export interface Ingredient {
  id: string;
  name: string;
  unit: string;
  category: string;
  stock_qty: number;
  reorder_level: number;
  avg_cost: number;
  wastage_pct: number;
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

    // Loại bỏ dữ liệu mẫu kiểm thử
    if (id.startsWith('e5a2000') || name.toLowerCase().includes('real test')) return false;

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

/**
 * Lưu hoặc cập nhật nguyên vật liệu lên Supabase với cơ chế fallback 2 tầng:
 * - Tầng 1: Thử upsert đầy đủ với packaging_unit và conversion_rate.
 * - Tầng 2: Nếu dính lỗi thiếu cột trong schema cache (PGRST204) do database chưa chạy migration, tự động fallback về payload cơ bản.
 */
export async function persistIngredientToSupabase(
  ing: Partial<Ingredient> & { id: string; name: string }
): Promise<{ success: boolean; error?: any }> {
  // Đảm bảo gỡ khỏi danh sách đen đã xóa nếu đang lưu lại (ngay cả ở local mode)
  unmarkIngredientDeleted(ing.id, ing.name);

  if (isLocalMode()) return { success: true };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { success: true };

  try {
    const fullPayload: any = {
      id: ing.id,
      name: ing.name.trim(),
      unit: ing.unit || 'g',
      category: ing.category || 'Bột & Ngũ cốc',
      stock_qty: ing.stock_qty ?? 0,
      reorder_level: ing.reorder_level ?? 0,
      avg_cost: ing.avg_cost ?? 0,
      wastage_pct: ing.wastage_pct ?? 0,
      packaging_unit: ing.packaging_unit || (ing.unit === 'ml' ? 'Hộp 1L' : ing.unit === 'g' ? 'Túi 1kg' : 'Túi'),
      conversion_rate: Number(ing.conversion_rate) > 0 ? Number(ing.conversion_rate) : (ing.unit === 'ml' || ing.unit === 'g' ? 1000 : 1),
      updated_at: new Date().toISOString(),
    };

    const { error: fullErr } = await supabase.from('ingredients').upsert(fullPayload, { onConflict: 'id' });
    if (!fullErr) {
      return { success: true };
    }

    console.warn('Supabase upsert full ingredient thất bại, thử fallback payload cơ bản:', fullErr);

    const basicPayload: any = {
      id: ing.id,
      name: ing.name.trim(),
      unit: ing.unit || 'g',
      category: ing.category || 'Bột & Ngũ cốc',
      stock_qty: ing.stock_qty ?? 0,
      reorder_level: ing.reorder_level ?? 0,
      avg_cost: ing.avg_cost ?? 0,
      wastage_pct: ing.wastage_pct ?? 0,
      updated_at: new Date().toISOString(),
    };

    const { error: basicErr } = await supabase.from('ingredients').upsert(basicPayload, { onConflict: 'id' });
    if (!basicErr) {
      return { success: true };
    }

    console.error('Lỗi lưu ingredient lên Supabase (cả full và basic fallback đều lỗi):', basicErr);
    return { success: false, error: basicErr };
  } catch (err) {
    console.error('Exception trong persistIngredientToSupabase:', err);
    return { success: false, error: err };
  }
}

/**
 * Hợp nhất danh sách nguyên liệu từ LocalStorage và Supabase Cloud SQL.
 * Đảm bảo:
 * - Không bao giờ làm mất các nguyên vật liệu được tạo cục bộ (tránh lỗi F5 mất nguyên liệu).
 * - Loại bỏ các nguyên vật liệu đã bị xóa (Anti-resurrection Tombstone).
 * - Bổ sung thông tin bao bì, tỷ lệ quy đổi từ local nếu Cloud DB chưa có cột.
 */
export function mergeIngredientLists(localList: any[], supabaseList: any[]): Ingredient[] {
  const deletedSet = getDeletedIngredientIds();
  const ingMap = new Map<string, Ingredient>();
  const nameToIdMap = new Map<string, string>();

  // 1. Nạp danh sách từ Cloud (Supabase) trước
  if (Array.isArray(supabaseList)) {
    for (const raw of supabaseList) {
      if (!raw || !raw.name) continue;
      const id = String(raw.id || '').trim();
      const name = String(raw.name || '').trim();
      const nameLower = name.toLowerCase();

      if (id && deletedSet.has(id.toLowerCase())) continue;
      if (nameLower && deletedSet.has(nameLower)) continue;
      if (name.startsWith('SYS_') || id.startsWith('SYS_')) continue;

      const key = id || nameLower;
      const ing: Ingredient = {
        id: id || nameLower,
        name,
        unit: raw.unit || 'g',
        category: raw.category || 'Khác',
        stock_qty: Number(raw.stock_qty) || 0,
        reorder_level: Number(raw.reorder_level) || 0,
        avg_cost: Number(raw.avg_cost) || 0,
        wastage_pct: Number(raw.wastage_pct) || 0,
        packaging_unit: raw.packaging_unit,
        conversion_rate: raw.conversion_rate,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
      };

      ingMap.set(key, ing);
      if (nameLower) {
        nameToIdMap.set(nameLower, key);
      }
    }
  }

  // 2. Hợp nhất danh sách Local (để không bao giờ bị mất nguyên liệu tạo trên máy cục bộ)
  if (Array.isArray(localList)) {
    for (const raw of localList) {
      if (!raw || !raw.name) continue;
      const id = String(raw.id || '').trim();
      const name = String(raw.name || '').trim();
      const nameLower = name.toLowerCase();

      if (id && deletedSet.has(id.toLowerCase())) continue;
      if (nameLower && deletedSet.has(nameLower)) continue;
      if (name.startsWith('SYS_') || id.startsWith('SYS_')) continue;

      // Tìm kiếm trùng khớp theo ID hoặc Tên
      let matchedKey = id && ingMap.has(id) ? id : null;
      if (!matchedKey && nameLower && nameToIdMap.has(nameLower)) {
        matchedKey = nameToIdMap.get(nameLower)!;
      }
      if (!matchedKey && nameLower && ingMap.has(nameLower)) {
        matchedKey = nameLower;
      }

      if (matchedKey && ingMap.has(matchedKey)) {
        const cloudIng = ingMap.get(matchedKey)!;
        const finalUnit = raw.unit || cloudIng.unit || 'g';
        const finalPkg = raw.packaging_unit || cloudIng.packaging_unit || (finalUnit === 'ml' ? 'Hộp 1L' : finalUnit === 'g' ? 'Túi 1kg' : 'Túi');
        const finalRate = Number(raw.conversion_rate) > 0
          ? Number(raw.conversion_rate)
          : (Number(cloudIng.conversion_rate) > 0 ? Number(cloudIng.conversion_rate) : (finalUnit === 'ml' || finalUnit === 'g' ? 1000 : 1));

        // Hợp nhất tồn kho thông minh theo mốc thời gian cập nhật gần nhất, tránh bị Cloud đè số lượng cũ
        let resolvedStock = Number(cloudIng.stock_qty) || 0;
        if (raw.stock_qty !== undefined && raw.stock_qty !== null) {
          const rawTime = raw.updated_at ? new Date(raw.updated_at).getTime() : 0;
          const cloudTime = cloudIng.updated_at ? new Date(cloudIng.updated_at).getTime() : 0;
          if (rawTime >= cloudTime || cloudTime === 0) {
            resolvedStock = Number(raw.stock_qty);
          } else {
            resolvedStock = Number(cloudIng.stock_qty !== undefined ? cloudIng.stock_qty : raw.stock_qty);
          }
        }

        ingMap.set(matchedKey, {
          ...cloudIng,
          unit: finalUnit,
          packaging_unit: finalPkg,
          conversion_rate: finalRate,
          stock_qty: resolvedStock,
        });
      } else {
        // Chưa có trên cloud -> Giữ nguyên nguyên liệu local!
        const key = id || nameLower;
        const newIng: Ingredient = {
          id: id || generateUUID(),
          name,
          unit: raw.unit || 'g',
          category: raw.category || 'Khác',
          stock_qty: Number(raw.stock_qty) || 0,
          reorder_level: Number(raw.reorder_level) || 0,
          avg_cost: Number(raw.avg_cost) || 0,
          wastage_pct: Number(raw.wastage_pct) || 0,
          packaging_unit: raw.packaging_unit || (raw.unit === 'ml' ? 'Hộp 1L' : raw.unit === 'g' ? 'Túi 1kg' : 'Túi'),
          conversion_rate: Number(raw.conversion_rate) > 0 ? Number(raw.conversion_rate) : (raw.unit === 'ml' || raw.unit === 'g' ? 1000 : 1),
          created_at: raw.created_at,
          updated_at: raw.updated_at,
        };
        ingMap.set(key, newIng);
        if (nameLower) {
          nameToIdMap.set(nameLower, key);
        }

        // Tự động đồng bộ lên Supabase nếu có mạng
        if (typeof navigator !== 'undefined' && navigator.onLine && !isLocalMode()) {
          persistIngredientToSupabase(newIng).catch(() => {});
        }
      }
    }
  }

  return Array.from(ingMap.values()).map((ing) => {
    const unit = ing.unit || 'g';
    return {
      ...ing,
      packaging_unit: ing.packaging_unit || (unit === 'ml' ? 'Hộp 1L' : unit === 'g' ? 'Túi 1kg' : 'Túi'),
      conversion_rate: Number(ing.conversion_rate) > 0 ? Number(ing.conversion_rate) : (unit === 'ml' || unit === 'g' ? 1000 : 1),
    };
  });
}

/**
 * Tự động quét tất cả các công thức bánh (BOM Recipes) trong hệ thống:
 * Nếu phát hiện có nguyên liệu được sử dụng trong BOM nhưng đang bị thiếu trong danh mục Kho (do lỗi đồng bộ hoặc ghi đè),
 * hàm sẽ tự động phục hồi nguyên liệu đó trở lại Kho, gỡ khỏi danh sách đen đã xóa (nếu có), và đồng bộ lại vào cơ sở dữ liệu.
 */
export function autoRecoverIngredientsFromRecipes(
  currentIngredients: any[],
  recipes?: any[]
): { ingredients: Ingredient[]; recoveredCount: number } {
  let targetRecipes = recipes;
  if (!targetRecipes && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_recipes');
      if (raw) {
        targetRecipes = JSON.parse(raw);
      }
    } catch {}
  }

  if (!Array.isArray(targetRecipes) || targetRecipes.length === 0) {
    return { ingredients: currentIngredients, recoveredCount: 0 };
  }

  const existingMap = new Map<string, Ingredient>();
  const nameMap = new Map<string, Ingredient>();

  for (const ing of currentIngredients) {
    if (ing.id) existingMap.set(String(ing.id).toLowerCase().trim(), ing);
    if (ing.name) nameMap.set(String(ing.name).toLowerCase().trim(), ing);
  }

  const result = [...currentIngredients];
  let recoveredCount = 0;

  for (const rec of targetRecipes) {
    if (!rec || !Array.isArray(rec.items)) continue;
    const recName = String(rec.name || '').trim();
    if (recName.startsWith('SYS_')) continue;

    for (const item of rec.items) {
      if (!item) continue;
      const itemName = String(item.name || item.ingredient_name || '').trim();
      const itemId = String(item.ingredient_id || item.ingredientId || item.id || '').trim();

      if (!itemName) continue;
      if (itemName.startsWith('SYS_')) continue;

      const idKey = itemId ? itemId.toLowerCase() : '';
      const nameKey = itemName.toLowerCase();

      // Kiểm tra xem đã có trong Kho chưa
      const alreadyExists = (idKey && existingMap.has(idKey)) || (nameKey && nameMap.has(nameKey));
      if (!alreadyExists) {
        // Nguyên liệu tồn tại trong BOM nhưng bị biến mất khỏi Kho! Phục hồi ngay lập tức:
        unmarkIngredientDeleted(itemId || idKey, itemName);

        const newId = itemId || generateUUID();
        const unit = item.unit || 'g';
        const itemCost = Number(item.cost || item.line_cost || 0);
        const itemQty = Number(item.quantity || item.qty || 1);
        const unitCost = itemCost > 0 && itemQty > 0 ? Math.round(itemCost / itemQty) : 30;

        const recovered: Ingredient = {
          id: newId,
          name: itemName,
          unit: unit,
          category: 'Bột & Ngũ cốc',
          stock_qty: Number(item.stock_qty || 0),
          reorder_level: Number(item.reorder_level || 0),
          avg_cost: unitCost,
          wastage_pct: Number(item.wastage_pct || 0),
          packaging_unit: unit === 'ml' ? 'Hộp 1L' : (unit === 'g' ? 'Túi 1kg' : 'Túi'),
          conversion_rate: unit === 'ml' || unit === 'g' ? 1000 : 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        result.push(recovered);
        existingMap.set(newId.toLowerCase(), recovered);
        nameMap.set(nameKey, recovered);
        recoveredCount++;

        console.info(`🔄 [Kho] Tự động phục hồi nguyên liệu "${itemName}" từ công thức BOM "${recName}" trở lại Kho.`);

        // Đồng bộ lên Supabase nếu có mạng
        if (typeof navigator !== 'undefined' && navigator.onLine && !isLocalMode()) {
          persistIngredientToSupabase(recovered).catch(() => {});
        }
      }
    }
  }

  if (recoveredCount > 0 && typeof window !== 'undefined') {
    try {
      localStorage.setItem(BAKERY_INGREDIENTS_KEY, JSON.stringify(result));
      window.dispatchEvent(new CustomEvent(INGREDIENTS_UPDATED_EVENT));
    } catch {}
  }

  return { ingredients: result, recoveredCount };
}

