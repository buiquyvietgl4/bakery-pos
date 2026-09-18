-- =====================================================================
-- FILE KHỞI TẠO TOÀN DIỆN CƠ SỞ DỮ LIỆU SUPABASE (FULL SCHEMA MASTER)
-- Dự án: Bakery ERP & POS Mini
-- Hướng dẫn: Mở SQL Editor trên Supabase, copy toàn bộ nội dung file này,
--            dán vào và bấm nút [RUN] để tạo 100% bảng, hàm và phân quyền.
-- =====================================================================

-- >>> BẮT ĐẦU MIGRATION: 00001_create_profiles_roles.sql <<<
-- 00001_create_profiles_roles.sql
-- Phân quyền 2 Roles: staff (nhân viên bán hàng + bếp) & admin (chủ tiệm)

CREATE TYPE user_role AS ENUM ('staff', 'admin');

CREATE TABLE profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name   TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'staff',
    phone       TEXT,
    avatar_url  TEXT,
    store_id    UUID, -- Tham chiếu stores(id)
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger tự tạo profile khi tài khoản Supabase Auth được đăng ký
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', 'Nhân viên mới'),
        COALESCE((NEW.raw_app_meta_data ->> 'role')::user_role, 'staff')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
-- >>> KẾT THÚC MIGRATION: 00001_create_profiles_roles.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00002_create_stores_settings.sql <<<
-- 00002_create_stores_settings.sql
-- Quản lý chi nhánh (Multi-Store) & Bảng cấu hình động (App Settings)

CREATE TABLE stores (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    address     TEXT,
    phone       TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Khởi tạo 1 store mặc định
INSERT INTO stores (name, address) VALUES ('Tiệm chính', 'Tại quầy');

-- Ràng buộc khóa ngoại store_id vào profiles
ALTER TABLE profiles ADD CONSTRAINT fk_profiles_store
    FOREIGN KEY (store_id) REFERENCES stores(id);

-- BẢNG CẤU HÌNH ĐỘNG HỆ THỐNG (Không hard-code bất kỳ tham số nào)
CREATE TABLE app_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    category    TEXT NOT NULL DEFAULT 'general',
    label       TEXT NOT NULL,           -- Tên hiển thị trên màn hình Cài đặt
    description TEXT,                    -- Chú thích chức năng
    input_type  TEXT NOT NULL DEFAULT 'text',  -- text | number | boolean | select | json
    options     JSONB,                   -- Danh sách tùy chọn cho kiểu select
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by  UUID REFERENCES profiles(id)
);

-- Seed bộ tham số cấu hình mặc định ban đầu
INSERT INTO app_settings (key, value, category, label, description, input_type, options) VALUES
-- 1. General Settings
('store.name', '"Tiệm Bánh ABC"', 'general', 'Tên tiệm bánh', 'Hiển thị trên hóa đơn in nhiệt và thanh tiêu đề', 'text', NULL),
('store.phone', '"0901234567"', 'general', 'Hotline tiệm', 'In trên hóa đơn nhiệt', 'text', NULL),
('store.address', '"123 Đường Bánh Ngọt, TP.HCM"', 'general', 'Địa chỉ quầy', 'In trên hóa đơn nhiệt', 'text', NULL),
('store.multi_store_enabled', 'false', 'general', 'Chế độ nhiều chi nhánh', 'Bật để quản lý nhiều quầy/cơ sở độc lập', 'boolean', NULL),
('store.currency', '"VND"', 'general', 'Đơn vị tiền tệ', 'Đơn vị tiền tệ thanh toán', 'select', '["VND","USD"]'),

-- 2. POS Settings
('pos.max_discount_pct_no_approval', '10', 'pos', 'Giảm giá tối đa không cần duyệt (%)', 'Nhân viên chỉ được giảm tối đa mức này nếu không có Admin', 'number', NULL),
('pos.allow_negative_stock', 'false', 'pos', 'Cho phép bán khi hết kho NVL', 'Bật nếu muốn bán trước - trừ kho sau', 'boolean', NULL),
('pos.default_order_type', '"takeaway"', 'pos', 'Loại đơn mặc định', 'Loại hình bán phổ biến', 'select', '["dine_in","takeaway","preorder"]'),
('pos.receipt_auto_print', 'true', 'pos', 'Tự động in sau thanh toán', 'In nhiệt ngay khi hoàn tất đơn', 'boolean', NULL),

-- 3. Printing Settings (Hỗ trợ đa dạng máy in)
('printing.enabled', 'true', 'printing', 'Bật máy in nhiệt', 'Tắt nếu chỉ xuất hóa đơn điện tử', 'boolean', NULL),
('printing.method', '"browser_print"', 'printing', 'Kiểu kết nối máy in', 'Chuẩn kết nối thiết bị in', 'select', '["browser_print","web_usb","web_serial","web_bluetooth","network_ip"]'),
('printing.paper_width', '80', 'printing', 'Khổ giấy in (mm)', 'Kích thước cuộn giấy nhiệt', 'select', '[58, 80]'),
('printing.network_ip', '""', 'printing', 'IP máy in mạng (LAN/Wifi)', 'Ví dụ: 192.168.1.200', 'text', NULL),
('printing.receipt_footer', '"Cảm ơn quý khách và hẹn gặp lại!"', 'printing', 'Lời chào cuối hóa đơn', 'In ở chân bill', 'text', NULL),

-- 4. Payment Settings
('payment.methods_enabled', '["cash","transfer"]', 'payment', 'Kênh thanh toán hoạt động', 'Các phương thức chấp nhận tại quầy', 'json', NULL),
('payment.bank_transfer_info', '""', 'payment', 'Thông tin STK ngân hàng', 'Hiện QR chuyển khoản nhanh VietQR', 'text', NULL),
('payment.momo_enabled', 'false', 'payment', 'Thanh toán MoMo', 'Bật/tắt thanh toán qua ví MoMo', 'boolean', NULL),
('payment.vnpay_enabled', 'false', 'payment', 'Thanh toán VNPay QR', 'Bật/tắt thanh toán qua cổng VNPay', 'boolean', NULL),

-- 5. Inventory & Costing Settings
('inventory.costing_method', '"wac"', 'inventory', 'Phương pháp tính giá vốn', 'WAC (Bình quân gia quyền) hoặc FIFO (Nhập trước xuất trước)', 'select', '["wac","fifo"]'),
('inventory.low_stock_alert', 'true', 'inventory', 'Báo động nguyên liệu sắp hết', 'Cảnh báo khi dưới mức an toàn', 'boolean', NULL),
('inventory.default_wastage_pct', '5', 'inventory', 'Hao hụt mặc định (%)', 'Hao hụt tự nhiên khi tạo nguyên liệu mới', 'number', NULL),

-- 6. Accounting Settings
('accounting.shift_cash_warning_threshold', '50000', 'accounting', 'Ngưỡng cảnh báo lệch quỹ (VND)', 'Lệch két vượt số này sẽ đánh dấu vàng', 'number', NULL),
('accounting.shift_cash_block_threshold', '200000', 'accounting', 'Ngưỡng chặn đóng ca (VND)', 'Lệch két vượt số này cần Admin xác nhận', 'number', NULL),
('accounting.target_food_cost_pct', '35', 'accounting', 'Tỷ lệ Food Cost mục tiêu (%)', 'Dùng để gợi ý giá bán tối ưu cho bánh', 'number', NULL),
('accounting.auto_purge_months', '6', 'accounting', 'Thời hạn đề xuất lưu trữ (tháng)', 'Đề xuất backup & dọn dẹp khi dữ liệu cũ hơn N tháng', 'number', NULL);
-- >>> KẾT THÚC MIGRATION: 00002_create_stores_settings.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00003_create_ingredients.sql <<<
-- 00003_create_ingredients.sql
-- Quản lý kho Nguyên vật liệu (Ingredients) & Giá vốn trung bình WAC

CREATE TABLE ingredients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    unit            TEXT NOT NULL,              -- g, ml, quả, cái, hộp...
    category        TEXT NOT NULL DEFAULT 'other',
    stock_qty       NUMERIC(12,3) NOT NULL DEFAULT 0,
    reorder_level   NUMERIC(12,3) NOT NULL DEFAULT 0,  -- Ngưỡng tồn tối thiểu cảnh báo
    avg_cost        NUMERIC(12,2) NOT NULL DEFAULT 0,  -- Đơn giá bình quân gia quyền (WAC)
    wastage_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,   -- % hao hụt chế biến/nướng
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingredients_category ON ingredients(category);
CREATE INDEX idx_ingredients_low_stock ON ingredients(stock_qty, reorder_level)
    WHERE is_active = true;
-- >>> KẾT THÚC MIGRATION: 00003_create_ingredients.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00004_create_recipes.sql <<<
-- 00004_create_recipes.sql
-- Quản lý Công thức Bánh (Recipe / Bill of Materials - BOM)

CREATE TABLE recipes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    product_id          UUID,                          -- Sẽ add constraint sau khi tạo bảng products
    yield_qty           NUMERIC(8,2) NOT NULL DEFAULT 1, -- Số lượng thành phẩm ra lò
    yield_unit          TEXT NOT NULL DEFAULT 'chiếc',
    total_material_cost NUMERIC(12,2) NOT NULL DEFAULT 0, -- Tự động tính toán
    cost_per_unit       NUMERIC(12,2) NOT NULL DEFAULT 0, -- total_material_cost / yield_qty
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
    quantity        NUMERIC(12,3) NOT NULL,       -- Định lượng công thức
    unit            TEXT NOT NULL,                 -- Đơn vị (g, ml, quả...)
    line_cost       NUMERIC(12,2) NOT NULL DEFAULT 0, -- quantity * (1 + wastage%) * avg_cost
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE INDEX idx_recipe_items_ingredient ON recipe_items(ingredient_id);
-- >>> KẾT THÚC MIGRATION: 00004_create_recipes.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00005_create_products.sql <<<
-- 00005_create_products.sql
-- Quản lý Sản phẩm, Biến thể (Size) & Liên kết Recipe

CREATE TABLE products (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT 'other',
    image_url        TEXT,                          -- Public CDN URL từ Supabase Storage bucket 'product-images'
    base_cost_price  NUMERIC(12,2) NOT NULL DEFAULT 0, -- Giá vốn đồng bộ từ recipe
    selling_price    NUMERIC(12,2) NOT NULL DEFAULT 0, -- Giá bán niêm yết
    food_cost_pct    NUMERIC(5,2) GENERATED ALWAYS AS (
                         CASE WHEN selling_price > 0
                             THEN ROUND(base_cost_price / selling_price * 100, 2)
                             ELSE 0
                         END
                     ) STORED,                      -- Tỷ lệ Food Cost tự động (%)
    is_active        BOOLEAN NOT NULL DEFAULT true,
    is_preorder_only BOOLEAN NOT NULL DEFAULT false, -- Chỉ nhận đặt trước (Bánh sinh nhật)
    recipe_id        UUID REFERENCES recipes(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Khóa ngoại ngược từ recipes về products
ALTER TABLE recipes ADD CONSTRAINT fk_recipes_product
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

CREATE TABLE product_variants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name    TEXT NOT NULL,                  -- Ví dụ: 'Size Nhỏ (16cm)', 'Size Lớn (20cm)'
    size_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0, -- Hệ số định lượng/giá (1.0, 1.5, 2.0...)
    cost_price      NUMERIC(12,2) NOT NULL DEFAULT 0, -- base_cost_price * size_multiplier
    selling_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_category ON products(category) WHERE is_active = true;
CREATE INDEX idx_variants_product ON product_variants(product_id);
-- >>> KẾT THÚC MIGRATION: 00005_create_products.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00006_create_shifts_orders.sql <<<
-- 00006_create_shifts_orders.sql
-- Quản lý Ca bán hàng, Đơn hàng, Chi tiết đơn hàng & Thanh toán

CREATE TABLE shifts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id        UUID NOT NULL REFERENCES profiles(id),
    store_id        UUID REFERENCES stores(id),    -- Chi nhánh
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at        TIMESTAMPTZ,
    opening_cash    NUMERIC(12,2) NOT NULL DEFAULT 0,  -- Tiền mặt đầu ca
    closing_cash    NUMERIC(12,2),                     -- Tiền mặt thực tế đếm cuối ca
    expected_cash   NUMERIC(12,2) NOT NULL DEFAULT 0,  -- Tiền mặt lý thuyết hệ thống tính
    cash_difference NUMERIC(12,2) GENERATED ALWAYS AS (
                        COALESCE(closing_cash, 0) - expected_cash
                    ) STORED,                          -- Lệch quỹ (+ thừa, - thiếu)
    status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    notes           TEXT,                              -- Giải trình khi lệch quỹ
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id           TEXT UNIQUE,                   -- UUID sinh ra tại Client khi offline
    order_number       TEXT,                          -- Mã đơn hiển thị (BK-YYYYMMDD-XXX)
    created_by         UUID NOT NULL REFERENCES profiles(id),
    store_id           UUID REFERENCES stores(id),
    order_type         TEXT NOT NULL DEFAULT 'takeaway'
                       CHECK (order_type IN ('dine_in','takeaway','preorder')),
    status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','preparing','ready','completed','cancelled')),
    preorder_pickup_at TIMESTAMPTZ,                   -- Hạn giao bánh đặt trước
    subtotal           NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_pct       NUMERIC(5,2) NOT NULL DEFAULT 0,
    total_amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_cogs         NUMERIC(12,2) NOT NULL DEFAULT 0, -- Tổng giá vốn COGS đơn hàng
    notes              TEXT,
    shift_id           UUID REFERENCES shifts(id),
    sync_status        TEXT NOT NULL DEFAULT 'synced'
                       CHECK (sync_status IN ('synced','pending','conflict')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id            UUID NOT NULL REFERENCES products(id),
    variant_id            UUID REFERENCES product_variants(id),
    product_name_snapshot TEXT NOT NULL,           -- Chụp lại tên tại thời điểm bán
    quantity              INTEGER NOT NULL DEFAULT 1,
    unit_price            NUMERIC(12,2) NOT NULL,      -- Chụp lại giá bán
    unit_cost             NUMERIC(12,2) NOT NULL DEFAULT 0, -- Chụp lại giá vốn COGS
    line_total            NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    line_cost             NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
    notes                 TEXT
);

CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method          TEXT NOT NULL CHECK (method IN ('cash','transfer','momo','card')),
    amount          NUMERIC(12,2) NOT NULL,
    reference_code  TEXT,                         -- Mã giao dịch ngân hàng/ví nếu có
    paid_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_created_by ON orders(created_by);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_shift ON orders(shift_id);
CREATE INDEX idx_orders_local_id ON orders(local_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
-- >>> KẾT THÚC MIGRATION: 00006_create_shifts_orders.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00007_create_expenses_cashflow.sql <<<
-- 00007_create_expenses_cashflow.sql
-- Nhập kho (Purchase Orders), Chi phí vận hành (OPEX) & Sổ quỹ thu chi (Cashflow Ledger)

CREATE TABLE purchase_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number       TEXT NOT NULL,                 -- Số phiếu nhập: PO-YYYYMMDD-XXX
    supplier_name   TEXT,                          -- Nhà cung cấp
    order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    total_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','received','cancelled')),
    notes           TEXT,
    created_by      UUID NOT NULL REFERENCES profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    quantity        NUMERIC(12,3) NOT NULL,
    unit            TEXT NOT NULL,
    unit_price      NUMERIC(12,2) NOT NULL,        -- Đơn vị tiền/unit nhập vào
    line_total      NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);

CREATE TABLE expense_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,              -- Mặt bằng, Điện nước, Gas, Lương, Khấu hao...
    cost_type   TEXT NOT NULL CHECK (cost_type IN ('fixed', 'variable')),
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed các loại chi phí vận hành tiêu chuẩn
INSERT INTO expense_categories (name, cost_type, description) VALUES
('Tiền mặt bằng', 'fixed', 'Chi phí thuê quầy/mặt bằng hàng tháng'),
('Tiền điện & Nước', 'variable', 'Điện lò nướng, tủ bảo quản bánh, nước sinh hoạt'),
('Tiền Gas', 'variable', 'Gas công nghiệp cho bếp bánh'),
('Lương nhân viên', 'fixed', 'Lương cứng thu ngân, thợ làm bánh'),
('Khấu hao thiết bị', 'fixed', 'Lò nướng đối lưu, máy đánh trứng, tủ mát'),
('Quảng cáo & Marketing', 'variable', 'Facebook ads, tờ rơi, biển hiệu'),
('Văn phòng phẩm & Bao bì', 'variable', 'Túi nilong, giấy in bill, bút viết'),
('Chi phí khác', 'variable', 'Sửa chữa đột xuất, tiếp khách');

CREATE TABLE operating_expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     UUID NOT NULL REFERENCES expense_categories(id),
    amount          NUMERIC(12,2) NOT NULL,
    expense_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    period_month    TEXT NOT NULL,                 -- Định dạng 'YYYY-MM' phục vụ nhóm P&L
    description     TEXT,
    receipt_url     TEXT,                          -- Ảnh chụp hóa đơn VAT/chứng từ
    created_by      UUID NOT NULL REFERENCES profiles(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cashflow_transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    txn_type         TEXT NOT NULL CHECK (txn_type IN ('income', 'expense')),
    category         TEXT NOT NULL,                -- sales, deposit, ingredient_purchase, opex, adjustment
    amount           NUMERIC(12,2) NOT NULL,
    description      TEXT,
    reference_id     UUID,                         -- ID của order, po, hoặc opex
    reference_type   TEXT CHECK (reference_type IN (
                         'order','purchase_order','operating_expense','manual','adjustment'
                     )),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_month     TEXT NOT NULL,                -- 'YYYY-MM'
    created_by       UUID REFERENCES profiles(id),
    is_locked        BOOLEAN NOT NULL DEFAULT false, -- True khi kỳ kế toán tháng đã chốt
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_opex_period ON operating_expenses(period_month);
CREATE INDEX idx_cashflow_period ON cashflow_transactions(period_month);
CREATE INDEX idx_cashflow_type ON cashflow_transactions(txn_type);
CREATE INDEX idx_cashflow_ref ON cashflow_transactions(reference_id, reference_type);
-- >>> KẾT THÚC MIGRATION: 00007_create_expenses_cashflow.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00008_create_accounting_summary.sql <<<
-- 00008_create_accounting_summary.sql
-- Báo cáo P&L Chốt sổ tháng & Nhật ký kiểm toán (Audit Logs)

CREATE TABLE monthly_accounting_summary (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_month        TEXT NOT NULL UNIQUE,     -- 'YYYY-MM' duy nhất cho mỗi tháng
    total_revenue       NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_cogs          NUMERIC(14,2) NOT NULL DEFAULT 0,
    gross_profit        NUMERIC(14,2) GENERATED ALWAYS AS (total_revenue - total_cogs) STORED,
    total_opex          NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_profit          NUMERIC(14,2) GENERATED ALWAYS AS (
                            total_revenue - total_cogs - total_opex
                        ) STORED,
    gross_margin_pct    NUMERIC(5,2) GENERATED ALWAYS AS (
                            CASE WHEN total_revenue > 0
                                THEN ROUND((total_revenue - total_cogs) / total_revenue * 100, 2)
                                ELSE 0
                            END
                        ) STORED,
    net_margin_pct      NUMERIC(5,2) GENERATED ALWAYS AS (
                            CASE WHEN total_revenue > 0
                                THEN ROUND((total_revenue - total_cogs - total_opex) / total_revenue * 100, 2)
                                ELSE 0
                            END
                        ) STORED,
    total_orders        INTEGER NOT NULL DEFAULT 0,
    total_items_sold    INTEGER NOT NULL DEFAULT 0,
    revenue_by_category JSONB DEFAULT '{}',        -- Doanh thu theo danh mục bánh
    cogs_by_category    JSONB DEFAULT '{}',        -- Giá vốn theo danh mục
    opex_by_category    JSONB DEFAULT '{}',        -- Chi phí theo khoản mục
    daily_revenue       JSONB DEFAULT '[]',        -- Mảng 30 ngày [{date, amount}] để vẽ biểu đồ sau khi xóa đơn cũ
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','closed','archived')),
    closed_at           TIMESTAMPTZ,
    closed_by           UUID REFERENCES profiles(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name  TEXT NOT NULL,
    record_id   UUID NOT NULL,
    action      TEXT NOT NULL,                     -- 'INSERT', 'UPDATE', 'DELETE', 'PURGE'
    old_value   JSONB,
    new_value   JSONB,
    changed_by  UUID REFERENCES profiles(id),
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_table ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_date ON audit_logs(changed_at DESC);
-- >>> KẾT THÚC MIGRATION: 00008_create_accounting_summary.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00009_create_functions_triggers.sql <<<
-- 00009_create_functions_triggers.sql
-- Các hàm xử lý nghiệp vụ tự động, Trigger tính giá cost, Dòng tiền & Chốt sổ

-- 1. Hàm helper lấy role của user từ Supabase Auth JWT
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role'),
    (SELECT role::text FROM public.profiles WHERE id = auth.uid()),
    'anonymous'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Hàm tự động tính lại giá vốn Recipe khi giá nguyên liệu thay đổi
CREATE OR REPLACE FUNCTION recalculate_recipe_costs(p_ingredient_id UUID DEFAULT NULL)
RETURNS void AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT DISTINCT ri.recipe_id
        FROM recipe_items ri
        WHERE (p_ingredient_id IS NULL OR ri.ingredient_id = p_ingredient_id)
    LOOP
        -- Cập nhật line_cost cho từng dòng nguyên liệu (tính cả hao hụt)
        UPDATE recipe_items ri
        SET line_cost = ri.quantity
                        * (1 + COALESCE(i.wastage_pct, 0) / 100)
                        * i.avg_cost
        FROM ingredients i
        WHERE ri.ingredient_id = i.id
          AND ri.recipe_id = r.recipe_id;

        -- Cập nhật tổng chi phí NVL & giá vốn mỗi đơn vị thành phẩm
        UPDATE recipes rec
        SET total_material_cost = (
                SELECT COALESCE(SUM(ri.line_cost), 0)
                FROM recipe_items ri
                WHERE ri.recipe_id = rec.id
            ),
            cost_per_unit = (
                SELECT COALESCE(SUM(ri.line_cost), 0) / NULLIF(rec.yield_qty, 0)
                FROM recipe_items ri
                WHERE ri.recipe_id = rec.id
            ),
            updated_at = now()
        WHERE rec.id = r.recipe_id;

        -- Cập nhật giá vốn cơ sở lên bảng Sản phẩm (Products)
        UPDATE products p
        SET base_cost_price = rec.cost_per_unit,
            updated_at = now()
        FROM recipes rec
        WHERE p.recipe_id = rec.id
          AND rec.id = r.recipe_id;

        -- Cập nhật giá vốn biến thể (Variants) theo hệ số size
        UPDATE product_variants pv
        SET cost_price = p.base_cost_price * pv.size_multiplier
        FROM products p
        WHERE pv.product_id = p.id
          AND p.recipe_id = r.recipe_id;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Bất kỳ khi nào avg_cost hoặc wastage_pct của ingredient thay đổi -> cascade tính lại ngay
CREATE OR REPLACE FUNCTION trigger_ingredient_cost_changed()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.avg_cost IS DISTINCT FROM NEW.avg_cost
       OR OLD.wastage_pct IS DISTINCT FROM NEW.wastage_pct THEN
        PERFORM recalculate_recipe_costs(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_ingredient_cost_changed
    AFTER UPDATE ON ingredients
    FOR EACH ROW
    EXECUTE FUNCTION trigger_ingredient_cost_changed();

-- 3. Hàm tính Giá nhập bình quân gia quyền (Weighted Average Cost - WAC) khi nhập kho
CREATE OR REPLACE FUNCTION update_ingredient_wac(
    p_ingredient_id UUID,
    p_incoming_qty NUMERIC,
    p_incoming_unit_price NUMERIC
) RETURNS void AS $$
DECLARE
    v_current_qty NUMERIC;
    v_current_avg NUMERIC;
    v_new_avg NUMERIC;
BEGIN
    SELECT stock_qty, avg_cost
    INTO v_current_qty, v_current_avg
    FROM ingredients
    WHERE id = p_ingredient_id
    FOR UPDATE;

    IF (v_current_qty + p_incoming_qty) > 0 THEN
        v_new_avg := (v_current_qty * v_current_avg + p_incoming_qty * p_incoming_unit_price)
                     / (v_current_qty + p_incoming_qty);
    ELSE
        v_new_avg := p_incoming_unit_price;
    END IF;

    UPDATE ingredients
    SET stock_qty = stock_qty + p_incoming_qty,
        avg_cost = ROUND(v_new_avg, 2),
        updated_at = now()
    WHERE id = p_ingredient_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Hàm trừ kho nguyên liệu khi đơn hàng hoàn tất (Completed)
CREATE OR REPLACE FUNCTION deduct_stock_for_order(p_order_id UUID)
RETURNS void AS $$
DECLARE
    item RECORD;
    ri RECORD;
BEGIN
    FOR item IN
        SELECT oi.product_id, oi.variant_id, oi.quantity,
               COALESCE(pv.size_multiplier, 1.0) AS multiplier
        FROM order_items oi
        LEFT JOIN product_variants pv ON pv.id = oi.variant_id
        WHERE oi.order_id = p_order_id
    LOOP
        FOR ri IN
            SELECT rci.ingredient_id, rci.quantity AS recipe_qty,
                   COALESCE(ing.wastage_pct, 0) AS wastage_pct
            FROM products p
            JOIN recipes r ON r.id = p.recipe_id
            JOIN recipe_items rci ON rci.recipe_id = r.id
            JOIN ingredients ing ON ing.id = rci.ingredient_id
            WHERE p.id = item.product_id
        LOOP
            UPDATE ingredients
            SET stock_qty = stock_qty - (
                    ri.recipe_qty * item.multiplier * item.quantity
                    * (1 + ri.wastage_pct / 100)
                ),
                updated_at = now()
            WHERE id = ri.ingredient_id;
        END LOOP;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger tự động ghi Sổ quỹ thu tiền + Trừ kho khi đơn hoàn tất
CREATE OR REPLACE FUNCTION trigger_order_cashflow()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Ghi sổ quỹ thu tiền bán hàng
        INSERT INTO cashflow_transactions (
            txn_type, category, amount, description,
            reference_id, reference_type,
            transaction_date, period_month, created_by
        ) VALUES (
            'income', 'sales', NEW.total_amount,
            'Bán hàng đơn ' || COALESCE(NEW.order_number, NEW.local_id),
            NEW.id, 'order',
            CURRENT_DATE,
            TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
            NEW.created_by
        );

        -- Tự động trừ kho nguyên liệu
        PERFORM deduct_stock_for_order(NEW.id);

        -- Cộng tiền mặt kỳ vọng cho ca bán
        IF NEW.shift_id IS NOT NULL THEN
            UPDATE shifts
            SET expected_cash = expected_cash + (
                    SELECT COALESCE(SUM(amount), 0)
                    FROM payments
                    WHERE order_id = NEW.id AND method = 'cash'
                )
            WHERE id = NEW.shift_id AND status = 'open';
        END IF;
    END IF;

    -- Xử lý hủy đơn sau khi đã hoàn tất: tạo bút toán đảo điều chỉnh
    IF NEW.status = 'cancelled' AND OLD.status = 'completed' THEN
        INSERT INTO cashflow_transactions (
            txn_type, category, amount, description,
            reference_id, reference_type,
            transaction_date, period_month, created_by
        ) VALUES (
            'expense', 'adjustment', NEW.total_amount,
            'Hoàn tiền hủy đơn ' || COALESCE(NEW.order_number, NEW.local_id),
            NEW.id, 'adjustment',
            CURRENT_DATE,
            TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
            NEW.created_by
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_order_completed
    AFTER UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_order_cashflow();

-- 6. Trigger tự động ghi chi phí nhập kho & cập nhật tồn kho khi Nhận hàng PO
CREATE OR REPLACE FUNCTION trigger_po_received_cashflow()
RETURNS TRIGGER AS $$
DECLARE
    poi RECORD;
BEGIN
    IF NEW.status = 'received' AND OLD.status != 'received' THEN
        INSERT INTO cashflow_transactions (
            txn_type, category, amount, description,
            reference_id, reference_type,
            transaction_date, period_month, created_by
        ) VALUES (
            'expense', 'ingredient_purchase', NEW.total_amount,
            'Nhập kho phiếu ' || NEW.po_number || ' - ' || COALESCE(NEW.supplier_name,''),
            NEW.id, 'purchase_order',
            CURRENT_DATE,
            TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
            NEW.created_by
        );

        FOR poi IN SELECT * FROM purchase_order_items WHERE po_id = NEW.id LOOP
            PERFORM update_ingredient_wac(poi.ingredient_id, poi.quantity, poi.unit_price);
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_po_received
    AFTER UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_po_received_cashflow();

-- 7. Trigger tự động ghi Sổ quỹ chi phí vận hành (OPEX)
CREATE OR REPLACE FUNCTION trigger_opex_cashflow()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO cashflow_transactions (
        txn_type, category, amount, description,
        reference_id, reference_type,
        transaction_date, period_month, created_by
    ) VALUES (
        'expense', 'opex', NEW.amount,
        (SELECT name FROM expense_categories WHERE id = NEW.category_id)
            || ': ' || COALESCE(NEW.description, ''),
        NEW.id, 'operating_expense',
        NEW.expense_date,
        NEW.period_month,
        NEW.created_by
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_opex_created
    AFTER INSERT ON operating_expenses
    FOR EACH ROW
    EXECUTE FUNCTION trigger_opex_cashflow();

-- 8. Hàm Chốt sổ kế toán tháng (Close Month RPC)
CREATE OR REPLACE FUNCTION close_monthly_accounting(p_month TEXT, p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_summary_id UUID;
    v_revenue NUMERIC;
    v_cogs NUMERIC;
    v_opex NUMERIC;
    v_order_count INTEGER;
    v_item_count INTEGER;
    v_rev_by_cat JSONB;
    v_cogs_by_cat JSONB;
    v_opex_by_cat JSONB;
    v_daily_rev JSONB;
BEGIN
    IF EXISTS (SELECT 1 FROM monthly_accounting_summary
               WHERE period_month = p_month AND status = 'closed') THEN
        RAISE EXCEPTION 'Kỳ kế toán tháng % đã được chốt sổ trước đó', p_month;
    END IF;

    -- Tổng doanh thu và số lượng đơn
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*), COALESCE(SUM(
            (SELECT COALESCE(SUM(quantity), 0) FROM order_items WHERE order_id = o.id)
        ), 0)
    INTO v_revenue, v_order_count, v_item_count
    FROM orders o
    WHERE TO_CHAR(o.created_at, 'YYYY-MM') = p_month
      AND o.status = 'completed';

    -- Tổng COGS
    SELECT COALESCE(SUM(total_cogs), 0)
    INTO v_cogs
    FROM orders
    WHERE TO_CHAR(created_at, 'YYYY-MM') = p_month
      AND status = 'completed';

    -- Tổng OPEX
    SELECT COALESCE(SUM(amount), 0)
    INTO v_opex
    FROM operating_expenses
    WHERE period_month = p_month;

    -- Doanh thu theo category bánh
    SELECT COALESCE(jsonb_object_agg(category, cat_total), '{}')
    INTO v_rev_by_cat
    FROM (
        SELECT p.category, SUM(oi.line_total) as cat_total
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE TO_CHAR(o.created_at, 'YYYY-MM') = p_month AND o.status = 'completed'
        GROUP BY p.category
    ) sub;

    -- Giá vốn theo category bánh
    SELECT COALESCE(jsonb_object_agg(category, cat_cogs), '{}')
    INTO v_cogs_by_cat
    FROM (
        SELECT p.category, SUM(oi.line_cost) as cat_cogs
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN products p ON p.id = oi.product_id
        WHERE TO_CHAR(o.created_at, 'YYYY-MM') = p_month AND o.status = 'completed'
        GROUP BY p.category
    ) sub;

    -- OPEX theo khoản mục
    SELECT COALESCE(jsonb_object_agg(cat_name, cat_total), '{}')
    INTO v_opex_by_cat
    FROM (
        SELECT ec.name as cat_name, SUM(oe.amount) as cat_total
        FROM operating_expenses oe
        JOIN expense_categories ec ON ec.id = oe.category_id
        WHERE oe.period_month = p_month
        GROUP BY ec.name
    ) sub;

    -- Doanh thu từng ngày (lưu array 30 ngày để vẫn vẽ được chart sau khi xóa data đơn cũ)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('date', day, 'amount', daily_total)
                    ORDER BY day), '[]')
    INTO v_daily_rev
    FROM (
        SELECT DATE(created_at) as day, SUM(total_amount) as daily_total
        FROM orders
        WHERE TO_CHAR(created_at, 'YYYY-MM') = p_month AND status = 'completed'
        GROUP BY DATE(created_at)
    ) sub;

    -- Lưu tổng hợp vào monthly_accounting_summary
    INSERT INTO monthly_accounting_summary (
        period_month, total_revenue, total_cogs, total_opex,
        total_orders, total_items_sold,
        revenue_by_category, cogs_by_category, opex_by_category, daily_revenue,
        status, closed_at, closed_by
    ) VALUES (
        p_month, v_revenue, v_cogs, v_opex,
        v_order_count, v_item_count,
        v_rev_by_cat, v_cogs_by_cat, v_opex_by_cat, v_daily_rev,
        'closed', now(), p_user_id
    )
    ON CONFLICT (period_month) DO UPDATE SET
        total_revenue = EXCLUDED.total_revenue,
        total_cogs = EXCLUDED.total_cogs,
        total_opex = EXCLUDED.total_opex,
        total_orders = EXCLUDED.total_orders,
        total_items_sold = EXCLUDED.total_items_sold,
        revenue_by_category = EXCLUDED.revenue_by_category,
        cogs_by_category = EXCLUDED.cogs_by_category,
        opex_by_category = EXCLUDED.opex_by_category,
        daily_revenue = EXCLUDED.daily_revenue,
        status = 'closed',
        closed_at = now(),
        closed_by = p_user_id
    RETURNING id INTO v_summary_id;

    -- Khóa tất cả giao dịch trong sổ quỹ của tháng này
    UPDATE cashflow_transactions
    SET is_locked = true
    WHERE period_month = p_month;

    RETURN v_summary_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Hàm ngăn chặn xóa trực tiếp dữ liệu kế toán
CREATE OR REPLACE FUNCTION prevent_accounting_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Nguyên tắc bất biến kế toán: Không thể xóa trực tiếp giao dịch. Hãy tạo bút toán điều chỉnh.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_no_delete_cashflow
    BEFORE DELETE ON cashflow_transactions
    FOR EACH ROW EXECUTE FUNCTION prevent_accounting_delete();

CREATE OR REPLACE TRIGGER trg_no_delete_accounting_summary
    BEFORE DELETE ON monthly_accounting_summary
    FOR EACH ROW EXECUTE FUNCTION prevent_accounting_delete();

-- 10. Hàm Purge dọn dẹp data đơn chi tiết để giữ DB dưới 500 MB (Chỉ chạy sau khi đã chốt sổ)
CREATE OR REPLACE FUNCTION purge_monthly_data(p_month TEXT, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_deleted_orders INTEGER;
    v_summary_status TEXT;
BEGIN
    -- Kiểm tra tháng đã chốt sổ chưa
    SELECT status INTO v_summary_status
    FROM monthly_accounting_summary
    WHERE period_month = p_month;

    IF v_summary_status IS NULL OR v_summary_status != 'closed' THEN
        RAISE EXCEPTION 'Chỉ được dọn dẹp dữ liệu chi tiết của tháng ĐÃ CHỐT SỔ';
    END IF;

    -- Xóa các đơn hàng chi tiết (orders cascade xóa order_items, payments)
    WITH deleted AS (
        DELETE FROM orders
        WHERE TO_CHAR(created_at, 'YYYY-MM') = p_month
        RETURNING id
    )
    SELECT COUNT(*) INTO v_deleted_orders FROM deleted;

    -- Cập nhật trạng thái tháng thành 'archived'
    UPDATE monthly_accounting_summary
    SET status = 'archived'
    WHERE period_month = p_month;

    -- Ghi nhật ký audit
    INSERT INTO audit_logs (table_name, record_id, action, old_value, new_value, changed_by)
    VALUES (
        'orders',
        gen_random_uuid(),
        'PURGE',
        jsonb_build_object('period_month', p_month, 'orders_count', v_deleted_orders),
        jsonb_build_object('status', 'archived'),
        p_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'period_month', p_month,
        'deleted_orders', v_deleted_orders
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- >>> KẾT THÚC MIGRATION: 00009_create_functions_triggers.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00010_create_views.sql <<<
-- 00010_create_views.sql
-- Tạo các View an toàn che giấu thông tin giá vốn (COGS) đối với Nhân viên

-- 1. View xem nguyên liệu an toàn cho nhân viên quầy & thợ bếp (Ẩn avg_cost)
CREATE OR REPLACE VIEW public.ingredients_safe 
WITH (security_invoker = true) AS
  SELECT id, name, unit, category, stock_qty, reorder_level, is_active, updated_at
  FROM ingredients;

-- 2. View xem sản phẩm cho màn hình POS bán lẻ (Ẩn base_cost_price & food_cost_pct)
CREATE OR REPLACE VIEW public.products_pos 
WITH (security_invoker = true) AS
  SELECT id, name, category, image_url, selling_price, is_active, is_preorder_only, recipe_id
  FROM products
  WHERE is_active = true;

-- Cấp quyền SELECT trên Views cho tất cả người dùng đã xác thực (authenticated)
GRANT SELECT ON public.ingredients_safe TO authenticated;
GRANT SELECT ON public.products_pos TO authenticated;
-- >>> KẾT THÚC MIGRATION: 00010_create_views.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00011_create_rls_policies.sql <<<
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
-- >>> KẾT THÚC MIGRATION: 00011_create_rls_policies.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00012_fix_cross_device_sync.sql <<<
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
-- >>> KẾT THÚC MIGRATION: 00012_fix_cross_device_sync.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00013_fix_products_sync.sql <<<
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
-- >>> KẾT THÚC MIGRATION: 00013_fix_products_sync.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00014_add_resale_goods_and_cake_costing.sql <<<
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
-- >>> KẾT THÚC MIGRATION: 00014_add_resale_goods_and_cake_costing.sql <<<

-- >>> BẮT ĐẦU MIGRATION: 00015_enable_rls_secure_policies.sql <<<
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
-- >>> KẾT THÚC MIGRATION: 00015_enable_rls_secure_policies.sql <<<

