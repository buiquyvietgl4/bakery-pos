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
