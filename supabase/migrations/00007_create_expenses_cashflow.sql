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
