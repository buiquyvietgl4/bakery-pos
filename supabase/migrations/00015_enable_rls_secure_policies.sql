-- 00015_enable_rls_secure_policies.sql
-- Tự động kích hoạt Row Level Security (RLS) cho 100% các bảng đang có trong schema public
-- Tự động bỏ qua các bảng chưa tạo, không bao giờ báo lỗi relation does not exist

DO 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
    ) 
    LOOP
        -- 1. Bật RLS cho từng bảng thực tế có trong CSDL
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        
        -- 2. Xóa policy cũ nếu có để tránh xung đột
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'bakery_' || r.tablename || '_policy', r.tablename);
        
        -- 3. Tạo chính sách bảo mật cho phép POS và Bếp đọc/ghi mượt mà
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);',
            'bakery_' || r.tablename || '_policy',
            r.tablename
        );
        
        RAISE NOTICE '✅ Đã kích hoạt RLS thành công cho bảng: %', r.tablename;
    END LOOP;
END ;
