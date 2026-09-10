export interface StockAdjustmentLog {
  id: string;
  productId: string;
  productName: string;
  productCategory?: string;
  oldQuantity: number;
  newQuantity: number;
  deltaQuantity: number; // e.g. +5 or -2
  reason: string;
  notes?: string;
  adjustedAt: string; // ISO 8601 string
  adjustedBy?: string; // Tên nhân viên / Quản lý
}

export const COMMON_STOCK_ADJUSTMENT_REASONS = [
  'Nhập thêm mẻ mới từ lò bếp',
  'Kiểm kê định kỳ đầu ca / cuối ca',
  'Bánh hỏng / Móp méo / Rơi vỡ / Hết hạn',
  'Bán ngoài quầy / Xuất cho sự kiện',
  'Bù sai lệch số liệu ca trước',
  'Lý do khác (ghi chú)...',
] as const;
