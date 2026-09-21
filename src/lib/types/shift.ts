// src/lib/types/shift.ts
// Định nghĩa kiểu dữ liệu cho Quản lý Ca Bán Hàng & Lịch Sử Giao Ca

export interface ShiftState {
  id?: string; // Mã định danh duy nhất của ca (UUID hoặc SHIFT-...)
  shiftCode?: string; // Mã hiển thị đẹp: ví dụ "CA-260919-01"
  isOpen: boolean;
  openedAt: string;
  openingCash: number; // Tiền vốn đầu ca (tiền lẻ mở két)
  cashSales: number; // Tổng doanh thu bán tiền mặt trong ca
  transferSales: number; // Tổng doanh thu chuyển khoản/ví điện tử trong ca
  orderCount: number; // Tổng số đơn hàng bán trong ca
  openedBy?: string; // Tên nhân viên/thu ngân mở ca
  notes?: string;
}

export type ShiftStatus = 'balanced' | 'surplus' | 'shortage';

export interface ShiftRecord {
  id: string; // ID ca đã chốt
  shiftCode: string; // Ví dụ: "CA-260919-01"
  staffId?: string;
  staffName: string; // Tên thu ngân bàn giao ca
  storeId?: string;
  startedAt: string; // Thời gian bắt đầu ca
  endedAt: string; // Thời gian kết thúc / bàn giao ca
  openingCash: number; // Tiền vốn đầu ca
  cashSales: number; // Doanh thu tiền mặt
  transferSales: number; // Doanh thu chuyển khoản/momo
  totalRevenue: number; // Tổng doanh thu cả ca (tiền mặt + CK)
  orderCount: number; // Số lượng đơn hàng bán
  expectedCash: number; // Tiền mặt lý thuyết trong két = openingCash + cashSales
  closingCash: number; // Tiền mặt thực tế thu ngân đếm được
  difference: number; // Chênh lệch quỹ = closingCash - expectedCash (0: Khớp, >0: Thừa, <0: Thiếu)
  status: ShiftStatus; // Trạng thái cân quỹ
  notes?: string; // Ghi chú giải trình hoặc bàn giao
  transferredToNextShift?: number; // Số tiền để lại làm vốn cho ca tiếp theo
  handedOverTo?: string; // Người tiếp nhận ca (nếu có)
  createdAt: string;
}
