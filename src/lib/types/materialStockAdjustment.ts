// src/lib/types/materialStockAdjustment.ts
// Định nghĩa kiểu dữ liệu cho Lịch Sử Sửa Đổi / Kiểm Kê Tồn Kho Nguyên Vật Liệu

export interface MaterialStockAdjustmentLog {
  id: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  oldQuantity: number;
  newQuantity: number;
  deltaQuantity: number; // e.g. +500 or -200
  avgCost: number;       // Đơn giá vốn tại thời điểm sửa (VND/đơn vị)
  totalValueChange: number; // deltaQuantity * avgCost (VND)
  reason: string;
  notes?: string;
  adjustedAt: string;    // ISO 8601 string
  adjustedBy?: string;   // Tên nhân viên / Quản lý
}

export const COMMON_MATERIAL_ADJUSTMENT_REASONS = [
  'Kiểm kê thực tế định kỳ',
  'Hao hụt tự nhiên / Rơi vãi',
  'Nguyên liệu hỏng / Ẩm mốc / Hết hạn',
  'Bù sai lệch số liệu nhập trước',
  'Đổi quy cách đóng gói / Cân lại',
  'Lý do khác (ghi chú)...',
] as const;
