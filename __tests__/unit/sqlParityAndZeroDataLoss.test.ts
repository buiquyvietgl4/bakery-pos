import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  captureDataSnapshot,
  applyDataSnapshot,
  switchDatabaseMode,
  getSqlModeConfig,
  saveSqlModeConfig,
  BAKERY_DATA_KEYS,
} from '@/lib/utils/sqlModeManager';
import { generateMasterSqlDump, generateSchemaSql } from '@/lib/utils/localSqlManager';
import { BakeryBackupData } from '@/lib/types/backup';

describe('SQL Cloud & Local SQL Parity & Zero Data Loss Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. Snapshot Data Integrity & Coverage', () => {
    it('BAKERY_DATA_KEYS bao phủ 100% các thực thể nghiệp vụ quan trọng', () => {
      const requiredKeys = [
        'bakery_products',
        'bakery_orders',
        'bakery_ingredients',
        'bakery_recipes',
        'bakery_deleted_product_ids',
        'bakery_deleted_ingredient_ids',
        'bakery_deleted_recipe_ids',
        'bakery_order_returns',
        'bakery_pending_returns',
        'bakery_resolved_returns',
        'bakery_held_orders',
        'bakery_custom_cake_orders',
        'bakery_deleted_order_keys',
        'bakery_oven_batches',
        'bakery_admin_pin',
        'bakery_product_metadata_map',
      ];

      for (const key of requiredKeys) {
        expect(BAKERY_DATA_KEYS).toContain(key);
      }
    });

    it('captureDataSnapshot thu thập đầy đủ và applyDataSnapshot khôi phục 100% dữ liệu', () => {
      // Giả lập dữ liệu sinh ra trong quá trình sử dụng
      localStorage.setItem('bakery_products', JSON.stringify([{ id: 'p1', name: 'Bánh Kem Bắp' }]));
      localStorage.setItem('bakery_deleted_ingredient_ids', JSON.stringify(['ing-del-1', 'ing-del-2']));
      localStorage.setItem('bakery_deleted_recipe_ids', JSON.stringify(['rec-del-1']));
      localStorage.setItem('bakery_pending_returns', JSON.stringify([{ id: 'pr-1', order_id: 'ord-1' }]));
      localStorage.setItem('bakery_order_returns', JSON.stringify([{ id: 'ret-1', reason: 'Bánh hỏng' }]));
      localStorage.setItem('bakery_held_orders', JSON.stringify([{ id: 'held-1', customerName: 'Anh Nam' }]));
      localStorage.setItem('bakery_admin_pin', '888888');

      const dispatchedEvents: string[] = [];
      const trackEvent = (e: Event) => dispatchedEvents.push(e.type);

      const eventsToTrack = [
        'bakery_ingredients_updated',
        'bakery_bom_updated',
        'bakery_order_returns_updated',
        'bakery_held_orders_updated',
        'bakery_pending_returns_updated',
      ];
      eventsToTrack.forEach((ev) => window.addEventListener(ev, trackEvent));

      // Bắt snapshot
      const snapshot = captureDataSnapshot();
      expect(snapshot['bakery_deleted_ingredient_ids']).toBe(JSON.stringify(['ing-del-1', 'ing-del-2']));
      expect(snapshot['bakery_deleted_recipe_ids']).toBe(JSON.stringify(['rec-del-1']));
      expect(snapshot['bakery_pending_returns']).toBe(JSON.stringify([{ id: 'pr-1', order_id: 'ord-1' }]));
      expect(snapshot['bakery_order_returns']).toBe(JSON.stringify([{ id: 'ret-1', reason: 'Bánh hỏng' }]));
      expect(snapshot['bakery_held_orders']).toBe(JSON.stringify([{ id: 'held-1', customerName: 'Anh Nam' }]));
      expect(snapshot['bakery_admin_pin']).toBe('888888');

      // Xóa sạch bộ nhớ
      localStorage.clear();
      expect(localStorage.getItem('bakery_deleted_ingredient_ids')).toBeNull();

      // Áp dụng lại snapshot
      applyDataSnapshot(snapshot);

      expect(localStorage.getItem('bakery_deleted_ingredient_ids')).toBe(JSON.stringify(['ing-del-1', 'ing-del-2']));
      expect(localStorage.getItem('bakery_deleted_recipe_ids')).toBe(JSON.stringify(['rec-del-1']));
      expect(localStorage.getItem('bakery_pending_returns')).toBe(JSON.stringify([{ id: 'pr-1', order_id: 'ord-1' }]));
      expect(localStorage.getItem('bakery_order_returns')).toBe(JSON.stringify([{ id: 'ret-1', reason: 'Bánh hỏng' }]));
      expect(localStorage.getItem('bakery_held_orders')).toBe(JSON.stringify([{ id: 'held-1', customerName: 'Anh Nam' }]));
      expect(localStorage.getItem('bakery_admin_pin')).toBe('888888');

      // Xác nhận các CustomEvent được kích hoạt đầy đủ
      eventsToTrack.forEach((ev) => {
        expect(dispatchedEvents).toContain(ev);
        window.removeEventListener(ev, trackEvent);
      });
    });
  });

  describe('2. Chuyển đổi chế độ Online <-> Local SQL an toàn (Zero Data Loss)', () => {
    it('Dữ liệu không bị mất khi chuyển qua lại giữa Online và Local', async () => {
      // 1. Đang ở online mode, tạo dữ liệu
      saveSqlModeConfig({ mode: 'online' });
      localStorage.setItem('bakery_products', JSON.stringify([{ id: 'prod-online', name: 'Bánh Mì Chuối' }]));
      localStorage.setItem('bakery_order_returns', JSON.stringify([{ id: 'ret-online', refundAmount: 50000 }]));
      localStorage.setItem('bakery_deleted_ingredient_ids', JSON.stringify(['ing-online-deleted']));

      // 2. Chuyển sang Local mode
      await switchDatabaseMode('local');
      expect(getSqlModeConfig().mode).toBe('local');

      // Snapshot online phải được bảo toàn trong Vault
      const onlineVault = JSON.parse(localStorage.getItem('bakery_snapshot_online') || '{}');
      expect(onlineVault['bakery_products']).toContain('Bánh Mì Chuối');
      expect(onlineVault['bakery_order_returns']).toContain('ret-online');
      expect(onlineVault['bakery_deleted_ingredient_ids']).toContain('ing-online-deleted');

      // 3. Tại Local mode, thêm dữ liệu mới
      localStorage.setItem('bakery_products', JSON.stringify([{ id: 'prod-local', name: 'Bánh Su Kem' }]));
      localStorage.setItem('bakery_held_orders', JSON.stringify([{ id: 'held-local', total: 120000 }]));

      // 4. Chuyển ngược lại Online mode
      await switchDatabaseMode('online');
      expect(getSqlModeConfig().mode).toBe('online');

      // Dữ liệu online được khôi phục nguyên vẹn
      expect(localStorage.getItem('bakery_products')).toContain('Bánh Mì Chuối');
      expect(localStorage.getItem('bakery_order_returns')).toContain('ret-online');
      expect(localStorage.getItem('bakery_deleted_ingredient_ids')).toContain('ing-online-deleted');

      // Snapshot local được lưu lại an toàn
      const localVault = JSON.parse(localStorage.getItem('bakery_snapshot_local') || '{}');
      expect(localVault['bakery_products']).toContain('Bánh Su Kem');
      expect(localVault['bakery_held_orders']).toContain('held-local');
    });
  });

  describe('3. Local SQL Dump Parity (generateMasterSqlDump)', () => {
    it('Schema SQL hỗ trợ bảng pending_returns và các bảng nghiệp vụ', () => {
      const schema = generateSchemaSql();
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS pending_returns');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS order_returns');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS held_orders');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS ingredients');
      expect(schema).toContain('CREATE TABLE IF NOT EXISTS recipes');
    });

    it('generateMasterSqlDump sinh đủ câu lệnh INSERT cho 100% thực thể', () => {
      const mockData: BakeryBackupData = {
        schemaVersion: 'bakery-backup-v2',
        exportedAt: new Date().toISOString(),
        storeName: 'Tiệm Bánh Mẫu',
        dataHash: 'hash-123',
        metadata: {
          totalProducts: 1,
          totalOrders: 1,
          totalRecipes: 1,
          totalIngredients: 1,
          totalStockLogs: 0,
          totalSpoilageLogs: 0,
          totalMaterialTransactions: 0,
          totalMaterialStockAdjustments: 0,
          totalExpenses: 0,
          totalImages: 0,
          estimatedSizeBytes: 1000,
        },
        products: [{ id: 'p-1', name: 'Bánh Flan', price: 15000, is_active: true } as any],
        orders: [{ id: 'ord-1', order_number: 'DH001', total_amount: 30000, items: [] } as any],
        ingredients: [{ id: 'ing-1', name: 'Bột mì hoa ngọc lan', unit: 'kg', cost_per_unit: 22000 } as any],
        recipes: [{ id: 'rec-1', name: 'Công thức Bánh Flan', yield_qty: 10, yield_unit: 'hộp' } as any],
        order_returns: [
          {
            id: 'ret-101',
            order_id: 'ord-1',
            order_number: 'DH001',
            refund_amount: 15000,
            status: 'completed',
            reason: 'Bị móp méo',
            items: [{ id: 'ritem-1', product_id: 'p-1', product_name: 'Bánh Flan', quantity: 1, refund_price: 15000 }],
          } as any,
        ],
        held_orders: [
          {
            id: 'held-201',
            customer_name: 'Chị Lan',
            total_amount: 60000,
            note: 'Khách quay lại lấy sau 30 phút',
            items: [{ product_id: 'p-1', product_name: 'Bánh Flan', quantity: 4 }],
          } as any,
        ],
        pending_returns: [
          {
            id: 'pret-301',
            order_id: 'ord-1',
            reason: 'Chờ duyệt hoàn tiền',
          } as any,
        ],
      } as any;

      const sqlDump = generateMasterSqlDump(mockData);

      // Kiểm tra sự xuất hiện của các lệnh INSERT INTO
      expect(sqlDump).toContain('INSERT INTO products');
      expect(sqlDump).toContain('INSERT INTO orders');
      expect(sqlDump).toContain('INSERT INTO ingredients');
      expect(sqlDump).toContain('INSERT INTO recipes');
      expect(sqlDump).toContain('INSERT INTO order_returns');
      expect(sqlDump).toContain('INSERT INTO order_return_items');
      expect(sqlDump).toContain('INSERT INTO held_orders');
      expect(sqlDump).toContain('INSERT INTO pending_returns');

      // Kiểm tra dữ liệu được sanitize chính xác trong SQL
      expect(sqlDump).toContain("'ret-101'");
      expect(sqlDump).toContain("'Bị móp méo'");
      expect(sqlDump).toContain("'held-201'");
      expect(sqlDump).toContain('Chị Lan');
      expect(sqlDump).toContain("'pret-301'");
      expect(sqlDump).toContain("'Chờ duyệt hoàn tiền'");
    });
  });

  describe('4. Anti-Zombie Resurrection Integrity', () => {
    it('ID nguyên liệu và công thức đã xóa được giữ nguyên khi chuyển snapshot', () => {
      const deletedIngredients = ['uuid-ing-x1', 'uuid-ing-x2'];
      const deletedRecipes = ['uuid-rec-y1'];

      localStorage.setItem('bakery_deleted_ingredient_ids', JSON.stringify(deletedIngredients));
      localStorage.setItem('bakery_deleted_recipe_ids', JSON.stringify(deletedRecipes));

      const snapshot = captureDataSnapshot();
      expect(JSON.parse(snapshot['bakery_deleted_ingredient_ids'])).toEqual(deletedIngredients);
      expect(JSON.parse(snapshot['bakery_deleted_recipe_ids'])).toEqual(deletedRecipes);

      localStorage.clear();
      applyDataSnapshot(snapshot);

      const restoredIngs = JSON.parse(localStorage.getItem('bakery_deleted_ingredient_ids') || '[]');
      const restoredRecs = JSON.parse(localStorage.getItem('bakery_deleted_recipe_ids') || '[]');

      expect(restoredIngs).toEqual(deletedIngredients);
      expect(restoredRecs).toEqual(deletedRecipes);
    });
  });

  describe('5. Zero UUID Collision Check across SYS_CONFIG Entities', () => {
    it('DB_ROW_GLOBAL_SQL_ID và DB_ROW_RESET_EPOCH_ID phải là 2 UUID độc lập', async () => {
      const { DB_ROW_GLOBAL_SQL_ID } = await import('@/lib/supabase/databaseProfileManager');
      const { DB_ROW_RESET_EPOCH_ID } = await import('@/lib/utils/systemResetManager');

      expect(DB_ROW_GLOBAL_SQL_ID).not.toBe(DB_ROW_RESET_EPOCH_ID);
      expect(DB_ROW_GLOBAL_SQL_ID).toBe('00000000-0000-0000-0000-000000000098');
      expect(DB_ROW_RESET_EPOCH_ID).toBe('00000000-0000-0000-0000-000000000099');
    });

    it('DB_ROW_HELD_ORDERS_ID và DB_ROW_PENDING_RETURNS_ID không được trùng nhau', async () => {
      const { DB_ROW_HELD_ORDERS_ID } = await import('@/lib/utils/heldOrderManager');
      const { DB_ROW_PENDING_RETURNS_ID } = await import('@/lib/supabase/realtimeSync');

      expect(DB_ROW_HELD_ORDERS_ID).not.toBe(DB_ROW_PENDING_RETURNS_ID);
      expect(DB_ROW_PENDING_RETURNS_ID).toBe('00000000-0000-0000-0000-000000000028');
      expect(DB_ROW_HELD_ORDERS_ID).toBe('00000000-0000-0000-0000-000000000029');
    });
  });
});
