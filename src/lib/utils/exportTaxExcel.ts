import { exportMultiSheetExcel, exportToCSV, ExcelSheet } from '@/lib/utils/exportExcel';
import { HouseholdBusinessInfo, S2aRowItem, S2aSummaryByGroup } from '@/lib/types/taxConfig';

/**
 * Xuất Sổ S2a-HKD ra Excel chuẩn Thông tư 88/2021/TT-BTC & Thông tư 152/2025/TT-BTC
 */
export function exportS2aExcel(
  info: HouseholdBusinessInfo,
  periodLabel: string,
  rows: S2aRowItem[],
  summary: S2aSummaryByGroup[],
  totals: { totalRevenue: number; totalVat: number; totalPit: number; totalTax: number }
) {
  // Sheet 1: Chi tiết từng giao dịch
  const detailData = rows.map((r, idx) => ({
    stt: idx + 1,
    voucher_no: r.voucher_no,
    voucher_date: r.voucher_date,
    description: r.description,
    group_name: r.group_name,
    revenue: r.revenue,
    vat_amount: r.vat_amount,
    pit_amount: r.pit_amount,
    total_tax: r.vat_amount + r.pit_amount,
    payment_method: r.payment_method || 'Tiền mặt',
  }));

  // Sheet 2: Tổng hợp nghĩa vụ thuế theo 5 nhóm ngành nghề
  const summaryData = summary.map((s) => ({
    group_name: `${s.group_id}. ${s.group_name}`,
    vat_rate: `${s.vat_percent}%`,
    pit_rate: `${s.pit_percent}%`,
    order_count: s.count,
    revenue: s.total_revenue,
    vat_amount: s.total_vat,
    pit_amount: s.total_pit,
    total_tax: s.total_tax,
  }));

  // Thêm dòng tổng cộng vào sheet tổng hợp
  summaryData.push({
    group_name: 'TỔNG CỘNG NGHĨA VỤ THUẾ TRONG KỲ',
    vat_rate: '-',
    pit_rate: '-',
    order_count: rows.length,
    revenue: totals.totalRevenue,
    vat_amount: totals.totalVat,
    pit_amount: totals.totalPit,
    total_tax: totals.totalTax,
  });

  const sheets: ExcelSheet[] = [
    {
      name: 'So_S2a_Chi_Tiet_Doanh_Thu',
      columns: [
        { header: 'STT', key: 'stt', width: 50, type: 'number' },
        { header: 'Số Hiệu Chứng Từ (HĐ/POS)', key: 'voucher_no', width: 140, type: 'string' },
        { header: 'Ngày Tháng', key: 'voucher_date', width: 100, type: 'string' },
        { header: 'Diễn Giải Hàng Hóa / Dịch Vụ', key: 'description', width: 250, type: 'string' },
        { header: 'Nhóm Ngành Nghề Tính Thuế', key: 'group_name', width: 220, type: 'string' },
        { header: 'Doanh Thu (VNĐ)', key: 'revenue', width: 140, type: 'currency' },
        { header: 'Thuế GTGT (VNĐ)', key: 'vat_amount', width: 120, type: 'currency' },
        { header: 'Thuế TNCN (VNĐ)', key: 'pit_amount', width: 120, type: 'currency' },
        { header: 'Tổng Thuế (VNĐ)', key: 'total_tax', width: 130, type: 'currency' },
        { header: 'Phương Thức TT', key: 'payment_method', width: 120, type: 'string' },
      ],
      data: detailData,
    },
    {
      name: 'Tong_Hop_Thue_Nganh_Nghe',
      columns: [
        { header: 'Nhóm Ngành Nghề Kinh Doanh', key: 'group_name', width: 300, type: 'string' },
        { header: 'Tỷ Lệ GTGT', key: 'vat_rate', width: 90, type: 'string' },
        { header: 'Tỷ Lệ TNCN', key: 'pit_rate', width: 90, type: 'string' },
        { header: 'Số Giao Dịch', key: 'order_count', width: 100, type: 'number' },
        { header: 'Doanh Thu Chịu Thuế (VNĐ)', key: 'revenue', width: 170, type: 'currency' },
        { header: 'Thuế GTGT Phải Nộp (VNĐ)', key: 'vat_amount', width: 160, type: 'currency' },
        { header: 'Thuế TNCN Phải Nộp (VNĐ)', key: 'pit_amount', width: 160, type: 'currency' },
        { header: 'Tổng Thuế Phải Nộp (VNĐ)', key: 'total_tax', width: 170, type: 'currency' },
      ],
      data: summaryData,
    },
  ];

  const filename = `So_Kế_Toán_S2a_HKD_${info.tax_code || 'MST'}_${Date.now()}`;
  exportMultiSheetExcel(filename, sheets);
}

/**
 * Xuất Toàn Bộ 7 Sổ Kế Toán Hộ Kinh Doanh ra file Excel đa Sheet
 */
export function exportFullTaxBooksExcel(
  info: HouseholdBusinessInfo,
  periodLabel: string,
  orders: any[],
  expenses: any[],
  ingredients: any[],
  cashflow: any[],
  s2aData: {
    rows: S2aRowItem[];
    summary: S2aSummaryByGroup[];
    totalRevenue?: number;
    totalVat?: number;
    totalPit?: number;
    totalTax?: number;
    totals?: any;
  }
) {
  const sheets: ExcelSheet[] = [];

  // Sheet 1: S2a-HKD Doanh thu
  sheets.push({
    name: 'S2a_Doanh_Thu_Ban_Hang',
    columns: [
      { header: 'Ký hiệu chứng từ', key: 'voucher_no', width: 130, type: 'string' },
      { header: 'Ngày tháng chứng từ', key: 'voucher_date', width: 110, type: 'string' },
      { header: 'Diễn giải', key: 'description', width: 260, type: 'string' },
      { header: 'Nhóm ngành nghề', key: 'group_name', width: 220, type: 'string' },
      { header: 'Doanh thu (VNĐ)', key: 'revenue', width: 140, type: 'currency' },
      { header: 'Thuế GTGT (VNĐ)', key: 'vat_amount', width: 120, type: 'currency' },
      { header: 'Thuế TNCN (VNĐ)', key: 'pit_amount', width: 120, type: 'currency' },
    ],
    data: s2aData.rows.slice(0, 500),
  });

  // Sheet 2: S2c-HKD Doanh thu chi phí
  const s2cData = [
    ...orders.map((o) => ({
      voucher: o.order_number || o.id || 'POS',
      date: (o.created_at || '').slice(0, 10),
      desc: `Thu bán bánh tiệm: Đơn ${o.order_number || o.id}`,
      income: o.total_amount || o.totalPrice || 0,
      expense: 0,
    })),
    ...expenses.map((e) => ({
      voucher: `CP-${e.id || '01'}`,
      date: e.date || '',
      desc: `Chi phí: ${e.category} - ${e.description}`,
      income: 0,
      expense: e.amount || 0,
    })),
  ];
  sheets.push({
    name: 'S2c_Doanh_Thu_Chi_Phi',
    columns: [
      { header: 'Ký hiệu chứng từ', key: 'voucher', width: 130, type: 'string' },
      { header: 'Ngày tháng', key: 'date', width: 110, type: 'string' },
      { header: 'Diễn giải', key: 'desc', width: 280, type: 'string' },
      { header: 'Doanh thu vào (VNĐ)', key: 'income', width: 150, type: 'currency' },
      { header: 'Chi phí ra (VNĐ)', key: 'expense', width: 150, type: 'currency' },
    ],
    data: s2cData.slice(0, 500),
  });

  // Sheet 3: S2d-HKD Vật tư kho
  const s2dData = ingredients.map((ing) => ({
    name: ing.name,
    unit: ing.unit,
    stock: ing.stock_qty || 0,
    cost: ing.avg_cost || 0,
    total_value: (ing.stock_qty || 0) * (ing.avg_cost || 0),
  }));
  sheets.push({
    name: 'S2d_Kho_Vat_Lieu_SP',
    columns: [
      { header: 'Tên nguyên vật liệu / Dụng cụ / Bánh', key: 'name', width: 240, type: 'string' },
      { header: 'Đơn vị tính', key: 'unit', width: 90, type: 'string' },
      { header: 'Tồn kho hiện tại', key: 'stock', width: 130, type: 'number' },
      { header: 'Đơn giá vốn bình quân', key: 'cost', width: 150, type: 'currency' },
      { header: 'Thành tiền tồn kho (VNĐ)', key: 'total_value', width: 170, type: 'currency' },
    ],
    data: s2dData,
  });

  // Sheet 4: S2e-HKD Sổ chi tiết tiền
  const s2eData = cashflow.map((c) => ({
    voucher: c.id || 'CF',
    date: c.date || (c.created_at || '').slice(0, 10),
    desc: c.description || c.title || 'Giao dịch tiền',
    fund_type: c.wallet === 'cash' ? 'Quỹ tiền mặt' : 'Tiền gửi ngân hàng (VietQR)',
    income: c.type === 'in' ? c.amount : 0,
    expense: c.type === 'out' ? c.amount : 0,
  }));
  sheets.push({
    name: 'S2e_So_Chi_Tiet_Tien',
    columns: [
      { header: 'Số chứng từ', key: 'voucher', width: 130, type: 'string' },
      { header: 'Ngày tháng', key: 'date', width: 110, type: 'string' },
      { header: 'Diễn giải thu / chi', key: 'desc', width: 280, type: 'string' },
      { header: 'Tài khoản / Quỹ', key: 'fund_type', width: 180, type: 'string' },
      { header: 'Số tiền Thu (VNĐ)', key: 'income', width: 150, type: 'currency' },
      { header: 'Số tiền Chi (VNĐ)', key: 'expense', width: 150, type: 'currency' },
    ],
    data: s2eData.slice(0, 500),
  });

  const filename = `Tron_Bo_7_So_Ke_Toan_HKD_TT88_${Date.now()}`;
  exportMultiSheetExcel(filename, sheets);
}

/**
 * Xuất Tờ khai thông báo doanh thu năm Mẫu 01/TKN-CNKD (Doanh thu <= 1 Tỷ/năm - Miễn thuế)
 * Ban hành kèm theo Thông tư 50/2026/TT-BTC & Nghị định 141/2026/NĐ-CP
 */
export function export01TknCnkdExcel(
  info: HouseholdBusinessInfo,
  periodLabel: string,
  analysis: {
    annual_threshold: number;
    current_year_revenue: number;
    is_under_threshold: boolean;
  },
  summary: S2aSummaryByGroup[]
) {
  const declarationRows = [
    { indicator: '[01]', name: 'Kỳ tính thuế (Năm tính thuế)', rate: '-', amount: periodLabel, tax: '-' },
    { indicator: '[02]', name: `Tên người nộp thuế: ${info.shop_name}`, rate: '-', amount: `Đại diện: ${info.owner_name}`, tax: '-' },
    { indicator: '[03]', name: `Mã số thuế: ${info.tax_code}`, rate: '-', amount: `Điện thoại: ${info.phone}`, tax: '-' },
    { indicator: '[04]', name: `Địa chỉ kinh doanh: ${info.business_address}`, rate: '-', amount: `Cơ quan thuế: ${info.tax_office_name || 'Chi cục Thuế quản lý'}`, tax: '-' },
    { indicator: '[20]', name: '--- KÊ KHAI DOANH THU THỰC TẾ TRONG NĂM ---', rate: '-', amount: '-', tax: '-' },
    { indicator: '[21]', name: 'TỔNG DOANH THU PHÁT SINH TRONG NĂM (VNĐ)', rate: '-', amount: analysis.current_year_revenue, tax: '0 đ (Miễn thuế)' },
    { indicator: '[22]', name: '1. Doanh thu sản xuất bánh kem, bánh mì, đồ uống chế biến', rate: '3%', amount: summary[2]?.total_revenue || 0, tax: '0 đ (Miễn thuế)' },
    { indicator: '[23]', name: '2. Doanh thu bán lẻ phụ kiện tiệc, nến, hàng hóa mua bán', rate: '1%', amount: summary[0]?.total_revenue || 0, tax: '0 đ (Miễn thuế)' },
    { indicator: '[24]', name: '3. Doanh thu dịch vụ ship, giao hàng tận nơi, trang trí tiệc', rate: '5%', amount: summary[1]?.total_revenue || 0, tax: '0 đ (Miễn thuế)' },
    { indicator: '[25]', name: '4. Doanh thu các hoạt động khác', rate: '2%', amount: summary[3]?.total_revenue || 0, tax: '0 đ (Miễn thuế)' },
    { indicator: '[26]', name: '--- TÌNH TRẠNG NGHĨA VỤ THUẾ THEO NGHỊ ĐỊNH 141/2026/NĐ-CP ---', rate: '-', amount: '-', tax: '-' },
    { indicator: '[27]', name: 'Ngưỡng doanh thu miễn thuế theo quy định năm 2026', rate: '-', amount: 1000000000, tax: '1.000.000.000 VNĐ' },
    { indicator: '[28]', name: 'Xác nhận điều kiện: Doanh thu thực tế <= 1.000.000.000 đ', rate: '-', amount: analysis.current_year_revenue, tax: 'ĐỦ ĐIỀU KIỆN MIỄN THUẾ 100%' },
    { indicator: '[29]', name: 'Thuế Giá Trị Gia Tăng (GTGT) phải nộp:', rate: '0%', amount: 0, tax: 0 },
    { indicator: '[30]', name: 'Thuế Thu Nhập Cá Nhân (TNCN) phải nộp:', rate: '0%', amount: 0, tax: 0 },
    { indicator: '[31]', name: 'Lệ phí môn bài (Đã bãi bỏ từ 01/01/2026):', rate: '-', amount: 0, tax: 0 },
    { indicator: '[32]', name: 'TỔNG SỐ THUẾ PHẢI NỘP VÀO NGÂN SÁCH NHÀ NƯỚC (VNĐ):', rate: '-', amount: 0, tax: 0 },
  ];

  const sheets: ExcelSheet[] = [
    {
      name: 'To_Khai_01_TKN_CNKD_Mien_Thue',
      columns: [
        { header: 'Mã Chỉ Tiêu', key: 'indicator', width: 90, type: 'string' },
        { header: 'Nội Dung Kê Khai & Chỉ Tiêu Doanh Thu', key: 'name', width: 380, type: 'string' },
        { header: 'Tỷ Lệ', key: 'rate', width: 80, type: 'string' },
        { header: 'Số Tiền / Doanh Thu (VNĐ)', key: 'amount', width: 170, type: 'currency' },
        { header: 'Nghĩa Vụ Thuế Phải Nộp', key: 'tax', width: 180, type: 'string' },
      ],
      data: declarationRows,
    },
  ];

  const filename = `To_Khai_Thue_01_TKN_CNKD_MienThue_${info.tax_code || 'MST'}_${Date.now()}`;
  exportMultiSheetExcel(filename, sheets);
}

/**
 * Xuất Tờ khai thuế Mẫu 01/CNKD (Doanh thu > 1 Tỷ/năm - Kê khai nộp thuế)
 */
export function export01CnkdExcel(
  info: HouseholdBusinessInfo,
  periodLabel: string,
  summary: S2aSummaryByGroup[],
  totals: { totalRevenue: number; totalVat: number; totalPit: number; totalTax: number }
) {
  const declarationRows = [
    { indicator: '[01]', name: 'Kỳ kê khai thuế', rate: '-', revenue: periodLabel, vat: '-', pit: '-', total: '-' },
    { indicator: '[02]', name: `Hộ kinh doanh: ${info.shop_name}`, rate: '-', revenue: `Đại diện: ${info.owner_name}`, vat: '-', pit: '-', total: '-' },
    { indicator: '[03]', name: `Mã số thuế: ${info.tax_code}`, rate: '-', revenue: `Địa chỉ: ${info.business_address}`, vat: '-', pit: '-', total: '-' },
    { indicator: '[28]', name: 'TỔNG DOANH THU TÍNH THUẾ TRONG KỲ', rate: '-', revenue: totals.totalRevenue, vat: totals.totalVat, pit: totals.totalPit, total: totals.totalTax },
    { indicator: '[29]', name: '1. Phân phối, cung cấp hàng hóa (Phụ kiện, nến, bánh nhập)', rate: 'GTGT 1% | TNCN 0.5%', revenue: summary[0]?.total_revenue || 0, vat: summary[0]?.total_vat || 0, pit: summary[0]?.total_pit || 0, total: summary[0]?.total_tax || 0 },
    { indicator: '[30]', name: '2. Dịch vụ, xây dựng không bao thầu NVL (Phí ship, trang trí)', rate: 'GTGT 5% | TNCN 2.0%', revenue: summary[1]?.total_revenue || 0, vat: summary[1]?.total_vat || 0, pit: summary[1]?.total_pit || 0, total: summary[1]?.total_tax || 0 },
    { indicator: '[31]', name: '3. Sản xuất bánh kem, bánh mì, đồ uống chế biến tiệm bánh', rate: 'GTGT 3% | TNCN 1.5%', revenue: summary[2]?.total_revenue || 0, vat: summary[2]?.total_vat || 0, pit: summary[2]?.total_pit || 0, total: summary[2]?.total_tax || 0 },
    { indicator: '[32]', name: '4. Hoạt động kinh doanh khác', rate: 'GTGT 2% | TNCN 1.0%', revenue: summary[3]?.total_revenue || 0, vat: summary[3]?.total_vat || 0, pit: summary[3]?.total_pit || 0, total: summary[3]?.total_tax || 0 },
    { indicator: '[33]', name: 'TỔNG THUẾ GTGT PHẢI NỘP VÀO NSNN', rate: '-', revenue: '-', vat: totals.totalVat, pit: '-', total: totals.totalVat },
    { indicator: '[34]', name: 'TỔNG THUẾ TNCN PHẢI NỘP VÀO NSNN', rate: '-', revenue: '-', vat: '-', pit: totals.totalPit, total: totals.totalPit },
    { indicator: '[35]', name: 'TỔNG NGHĨA VỤ THUẾ PHẢI NỘP VÀO NSNN (GTGT + TNCN)', rate: '-', revenue: totals.totalRevenue, vat: totals.totalVat, pit: totals.totalPit, total: totals.totalTax },
  ];

  const sheets: ExcelSheet[] = [
    {
      name: 'To_Khai_01_CNKD_Ke_Khai',
      columns: [
        { header: 'Chỉ Tiêu', key: 'indicator', width: 90, type: 'string' },
        { header: 'Nội Dung Kinh Tế Kê Khai', key: 'name', width: 360, type: 'string' },
        { header: 'Tỷ Lệ Tính Thuế', key: 'rate', width: 150, type: 'string' },
        { header: 'Doanh Thu (VNĐ)', key: 'revenue', width: 150, type: 'currency' },
        { header: 'Thuế GTGT (VNĐ)', key: 'vat', width: 140, type: 'currency' },
        { header: 'Thuế TNCN (VNĐ)', key: 'pit', width: 140, type: 'currency' },
        { header: 'Tổng Thuế (VNĐ)', key: 'total', width: 150, type: 'currency' },
      ],
      data: declarationRows,
    },
  ];

  const filename = `To_Khai_Thue_01_CNKD_KeKhai_${info.tax_code || 'MST'}_${Date.now()}`;
  exportMultiSheetExcel(filename, sheets);
}
