// src/lib/utils/productManager.ts
// Quản lý sản phẩm bánh, thực đơn và cơ chế xóa triệt để (Không bị hồi sinh khi tải lại trang)

import { supabase } from '@/lib/supabase/client';
import { db } from '@/lib/db/dexie';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { broadcastProductChange } from '@/lib/supabase/realtimeSync';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { generateUUID } from '@/lib/utils/uuid';

export const BAKERY_DELETED_PRODUCT_IDS_KEY = 'bakery_deleted_product_ids';
export const BAKERY_PRODUCTS_KEY = 'bakery_products';
export const BAKERY_STOCKS_KEY = 'bakery_stocks';

/**
 * Kiểm tra xem một sản phẩm có phải là hàng nhập ngoài về bán (Resale / Hàng nhập sẵn / Phụ kiện) hay không.
 * Các sản phẩm này không do bếp tự làm/nướng, vì vậy TUYỆT ĐỐI không được bán vượt quá tồn kho thực tế,
 * và không bao giờ đẩy vào bếp làm bánh bổ sung (-LAM / need_bake_qty).
 */
export function isImportedProduct(product?: any): boolean {
  if (!product) return false;
  if (product.product_type === 'imported') return true;
  const cat = String(product.category || '').toLowerCase().trim();
  if (
    cat.includes('bánh nhập') ||
    cat.includes('hàng nhập') ||
    cat.includes('nhập ngoài') ||
    cat.includes('đóng gói') ||
    cat.includes('resale')
  ) {
    return true;
  }
  if (product.supplier_name && !product.bom_preset_id && product.cake_type_label !== 'birthday' && product.cake_type_label !== 'pre_order') {
    return true;
  }
  return false;
}

/**
 * Lấy danh sách Set các ID và Tên bánh đã bị người dùng chủ động xóa.
 * Hỗ trợ so khớp cả ID và Tên (chuẩn hóa chữ thường không dấu / khoảng trắng thừa).
 */
export function getDeletedProductIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(BAKERY_DELETED_PRODUCT_IDS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.map((item) => String(item).toLowerCase().trim()));
      }
    }
  } catch (e) {
    console.warn('Lỗi đọc bakery_deleted_product_ids:', e);
  }
  return new Set();
}

export const DB_ROW_DELETED_PRODUCTS_ID = '00000000-0000-0000-0000-000000000021';
export const DB_ROW_DELETED_PRODUCTS_NAME = 'SYS_CONFIG_DELETED_PRODUCTS';

/**
 * Đồng bộ danh sách đen sản phẩm đã xóa lên Supabase SQL
 */
export async function syncDeletedProductIdsToDb(deletedIds: string[]): Promise<void> {
  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    await supabase.from('recipes').upsert({
      id: DB_ROW_DELETED_PRODUCTS_ID,
      name: DB_ROW_DELETED_PRODUCTS_NAME,
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      total_material_cost: 0,
      notes: JSON.stringify(deletedIds),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  } catch (err) {
    console.warn('Lỗi syncDeletedProductIdsToDb:', err);
  }
}

/**
 * Tải danh sách sản phẩm đã xóa từ Supabase SQL
 */
export async function fetchDeletedProductIdsFromDb(): Promise<string[]> {
  if (isLocalMode()) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_DELETED_PRODUCTS_ID},name.eq.${DB_ROW_DELETED_PRODUCTS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        if (typeof window !== 'undefined') {
          const localSet = getDeletedProductIds();
          parsed.forEach((id) => localSet.add(String(id).toLowerCase().trim()));
          localStorage.setItem(BAKERY_DELETED_PRODUCT_IDS_KEY, JSON.stringify(Array.from(localSet)));
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchDeletedProductIdsFromDb:', err);
  }
  return [];
}

/**
 * Đánh dấu một sản phẩm bánh đã bị xóa vào danh sách đen vĩnh viễn trong LocalStorage & Supabase.
 */
export function markProductAsDeleted(id: string, name?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedProductIds();
    if (id) set.add(String(id).toLowerCase().trim());
    if (name) set.add(String(name).toLowerCase().trim());

    const arr = Array.from(set);
    localStorage.setItem(BAKERY_DELETED_PRODUCT_IDS_KEY, JSON.stringify(arr));

    // Dọn dẹp cả trong bakery_stocks
    try {
      const rawStocks = localStorage.getItem(BAKERY_STOCKS_KEY);
      if (rawStocks) {
        const stockMap = JSON.parse(rawStocks);
        delete stockMap[id];
        if (name) delete stockMap[name.toLowerCase().trim()];
        localStorage.setItem(BAKERY_STOCKS_KEY, JSON.stringify(stockMap));
      }
    } catch {}

    // Đồng bộ lên Supabase Cloud SQL để chặn sản phẩm hồi sinh trên mọi thiết bị
    syncDeletedProductIdsToDb(arr).catch(() => {});
  } catch (e) {
    console.warn('Lỗi ghi bakery_deleted_product_ids:', e);
  }
}

/**
 * Gỡ bỏ ID/Tên bánh khỏi danh sách đen khi người dùng cố tình tạo lại bánh mới cùng tên/ID.
 */
export function unmarkProductDeleted(id: string, name?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const set = getDeletedProductIds();
    if (id) set.delete(String(id).toLowerCase().trim());
    if (name) set.delete(String(name).toLowerCase().trim());

    localStorage.setItem(BAKERY_DELETED_PRODUCT_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

/**
 * Lọc bỏ tất cả sản phẩm đã bị xóa hoặc có cờ is_active = false.
 */
export function filterActiveProducts(products: any[]): any[] {
  if (!Array.isArray(products) || products.length === 0) return [];
  const deletedSet = getDeletedProductIds();

  return products.filter((p) => {
    if (!p) return false;
    if (p.is_active === false) return false;

    const idKey = String(p.id || '').toLowerCase().trim();
    const nameKey = String(p.name || '').toLowerCase().trim();

    if (idKey && deletedSet.has(idKey)) return false;
    if (nameKey && deletedSet.has(nameKey)) return false;

    return true;
  });
}

/**
 * Thực hiện xóa triệt để một sản phẩm bánh trên toàn bộ hệ thống:
 * 1. Đưa ID & Tên vào danh sách đen LocalStorage (chặn hồi sinh từ Default list / Cache).
 * 2. Xóa khỏi mảng bakery_products trong LocalStorage.
 * 3. Xóa khỏi IndexedDB (Dexie).
 * 4. Xóa trên Supabase Cloud (Thử hard-delete trước, nếu có khóa ngoại đơn hàng thì soft-delete is_active = false).
 * 5. Phát sóng Realtime Sync sang các tab / thiết bị khác.
 * 6. Kích hoạt tự động đồng bộ sang file master_dump.sql nếu ở chế độ Local SQL.
 */
export async function deleteProductEverywhere(
  id: string,
  name?: string
): Promise<{ success: boolean; method: 'hard' | 'soft' | 'local_only' }> {
  // 1. Lưu danh sách đen
  markProductAsDeleted(id, name);

  // 2. Cập nhật LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(BAKERY_PRODUCTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const updated = parsed.filter(
            (p: any) =>
              p.id !== id &&
              (!name || String(p.name).toLowerCase().trim() !== String(name).toLowerCase().trim())
          );
          localStorage.setItem(BAKERY_PRODUCTS_KEY, JSON.stringify(updated));
        }
      }
    } catch (e) {
      console.warn('Lỗi dọn bakery_products LocalStorage:', e);
    }
  }

  // 3. Xóa trong IndexedDB Dexie
  try {
    if (db?.products) {
      await db.products.delete(id);
    }
  } catch (dbErr) {
    console.warn('Lỗi xóa IndexedDB:', dbErr);
  }

  let method: 'hard' | 'soft' | 'local_only' = 'local_only';

  // 4. Đồng bộ Supabase Cloud
  const isOnline = typeof navigator === 'undefined' || (navigator.onLine !== false);
  if (isOnline && !isLocalMode()) {
    try {
      // 4.1 Tháo gỡ khóa ngoại an toàn (order_items đã lưu snapshot tên/giá/cost đầy đủ)
      try {
        await supabase.from('order_items').update({ product_id: null }).eq('product_id', id);
      } catch {}
      try {
        await supabase.from('recipes').update({ product_id: null }).eq('product_id', id);
      } catch {}
      try {
        await supabase.from('product_variants').delete().eq('product_id', id);
      } catch {}

      // 4.2 Thử hard-delete theo ID và theo Tên
      let hardDeleted = false;
      const { error: hardErr } = await supabase.from('products').delete().eq('id', id);
      if (!hardErr) {
        hardDeleted = true;
      }
      if (name) {
        try {
          const { error: nameErr } = await supabase.from('products').delete().eq('name', name);
          if (!nameErr) hardDeleted = true;
        } catch {}
      }

      if (!hardDeleted) {
        console.warn('Hard delete Supabase thất bại, chuyển sang soft-delete is_active=false');
        await supabase
          .from('products')
          .update({ is_active: false, show_on_menu: false })
          .eq('id', id);
        if (name) {
          await supabase
            .from('products')
            .update({ is_active: false, show_on_menu: false })
            .eq('name', name);
        }
        method = 'soft';
      } else {
        method = 'hard';
      }
    } catch (sbErr) {
      console.warn('Lỗi thao tác Supabase khi xóa sản phẩm:', sbErr);
    }
  }

  // 5. Phát sóng Realtime Sync
  try {
    await broadcastProductChange({
      action: 'delete',
      product: { id, name },
    });
  } catch {}

  // 6. Phát sự kiện cập nhật giao diện
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('bakery_products_updated'));
    window.dispatchEvent(new Event('bakery_stocks_updated'));
  }

  // 7. Đồng bộ Local SQL Folder nếu ở chế độ Local Mode
  try {
    await autoSyncToLocalSqlFolder();
  } catch {}

  return { success: true, method };
}

export const BAKERY_PRODUCT_METADATA_KEY = 'bakery_product_metadata';
export const BAKERY_PRODUCT_METADATA_LEGACY_KEY = 'bakery_product_metadata_map';

/**
 * Đóng gói metadata sản phẩm vào URL ảnh (sử dụng hash #meta=...) để truyền an toàn qua Supabase
 * mà không bị lỗi do thiếu cột trong bảng products.
 */
export function encodeProductImageUrl(baseImageUrl?: string, meta?: any): string {
  const url = baseImageUrl || 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop';
  if (!meta || Object.keys(meta).length === 0) return url;

  const cleanUrl = url.split('#meta=')[0];
  try {
    const jsonStr = JSON.stringify(meta);
    return `${cleanUrl}#meta=${encodeURIComponent(jsonStr)}`;
  } catch {
    return url;
  }
}

/**
 * Giải mã metadata sản phẩm từ image_url hoặc từ local metadata map.
 */
export function decodeProductWithMeta(product: any): any {
  if (!product) return product;

  let meta: any = {};
  const rawUrl = String(product.image_url || '');

  // 1. Thử lấy từ hash URL
  const hashIdx = rawUrl.indexOf('#meta=');
  let cleanImageUrl = rawUrl;
  if (hashIdx !== -1) {
    cleanImageUrl = rawUrl.substring(0, hashIdx);
    try {
      meta = JSON.parse(decodeURIComponent(rawUrl.substring(hashIdx + 6)));
    } catch {}
  }

  // 2. Thử lấy từ local metadata storage nếu có
  if (typeof window !== 'undefined' && product.id) {
    try {
      const rawMetaMap = localStorage.getItem(BAKERY_PRODUCT_METADATA_KEY) || localStorage.getItem(BAKERY_PRODUCT_METADATA_LEGACY_KEY);
      if (rawMetaMap) {
        const metaMap = JSON.parse(rawMetaMap);
        const localMeta = metaMap[product.id] || (product.name ? metaMap[String(product.name).toLowerCase().trim()] : null);
        if (localMeta) {
          meta = { ...localMeta, ...meta };
        }
      }
    } catch {}
  }

  // 3. Nhận diện hàng nhập về bán
  const isImported = isImportedProduct({ ...product, ...meta });
  const prodType = meta.product_type || product.product_type || (isImported ? 'imported' : 'produced');

  const baseCost = Number(product.base_cost_price ?? meta.import_price ?? product.import_price ?? 0);
  const sellPrice = Number(product.selling_price ?? product.price ?? 0);
  const foodCostPct = Number(product.food_cost_pct) || (sellPrice > 0 ? Math.round((baseCost / sellPrice) * 100 * 100) / 100 : 33);

  return {
    ...product,
    ...meta,
    image_url: cleanImageUrl || product.image_url,
    product_type: prodType,
    import_price: meta.import_price !== undefined ? meta.import_price : (isImported ? baseCost : product.import_price),
    supplier_name: meta.supplier_name || product.supplier_name || (isImported ? 'Hàng nhập ngoài' : undefined),
    barcode: meta.barcode || product.barcode || undefined,
    stock_qty: product.stock_qty !== undefined ? product.stock_qty : meta.stock_qty,
    unit: product.unit || meta.unit || 'cái',
    is_preorder_only: isImported ? false : (product.is_preorder_only ?? false),
    cake_type_label: isImported ? 'standard' : (product.cake_type_label || meta.cake_type_label || 'standard'),
    show_on_menu: product.show_on_menu !== undefined ? product.show_on_menu : (meta.show_on_menu !== false),
    bom_preset_id: product.bom_preset_id || meta.bom_preset_id || undefined,
    base_cost_price: baseCost,
    selling_price: sellPrice,
    food_cost_pct: foodCostPct,
    is_active: product.is_active !== false,
  };
}

/**
 * Lưu metadata của sản phẩm vào local cache
 */
export function saveProductMetadata(id: string, name: string, meta: any): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(BAKERY_PRODUCT_METADATA_KEY) || localStorage.getItem(BAKERY_PRODUCT_METADATA_LEGACY_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (id) map[id] = meta;
    if (name) map[name.toLowerCase().trim()] = meta;
    const serialized = JSON.stringify(map);
    localStorage.setItem(BAKERY_PRODUCT_METADATA_KEY, serialized);
    localStorage.setItem(BAKERY_PRODUCT_METADATA_LEGACY_KEY, serialized);
  } catch {}
}

function toValidSupabaseUuid(id: string): string {
  if (!id) return '00000000-0000-4000-8000-000000000001';
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(12, '0').slice(-12);
  return `00000000-0000-4000-8000-${hex}`;
}

/**
 * Lưu sản phẩm lên Supabase một cách an toàn và chống lỗi schema.
 */
export async function persistProductToSupabase(product: any): Promise<{ success: boolean; error?: any }> {
  const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (!isOnline || isLocalMode()) return { success: true };

  // Khóa bảo vệ: Chặn đẩy các sản phẩm mẫu default chưa được cấp UUID thực (prod-*, 00000000-0000-4000-8000-*)
  const isRealUuid = product.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(product.id) && !String(product.id).startsWith('00000000-0000-4000-8000-');
  if (!isRealUuid && product.id && (String(product.id).startsWith('prod-') || String(product.id).startsWith('00000000-0000-4000-8000-'))) {
    console.warn('Đã chặn đẩy sản phẩm mẫu mặc định lên Supabase SQL:', product.name);
    return { success: true };
  }

  const isImported = isImportedProduct(product);
  const baseCost = Number(product.base_cost_price ?? product.import_price ?? 0);
  const sellPrice = Number(product.selling_price ?? 0);
  const supabaseUuid = toValidSupabaseUuid(product.id);

  const metaData = {
    product_type: product.product_type || (isImported ? 'imported' : 'produced'),
    import_price: product.import_price || (isImported ? baseCost : undefined),
    supplier_name: product.supplier_name || (isImported ? 'Hàng nhập ngoài' : undefined),
    barcode: product.barcode || undefined,
    stock_qty: product.stock_qty ?? 0,
    unit: product.unit || 'cái',
    cake_type_label: product.cake_type_label || 'standard',
    show_on_menu: product.show_on_menu !== false,
    bom_preset_id: product.bom_preset_id || undefined,
  };

  // Lưu metadata cục bộ
  saveProductMetadata(product.id, product.name, metaData);

  // 1. Thử insert/upsert với đầy đủ các cột (nếu DB đã có schema mới)
  const fullPayload: any = {
    id: supabaseUuid,
    name: product.name,
    category: product.category || (isImported ? 'Bánh nhập về bán' : 'Bánh tiệm làm'),
    selling_price: sellPrice,
    base_cost_price: baseCost,
    import_price: metaData.import_price || null,
    product_type: metaData.product_type || 'produced',
    supplier_name: metaData.supplier_name || null,
    barcode: metaData.barcode || null,
    stock_qty: metaData.stock_qty ?? 0,
    image_url: product.image_url || null,
    is_preorder_only: isImported ? false : Boolean(product.is_preorder_only),
    cake_type_label: metaData.cake_type_label || 'standard',
    show_on_menu: metaData.show_on_menu !== false,
    bom_preset_id: (metaData.bom_preset_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(metaData.bom_preset_id)) ? metaData.bom_preset_id : null,
    is_active: product.is_active !== false,
  };
  if (product.recipe_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.recipe_id)) {
    fullPayload.recipe_id = product.recipe_id;
  }

  try {
    const { error: fullErr } = await supabase.from('products').upsert(fullPayload);
    if (!fullErr) {
      return { success: true };
    }
  } catch {}

  // 2. Fallback: Lưu các cột tiêu chuẩn của Supabase, đóng gói metadata vào image_url
  const encodedImageUrl = encodeProductImageUrl(product.image_url, metaData);
  const standardPayload: any = {
    id: supabaseUuid,
    name: product.name,
    category: product.category || (isImported ? 'Bánh nhập về bán' : 'Bánh tiệm làm'),
    selling_price: sellPrice,
    base_cost_price: baseCost,
    image_url: encodedImageUrl,
    is_active: product.is_active !== false,
    is_preorder_only: isImported ? false : Boolean(product.is_preorder_only),
  };
  if (product.recipe_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.recipe_id)) {
    standardPayload.recipe_id = product.recipe_id;
  }

  try {
    const { error: stdErr } = await supabase.from('products').upsert(standardPayload);
    if (stdErr) {
      console.error('Lưu sản phẩm Supabase thất bại:', stdErr);
      return { success: false, error: stdErr };
    }
    return { success: true };
  } catch (e) {
    console.error('Lỗi ngoại lệ khi lưu sản phẩm Supabase:', e);
    return { success: false, error: e };
  }
}

/**
 * Hợp nhất danh sách sản phẩm cục bộ (Local / Dexie) với danh sách từ Supabase Cloud.
 * ĐẢM BẢO: Không bao giờ làm mất sản phẩm vừa tạo ở máy cục bộ chỉ vì Supabase chưa kịp có hoặc tải lại trang!
 */
export function mergeProductLists(localList: any[], supabaseList: any[]): any[] {
  const deletedSet = getDeletedProductIds();
  const productMap = new Map<string, any>();
  const nameToKeyMap = new Map<string, string>();

  // Đọc dữ liệu tồn kho cục bộ nếu có
  let localStocks: Record<string, number> = {};
  if (typeof window !== 'undefined') {
    try {
      const rawStocks = localStorage.getItem(BAKERY_STOCKS_KEY);
      if (rawStocks) localStocks = JSON.parse(rawStocks);
    } catch {}
  }

  // 1. Đưa các sản phẩm Supabase vào map trước
  if (Array.isArray(supabaseList)) {
    for (const raw of supabaseList) {
      if (!raw) continue;
      const decoded = decodeProductWithMeta(raw);
      if (decoded.is_active === false) continue;
      const idKey = String(decoded.id || '').toLowerCase().trim();
      const nameKey = String(decoded.name || '').toLowerCase().trim();
      if (idKey && deletedSet.has(idKey)) continue;
      if (nameKey && deletedSet.has(nameKey)) continue;

      const primaryKey = decoded.id || nameKey;
      productMap.set(primaryKey, decoded);
      if (nameKey) {
        nameToKeyMap.set(nameKey, primaryKey);
      }
    }
  }

  // 2. Hợp nhất các sản phẩm Local
  if (Array.isArray(localList)) {
    for (const raw of localList) {
      if (!raw) continue;
      const decoded = decodeProductWithMeta(raw);
      if (decoded.is_active === false) continue;
      const idKey = String(decoded.id || '').toLowerCase().trim();
      const nameKey = String(decoded.name || '').toLowerCase().trim();
      if (idKey && deletedSet.has(idKey)) continue;
      if (nameKey && deletedSet.has(nameKey)) continue;

      // Khớp theo ID trực tiếp, hoặc khớp qua tên sản phẩm
      let matchedKey = decoded.id && productMap.has(decoded.id) ? decoded.id : null;
      if (!matchedKey && nameKey && nameToKeyMap.has(nameKey)) {
        matchedKey = nameToKeyMap.get(nameKey)!;
      }
      if (!matchedKey && nameKey && productMap.has(nameKey)) {
        matchedKey = nameKey;
      }

      if (matchedKey && productMap.has(matchedKey)) {
        const existing = productMap.get(matchedKey)!;
        // Ưu tiên số lượng tồn kho:
        // 1. localStocks map (người dùng vừa thao tác sửa tức thì)
        // 2. existing.stock_qty (từ Supabase)
        // 3. decoded.stock_qty -> 10
        const localVal = localStocks[matchedKey] ?? (nameKey ? localStocks[nameKey] : undefined);
        const resolvedStock = localVal !== undefined
          ? localVal
          : (existing.stock_qty !== undefined ? existing.stock_qty : (decoded.stock_qty ?? 10));

        productMap.set(matchedKey, {
          ...decoded,
          ...existing,
          id: existing.id || decoded.id,
          stock_qty: resolvedStock,
          image_url: existing.image_url || decoded.image_url,
          product_type: existing.product_type || decoded.product_type,
          supplier_name: existing.supplier_name || decoded.supplier_name,
          import_price: existing.import_price || decoded.import_price,
          barcode: existing.barcode || decoded.barcode,
        });
      } else {
        // Giữ nguyên sản phẩm chỉ có ở máy cục bộ (hoặc mới đồng bộ từ BOM) chưa có trên Supabase
        const localKey = decoded.id || nameKey;
        const localVal = localStocks[localKey] ?? (nameKey ? localStocks[nameKey] : undefined);
        productMap.set(localKey, {
          ...decoded,
          stock_qty: localVal !== undefined ? localVal : (decoded.stock_qty ?? 10),
        });
        if (nameKey) nameToKeyMap.set(nameKey, localKey);
      }
    }
  }

  // Đảm bảo không sản phẩm nào có stock_qty bị undefined
  for (const prod of productMap.values()) {
    const nameKey = String(prod.name || '').toLowerCase().trim();
    if (prod.stock_qty === undefined || prod.stock_qty === null) {
      prod.stock_qty = localStocks[prod.id] ?? (nameKey ? localStocks[nameKey] : undefined) ?? 10;
    }
  }

  return Array.from(productMap.values());
}

/**
 * Lấy ảnh bánh mặc định chất lượng cao dựa theo tên và phân loại bánh.
 */
export function getDefaultCakeImageUrl(name: string, category?: string): string {
  const n = (name || '').toLowerCase().trim();
  const cat = (category || '').toLowerCase().trim();

  // 1. Bánh mì chuột, baguette, bánh mì truyền thống
  if (n.includes('chuột') || n.includes('baguette') || n.includes('bánh mì việt') || n.includes('bánh mì không') || n.includes('bánh mì ổ')) {
    return 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=600&auto=format&fit=crop';
  }
  // 2. Bánh mì hoa cúc, brioche, bánh mì bơ sữa
  if (n.includes('hoa cúc') || n.includes('brioche') || n.includes('bơ sữa') || n.includes('hoa cuc')) {
    return 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop';
  }
  // 3. Bánh sừng bò, Croissant, Danish
  if (n.includes('croissant') || n.includes('sừng bò') || n.includes('sung bo') || n.includes('danish')) {
    return 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop';
  }
  // 4. Bánh donut
  if (n.includes('donut') || n.includes('đô nắt') || n.includes('vòng')) {
    return 'https://images.unsplash.com/photo-1527515862127-a4fc05baf7a5?w=600&auto=format&fit=crop';
  }
  // 5. Bánh sinh nhật socola, ganache
  if ((n.includes('sinh nhật') || cat.includes('sinh nhật') || cat.includes('kem')) && (n.includes('socola') || n.includes('choco'))) {
    return 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop';
  }
  // 6. Bánh sinh nhật vani, whipping, kem sữa, bento, trái cây
  if (n.includes('sinh nhật') || cat.includes('sinh nhật') || cat.includes('kem') || n.includes('bento') || n.includes('whipping')) {
    return 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?w=600&auto=format&fit=crop';
  }
  // 7. Bánh su kem, choux
  if (n.includes('su kem') || n.includes('choux')) {
    return 'https://images.unsplash.com/photo-1612203985729-70726954388c?w=600&auto=format&fit=crop';
  }
  // 8. Bánh tiramisu, mousse, cheese
  if (n.includes('tiramisu') || n.includes('mousse') || n.includes('cheese')) {
    return 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&auto=format&fit=crop';
  }
  // 9. Mặc định chung cho bánh tiệm nướng
  return 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=600&auto=format&fit=crop';
}

/**
 * Tự động đồng bộ tất cả bánh thường và bánh sinh nhật có BOM vào danh mục Sản Phẩm Bánh (Products)
 * - Bánh có BOM mặc định được thêm vào danh sách bánh và có ảnh đẹp tương ứng.
 * - Loại bỏ hoàn toàn sự phụ thuộc vào việc phải nhấn "Thêm bánh theo BOM" thủ công.
 */
export function syncBomToProducts(
  recipes: any[] = [],
  birthdayPresets: any[] = [],
  currentProducts: any[] = []
): { updatedProducts: any[]; addedCount: number } {
  const deletedSet = getDeletedProductIds();
  const prodMap = new Map<string, any>();
  const nameMap = new Map<string, any>();

  for (const p of currentProducts) {
    if (!p) continue;
    const pId = String(p.id || '').toLowerCase().trim();
    const pName = String(p.name || '').toLowerCase().trim();
    if (pId) prodMap.set(pId, p);
    if (pName) nameMap.set(pName, p);
    if (p.recipe_id) prodMap.set(String(p.recipe_id).toLowerCase().trim(), p);
    if (p.bom_preset_id) prodMap.set(String(p.bom_preset_id).toLowerCase().trim(), p);
  }

  const result = [...currentProducts];
  let addedCount = 0;

  // 1. Quét qua Bánh thường có BOM (recipes)
  for (const rec of recipes) {
    if (!rec || !rec.name) continue;
    const recName = String(rec.name).trim();
    if (
      recName.startsWith('SYS_') ||
      recName.startsWith('SYSTEM_') ||
      recName.startsWith('DB_ROW_') ||
      rec.category === 'system_config'
    ) {
      continue;
    }

    const nameKey = recName.toLowerCase();
    const idKey = String(rec.id || '').toLowerCase();

    // Không hồi sinh bánh đã bị xóa
    if (deletedSet.has(nameKey) || (idKey && deletedSet.has(idKey))) continue;

    const existing = (idKey && prodMap.get(idKey)) || nameMap.get(nameKey);
    if (!existing) {
      const defaultImg = getDefaultCakeImageUrl(recName, rec.category);
      const cost = Math.round(Number(rec.cost_per_unit) || 0);
      const sellPrice = Number(rec.suggested_price) > 0
        ? Number(rec.suggested_price)
        : (cost > 0 ? Math.round(cost / 0.35 / 1000) * 1000 : 35000);

      const isValidUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      const prodId = isValidUuid(rec.product_id)
        ? rec.product_id
        : (isValidUuid(rec.id) ? rec.id : toValidSupabaseUuid(`bom-recipe-${rec.id || recName}`));

      const newProd = {
        id: prodId,
        name: recName,
        category: rec.category || 'Bánh tươi',
        selling_price: sellPrice,
        price: sellPrice,
        base_cost_price: cost,
        image_url: defaultImg,
        product_type: 'produced',
        is_active: true,
        stock_qty: 10,
        unit: rec.yield_unit || 'cái',
        bom_preset_id: rec.id,
        recipe_id: rec.id,
        show_on_menu: true,
      };

      result.push(newProd);
      prodMap.set(String(newProd.id).toLowerCase(), newProd);
      nameMap.set(nameKey, newProd);
      addedCount++;
      persistProductToSupabase(newProd).catch(() => {});
    } else {
      // Nếu sản phẩm đã có nhưng chưa có ảnh hoặc ảnh trống -> bổ sung ảnh mặc định
      if (!existing.image_url || existing.image_url === '') {
        existing.image_url = getDefaultCakeImageUrl(recName, rec.category);
        if (!existing.bom_preset_id) existing.bom_preset_id = rec.id;
        if (!existing.recipe_id) existing.recipe_id = rec.id;
      }
    }
  }

  // 2. Quét qua Bánh sinh nhật có BOM (birthdayPresets)
  for (const preset of birthdayPresets) {
    if (!preset || !preset.name) continue;
    const presetName = String(preset.name).trim();
    if (
      presetName.startsWith('SYS_') ||
      presetName.startsWith('SYSTEM_') ||
      presetName.startsWith('DB_ROW_')
    ) {
      continue;
    }

    const nameKey = presetName.toLowerCase();
    const idKey = String(preset.id || '').toLowerCase();

    // Không hồi sinh bánh đã bị xóa
    if (deletedSet.has(nameKey) || (idKey && deletedSet.has(idKey))) continue;

    const existing = (idKey && prodMap.get(idKey)) || nameMap.get(nameKey);
    if (!existing) {
      const defaultImg = getDefaultCakeImageUrl(presetName, 'Bánh kem & Bánh đặt');
      const targetCostPct = Number(preset.targetFoodCostPct) || 36.5;
      const sellPrice = Number(preset.suggestedSellingPrice) || 380000;
      const cost = Math.round(sellPrice * targetCostPct / 100);

      const isValidUuid = (val: any) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      const prodId = isValidUuid(preset.id)
        ? preset.id
        : toValidSupabaseUuid(`bom-preset-${preset.id || presetName}`);

      const newProd = {
        id: prodId,
        name: presetName,
        category: 'Bánh kem & Bánh đặt',
        selling_price: sellPrice,
        price: sellPrice,
        base_cost_price: cost,
        image_url: defaultImg,
        product_type: 'produced',
        cake_type_label: 'birthday',
        is_active: true,
        stock_qty: 5,
        unit: 'ổ',
        bom_preset_id: preset.id,
        recipe_id: preset.id,
        show_on_menu: true,
      };

      result.push(newProd);
      prodMap.set(String(newProd.id).toLowerCase(), newProd);
      nameMap.set(nameKey, newProd);
      addedCount++;
      persistProductToSupabase(newProd).catch(() => {});
    } else {
      if (!existing.image_url || existing.image_url === '') {
        existing.image_url = getDefaultCakeImageUrl(presetName, 'Bánh kem & Bánh đặt');
        if (!existing.bom_preset_id) existing.bom_preset_id = preset.id;
      }
    }
  }

  if (addedCount > 0 && typeof window !== 'undefined') {
    try {
      localStorage.setItem('bakery_products', JSON.stringify(result));
      // Không tự dispatch event bakery_products_updated ở đây để chặn vòng lặp vô hạn gây nháy màn hình POS
    } catch {}
  }

  return { updatedProducts: result, addedCount };
}

/**
 * Kiểm tra xem một sản phẩm có thuộc định mức BOM (Công thức bánh thường hoặc BOM bánh sinh nhật) hay không.
 * Bánh thuộc BOM mặc định không được phép xóa ở mục Bánh & Ảnh, chỉ bị xóa khi xóa BOM của bánh.
 */
export function isProductFromBom(
  product: any,
  recipesList?: any[],
  birthdayPresetsList?: any[]
): boolean {
  if (!product) return false;

  // 1. Kiểm tra cờ liên kết trực tiếp
  if (product.bom_preset_id || product.recipe_id) return true;

  const pId = String(product.id || '').toLowerCase().trim();
  const pName = String(product.name || '').toLowerCase().trim();

  // 2. Kiểm tra danh sách recipes (bánh thường có BOM)
  let recipes = recipesList;
  if (!recipes && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_recipes');
      if (raw) recipes = JSON.parse(raw);
    } catch {}
  }
  if (Array.isArray(recipes)) {
    for (const r of recipes) {
      if (!r) continue;
      const rId = String(r.id || '').toLowerCase().trim();
      const rProdId = String(r.product_id || '').toLowerCase().trim();
      const rName = String(r.name || '').toLowerCase().trim();
      if (
        (rId && (pId === rId || rId === String(product.recipe_id || '').toLowerCase().trim())) ||
        (rProdId && pId === rProdId) ||
        (rName && pName === rName)
      ) {
        return true;
      }
    }
  }

  // 3. Kiểm tra danh sách birthdayPresets (bánh sinh nhật có BOM)
  let bPresets = birthdayPresetsList;
  if (!bPresets && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_full_bom_config');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.birthdayBomPresets)) {
          bPresets = parsed.birthdayBomPresets;
        }
      }
    } catch {}
  }
  if (Array.isArray(bPresets)) {
    for (const b of bPresets) {
      if (!b) continue;
      const bId = String(b.id || '').toLowerCase().trim();
      const bName = String(b.name || '').toLowerCase().trim();
      if (
        (bId && (pId === bId || bId === String(product.bom_preset_id || '').toLowerCase().trim())) ||
        (bName && pName === bName)
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Tự động xóa sản phẩm tương ứng trong mục Bánh & Ảnh khi một công thức hoặc định mức BOM bị xóa.
 */
export async function deleteProductByBomRef(
  bomId: string,
  bomName?: string
): Promise<{ success: boolean; deletedCount: number }> {
  let deletedCount = 0;
  if (typeof window === 'undefined') return { success: true, deletedCount: 0 };

  try {
    const raw = localStorage.getItem(BAKERY_PRODUCTS_KEY);
    if (!raw) return { success: true, deletedCount: 0 };
    const prods = JSON.parse(raw);
    if (!Array.isArray(prods) || prods.length === 0) return { success: true, deletedCount: 0 };

    const bIdLower = String(bomId || '').toLowerCase().trim();
    const bNameLower = String(bomName || '').toLowerCase().trim();

    const targets = prods.filter((p: any) => {
      if (!p) return false;
      const pId = String(p.id || '').toLowerCase().trim();
      const pName = String(p.name || '').toLowerCase().trim();
      const rId = String(p.recipe_id || '').toLowerCase().trim();
      const presetId = String(p.bom_preset_id || '').toLowerCase().trim();

      const matchId = Boolean(bIdLower && (pId === bIdLower || rId === bIdLower || presetId === bIdLower));
      const matchName = Boolean(bNameLower && pName === bNameLower);

      return matchId || matchName;
    });

    for (const t of targets) {
      await deleteProductEverywhere(t.id, t.name);
      deletedCount++;
    }

    if (deletedCount > 0) {
      window.dispatchEvent(new Event('bakery_products_updated'));
    }
  } catch (err) {
    console.warn('Lỗi deleteProductByBomRef:', err);
  }

  return { success: true, deletedCount };
}

