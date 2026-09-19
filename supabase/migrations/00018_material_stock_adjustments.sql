-- =====================================================
-- Migration: 00018_material_stock_adjustments.sql
-- Description: Bảng lưu lịch sử điều chỉnh / kiểm kê tồn kho nguyên vật liệu
-- Đảm bảo đồng bộ 100% giữa Cloud SQL (Supabase) và Local SQL
-- =====================================================

CREATE TABLE IF NOT EXISTS public.material_stock_adjustments (
    id TEXT PRIMARY KEY,
    ingredient_id TEXT,
    ingredient_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    old_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    new_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    delta_quantity NUMERIC(12,3) NOT NULL DEFAULT 0,
    avg_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_value_change NUMERIC(15,2) NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    notes TEXT,
    adjusted_by TEXT,
    adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ mục tối ưu truy vấn
CREATE INDEX IF NOT EXISTS idx_mat_adjustments_ingredient_id ON public.material_stock_adjustments(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_mat_adjustments_adjusted_at ON public.material_stock_adjustments(adjusted_at DESC);

-- Bật bảo mật Row Level Security (RLS)
ALTER TABLE public.material_stock_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for material_stock_adjustments" ON public.material_stock_adjustments;
CREATE POLICY "Allow all for material_stock_adjustments"
    ON public.material_stock_adjustments
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- Bật tính năng Realtime cho bảng material_stock_adjustments
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.material_stock_adjustments;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Bỏ qua nếu bảng đã có trong publication
    NULL;
END $$;
