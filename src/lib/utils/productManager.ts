// src/lib/utils/productManager.ts
// Quản lý sản phẩm bánh, thực đơn và cơ chế xóa triệt để (Không bị hồi sinh khi tải lại trang)

import { supabase } from '@/lib/supabase/client';
import { db } from '@/lib/db/dexie';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { broadcastProductChange } from '@/lib/supabase/realtimeSync';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

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

/**
 * Đánh dấu một sản phẩm bánh đã bị xóa vào danh sách đen vĩnh viễn trong LocalStorage.
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
    await db.products.delete(id);
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

export const BAKERY_PRODUCT_METADATA_KEY = 'bakery_product_metadata_map';

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
      const rawMetaMap = localStorage.getItem(BAKERY_PRODUCT_METADATA_KEY);
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
    stock_qty: product.stock_qty !== undefined ? product.stock_qty : (meta.stock_qty ?? 10),
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
    const raw = localStorage.getItem(BAKERY_PRODUCT_METADATA_KEY);
    const map = raw ? JSON.parse(raw) : {};
    if (id) map[id] = meta;
    if (name) map[name.toLowerCase().trim()] = meta;
    localStorage.setItem(BAKERY_PRODUCT_METADATA_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Lưu sản phẩm lên Supabase một cách an toàn và chống lỗi schema.
 */
export async function persistProductToSupabase(product: any): Promise<{ success: boolean; error?: any }> {
  const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (!isOnline || isLocalMode()) return { success: true };

  const isImported = isImportedProduct(product);
  const baseCost = Number(product.base_cost_price ?? product.import_price ?? 0);
  const sellPrice = Number(product.selling_price ?? 0);

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
    id: product.id,
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
    bom_preset_id: metaData.bom_preset_id || null,
    is_active: product.is_active !== false,
  };
  if (product.recipe_id) fullPayload.recipe_id = product.recipe_id;

  try {
    const { error: fullErr } = await supabase.from('products').upsert(fullPayload);
    if (!fullErr) {
      return { success: true };
    }
  } catch {}

  // 2. Fallback: Lưu các cột tiêu chuẩn của Supabase, đóng gói metadata vào image_url
  const encodedImageUrl = encodeProductImageUrl(product.image_url, metaData);
  const standardPayload: any = {
    id: product.id,
    name: product.name,
    category: product.category || (isImported ? 'Bánh nhập về bán' : 'Bánh tiệm làm'),
    selling_price: sellPrice,
    base_cost_price: baseCost,
    image_url: encodedImageUrl,
    is_active: product.is_active !== false,
    is_preorder_only: isImported ? false : Boolean(product.is_preorder_only),
  };
  if (product.recipe_id) standardPayload.recipe_id = product.recipe_id;

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

      productMap.set(decoded.id || nameKey, decoded);
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

      const key = decoded.id || nameKey;
      if (productMap.has(key)) {
        const existing = productMap.get(key);
        productMap.set(key, {
          ...existing,
          ...decoded,
          stock_qty: decoded.stock_qty !== undefined ? decoded.stock_qty : existing.stock_qty,
          image_url: decoded.image_url || existing.image_url,
          product_type: decoded.product_type || existing.product_type,
          supplier_name: decoded.supplier_name || existing.supplier_name,
          import_price: decoded.import_price || existing.import_price,
          barcode: decoded.barcode || existing.barcode,
        });
      } else {
        // Giữ lại sản phẩm local và đẩy lên Supabase ngầm
        productMap.set(key, decoded);
        persistProductToSupabase(decoded).catch(console.error);
      }
    }
  }

  return Array.from(productMap.values());
}
