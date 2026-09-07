-- 00010_create_views.sql
-- Tạo các View an toàn che giấu thông tin giá vốn (COGS) đối với Nhân viên

-- 1. View xem nguyên liệu an toàn cho nhân viên quầy & thợ bếp (Ẩn avg_cost)
CREATE OR REPLACE VIEW public.ingredients_safe AS
  SELECT id, name, unit, category, stock_qty, reorder_level, is_active, updated_at
  FROM ingredients;

-- 2. View xem sản phẩm cho màn hình POS bán lẻ (Ẩn base_cost_price & food_cost_pct)
CREATE OR REPLACE VIEW public.products_pos AS
  SELECT id, name, category, image_url, selling_price, is_active, is_preorder_only, recipe_id
  FROM products
  WHERE is_active = true;

-- Cấp quyền SELECT trên Views cho tất cả người dùng đã xác thực (authenticated)
GRANT SELECT ON public.ingredients_safe TO authenticated;
GRANT SELECT ON public.products_pos TO authenticated;
