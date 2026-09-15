// src/lib/types/bakery-bom.ts
// Định nghĩa cấu trúc dữ liệu chuẩn cho "Cơ Chế Đặt Bánh Mới" theo flowchart Excel

export interface CakeBomItem {
  id?: string;
  ingredientId?: string; // ID liên kết kho nguyên liệu
  name: string; // Tên nguyên liệu (Bột mì, Trứng, Bơ, Sữa, Kem...)
  unit: string; // g, ml, quả, gói, hộp...
  quantity: number; // Định mức
  unitCost: number; // Đơn giá vốn (VND / đơn vị)
  totalCost: number; // Thành tiền = quantity * unitCost
  notes?: string;
}

// 1. CỐT BÁNH: Loại cốt bánh -> Size bánh (Mỗi size có nút cài BOM riêng & bảng tính cost)
export interface CakeBaseSizeConfig {
  id: string;
  sizeName: string; // "Size 14cm", "Size 16cm", "Size 18cm"...
  diameterCm: number;
  servings?: string; // "2 - 4 người"
  bomIngredients: CakeBomItem[]; // Công thức định mức BOM nguyên vật liệu của size này
  baseCost: number; // Tổng chi phí vốn cốt bánh = SUM(quantity * unitCost)
}

export interface CakeBaseModel {
  id: string;
  name: string; // "Cốt Vani truyền thống", "Cốt Socola đậm vị", "Cốt Matcha Nhật"...
  description?: string;
  sizes: CakeBaseSizeConfig[]; // Danh sách size cốt bánh kèm BOM riêng
  isDefault?: boolean;
}

// 2. KEM PHỦ BÁNH: Loại kem phủ -> Size bánh (Mỗi size kem phủ có nút cài BOM riêng & bảng tính cost)
export interface CreamCoatingSizeConfig {
  id: string;
  sizeName: string; // "Size 14cm", "Size 16cm"...
  diameterCm: number;
  bomIngredients: CakeBomItem[]; // Công thức định mức BOM nguyên vật liệu kem phủ của size này
  baseCost: number; // Tổng chi phí vốn kem phủ = SUM(quantity * unitCost)
}

export interface CreamCoatingModel {
  id: string;
  name: string; // "Kem Whipping Anchor", "Kem Bơ Pháp", "Kem Topping Richs", "Kem Phô Mai Mascarpone"...
  description?: string;
  sizes: CreamCoatingSizeConfig[]; // Danh sách size kem phủ kèm BOM riêng
  isDefault?: boolean;
}

// 3. NHÂN BÁNH: Loại nhân bánh (có mục nhập giá cost)
export interface CakeFillingModel {
  id: string;
  name: string; // "Nhân dâu tây tươi", "Nhân xoài chanh leo", "Nhân sốt phô mai hoàng kim", "Nhân sầu riêng tươi"...
  costPrice: number; // Giá cost nguyên liệu nhập vào
  extraPrice: number; // Phụ thu bán khi khách chọn thêm
  isDefault?: boolean;
  ingredientId?: string; // Tùy chọn liên kết kho
}

// 4. HỘP VÀ BAO BÌ: Nhập trực tiếp từ kho vật tư, giá cost là giá nhập vào
export interface PackagingBoxModel {
  id: string;
  name: string; // "Hộp Mica trong suốt cao cấp 18cm", "Hộp Giấy Kraft vintage", "Hộp Quà Thắt Nơ"...
  ingredientId?: string; // ID liên kết kho vật tư tiệm
  costPrice: number; // Giá cost (lấy từ giá nhập kho)
  sellingPrice: number; // Giá bán / phụ thu
  isDefault?: boolean;
}

// 5. VẬT TƯ TẶNG KÈM: Nhập trực tiếp từ kho vật tư, giá cost là giá nhập vào
export interface FreeAccessoryModel {
  id: string;
  name: string; // "Mũ sinh nhật vương miện", "Nến số tuổi", "Bộ đĩa dĩa (10 cái)", "Dao cắt bánh sinh nhật"...
  ingredientId?: string; // ID liên kết kho vật tư
  costPrice: number; // Giá cost nhập kho
  isDefaultIncluded: boolean; // Mặc định có trong bánh sinh nhật
  quantityDefault: number; // Số lượng tặng kèm mặc định (VD: 1 dao, 5 đĩa...)
}

// 6. PHỤ KIỆN VÀ DECOR: Giữ nguyên như hiện tại
export interface CakeDecorAddonModel {
  id: string;
  name: string;
  category: 'decor' | 'fruit' | 'toy' | 'flower' | 'candle' | 'light' | 'accessory' | 'other';
  costPrice: number;
  sellingPrice: number;
  icon?: string;
}

// 7. BOM BÁNH SINH NHẬT: Tạo BOM tổng hợp từ các vật tư có trong mục định mức đặt bánh
export interface BirthdayCakeBomPreset {
  id: string;
  name: string; // Tên mẫu BOM chuẩn: "BOM Bánh Sinh Nhật Kem Bơ 18cm Chuẩn", "BOM Bánh Dâu Tây Quý Tộc 16cm"...
  cakeBaseId: string; // ID Cốt bánh
  cakeBaseSizeId: string; // ID Size cốt bánh
  creamCoatingId: string; // ID Kem phủ
  creamCoatingSizeId: string; // ID Size kem phủ
  fillingId?: string; // ID Nhân bánh
  packagingId?: string; // ID Hộp bao bì
  freeAccessoryIds: string[]; // Danh sách vật tư tặng kèm mặc định
  decorAddonIds?: string[]; // Danh sách phụ kiện decor mặc định
  targetFoodCostPct?: number; // Tỷ lệ biên lợi nhuận mong muốn (mặc định 36.5%)
  suggestedSellingPrice?: number; // Giá bán gợi ý tự động
  notes?: string;
}

// Cấu hình tổng hợp lưu trong CSDL / localStorage
export interface FullCakeBomConfig {
  version: string;
  targetFoodCostPct: number; // Mặc định 36.5% theo yêu cầu
  cakeBases: CakeBaseModel[];
  creamCoatings: CreamCoatingModel[];
  fillings: CakeFillingModel[];
  packagings: PackagingBoxModel[];
  freeAccessories: FreeAccessoryModel[];
  decorAddons: CakeDecorAddonModel[];
  birthdayBomPresets: BirthdayCakeBomPreset[];
}

// Cấu hình chi tiết cho từng tầng bánh (Bánh 1 tầng, 2 tầng, 3 tầng...)
export interface CakeTierSpec {
  tierIndex: number; // 1: Tầng 1 (Đáy), 2: Tầng 2 (Trên), 3: Tầng 3 (Chóp)...
  tierName: string; // "Tầng 1 (Đáy)", "Tầng 2",...
  sizeId: string;
  sizeName: string; // "Size 22cm"
  diameterCm?: number;
  cakeBase: {
    id: string;
    name: string;
    cost: number;
    bomIngredients?: CakeBomItem[];
  };
  creamCoating: {
    id: string;
    name: string;
    cost: number;
    bomIngredients?: CakeBomItem[];
  };
  filling?: {
    id: string;
    name: string;
    cost: number;
  };
  tierCost: number; // Tổng giá vốn của riêng tầng này
}

// Chi tiết cấu hình bánh sinh nhật đặt trong 1 đơn hàng (KDS hiển thị & nút xem BOM)
export interface CakeOrderSpec {
  isBirthdayCake: boolean;
  bomPresetId?: string;
  tierCount?: number; // Số tầng bánh (1, 2, 3...)
  tiers?: CakeTierSpec[]; // Danh sách cấu hình chi tiết từng tầng bánh
  sizeName: string;
  diameterCm?: number;
  cakeBase: {
    id: string;
    name: string;
    cost: number;
    bomIngredients?: CakeBomItem[];
  };
  creamCoating: {
    id: string;
    name: string;
    cost: number;
    bomIngredients?: CakeBomItem[];
  };
  filling?: {
    id: string;
    name: string;
    cost: number;
  };
  packaging?: {
    id: string;
    name: string;
    cost: number;
  };
  freeAccessories?: {
    id: string;
    name: string;
    quantity: number;
    cost: number;
  }[];
  decorAddons?: {
    id: string;
    name: string;
    price: number;
    cost: number;
  }[];
  cakeMessage?: string; // Chữ viết lên bánh
  decorNotes?: string; // Yêu cầu trang trí
  referenceImageUrl?: string; // Ảnh mẫu
  totalCost: number; // Tổng giá vốn tính tự động
  targetFoodCostPct: number; // Tỷ lệ biên lợi nhuận áp dụng (mặc định 36.5%)
  suggestedPrice: number; // Giá bán gợi ý
  finalPrice: number; // Giá bán chốt cuối cùng
}
