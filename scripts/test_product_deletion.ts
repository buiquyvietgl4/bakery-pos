// scripts/test_product_deletion.ts
// Kiểm thử cơ chế xóa bánh triệt để - Không bị hồi sinh khi tải lại trang hoặc nạp default

const mockStorage: Record<string, string> = {};
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
  },
  navigator: { onLine: false },
};
(globalThis as any).localStorage = (globalThis as any).window.localStorage;

import {
  getDeletedProductIds,
  markProductAsDeleted,
  unmarkProductDeleted,
  filterActiveProducts,
  deleteProductEverywhere,
  BAKERY_DELETED_PRODUCT_IDS_KEY,
  BAKERY_PRODUCTS_KEY,
  BAKERY_STOCKS_KEY,
} from '../src/lib/utils/productManager';
import { DEFAULT_BAKERY_PRODUCTS } from '../src/lib/constants/bakeryData';

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   KIỂM THỬ CƠ CHẾ XÓA BÁNH TRIỆT ĐỂ & CHỐNG HỒI SINH         ║');
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

  // Khởi tạo dữ liệu mẫu
  const sampleProducts = [
    { id: 'prod-1', name: 'Bánh Bông Lan Trứng Muối 18cm', selling_price: 365000, is_active: true },
    { id: 'prod-2', name: 'Bánh Mì Hoa Cúc Pháp', selling_price: 65000, is_active: true },
    { id: 'prod-3', name: 'Bánh Croissant Bơ Tỏi', selling_price: 35000, is_active: true },
    { id: 'custom-cake-001', name: 'Bánh Kem Matcha Nhật Bản', selling_price: 280000, is_active: true },
  ];

  mockStorage[BAKERY_PRODUCTS_KEY] = JSON.stringify(sampleProducts);
  mockStorage[BAKERY_STOCKS_KEY] = JSON.stringify({
    'prod-1': 5,
    'prod-2': 10,
    'custom-cake-001': 2,
  });

  // TEST 1: Đánh dấu xóa bánh vào danh sách đen vĩnh viễn
  console.log('━━━ TEST 1: ĐÁNH DẤU XÓA BÁNH VÀO DANH SÁCH ĐEN ━━━');
  markProductAsDeleted('prod-1', 'Bánh Bông Lan Trứng Muối 18cm');
  const deletedSet = getDeletedProductIds();
  assert('ID bánh được thêm vào danh sách đen', deletedSet.has('prod-1'));
  assert('Tên bánh được chuẩn hóa chữ thường trong danh sách đen', deletedSet.has('bánh bông lan trứng muối 18cm'));
  
  const stocks = JSON.parse(mockStorage[BAKERY_STOCKS_KEY]);
  assert('Đã dọn dẹp tồn kho của bánh bị xóa khỏi bakery_stocks', stocks['prod-1'] === undefined);

  // TEST 2: Bộ lọc filterActiveProducts lọc sạch bánh đã xóa
  console.log('\n━━━ TEST 2: BỘ LỌC filterActiveProducts ━━━');
  const filtered = filterActiveProducts(sampleProducts);
  assert('Bánh prod-1 bị loại khỏi danh sách', !filtered.some(p => p.id === 'prod-1'));
  assert('Các bánh khác còn nguyên vẹn', filtered.length === 3);

  // TEST 3: Chống hồi sinh từ DEFAULT_BAKERY_PRODUCTS
  console.log('\n━━━ TEST 3: CHỐNG HỒI SINH TỪ DEFAULT_BAKERY_PRODUCTS ━━━');
  const activeDefaults = filterActiveProducts(DEFAULT_BAKERY_PRODUCTS);
  assert('DEFAULT_BAKERY_PRODUCTS không còn chứa prod-1', !activeDefaults.some(p => p.id === 'prod-1'));

  // Mô phỏng logic nạp ở POS:
  const posProducts: any[] = [...filtered];
  DEFAULT_BAKERY_PRODUCTS.forEach((def) => {
    const isDel = deletedSet.has(def.id) || (def.name && deletedSet.has(def.name.toLowerCase().trim()));
    if (!isDel && !posProducts.some(p => p.id === def.id)) {
      posProducts.push(def);
    }
  });
  assert('Logic nạp ở POS tuyệt đối không chèn lại prod-1', !posProducts.some(p => p.id === 'prod-1'));

  // TEST 4: Hàm deleteProductEverywhere xóa sạch mọi ngóc ngách
  console.log('\n━━━ TEST 4: HÀM deleteProductEverywhere XÓA TOÀN DIỆN ━━━');
  await deleteProductEverywhere('custom-cake-001', 'Bánh Kem Matcha Nhật Bản');
  const storedProds = JSON.parse(mockStorage[BAKERY_PRODUCTS_KEY]);
  assert('LocalStorage bakery_products đã loại bỏ custom-cake-001', !storedProds.some((p: any) => p.id === 'custom-cake-001'));
  
  const updatedDeletedSet = getDeletedProductIds();
  assert('Danh sách đen đã ghi nhận custom-cake-001', updatedDeletedSet.has('custom-cake-001'));
  assert('Danh sách đen đã ghi nhận tên bánh matcha', updatedDeletedSet.has('bánh kem matcha nhật bản'));

  // TEST 5: Thoát ra vào lại (Mô phỏng loadData khi reload trang)
  console.log('\n━━━ TEST 5: MÔ PHỎNG THOÁT RA VÀO LẠI (RELOAD PAGE) ━━━');
  // Giả sử có nguồn dữ liệu từ Supabase hoặc Cache cũ trả về cả 4 bánh
  const incomingFromDbOrCache = [
    { id: 'prod-1', name: 'Bánh Bông Lan Trứng Muối 18cm', selling_price: 365000, is_active: true },
    { id: 'prod-2', name: 'Bánh Mì Hoa Cúc Pháp', selling_price: 65000, is_active: true },
    { id: 'custom-cake-001', name: 'Bánh Kem Matcha Nhật Bản', selling_price: 280000, is_active: true },
  ];
  const reloadedProds = filterActiveProducts(incomingFromDbOrCache);
  assert('Khi load lại dữ liệu, prod-1 không xuất hiện', !reloadedProds.some(p => p.id === 'prod-1'));
  assert('Khi load lại dữ liệu, custom-cake-001 không xuất hiện', !reloadedProds.some(p => p.id === 'custom-cake-001'));
  assert('Chỉ còn lại bánh chưa bị xóa (prod-2)', reloadedProds.length === 1 && reloadedProds[0].id === 'prod-2');

  // TEST 6: Phục hồi khi người dùng chủ động tạo lại bánh mới cùng tên
  console.log('\n━━━ TEST 6: PHỤC HỒI KHI CỐ Ý TẠO LẠI BÁNH ━━━');
  unmarkProductDeleted('new-prod-id-999', 'Bánh Kem Matcha Nhật Bản');
  const setAfterUnmark = getDeletedProductIds();
  assert('Tên bánh matcha đã được gỡ khỏi danh sách đen', !setAfterUnmark.has('bánh kem matcha nhật bản'));

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`KẾT QUẢ: ${passCount} PASS | ${failCount} FAIL`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failCount > 0) process.exit(1);
}

runTests();
