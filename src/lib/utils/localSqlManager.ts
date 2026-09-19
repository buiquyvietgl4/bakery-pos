// src/lib/utils/localSqlManager.ts
// Quản lý cơ sở dữ liệu Local SQL: sinh tệp SQL, chọn thư mục máy tính, nạp & khôi phục dữ liệu

import { BakeryBackupData } from '@/lib/types/backup';
import { gatherFullBakeryData } from '@/lib/utils/backupManager';
import { 
  getSqlModeConfig, 
  saveSqlModeConfig, 
  isLocalMode,
  applyDataSnapshot,
  LocalSqlEnvironmentId,
  getActiveLocalEnv,
  saveLocalEnvConfig,
} from '@/lib/utils/sqlModeManager';
import { supabase } from '@/lib/supabase/client';
import { db } from '@/lib/db/dexie';

const LOCAL_SQL_DB_NAME = 'bakery_local_sql_handle_db';
const LOCAL_SQL_STORE = 'local_sql_handles';
const HANDLE_KEY = 'local_sql_dir_handle';

export function getLocalHandleKey(envId?: LocalSqlEnvironmentId): string {
  const env = envId || getActiveLocalEnv();
  return `local_sql_dir_handle_${env}`;
}

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

export async function storeLocalSqlDirHandle(handle: any, envId?: LocalSqlEnvironmentId): Promise<void> {
  try {
    const idb = await openLocalSqlHandleDB();
    const key = getLocalHandleKey(envId);
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(LOCAL_SQL_STORE, 'readwrite');
      const store = tx.objectStore(LOCAL_SQL_STORE);
      const req = store.put(handle, key);
      // Đồng thời lưu vào HANDLE_KEY chung để tương thích ngược nếu là production
      if (!envId || envId === 'production') {
        store.put(handle, HANDLE_KEY);
      }
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Không thể lưu LocalSql Handle vào IndexedDB:', err);
  }
}

export async function getStoredLocalSqlDirHandle(envId?: LocalSqlEnvironmentId): Promise<any | null> {
  try {
    const idb = await openLocalSqlHandleDB();
    const key = getLocalHandleKey(envId);
    return new Promise((resolve) => {
      const tx = idb.transaction(LOCAL_SQL_STORE, 'readonly');
      const store = tx.objectStore(LOCAL_SQL_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result) return resolve(req.result);
        // Fallback sang HANDLE_KEY cũ nếu là production
        if (!envId || envId === 'production') {
          const fallbackReq = store.get(HANDLE_KEY);
          fallbackReq.onsuccess = () => resolve(fallbackReq.result || null);
          fallbackReq.onerror = () => resolve(null);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function checkLocalSqlDirPermission(dirHandle?: any, envId?: LocalSqlEnvironmentId): Promise<'granted' | 'prompt' | 'denied' | 'no_handle'> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return 'no_handle';
  try {
    const handle = dirHandle || (await getStoredLocalSqlDirHandle(envId));
    if (!handle) return 'no_handle';
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

export async function requestLocalSqlDirPermission(dirHandle?: any, envId?: LocalSqlEnvironmentId): Promise<boolean> {
  if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) return false;
  try {
    const handle = dirHandle || (await getStoredLocalSqlDirHandle(envId));
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
export async function selectLocalSqlDirectory(envId?: LocalSqlEnvironmentId): Promise<{ success: boolean; folderName?: string; error?: string }> {
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
      const targetEnv = envId || getActiveLocalEnv();
      await storeLocalSqlDirHandle(dirHandle, targetEnv);
      const folderName = dirHandle.name || `Thư mục Local SQL ${targetEnv === 'production' ? 'Chính' : 'Test'}`;
      saveLocalEnvConfig(targetEnv, { folderName });

      // Lập tức xuất dữ liệu khởi tạo vào thư mục vừa chọn
      try {
        const fullData = await gatherFullBakeryData();
        await writeLocalSqlFiles(dirHandle, fullData);
        saveLocalEnvConfig(targetEnv, { lastSyncAt: new Date().toISOString() });
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
export function sqlEscape(val: any): string {
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
    is_active BOOLEAN DEFAULT TRUE,
    is_preorder_only BOOLEAN DEFAULT FALSE,
    recipe_id TEXT,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingredients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'g',
    packaging_unit TEXT DEFAULT 'Túi 1kg',
    conversion_rate NUMERIC DEFAULT 1000,
    category TEXT,
    stock_qty NUMERIC DEFAULT 0,
    reorder_level NUMERIC DEFAULT 0,
    avg_cost NUMERIC DEFAULT 0,
    wastage_pct NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    product_id TEXT,
    category TEXT DEFAULT 'Bánh tươi',
    yield_qty NUMERIC DEFAULT 1,
    yield_unit TEXT DEFAULT 'chiếc',
    total_material_cost NUMERIC DEFAULT 0,
    cost_per_unit NUMERIC DEFAULT 0,
    target_food_cost_pct NUMERIC DEFAULT 35,
    suggested_price NUMERIC DEFAULT 0,
    bake_time_minutes NUMERIC DEFAULT 25,
    bake_temp_celsius NUMERIC DEFAULT 190,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recipe_items (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    ingredient_id TEXT NOT NULL,
    quantity NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'g',
    line_cost NUMERIC DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    local_id TEXT,
    order_number TEXT NOT NULL,
    order_type TEXT DEFAULT 'takeaway',
    status TEXT DEFAULT 'pending',
    subtotal NUMERIC DEFAULT 0,
    discount_amount NUMERIC DEFAULT 0,
    discount_pct NUMERIC DEFAULT 0,
    total_amount NUMERIC DEFAULT 0,
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
    bake_status TEXT DEFAULT 'done',
    need_bake_qty NUMERIC DEFAULT 0,
    ready_stock_qty NUMERIC DEFAULT 0,
    parent_order_number TEXT,
    cake_order_spec TEXT,
    bake_approval_status TEXT,
    reference_image_url TEXT,
    created_by TEXT,
    store_id TEXT,
    shift_id TEXT,
    sync_status TEXT DEFAULT 'synced',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT,
    variant_id TEXT,
    product_name_snapshot TEXT,
    quantity NUMERIC DEFAULT 1,
    unit_price NUMERIC DEFAULT 0,
    unit_cost NUMERIC DEFAULT 0,
    subtotal NUMERIC DEFAULT 0,
    line_total NUMERIC DEFAULT 0,
    line_cost NUMERIC DEFAULT 0,
    product_type TEXT DEFAULT 'produced',
    supplier_name TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    amount NUMERIC DEFAULT 0,
    reference_code TEXT,
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    staff_id TEXT,
    store_id TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    opening_cash NUMERIC DEFAULT 0,
    closing_cash NUMERIC,
    expected_cash NUMERIC DEFAULT 0,
    cash_difference NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'open',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    product_image TEXT,
    old_stock NUMERIC DEFAULT 0,
    new_stock NUMERIC DEFAULT 0,
    difference NUMERIC DEFAULT 0,
    reason TEXT,
    notes TEXT,
    adjusted_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_transactions (
    id TEXT PRIMARY KEY,
    type TEXT,
    material_id TEXT,
    material_name TEXT,
    material_category TEXT,
    unit TEXT,
    package_qty NUMERIC,
    package_unit TEXT,
    conversion_rate NUMERIC,
    quantity NUMERIC DEFAULT 0,
    unit_price NUMERIC DEFAULT 0,
    package_unit_price NUMERIC,
    total_amount NUMERIC DEFAULT 0,
    supplier_or_reason TEXT,
    performed_by TEXT,
    transaction_date TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounting_closings (
    id TEXT PRIMARY KEY,
    period_type TEXT,
    period_key TEXT,
    period_label TEXT,
    start_date TEXT,
    end_date TEXT,
    closed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_by TEXT,
    total_orders NUMERIC DEFAULT 0,
    total_revenue NUMERIC DEFAULT 0,
    cash_revenue NUMERIC DEFAULT 0,
    bank_revenue NUMERIC DEFAULT 0,
    total_cogs NUMERIC DEFAULT 0,
    gross_profit NUMERIC DEFAULT 0,
    total_opex NUMERIC DEFAULT 0,
    spoilage_cost NUMERIC DEFAULT 0,
    spoilage_qty NUMERIC DEFAULT 0,
    net_profit NUMERIC DEFAULT 0,
    total_cash_sales NUMERIC DEFAULT 0,
    actual_cash_counted NUMERIC DEFAULT 0,
    system_cash NUMERIC DEFAULT 0,
    cash_difference NUMERIC DEFAULT 0,
    notes TEXT,
    status TEXT DEFAULT 'closed'
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
    transfer_syntax TEXT DEFAULT 'DH',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_branding (
    id TEXT PRIMARY KEY,
    store_name TEXT,
    slogan TEXT,
    tagline TEXT,
    address TEXT,
    phone TEXT,
    wifi_password TEXT,
    logo_url TEXT,
    footer_message TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS printer_configs (
    id TEXT PRIMARY KEY,
    mode TEXT DEFAULT 'browser',
    printer_name TEXT,
    receipt_size TEXT DEFAULT '80mm',
    label_size TEXT DEFAULT '50x30',
    connection_type TEXT DEFAULT 'usb',
    auto_print BOOLEAN DEFAULT FALSE,
    auto_cut BOOLEAN DEFAULT TRUE,
    print_delivery_address BOOLEAN DEFAULT TRUE,
    copies INTEGER DEFAULT 1,
    sticker_scale NUMERIC DEFAULT 92,
    receipt_scale NUMERIC DEFAULT 100,
    store_name TEXT,
    store_address TEXT,
    store_hotline TEXT,
    raw_config_json TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ewallet_config (
    id TEXT PRIMARY KEY,
    active_wallet TEXT DEFAULT 'momo',
    momo_phone TEXT,
    momo_name TEXT,
    momo_qr_url TEXT,
    zalopay_phone TEXT,
    zalopay_name TEXT,
    zalopay_qr_url TEXT,
    viettelmoney_phone TEXT,
    viettelmoney_name TEXT,
    viettelmoney_qr_url TEXT,
    transfer_syntax TEXT DEFAULT 'VIMO',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_config (
    id TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT FALSE,
    bot_token TEXT,
    chat_id TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cake_costing_config (
    id TEXT PRIMARY KEY,
    config_data TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tax_household_config (
    id TEXT PRIMARY KEY,
    shop_name TEXT,
    tax_code TEXT,
    business_address TEXT,
    owner_name TEXT,
    phone TEXT,
    email TEXT,
    business_area NUMERIC,
    bank_account_number TEXT,
    bank_name TEXT,
    district TEXT,
    province TEXT,
    software_name TEXT,
    registered_revenue_level INTEGER DEFAULT 2,
    pit_calculation_method INTEGER DEFAULT 1,
    regular_employees_count INTEGER DEFAULT 5,
    operating_hours TEXT DEFAULT '06:30 - 22:00',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tax_policy_config (
    id TEXT PRIMARY KEY,
    name TEXT,
    policy_name TEXT,
    circular_citation TEXT,
    annual_threshold NUMERIC DEFAULT 1000000000,
    is_active BOOLEAN DEFAULT TRUE,
    effective_date TEXT,
    notes TEXT,
    tax_groups TEXT,
    cost_indicators TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bakery_bom_settings (
    id TEXT PRIMARY KEY,
    version TEXT,
    target_food_cost_pct NUMERIC DEFAULT 36.5,
    cake_bases TEXT,
    cream_coatings TEXT,
    fillings TEXT,
    packagings TEXT,
    free_accessories TEXT,
    decor_addons TEXT,
    birthday_bom_presets TEXT,
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
      const isAct = p.is_active !== undefined ? Boolean(p.is_active) : true;
      sql += `INSERT INTO products (id, name, category, selling_price, base_cost_price, import_price, product_type, supplier_name, barcode, food_cost_pct, stock_qty, unit, is_active, is_preorder_only, recipe_id, image_url, created_at, updated_at) VALUES (${sqlEscape(p.id)}, ${sqlEscape(p.name)}, ${sqlEscape(p.category)}, ${sqlEscape(price)}, ${sqlEscape(cost)}, ${sqlEscape(importPrice)}, ${sqlEscape(prodType)}, ${sqlEscape(p.supplier_name)}, ${sqlEscape(p.barcode)}, ${sqlEscape(foodCostPct)}, ${sqlEscape(p.stock_qty ?? 10)}, ${sqlEscape(p.unit || 'cái')}, ${sqlEscape(isAct)}, ${sqlEscape(p.is_preorder_only || false)}, ${sqlEscape(p.recipe_id || p.recipeId)}, ${sqlEscape(p.image_url)}, ${sqlEscape(p.created_at || new Date().toISOString())}, ${sqlEscape(p.updated_at || new Date().toISOString())});
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
      const isAct = ing.is_active !== undefined ? Boolean(ing.is_active) : true;
      sql += `INSERT INTO ingredients (id, name, unit, packaging_unit, conversion_rate, category, stock_qty, reorder_level, avg_cost, wastage_pct, is_active, created_at, updated_at) VALUES (${sqlEscape(ing.id)}, ${sqlEscape(ing.name)}, ${sqlEscape(ing.unit || 'g')}, ${sqlEscape(ing.packaging_unit || 'Túi 1kg')}, ${sqlEscape(ing.conversion_rate || 1000)}, ${sqlEscape(ing.category)}, ${sqlEscape(ing.stock_qty || 0)}, ${sqlEscape(ing.reorder_level || 0)}, ${sqlEscape(ing.avg_cost || 0)}, ${sqlEscape(ing.wastage_pct || 0)}, ${sqlEscape(isAct)}, ${sqlEscape(ing.created_at || new Date().toISOString())}, ${sqlEscape(ing.updated_at || new Date().toISOString())});
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
      const totalMatCost = r.total_material_cost ?? r.totalMaterialCost ?? costPerUnit;
      const isAct = r.is_active !== undefined ? Boolean(r.is_active) : true;
      sql += `INSERT INTO recipes (id, name, product_id, category, yield_qty, yield_unit, total_material_cost, cost_per_unit, target_food_cost_pct, suggested_price, bake_time_minutes, bake_temp_celsius, notes, is_active, created_at, updated_at) VALUES (${sqlEscape(r.id)}, ${sqlEscape(r.name)}, ${sqlEscape(r.product_id || r.productId)}, ${sqlEscape(r.category || 'Bánh tươi')}, ${sqlEscape(r.yield_qty || r.yieldQty || 1)}, ${sqlEscape(r.yield_unit || r.yieldUnit || 'chiếc')}, ${sqlEscape(totalMatCost)}, ${sqlEscape(costPerUnit)}, ${sqlEscape(targetPct)}, ${sqlEscape(sugPrice)}, ${sqlEscape(bakeMins)}, ${sqlEscape(bakeTemp)}, ${sqlEscape(r.notes)}, ${sqlEscape(isAct)}, ${sqlEscape(r.created_at || new Date().toISOString())}, ${sqlEscape(r.updated_at || new Date().toISOString())});
`;
      if (Array.isArray(r.items)) {
        for (const it of r.items) {
          const itId = it.id || `${r.id}-${it.ingredient_id || it.ingredientId || Math.random().toString(36).substr(2, 6)}`;
          const ingId = it.ingredient_id || it.ingredientId || '1';
          const qty = it.quantity ?? it.qty ?? 0;
          const lineCost = it.line_cost ?? it.cost ?? 0;
          sql += `INSERT INTO recipe_items (id, recipe_id, ingredient_id, quantity, unit, line_cost, created_at) VALUES (${sqlEscape(itId)}, ${sqlEscape(r.id)}, ${sqlEscape(ingId)}, ${sqlEscape(qty)}, ${sqlEscape(it.unit || 'g')}, ${sqlEscape(lineCost)}, ${sqlEscape(it.created_at || new Date().toISOString())});
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
      const bakeStatus = o.bake_status ?? 'done';
      const needBake = o.need_bake_qty ?? 0;
      const readyStock = o.ready_stock_qty ?? 0;
      const parentOrder = o.parent_order_number ?? null;
      const specStr = o.cake_order_spec ? JSON.stringify(o.cake_order_spec) : null;
      const subtotal = o.subtotal ?? (o.total_amount || o.totalPrice || 0);

      sql += `INSERT INTO orders (id, local_id, order_number, order_type, status, subtotal, discount_amount, discount_pct, total_amount, final_amount, total_cogs, deposit_amount, remaining_amount, shipping_fee, payment_status, payment_method, notes, customer_name, customer_phone, cake_name, cake_message, delivery_method, shipping_address, preorder_pickup_at, bake_status, need_bake_qty, ready_stock_qty, parent_order_number, cake_order_spec, bake_approval_status, reference_image_url, created_by, store_id, shift_id, sync_status, created_at, updated_at) VALUES (${sqlEscape(o.id || o.order_number || o.orderNumber)}, ${sqlEscape(o.local_id || o.localId || o.id)}, ${sqlEscape(o.order_number || o.orderNumber)}, ${sqlEscape(o.order_type || o.orderType || 'takeaway')}, ${sqlEscape(o.status)}, ${sqlEscape(subtotal)}, ${sqlEscape(discount)}, ${sqlEscape(o.discount_pct ?? o.discountPct ?? 0)}, ${sqlEscape(o.total_amount || o.totalPrice || 0)}, ${sqlEscape(finalAmt)}, ${sqlEscape(totalCogs)}, ${sqlEscape(depositAmt)}, ${sqlEscape(remainAmt)}, ${sqlEscape(shipFee)}, ${sqlEscape(payStatus)}, ${sqlEscape(payMethod)}, ${sqlEscape(o.notes)}, ${sqlEscape(o.customer_name || o.customerName)}, ${sqlEscape(o.customer_phone || o.customerPhone)}, ${sqlEscape(cakeName)}, ${sqlEscape(cakeMsg)}, ${sqlEscape(o.delivery_method || o.deliveryMethod || 'pickup')}, ${sqlEscape(o.shipping_address || o.shippingAddress)}, ${sqlEscape(preorderPickup)}, ${sqlEscape(bakeStatus)}, ${sqlEscape(needBake)}, ${sqlEscape(readyStock)}, ${sqlEscape(parentOrder)}, ${sqlEscape(specStr)}, ${sqlEscape(o.bake_approval_status || o.bakeApprovalStatus)}, ${sqlEscape(o.reference_image_url || o.referenceImageUrl)}, ${sqlEscape(o.created_by || o.createdBy)}, ${sqlEscape(o.store_id || o.storeId)}, ${sqlEscape(o.shift_id || o.shiftId)}, ${sqlEscape(o.sync_status || 'synced')}, ${sqlEscape(o.created_at || o.createdAt || new Date().toISOString())}, ${sqlEscape(o.updated_at || o.updatedAt || new Date().toISOString())});
`;
      if (Array.isArray(o.items)) {
        for (const item of o.items) {
          const itemId = item.id || `${o.order_number}-${Math.random().toString(36).substr(2, 6)}`;
          const pId = item.product_id || item.productId;
          const pName = item.product_name || item.product_name_snapshot || item.name || 'Sản phẩm';
          const unitPrice = item.unit_price || item.unitPrice || item.price || 0;
          const unitCost = item.unit_cost ?? item.unitCost ?? item.cost ?? 0;
          const itemSubtotal = item.subtotal || (item.quantity * unitPrice);
          const lineCost = item.line_cost ?? item.lineCost ?? Math.round(unitCost * (item.quantity || 1));
          const prodType = item.product_type || item.productType || 'produced';
          const supName = item.supplier_name || item.supplierName || null;
          const itemNotes = item.notes || null;

          sql += `INSERT INTO order_items (id, order_id, product_id, variant_id, product_name_snapshot, quantity, unit_price, unit_cost, subtotal, line_total, line_cost, product_type, supplier_name, notes, created_at) VALUES (${sqlEscape(itemId)}, ${sqlEscape(o.id || o.order_number || o.orderNumber)}, ${sqlEscape(pId)}, ${sqlEscape(item.variant_id || item.variantId)}, ${sqlEscape(pName)}, ${sqlEscape(item.quantity || 1)}, ${sqlEscape(unitPrice)}, ${sqlEscape(unitCost)}, ${sqlEscape(itemSubtotal)}, ${sqlEscape(itemSubtotal)}, ${sqlEscape(lineCost)}, ${sqlEscape(prodType)}, ${sqlEscape(supName)}, ${sqlEscape(itemNotes)}, ${sqlEscape(item.created_at || new Date().toISOString())});
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
      const prodImg = st.productImage ?? st.product_image ?? '';
      sql += `INSERT INTO stock_adjustments (id, product_id, product_name, product_image, old_stock, new_stock, difference, reason, notes, adjusted_by, created_at) VALUES (${sqlEscape(st.id)}, ${sqlEscape(st.productId || st.product_id)}, ${sqlEscape(st.productName || st.product_name)}, ${sqlEscape(prodImg)}, ${sqlEscape(oldStock)}, ${sqlEscape(newStock)}, ${sqlEscape(diff)}, ${sqlEscape(st.reason)}, ${sqlEscape(st.notes)}, ${sqlEscape(st.adjustedBy || st.adjusted_by)}, ${sqlEscape(created)});
`;
    }
  }

  sql += `
-- ----------------------------------------------------------------------------
-- 8b. BẢNG LỊCH SỬ XUẤT NHẬP KHO VẬT TƯ (MATERIAL_TRANSACTIONS)
-- ----------------------------------------------------------------------------
`;
  const matTxs = data?.material_transactions || (typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bakery_material_transactions') || '[]') : []);
  if (Array.isArray(matTxs) && matTxs.length > 0) {
    for (const mt of matTxs) {
      sql += `INSERT INTO material_transactions (id, type, material_id, material_name, material_category, unit, package_qty, package_unit, conversion_rate, quantity, unit_price, package_unit_price, total_amount, supplier_or_reason, performed_by, transaction_date, notes, created_at) VALUES (${sqlEscape(mt.id)}, ${sqlEscape(mt.type)}, ${sqlEscape(mt.materialId || mt.material_id)}, ${sqlEscape(mt.materialName || mt.material_name)}, ${sqlEscape(mt.materialCategory || mt.material_category)}, ${sqlEscape(mt.unit)}, ${sqlEscape(mt.packageQty || mt.package_qty)}, ${sqlEscape(mt.packageUnit || mt.package_unit)}, ${sqlEscape(mt.conversionRate || mt.conversion_rate || 1)}, ${sqlEscape(mt.quantity || 0)}, ${sqlEscape(mt.unitPrice || mt.unit_price || 0)}, ${sqlEscape(mt.packageUnitPrice || mt.package_unit_price)}, ${sqlEscape(mt.totalAmount || mt.total_amount || 0)}, ${sqlEscape(mt.supplierOrReason || mt.supplier_or_reason)}, ${sqlEscape(mt.performedBy || mt.performed_by)}, ${sqlEscape(mt.date || mt.transaction_date)}, ${sqlEscape(mt.notes)}, ${sqlEscape(mt.createdAt || mt.created_at || new Date().toISOString())});
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
      sql += `INSERT INTO accounting_closings (id, period_type, period_key, period_label, start_date, end_date, closed_at, closed_by, total_orders, total_revenue, cash_revenue, bank_revenue, total_cogs, gross_profit, total_opex, spoilage_cost, spoilage_qty, net_profit, total_cash_sales, actual_cash_counted, system_cash, cash_difference, notes, status) VALUES (${sqlEscape(cl.id)}, ${sqlEscape(cl.periodType || cl.period_type)}, ${sqlEscape(cl.periodKey || cl.period_key)}, ${sqlEscape(cl.periodLabel || cl.period_label)}, ${sqlEscape(cl.startDate || cl.start_date)}, ${sqlEscape(cl.endDate || cl.end_date)}, ${sqlEscape(cl.closedAt || cl.closed_at)}, ${sqlEscape(cl.closedBy || cl.closed_by)}, ${sqlEscape(cl.totalOrders || cl.total_orders || 0)}, ${sqlEscape(cl.totalRevenue || cl.total_revenue || 0)}, ${sqlEscape(cl.cashRevenue || cl.cash_revenue || 0)}, ${sqlEscape(cl.bankRevenue || cl.bank_revenue || 0)}, ${sqlEscape(cl.totalCOGS || cl.total_cogs || 0)}, ${sqlEscape(cl.grossProfit || cl.gross_profit || 0)}, ${sqlEscape(cl.totalOpex || cl.total_opex || 0)}, ${sqlEscape(cl.spoilageCost || cl.spoilage_cost || 0)}, ${sqlEscape(cl.spoilageQty || cl.spoilage_qty || 0)}, ${sqlEscape(cl.netProfit || cl.net_profit || 0)}, ${sqlEscape(cl.totalCashSales || cl.total_cash_sales || 0)}, ${sqlEscape(cl.actualCashCounted || cl.actual_cash_counted || 0)}, ${sqlEscape(cl.systemCash || cl.system_cash || 0)}, ${sqlEscape(cl.cashDifference || cl.cash_difference || 0)}, ${sqlEscape(cl.notes)}, ${sqlEscape(cl.status || 'closed')});
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
INSERT INTO vietqr_config (id, bank_id, bank_name, account_no, account_name, template, transfer_syntax, updated_at) VALUES ('primary', ${sqlEscape(vq.bankId || vq.bank_id)}, ${sqlEscape(vq.bankName || vq.bank_name)}, ${sqlEscape(vq.accountNo || vq.account_no)}, ${sqlEscape(vq.accountName || vq.account_name)}, ${sqlEscape(vq.template || 'compact2')}, ${sqlEscape(vq.transferSyntax || vq.transfer_syntax || 'DH')}, ${sqlEscape(new Date().toISOString())});
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
INSERT INTO store_branding (id, store_name, slogan, tagline, address, phone, wifi_password, logo_url, footer_message, updated_at) VALUES ('primary', ${sqlEscape(br.storeName || br.store_name)}, ${sqlEscape(br.slogan || br.tagline)}, ${sqlEscape(br.tagline || br.slogan)}, ${sqlEscape(br.address)}, ${sqlEscape(br.phone)}, ${sqlEscape(br.wifiPassword || br.wifi_password)}, ${sqlEscape(br.logoUrl || br.logo_url)}, ${sqlEscape(br.footerMessage || br.footer_message || 'Cảm ơn Quý khách & Hẹn gặp lại!')}, ${sqlEscape(new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 13. BẢNG CẤU HÌNH MÁY IN (PRINTER_CONFIGS)
  // ----------------------------------------------------------------------------
  const pr = data?.printer_configs || data?.printer || data?.settings?.printer;
  if (pr) {
    const rawPrJson = typeof pr === 'object' ? JSON.stringify(pr) : null;
    sql += `
-- ----------------------------------------------------------------------------
-- 13. BẢNG CẤU HÌNH MÁY IN (PRINTER_CONFIGS)
-- ----------------------------------------------------------------------------
INSERT INTO printer_configs (id, mode, printer_name, receipt_size, label_size, connection_type, auto_print, auto_cut, print_delivery_address, copies, sticker_scale, receipt_scale, store_name, store_address, store_hotline, raw_config_json, updated_at) VALUES ('primary', ${sqlEscape(pr.mode || 'browser')}, ${sqlEscape(pr.printerName || pr.printer_name || 'POS Printer')}, ${sqlEscape(pr.receiptSize || pr.receipt_size || pr.paperSize || '80mm')}, ${sqlEscape(pr.labelSize || pr.label_size || '50x30')}, ${sqlEscape(pr.connectionType || pr.connection_type || 'usb')}, ${sqlEscape(pr.autoPrint || pr.auto_print || false)}, ${sqlEscape(pr.autoCut ?? true)}, ${sqlEscape(pr.printDeliveryAddress ?? true)}, ${sqlEscape(pr.copies || 1)}, ${sqlEscape(pr.stickerScale ?? 92)}, ${sqlEscape(pr.receiptScale ?? 100)}, ${sqlEscape(pr.storeName || pr.store_name)}, ${sqlEscape(pr.storeAddress || pr.store_address)}, ${sqlEscape(pr.storeHotline || pr.store_hotline)}, ${sqlEscape(rawPrJson)}, ${sqlEscape(new Date().toISOString())});
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
INSERT INTO ewallet_config (id, active_wallet, momo_phone, momo_name, momo_qr_url, zalopay_phone, zalopay_name, zalopay_qr_url, viettelmoney_phone, viettelmoney_name, viettelmoney_qr_url, transfer_syntax, updated_at) VALUES ('primary', ${sqlEscape(ew.activeWallet || ew.active_wallet || 'momo')}, ${sqlEscape(ew.momo?.phone)}, ${sqlEscape(ew.momo?.name)}, ${sqlEscape(ew.momo?.qrUrl)}, ${sqlEscape(ew.zalopay?.phone)}, ${sqlEscape(ew.zalopay?.name)}, ${sqlEscape(ew.zalopay?.qrUrl)}, ${sqlEscape(ew.viettelmoney?.phone)}, ${sqlEscape(ew.viettelmoney?.name)}, ${sqlEscape(ew.viettelmoney?.qrUrl)}, ${sqlEscape(ew.transferSyntax || ew.transfer_syntax || 'VIMO')}, ${sqlEscape(new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 14b. BẢNG CẤU HÌNH TELEGRAM THÔNG BÁO ĐƠN (TELEGRAM_CONFIG)
  // ----------------------------------------------------------------------------
  const tg = data?.telegram_config || data?.telegram || data?.settings?.telegram;
  if (tg) {
    sql += `
-- ----------------------------------------------------------------------------
-- 14b. BẢNG CẤU HÌNH TELEGRAM (TELEGRAM_CONFIG)
-- ----------------------------------------------------------------------------
INSERT INTO telegram_config (id, enabled, bot_token, chat_id, updated_at) VALUES ('primary', ${sqlEscape(tg.enabled || false)}, ${sqlEscape(tg.botToken || tg.bot_token)}, ${sqlEscape(tg.chatId || tg.chat_id)}, ${sqlEscape(new Date().toISOString())});
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

  // ----------------------------------------------------------------------------
  // 16. BẢNG THÔNG TIN KẾ TOÁN & THUẾ HỘ KINH DOANH (TAX_HOUSEHOLD_CONFIG)
  // ----------------------------------------------------------------------------
  const taxInfo = data?.tax_household_config || data?.tax_household || data?.settings?.tax_household;
  if (taxInfo) {
    sql += `
-- ----------------------------------------------------------------------------
-- 16. BẢNG THÔNG TIN KẾ TOÁN & THUẾ HỘ KINH DOANH (TAX_HOUSEHOLD_CONFIG)
-- ----------------------------------------------------------------------------
INSERT INTO tax_household_config (id, shop_name, tax_code, business_address, owner_name, phone, email, business_area, bank_account_number, bank_name, district, province, software_name, registered_revenue_level, pit_calculation_method, regular_employees_count, operating_hours, updated_at) VALUES ('primary', ${sqlEscape(taxInfo.shop_name)}, ${sqlEscape(taxInfo.tax_code)}, ${sqlEscape(taxInfo.business_address)}, ${sqlEscape(taxInfo.owner_name)}, ${sqlEscape(taxInfo.phone)}, ${sqlEscape(taxInfo.email)}, ${sqlEscape(taxInfo.business_area)}, ${sqlEscape(taxInfo.bank_account_number)}, ${sqlEscape(taxInfo.bank_name)}, ${sqlEscape(taxInfo.district)}, ${sqlEscape(taxInfo.province)}, ${sqlEscape(taxInfo.software_name)}, ${sqlEscape(taxInfo.registered_revenue_level || 2)}, ${sqlEscape(taxInfo.pit_calculation_method || 1)}, ${sqlEscape(taxInfo.regular_employees_count || 5)}, ${sqlEscape(taxInfo.operating_hours || '06:30 - 22:00')}, ${sqlEscape(new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 17. BẢNG CẤU HÌNH CHÍNH SÁCH THUẾ (TAX_POLICY_CONFIG)
  // ----------------------------------------------------------------------------
  const taxPolicy = data?.tax_policy_config || data?.tax_policy || data?.settings?.tax_policy;
  if (taxPolicy) {
    sql += `
-- ----------------------------------------------------------------------------
-- 17. BẢNG CẤU HÌNH CHÍNH SÁCH THUẾ (TAX_POLICY_CONFIG)
-- ----------------------------------------------------------------------------
INSERT INTO tax_policy_config (id, name, policy_name, circular_citation, annual_threshold, is_active, effective_date, notes, tax_groups, cost_indicators, updated_at) VALUES ('primary', ${sqlEscape(taxPolicy.name || taxPolicy.policy_name)}, ${sqlEscape(taxPolicy.policy_name || 'Thông Tư 50/2026 & NĐ 141')}, ${sqlEscape(taxPolicy.circular_citation || 'Thông tư 50/2026/TT-BTC & Nghị định 141/2026/NĐ-CP')}, ${sqlEscape(taxPolicy.annual_threshold || 1000000000)}, ${sqlEscape(taxPolicy.is_active ?? true)}, ${sqlEscape(taxPolicy.effective_date || '01/01/2026')}, ${sqlEscape(taxPolicy.notes)}, ${sqlEscape(JSON.stringify(taxPolicy.tax_groups || []))}, ${sqlEscape(JSON.stringify(taxPolicy.cost_indicators || []))}, ${sqlEscape(new Date().toISOString())});
`;
  }

  // ----------------------------------------------------------------------------
  // 18. BẢNG ĐỊNH MỨC BOM BÁNH SINH NHẬT THEO FLOWCHART (BAKERY_BOM_SETTINGS)
  // ----------------------------------------------------------------------------
  const bomConfig = data?.bakery_bom_settings || data?.bakery_full_bom_config || data?.settings?.full_cake_bom_config;
  if (bomConfig) {
    sql += `
-- ----------------------------------------------------------------------------
-- 18. BẢNG ĐỊNH MỨC BOM BÁNH SINH NHẬT (BAKERY_BOM_SETTINGS)
-- ----------------------------------------------------------------------------
INSERT INTO bakery_bom_settings (id, version, target_food_cost_pct, cake_bases, cream_coatings, fillings, packagings, free_accessories, decor_addons, birthday_bom_presets, updated_at) VALUES ('primary', ${sqlEscape(bomConfig.version || '2.0.0')}, ${sqlEscape(bomConfig.targetFoodCostPct || 36.5)}, ${sqlEscape(JSON.stringify(bomConfig.cakeBases || []))}, ${sqlEscape(JSON.stringify(bomConfig.creamCoatings || []))}, ${sqlEscape(JSON.stringify(bomConfig.fillings || []))}, ${sqlEscape(JSON.stringify(bomConfig.packagings || []))}, ${sqlEscape(JSON.stringify(bomConfig.freeAccessories || []))}, ${sqlEscape(JSON.stringify(bomConfig.decorAddons || []))}, ${sqlEscape(JSON.stringify(bomConfig.birthdayBomPresets || []))}, ${sqlEscape(new Date().toISOString())});
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
    const activeEnv = getActiveLocalEnv();
    const dirHandle = await getStoredLocalSqlDirHandle(activeEnv);
    if (dirHandle) {
      const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        const fullData = await gatherFullBakeryData();
        await writeLocalSqlFiles(dirHandle, fullData);
        saveLocalEnvConfig(activeEnv, { lastSyncAt: new Date().toISOString() });
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

    if (Array.isArray(data.ingredients)) {
      localSnapshot['bakery_ingredients'] = JSON.stringify(data.ingredients);
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

    if (Array.isArray(data.material_transactions)) {
      localSnapshot['bakery_material_transactions'] = JSON.stringify(data.material_transactions);
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

    const tax = data.tax_household_config || data.tax_household || data.settings?.tax_household;
    if (tax) {
      localSnapshot['bakery_tax_household_config'] = JSON.stringify(tax);
    }

    const taxPolicy = data.tax_policy_config || data.tax_policy || data.settings?.tax_policy;
    if (taxPolicy) {
      localSnapshot['bakery_tax_policy_config'] = JSON.stringify(taxPolicy);
    }

    const fullBom = data.bakery_bom_settings || data.bakery_full_bom_config || data.full_cake_bom_config || data.settings?.full_cake_bom_config;
    if (fullBom) {
      localSnapshot['bakery_full_bom_config'] = JSON.stringify(fullBom);
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

export const importFromLocalSqlDump = restoreLocalFromBackupData;

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
    let material_transactions: any[] = [];
    let accounting_closings: any[] = [];
    let security_config: any = null;
    let branding_config: any = null;
    let vietqr_config: any = null;
    let ewallet_config: any = null;
    let printer_config: any = null;
    let telegram_config: any = null;
    let cake_costing_config: any = null;
    let tax_household_config: any = null;
    let tax_policy_config: any = null;
    let full_cake_bom_config: any = null;

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
          if (row.name === 'SYS_CONFIG_MATERIAL_TRANSACTIONS' && Array.isArray(parsed)) material_transactions = parsed;
          if (row.name === 'SYS_CONFIG_CLOSINGS' && Array.isArray(parsed)) accounting_closings = parsed;
          if (row.name === 'SYS_CONFIG_SECURITY') security_config = parsed;
          if (row.name === 'SYS_CONFIG_BRANDING') branding_config = parsed;
          if (row.name === 'SYS_CONFIG_VIETQR') vietqr_config = parsed;
          if (row.name === 'SYS_CONFIG_EWALLET') ewallet_config = parsed;
          if (row.name === 'SYS_CONFIG_PRINTER') printer_config = parsed;
          if (row.name === 'SYS_CONFIG_TELEGRAM') telegram_config = parsed;
          if (row.name === 'SYS_CONFIG_CAKE_COSTING') cake_costing_config = parsed;
          if (row.name === 'SYS_CONFIG_TAX_HOUSEHOLD') tax_household_config = parsed;
          if (row.name === 'SYS_CONFIG_TAX_POLICY') tax_policy_config = parsed;
          if (row.name === 'SYS_CONFIG_CAKE_BOM' || row.name === 'SYS_CONFIG_BAKERY_BOM') full_cake_bom_config = parsed;
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
        totalMaterialTransactions: material_transactions.length,
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
      material_transactions,
      accounting_closings,
      security_config,
      branding_config,
      vietqr_config,
      ewallet_config,
      printer_configs: printer_config,
      telegram_config,
      cake_costing_config,
      tax_household_config,
      tax_policy_config,
      bakery_bom_settings: full_cake_bom_config,
      images: [],
      settings: {
        vietqr: vietqr_config,
        ewallet: ewallet_config,
        printer: printer_config,
        telegram: telegram_config,
        branding: branding_config,
        security: security_config,
        cake_costing: cake_costing_config,
        tax_household: tax_household_config,
        tax_policy: tax_policy_config,
        full_cake_bom_config,
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
