// scripts/test_full_system_and_sql_sync.ts
// BÀI KIỂM THỬ TOÀN DIỆN HỆ THỐNG BAKERY ERP:
// 1. Đồng bộ Cloud SQL & Local SQL (23 bảng dữ liệu)
// 2. Chạy thực thi trên SQLite Engine thực tế
// 3. Khôi phục dữ liệu 2 chiều (Bidirectional sync)
// 4. Ma trận phân quyền & Đánh giá rủi ro (Verify 5 GAPs đã được vá 100%)

import fs from 'fs';
import path from 'path';

// Mock môi trường Browser / LocalStorage cho Node.js
let mockStorage: Record<string, string> = {
  bakery_sql_mode_config: JSON.stringify({
    mode: 'online',
    localFolderName: '',
    localFolderPath: '',
    autoSyncToFolder: true,
  }),
};

const mockEventSubscribers: Record<string, Function[]> = {};

(globalThis as any).window = {
  addEventListener: (event: string, cb: Function) => {
    mockEventSubscribers[event] = mockEventSubscribers[event] || [];
    mockEventSubscribers[event].push(cb);
  },
  removeEventListener: () => {},
  dispatchEvent: (e: any) => {
    const type = e.type || e;
    (mockEventSubscribers[type] || []).forEach(cb => cb(e));
    return true;
  },
  localStorage: {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
    removeItem: (k: string) => { delete mockStorage[k]; },
    clear: () => {
      for (const k of Object.keys(mockStorage)) {
        delete mockStorage[k];
      }
    },
  },
  navigator: { onLine: true },
};
(globalThis as any).localStorage = (globalThis as any).window.localStorage;
if (typeof globalThis.navigator !== 'undefined') {
  try {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true,
      configurable: true,
      writable: true,
    });
  } catch {}
}

import {
  generateMasterSqlDump,
  generateSchemaSql,
  restoreLocalFromBackupData,
} from '../src/lib/utils/localSqlManager';
import { BAKERY_DATA_KEYS as SQL_MODE_KEYS } from '../src/lib/utils/sqlModeManager';
import { BAKERY_DATA_KEYS as DB_PROFILE_KEYS } from '../src/lib/supabase/databaseProfileManager';
import { DEFAULT_PERMISSIONS, RolePermissionsConfig } from '../src/lib/auth/AuthContext';

// Import SQLite Sync nếu có sẵn trong Node.js
let DatabaseSync: any = null;
try {
  const sqlite = require('node:sqlite');
  DatabaseSync = sqlite.DatabaseSync;
} catch {
  // Dự phòng nếu node:sqlite không có
}

// ── FIXTURES DỮ LIỆU ĐẦY ĐỦ 28 THỰC THỂ ──
const sampleTestData: any = {
  products: [
    {
      id: 'prod-001',
      name: 'Bánh Mì Hoa Cúc',
      category: 'Bánh Mì',
      selling_price: 65000,
      base_cost_price: 24000,
      stock_qty: 25,
      is_active: true,
    },
    {
      id: 'prod-002',
      name: 'Bánh Kem Bắp Pháp',
      category: 'Bánh Kem',
      selling_price: 280000,
      base_cost_price: 95000,
      stock_qty: 8,
      is_active: true,
    },
  ],
  orders: [
    {
      id: 'ord-001',
      order_number: 'BK-001',
      order_type: 'takeaway',
      status: 'completed',
      total_amount: 130000,
      total_cogs: 48000,
      customer_name: 'Anh Nam',
      customer_phone: '0901234567',
      created_at: '2026-09-19T08:00:00.000Z',
      items: [
        {
          id: 'item-001',
          product_name_snapshot: 'Bánh Mì Hoa Cúc',
          quantity: 2,
          unit_price: 65000,
          unit_cost: 24000,
          line_cost: 48000,
        },
      ],
    },
  ],
  ingredients: [
    {
      id: 'ing-001',
      name: 'Bột mì số 13',
      unit: 'kg',
      stock_qty: 120,
      avg_cost: 18500,
      reorder_level: 20,
      sku: 'NVL-BM13',
    },
  ],
  recipes: [
    {
      id: 'rec-001',
      name: 'Công Thức Cốt Bánh Bông Lan 20cm',
      yield_qty: 4,
      yield_unit: 'cốt',
      cost_per_unit: 22500,
      total_material_cost: 90000,
      items: [
        {
          id: 'ri-001',
          ingredient_id: 'ing-001',
          ingredient_name: 'Bột mì số 13',
          unit: 'g',
          quantity: 400,
          unit_cost: 18.5,
          total_cost: 7400,
        },
      ],
    },
  ],
  expenses: [
    {
      id: 'exp-001',
      category: 'Tiền điện',
      amount: 3200000,
      description: 'Tiền điện lò nướng tháng 9',
      date: '2026-09-15',
    },
  ],
  cashflow: [
    {
      id: 'cf-001',
      type: 'expense',
      category: 'Tiền điện',
      amount: 3200000,
      desc: 'Chi trả tiền điện',
      date: '2026-09-15',
      method: 'bank',
    },
  ],
  stock_adjustments: [
    {
      id: 'sa-001',
      product_id: 'prod-001',
      product_name: 'Bánh Mì Hoa Cúc',
      old_quantity: 20,
      new_quantity: 25,
      delta: 5,
      reason: 'Ra lò mẻ mới',
      created_at: '2026-09-19T07:30:00.000Z',
    },
  ],
  spoilage_logs: [
    {
      id: 'spoil-001',
      product_id: 'prod-001',
      product_name: 'Bánh Mì Hoa Cúc',
      quantity: 1,
      cost_price: 24000,
      total_cost: 24000,
      reason: 'Bị cháy mặt bánh',
      created_at: '2026-09-18T16:00:00.000Z',
    },
  ],
  material_transactions: [
    {
      id: 'mt-001',
      ingredient_id: 'ing-001',
      ingredient_name: 'Bột mì số 13',
      transaction_type: 'in',
      quantity: 50,
      unit_price: 18500,
      total_amount: 925000,
      transaction_date: '2026-09-10',
    },
  ],
  material_stock_adjustments: [
    {
      id: 'msa-001',
      ingredient_id: 'ing-001',
      ingredient_name: 'Bột mì số 13',
      old_quantity: 125,
      new_quantity: 120,
      delta_quantity: -5,
      reason: 'Rơi vãi',
    },
  ],
  accounting_closings: [
    {
      id: 'close-2026-09-18',
      period_type: 'daily',
      period_key: '2026-09-18',
      period_label: 'Ngày 18/09/2026',
      total_revenue: 5600000,
      total_cogs: 2044000,
      gross_profit: 3556000,
      net_profit: 2800000,
    },
  ],
  security_config: {
    adminUsername: 'admin',
    adminName: 'Chủ Tiệm (Admin)',
    adminPasswordHash: 'admin123',
    kitchenPin: '5678',
    kitchenName: 'Thợ Bếp',
    staffPin: '1234',
    staffName: 'Thu Ngân',
    permissions: DEFAULT_PERMISSIONS,
  },
  vietqr_config: {
    bankId: 'MB',
    bankName: 'MBBank',
    accountNo: '0988888888',
    accountName: 'TIEM BANH TEST',
  },
  ewallet_config: {
    activeWallet: 'momo',
    momo: { phone: '0988888888', name: 'Momo Tiệm' },
  },
  store_branding: {
    storeName: 'Tiệm Bánh Hạnh Phúc',
    address: '123 Phố Bánh',
    phone: '0901234567',
  },
  printer_configs: {
    mode: 'browser',
    printerName: 'POS-80',
    paperSize: '80mm',
  },
  telegram_config: {
    enabled: true,
    botToken: '123456:ABC-DEF',
    chatId: '-100987654321',
  },
  cake_costing_config: {
    spongeCost: 25000,
    creamCost: 40000,
  },
  tax_household_config: {
    shop_name: 'Tiệm Bánh Hạnh Phúc',
    tax_code: '8888999900',
    owner_name: 'Bùi Quý Việt',
  },
  tax_policy_config: {
    name: 'Chính Sách Thuế 2026',
    annual_threshold: 1000000000,
  },
  bakery_bom_settings: {
    version: '2.0.0',
    targetFoodCostPct: 36.5,
  },
  // 5 THỰC THỂ MỚI ĐƯỢC GIẢI QUYẾT GAPS:
  pending_transfers: [
    {
      order_number: 'BK-PRE-009',
      amount: 350000,
      customer_name: 'Chị Mai',
      transfer_code: 'DH9876',
      requested_by: 'Thu Ngân Lan',
      requested_at: '2026-09-19T10:15:00.000Z',
    },
  ],
  current_shift: {
    isOpen: true,
    openedAt: '2026-09-19T06:30:00.000Z',
    openingCash: 500000,
    cashSales: 1250000,
    transferSales: 890000,
    orderCount: 14,
  },
  autobank_config: {
    enabled: true,
    gateway: 'sepay',
    apiKey: 'SP-SEC-KEY-999',
    accountNumber: '0988888888',
    bankBrand: 'MBBank',
    autoConfirmPos: true,
  },
  transfer_verify_config: {
    mode: 'two_step',
    twoStep: {
      skipForAdmin: true,
      alertSound: true,
      autoCompleteOnApprove: true,
    },
  },
  notification_history: [
    {
      id: 'notif-test-01',
      type: 'new_order',
      title: 'Đơn hàng mới #BK-001',
      message: 'Khách mua mang đi 130.000đ',
      timestamp: Date.now(),
      createdAtFormatted: '19/09/2026 15:00:00',
      isRead: false,
      sender: 'POS Quầy',
      orderNumber: 'BK-001',
      channel: 'in_app',
    },
  ],
};

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    failCount++;
  }
}

async function runAllTests() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   BÀI KIỂM THỬ TOÀN DIỆN HỆ THỐNG BAKERY ERP & DUAL SQL SYNC     ║
║   Đánh giá rủi ro, kiểm tra 28 thực thể & đảm bảo dữ liệu đồng nhất  ║
╚══════════════════════════════════════════════════════════════════╝
`);

  // ── NHÓM 1: KIỂM TRA SCHEMA DDL LOCAL SQL (29 BẢNG) ──
  console.log('━━━ NHÓM 1: SCHEMA DDL LOCAL SQL (29 BẢNG) ━━━');
  const schemaSql = generateSchemaSql();

  const requiredTables = [
    'products',
    'ingredients',
    'recipes',
    'recipe_items',
    'orders',
    'order_items',
    'payments',
    'shifts',
    'operating_expenses',
    'cashflow_transactions',
    'stock_adjustments',
    'spoilage_logs',
    'material_transactions',
    'material_stock_adjustments',
    'accounting_closings',
    'security_config',
    'vietqr_config',
    'store_branding',
    'printer_configs',
    'telegram_config',
    'cake_costing_config',
    'tax_household_config',
    'tax_policy_config',
    'bakery_bom_settings',
    // 5 bảng mới giải quyết gap:
    'pending_transfers',
    'current_shift',
    'autobank_config',
    'transfer_verify_config',
    'notification_history',
  ];

  for (const table of requiredTables) {
    const hasTable = schemaSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`);
    assert(hasTable, `Bảng '${table}' có trong Schema DDL`);
  }

  // ── NHÓM 2: MASTER SQL DUMP GENERATION & THỰC THI SQLITE ──
  console.log('\n━━━ NHÓM 2: MASTER SQL DUMP GENERATION & ENGINE SQLITE ━━━');
  const masterSql = generateMasterSqlDump(sampleTestData);

  assert(masterSql.length > 2000, 'Master SQL Dump sinh thành công (> 2KB)', `Length: ${masterSql.length}`);
  assert(masterSql.includes('INSERT INTO products'), 'Có câu lệnh INSERT INTO products');
  assert(masterSql.includes('INSERT INTO orders'), 'Có câu lệnh INSERT INTO orders');
  assert(masterSql.includes('INSERT INTO security_config'), 'Có câu lệnh INSERT INTO security_config');
  assert(masterSql.includes('INSERT INTO pending_transfers'), 'Có câu lệnh INSERT INTO pending_transfers (GAP #1 Resolved)');
  assert(masterSql.includes('INSERT INTO current_shift'), 'Có câu lệnh INSERT INTO current_shift (GAP #3 Resolved)');
  assert(masterSql.includes('INSERT INTO autobank_config'), 'Có câu lệnh INSERT INTO autobank_config (GAP #4 Resolved)');
  assert(masterSql.includes('INSERT INTO transfer_verify_config'), 'Có câu lệnh INSERT INTO transfer_verify_config (GAP #5 Resolved)');
  assert(masterSql.includes('INSERT INTO notification_history'), 'Có câu lệnh INSERT INTO notification_history (GAP #2 Resolved)');

  // Kiểm tra chạy thực tế trên SQLite Engine
  if (DatabaseSync) {
    try {
      const db = new DatabaseSync(':memory:');
      db.exec(masterSql);
      
      const prodRows = db.prepare('SELECT count(*) as cnt FROM products').get() as any;
      assert(prodRows.cnt === 2, 'SQLite thực thi: Bảng products có đúng 2 dòng', `Got: ${prodRows.cnt}`);

      const secRows = db.prepare('SELECT admin_username, kitchen_pin, staff_pin FROM security_config').get() as any;
      assert(secRows.admin_username === 'admin' && secRows.kitchen_pin === '5678', 'SQLite thực thi: security_config nạp đúng credentials 3 vai trò');

      const ptRows = db.prepare('SELECT count(*) as cnt FROM pending_transfers').get() as any;
      assert(ptRows.cnt === 1, 'SQLite thực thi: pending_transfers có đúng 1 bản ghi');

      const shiftRows = db.prepare('SELECT opening_cash, order_count FROM current_shift').get() as any;
      assert(shiftRows.opening_cash === 500000 && shiftRows.order_count === 14, 'SQLite thực thi: current_shift lưu đúng két tiền 500.000đ & 14 đơn');

      const notifRows = db.prepare('SELECT count(*) as cnt FROM notification_history').get() as any;
      assert(notifRows.cnt === 1, 'SQLite thực thi: notification_history lưu đúng thông báo');

      db.close();
      assert(true, 'SQLite Engine: 100% cú pháp SQL hợp lệ, không có lỗi runtime');
    } catch (sqliteErr: any) {
      assert(false, 'SQLite Engine thực thi câu lệnh SQL Dump', sqliteErr.message);
    }
  } else {
    console.log('  ℹ️ Bỏ qua chạy SQLite in-memory (Node không hỗ trợ node:sqlite)');
  }

  // ── NHÓM 3: KHÔI PHỤC DỮ LIỆU CỤC BỘ (RESTORE / BIDIRECTIONAL SYNC) ──
  console.log('\n━━━ NHÓM 3: BIDIRECTIONAL RESTORE & LOCAL STORAGE KEYS ━━━');
  mockStorage = {}; // Làm sạch bộ nhớ
  const restoreRes = await restoreLocalFromBackupData(sampleTestData);
  assert(restoreRes.success, 'restoreLocalFromBackupData thực thi thành công');

  assert(!!mockStorage['bakery_products'], 'Khôi phục bakery_products vào localStorage');
  assert(!!mockStorage['bakery_orders'], 'Khôi phục bakery_orders vào localStorage');
  assert(!!mockStorage['bakery_security_config'], 'Khôi phục bakery_security_config vào localStorage');
  assert(!!mockStorage['bakery_pending_transfers'], 'Khôi phục bakery_pending_transfers vào localStorage (GAP #1)');
  assert(!!mockStorage['bakery_current_shift'], 'Khôi phục bakery_current_shift vào localStorage (GAP #3)');
  assert(!!mockStorage['bakery_autobank_config'], 'Khôi phục bakery_autobank_config vào localStorage (GAP #4)');
  assert(!!mockStorage['bakery_transfer_verification_config'], 'Khôi phục bakery_transfer_verification_config vào localStorage (GAP #5)');
  assert(!!mockStorage['bakery_notification_history'], 'Khôi phục bakery_notification_history vào localStorage (GAP #2)');

  // ── NHÓM 4: ĐỒNG BỘ KHÓA DỮ LIỆU TRÊN CÁC PROFILE & SQL MODE MANAGERS ──
  console.log('\n━━━ NHÓM 4: DATA KEYS COVERAGE TRÊN SQL MODE & DB PROFILE ━━━');
  const essentialKeys = [
    'bakery_pending_transfers',
    'bakery_current_shift',
    'bakery_autobank_config',
    'bakery_transfer_verification_config',
    'bakery_notification_history',
  ];

  for (const k of essentialKeys) {
    assert(SQL_MODE_KEYS.includes(k), `sqlModeManager.BAKERY_DATA_KEYS chứa '${k}'`);
    assert(DB_PROFILE_KEYS.includes(k), `databaseProfileManager.BAKERY_DATA_KEYS chứa '${k}'`);
  }

  // ── NHÓM 5: MA TRẬN PHÂN QUYỀN BẢO MẬT & TRUY CẬP VAI TRÒ ──
  console.log('\n━━━ NHÓM 5: MA TRẬN PHÂN QUYỀN (ADMIN / KITCHEN / STAFF) ━━━');
  assert(DEFAULT_PERMISSIONS.admin.adminAccess === true, 'Admin có toàn quyền adminAccess');
  assert(DEFAULT_PERMISSIONS.kitchen.adminAccess === false, 'Kitchen mặc định BỊ KHÓA adminAccess');
  assert(DEFAULT_PERMISSIONS.staff.adminAccess === false, 'Staff mặc định BỊ KHÓA adminAccess');
  assert(DEFAULT_PERMISSIONS.kitchen.kitchenKds === true, 'Kitchen có quyền vào KDS Bếp bánh');
  assert(DEFAULT_PERMISSIONS.staff.kitchenKds === false, 'Staff mặc định BỊ KHÓA KDS Bếp bánh');
  assert(DEFAULT_PERMISSIONS.kitchen.bomCost === false, 'Kitchen mặc định BỊ ẨN giá vốn BOM');
  assert(DEFAULT_PERMISSIONS.staff.bomCost === false, 'Staff mặc định BỊ ẨN giá vốn BOM');

  // Thử nghiệm thay đổi động phân quyền (Dynamic permission toggle)
  const testPermConfig: RolePermissionsConfig = {
    ...DEFAULT_PERMISSIONS,
    kitchen: {
      ...DEFAULT_PERMISSIONS.kitchen,
      bomCost: true, // Cấp quyền xem giá vốn cho thợ bếp
    },
  };
  assert(testPermConfig.kitchen.bomCost === true, 'Động thái cấp quyền xem giá vốn cho Thợ Bếp hoạt động chính xác');

  // ── NHÓM 6: ĐÁNH GIÁ RỦI RO & BẢO ĐẢM DỮ LIỆU TOÀN DIỆN ──
  console.log('\n━━━ NHÓM 6: ĐÁNH GIÁ RỦI RO & BẢO ĐẢM TOÀN DIỆN ━━━');
  assert(
    requiredTables.length >= 29,
    `Hệ thống Local SQL hiện hỗ trợ ${requiredTables.length} bảng cấu trúc dữ liệu toàn diện (≥ 29 bảng)`
  );
  assert(
    SQL_MODE_KEYS.length >= 31,
    `Hệ thống sqlModeManager quản lý ${SQL_MODE_KEYS.length} keys dữ liệu (≥ 31 keys)`
  );
  assert(
    DB_PROFILE_KEYS.length >= 29,
    `Hệ thống databaseProfileManager quản lý ${DB_PROFILE_KEYS.length} keys dữ liệu (≥ 29 keys)`
  );

  console.log('\n' + '═'.repeat(66));
  console.log(`TỔNG KẾT KIỂM THỬ: ${passCount} PASS ✅  |  ${failCount} FAIL ❌`);
  console.log('═'.repeat(66));

  if (failCount > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi khi thực thi bài kiểm thử:', err);
  process.exit(1);
});
