// src/lib/types/bakingHistory.ts
// Định nghĩa kiểu dữ liệu cho Lịch Sử Làm Bánh (Baking / Production History)
// Ghi nhận số lượng bánh sản xuất và tổng lượng nguyên liệu tiêu thụ thực tế

export type CakeCategoryType = 'retail' | 'birthday' | 'custom';

export interface ConsumedIngredientItem {
  ingredientId?: string;
  name: string;
  quantity: number; // Số lượng tiêu thụ thực tế
  unit: string; // Đơn vị tính (g, ml, quả, cái...)
  unitCost?: number; // Đơn giá vốn tại thời điểm làm (VND)
  totalCost?: number; // Tổng chi phí nguyên liệu này (VND)
}

export interface BakingHistoryRecord {
  id: string; // ID duy nhất (uuid hoặc batch-...)
  cakeName: string; // Tên loại bánh sản xuất
  cakeCategory: CakeCategoryType; // 'retail' (Bánh bán lẻ / thường) | 'birthday' (Bánh sinh nhật)
  quantity: number; // Số lượng bánh thành phẩm làm ra
  unit: string; // Đơn vị bánh (cái, chiếc, ổ, hộp...)
  recipeId?: string; // ID công thức nếu làm từ BOM bánh thường
  orderNumber?: string; // Mã đơn hàng nếu làm theo đơn bánh sinh nhật KDS
  batchId?: string; // Mã mẻ nướng lò
  bakeTemp?: number; // Nhiệt độ nướng (°C)
  bakeMinutes?: number; // Thời gian nướng (phút)
  totalCost: number; // Tổng chi phí nguyên liệu tiêu hao của mẻ (VND)
  costPerUnit: number; // Giá vốn nguyên liệu trên 1 thành phẩm (VND)
  ingredients: ConsumedIngredientItem[]; // Danh sách chi tiết từng nguyên liệu đã tiêu hao & trừ kho
  performedBy?: string; // Thợ làm bánh / Bếp trưởng
  createdAt: string; // Thời gian thực hiện (ISO 8601)
  notes?: string; // Ghi chú kỹ thuật
}
