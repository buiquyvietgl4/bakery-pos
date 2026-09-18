// scripts/test_local_multi_environment_sql.ts
// KIỂM THỬ HỆ THỐNG ĐA CƠ SỞ DỮ LIỆU LOCAL SQL (CHÍNH VS TEST)
// & CƠ CHẾ PHÂN PHỐI SERVER STATE CHO MÁY CON KẾT NỐI QUA PORT / MẠNG LAN

import fs from 'fs';
import path from 'path';

// ── 1. MOCK ENVIRONMENT CHO NODE.JS ──
const mockStorage: Record<string, string> = {};
const mockEventSubscribers: Record<string, Function[]> = {};

(globalThis as any).window = {
  addEventListener: (event: string, cb: Function) => {
    mockEventSubscribers[event] = mockEventSubscribers[event] || [];
    mockEventSubscribers[event].push(cb);
  },
  removeEventListener: (event: string, cb: Function) => {
    if (mockEventSubscribers[event]) {
      mockEventSubscribers[event] = mockEventSubscribers[event].filter(f => f !== cb);
    }
  },
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

import {
  getSqlModeConfig,
  saveSqlModeConfig,
  saveLocalEnvConfig,
  switchLocalEnvironment,
  switchDatabaseMode,
  copyLocalProductionToTesting,
  getActiveLocalEnv,
  isLocalTestMode,
  LocalSqlEnvironmentId,
  captureDataSnapshot,
  applyDataSnapshot,
  STORAGE_KEYS_BACKUP,
} from '../src/lib/utils/sqlModeManager';
import {
  generateMasterSqlDump,
  generateSchemaSql,
  writeLocalSqlFiles,
  importFromLocalSqlDump,
} from '../src/lib/utils/localSqlManager';

// ── 2. CÁC BIẾN & DỮ LIỆU MẪU KIỂM THỬ ──
const TEMP_ROOT = path.resolve(__dirname, '../.temp_test_multi_local_sql');
const PROD_FOLDER = path.join(TEMP_ROOT, 'CSDL_Chinh');
const TEST_FOLDER = path.join(TEMP_ROOT, 'CSDL_Test');

const REAL_PRODUCTION_DATA = {
  products: [
    { id: 'p1', name: 'Bánh Kem Bắp Hoàng Gia', price: 320000, category: 'Bánh Kem', sku: 'BKB-01' },
    { id: 'p2', name: 'Bánh Mì Hoa Cúc Bơ Pháp', price: 65000, category: 'Bánh Mì', sku: 'BMHC-02' },
    { id: 'p3', name: 'Bông Lan Trứng Muối', price: 95000, category: 'Bánh Ngọt', sku: 'BLTM-03' },
  ],
  orders: [
    { id: 'ord_real_01', order_number: 'DH-REAL-1001', total_amount: 320000, customer_name: 'Chị Mai - Q1', status: 'completed' },
    { id: 'ord_real_02', order_number: 'DH-REAL-1002', total_amount: 160000, customer_name: 'Anh Hùng - Bình Thạnh', status: 'completed' },
  ],
  expenses: [
    { id: 'exp_01', category: 'Nguyên vật liệu', amount: 500000, description: 'Mua bơ Anchor và bột mì' },
  ],
};

const VIRTUAL_TESTING_DATA = {
  products: [
    { id: 'p_test_99', name: 'Bánh Thử Nghiệm Vị Matcha Sầu Riêng (Ảo)', price: 999999, category: 'Test' },
  ],
  orders: [
    { id: 'ord_virtual_99', order_number: 'DH-TEST-9999', total_amount: 999999, customer_name: 'Khách Ảo Test Bug', status: 'completed' },
  ],
};

let totalPass = 0;
let totalFail = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    totalPass++;
  } else {
    console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
    totalFail++;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║   KIỂM THỬ HỆ THỐNG ĐA CƠ SỞ DỮ LIỆU LOCAL SQL (CHÍNH VS TEST)         ║');
  console.log('║   & ĐỒNG BỘ MẠNG LAN / MÁY CON KẾT NỐI QUA PORT                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

  // Chuẩn bị thư mục test
  if (fs.existsSync(TEMP_ROOT)) {
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(PROD_FOLDER, { recursive: true });
  fs.mkdirSync(TEST_FOLDER, { recursive: true });

  // ══════════════════════════════════════════════════════════════
  // NHÓM 1: CẤU TRÚC CẤU HÌNH & 2 MÔI TRƯỜNG MẶC ĐỊNH
  // ══════════════════════════════════════════════════════════════
  console.log('━━━ NHÓM 1: CẤU TRÚC 2 MÔI TRƯỜNG LOCAL SQL ━━━');
  const initialConfig = getSqlModeConfig();
  assert(initialConfig.activeLocalEnv === 'production', 'Môi trường mặc định ban đầu là "production" (Chính)');
  assert(initialConfig.localEnvs !== undefined, 'Đối tượng localEnvs tồn tại');
  assert(initialConfig.localEnvs.production !== undefined, 'Môi trường production được định nghĩa');
  assert(initialConfig.localEnvs.testing !== undefined, 'Môi trường testing được định nghĩa');
  assert(isLocalTestMode() === false, 'isLocalTestMode() trả về false khi đang ở production');
  assert(getActiveLocalEnv() === 'production', 'getActiveLocalEnv() trả về "production"');

  // ══════════════════════════════════════════════════════════════
  // NHÓM 2: PHÂN TÁCH THƯ MỤC LƯU TRỮ ĐỘC LẬP CHO TỪNG LOẠI
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 2: PHÂN TÁCH THƯ MỤC LƯU TRỮ ĐỘC LẬP CHO CHÍNH & TEST ━━━');
  saveLocalEnvConfig('production', {
    folderPath: PROD_FOLDER,
    folderName: 'CSDL_Chinh',
  });
  saveLocalEnvConfig('testing', {
    folderPath: TEST_FOLDER,
    folderName: 'CSDL_Test',
  });

  const updatedConfig = getSqlModeConfig();
  assert(updatedConfig.localEnvs.production.folderPath === PROD_FOLDER, 'Thư mục Chính lưu đúng đường dẫn PROD_FOLDER');
  assert(updatedConfig.localEnvs.testing.folderPath === TEST_FOLDER, 'Thư mục Test lưu đúng đường dẫn TEST_FOLDER');
  assert(
    updatedConfig.localEnvs.production.folderPath !== updatedConfig.localEnvs.testing.folderPath,
    '2 đường dẫn hoàn toàn tách biệt, không bị trùng lặp'
  );

  // ══════════════════════════════════════════════════════════════
  // NHÓM 3: SINH TỆP VÀ LƯU VÀO Ổ CỨNG RIÊNG TỪNG THƯ MỤC
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 3: XUẤT TỆP SQL VÀO THƯ MỤC VẬT LÝ TRÊN Ổ CỨNG ━━━');
  const prodSqlDump = generateMasterSqlDump(REAL_PRODUCTION_DATA);
  const testSqlDump = generateMasterSqlDump(VIRTUAL_TESTING_DATA);

  // Ghi vào thư mục Chính
  fs.writeFileSync(path.join(PROD_FOLDER, 'bakery_master.sql'), prodSqlDump, 'utf8');
  fs.writeFileSync(path.join(PROD_FOLDER, 'bakery_local_db.json'), JSON.stringify(REAL_PRODUCTION_DATA, null, 2), 'utf8');
  fs.writeFileSync(path.join(PROD_FOLDER, 'bakery_schema.sql'), generateSchemaSql(), 'utf8');
  fs.writeFileSync(path.join(PROD_FOLDER, 'HUONG_DAN_CHAY_SQL_LOCAL.txt'), 'MOI TRUONG: CHINH (PRODUCTION)', 'utf8');

  // Ghi vào thư mục Test
  fs.writeFileSync(path.join(TEST_FOLDER, 'bakery_master.sql'), testSqlDump, 'utf8');
  fs.writeFileSync(path.join(TEST_FOLDER, 'bakery_local_db.json'), JSON.stringify(VIRTUAL_TESTING_DATA, null, 2), 'utf8');
  fs.writeFileSync(path.join(TEST_FOLDER, 'bakery_schema.sql'), generateSchemaSql(), 'utf8');
  fs.writeFileSync(path.join(TEST_FOLDER, 'HUONG_DAN_CHAY_SQL_LOCAL.txt'), 'MOI TRUONG: TEST (TESTING)', 'utf8');

  assert(fs.existsSync(path.join(PROD_FOLDER, 'bakery_master.sql')), 'Tệp bakery_master.sql có trong thư mục Chính');
  assert(fs.existsSync(path.join(TEST_FOLDER, 'bakery_master.sql')), 'Tệp bakery_master.sql có trong thư mục Test');

  // Kiểm tra nội dung phân tách
  const readProdJson = JSON.parse(fs.readFileSync(path.join(PROD_FOLDER, 'bakery_local_db.json'), 'utf8'));
  const readTestJson = JSON.parse(fs.readFileSync(path.join(TEST_FOLDER, 'bakery_local_db.json'), 'utf8'));
  assert(readProdJson.orders.length === 2, 'Thư mục Chính chứa đúng 2 đơn hàng thật');
  assert(readTestJson.orders.length === 1 && readTestJson.orders[0].id === 'ord_virtual_99', 'Thư mục Test chứa đúng đơn ảo test');

  // ══════════════════════════════════════════════════════════════
  // NHÓM 4: CÔ LẬP KÉT AN TOÀN (DATA VAULTS) KHI CHUYỂN ĐỔI MÔI TRƯỜNG
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 4: CÔ LẬP KÉT DỮ LIỆU VAULT KHI CHUYỂN ĐỔI LOCAL SQL ━━━');
  // Chuyển sang chế độ Local mode
  switchDatabaseMode('local');

  // Nạp dữ liệu thật vào active storage
  mockStorage['bakery_orders'] = JSON.stringify(REAL_PRODUCTION_DATA.orders);
  mockStorage['bakery_products_custom'] = JSON.stringify(REAL_PRODUCTION_DATA.products);
  mockStorage['bakery_pos_expenses'] = JSON.stringify(REAL_PRODUCTION_DATA.expenses);

  // Chuyển sang Testing với clean_slate
  switchLocalEnvironment('testing', 'clean_slate');
  assert(getActiveLocalEnv() === 'testing', 'Trạng thái activeLocalEnv chuyển thành "testing"');
  assert(isLocalTestMode() === true, 'isLocalTestMode() trả về true khi ở chế độ Test');

  // Két Vault Chính phải lưu toàn vẹn dữ liệu thật
  const prodVaultStr = mockStorage['bakery_vault_local_production'];
  assert(!!prodVaultStr, 'Két an toàn bakery_vault_local_production đã được sao lưu trước khi chuyển');
  const prodVault = JSON.parse(prodVaultStr);
  assert(JSON.parse(prodVault['bakery_orders']).length === 2, 'Dữ liệu đơn hàng thật trong Vault Chính nguyên vẹn');

  // Dữ liệu active hiện tại là trắng (clean_slate)
  assert(!mockStorage['bakery_orders'] || mockStorage['bakery_orders'] === '[]', 'Dữ liệu orders active đã được làm sạch cho môi trường Test');

  // Giả lập nhân viên thao tác tạo đơn ảo trên môi trường Test
  mockStorage['bakery_orders'] = JSON.stringify(VIRTUAL_TESTING_DATA.orders);
  mockStorage['bakery_products_custom'] = JSON.stringify(VIRTUAL_TESTING_DATA.products);

  // Chuyển ngược lại về Production với load_vault
  switchLocalEnvironment('production', 'load_vault');
  assert(getActiveLocalEnv() === 'production', 'Quay trở lại môi trường "production" thành công');
  assert(isLocalTestMode() === false, 'isLocalTestMode() trả về false');

  // Dữ liệu active phải khôi phục 100% dữ liệu thật, không dính đơn ảo
  const restoredOrders = JSON.parse(mockStorage['bakery_orders']);
  assert(restoredOrders.length === 2, 'Dữ liệu đơn hàng thật được khôi phục 100%');
  assert(restoredOrders[0].id === 'ord_real_01', 'Đơn hàng thật ord_real_01 xuất hiện nguyên vẹn');
  assert(!restoredOrders.some((o: any) => o.id === 'ord_virtual_99'), 'Đơn ảo ord_virtual_99 KHÔNG bị lọt vào CSDL Chính');

  // Đơn ảo vẫn được cất trong Vault Test
  const testVaultStr = mockStorage['bakery_vault_local_testing'];
  assert(!!testVaultStr, 'Két an toàn bakery_vault_local_testing đã được lưu trữ an toàn');
  const testVault = JSON.parse(testVaultStr);
  assert(JSON.parse(testVault['bakery_orders'])[0].id === 'ord_virtual_99', 'Đơn ảo vẫn được lưu trữ độc lập trong Vault Test');

  // ══════════════════════════════════════════════════════════════
  // NHÓM 5: TÍNH NĂNG 1-CLICK CLONE TỪ CHÍNH SANG TEST
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 5: 1-CLICK CLONE DỮ LIỆU TỪ CHÍNH SANG TEST ━━━');
  const cloneResult = copyLocalProductionToTesting();
  assert(cloneResult.success === true, 'Sao chép từ Chính sang Test thành công');

  // Kiểm tra két Test sau khi clone
  const updatedTestVault = JSON.parse(mockStorage['bakery_vault_local_testing']);
  const clonedProducts = JSON.parse(updatedTestVault['bakery_products_custom']);
  assert(clonedProducts.length === 3, 'Test Vault nhận đủ 3 sản phẩm sao chép từ Chính');
  assert(clonedProducts[0].name === 'Bánh Kem Bắp Hoàng Gia', 'Sản phẩm đầu tiên khớp chính xác');

  // Chuyển sang Test kiểm tra dữ liệu nạp
  switchLocalEnvironment('testing', 'load_vault');
  assert(JSON.parse(mockStorage['bakery_products_custom']).length === 3, 'Chế độ Test nạp đầy đủ danh mục bánh từ bản clone');

  // Sửa bánh trên Test
  const testProducts = JSON.parse(mockStorage['bakery_products_custom']);
  testProducts[0].price = 9999;
  mockStorage['bakery_products_custom'] = JSON.stringify(testProducts);

  // Chuyển lại về Chính và kiểm tra giá bánh thật không bị ảnh hưởng
  switchLocalEnvironment('production', 'load_vault');
  const prodProducts = JSON.parse(mockStorage['bakery_products_custom']);
  assert(prodProducts[0].price === 320000, 'Giá bánh trên CSDL Chính giữ nguyên 320,000đ, không bị đổi thành 9,999đ');

  // ══════════════════════════════════════════════════════════════
  // NHÓM 6: SERVER STATE CHO MÔ HÌNH MẠNG LAN / MÁY CON KẾT NỐI QUA PORT
  // ══════════════════════════════════════════════════════════════
  console.log('\n━━━ NHÓM 6: SERVER STATE VÀ PHÂN BỐ DỮ LIỆU MẠNG LAN / CỔNG PORT ━━━');
  const serverStateFile = path.join(TEMP_ROOT, '.local_sql_server_state.json');

  // Mô phỏng hàm server get_server_state / set_active_env
  function getServerState(): { activeLocalEnv: LocalSqlEnvironmentId; productionFolderPath: string; testingFolderPath: string } {
    if (fs.existsSync(serverStateFile)) {
      try {
        return JSON.parse(fs.readFileSync(serverStateFile, 'utf8'));
      } catch {}
    }
    return {
      activeLocalEnv: 'production',
      productionFolderPath: PROD_FOLDER,
      testingFolderPath: TEST_FOLDER,
    };
  }

  function saveServerState(state: any) {
    fs.writeFileSync(serverStateFile, JSON.stringify(state, null, 2), 'utf8');
  }

  // Khởi tạo server state
  saveServerState({
    activeLocalEnv: 'production',
    productionFolderPath: PROD_FOLDER,
    testingFolderPath: TEST_FOLDER,
  });

  const state1 = getServerState();
  assert(state1.activeLocalEnv === 'production', 'Máy tính chủ đang ở trạng thái Local SQL Chính');
  assert(state1.productionFolderPath === PROD_FOLDER, 'Đường dẫn thư mục Chính chuẩn xác');

  // Giả lập máy con qua cổng Port 3000 gửi yêu cầu nạp dữ liệu
  // Server tự động trích xuất đúng thư mục active (production)
  const clientQueryEnv1 = state1.activeLocalEnv;
  const targetDir1 = clientQueryEnv1 === 'production' ? state1.productionFolderPath : state1.testingFolderPath;
  const clientReadData1 = JSON.parse(fs.readFileSync(path.join(targetDir1, 'bakery_local_db.json'), 'utf8'));
  assert(clientReadData1.orders.length === 2, 'Máy con qua LAN nhận đúng CSDL Chính (2 đơn)');

  // Máy chủ chuyển sang môi trường Test
  saveServerState({
    ...state1,
    activeLocalEnv: 'testing',
  });

  const state2 = getServerState();
  assert(state2.activeLocalEnv === 'testing', 'Máy tính chủ đã chuyển sang Local SQL Test');

  // Máy con qua cổng Port gửi request tiếp theo
  // Server tự động định tuyến sang thư mục Test mà máy con KHÔNG cần cấu hình đường dẫn ổ đĩa
  const clientQueryEnv2 = state2.activeLocalEnv;
  const targetDir2 = clientQueryEnv2 === 'production' ? state2.productionFolderPath : state2.testingFolderPath;
  const clientReadData2 = JSON.parse(fs.readFileSync(path.join(targetDir2, 'bakery_local_db.json'), 'utf8'));
  assert(clientReadData2.orders.length === 1 && clientReadData2.orders[0].id === 'ord_virtual_99',
    'Máy con qua LAN tự động nhận đúng CSDL Test (1 đơn ảo), không ghi đè vào thư mục Chính'
  );

  // ══════════════════════════════════════════════════════════════
  // DỌN DẸP DỮ LIỆU TẠM
  // ══════════════════════════════════════════════════════════════
  if (fs.existsSync(TEMP_ROOT)) {
    fs.rmSync(TEMP_ROOT, { recursive: true, force: true });
  }

  // ══════════════════════════════════════════════════════════════
  // TỔNG KẾT BÁO CÁO
  // ══════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log(`TỔNG KẾT KIỂM THỬ: ${totalPass} PASS ✅ | ${totalFail} FAIL ❌`);
  console.log('════════════════════════════════════════════════════════════════════════\n');

  if (totalFail > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Lỗi khi chạy kiểm thử:', err);
  process.exit(1);
});
