-- 00005_create_products.sql
-- Quản lý Sản phẩm, Biến thể (Size) & Liên kết Recipe

CREATE TABLE products (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT 'other',
    image_url        TEXT,                          -- Public CDN URL từ Supabase Storage bucket 'product-images'
    base_cost_price  NUMERIC(12,2) NOT NULL DEFAULT 0, -- Giá vốn đồng bộ từ recipe
    selling_price    NUMERIC(12,2) NOT NULL DEFAULT 0, -- Giá bán niêm yết
    food_cost_pct    NUMERIC(5,2) GENERATED ALWAYS AS (
                         CASE WHEN selling_price > 0
                             THEN ROUND(base_cost_price / selling_price * 100, 2)
                             ELSE 0
                         END
                     ) STORED,                      -- Tỷ lệ Food Cost tự động (%)
    is_active        BOOLEAN NOT NULL DEFAULT true,
    is_preorder_only BOOLEAN NOT NULL DEFAULT false, -- Chỉ nhận đặt trước (Bánh sinh nhật)
    recipe_id        UUID REFERENCES recipes(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Khóa ngoại ngược từ recipes về products
ALTER TABLE recipes ADD CONSTRAINT fk_recipes_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name    TEXT NOT NULL,                  -- Ví dụ: 'Size Nhỏ (16cm)', 'Size Lớn (20cm)'
    size_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0, -- Hệ số định lượng/giá (1.0, 1.5, 2.0...)
    cost_price      NUMERIC(12,2) NOT NULL DEFAULT 0, -- base_cost_price * size_multiplier
    selling_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category ON products(category) WHERE is_active = true;
CREATE INDEX idx_variants_product ON product_variants(product_id);
