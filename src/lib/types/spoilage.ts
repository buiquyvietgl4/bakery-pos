export interface SpoilageLog {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  baseCost: number; // Giá vốn đơn vị
  sellingPrice: number; // Giá bán đơn vị
  totalCostLoss: number; // Tổng thiệt hại giá vốn = quantity * baseCost
  totalRevenueLoss: number; // Tổng doanh thu mất = quantity * sellingPrice
  reason: string; // Lý do báo hủy
  notes?: string;
  loggedAt: string; // ISO string
  loggedBy: string; // Thu ngân hoặc thợ bếp
}

export const SPOILAGE_REASONS = [
  'Hết hạn trong ngày (Quá date)',
  'Bị móp méo / Rơi vỡ / Lỗi hình thức',
  'Lỗi mẻ nướng (Cháy khét, khô, xẹp)',
  'Hỏng kem / Chua / Chảy nước',
  'Bánh cắt dùng thử / Mời khách (Sampling)',
  'Khác (Ghi chú chi tiết)',
] as const;
