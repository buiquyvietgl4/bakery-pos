// src/lib/types/orderReturn.ts

export type ReturnReason =
  | 'damaged' // Bánh hỏng / móp méo / biến dạng
  | 'expired' // Cận date / hết hạn
  | 'wrong_item' // Nhầm món / nhầm kích cỡ
  | 'customer_changed_mind' // Khách đổi ý
  | 'other'; // Lý do khác

export interface OrderReturnItem {
  id?: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  refund_subtotal: number;
  restocked: boolean; // Có nhập lại kho quầy hay không
  condition: 'intact' | 'damaged'; // intact = còn nguyên vẹn, damaged = hỏng/lỗi
  reason: ReturnReason;
  notes?: string;
}

export type ReturnPaymentMethod = 'cash' | 'transfer' | 'split';

export interface ExchangePaymentDetail {
  method: ReturnPaymentMethod;
  cashAmount?: number;
  transferAmount?: number;
  cashGiven?: number;
  changeAmount?: number;
  transferCode?: string;
}

export interface OrderReturnRecord {
  id: string; // e.g. 'RET-...'
  order_id: string;
  order_number: string;
  return_type: 'refund' | 'exchange'; // 'refund': trả hàng hoàn tiền, 'exchange': đổi sang món khác
  items: OrderReturnItem[];
  refund_amount: number; // Tổng tiền hoàn lại cho khách
  refund_method: ReturnPaymentMethod; // 'cash' | 'transfer' | 'split'
  exchange_replacement_items?: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  exchange_difference?: number; // Số tiền chênh lệch: > 0 khách trả thêm, < 0 hoàn lại khách, = 0 đổi ngang
  exchange_payment_detail?: ExchangePaymentDetail;
  reason_summary: string;
  notes?: string;
  customer_name?: string;
  customer_phone?: string;
  approved_by: string; // Quản lý duyệt
  created_at: string;
}
