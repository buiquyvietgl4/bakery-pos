import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getBakingHistory,
  recordBakingLog,
  deduplicateBakingHistory,
  BAKING_HISTORY_STORAGE_KEY,
  BAKING_HISTORY_UPDATED_EVENT,
} from '@/lib/utils/bakingHistoryManager';
import {
  deductRecipeIngredients,
  deductOrderIngredients,
} from '@/lib/utils/inventoryDeductionManager';
import { BakingHistoryRecord } from '@/lib/types/bakingHistory';
import { generateSchemaSql, generateMasterSqlDump } from '@/lib/utils/localSqlManager';

describe('Baking History & Automatic Stock Deduction', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('bakingHistoryManager', () => {
    it('ghi nhận mẻ làm bánh mới vào localStorage và trả về mảng lịch sử', async () => {
      const record = await recordBakingLog({
        cakeName: 'Bánh Mì Hoa Cúc',
        cakeCategory: 'retail',
        quantity: 10,
        unit: 'cái',
        recipeId: 'rec-1',
        batchId: 'batch-001',
        bakeTemp: 175,
        bakeMinutes: 25,
        totalCost: 150000,
        costPerUnit: 15000,
        ingredients: [
          { name: 'Bột mì số 13', quantity: 1000, unit: 'g', unitCost: 30, totalCost: 30000 },
          { name: 'Bơ lạt Anchor', quantity: 400, unit: 'g', unitCost: 200, totalCost: 80000 },
          { name: 'Đường cát', quantity: 200, unit: 'g', unitCost: 20, totalCost: 4000 },
        ],
        performedBy: 'Thợ Bếp A',
      });

      expect(record.id).toBeDefined();
      expect(record.cakeName).toBe('Bánh Mì Hoa Cúc');
      expect(record.totalCost).toBe(150000);

      const history = getBakingHistory();
      expect(history.length).toBe(1);
      expect(history[0].cakeName).toBe('Bánh Mì Hoa Cúc');
      expect(history[0].ingredients).toHaveLength(3);
    });

    it('loại bỏ các bản ghi trùng lặp và sắp xếp mới nhất lên đầu', () => {
      const records: BakingHistoryRecord[] = [
        {
          id: 'log-1',
          cakeName: 'Bánh Croissant',
          cakeCategory: 'retail',
          quantity: 20,
          unit: 'cái',
          totalCost: 200000,
          costPerUnit: 10000,
          ingredients: [],
          createdAt: '2026-10-09T08:00:00.000Z',
        },
        {
          id: 'log-2',
          cakeName: 'Bánh Su Kem',
          cakeCategory: 'retail',
          quantity: 50,
          unit: 'cái',
          totalCost: 100000,
          costPerUnit: 2000,
          ingredients: [],
          createdAt: '2026-10-09T09:00:00.000Z',
        },
        {
          id: 'log-1', // trùng id log-1
          cakeName: 'Bánh Croissant Cũ',
          cakeCategory: 'retail',
          quantity: 20,
          unit: 'cái',
          totalCost: 200000,
          costPerUnit: 10000,
          ingredients: [],
          createdAt: '2026-10-09T08:00:00.000Z',
        },
      ];

      const deduped = deduplicateBakingHistory(records);
      expect(deduped).toHaveLength(2);
      expect(deduped[0].id).toBe('log-2'); // Mới nhất lên đầu
      expect(deduped[1].id).toBe('log-1');
    });

    it('bắn Event baking_history_updated khi ghi nhận log', async () => {
      const eventSpy = vi.fn();
      window.addEventListener(BAKING_HISTORY_UPDATED_EVENT, eventSpy);

      await recordBakingLog({
        cakeName: 'Bánh Bông Lan Trứng Muối',
        cakeCategory: 'retail',
        quantity: 5,
        unit: 'hộp',
        totalCost: 80000,
        costPerUnit: 16000,
        ingredients: [],
      });

      expect(eventSpy).toHaveBeenCalled();
      window.removeEventListener(BAKING_HISTORY_UPDATED_EVENT, eventSpy);
    });
  });

  describe('deductRecipeIngredients (Bánh thường / BOM)', () => {
    it('tự động trừ tồn kho nguyên liệu trong kho bakery_ingredients theo tỉ lệ mẻ', async () => {
      // Thiết lập kho nguyên liệu ban đầu
      const initialIngredients = [
        { id: 'ing-flour', name: 'Bột mì', unit: 'g', stock_qty: 2000, avg_cost: 25 },
        { id: 'ing-butter', name: 'Bơ Pháp', unit: 'g', stock_qty: 1000, avg_cost: 150 },
        { id: 'ing-sugar', name: 'Đường', unit: 'g', stock_qty: 1500, avg_cost: 20 },
      ];
      localStorage.setItem('bakery_ingredients', JSON.stringify(initialIngredients));

      // Công thức cho 1 cái bánh: 100g bột mì, 20g bơ, 10g đường
      const recipe = {
        id: 'rec-croissant',
        name: 'Bánh Croissant Bơ Tỏi',
        yield_count: 1,
        items: [
          { ingredient_name: 'Bột mì', quantity: 100, unit: 'g' },
          { ingredient_name: 'Bơ Pháp', quantity: 20, unit: 'g' },
          { ingredient_name: 'Đường', quantity: 10, unit: 'g' },
        ],
      };

      // Ra lò 5 cái bánh
      const result = await deductRecipeIngredients(recipe, 5, {
        batchId: 'BATCH-20261009-01',
        bakeTemp: 180,
        bakeMinutes: 20,
        performedBy: 'Thợ Bếp Minh',
      });

      expect(result.success).toBe(true);
      expect(result.totalCost).toBe(5 * (100 * 25 + 20 * 150 + 10 * 20)); // 5 * (2500 + 3000 + 200) = 5 * 5700 = 28500
      expect(result.deductedItems).toHaveLength(3);

      // Kiểm tra tồn kho sau khi trừ:
      // Bột mì: 2000 - 500 = 1500
      // Bơ Pháp: 1000 - 100 = 900
      // Đường: 1500 - 50 = 1450
      const updatedIngredients = JSON.parse(localStorage.getItem('bakery_ingredients') || '[]');
      const flour = updatedIngredients.find((i: any) => i.id === 'ing-flour');
      const butter = updatedIngredients.find((i: any) => i.id === 'ing-butter');
      const sugar = updatedIngredients.find((i: any) => i.id === 'ing-sugar');

      expect(flour.stock_qty).toBe(1500);
      expect(butter.stock_qty).toBe(900);
      expect(sugar.stock_qty).toBe(1450);

      // Kiểm tra lịch sử làm bánh được ghi nhận tự động
      const history = getBakingHistory();
      expect(history).toHaveLength(1);
      expect(history[0].cakeName).toBe('Bánh Croissant Bơ Tỏi');
      expect(history[0].cakeCategory).toBe('retail');
      expect(history[0].quantity).toBe(5);
      expect(history[0].batchId).toBe('BATCH-20261009-01');
      expect(history[0].performedBy).toBe('Thợ Bếp Minh');
    });
  });

  describe('deductOrderIngredients (Bánh sinh nhật KDS)', () => {
    it('tự động trừ kho cốt bánh, kem và ghi nhận vào lịch sử làm bánh', async () => {
      const initialIngredients = [
        { id: 'ing-cot', name: 'Cốt Bông Lan Vani 16cm', unit: 'cốt', stock_qty: 10, avg_cost: 30000 },
        { id: 'ing-kem', name: 'Kem Whipping Anchor', unit: 'ml', stock_qty: 5000, avg_cost: 90 },
      ];
      localStorage.setItem('bakery_ingredients', JSON.stringify(initialIngredients));

      const order = {
        id: 'ord-bday-001',
        order_number: 'DH-001',
        customer_name: 'Chị Mai',
        items: [
          {
            product_name_snapshot: 'Bánh Sinh Nhật Vani',
            quantity: 1,
            unit_price: 250000,
          },
        ],
        notes: JSON.stringify({
          custom_cake: {
            selectedBase: { name: 'Cốt Bông Lan Vani 16cm', quantity: 1, unit: 'cốt', cost: 30000 },
            selectedFrosting: { name: 'Kem Whipping Anchor', quantity: 300, unit: 'ml', cost: 27000 },
          },
        }),
      };

      const result = await deductOrderIngredients(order);
      expect(result.success).toBe(true);

      // Kiểm tra tồn kho đã bị trừ
      const updatedIngredients = JSON.parse(localStorage.getItem('bakery_ingredients') || '[]');
      const cot = updatedIngredients.find((i: any) => i.name.includes('Cốt'));
      const kem = updatedIngredients.find((i: any) => i.name.includes('Kem'));
      expect(cot.stock_qty).toBe(9); // 10 - 1
      expect(kem.stock_qty).toBe(4700); // 5000 - 300

      // Kiểm tra lịch sử làm bánh có ghi nhận đơn bánh sinh nhật
      const history = getBakingHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      const bdayLog = history.find((h) => h.cakeCategory === 'birthday');
      expect(bdayLog).toBeDefined();
      expect(bdayLog?.orderNumber).toBe('DH-001');
      expect(bdayLog?.cakeName).toBe('Bánh Sinh Nhật Vani');
    });
  });

  describe('Local SQL Synchronization', () => {
    it('generateSchemaSql chứa bảng baking_history', () => {
      const schemaSql = generateSchemaSql();
      expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS baking_history');
      expect(schemaSql).toContain('cake_name');
      expect(schemaSql).toContain('total_cost');
      expect(schemaSql).toContain('ingredients_json');
    });

    it('generateMasterSqlDump sinh lệnh INSERT INTO baking_history khi có lịch sử', () => {
      const record: BakingHistoryRecord = {
        id: 'test-dump-1',
        cakeName: 'Bánh Su Kem Hoàng Gia',
        cakeCategory: 'retail',
        quantity: 12,
        unit: 'cái',
        totalCost: 45000,
        costPerUnit: 3750,
        ingredients: [
          { name: 'Bột mì', quantity: 150, unit: 'g', unitCost: 30, totalCost: 4500 },
        ],
        createdAt: '2026-10-09T10:00:00.000Z',
      };
      localStorage.setItem('bakery_baking_history', JSON.stringify([record]));

      const dumpSql = generateMasterSqlDump();
      expect(dumpSql).toContain('INSERT INTO baking_history');
      expect(dumpSql).toContain('Bánh Su Kem Hoàng Gia');
    });
  });
});
