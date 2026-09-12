// src/lib/utils/localSqlManager.ts
// Quản lý cơ sở dữ liệu Local SQL: sinh tệp SQL, chọn thư mục máy tính, nạp & khôi phục dữ liệu

import { BakeryBackupData } from '@/lib/types/backup';
import { gatherFullBakeryData } from '@/lib/utils/backupManager';
import { 
  getSqlModeConfig, 
  saveSqlModeConfig, 
  isLocalMode,
  applyDataSnapshot
} from '@/lib/utils/sqlModeManager';
import { supabase } from '@/lib/supabase/client';
import { db } from '@/lib/db/dexie';

const LOCAL_SQL_DB_NAME = 'bakery_local_sql_handle_db';
const LOCAL_SQL_STORE = 'local_sql_handles';
const HANDLE_KEY = 'local_sql_dir_handle';

// ── 1. QUẢN LÝ DIRECTORY HANDLE TRÊN TRÌNH DUYỆT (INDEXEDDB) ──
function openLocalSqlHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB không được hỗ trợ'));
    }
    const req = indexedDB.open(LOCAL_SQL_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(LOCAL_SQL_STORE)) {
        idb.createObjectStore(LOCAL_SQL_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeLocalSqlDirHandle(handle: any): Promise<void> {
  try {
    const idb = await openLocalSqlHandleDB();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(LOCAL_SQL_STORE, 'readwrite');
      const store = tx.objectStore(LOCAL_SQL_STORE);
      const req = store.put(handle, HANDLE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Không thể lưu LocalSql Handle vào IndexedDB:', err);
  }
}

export async function getStoredLocalSqlDirHandle(): Promise<any | null> {
  try {
    const idb = await openLocalSqlHandleDB();
    return new Promise((resolve) => {
      const tx = idb.transaction(LOCAL_SQL_STORE, 'readonly');
      const store = tx.objectStore(LOCAL_SQL_STORE);
      const req = store.get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function checkLocalSqlDirPermission(dirHandle?: any): Promise<'granted' | 'prompt' | 'denied' | 'no_handle'> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return 'no_handle';
  try {
    const handle = dirHandle || (await getStoredLocalSqlDirHandle());
    if (!handle) return 'no_handle';
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

export async function requestLocalSqlDirPermission(dirHandle?: any): Promise<boolean> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return false;
  try {
    const handle = dirHandle || (await getStoredLocalSqlDirHandle());
    if (!handle) return false;
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    return perm === 'granted';
  } catch {
    return false;
  }
}

/**
 * Chọn thư mục lưu CSDL Local trên máy tính (sử dụng File System Access API)
 */
export async function selectLocalSqlDirectory(): Promise<{ success: boolean; folderName?: string; error?: string }> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
    return {
      success: false,
      error: 'Trình duyệt này không hỗ trợ File System Access API. Bạn có thể nhập đường dẫn thư mục máy tính ở ô bên dưới.',
    };
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });

    if (dirHandle) {
      await storeLocalSqlDirHandle(dirHandle);
      const folderName = dirHandle.name || 'Thư mục Local SQL';
      saveSqlModeConfig({ localFolderName: folderName });

      // Lập tức xuất dữ liệu khởi tạo vào thư mục vừa chọn
      try {
        const fullData = await gatherFullBakeryData();
        await writeLocalSqlFiles(dirHandle, fullData);
        saveSqlModeConfig({ lastLocalSyncAt: new Date().toISOString() });
      } catch (e) {
        console.warn('Lỗi ghi file SQL ban đầu vào thư mục:', e);
      }

      return { success: true, folderName };
    }
    return { success: false, error: 'Chưa chọn thư mục' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Đã hủy chọn thư mục' };
    }
    return { success: false, error: err.message || 'Lỗi khi mở cửa sổ chọn thư mục' };
  }
}

// ── 2. TRÌNH TẠO TỆP SQL DUMP VÀ SCHEMA (DDL & DML) ──
function sqlEscape(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return isNaN(val) ? '0' : String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

export function generateSchemaSql(): string {
  return `-- ============================================================================
-- CẤU TRÚC BẢNG CƠ SỞ DỮ LIỆU TIỆM BÁNH (BAKERY ERP & POS - LOCAL SQL SCHEMA)
-- Tương thích: PostgreSQL, SQLite, MySQL
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    selling_price NUMERIC DEFAULT 0,
    base_cost_price NUMERIC DEFAULT 0,
    import_price NUMERIC DEFAULT 0,
    product_type TEXT DEFAULT 'produced',
    supplier_name TEXT,
    barcode TEXT,
    food_cost_pct NUMERIC DEFAULT 35,
    stock_qty NUMERIC DEFAULT 10,
    unit TEXT DEFAULT 'cái',
    is_preorder_only BOOLEAN DEFAULT FALSE,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'g',
    category TEXT,
    stock_qty NUMERIC DEFAULT 0,
    reorder_level NUMERIC DEFAULT 0,
    avg_cost NUMERIC DEFAULT 0,
    wastage_pct NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Bánh tươi',
    yield_qty NUMERIC DEFAULT 1,
    yield_unit TEXT DEFAULT 'chiếc',
    cost_per_unit NUMERIC DEFAULT 0,
    target_food_cost_pct NUMERIC DEFAULT 35,
    suggested_price NUMERIC DEFAULT 0,
    bake_time_minutes NUMERIC DEFAULT 25,
    bake_temp_celsius NUMERIC DEFAULT 190,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipe_items (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    ingredient_id TEXT NOT NULL,
    quantity NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'g',
    line_cost NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL,
    order_type TEXT DEFAULT 'takeaway',
    status TEXT DEFAULT 'pending',
    total_amount NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    final_amount NUMERIC DEFAULT 0,
    total_cogs NUMERIC DEFAULT 0,
    deposit_amount NUMERIC DEFAULT 0,
    remaining_amount NUMERIC DEFAULT 0,
    shipping_fee NUMERIC DEFAULT 0,
    payment_status TEXT DEFAULT 'paid',
    payment_method TEXT DEFAULT 'cash',
    notes TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    cake_name TEXT,
    cake_message TEXT,
    delivery_method TEXT DEFAULT 'pickup',
    shipping_address TEXT,
    preorder_pickup_at TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT,
    product_name_snapshot TEXT,
    quantity NUMERIC DEFAULT 1,
    unit_price NUMERIC DEFAULT 0,
    unit_cost NUMERIC DEFAULT 0,
    subtotal NUMERIC DEFAULT 0,
    line_cost NUMERIC DEFAULT 0,
    product_type TEXT DEFAULT 'produced',
    supplier_name TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS operating_expenses (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    amount NUMERIC DEFAULT 0,
    description TEXT,
    date TEXT,
    payment_method TEXT DEFAULT 'cash',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashflow_transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    category TEXT,
    amount NUMERIC DEFAULT 0,
    description TEXT,
    date TEXT,
    method TEXT DEFAULT 'cash',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spoilage_logs (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    product_name TEXT,
    quantity NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'cái',
    base_cost NUMERIC DEFAULT 0,
    selling_price NUMERIC DEFAULT 0,
    total_cost_loss NUMERIC DEFAULT 0,
    reason TEXT,
    notes TEXT,
    logged_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    product_name TEXT,
    old_stock NUMERIC DEFAULT 0,
    new_stock NUMERIC DEFAULT 0,
    difference NUMERIC DEFAULT 0,
    reason TEXT,
    notes TEXT,
    adjusted_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounting_closings (
    id TEXT PRIMARY KEY,
    period_type TEXT,
    period_key TEXT,
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_by TEXT,
    total_revenue NUMERIC DEFAULT 0,
    total_cash_sales NUMERIC DEFAULT 0,
    actual_cash_counted NUMERIC DEFAULT 0,
    cash_difference NUMERIC DEFAULT 0,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS security_config (
    id TEXT PRIMARY KEY,
    admin_password_hash TEXT,
    cashier_pin TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vietqr_config (
    id TEXT PRIMARY KEY,
    bank_id TEXT,
    bank_name TEXT,
    account_no TEXT,
    account_name TEXT,
    template TEXT DEFAULT 'compact2',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_branding (
    id TEXT PRIMARY KEY,
    store_name TEXT,
    tagline TEXT,
    address TEXT,
    phone TEXT,
    wifi_password TEXT,
    logo_url TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS printer_configs (
    id TEXT PRIMARY KEY,
    printer_name TEXT,
    paper_size TEXT DEFAULT '80mm',
    connection_type TEXT DEFAULT 'usb',
    auto_print BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ewallet_config (
    id TEXT PRIMARY KEY,
    momo_phone TEXT,
    momo_name TEXT,
    momo_qr_url TEXT,
    zalopay_phone TEXT,
    zalopay_name TEXT,
    zalopay_qr_url TEXT,
    viettelmoney_phone TEXT,
    viettelmoney_name TEXT,
    viettelmoney_qr_url TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cake_costing_config (
    id TEXT PRIMARY KEY,
    config_data TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;
}

export function generateMasterSqlDump(data: any): string {
  const nowStr = new Date().toLocaleString('vi-VN');
  let sql = `-- ============================================================================
-- MASTER SQL DUMP: TOÀN BỘ CƠ SỞ DỮ LIỆU TIỆM BÁNH (LOCAL SQL)
-- Thời gian xuất: ${nowStr}
-- Tổng sản phẩm: ${data?.products?.length || 0}
-- Tổng đơn hàng: ${data?.orders?.length || 0}
-- Độc lập hoàn toàn, không phụ thuộc vào Supabase hay kết nối mạng Internet.
-- ============================================================================

${generateSchemaSql()}

-- ----------------------------------------------------------------------------
-- 1. BẢNG SẢN PHẨM (PRODUCTS)
-- ----------------------------------------------------------------------------
`;

  if (Array.isArray(data?.products) && data.products.length > 0) {
    for (const p of data.products) {
      const price = p.selling_price ?? p.price ?? 0;
      const cost = p.base_cost_price ?? p.cost_price ?? Math.round(price * 0.35);
      const foodCostPct = p.food_cost_pct ?? 35;
      const importPrice = p.import_price ?? cost;
      const prodType = p.product_type || 'produced';
      sql += `INSERT INTO products (id, name, category, selling_price, base_cost_price, import_price, product_type, supplier_name, barcode, food_cost_pct, stock_qty, unit, is_preorder_only, image_url) VALUES (${sqlEscape(p.id)}, ${sqlEscape(p.name)}, ${sqlEscape(p.category)}, ${sqlEscape(price)}, ${sqlEscape(cost)}, ${sqlEscape(importPrice)}, ${sqlEscape(prodType)}, ${sqlEscape(p.supplier_name)}, ${sqlEscape(p.barcode)}, ${sqlEscape(foodCostPct)}, ${sqlEscape(p.stock_qty ?? 10)}, ${sqlEscape(p.unit || 'cái')}, ${sqlEscape(p.is_preorder_only || false)}, ${sqlEscape(p.image_url)});
`;
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 2. BẢNG NGUYÊN LIỆU (INGREDIENTS)
-- ----------------------------------------------------------------------------
`;
  if (Array.isArray(data?.ingredients) && data.ingredients.length > 0) {
    for (const ing of data.ingredients) {
      sql += `INSERT INTO ingredients (id, name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct) VALUES (${sqlEscape(ing.id)}, ${sqlEscape(ing.name)}, ${sqlEscape(ing.unit || 'g')}, ${sqlEscape(ing.category)}, ${sqlEscape(ing.stock_qty || 0)}, ${sqlEscape(ing.reorder_level || 0)}, ${sqlEscape(ing.avg_cost || 0)}, ${sqlEscape(ing.wastage_pct || 0)});
`;
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 3. BẢNG CÔNG THỨC BOM (RECIPES & RECIPE_ITEMS)
-- ----------------------------------------------------------------------------
`;
  if (Array.isArray(data?.recipes) && data.recipes.length > 0) {
    for (const r of data.recipes) {
      const costPerUnit = r.cost_per_unit ?? r.costPerUnit ?? 0;
      const targetPct = r.target_food_cost_pct ?? r.targetFoodCostPct ?? 35;
      const sugPrice = r.suggested_price ?? r.suggestedPrice ?? 0;
      const bakeMins = r.bake_time_minutes ?? r.bakeTimeMinutes ?? 25;
      const bakeTemp = r.bake_temp_celsius ?? r.bakeTempCelsius ?? 190;
      sql += `INSERT INTO recipes (id, name, category, yield_qty, yield_unit, cost_per_unit, target_food_cost_pct, suggested_price, bake_time_minutes, bake_temp_celsius, is_active) VALUES (${sqlEscape(r.id)}, ${sqlEscape(r.name)}, ${sqlEscape(r.category || 'Bánh tươi')}, ${sqlEscape(r.yield_qty || r.yieldQty || 1)}, ${sqlEscape(r.yield_unit || r.yieldUnit || 'chiếc')}, ${sqlEscape(costPerUnit)}, ${sqlEscape(targetPct)}, ${sqlEscape(sugPrice)}, ${sqlEscape(bakeMins)}, ${sqlEscape(bakeTemp)}, TRUE);
`;
      if (Array.isArray(r.items)) {
        for (const it of r.items) {
          const itId = it.id || `${r.id}-${it.ingredient_id || it.ingredientId || Math.random().toString(36).substr(2, 6)}`;
          const ingId = it.ingredient_id || it.ingredientId || '1';
          const qty = it.quantity ?? it.qty ?? 0;
          const lineCost = it.line_cost ?? it.cost ?? 0;
          sql += `INSERT INTO recipe_items (id, recipe_id, ingredient_id, quantity, unit, line_cost) VALUES (${sqlEscape(itId)}, ${sqlEscape(r.id)}, ${sqlEscape(ingId)}, ${sqlEscape(qty)}, ${sqlEscape(it.unit || 'g')}, ${sqlEscape(lineCost)});
`;
        }
      }
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 4. BẢNG ĐƠN HÀNG (ORDERS & ORDER_ITEMS)
-- ----------------------------------------------------------------------------
`;
  if (Array.isArray(data?.orders) && data.orders.length > 0) {
    for (const o of data.orders) {
      const discount = o.discount_amount ?? o.discountAmount ?? 0;
      const finalAmt = o.final_amount ?? o.finalAmount ?? o.total_amount ?? o.totalPrice ?? 0;
      const totalCogs = o.total_cogs ?? o.totalCogs ?? 0;
      const depositAmt = o.deposit_amount ?? o.depositAmount ?? 0;
      const remainAmt = o.remaining_amount ?? o.remainingAmount ?? 0;
      const shipFee = o.shipping_fee ?? o.shippingFee ?? 0;
      const payStatus = o.payment_status ?? o.paymentStatus ?? 'paid';
      const payMethod = o.payment_method ?? o.paymentMethod ?? 'cash';
      const cakeName = o.cake_name ?? o.cakeName ?? null;
      const cakeMsg = o.cake_message ?? o.cakeMessage ?? null;
      const preorderPickup = o.preorder_pickup_at ?? o.preorderPickupAt ?? null;

      sql += `INSERT INTO orders (id, order_number, order_type, status, total_amount, discount_amount, final_amount, total_cogs, deposit_amount, remaining_amount, shipping_fee, payment_status, payment_method, notes, customer_name, customer_phone, cake_name, cake_message, delivery_method, shipping_address, preorder_pickup_at, created_at) VALUES (${sqlEscape(o.id || o.order_number || o.orderNumber)}, ${sqlEscape(o.order_number || o.orderNumber)}, ${sqlEscape(o.order_type || o.orderType || 'takeaway')}, ${sqlEscape(o.status)}, ${sqlEscape(o.total_amount || o.totalPrice || 0)}, ${sqlEscape(discount)}, ${sqlEscape(finalAmt)}, ${sqlEscape(totalCogs)}, ${sqlEscape(depositAmt)}, ${sqlEscape(remainAmt)}, ${sqlEscape(shipFee)}, ${sqlEscape(payStatus)}, ${sqlEscape(payMethod)}, ${sqlEscape(o.notes)}, ${sqlEscape(o.customer_name || o.customerName)}, ${sqlEscape(o.customer_phone || o.customerPhone)}, ${sqlEscape(cakeName)}, ${sqlEscape(cakeMsg)}, ${sqlEscape(o.delivery_method || o.deliveryMethod || 'pickup')}, ${sqlEscape(o.shipping_address || o.shippingAddress)}, ${sqlEscape(preorderPickup)}, ${sqlEscape(o.created_at || o.createdAt || new Date().toISOString())});
`;
      if (Array.isArray(o.items)) {
        for (const item of o.items) {
          const itemId = item.id || `${o.order_number}-${Math.random().toString(36).substr(2, 6)}`;
          const pId = item.product_id || item.productId;
          const pName = item.product_name || item.product_name_snapshot || item.name || 'Sản phẩm';
          const unitPrice = item.unit_price || item.unitPrice || item.price || 0;
          const unitCost = item.unit_cost ?? item.unitCost ?? item.cost ?? 0;
          const subtotal = item.subtotal || (item.quantity * unitPrice);
          const lineCost = item.line_cost ?? item.lineCost ?? Math.round(unitCost * (item.quantity || 1));
          const prodType = item.product_type || item.productType || 'produced';
          const supName = item.supplier_name || item.supplierName || null;
          const itemNotes = item.notes || null;

          sql += `INSERT INTO order_items (id, order_id, product_id, product_name_snapshot, quantity, unit_price, unit_cost, subtotal, line_cost, product_type, supplier_name, notes) VALUES (${sqlEscape(itemId)}, ${sqlEscape(o.id || o.order_number || o.orderNumber)}, ${sqlEscape(pId)}, ${sqlEscape(pName)}, ${sqlEscape(item.quantity || 1)}, ${sqlEscape(unitPrice)}, ${sqlEscape(unitCost)}, ${sqlEscape(subtotal)}, ${sqlEscape(lineCost)}, ${sqlEscape(prodType)}, ${sqlEscape(supName)}, ${sqlEscape(itemNotes)});
`;
        }
      }
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 5. BẢNG CHI PHÍ VẬN HÀNH (OPERATING_EXPENSES)
-- ----------------------------------------------------------------------------
`;
  if (Array.isArray(data?.expenses) && data.expenses.length > 0) {
    for (const exp of data.expenses) {
      sql += `INSERT INTO operating_expenses (id, category, amount, description, date, payment_method) VALUES (${sqlEscape(exp.id)}, ${sqlEscape(exp.category)}, ${sqlEscape(exp.amount)}, ${sqlEscape(exp.description)}, ${sqlEscape(exp.date)}, ${sqlEscape(exp.paymentMethod || exp.payment_method || 'cash')});
`;
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 6. BẢNG SỔ QUỸ DÒNG TIỀN (CASHFLOW_TRANSACTIONS)
-- ----------------------------------------------------------------------------
`;
  if (Array.isArray(data?.cashflow) && data.cashflow.length > 0) {
    for (const cf of data.cashflow) {
      sql += `INSERT INTO cashflow_transactions (id, type, category, amount, description, date, method) VALUES (${sqlEscape(cf.id)}, ${sqlEscape(cf.type)}, ${sqlEscape(cf.category)}, ${sqlEscape(cf.amount)}, ${sqlEscape(cf.desc || cf.description)}, ${sqlEscape(cf.date)}, ${sqlEscape(cf.method || 'cash')});
`;
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 7. BẢNG NHẬT KÝ BÁNH HỎNG (SPOILAGE_LOGS)
-- ----------------------------------------------------------------------------
`;
  if (Array.isArray(data?.spoilage_logs) && data.spoilage_logs.length > 0) {
    for (const sp of data.spoilage_logs) {
      const created = sp.createdAt || sp.loggedAt || sp.created_at || new Date().toISOString();
      sql += `INSERT INTO spoilage_logs (id, product_id, product_name, quantity, unit, base_cost, selling_price, total_cost_loss, reason, notes, logged_by, created_at) VALUES (${sqlEscape(sp.id)}, ${sqlEscape(sp.productId || sp.product_id)}, ${sqlEscape(sp.productName || sp.product_name)}, ${sqlEscape(sp.quantity)}, ${sqlEscape(sp.unit || 'cái')}, ${sqlEscape(sp.baseCost || sp.base_cost || 0)}, ${sqlEscape(sp.sellingPrice || sp.selling_price || 0)}, ${sqlEscape(sp.totalCostLoss || sp.total_cost_loss || 0)}, ${sqlEscape(sp.reason)}, ${sqlEscape(sp.notes)}, ${sqlEscape(sp.loggedBy || sp.logged_by)}, ${sqlEscape(created)});
`;
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 8. BẢNG LỊCH SỬ KIỂM KÊ KHO (STOCK_ADJUSTMENTS)
-- ----------------------------------------------------------------------------
`;
  if (Array.isArray(data?.stock_adjustments) && data.stock_adjustments.length > 0) {
    for (const st of data.stock_adjustments) {
      const oldStock = st.oldStock ?? st.old_stock ?? 0;
      const newStock = st.newStock ?? st.new_stock ?? 0;
      const diff = st.difference ?? (newStock - oldStock);
      const created = st.createdAt ?? st.adjustedAt ?? st.created_at ?? new Date().toISOString();
      sql += `INSERT INTO stock_adjustments (id, product_id, product_name, old_stock, new_stock, difference, reason, notes, adjusted_by, created_at) VALUES (${sqlEscape(st.id)}, ${sqlEscape(st.productId || st.product_id)}, ${sqlEscape(st.productName || st.product_name)}, ${sqlEscape(oldStock)}, ${sqlEscape(newStock)}, ${sqlEscape(diff)}, ${sqlEscape(st.reason)}, ${sqlEscape(st.notes)}, ${sqlEscape(st.adjustedBy || st.adjusted_by)}, ${sqlEscape(created)});
`;
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 9. BẢNG BIÊN BẢN CHỐT SỔ KỲ (ACCOUNTING_CLOSINGS)
-- ----------------------------------------------------------------------------
`;
  const closings = data?.accounting_closings || data?.closings;
  if (Array.isArray(closings) && closings.length > 0) {
    for (const cl of closings) {
      sql += `INSERT INTO accounting_closings (id, period_type, period_key, closed_at, closed_by, total_revenue, total_cash_sales, actual_cash_counted, cash_difference, notes) VALUES (${sqlEscape(cl.id)}, ${sqlEscape(cl.periodType || cl.period_type)}, ${sqlEscape(cl.periodKey || cl.period_key)}, ${sqlEscape(cl.closedAt || cl.closed_at)}, ${sqlEscape(cl.closedBy || cl.closed_by)}, ${sqlEscape(cl.totalRevenue || cl.total_revenue || 0)}, ${sqlEscape(cl.totalCashSales || cl.total_cash_sales || 0)}, ${sqlEscape(cl.actualCashCounted || cl.actual_cash_counted || 0)}, ${sqlEscape(cl.cashDifference || cl.cash_difference || 0)}, ${sqlEscape(cl.notes)});
`;
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 10. BẢNG CẤU HÌNH BẢO MẬT (SECURITY_CONFIG)
-- ----------------------------------------------------------------------------
`;
  const sec = data?.security_config || data?.security || data?.settings?.security;
  if (sec) {
    sql += `INSERT INTO security_config (id, admin_password_hash, cashier_pin, updated_at) VALUES ('primary', ${sqlEscape(sec.adminPasswordHash || sec.admin_password_hash)}, ${sqlEscape(sec.cashierPin || sec.cashier_pin)}, ${sqlEscape(sec.updatedAt || sec.updated_at || new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 11. BẢNG CẤU HÌNH VIETQR (VIETQR_CONFIG)
  // ----------------------------------------------------------------------------
  const vq = data?.vietqr_config || data?.vietqr || data?.settings?.vietqr;
  if (vq) {
    sql += `
-- ----------------------------------------------------------------------------
-- 11. BẢNG CẤU HÌNH VIETQR (VIETQR_CONFIG)
-- ----------------------------------------------------------------------------
INSERT INTO vietqr_config (id, bank_id, bank_name, account_no, account_name, template, updated_at) VALUES ('primary', ${sqlEscape(vq.bankId || vq.bank_id)}, ${sqlEscape(vq.bankName || vq.bank_name)}, ${sqlEscape(vq.accountNo || vq.account_no)}, ${sqlEscape(vq.accountName || vq.account_name)}, ${sqlEscape(vq.template || 'compact2')}, ${sqlEscape(new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 12. BẢNG THÔNG TIN TIỆM BÁNH (STORE_BRANDING)
  // ----------------------------------------------------------------------------
  const br = data?.store_branding || data?.branding_config || data?.branding || data?.settings?.branding;
  if (br) {
    sql += `
-- ----------------------------------------------------------------------------
-- 12. BẢNG THÔNG TIN TIỆM BÁNH (STORE_BRANDING)
-- ----------------------------------------------------------------------------
INSERT INTO store_branding (id, store_name, tagline, address, phone, wifi_password, logo_url, updated_at) VALUES ('primary', ${sqlEscape(br.storeName || br.store_name)}, ${sqlEscape(br.tagline)}, ${sqlEscape(br.address)}, ${sqlEscape(br.phone)}, ${sqlEscape(br.wifiPassword || br.wifi_password)}, ${sqlEscape(br.logoUrl || br.logo_url)}, ${sqlEscape(new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 13. BẢNG CẤU HÌNH MÁY IN (PRINTER_CONFIGS)
  // ----------------------------------------------------------------------------
  const pr = data?.printer_configs || data?.printer || data?.settings?.printer;
  if (pr) {
    sql += `
-- ----------------------------------------------------------------------------
-- 13. BẢNG CẤU HÌNH MÁY IN (PRINTER_CONFIGS)
-- ----------------------------------------------------------------------------
INSERT INTO printer_configs (id, printer_name, paper_size, connection_type, auto_print, updated_at) VALUES ('primary', ${sqlEscape(pr.printerName || pr.printer_name || 'POS Printer')}, ${sqlEscape(pr.paperSize || pr.paper_size || '80mm')}, ${sqlEscape(pr.connectionType || pr.connection_type || 'usb')}, ${sqlEscape(pr.autoPrint || pr.auto_print || false)}, ${sqlEscape(new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 14. BẢNG CẤU HÌNH VÍ ĐIỆN TỬ (EWALLET_CONFIG)
  // ----------------------------------------------------------------------------
  const ew = data?.ewallet_config || data?.ewallet || data?.settings?.ewallet;
  if (ew) {
    sql += `
-- ----------------------------------------------------------------------------
-- 14. BẢNG CẤU HÌNH VÍ ĐIỆN TỬ (EWALLET_CONFIG)
-- ----------------------------------------------------------------------------
INSERT INTO ewallet_config (id, momo_phone, momo_name, momo_qr_url, zalopay_phone, zalopay_name, zalopay_qr_url, viettelmoney_phone, viettelmoney_name, viettelmoney_qr_url, updated_at) VALUES ('primary', ${sqlEscape(ew.momo?.phone)}, ${sqlEscape(ew.momo?.name)}, ${sqlEscape(ew.momo?.qrUrl)}, ${sqlEscape(ew.zalopay?.phone)}, ${sqlEscape(ew.zalopay?.name)}, ${sqlEscape(ew.zalopay?.qrUrl)}, ${sqlEscape(ew.viettelmoney?.phone)}, ${sqlEscape(ew.viettelmoney?.name)}, ${sqlEscape(ew.viettelmoney?.qrUrl)}, ${sqlEscape(new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 15. BẢNG ĐỊNH MỨC GIÁ VỐN BÁNH ĐẶT (CAKE_COSTING_CONFIG)
  // ----------------------------------------------------------------------------
  const cakeCosting = data?.cake_costing_config || data?.cake_costing || data?.settings?.cake_costing;
  if (cakeCosting) {
    sql += `
-- ----------------------------------------------------------------------------
-- 15. BẢNG ĐỊNH MỨC GIÁ VỐN BÁNH ĐẶT (CAKE_COSTING_CONFIG)
-- ----------------------------------------------------------------------------
INSERT INTO cake_costing_config (id, config_data, updated_at) VALUES ('primary', ${sqlEscape(typeof cakeCosting === 'string' ? cakeCosting : JSON.stringify(cakeCosting))}, ${sqlEscape(new Date().toISOString())});
`;
  }

  return sql;
}

// ── 3. GHI TOÀN BỘ TỆP VÀO DIRECTORY HANDLE ──
export async function writeLocalSqlFiles(dirHandle: any, data: any): Promise<void> {
  const masterSql = generateMasterSqlDump(data);
  const schemaSql = generateSchemaSql();
  const localDbJson = JSON.stringify(data, null, 2);

  // 1. Ghi bakery_master.sql
  const masterHandle = await dirHandle.getFileHandle('bakery_master.sql', { create: true });
  const w1 = await masterHandle.createWritable();
  await w1.write(masterSql);
  await w1.close();

  // 2. Ghi bakery_schema.sql
  const schemaHandle = await dirHandle.getFileHandle('bakery_schema.sql', { create: true });
  const w2 = await schemaHandle.createWritable();
  await w2.write(schemaSql);
  await w2.close();

  // 3. Ghi bakery_local_db.json
  const jsonHandle = await dirHandle.getFileHandle('bakery_local_db.json', { create: true });
  const w3 = await jsonHandle.createWritable();
  await w3.write(localDbJson);
  await w3.close();

  // 4. Ghi file hướng dẫn HUONG_DAN_CHAY_SQL_LOCAL.txt
  const readmeHandle = await dirHandle.getFileHandle('HUONG_DAN_CHAY_SQL_LOCAL.txt', { create: true });
  const w4 = await readmeHandle.createWritable();
  const guideText = `============================================================================
HƯỚNG DẪN SỬ DỤNG VÀ CHẠY CSDL LOCAL SQL - TIỆM BÁNH ERP & POS
============================================================================
Thư mục: ${dirHandle.name || 'Local SQL Folder'}
Ngày cập nhật: ${new Date().toLocaleString('vi-VN')}
Trạng thái: Hoạt động Cục bộ (Local SQL Mode) - Hoàn toàn độc lập với Cloud SQL.

DANH SÁCH CÁC TỆP CƠ SỞ DỮ LIỆU TRONG THƯ MỤC NÀY:
1. bakery_master.sql:
   - Tệp chứa toàn bộ câu lệnh CREATE TABLE và INSERT INTO của 100% dữ liệu:
     sản phẩm, kho nguyên liệu, công thức BOM bánh, đơn hàng, hóa đơn,
     sổ quỹ thu chi, chi phí OPEX, bánh hỏng, kiểm kê, chốt sổ, bảo mật.
   - Có thể chạy trực tiếp trên bất kỳ hệ quản trị CSDL nào: SQLite, PostgreSQL, MySQL,
     hoặc mở bằng DBeaver, HeidiSQL, VS Code, Navicat.

2. bakery_schema.sql:
   - Cấu trúc khung bảng chuẩn (DDL).

3. bakery_local_db.json:
   - Dữ liệu CSDL dạng JSON cấu trúc đầy đủ, phục vụ cho phần mềm tiệm bánh nạp
     ngược lại (Restore) ngay lập tức mà không cần mạng.

CÁCH KHÔI PHỤC DỮ LIỆU TỪ THƯ MỤC NÀY VÀO PHẦN MỀM POS / ADMIN:
- Mở Menu Admin -> Chọn Tab "Cơ Sở Dữ Liệu & Cloud".
- Chọn "Chế độ Local SQL".
- Bấm nút "Nạp Lại CSDL Từ Thư Mục Này" hoặc chọn file "bakery_local_db.json".
- Toàn bộ thực đơn bánh, công thức, đơn hàng và kho sẽ được khôi phục nguyên vẹn!
============================================================================`;
  await w4.write(guideText);
  await w4.close();

  console.log('[LocalSQL] Đã ghi thành công 4 file CSDL vào thư mục:', dirHandle.name);
}

// ── 4. TỰ ĐỘNG GHI CSDL LOCAL NẾU ĐANG Ở LOCAL MODE ──
export async function autoSyncToLocalSqlFolder(): Promise<boolean> {
  if (!isLocalMode()) return false;
  try {
    const dirHandle = await getStoredLocalSqlDirHandle();
    if (dirHandle) {
      const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const fullData = await gatherFullBakeryData();
        await writeLocalSqlFiles(dirHandle, fullData);
        saveSqlModeConfig({ lastLocalSyncAt: new Date().toISOString() });
        return true;
      }
    }
  } catch (err) {
    console.warn('[LocalSQL] Lỗi khi autoSyncToLocalSqlFolder:', err);
  }
  return false;
}

// ── 5. KHÔI PHỤC DỮ LIỆU VÀO CHẾ ĐỘ LOCAL ──

/**
 * Nạp bất kỳ đối tượng Backup Data nào vào môi trường Local
 * (Áp dụng cho: file .bakery.json tải từ Online SQL, file .json, hoặc clone từ Cloud)
 */
export async function restoreLocalFromBackupData(data: any): Promise<{ success: boolean; message: string }> {
  if (!data || typeof data !== 'object') {
    return { success: false, message: 'Dữ liệu không hợp lệ.' };
  }

  try {
    // Chuyển đối tượng backup thành snapshot cho LocalStorage
    const localSnapshot: Record<string, any> = {};

    if (Array.isArray(data.products)) {
      localSnapshot['bakery_products'] = JSON.stringify(data.products);
      const stockMap: Record<string, number> = {};
      data.products.forEach((p: any) => {
        if (p.id) stockMap[p.id] = p.stock_qty ?? 10;
      });
      localSnapshot['bakery_stocks'] = JSON.stringify(stockMap);
      try {
        await db.products.clear();
        await db.products.bulkPut(data.products as any);
      } catch {}
    }

    if (Array.isArray(data.orders)) {
      localSnapshot['bakery_orders'] = JSON.stringify(data.orders);
      const preorders = data.orders.filter((o: any) => o.order_type === 'preorder' || o.orderType === 'preorder');
      if (preorders.length > 0) {
        localSnapshot['bakery_preorders'] = JSON.stringify(preorders);
      }
      try {
        await db.orders.clear();
        await db.orders.bulkPut(data.orders as any);
      } catch {}
    }

    if (Array.isArray(data.recipes)) {
      localSnapshot['bakery_recipes'] = JSON.stringify(data.recipes);
    }

    if (Array.isArray(data.expenses)) {
      localSnapshot['bakery_expenses'] = JSON.stringify(data.expenses);
    }

    if (Array.isArray(data.cashflow)) {
      localSnapshot['bakery_cashflow'] = JSON.stringify(data.cashflow);
    }

    if (Array.isArray(data.spoilage_logs)) {
      localSnapshot['bakery_spoilage'] = JSON.stringify(data.spoilage_logs);
      localSnapshot['bakery_spoilage_logs'] = JSON.stringify(data.spoilage_logs);
    }

    if (Array.isArray(data.stock_adjustments)) {
      localSnapshot['bakery_stock_adjustments'] = JSON.stringify(data.stock_adjustments);
      localSnapshot['bakery_stock_adjustment_logs'] = JSON.stringify(data.stock_adjustments);
    }

    const closings = data.accounting_closings || data.closings;
    if (Array.isArray(closings)) {
      localSnapshot['bakery_accounting_closings'] = JSON.stringify(closings);
      localSnapshot['bakery_closing_records'] = JSON.stringify(closings);
    }

    const sec = data.security_config || data.security || data.settings?.security;
    if (sec) {
      localSnapshot['bakery_security_config'] = JSON.stringify(sec);
    }

    const vietqr = data.vietqr_config || data.vietqr || data.settings?.vietqr;
    if (vietqr) {
      localSnapshot['bakery_vietqr_config'] = JSON.stringify(vietqr);
    }

    const ewallet = data.ewallet_config || data.ewallet || data.settings?.ewallet;
    if (ewallet) {
      localSnapshot['bakery_ewallet_config'] = JSON.stringify(ewallet);
    }

    const printer = data.printer_configs || data.printer || data.settings?.printer;
    if (printer) {
      localSnapshot['bakery_printer_config'] = JSON.stringify(printer);
    }

    const telegram = data.telegram_config || data.telegram || data.settings?.telegram;
    if (telegram) {
      localSnapshot['bakery_telegram_config'] = JSON.stringify(telegram);
    }

    const cakeCosting = data.cake_costing_config || data.cake_costing || data.settings?.cake_costing;
    if (cakeCosting) {
      localSnapshot['bakery_cake_costing_config'] = JSON.stringify(cakeCosting);
    }

    const branding = data.branding_config || data.branding || data.settings?.branding;
    if (branding) {
      localSnapshot['bakery_store_branding'] = JSON.stringify(branding);
    }

    // Áp dụng vào hệ thống
    applyDataSnapshot(localSnapshot);

    // Lưu thành snapshot Local để tách biệt
    localStorage.setItem('bakery_snapshot_local', JSON.stringify(localSnapshot));

    // Nếu đã có liên kết thư mục máy tính, tự động ghi luôn vào thư mục
    try {
      const dirHandle = await getStoredLocalSqlDirHandle();
      if (dirHandle) {
        const fullData = await gatherFullBakeryData();
        await writeLocalSqlFiles(dirHandle, fullData);
        saveSqlModeConfig({ lastLocalSyncAt: new Date().toISOString() });
      }
    } catch {}

    const prodCount = data.products?.length || 0;
    const orderCount = data.orders?.length || 0;
    const recCount = data.recipes?.length || 0;

    return {
      success: true,
      message: `Đã khôi phục thành công vào Chế độ Local: ${prodCount} loại bánh, ${recCount} công thức BOM, ${orderCount} đơn hàng! Toàn bộ dữ liệu được lưu an toàn cục bộ.`,
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Lỗi khi khôi phục dữ liệu vào Local' };
  }
}

/**
 * ⚡ 1-Click: Tải toàn bộ dữ liệu mới nhất từ Cloud SQL về máy và nạp vào Chế độ Local
 * (Không làm ảnh hưởng hay thay đổi gì trên Cloud SQL)
 */
export async function cloneOnlineSqlToLocal(): Promise<{ success: boolean; message: string }> {
  try {
    // 1. Tải toàn bộ sản phẩm
    const { data: prods } = await supabase.from('products').select('*');
    // 2. Tải toàn bộ nguyên liệu
    const { data: ings } = await supabase.from('ingredients').select('*');
    // 3. Tải toàn bộ công thức BOM & items
    const { data: recs } = await supabase.from('recipes').select('*').eq('is_active', true);
    const { data: recItems } = await supabase.from('recipe_items').select('*');
    // 4. Tải đơn hàng & items
    const { data: orders } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(500);
    const { data: orderItems } = await supabase.from('order_items').select('*');

    // 5. Tải các cấu hình hệ thống SYS_CONFIG_*
    const { data: sysRows } = await supabase.from('recipes').select('*').eq('is_active', false);

    let expenses: any[] = [];
    let cashflow: any[] = [];
    let spoilage_logs: any[] = [];
    let stock_adjustments: any[] = [];
    let accounting_closings: any[] = [];
    let security_config: any = null;
    let branding_config: any = null;
    let vietqr_config: any = null;
    let ewallet_config: any = null;
    let printer_config: any = null;
    let telegram_config: any = null;
    let cake_costing_config: any = null;

    if (Array.isArray(sysRows)) {
      for (const row of sysRows) {
        const rawJson = row.notes || row.category;
        if (!rawJson) continue;
        try {
          const parsed = JSON.parse(rawJson);
          if (row.name === 'SYS_CONFIG_EXPENSES' && Array.isArray(parsed)) expenses = parsed;
          if (row.name === 'SYS_CONFIG_CASHFLOW' && Array.isArray(parsed)) cashflow = parsed;
          if (row.name === 'SYS_CONFIG_SPOILAGE' && Array.isArray(parsed)) spoilage_logs = parsed;
          if (row.name === 'SYS_CONFIG_STOCK_ADJUSTMENTS' && Array.isArray(parsed)) stock_adjustments = parsed;
          if (row.name === 'SYS_CONFIG_CLOSINGS' && Array.isArray(parsed)) accounting_closings = parsed;
          if (row.name === 'SYS_CONFIG_SECURITY') security_config = parsed;
          if (row.name === 'SYS_CONFIG_BRANDING') branding_config = parsed;
          if (row.name === 'SYS_CONFIG_VIETQR') vietqr_config = parsed;
          if (row.name === 'SYS_CONFIG_EWALLET') ewallet_config = parsed;
          if (row.name === 'SYS_CONFIG_PRINTER') printer_config = parsed;
          if (row.name === 'SYS_CONFIG_TELEGRAM') telegram_config = parsed;
          if (row.name === 'SYS_CONFIG_CAKE_COSTING') cake_costing_config = parsed;
        } catch {}
      }
    }

    // Ghép công thức với recipe_items
    const fullRecipes = (recs || []).filter((r: any) => !r.name?.startsWith('SYS_')).map((r: any) => {
      const items = (recItems || []).filter((it: any) => it.recipe_id === r.id);
      return { ...r, items };
    });

    // Ghép đơn hàng với order_items
    const fullOrders = (orders || []).map((o: any) => {
      const items = (orderItems || []).filter((it: any) => it.order_id === o.id || it.order_id === o.order_number);
      return { ...o, items };
    });

    const backupPayload: any = {
      schemaVersion: 'bakery-backup-v2',
      exportedAt: new Date().toISOString(),
      storeName: branding_config?.storeName || 'Tiệm Bánh',
      dataHash: String(Date.now()),
      metadata: {
        totalProducts: prods?.length || 0,
        totalOrders: fullOrders.length,
        totalRecipes: fullRecipes.length,
        totalIngredients: ings?.length || 0,
        totalStockLogs: stock_adjustments.length,
        totalSpoilageLogs: spoilage_logs.length,
        totalExpenses: expenses.length,
        totalImages: 0,
        estimatedSizeBytes: 0,
      },
      products: prods || [],
      orders: fullOrders,
      ingredients: ings || [],
      recipes: fullRecipes,
      expenses,
      cashflow,
      spoilage_logs,
      stock_adjustments,
      accounting_closings,
      security_config,
      branding_config,
      vietqr_config,
      ewallet_config,
      printer_configs: printer_config,
      telegram_config,
      cake_costing_config,
      images: [],
      settings: {
        vietqr: vietqr_config,
        ewallet: ewallet_config,
        printer: printer_config,
        telegram: telegram_config,
        branding: branding_config,
        security: security_config,
        cake_costing: cake_costing_config,
      },
    };

    // Nạp vào Local
    const res = await restoreLocalFromBackupData(backupPayload);
    return res;
  } catch (err: any) {
    return { success: false, message: `Không thể kết nối Cloud SQL để tải dữ liệu: ${err.message}` };
  }
}

/**
 * Khôi phục dữ liệu trực tiếp từ tệp bakery_local_db.json trong thư mục đã chọn
 */
export async function restoreLocalFromFolder(dirHandle?: any): Promise<{ success: boolean; message: string }> {
  try {
    const handle = dirHandle || (await getStoredLocalSqlDirHandle());
    if (!handle) {
      return { success: false, message: 'Chưa có thư mục nào được chọn.' };
    }
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const req = await handle.requestPermission({ mode: 'readwrite' });
      if (req !== 'granted') {
        return { success: false, message: 'Chưa được cấp quyền đọc thư mục.' };
      }
    }

    const fileHandle = await handle.getFileHandle('bakery_local_db.json');
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);

    return await restoreLocalFromBackupData(parsed);
  } catch (err: any) {
    return { success: false, message: err.message || 'Lỗi khi đọc file CSDL từ thư mục' };
  }
}

/**
 * Tải tệp bakery_master.sql trực tiếp về máy tính qua trình duyệt
 */
export function downloadLocalMasterSql(data: any): void {
  const sql = generateMasterSqlDump(data);
  const blob = new Blob([sql], { type: 'text/sql;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `bakery_master_${dateStr}.sql`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
