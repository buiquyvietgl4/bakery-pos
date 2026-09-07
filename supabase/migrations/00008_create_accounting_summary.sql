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
