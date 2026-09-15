// src/lib/utils/inventoryDeductionManager.ts
// Quản lý trừ tồn kho nguyên vật liệu tự động khi làm bánh / hoàn thành bánh
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { db } from '@/lib/db/dexie';
import { syncOrderToSupabase } from '@/lib/supabase/realtimeSync';
import { CakeOrderSpec } from '@/lib/types/bakery-bom';

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
    return Array.isArray(parsed) ? parsed : [];
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
  const spec: CakeOrderSpec | undefined = order.cake_order_spec || mainItem?.cake_order_spec;

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
        await db.orders.update(order.id || order.local_id, {
          bom_deducted: true,
          inventory_deducted: true,
        } as any).catch(() => {});

        // Đồng bộ Supabase nếu online
        if (typeof navigator !== 'undefined' && navigator.onLine) {
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
