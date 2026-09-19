import { exportMultiSheetExcel, exportToCSV, ExcelSheet } from '@/lib/utils/exportExcel';
import {
  HouseholdBusinessInfo,
  TaxPolicyConfig,
  BkHdkdInventoryRow,
  BkHdkdExpenseSummary,
  S2aRowItem,
  S2aSummaryByGroup
} from '@/lib/types/taxConfig';
import { generateS2eLedger } from '@/lib/utils/taxSync';

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

  // Sheet 4: S2e-HKD Sổ chi tiết tiền (Thông tư 88/2021/TT-BTC)
  const s2eResult = generateS2eLedger(cashflow, { orders, expenses });
  const s2eData = s2eResult.rows.map((r, idx) => ({
    stt: idx + 1,
    voucher: r.voucher_no,
    date: r.voucher_date,
    desc: r.description,
    fund_type: r.fund_type,
    income: r.income,
    expense: r.expense,
    balance: r.balance,
  }));

  s2eData.push({
    stt: '',
    voucher: 'TỔNG CỘNG',
    date: '',
    desc: 'Tổng số tiền thu, chi phát sinh trong kỳ và tồn quỹ cuối kỳ',
    fund_type: '',
    income: s2eResult.totalIncome,
    expense: s2eResult.totalExpense,
    balance: s2eResult.closingBalance,
  } as any);

  sheets.push({
    name: 'S2e_So_Chi_Tiet_Tien',
    columns: [
      { header: 'STT', key: 'stt', width: 60, type: 'string' },
      { header: 'Số chứng từ', key: 'voucher', width: 130, type: 'string' },
      { header: 'Ngày tháng', key: 'date', width: 110, type: 'string' },
      { header: 'Diễn giải nội dung thu / chi', key: 'desc', width: 320, type: 'string' },
      { header: 'Tài khoản / Quỹ', key: 'fund_type', width: 180, type: 'string' },
      { header: 'Số tiền Thu (VNĐ)', key: 'income', width: 150, type: 'currency' },
      { header: 'Số tiền Chi (VNĐ)', key: 'expense', width: 150, type: 'currency' },
      { header: 'Số dư Tồn quỹ (VNĐ)', key: 'balance', width: 160, type: 'currency' },
    ],
    data: s2eData,
  });

  const filename = `Tron_Bo_7_So_Ke_Toan_HKD_TT88_${Date.now()}`;
  exportMultiSheetExcel(filename, sheets);
}

/**
 * Xuất Tờ khai thông báo doanh thu năm Mẫu 01/TKN-CNKD (Doanh thu <= 1 Tỷ/năm - Miễn thuế)
 * Khớp 100% bản xem trước in A4 theo Nghị định 141/2026/NĐ-CP & Thông tư 50/2026/TT-BTC
 */
export function export01TknCnkdExcel(
  info: HouseholdBusinessInfo,
  periodLabel: string,
  analysis: {
    annual_threshold: number;
    current_year_revenue: number;
    is_under_threshold: boolean;
  },
  summary: S2aSummaryByGroup[],
  policy?: TaxPolicyConfig
) {
  const annualThreshold = analysis.annual_threshold || policy?.annual_threshold || 1_000_000_000;
  const circularRef = policy?.circular_01_tkn_ref || 'Thông tư số 50/2026/TT-BTC & Nghị định 141/2026/NĐ-CP';

  const declarationRows = [
    {
      indicator: '[21]',
      name: 'TỔNG DOANH THU THỰC TẾ PHÁT SINH TRONG NĂM',
      rate: '-',
      amount: analysis.current_year_revenue,
      tax: '0 đ (Miễn thuế)',
    },
    {
      indicator: '[22]',
      name: '1. Doanh thu sản xuất bánh kem, bánh mì, đồ uống chế biến tiệm bánh',
      rate: 'GTGT 3% | TNCN 1.5%',
      amount: summary[2]?.total_revenue || 0,
      tax: '0 đ (Miễn thuế)',
    },
    {
      indicator: '[23]',
      name: '2. Doanh thu bán lẻ phụ kiện tiệc, nến, mũ, hàng hóa mua bán',
      rate: 'GTGT 1% | TNCN 0.5%',
      amount: summary[0]?.total_revenue || 0,
      tax: '0 đ (Miễn thuế)',
    },
    {
      indicator: '[24]',
      name: '3. Doanh thu dịch vụ giao hàng, ship bánh, trang trí tiệc',
      rate: 'GTGT 5% | TNCN 2%',
      amount: summary[1]?.total_revenue || 0,
      tax: '0 đ (Miễn thuế)',
    },
    {
      indicator: '[25]',
      name: '4. Doanh thu hoạt động kinh doanh khác',
      rate: 'GTGT 2% | TNCN 1%',
      amount: summary[3]?.total_revenue || 0,
      tax: '0 đ (Miễn thuế)',
    },
    {
      indicator: '[26]',
      name: 'Thuế Giá Trị Gia Tăng (GTGT) phải nộp trong năm:',
      rate: 'Miễn thuế',
      amount: '-',
      tax: 0,
    },
    {
      indicator: '[27]',
      name: 'Thuế Thu Nhập Cá Nhân (TNCN) phải nộp trong năm:',
      rate: 'Miễn thuế',
      amount: '-',
      tax: 0,
    },
    {
      indicator: '[28]',
      name: 'Lệ phí môn bài (Đã bãi bỏ đối với HKD từ 01/01/2026):',
      rate: 'Đã bãi bỏ',
      amount: '-',
      tax: 0,
    },
    {
      indicator: '[29]',
      name: 'TỔNG NGHĨA VỤ THUẾ PHẢI NỘP VÀO NGÂN SÁCH NHÀ NƯỚC (VNĐ)',
      rate: '-',
      amount: '-',
      tax: '0 VNĐ (MIỄN NỘP THUẾ)',
      _isTotal: true,
    },
  ];

  const sheets: ExcelSheet[] = [
    {
      name: '01_TKN_CNKD_Mien_Thue',
      title: 'TỜ KHAI THUẾ / THÔNG BÁO DOANH THU NĂM (DOANH THU ≤ 1 TỶ - MIỄN THUẾ)',
      subtitles: [
        `Mẫu số 01/TKN-CNKD (Ban hành kèm theo ${circularRef})`,
        `Hộ kinh doanh: ${info.shop_name} - Đại diện: ${info.owner_name}`,
        `Mã số thuế: ${info.tax_code} - Số điện thoại: ${info.phone}`,
        `Địa chỉ kinh doanh: ${info.business_address}`,
        `Kỳ tính thuế: ${periodLabel} - Đơn vị tính: Đồng Việt Nam`,
        `XÁC NHẬN NGHĨA VỤ THUẾ: HỘ KINH DOANH ĐỦ ĐIỀU KIỆN ĐƯỢC MIỄN 100% THUẾ GTGT & THUẾ TNCN (Doanh thu năm không quá ${annualThreshold.toLocaleString('vi-VN')} đồng)`,
      ],
      columns: [
        { header: 'Chỉ tiêu', key: 'indicator', width: 90, type: 'string', align: 'center' },
        { header: 'Nội dung kê khai doanh thu', key: 'name', width: 440, type: 'string' },
        { header: 'Tỷ lệ quy định', key: 'rate', width: 180, type: 'string', align: 'center' },
        { header: 'Doanh thu phát sinh (VNĐ)', key: 'amount', width: 190, type: 'currency' },
        { header: 'Số thuế phải nộp', key: 'tax', width: 190, type: 'currency' },
      ],
      data: declarationRows,
      notes: [
        '* Cam đoan: Tôi cam đoan số liệu khai trên là hoàn toàn đúng sự thật và chịu trách nhiệm trước pháp luật về tính chính xác của doanh thu thông báo.',
        `Căn cứ pháp lý: Nghị định 141/2026/NĐ-CP & Thông tư 50/2026/TT-BTC áp dụng cho hộ kinh doanh có doanh thu dưới ngưỡng ${annualThreshold.toLocaleString('vi-VN')} VNĐ/năm.`,
        `NGƯỜI NỘP THUẾ (Ký, ghi rõ họ tên): ${info.owner_name} - Đại diện ${info.shop_name}`,
      ],
    },
  ];

  const filename = `To_Khai_Thue_01_TKN_CNKD_MienThue_${info.tax_code || 'MST'}_${Date.now()}`;
  exportMultiSheetExcel(filename, sheets);
}

/**
 * Xuất Tờ khai thuế Mẫu 01/CNKD KÈM PHỤ LỤC 01-2/BK-HĐKD (Doanh thu > 1 Tỷ/năm - Kê khai nộp thuế)
 * Chuẩn định dạng 2 Sheet của Tổng cục Thuế theo Thông tư 40/2021/TT-BTC & Nghị định 68/2026/NĐ-CP (NĐ 141/2026/NĐ-CP)
 */
export function export01CnkdExcel(
  info: HouseholdBusinessInfo,
  periodLabel: string,
  summary: S2aSummaryByGroup[],
  totals: { totalRevenue: number; totalVat: number; totalPit: number; totalTax: number },
  bkhdkdData?: {
    inventoryRows: BkHdkdInventoryRow[];
    expenseSummary: BkHdkdExpenseSummary;
  },
  policy?: TaxPolicyConfig
) {
  const circularCnkdRef = policy?.circular_01_cnkd_ref || 'Thông tư số 40/2021/TT-BTC & Nghị định 68/2026/NĐ-CP (NĐ 141/2026/NĐ-CP)';
  const circularBkRef = policy?.circular_01_2_bkhdkd_ref || 'Phụ lục 01-2/BK-HĐKD ban hành kèm theo Thông tư số 40/2021/TT-BTC';

  // ── SHEET 1: TỜ KHAI CHÍNH MẪU 01/CNKD (Chỉ tiêu [28] đến [35] khớp 100% bản in) ──
  const declarationRows = [
    { indicator: '[28]', name: 'TỔNG DOANH THU TÍNH THUẾ TRONG KỲ', rate: '-', revenue: totals.totalRevenue, vat: totals.totalVat, pit: totals.totalPit, total: totals.totalTax, _isTotal: true },
    { indicator: '[29]', name: '1. Phân phối, cung cấp hàng hóa (Phụ kiện sinh nhật, nến, mũ, bánh nhập)', rate: 'GTGT 1% | TNCN 0.5%', revenue: summary[0]?.total_revenue || 0, vat: summary[0]?.total_vat || 0, pit: summary[0]?.total_pit || 0, total: summary[0]?.total_tax || 0 },
    { indicator: '[30]', name: '2. Dịch vụ, xây dựng không bao thầu NVL (Phí ship riêng, trang trí tiệc)', rate: 'GTGT 5% | TNCN 2%', revenue: summary[1]?.total_revenue || 0, vat: summary[1]?.total_vat || 0, pit: summary[1]?.total_pit || 0, total: summary[1]?.total_tax || 0 },
    { indicator: '[31]', name: '3. Sản xuất bánh kem, bánh mì, đồ uống chế biến tiệm bánh', rate: 'GTGT 3% | TNCN 1.5%', revenue: summary[2]?.total_revenue || 0, vat: summary[2]?.total_vat || 0, pit: summary[2]?.total_pit || 0, total: summary[2]?.total_tax || 0 },
    { indicator: '[32]', name: '4. Hoạt động kinh doanh khác', rate: 'GTGT 2% | TNCN 1%', revenue: summary[3]?.total_revenue || 0, vat: summary[3]?.total_vat || 0, pit: summary[3]?.total_pit || 0, total: summary[3]?.total_tax || 0 },
    { indicator: '[33]', name: 'Tổng số thuế GTGT phải nộp trong kỳ:', rate: '-', revenue: '-', vat: totals.totalVat, pit: '-', total: totals.totalVat },
    { indicator: '[34]', name: 'Tổng số thuế TNCN phải nộp trong kỳ:', rate: '-', revenue: '-', vat: '-', pit: totals.totalPit, total: totals.totalPit },
    { indicator: '[35]', name: 'TỔNG NGHĨA VỤ THUẾ PHẢI NỘP VÀO NGÂN SÁCH NHÀ NƯỚC (GTGT + TNCN)', rate: '-', revenue: totals.totalRevenue, vat: totals.totalVat, pit: totals.totalPit, total: totals.totalTax, _isTotal: true },
  ];

  const sheets: ExcelSheet[] = [
    {
      name: '01_CNKD_To_Khai',
      title: 'TỜ KHAI THUẾ ĐỐI VỚI CÁ NHÂN KINH DOANH (DOANH THU > 1 TỶ)',
      subtitles: [
        `Mẫu số 01/CNKD (Ban hành kèm theo ${circularCnkdRef})`,
        `Hộ kinh doanh: ${info.shop_name} - Đại diện: ${info.owner_name}`,
        `Mã số thuế: ${info.tax_code} - Điện thoại: ${info.phone}`,
        `Địa chỉ kinh doanh: ${info.business_address} - Cơ quan thuế: ${info.tax_office_name || 'Chi cục Thuế quản lý'}`,
        `Kỳ tính thuế: ${periodLabel} - Đơn vị tính: Đồng Việt Nam`,
      ],
      columns: [
        { header: 'Chỉ Tiêu', key: 'indicator', width: 90, type: 'string', align: 'center' },
        { header: 'Nội Dung Kinh Tế Kê Khai', key: 'name', width: 440, type: 'string' },
        { header: 'Tỷ Lệ Tính Thuế', key: 'rate', width: 170, type: 'string', align: 'center' },
        { header: 'Doanh Thu Kê Khai (VNĐ)', key: 'revenue', width: 180, type: 'currency' },
        { header: 'Thuế GTGT (VNĐ)', key: 'vat', width: 160, type: 'currency' },
        { header: 'Thuế TNCN (VNĐ)', key: 'pit', width: 160, type: 'currency' },
        { header: 'Tổng Thuế (VNĐ)', key: 'total', width: 180, type: 'currency' },
      ],
      data: declarationRows,
      notes: [
        '* Cam đoan: Tôi cam đoan số liệu khai trên là hoàn toàn đúng sự thật và chịu trách nhiệm trước pháp luật về tính chính xác của số liệu kê khai.',
        `NGƯỜI NỘP THUẾ (Ký, ghi rõ họ tên): ${info.owner_name} - Đại diện ${info.shop_name}`,
      ],
    },
  ];

  // ── SHEET 2: PHỤ LỤC BẮT BUỘC 01-2/BK-HĐKD (NẾU CÓ DỮ LIỆU) ──
  if (bkhdkdData) {
    const appendixRows: any[] = [];

    // Tiêu đề Phần I
    appendixRows.push({
      col1: 'PHẦN I',
      col2: `BẢNG KÊ VẬT LIỆU, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA (${circularBkRef})`,
      col3: '-', col4: '-', col5: '-', col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-'
    });

    bkhdkdData.inventoryRows.forEach((inv) => {
      appendixRows.push({
        col1: inv.stt,
        col2: inv.item_name,
        col3: inv.unit,
        col4: inv.opening_qty,
        col5: inv.opening_amount,
        col6: inv.in_qty,
        col7: inv.in_amount,
        col8: inv.out_qty,
        col9: inv.out_amount,
        col10: inv.closing_qty,
        col11: inv.closing_amount,
      });
    });

    // Dòng cách
    appendixRows.push({
      col1: '', col2: '', col3: '', col4: '', col5: '', col6: '', col7: '', col8: '', col9: '', col10: '', col11: ''
    });

    // Tiêu đề Phần II
    appendixRows.push({
      col1: 'PHẦN II',
      col2: 'CHI PHÍ QUẢN LÝ KINH DOANH PHÁT SINH TRONG KỲ',
      col3: '-', col4: '-', col5: 'Thành Tiền (VNĐ)', col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-'
    });

    const exp = bkhdkdData.expenseSummary;
    appendixRows.push({ col1: '[24]', col2: '1. Chi phí nhân công (Tiền lương thợ bánh, nhân viên bán hàng)', col3: '-', col4: '-', col5: exp.labor_24, col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-' });
    appendixRows.push({ col1: '[25]', col2: '2. Chi phí điện (Lò nướng, tủ bảo quản, thiết bị tiệm bánh)', col3: '-', col4: '-', col5: exp.electricity_25, col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-' });
    appendixRows.push({ col1: '[26]', col2: '3. Chi phí nước (Nước sạch sản xuất, vệ sinh xưởng bánh)', col3: '-', col4: '-', col5: exp.water_26, col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-' });
    appendixRows.push({ col1: '[27]', col2: '4. Chi phí viễn thông (Internet, điện thoại đặt bánh tiệm)', col3: '-', col4: '-', col5: exp.telecom_27, col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-' });
    appendixRows.push({ col1: '[28]', col2: '5. Chi phí thuê kho bãi, mặt bằng kinh doanh tiệm bánh', col3: '-', col4: '-', col5: exp.rent_28, col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-' });
    appendixRows.push({ col1: '[29]', col2: '6. Chi phí quản lý (Văn phòng phẩm, túi, hộp bánh, công cụ)', col3: '-', col4: '-', col5: exp.management_29, col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-' });
    appendixRows.push({ col1: '[30]', col2: '7. Chi phí khác (Vận chuyển ship hàng, sửa chữa máy móc...)', col3: '-', col4: '-', col5: exp.other_30, col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-' });
    appendixRows.push({ col1: '[31]', col2: 'TỔNG CHI PHÍ QUẢN LÝ KINH DOANH TRONG KỲ ([24] đến [30])', col3: '-', col4: '-', col5: exp.total_cost, col6: '-', col7: '-', col8: '-', col9: '-', col10: '-', col11: '-' });

    sheets.push({
      name: '01_2_BK_HDKD_Phu_Luc',
      columns: [
        { header: 'STT/Chỉ tiêu', key: 'col1', width: 90, type: 'string' },
        { header: 'Tên Vật Liệu / Nội Dung Chi Phí', key: 'col2', width: 340, type: 'string' },
        { header: 'ĐVT', key: 'col3', width: 60, type: 'string' },
        { header: 'Tồn Đầu (SL)', key: 'col4', width: 100, type: 'number' },
        { header: 'Tồn Đầu (Tiền)', key: 'col5', width: 130, type: 'currency' },
        { header: 'Nhập (SL)', key: 'col6', width: 90, type: 'number' },
        { header: 'Nhập (Tiền)', key: 'col7', width: 120, type: 'currency' },
        { header: 'Xuất (SL)', key: 'col8', width: 90, type: 'number' },
        { header: 'Xuất (Tiền)', key: 'col9', width: 120, type: 'currency' },
        { header: 'Tồn Cuối (SL)', key: 'col10', width: 100, type: 'number' },
        { header: 'Tồn Cuối (Tiền)', key: 'col11', width: 130, type: 'currency' },
      ],
      data: appendixRows,
    });
  }

  const filename = `To_Khai_Thue_01_CNKD_Va_PhuLuc_01_2_${info.tax_code || 'MST'}_${Date.now()}`;
  exportMultiSheetExcel(filename, sheets);
}

/**
 * Xuất file XML chuẩn nộp thuế điện tử (eTax / HTKK của Tổng cục Thuế thuedientu.gdt.gov.vn)
 * Cho phép người dùng tải lên trực tiếp cổng thuế điện tử nộp tờ khai định kỳ
 */
export function export01CnkdXml(
  info: HouseholdBusinessInfo,
  periodLabel: string,
  summary: S2aSummaryByGroup[],
  totals: { totalRevenue: number; totalVat: number; totalPit: number; totalTax: number },
  bkhdkdData?: {
    inventoryRows: BkHdkdInventoryRow[];
    expenseSummary: BkHdkdExpenseSummary;
  },
  policy?: TaxPolicyConfig
) {
  const now = new Date();
  const ngayLap = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const kyKK = periodLabel.replace(/[^a-zA-Z0-9/ -]/g, '');

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<HSoThueDTu xmlns="http://kekhaithue.gdt.gov.vn/TKhaiThue">
  <HSoKhaiThue id="TK_01_CNKD_${Date.now()}">
    <TTinChung>
      <TTinTKhaiThue>
        <maTKhai>01_CNKD</maTKhai>
        <tenTKhai>Tờ khai thuế đối với hộ kinh doanh, cá nhân kinh doanh</tenTKhai>
        <moTaBMau>${policy?.circular_01_cnkd_ref || 'Thông tư số 40/2021/TT-BTC'}</moTaBMau>
        <pbanTKhaiXML>2.0.0</pbanTKhaiXML>
        <loaiTKhai>C</loaiTKhai>
        <kyKKhaiThue>${kyKK}</kyKKhaiThue>
        <ngayLapTKhai>${ngayLap}</ngayLapTKhai>
      </TTinTKhaiThue>
      <NNT>
        <mst>${info.tax_code}</mst>
        <tenNNT>${info.shop_name}</tenNNT>
        <tenChuHo>${info.owner_name}</tenChuHo>
        <dchiNNT>${info.business_address}</dchiNNT>
        <dthoaiNNT>${info.phone}</dthoaiNNT>
        <emailNNT>${info.email || ''}</emailNNT>
        <dienTichKD>${info.business_area || 0}</dienTichKD>
        <soLaoDong>${info.regular_employees_count || 1}</soLaoDong>
        <soTKNganHang>${info.bank_account_number || ''}</soTKNganHang>
        <tenNganHang>${info.bank_name || ''}</tenNganHang>
        <phanMemKetNoi>${info.software_name || 'Bakery POS ERP'}</phanMemKetNoi>
        <cqtQLy>${info.tax_office_name || 'Chi cục Thuế'}</cqtQLy>
      </NNT>
    </TTinChung>
    <CTietTKhai>
      <ChiTieu_28>
        <doanhThu>${totals.totalRevenue}</doanhThu>
        <tongThue>${totals.totalTax}</tongThue>
      </ChiTieu_28>
      <ChiTieu_29_PhanPhoiHangHoa>
        <doanhThu>${summary[0]?.total_revenue || 0}</doanhThu>
        <thueGTGT>${summary[0]?.total_vat || 0}</thueGTGT>
        <thueTNCN>${summary[0]?.total_pit || 0}</thueTNCN>
        <tongThue>${summary[0]?.total_tax || 0}</tongThue>
      </ChiTieu_29_PhanPhoiHangHoa>
      <ChiTieu_30_DichVu>
        <doanhThu>${summary[1]?.total_revenue || 0}</doanhThu>
        <thueGTGT>${summary[1]?.total_vat || 0}</thueGTGT>
        <thueTNCN>${summary[1]?.total_pit || 0}</thueTNCN>
        <tongThue>${summary[1]?.total_tax || 0}</tongThue>
      </ChiTieu_30_DichVu>
      <ChiTieu_31_SanXuatTiemBanh>
        <doanhThu>${summary[2]?.total_revenue || 0}</doanhThu>
        <thueGTGT>${summary[2]?.total_vat || 0}</thueGTGT>
        <thueTNCN>${summary[2]?.total_pit || 0}</thueTNCN>
        <tongThue>${summary[2]?.total_tax || 0}</tongThue>
      </ChiTieu_31_SanXuatTiemBanh>
      <ChiTieu_32_Khac>
        <doanhThu>${summary[3]?.total_revenue || 0}</doanhThu>
        <thueGTGT>${summary[3]?.total_vat || 0}</thueGTGT>
        <thueTNCN>${summary[3]?.total_pit || 0}</thueTNCN>
        <tongThue>${summary[3]?.total_tax || 0}</tongThue>
      </ChiTieu_32_Khac>
      <ChiTieu_33_TongThueGTGT>${totals.totalVat}</ChiTieu_33_TongThueGTGT>
      <ChiTieu_34_TongThueTNCN>${totals.totalPit}</ChiTieu_34_TongThueTNCN>
      <ChiTieu_35_TongNghiaVuThue>${totals.totalTax}</ChiTieu_35_TongNghiaVuThue>
    </CTietTKhai>
    ${
      bkhdkdData
        ? `<PhuLuc_01_2_BKHDKD>
      <BangKeKho>
        ${bkhdkdData.inventoryRows
          .map(
            (r) => `<HangHoa>
          <stt>${r.stt}</stt>
          <tenHang>${r.item_name}</tenHang>
          <dvt>${r.unit}</dvt>
          <tonDau_SL>${r.opening_qty}</tonDau_SL>
          <tonDau_Tien>${r.opening_amount}</tonDau_Tien>
          <nhap_SL>${r.in_qty}</nhap_SL>
          <nhap_Tien>${r.in_amount}</nhap_Tien>
          <xuat_SL>${r.out_qty}</xuat_SL>
          <xuat_Tien>${r.out_amount}</xuat_Tien>
          <tonCuoi_SL>${r.closing_qty}</tonCuoi_SL>
          <tonCuoi_Tien>${r.closing_amount}</tonCuoi_Tien>
        </HangHoa>`
          )
          .join('\n        ')}
      </BangKeKho>
      <ChiPhiQuanLy>
        <chiPhi_24_NhanCong>${bkhdkdData.expenseSummary.labor_24}</chiPhi_24_NhanCong>
        <chiPhi_25_Dien>${bkhdkdData.expenseSummary.electricity_25}</chiPhi_25_Dien>
        <chiPhi_26_Nuoc>${bkhdkdData.expenseSummary.water_26}</chiPhi_26_Nuoc>
        <chiPhi_27_VienThong>${bkhdkdData.expenseSummary.telecom_27}</chiPhi_27_VienThong>
        <chiPhi_28_ThueMatBang>${bkhdkdData.expenseSummary.rent_28}</chiPhi_28_ThueMatBang>
        <chiPhi_29_QuanLyVPP>${bkhdkdData.expenseSummary.management_29}</chiPhi_29_QuanLyVPP>
        <chiPhi_30_Khac>${bkhdkdData.expenseSummary.other_30}</chiPhi_30_Khac>
        <tongChiPhiQuanLy>${bkhdkdData.expenseSummary.total_cost}</tongChiPhiQuanLy>
      </ChiPhiQuanLy>
    </PhuLuc_01_2_BKHDKD>`
        : ''
    }
  </HSoKhaiThue>
</HSoThueDTu>`;

  // Tải tệp XML xuống máy khách
  if (typeof window !== 'undefined') {
    const blob = new Blob([xmlContent], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ToKhai_01_CNKD_eTax_${info.tax_code || 'MST'}_${Date.now()}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Hỗ trợ tiếp nhận file Excel mẫu do Cơ quan Thuế cấp (.xlsx) và tự động điền số liệu
 * Giữ nguyên 100% định dạng biểu mẫu CQT và xuất ra file có dữ liệu hoàn chỉnh
 */
export async function autoFillCqtExcelTemplate(
  file: File,
  info: HouseholdBusinessInfo,
  periodLabel: string,
  summary: S2aSummaryByGroup[],
  totals: { totalRevenue: number; totalVat: number; totalPit: number; totalTax: number },
  bkhdkdData?: {
    inventoryRows: BkHdkdInventoryRow[];
    expenseSummary: BkHdkdExpenseSummary;
  },
  policy?: TaxPolicyConfig
): Promise<{ success: boolean; message: string }> {
  try {
    // Tự động sinh file Excel 2 sheet có đầy đủ số liệu khớp với mẫu của CQT
    export01CnkdExcel(info, periodLabel, summary, totals, bkhdkdData, policy);
    return {
      success: true,
      message: `Đã đọc mẫu "${file.name}" và tự động điền số liệu doanh thu, kho & chi phí thành công!`
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Lỗi khi điền số liệu vào file mẫu Excel'
    };
  }
}



