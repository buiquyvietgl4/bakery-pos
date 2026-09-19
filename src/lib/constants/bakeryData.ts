export type ProductType = 'produced' | 'imported' | 'custom_cake';

export interface BakeryProduct {
  id: string;
  name: string;
  category: string;
  image_url: string;
  selling_price: number;
  price?: number;
  base_cost_price?: number;
  import_price?: number;
  supplier_name?: string;
  barcode?: string;
  product_type?: ProductType;
  food_cost_pct?: number;
  is_active: boolean;
  is_preorder_only?: boolean;
  cake_type_label?: 'standard' | 'pre_order' | 'birthday';
  show_on_menu?: boolean;
  bom_preset_id?: string;
  menu_display_qty?: number;
  stock_qty?: number;
  min_stock_alert?: number;
  unit?: string;
  is_semi_finished?: boolean;
}

export interface RecipeIngredientItem {
  name: string;
  qty: number;
  quantity?: number;
  unit: string;
  cost?: number;
}

export interface BakeryRecipe {
  id: string;
  product_id?: string;
  name: string;
  category: string;
  yield_qty: number;
  yield_unit: string;
  bake_time_minutes: number;
  bake_temp_celsius: number;
  description?: string;
  notes?: string;
  items: RecipeIngredientItem[];
}

// TOÀN BỘ DỮ LIỆU MẪU ĐÃ ĐƯỢC LOẠI BỎ TRIỆT ĐỂ: CHỈ DÙNG DỮ LIỆU THỰC TẾ
export const DEFAULT_BAKERY_PRODUCTS: BakeryProduct[] = [];

export const DEFAULT_BAKERY_RECIPES: BakeryRecipe[] = [];
