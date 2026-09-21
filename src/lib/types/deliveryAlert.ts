// src/lib/types/deliveryAlert.ts
// Cấu hình thời gian cảnh báo giờ giao cho Bếp KDS và Quầy POS

export interface DeliveryAlertConfig {
  /**
   * Thời gian báo Bếp làm bánh trước giờ giao (đơn vị: phút).
   * Mặc định: 60 phút.
   * Điều kiện: Đơn chưa hoàn thành chuyển sang Cột 3 (Sẵn Sàng Giao).
   */
  kitchenLeadMinutes: number;

  /**
   * Thời gian báo Quầy POS / Thu Ngân chuẩn bị giao đồ / ship (đơn vị: phút).
   * Mặc định: 30 phút.
   * Điều kiện: Đơn có giờ hẹn giao và chưa hoàn tất giao khách.
   */
  shippingLeadMinutes: number;

  /**
   * Bật/tắt âm thanh cảnh báo Bếp làm bánh gấp
   */
  enableKitchenSound: boolean;

  /**
   * Bật/tắt âm thanh cảnh báo Quầy chuẩn bị giao đồ
   */
  enableShippingSound: boolean;

  /**
   * Bật/tắt cảnh báo Bếp làm bánh gấp
   */
  kitchenAlertEnabled?: boolean;

  /**
   * Bật/tắt cảnh báo Quầy chuẩn bị giao đồ
   */
  shippingAlertEnabled?: boolean;

  /**
   * Thời gian cập nhật cấu hình lần cuối
   */
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_DELIVERY_ALERT_CONFIG: DeliveryAlertConfig = {
  kitchenLeadMinutes: 60,
  shippingLeadMinutes: 30,
  enableKitchenSound: true,
  enableShippingSound: true,
  kitchenAlertEnabled: true,
  shippingAlertEnabled: true,
};
