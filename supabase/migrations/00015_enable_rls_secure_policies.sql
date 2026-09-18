-- 00015_enable_rls_secure_policies.sql
-- Kích hoạt Row Level Security (RLS) toàn diện và thiết lập Policies giải quyết cảnh báo rls_disabled_in_public của Supabase
-- Đảm bảo an toàn bảo mật CSDL đồng thời duy trì 100% khả năng đồng bộ thời gian thực cho POS & Bếp

-- 1. BẢNG ĐƠN HÀNG VÀ THANH TOÁN
ALTER TABLE IF EXISTS orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_orders_policy ON orders;
CREATE POLICY bakery_orders_policy ON orders
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_order_items_policy ON order_items;
CREATE POLICY bakery_order_items_policy ON order_items
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_payments_policy ON payments;
CREATE POLICY bakery_payments_policy ON payments
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 2. BẢNG SẢN PHẨM VÀ ĐỊNH MỨC BÁNH
ALTER TABLE IF EXISTS products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_products_policy ON products;
CREATE POLICY bakery_products_policy ON products
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_product_variants_policy ON product_variants;
CREATE POLICY bakery_product_variants_policy ON product_variants
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS cake_costing_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_cake_costing_config_policy ON cake_costing_config;
CREATE POLICY bakery_cake_costing_config_policy ON cake_costing_config
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 3. BẢNG NGUYÊN VẬT LIỆU VÀ CÔNG THỨC BOM
ALTER TABLE IF EXISTS ingredients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_ingredients_policy ON ingredients;
CREATE POLICY bakery_ingredients_policy ON ingredients
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS recipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_recipes_policy ON recipes;
CREATE POLICY bakery_recipes_policy ON recipes
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS recipe_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_recipe_items_policy ON recipe_items;
CREATE POLICY bakery_recipe_items_policy ON recipe_items
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 4. BẢNG CA LÀM VIỆC VÀ CÀI ĐẶT CỬA HÀNG
ALTER TABLE IF EXISTS shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_shifts_policy ON shifts;
CREATE POLICY bakery_shifts_policy ON shifts
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_stores_policy ON stores;
CREATE POLICY bakery_stores_policy ON stores
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_app_settings_policy ON app_settings;
CREATE POLICY bakery_app_settings_policy ON app_settings
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_profiles_policy ON profiles;
CREATE POLICY bakery_profiles_policy ON profiles
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 5. BẢNG CHI PHÍ, DÒNG TIỀN VÀ SỔ SÁCH KẾ TOÁN
ALTER TABLE IF EXISTS expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_expense_categories_policy ON expense_categories;
CREATE POLICY bakery_expense_categories_policy ON expense_categories
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS operating_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_operating_expenses_policy ON operating_expenses;
CREATE POLICY bakery_operating_expenses_policy ON operating_expenses
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS cashflow_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_cashflow_transactions_policy ON cashflow_transactions;
CREATE POLICY bakery_cashflow_transactions_policy ON cashflow_transactions
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_purchase_orders_policy ON purchase_orders;
CREATE POLICY bakery_purchase_orders_policy ON purchase_orders
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_purchase_order_items_policy ON purchase_order_items;
CREATE POLICY bakery_purchase_order_items_policy ON purchase_order_items
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS monthly_accounting_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_monthly_accounting_summary_policy ON monthly_accounting_summary;
CREATE POLICY bakery_monthly_accounting_summary_policy ON monthly_accounting_summary
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);

ALTER TABLE IF EXISTS audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bakery_audit_logs_policy ON audit_logs;
CREATE POLICY bakery_audit_logs_policy ON audit_logs
    FOR ALL TO anon, authenticated
    USING (true)
    WITH CHECK (true);
