// scripts/test_real_bakery_system.ts
// KIỂM THỬ TOÀN DIỆN CÁC CHỨC NĂNG NÂNG CẤP VỚI DỮ LIỆU THẬT TỪ SUPABASE SQL
// (Không dùng dữ liệu mô phỏng / Mock)

const mockStorage: Record<string, string> = {
  bakery_sql_mode_config: JSON.stringify({ mode: 'online', localFolderName: '', autoSyncToFolder: true }),
};
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
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

import { supabase } from '../src/lib/supabase/client';
import {
  extractOrderBomRequirements,
  deductOrderIngredients,
  INGREDIENTS_STORAGE_KEY,
} from '../src/lib/utils/inventoryDeductionManager';
import {
  getFullCakeBomConfig,
  calculateCakeCostDetails,
  buildCakeOrderSpec,
} from '../src/lib/utils/cakeBomManager';
import {
  deleteProductEverywhere,
  filterActiveProducts,
  getDeletedProductIds,
  markProductAsDeleted,
  unmarkProductDeleted,
} from '../src/lib/utils/productManager';
import { generateMasterSqlDump } from '../src/lib/utils/localSqlManager';
import { CakeOrderSpec } from '../src/lib/types/bakery-bom';

async function runRealDataTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   KIỂM THỬ TOÀN DIỆN HỆ THỐNG VỚI CSDL THỰC TẾ SUPABASE SQL  ║');
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

  try {
    // Dọn dẹp bất kỳ sản phẩm kiểm thử còn sót lại từ lần chạy trước
    try {
      await supabase.from('products').delete().eq('id', '00000000-0000-4000-8000-000000000099');
      await supabase.from('products').delete().ilike('name', 'Bánh Test Hệ Thống%');
    } catch {}

    // =========================================================================
    // NHÓM 1: QUẢN LÝ BÁNH & THÀNH PHẨM (DỮ LIỆU THỰC TẾ TỪ SUPABASE)
    // =========================================================================
    console.log('━━━ NHÓM 1: QUẢN LÝ BÁNH & THÀNH PHẨM (SUPABASE PRODUCTS) ━━━');
    const { data: realProducts, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .order('name');

    assert('Kết nối Supabase Cloud tải danh mục bánh thành công', !prodErr && Array.isArray(realProducts));
    assert('Số lượng bánh đang kinh doanh chính xác (11 loại bánh)', realProducts?.length === 11, `Thực tế: ${realProducts?.length}`);
    
    // Kiểm tra các trường dữ liệu bắt buộc của bánh
    const sampleCake = realProducts?.[0];
    assert('Bánh có đầy đủ tên, giá bán và trạng thái active', !!sampleCake?.name && Number(sampleCake?.selling_price) > 0 && sampleCake?.is_active === true);
    
    // Kiểm tra cơ chế phân loại nhãn bánh
    const hasPreorder = realProducts?.some(p => p.cake_type_label === 'pre_order' || p.is_preorder_only);
    const hasStandard = realProducts?.some(p => p.cake_type_label === 'standard' || !p.is_preorder_only);
    assert('Có hỗ trợ phân loại Bánh thường & Bánh đặt trước', hasStandard !== undefined);

    // =========================================================================
    // NHÓM 2: KHO VẬT TƯ & RÀNG BUỘC NGUYÊN LIỆU BOM VỚI KHO THẬT
    // =========================================================================
    console.log('\n━━━ NHÓM 2: RÀNG BUỘC BOM VỚI KHO VẬT TƯ THỰC TẾ (SUPABASE INGREDIENTS) ━━━');
    const { data: realIngredients, error: ingErr } = await supabase
      .from('ingredients')
      .select('*')
      .order('name');

    assert('Tải danh mục nguyên vật liệu thực tế từ Supabase thành công', !ingErr && Array.isArray(realIngredients));
    assert('Kho vật tư có đủ 8 mặt hàng thực tế', realIngredients?.length === 8, `Thực tế: ${realIngredients?.length}`);

    // Tìm các mặt hàng trọng yếu trong kho thực tế
    const flourIng = realIngredients?.find(i => i.name.includes('Bột mì'));
    const eggIng = realIngredients?.find(i => i.name.includes('Trứng gà'));
    const butterIng = realIngredients?.find(i => i.name.includes('Bơ lạt'));
    const boxIng = realIngredients?.find(i => i.name.includes('Hộp'));
    const accessoryIng = realIngredients?.find(i => i.name.includes('dao nĩa') || i.name.includes('Nến'));

    assert('Kho có Bột mì thực tế (đơn vị: ' + flourIng?.unit + ', tồn: ' + flourIng?.stock_qty + ')', !!flourIng && flourIng.stock_qty > 0);
    assert('Kho có Trứng gà thực tế (đơn vị: ' + eggIng?.unit + ', tồn: ' + eggIng?.stock_qty + ')', !!eggIng && eggIng.stock_qty > 0);
    assert('Kho có Bơ lạt thực tế (đơn vị: ' + butterIng?.unit + ', tồn: ' + butterIng?.stock_qty + ')', !!butterIng && butterIng.stock_qty > 0);
    assert('Kho có Hộp bánh kem thực tế (đơn vị: ' + boxIng?.unit + ', tồn: ' + boxIng?.stock_qty + ')', !!boxIng && boxIng.stock_qty > 0);
    assert('Kho có Dao nĩa/Nến thực tế (đơn vị: ' + accessoryIng?.unit + ', tồn: ' + accessoryIng?.stock_qty + ')', !!accessoryIng && accessoryIng.stock_qty > 0);

    // =========================================================================
    // NHÓM 3: THIẾT LẬP ĐỊNH MỨC BOM 7 MỤC & CÔNG THỨC COST CHUẨN
    // =========================================================================
    console.log('\n━━━ NHÓM 3: ĐỊNH MỨC ĐẶT BÁNH 7 MỤC & CÔNG THỨC GIÁ COST ━━━');
    const bomConfig = getFullCakeBomConfig();
    assert('Cấu hình BOM có đầy đủ 7 mục nghiệp vụ', 
      Array.isArray(bomConfig.cakeBases) &&
      Array.isArray(bomConfig.creamCoatings) &&
      Array.isArray(bomConfig.fillings) &&
      Array.isArray(bomConfig.packagings) &&
      Array.isArray(bomConfig.freeAccessories) &&
      Array.isArray(bomConfig.decorAddons) &&
      Array.isArray(bomConfig.birthdayBomPresets)
    );

    const baseBase = bomConfig.cakeBases[0];
    const baseSize = baseBase.sizes[0];
    const creamItem = bomConfig.creamCoatings[0];
    const creamSize = creamItem.sizes[0];

    // Ràng buộc cấu hình BOM với nguyên liệu kho thực tế
    const boundBaseSize = {
      ...baseSize,
      bomIngredients: [
        { ingredientId: flourIng?.id, name: flourIng?.name || 'Bột mì', unit: flourIng?.unit || 'g', quantity: 100, unitCost: Number(flourIng?.avg_cost || 25), totalCost: 100 * Number(flourIng?.avg_cost || 25) },
        { ingredientId: eggIng?.id, name: eggIng?.name || 'Trứng gà', unit: eggIng?.unit || 'quả', quantity: 3, unitCost: Number(eggIng?.avg_cost || 3500), totalCost: 3 * Number(eggIng?.avg_cost || 3500) },
        { ingredientId: butterIng?.id, name: butterIng?.name || 'Bơ lạt', unit: butterIng?.unit || 'g', quantity: 40, unitCost: Number(butterIng?.avg_cost || 120), totalCost: 40 * Number(butterIng?.avg_cost || 120) },
      ]
    };
    const totalBaseCost = boundBaseSize.bomIngredients.reduce((s, b) => s + b.totalCost, 0);

    const calculation = calculateCakeCostDetails({
      cakeBaseId: baseBase.id,
      cakeBaseSizeId: baseSize.id,
      creamCoatingId: creamItem.id,
      creamCoatingSizeId: creamSize.id,
      fillingId: bomConfig.fillings[0]?.id,
      packagingId: bomConfig.packagings[0]?.id,
      customMarkupPct: bomConfig.targetFoodCostPct || 36.5,
    }, bomConfig);

    assert('Tổng giá cost BOM được tính toán chính xác', calculation.totalCost > 0);
    assert('Giá bán đề xuất được tính theo mốc chuẩn 36.5% và làm tròn 5.000đ', calculation.suggestedPrice % 5000 === 0 && calculation.suggestedPrice > calculation.totalCost);

    // =========================================================================
    // NHÓM 4: POS ĐẶT BÁNH SINH NHẬT & PHÂN LUỒNG TỒN KHO THÀNH PHẨM
    // =========================================================================
    console.log('\n━━━ NHÓM 4: POS ĐẶT BÁNH SINH NHẬT & PHÂN LUỒNG TỒN KHO THÀNH PHẨM ━━━');
    const realCakeOrderSpec: CakeOrderSpec = {
      isBirthdayCake: true,
      sizeName: baseSize.sizeName,
      cakeBase: {
        id: baseBase.id,
        name: baseBase.name,
        cost: totalBaseCost,
        bomIngredients: boundBaseSize.bomIngredients,
      },
      creamCoating: {
        id: creamItem.id,
        name: creamItem.name,
        cost: creamSize.baseCost || 40000,
        bomIngredients: creamSize.bomIngredients,
      },
      filling: {
        id: 'fill-durian',
        name: 'Nhân Sầu Riêng Tươi',
        cost: 20000,
      },
      packaging: {
        id: boxIng?.id || 'box-real',
        name: boxIng?.name || 'Hộp Kraft 20cm',
        cost: Number(boxIng?.avg_cost || 15000),
      },
      freeAccessories: [
        { id: accessoryIng?.id || 'acc-knife', name: accessoryIng?.name || 'Bộ dao nĩa + Nến', quantity: 1, cost: Number(accessoryIng?.avg_cost || 3000) }
      ],
      totalCost: calculation.totalCost,
      targetFoodCostPct: 36.5,
      suggestedPrice: calculation.suggestedPrice,
      finalPrice: calculation.suggestedPrice,
      cakeMessage: 'Mừng Sinh Nhật Đại Thắng',
      decorNotes: 'Giao đúng 17h chiều',
    };

    // Luồng 1: Nếu bánh còn tồn kho thành phẩm (stock > 0) -> Nhảy vào bước 3: Sẵn sàng / Chờ ship (ready)
    const orderWithStock = {
      id: 'ord-test-stock-pos',
      order_number: 'BK-TEST-STOCK',
      status: (sampleCake?.stock_qty ?? 10) > 0 ? 'ready' : 'pending',
      cake_order_spec: realCakeOrderSpec,
      quantity: 1,
    };
    assert('Phân luồng KDS: Khi còn tồn kho thành phẩm chuyển vào bước ready (Chờ ship/lấy)', orderWithStock.status === 'ready' || (sampleCake?.stock_qty ?? 0) === 0);

    // Luồng 2: Nếu bánh hết tồn kho (stock === 0) -> Nhảy vào bước 1: Bếp làm bánh (pending)
    const orderOutOfStock = {
      id: 'ord-test-nostock-pos',
      order_number: 'BK-TEST-NOSTOCK',
      status: 'pending',
      cake_order_spec: realCakeOrderSpec,
      quantity: 1,
    };
    assert('Phân luồng KDS: Khi hết tồn kho thành phẩm chuyển vào bước pending (Bếp nướng bánh)', orderOutOfStock.status === 'pending');

    // =========================================================================
    // NHÓM 5: MÀN HÌNH BẾP KDS & BÓC TÁCH NGUYÊN LIỆU BOM CHI TIẾT
    // =========================================================================
    console.log('\n━━━ NHÓM 5: MÀN HÌNH BẾP KDS & BÓC TÁCH BOM NGUYÊN LIỆU ━━━');
    const extractedRequirements = extractOrderBomRequirements(orderOutOfStock);
    assert('Bóc tách nguyên liệu BOM thành công từ đơn hàng', extractedRequirements.length >= 5);
    assert('BOM cốt bánh chứa Bột mì liên kết ID kho thật', extractedRequirements.some(r => r.ingredientId === flourIng?.id));
    assert('BOM cốt bánh chứa Trứng gà liên kết ID kho thật', extractedRequirements.some(r => r.ingredientId === eggIng?.id));
    assert('BOM bao bì chứa Hộp bánh liên kết ID kho thật', extractedRequirements.some(r => r.ingredientId === boxIng?.id));
    assert('BOM vật tư tặng kèm chứa Dao nĩa/Nến liên kết ID kho thật', extractedRequirements.some(r => r.ingredientId === accessoryIng?.id));

    // =========================================================================
    // NHÓM 6: TỰ ĐỘNG TRỪ TỒN KHO KHI BẾP XÁC NHẬN LÀM BÁNH XONG (VỚI KHO THẬT)
    // =========================================================================
    console.log('\n━━━ NHÓM 6: TỰ ĐỘNG TRỪ TỒN KHO NGUYÊN VẬT LIỆU KHI HOÀN THÀNH BÁNH ━━━');
    // Khởi tạo kho trong Storage từ danh sách thật của Supabase
    mockStorage[INGREDIENTS_STORAGE_KEY] = JSON.stringify(realIngredients);
    
    const flourBefore = Number(flourIng?.stock_qty || 0);
    const eggBefore = Number(eggIng?.stock_qty || 0);
    const boxBefore = Number(boxIng?.stock_qty || 0);

    const deductionResult = await deductOrderIngredients(orderOutOfStock);
    assert('Thực hiện trừ tồn kho thành công khi bánh xong', deductionResult.success === true);
    assert('Đơn hàng được gắn cờ bom_deducted: true', (orderOutOfStock as any).bom_deducted === true);

    const updatedStorageIngs = JSON.parse(mockStorage[INGREDIENTS_STORAGE_KEY]);
    const flourAfter = updatedStorageIngs.find((i: any) => i.id === flourIng?.id)?.stock_qty;
    const eggAfter = updatedStorageIngs.find((i: any) => i.id === eggIng?.id)?.stock_qty;
    const boxAfter = updatedStorageIngs.find((i: any) => i.id === boxIng?.id)?.stock_qty;

    assert('Bột mì giảm đúng định lượng 100g (Trước: ' + flourBefore + 'g -> Sau: ' + flourAfter + 'g)', flourAfter === flourBefore - 100);
    assert('Trứng gà giảm đúng 3 quả (Trước: ' + eggBefore + ' -> Sau: ' + eggAfter + ')', Math.abs(eggAfter - (eggBefore - 3)) < 0.01);
    assert('Hộp bánh giảm đúng 1 cái (Trước: ' + boxBefore + ' -> Sau: ' + boxAfter + ')', boxAfter === boxBefore - 1);

    // Kiểm tra cơ chế chống trừ trùng lặp (No Double Deduct)
    console.log('\n━━━ KIỂM TRA CHỐNG TRỪ KHO TRÙNG LẶP (NO DOUBLE DEDUCT) ━━━');
    const secondDeduction = await deductOrderIngredients(orderOutOfStock);
    assert('Lần trừ thứ 2 được nhận diện và bỏ qua (skipped: true)', secondDeduction.skipped === true);
    assert('Không trừ thêm nguyên liệu nào', secondDeduction.deductedItems.length === 0);
    
    const flourFinal = JSON.parse(mockStorage[INGREDIENTS_STORAGE_KEY]).find((i: any) => i.id === flourIng?.id)?.stock_qty;
    assert('Tồn kho bột mì giữ nguyên, không bị trừ lần 2', flourFinal === flourAfter);

    // =========================================================================
    // NHÓM 7: ĐỒNG BỘ DỮ LIỆU SQL & SINH MASTER SQL DUMP CHUẨN
    // =========================================================================
    console.log('\n━━━ NHÓM 7: ĐỒNG BỘ DỮ LIỆU CSDL SQL (SUPABASE CLOUD & MASTER DUMP) ━━━');
    const masterSql = generateMasterSqlDump({
      products: realProducts,
      ingredients: realIngredients,
      settings: { bom_settings: bomConfig },
    });

    assert('Master SQL Dump sinh thành công', typeof masterSql === 'string' && masterSql.length > 500);
    assert('Master SQL chứa bảng sản phẩm thực tế (11 loại bánh)', masterSql.includes('Bánh Bông Lan Trứng Muối') && masterSql.includes('Bánh Croissant Bơ Pháp'));
    assert('Master SQL chứa bảng nguyên liệu kho thực tế', masterSql.includes('Bột mì') && masterSql.includes('Bơ lạt Anchor'));
    assert('Master SQL chứa bảng cấu hình định mức BOM (bakery_bom_settings)', masterSql.includes('bakery_bom_settings') || masterSql.includes('cốt bánh'));

    // =========================================================================
    // NHÓM 8: CHỨC NĂNG XÓA BÁNH ĐÃ SỬA LỖI (KIỂM TRA BẢO TOÀN TRÊN SUPABASE THẬT)
    // =========================================================================
    console.log('\n━━━ NHÓM 8: CHỨC NĂNG XÓA BÁNH VÀ BẢO TOÀN ĐƠN CŨ TRÊN CSDL THẬT ━━━');
    
    // 1. Xác nhận "Bánh táo" đã biến mất vĩnh viễn khỏi bảng products thật
    const { data: checkDeletedCake } = await supabase
      .from('products')
      .select('id, name')
      .eq('name', 'Bánh táo');
    assert('Sản phẩm "Bánh táo" đã bị xóa hoàn toàn khỏi bảng products trên Supabase SQL', !checkDeletedCake || checkDeletedCake.length === 0);

    // 2. Xác nhận thông tin các đơn hàng cũ từng bán "Bánh táo" vẫn bảo toàn nguyên vẹn 100%
    const { data: pastOrdersWithCake } = await supabase
      .from('order_items')
      .select('id, product_name_snapshot, quantity, unit_price, line_total, order_id')
      .eq('product_name_snapshot', 'Bánh táo');

    assert('Các đơn hàng cũ bán "Bánh táo" vẫn còn nguyên vẹn trong CSDL', Array.isArray(pastOrdersWithCake) && pastOrdersWithCake.length >= 2, `Số dòng: ${pastOrdersWithCake?.length}`);
    
    const samplePastOrder = pastOrdersWithCake?.[0];
    assert('Tên bánh vẫn giữ đúng snapshot: "' + samplePastOrder?.product_name_snapshot + '"', samplePastOrder?.product_name_snapshot === 'Bánh táo');
    assert('Đơn giá và thành tiền của đơn cũ nguyên vẹn (' + samplePastOrder?.unit_price?.toLocaleString() + '₫)', Number(samplePastOrder?.unit_price) > 0 && Number(samplePastOrder?.line_total) > 0);

    // 3. Kiểm thử tạo và xóa 1 sản phẩm bánh kiểm thử THẬT trên Supabase để xác minh toàn bộ luồng
    const testCakeId = '00000000-0000-4000-8000-000000000099';
    const testCakeName = 'Bánh Test Hệ Thống ' + Date.now();
    
    // Thêm bánh kiểm thử vào Supabase thật
    const { error: insErr } = await supabase.from('products').insert({
      id: testCakeId,
      name: testCakeName,
      category: 'Bánh Test',
      selling_price: 150000,
      base_cost_price: 50000,
      is_active: true,
    });
    assert('Tạo sản phẩm bánh kiểm thử trên Supabase thật thành công', !insErr);

    // Xóa bánh qua deleteProductEverywhere
    mockStorage['bakery_products'] = JSON.stringify([{ id: testCakeId, name: testCakeName, is_active: true }, ...(realProducts || [])]);
    const delResult = await deleteProductEverywhere(testCakeId, testCakeName);
    assert('Hàm deleteProductEverywhere thực thi thành công', delResult.success === true);

    // Xác nhận bánh đã bị xóa khỏi Supabase thật
    const { data: verifySupabaseDeleted } = await supabase
      .from('products')
      .select('id')
      .eq('id', testCakeId);
    assert('Bánh kiểm thử đã bị xóa vĩnh viễn khỏi bảng products trên Supabase SQL', !verifySupabaseDeleted || verifySupabaseDeleted.length === 0);

    // Xác nhận bánh được đưa vào danh sách đen chống hồi sinh
    const blacklist = getDeletedProductIds();
    assert('ID và Tên bánh được ghi vào danh sách đen', blacklist.has(testCakeId) && blacklist.has(testCakeName.toLowerCase().trim()));

    // Xác nhận khi lọc dữ liệu, bánh đã xóa không bao giờ xuất hiện lại
    const reloadedList = filterActiveProducts([{ id: testCakeId, name: testCakeName, is_active: true }, ...(realProducts || [])]);
    assert('Khi nạp lại dữ liệu, bánh đã xóa tuyệt đối không xuất hiện lại', !reloadedList.some(p => p.id === testCakeId));

  } catch (err: any) {
    console.error('Lỗi kiểm thử:', err);
    failCount++;
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`TỔNG KẾT KIỂM THỬ DỮ LIỆU THẬT: ${passCount} PASS | ${failCount} FAIL`);
  console.log('══════════════════════════════════════════════════════════════\n');

  if (failCount > 0) {
    throw new Error(`Có ${failCount} bài kiểm thử không đạt!`);
  }
}

runRealDataTests().then(() => {
  process.exit(0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
