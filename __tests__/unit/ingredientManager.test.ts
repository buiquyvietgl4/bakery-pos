import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDeletedIngredientIds,
  markIngredientAsDeleted,
  unmarkIngredientDeleted,
  filterActiveIngredients,
  deleteIngredientEverywhere,
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
});
