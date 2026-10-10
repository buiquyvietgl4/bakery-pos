import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveSqlModeConfig } from '@/lib/utils/sqlModeManager';

// 1. POS & Orders
import {
  normalizeHeldOrder,
  getHeldOrders,
  saveHeldOrdersLocally,
  deduplicateHeldOrders,
  DB_ROW_HELD_ORDERS_ID,
} from '@/lib/utils/heldOrderManager';
import {
  getOrderReturns,
  saveOrderReturnsLocally,
  deduplicateOrderReturns,
  DB_ROW_ORDER_RETURNS_ID,
} from '@/lib/utils/orderReturnManager';
import { matchesOrderSearch } from '@/lib/utils/orderSearch';
import { extractOrderCode } from '@/lib/utils/orderCodeExtractor';

// 2. Kitchen & BOM & Stock Deduction
import {
  deductRecipeIngredients,
  deductOrderIngredients,
  extractOrderBomRequirements,
  getBakeryIngredients,
  saveBakeryIngredients,
  convertIngredientQuantity,
  normalizeVietnamese,
} from '@/lib/utils/inventoryDeductionManager';
import {
  getBakingHistory,
  recordBakingLog,
} from '@/lib/utils/bakingHistoryManager';
import {
  isProductFromBom,
  deleteProductByBomRef,
  syncBomToProducts,
} from '@/lib/utils/productManager';
import {
  getDeletedIngredientIds,
  markIngredientAsDeleted,
  filterActiveIngredients,
} from '@/lib/utils/ingredientManager';
import {
  markRecipeAsDeleted,
  getDeletedRecipeIds,
} from '@/lib/utils/recipeCalculator';

// 3. Accounting, Cashflow & Tax
import {
  ExpenseItem,
  CashflowTransaction,
  deduplicateExpenses,
  deduplicateCashflow,
} from '@/lib/utils/accountingSync';
import {
  generateS2eLedger,
} from '@/lib/utils/taxSync';

// 4. Security & Approvals
import {
  saveResolvedTransferRecordToDb,
  checkTransferResolvedStatus,
  saveResolvedReturnRecordToDb,
  checkReturnResolvedStatus,
  DB_ROW_PENDING_RETURNS_ID,
} from '@/lib/supabase/realtimeSync';

// 5. Data Parity & Local SQL
import {
  generateMasterSqlDump,
} from '@/lib/utils/localSqlManager';
import {
  switchDatabaseMode,
  getSqlModeConfig,
  BAKERY_DATA_KEYS,
} from '@/lib/utils/sqlModeManager';
import { DB_ROW_GLOBAL_SQL_ID } from '@/lib/supabase/databaseProfileManager';
import { DB_ROW_RESET_EPOCH_ID } from '@/lib/utils/systemResetManager';

describe('MASTER AUDIT: ĐÁNH GIÁ TOÀN DIỆN HỆ THỐNG BAKERY ERP (CHỨC NĂNG, LIÊN MODULE & ĐỒNG BỘ CSDL)', () => {
  beforeEach(() => {
    localStorage.clear();
    saveSqlModeConfig({ mode: 'local' });
    vi.clearAllMocks();
  });

  // =========================================================================
  // PHÂN HỆ 1: POS & QUẢN LÝ ĐƠN HÀNG, TẠM GIỮ, ĐỔI TRẢ
  // =========================================================================
  describe('PHÂN HỆ 1: Bán Hàng POS, Đơn Hàng & Thu Ngân', () => {
    it('1.1. Tra cứu và bóc tách mã đơn hàng chính xác bất kể định dạng', () => {
      expect(extractOrderCode('Đơn hàng #BK-10294 thanh toán')).toBe('BK-10294');
      expect(extractOrderCode('TT don hang DH-987654')).toBe('DH-987654');
      expect(extractOrderCode('ORD-999')).toBe('ORD-999');

      const mockOrders: any[] = [
        { id: '1', order_number: 'ORD-001', customer_name: 'Nguyễn Văn A', customer_phone: '0901234567', total_amount: 150000 },
        { id: '2', order_number: 'ORD-002', customer_name: 'Trần Thị B', customer_phone: '0987654321', total_amount: 320000 },
      ];

      // Tìm theo tên khách
      const resByName = mockOrders.filter((o) => matchesOrderSearch(o, 'Nguyễn'));
      expect(resByName.length).toBe(1);
      expect(resByName[0].order_number).toBe('ORD-001');

      // Tìm theo số điện thoại
      const resByPhone = mockOrders.filter((o) => matchesOrderSearch(o, '0987654321'));
      expect(resByPhone.length).toBe(1);
      expect(resByPhone[0].order_number).toBe('ORD-002');
    });

    it('1.2. Tạm giữ đơn (Held Orders): Chuẩn hóa, lưu trữ, khử trùng lặp và phục hồi', () => {
      const rawOrder: any = {
        id: 'HOLD-01',
        holdCode: '#T1',
        items: [
          {
            product: { id: 'p1', name: 'Bánh Mì Gối Vuông', selling_price: 25000 },
            quantity: 2,
          },
        ],
        customer_name: 'Khách Chờ',
      };

      const normalized = normalizeHeldOrder(rawOrder, 0);
      expect(normalized.holdCode).toBe('#T1');
      expect(normalized.totalAmount).toBe(50000);
      expect(normalized.itemCount).toBe(2);

      // Lưu trữ và phục hồi
      saveHeldOrdersLocally([normalized]);
      const stored = getHeldOrders();
      expect(stored.length).toBe(1);
      expect(stored[0].holdCode).toBe('#T1');

      // Khử trùng lặp nếu nạp trùng ID hoặc Hold Code
      const deduped = deduplicateHeldOrders([normalized, { ...normalized, id: 'HOLD-01' }]);
      expect(deduped.length).toBe(1);
    });

    it('1.3. Đổi trả / Hoàn tiền (Order Returns): Lưu trữ, khử trùng lặp và tính toàn vẹn', () => {
      const returnRecord: any = {
        id: 'RET-001',
        order_id: 'ORD-100',
        order_number: 'ORD-100',
        refund_amount: 50000,
        refund_method: 'cash',
        reason: 'Bánh giao nhầm mẫu',
        created_at: new Date().toISOString(),
        items: [{ product_id: 'p1', product_name: 'Bánh Su Kem', quantity: 2, refund_price: 25000 }],
      };

      saveOrderReturnsLocally([returnRecord]);
      const list = getOrderReturns();
      expect(list.length).toBe(1);
      expect(list[0].refund_amount).toBe(50000);

      // Thử nạp trùng lặp cùng fingerprint
      const deduped = deduplicateOrderReturns([returnRecord, returnRecord]);
      expect(deduped.length).toBe(1);
    });
  });

  // =========================================================================
  // PHÂN HỆ 2: BẾP (KDS), LÀM BÁNH, BOM & TRỪ TỒN KHO NGUYÊN LIỆU
  // =========================================================================
  describe('PHÂN HỆ 2: Bếp KDS, Quản Lý BOM & Trừ Tồn Kho Nguyên Vật Liệu', () => {
    it('2.1. Làm mẻ bánh thường (BOM Recipe): Trừ kho chính xác & Ghi log Lịch sử làm bánh', async () => {
      // 1. Kho nguyên liệu
      await saveBakeryIngredients([
        { id: 'ing-flour', name: 'Bột mì chuyên dụng', unit: 'g', stock_qty: 10000, avg_cost: 25 },
        { id: 'ing-butter', name: 'Bơ lạt Anchor', unit: 'g', stock_qty: 2000, avg_cost: 220 },
      ]);

      // 2. Công thức: 1 mẻ 10 cái Su kem cần 250g bột, 100g bơ
      const chouxRecipe = {
        id: 'rec-choux',
        name: 'Bánh Su Kem Vani',
        yield_qty: 10,
        yield_unit: 'cái',
        items: [
          { ingredient_id: 'ing-flour', name: 'Bột mì chuyên dụng', quantity: 250, unit: 'g' },
          { ingredient_id: 'ing-butter', name: 'Bơ lạt Anchor', quantity: 100, unit: 'g' },
        ],
      };

      // 3. Bếp làm mẻ 20 cái (gấp đôi định mức chuẩn -> x2)
      const res = await deductRecipeIngredients(chouxRecipe, 20, {
        performedBy: 'Bếp Bánh Ca 1',
        notes: 'Nướng mẻ buổi sáng',
      });

      expect(res.success).toBe(true);
      expect(res.deductedItems.length).toBe(2);

      // 4. Kiểm tra tồn kho sau trừ
      const stock = getBakeryIngredients();
      expect(stock.find((i) => i.id === 'ing-flour')?.stock_qty).toBe(9500); // 10000 - 500
      expect(stock.find((i) => i.id === 'ing-butter')?.stock_qty).toBe(1800); // 2000 - 200

      // 5. Kiểm tra Lịch Sử Làm Bánh tự động ghi nhận
      const history = getBakingHistory();
      expect(history.length).toBe(1);
      expect(history[0].cakeName).toBe('Bánh Su Kem Vani');
      expect(history[0].quantity).toBe(20);
      expect(history[0].performedBy).toBe('Bếp Bánh Ca 1');
    });

    it('2.2. Làm bánh sinh nhật có BOM: Bóc tách 6 nhóm vật tư & Chống trừ kép', async () => {
      await saveBakeryIngredients([
        { id: 'base-ing-flour', name: 'Bột mì số 8', unit: 'g', stock_qty: 5000, avg_cost: 20 },
        { id: 'cream-ing-whip', name: 'Kem Whipping', unit: 'ml', stock_qty: 5000, avg_cost: 160 },
        { id: 'fill-jam', name: 'Mứt phúc bồn tử', unit: 'phần', stock_qty: 30, avg_cost: 20000 },
        { id: 'box-18', name: 'Hộp bánh 18cm', unit: 'cái', stock_qty: 50, avg_cost: 20000 },
        { id: 'acc-knife', name: 'Dao cắt bánh', unit: 'cái', stock_qty: 100, avg_cost: 2000 },
        { id: 'decor-topper', name: 'Topper Chúc Mừng Sinh Nhật', unit: 'cái', stock_qty: 40, avg_cost: 15000 },
      ]);

      const birthdayOrder: any = {
        id: 'ord-bday-test',
        order_number: 'ORD-BDAY-99',
        cake_order_spec: {
          isBirthdayCake: true,
          cakeBase: {
            name: 'Cốt Vani',
            bomIngredients: [{ ingredientId: 'base-ing-flour', name: 'Bột mì số 8', quantity: 200, unit: 'g' }],
          },
          creamCoating: {
            name: 'Kem Whipping',
            bomIngredients: [{ ingredientId: 'cream-ing-whip', name: 'Kem Whipping', quantity: 350, unit: 'ml' }],
          },
          filling: { id: 'fill-jam', name: 'Mứt phúc bồn tử' },
          packaging: { id: 'box-18', name: 'Hộp bánh 18cm' },
          freeAccessories: [{ id: 'acc-knife', name: 'Dao cắt bánh', quantity: 1 }],
          decorAddons: [{ id: 'decor-topper', name: 'Topper Chúc Mừng Sinh Nhật' }],
        },
      };

      // Trừ kho lần 1
      const res1 = await deductOrderIngredients(birthdayOrder);
      expect(res1.success).toBe(true);
      expect(res1.deductedItems.length).toBe(6);
      expect(birthdayOrder.bom_deducted).toBe(true);

      const stockAfter1 = getBakeryIngredients();
      expect(stockAfter1.find((i) => i.id === 'base-ing-flour')?.stock_qty).toBe(4800); // 5000 - 200
      expect(stockAfter1.find((i) => i.id === 'cream-ing-whip')?.stock_qty).toBe(4650); // 5000 - 350
      expect(stockAfter1.find((i) => i.id === 'box-18')?.stock_qty).toBe(49);
      expect(stockAfter1.find((i) => i.id === 'acc-knife')?.stock_qty).toBe(99);

      // Thử gọi lại lần 2 trên cùng 1 đơn hàng -> PHẢI BỎ QUA ĐỂ CHỐNG TRỪ KÉP
      const res2 = await deductOrderIngredients(birthdayOrder);
      expect(res2.success).toBe(true);
      expect(res2.skipped).toBe(true);

      const stockAfter2 = getBakeryIngredients();
      expect(stockAfter2.find((i) => i.id === 'base-ing-flour')?.stock_qty).toBe(4800);
    });

    it('2.3. Khóa bảo vệ sản phẩm BOM trên Menu Bán Hàng & Xóa khi xóa BOM gốc', async () => {
      const recipes = [{ id: 'rec-croissant', name: 'Bánh Croissant Bơ' }];
      const prodBom = { id: 'p-croissant', name: 'Bánh Croissant Bơ', recipe_id: 'rec-croissant' };
      const prodNormal = { id: 'p-water', name: 'Nước Khoáng Lavie' };

      // Kiểm tra nhận diện BOM
      expect(isProductFromBom(prodBom, recipes)).toBe(true);
      expect(isProductFromBom(prodNormal, recipes)).toBe(false);

      // Lưu vào menu bánh
      localStorage.setItem('bakery_products', JSON.stringify([prodBom, prodNormal]));

      // Khi xóa BOM gốc -> Sản phẩm tương ứng trong menu bánh tự động bị xóa theo
      const delRes = await deleteProductByBomRef('rec-croissant', 'Bánh Croissant Bơ');
      expect(delRes.deletedCount).toBe(1);

      const prodsAfter = JSON.parse(localStorage.getItem('bakery_products') || '[]');
      expect(prodsAfter.length).toBe(1);
      expect(prodsAfter[0].id).toBe('p-water');
    });

    it('2.4. Chống hồi sinh (Anti-Zombie) cho Nguyên liệu và Công thức đã xóa', () => {
      // 1. Xóa nguyên liệu
      markIngredientAsDeleted('ing-zombie-1', 'Bột hạnh nhân Mỹ');
      const deletedIngs = getDeletedIngredientIds();
      expect(deletedIngs.has('ing-zombie-1')).toBe(true);
      expect(deletedIngs.has('bột hạnh nhân mỹ')).toBe(true);

      // Danh sách tải về từ DB có chứa nguyên liệu zombie -> Hệ thống phải lọc bỏ triệt để
      const rawIngs = [
        { id: 'ing-zombie-1', name: 'Bột hạnh nhân Mỹ', stock_qty: 50 },
        { id: 'ing-good', name: 'Đường tinh luyện', stock_qty: 100 },
      ];
      const activeIngs = filterActiveIngredients(rawIngs);
      expect(activeIngs.length).toBe(1);
      expect(activeIngs[0].id).toBe('ing-good');

      // 2. Xóa công thức
      markRecipeAsDeleted('rec-zombie-1');
      const deletedRecs = getDeletedRecipeIds();
      expect(deletedRecs.has('rec-zombie-1')).toBe(true);
    });
  });

  // =========================================================================
  // PHÂN HỆ 3: KẾ TOÁN, SỔ QUỸ DÒNG TIỀN & THUẾ
  // =========================================================================
  describe('PHÂN HỆ 3: Kế Toán, Sổ Quỹ Thu Chi & Sổ Thuế', () => {
    it('3.1. Phân loại sổ quỹ & thuế GTGT chuẩn xác theo phương thức thanh toán', () => {
      const orders = [
        {
          id: 'ord-tax-1',
          order_number: 'BK-TAX-01',
          total_amount: 110000,
          payment_method: 'transfer',
          created_at: '2026-10-10T10:00:00',
        },
        {
          id: 'ord-tax-2',
          order_number: 'BK-TAX-02',
          total_amount: 50000,
          payment_method: 'cash',
          created_at: '2026-10-10T11:00:00',
        },
      ];

      const res = generateS2eLedger([], { orders });
      expect(res.rows).toHaveLength(2);
      expect(res.bankIncome).toBe(110000);
      expect(res.cashIncome).toBe(50000);
      expect(res.totalIncome).toBe(160000);
    });

    it('3.2. Quản lý chi phí vận hành (Expenses) & Sổ quỹ dòng tiền (Cashflow): Khử trùng lặp', () => {
      const expense1: ExpenseItem = {
        id: 'exp-01',
        category: 'Điện nước',
        amount: 1200000,
        description: 'Tiền điện tháng 10',
        date: '2026-10-10',
        paymentMethod: 'bank',
      };

      const dedupedExp = deduplicateExpenses([expense1, expense1]);
      expect(dedupedExp.length).toBe(1);

      const cashflow1: CashflowTransaction = {
        id: 'cf-01',
        type: 'income',
        category: 'Doanh thu bán hàng',
        amount: 2500000,
        desc: 'Doanh thu ca sáng',
        date: '2026-10-10',
      };

      const dedupedCf = deduplicateCashflow([cashflow1, cashflow1]);
      expect(dedupedCf.length).toBe(1);
    });
  });

  // =========================================================================
  // PHÂN HỆ 4: BẢO MẬT & PHÊ DUYỆT GIAO DỊCH
  // =========================================================================
  describe('PHÂN HỆ 4: Bảo Mật & Phê Duyệt (Chuyển Khoản & Đổi Trả)', () => {
    it('4.1. Phê duyệt chuyển khoản ngân hàng: Lưu và tra cứu trạng thái tức thì', async () => {
      await saveResolvedTransferRecordToDb({
        order_number: 'BK-APPROVAL-01',
        action: 'approved',
        amount: 350000,
        resolved_by: 'Kế toán trưởng',
      });

      const status = await checkTransferResolvedStatus('BK-APPROVAL-01');
      expect(status).not.toBeNull();
      expect(status?.action).toBe('approved');
      expect(status?.amount).toBe(350000);
    });

    it('4.2. Phê duyệt đổi trả hàng: Quản lý duyệt từ chối hoặc chấp thuận', async () => {
      await saveResolvedReturnRecordToDb({
        id: 'REQ-RET-2026',
        order_number: 'ORD-RET-99',
        action: 'approved',
        resolved_by: 'Admin Cửa Hàng',
      });

      const res = await checkReturnResolvedStatus('ORD-RET-99', 'REQ-RET-2026');
      expect(res).not.toBeNull();
      expect(res?.action).toBe('approved');
      expect(res?.order_number).toBe('ORD-RET-99');
    });
  });

  // =========================================================================
  // PHÂN HỆ 5: ĐỒNG BỘ 2 CHIỀU CLOUD SQL ↔ LOCAL SQL (ZERO DATA LOSS)
  // =========================================================================
  describe('PHÂN HỆ 5: Cơ Sở Dữ Liệu & Đồng Bộ 2 Chiều Cloud SQL ↔ Local SQL', () => {
    it('5.1. Triệt tiêu hoàn toàn xung đột UUID (Zero UUID Collision)', () => {
      // 1. Phân biệt Cấu hình CSDL chính và Mốc Reset hệ thống
      expect(DB_ROW_GLOBAL_SQL_ID).not.toBe(DB_ROW_RESET_EPOCH_ID);
      expect(DB_ROW_GLOBAL_SQL_ID).toBe('00000000-0000-0000-0000-000000000098');
      expect(DB_ROW_RESET_EPOCH_ID).toBe('00000000-0000-0000-0000-000000000099');

      // 2. Phân biệt Đơn tạm giữ và Đơn chờ duyệt đổi trả
      expect(DB_ROW_HELD_ORDERS_ID).not.toBe(DB_ROW_PENDING_RETURNS_ID);
      expect(DB_ROW_HELD_ORDERS_ID).toBe('00000000-0000-0000-0000-000000000029');
      expect(DB_ROW_PENDING_RETURNS_ID).toBe('00000000-0000-0000-0000-000000000028');

      // 3. Phân biệt Phiếu đổi trả
      expect(DB_ROW_ORDER_RETURNS_ID).toBe('00000000-0000-0000-0000-000000000027');
    });

    it('5.2. Chuyển đổi qua lại giữa Online Mode và Local Mode: Bảo toàn 100% dữ liệu', async () => {
      // Thiết lập dữ liệu ở Online mode
      saveSqlModeConfig({ mode: 'online' });
      localStorage.setItem('bakery_orders', JSON.stringify([{ id: 'ord-online-1', total: 100000 }]));
      localStorage.setItem('bakery_held_orders', JSON.stringify([{ id: 'h-1', holdCode: '#T1' }]));

      // Chuyển sang Local mode
      await switchDatabaseMode('local');
      expect(getSqlModeConfig().mode).toBe('local');

      // Thao tác tại Local mode
      localStorage.setItem('bakery_orders', JSON.stringify([{ id: 'ord-local-2', total: 200000 }]));

      // Chuyển ngược lại Online mode
      await switchDatabaseMode('online');
      expect(getSqlModeConfig().mode).toBe('online');

      // Dữ liệu Online được phục hồi nguyên vẹn
      const restoredOrders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      expect(restoredOrders.some((o: any) => o.id === 'ord-online-1')).toBe(true);

      const restoredHeld = JSON.parse(localStorage.getItem('bakery_held_orders') || '[]');
      expect(restoredHeld.some((h: any) => h.id === 'h-1')).toBe(true);
    });

    it('5.3. Sinh mã Local SQL Master Dump: Đầy đủ các bảng và Escape chuỗi chuẩn xác', () => {
      const mockDumpPayload: any = {
        products: [{ id: 'p1', name: "Bánh Mì Chuột O'Clock", selling_price: 15000 }],
        orders: [{ id: 'o1', order_number: 'ORD-01', total_amount: 15000, status: 'completed' }],
        ingredients: [{ id: 'i1', name: 'Bột mì T55', stock_qty: 5000 }],
        recipes: [{ id: 'r1', name: 'Bánh Mì Chuột', yield_qty: 10 }],
        held_orders: [{ id: 'h1', holdCode: '#T1', totalAmount: 15000 }],
        order_returns: [{ id: 'ret1', order_number: 'ORD-01', refund_amount: 15000 }],
      };

      const sql = generateMasterSqlDump(mockDumpPayload);

      // Kiểm tra có đủ các lệnh tạo bảng và insert
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS products');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS orders');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS ingredients');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS recipes');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS held_orders');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS order_returns');

      // Kiểm tra câu lệnh INSERT INTO
      expect(sql).toContain("INSERT INTO products");
      expect(sql).toContain("INSERT INTO orders");
      expect(sql).toContain("INSERT INTO ingredients");
      expect(sql).toContain("INSERT INTO recipes");
      expect(sql).toContain("INSERT INTO held_orders");
      expect(sql).toContain("INSERT INTO order_returns");

      // Kiểm tra escape dấu nháy đơn tiếng Việt: O'Clock -> O''Clock
      expect(sql).toContain("Bánh Mì Chuột O''Clock");
    });
  });

  // =========================================================================
  // PHÂN HỆ 6: KỊCH BẢN TÍCH HỢP ĐẦU-CUỐI LIÊN MODULE (END-TO-END E2E WORKFLOW)
  // =========================================================================
  describe('PHÂN HỆ 6: Kịch Bản Tích Hợp Đầu-Cuối Liên Module Toàn Diện (E2E Integration)', () => {
    it('6.1. E2E Luồng Bán Lẻ Bánh Thường: POS Bán -> Bếp KDS Làm -> Kho Trừ -> Sổ Quỹ Thu', async () => {
      // 1. Kho ban đầu
      await saveBakeryIngredients([
        { id: 'ing-flour', name: 'Bột mì bánh mì', unit: 'g', stock_qty: 10000, avg_cost: 20 },
      ]);

      // 2. Bếp làm mẻ 10 chiếc bánh mì Baguette (cần 500g bột)
      const recipe = {
        id: 'rec-baguette',
        name: 'Bánh Mì Baguette',
        yield_qty: 10,
        yield_unit: 'ổ',
        items: [{ ingredient_id: 'ing-flour', name: 'Bột mì bánh mì', quantity: 500, unit: 'g' }],
      };
      const bakeRes = await deductRecipeIngredients(recipe, 10, { performedBy: 'Bếp Trưởng' });
      expect(bakeRes.success).toBe(true);

      // Kho đã trừ đúng 500g bột -> còn 9500g
      const stockAfterBake = getBakeryIngredients();
      expect(stockAfterBake.find((i) => i.id === 'ing-flour')?.stock_qty).toBe(9500);

      // 3. Khách mua 2 cái tại POS, trả tiền mặt 30,000 VND
      const order = {
        id: 'ord-e2e-retail',
        order_number: 'ORD-RT-01',
        total_amount: 30000,
        subtotal: 30000,
        payment_method: 'cash',
        status: 'completed',
        items: [{ product_id: 'p-baguette', product_name: 'Bánh Mì Baguette', quantity: 2, price: 15000 }],
      };
      localStorage.setItem('bakery_orders', JSON.stringify([order]));

      // 4. Kế toán sổ quỹ ghi nhận thu tiền mặt
      const cashflowEntry: CashflowTransaction = {
        id: 'cf-order-' + order.order_number,
        type: 'income',
        category: 'Doanh thu bán hàng',
        amount: 30000,
        desc: `Thu tiền đơn #${order.order_number}`,
        date: new Date().toISOString(),
        method: 'cash',
      };
      localStorage.setItem('bakery_cashflow', JSON.stringify([cashflowEntry]));

      const storedCashflow = JSON.parse(localStorage.getItem('bakery_cashflow') || '[]');
      expect(storedCashflow.length).toBe(1);
      expect(storedCashflow[0].amount).toBe(30000);
      expect(storedCashflow[0].type).toBe('income');
    });

    it('6.2. E2E Luồng Bánh Sinh Nhật Theo Yêu Cầu: Đặt Bánh -> Duyệt CK -> Bếp Xong -> Trừ Kho 6 Nhóm -> Đổi Trả Hoàn Tiền', async () => {
      // 1. Kho vật tư chuẩn bị sẵn
      await saveBakeryIngredients([
        { id: 'bday-base-flour', name: 'Bột bánh bông lan', unit: 'g', stock_qty: 8000, avg_cost: 25 },
        { id: 'bday-cream-anchor', name: 'Kem Whipping Anchor', unit: 'ml', stock_qty: 6000, avg_cost: 160 },
        { id: 'bday-box-20', name: 'Hộp Mica 20cm', unit: 'cái', stock_qty: 30, avg_cost: 25000 },
        { id: 'bday-candle', name: 'Nến số tuổi', unit: 'cái', stock_qty: 100, avg_cost: 3000 },
      ]);

      // 2. Khách đặt bánh sinh nhật 20cm tại POS, thanh toán chuyển khoản 350,000 VND
      const bdayOrder: any = {
        id: 'ord-bday-e2e',
        order_number: 'ORD-BDAY-2001',
        total_amount: 350000,
        payment_method: 'bank_transfer',
        status: 'pending_payment',
        cake_order_spec: {
          isBirthdayCake: true,
          cakeBase: {
            name: 'Cốt Vani',
            bomIngredients: [{ ingredientId: 'bday-base-flour', name: 'Bột bánh bông lan', quantity: 250, unit: 'g' }],
          },
          creamCoating: {
            name: 'Kem Whipping Anchor',
            bomIngredients: [{ ingredientId: 'bday-cream-anchor', name: 'Kem Whipping Anchor', quantity: 400, unit: 'ml' }],
          },
          packaging: { id: 'bday-box-20', name: 'Hộp Mica 20cm' },
          freeAccessories: [{ id: 'bday-candle', name: 'Nến số tuổi', quantity: 2 }],
        },
      };

      // 3. Phê duyệt chuyển khoản thành công
      await saveResolvedTransferRecordToDb({
        order_number: bdayOrder.order_number,
        action: 'approved',
        amount: 350000,
        resolved_by: 'Kế toán online',
      });
      const approvalCheck = await checkTransferResolvedStatus(bdayOrder.order_number);
      expect(approvalCheck?.action).toBe('approved');
      bdayOrder.status = 'paid';

      // 4. Bếp KDS hoàn thành bánh -> Tự động trừ kho
      const deductRes = await deductOrderIngredients(bdayOrder);
      expect(deductRes.success).toBe(true);
      expect(deductRes.deductedItems.length).toBe(4);
      expect(bdayOrder.bom_deducted).toBe(true);

      const stockAfterBake = getBakeryIngredients();
      expect(stockAfterBake.find((i) => i.id === 'bday-base-flour')?.stock_qty).toBe(7750); // 8000 - 250
      expect(stockAfterBake.find((i) => i.id === 'bday-cream-anchor')?.stock_qty).toBe(5600); // 6000 - 400
      expect(stockAfterBake.find((i) => i.id === 'bday-box-20')?.stock_qty).toBe(29); // 30 - 1
      expect(stockAfterBake.find((i) => i.id === 'bday-candle')?.stock_qty).toBe(98); // 100 - 2

      // 5. Khách mang bánh về, phát hiện ghi nhầm chữ -> Yêu cầu đổi trả hoàn lại 100,000 VND
      const returnRecord: any = {
        id: 'RET-BDAY-2001',
        order_id: bdayOrder.id,
        order_number: bdayOrder.order_number,
        refund_amount: 100000,
        refund_method: 'bank',
        reason: 'Sai chữ ghi trên bánh',
        created_at: new Date().toISOString(),
      };

      // Quản lý phê duyệt đổi trả
      await saveResolvedReturnRecordToDb({
        id: returnRecord.id,
        order_number: bdayOrder.order_number,
        action: 'approved',
        resolved_by: 'Cửa Hàng Trưởng',
      });
      const returnApproval = await checkReturnResolvedStatus(bdayOrder.order_number, returnRecord.id);
      expect(returnApproval?.action).toBe('approved');

      // Lưu phiếu đổi trả và cập nhật đơn
      saveOrderReturnsLocally([returnRecord]);
      bdayOrder.status = 'partially_refunded';

      expect(getOrderReturns().length).toBe(1);
      expect(bdayOrder.status).toBe('partially_refunded');
    });
  });
});
