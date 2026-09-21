// scripts/verify_dual_sql_sync.ts
// Kịch bản kiểm thử toàn diện: Đánh giá rủi ro, kiểm tra tính nhất quán dữ liệu Cloud SQL & Local SQL,
// kiểm tra đồng bộ bếp ra lò, kiểm tra offline sync worker, và kiểm tra bóc tách thuế.

import { BAKERY_DATA_KEYS } from '../src/lib/utils/sqlModeManager';
import { generateSchemaSql } from '../src/lib/utils/localSqlManager';
import { classifyItemTaxGroup, generateS2aLedger } from '../src/lib/utils/taxSync';
import { decodeProductWithMeta, isImportedProduct } from '../src/lib/utils/productManager';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testName}`);
    if (detail) console.error(`     Chi tiết: ${detail}`);
  }
}

async function runAllTests() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU BÀI TEST TOÀN DIỆN HỆ THỐNG: CLOUD SQL & LOCAL SQL');
  console.log('================================================================\n');

  // ── NHÓM 1: KIỂM TRA BỘ KHÓA SNAPSHOT & CHUYỂN ĐỔI 2 CSDL ──
  console.log('📋 [NHÓM 1] Kiểm tra bộ chìa khóa Snapshot & Chuyển đổi 2 CSDL (SQL Parity)');
  
  assert(
    BAKERY_DATA_KEYS.includes('bakery_product_metadata'),
    'BAKERY_DATA_KEYS chứa bakery_product_metadata (Bảo vệ thông tin Bánh Nhập 1.5% & Barcode)'
  );
  assert(
    BAKERY_DATA_KEYS.includes('bakery_deleted_product_ids'),
    'BAKERY_DATA_KEYS chứa bakery_deleted_product_ids (Chống hồi sinh bánh đã xóa khi chuyển đổi)'
  );
  assert(
    BAKERY_DATA_KEYS.includes('bakery_resolved_transfers'),
    'BAKERY_DATA_KEYS chứa bakery_resolved_transfers (Lưu vết giao dịch chuyển khoản đã xử lý)'
  );
  assert(
    BAKERY_DATA_KEYS.includes('bakery_oven_batches'),
    'BAKERY_DATA_KEYS chứa bakery_oven_batches (Lưu vết các mẻ bánh trong lò)'
  );
  assert(
    BAKERY_DATA_KEYS.length >= 38,
    `Tổng số khóa dữ liệu quản lý đạt ${BAKERY_DATA_KEYS.length}/38 khóa cần thiết`
  );

  // ── NHÓM 2: KIỂM TRA SCHEMA PARITY (CẤU TRÚC LOCAL SQL DDL VS SUPABASE) ──
  console.log('\n🏛️ [NHÓM 2] Kiểm tra cấu trúc Schema DDL của Local SQL Dump');
  const ddl = generateSchemaSql();

  assert(ddl.includes('CREATE TABLE IF NOT EXISTS products'), 'DDL có bảng products');
  assert(ddl.includes('product_type TEXT DEFAULT \'produced\''), 'Bảng products có cột product_type');
  assert(ddl.includes('supplier_name TEXT'), 'Bảng products có cột supplier_name');
  assert(ddl.includes('barcode TEXT'), 'Bảng products có cột barcode');
  assert(ddl.includes('stock_qty NUMERIC DEFAULT 10'), 'Bảng products có cột stock_qty');

  assert(ddl.includes('CREATE TABLE IF NOT EXISTS orders'), 'DDL có bảng orders');
  assert(ddl.includes('sync_status TEXT DEFAULT \'synced\''), 'Bảng orders có cột sync_status');
  assert(ddl.includes('is_offline BOOLEAN DEFAULT FALSE'), 'Bảng orders có cột is_offline');

  assert(ddl.includes('CREATE TABLE IF NOT EXISTS order_items'), 'DDL có bảng order_items');
  assert(ddl.includes('line_cost NUMERIC DEFAULT 0'), 'Bảng order_items có cột line_cost');

  assert(ddl.includes('CREATE TABLE IF NOT EXISTS shifts'), 'DDL có bảng shifts');
  assert(ddl.includes('CREATE TABLE IF NOT EXISTS operating_expenses'), 'DDL có bảng operating_expenses');
  assert(ddl.includes('CREATE TABLE IF NOT EXISTS cashflow_transactions'), 'DDL có bảng cashflow_transactions');
  assert(ddl.includes('CREATE TABLE IF NOT EXISTS spoilage_logs'), 'DDL có bảng spoilage_logs');
  assert(ddl.includes('CREATE TABLE IF NOT EXISTS stock_adjustments'), 'DDL có bảng stock_adjustments');
  assert(ddl.includes('CREATE TABLE IF NOT EXISTS accounting_closings'), 'DDL có bảng accounting_closings');

  // ── NHÓM 3: KIỂM TRA BẾP KDS & ĐỒNG BỘ TỒN KHO ──
  console.log('\n🥖 [NHÓM 3] Kiểm tra giải mã sản phẩm và cơ chế nhận diện Bánh Nhập');
  
  // Test decodeProductWithMeta
  const rawSupabaseProd = {
    id: 'prod-test-01',
    name: 'Bánh Mì Hoa Cúc Harrys',
    category: 'Bánh Nhập & Đóng Gói',
    selling_price: 120000,
    base_cost_price: 85000,
    image_url: 'https://example.com/harrys.png#meta=' + encodeURIComponent(JSON.stringify({
      product_type: 'imported',
      supplier_name: 'Harrys France',
      barcode: '8936012345678',
      stock_qty: 25
    }))
  };

  const decoded = decodeProductWithMeta(rawSupabaseProd);
  assert(decoded.product_type === 'imported', 'Giải mã đúng product_type = imported từ hash URL');
  assert(decoded.supplier_name === 'Harrys France', 'Giải mã đúng nhà cung cấp từ hash URL');
  assert(decoded.barcode === '8936012345678', 'Giải mã đúng barcode từ hash URL');
  assert(decoded.image_url === 'https://example.com/harrys.png', 'Tách sạch image_url không chứa rác meta hash');
  assert(isImportedProduct(decoded), 'Hàm isImportedProduct nhận diện chính xác bánh nhập');

  // Test sản phẩm tự sản xuất
  const producedProd = {
    id: 'prod-cake-01',
    name: 'Bánh Kem Bắp Sinh Nhật 20cm',
    category: 'Bánh Kem',
    selling_price: 250000,
    base_cost_price: 90000
  };
  const decodedProduced = decodeProductWithMeta(producedProd);
  assert(decodedProduced.product_type === 'produced', 'Sản phẩm tiệm làm mặc định product_type = produced');
  assert(!isImportedProduct(decodedProduced), 'isImportedProduct trả về FALSE cho bánh tiệm làm');

  // ── NHÓM 4: KIỂM TRA PHÂN LOẠI THUẾ & KẾ TOÁN SỔ S2A ──
  console.log('\n📊 [NHÓM 4] Kiểm tra tính toán thuế & Sổ kế toán S2a (1.5% vs 4.5%)');

  const catalogLookup = new Map<string, any>();
  catalogLookup.set('prod-test-01', decoded);
  catalogLookup.set('prod-cake-01', decodedProduced);

  // Phân loại thuế cho bánh nhập (trả về 1)
  const importedTaxGroup = classifyItemTaxGroup({
    product_id: 'prod-test-01',
    product_name_snapshot: 'Bánh Mì Hoa Cúc Harrys',
    product_type: 'imported'
  }, [decoded, decodedProduced]);
  assert(importedTaxGroup === 1, 'Bánh nhập khẩu được phân loại vào Nhóm 1 (Thuế 1.5%)');

  // Phân loại thuế cho bánh tiệm làm (trả về 3)
  const producedTaxGroup = classifyItemTaxGroup({
    product_id: 'prod-cake-01',
    product_name_snapshot: 'Bánh Kem Bắp',
    product_type: 'produced'
  }, [decoded, decodedProduced]);
  assert(producedTaxGroup === 3, 'Bánh tiệm làm được phân loại vào Nhóm 3 (Thuế 4.5%)');

  // Thử nghiệm tạo Sổ S2a với đơn hàng hỗn hợp
  const testOrders = [
    {
      id: 'ord-001',
      order_number: 'BK-TEST-001',
      status: 'completed',
      created_at: '2026-09-21T09:00:00Z',
      total_amount: 370000,
      subtotal: 370000,
      items: [
        {
          product_id: 'prod-test-01',
          product_name_snapshot: 'Bánh Mì Hoa Cúc Harrys',
          quantity: 1,
          unit_price: 120000,
          product_type: 'imported'
        },
        {
          product_id: 'prod-cake-01',
          product_name_snapshot: 'Bánh Kem Bắp Sinh Nhật 20cm',
          quantity: 1,
          unit_price: 250000,
          product_type: 'produced'
        }
      ]
    }
  ];

  const s2aReport = generateS2aLedger(testOrders, undefined, [decoded, decodedProduced]);
  assert(s2aReport.rows.length === 2, `Sổ S2a tự động bóc tách đơn thành 2 dòng kê khai (thực tế: ${s2aReport.rows.length} dòng)`);
  
  const g1Summary = s2aReport.summary.find((g) => g.group_id === 1);
  const g3Summary = s2aReport.summary.find((g) => g.group_id === 3);

  assert(g1Summary?.total_revenue === 120000, `Doanh thu Nhóm 1 (Bánh nhập 1.5%) = 120,000₫ (thực tế: ${g1Summary?.total_revenue}₫)`);
  assert(g3Summary?.total_revenue === 250000, `Doanh thu Nhóm 3 (Bánh tiệm 4.5%) = 250,000₫ (thực tế: ${g3Summary?.total_revenue}₫)`);
  
  // Thuế Nhóm 1: 120,000 * 1.5% = 1,800₫ (GTGT 1% = 1,200₫, TNCN 0.5% = 600₫)
  const expectedTaxG1 = 120000 * 0.015;
  assert(g1Summary?.total_tax === expectedTaxG1, `Thuế Nhóm 1 tính chuẩn 1,800₫ (thực tế: ${g1Summary?.total_tax}₫)`);

  // Thuế Nhóm 3: 250,000 * 4.5% = 11,250₫ (GTGT 3% = 7,500₫, TNCN 1.5% = 3,750₫)
  const expectedTaxG3 = 250000 * 0.045;
  assert(g3Summary?.total_tax === expectedTaxG3, `Thuế Nhóm 3 tính chuẩn 11,250₫ (thực tế: ${g3Summary?.total_tax}₫)`);

  // ── NHÓM 5: KIỂM TRA BACKGROUND OFFLINE SYNC WORKER MODULE ──
  console.log('\n🔄 [NHÓM 5] Kiểm tra module Background Offline Sync Worker');
  const workerModule = await import('../src/lib/supabase/offlineSyncWorker');
  assert(typeof workerModule.offlineSyncWorker !== 'undefined', 'OfflineSyncWorker export thành công');
  assert(typeof workerModule.offlineSyncWorker.start === 'function', 'OfflineSyncWorker có hàm start()');
  assert(typeof workerModule.offlineSyncWorker.stop === 'function', 'OfflineSyncWorker có hàm stop()');
  assert(typeof workerModule.offlineSyncWorker.flushPendingOrders === 'function', 'OfflineSyncWorker có hàm flushPendingOrders()');

  // ── TỔNG KẾT BÀI KIỂM THỬ ──
  console.log('\n================================================================');
  console.log(`🏁 TỔNG KẾT: Đạt ${passedTests}/${totalTests} bài kiểm tra (${failedTests === 0 ? '100% THÀNH CÔNG' : 'CÓ LỖI'})`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi ngoại lệ khi chạy test suite:', err);
  process.exit(1);
});
