// src/lib/constants/cakeCostingData.ts
// Bảng định mức chi phí chuẩn cho Bánh Sinh Nhật & Bánh Kem đặt theo yêu cầu (Custom Cake)

export interface CakeSizeOption {
  id: string;
  name: string;
  diameterCm: number;
  servings: string;
  baseCost: number; // Chi phí vốn cốt bánh + kem nền tiêu chuẩn
  suggestedPrice: number; // Giá bán đề xuất tiêu chuẩn
  isDefault?: boolean;
}

export interface CakeFlavorOption {
  id: string;
  name: string;
  extraCost: number; // Vốn nguyên liệu cộng thêm
  extraPrice: number; // Phụ thu bán
}

export interface CakeCreamOption {
  id: string;
  name: string;
  extraCost: number;
  extraPrice: number;
}

export interface CakePackagingOption {
  id: string;
  name: string;
  extraCost: number;
  extraPrice: number;
  isDefault?: boolean;
}

export interface CakeAddonOption {
  id: string;
  name: string;
  category: 'decor' | 'fruit' | 'toy' | 'flower' | 'candle' | 'light' | 'accessory' | 'other';
  cost: number; // Giá vốn phụ kiện
  price: number; // Giá bán / phụ thu
  icon?: string;
}

export interface CustomCakeCostingConfig {
  version: string;
  targetFoodCostPct: number; // Mặc định ~33%
  sizes: CakeSizeOption[];
  flavors: CakeFlavorOption[];
  creams: CakeCreamOption[];
  packagings: CakePackagingOption[];
  addons: CakeAddonOption[];
}

export const DEFAULT_CAKE_SIZES: CakeSizeOption[] = [
  {
    id: 'size-14',
    name: 'Size 14cm (2 - 4 người)',
    diameterCm: 14,
    servings: '2 - 4 người',
    baseCost: 45000,
    suggestedPrice: 200000,
  },
  {
    id: 'size-16',
    name: 'Size 16cm (4 - 6 người)',
    diameterCm: 16,
    servings: '4 - 6 người',
    baseCost: 65000,
    suggestedPrice: 280000,
  },
  {
    id: 'size-18',
    name: 'Size 18cm (6 - 8 người)',
    diameterCm: 18,
    servings: '6 - 8 người',
    baseCost: 90000,
    suggestedPrice: 365000,
    isDefault: true,
  },
  {
    id: 'size-20',
    name: 'Size 20cm (8 - 12 người)',
    diameterCm: 20,
    servings: '8 - 12 người',
    baseCost: 125000,
    suggestedPrice: 450000,
  },
  {
    id: 'size-22',
    name: 'Size 22cm (12 - 16 người)',
    diameterCm: 22,
    servings: '12 - 16 người',
    baseCost: 165000,
    suggestedPrice: 550000,
  },
  {
    id: 'size-2tier',
    name: 'Bánh 2 tầng sinh nhật',
    diameterCm: 24,
    servings: '15 - 25 người',
    baseCost: 240000,
    suggestedPrice: 750000,
  },
];

export const DEFAULT_CAKE_FLAVORS: CakeFlavorOption[] = [
  { id: 'flavor-vanilla', name: 'Cốt Vani truyền thống', extraCost: 0, extraPrice: 0 },
  { id: 'flavor-choco', name: 'Cốt Socola nguyên chất', extraCost: 10000, extraPrice: 20000 },
  { id: 'flavor-matcha', name: 'Cốt Trà xanh Matcha Uji', extraCost: 15000, extraPrice: 25000 },
  { id: 'flavor-redvelvet', name: 'Cốt Red Velvet nhung đỏ', extraCost: 20000, extraPrice: 35000 },
  { id: 'flavor-sponge-salted', name: 'Cốt Bông lan trứng muối', extraCost: 25000, extraPrice: 40000 },
];

export const DEFAULT_CAKE_CREAMS: CakeCreamOption[] = [
  { id: 'cream-topping', name: 'Kem tươi Topping thanh mát', extraCost: 0, extraPrice: 0 },
  { id: 'cream-whipping', name: 'Kem Whipping Anchor cao cấp', extraCost: 25000, extraPrice: 40000 },
  { id: 'cream-cheese', name: 'Kem Phô mai Mascarpone béo ngậy', extraCost: 30000, extraPrice: 50000 },
  { id: 'cream-butter', name: 'Kem bơ Hàn Quốc tạo hình', extraCost: 35000, extraPrice: 60000 },
];

export const DEFAULT_CAKE_PACKAGINGS: CakePackagingOption[] = [
  { id: 'pack-paper', name: 'Hộp giấy tiêu chuẩn + Đế lót', extraCost: 0, extraPrice: 0, isDefault: true },
  { id: 'pack-mica', name: 'Hộp Mica trong suốt cao cấp + Ruy băng', extraCost: 25000, extraPrice: 40000 },
];

export const DEFAULT_CAKE_ADDONS: CakeAddonOption[] = [
  { id: 'addon-lettering', name: 'Viết chữ nghệ thuật / Vẽ icon', category: 'decor', cost: 5000, price: 0, icon: '✍️' },
  { id: 'addon-fruit', name: 'Trái cây tươi (Dâu, Nho, Xoài...)', category: 'fruit', cost: 35000, price: 50000, icon: '🍓' },
  { id: 'addon-toy', name: 'Mô hình đồ chơi / Vương miện / Búp bê', category: 'toy', cost: 30000, price: 50000, icon: '👑' },
  { id: 'addon-flower', name: 'Hoa tươi trang trí cao cấp', category: 'flower', cost: 45000, price: 70000, icon: '💐' },
  { id: 'addon-candles', name: 'Bộ nến số / Nến pháo nghệ thuật', category: 'candle', cost: 8000, price: 15000, icon: '🕯️' },
  { id: 'addon-led', name: 'Dây đèn LED nhấp nháy phát sáng', category: 'light', cost: 8000, price: 15000, icon: '✨' },
  { id: 'addon-money-pull', name: 'Hộp rút tiền bên trong bánh', category: 'accessory', cost: 25000, price: 50000, icon: '💸' },
];

export const DEFAULT_CUSTOM_CAKE_CONFIG: CustomCakeCostingConfig = {
  version: '1.0.0',
  targetFoodCostPct: 33,
  sizes: DEFAULT_CAKE_SIZES,
  flavors: DEFAULT_CAKE_FLAVORS,
  creams: DEFAULT_CAKE_CREAMS,
  packagings: DEFAULT_CAKE_PACKAGINGS,
  addons: DEFAULT_CAKE_ADDONS,
};
