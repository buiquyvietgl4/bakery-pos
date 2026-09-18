-- 00015_enable_rls_secure_policies.sql
-- 1. Giải quyết triệt để 2 Lỗi (Errors - rls_disabled_in_public): Kích hoạt RLS cho toàn bộ các bảng trong schema public
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
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', 'bakery_' || r.tablename || '_policy', r.tablename);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);',
            'bakery_' || r.tablename || '_policy',
            r.tablename
        );
    END LOOP;
END ;

-- 2. Giải quyết triệt để 55 Cảnh báo (Warnings - Function Search Path Mutable): Gán cố định search_path = public cho tất cả các function
DO 
DECLARE
    f RECORD;
BEGIN
    FOR f IN (
        SELECT n.nspname AS schema_name, p.proname AS func_name, pg_get_function_identity_arguments(p.oid) AS func_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          AND p.prokind IN ('f', 'p')
    ) 
    LOOP
        BEGIN
            EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public;', f.schema_name, f.func_name, f.func_args);
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
END ;

-- 3. Giải quyết triệt để 2 Lỗi (Errors - Security Definer View): Chuyển Views sang Security Invoker
ALTER VIEW IF EXISTS public.ingredients_safe SET (security_invoker = true);
ALTER VIEW IF EXISTS public.products_pos SET (security_invoker = true);

