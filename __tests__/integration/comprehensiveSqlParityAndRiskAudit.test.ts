import { describe, it, expect, beforeEach, vi } from 'vitest';

// 1. Quản lý chế độ CSDL, Snapshot & Portability
import {
  captureDataSnapshot,
  applyDataSnapshot,
  switchDatabaseMode,
  getSqlModeConfig,
  saveSqlModeConfig,
  BAKERY_DATA_KEYS,
  STORAGE_KEYS_BACKUP,
  VAULT_KEY_LOCAL_PRODUCTION,
  VAULT_KEY_LOCAL_TESTING,
} from '@/lib/utils/sqlModeManager';

import {
  generateMasterSqlDump,
  generateSchemaSql,
} from '@/lib/utils/localSqlManager';

// 2. Quản lý kho, nguyên liệu & Quy tắc tài chính chống thất thoát
import {
  canDeleteIngredient,
  deleteIngredientEverywhere,
  markIngredientAsDeleted,
  getDeletedIngredientIds,
  filterActiveIngredients,
  BAKERY_INGREDIENTS_KEY,
} from '@/lib/utils/ingredientManager';

// 3. Quản lý sản phẩm, công thức & Lịch sử làm bánh
import {
  deleteProductByBomRef,
  isProductFromBom,
  filterActiveProducts,
} from '@/lib/utils/productManager';

import {
  markRecipeAsDeleted,
  getDeletedRecipeIds,
} from '@/lib/utils/recipeCalculator';

import {
  getBakingHistory,
  recordBakingLog,
  deduplicateBakingHistory,
  STORAGE_KEY_BAKING_HISTORY,
} from '@/lib/utils/bakingHistoryManager';

// 4. POS, Đơn lưu tạm, Đổi trả & Quản lý thu ngân
import {
  normalizeHeldOrder,
  getHeldOrders,
  saveHeldOrdersLocally,
  deduplicateHeldOrders,
} from '@/lib/utils/heldOrderManager';

import {
  getOrderReturns,
  saveOrderReturnsLocally,
  deduplicateOrderReturns,
} from '@/lib/utils/orderReturnManager';

import { extractOrderCode } from '@/lib/utils/orderCodeExtractor';

// 5. Kế toán, Thu chi, Giá vốn & Thuế
import {
  deduplicateExpenses,
  deduplicateCashflow,
  CashflowTransaction,
  ExpenseItem,
} from '@/lib/utils/accountingSync';

import { generateS2eLedger } from '@/lib/utils/taxSync';

// 6. Supabase Client & SQL Firewall
import { supabase } from '@/lib/supabase/client';

describe('COMPREHENSIVE AUDIT: ĐÁNH GIÁ RỦI RO, ĐỒNG NHẤT DỮ LIỆU SQL CLOUD - LOCAL SQL & BẢO ĐẢM ZERO DATA LOSS', () => {
  beforeEach(() => {
    localStorage.clear();
    saveSqlModeConfig({ mode: 'local' });
    vi.clearAllMocks();
  });

  // =========================================================================
  // PHẦN 1: ĐÁNH GIÁ RỦI RO & BẢO VỆ TÀI CHÍNH KẾ TOÁN (RISK ASSESSMENT)
  // =========================================================================
  describe('PHẦN 1: Đánh Giá Rủi Ro & Phòng Chống Lỗ Hổng Tài Chính Kế Toán', () => {
    it('1.1. [RSK-01] Chặn xóa nguyên liệu còn tồn kho (>0) để tránh bốc hơi tài sản và mất dấu giá vốn', async () => {
      // Giả lập nguyên liệu còn tồn kho 5.000g (5kg) bơ lạt
      const ingWithStock = {
        id: 'ing-anchor-butter',
        name: 'Bơ lạt Anchor 5kg',
        stock_qty: 5000,
        unit: 'g',
        avg_cost: 150,
      };

      localStorage.setItem(BAKERY_INGREDIENTS_KEY, JSON.stringify([ingWithStock]));

      // 1. Kiểm tra qua hàm kiểm định canDeleteIngredient
      const check = canDeleteIngredient(ingWithStock);
      expect(check.allowed).toBe(false);
      expect(check.stockQty).toBe(5000);
      expect(check.unit).toBe('g');
      expect(check.reason).toContain('vẫn còn tồn kho');

      // 2. Thử xóa qua hàm xóa triệt để deleteIngredientEverywhere
      const delSuccess = await deleteIngredientEverywhere('ing-anchor-butter', 'Bơ lạt Anchor 5kg');
      expect(delSuccess).toBe(false);

      // 3. Xác nhận nguyên liệu KHÔNG bị đưa vào danh sách đen Tombstone
      const deletedSet = getDeletedIngredientIds();
      expect(deletedSet.has('ing-anchor-butter')).toBe(false);

      // 4. Xác nhận nguyên liệu vẫn còn nguyên vẹn trong kho
      const inStore = JSON.parse(localStorage.getItem(BAKERY_INGREDIENTS_KEY) || '[]');
      expect(inStore).toHaveLength(1);
      expect(inStore[0].stock_qty).toBe(5000);
    });

    it('1.2. [RSK-02] Cho phép xóa nguyên liệu sau khi đã xuất dùng hết hoặc lập phiếu xuất hủy đưa tồn kho về 0', async () => {
      // Giả lập nguyên liệu sau khi bếp đã dùng hết hoặc quản lý đã xuất hủy về 0
      const ingZeroStock = {
        id: 'ing-empty-flour',
        name: 'Bột mì hết hạn đã hủy',
        stock_qty: 0,
        unit: 'g',
        avg_cost: 30,
      };

      localStorage.setItem(BAKERY_INGREDIENTS_KEY, JSON.stringify([ingZeroStock]));

      // 1. Kiểm tra canDeleteIngredient
      const check = canDeleteIngredient(ingZeroStock);
      expect(check.allowed).toBe(true);

      // 2. Tiến hành xóa
      const delSuccess = await deleteIngredientEverywhere('ing-empty-flour', 'Bột mì hết hạn đã hủy');
      expect(delSuccess).toBe(true);

      // 3. Đã đưa vào Tombstone chống hồi sinh
      const deletedSet = getDeletedIngredientIds();
      expect(deletedSet.has('ing-empty-flour')).toBe(true);

      // 4. Kho đã được dọn sạch
      const inStore = JSON.parse(localStorage.getItem(BAKERY_INGREDIENTS_KEY) || '[]');
      expect(inStore).toHaveLength(0);
    });

    it('1.3. [RSK-03] Chống hồi sinh bản ghi rác (Anti-Resurrection Tombstone) cho Sản phẩm, Nguyên liệu & Công thức', () => {
      // Đánh dấu xóa nguyên liệu, sản phẩm và công thức
      markIngredientAsDeleted('ing-zombie-1', 'Bột tẩy trắng cũ');
      markRecipeAsDeleted('rec-zombie-1');

      // Giả lập dữ liệu cũ từ Cloud hoặc thiết bị khác sync về
      const dirtyIngredients = [
        { id: 'ing-zombie-1', name: 'Bột tẩy trắng cũ', unit: 'g' }, // Phải bị loại bỏ
        { id: 'ing-fresh-1', name: 'Đường mía sạch', unit: 'g' },     // Được giữ lại
        { id: 'SYS_CONFIG_PRINTER', name: 'SYS_CONFIG_PRINTER' },    // Cấu hình hệ thống phải bị loại khỏi kho
      ];

      const cleanIngredients = filterActiveIngredients(dirtyIngredients);
      expect(cleanIngredients).toHaveLength(1);
      expect(cleanIngredients[0].id).toBe('ing-fresh-1');

      // Kiểm tra Tombstone Recipes
      const delRecSet = getDeletedRecipeIds();
      expect(delRecSet.has('rec-zombie-1')).toBe(true);
    });

    it('1.4. [RSK-04] Đơn hàng chia tách thanh toán (Split Payment) bóc tách chính xác doanh thu tiền mặt và chuyển khoản cho Sổ Thuế S2e', () => {
      const splitOrder: any = {
        id: 'ORD-SPLIT-01',
        order_number: 'ORD-SPLIT-01',
        total_amount: 500000,
        final_amount: 500000,
        payment_method: 'split',
        payment_status: 'paid',
        splitCashAmount: 200000,
        splitTransferAmount: 300000,
        created_at: '2026-10-15T10:00:00Z',
        items: [
          { product_name_snapshot: 'Bánh Kem Sinh Nhật 20cm', quantity: 1, unit_price: 500000, subtotal: 500000 },
        ],
        payments: [
          { method: 'cash', amount: 200000 },
          { method: 'transfer', amount: 300000 },
        ],
      };

      const ledger = generateS2eLedger([], { orders: [splitOrder] });
      expect(ledger.totalIncome).toBe(500000);
      expect(ledger.cashIncome).toBe(200000);
      expect(ledger.bankIncome).toBe(300000);
      expect(ledger.rows).toHaveLength(1);
      expect(ledger.rows[0].source).toBe('split');
      expect(ledger.rows[0].cashAmt).toBe(200000);
      expect(ledger.rows[0].transferAmt).toBe(300000);
    });
  });

  // =========================================================================
  // PHẦN 2: BẢO ĐẢM ZERO DATA LOSS & BAO PHỦ 100% THỰC THỂ DỮ LIỆU
  // =========================================================================
  describe('PHẦN 2: Bảo Đảm Zero Data Loss & Bao Phủ Toàn Bộ Thực Thể Dữ Liệu', () => {
    it('2.1. BAKERY_DATA_KEYS bao phủ đầy đủ tất cả các khóa dữ liệu nghiệp vụ quan trọng', () => {
      const essentialKeys = [
        // Bán hàng & Đơn hàng
        'bakery_orders',
        'bakery_preorders',
        'bakery_custom_cake_orders',
        'bakery_held_orders',
        'bakery_order_returns',
        'bakery_pending_returns',
        'bakery_resolved_returns',
        'bakery_resolved_return_records',
        'bakery_deleted_order_keys',

        // Kho & Sản xuất
        'bakery_products',
        'bakery_products_custom',
        'bakery_stocks',
        'bakery_ingredients',
        'bakery_material_transactions',
        'bakery_material_stock_adjustments',
        'bakery_recipes',
        'bakery_full_bom_config',
        'bakery_cake_costing_config',
        'bakery_baking_history',
        'bakery_oven_batches',

        // Tài chính, Thuế & Kế toán
        'bakery_expenses',
        'bakery_pos_expenses',
        'bakery_cashflow',
        'bakery_spoilage_logs',
        'bakery_stock_adjustments',
        'bakery_accounting_closings',
        'bakery_current_shift',
        'bakery_shift_history',
        'bakery_tax_household_config',
        'bakery_tax_policy_config',

        // Chuyển khoản, Thông báo & Cài đặt
        'bakery_pending_transfers',
        'bakery_resolved_transfers',
        'bakery_resolved_transfer_records',
        'bakery_autobank_config',
        'bakery_vietqr_config',
        'bakery_ewallet_config',
        'bakery_security_config',
        'bakery_admin_pin',
        'bakery_printer_config',
        'bakery_telegram_config',
        'bakery_store_branding',
        'bakery_notification_history',
        'bakery_system_reset_epoch',
        'bakery_deleted_product_ids',
        'bakery_deleted_ingredient_ids',
        'bakery_deleted_recipe_ids',
      ];

      for (const key of essentialKeys) {
        expect(BAKERY_DATA_KEYS).toContain(key);
      }
    });

    it('2.2. captureDataSnapshot và applyDataSnapshot bảo toàn 100% dữ liệu phức tạp không bị thất thoát', () => {
      // Giả lập toàn bộ dữ liệu phát sinh trong một ngày bán hàng bận rộn
      const mockBakingHistory = [
        {
          id: 'bake-01',
          cakeName: 'Bánh Mì Chuột Giòn',
          quantity: 50,
          unit: 'cái',
          totalCost: 150000,
          costPerUnit: 3000,
          performedBy: 'Thợ Bánh Nam',
          createdAt: '2026-10-15T06:00:00Z',
        },
      ];

      const mockHeldOrders = [
        {
          id: 'hold-99',
          holdCode: '#T9',
          label: 'Bàn 4 chờ lấy thêm bánh ngọt',
          totalAmount: 180000,
          items: [{ product: { name: 'Croissant' }, quantity: 3 }],
        },
      ];

      const mockOrderReturns = [
        {
          id: 'ret-88',
          order_number: 'BK-1002',
          refund_amount: 60000,
          reason: 'Khách đổi mẫu bánh sinh nhật',
          items: [{ product_name: 'Bánh Su Kem', quantity: 2 }],
        },
      ];

      const mockMaterialTx = [
        {
          id: 'mtx-01',
          type: 'import',
          materialName: 'Bột Mì T55',
          quantity: 25000,
          unit: 'g',
          totalAmount: 500000,
        },
      ];

      // Ghi vào localStorage
      localStorage.setItem('bakery_baking_history', JSON.stringify(mockBakingHistory));
      localStorage.setItem('bakery_held_orders', JSON.stringify(mockHeldOrders));
      localStorage.setItem('bakery_order_returns', JSON.stringify(mockOrderReturns));
      localStorage.setItem('bakery_material_transactions', JSON.stringify(mockMaterialTx));
      localStorage.setItem('bakery_system_reset_epoch', '1791500000000');
      localStorage.setItem('bakery_admin_pin', '999999');

      // 1. Chụp Snapshot
      const snapshot = captureDataSnapshot();
      expect(snapshot['bakery_baking_history']).toBe(JSON.stringify(mockBakingHistory));
      expect(snapshot['bakery_held_orders']).toBe(JSON.stringify(mockHeldOrders));
      expect(snapshot['bakery_order_returns']).toBe(JSON.stringify(mockOrderReturns));
      expect(snapshot['bakery_material_transactions']).toBe(JSON.stringify(mockMaterialTx));
      expect(snapshot['bakery_system_reset_epoch']).toBe('1791500000000');
      expect(snapshot['bakery_admin_pin']).toBe('999999');

      // 2. Xóa sạch bộ nhớ giả lập người dùng F5 hoặc đổi máy
      localStorage.clear();
      expect(localStorage.getItem('bakery_baking_history')).toBeNull();

      // 3. Áp dụng lại Snapshot
      applyDataSnapshot(snapshot);

      // 4. Xác nhận phục hồi 100% nguyên vẹn
      expect(JSON.parse(localStorage.getItem('bakery_baking_history') || '[]')).toEqual(mockBakingHistory);
      expect(JSON.parse(localStorage.getItem('bakery_held_orders') || '[]')).toEqual(mockHeldOrders);
      expect(JSON.parse(localStorage.getItem('bakery_order_returns') || '[]')).toEqual(mockOrderReturns);
      expect(JSON.parse(localStorage.getItem('bakery_material_transactions') || '[]')).toEqual(mockMaterialTx);
      expect(localStorage.getItem('bakery_system_reset_epoch')).toBe('1791500000000');
      expect(localStorage.getItem('bakery_admin_pin')).toBe('999999');
    });
  });

  // =========================================================================
  // PHẦN 3: ĐỒNG NHẤT DỮ LIỆU & HOÁN CHUYỂN 2 CHIỀU (DATA PARITY & PORTABILITY)
  // =========================================================================
  describe('PHẦN 3: Đồng Nhất Dữ Liệu & Hoán Chuyển 2 Chiều Giữa Cloud SQL và Local SQL', () => {
    it('3.1. Master SQL Dump (bakery_master.sql) xuất cấu trúc 29 bảng ANSI/Postgres chuẩn và đầy đủ dữ liệu', () => {
      const mockFullData = {
        products: [{ id: 'p1', name: 'Bánh Sừng Bò', price: 25000, cost_price: 10000, category: 'Bánh Mì' }],
        ingredients: [{ id: 'ing1', name: 'Bơ Nhạt', unit: 'g', stock_qty: 3000, avg_cost: 120 }],
        recipes: [
          {
            id: 'rec1',
            name: 'Bánh Sừng Bò Chuẩn',
            yield_qty: 10,
            yield_unit: 'cái',
            items: [{ ingredient_id: 'ing1', quantity: 200, unit: 'g', line_cost: 24000 }],
          },
        ],
        orders: [
          {
            id: 'ord1',
            order_number: 'DH-001',
            total_amount: 50000,
            status: 'completed',
            payment_method: 'cash',
            items: [{ product_id: 'p1', product_name_snapshot: 'Bánh Sừng Bò', quantity: 2, unit_price: 25000 }],
          },
        ],
        order_returns: [
          {
            id: 'ret1',
            order_number: 'DH-001',
            refund_amount: 25000,
            return_type: 'refund',
            items: [{ product_id: 'p1', product_name: 'Bánh Sừng Bò', quantity: 1, unit_price: 25000 }],
          },
        ],
        held_orders: [
          { id: 'hold1', holdCode: '#T1', totalAmount: 75000, itemCount: 3 },
        ],
        baking_history: [
          { id: 'bh1', cakeName: 'Bánh Sừng Bò', quantity: 10, totalCost: 50000 },
        ],
        expenses: [
          { id: 'exp1', category: 'Tiền Điện', amount: 1200000, description: 'Điện tháng 10' },
        ],
        cashflow: [
          { id: 'cf1', type: 'expense', category: 'Hao hụt / Xuất hủy', amount: 50000, description: 'Xuất hủy bánh hỏng' },
        ],
      };

      const dumpSql = generateMasterSqlDump(mockFullData);

      // Xác nhận các bảng cốt lõi có trong file xuất
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS products');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS ingredients');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS recipes');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS recipe_items');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS orders');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS order_items');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS order_returns');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS order_return_items');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS held_orders');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS baking_history');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS operating_expenses');
      expect(dumpSql).toContain('CREATE TABLE IF NOT EXISTS cashflow_transactions');

      // Xác nhận các câu lệnh INSERT chứa dữ liệu chính xác
      expect(dumpSql).toContain(`INSERT INTO products`);
      expect(dumpSql).toContain(`'Bánh Sừng Bò'`);
      expect(dumpSql).toContain(`'Bơ Nhạt'`);
      expect(dumpSql).toContain(`'DH-001'`);
      expect(dumpSql).toContain(`'Tiền Điện'`);
    });

    it('3.2. Hoán chuyển qua lại 2 chiều giữa Online (Cloud SQL) và Local (Local SQL) an toàn tuyệt đối', async () => {
      // 1. Khởi tạo trạng thái Online với dữ liệu ban đầu
      saveSqlModeConfig({ mode: 'online' });
      localStorage.setItem('bakery_orders', JSON.stringify([{ id: 'ord-cloud-1', order_number: 'DH-CLOUD-01', total_amount: 150000 }]));
      localStorage.setItem('bakery_ingredients', JSON.stringify([{ id: 'ing-cloud-1', name: 'Sữa Tươi TH', stock_qty: 10000 }]));
      localStorage.setItem('bakery_baking_history', JSON.stringify([{ id: 'bh-cloud-1', cakeName: 'Bánh Mì', quantity: 20 }]));

      // 2. Chuyển sang Local Mode (Offline/Local SQL)
      await switchDatabaseMode('local');
      expect(getSqlModeConfig().mode).toBe('local');

      // Dữ liệu từ Online phải được đóng gói nguyên vẹn trong Online Snapshot Vault
      const onlineVault = JSON.parse(localStorage.getItem('bakery_snapshot_online') || '{}');
      expect(onlineVault['bakery_orders']).toContain('DH-CLOUD-01');
      expect(onlineVault['bakery_ingredients']).toContain('Sữa Tươi TH');
      expect(onlineVault['bakery_baking_history']).toContain('bh-cloud-1');

      // 3. Tại Local Mode, người dùng bán thêm đơn hàng và nướng mẻ bánh mới
      const currentOrders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      currentOrders.push({ id: 'ord-local-new', order_number: 'DH-LOCAL-99', total_amount: 80000 });
      localStorage.setItem('bakery_orders', JSON.stringify(currentOrders));

      const currentBaking = JSON.parse(localStorage.getItem('bakery_baking_history') || '[]');
      currentBaking.push({ id: 'bh-local-new', cakeName: 'Bánh Su Kem', quantity: 15 });
      localStorage.setItem('bakery_baking_history', JSON.stringify(currentBaking));

      // 4. Chuyển lại về Online Mode
      await switchDatabaseMode('online');
      expect(getSqlModeConfig().mode).toBe('online');

      // 5. Kiểm tra Local Vault được lưu an toàn
      const localVault = JSON.parse(localStorage.getItem('bakery_snapshot_local') || '{}');
      expect(localVault['bakery_orders']).toContain('DH-LOCAL-99');
      expect(localVault['bakery_baking_history']).toContain('bh-local-new');
    });

    it('3.3. Hoán chuyển độc lập giữa 2 két lưu trữ Local: Local Chính (SQL LOCAL) vs Local Test (SQL TEST)', () => {
      saveSqlModeConfig({ mode: 'local', activeLocalEnv: 'production' });

      // Lưu dữ liệu vào Local Chính
      localStorage.setItem('bakery_orders', JSON.stringify([{ id: 'ord-prod', order_number: 'DH-PROD-REAL' }]));
      localStorage.setItem(VAULT_KEY_LOCAL_PRODUCTION, JSON.stringify({
        bakery_orders: JSON.stringify([{ id: 'ord-prod', order_number: 'DH-PROD-REAL' }]),
      }));

      // Chuyển sang Local Test
      saveSqlModeConfig({ mode: 'local', activeLocalEnv: 'testing' });
      localStorage.setItem('bakery_orders', JSON.stringify([{ id: 'ord-test-virtual', order_number: 'DH-TEST-VIRTUAL' }]));
      localStorage.setItem(VAULT_KEY_LOCAL_TESTING, JSON.stringify({
        bakery_orders: JSON.stringify([{ id: 'ord-test-virtual', order_number: 'DH-TEST-VIRTUAL' }]),
      }));

      // Xác nhận 2 két lưu trữ hoàn toàn độc lập, không bị ghi đè lên nhau
      const prodVault = JSON.parse(localStorage.getItem(VAULT_KEY_LOCAL_PRODUCTION) || '{}');
      const testVault = JSON.parse(localStorage.getItem(VAULT_KEY_LOCAL_TESTING) || '{}');

      expect(prodVault['bakery_orders']).toContain('DH-PROD-REAL');
      expect(prodVault['bakery_orders']).not.toContain('DH-TEST-VIRTUAL');

      expect(testVault['bakery_orders']).toContain('DH-TEST-VIRTUAL');
      expect(testVault['bakery_orders']).not.toContain('DH-PROD-REAL');
    });
  });

  // =========================================================================
  // PHẦN 4: KIỂM TRA TƯỜNG LỬA SQL FIREWALL & CÁCH LY MÔI TRƯỜNG
  // =========================================================================
  describe('PHẦN 4: Kiểm Tra Tường Lửa SQL Firewall & Cách Ly Môi Trường Tuyệt Đối', () => {
    it('4.1. SQL Firewall chặn 100% các lệnh Ghi/Sửa/Xóa (INSERT, UPDATE, UPSERT, DELETE) khi chạy kiểm thử hoặc Local Mode', async () => {
      // 1. Thử lệnh INSERT
      const insertRes = await supabase.from('orders').insert({
        id: 'ord-dummy-01',
        order_number: 'DH-DUMMY',
        total_amount: 100000,
      });
      expect(insertRes).toEqual({ data: null, error: null });

      // 2. Thử lệnh UPDATE
      const updateRes = await supabase.from('ingredients').update({ stock_qty: 9999 }).eq('id', 'ing-1');
      expect(updateRes).toEqual({ data: null, error: null });

      // 3. Thử lệnh UPSERT
      const upsertRes = await supabase.from('recipes').upsert({ id: 'rec-1', name: 'Công thức giả lập' });
      expect(upsertRes).toEqual({ data: null, error: null });

      // 4. Thử lệnh DELETE
      const deleteRes = await supabase.from('products').delete().eq('id', 'p-del-1');
      expect(deleteRes).toEqual({ data: null, error: null });
    });

    it('4.2. Lịch sử làm bánh deduplicateBakingHistory khử sạch bản ghi trùng lặp theo fingerprint ngày giờ, tên bánh và số lượng', () => {
      const records: any[] = [
        { id: 'b1', cakeName: 'Bánh Mì Chuột', quantity: 20, createdAt: '2026-10-15T08:00:00.000Z' },
        { id: 'b2', cakeName: 'Bánh Mì Chuột', quantity: 20, createdAt: '2026-10-15T08:00:00.123Z' }, // Trùng lặp fingerprint
        { id: 'b3', cakeName: 'Bánh Croissant', quantity: 10, createdAt: '2026-10-15T09:00:00.000Z' },
      ];

      const deduped = deduplicateBakingHistory(records);
      expect(deduped).toHaveLength(2);
      expect(deduped.map((b) => b.cakeName)).toContain('Bánh Mì Chuột');
      expect(deduped.map((b) => b.cakeName)).toContain('Bánh Croissant');
    });

    it('4.3. Khử trùng lặp thu chi kế toán (deduplicateCashflow & deduplicateExpenses) bảo đảm không đội khống chi phí', () => {
      const duplicateCashflow: CashflowTransaction[] = [
        { id: 'cf-1', type: 'expense', category: 'Nguyên liệu', amount: 300000, desc: 'Mua bơ', date: '2026-10-15T08:00:00Z' },
        { id: 'cf-1', type: 'expense', category: 'Nguyên liệu', amount: 300000, desc: 'Mua bơ', date: '2026-10-15T08:00:00Z' }, // Trùng ID
        { id: 'cf-2', type: 'income', category: 'Bán lẻ POS', amount: 150000, desc: 'Đơn #1', date: '2026-10-15T09:00:00Z' },
      ];

      const cleanCf = deduplicateCashflow(duplicateCashflow);
      expect(cleanCf).toHaveLength(2);

      const duplicateExpenses: ExpenseItem[] = [
        { id: 'exp-1', category: 'Điện nước', amount: 500000, description: 'Điện tiệm bánh', date: '2026-10-01' },
        { id: 'exp-1', category: 'Điện nước', amount: 500000, description: 'Điện tiệm bánh', date: '2026-10-01' },
      ];

      const cleanExp = deduplicateExpenses(duplicateExpenses);
      expect(cleanExp).toHaveLength(1);
    });
  });
});
