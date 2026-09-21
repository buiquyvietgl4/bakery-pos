// scripts/verify_real_order_tax.ts
import { classifyItemTaxGroup, generateS2aLedger } from '../src/lib/utils/taxSync';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const { data: order } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('order_number', 'BK-20260921-641')
    .single();

  if (!order) {
    console.error('Không tìm thấy đơn hàng trên Supabase');
    return;
  }

  console.log('ĐƠN HÀNG TRÊN SUPABASE:', order.order_number, 'TỔNG TIỀN:', order.total_amount);
  
  const item1 = order.order_items[0]; // Bánh mì hoa cúc nhập khẩu
  const item2 = order.order_items[1]; // Bánh bông lan trứng muối

  const g1 = classifyItemTaxGroup(item1);
  const g2 = classifyItemTaxGroup(item2);

  console.log(`- Món 1: "${item1.product_name_snapshot}" -> Nhóm Thuế: ${g1} (${g1 === 1 ? 'Nhóm 1 - 1.5% Bánh Nhập' : 'Nhóm khác'})`);
  console.log(`- Món 2: "${item2.product_name_snapshot}" -> Nhóm Thuế: ${g2} (${g2 === 3 ? 'Nhóm 3 - 4.5% Bánh Tiệm Làm' : 'Nhóm khác'})`);

  const s2a = generateS2aLedger([order]);
  console.log(`\nSỔ CHI TIẾT DOANH THU S2A:`);
  console.log(`- Tổng số dòng kê khai: ${s2a.rows.length}`);
  s2a.rows.forEach((r, idx) => {
    console.log(`  Dòng ${idx + 1}: ${r.description} | Nhóm ${r.group_id} | Doanh thu: ${r.revenue.toLocaleString('vi-VN')}₫ | Thuế GTGT: ${r.vat_amount.toLocaleString('vi-VN')}₫ | Thuế TNCN: ${r.pit_amount.toLocaleString('vi-VN')}₫`);
  });

  const sumG1 = s2a.summary.find(s => s.group_id === 1);
  const sumG3 = s2a.summary.find(s => s.group_id === 3);

  console.log(`\nTỔNG HỢP NGHĨA VỤ THUẾ THEO TỪNG NHÓM:`);
  console.log(`- Nhóm 1 (Bánh Nhập Khẩu 1.5%): Doanh thu = ${sumG1?.total_revenue?.toLocaleString('vi-VN')}₫ | Thuế = ${sumG1?.total_tax?.toLocaleString('vi-VN')}₫`);
  console.log(`- Nhóm 3 (Bánh Sản Xuất 4.5%):  Doanh thu = ${sumG3?.total_revenue?.toLocaleString('vi-VN')}₫ | Thuế = ${sumG3?.total_tax?.toLocaleString('vi-VN')}₫`);
  console.log(`- TỔNG DOANH THU KÊ KHAI:       ${s2a.totalRevenue.toLocaleString('vi-VN')}₫`);
  console.log(`- TỔNG NGHĨA VỤ THUẾ PHẢI NỘP:   ${s2a.totalTax.toLocaleString('vi-VN')}₫`);
}

run().catch(console.error);
