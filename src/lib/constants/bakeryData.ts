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

export const DEFAULT_BAKERY_PRODUCTS: BakeryProduct[] = [];

export const DEFAULT_BAKERY_RECIPES: BakeryRecipe[] = [
  {
    id: 'eba1dfd2-3ef6-43b7-b8f8-8b3866681639',
    name: 'Công thức Bánh Sừng Bò Croissant (Mẻ 10 cái)',
    category: 'Bánh mì & Bánh tươi',
    yield_qty: 10,
    yield_unit: 'chiếc',
    bake_time_minutes: 25,
    bake_temp_celsius: 190,
    description: 'Cán 3 lần gấp',
    notes: 'Cán 3 lần gấp',
    items: [
      { name: 'Bột mì số 11 (Bake)', quantity: 500, qty: 500, unit: 'g', cost: 13125 },
      { name: 'Bơ lạt Anchor', quantity: 250, qty: 250, unit: 'g', cost: 19250 },
      { name: 'Sữa tươi không đường', quantity: 200, qty: 200, unit: 'ml', cost: 7140 },
      { name: 'Đường cát trắng', quantity: 60, qty: 60, unit: 'g', cost: 1085 },
    ],
  },
  {
    id: '2bb3027f-3acb-4295-81c4-f17fd22ace9b',
    name: 'Công thức Bông Lan Trứng Muối Tiêu Chuẩn',
    category: 'Bánh kem & Bánh đặt',
    yield_qty: 1,
    yield_unit: 'chiếc',
    bake_time_minutes: 25,
    bake_temp_celsius: 190,
    description: 'Cốt bánh mềm mịn, sốt phô mai',
    notes: 'Cốt bánh mềm mịn, sốt phô mai',
    items: [
      { name: 'Bột mì số 11 (Bake)', quantity: 300, qty: 300, unit: 'g', cost: 7875 },
      { name: 'Trứng gà ta', quantity: 6, qty: 6, unit: 'quả', cost: 21420 },
      { name: 'Bơ lạt Anchor', quantity: 150, qty: 150, unit: 'g', cost: 11550 },
      { name: 'Đường cát trắng', quantity: 200, qty: 200, unit: 'g', cost: 3600 },
      { name: 'Trứng muối nướng', quantity: 8, qty: 8, unit: 'quả', cost: 58800 },
      { name: 'Hộp bánh kem Kraft 20cm', quantity: 1, qty: 1, unit: 'cái', cost: 15000 },
      { name: 'Bộ dao nĩa + Nến sinh nhật', quantity: 1, qty: 1, unit: 'cái', cost: 3000 },
    ],
  },
  {
    id: '4fd00f61-9fa6-4b98-9c9c-48712f04b0a0',
    name: 'Công thức Bánh Mì Bơ Tỏi Phô Mai (Mẻ 5 cái)',
    category: 'Bánh mì & Bánh tươi',
    yield_qty: 5,
    yield_unit: 'chiếc',
    bake_time_minutes: 25,
    bake_temp_celsius: 190,
    description: 'Nướng vàng 180 độ',
    notes: 'Nướng vàng 180 độ',
    items: [
      { name: 'Bột mì số 11 (Bake)', quantity: 400, qty: 400, unit: 'g', cost: 10500 },
      { name: 'Bơ lạt Anchor', quantity: 200, qty: 200, unit: 'g', cost: 15400 },
      { name: 'Trứng gà ta', quantity: 2, qty: 2, unit: 'quả', cost: 7140 },
      { name: 'Đường cát trắng', quantity: 50, qty: 50, unit: 'g', cost: 900 },
    ],
  },
];
