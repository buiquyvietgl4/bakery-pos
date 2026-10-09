import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDeletedIngredientIds,
  markIngredientAsDeleted,
  unmarkIngredientDeleted,
  filterActiveIngredients,
  deleteIngredientEverywhere,
  mergeIngredientLists,
  autoRecoverIngredientsFromRecipes,
  persistIngredientToSupabase,
  BAKERY_DELETED_INGREDIENT_IDS_KEY,
  BAKERY_INGREDIENTS_KEY,
} from '@/lib/utils/ingredientManager';
import { saveSqlModeConfig } from '@/lib/utils/sqlModeManager';

describe('Ingredient Manager & Anti-Resurrection Tombstone', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('markIngredientAsDeleted lưu id và tên vào danh sách đen và xóa khỏi localStorage', () => {
    const initialIngs = [
      { id: 'ing-1', name: 'Bột mì số 11', unit: 'g', avg_cost: 15000 },
      { id: 'ing-2', name: 'Đường cát trắng', unit: 'g', avg_cost: 20000 },
    ];
    localStorage.setItem(BAKERY_INGREDIENTS_KEY, JSON.stringify(initialIngs));

    markIngredientAsDeleted('ing-1', 'Bột mì số 11');

    const deletedSet = getDeletedIngredientIds();
    expect(deletedSet.has('ing-1')).toBe(true);
    expect(deletedSet.has('bột mì số 11')).toBe(true);

    const remaining = JSON.parse(localStorage.getItem(BAKERY_INGREDIENTS_KEY) || '[]');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('ing-2');
  });

  it('filterActiveIngredients lọc bỏ triệt để nguyên liệu đã bị xóa (chống hồi sinh)', () => {
    markIngredientAsDeleted('ing-1', 'Bột mì số 11');

    const rawFromCloud = [
      { id: 'ing-1', name: 'Bột mì số 11', unit: 'g' }, // Đã bị xóa
      { id: 'ing-2', name: 'Đường cát trắng', unit: 'g' },
      { id: 'SYS_CONFIG_1', name: 'SYS_CONFIG_TELEGRAM', unit: 'config' }, // Cấu hình hệ thống
    ];

    const active = filterActiveIngredients(rawFromCloud);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('ing-2');
  });

  it('unmarkIngredientDeleted cho phép tạo lại nguyên liệu nếu người dùng cố ý tạo mới', () => {
    markIngredientAsDeleted('ing-1', 'Bột mì số 11');
    expect(getDeletedIngredientIds().has('ing-1')).toBe(true);

    unmarkIngredientDeleted('ing-1', 'Bột mì số 11');
    expect(getDeletedIngredientIds().has('ing-1')).toBe(false);
  });

  it('deleteIngredientEverywhere dọn dẹp cả recipe items trong bakery_recipes', async () => {
    saveSqlModeConfig({ mode: 'local' });

    const recipes = [
      {
        id: 'rec-1',
        name: 'Bánh Mì Hoa Cúc',
        items: [
          { ingredient_id: 'ing-1', name: 'Bột mì số 11', quantity: 500, unit: 'g' },
          { ingredient_id: 'ing-2', name: 'Bơ lạt Anchor', quantity: 200, unit: 'g' },
        ],
      },
    ];
    localStorage.setItem('bakery_recipes', JSON.stringify(recipes));

    await deleteIngredientEverywhere('ing-1', 'Bột mì số 11');

    const updatedRecipes = JSON.parse(localStorage.getItem('bakery_recipes') || '[]');
    expect(updatedRecipes[0].items).toHaveLength(1);
    expect(updatedRecipes[0].items[0].ingredient_id).toBe('ing-2');
  });

  describe('mergeIngredientLists', () => {
    it('bảo toàn nguyên liệu tạo cục bộ khi hợp nhất với danh sách Cloud (chống F5 mất dữ liệu)', () => {
      const localList = [
        { id: 'local-1', name: 'Bột mì bánh', unit: 'g', stock_qty: 5000, avg_cost: 30 },
        { id: 'cloud-1', name: 'Đường cát', unit: 'g', stock_qty: 2000, avg_cost: 25 },
      ];

      const cloudList = [
        { id: 'cloud-1', name: 'Đường cát', unit: 'g', stock_qty: 2000, avg_cost: 25 },
        { id: 'cloud-2', name: 'Bơ Anchor', unit: 'g', stock_qty: 1000, avg_cost: 80 },
      ];

      const merged = mergeIngredientLists(localList, cloudList);

      // Phải có cả 3: Bột mì bánh (local-1), Đường cát (cloud-1), Bơ Anchor (cloud-2)
      expect(merged).toHaveLength(3);
      const botMi = merged.find((i) => i.name === 'Bột mì bánh');
      expect(botMi).toBeDefined();
      expect(botMi?.id).toBe('local-1');
      expect(botMi?.stock_qty).toBe(5000);
    });

    it('bổ sung thông tin bao bì, tỷ lệ quy đổi từ local nếu Cloud bị thiếu cột do schema cache', () => {
      const localList = [
        {
          id: 'cloud-1',
          name: 'Đường cát',
          unit: 'g',
          packaging_unit: 'Bao 50kg',
          conversion_rate: 50000,
        },
      ];

      const cloudList = [
        {
          id: 'cloud-1',
          name: 'Đường cát',
          unit: 'g',
          // Cloud cũ chưa có cột packaging_unit / conversion_rate
        },
      ];

      const merged = mergeIngredientLists(localList, cloudList);
      expect(merged).toHaveLength(1);
      expect(merged[0].packaging_unit).toBe('Bao 50kg');
      expect(merged[0].conversion_rate).toBe(50000);
    });

    it('loại trừ nguyên liệu đã bị xóa nằm trong tombstone list', () => {
      markIngredientAsDeleted('deleted-id', 'Bột gạo');

      const localList = [{ id: 'deleted-id', name: 'Bột gạo', unit: 'g' }];
      const cloudList = [{ id: 'ok-id', name: 'Sữa tươi', unit: 'ml' }];

      const merged = mergeIngredientLists(localList, cloudList);
      expect(merged).toHaveLength(1);
      expect(merged[0].name).toBe('Sữa tươi');
    });
  });

  describe('autoRecoverIngredientsFromRecipes', () => {
    it('tự động phát hiện và phục hồi nguyên liệu trong công thức BOM bị mất khỏi Kho', () => {
      const currentIngredients: any[] = [
        { id: 'ing-1', name: 'Bột mì đa dụng', unit: 'g', stock_qty: 10000 },
      ];

      const recipes = [
        {
          id: 'rec-mouse',
          name: 'Bánh mì chuột',
          items: [
            { ingredient_id: 'ing-missing-1', name: 'Bột mì bánh', quantity: 150, unit: 'g', cost: 4500 },
            { ingredient_id: 'ing-1', name: 'Bột mì đa dụng', quantity: 300, unit: 'g', cost: 6000 },
          ],
        },
      ];

      const { ingredients, recoveredCount } = autoRecoverIngredientsFromRecipes(currentIngredients, recipes);

      expect(recoveredCount).toBe(1);
      expect(ingredients).toHaveLength(2);

      const recovered = ingredients.find((i) => i.name === 'Bột mì bánh');
      expect(recovered).toBeDefined();
      expect(recovered?.id).toBe('ing-missing-1');
      expect(recovered?.unit).toBe('g');
      expect(recovered?.stock_qty).toBe(5000);
      expect(recovered?.avg_cost).toBe(30); // 4500 / 150 = 30
      expect(recovered?.packaging_unit).toBe('Túi 1kg');
      expect(recovered?.conversion_rate).toBe(1000);
    });

    it('gỡ nguyên liệu khỏi tombstone deleted list nếu nguyên liệu đó được phục hồi từ BOM đang hoạt động', () => {
      markIngredientAsDeleted('ing-30887', 'Bột mì bánh');
      expect(getDeletedIngredientIds().has('ing-30887')).toBe(true);

      const currentIngredients: any[] = [];
      const recipes = [
        {
          id: 'rec-mouse',
          name: 'Bánh mì chuột',
          items: [
            { ingredient_id: 'ing-30887', name: 'Bột mì bánh', quantity: 150, unit: 'g' },
          ],
        },
      ];

      const { ingredients, recoveredCount } = autoRecoverIngredientsFromRecipes(currentIngredients, recipes);
      expect(recoveredCount).toBe(1);
      expect(ingredients).toHaveLength(1);

      // Phải được unmark khỏi danh sách đen
      expect(getDeletedIngredientIds().has('ing-30887')).toBe(false);
      expect(getDeletedIngredientIds().has('bột mì bánh')).toBe(false);
    });

    it('không duplicate nếu nguyên liệu đã có sẵn trong Kho', () => {
      const currentIngredients: any[] = [
        { id: 'ing-1', name: 'Bột mì bánh', unit: 'g', stock_qty: 5000 },
      ];

      const recipes = [
        {
          id: 'rec-1',
          name: 'Bánh mì chuột',
          items: [
            { ingredient_id: 'ing-1', name: 'Bột mì bánh', quantity: 150, unit: 'g' },
          ],
        },
      ];

      const { ingredients, recoveredCount } = autoRecoverIngredientsFromRecipes(currentIngredients, recipes);
      expect(recoveredCount).toBe(0);
      expect(ingredients).toHaveLength(1);
    });
  });

  describe('persistIngredientToSupabase', () => {
    it('thành công an toàn ở chế độ Local Mode mà không gọi mạng', async () => {
      saveSqlModeConfig({ mode: 'local' });

      const res = await persistIngredientToSupabase({
        id: 'test-ing-1',
        name: 'Bột phô mai',
        unit: 'g',
      });

      expect(res.success).toBe(true);
    });

    it('tự động unmark nguyên liệu khỏi danh sách đen khi gọi persist', async () => {
      saveSqlModeConfig({ mode: 'local' });
      markIngredientAsDeleted('test-ing-1', 'Bột phô mai');
      expect(getDeletedIngredientIds().has('test-ing-1')).toBe(true);

      await persistIngredientToSupabase({
        id: 'test-ing-1',
        name: 'Bột phô mai',
        unit: 'g',
      });

      expect(getDeletedIngredientIds().has('test-ing-1')).toBe(false);
    });
  });
});
