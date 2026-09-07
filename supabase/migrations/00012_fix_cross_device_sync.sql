-- 00012_fix_cross_device_sync.sql
-- Khắc phục đồng bộ thời gian thực đa thiết bị (Điện thoại <-> Máy tính <-> Máy POS)

-- 1. Cho phép Client (Điện thoại, Máy tính quầy POS, Màn hình Bếp) đọc/ghi đơn hàng mà không bị chặn bởi RLS
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

-- 2. Gỡ bỏ ràng buộc NOT NULL của created_by và product_id để các thiết bị bán hàng/đặt bánh đồng bộ mượt mà
ALTER TABLE orders ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;

-- 3. Bổ sung các cột thông tin khách và bánh nếu chưa có
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cake_message TEXT;

-- 4. Kích hoạt Supabase Realtime toàn diện cho bảng orders để phát sóng thay đổi tức thì sang mọi màn hình
ALTER TABLE orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
END $$;
