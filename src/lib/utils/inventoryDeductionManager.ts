// src/lib/utils/inventoryDeductionManager.ts
// Quản lý trừ tồn kho nguyên vật liệu tự động khi làm bánh / hoàn thành bánh
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { db } from '@/lib/db/dexie';
import { syncOrderToSupabase } from '@/lib/supabase/realtimeSync';
import { CakeOrderSpec } from '@/lib/types/bakery-bom';
import { filterActiveIngredients } from '@/lib/utils/ingredientManager';
import { recordBakingLog } from '@/lib/utils/bakingHistoryManager';
import { parseRecipeItem } from '@/lib/utils/recipeCalculator';

export const INGREDIENTS_STORAGE_KEY = 'bakery_ingredients';
export const INGREDIENTS_UPDATED_EVENT = 'bakery_ingredients_updated';

export interface DeductedIngredientSummary {
  ingredientId: string;
  name: string;
  deductedQty: number;
  unit: string;
  previousStock: number;
  remainingStock: number;
}

export interface DeductionResult {
  success: boolean;
  skipped?: boolean;
  message: string;
  deductedItems: DeductedIngredientSummary[];
  orderNumber: string;
}

/**
 * Lấy toàn bộ danh sách nguyên vật liệu kho hiện tại
 */
export function getBakeryIngredients(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(INGREDIENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return filterActiveIngredients(arr);
  } catch (err) {
    console.warn('Lỗi đọc bakery_ingredients từ localStorage:', err);
    return [];
  }
}

/**
 * Lưu danh sách nguyên vật liệu kho & đồng bộ tức thì
 */
export async function saveBakeryIngredients(
  ingredients: any[],
  modifiedIds: string[] = []
): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(INGREDIENTS_STORAGE_KEY, JSON.stringify(ingredients));
      window.dispatchEvent(new CustomEvent(INGREDIENTS_UPDATED_EVENT, { detail: ingredients }));
    } catch (e) {
      console.warn('Lỗi lưu bakery_ingredients:', e);
    }
  }

  // 1. Đồng bộ Cloud SQL (Supabase) nếu online & không ở chế độ Local Mode
  if (typeof navigator !== 'undefined' && navigator.onLine && !isLocalMode()) {
    try {
      const itemsToUpdate = modifiedIds.length > 0
        ? ingredients.filter((i) => modifiedIds.includes(i.id))
        : ingredients;

      for (const item of itemsToUpdate) {
        if (item.id && !String(item.id).startsWith('temp-')) {
          await supabase
            .from('ingredients')
            .update({ stock_qty: item.stock_qty, updated_at: new Date().toISOString() })
            .eq('id', item.id);
        }
      }
    } catch (dbErr) {
      console.warn('Lỗi đồng bộ tồn kho nguyên liệu lên Supabase:', dbErr);
    }
  }

  // 2. Đồng bộ Local SQL Master Dump nếu ở chế độ Local Mode
  if (isLocalMode()) {
    try {
      await autoSyncToLocalSqlFolder();
    } catch (localErr) {
      console.warn('Lỗi autoSyncToLocalSqlFolder sau khi trừ kho:', localErr);
    }
  }
}

/**
 * Bóc tách toàn bộ nguyên vật liệu cần trừ kho từ 1 đơn hàng KDS
 */
export function extractOrderBomRequirements(order: any): Array<{
  ingredientId?: string;
  name: string;
  quantity: number;
  unit?: string;
}> {
  const requirements: Array<{
    ingredientId?: string;
    name: string;
    quantity: number;
    unit?: string;
  }> = [];

  const mainItem = order.items?.[0];
  const orderMultiplier = Math.max(1, Number(mainItem?.quantity) || Number(order.quantity) || 1);

  // 1. Ưu tiên kiểm tra CakeOrderSpec (Đơn Bánh Sinh Nhật có BOM theo flowchart mới)
  let spec: CakeOrderSpec | undefined = order.cake_order_spec || mainItem?.cake_order_spec;
  if (!spec && order.notes) {
    try {
      if (typeof order.notes === 'string') {
        const parsedNotes = JSON.parse(order.notes);
        if (parsedNotes.cake_order_spec) spec = parsedNotes.cake_order_spec;
      } else if (typeof order.notes === 'object' && order.notes.cake_order_spec) {
        spec = order.notes.cake_order_spec;
      }
    } catch {}
  }

  if (spec && spec.isBirthdayCake) {
    // A. Cốt bánh
    if (spec.cakeBase?.bomIngredients && Array.isArray(spec.cakeBase.bomIngredients)) {
      for (const it of spec.cakeBase.bomIngredients) {
        if (it.quantity > 0) {
          requirements.push({
            ingredientId: it.ingredientId,
            name: it.name,
            quantity: Number(it.quantity) * orderMultiplier,
            unit: it.unit,
          });
        }
      }
    }

    // B. Kem phủ
    if (spec.creamCoating?.bomIngredients && Array.isArray(spec.creamCoating.bomIngredients)) {
      for (const it of spec.creamCoating.bomIngredients) {
        if (it.quantity > 0) {
          requirements.push({
            ingredientId: it.ingredientId,
            name: it.name,
            quantity: Number(it.quantity) * orderMultiplier,
            unit: it.unit,
          });
        }
      }
    }

    // C. Hộp & Bao bì
    if (spec.packaging?.name) {
      requirements.push({
        ingredientId: spec.packaging.id,
        name: spec.packaging.name,
        quantity: 1 * orderMultiplier,
        unit: 'cái',
      });
    }

    // D. Vật tư tặng kèm (Mũ, nến, dao, dĩa...)
    if (spec.freeAccessories && Array.isArray(spec.freeAccessories)) {
      for (const acc of spec.freeAccessories) {
        requirements.push({
          ingredientId: acc.id,
          name: acc.name,
          quantity: (Number(acc.quantity) || 1) * orderMultiplier,
          unit: 'cái',
        });
      }
    }

    // E. Phụ kiện decor đặt thêm
    if (spec.decorAddons && Array.isArray(spec.decorAddons)) {
      for (const dec of spec.decorAddons) {
        requirements.push({
          ingredientId: dec.id,
          name: dec.name,
          quantity: 1 * orderMultiplier,
          unit: 'cái',
        });
      }
    }

    return requirements;
  }

  // 1b. Kiểm tra cấu hình Custom Cake Costing (Cốt bánh, kem phủ, phụ kiện từ Custom Cake Modal)
  let customCake = order.custom_cake || mainItem?.custom_cake;
  if (!customCake && order.notes) {
    try {
      if (typeof order.notes === 'string') {
        const parsedNotes = JSON.parse(order.notes);
        customCake = parsedNotes.custom_cake || parsedNotes.cake_costing;
      } else if (typeof order.notes === 'object') {
        customCake = order.notes.custom_cake || order.notes.cake_costing;
      }
    } catch {}
  }

  if (customCake) {
    if (customCake.selectedBase?.name) {
      requirements.push({
        ingredientId: customCake.selectedBase.id,
        name: customCake.selectedBase.name,
        quantity: (Number(customCake.selectedBase.quantity) || 1) * orderMultiplier,
        unit: customCake.selectedBase.unit || 'cốt',
      });
    }
    if (customCake.selectedFrosting?.name) {
      requirements.push({
        ingredientId: customCake.selectedFrosting.id,
        name: customCake.selectedFrosting.name,
        quantity: (Number(customCake.selectedFrosting.quantity) || 1) * orderMultiplier,
        unit: customCake.selectedFrosting.unit || 'ml',
      });
    }
    if (customCake.selectedFilling?.name) {
      requirements.push({
        ingredientId: customCake.selectedFilling.id,
        name: customCake.selectedFilling.name,
        quantity: (Number(customCake.selectedFilling.quantity) || 1) * orderMultiplier,
        unit: customCake.selectedFilling.unit || 'g',
      });
    }
    if (customCake.selectedBox?.name) {
      requirements.push({
        ingredientId: customCake.selectedBox.id,
        name: customCake.selectedBox.name,
        quantity: 1 * orderMultiplier,
        unit: 'hộp',
      });
    }
    if (Array.isArray(customCake.selectedAccessories)) {
      for (const acc of customCake.selectedAccessories) {
        if (acc?.name) {
          requirements.push({
            ingredientId: acc.id,
            name: acc.name,
            quantity: (Number(acc.quantity) || 1) * orderMultiplier,
            unit: acc.unit || 'cái',
          });
        }
      }
    }
    if (requirements.length > 0) {
      return requirements;
    }
  }

  // 2. Nếu đơn hàng không có CakeOrderSpec nhưng có công thức bánh chuẩn trong cấu hình BOM
  // (Hỗ trợ bánh làm theo công thức từ trước)
  try {
    const rawBom = localStorage.getItem('bakery_full_bom_config');
    if (rawBom) {
      const fullBom = JSON.parse(rawBom);
      const cakeName = String(order.cake_name || mainItem?.product_name_snapshot || '').toLowerCase();

      // Thử tìm size qua đường kính
      const diamMatch = cakeName.match(/(\d+)\s*cm/i) || String(order.cake_size || '').match(/(\d+)\s*cm/i);
      const diameter = diamMatch ? parseInt(diamMatch[1], 10) : 18;

      const base = fullBom.cakeBases?.[0];
      const matchedSize = base?.sizes?.find((s: any) => s.diameterCm === diameter) || base?.sizes?.[0];

      if (matchedSize?.bomIngredients) {
        for (const it of matchedSize.bomIngredients) {
          requirements.push({
            ingredientId: it.ingredientId,
            name: it.name,
            quantity: Number(it.quantity) * orderMultiplier,
            unit: it.unit,
          });
        }
      }
    }
  } catch {}

  return requirements;
}

/**
 * Tự động trừ tồn kho nguyên vật liệu của 1 đơn hàng khi thợ bánh làm xong
 */
export async function deductOrderIngredients(order: any): Promise<DeductionResult> {
  const orderNum = order?.order_number || order?.orderNumber || order?.id || 'ĐƠN';

  // 1. Kiểm tra cờ bom_deducted để CHỐNG TRỪ KHO LẶP (No Double Deduct)
  if (order?.bom_deducted === true || order?.inventory_deducted === true) {
    return {
      success: true,
      skipped: true,
      message: `Đơn #${orderNum} đã được trừ kho trước đó. Bỏ qua để tránh trừ lặp.`,
      deductedItems: [],
      orderNumber: orderNum,
    };
  }

  const requirements = extractOrderBomRequirements(order);
  if (requirements.length === 0) {
    return {
      success: true,
      skipped: true,
      message: `Đơn #${orderNum} không có định mức nguyên liệu BOM cần trừ.`,
      deductedItems: [],
      orderNumber: orderNum,
    };
  }

  const currentIngredients = getBakeryIngredients();
  if (currentIngredients.length === 0) {
    return {
      success: false,
      message: 'Không tìm thấy dữ liệu kho nguyên vật liệu (bakery_ingredients).',
      deductedItems: [],
      orderNumber: orderNum,
    };
  }

  const deductedItems: DeductedIngredientSummary[] = [];
  const modifiedIngredientIds: string[] = [];

  // 2. Thực hiện trừ kho cho từng nguyên liệu trong định mức
  for (const req of requirements) {
    let matchedIng = null;

    // Tìm theo ingredientId nếu có
    if (req.ingredientId) {
      matchedIng = currentIngredients.find((i) => i.id === req.ingredientId);
    }

    // Nếu không thấy theo ID, tìm theo tên gần đúng (case-insensitive)
    if (!matchedIng && req.name) {
      const qName = req.name.toLowerCase().trim();
      matchedIng = currentIngredients.find(
        (i) => i.name.toLowerCase().trim() === qName ||
               i.name.toLowerCase().includes(qName) ||
               qName.includes(i.name.toLowerCase())
      );
    }

    if (matchedIng) {
      const prevStock = Number(matchedIng.stock_qty || 0);
      const newStock = Math.max(0, prevStock - req.quantity);

      matchedIng.stock_qty = newStock;
      modifiedIngredientIds.push(matchedIng.id);

      deductedItems.push({
        ingredientId: matchedIng.id,
        name: matchedIng.name,
        deductedQty: req.quantity,
        unit: matchedIng.unit || req.unit || 'g',
        previousStock: prevStock,
        remainingStock: newStock,
      });
    }
  }

  // 3. Lưu kho mới & đồng bộ tức thì lên SQL Cloud & Local
  if (deductedItems.length > 0) {
    await saveBakeryIngredients(currentIngredients, modifiedIngredientIds);

    // Ghi nhận cờ bom_deducted lên đơn hàng để không bao giờ trừ lần 2
    order.bom_deducted = true;
    order.inventory_deducted = true;
    order.deducted_at = new Date().toISOString();
    order.deducted_items_count = deductedItems.length;

    // 3b. Tự động ghi nhận vào Lịch Sử Làm Bánh (Baking History)
    try {
      const spec: CakeOrderSpec | undefined = order.cake_order_spec || order.items?.[0]?.cake_order_spec;
      const cakeName = spec?.cakeBase?.name || order.cake_name || order.items?.[0]?.product_name_snapshot || 'Bánh Sinh Nhật';
      const orderMultiplier = Math.max(1, Number(order.items?.[0]?.quantity) || Number(order.quantity) || 1);

      let totalBakeCost = 0;
      const consumedIngs = deductedItems.map((d) => {
        const ingObj = currentIngredients.find((i) => i.id === d.ingredientId);
        const uCost = Number(ingObj?.avg_cost || 0);
        const lCost = Math.round(d.deductedQty * uCost);
        totalBakeCost += lCost;
        return {
          ingredientId: d.ingredientId,
          name: d.name,
          quantity: d.deductedQty,
          unit: d.unit,
          unitCost: uCost,
          totalCost: lCost,
        };
      });

      recordBakingLog({
        id: 'bake-order-' + (order.id || order.order_number || Date.now()),
        cakeName,
        cakeCategory: 'birthday',
        quantity: orderMultiplier,
        unit: 'chiếc',
        orderNumber: orderNum,
        totalCost: totalBakeCost,
        costPerUnit: Math.round(totalBakeCost / orderMultiplier),
        ingredients: consumedIngs,
        performedBy: 'Bếp bánh (Đơn #' + orderNum + ')',
        createdAt: new Date().toISOString(),
        notes: `Tự động trừ kho theo định mức BOM đơn #${orderNum}`,
      }).catch((e) => console.warn('Lỗi ghi baking history cho đơn bánh:', e));
    } catch (histErr) {
      console.warn('Lỗi tạo baking log cho đơn hàng:', histErr);
    }

    // Cập nhật đơn hàng vào localStorage & Dexie
    if (typeof window !== 'undefined') {
      try {
        const rawOrders = localStorage.getItem('bakery_orders');
        if (rawOrders) {
          const parsed = JSON.parse(rawOrders);
          const updated = parsed.map((o: any) => {
            if (o.id === order.id || o.order_number === order.order_number || o.orderNumber === orderNum) {
              return { ...o, bom_deducted: true, inventory_deducted: true, deducted_at: new Date().toISOString() };
            }
            return o;
          });
          localStorage.setItem('bakery_orders', JSON.stringify(updated));
        }

        // Cập nhật Dexie
        if (db?.orders?.update) {
          await db.orders.update(order.id || order.local_id, {
            bom_deducted: true,
            inventory_deducted: true,
          } as any).catch(() => {});
        }

        // Đồng bộ Supabase nếu online và không ở chế độ Local SQL
        if (typeof navigator !== 'undefined' && navigator.onLine && !isLocalMode()) {
          syncOrderToSupabase(order, order.status || 'ready').catch(() => {});
        }
      } catch (err) {
        console.warn('Lỗi lưu cờ bom_deducted:', err);
      }
    }
  }

  return {
    success: true,
    message: `Đã tự động trừ tồn kho ${deductedItems.length} nguyên vật liệu theo định mức BOM đơn #${orderNum}.`,
    deductedItems,
    orderNumber: orderNum,
  };
}

export interface RecipeDeductionResult {
  success: boolean;
  skipped?: boolean;
  message: string;
  deductedItems: DeductedIngredientSummary[];
  totalCost: number;
}

/**
 * Tự động trừ tồn kho nguyên vật liệu cho một mẻ bánh bán lẻ / bánh thường (BOM Recipe)
 * Được kích hoạt khi thợ bếp nướng xong và bấm "🥖 Ra Lò & Nhập Kho POS"
 */
export async function deductRecipeIngredients(
  recipe: any,
  quantity: number,
  options?: {
    batchId?: string;
    bakeTemp?: number;
    durationMinutes?: number;
    bakeMinutes?: number;
    performedBy?: string;
    notes?: string;
  }
): Promise<RecipeDeductionResult> {
  const cakeName = recipe?.name || 'Bánh Bán Lẻ';
  const targetQty = Math.max(1, Number(quantity) || Number(recipe?.yield_qty) || 1);
  const baseYield = Math.max(1, Number(recipe?.yield_qty) || 1);
  const multiplier = targetQty / baseYield;

  const recipeItems = Array.isArray(recipe?.items) ? recipe.items : [];
  if (recipeItems.length === 0) {
    return {
      success: true,
      skipped: true,
      message: `Công thức "${cakeName}" không có danh sách nguyên liệu để trừ kho.`,
      deductedItems: [],
      totalCost: 0,
    };
  }

  const currentIngredients = getBakeryIngredients();
  if (currentIngredients.length === 0) {
    return {
      success: false,
      message: 'Không tìm thấy dữ liệu kho nguyên vật liệu (bakery_ingredients).',
      deductedItems: [],
      totalCost: 0,
    };
  }

  const deductedItems: DeductedIngredientSummary[] = [];
  const modifiedIngredientIds: string[] = [];
  const consumedIngs: any[] = [];
  let totalBakeCost = 0;

  for (const item of recipeItems) {
    const parsed = parseRecipeItem(item);
    const neededQty = parsed.numericQty * multiplier;
    if (neededQty <= 0) continue;

    let matchedIng = null;
    if (item.ingredient_id || item.ingredientId) {
      const targetId = item.ingredient_id || item.ingredientId;
      matchedIng = currentIngredients.find((i) => i.id === targetId);
    }

    const targetName = item.ingredient_name || item.name || item.ingredientName;
    if (!matchedIng && targetName) {
      const qName = String(targetName).toLowerCase().trim();
      matchedIng = currentIngredients.find(
        (i) => i.name.toLowerCase().trim() === qName ||
               i.name.toLowerCase().includes(qName) ||
               qName.includes(i.name.toLowerCase())
      );
    }

    if (matchedIng) {
      const prevStock = Number(matchedIng.stock_qty || 0);
      const newStock = Math.max(0, prevStock - neededQty);

      matchedIng.stock_qty = newStock;
      modifiedIngredientIds.push(matchedIng.id);

      const uCost = Number(matchedIng.avg_cost || item.cost || item.line_cost || 0);
      const lineCost = Math.round(neededQty * uCost);
      totalBakeCost += lineCost;

      deductedItems.push({
        ingredientId: matchedIng.id,
        name: matchedIng.name,
        deductedQty: neededQty,
        unit: matchedIng.unit || parsed.unit || 'g',
        previousStock: prevStock,
        remainingStock: newStock,
      });

      consumedIngs.push({
        ingredientId: matchedIng.id,
        name: matchedIng.name,
        quantity: neededQty,
        unit: matchedIng.unit || parsed.unit || 'g',
        unitCost: uCost,
        totalCost: lineCost,
      });
    }
  }

  if (deductedItems.length > 0) {
    await saveBakeryIngredients(currentIngredients, modifiedIngredientIds);

    // Ghi nhận vào Lịch Sử Làm Bánh
    try {
      await recordBakingLog({
        id: options?.batchId || 'bake-batch-' + Date.now(),
        cakeName,
        cakeCategory: 'retail',
        quantity: targetQty,
        unit: recipe.yield_unit || 'cái',
        recipeId: recipe.id,
        batchId: options?.batchId,
        bakeTemp: options?.bakeTemp || recipe.bake_temp_celsius,
        bakeMinutes: options?.durationMinutes || recipe.bake_time_minutes,
        totalCost: totalBakeCost,
        costPerUnit: Math.round(totalBakeCost / targetQty),
        ingredients: consumedIngs,
        performedBy: options?.performedBy || 'Bếp bánh',
        createdAt: new Date().toISOString(),
        notes: options?.notes || `Mẻ nướng ${targetQty} ${recipe.yield_unit || 'cái'} ${cakeName}`,
      });
    } catch (e) {
      console.warn('Lỗi ghi baking history cho mẻ bánh thường:', e);
    }
  }

  return {
    success: true,
    message: `Đã tự động trừ kho ${deductedItems.length} loại nguyên liệu cho mẻ ${targetQty} ${recipe.yield_unit || 'cái'} ${cakeName}.`,
    deductedItems,
    totalCost: totalBakeCost,
  };
}
