// src/lib/types/materialTransaction.ts
// Định nghĩa kiểu dữ liệu cho Lịch sử Xuất - Nhập - Điều chỉnh Nguyên vật liệu / Vật tư

export type MaterialTransactionType = 'import' | 'export' | 'loss' | 'adjustment';

export interface MaterialTransaction {
  id: string;
  type: MaterialTransactionType;
  materialId: string;
  materialName: string;
  materialCategory?: string;
  unit: string; // Đơn vị gốc trong kho (g, ml, quả, cái, v.v.)
  
  // Dữ liệu quy đổi đơn vị đóng gói khi mua (ví dụ: Túi 1kg, Bao 25kg, Thùng 12)
  packageQty?: number; // Số lượng theo đơn vị đóng gói (ví dụ: 5)
  packageUnit?: string; // Tên đơn vị đóng gói (ví dụ: 'Túi 1kg', 'Bao 25kg')
  conversionRate?: number; // Hệ số quy đổi (ví dụ: 1000)
  
  quantity: number; // Số lượng thực tế nhập/xuất theo đơn vị gốc kho (ví dụ: +5000g hoặc -500g)
  unitPrice: number; // Đơn giá theo đơn vị gốc kho (VND)
  packageUnitPrice?: number; // Đơn giá theo đơn vị mua/gói (VND)
  totalAmount: number; // Tổng giá trị phiếu (VND)
  
  supplierOrReason: string; // Tên nhà cung cấp (khi nhập) hoặc Lý do (khi xuất/hỏng)
  performedBy?: string; // Người thực hiện (Quản lý kho / Thu ngân / Admin)
  date: string; // YYYY-MM-DD
  createdAt: string; // ISO 8601 string
  notes?: string;
}

export const COMMON_MATERIAL_EXPORT_REASONS = [
  'Lỗi mẻ nướng / Hỏng nguyên liệu',
  'Hết hạn sử dụng (Expire)',
  'Kiểm kê kho điều chỉnh thiếu',
  'Dùng làm bánh mẫu thử (Testing)',
  'Xuất chuyển cho chi nhánh khác',
  'Xuất hủy do ẩm mốc / hư hỏng',
] as const;

export const UNIT_CONVERSION_PRESETS: {
  label: string;
  multiplier: number;
  applicableUnits: string[]; // Các đơn vị gốc có thể áp dụng (vd: 'g', 'ml', 'all')
}[] = [
  { label: 'Đơn vị kho (Gốc)', multiplier: 1, applicableUnits: ['all'] },
  { label: 'Túi 1kg (1.000g)', multiplier: 1000, applicableUnits: ['g', 'gram'] },
  { label: 'Túi 500g', multiplier: 500, applicableUnits: ['g', 'gram'] },
  { label: 'Bao 25kg (25.000g)', multiplier: 25000, applicableUnits: ['g', 'gram', 'kg'] },
  { label: 'Bao 50kg (50.000g)', multiplier: 50000, applicableUnits: ['g', 'gram', 'kg'] },
  { label: 'Kg (1.000g)', multiplier: 1000, applicableUnits: ['g', 'gram'] },
  { label: 'Lít (1.000ml)', multiplier: 1000, applicableUnits: ['ml', 'lít', 'lit'] },
  { label: 'Can 5L (5.000ml)', multiplier: 5000, applicableUnits: ['ml', 'lít', 'lit'] },
  { label: 'Thùng 12 hộp / lon', multiplier: 12, applicableUnits: ['hộp', 'lon', 'chai', 'cái', 'gói', 'all'] },
  { label: 'Thùng 24 hộp / lon', multiplier: 24, applicableUnits: ['hộp', 'lon', 'chai', 'cái', 'gói', 'all'] },
  { label: 'Khay 30 quả (Trứng)', multiplier: 30, applicableUnits: ['quả', 'trái', 'all'] },
  { label: 'Tùy chỉnh khác...', multiplier: 0, applicableUnits: ['all'] },
];
