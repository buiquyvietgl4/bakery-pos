-- =====================================================
-- Migration: 00019_create_system_cloud_backups.sql
-- Description: Bảng lưu trữ bản sao lưu dự phòng đám mây (Cloud SQL Backups)
-- Cơ chế bảo hiểm chống xâm nhập & thảm họa xóa sạch bản local
-- =====================================================

CREATE TABLE IF NOT EXISTS public.system_cloud_backups (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    backup_type TEXT NOT NULL DEFAULT 'temp_7day', -- 'temp_7day' | 'pre_reset_critical' | 'manual'
    metadata JSONB,
    backup_data JSONB NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Chỉ mục tìm kiếm theo hạn sử dụng và thời gian tạo
CREATE INDEX IF NOT EXISTS idx_system_cloud_backups_expires_at ON public.system_cloud_backups(expires_at);
CREATE INDEX IF NOT EXISTS idx_system_cloud_backups_created_at ON public.system_cloud_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_cloud_backups_type ON public.system_cloud_backups(backup_type);

-- Bật bảo mật Row Level Security (RLS)
ALTER TABLE public.system_cloud_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for system_cloud_backups" ON public.system_cloud_backups;
CREATE POLICY "Allow all for system_cloud_backups"
    ON public.system_cloud_backups
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
