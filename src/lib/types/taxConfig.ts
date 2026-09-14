/**
 * Tax & Accounting Configuration Types
 * Theo Thông tư 88/2021/TT-BTC, Thông tư 152/2025/TT-BTC và Thông tư 40/2021/TT-BTC
 */

export interface HouseholdBusinessInfo {
  shop_name: string;
  tax_code: string;
  business_address: string;
  owner_name: string;
  phone: string;
  registered_revenue_level: number; // 1: <500M, 2: 500M-3B, 3: 3B-50B, 4: >50B
  pit_calculation_method: number;   // 1: % Doanh thu, 2: 15% Thu nhập ròng
  regular_employees_count: number;  // Số lao động thường xuyên
  operating_hours: string;          // Thời gian hoạt động trong ngày (VD: 06:00 - 22:00)
}

export interface TaxBusinessGroup {
  id: number;
  code: string;
  name: string;
  vat_percent: number;
  pit_percent: number;
  total_tax_percent: number;
  description: string;
  example: string;
}

export const TAX_BUSINESS_GROUPS: TaxBusinessGroup[] = [
  {
    id: 1,
    code: 'GROUP_1_GOODS',
    name: 'Phân phối, cung cấp hàng hóa',
    vat_percent: 1.0,
    pit_percent: 0.5,
    total_tax_percent: 1.5,
    description: 'Bán lẻ hàng hóa mua vào bán ra nguyên trạng',
    example: 'Nến sinh nhật, mũ tiệc, pháo bông, đồ chơi trang trí, bánh đóng gói sẵn của hãng khác'
  },
  {
    id: 2,
    code: 'GROUP_2_SERVICES',
    name: 'Dịch vụ, xây dựng không bao thầu nguyên vật liệu',
    vat_percent: 5.0,
    pit_percent: 2.0,
    total_tax_percent: 7.0,
    description: 'Cung cấp dịch vụ thuần túy',
    example: 'Dịch vụ giao hàng tận nơi tính phí riêng, dịch vụ setup bàn tiệc sinh nhật'
  },
  {
    id: 3,
    code: 'GROUP_3_MANUFACTURING',
    name: 'Sản xuất, vận tải, dịch vụ có gắn với hàng hóa, xây dựng có bao thầu nguyên vật liệu',
    vat_percent: 3.0,
    pit_percent: 1.5,
    total_tax_percent: 4.5,
    description: 'Chế biến, làm bánh tại xưởng/tiệm và kinh doanh ăn uống',
    example: 'Bánh kem sinh nhật, bánh mì, bánh ngọt tự làm, đồ uống pha chế tại quầy'
  },
  {
    id: 4,
    code: 'GROUP_4_OTHERS',
    name: 'Hoạt động kinh doanh khác',
    vat_percent: 2.0,
    pit_percent: 1.0,
    total_tax_percent: 3.0,
    description: 'Các hoạt động thương mại dịch vụ khác',
    example: 'Doanh thu cho thuê tủ bánh, trưng bày banner quảng cáo'
  },
  {
    id: 5,
    code: 'GROUP_5_NON_VAT',
    name: 'Phân phối, cung cấp hàng hóa (không chịu thuế GTGT)',
    vat_percent: 0.0,
    pit_percent: 0.5,
    total_tax_percent: 0.5,
    description: 'Hàng hóa nông sản sơ chế chưa chế biến thuộc diện không chịu thuế GTGT',
    example: 'Trái cây tươi chưa qua chế biến'
  }
];

export interface S2aRowItem {
  id: string;
  voucher_no: string;          // Ký hiệu chứng từ (Mã đơn hàng / Số HĐ)
  voucher_date: string;        // Ngày tháng chứng từ (DD/MM/YYYY)
  raw_date: string;            // YYYY-MM-DD
  description: string;         // Diễn giải hàng hóa dịch vụ
  group_id: number;            // 1, 2, 3, 4, 5
  group_name: string;
  revenue: number;             // Số tiền doanh thu
  vat_amount: number;          // Tiền thuế GTGT
  pit_amount: number;          // Tiền thuế TNCN
  payment_method?: string;     // cash / vietqr / transfer
}

export interface S2aSummaryByGroup {
  group_id: number;
  group_name: string;
  vat_percent: number;
  pit_percent: number;
  total_revenue: number;
  total_vat: number;
  total_pit: number;
  total_tax: number;
  count: number;
}
