export interface BakeryProduct {
  id: string;
  name: string;
  category: string;
  image_url: string;
  selling_price: number;
  base_cost_price?: number;
  food_cost_pct?: number;
  is_active: boolean;
  is_preorder_only?: boolean;
}

export const DEFAULT_BAKERY_PRODUCTS: BakeryProduct[] = [
  {
    id: 'prod-1',
    name: 'Bánh Bông Lan Trứng Muối 18cm',
    category: 'Bánh kem & Bánh đặt',
    image_url: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop',
    selling_price: 365000,
    base_cost_price: 127495,
    food_cost_pct: 34.9,
    is_active: true,
    is_preorder_only: true,
  },
  {
    id: 'prod-2',
    name: 'Bánh Kem Bắp Phô Mai 20cm',
    category: 'Bánh kem & Bánh đặt',
    image_url: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?w=600&auto=format&fit=crop',
    selling_price: 420000,
    base_cost_price: 145000,
    food_cost_pct: 34.5,
    is_active: true,
    is_preorder_only: true,
  },
  {
    id: 'prod-3',
    name: 'Bánh Croissant Bơ Pháp',
    category: 'Bánh mì & Bánh tươi',
    image_url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&auto=format&fit=crop',
    selling_price: 35000,
    base_cost_price: 11200,
    food_cost_pct: 32.0,
    is_active: true,
    is_preorder_only: false,
  },
  {
    id: 'prod-4',
    name: 'Bánh Mì Bơ Tỏi Phô Mai',
    category: 'Bánh mì & Bánh tươi',
    image_url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop',
    selling_price: 45000,
    base_cost_price: 15400,
    food_cost_pct: 34.2,
    is_active: true,
    is_preorder_only: false,
  },
  {
    id: 'prod-5',
    name: 'Bánh Mì Hoa Cúc Brioche Pháp',
    category: 'Bánh mì & Bánh tươi',
    image_url: 'https://images.unsplash.com/photo-1608198093002-ad4e005484ec?w=600&auto=format&fit=crop',
    selling_price: 75000,
    base_cost_price: 26000,
    food_cost_pct: 34.6,
    is_active: true,
    is_preorder_only: false,
  },
  {
    id: 'prod-6',
    name: 'Bánh Tiramisu Ý Hộp Vuông',
    category: 'Bánh ngọt & Tráng miệng',
    image_url: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&auto=format&fit=crop',
    selling_price: 85000,
    base_cost_price: 28000,
    food_cost_pct: 32.9,
    is_active: true,
    is_preorder_only: false,
  },
  {
    id: 'prod-7',
    name: 'Bánh Su Kem Chewy (Hộp 6 cái)',
    category: 'Bánh ngọt & Tráng miệng',
    image_url: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=600&auto=format&fit=crop',
    selling_price: 60000,
    base_cost_price: 19000,
    food_cost_pct: 31.6,
    is_active: true,
    is_preorder_only: false,
  },
  {
    id: 'prod-8',
    name: 'Bánh Tart Trứng Bồ Đào Nha',
    category: 'Bánh ngọt & Tráng miệng',
    image_url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop',
    selling_price: 25000,
    base_cost_price: 8000,
    food_cost_pct: 32.0,
    is_active: true,
    is_preorder_only: false,
  },
  {
    id: 'prod-9',
    name: 'Bánh Red Velvet Trái Tim 16cm',
    category: 'Bánh kem & Bánh đặt',
    image_url: 'https://images.unsplash.com/photo-1586788680434-30d324b2d46f?w=600&auto=format&fit=crop',
    selling_price: 390000,
    base_cost_price: 132000,
    food_cost_pct: 33.8,
    is_active: true,
    is_preorder_only: true,
  },
  {
    id: 'prod-10',
    name: 'Bánh Donut Socola Hạnh Nhân',
    category: 'Bánh ngọt & Tráng miệng',
    image_url: 'https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=600&auto=format&fit=crop',
    selling_price: 28000,
    base_cost_price: 9000,
    food_cost_pct: 32.1,
    is_active: true,
    is_preorder_only: false,
  },
];
