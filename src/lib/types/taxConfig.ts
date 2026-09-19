/**
 * Tax & Accounting Configuration Types
 * Theo Thông tư 88/2021/TT-BTC, Thông tư 152/2025/TT-BTC và Thông tư 40/2021/TT-BTC
 */

export type TaxDeclarationFormType = '01/CNKD' | '01/TKN-CNKD';

export interface HouseholdBusinessInfo {
  shop_name: string;
  tax_code: string;
  business_address: string;
  owner_name: string;
  phone: string;
  tax_office_name?: string;         // Cơ quan thuế quản lý (VD: Chi cục Thuế Quận 1)
  registered_revenue_level: number; // 1: <= 1 Tỷ (Mẫu 01/TKN-CNKD - Miễn thuế), 2: > 1 Tỷ (Mẫu 01/CNKD - Kê khai), 3: 3B-50B, 4: >50B
  pit_calculation_method: number;   // 1: % Doanh thu, 2: 15% Thu nhập ròng
  regular_employees_count: number;  // Số lao động thường xuyên [13]
  operating_hours: string;          // Thời gian hoạt động trong ngày (VD: 06:00 - 22:00)
  preferred_declaration_form?: TaxDeclarationFormType; // Mẫu ưu tiên lựa chọn
  // Các trường hành chính chuẩn Thông tư 40/2021 & mẫu CQT:
  email?: string;                   // [11] Thư điện tử
  business_area?: number;           // [12] Diện tích địa điểm kinh doanh (m2)
  bank_account_number?: string;     // [14] Số tài khoản ngân hàng kinh doanh
  bank_name?: string;               // [14] Tên ngân hàng mở tài khoản
  district?: string;                // [08] Quận/Huyện
  province?: string;                // [09] Tỉnh/Thành phố
  software_name?: string;           // [15] Tên phần mềm bán hàng kết nối CQT
}

/**
 * Cấu hình chính sách và biểu mẫu thuế động
 * Cho phép cập nhật linh hoạt khi Nhà nước / Bộ Tài chính thay đổi luật, thông tư, biểu mẫu
 */
export interface TaxPolicyConfig {
  id: string;                       // vd: 'POLICY_2026_ND141', 'POLICY_TT40', 'CUSTOM'
  name: string;                     // Tên chính sách hiển thị
  version?: string;                 // Phiên bản chính sách (vd: '2026.1', '2021.1')
  policy_name?: string;             // Bí danh tên chính sách
  effective_date: string;           // Ngày áp dụng (YYYY-MM-DD hoặc DD/MM/YYYY)
  annual_threshold: number;         // Ngưỡng doanh thu miễn thuế (mặc định 1.000.000.000 đ)
  is_active: boolean;
  notes?: string;                   // Ghi chú căn cứ pháp lý
  circular_citation?: string;       // Viện dẫn tổng quát văn bản pháp lý
  
  // Viện dẫn căn cứ pháp lý hiển thị trên đầu các biểu mẫu xuất ra
  circular_01_tkn_ref: string;      // Tiêu ngữ Mẫu 01/TKN-CNKD (NĐ 141/2026 & TT 50/2026)
  circular_01_cnkd_ref: string;     // Tiêu ngữ Mẫu 01/CNKD (TT 40/2021 & NĐ 68/2026, NĐ 141/2026)
  circular_01_2_bkhdkd_ref: string; // Tiêu ngữ Phụ lục 01-2/BK-HĐKD (TT 40/2021)
  circular_books_ref: string;       // Tiêu ngữ 7 Sổ kế toán (TT 88/2021 & TT 152/2025)

  // Danh mục nhóm ngành nghề tính thuế và tỷ lệ % thuế (có thể sửa đổi)
  tax_groups: TaxBusinessGroup[];

  // 7 Chỉ tiêu chi phí quản lý kinh doanh (Phần II Phụ lục 01-2/BK-HĐKD)
  cost_indicators: {
    code: string;                   // '[24]', '[25]', ...
    label: string;                  // 'Chi phí nhân công', ...
    keywords: string[];             // từ khóa tự động gom chi phí từ expenses
  }[];
}

export interface BkHdkdExpenseItemRow {
  indicator_code: string;
  name: string;
  amount: number;
  note: string;
}

/**
 * Dòng Nhập - Xuất - Tồn Kho (Phần I - Phụ lục 01-2/BK-HĐKD)
 */
export interface BkHdkdInventoryRow {
  stt: number;
  item_code: string;
  item_name: string;
  unit: string;
  opening_qty: number;
  opening_amount: number;
  in_qty: number;
  in_amount: number;
  out_qty: number;
  out_amount: number;
  closing_qty: number;
  closing_amount: number;
}

/**
 * Tổng hợp Chi phí Quản lý Kinh doanh (Phần II - Phụ lục 01-2/BK-HĐKD)
 */
export interface BkHdkdExpenseSummary {
  labor_24: number;          // [24] Chi phí nhân công
  electricity_25: number;    // [25] Chi phí điện
  water_26: number;          // [26] Chi phí nước
  telecom_27: number;        // [27] Chi phí viễn thông
  rent_28: number;           // [28] Chi phí thuê kho bãi, mặt bằng kinh doanh
  management_29: number;     // [29] Chi phí quản lý
  other_30: number;          // [30] Chi phí khác
  total_cost: number;        // Tổng chi phí quản lý trong kỳ = [24] + ... + [30]
  items_detail: Array<{
    code: string;
    label: string;
    amount: number;
    description: string;
  }>;
}

export interface TaxRevenueThresholdAnalysis {
  annual_threshold: number;         // 1,000,000,000 VNĐ
  current_year_revenue: number;     // Doanh thu thực tế tích lũy trong năm
  is_under_threshold: boolean;      // true nếu <= 1 tỷ
  recommended_form: TaxDeclarationFormType; // '01/TKN-CNKD' hoặc '01/CNKD'
  tax_exemption_status: boolean;    // true nếu miễn thuế
  percent_of_threshold: number;     // Tỷ lệ % so với ngưỡng 1 tỷ
  remaining_until_threshold: number;// Số tiền còn lại trước khi chạm ngưỡng 1 tỷ
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

export interface S2eRowItem {
  id: string;
  voucher_no: string;          // Ký hiệu chứng từ: PT-0001 (Phiếu Thu) / PC-0001 (Phiếu Chi)
  raw_date: string;            // YYYY-MM-DD
  voucher_date: string;        // Ngày tháng chứng từ (DD/MM/YYYY)
  description: string;         // Diễn giải nội dung thu / chi
  fund_type: string;           // Quỹ tiền mặt (111) / Ngân hàng VietQR (112)
  source: 'cash' | 'bank';     // Tiền mặt hoặc Ngân hàng
  type: 'income' | 'expense';  // Thu hoặc Chi
  income: number;              // Số tiền Thu (VNĐ)
  expense: number;             // Số tiền Chi (VNĐ)
  balance: number;             // Số dư Tồn quỹ (VNĐ)
}
