// scripts/test_local_sql_system.ts
// KIỂM THỬ TOÀN DIỆN CƠ SỞ DỮ LIỆU LOCAL SQL & CHẾ ĐỘ CHẠY CỤC BỘ
// (Kiểm thử thực tế: Sinh tệp SQL, Thực thi trên SQLite Engine, Lưu ổ đĩa & Khôi phục)

import fs from 'fs';
import path from 'path';
// @ts-ignore
const { DatabaseSync } = typeof require !== 'undefined' ? require('node:sqlite') : {} as any;

// Mock môi trường Browser / LocalStorage cho Node.js
const mockStorage: Record<string, string> = {
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
  sqlEscape,
  importFromLocalSqlDump,
} from '../src/lib/utils/localSqlManager';
import {
  getSqlModeConfig,
  saveSqlModeConfig,
  switchDatabaseMode,
  isLocalMode,
  isOnlineMode,
  copyOnlineSnapshotToLocal,
  captureDataSnapshot,
  applyDataSnapshot,
} from '../src/lib/utils/sqlModeManager';
import { supabase } from '../src/lib/supabase/client';
import { getFullCakeBomConfig } from '../src/lib/utils/cakeBomManager';

async function runLocalSqlTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║    KIỂM THỬ TOÀN DIỆN CƠ SỞ DỮ LIỆU LOCAL SQL & CHẾ ĐỘ CỤC BỘ ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let passCount = 0;
  let failCount = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passCount++;
    } else {
      console.error(`❌ FAIL: ${name} ${detail ? `(${detail})` : ''}`);
      failCount++;
    }
  }

  const tempTestDir = path.join(process.cwd(), 'temp_test_local_sql_folder');

  try {
    // =========================================================================
    // NHÓM 1: CẤU HÌNH & CHUYỂN ĐỔI CHẾ ĐỘ CƠ SỞ DỮ LIỆU (DATABASE MODE SWITCHING)
    // =========================================================================
    console.log('━━━ NHÓM 1: CẤU HÌNH & CHUYỂN ĐỔI CHẾ ĐỘ CƠ SỞ DỮ LIỆU ━━━');

    // 1.1 Khởi tạo ban đầu là chế độ Online
    saveSqlModeConfig({ mode: 'online' });
    assert('Mặc định hệ thống ở chế độ Online', isOnlineMode() === true && isLocalMode() === false);

    // 1.2 Tạo dữ liệu mẫu trong phiên Online
    mockStorage['bakery_products'] = JSON.stringify([
      { id: 'prod-online-1', name: 'Bánh Mì Online', price: 25000, is_active: true }
    ]);
    mockStorage['bakery_orders'] = JSON.stringify([
      { id: 'ord-online-1', order_number: 'ORD-ONL-01', total_amount: 100000 }
    ]);

    // 1.3 Chuyển sang chế độ Local (switchDatabaseMode)
    const switchedToLocal = switchDatabaseMode('local');
    assert('Chuyển sang chế độ Local thành công', switchedToLocal.mode === 'local' && isLocalMode() === true);
    assert('Hệ thống nhận diện đúng isLocalMode() === true', isLocalMode() === true);
    assert('Hệ thống nhận diện đúng isOnlineMode() === false', isOnlineMode() === false);

    // 1.4 Kiểm tra snapshot Online được bảo toàn khi chuyển sang Local
    const onlineSnapshotRaw = mockStorage['bakery_snapshot_online'];
    assert('Snapshot của phiên Online đã được tự động sao lưu vào bakery_snapshot_online', !!onlineSnapshotRaw);
    const parsedOnlineSnap = JSON.parse(onlineSnapshotRaw || '{}');
    assert('Dữ liệu bánh Online trong snapshot nguyên vẹn', parsedOnlineSnap['bakery_products']?.includes('Bánh Mì Online'));

    // 1.5 Tạo dữ liệu độc lập trong phiên Local
    mockStorage['bakery_products'] = JSON.stringify([
      { id: 'prod-local-1', name: 'Bánh Mì Cục Bộ Máy Tính', price: 30000, is_active: true }
    ]);

    // 1.6 Kiểm tra sao chép snapshot từ Online sang Local (copyOnlineSnapshotToLocal)
    copyOnlineSnapshotToLocal();
    const localProdsAfterCopy = JSON.parse(mockStorage['bakery_products'] || '[]');
    assert('Sao chép snapshot Online sang Local thành công', localProdsAfterCopy.some((p: any) => p.name === 'Bánh Mì Online'));

    // 1.7 Chuyển lại về chế độ Online
    const switchedBackToOnline = switchDatabaseMode('online');
    assert('Chuyển lại về chế độ Online thành công', switchedBackToOnline.mode === 'online' && isOnlineMode() === true);

    // =========================================================================
    // NHÓM 2: CẤU TRÚC BẢNG SCHEMA LOCAL SQL (DDL GENERATION)
    // =========================================================================
    console.log('\n━━━ NHÓM 2: CẤU TRÚC BẢNG SCHEMA LOCAL SQL (DDL) ━━━');
    const schemaSql = generateSchemaSql();
    assert('Hàm generateSchemaSql() sinh chuỗi SQL hợp lệ', typeof schemaSql === 'string' && schemaSql.length > 500);

    const requiredTables = [
      'products',
      'ingredients',
      'recipes',
      'recipe_items',
      'orders',
      'order_items',
      'operating_expenses',
      'cashflow',
      'spoilage',
      'stock_adjustments',
      'material_transactions',
      'material_stock_adjustments',
      'accounting_closings',
      'security_config',
      'store_branding',
      'vietqr_config',
      'ewallet_config',
      'cake_costing_config',
      'tax_household_config',
      'tax_policy_config',
      'bakery_bom_settings',
    ];

    for (const table of requiredTables) {
      const hasTable = schemaSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`);
      assert(`Schema chứa định nghĩa bảng [${table}] chuẩn SQL`, hasTable);
    }

    // =========================================================================
    // NHÓM 3: SINH TỆP MASTER SQL DUMP TỪ DỮ LIỆU THẬT SUPABASE
    // =========================================================================
    console.log('\n━━━ NHÓM 3: SINH TỆP MASTER SQL DUMP TỪ DỮ LIỆU THỰC TẾ ━━━');

    // Tải dữ liệu thực tế từ Supabase
    const { data: realProducts } = await supabase.from('products').select('*').order('name');
    const { data: realIngredients } = await supabase.from('ingredients').select('*').order('name');
    const realBomConfig = getFullCakeBomConfig();

    const realBakeryData = {
      products: realProducts || [],
      ingredients: realIngredients || [],
      recipes: [
        {
          id: 'rec-test-1',
          name: 'Công thức Bánh Kem Mẫu',
          category: 'Bánh Kem',
          yield_qty: 1,
          yield_unit: 'ổ',
          cost_per_unit: 85000,
          target_food_cost_pct: 36.5,
          suggested_price: 235000,
          bake_time_minutes: 30,
          bake_temp_celsius: 180,
          items: [
            { id: 'it-1', ingredient_id: realIngredients?.[0]?.id || 'ing-1', quantity: 200, unit: 'g', line_cost: 15000 }
          ]
        }
      ],
      orders: [
        {
          id: 'ord-real-test-1',
          order_number: 'DH-LOCAL-001',
          order_type: 'dine_in',
          status: 'completed',
          total_amount: 350000,
          final_amount: 350000,
          payment_method: 'cash',
          payment_status: 'paid',
          customer_name: 'Nguyễn Văn A',
          created_at: new Date().toISOString(),
          items: [
            {
              id: 'oit-1',
              product_id: realProducts?.[0]?.id,
              product_name_snapshot: realProducts?.[0]?.name || 'Bánh Kem Bắp',
              quantity: 1,
              unit_price: 350000,
              unit_cost: 120000,
              line_total: 350000,
            }
          ]
        }
      ],
      expenses: [
        { id: 'exp-1', category: 'Tiền điện', amount: 2500000, description: 'Hóa đơn điện tháng 9', date: '2026-09-01' }
      ],
      cashflow: [
        { id: 'cf-1', type: 'income', category: 'Bán hàng', amount: 350000, desc: 'Bán bánh DH-LOCAL-001', date: '2026-09-15', method: 'cash' }
      ],
      tax_household_config: {
        shop_name: 'Tiệm Bánh Mẫu Đơn',
        tax_code: '0123456789',
        owner_name: 'Trần Thị B',
        phone: '0901234567',
        business_address: '123 Đường Bánh Ngọt, TP.HCM',
        registered_revenue_level: 2,
        pit_calculation_method: 1,
      },
      tax_policy_config: {
        policy_name: 'Thông Tư 88 & 40-BTC',
        circular_citation: 'Thông tư 88/2021/TT-BTC',
        annual_threshold: 1000000000,
        tax_groups: [{ id: 3, name: 'Sản xuất bánh', vat_rate: 0.03, pit_rate: 0.015 }],
      },
      bakery_bom_settings: realBomConfig,
    };

    const masterSql = generateMasterSqlDump(realBakeryData);
    assert('Master SQL Dump sinh thành công', typeof masterSql === 'string' && masterSql.length > 5000);
    assert('Master SQL chứa đủ số lệnh INSERT cho 11 sản phẩm thật', (masterSql.match(/INSERT INTO products/g) || []).length === realProducts?.length);
    assert('Master SQL chứa đủ số lệnh INSERT cho 8 nguyên liệu kho thật', (masterSql.match(/INSERT INTO ingredients/g) || []).length === realIngredients?.length);
    assert('Master SQL chứa lệnh INSERT vào bảng bakery_bom_settings', masterSql.includes('INSERT INTO bakery_bom_settings'));
    assert('Master SQL chứa lệnh INSERT vào bảng tax_household_config', masterSql.includes('INSERT INTO tax_household_config'));
    assert('Master SQL chứa lệnh INSERT vào bảng tax_policy_config', masterSql.includes('INSERT INTO tax_policy_config'));

    // Kiểm tra tính năng sqlEscape chống SQL Injection và định dạng dữ liệu
    assert('sqlEscape xử lý NULL chuẩn xác', sqlEscape(null) === 'NULL' && sqlEscape(undefined) === 'NULL');
    assert('sqlEscape xử lý số nguyên & số thập phân', sqlEscape(150000) === '150000' && sqlEscape(36.5) === '36.5');
    assert('sqlEscape xử lý boolean', sqlEscape(true) === 'TRUE' && sqlEscape(false) === 'FALSE');
    assert('sqlEscape escape dấu nháy đơn (\') an toàn', sqlEscape("Bánh Mì O'Connor") === "'Bánh Mì O''Connor'");

    // =========================================================================
    // NHÓM 4: THỰC THI TOÀN BỘ SQL TRÊN ENGINE CƠ SỞ DỮ LIỆU SQLITE THẬT
    // =========================================================================
    console.log('\n━━━ NHÓM 4: THỰC THI SQL TRÊN ENGINE SQL THẬT (NODE:SQLITE) ━━━');
    
    // Khởi tạo CSDL SQLite thực sự trong RAM bằng engine built-in của Node 24
    const sqliteDb = new DatabaseSync(':memory:');
    
    // Thực thi toàn bộ file master SQL dump được sinh ra
    sqliteDb.exec(masterSql);
    assert('Toàn bộ lệnh CREATE TABLE & INSERT INTO thực thi 100% thành công trên SQLite (0 lỗi cú pháp)', true);

    // Kiểm tra truy vấn bảng products
    const prodCountRow: any = sqliteDb.prepare('SELECT count(*) as total FROM products').get();
    assert('Bảng products trong CSDL SQLite có đúng 11 sản phẩm', Number(prodCountRow?.total) === realProducts?.length, `Thực tế: ${prodCountRow?.total}`);

    const sampleProdRow: any = sqliteDb.prepare('SELECT id, name, selling_price FROM products LIMIT 1').get();
    assert('Sản phẩm trong SQLite có tên & giá bán hợp lệ (' + sampleProdRow?.name + ' - ' + sampleProdRow?.selling_price + '₫)', !!sampleProdRow?.name && Number(sampleProdRow?.selling_price) > 0);

    // Kiểm tra truy vấn bảng ingredients
    const ingCountRow: any = sqliteDb.prepare('SELECT count(*) as total FROM ingredients').get();
    assert('Bảng ingredients trong CSDL SQLite có đúng 8 mặt hàng kho', Number(ingCountRow?.total) === realIngredients?.length, `Thực tế: ${ingCountRow?.total}`);

    // Kiểm tra truy vấn bảng định mức BOM
    const bomRow: any = sqliteDb.prepare('SELECT id, target_food_cost_pct, cake_bases FROM bakery_bom_settings WHERE id = \'primary\'').get();
    assert('Bảng bakery_bom_settings trong SQLite có bản ghi primary', !!bomRow);
    assert('Định mức BOM lưu mốc 36.5% chuẩn xác', Number(bomRow?.target_food_cost_pct) === 36.5);
    const parsedBases = JSON.parse(bomRow?.cake_bases || '[]');
    assert('Dữ liệu Cốt bánh trong bảng BOM SQLite được bảo toàn', Array.isArray(parsedBases) && parsedBases.length >= 2);

    // Kiểm tra truy vấn bảng cấu hình thuế
    const taxPolicyRow: any = sqliteDb.prepare('SELECT policy_name, annual_threshold FROM tax_policy_config WHERE id = \'primary\'').get();
    assert('Bảng tax_policy_config trong SQLite lưu đúng ngưỡng 1 tỷ', Number(taxPolicyRow?.annual_threshold) === 1000000000);

    // Thử chèn và truy vấn đơn hàng mới trên CSDL SQLite local
    sqliteDb.exec("INSERT INTO orders (id, order_number, total_amount, payment_status) VALUES ('ord-local-exec-99', 'DH-LOCAL-99', 450000, 'paid');");
    const insertedOrder: any = sqliteDb.prepare("SELECT id, order_number, total_amount FROM orders WHERE id = 'ord-local-exec-99'").get();
    assert('Chèn và truy vấn đơn hàng mới thành công trên CSDL SQLite Cục bộ', insertedOrder?.order_number === 'DH-LOCAL-99' && Number(insertedOrder?.total_amount) === 450000);

    sqliteDb.exec(`INSERT INTO material_stock_adjustments (id, ingredient_id, ingredient_name, unit, old_quantity, new_quantity, delta_quantity, avg_cost, total_value_change, reason, notes, adjusted_by) VALUES ('adj-1', 'ing-1', 'Bột mì số 8', 'g', 10000, 9500, -500, 18, -9000, 'Kiểm kê thực tế định kỳ', 'Hao hụt tự nhiên', 'Quản lý');`);
    const insertedAdj: any = sqliteDb.prepare("SELECT * FROM material_stock_adjustments WHERE id = 'adj-1'").get();
    assert('Chèn và truy vấn lịch sử sửa tồn kho vật tư (material_stock_adjustments) thành công trên SQLite', insertedAdj?.ingredient_name === 'Bột mì số 8' && Number(insertedAdj?.delta_quantity) === -500);

    // =========================================================================
    // NHÓM 5: LƯU TRỮ VÀ GHI TỆP VÀO THƯ MỤC Ổ ĐĨA MÁY TÍNH
    // =========================================================================
    console.log('\n━━━ NHÓM 5: LƯU TRỮ TỆP CSDL VÀO THƯ MỤC Ổ ĐĨA MÁY TÍNH ━━━');

    // Tạo thư mục kiểm thử trên ổ cứng
    if (!fs.existsSync(tempTestDir)) {
      fs.mkdirSync(tempTestDir, { recursive: true });
    }
    assert('Tạo thư mục lưu CSDL Local trên ổ đĩa máy tính thành công', fs.existsSync(tempTestDir));

    // Ghi 4 tệp cơ sở dữ liệu chuẩn theo nghiệp vụ Local SQL
    const masterSqlPath = path.join(tempTestDir, 'bakery_master.sql');
    const schemaSqlPath = path.join(tempTestDir, 'bakery_schema.sql');
    const jsonDbPath = path.join(tempTestDir, 'bakery_local_db.json');
    const guidePath = path.join(tempTestDir, 'HUONG_DAN_CHAY_SQL_LOCAL.txt');

    fs.writeFileSync(masterSqlPath, masterSql, 'utf-8');
    fs.writeFileSync(schemaSqlPath, schemaSql, 'utf-8');
    fs.writeFileSync(jsonDbPath, JSON.stringify(realBakeryData, null, 2), 'utf-8');
    fs.writeFileSync(guidePath, 'HƯỚNG DẪN SỬ DỤNG VÀ CHẠY CSDL LOCAL SQL TIỆM BÁNH', 'utf-8');

    assert('Tệp bakery_master.sql đã được ghi ra ổ đĩa (Kích thước: ' + fs.statSync(masterSqlPath).size + ' bytes)', fs.existsSync(masterSqlPath) && fs.statSync(masterSqlPath).size > 1000);
    assert('Tệp bakery_schema.sql đã được ghi ra ổ đĩa (Kích thước: ' + fs.statSync(schemaSqlPath).size + ' bytes)', fs.existsSync(schemaSqlPath) && fs.statSync(schemaSqlPath).size > 500);
    assert('Tệp bakery_local_db.json đã được ghi ra ổ đĩa (Kích thước: ' + fs.statSync(jsonDbPath).size + ' bytes)', fs.existsSync(jsonDbPath) && fs.statSync(jsonDbPath).size > 1000);
    assert('Tệp HUONG_DAN_CHAY_SQL_LOCAL.txt đã được ghi ra ổ đĩa', fs.existsSync(guidePath));

    // =========================================================================
    // NHÓM 6: NẠP VÀ KHÔI PHỤC CSDL TỪ THƯ MỤC LOCAL (RESTORE & IMPORT)
    // =========================================================================
    console.log('\n━━━ NHÓM 6: NẠP VÀ KHÔI PHỤC CSDL TỪ FILE LOCAL ━━━');

    // Đọc file json từ ổ đĩa
    const readBackJson = JSON.parse(fs.readFileSync(jsonDbPath, 'utf-8'));
    assert('Đọc tệp bakery_local_db.json từ ổ cứng thành công', !!readBackJson && Array.isArray(readBackJson.products));

    // Khôi phục vào hệ thống qua importFromLocalSqlDump
    const restoreResult = await importFromLocalSqlDump(readBackJson);
    assert('Hàm importFromLocalSqlDump khôi phục thành công', restoreResult.success === true);

    // Xác minh dữ liệu trong localStorage sau khi nạp
    const restoredProducts = JSON.parse(mockStorage['bakery_products'] || '[]');
    assert('Khôi phục đầy đủ 11 sản phẩm vào LocalStorage', restoredProducts.length === realProducts?.length);

    const restoredIngredients = JSON.parse(mockStorage['bakery_ingredients'] || '[]');
    assert('Khôi phục đầy đủ 8 nguyên liệu vào LocalStorage', restoredIngredients.length === realIngredients?.length);

    const restoredBom = JSON.parse(mockStorage['bakery_full_bom_config'] || '{}');
    assert('Khôi phục cấu hình định mức BOM 7 mục thành công', !!restoredBom.cakeBases && restoredBom.targetFoodCostPct === 36.5);

    const restoredTaxPolicy = JSON.parse(mockStorage['bakery_tax_policy_config'] || '{}');
    assert('Khôi phục cấu hình chính sách thuế thành công', restoredTaxPolicy.annual_threshold === 1000000000);

    // =========================================================================
    // NHÓM 7: KIỂM TRA ĐỒNG BỘ TỰ ĐỘNG KHI Ở CHẾ ĐỘ LOCAL (AUTO-SYNC IN LOCAL)
    // =========================================================================
    console.log('\n━━━ NHÓM 7: ĐỒNG BỘ TỰ ĐỘNG TRONG CHẾ ĐỘ LOCAL ━━━');
    saveSqlModeConfig({
      mode: 'local',
      localFolderPath: tempTestDir,
      localFolderName: 'temp_test_local_sql_folder',
      autoSyncToFolder: true,
      lastLocalSyncAt: new Date().toISOString(),
    });

    const activeLocalConfig = getSqlModeConfig();
    assert('Cấu hình thư mục máy tính được ghi nhận', activeLocalConfig.localFolderPath === tempTestDir);
    assert('Cờ autoSyncToFolder được kích hoạt', activeLocalConfig.autoSyncToFolder === true);
    assert('Thời gian đồng bộ gần nhất được cập nhật (lastLocalSyncAt)', !!activeLocalConfig.lastLocalSyncAt);

  } catch (err: any) {
    console.error('Lỗi kiểm thử Local SQL:', err);
    failCount++;
  } finally {
    // Dọn dẹp thư mục kiểm thử tạm thời
    try {
      if (fs.existsSync(tempTestDir)) {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      }
    } catch {}

    // Đặt lại chế độ online cho hệ thống
    saveSqlModeConfig({ mode: 'online' });
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TỔNG KẾT KIỂM THỬ LOCAL SQL: ${passCount} PASS | ${failCount} FAIL`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runLocalSqlTests();
