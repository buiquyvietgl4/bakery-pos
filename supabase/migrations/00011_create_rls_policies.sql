-- 00011_create_rls_policies.sql
-- Kích hoạt Row Level Security (RLS) toàn diện và thiết lập ma trận phân quyền

-- 1. Profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "profiles_update_self_or_admin" ON profiles
    FOR UPDATE USING (auth.uid() = id OR get_user_role() = 'admin');

-- 2. Stores
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stores_select" ON stores
    FOR SELECT USING (true);

CREATE POLICY "stores_admin_manage" ON stores
    FOR ALL USING (get_user_role() = 'admin');

-- 3. Ingredients (Bảng gốc chứa avg_cost -> Chỉ Admin thấy trực tiếp, Staff dùng view ingredients_safe)
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_view_ingredients" ON ingredients
    FOR SELECT USING (get_user_role() = 'admin');

CREATE POLICY "admin_manage_ingredients" ON ingredients
    FOR ALL USING (get_user_role() = 'admin');

-- 4. Recipes & Recipe Items (Staff xem định lượng, Admin CRUD)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_admin_view_recipes" ON recipes
    FOR SELECT USING (get_user_role() IN ('staff', 'admin'));

CREATE POLICY "admin_manage_recipes" ON recipes
    FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "staff_admin_view_recipe_items" ON recipe_items
    FOR SELECT USING (get_user_role() IN ('staff', 'admin'));

CREATE POLICY "admin_manage_recipe_items" ON recipe_items
    FOR ALL USING (get_user_role() = 'admin');

-- 5. Products & Product Variants (Bảng gốc chứa base_cost_price -> Chỉ Admin thấy trực tiếp, Staff dùng view products_pos)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_view_products" ON products
    FOR SELECT USING (get_user_role() = 'admin');

CREATE POLICY "admin_manage_products" ON products
    FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "staff_admin_view_variants" ON product_variants
    FOR SELECT USING (get_user_role() IN ('staff', 'admin'));

CREATE POLICY "admin_manage_variants" ON product_variants
    FOR ALL USING (get_user_role() = 'admin');

-- 6. Shifts
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_own_shifts" ON shifts
    FOR SELECT USING (staff_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "staff_insert_shifts" ON shifts
    FOR INSERT WITH CHECK (staff_id = auth.uid() OR get_user_role() = 'admin');

CREATE POLICY "staff_update_own_open_shift" ON shifts
    FOR UPDATE USING (
        (staff_id = auth.uid() AND status = 'open') OR get_user_role() = 'admin'
    );

-- 7. Orders & Order Items & Payments
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_admin_select_orders" ON orders
    FOR SELECT USING (true); -- Staff cần xem đơn tại quầy và đơn trên màn hình KDS

CREATE POLICY "staff_admin_insert_orders" ON orders
    FOR INSERT WITH CHECK (get_user_role() IN ('staff', 'admin'));

CREATE POLICY "staff_admin_update_orders" ON orders
    FOR UPDATE USING (get_user_role() IN ('staff', 'admin'));

CREATE POLICY "admin_delete_orders" ON orders
    FOR DELETE USING (get_user_role() = 'admin');

CREATE POLICY "staff_admin_select_order_items" ON order_items
    FOR SELECT USING (true);

CREATE POLICY "staff_admin_insert_order_items" ON order_items
    FOR INSERT WITH CHECK (get_user_role() IN ('staff', 'admin'));

CREATE POLICY "staff_admin_select_payments" ON payments
    FOR SELECT USING (true);

CREATE POLICY "staff_admin_insert_payments" ON payments
    FOR INSERT WITH CHECK (get_user_role() IN ('staff', 'admin'));

-- 8. Purchase Orders (Chỉ Admin quản lý)
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_purchase_orders" ON purchase_orders
    FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "admin_all_purchase_order_items" ON purchase_order_items
    FOR ALL USING (get_user_role() = 'admin');

-- 9. OPEX, Cashflow & Accounting Summary (Chỉ Admin toàn quyền)
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_accounting_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_admin_view_expense_categories" ON expense_categories
    FOR SELECT USING (get_user_role() IN ('staff', 'admin'));

CREATE POLICY "admin_manage_expense_categories" ON expense_categories
    FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "admin_all_operating_expenses" ON operating_expenses
    FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "admin_select_cashflow" ON cashflow_transactions
    FOR SELECT USING (get_user_role() = 'admin');

CREATE POLICY "admin_insert_cashflow" ON cashflow_transactions
    FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "admin_update_cashflow" ON cashflow_transactions
    FOR UPDATE USING (get_user_role() = 'admin' AND is_locked = false);

CREATE POLICY "admin_all_accounting_summary" ON monthly_accounting_summary
    FOR ALL USING (get_user_role() = 'admin');

CREATE POLICY "admin_all_audit_logs" ON audit_logs
    FOR ALL USING (get_user_role() = 'admin');
