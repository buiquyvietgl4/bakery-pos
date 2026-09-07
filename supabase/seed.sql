-- seed.sql
-- Dữ liệu mẫu khởi tạo tiệm bánh: Nguyên vật liệu, Công thức BOM, Sản phẩm & Giá vốn tự động

DO $$
DECLARE
    v_flour_id UUID;
    v_butter_id UUID;
    v_egg_id UUID;
    v_sugar_id UUID;
    v_milk_id UUID;
    v_salted_egg_id UUID;
    v_box_id UUID;
    v_candle_id UUID;
    
    v_recipe_bltm_id UUID;
    v_recipe_croissant_id UUID;
    v_recipe_garlic_bread_id UUID;

    v_prod_bltm_id UUID;
    v_prod_croissant_id UUID;
    v_prod_garlic_id UUID;
BEGIN
    -- 1. NGUYÊN VẬT LIỆU BAN ĐẦU
    INSERT INTO ingredients (name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct)
    VALUES ('Bột mì số 11 (Bake)', 'g', 'Bột & Ngũ cốc', 25000, 5000, 25, 5.0)
    RETURNING id INTO v_flour_id;

    INSERT INTO ingredients (name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct)
    VALUES ('Bơ lạt Anchor', 'g', 'Bơ sữa', 10000, 2000, 120, 0.0)
    RETURNING id INTO v_butter_id;

    INSERT INTO ingredients (name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct)
    VALUES ('Trứng gà ta', 'quả', 'Trứng', 200, 50, 3500, 2.0)
    RETURNING id INTO v_egg_id;

    INSERT INTO ingredients (name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct)
    VALUES ('Đường cát trắng', 'g', 'Gia vị', 15000, 3000, 18, 0.0)
    RETURNING id INTO v_sugar_id;

    INSERT INTO ingredients (name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct)
    VALUES ('Sữa tươi không đường', 'ml', 'Bơ sữa', 12000, 3000, 35, 2.0)
    RETURNING id INTO v_milk_id;

    INSERT INTO ingredients (name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct)
    VALUES ('Trứng muối nướng', 'quả', 'Nhân bánh', 150, 30, 7000, 5.0)
    RETURNING id INTO v_salted_egg_id;

    INSERT INTO ingredients (name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct)
    VALUES ('Hộp bánh kem Kraft 20cm', 'cái', 'Bao bì & Phụ kiện', 100, 20, 15000, 0.0)
    RETURNING id INTO v_box_id;

    INSERT INTO ingredients (name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct)
    VALUES ('Bộ dao nĩa + Nến sinh nhật', 'cái', 'Bao bì & Phụ kiện', 200, 50, 3000, 0.0)
    RETURNING id INTO v_candle_id;

    -- 2. CÔNG THỨC BÁNH (RECIPES / BOM)
    -- Recipe 1: Bánh Bông Lan Trứng Muối (Yield: 1 chiếc)
    INSERT INTO recipes (name, yield_qty, yield_unit, notes)
    VALUES ('Công thức Bông Lan Trứng Muối Tiêu Chuẩn', 1, 'chiếc', 'Cốt bánh mềm mịn, sốt phô mai')
    RETURNING id INTO v_recipe_bltm_id;

    INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit) VALUES
    (v_recipe_bltm_id, v_flour_id, 300, 'g'),
    (v_recipe_bltm_id, v_egg_id, 6, 'quả'),
    (v_recipe_bltm_id, v_butter_id, 150, 'g'),
    (v_recipe_bltm_id, v_sugar_id, 200, 'g'),
    (v_recipe_bltm_id, v_salted_egg_id, 8, 'quả'),
    (v_recipe_bltm_id, v_box_id, 1, 'cái'),
    (v_recipe_bltm_id, v_candle_id, 1, 'cái');

    -- Recipe 2: Bánh Croissant Bơ Pháp (Yield: 10 chiếc / mẻ)
    INSERT INTO recipes (name, yield_qty, yield_unit, notes)
    VALUES ('Công thức Bánh Sừng Bò Croissant (Mẻ 10 cái)', 10, 'chiếc', 'Cán 3 lần gấp')
    RETURNING id INTO v_recipe_croissant_id;

    INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit) VALUES
    (v_recipe_croissant_id, v_flour_id, 500, 'g'),
    (v_recipe_croissant_id, v_butter_id, 250, 'g'),
    (v_recipe_croissant_id, v_milk_id, 200, 'ml'),
    (v_recipe_croissant_id, v_sugar_id, 60, 'g');

    -- Recipe 3: Bánh Mì Bơ Tỏi (Yield: 5 chiếc / mẻ)
    INSERT INTO recipes (name, yield_qty, yield_unit, notes)
    VALUES ('Công thức Bánh Mì Bơ Tỏi Phô Mai (Mẻ 5 cái)', 5, 'chiếc', 'Nướng vàng 180 độ')
    RETURNING id INTO v_recipe_garlic_bread_id;

    INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit) VALUES
    (v_recipe_garlic_bread_id, v_flour_id, 400, 'g'),
    (v_recipe_garlic_bread_id, v_butter_id, 200, 'g'),
    (v_recipe_garlic_bread_id, v_egg_id, 2, 'quả'),
    (v_recipe_garlic_bread_id, v_sugar_id, 50, 'g');

    -- 3. SẢN PHẨM BÁN LẺ (PRODUCTS)
    INSERT INTO products (name, category, image_url, selling_price, recipe_id, is_preorder_only)
    VALUES (
        'Bánh Bông Lan Trứng Muối Phô Mai 18cm',
        'Bánh kem & Bánh đặt',
        'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop',
        365000,
        v_recipe_bltm_id,
        true
    ) RETURNING id INTO v_prod_bltm_id;

    UPDATE recipes SET product_id = v_prod_bltm_id WHERE id = v_recipe_bltm_id;

    INSERT INTO products (name, category, image_url, selling_price, recipe_id, is_preorder_only)
    VALUES (
        'Bánh Croissant Bơ Pháp Thượng Hạng',
        'Bánh mì & Bánh tươi',
        'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop',
        35000,
        v_recipe_croissant_id,
        false
    ) RETURNING id INTO v_prod_croissant_id;

    UPDATE recipes SET product_id = v_prod_croissant_id WHERE id = v_recipe_croissant_id;

    INSERT INTO products (name, category, image_url, selling_price, recipe_id, is_preorder_only)
    VALUES (
        'Bánh Mì Bơ Tỏi Phô Mai Chảy',
        'Bánh mì & Bánh tươi',
        'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop',
        45000,
        v_recipe_garlic_bread_id,
        false
    ) RETURNING id INTO v_prod_garlic_id;

    UPDATE recipes SET product_id = v_prod_garlic_id WHERE id = v_recipe_garlic_bread_id;

    -- Thêm biến thể kích thước cho Bông Lan Trứng Muối
    INSERT INTO product_variants (product_id, variant_name, size_multiplier, selling_price)
    VALUES
    (v_prod_bltm_id, 'Size Tiêu chuẩn 18cm', 1.0, 365000),
    (v_prod_bltm_id, 'Size Lớn 22cm', 1.4, 480000);

    -- 4. TÍNH TOÁN GIÁ VỐN TOÀN BỘ TỰ ĐỘNG
    PERFORM recalculate_recipe_costs();
END $$;
