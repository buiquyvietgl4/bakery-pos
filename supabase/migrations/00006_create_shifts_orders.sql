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
