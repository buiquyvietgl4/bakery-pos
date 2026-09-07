-- 00004_create_recipes.sql
-- Quản lý Công thức Bánh (Recipe / Bill of Materials - BOM)

CREATE TABLE recipes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    product_id          UUID,                          -- Sẽ add constraint sau khi tạo bảng products
    yield_qty           NUMERIC(8,2) NOT NULL DEFAULT 1, -- Số lượng thành phẩm ra lò
    yield_unit          TEXT NOT NULL DEFAULT 'chiếc',
    total_material_cost NUMERIC(12,2) NOT NULL DEFAULT 0, -- Tự động tính toán
    cost_per_unit       NUMERIC(12,2) NOT NULL DEFAULT 0, -- total_material_cost / yield_qty
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity        NUMERIC(12,3) NOT NULL,       -- Định lượng công thức
    unit            TEXT NOT NULL,                 -- Đơn vị (g, ml, quả...)
    line_cost       NUMERIC(12,2) NOT NULL DEFAULT 0, -- quantity * (1 + wastage%) * avg_cost
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE INDEX idx_recipe_items_ingredient ON recipe_items(ingredient_id);
