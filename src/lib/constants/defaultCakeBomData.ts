// src/lib/constants/defaultCakeBomData.ts
import { FullCakeBomConfig, CakeBaseModel, CreamCoatingModel, CakeFillingModel, PackagingBoxModel, FreeAccessoryModel, CakeDecorAddonModel, BirthdayCakeBomPreset } from '@/lib/types/bakery-bom';

export const DEFAULT_CAKE_BASES: CakeBaseModel[] = [
  {
    id: 'base-vani',
    name: 'Cốt Vani Truyền Thống (Chiffon)',
    description: 'Cốt bánh mềm xốp, thơm vani tự nhiên, độ đàn hồi hoàn hảo',
    isDefault: true,
    sizes: [
      {
        id: 'base-vani-14',
        sizeName: 'Size 14cm (2 - 4 người)',
        diameterCm: 14,
        servings: '2 - 4 người',
        baseCost: 15500,
        bomIngredients: [
          { name: 'Bột mì số 8 (Cake Flour)', unit: 'g', quantity: 60, unitCost: 24, totalCost: 1440 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 2, unitCost: 3500, totalCost: 7000 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 45, unitCost: 20, totalCost: 900 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 35, unitCost: 36, totalCost: 1260 },
          { name: 'Dầu ăn thực vật', unit: 'ml', quantity: 30, unitCost: 40, totalCost: 1200 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 25, unitCost: 130, totalCost: 3250 },
          { name: 'Tinh chất Vani Pháp', unit: 'ml', quantity: 3, unitCost: 150, totalCost: 450 },
        ],
      },
      {
        id: 'base-vani-16',
        sizeName: 'Size 16cm (4 - 6 người)',
        diameterCm: 16,
        servings: '4 - 6 người',
        baseCost: 22800,
        bomIngredients: [
          { name: 'Bột mì số 8 (Cake Flour)', unit: 'g', quantity: 90, unitCost: 24, totalCost: 2160 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 3, unitCost: 3500, totalCost: 10500 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 65, unitCost: 20, totalCost: 1300 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 50, unitCost: 36, totalCost: 1800 },
          { name: 'Dầu ăn thực vật', unit: 'ml', quantity: 40, unitCost: 40, totalCost: 1600 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 35, unitCost: 130, totalCost: 4550 },
          { name: 'Tinh chất Vani Pháp', unit: 'ml', quantity: 6, unitCost: 150, totalCost: 900 },
        ],
      },
      {
        id: 'base-vani-18',
        sizeName: 'Size 18cm (6 - 8 người)',
        diameterCm: 18,
        servings: '6 - 8 người',
        baseCost: 30500,
        bomIngredients: [
          { name: 'Bột mì số 8 (Cake Flour)', unit: 'g', quantity: 120, unitCost: 24, totalCost: 2880 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 4, unitCost: 3500, totalCost: 14000 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 85, unitCost: 20, totalCost: 1700 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 70, unitCost: 36, totalCost: 2520 },
          { name: 'Dầu ăn thực vật', unit: 'ml', quantity: 55, unitCost: 40, totalCost: 2200 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 45, unitCost: 130, totalCost: 5850 },
          { name: 'Tinh chất Vani Pháp', unit: 'ml', quantity: 9, unitCost: 150, totalCost: 1350 },
        ],
      },
      {
        id: 'base-vani-20',
        sizeName: 'Size 20cm (8 - 12 người)',
        diameterCm: 20,
        servings: '8 - 12 người',
        baseCost: 41200,
        bomIngredients: [
          { name: 'Bột mì số 8 (Cake Flour)', unit: 'g', quantity: 160, unitCost: 24, totalCost: 3840 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 5, unitCost: 3500, totalCost: 17500 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 120, unitCost: 20, totalCost: 2400 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 95, unitCost: 36, totalCost: 3420 },
          { name: 'Dầu ăn thực vật', unit: 'ml', quantity: 75, unitCost: 40, totalCost: 3000 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 70, unitCost: 130, totalCost: 9100 },
          { name: 'Tinh chất Vani Pháp', unit: 'ml', quantity: 13, unitCost: 150, totalCost: 1950 },
        ],
      },
    ],
  },
  {
    id: 'base-socola',
    name: 'Cốt Socola Bỉ Đậm Đà',
    description: 'Cốt socola đen nguyên chất, đắng nhẹ hậu ngọt, ẩm mịn',
    sizes: [
      {
        id: 'base-socola-14',
        sizeName: 'Size 14cm (2 - 4 người)',
        diameterCm: 14,
        baseCost: 22000,
        bomIngredients: [
          { name: 'Bột mì số 8', unit: 'g', quantity: 50, unitCost: 24, totalCost: 1200 },
          { name: 'Bột Cacao Barry Callebaut 100%', unit: 'g', quantity: 25, unitCost: 220, totalCost: 5500 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 2, unitCost: 3500, totalCost: 7000 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 50, unitCost: 20, totalCost: 1000 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 35, unitCost: 130, totalCost: 4550 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 45, unitCost: 36, totalCost: 1620 },
          { name: 'Socola compound đen nút', unit: 'g', quantity: 20, unitCost: 56, totalCost: 1120 },
        ],
      },
      {
        id: 'base-socola-16',
        sizeName: 'Size 16cm (4 - 6 người)',
        diameterCm: 16,
        baseCost: 31500,
        bomIngredients: [
          { name: 'Bột mì số 8', unit: 'g', quantity: 75, unitCost: 24, totalCost: 1800 },
          { name: 'Bột Cacao Barry Callebaut 100%', unit: 'g', quantity: 35, unitCost: 220, totalCost: 7700 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 3, unitCost: 3500, totalCost: 10500 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 70, unitCost: 20, totalCost: 1400 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 50, unitCost: 130, totalCost: 6500 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 60, unitCost: 36, totalCost: 2160 },
          { name: 'Socola compound đen nút', unit: 'g', quantity: 26, unitCost: 56, totalCost: 1456 },
        ],
      },
      {
        id: 'base-socola-18',
        sizeName: 'Size 18cm (6 - 8 người)',
        diameterCm: 18,
        baseCost: 42000,
        bomIngredients: [
          { name: 'Bột mì số 8', unit: 'g', quantity: 100, unitCost: 24, totalCost: 2400 },
          { name: 'Bột Cacao Barry Callebaut 100%', unit: 'g', quantity: 50, unitCost: 220, totalCost: 11000 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 4, unitCost: 3500, totalCost: 14000 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 95, unitCost: 20, totalCost: 1900 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 65, unitCost: 130, totalCost: 8450 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 80, unitCost: 36, totalCost: 2880 },
          { name: 'Socola compound đen nút', unit: 'g', quantity: 35, unitCost: 56, totalCost: 1960 },
        ],
      },
    ],
  },
  {
    id: 'base-matcha',
    name: 'Cốt Matcha Nhật Uji',
    description: 'Thơm thanh trà xanh Uji, màu xanh tự nhiên không phẩm màu',
    sizes: [
      {
        id: 'base-matcha-16',
        sizeName: 'Size 16cm (4 - 6 người)',
        diameterCm: 16,
        baseCost: 33000,
        bomIngredients: [
          { name: 'Bột mì số 8', unit: 'g', quantity: 80, unitCost: 24, totalCost: 1920 },
          { name: 'Bột Matcha Nhật Uji nguyên chất', unit: 'g', quantity: 18, unitCost: 550, totalCost: 9900 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 3, unitCost: 3500, totalCost: 10500 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 70, unitCost: 20, totalCost: 1400 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 45, unitCost: 130, totalCost: 5850 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 65, unitCost: 36, totalCost: 2340 },
        ],
      },
      {
        id: 'base-matcha-18',
        sizeName: 'Size 18cm (6 - 8 người)',
        diameterCm: 18,
        baseCost: 44500,
        bomIngredients: [
          { name: 'Bột mì số 8', unit: 'g', quantity: 110, unitCost: 24, totalCost: 2640 },
          { name: 'Bột Matcha Nhật Uji nguyên chất', unit: 'g', quantity: 25, unitCost: 550, totalCost: 13750 },
          { name: 'Trứng gà ta tươi', unit: 'quả', quantity: 4, unitCost: 3500, totalCost: 14000 },
          { name: 'Đường cát trắng', unit: 'g', quantity: 90, unitCost: 20, totalCost: 1800 },
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 60, unitCost: 130, totalCost: 7800 },
          { name: 'Sữa tươi không đường', unit: 'ml', quantity: 85, unitCost: 36, totalCost: 3060 },
        ],
      },
    ],
  },
];

export const DEFAULT_CREAM_COATINGS: CreamCoatingModel[] = [
  {
    id: 'cream-whipping',
    name: 'Kem Tươi Whipping Cream Anchor (Động vật)',
    description: 'Kem béo ngậy thơm ngon, tan ngay trong miệng, không ngấy',
    isDefault: true,
    sizes: [
      {
        id: 'cream-whip-14',
        sizeName: 'Size 14cm',
        diameterCm: 14,
        baseCost: 32000,
        bomIngredients: [
          { name: 'Whipping Cream Anchor 35.5%', unit: 'ml', quantity: 240, unitCost: 125, totalCost: 30000 },
          { name: 'Đường bột Biên Hòa', unit: 'g', quantity: 25, unitCost: 25, totalCost: 625 },
          { name: 'Chiết xuất vani', unit: 'ml', quantity: 2, unitCost: 150, totalCost: 300 },
        ],
      },
      {
        id: 'cream-whip-16',
        sizeName: 'Size 16cm',
        diameterCm: 16,
        baseCost: 46000,
        bomIngredients: [
          { name: 'Whipping Cream Anchor 35.5%', unit: 'ml', quantity: 350, unitCost: 125, totalCost: 43750 },
          { name: 'Đường bột Biên Hòa', unit: 'g', quantity: 35, unitCost: 25, totalCost: 875 },
          { name: 'Chiết xuất vani', unit: 'ml', quantity: 3, unitCost: 150, totalCost: 450 },
        ],
      },
      {
        id: 'cream-whip-18',
        sizeName: 'Size 18cm',
        diameterCm: 18,
        baseCost: 63000,
        bomIngredients: [
          { name: 'Whipping Cream Anchor 35.5%', unit: 'ml', quantity: 480, unitCost: 125, totalCost: 60000 },
          { name: 'Đường bột Biên Hòa', unit: 'g', quantity: 50, unitCost: 25, totalCost: 1250 },
          { name: 'Chiết xuất vani', unit: 'ml', quantity: 4, unitCost: 150, totalCost: 600 },
        ],
      },
      {
        id: 'cream-whip-20',
        sizeName: 'Size 20cm',
        diameterCm: 20,
        baseCost: 82000,
        bomIngredients: [
          { name: 'Whipping Cream Anchor 35.5%', unit: 'ml', quantity: 620, unitCost: 125, totalCost: 77500 },
          { name: 'Đường bột Biên Hòa', unit: 'g', quantity: 65, unitCost: 25, totalCost: 1625 },
          { name: 'Chiết xuất vani', unit: 'ml', quantity: 5, unitCost: 150, totalCost: 750 },
        ],
      },
    ],
  },
  {
    id: 'cream-butter',
    name: 'Kem Bơ Pháp Truyền Thống (French Buttercream)',
    description: 'Kem đứng form sắc nét, thích hợp tạo hình hoa kem nghệ thuật',
    sizes: [
      {
        id: 'cream-butter-16',
        sizeName: 'Size 16cm',
        diameterCm: 16,
        baseCost: 55000,
        bomIngredients: [
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 280, unitCost: 130, totalCost: 36400 },
          { name: 'Lòng đỏ trứng gà', unit: 'quả', quantity: 3, unitCost: 3500, totalCost: 10500 },
          { name: 'Đường cát trắng làm siro', unit: 'g', quantity: 90, unitCost: 20, totalCost: 1800 },
          { name: 'Sữa đặc', unit: 'g', quantity: 40, unitCost: 50, totalCost: 2000 },
        ],
      },
      {
        id: 'cream-butter-18',
        sizeName: 'Size 18cm',
        diameterCm: 18,
        baseCost: 72000,
        bomIngredients: [
          { name: 'Bơ lạt Anchor', unit: 'g', quantity: 380, unitCost: 130, totalCost: 49400 },
          { name: 'Lòng đỏ trứng gà', unit: 'quả', quantity: 4, unitCost: 3500, totalCost: 14000 },
          { name: 'Đường cát trắng làm siro', unit: 'g', quantity: 120, unitCost: 20, totalCost: 2400 },
          { name: 'Sữa đặc', unit: 'g', quantity: 60, unitCost: 50, totalCost: 3000 },
        ],
      },
    ],
  },
  {
    id: 'cream-cheese',
    name: 'Kem Phô Mai Mascarpone / Cream Cheese',
    description: 'Vị chua béo thanh thoát, phong cách bánh Âu sang trọng',
    sizes: [
      {
        id: 'cream-cheese-16',
        sizeName: 'Size 16cm',
        diameterCm: 16,
        baseCost: 58000,
        bomIngredients: [
          { name: 'Cream Cheese Elle & Vire', unit: 'g', quantity: 200, unitCost: 180, totalCost: 36000 },
          { name: 'Whipping Cream Anchor', unit: 'ml', quantity: 160, unitCost: 125, totalCost: 20000 },
          { name: 'Đường bột', unit: 'g', quantity: 40, unitCost: 25, totalCost: 1000 },
        ],
      },
      {
        id: 'cream-cheese-18',
        sizeName: 'Size 18cm',
        diameterCm: 18,
        baseCost: 78000,
        bomIngredients: [
          { name: 'Cream Cheese Elle & Vire', unit: 'g', quantity: 280, unitCost: 180, totalCost: 50400 },
          { name: 'Whipping Cream Anchor', unit: 'ml', quantity: 210, unitCost: 125, totalCost: 26250 },
          { name: 'Đường bột', unit: 'g', quantity: 55, unitCost: 25, totalCost: 1375 },
        ],
      },
    ],
  },
];

export const DEFAULT_CAKE_FILLINGS: CakeFillingModel[] = [
  { id: 'fill-strawberry', name: 'Mứt dâu tây tươi nấu thủ công', costPrice: 15000, extraPrice: 20000, isDefault: true },
  { id: 'fill-blueberry', name: 'Mứt việt quất nhập khẩu nguyên trái', costPrice: 20000, extraPrice: 30000 },
  { id: 'fill-mango', name: 'Nhân xoài chanh leo nhiệt đới', costPrice: 14000, extraPrice: 20000 },
  { id: 'fill-egg-cheese', name: 'Sốt Phô Mai Trứng Muối Hoàng Kim', costPrice: 25000, extraPrice: 35000 },
  { id: 'fill-durian', name: 'Cơm sầu riêng Ri6 tươi nguyên chất', costPrice: 35000, extraPrice: 50000 },
  { id: 'fill-chocolate-ganache', name: 'Sốt Socola Ganache 65%', costPrice: 18000, extraPrice: 25000 },
  { id: 'fill-none', name: 'Không nhân (Cốt bánh & kem nguyên bản)', costPrice: 0, extraPrice: 0 },
];

export const DEFAULT_PACKAGING_BOXES: PackagingBoxModel[] = [
  { id: 'pkg-mica-16', name: 'Hộp Mica Trong Suốt Quý Tộc 16cm', costPrice: 18000, sellingPrice: 25000 },
  { id: 'pkg-mica-18', name: 'Hộp Mica Trong Suốt Quý Tộc 18cm', costPrice: 22000, sellingPrice: 30000, isDefault: true },
  { id: 'pkg-mica-20', name: 'Hộp Mica Trong Suốt Quý Tộc 20cm', costPrice: 26000, sellingPrice: 35000 },
  { id: 'pkg-paper-window', name: 'Hộp Giấy Cửa Sổ Kính Tiêu Chuẩn', costPrice: 9000, sellingPrice: 0 },
  { id: 'pkg-kraft-vintage', name: 'Hộp Giấy Kraft Vintage Bảo Vệ MT', costPrice: 12000, sellingPrice: 15000 },
];

export const DEFAULT_FREE_ACCESSORIES: FreeAccessoryModel[] = [
  { id: 'acc-hat', name: 'Mũ sinh nhật vương miện ánh kim', costPrice: 3500, isDefaultIncluded: true, quantityDefault: 1 },
  { id: 'acc-candle-num', name: 'Nến xoắn nghệ thuật / Nến số tuổi', costPrice: 4000, isDefaultIncluded: true, quantityDefault: 1 },
  { id: 'acc-knife', name: 'Dao cắt bánh sinh nhật răng cưa', costPrice: 2000, isDefaultIncluded: true, quantityDefault: 1 },
  { id: 'acc-plates', name: 'Bộ đĩa & dĩa ăn bánh cao cấp (10 bộ)', costPrice: 5000, isDefaultIncluded: true, quantityDefault: 1 },
  { id: 'acc-sparkler', name: 'Cây pháo bông mini an toàn', costPrice: 3000, isDefaultIncluded: false, quantityDefault: 1 },
];

export const DEFAULT_DECOR_ADDONS: CakeDecorAddonModel[] = [
  { id: 'dec-crown', name: 'Vương miện ngọc trai pha lê gắn bánh', category: 'toy', costPrice: 25000, sellingPrice: 45000, icon: '👑' },
  { id: 'dec-led', name: 'Dây đèn LED fairy nhấp nháy phát sáng', category: 'light', costPrice: 8000, sellingPrice: 20000, icon: '✨' },
  { id: 'dec-topper-hbd', name: 'Topper Mica vàng tráng gương Happy Birthday', category: 'decor', costPrice: 6000, sellingPrice: 15000, icon: '🎉' },
  { id: 'dec-fresh-fruit', name: 'Decor Dâu tây & Nho mẫu đơn phủ mặt', category: 'fruit', costPrice: 30000, sellingPrice: 50000, icon: '🍓' },
  { id: 'dec-chocolate-balls', name: 'Set 6 quả cầu socola vàng kim', category: 'decor', costPrice: 12000, sellingPrice: 25000, icon: '🍫' },
];

export const DEFAULT_BIRTHDAY_BOM_PRESETS: BirthdayCakeBomPreset[] = [
  {
    id: 'bom-preset-18-standard',
    name: 'BOM Bánh Sinh Nhật Whipping Vani 18cm (Tiêu Chuẩn Tiệm)',
    cakeBaseId: 'base-vani',
    cakeBaseSizeId: 'base-vani-18',
    creamCoatingId: 'cream-whipping',
    creamCoatingSizeId: 'cream-whip-18',
    fillingId: 'fill-strawberry',
    packagingId: 'pkg-mica-18',
    freeAccessoryIds: ['acc-hat', 'acc-candle-num', 'acc-knife', 'acc-plates'],
    decorAddonIds: ['dec-topper-hbd'],
    targetFoodCostPct: 36.5,
    suggestedSellingPrice: 400000,
    notes: 'Mẫu bánh sinh nhật phổ biến nhất, bán chạy quanh năm',
  },
  {
    id: 'bom-preset-16-choco',
    name: 'BOM Bánh Sinh Nhật Socola Ganache 16cm',
    cakeBaseId: 'base-socola',
    cakeBaseSizeId: 'base-socola-16',
    creamCoatingId: 'cream-whipping',
    creamCoatingSizeId: 'cream-whip-16',
    fillingId: 'fill-chocolate-ganache',
    packagingId: 'pkg-mica-16',
    freeAccessoryIds: ['acc-hat', 'acc-candle-num', 'acc-knife', 'acc-plates'],
    decorAddonIds: ['dec-topper-hbd', 'dec-chocolate-balls'],
    targetFoodCostPct: 36.5,
    suggestedSellingPrice: 350000,
    notes: 'Bánh socola đậm đà cho giới trẻ và cặp đôi',
  },
];

export const INITIAL_FULL_CAKE_BOM_CONFIG: FullCakeBomConfig = {
  version: '2026.1',
  targetFoodCostPct: 36.5, // Mốc mặc định ban đầu theo phản hồi của User
  cakeBases: DEFAULT_CAKE_BASES,
  creamCoatings: DEFAULT_CREAM_COATINGS,
  fillings: DEFAULT_CAKE_FILLINGS,
  packagings: DEFAULT_PACKAGING_BOXES,
  freeAccessories: DEFAULT_FREE_ACCESSORIES,
  decorAddons: DEFAULT_DECOR_ADDONS,
  birthdayBomPresets: DEFAULT_BIRTHDAY_BOM_PRESETS,
};
