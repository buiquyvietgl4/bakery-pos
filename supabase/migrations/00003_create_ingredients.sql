-- 00003_create_ingredients.sql
-- Quản lý kho Nguyên vật liệu (Ingredients) & Giá vốn trung bình WAC

CREATE TABLE ingredients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    unit            TEXT NOT NULL,              -- g, ml, quả, cái, hộp...
    category        TEXT NOT NULL DEFAULT 'other',
    stock_qty       NUMERIC(12,3) NOT NULL DEFAULT 0,
    reorder_level   NUMERIC(12,3) NOT NULL DEFAULT 0,  -- Ngưỡng tồn tối thiểu cảnh báo
    avg_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- Đơn giá bình quân gia quyền (WAC)
    wastage_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,   -- % hao hụt chế biến/nướng
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingredients_category ON ingredients(category);
CREATE INDEX idx_ingredients_low_stock ON ingredients(stock_qty, reorder_level)
    WHERE is_active = true;
