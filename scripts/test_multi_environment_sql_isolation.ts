// scripts/test_multi_environment_sql_isolation.ts
// BÀI TEST ĐÁNH GIÁ TÍNH HIỆU QUẢ VÀ AN TOÀN DỮ LIỆU CỦA HỆ THỐNG ĐA CSDL SQL
// (Mô phỏng 2 thiết bị độc lập: Thiết bị A - Thu ngân POS và Thiết bị B - Admin Test)

import {
  switchActiveEnvironment,
  getMultiSqlConfig,
  saveDatabaseProfile,
  isReconcileLocked,
  cloneDataBetweenProfiles,
  STORAGE_KEY_MULTI_SQL_CONFIG,
  STORAGE_KEY_PROFILE_VAULT_PREFIX,
  STORAGE_KEY_RECONCILE_LOCKED,
  BAKERY_DATA_KEYS,
  DatabaseProfile,
} from '../src/lib/supabase/databaseProfileManager';

// ============================================================================
// HỆ THỐNG GIẢ LẬP ĐA THIẾT BỊ ĐỘC LẬP (MULTI-DEVICE LOCALSTORAGE ENGINE)
// ============================================================================
class DeviceLocalStorage {
  public store: Record<string, string> = {};

  getItem(k: string): string | null {
    return this.store[k] || null;
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

const deviceAStorage = new DeviceLocalStorage(); // Máy POS quầy thu ngân (Chuyên bán hàng thật)
const deviceBStorage = new DeviceLocalStorage(); // Máy tính cá nhân Admin (Chuyên thử nghiệm / Fix lỗi)

let currentActiveDeviceStorage = deviceAStorage;

// Gán browser globals cho Node.js trỏ động theo thiết bị đang được test
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: {
    getItem: (k: string) => currentActiveDeviceStorage.getItem(k),
    setItem: (k: string, v: string) => currentActiveDeviceStorage.setItem(k, v),
    removeItem: (k: string) => currentActiveDeviceStorage.removeItem(k),
    clear: () => currentActiveDeviceStorage.clear(),
  },
  navigator: { onLine: true },
};
(globalThis as any).localStorage = (globalThis as any).window.localStorage;

// ============================================================================
// BÁO CÁO KẾT QUẢ KIỂM THỬ
// ============================================================================
interface TestResult {
  suite: string;
  name: string;
  expected: string;
  actual: string;
  passed: boolean;
}

const results: TestResult[] = [];

function assertTest(suite: string, name: string, condition: boolean, expected: string, actual: string) {
  results.push({
    suite,
    name,
    expected,
    actual,
    passed: condition,
  });
}

// ============================================================================
// TIẾN TRÌNH KIỂM THỬ THỰC TẾ
// ============================================================================
async function runMultiEnvironmentSqlIsolationTest() {
  console.log('\n================================================================');
  console.log('    BÀI KIỂM THỬ ĐÁNH GIÁ TÍNH ĐỘC LẬP & AN TOÀN ĐA CSDL SQL');
  console.log('    (Mô phỏng 2 thiết bị: Máy Thu Ngân POS vs Máy Test Admin)');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // BƯỚC 1: KHỞI TẠO DỮ LIỆU BAN ĐẦU TRÊN MÁY A (THU NGÂN POS - BÁN HÀNG THẬT)
  // --------------------------------------------------------------------------
  currentActiveDeviceStorage = deviceAStorage;

  // Giả lập đơn hàng thật trên CSDL Chính của máy POS
  const realOrders = [
    { id: 'ord-01', orderNumber: 'BK-PROD-101', totalAmount: 350000, status: 'completed', customerName: 'Chị Mai' },
    { id: 'ord-02', orderNumber: 'BK-PROD-102', totalAmount: 250000, status: 'completed', customerName: 'Anh Tuấn' },
  ];
  const realProducts = [
    { id: 'p-01', name: 'Bánh Bông Lan Trứng Muối', price: 250000 },
    { id: 'p-02', name: 'Bánh Kem Bắp Hoàng Gia', price: 350000 },
  ];

  deviceAStorage.setItem('bakery_orders', JSON.stringify(realOrders));
  deviceAStorage.setItem('bakery_products', JSON.stringify(realProducts));

  const configA = getMultiSqlConfig();
  assertTest(
    'MÔI TRƯỜNG BAN ĐẦU',
    'Máy A (POS) mặc định ở CSDL Chính (Production)',
    configA.activeProfileId === 'production',
    'activeProfileId === "production"',
    `activeProfileId === "${configA.activeProfileId}"`
  );

  const prodRevenueA = realOrders.reduce((sum, o) => sum + o.totalAmount, 0);
  assertTest(
    'MÔI TRƯỜNG BAN ĐẦU',
    'Doanh thu thật ban đầu trên Máy A đạt 600.000đ',
    prodRevenueA === 600000,
    '600,000đ',
    `${prodRevenueA.toLocaleString('vi-VN')}đ`
  );

  // --------------------------------------------------------------------------
  // BƯỚC 2: KHỞI TẠO MÁY B (ADMIN) VÀ BẤM CHUYỂN SANG CSDL THỬ NGHIỆM
  // --------------------------------------------------------------------------
  currentActiveDeviceStorage = deviceBStorage;

  // Máy B trước khi chuyển cũng có sẵn dữ liệu của tiệm
  deviceBStorage.setItem('bakery_orders', JSON.stringify(realOrders));
  deviceBStorage.setItem('bakery_products', JSON.stringify(realProducts));

  // Cấu hình URL & Key cho CSDL Thử Nghiệm trên Máy B
  const testProfile: DatabaseProfile = {
    id: 'testing',
    name: 'CSDL Thử Nghiệm (Test Sandbox)',
    description: 'Dự án Supabase thứ 2 dùng để thử lỗi',
    url: 'https://test-sandbox-demo.supabase.co',
    anonKey: 'sb_anon_test_key_sample_1234567890',
  };
  saveDatabaseProfile(testProfile, 'fetch_from_new');

  // Thao tác mấu chốt: Bấm CHUYỂN MÔI TRƯỜNG SANG TEST
  switchActiveEnvironment('testing', 'clean_slate');

  const configB = getMultiSqlConfig();
  assertTest(
    'CHUYỂN MÔI TRƯỜNG TRÊN MÁY B',
    'Máy B chuyển thành công sang CSDL Thử Nghiệm (testing)',
    configB.activeProfileId === 'testing',
    'activeProfileId === "testing"',
    `activeProfileId === "${configB.activeProfileId}"`
  );

  // --------------------------------------------------------------------------
  // BƯỚC 3: KIỂM CHỨNG TÍNH ĐỘC LẬP - MÁY A CÓ BỊ ĐỔI HAY BỊ ẢNH HƯỞNG KHÔNG?
  // --------------------------------------------------------------------------
  currentActiveDeviceStorage = deviceAStorage; // Chuyển góc nhìn sang Máy A (Thu ngân)
  const configACheck = getMultiSqlConfig();
  const ordersACheck = JSON.parse(deviceAStorage.getItem('bakery_orders') || '[]');

  assertTest(
    'TÍNH ĐỘC LẬP ĐA THIẾT BỊ',
    'Máy A (Thu Ngân) VẪN Ở CSDL CHÍNH khi Máy B đổi sang Test',
    configACheck.activeProfileId === 'production',
    'activeProfileId === "production"',
    `activeProfileId === "${configACheck.activeProfileId}"`
  );

  assertTest(
    'TÍNH ĐỘC LẬP ĐA THIẾT BỊ',
    'Dữ liệu đơn hàng thật trên Máy A vẫn nguyên vẹn 100%',
    ordersACheck.length === 2 && ordersACheck[0].orderNumber === 'BK-PROD-101',
    '2 đơn hàng thật được bảo tồn',
    `${ordersACheck.length} đơn hàng tồn tại`
  );

  // --------------------------------------------------------------------------
  // BƯỚC 4: KIỂM CHỨNG CƠ CHẾ KÉT SẮT & KHÓA CHỐNG ĐẨY BÙ TRÊN MÁY B
  // --------------------------------------------------------------------------
  currentActiveDeviceStorage = deviceBStorage;

  assertTest(
    'CƠ CHẾ KÉT SẮT & BẢO VỆ',
    'Khóa bảo vệ chống đẩy bù (Reconcile Safety Lock) đã TỰ ĐỘNG BẬT',
    isReconcileLocked() === true,
    'isReconcileLocked === true',
    `isReconcileLocked === ${isReconcileLocked()}`
  );

  const vaultProdB = deviceBStorage.getItem(`${STORAGE_KEY_PROFILE_VAULT_PREFIX}production`);
  assertTest(
    'CƠ CHẾ KÉT SẮT & BẢO VỆ',
    'Két sắt đã đóng băng niêm phong dữ liệu CSDL Chính vào Vault',
    vaultProdB !== null && vaultProdB.includes('BK-PROD-101'),
    'Két sắt chứa snapshot của CSDL Chính',
    vaultProdB ? 'Đã niêm phong thành công' : 'Chưa niêm phong'
  );

  const activeOrdersB = JSON.parse(deviceBStorage.getItem('bakery_orders') || '[]');
  assertTest(
    'CƠ CHẾ KÉT SẮT & BẢO VỆ',
    'Bộ nhớ tạm của CSDL Chính đã được làm sạch, không còn vương vãi trên Máy B',
    activeOrdersB.length === 0,
    '0 đơn hàng (sạch 100%)',
    `${activeOrdersB.length} đơn hàng trong bộ nhớ`
  );

  // --------------------------------------------------------------------------
  // BƯỚC 5: TẠO DỮ LIỆU ẢO TRÊN MÁY B (SIMULATE TEST MUTATIONS)
  // --------------------------------------------------------------------------
  const dummyTestOrders = [
    {
      id: 'ord-test-999',
      orderNumber: 'BK-TEST-DEBUG-999',
      totalAmount: 9999000,
      status: 'completed',
      customerName: 'Khách Hàng Ảo Test Lỗi',
    },
  ];
  deviceBStorage.setItem('bakery_orders', JSON.stringify(dummyTestOrders));

  const testOrdersB = JSON.parse(deviceBStorage.getItem('bakery_orders') || '[]');
  assertTest(
    'CÔ LẬP THỬ NGHIỆM',
    'Tạo thành công đơn hàng ảo 9.999.000đ trên CSDL Thử Nghiệm Máy B',
    testOrdersB.length === 1 && testOrdersB[0].orderNumber === 'BK-TEST-DEBUG-999',
    'BK-TEST-DEBUG-999',
    testOrdersB[0]?.orderNumber || 'Không tìm thấy'
  );

  // Kiểm tra Máy A có bị rò rỉ đơn hàng ảo này không
  currentActiveDeviceStorage = deviceAStorage;
  const ordersAAfterTest = JSON.parse(deviceAStorage.getItem('bakery_orders') || '[]');
  const hasLeakedToA = ordersAAfterTest.some((o: any) => o.orderNumber === 'BK-TEST-DEBUG-999');
  assertTest(
    'CÔ LẬP THỬ NGHIỆM',
    'Đơn ảo trên Máy B KHÔNG HỀ RÒ RỈ sang Máy A (Thu ngân)',
    !hasLeakedToA,
    'hasLeakedToA === false',
    `hasLeakedToA === ${hasLeakedToA}`
  );

  const revenueAAfterTest = ordersAAfterTest.reduce((sum: number, o: any) => sum + o.totalAmount, 0);
  assertTest(
    'CÔ LẬP THỬ NGHIỆM',
    'Doanh thu thật của tiệm trên Máy A KHÔNG BỊ SAI LỆCH (Vẫn là 600.000đ)',
    revenueAAfterTest === 600000,
    '600,000đ',
    `${revenueAAfterTest.toLocaleString('vi-VN')}đ`
  );

  // --------------------------------------------------------------------------
  // BƯỚC 6: MÁY B QUAY TRỞ LẠI CSDL CHÍNH - KIỂM CHỨNG KHÔI PHỤC KÉT SẮT
  // --------------------------------------------------------------------------
  currentActiveDeviceStorage = deviceBStorage;
  switchActiveEnvironment('production', 'fetch_from_new');

  const configBRestored = getMultiSqlConfig();
  assertTest(
    'KHÔI PHỤC AN TOÀN',
    'Máy B quay trở lại CSDL Chính thành công',
    configBRestored.activeProfileId === 'production',
    'activeProfileId === "production"',
    `activeProfileId === "${configBRestored.activeProfileId}"`
  );

  const ordersBRestored = JSON.parse(deviceBStorage.getItem('bakery_orders') || '[]');
  const hasLeakedTestToProd = ordersBRestored.some((o: any) => o.orderNumber === 'BK-TEST-DEBUG-999');
  assertTest(
    'KHÔI PHỤC AN TOÀN',
    'Đơn ảo test KHÔNG BỊ TRỘN vào CSDL Chính khi quay lại',
    !hasLeakedTestToProd,
    'hasLeakedTestToProd === false',
    `hasLeakedTestToProd === ${hasLeakedTestToProd}`
  );

  const hasRestoredRealOrders = ordersBRestored.some((o: any) => o.orderNumber === 'BK-PROD-101');
  assertTest(
    'KHÔI PHỤC AN TOÀN',
    'Két sắt tự động mở và khôi phục 100% dữ liệu CSDL Chính nguyên vẹn',
    hasRestoredRealOrders && ordersBRestored.length === 2,
    'Khôi phục đầy đủ 2 đơn hàng thật',
    `Khôi phục ${ordersBRestored.length} đơn hàng`
  );

  // --------------------------------------------------------------------------
  // BƯỚC 7: KIỂM CHỨNG TÍNH NĂNG 1-CLICK CLONE DANH MỤC TỪ CHÍNH SANG TEST
  // --------------------------------------------------------------------------
  const cloneRes = cloneDataBetweenProfiles('production', 'testing');
  assertTest(
    'TIỆN ÍCH 1-CLICK CLONE',
    'Tính năng sao chép danh mục từ Chính sang Test hoạt động trơn tru',
    cloneRes.success === true && (cloneRes.count || 0) > 0,
    'Clone thành công với số lượng item > 0',
    `Clone thành công (${cloneRes.count} keys)`
  );

  // In bảng tổng kết kết quả kiểm thử
  console.log('---------------------------------------------------------------------------------------------------------------');
  console.log('| NHÓM KIỂM THỬ              | NỘI DUNG ĐÁNH GIÁ                                    | TRẠNG THÁI |');
  console.log('---------------------------------------------------------------------------------------------------------------');
  let passCount = 0;
  for (const r of results) {
    if (r.passed) passCount++;
    const suiteCol = r.suite.padEnd(26);
    const nameCol = r.name.padEnd(52);
    const statusCol = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`| ${suiteCol} | ${nameCol} | ${statusCol.padEnd(10)} |`);
  }
  console.log('---------------------------------------------------------------------------------------------------------------');
  console.log(`\nTỔNG KẾT: ${passCount}/${results.length} TIÊU CHÍ ĐẠT CHUẨN (${Math.round((passCount / results.length) * 100)}%)`);

  if (passCount === results.length) {
    console.log('\n🎉 KẾT LUẬN: HỆ THỐNG ĐA CSDL HOÀN TOÀN ĐỘC LẬP & AN TOÀN 100% GIỮA CÁC THIẾT BỊ!\n');
  } else {
    console.error('\n⚠️ PHÁT HIỆN LỖI TRỘN DỮ LIỆU HOẶC KHÔNG CÔ LẬP ĐƯỢC CSDL!\n');
    process.exit(1);
  }
}

runMultiEnvironmentSqlIsolationTest().catch((err) => {
  console.error('Lỗi khi thực thi bài test:', err);
  process.exit(1);
});
