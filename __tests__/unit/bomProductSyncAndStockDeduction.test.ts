import { describe, it, expect, beforeEach } from 'vitest';
import { 
  syncBomToProducts, 
  getDefaultCakeImageUrl, 
  isProductFromBom, 
  deleteProductByBomRef,
  filterActiveProducts,
  DEFAULT_CAKE_FALLBACK_IMAGE,
} from '@/lib/utils/productManager';
import { deductRecipeIngredients, getBakeryIngredients, saveBakeryIngredients } from '@/lib/utils/inventoryDeductionManager';

describe('BOM to Products Sync & Ingredient Stock Deduction', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getDefaultCakeImageUrl', () => {
    it('trả về ảnh phù hợp theo từ khóa tên bánh', () => {
      const imgChuot = getDefaultCakeImageUrl('Bánh mì chuột giòn tan');
      expect(imgChuot).toContain('images.unsplash.com');

      const imgCroissant = getDefaultCakeImageUrl('Bánh sừng bò bơ Pháp');
      expect(imgCroissant).toContain('images.unsplash.com');

      const imgSinhNhat = getDefaultCakeImageUrl('Bánh sinh nhật socola kem tươi', 'Bánh kem & Bánh đặt');
      expect(imgSinhNhat).toContain('images.unsplash.com');

      const imgSuKem = getDefaultCakeImageUrl('Bánh su kem vani');
      expect(imgSuKem).toContain('images.unsplash.com');
    });

    it('bánh sinh nhật whipping/vani trả về ảnh hợp lệ đang hoạt động và không dùng link ảnh 404 cũ', () => {
      const imgWhipping = getDefaultCakeImageUrl('BOM Bánh Sinh Nhật Whipping Vani 18cm (Tiêu chuẩn)');
      // Không được trả về ảnh ID cũ đã bị Unsplash xóa (1535141192574)
      expect(imgWhipping).not.toContain('1535141192574');
      // Trả về ảnh mới hợp lệ (1588195538326)
      expect(imgWhipping).toContain('1588195538326');
      expect(DEFAULT_CAKE_FALLBACK_IMAGE).toContain('1588195538326');
    });

    it('filterActiveProducts tự động phục hồi bánh có ảnh bị lỗi 404 Unsplash', () => {
      const brokenProducts = [
        {
          id: 'cake-01',
          name: 'BOM Bánh Sinh Nhật Whipping Vani 18cm (Tiêu chuẩn)',
          category: 'Bánh kem & Bánh đặt',
          image_url: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?w=600&auto=format&fit=crop',
          is_active: true,
        },
      ];

      const healed = filterActiveProducts(brokenProducts);
      expect(healed.length).toBe(1);
      expect(healed[0].image_url).not.toContain('1535141192574');
      expect(healed[0].image_url).toContain('1588195538326');
    });
  });

  describe('syncBomToProducts', () => {
    it('tự động tạo sản phẩm bánh và ảnh cho bánh thường có BOM (recipes)', () => {
      const mockRecipes = [
        {
          id: 'rec-baguette-01',
          name: 'Bánh mì chuột giòn',
          category: 'Bánh mì & Bánh tươi',
          yield_qty: 10,
          yield_unit: 'ổ',
          cost_per_unit: 3500,
          suggested_price: 10000,
          items: [{ name: 'Bột mì bánh', qty: 500, unit: 'g', cost: 12000 }],
        },
      ];

      const { updatedProducts, addedCount } = syncBomToProducts(mockRecipes, [], []);
      expect(addedCount).toBe(1);
      expect(updatedProducts.length).toBe(1);

      const prod = updatedProducts[0];
      expect(prod.name).toBe('Bánh mì chuột giòn');
      expect(prod.selling_price).toBe(10000);
      expect(prod.base_cost_price).toBe(3500);
      expect(prod.image_url).toBeDefined();
      expect(prod.image_url.length).toBeGreaterThan(10);
      expect(prod.recipe_id).toBe('rec-baguette-01');
    });

    it('tự động tạo sản phẩm bánh cho bánh sinh nhật có BOM (birthdayPresets)', () => {
      const mockBirthdayPresets = [
        {
          id: 'preset-bday-choc-18',
          name: 'Bánh Sinh Nhật Socola 18cm',
          suggestedSellingPrice: 380000,
          targetFoodCostPct: 35,
        },
      ];

      const { updatedProducts, addedCount } = syncBomToProducts([], mockBirthdayPresets, []);
      expect(addedCount).toBe(1);
      expect(updatedProducts.length).toBe(1);

      const prod = updatedProducts[0];
      expect(prod.name).toBe('Bánh Sinh Nhật Socola 18cm');
      expect(prod.selling_price).toBe(380000);
      expect(prod.base_cost_price).toBe(133000);
      expect(prod.cake_type_label).toBe('birthday');
      expect(prod.bom_preset_id).toBe('preset-bday-choc-18');
      expect(prod.image_url).toBeDefined();
    });

    it('cập nhật ảnh mặc định cho sản phẩm đã có nếu ảnh đang rỗng', () => {
      const mockRecipes = [
        {
          id: 'rec-01',
          name: 'Bánh Croissant Bơ',
          cost_per_unit: 15000,
          items: [],
        },
      ];
      const existingProducts = [
        {
          id: 'rec-01',
          name: 'Bánh Croissant Bơ',
          selling_price: 35000,
          image_url: '',
        },
      ];

      const { updatedProducts, addedCount } = syncBomToProducts(mockRecipes, [], existingProducts);
      expect(addedCount).toBe(0);
      expect(updatedProducts[0].image_url).toBeDefined();
      expect(updatedProducts[0].image_url.length).toBeGreaterThan(10);
    });

    it('không hồi sinh sản phẩm đã nằm trong danh sách đen đã xóa (deleted tombstone)', () => {
      localStorage.setItem('bakery_deleted_product_ids', JSON.stringify(['bánh mì chuột giòn']));

      const mockRecipes = [
        {
          id: 'rec-baguette-01',
          name: 'Bánh mì chuột giòn',
          cost_per_unit: 3500,
          items: [],
        },
      ];

      const { updatedProducts, addedCount } = syncBomToProducts(mockRecipes, [], []);
      expect(addedCount).toBe(0);
      expect(updatedProducts.length).toBe(0);
    });
  });

  describe('deductRecipeIngredients (Trừ tồn kho khi làm bánh theo BOM)', () => {
    it('tự động trừ tồn kho nguyên vật liệu chính xác theo tỷ lệ mẻ', async () => {
      const initialIngredients = [
        { id: 'ing-flour', name: 'Bột mì bánh', unit: 'g', stock_qty: 5000, avg_cost: 20 },
        { id: 'ing-sugar', name: 'Đường kính', unit: 'g', stock_qty: 3000, avg_cost: 25 },
        { id: 'ing-butter', name: 'Bơ nhạt Anchor', unit: 'g', stock_qty: 2000, avg_cost: 200 },
      ];
      await saveBakeryIngredients(initialIngredients);

      const recipe = {
        id: 'rec-croissant',
        name: 'Bánh sừng bò',
        yield_qty: 10,
        yield_unit: 'cái',
        items: [
          { ingredient_id: 'ing-flour', name: 'Bột mì bánh', quantity: 500, unit: 'g', cost: 10000 },
          { ingredient_id: 'ing-sugar', name: 'Đường kính', quantity: 100, unit: 'g', cost: 2500 },
          { ingredient_id: 'ing-butter', name: 'Bơ nhạt Anchor', quantity: 250, unit: 'g', cost: 50000 },
        ],
      };

      // Làm 1 mẻ (10 chiếc): Trừ 500g bột, 100g đường, 250g bơ
      const res = await deductRecipeIngredients(recipe, 10);
      expect(res.success).toBe(true);
      expect(res.deductedItems.length).toBe(3);

      const updated = getBakeryIngredients();
      const flour = updated.find((i) => i.id === 'ing-flour');
      const sugar = updated.find((i) => i.id === 'ing-sugar');
      const butter = updated.find((i) => i.id === 'ing-butter');

      expect(flour?.stock_qty).toBe(4500); // 5000 - 500
      expect(sugar?.stock_qty).toBe(2900); // 3000 - 100
      expect(butter?.stock_qty).toBe(1750); // 2000 - 250
    });

    it('tính toán quy đổi tỷ lệ chính xác khi làm số lượng mẻ khác định mức chuẩn', async () => {
      const initialIngredients = [
        { id: 'ing-flour', name: 'Bột mì bánh', unit: 'g', stock_qty: 5000, avg_cost: 20 },
      ];
      await saveBakeryIngredients(initialIngredients);

      const recipe = {
        id: 'rec-croissant',
        name: 'Bánh sừng bò',
        yield_qty: 10,
        yield_unit: 'cái',
        items: [
          { ingredient_id: 'ing-flour', name: 'Bột mì bánh', quantity: 500, unit: 'g' },
        ],
      };

      // Làm 20 chiếc (gấp đôi định mức chuẩn): Trừ 1000g
      const res = await deductRecipeIngredients(recipe, 20);
      expect(res.success).toBe(true);

      const updated = getBakeryIngredients();
      const flour = updated.find((i) => i.id === 'ing-flour');
      expect(flour?.stock_qty).toBe(4000); // 5000 - 1000
    });

    it('tìm kiếm nguyên liệu theo tên không dấu nếu ID không khớp', async () => {
      const initialIngredients = [
        { id: 'ing-flour-99', name: 'Bột mì bánh', unit: 'g', stock_qty: 2000, avg_cost: 20 },
      ];
      await saveBakeryIngredients(initialIngredients);

      const recipe = {
        id: 'rec-test',
        name: 'Bánh quy bơ',
        yield_qty: 5,
        items: [
          // Tên không dấu "Bot mi banh"
          { name: 'Bot mi banh', quantity: 300, unit: 'g' },
        ],
      };

      const res = await deductRecipeIngredients(recipe, 5);
      expect(res.success).toBe(true);
      expect(res.deductedItems.length).toBe(1);

      const updated = getBakeryIngredients();
      const flour = updated.find((i) => i.id === 'ing-flour-99');
      expect(flour?.stock_qty).toBe(1700);
    });

    it('tự động khởi tạo và đưa vào kho nếu nguyên liệu trong BOM chưa có sẵn trong kho', async () => {
      // Kho ban đầu rỗng
      await saveBakeryIngredients([]);

      const recipe = {
        id: 'rec-new',
        name: 'Bánh Mì Ngũ Cốc',
        yield_qty: 1,
        items: [
          { name: 'Hạt chia hữu cơ', quantity: 50, unit: 'g', cost: 15000 },
        ],
      };

      const res = await deductRecipeIngredients(recipe, 1);
      expect(res.success).toBe(true);
      expect(res.deductedItems.length).toBe(1);

      const updated = getBakeryIngredients();
      expect(updated.length).toBe(1);
      expect(updated[0].name).toBe('Hạt chia hữu cơ');
    });
  });

  describe('isProductFromBom (Kiểm tra bánh có thuộc định mức BOM)', () => {
    it('nhận diện chính xác bánh thuộc BOM theo recipe_id và bom_preset_id', () => {
      const prodRecipe = { id: 'p1', name: 'Bánh Mì Chuột', recipe_id: 'rec-01' };
      const prodPreset = { id: 'p2', name: 'Bánh Sinh Nhật Vani', bom_preset_id: 'preset-01' };
      const prodFree = { id: 'p3', name: 'Nước Ngọt Coca', product_type: 'imported' };

      expect(isProductFromBom(prodRecipe)).toBe(true);
      expect(isProductFromBom(prodPreset)).toBe(true);
      expect(isProductFromBom(prodFree)).toBe(false);
    });

    it('nhận diện chính xác theo tên khớp với công thức BOM hiện có', () => {
      const recipes = [{ id: 'rec-baguette', name: 'Bánh Mì Chuột Giòn' }];
      const prod = { id: 'p-custom', name: 'Bánh Mì Chuột Giòn' };

      expect(isProductFromBom(prod, recipes)).toBe(true);

      const prodOther = { id: 'p-other', name: 'Bánh Bông Lan Trứng Muối' };
      expect(isProductFromBom(prodOther, recipes)).toBe(false);
    });
  });

  describe('deleteProductByBomRef (Xóa bánh khi xóa BOM)', () => {
    it('tự động xóa sản phẩm tương ứng trong danh mục bánh khi xóa BOM recipe hoặc preset', async () => {
      const products = [
        { id: 'prod-01', name: 'Bánh Mì Chuột Giòn', recipe_id: 'rec-01', is_active: true },
        { id: 'prod-02', name: 'Bánh Sinh Nhật Socola', bom_preset_id: 'preset-01', is_active: true },
        { id: 'prod-03', name: 'Nước Táo Ép', is_active: true },
      ];
      localStorage.setItem('bakery_products', JSON.stringify(products));

      // Xóa BOM của Bánh mì chuột (rec-01)
      const res1 = await deleteProductByBomRef('rec-01', 'Bánh Mì Chuột Giòn');
      expect(res1.deletedCount).toBe(1);

      const rawAfter1 = localStorage.getItem('bakery_products');
      const prodsAfter1 = JSON.parse(rawAfter1 || '[]');
      expect(prodsAfter1.some((p: any) => p.name === 'Bánh Mì Chuột Giòn')).toBe(false);
      expect(prodsAfter1.some((p: any) => p.name === 'Bánh Sinh Nhật Socola')).toBe(true);

      // Xóa BOM preset của Bánh sinh nhật socola (preset-01)
      const res2 = await deleteProductByBomRef('preset-01', 'Bánh Sinh Nhật Socola');
      expect(res2.deletedCount).toBe(1);

      const rawAfter2 = localStorage.getItem('bakery_products');
      const prodsAfter2 = JSON.parse(rawAfter2 || '[]');
      expect(prodsAfter2.some((p: any) => p.name === 'Bánh Sinh Nhật Socola')).toBe(false);
      expect(prodsAfter2.some((p: any) => p.name === 'Nước Táo Ép')).toBe(true);
    });
  });
});
