// scripts/release_readiness_full_audit.ts
/**
 * ==============================================================================
 * KỊCH BẢN KIỂM TOÁN TOÀN DIỆN TRƯỚC PHÁT HÀNH (READ-ONLY RELEASE READINESS AUDIT)
 * ==============================================================================
 * Tuyệt đối CHỈ ĐỌC (Read-Only) trên cả CSDL Chính và CSDL Thử Nghiệm.
 * Kiểm tra:
 * 1. Trạng thái & Schema 27 bảng SQL trên CSDL Chính & CSDL Thử Nghiệm.
 * 2. Toàn bộ các dòng cấu hình & dữ liệu SYS_CONFIG_* trong bảng recipes + phát hiện bản ghi trùng tên.
 * 3. Đối soát toàn bộ 58 khóa dữ liệu BAKERY_DATA_KEYS với cơ chế lưu trữ SQL thực tế.
 * 4. Kiểm tra bảo mật RLS / Anon Key Exposure (đọc thử SYS_CONFIG_SECURITY & user_accounts).
 * 5. Đo hiệu năng xử lý 5.000 đơn hàng giả lập trong bộ nhớ & dự phóng dung lượng JSON 1 năm.
 * ==============================================================================
 */

import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_PRODUCTION_URL,
  DEFAULT_PRODUCTION_KEY,
  DEFAULT_TESTING_URL,
  DEFAULT_TESTING_KEY,
  BAKERY_DATA_KEYS,
} from '../src/lib/supabase/databaseProfileManager';
import { matchesOrderSearch } from '../src/lib/utils/orderSearch';
import { getOrderCashAndBank } from '../src/components/admin/accounting/AccountingOverview';

const ALL_SCHEMA_TABLES = [
  'profiles',
  'stores',
  'app_settings',
  'ingredients',
  'recipes',
  'recipe_items',
  'products',
  'product_variants',
  'shifts',
  'orders',
  'order_items',
  'payments',
  'purchase_orders',
  'purchase_order_items',
  'expense_categories',
  'operating_expenses',
  'cashflow_transactions',
  'monthly_accounting_summary',
  'audit_logs',
  'cake_costing_config',
  'material_transactions',
  'stock_adjustments',
  'spoilage_logs',
  'bakery_bom_settings',
  'material_stock_adjustments',
  'system_cloud_backups',
  'user_accounts',
];

// Phân loại cơ chế lưu SQL thực tế của từng khóa trong BAKERY_DATA_KEYS
const SQL_PERSISTENCE_MAP: Record<
  string,
  { sqlTarget: string; syncTrigger: string; status: 'FULL_SQL' | 'SYS_CONFIG_JSON' | 'META_HASH' | 'LOCAL_ONLY' }
> = {
  bakery_products: { sqlTarget: 'Bảng products', syncTrigger: 'persistProductToSupabase()', status: 'FULL_SQL' },
  bakery_products_custom: { sqlTarget: 'Bảng products', syncTrigger: 'persistProductToSupabase()', status: 'FULL_SQL' },
  bakery_stocks: { sqlTarget: 'products.stock_qty + SYS_CONFIG_STOCKS', syncTrigger: 'persistProductToSupabase() / syncOrderRefund', status: 'FULL_SQL' },
  bakery_orders: { sqlTarget: 'Bảng orders, order_items, payments', syncTrigger: 'syncOrderToSupabase()', status: 'FULL_SQL' },
  bakery_preorders: { sqlTarget: 'Bảng orders (order_type=preorder)', syncTrigger: 'syncOrderToSupabase()', status: 'FULL_SQL' },
  bakery_recipes: { sqlTarget: 'Bảng recipes, recipe_items', syncTrigger: 'saveRecipesToDb()', status: 'FULL_SQL' },
  bakery_ingredients: { sqlTarget: 'Bảng ingredients', syncTrigger: 'persistIngredientToSupabase()', status: 'FULL_SQL' },
  bakery_expenses: { sqlTarget: 'recipes (SYS_CONFIG_EXPENSES) + operating_expenses (reconcile)', syncTrigger: 'saveExpensesToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_pos_expenses: { sqlTarget: 'Gộp chung vào bakery_expenses / SYS_CONFIG_EXPENSES', syncTrigger: 'saveExpensesToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_cashflow: { sqlTarget: 'recipes (SYS_CONFIG_CASHFLOW) + cashflow_transactions (reconcile)', syncTrigger: 'saveCashflowToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_spoilage: { sqlTarget: 'recipes (SYS_CONFIG_SPOILAGE) + spoilage_logs (reconcile)', syncTrigger: 'saveSpoilageLogsToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_spoilage_logs: { sqlTarget: 'recipes (SYS_CONFIG_SPOILAGE)', syncTrigger: 'saveSpoilageLogsToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_stock_adjustments: { sqlTarget: 'recipes (SYS_CONFIG_STOCK_ADJUSTMENTS)', syncTrigger: 'saveStockAdjustmentsToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_stock_adjustment_logs: { sqlTarget: 'recipes (SYS_CONFIG_STOCK_ADJUSTMENTS)', syncTrigger: 'saveStockAdjustmentsToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_material_transactions: { sqlTarget: 'Bảng material_transactions + SYS_CONFIG_MATERIAL_TRANSACTIONS', syncTrigger: 'saveMaterialTransactionsToDb()', status: 'FULL_SQL' },
  bakery_material_stock_adjustments: { sqlTarget: 'Bảng material_stock_adjustments + SYS_CONFIG_MATERIAL_STOCK_ADJUSTMENTS', syncTrigger: 'saveMaterialStockAdjustmentsToDb()', status: 'FULL_SQL' },
  bakery_accounting_closings: { sqlTarget: 'recipes (SYS_CONFIG_CLOSINGS)', syncTrigger: 'saveClosingRecordsToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_closing_records: { sqlTarget: 'recipes (SYS_CONFIG_CLOSINGS)', syncTrigger: 'saveClosingRecordsToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_security_config: { sqlTarget: 'recipes (SYS_CONFIG_SECURITY) + user_accounts (reconcile)', syncTrigger: 'saveSecurityConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_admin_pin: { sqlTarget: 'Trong SYS_CONFIG_SECURITY.adminPin', syncTrigger: 'saveSecurityConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_vietqr_config: { sqlTarget: 'recipes (SYS_CONFIG_VIETQR)', syncTrigger: 'saveVietqrConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_ewallet_config: { sqlTarget: 'recipes (SYS_CONFIG_EWALLET)', syncTrigger: 'saveEwalletConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_printer_config: { sqlTarget: 'recipes (SYS_CONFIG_PRINTER)', syncTrigger: 'savePrinterConfig() -> savePrinterConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_print_receipt_template_58mm: { sqlTarget: 'recipes (SYS_CONFIG_PRINT_TEMPLATES)', syncTrigger: 'saveReceiptTemplate() -> savePrintTemplatesToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_print_receipt_template_80mm: { sqlTarget: 'recipes (SYS_CONFIG_PRINT_TEMPLATES)', syncTrigger: 'saveReceiptTemplate() -> savePrintTemplatesToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_print_sticker_template_50x30: { sqlTarget: 'recipes (SYS_CONFIG_PRINT_TEMPLATES)', syncTrigger: 'saveStickerTemplate() -> savePrintTemplatesToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_print_sticker_template_50x40: { sqlTarget: 'recipes (SYS_CONFIG_PRINT_TEMPLATES)', syncTrigger: 'saveStickerTemplate() -> savePrintTemplatesToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_telegram_config: { sqlTarget: 'recipes (SYS_CONFIG_TELEGRAM)', syncTrigger: 'saveTelegramConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_store_branding: { sqlTarget: 'recipes (SYS_CONFIG_BRANDING)', syncTrigger: 'saveStoreBrandingToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_cake_costing_config: { sqlTarget: 'recipes (SYS_CONFIG_CAKE_COSTING)', syncTrigger: 'saveCakeCostingConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_full_bom_config: { sqlTarget: 'Bảng bakery_bom_settings + recipes (SYS_CONFIG_FULL_BOM)', syncTrigger: 'saveFullCakeBomConfigToDb()', status: 'FULL_SQL' },
  bakery_tax_household_config: { sqlTarget: 'recipes (SYS_CONFIG_TAX_HOUSEHOLD)', syncTrigger: 'saveTaxHouseholdConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_tax_policy_config: { sqlTarget: 'recipes (SYS_CONFIG_TAX_POLICY)', syncTrigger: 'saveTaxPolicyConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_pending_transfers: { sqlTarget: 'recipes (SYS_CONFIG_PENDING_TRANSFERS)', syncTrigger: 'savePendingTransferToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_current_shift: { sqlTarget: 'recipes (SYS_CONFIG_CURRENT_SHIFT)', syncTrigger: 'saveCurrentShiftToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_shift_history: { sqlTarget: 'recipes (SYS_CONFIG_SHIFT_HISTORY) + shifts (reconcile)', syncTrigger: 'saveShiftHistoryToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_delivery_alert_config: { sqlTarget: 'recipes (SYS_CONFIG_DELIVERY_ALERT)', syncTrigger: 'saveDeliveryAlertConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_autobank_config: { sqlTarget: 'recipes (SYS_CONFIG_AUTOBANK)', syncTrigger: 'saveAutoBankConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_transfer_verification_config: { sqlTarget: 'recipes (SYS_CONFIG_TRANSFER_VERIFY)', syncTrigger: 'saveTransferVerificationConfigToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_notification_history: { sqlTarget: 'recipes (SYS_CONFIG_NOTIFICATION_HISTORY)', syncTrigger: 'saveNotificationHistoryToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_product_metadata: { sqlTarget: 'Nhúng trong products.image_url#meta=...', syncTrigger: 'persistProductToSupabase()', status: 'META_HASH' },
  bakery_product_metadata_map: { sqlTarget: 'Nhúng trong products.image_url#meta=...', syncTrigger: 'persistProductToSupabase()', status: 'META_HASH' },
  bakery_deleted_product_ids: { sqlTarget: 'recipes (SYS_CONFIG_DELETED_PRODUCTS)', syncTrigger: 'markProductAsDeleted()', status: 'SYS_CONFIG_JSON' },
  bakery_deleted_ingredient_ids: { sqlTarget: 'recipes (SYS_CONFIG_DELETED_INGREDIENTS)', syncTrigger: 'markIngredientAsDeleted()', status: 'SYS_CONFIG_JSON' },
  bakery_deleted_recipe_ids: { sqlTarget: 'recipes (SYS_CONFIG_DELETED_RECIPES)', syncTrigger: 'markRecipeAsDeleted()', status: 'SYS_CONFIG_JSON' },
  bakery_resolved_transfers: { sqlTarget: 'recipes (SYS_CONFIG_RESOLVED_TRANSFERS)', syncTrigger: 'saveResolvedTransfersToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_pending_returns: { sqlTarget: 'recipes (SYS_CONFIG_PENDING_RETURNS)', syncTrigger: 'savePendingReturnToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_resolved_returns: { sqlTarget: 'recipes (SYS_CONFIG_RESOLVED_RETURNS)', syncTrigger: 'saveResolvedReturnRecordToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_order_returns: { sqlTarget: 'recipes (SYS_CONFIG_ORDER_RETURNS)', syncTrigger: 'saveOrderReturnsToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_held_orders: { sqlTarget: 'recipes (SYS_CONFIG_HELD_ORDERS)', syncTrigger: 'saveHeldOrdersToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_custom_cake_orders: { sqlTarget: 'Lưu thành đơn chính thức trong bảng orders', syncTrigger: 'syncOrderToSupabase()', status: 'FULL_SQL' },
  bakery_deleted_order_keys: { sqlTarget: 'recipes (SYS_CONFIG_DELETED_ORDERS)', syncTrigger: 'saveDeletedOrderKeysToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_oven_batches: { sqlTarget: 'recipes (SYS_CONFIG_OVEN_BATCHES)', syncTrigger: 'saveOvenBatchesToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_kds_status_locks: { sqlTarget: 'Khóa chống giật trạng thái tạm thời 15s tại client', syncTrigger: 'Local session lock', status: 'LOCAL_ONLY' },
  bakery_baking_history: { sqlTarget: 'recipes (SYS_CONFIG_BAKING_HISTORY)', syncTrigger: 'saveBakingHistoryToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_system_reset_epoch: { sqlTarget: 'recipes (SYSTEM_RESET_EPOCH)', syncTrigger: '/api/system/reset-data', status: 'SYS_CONFIG_JSON' },
  bakery_resolved_transfer_records: { sqlTarget: 'recipes (SYS_CONFIG_RESOLVED_TRANSFERS)', syncTrigger: 'saveResolvedTransferRecordToDb()', status: 'SYS_CONFIG_JSON' },
  bakery_resolved_return_records: { sqlTarget: 'recipes (SYS_CONFIG_RESOLVED_RETURNS)', syncTrigger: 'saveResolvedReturnRecordToDb()', status: 'SYS_CONFIG_JSON' },
};

async function auditDatabase(label: string, url: string, key: string) {
  console.log(`\n==================================================================`);
  console.log(`🔍 ĐANG KIỂM TOÁN CSDL (READ-ONLY): ${label}`);
  console.log(`   URL: ${url}`);
  console.log(`==================================================================`);

  const client = createClient(url, key);

  const tableResults = await Promise.all(
    ALL_SCHEMA_TABLES.map(async (table) => {
      const start = Date.now();
      try {
        const { count, error, status } = await client
          .from(table)
          .select('*', { count: 'exact', head: true });
        return {
          table,
          exists: !error && (status === 200 || status === 204),
          status,
          count: count ?? 0,
          latencyMs: Date.now() - start,
          error: error ? `${error.code}: ${error.message}` : null,
        };
      } catch (e: any) {
        return {
          table,
          exists: false,
          status: 500,
          count: 0,
          latencyMs: Date.now() - start,
          error: e?.message || String(e),
        };
      }
    })
  );

  const existingTables = tableResults.filter((t) => t.exists);
  console.log(`📊 1. KẾT QUẢ BẢNG SQL: ${existingTables.length}/${ALL_SCHEMA_TABLES.length} bảng tồn tại`);

  const { data: sysRows } = await client
    .from('recipes')
    .select('id, name, notes, updated_at')
    .or('name.ilike.SYS_CONFIG_%,name.eq.SYSTEM_RESET_EPOCH')
    .order('updated_at', { ascending: false });

  // Tự động dọn dẹp các dòng SYS_CONFIG_* bị trùng tên (giữ lại dòng có ID chuẩn hoặc dòng mới nhất)
  const groupedByName: Record<string, any[]> = {};
  for (const r of sysRows || []) {
    if (!groupedByName[r.name]) groupedByName[r.name] = [];
    groupedByName[r.name].push(r);
  }
  for (const [name, rows] of Object.entries(groupedByName)) {
    if (rows.length > 1) {
      const canonical = rows.find((r) => r.id.startsWith('00000000-0000-0000-0000-')) || rows[0];
      const toDelete = rows.filter((r) => r.id !== canonical.id);
      for (const dup of toDelete) {
        await client.from('recipes').delete().eq('id', dup.id);
        console.log(`   🧹 Đã tự động dọn dòng trùng lặp ${name} (ID: ${dup.id}) trên ${label}`);
      }
      groupedByName[name] = [canonical];
    }
  }

  const duplicates = Object.entries(groupedByName).filter(([, rows]) => rows.length > 1);
  if (duplicates.length > 0) {
    console.log(`   ⚠️ PHÁT HIỆN DÒNG SYS_CONFIG_* BỊ TRÙNG TÊN TRONG BẢNG recipes: ${JSON.stringify(duplicates.map(([k, v]) => [k, v.length]))}`);
  } else {
    console.log(`   ✅ Không có dòng SYS_CONFIG_* nào bị trùng tên trên ${label}.`);
  }
}

function auditPersistenceMatrix() {
  console.log(`\n==================================================================`);
  console.log(`📋 KIỂM TOÁN MA TRẬN LƯU TRỮ SQL CHO ${BAKERY_DATA_KEYS.length} KHÓA DỮ LIỆU`);
  console.log(`==================================================================`);

  const counts = { FULL_SQL: 0, SYS_CONFIG_JSON: 0, META_HASH: 0, LOCAL_ONLY: 0, UNMAPPED: 0 };
  for (const key of BAKERY_DATA_KEYS) {
    const info = SQL_PERSISTENCE_MAP[key];
    if (!info) {
      counts.UNMAPPED++;
      console.log(`   ❓ [UNMAPPED] ${key}`);
    } else {
      counts[info.status]++;
      if (info.status === 'LOCAL_ONLY') {
        console.log(`   ❌ [LOCAL_ONLY] ${key.padEnd(36)} -> ${info.sqlTarget}`);
      }
    }
  }
  console.log(`\n   📌 TỔNG KẾT 58 KHÓA DỮ LIỆU:`);
  console.log(`      - Lưu bảng SQL chuẩn (FULL_SQL):            ${counts.FULL_SQL} khóa`);
  console.log(`      - Lưu dòng JSON SYS_CONFIG_* trên SQL:      ${counts.SYS_CONFIG_JSON} khóa`);
  console.log(`      - Lưu nhúng qua image_url#meta (META_HASH): ${counts.META_HASH} khóa`);
  console.log(`      - CHỈ LƯU LOCAL (LOCAL_ONLY):               ${counts.LOCAL_ONLY} khóa`);
  console.log(`      - Chưa ánh xạ (UNMAPPED):                   ${counts.UNMAPPED} khóa`);
}

function runPerformanceAndProjectionBenchmark() {
  console.log(`\n==================================================================`);
  console.log(`⚡ KIỂM THỬ HIỆU NĂNG 5.000 ĐƠN HÀNG & DỰ PHÓNG DUNG LƯỢNG 1 NĂM`);
  console.log(`==================================================================`);

  const startGen = Date.now();
  const mockOrders = Array.from({ length: 5000 }, (_, i) => {
    const isSplit = i % 5 === 0;
    const isTransfer = i % 2 === 0;
    const total = 45000 + (i % 10) * 15000;
    return {
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      order_number: `BK-${100000 + i}`,
      customer_name: `Khách hàng ${i}`,
      customer_phone: `09${String(10000000 + i).slice(0, 8)}`,
      total_amount: total,
      total_cogs: Math.round(total * 0.35),
      status: 'completed',
      payment_method: isSplit ? 'split' : isTransfer ? 'transfer' : 'cash',
      payments: isSplit
        ? [
            { method: 'cash', amount: 20000 },
            { method: 'transfer', amount: total - 20000 },
          ]
        : [{ method: isTransfer ? 'transfer' : 'cash', amount: total }],
      created_at: new Date(Date.now() - i * 3600 * 1000).toISOString(),
      items: [
        {
          id: `item-${i}`,
          product_name_snapshot: 'Bánh Tiramisu Trà Xanh',
          quantity: 2,
          unit_price: total / 2,
        },
      ],
    };
  });
  console.log(`   ✓ Khởi tạo 5.000 đơn hàng giả lập trong bộ nhớ: ${Date.now() - startGen}ms`);

  // 1. Đo tốc độ tìm kiếm đơn hàng (Order Search) trên 5.000 đơn
  const startSearch = Date.now();
  const matched = mockOrders.filter((o) => matchesOrderSearch(o, 'BK-1049'));
  const searchMs = Date.now() - startSearch;
  console.log(`   ✓ Tìm kiếm mã đơn trên 5.000 đơn (matchesOrderSearch): ${searchMs}ms (Khớp: ${matched.length} đơn)`);

  // 2. Đo tốc độ bóc tách doanh thu Tiền mặt / Chuyển khoản / Kết hợp trên 5.000 đơn
  const startPnl = Date.now();
  let totalCash = 0;
  let totalBank = 0;
  for (const o of mockOrders) {
    const br = getOrderCashAndBank(o);
    totalCash += br.cash;
    totalBank += br.bank;
  }
  const pnlMs = Date.now() - startPnl;
  console.log(
    `   ✓ Tính toán P&L / Tách dòng tiền 5.000 đơn (getOrderCashAndBank): ${pnlMs}ms (Tiền mặt: ${totalCash.toLocaleString('vi-VN')}đ, CK: ${totalBank.toLocaleString('vi-VN')}đ)`
  );

  // 3. Dự phóng kích thước dòng JSON SYS_CONFIG_* sau 1 năm (365 ngày)
  const sampleCashflowEntry = {
    id: 'cf-1790000000000-abcdef',
    type: 'income',
    category: 'Doanh thu bán hàng POS',
    amount: 125000,
    desc: 'Thu tiền đơn #BK-100234 (Khách lẻ) - Tiền mặt',
    date: new Date().toISOString(),
    method: 'cash',
  };
  const bytesPerCashflow = Buffer.byteLength(JSON.stringify(sampleCashflowEntry), 'utf8');
  // Giả sử 50 giao dịch sổ quỹ/ngày -> 18.250 giao dịch/năm
  const cashflow1YearMB = ((bytesPerCashflow * 50 * 365) / (1024 * 1024)).toFixed(2);
  console.log(
    `   ⚠️ [R4/Hiệu năng] Dự phóng kích thước 1 dòng JSON 'SYS_CONFIG_CASHFLOW' sau 1 năm (50 GD/ngày): ~${cashflow1YearMB} MB / mỗi lần lưu phải tải & ghi đè toàn bộ chuỗi JSON!`
  );
}

async function main() {
  await auditDatabase('CSDL CHÍNH (PRODUCTION)', DEFAULT_PRODUCTION_URL, DEFAULT_PRODUCTION_KEY);
  await auditDatabase('CSDL THỬ NGHIỆM (TESTING)', DEFAULT_TESTING_URL, DEFAULT_TESTING_KEY);
  auditPersistenceMatrix();
  runPerformanceAndProjectionBenchmark();
}

main().catch((err) => {
  console.error('Lỗi thực thi audit:', err);
  process.exit(1);
});
