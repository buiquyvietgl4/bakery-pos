-- 00014_add_resale_goods_and_cake_costing.sql
-- Cập nhật đồng bộ các tính năng: Bánh & Hàng nhập về bán (Resale Goods), Barcode, Giá vốn Bánh sinh nhật theo yêu cầu (Cake Costing)

-- 1. Mở rộng bảng sản phẩm (products)
ALTER TABLE products ADD COLUMN IF NOT EXISTS import_price NUMERIC(12,2) DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'produced';
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT DEFAULT NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_qty NUMERIC(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'cái';

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(product_type);

-- 2. Mở rộng bảng đơn hàng (orders)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_cogs NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cake_name TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cake_message TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_method TEXT DEFAULT 'pickup';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT DEFAULT NULL;

-- 3. Mở rộng bảng chi tiết đơn hàng (order_items)
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'produced';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supplier_name TEXT DEFAULT NULL;

-- 4. Bảng cấu hình định mức giá vốn Bánh sinh nhật theo yêu cầu (cake_costing_config)
CREATE TABLE IF NOT EXISTS cake_costing_config (
    id TEXT PRIMARY KEY DEFAULT 'primary',
    config_data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE cake_costing_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE cake_costing_config REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'cake_costing_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE cake_costing_config;
  END IF;
END $$;
