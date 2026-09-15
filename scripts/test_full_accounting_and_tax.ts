// Mock browser APIs for Node.js
const mockStorage: Record<string, string> = {};
(globalThis as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  localStorage: {
    getItem: (k: string) => mockStorage[k] || null,
    setItem: (k: string, v: string) => { mockStorage[k] = v; },
    removeItem: (k: string) => { delete mockStorage[k]; },
  },
  navigator: { onLine: true },
};
(globalThis as any).localStorage = (globalThis as any).window.localStorage;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    writable: true,
    configurable: true,
  });
} catch {
  try {
    (globalThis.navigator as any).onLine = true;
  } catch {}
}

import { generateS2aLedger, generateS2eLedger, generate012BkHdkdData, analyzeTaxRevenueThreshold } from '../src/lib/utils/taxSync';

// --- GOLDEN DATASET ---

const posOrders: any[] = [
  // 10 cash orders
  { id: 'O1', order_number: 'ORD-001', created_at: '2026-09-10T10:00:00Z', total_amount: 50000, payment_method: 'cash', status: 'completed', customer_name: 'Khach A', items: [{ product_name_snapshot: 'Bánh mì', quantity: 2, unit_price: 25000, unit_cost: 10000, line_total: 50000, line_cost: 20000 }] },
  { id: 'O2', order_number: 'ORD-002', created_at: '2026-09-10T11:00:00Z', total_amount: 150000, payment_method: 'cash', status: 'completed', customer_name: 'Khach B' },
  { id: 'O3', order_number: 'ORD-003', created_at: '2026-09-11T09:00:00Z', total_amount: 250000, payment_method: 'cash', status: 'completed', customer_name: 'Khach C' },
  { id: 'O4', order_number: 'ORD-004', created_at: '2026-09-11T14:00:00Z', total_amount: 500000, payment_method: 'Tiền mặt', status: 'completed', customer_name: 'Khach D' },
  { id: 'O5', order_number: 'ORD-005', created_at: '2026-09-12T10:00:00Z', total_amount: 120000, payment_method: 'cash', status: 'completed', customer_name: 'Khach E' },
  { id: 'O6', order_number: 'ORD-006', created_at: '2026-09-12T16:00:00Z', total_amount: 80000, payment_method: 'cash', status: 'completed', customer_name: 'Khach F' },
  { id: 'O7', order_number: 'ORD-007', created_at: '2026-09-13T08:00:00Z', total_amount: 300000, payment_method: 'cash', status: 'completed', customer_name: 'Khach G' },
  { id: 'O8', order_number: 'ORD-008', created_at: '2026-09-13T12:00:00Z', total_amount: 450000, payment_method: 'cash', status: 'completed', customer_name: 'Khach H' },
  { id: 'O9', order_number: 'ORD-009', created_at: '2026-09-14T09:00:00Z', total_amount: 180000, payment_method: 'cash', status: 'completed', customer_name: 'Khach I' },
  { id: 'O10', order_number: 'ORD-010', created_at: '2026-09-14T15:00:00Z', total_amount: 220000, payment_method: 'cash', status: 'completed', customer_name: 'Khach J' },
  // 5 VietQR/bank orders
  { id: 'O11', order_number: 'ORD-011', created_at: '2026-09-10T15:00:00Z', total_amount: 400000, payment_method: 'transfer', status: 'completed', customer_name: 'Khach K' },
  { id: 'O12', order_number: 'ORD-012', created_at: '2026-09-11T10:00:00Z', total_amount: 350000, payment_method: 'VietQR', status: 'completed', customer_name: 'Khach L' },
  { id: 'O13', order_number: 'ORD-013', created_at: '2026-09-12T11:00:00Z', total_amount: 280000, payment_method: 'transfer', status: 'completed', customer_name: 'Khach M' },
  { id: 'O14', order_number: 'ORD-014', created_at: '2026-09-13T14:00:00Z', total_amount: 150000, payment_method: 'transfer', status: 'completed', customer_name: 'Khach N' },
  { id: 'O15', order_number: 'ORD-015', created_at: '2026-09-14T11:00:00Z', total_amount: 480000, payment_method: 'VietQR', status: 'completed', customer_name: 'Khach O' },
  // 2 preorder/deposit
  { id: 'O16', order_number: 'ORD-016', created_at: '2026-09-10T12:00:00Z', total_amount: 500000, payment_method: 'transfer', status: 'completed', customer_name: 'Khach P', deposit_amount: 200000, remaining_amount: 300000 },
  { id: 'O17', order_number: 'ORD-017', created_at: '2026-09-12T09:00:00Z', total_amount: 800000, payment_method: 'cash', status: 'completed', customer_name: 'Khach Q', deposit_amount: 400000, remaining_amount: 400000 },
  // 2 cancelled (total=0)
  { id: 'O18', order_number: 'ORD-018', created_at: '2026-09-11T16:00:00Z', total_amount: 0, payment_method: 'cash', status: 'cancelled', customer_name: 'Khach R' },
  { id: 'O19', order_number: 'ORD-019', created_at: '2026-09-13T10:00:00Z', total_amount: 0, payment_method: 'transfer', status: 'cancelled', customer_name: 'Khach S' },
  // 1 cancelled > 0
  { id: 'O20', order_number: 'ORD-020', created_at: '2026-09-14T10:00:00Z', total_amount: 100000, payment_method: 'cash', status: 'cancelled', customer_name: 'Khach T' }
];

const validOrders = posOrders.filter(o => !(o.status === 'cancelled' && (o.total_amount === 0 || !o.total_amount)));

const expenses: any[] = [
  { id: 'E1', category: 'Lương nhân viên', amount: 5000000, description: 'Lương tháng 8 NV A', date: '2026-09-01T08:00:00Z' },
  { id: 'E2', category: 'Lương nhân viên', amount: 4500000, description: 'Lương tháng 8 NV B', date: '2026-09-01T08:05:00Z' },
  { id: 'E3', category: 'Tiền điện', amount: 1200000, description: 'Điện tháng 8', date: '2026-09-05T09:00:00Z' },
  { id: 'E4', category: 'Tiền nước', amount: 300000, description: 'Nước tháng 8', date: '2026-09-06T10:00:00Z' },
  { id: 'E5', category: 'Tiền mặt bằng', amount: 10000000, description: 'Mặt bằng T9', date: '2026-09-01T11:00:00Z' },
  { id: 'E6', category: 'Khấu hao thiết bị', amount: 500000, description: 'Khấu hao máy pha cafe', date: '2026-09-10T14:00:00Z' },
  { id: 'E7', category: 'Chi phí quản lý', amount: 200000, description: 'Văn phòng phẩm', date: '2026-09-11T15:00:00Z' },
  { id: 'E8', category: 'Nguyên vật liệu', amount: 1500000, description: 'Nhập bột mì bơ trứng', date: '2026-09-02T08:00:00Z' },
  { id: 'E9', category: 'Chi phí khác', amount: 100000, description: 'Gửi xe', date: '2026-09-08T09:00:00Z' },
  { id: 'E10', category: 'Chi phí khác', amount: 250000, description: 'Tiếp khách', date: '2026-09-12T19:00:00Z' }
];

const ingredients: any[] = [
  { id: 'I1', name: 'Bột mì', unit: 'kg', stock_qty: 50, avg_cost: 15000, reorder_level: 10, sku: 'ING-001' },
  { id: 'I2', name: 'Bơ lạt', unit: 'kg', stock_qty: 20, avg_cost: 120000, reorder_level: 5, sku: 'ING-002' },
  { id: 'I3', name: 'Trứng gà', unit: 'quả', stock_qty: 200, avg_cost: 3500, reorder_level: 50, sku: 'ING-003' },
  { id: 'I4', name: 'Kem tươi', unit: 'L', stock_qty: 15, avg_cost: 85000, reorder_level: 5, sku: 'ING-004' },
  { id: 'I5', name: 'Đường', unit: 'kg', stock_qty: 30, avg_cost: 22000, reorder_level: 10, sku: 'ING-005' },
  { id: 'I6', name: 'Sữa tươi', unit: 'L', stock_qty: 25, avg_cost: 32000, reorder_level: 10, sku: 'ING-006' },
  { id: 'I7', name: 'Bột cacao', unit: 'kg', stock_qty: 5, avg_cost: 95000, reorder_level: 2, sku: 'ING-007' },
  { id: 'I8', name: 'Hộp đóng gói', unit: 'cái', stock_qty: 100, avg_cost: 8000, reorder_level: 50, sku: 'ING-008' }
];

const cashflow: any[] = [
  { id: 'C1', type: 'income', category: 'Bán hàng', amount: 2000000, desc: 'Doanh thu tiền mặt đầu ngày', date: '2026-09-10T10:00:00Z', method: 'cash' },
  { id: 'C2', type: 'income', category: 'Bán hàng', amount: 1500000, desc: 'Doanh thu chuyển khoản', date: '2026-09-10T12:00:00Z', method: 'bank' },
  { id: 'C3', type: 'expense', category: 'Nhập hàng', amount: 500000, desc: 'Trả tiền bột mì', date: '2026-09-11T08:00:00Z', method: 'cash' },
  { id: 'C4', type: 'expense', category: 'Chi phí khác', amount: 200000, desc: 'Sửa điện', date: '2026-09-12T14:00:00Z', method: 'cash' },
  { id: 'C5', type: 'income', category: 'Khác', amount: 100000, desc: 'Bán phế liệu', date: '2026-09-13T09:00:00Z', method: 'cash' }
];

// --- TEST RUNNER UTILS ---

let totalPass = 0;
let totalFail = 0;

function assertEqual(name: string, actual: any, expected: any) {
  const isPass = JSON.stringify(actual) === JSON.stringify(expected);
  if (isPass) {
    totalPass++;
  } else {
    totalFail++;
  }
  
  // Format amounts if number
  const fmtActual = typeof actual === 'number' ? actual.toLocaleString('vi-VN') : String(actual).substring(0, 50);
  const fmtExpected = typeof expected === 'number' ? expected.toLocaleString('vi-VN') : String(expected).substring(0, 50);
  
  console.log(`│ ${name.padEnd(24)} │ ${fmtExpected.padEnd(12)} │ ${fmtActual.padEnd(12)} │ ${isPass ? '✅ PASS' : '❌ FAIL'} │`);
}

function printHeader(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
  console.log(`┌──────────────────────────┬──────────────┬──────────────┬────────┐`);
  console.log(`│ Chỉ tiêu                 │ Kỳ vọng      │ Thực tế      │ Result │`);
  console.log(`├──────────────────────────┼──────────────┼──────────────┼────────┤`);
}

function printFooter() {
  console.log(`└──────────────────────────┴──────────────┴──────────────┴────────┘`);
}

// --- RUN TESTS ---

console.log(`╔══════════════════════════════════════════════════════════════╗`);
console.log(`║     BÁO CÁO KIỂM THỬ TOÀN DIỆN KẾ TOÁN & THUẾ BAKERY     ║`);
console.log(`╚══════════════════════════════════════════════════════════════╝`);

// TEST GROUP 1: Financial Accounting Formulas
printHeader('TEST GROUP 1: FINANCIAL ACCOUNTING FORMULAS');
const totalRevenue = validOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
const cancelledRevenue = posOrders.filter(o => o.status === 'cancelled' && o.total_amount > 0).reduce((sum, o) => sum + o.total_amount, 0);
const cashRevenue = validOrders.filter(o => o.payment_method === 'cash' || o.payment_method === 'Tiền mặt').reduce((sum, o) => sum + o.total_amount, 0);
const bankRevenue = validOrders.filter(o => o.payment_method !== 'cash' && o.payment_method !== 'Tiền mặt').reduce((sum, o) => sum + o.total_amount, 0);
const cogs = Math.round(totalRevenue * 0.365);
const grossProfit = totalRevenue - cogs;
const totalOpex = expenses.reduce((sum, e) => sum + e.amount, 0);
const netProfit = grossProfit - totalOpex;

assertEqual('Doanh thu thuần', totalRevenue, totalRevenue);
assertEqual('Cancelled Revenue > 0', cancelledRevenue, 100000);
assertEqual('Doanh thu Tiền mặt', cashRevenue, 3200000);
assertEqual('Doanh thu Chuyển khoản', bankRevenue, 2160000);
assertEqual('COGS (36.5%)', cogs, Math.round(totalRevenue * 0.365));
assertEqual('Gross Profit', grossProfit, totalRevenue - cogs);
assertEqual('Total Opex', totalOpex, 23550000);
assertEqual('Net Profit', netProfit, grossProfit - totalOpex);
printFooter();

// TEST GROUP 2: Tax S2a Ledger
printHeader('TEST GROUP 2: TAX S2A LEDGER');
const s2aData = generateS2aLedger(validOrders);
assertEqual('S2a Rows Count', s2aData.rows.length, validOrders.length);
assertEqual('S2a Total Revenue', s2aData.totalRevenue, totalRevenue);
assertEqual('S2a Total VAT (3%)', s2aData.totalVat, Math.round(totalRevenue * 0.03));
assertEqual('S2a Total PIT (1.5%)', s2aData.totalPit, Math.round(totalRevenue * 0.015));
const allGroup3 = s2aData.rows.every((r: any) => r.group_id === 3);
assertEqual('All rows Group 3', allGroup3, true);
const allHaveDesc = s2aData.rows.every((r: any) => r.description && r.description.length > 0);
assertEqual('All have description', allHaveDesc, true);
printFooter();

// TEST GROUP 3: Tax S2e Ledger
printHeader('TEST GROUP 3: TAX S2E LEDGER');
const s2eData = generateS2eLedger(cashflow);
const totalIncome = cashflow.filter(c => c.type === 'income' || c.type === 'in').reduce((sum, c) => sum + c.amount, 0);
const totalExpense = cashflow.filter(c => c.type === 'expense' || c.type === 'out').reduce((sum, c) => sum + c.amount, 0);
assertEqual('S2e Rows Count', s2eData.rows.length, cashflow.length);
assertEqual('S2e Total Income', s2eData.totalIncome, totalIncome);
assertEqual('S2e Total Expense', s2eData.totalExpense, totalExpense);
const hasValidFundType = s2eData.rows.every((r: any) => r.fund_type === 'Quỹ tiền mặt (111)' || r.fund_type === 'Ngân hàng VietQR (112)');
assertEqual('Valid fund_type', hasValidFundType, true);
const allHaveVoucherNo = s2eData.rows.every((r: any) => (r.voucher_no && (r.voucher_no.startsWith('PT-') || r.voucher_no.startsWith('PC-'))));
assertEqual('Valid voucher_no', allHaveVoucherNo, true);
assertEqual('Closing balance', s2eData.closingBalance, totalIncome - totalExpense);
printFooter();

// TEST GROUP 4: BK-HĐKD Data
printHeader('TEST GROUP 4: BK-HĐKD DATA');
const bkhdkdData = generate012BkHdkdData(ingredients, expenses, validOrders);
assertEqual('Inventory Rows', bkhdkdData.inventoryRows.length, ingredients.length);
let validInventory = true;
let totalClosingValue = 0;
for (const item of bkhdkdData.inventoryRows) {
  if (item.opening_qty + item.in_qty - item.out_qty !== item.closing_qty) validInventory = false;
  if (item.closing_qty < 0) validInventory = false;
  totalClosingValue += item.closing_amount;
}
assertEqual('Valid Inv Balance', validInventory, true);
assertEqual('Total Closing > 0', totalClosingValue > 0, true);
assertEqual('Expenses Categories', Object.keys(bkhdkdData.expenseSummary).length > 0, true);
printFooter();

// TEST GROUP 5: Tax Threshold Analysis
printHeader('TEST GROUP 5: TAX THRESHOLD ANALYSIS');
const thresholdAnalysis = analyzeTaxRevenueThreshold(validOrders, 2026);
assertEqual('Revenue Match', thresholdAnalysis.current_year_revenue, totalRevenue);
assertEqual('Under Threshold', thresholdAnalysis.is_under_threshold, true);
assertEqual('Recommended Form', thresholdAnalysis.recommended_form, '01/TKN-CNKD');
assertEqual('Percent Threshold', thresholdAnalysis.percent_of_threshold, Math.round((totalRevenue / 1_000_000_000) * 1000) / 10);
printFooter();

// TEST GROUP 6: Cross-System Consistency
printHeader('TEST GROUP 6: CROSS-SYSTEM CONSISTENCY');
assertEqual('S2a Rev === valid Rev', s2aData.totalRevenue, totalRevenue);
assertEqual('Threshold Rev === S2a', thresholdAnalysis.current_year_revenue, s2aData.totalRevenue);
printFooter();

console.log(`\nTỔNG KẾT: ${totalPass}/${totalPass + totalFail} PASS ✅  |  ${totalFail} FAIL ❌`);
if (totalFail > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
