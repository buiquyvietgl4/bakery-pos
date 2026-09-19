-- 5. Cấp quyền Policy cho phép xóa ảnh khi dọn dẹp bộ nhớ (Delete)
DROP POLICY IF EXISTS "Allow Delete from bakery images" ON storage.objects;
CREATE POLICY "Allow Delete from bakery images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id IN ('bakery-images', 'product-images'));
-- >>> KẾT THÚC MIGRATION: 00016_create_storage_buckets.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00017_complete_sync_alignment.sql <<<
-- 00017_complete_sync_alignment.sql
-- Đồng bộ 100% tất cả các trường dữ liệu giữa Cloud SQL (Supabase) và Local SQL
-- Đảm bảo không bị thiếu bất kỳ trường nào khi đồng bộ 2 chiều (Cloud <-> Local)

-- 1. BẢNG ĐƠN HÀNG (orders): Bổ sung các trường làm bánh KDS, giao hàng, ảnh mẫu & thanh toán
ALTER TABLE orders ADD COLUMN IF NOT EXISTS local_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bake_status TEXT DEFAULT 'done';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS need_bake_qty NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_stock_qty NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_number TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cake_order_spec JSONB DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bake_approval_status TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'paid';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reference_image_url TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) DEFAULT 0;

-- 2. BẢNG CHI TIẾT ĐƠN HÀNG (order_items): Bổ sung subtotal
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal NUMERIC(12,2) DEFAULT 0;

-- 3. BẢNG CÔNG THỨC (recipes): Bổ sung các trường nướng bánh & food cost
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Bánh tươi';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS target_food_cost_pct NUMERIC(5,2) DEFAULT 35;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS suggested_price NUMERIC(12,2) DEFAULT 0;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS bake_time_minutes NUMERIC(6,2) DEFAULT 25;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS bake_temp_celsius NUMERIC(6,2) DEFAULT 190;

-- 3.1 BẢNG NGUYÊN VẬT LIỆU (ingredients): Bổ sung đơn vị nhập & hệ số quy đổi
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS packaging_unit TEXT DEFAULT 'Túi 1kg';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(12,3) DEFAULT 1000;

-- 4. BẢNG LỊCH SỬ XUẤT NHẬP KHO VẬT TƯ (material_transactions)
CREATE TABLE IF NOT EXISTS material_transactions (
    id TEXT PRIMARY KEY,
    type TEXT,
    material_id TEXT,
    material_name TEXT,
    material_category TEXT,
    unit TEXT,
    package_qty NUMERIC(12,3),
    package_unit TEXT,
    conversion_rate NUMERIC(12,3),
    quantity NUMERIC(12,3) DEFAULT 0,
    unit_price NUMERIC(12,2) DEFAULT 0,
    package_unit_price NUMERIC(12,2),
    total_amount NUMERIC(12,2) DEFAULT 0,
    supplier_or_reason TEXT,
    performed_by TEXT,
    transaction_date TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. BẢNG LỊCH SỬ BIẾN ĐỘNG KHO BÁNH (stock_adjustments)
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    product_name TEXT,
    product_image TEXT,
    old_stock NUMERIC(12,2) DEFAULT 0,
    new_stock NUMERIC(12,2) DEFAULT 0,
    difference NUMERIC(12,2) DEFAULT 0,
    reason TEXT,
    notes TEXT,
    adjusted_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. BẢNG NHẬT KÝ BÁNH HỎNG (spoilage_logs)
CREATE TABLE IF NOT EXISTS spoilage_logs (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    product_name TEXT,
    quantity NUMERIC(12,2) DEFAULT 0,
    unit TEXT DEFAULT 'cái',
    base_cost NUMERIC(12,2) DEFAULT 0,
    selling_price NUMERIC(12,2) DEFAULT 0,
    total_cost_loss NUMERIC(12,2) DEFAULT 0,
    reason TEXT,
    notes TEXT,
    logged_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. BẢNG ĐỊNH MỨC BOM BÁNH SINH NHẬT THEO FLOWCHART (bakery_bom_settings)
CREATE TABLE IF NOT EXISTS bakery_bom_settings (
    id TEXT PRIMARY KEY,
    version TEXT,
    target_food_cost_pct NUMERIC(5,2) DEFAULT 36.5,
    cake_bases JSONB,
    cream_coatings JSONB,
    fillings JSONB,
    packagings JSONB,
    free_accessories JSONB,
    decor_addons JSONB,
    birthday_bom_presets JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. THIẾT LẬP RLS VÀ CẤP QUYỀN CHO CÁC BẢNG MỚI
ALTER TABLE material_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE spoilage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bakery_bom_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bakery_material_transactions_policy" ON material_transactions;
CREATE POLICY "bakery_material_transactions_policy" ON material_transactions
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bakery_stock_adjustments_policy" ON stock_adjustments;
CREATE POLICY "bakery_stock_adjustments_policy" ON stock_adjustments
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bakery_spoilage_logs_policy" ON spoilage_logs;
CREATE POLICY "bakery_spoilage_logs_policy" ON spoilage_logs
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bakery_bom_settings_policy" ON bakery_bom_settings;
CREATE POLICY "bakery_bom_settings_policy" ON bakery_bom_settings
    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 9. KÍCH HOẠT REALTIME REPLICA
ALTER TABLE material_transactions REPLICA IDENTITY FULL;
ALTER TABLE stock_adjustments REPLICA IDENTITY FULL;
ALTER TABLE spoilage_logs REPLICA IDENTITY FULL;
ALTER TABLE bakery_bom_settings REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'material_transactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE material_transactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stock_adjustments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE stock_adjustments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'spoilage_logs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE spoilage_logs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'bakery_bom_settings') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE bakery_bom_settings;
  END IF;
END $$;
-- >>> KẾT THÚC MIGRATION: 00017_complete_sync_alignment.sql <<<


