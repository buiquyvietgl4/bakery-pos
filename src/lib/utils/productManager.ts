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
