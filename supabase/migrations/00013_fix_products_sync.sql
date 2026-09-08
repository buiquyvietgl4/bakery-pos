-- 00013_fix_products_sync.sql
-- Khắc phục đồng bộ danh mục bánh, ảnh bánh và sản phẩm đa thiết bị (Điện thoại <-> Máy tính <-> POS <-> Bếp)

-- 1. Cho phép Client (Điện thoại, Máy tính POS, Quản lý) tạo bánh mới, đổi ảnh bánh, sửa giá mà không bị chặn bởi RLS
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items DISABLE ROW LEVEL SECURITY;

-- 2. Đảm bảo khóa chính id là UUID và tự động sinh nếu thiếu
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE products ALTER COLUMN created_at SET DEFAULT now();

-- 3. Kích hoạt Supabase Realtime toàn diện cho bảng products để phát sóng thay đổi tức thì sang mọi màn hình
ALTER TABLE products REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  END IF;
END $$;
