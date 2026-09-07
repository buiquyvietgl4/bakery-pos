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
