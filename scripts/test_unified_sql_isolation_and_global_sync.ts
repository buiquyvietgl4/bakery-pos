// scripts/test_unified_sql_isolation_and_global_sync.ts
// BÀI TEST TOÀN DIỆN KIỂM CHỨNG:
// 1. TÁCH BIỆT DỮ LIỆU TUYỆT ĐỐI GIỮA 4 MÔI TRƯỜNG SQL (ZERO CROSS-SYNC / NO DATA MIXING)
// 2. KHI ĐỔI SQL CHÍNH, TỰ ĐỘNG ĐỒNG BỘ CHO MỌI THIẾT BỊ DÙNG CHUNG LINK APP

import {
  switchUnifiedSqlEnv,
  getActiveUnifiedSqlEnv,
  getActiveUnifiedSqlEnvInfo,
  UNIFIED_SQL_ENVS,
  UnifiedSqlEnvId,
} from '../src/lib/utils/unifiedSqlManager';

import {
  getMultiSqlConfig,
  getActiveProfile,
  saveDatabaseProfile,
  saveGlobalProductionSql,
  fetchAndApplyGlobalSqlProfile,
  isReconcileLocked,
  clearProfileLocalData,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_PRODUCTION_KEY,
  STORAGE_KEY_MULTI_SQL_CONFIG,
  STORAGE_KEY_PROFILE_VAULT_PREFIX,
  STORAGE_KEY_LAST_GLOBAL_SQL_SYNC,
  DatabaseProfile,
} from '../src/lib/supabase/databaseProfileManager';

import {
  getSqlModeConfig,
  isLocalMode,
  setSqlMode,
  setLocalSqlEnv,
  STORAGE_KEY_SQL_MODE,
} from '../src/lib/utils/sqlModeManager';

// ============================================================================
// HỆ THỐNG MÔ PHỎNG ĐA THIẾT BỊ (MULTI-DEVICE LOCALSTORAGE SIMULATOR)
// ============================================================================
class SimulatedBrowserStorage {
  public store: Record<string, string> = {};

  getItem(k: string): string | null {
    return this.store[k] ?? null;
  }
  setItem(k: string, v: string): void {
    this.store[k] = String(v);
  }
  removeItem(k: string): void {
    delete this.store[k];
  }
  clear(): void {
    this.store = {};
  }
}

// 3 Thiết bị mô phỏng thực tế:
const deviceAdmin = new SimulatedBrowserStorage();   // Thiết bị 1: Máy tính Admin
const deviceCashier = new SimulatedBrowserStorage(); // Thiết bị 2: Điện thoại / POS Thu ngân
const deviceKitchen = new SimulatedBrowserStorage(); // Thiết bị 3: Máy tính bảng Bếp

let currentDeviceStorage = deviceAdmin;

function setDeviceContext(storage: SimulatedBrowserStorage) {
  currentDeviceStorage = storage;
}

// Giả lập mock server in-memory cho API /api/system/database-profile
let serverDatabaseProfileState: {
  url: string;
  anonKey: string;
  activeProfileId: string;
  name: string;
  updatedAt: string;
} = {
  url: DEFAULT_PRODUCTION_URL,
  anonKey: DEFAULT_PRODUCTION_KEY,
  activeProfileId: 'production',
  name: 'CSDL Chính (Vận Hành)',
  updatedAt: new Date().toISOString(),
};

// Gán môi trường trình duyệt cho Node.js
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: {
    getItem: (k: string) => currentDeviceStorage.getItem(k),
    setItem: (k: string, v: string) => currentDeviceStorage.setItem(k, v),
    removeItem: (k: string) => currentDeviceStorage.removeItem(k),
    clear: () => currentDeviceStorage.clear(),
  },
  navigator: { onLine: true },
};
(globalThis as any).localStorage = (globalThis as any).window.localStorage;

// Mock global fetch để trỏ về mock server API
global.fetch = async (input: any, init?: any) => {
  const urlStr = typeof input === 'string' ? input : input?.url || '';

  if (urlStr.includes('/api/system/database-profile')) {
    if (init?.method === 'POST') {
      try {
        const body = JSON.parse(init.body);
        serverDatabaseProfileState = {
          url: body.url || DEFAULT_PRODUCTION_URL,
          anonKey: body.anonKey || DEFAULT_PRODUCTION_KEY,
          activeProfileId: body.activeProfileId || 'production',
          name: body.name || 'CSDL Chính (Vận Hành)',
          updatedAt: new Date().toISOString(),
        };
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: serverDatabaseProfileState }),
        } as any;
      } catch {
        return { ok: false, status: 400, json: async () => ({ success: false }) } as any;
      }
    } else {
      // GET
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: serverDatabaseProfileState }),
      } as any;
    }
  }

  // Fallback cho các URL khác
  return {
    ok: true,
    status: 200,
    json: async () => ({ success: true }),
  } as any;
};

// ============================================================================
// HỆ THỐNG GHI NHẬN KẾT QUẢ TEST
// ============================================================================
interface TestCaseResult {
  part: string;
  testId: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
  notes?: string;
}

const testResults: TestCaseResult[] = [];

function recordResult(
  part: string,
  testId: string,
  name: string,
  expected: string,
  actual: string,
  passed: boolean,
  notes?: string
) {
  testResults.push({ part, testId, name, expected, actual, passed, notes });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] [${part}] ${testId} - ${name}`);
  console.log(`   - Kỳ vọng : ${expected}`);
  console.log(`   - Thực tế : ${actual}`);
  if (notes) console.log(`   - Chi tiết: ${notes}`);
}

// ============================================================================
// BẮT ĐẦU CHẠY KIỂM THỬ
// ============================================================================
async function runAllTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 BẮT ĐẦU BÀI TEST TOÀN DIỆN: CÁCH LY 4 CSDL & ĐỒNG BỘ TOÀN HỆ THỐNG');
  console.log('='.repeat(80) + '\n');

  // ==========================================================================
  // PHẦN 1: KIỂM CHỨNG TÁCH BIỆT DỮ LIỆU TUYỆT ĐỐI GIỮA 4 MÔI TRƯỜNG SQL
  // ==========================================================================
  console.log('--- PHẦN 1: KIỂM CHỨNG TÁCH BIỆT 4 MÔI TRƯỜNG SQL (ZERO CROSS-SYNC) ---\n');
  setDeviceContext(deviceAdmin);
  deviceAdmin.clear();

  // Test 1.1: Khởi tạo dữ liệu thực tế tại Cloud SQL Chính
  const realOrders = [
    { id: 'ORD-REAL-001', code: 'DH-001', total: 250000, items: ['Bánh Mì Hoa Cúc', 'Bánh Kem Dâu'] },
    { id: 'ORD-REAL-002', code: 'DH-002', total: 180000, items: ['Bánh Croissant Bơ'] },
  ];
  const realProducts = [
    { id: 'PROD-01', name: 'Bánh Mì Hoa Cúc', price: 120000 },
    { id: 'PROD-02', name: 'Bánh Croissant Bơ', price: 45000 },
  ];

  deviceAdmin.setItem('bakery_orders', JSON.stringify(realOrders));
  deviceAdmin.setItem('bakery_products', JSON.stringify(realProducts));

  const initialEnv = getActiveUnifiedSqlEnv();
  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.1',
    'Khởi tạo môi trường mặc định Cloud SQL Chính',
    'cloud_production',
    initialEnv,
    initialEnv === 'cloud_production',
    `Dữ liệu khởi tạo: ${realOrders.length} đơn hàng thật, ${realProducts.length} sản phẩm thật`
  );

  // Test 1.2: Chuyển sang 🧪 Cloud SQL Test (Sandbox)
  switchUnifiedSqlEnv('cloud_testing');
  const activeAfterSwitchTest = getActiveUnifiedSqlEnv();
  const currentOrdersInCloudTest = JSON.parse(deviceAdmin.getItem('bakery_orders') || '[]');
  const vaultProd = deviceAdmin.getItem(`${STORAGE_KEY_PROFILE_VAULT_PREFIX}production`);

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.2A',
    'Chuyển sang Cloud SQL Test thành công',
    'cloud_testing',
    activeAfterSwitchTest,
    activeAfterSwitchTest === 'cloud_testing',
    'Trạng thái active đã chuyển sang cloud_testing'
  );

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.2B',
    'Dữ liệu thật của Cloud SQL Chính đã được đóng gói an toàn vào Vault riêng',
    'Có dữ liệu đóng gói trong Vault production',
    vaultProd ? `Đã lưu Vault (${vaultProd.length} ký tự)` : 'Chưa lưu Vault',
    !!vaultProd,
    'Dữ liệu gốc được niêm phong trong bakery_vault_profile_production'
  );

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.2C',
    'Dữ liệu đơn hàng thật không bị rò rỉ sang Cloud SQL Test (Clean Slate)',
    '0 đơn hàng (sạch sẽ, không dính đơn thật)',
    `${currentOrdersInCloudTest.length} đơn hàng`,
    currentOrdersInCloudTest.length === 0,
    'Cách ly sạch sẽ không bị trộn đơn thật vào môi trường test'
  );

  // Tạo đơn hàng ảo trong Cloud SQL Test
  const testOrders = [
    { id: 'ORD-TEST-999', code: 'TEST-999', total: 999999, items: ['Bánh Thử Nghiệm Ảo'] },
  ];
  deviceAdmin.setItem('bakery_orders', JSON.stringify(testOrders));

  // Test 1.3: Chuyển sang 💻 Local SQL Chính
  switchUnifiedSqlEnv('local_production');
  const activeLocalProd = getActiveUnifiedSqlEnv();
  const isLocalActive = isLocalMode();
  const ordersInLocalProd = JSON.parse(deviceAdmin.getItem('bakery_orders') || '[]');

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.3A',
    'Chuyển sang Local SQL Chính (Vận hành máy tính)',
    'local_production (mode: local)',
    `${activeLocalProd} (mode: ${isLocalActive ? 'local' : 'online'})`,
    activeLocalProd === 'local_production' && isLocalActive,
    'Hệ thống chuyển sang chế độ Local SQL trên thư mục máy tính'
  );

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.3B',
    'Đơn ảo của Cloud Test không bị lọt sang Local SQL Chính',
    'Không chứa ORD-TEST-999',
    ordersInLocalProd.some((o: any) => o.id === 'ORD-TEST-999') ? 'BỊ LẪN ĐƠN ẢO' : 'Cách ly hoàn toàn',
    !ordersInLocalProd.some((o: any) => o.id === 'ORD-TEST-999'),
    'Dữ liệu Cloud Test được niêm phong trong vault cloud_testing'
  );

  // Tạo đơn hàng trong Local SQL Chính
  const localOrders = [
    { id: 'ORD-LOCAL-001', code: 'LOCAL-001', total: 50000, items: ['Bánh Mì Gối Local'] },
  ];
  deviceAdmin.setItem('bakery_orders', JSON.stringify(localOrders));

  // Test 1.4: Chuyển sang 🔬 Local SQL Test
  switchUnifiedSqlEnv('local_testing');
  const activeLocalTest = getActiveUnifiedSqlEnv();
  const ordersInLocalTest = JSON.parse(deviceAdmin.getItem('bakery_orders') || '[]');

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.4A',
    'Chuyển sang Local SQL Test (Thử nghiệm máy tính)',
    'local_testing',
    activeLocalTest,
    activeLocalTest === 'local_testing',
    'Hệ thống chuyển sang thư mục thử nghiệm độc lập SQL TEST'
  );

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.4B',
    'Đơn của Local Chính không bị lẫn sang Local Test',
    'Không chứa ORD-LOCAL-001',
    ordersInLocalTest.some((o: any) => o.id === 'ORD-LOCAL-001') ? 'BỊ LẪN ĐƠN' : 'Cách ly hoàn toàn',
    !ordersInLocalTest.some((o: any) => o.id === 'ORD-LOCAL-001')
  );

  // Test 1.5: Quay trở lại 🌐 Cloud SQL Chính (Khôi phục toàn vẹn dữ liệu)
  switchUnifiedSqlEnv('cloud_production');
  const activeReturned = getActiveUnifiedSqlEnv();
  const isOnlineReturned = !isLocalMode();
  const ordersRestored = JSON.parse(deviceAdmin.getItem('bakery_orders') || '[]');
  const productsRestored = JSON.parse(deviceAdmin.getItem('bakery_products') || '[]');
  const reconcileLockStatus = isReconcileLocked();

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.5A',
    'Quay về Cloud SQL Chính thành công',
    'cloud_production (online)',
    `${activeReturned} (${isOnlineReturned ? 'online' : 'local'})`,
    activeReturned === 'cloud_production' && isOnlineReturned
  );

  const hasAllRealOrders =
    ordersRestored.length === 2 &&
    ordersRestored.some((o: any) => o.id === 'ORD-REAL-001') &&
    ordersRestored.some((o: any) => o.id === 'ORD-REAL-002');

  const hasNoPollutedOrders =
    !ordersRestored.some((o: any) => o.id === 'ORD-TEST-999') &&
    !ordersRestored.some((o: any) => o.id === 'ORD-LOCAL-001');

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.5B',
    'Dữ liệu đơn hàng thật khôi phục 100% nguyên vẹn từ Vault',
    'Đúng 2 đơn hàng thật ban đầu (ORD-REAL-001, ORD-REAL-002)',
    `Có ${ordersRestored.length} đơn hàng`,
    hasAllRealOrders,
    'Toàn bộ đơn hàng kinh doanh thật được bảo toàn vẹn toàn'
  );

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.5C',
    'Không có bất kỳ đơn test/local nào bị trộn vào Cloud SQL Chính',
    '0 đơn thử nghiệm bị lọt vào',
    hasNoPollutedOrders ? 'Tuyệt đối sạch sẽ' : 'CÓ ĐƠN BỊ TRỘN',
    hasNoPollutedOrders,
    'Cách ly 100% - Không đồng bộ đè'
  );

  recordResult(
    'Phần 1: Cách Ly SQL',
    'TEST-1.5D',
    'Khóa an toàn chống đẩy bù (Reconcile Lock) được kích hoạt',
    'locked = true',
    reconcileLockStatus ? 'locked = true' : 'locked = false',
    reconcileLockStatus,
    'Ngăn chặn mọi tiến trình tự động đẩy đè dữ liệu cũ lên CSDL'
  );

  // ==========================================================================
  // PHẦN 2: KIỂM CHỨNG ĐỔI SQL CHÍNH VÀ TỰ ĐỘNG ĐỒNG BỘ TOÀN BỘ CÁC THIẾT BỊ
  // ==========================================================================
  console.log('\n--- PHẦN 2: KIỂM CHỨNG ĐỔI SQL CHÍNH VÀ ĐỒNG BỘ ĐA THIẾT BỊ ---\n');

  // Khởi tạo trạng thái ban đầu cho 3 thiết bị
  deviceAdmin.clear();
  deviceCashier.clear();
  deviceKitchen.clear();

  // Reset server state về mặc định
  serverDatabaseProfileState = {
    url: DEFAULT_PRODUCTION_URL,
    anonKey: DEFAULT_PRODUCTION_KEY,
    activeProfileId: 'production',
    name: 'CSDL Chính (Vận Hành)',
    updatedAt: new Date().toISOString(),
  };

  // Test 2.1: Ban đầu cả 3 thiết bị vào app cùng nhận CSDL mặc định
  setDeviceContext(deviceCashier);
  const cashierInitConfig = getMultiSqlConfig();
  const cashierInitProd = cashierInitConfig.profiles.find((p) => p.id === 'production');

  setDeviceContext(deviceKitchen);
  const kitchenInitConfig = getMultiSqlConfig();
  const kitchenInitProd = kitchenInitConfig.profiles.find((p) => p.id === 'production');

  recordResult(
    'Phần 2: Đồng Bộ Toàn Bộ Máy',
    'TEST-2.1',
    'Các máy con (Thu ngân, Bếp) ban đầu kết nối CSDL Chính mặc định',
    DEFAULT_PRODUCTION_URL,
    cashierInitProd?.url || '',
    cashierInitProd?.url === DEFAULT_PRODUCTION_URL && kitchenInitProd?.url === DEFAULT_PRODUCTION_URL,
    'Tất cả thiết bị cùng kết nối fhiuojcvsouwugatnmve.supabase.co'
  );

  // Test 2.2: Admin trên Máy 1 nhập URL/Key mới và bấm "Lưu & Đồng Bộ Cho Toàn Bộ Máy"
  setDeviceContext(deviceAdmin);
  const NEW_BRANCH_SQL_URL = 'https://tiem-banh-chi-nhanh-moi.supabase.co';
  const NEW_BRANCH_SQL_KEY = 'sb_publishable_new_branch_secret_key_888';

  const saveResult = await saveGlobalProductionSql(
    NEW_BRANCH_SQL_URL,
    NEW_BRANCH_SQL_KEY,
    'CSDL Chi Nhánh 2 (Hệ Thống Mới)'
  );

  const adminConfigAfterSave = getMultiSqlConfig();
  const adminProdAfterSave = adminConfigAfterSave.profiles.find((p) => p.id === 'production');

  recordResult(
    'Phần 2: Đồng Bộ Toàn Bộ Máy',
    'TEST-2.2A',
    'Admin lưu cấu hình SQL Chính mới thành công trên máy Admin',
    NEW_BRANCH_SQL_URL,
    adminProdAfterSave?.url || '',
    saveResult.success && adminProdAfterSave?.url === NEW_BRANCH_SQL_URL,
    'Máy Admin đã chuyển sang CSDL mới ngay lập tức'
  );

  recordResult(
    'Phần 2: Đồng Bộ Toàn Bộ Máy',
    'TEST-2.2B',
    'Server API nhận và cập nhật thông tin CSDL mới cho toàn bộ hệ thống',
    NEW_BRANCH_SQL_URL,
    serverDatabaseProfileState.url,
    serverDatabaseProfileState.url === NEW_BRANCH_SQL_URL && serverDatabaseProfileState.anonKey === NEW_BRANCH_SQL_KEY,
    'Server API /api/system/database-profile đã lưu URL và Key mới'
  );

  // Test 2.3: Máy Thu Ngân (Điện thoại/máy POS) mở link web hoặc nhận kiểm tra tự động
  setDeviceContext(deviceCashier);
  // Mô phỏng trước khi đồng bộ: Máy Thu Ngân đang ở URL cũ
  const cashierBeforeSync = getMultiSqlConfig().profiles.find((p) => p.id === 'production');
  const cashierHadOldUrl = cashierBeforeSync?.url === DEFAULT_PRODUCTION_URL;

  // Thực hiện tự động kiểm tra đồng bộ (GlobalSqlSyncWatcher kích hoạt)
  const cashierSyncRes = await fetchAndApplyGlobalSqlProfile();
  const cashierConfigAfterSync = getMultiSqlConfig();
  const cashierProdAfterSync = cashierConfigAfterSync.profiles.find((p) => p.id === 'production');

  recordResult(
    'Phần 2: Đồng Bộ Toàn Bộ Máy',
    'TEST-2.3A',
    'Máy Thu Ngân tự động phát hiện CSDL Chính mới từ máy chủ',
    'changed = true',
    `changed = ${cashierSyncRes.changed}`,
    cashierSyncRes.changed && cashierHadOldUrl,
    'GlobalSqlSyncWatcher nhận diện URL đã thay đổi trên máy chủ'
  );

  recordResult(
    'Phần 2: Đồng Bộ Toàn Bộ Máy',
    'TEST-2.3B',
    'Máy Thu Ngân tự động chuyển sang CSDL mới mà KHÔNG CẦN nhập lại thủ công',
    NEW_BRANCH_SQL_URL,
    cashierProdAfterSync?.url || '',
    cashierProdAfterSync?.url === NEW_BRANCH_SQL_URL && cashierProdAfterSync?.anonKey === NEW_BRANCH_SQL_KEY,
    'Thu ngân tự động kết nối CSDL mới của Admin'
  );

  // Test 2.4: Máy Bếp (Tablet KDS) kiểm tra định kỳ (Periodic interval)
  setDeviceContext(deviceKitchen);
  const kitchenSyncRes = await fetchAndApplyGlobalSqlProfile();
  const kitchenConfigAfterSync = getMultiSqlConfig();
  const kitchenProdAfterSync = kitchenConfigAfterSync.profiles.find((p) => p.id === 'production');

  recordResult(
    'Phần 2: Đồng Bộ Toàn Bộ Máy',
    'TEST-2.4',
    'Máy Bếp (KDS) tự động đồng bộ sang CSDL mới qua kiểm tra định kỳ',
    NEW_BRANCH_SQL_URL,
    kitchenProdAfterSync?.url || '',
    kitchenSyncRes.changed && kitchenProdAfterSync?.url === NEW_BRANCH_SQL_URL,
    'Màn hình bếp KDS cũng tự động nhảy sang CSDL mới'
  );

  // Test 2.5: Thiết bị đã đồng bộ thì lần kiểm tra tiếp theo không bị reload thừa
  setDeviceContext(deviceCashier);
  const cashierSecondCheck = await fetchAndApplyGlobalSqlProfile();
  recordResult(
    'Phần 2: Đồng Bộ Toàn Bộ Máy',
    'TEST-2.5',
    'Không thay đổi lặp lại nếu thiết bị đã đồng bộ khớp với server',
    'changed = false (ổn định, không reload thừa)',
    `changed = ${cashierSecondCheck.changed}`,
    cashierSecondCheck.changed === false,
    'Tránh reload vòng lặp khi dữ liệu đã khớp'
  );

  // Test 2.6: Admin bấm "Khôi Phục Mặc Định" (Revert to Default)
  setDeviceContext(deviceAdmin);
  await saveGlobalProductionSql(
    DEFAULT_PRODUCTION_URL,
    DEFAULT_PRODUCTION_KEY,
    'CSDL Chính (Vận Hành)'
  );

  // Kiểm tra máy Thu Ngân tự động quay về mặc định
  setDeviceContext(deviceCashier);
  const cashierRevertRes = await fetchAndApplyGlobalSqlProfile();
  const cashierProdReverted = getMultiSqlConfig().profiles.find((p) => p.id === 'production');

  recordResult(
    'Phần 2: Đồng Bộ Toàn Bộ Máy',
    'TEST-2.6',
    'Khi Admin khôi phục mặc định, các máy khác cũng tự động quay về CSDL gốc',
    DEFAULT_PRODUCTION_URL,
    cashierProdReverted?.url || '',
    cashierRevertRes.changed && cashierProdReverted?.url === DEFAULT_PRODUCTION_URL,
    'Toàn bộ app đồng loạt quay về CSDL gốc mặc định'
  );

  // ==========================================================================
  // TỔNG KẾT BÁO CÁO
  // ==========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('📊 TỔNG HỢP KẾT QUẢ KIỂM THỬ:');
  console.log('='.repeat(80));

  const passedCount = testResults.filter((t) => t.passed).length;
  const totalCount = testResults.length;
  const allPassed = passedCount === totalCount;

  console.log(`\nKết Quả: ${passedCount}/${totalCount} kiểm thử ĐẠT (${Math.round((passedCount / totalCount) * 100)}%)`);

  console.table(
    testResults.map((r) => ({
      'Phần': r.part,
      'Mã Test': r.testId,
      'Nội Dung Kiểm Thử': r.name,
      'Kết Quả': r.passed ? '✅ ĐẠT' : '❌ LỖI',
    }))
  );

  if (allPassed) {
    console.log('\n🎉 KẾT LUẬN: TOÀN BỘ 2 TÍNH NĂNG HOẠT ĐỘNG HOÀN HẢO 100%!');
    console.log('  1. Cách ly 4 môi trường SQL: 100% độc lập, không trộn lẫn dữ liệu, không đè đơn.');
    console.log('  2. Đổi SQL Chính: Tự động phát sóng & cập nhật sang mọi thiết bị cùng link app.');
  } else {
    console.error('\n⚠️ CẢNH BÁO: Phát hiện lỗi trong quá trình kiểm thử!');
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi thực thi kiểm thử:', err);
  process.exit(1);
});
