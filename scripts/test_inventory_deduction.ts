// scripts/test_inventory_deduction.ts
// Test tự động trừ tồn kho nguyên vật liệu theo định mức BOM khi làm bánh xong

// Mock browser APIs for Node.js
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
  extractOrderBomRequirements,
  deductOrderIngredients,
  INGREDIENTS_STORAGE_KEY,
} from '../src/lib/utils/inventoryDeductionManager';
import { generateMasterSqlDump } from '../src/lib/utils/localSqlManager';
import { CakeOrderSpec } from '../src/lib/types/bakery-bom';

function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   KIỂM THỬ TỰ ĐỘNG TRỪ TỒN KHO NGUYÊN VẬT LIỆU THEO BOM      ║');
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

  // 1. Khởi tạo kho nguyên vật liệu mẫu
  const initialIngredients = [
    { id: 'ing-flour-8', name: 'Bột mì số 8 (Cake Flour)', unit: 'g', stock_qty: 25000, avg_cost: 24 },
    { id: 'ing-egg', name: 'Trứng gà ta tươi', unit: 'quả', stock_qty: 200, avg_cost: 3500 },
    { id: 'ing-butter', name: 'Bơ lạt Anchor', unit: 'g', stock_qty: 10000, avg_cost: 130 },
    { id: 'ing-sugar', name: 'Đường cát trắng', unit: 'g', stock_qty: 15000, avg_cost: 20 },
    { id: 'ing-whip', name: 'Kem tươi Whipping Anchor', unit: 'ml', stock_qty: 12000, avg_cost: 140 },
    { id: 'ing-box-18', name: 'Hộp Mica trong suốt 18cm', unit: 'cái', stock_qty: 100, avg_cost: 18000 },
    { id: 'ing-hat', name: 'Mũ sinh nhật vương miện', unit: 'cái', stock_qty: 150, avg_cost: 5000 },
    { id: 'ing-knife', name: 'Dao cắt bánh sinh nhật', unit: 'cái', stock_qty: 150, avg_cost: 3000 },
  ];
  mockStorage[INGREDIENTS_STORAGE_KEY] = JSON.stringify(initialIngredients);

  // 2. Khởi tạo đơn hàng có CakeOrderSpec
  const mockOrderSpec: CakeOrderSpec = {
    isBirthdayCake: true,
    sizeName: 'Size 18cm',
    cakeBase: {
      id: 'base-vani',
      name: 'Cốt Vani Chiffon',
      cost: 30500,
      bomIngredients: [
        { ingredientId: 'ing-flour-8', name: 'Bột mì số 8 (Cake Flour)', unit: 'g', quantity: 120, unitCost: 24, totalCost: 2880 },
        { ingredientId: 'ing-egg', name: 'Trứng gà ta tươi', unit: 'quả', quantity: 4, unitCost: 3500, totalCost: 14000 },
        { ingredientId: 'ing-butter', name: 'Bơ lạt Anchor', unit: 'g', quantity: 45, unitCost: 130, totalCost: 5850 },
      ],
    },
    creamCoating: {
      id: 'cream-whipping',
      name: 'Kem Whipping Anchor',
      cost: 45000,
      bomIngredients: [
        { ingredientId: 'ing-whip', name: 'Kem tươi Whipping Anchor', unit: 'ml', quantity: 250, unitCost: 140, totalCost: 35000 },
        { ingredientId: 'ing-sugar', name: 'Đường cát trắng', unit: 'g', quantity: 50, unitCost: 20, totalCost: 1000 },
      ],
    },
    packaging: {
      id: 'ing-box-18',
      name: 'Hộp Mica trong suốt 18cm',
      cost: 18000,
    },
    freeAccessories: [
      { id: 'ing-hat', name: 'Mũ sinh nhật vương miện', quantity: 1, cost: 5000 },
      { id: 'ing-knife', name: 'Dao cắt bánh sinh nhật', quantity: 1, cost: 3000 },
    ],
    totalCost: 101500,
    targetFoodCostPct: 36.5,
    suggestedPrice: 280000,
    finalPrice: 280000,
    cakeMessage: 'Mừng Sinh Nhật',
  };

  const testOrder = {
    id: 'ord-test-001',
    order_number: 'BK-CAKE-2026-0901',
    cake_name: 'Bánh Sinh Nhật Vani 18cm',
    cake_order_spec: mockOrderSpec,
    quantity: 1,
    status: 'preparing',
  };

  // TEST 1: Bóc tách nguyên liệu BOM từ đơn hàng
  console.log('━━━ TEST 1: BÓC TÁCH NGUYÊN LIỆU BOM TỪ ĐƠN HÀNG ━━━');
  const reqs = extractOrderBomRequirements(testOrder);
  assert('Bóc tách được nguyên liệu từ CakeOrderSpec', reqs.length === 8, `Số lượng: ${reqs.length}`);
  assert('Có nguyên liệu Bột mì số 8 (120g)', reqs.some(r => r.ingredientId === 'ing-flour-8' && r.quantity === 120));
  assert('Có nguyên liệu Trứng gà (4 quả)', reqs.some(r => r.ingredientId === 'ing-egg' && r.quantity === 4));
  assert('Có nguyên liệu Hộp Mica (1 cái)', reqs.some(r => r.ingredientId === 'ing-box-18' && r.quantity === 1));
  assert('Có Mũ sinh nhật và Dao cắt bánh', reqs.some(r => r.ingredientId === 'ing-hat') && reqs.some(r => r.ingredientId === 'ing-knife'));

  // TEST 2: Thực hiện trừ tồn kho lần 1 khi hoàn thành bánh
  console.log('\n━━━ TEST 2: THỰC HIỆN TRỪ TỒN KHO LẦN 1 (BÁNH LÀM XONG) ━━━');
  deductOrderIngredients(testOrder).then((result) => {
    assert('Kết quả trừ kho thành công', result.success === true);
    assert('Đã trừ đúng 8 nguyên liệu', result.deductedItems.length === 8, `Số lượng: ${result.deductedItems.length}`);
    assert('Đơn hàng được gán cờ bom_deducted: true', (testOrder as any).bom_deducted === true);

    // Kiểm tra số lượng tồn kho còn lại trong storage
    const updatedIngs = JSON.parse(mockStorage[INGREDIENTS_STORAGE_KEY]);
    const flour = updatedIngs.find((i: any) => i.id === 'ing-flour-8');
    const egg = updatedIngs.find((i: any) => i.id === 'ing-egg');
    const box = updatedIngs.find((i: any) => i.id === 'ing-box-18');
    const whip = updatedIngs.find((i: any) => i.id === 'ing-whip');

    assert('Bột mì giảm từ 25,000g xuống 24,880g (-120g)', flour.stock_qty === 24880, `Thực tế: ${flour.stock_qty}`);
    assert('Trứng gà giảm từ 200 xuống 196 quả (-4)', egg.stock_qty === 196, `Thực tế: ${egg.stock_qty}`);
    assert('Kem tươi Whipping giảm từ 12,000 xuống 11,750ml (-250ml)', whip.stock_qty === 11750, `Thực tế: ${whip.stock_qty}`);
    assert('Hộp Mica giảm từ 100 xuống 99 cái (-1)', box.stock_qty === 99, `Thực tế: ${box.stock_qty}`);

    // TEST 3: Kiểm tra chống trừ lặp (No Double Deduct)
    console.log('\n━━━ TEST 3: KIỂM TRA CHỐNG TRỪ KHO LẶP (NO DOUBLE DEDUCT) ━━━');
    deductOrderIngredients(testOrder).then((secondResult) => {
      assert('Lần 2 được đánh dấu skipped: true', secondResult.skipped === true);
      assert('Lần 2 không trừ thêm món nào', secondResult.deductedItems.length === 0);

      const afterSecondIngs = JSON.parse(mockStorage[INGREDIENTS_STORAGE_KEY]);
      const flourAfter = afterSecondIngs.find((i: any) => i.id === 'ing-flour-8');
      assert('Tồn kho bột mì vẫn giữ nguyên 24,880g (không bị trừ lần 2)', flourAfter.stock_qty === 24880);

      // TEST 4: Đồng bộ SQL Dump với tồn kho mới
      console.log('\n━━━ TEST 4: ĐỒNG BỘ CSDL SQL VỚI TỒN KHO MỚI ━━━');
      const dumpSql = generateMasterSqlDump({
        ingredients: afterSecondIngs,
        products: [],
        orders: [testOrder],
      });
      assert('Master SQL Dump có chứa tồn kho bột mì 24880', dumpSql.includes('24880'));
      assert('Master SQL Dump có chứa tồn kho trứng 196', dumpSql.includes('196'));
      assert('Master SQL Dump có chứa tồn kho hộp 99', dumpSql.includes('99'));

      console.log('\n══════════════════════════════════════════════════════════════');
      console.log(`KẾT QUẢ: ${passCount} PASS | ${failCount} FAIL`);
      console.log('══════════════════════════════════════════════════════════════\n');

      if (failCount > 0) process.exit(1);
    });
  });
}

runTests();
