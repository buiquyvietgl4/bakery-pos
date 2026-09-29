-- ==============================================================================
-- Migration: 00020_post_oct30_data_api_grants.sql
-- Tiêu chuẩn cấp quyền truy cập Data API (PostgREST / supabase-js) theo chính sách
-- bảo mật mới của Supabase (áp dụng từ 30/10).
-- 
-- Mục đích:
-- 1. Cấp quyền tường minh (EXPLICIT GRANT) cho tất cả các bảng hiện có.
-- 2. Thiết lập ALTER DEFAULT PRIVILEGES để mọi bảng mới tạo trong tương lai
--    tự động được cấp quyền truy cập Data API mà không bị lỗi Permission Denied.
-- ==============================================================================

-- 1. Cấp quyền truy cập Schema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Cấp toàn quyền trên tất cả các bảng hiện có trong public
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. Cấp toàn quyền trên tất cả các Sequences (tự tăng id)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 4. Cấp quyền thực thi các Functions / Procedures
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- ==============================================================================
-- 5. CẤP QUYỀN TƯỜNG MINH CHI TIẾT TỪNG BẢNG (EXPLICIT GRANTS)
-- Đảm bảo không bị sót bất kỳ bảng nghiệp vụ cốt lõi nào của hệ thống Bakery ERP
-- ==============================================================================
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'profiles',
        'stores',
        'app_settings',
        'ingredients',
        'recipes',
        'recipe_items',
        'products',
        'product_variants',
        'shifts',
        'orders',
        'order_items',
        'payments',
        'purchase_orders',
        'purchase_order_items',
        'expense_categories',
        'operating_expenses',
        'cashflow_transactions',
        'monthly_accounting_summary',
        'audit_logs',
        'cake_costing_config',
        'material_transactions',
        'stock_adjustments',
        'spoilage_logs',
        'bakery_bom_settings',
        'material_stock_adjustments',
        'system_cloud_backups'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
            EXECUTE format('GRANT ALL ON TABLE public.%I TO anon, authenticated, service_role;', tbl);
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- 6. THIẾT LẬP MẶC ĐỊNH CHO TƯƠNG LAI (DEFAULT PRIVILEGES)
-- Tự động cấp quyền cho bất kỳ bảng, sequence, hàm nào được tạo mới sau này!
-- Giải quyết triệt để cảnh báo ngày 30/10 của Supabase.
-- ==============================================================================
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- Phục hồi quyền cho người dùng postgres / supabase_admin
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
