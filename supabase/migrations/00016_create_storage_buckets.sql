-- 00016_create_storage_buckets.sql
-- Tạo các Bucket lưu trữ hình ảnh trên Supabase Storage và phân quyền truy cập công khai

-- 1. Tạo Storage Bucket: bakery-images và product-images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('bakery-images', 'bakery-images', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']),
  ('product-images', 'product-images', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE 
SET 
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

-- 2. Cấp quyền Policy cho phép đọc ảnh công khai (Public Read - Mọi người đều xem được ảnh bánh, mã QR)
DROP POLICY IF EXISTS "Public Access to bakery images" ON storage.objects;
CREATE POLICY "Public Access to bakery images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id IN ('bakery-images', 'product-images'));

-- 3. Cấp quyền Policy cho phép tải ảnh lên (Upload - Bán hàng, up ảnh bánh kem, bill chuyển khoản)
DROP POLICY IF EXISTS "Allow Upload to bakery images" ON storage.objects;
CREATE POLICY "Allow Upload to bakery images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id IN ('bakery-images', 'product-images'));

-- 4. Cấp quyền Policy cho phép cập nhật ảnh (Update)
DROP POLICY IF EXISTS "Allow Update to bakery images" ON storage.objects;
CREATE POLICY "Allow Update to bakery images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id IN ('bakery-images', 'product-images'));

-- 5. Cấp quyền Policy cho phép xóa ảnh khi dọn dẹp bộ nhớ (Delete)
DROP POLICY IF EXISTS "Allow Delete from bakery images" ON storage.objects;
CREATE POLICY "Allow Delete from bakery images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id IN ('bakery-images', 'product-images'));
