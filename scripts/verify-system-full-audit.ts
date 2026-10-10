// scripts/verify-system-full-audit.ts
// Script chạy kiểm thử độc lập đánh giá chi tiết từng chức năng & liên module
import { deduplicateHeldOrders, normalizeHeldOrder } from '../src/lib/utils/heldOrderManager';
import { deduplicateOrderReturns } from '../src/lib/utils/orderReturnManager';
import { extractOrderCode } from '../src/lib/utils/orderCodeExtractor';
import { matchesOrderSearch } from '../src/lib/utils/orderSearch';
import { convertIngredientQuantity, normalizeVietnamese } from '../src/lib/utils/inventoryDeductionManager';
import { isProductFromBom } from '../src/lib/utils/productManager';
import { deduplicateExpenses, deduplicateCashflow } from '../src/lib/utils/accountingSync';
import { generateS2eLedger } from '../src/lib/utils/taxSync';
import { generateMasterSqlDump } from '../src/lib/utils/localSqlManager';
import { DB_ROW_GLOBAL_SQL_ID } from '../src/lib/supabase/databaseProfileManager';
import { DB_ROW_RESET_EPOCH_ID } from '../src/lib/utils/systemResetManager';
import { DB_ROW_PENDING_RETURNS_ID } from '../src/lib/supabase/realtimeSync';

console.log('================================================================');
console.log('🚀 BẮT ĐẦU KIỂM TRA HỆ THỐNG TOÀN DIỆN (HEADLESS SYSTEM AUDIT)');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, testName: string, detail: string = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName} ${detail ? `(${detail})` : ''}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    failCount++;
  }
}

// 1. Phân hệ POS & Đơn hàng
console.log('👉 PHÂN HỆ 1: BÁN HÀNG POS & THU NGÂN');
const code1 = extractOrderCode('Chuyen khoan don hang #BK-10294');
assert(code1 === 'BK-10294', 'Trích xuất mã BK-10294', code1 || '');

const code2 = extractOrderCode('Thanh toan VietQR DH-987654');
assert(code2 === 'DH-987654', 'Trích xuất mã VietQR DH-987654', code2 || '');

const sampleOrder = { id: 'ORD-1', order_number: 'BK-101', customer_name: 'Nguyễn Văn A', customer_phone: '0901234567' };
assert(matchesOrderSearch(sampleOrder, 'Nguyễn'), 'Tìm kiếm đơn theo tên khách', 'Nguyễn');
assert(matchesOrderSearch(sampleOrder, '090123'), 'Tìm kiếm đơn theo số điện thoại', '090123');

const held = normalizeHeldOrder({ id: 'h1', holdCode: '#T1', items: [{ product: { selling_price: 20000 }, quantity: 3 }] });
assert(held.totalAmount === 60000 && held.itemCount === 3, 'Tạm giữ đơn (Held Order) tính đúng tổng tiền và số món', `Total: ${held.totalAmount}`);

const dedupedHeld = deduplicateHeldOrders([held, held]);
assert(dedupedHeld.length === 1, 'Khử trùng lặp đơn tạm giữ (De-duplicate)', `Count: ${dedupedHeld.length}`);

// 2. Phân hệ Bếp & BOM & Kho
console.log('\n👉 PHÂN HỆ 2: BẾP (KDS), QUẢN LÝ BOM & KHO VẬT TƯ');
const convGtoKg = convertIngredientQuantity(650, 'g', 'kg');
assert(convGtoKg === 0.65, 'Quy đổi đơn vị g sang kg', `650g = ${convGtoKg}kg`);

const convLtoMl = convertIngredientQuantity(1.5, 'l', 'ml');
assert(convLtoMl === 1500, 'Quy đổi đơn vị l sang ml', `1.5l = ${convLtoMl}ml`);

const normStr = normalizeVietnamese('Bột Mì Bông Lan Số 8');
assert(normStr === 'bot mi bong lan so 8', 'Chuẩn hóa tiếng Việt không dấu khớp BOM', normStr);

const bomProd = { id: 'p1', name: 'Bánh Mì Chuột', recipe_id: 'rec-01' };
assert(isProductFromBom(bomProd), 'Khóa bảo vệ sản phẩm có BOM (isProductFromBom)', 'Locked');

// 3. Phân hệ Kế toán, Sổ quỹ & Thuế
console.log('\n👉 PHÂN HỆ 3: KẾ TOÁN, SỔ QUỸ DÒNG TIỀN & THUẾ');
const exp1 = { id: 'e1', category: 'Điện', amount: 500000, description: 'Điện T10', date: '2026-10-10' };
const dedupedExp = deduplicateExpenses([exp1, exp1]);
assert(dedupedExp.length === 1, 'Khử trùng lặp chi phí vận hành (OPEX)', `Count: ${dedupedExp.length}`);

const cf1 = { id: 'c1', type: 'income' as const, category: 'Bán lẻ', amount: 300000, desc: 'Bán bánh', date: '2026-10-10' };
const dedupedCf = deduplicateCashflow([cf1, cf1]);
assert(dedupedCf.length === 1, 'Khử trùng lặp dòng tiền sổ quỹ (Cashflow)', `Count: ${dedupedCf.length}`);

const taxRes = generateS2eLedger([], {
  orders: [
    { id: 'o1', total_amount: 100000, payment_method: 'transfer' },
    { id: 'o2', total_amount: 50000, payment_method: 'cash' },
  ],
});
assert(taxRes.bankIncome === 100000 && taxRes.cashIncome === 50000, 'Sổ thuế GTGT phân loại chuẩn TK 112 (Bank) và TK 111 (Cash)', `Bank: ${taxRes.bankIncome}, Cash: ${taxRes.cashIncome}`);

// 4. Bảo mật & Triệt tiêu xung đột UUID
console.log('\n👉 PHÂN HỆ 4: BẢO MẬT & ĐỘC LẬP UUID HỆ THỐNG');
assert(DB_ROW_GLOBAL_SQL_ID !== DB_ROW_RESET_EPOCH_ID, 'Tách biệt UUID Database Profile và Reset Epoch', `${DB_ROW_GLOBAL_SQL_ID} != ${DB_ROW_RESET_EPOCH_ID}`);
assert(DB_ROW_PENDING_RETURNS_ID === '00000000-0000-0000-0000-000000000028', 'UUID Đơn chờ duyệt đổi trả chuẩn xác', DB_ROW_PENDING_RETURNS_ID);

// 5. Đồng bộ CSDL Cloud SQL & Local SQL Dump
console.log('\n👉 PHÂN HỆ 5: ĐỒNG BỘ CSDL CLOUD ↔ LOCAL MASTER SQL DUMP');
const dumpSql = generateMasterSqlDump({
  products: [{ id: 'p1', name: "Bánh Mì O'Clock", selling_price: 15000 }],
  orders: [{ id: 'o1', order_number: 'ORD-01', total_amount: 15000, status: 'completed' }],
  ingredients: [{ id: 'i1', name: 'Bột mì', stock_qty: 5000 }],
  recipes: [{ id: 'r1', name: 'Bánh mì', yield_qty: 10 }],
  held_orders: [{ id: 'h1', holdCode: '#T1', totalAmount: 15000 }],
  order_returns: [{ id: 'ret1', order_number: 'ORD-01', refund_amount: 15000 }],
});

assert(dumpSql.includes('CREATE TABLE IF NOT EXISTS products'), 'Dump SQL chứa bảng products');
assert(dumpSql.includes('CREATE TABLE IF NOT EXISTS orders'), 'Dump SQL chứa bảng orders');
assert(dumpSql.includes('CREATE TABLE IF NOT EXISTS held_orders'), 'Dump SQL chứa bảng held_orders');
assert(dumpSql.includes('CREATE TABLE IF NOT EXISTS order_returns'), 'Dump SQL chứa bảng order_returns');
assert(dumpSql.includes("Bánh Mì O''Clock"), "Escape dấu nháy đơn tiếng Việt an toàn (O''Clock)");

console.log('\n================================================================');
console.log(`📊 TỔNG KẾT KIỂM THỬ THỰC TẾ: ${passCount} ĐẠT, ${failCount} LỖI`);
console.log('================================================================');
if (failCount === 0) {
  console.log('🎉 TOÀN BỘ HỆ THỐNG HOẠT ĐỘNG HOÀN HẢO THEO THIẾT KẾ!');
} else {
  process.exit(1);
}
