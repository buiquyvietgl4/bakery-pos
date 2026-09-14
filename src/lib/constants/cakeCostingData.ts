// src/lib/constants/cakeCostingData.ts
// Bảng định mức chi phí chuẩn cho Bánh Sinh Nhật & Bánh Kem đặt theo yêu cầu (Custom Cake)

export interface CakeSizeBomItem {
  id?: string;
  ingredientId?: string; // ID liên kết kho nguyên liệu tiệm
  name: string; // Tên nguyên liệu (Bột mì, Trứng gà, Sữa, Kem...)
  unit: string; // Đơn vị: g, ml, quả, gói...
  quantity: number; // Định mức cho kích thước bánh này
  unitCost: number; // Đơn giá nguyên liệu (VND / đơn vị)
  totalCost?: number; // Thành tiền = quantity * unitCost (auto-calculated)
  notes?: string;
}

export interface CakeSizeOption {
  id: string;
  name: string;
  diameterCm: number;
  servings: string;
  baseCost: number; // Chi phí vốn cốt bánh + kem nền tiêu chuẩn (tính từ BOM)
  suggestedPrice: number; // Giá bán đề xuất tiêu chuẩn
  isDefault?: boolean;
  bomIngredients?: CakeSizeBomItem[]; // Công thức định mức BOM nguyên vật liệu cốt bánh
}

export interface CakeFlavorOption {
  id: string;
  name: string;
  extraCost: number; // Vốn nguyên liệu cộng thêm
  extraPrice: number; // Phụ thu bán
  icon?: string;
}

export interface CakeFillingOption {
  id: string;
  name: string;
  extraCost: number; // Vốn nguyên liệu nhân bánh cộng thêm
  extraPrice: number; // Phụ thu bán khi chọn nhân
  isDefault?: boolean;
  icon?: string;
}

export interface CakeCreamOption {
  id: string;
  name: string;
  extraCost: number;
  extraPrice: number;
  icon?: string;
}

export interface CakePackagingOption {
  id: string;
  name: string;
  extraCost: number;
  extraPrice: number;
  isDefault?: boolean;
  icon?: string;
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
  fillings: CakeFillingOption[];
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
    bomIngredients: [
      { id: 'bom-14-1', name: 'Bột mì số 11 (Bake)', unit: 'g', quantity: 70, unitCost: 25, totalCost: 1750 },
      { id: 'bom-14-2', name: 'Trứng gà ta', unit: 'quả', quantity: 2, unitCost: 3500, totalCost: 7000 },
      { id: 'bom-14-3', name: 'Đường cát trắng', unit: 'g', quantity: 50, unitCost: 18, totalCost: 900 },
      { id: 'bom-14-4', name: 'Sữa tươi không đường', unit: 'ml', quantity: 40, unitCost: 35, totalCost: 1400 },
      { id: 'bom-14-5', name: 'Bơ lạt Anchor', unit: 'g', quantity: 25, unitCost: 120, totalCost: 3000 },
      { id: 'bom-14-6', name: 'Kem phủ & chà láng (Topping/Whipping)', unit: 'g', quantity: 250, unitCost: 120, totalCost: 30000 },
      { id: 'bom-14-7', name: 'Hương Vani & Phụ liệu làm bánh', unit: 'gói', quantity: 1, unitCost: 950, totalCost: 950 },
    ],
  },
  {
    id: 'size-16',
    name: 'Size 16cm (4 - 6 người)',
    diameterCm: 16,
    servings: '4 - 6 người',
    baseCost: 65000,
    suggestedPrice: 280000,
    bomIngredients: [
      { id: 'bom-16-1', name: 'Bột mì số 11 (Bake)', unit: 'g', quantity: 100, unitCost: 25, totalCost: 2500 },
      { id: 'bom-16-2', name: 'Trứng gà ta', unit: 'quả', quantity: 3, unitCost: 3500, totalCost: 10500 },
      { id: 'bom-16-3', name: 'Đường cát trắng', unit: 'g', quantity: 70, unitCost: 18, totalCost: 1260 },
      { id: 'bom-16-4', name: 'Sữa tươi không đường', unit: 'ml', quantity: 60, unitCost: 35, totalCost: 2100 },
      { id: 'bom-16-5', name: 'Bơ lạt Anchor', unit: 'g', quantity: 35, unitCost: 120, totalCost: 4200 },
      { id: 'bom-16-6', name: 'Kem phủ & chà láng (Topping/Whipping)', unit: 'g', quantity: 360, unitCost: 120, totalCost: 43200 },
      { id: 'bom-16-7', name: 'Hương Vani & Phụ liệu làm bánh', unit: 'gói', quantity: 1, unitCost: 1240, totalCost: 1240 },
    ],
  },
  {
    id: 'size-18',
    name: 'Size 18cm (6 - 8 người)',
    diameterCm: 18,
    servings: '6 - 8 người',
    baseCost: 90000,
    suggestedPrice: 365000,
    isDefault: true,
    bomIngredients: [
      { id: 'bom-18-1', name: 'Bột mì số 11 (Bake)', unit: 'g', quantity: 140, unitCost: 25, totalCost: 3500 },
      { id: 'bom-18-2', name: 'Trứng gà ta', unit: 'quả', quantity: 4, unitCost: 3500, totalCost: 14000 },
      { id: 'bom-18-3', name: 'Đường cát trắng', unit: 'g', quantity: 100, unitCost: 18, totalCost: 1800 },
      { id: 'bom-18-4', name: 'Sữa tươi không đường', unit: 'ml', quantity: 80, unitCost: 35, totalCost: 2800 },
      { id: 'bom-18-5', name: 'Bơ lạt Anchor', unit: 'g', quantity: 50, unitCost: 120, totalCost: 6000 },
      { id: 'bom-18-6', name: 'Kem phủ & chà láng (Topping/Whipping)', unit: 'g', quantity: 500, unitCost: 120, totalCost: 60000 },
      { id: 'bom-18-7', name: 'Hương Vani & Phụ liệu làm bánh', unit: 'gói', quantity: 1, unitCost: 1900, totalCost: 1900 },
    ],
  },
  {
    id: 'size-20',
    name: 'Size 20cm (8 - 12 người)',
    diameterCm: 20,
    servings: '8 - 12 người',
    baseCost: 125000,
    suggestedPrice: 450000,
    bomIngredients: [
      { id: 'bom-20-1', name: 'Bột mì số 11 (Bake)', unit: 'g', quantity: 200, unitCost: 25, totalCost: 5000 },
      { id: 'bom-20-2', name: 'Trứng gà ta', unit: 'quả', quantity: 5, unitCost: 3500, totalCost: 17500 },
      { id: 'bom-20-3', name: 'Đường cát trắng', unit: 'g', quantity: 140, unitCost: 18, totalCost: 2520 },
      { id: 'bom-20-4', name: 'Sữa tươi không đường', unit: 'ml', quantity: 110, unitCost: 35, totalCost: 3850 },
      { id: 'bom-20-5', name: 'Bơ lạt Anchor', unit: 'g', quantity: 70, unitCost: 120, totalCost: 8400 },
      { id: 'bom-20-6', name: 'Kem phủ & chà láng (Topping/Whipping)', unit: 'g', quantity: 710, unitCost: 120, totalCost: 85200 },
      { id: 'bom-20-7', name: 'Hương Vani & Phụ liệu làm bánh', unit: 'gói', quantity: 1, unitCost: 2530, totalCost: 2530 },
    ],
  },
  {
    id: 'size-22',
    name: 'Size 22cm (12 - 16 người)',
    diameterCm: 22,
    servings: '12 - 16 người',
    baseCost: 165000,
    suggestedPrice: 550000,
    bomIngredients: [
      { id: 'bom-22-1', name: 'Bột mì số 11 (Bake)', unit: 'g', quantity: 260, unitCost: 25, totalCost: 6500 },
      { id: 'bom-22-2', name: 'Trứng gà ta', unit: 'quả', quantity: 7, unitCost: 3500, totalCost: 24500 },
      { id: 'bom-22-3', name: 'Đường cát trắng', unit: 'g', quantity: 180, unitCost: 18, totalCost: 3240 },
      { id: 'bom-22-4', name: 'Sữa tươi không đường', unit: 'ml', quantity: 150, unitCost: 35, totalCost: 5250 },
      { id: 'bom-22-5', name: 'Bơ lạt Anchor', unit: 'g', quantity: 90, unitCost: 120, totalCost: 10800 },
      { id: 'bom-22-6', name: 'Kem phủ & chà láng (Topping/Whipping)', unit: 'g', quantity: 930, unitCost: 120, totalCost: 111600 },
      { id: 'bom-22-7', name: 'Hương Vani & Phụ liệu làm bánh', unit: 'gói', quantity: 1, unitCost: 3110, totalCost: 3110 },
    ],
  },
  {
    id: 'size-2tier',
    name: 'Bánh 2 tầng sinh nhật',
    diameterCm: 24,
    servings: '15 - 25 người',
    baseCost: 240000,
    suggestedPrice: 750000,
    bomIngredients: [
      { id: 'bom-2t-1', name: 'Bột mì số 11 (Bake)', unit: 'g', quantity: 380, unitCost: 25, totalCost: 9500 },
      { id: 'bom-2t-2', name: 'Trứng gà ta', unit: 'quả', quantity: 10, unitCost: 3500, totalCost: 35000 },
      { id: 'bom-2t-3', name: 'Đường cát trắng', unit: 'g', quantity: 260, unitCost: 18, totalCost: 4680 },
      { id: 'bom-2t-4', name: 'Sữa tươi không đường', unit: 'ml', quantity: 220, unitCost: 35, totalCost: 7700 },
      { id: 'bom-2t-5', name: 'Bơ lạt Anchor', unit: 'g', quantity: 130, unitCost: 120, totalCost: 15600 },
      { id: 'bom-2t-6', name: 'Kem phủ & chà láng 2 tầng (Topping/Whipping)', unit: 'g', quantity: 1360, unitCost: 120, totalCost: 163200 },
      { id: 'bom-2t-7', name: 'Cọc trụ chống tầng & Phụ liệu', unit: 'bộ', quantity: 1, unitCost: 4320, totalCost: 4320 },
    ],
  },
];

export const DEFAULT_CAKE_FLAVORS: CakeFlavorOption[] = [
  { id: 'flavor-vanilla', name: 'Cốt Vani truyền thống', extraCost: 0, extraPrice: 0, icon: '🎂' },
  { id: 'flavor-choco', name: 'Cốt Socola nguyên chất', extraCost: 10000, extraPrice: 20000, icon: '🍫' },
  { id: 'flavor-matcha', name: 'Cốt Trà xanh Matcha Uji', extraCost: 15000, extraPrice: 25000, icon: '🍵' },
  { id: 'flavor-redvelvet', name: 'Cốt Red Velvet nhung đỏ', extraCost: 20000, extraPrice: 35000, icon: '🍰' },
  { id: 'flavor-sponge-salted', name: 'Cốt Bông lan trứng muối', extraCost: 25000, extraPrice: 40000, icon: '🥚' },
];

export const DEFAULT_CAKE_FILLINGS: CakeFillingOption[] = [
  { id: 'filling-none', name: 'Không nhân (Chỉ phủ kem tươi)', extraCost: 0, extraPrice: 0, isDefault: true, icon: '🍰' },
  { id: 'filling-strawberry', name: 'Nhân Mứt Dâu Tây Đà Lạt', extraCost: 10000, extraPrice: 20000, icon: '🍓' },
  { id: 'filling-mango', name: 'Nhân Mứt Xoài Cát Nhiệt Đới', extraCost: 10000, extraPrice: 20000, icon: '🥭' },
  { id: 'filling-blueberry', name: 'Nhân Mứt Việt Quất Tươi', extraCost: 15000, extraPrice: 25000, icon: '🫐' },
  { id: 'filling-choco', name: 'Nhân Sốt Socola Ganache Bỉ', extraCost: 15000, extraPrice: 25000, icon: '🍫' },
  { id: 'filling-cheese', name: 'Nhân Sốt Phô Mai Dẻo Mascarpone', extraCost: 20000, extraPrice: 30000, icon: '🧀' },
  { id: 'filling-salted-egg', name: 'Nhân Trứng Muối Sốt Bơ Béo', extraCost: 20000, extraPrice: 35000, icon: '🥚' },
  { id: 'filling-coconut', name: 'Nhân Thạch Dừa Non & Lá Dứa', extraCost: 15000, extraPrice: 25000, icon: '🥥' },
];

export const DEFAULT_CAKE_CREAMS: CakeCreamOption[] = [
  { id: 'cream-topping', name: 'Kem tươi Topping thanh mát', extraCost: 0, extraPrice: 0, icon: '🍦' },
  { id: 'cream-whipping', name: 'Kem Whipping Anchor cao cấp', extraCost: 25000, extraPrice: 40000, icon: '🥛' },
  { id: 'cream-cheese', name: 'Kem Phô mai Mascarpone béo ngậy', extraCost: 30000, extraPrice: 50000, icon: '🧀' },
  { id: 'cream-butter', name: 'Kem bơ Hàn Quốc tạo hình', extraCost: 35000, extraPrice: 60000, icon: '🧈' },
];

export const DEFAULT_CAKE_PACKAGINGS: CakePackagingOption[] = [
  { id: 'pack-paper', name: 'Hộp giấy tiêu chuẩn + Đế lót', extraCost: 0, extraPrice: 0, isDefault: true, icon: '📦' },
  { id: 'pack-mica', name: 'Hộp Mica trong suốt cao cấp + Ruy băng', extraCost: 25000, extraPrice: 40000, icon: '🎁' },
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
  fillings: DEFAULT_CAKE_FILLINGS,
  creams: DEFAULT_CAKE_CREAMS,
  packagings: DEFAULT_CAKE_PACKAGINGS,
  addons: DEFAULT_CAKE_ADDONS,
};
