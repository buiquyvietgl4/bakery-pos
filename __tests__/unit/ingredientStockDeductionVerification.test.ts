import { describe, it, expect, beforeEach } from 'vitest';
import {
  deductRecipeIngredients,
  deductOrderIngredients,
  extractOrderBomRequirements,
  getBakeryIngredients,
  saveBakeryIngredients,
  convertIngredientQuantity,
  normalizeVietnamese,
} from '@/lib/utils/inventoryDeductionManager';
import { getBakingHistory } from '@/lib/utils/bakingHistoryManager';
import { saveSqlModeConfig } from '@/lib/utils/sqlModeManager';

describe('BÀI TEST TOÀN DIỆN: KIỂM TRA TRỪ TỒN KHO NGUYÊN LIỆU (BÁNH THƯỜNG BOM & BÁNH SINH NHẬT CÓ BOM)', () => {
  beforeEach(() => {
    localStorage.clear();
    saveSqlModeConfig({ mode: 'local' });
  });

  // =========================================================================
  // PHẦN 1: QUY ĐỔI ĐƠN VỊ VÀ CHUẨN HÓA TIẾNG VIỆT
  // =========================================================================
  describe('1. Quy đổi đơn vị & Chuẩn hóa định mức', () => {
    it('quy đổi chính xác giữa gram (g) và kilogram (kg)', () => {
      expect(convertIngredientQuantity(500, 'g', 'kg')).toBe(0.5);
      expect(convertIngredientQuantity(1200, 'gram', 'kg')).toBe(1.2);
      expect(convertIngredientQuantity(2.5, 'kg', 'g')).toBe(2500);
      expect(convertIngredientQuantity(0.3, 'kilogram', 'gr')).toBe(300);
    });

    it('quy đổi chính xác giữa mililit (ml) và lít (l)', () => {
      expect(convertIngredientQuantity(250, 'ml', 'l')).toBe(0.25);
      expect(convertIngredientQuantity(1.5, 'l', 'ml')).toBe(1500);
      expect(convertIngredientQuantity(750, 'mililit', 'lít')).toBe(0.75);
    });

    it('giữ nguyên số lượng nếu cùng đơn vị hoặc đơn vị cái/quả/hộp', () => {
      expect(convertIngredientQuantity(5, 'quả', 'quả')).toBe(5);
      expect(convertIngredientQuantity(2, 'hộp', 'hộp')).toBe(2);
      expect(convertIngredientQuantity(100, 'g', 'g')).toBe(100);
    });

    it('chuẩn hóa tiếng Việt không dấu chuẩn xác để so khớp nguyên liệu', () => {
      expect(normalizeVietnamese('Bột Mì Số 8 Bông Hồng')).toBe('bot mi so 8 bong hong');
      expect(normalizeVietnamese('Đường Cát Trắng Biên Hòa')).toBe('duong cat trang bien hoa');
      expect(normalizeVietnamese('Trứng Gà Ta')).toBe('trung ga ta');
    });
  });

  // =========================================================================
  // PHẦN 2: BÁNH THƯỜNG THEO BOM (RECIPES)
  // =========================================================================
  describe('2. Trừ tồn nguyên liệu khi làm Bánh Thường theo BOM (deductRecipeIngredients)', () => {
    it('TEST 2.1: Trừ tồn kho chính xác theo 1 mẻ tiêu chuẩn (Bánh mì Baguette Pháp)', async () => {
      // 1. Thiết lập kho ban đầu
      const initialWarehouse = [
        { id: 'ing-flour-t55', name: 'Bột mì T55 Pháp', unit: 'g', stock_qty: 10000, avg_cost: 25 },
        { id: 'ing-yeast', name: 'Men nở tươi Mauri', unit: 'g', stock_qty: 1000, avg_cost: 80 },
        { id: 'ing-salt', name: 'Muối tinh sấy', unit: 'g', stock_qty: 5000, avg_cost: 10 },
        { id: 'ing-water', name: 'Nước lọc tinh khiết', unit: 'ml', stock_qty: 20000, avg_cost: 1 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      // 2. Định mức BOM: 1 mẻ ra 10 ổ bánh mì Baguette
      const baguetteRecipe = {
        id: 'rec-baguette-01',
        name: 'Bánh mì Baguette Pháp',
        yield_qty: 10,
        yield_unit: 'ổ',
        items: [
          { ingredient_id: 'ing-flour-t55', name: 'Bột mì T55 Pháp', quantity: 600, unit: 'g', cost: 15000 },
          { ingredient_id: 'ing-yeast', name: 'Men nở tươi Mauri', quantity: 15, unit: 'g', cost: 1200 },
          { ingredient_id: 'ing-salt', name: 'Muối tinh sấy', quantity: 10, unit: 'g', cost: 100 },
          { ingredient_id: 'ing-water', name: 'Nước lọc tinh khiết', quantity: 380, unit: 'ml', cost: 380 },
        ],
      };

      // 3. Thực hiện làm mẻ 10 ổ
      const result = await deductRecipeIngredients(baguetteRecipe, 10, {
        performedBy: 'Thợ trưởng Nguyễn Văn A',
        notes: 'Mẻ bánh mì buổi sáng 6h',
      });

      // 4. Kiểm tra kết quả trả về
      expect(result.success).toBe(true);
      expect(result.deductedItems.length).toBe(4);
      expect(result.totalCost).toBe(15000 + 1200 + 100 + 380);

      // 5. Kiểm tra TỒN KHO THỰC TẾ sau khi trừ
      const currentStock = getBakeryIngredients();
      const flour = currentStock.find((i) => i.id === 'ing-flour-t55');
      const yeast = currentStock.find((i) => i.id === 'ing-yeast');
      const salt = currentStock.find((i) => i.id === 'ing-salt');
      const water = currentStock.find((i) => i.id === 'ing-water');

      expect(flour?.stock_qty).toBe(9400); // 10000 - 600
      expect(yeast?.stock_qty).toBe(985);  // 1000 - 15
      expect(salt?.stock_qty).toBe(4990);  // 5000 - 10
      expect(water?.stock_qty).toBe(19620); // 20000 - 380

      // 6. Kiểm tra Lịch Sử Làm Bánh (Baking History)
      const history = getBakingHistory();
      expect(history.length).toBe(1);
      expect(history[0].cakeName).toBe('Bánh mì Baguette Pháp');
      expect(history[0].quantity).toBe(10);
      expect(history[0].performedBy).toBe('Thợ trưởng Nguyễn Văn A');
      expect(history[0].ingredients.length).toBe(4);
    });

    it('TEST 2.2: Tự động nhân tỷ lệ mẻ chính xác (Làm 25 cái khi định mức chuẩn là 10 cái -> x2.5)', async () => {
      const initialWarehouse = [
        { id: 'ing-flour', name: 'Bột mì số 13', unit: 'g', stock_qty: 8000, avg_cost: 30 },
        { id: 'ing-butter', name: 'Bơ lạt Elle & Vire', unit: 'g', stock_qty: 3000, avg_cost: 250 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      // Định mức chuẩn: 10 cái Croissant cần 500g bột và 200g bơ
      const croissantRecipe = {
        id: 'rec-croissant',
        name: 'Bánh Croissant Bơ Pháp',
        yield_qty: 10,
        yield_unit: 'cái',
        items: [
          { ingredient_id: 'ing-flour', name: 'Bột mì số 13', quantity: 500, unit: 'g' },
          { ingredient_id: 'ing-butter', name: 'Bơ lạt Elle & Vire', quantity: 200, unit: 'g' },
        ],
      };

      // Làm 25 cái -> multiplier = 25 / 10 = 2.5
      // Bột cần: 500 * 2.5 = 1250g
      // Bơ cần: 200 * 2.5 = 500g
      const result = await deductRecipeIngredients(croissantRecipe, 25);
      expect(result.success).toBe(true);

      const currentStock = getBakeryIngredients();
      const flour = currentStock.find((i) => i.id === 'ing-flour');
      const butter = currentStock.find((i) => i.id === 'ing-butter');

      expect(flour?.stock_qty).toBe(6750); // 8000 - 1250
      expect(butter?.stock_qty).toBe(2500); // 3000 - 500
    });

    it('TEST 2.3: Tự động quy đổi đơn vị kho kg <-> g khi BOM tính theo g nhưng kho tính theo kg', async () => {
      const initialWarehouse = [
        // Kho lưu trữ đơn vị KG: tồn 25 kg bột
        { id: 'ing-flour-kg', name: 'Bột mì hoa ngọc lan', unit: 'kg', stock_qty: 25, avg_cost: 22000 },
        // Kho lưu trữ đơn vị LÍT: tồn 10 lít sữa
        { id: 'ing-milk-l', name: 'Sữa tươi Dalat Milk', unit: 'l', stock_qty: 10, avg_cost: 35000 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      const milkBreadRecipe = {
        id: 'rec-milk-bread',
        name: 'Bánh Mì Sữa Mềm',
        yield_qty: 5,
        yield_unit: 'ổ',
        items: [
          // Định mức BOM tính bằng g: 500g bột mì
          { ingredient_id: 'ing-flour-kg', name: 'Bột mì hoa ngọc lan', quantity: 500, unit: 'g' },
          // Định mức BOM tính bằng ml: 250ml sữa tươi
          { ingredient_id: 'ing-milk-l', name: 'Sữa tươi Dalat Milk', quantity: 250, unit: 'ml' },
        ],
      };

      // Làm 5 ổ (1 mẻ)
      // 500g bột -> 0.5kg
      // 250ml sữa -> 0.25l
      const result = await deductRecipeIngredients(milkBreadRecipe, 5);
      expect(result.success).toBe(true);

      const currentStock = getBakeryIngredients();
      const flour = currentStock.find((i) => i.id === 'ing-flour-kg');
      const milk = currentStock.find((i) => i.id === 'ing-milk-l');

      expect(flour?.stock_qty).toBe(24.5); // 25kg - 0.5kg = 24.5kg
      expect(milk?.stock_qty).toBe(9.75);  // 10l - 0.25l = 9.75l
    });

    it('TEST 2.4: Khớp nguyên liệu theo tên không dấu nếu ID trong BOM không có sẵn', async () => {
      const initialWarehouse = [
        { id: 'real-id-99', name: 'Đường cát trắng Biên Hòa', unit: 'g', stock_qty: 5000, avg_cost: 24 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      const recipe = {
        id: 'rec-cookie',
        name: 'Bánh Quy Bơ',
        yield_qty: 1,
        items: [
          // Tên không dấu, không có ID
          { name: 'Duong cat trang Bien Hoa', quantity: 200, unit: 'g' },
        ],
      };

      const result = await deductRecipeIngredients(recipe, 1);
      expect(result.success).toBe(true);
      expect(result.deductedItems.length).toBe(1);

      const currentStock = getBakeryIngredients();
      const sugar = currentStock.find((i) => i.id === 'real-id-99');
      expect(sugar?.stock_qty).toBe(4800); // 5000 - 200
    });
  });

  // =========================================================================
  // PHẦN 3: BÁNH SINH NHẬT CÓ BOM (CAKE_ORDER_SPEC & KDS DEDUCTION)
  // =========================================================================
  describe('3. Trừ tồn nguyên liệu khi làm Bánh Sinh Nhật có BOM (deductOrderIngredients)', () => {
    it('TEST 3.1: Trừ toàn diện Cốt Bánh + Kem Phủ + Hộp + Phụ Kiện + Decor cho bánh sinh nhật chuẩn', async () => {
      // 1. Thiết lập kho nguyên vật liệu đầy đủ
      const initialWarehouse = [
        // A. Cốt bánh
        { id: 'ing-flour-cake', name: 'Bột mì bông lan số 8', unit: 'g', stock_qty: 10000, avg_cost: 25 },
        { id: 'ing-egg', name: 'Trứng gà tươi Ba Huân', unit: 'quả', stock_qty: 200, avg_cost: 3000 },
        { id: 'ing-sugar-fine', name: 'Đường xay Biên Hòa', unit: 'g', stock_qty: 8000, avg_cost: 30 },
        // B. Kem phủ
        { id: 'ing-whip-anchor', name: 'Kem Whipping Anchor', unit: 'ml', stock_qty: 15000, avg_cost: 160 },
        { id: 'ing-vanilla', name: 'Chiết xuất Vani tự nhiên', unit: 'ml', stock_qty: 500, avg_cost: 400 },
        // C. Nhân bánh
        { id: 'ing-straw-jam', name: 'Mứt dâu tây Đà Lạt', unit: 'phần', stock_qty: 50, avg_cost: 15000 },
        // D. Hộp bao bì
        { id: 'box-mica-18', name: 'Hộp Mica Trong Suốt 18cm', unit: 'cái', stock_qty: 100, avg_cost: 25000 },
        // E. Vật tư tặng kèm
        { id: 'acc-knife', name: 'Dao cắt bánh sinh nhật', unit: 'cái', stock_qty: 300, avg_cost: 2000 },
        { id: 'acc-candle', name: 'Nến xoắn sinh nhật cao cấp', unit: 'cái', stock_qty: 500, avg_cost: 1500 },
        // F. Phụ kiện decor
        { id: 'decor-crown', name: 'Vương miện công chúa nhỏ', unit: 'cái', stock_qty: 40, avg_cost: 18000 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      // 2. Tạo đơn bánh sinh nhật với CakeOrderSpec đầy đủ theo flowchart
      const birthdayOrder: any = {
        id: 'ord-bday-1001',
        order_number: 'ORD-1001',
        cake_name: 'Bánh Sinh Nhật Công Chúa Vương Miện 18cm',
        status: 'in_progress',
        quantity: 1,
        cake_order_spec: {
          isBirthdayCake: true,
          sizeName: 'Size 18cm',
          diameterCm: 18,
          // Định mức cốt bánh
          cakeBase: {
            id: 'base-vanilla',
            name: 'Cốt Vani truyền thống',
            cost: 25000,
            bomIngredients: [
              { ingredientId: 'ing-flour-cake', name: 'Bột mì bông lan số 8', unit: 'g', quantity: 200, unitCost: 25, totalCost: 5000 },
              { ingredientId: 'ing-egg', name: 'Trứng gà tươi Ba Huân', unit: 'quả', quantity: 4, unitCost: 3000, totalCost: 12000 },
              { ingredientId: 'ing-sugar-fine', name: 'Đường xay Biên Hòa', unit: 'g', quantity: 120, unitCost: 30, totalCost: 3600 },
            ],
          },
          // Định mức kem phủ
          creamCoating: {
            id: 'cream-whipping',
            name: 'Kem Whipping Anchor',
            cost: 65000,
            bomIngredients: [
              { ingredientId: 'ing-whip-anchor', name: 'Kem Whipping Anchor', unit: 'ml', quantity: 400, unitCost: 160, totalCost: 64000 },
              { ingredientId: 'ing-vanilla', name: 'Chiết xuất Vani tự nhiên', unit: 'ml', quantity: 5, unitCost: 400, totalCost: 2000 },
            ],
          },
          // Nhân bánh
          filling: {
            id: 'ing-straw-jam',
            name: 'Mứt dâu tây Đà Lạt',
            cost: 15000,
          },
          // Hộp bánh
          packaging: {
            id: 'box-mica-18',
            name: 'Hộp Mica Trong Suốt 18cm',
            cost: 25000,
          },
          // Phụ kiện tặng kèm
          freeAccessories: [
            { id: 'acc-knife', name: 'Dao cắt bánh sinh nhật', quantity: 1, cost: 2000 },
            { id: 'acc-candle', name: 'Nến xoắn sinh nhật cao cấp', quantity: 5, cost: 7500 },
          ],
          // Phụ kiện decor thêm
          decorAddons: [
            { id: 'decor-crown', name: 'Vương miện công chúa nhỏ', cost: 18000, price: 35000 },
          ],
          totalCost: 157500,
          suggestedPrice: 380000,
          finalPrice: 380000,
        },
      };

      // 3. Thực hiện trừ kho khi bánh hoàn thành (KDS chuyển trạng thái Ready)
      const deductionResult = await deductOrderIngredients(birthdayOrder);

      // 4. Kiểm tra kết quả trừ kho
      expect(deductionResult.success).toBe(true);
      expect(deductionResult.skipped).toBeFalsy();
      expect(deductionResult.deductedItems.length).toBe(10); // Cả 10 loại vật tư

      // 5. Kiểm tra CỜ BẢO VỆ CHỐNG TRỪ LẶP được gắn vào đơn hàng
      expect(birthdayOrder.bom_deducted).toBe(true);
      expect(birthdayOrder.inventory_deducted).toBe(true);
      expect((birthdayOrder as any).deducted_at).toBeDefined();

      // 6. Kiểm tra CHÍNH XÁC TỪNG TỒN KHO NGUYÊN LIỆU SAU KHI TRỪ
      const stock = getBakeryIngredients();
      const flour = stock.find((i) => i.id === 'ing-flour-cake');
      const egg = stock.find((i) => i.id === 'ing-egg');
      const sugar = stock.find((i) => i.id === 'ing-sugar-fine');
      const cream = stock.find((i) => i.id === 'ing-whip-anchor');
      const vanilla = stock.find((i) => i.id === 'ing-vanilla');
      const jam = stock.find((i) => i.id === 'ing-straw-jam');
      const box = stock.find((i) => i.id === 'box-mica-18');
      const knife = stock.find((i) => i.id === 'acc-knife');
      const candle = stock.find((i) => i.id === 'acc-candle');
      const crown = stock.find((i) => i.id === 'decor-crown');

      expect(flour?.stock_qty).toBe(9800);    // 10000 - 200g
      expect(egg?.stock_qty).toBe(196);       // 200 - 4 quả
      expect(sugar?.stock_qty).toBe(7880);    // 8000 - 120g
      expect(cream?.stock_qty).toBe(14600);   // 15000 - 400ml
      expect(vanilla?.stock_qty).toBe(495);    // 500 - 5ml
      expect(jam?.stock_qty).toBe(49);        // 50 - 1 phần
      expect(box?.stock_qty).toBe(99);        // 100 - 1 cái
      expect(knife?.stock_qty).toBe(299);     // 300 - 1 cái
      expect(candle?.stock_qty).toBe(495);    // 500 - 5 cái
      expect(crown?.stock_qty).toBe(39);      // 40 - 1 cái

      // 7. Kiểm tra Lịch Sử Làm Bánh tự động lưu log
      const logs = getBakingHistory();
      expect(logs.length).toBe(1);
      expect(logs[0].cakeCategory).toBe('birthday');
      expect(logs[0].orderNumber).toBe('ORD-1001');
      expect(logs[0].ingredients.length).toBe(10);
    });

    it('TEST 3.2: Chống trừ kho lặp (Anti Double-Deduct) khi đơn hàng đã trừ kho trước đó', async () => {
      const initialWarehouse = [
        { id: 'ing-flour', name: 'Bột mì bánh', unit: 'g', stock_qty: 5000, avg_cost: 20 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      const order: any = {
        id: 'ord-duplicate-test',
        order_number: 'ORD-DUP-01',
        cake_order_spec: {
          isBirthdayCake: true,
          cakeBase: {
            name: 'Cốt Vani',
            bomIngredients: [{ ingredientId: 'ing-flour', name: 'Bột mì bánh', quantity: 250, unit: 'g' }],
          },
        },
      };

      // Lần 1: Trừ kho thành công -> bột mì còn 4750g
      const res1 = await deductOrderIngredients(order);
      expect(res1.success).toBe(true);
      expect(res1.skipped).toBeFalsy();
      expect(order.bom_deducted).toBe(true);

      const stockAfter1 = getBakeryIngredients();
      expect(stockAfter1.find((i) => i.id === 'ing-flour')?.stock_qty).toBe(4750);

      // Lần 2: Gọi trừ kho lại trên đơn hàng này -> PHẢI BỎ QUA ĐỂ CHỐNG TRỪ KÉP
      const res2 = await deductOrderIngredients(order);
      expect(res2.success).toBe(true);
      expect(res2.skipped).toBe(true);
      expect(res2.message).toContain('đã được trừ kho trước đó');

      // Tồn kho vẫn phải là 4750g, TUYỆT ĐỐI KHÔNG BỊ TRỪ THÀNH 4500g
      const stockAfter2 = getBakeryIngredients();
      expect(stockAfter2.find((i) => i.id === 'ing-flour')?.stock_qty).toBe(4750);
    });

    it('TEST 3.3: Nhân đúng số lượng khi khách đặt nhiều chiếc bánh sinh nhật cùng đơn (Multiplier x3)', async () => {
      const initialWarehouse = [
        { id: 'ing-flour', name: 'Bột mì bánh', unit: 'g', stock_qty: 6000, avg_cost: 20 },
        { id: 'box-bday', name: 'Hộp bánh sinh nhật', unit: 'cái', stock_qty: 50, avg_cost: 10000 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      const orderWith3Cakes = {
        id: 'ord-multi-cake',
        order_number: 'ORD-MULTI-03',
        quantity: 3, // Khách đặt 3 cái bánh cùng loại
        cake_order_spec: {
          isBirthdayCake: true,
          cakeBase: {
            name: 'Cốt Vani',
            bomIngredients: [{ ingredientId: 'ing-flour', name: 'Bột mì bánh', quantity: 200, unit: 'g' }],
          },
          packaging: {
            id: 'box-bday',
            name: 'Hộp bánh sinh nhật',
          },
        },
      };

      const result = await deductOrderIngredients(orderWith3Cakes);
      expect(result.success).toBe(true);

      const stock = getBakeryIngredients();
      // Bột: 6000 - (200 * 3) = 5400g
      expect(stock.find((i) => i.id === 'ing-flour')?.stock_qty).toBe(5400);
      // Hộp: 50 - (1 * 3) = 47 cái
      expect(stock.find((i) => i.id === 'box-bday')?.stock_qty).toBe(47);
    });

    it('TEST 3.4: Bánh sinh nhật nhiều tầng (Multi-tier: Tầng 1 22cm + Tầng 2 16cm) trừ kho toàn bộ các tầng', async () => {
      const initialWarehouse = [
        { id: 'ing-flour', name: 'Bột mì số 8', unit: 'g', stock_qty: 5000, avg_cost: 20 },
        { id: 'ing-cream', name: 'Kem tươi whipping', unit: 'ml', stock_qty: 5000, avg_cost: 150 },
        { id: 'box-tier', name: 'Hộp bánh 2 tầng cao cấp', unit: 'cái', stock_qty: 20, avg_cost: 45000 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      const multiTierOrder = {
        id: 'ord-tier-cake',
        order_number: 'ORD-TIER-01',
        cake_order_spec: {
          isBirthdayCake: true,
          tierCount: 2,
          tiers: [
            // Tầng 1 (Đáy 22cm): Cần 350g bột + 450ml kem
            {
              tierIndex: 1,
              tierName: 'Tầng 1 (Đáy 22cm)',
              cakeBase: {
                name: 'Cốt Vani Tầng 1',
                bomIngredients: [{ ingredientId: 'ing-flour', name: 'Bột mì số 8', quantity: 350, unit: 'g' }],
              },
              creamCoating: {
                name: 'Kem Phủ Tầng 1',
                bomIngredients: [{ ingredientId: 'ing-cream', name: 'Kem tươi whipping', quantity: 450, unit: 'ml' }],
              },
            },
            // Tầng 2 (Chóp 16cm): Cần 180g bột + 250ml kem
            {
              tierIndex: 2,
              tierName: 'Tầng 2 (Chóp 16cm)',
              cakeBase: {
                name: 'Cốt Vani Tầng 2',
                bomIngredients: [{ ingredientId: 'ing-flour', name: 'Bột mì số 8', quantity: 180, unit: 'g' }],
              },
              creamCoating: {
                name: 'Kem Phủ Tầng 2',
                bomIngredients: [{ ingredientId: 'ing-cream', name: 'Kem tươi whipping', quantity: 250, unit: 'ml' }],
              },
            },
          ],
          packaging: {
            id: 'box-tier',
            name: 'Hộp bánh 2 tầng cao cấp',
          },
        },
      };

      const result = await deductOrderIngredients(multiTierOrder);
      expect(result.success).toBe(true);

      const stock = getBakeryIngredients();
      // Bột tổng: 350g + 180g = 530g -> 5000 - 530 = 4470g
      expect(stock.find((i) => i.id === 'ing-flour')?.stock_qty).toBe(4470);
      // Kem tổng: 450ml + 250ml = 700ml -> 5000 - 700 = 4300ml
      expect(stock.find((i) => i.id === 'ing-cream')?.stock_qty).toBe(4300);
      // Hộp 2 tầng: 20 - 1 = 19 cái
      expect(stock.find((i) => i.id === 'box-tier')?.stock_qty).toBe(19);
    });

    it('TEST 3.5: Quy đổi đơn vị cho bánh sinh nhật khi kho tính bằng kg/lít còn BOM tính bằng gram/ml', async () => {
      const initialWarehouse = [
        { id: 'ing-flour-kg', name: 'Bột mì búp bê', unit: 'kg', stock_qty: 12, avg_cost: 25000 },
        { id: 'ing-cream-l', name: 'Kem tươi Anchor', unit: 'l', stock_qty: 8, avg_cost: 150000 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      const order = {
        id: 'ord-unit-conv',
        order_number: 'ORD-CONV-01',
        cake_order_spec: {
          isBirthdayCake: true,
          cakeBase: {
            name: 'Cốt Vani',
            bomIngredients: [{ ingredientId: 'ing-flour-kg', name: 'Bột mì búp bê', quantity: 300, unit: 'g' }],
          },
          creamCoating: {
            name: 'Kem Phủ Anchor',
            bomIngredients: [{ ingredientId: 'ing-cream-l', name: 'Kem tươi Anchor', quantity: 500, unit: 'ml' }],
          },
        },
      };

      const result = await deductOrderIngredients(order);
      expect(result.success).toBe(true);

      const stock = getBakeryIngredients();
      const flour = stock.find((i) => i.id === 'ing-flour-kg');
      const cream = stock.find((i) => i.id === 'ing-cream-l');

      // 300g = 0.3kg -> 12kg - 0.3kg = 11.7kg
      expect(flour?.stock_qty).toBe(11.7);
      // 500ml = 0.5l -> 8l - 0.5l = 7.5l
      expect(cream?.stock_qty).toBe(7.5);
    });

    it('TEST 3.6: Trừ kho thành công đối với đơn đặt bánh dạng Custom Cake Modal (custom_cake)', async () => {
      const initialWarehouse = [
        { id: 'base-choc-18', name: 'Cốt bánh Socola 18cm', unit: 'cốt', stock_qty: 15, avg_cost: 35000 },
        { id: 'frosting-cheese', name: 'Kem Phô Mai Mascarpone', unit: 'ml', stock_qty: 3000, avg_cost: 180 },
        { id: 'box-vintage-18', name: 'Hộp Giấy Kraft Vintage 18cm', unit: 'hộp', stock_qty: 40, avg_cost: 12000 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      const customOrder = {
        id: 'ord-custom-cake-01',
        order_number: 'ORD-CUSTOM-01',
        custom_cake: {
          selectedBase: { id: 'base-choc-18', name: 'Cốt bánh Socola 18cm', quantity: 1, unit: 'cốt' },
          selectedFrosting: { id: 'frosting-cheese', name: 'Kem Phô Mai Mascarpone', quantity: 350, unit: 'ml' },
          selectedBox: { id: 'box-vintage-18', name: 'Hộp Giấy Kraft Vintage 18cm', quantity: 1, unit: 'hộp' },
        },
      };

      const result = await deductOrderIngredients(customOrder);
      expect(result.success).toBe(true);
      expect(result.deductedItems.length).toBe(3);

      const stock = getBakeryIngredients();
      expect(stock.find((i) => i.id === 'base-choc-18')?.stock_qty).toBe(14); // 15 - 1
      expect(stock.find((i) => i.id === 'frosting-cheese')?.stock_qty).toBe(2650); // 3000 - 350
      expect(stock.find((i) => i.id === 'box-vintage-18')?.stock_qty).toBe(39); // 40 - 1
    });

    it('TEST 3.7: Fallback trừ kho theo cấu hình Preset đường kính size (bakery_full_bom_config) khi đơn không có spec', async () => {
      // Lưu cấu hình BOM chuẩn vào localStorage
      const mockFullBomConfig = {
        cakeBases: [
          {
            id: 'base-standard',
            name: 'Cốt Bông Lan Chuẩn',
            sizes: [
              {
                diameterCm: 20,
                bomIngredients: [
                  { ingredientId: 'ing-sugar', name: 'Đường cát', quantity: 150, unit: 'g' },
                ],
              },
            ],
          },
        ],
      };
      localStorage.setItem('bakery_full_bom_config', JSON.stringify(mockFullBomConfig));

      const initialWarehouse = [
        { id: 'ing-sugar', name: 'Đường cát', unit: 'g', stock_qty: 2000, avg_cost: 20 },
      ];
      await saveBakeryIngredients(initialWarehouse);

      // Đơn hàng chỉ có cake_name: "Bánh Sinh Nhật Dâu Tây 20cm"
      const fallbackOrder = {
        id: 'ord-fallback-20',
        order_number: 'ORD-FB-20',
        cake_name: 'Bánh Sinh Nhật Dâu Tây 20cm',
      };

      const result = await deductOrderIngredients(fallbackOrder);
      expect(result.success).toBe(true);
      expect(result.deductedItems.length).toBe(1);

      const stock = getBakeryIngredients();
      expect(stock.find((i) => i.id === 'ing-sugar')?.stock_qty).toBe(1850); // 2000 - 150
    });
  });
});
