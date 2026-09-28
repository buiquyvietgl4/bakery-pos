// scripts/audit_and_test_sql_sync.ts
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runAudit() {
  console.log('========================================================================');
  console.log('🔍 BƯỚC 1: QUÉT TOÀN BỘ CƠ SỞ DỮ LIỆU HIỆN CÓ TRÊN SUPABASE CLOUD SQL');
  console.log('========================================================================\n');

  // 1. Quét các bảng chính
  const [
    prodsRes,
    ingsRes,
    recsRes,
    recItemsRes,
    ordersRes,
    ordItemsRes,
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact' }),
    supabase.from('ingredients').select('*', { count: 'exact' }),
    supabase.from('recipes').select('*', { count: 'exact' }),
    supabase.from('recipe_items').select('*', { count: 'exact' }),
    supabase.from('orders').select('*', { count: 'exact' }),
    supabase.from('order_items').select('*', { count: 'exact' }),
  ]);

  console.log(`📦 Bảng 'products': ${prodsRes.count ?? 0} dòng`);
  console.log(`📦 Bảng 'ingredients': ${ingsRes.count ?? 0} dòng`);
  console.log(`📦 Bảng 'recipes': ${recsRes.count ?? 0} dòng`);
  console.log(`📦 Bảng 'recipe_items': ${recItemsRes.count ?? 0} dòng`);
  console.log(`📦 Bảng 'orders': ${ordersRes.count ?? 0} dòng`);
  console.log(`📦 Bảng 'order_items': ${ordItemsRes.count ?? 0} dòng`);

  // Phân tích các dòng cấu hình hệ thống SYS_CONFIG_* lưu trong bảng recipes
  const allRecs = recsRes.data || [];
  const bakingRecipes = allRecs.filter((r) => r.is_active !== false && !r.name.startsWith('SYS_') && !r.name.startsWith('DB_'));
  const sysConfigRows = allRecs.filter((r) => r.is_active === false || r.name.startsWith('SYS_') || r.name.startsWith('DB_'));

  console.log(`\n👨‍🍳 Công thức làm bánh thực tế: ${bakingRecipes.length} công thức:`);
  bakingRecipes.forEach((r) => console.log(`   - [${r.id}] ${r.name} (Yield: ${r.yield_qty} ${r.yield_unit})`));

  console.log(`\n⚙️ Cấu hình hệ thống (SYS_CONFIG_*) đang lưu trên SQL: ${sysConfigRows.length} dòng:`);
  const configNameSet = new Set<string>();
  sysConfigRows.forEach((r) => {
    configNameSet.add(r.name);
    let sample = '';
    try {
      const parsed = JSON.parse(r.notes || '{}');
      if (Array.isArray(parsed)) {
        sample = `mảng ${parsed.length} phần tử`;
      } else if (typeof parsed === 'object') {
        sample = `object keys: ${Object.keys(parsed).slice(0, 4).join(', ')}`;
      }
    } catch {
      sample = (r.notes || '').slice(0, 40);
    }
    console.log(`   - [${r.id}] ${r.name} ➔ ${sample}`);
  });

  // 2. Quét Storage sao lưu trên Cloud
  console.log('\n========================================================================');
  console.log('☁️ BƯỚC 2: QUÉT BẢN SAO LƯU TRÊN SUPABASE STORAGE (BUCKET bakery-images)');
  console.log('========================================================================\n');

  const { data: storageFiles, error: stErr } = await supabase.storage
    .from('bakery-images')
    .list('cloud_backups_7days', { limit: 100, sortBy: { column: 'name', order: 'desc' } });

  if (stErr) {
    console.log('Lỗi đọc storage cloud_backups_7days:', stErr.message);
  } else {
    console.log(`Tìm thấy ${storageFiles?.length || 0} bản sao lưu trong cloud_backups_7days:`);
    storageFiles?.slice(0, 5).forEach((f) => {
      console.log(`   - ${f.name} (${Math.round((f.metadata?.size || 0) / 1024)} KB, cập nhật: ${f.updated_at || f.created_at})`);
    });
  }

  // 3. Phân tích các loại dữ liệu nghiệp vụ sinh ra trong quá trình sử dụng
  console.log('\n========================================================================');
  console.log('📋 BƯỚC 3: KIỂM TRA ĐỐI CHIẾU CÁC DỮ LIỆU SINH RA KHI SỬ DỤNG VỚI SQL');
  console.log('========================================================================\n');

  // Danh mục đầy đủ tất cả dữ liệu sinh ra trong Bakery ERP:
  const businessEntities = [
    { key: 'products', name: 'Sản phẩm & Menu bánh', location: 'Bảng products', inSql: (prodsRes.count || 0) > 0 },
    { key: 'orders', name: 'Đơn hàng bán lẻ & Giao hàng', location: 'Bảng orders & order_items', inSql: (ordersRes.count || 0) > 0 },
    { key: 'preorders', name: 'Đơn đặt bánh sinh nhật/lễ', location: 'Bảng orders (order_type = preorder)', inSql: (ordersRes.data || []).some((o) => o.order_type === 'preorder') },
    { key: 'ingredients', name: 'Nguyên vật liệu & Bao bì kho', location: 'Bảng ingredients', inSql: (ingsRes.count || 0) > 0 },
    { key: 'recipes', name: 'Công thức làm bánh (BOM)', location: 'Bảng recipes & recipe_items', inSql: bakingRecipes.length > 0 },
    { key: 'stock_adjustments', name: 'Nhật ký biến động tồn kho bánh', location: 'SYS_CONFIG_STOCK_ADJUSTMENTS', inSql: configNameSet.has('SYS_CONFIG_STOCK_ADJUSTMENTS') },
    { key: 'spoilage_logs', name: 'Nhật ký bánh hỏng / hủy / hao hụt', location: 'SYS_CONFIG_SPOILAGE', inSql: configNameSet.has('SYS_CONFIG_SPOILAGE') },
    { key: 'material_transactions', name: 'Nhật ký nhập/xuất nguyên vật liệu kho', location: 'SYS_CONFIG_MATERIAL_TRANSACTIONS', inSql: configNameSet.has('SYS_CONFIG_MATERIAL_TRANSACTIONS') },
    { key: 'material_stock_adjustments', name: 'Kiểm kê & điều chỉnh kho nguyên vật liệu', location: 'SYS_CONFIG_MATERIAL_STOCK_ADJUSTMENTS', inSql: configNameSet.has('SYS_CONFIG_MATERIAL_STOCK_ADJUSTMENTS') },
    { key: 'expenses', name: 'Sổ quỹ chi (Chi phí mặt bằng, điện nước...)', location: 'SYS_CONFIG_EXPENSES', inSql: configNameSet.has('SYS_CONFIG_EXPENSES') },
    { key: 'cashflow', name: 'Sổ quỹ tiền mặt & Dòng tiền', location: 'SYS_CONFIG_CASHFLOW', inSql: configNameSet.has('SYS_CONFIG_CASHFLOW') },
    { key: 'shift_history', name: 'Lịch sử ca làm việc & Kiểm két đóng ca', location: 'SYS_CONFIG_SHIFT_HISTORY', inSql: configNameSet.has('SYS_CONFIG_SHIFT_HISTORY') },
    { key: 'current_shift', name: 'Ca làm việc hiện tại đang mở', location: 'SYS_CONFIG_CURRENT_SHIFT', inSql: configNameSet.has('SYS_CONFIG_CURRENT_SHIFT') },
    { key: 'accounting_closings', name: 'Chốt sổ kế toán tháng & Thuế hộ KD', location: 'SYS_CONFIG_CLOSINGS', inSql: configNameSet.has('SYS_CONFIG_CLOSINGS') },
    { key: 'tax_household', name: 'Cấu hình định mức thuế hộ kinh doanh', location: 'SYS_CONFIG_TAX_HOUSEHOLD', inSql: configNameSet.has('SYS_CONFIG_TAX_HOUSEHOLD') },
    { key: 'tax_policy', name: 'Chính sách thuế & Luật thuế mới', location: 'SYS_CONFIG_TAX_POLICY', inSql: configNameSet.has('SYS_CONFIG_TAX_POLICY') },
    { key: 'branding', name: 'Tên cửa hàng, Slogan, Địa chỉ, Hotline', location: 'SYS_CONFIG_BRANDING', inSql: configNameSet.has('SYS_CONFIG_BRANDING') },
    { key: 'vietqr', name: 'Cấu hình chuyển khoản VietQR tiệm', location: 'SYS_CONFIG_VIETQR', inSql: configNameSet.has('SYS_CONFIG_VIETQR') },
    { key: 'ewallet', name: 'Mã QR ví điện tử (Momo, ZaloPay...)', location: 'SYS_CONFIG_EWALLET', inSql: configNameSet.has('SYS_CONFIG_EWALLET') },
    { key: 'printer', name: 'Cấu hình máy in hóa đơn & tem nhãn dán', location: 'SYS_CONFIG_PRINTER', inSql: configNameSet.has('SYS_CONFIG_PRINTER') },
    { key: 'security', name: 'Tài khoản quản trị Admin & Mã PIN', location: 'SYS_CONFIG_SECURITY', inSql: configNameSet.has('SYS_CONFIG_SECURITY') },
    { key: 'full_cake_bom', name: 'Công thức định lượng Full Cake BOM', location: 'SYS_CONFIG_FULL_BOM', inSql: configNameSet.has('SYS_CONFIG_FULL_BOM') },
    { key: 'cake_costing', name: 'Cấu hình tính giá thành bánh kem tự chọn', location: 'SYS_CONFIG_CAKE_COSTING', inSql: configNameSet.has('SYS_CONFIG_CAKE_COSTING') },
    { key: 'notification_history', name: 'Lịch sử chuông & thông báo đơn gấp', location: 'SYS_CONFIG_NOTIFICATION_HISTORY', inSql: configNameSet.has('SYS_CONFIG_NOTIFICATION_HISTORY') },
    { key: 'deleted_product_ids', name: 'Danh sách đen sản phẩm đã xóa triệt để', location: 'SYS_CONFIG_DELETED_PRODUCTS', inSql: configNameSet.has('SYS_CONFIG_DELETED_PRODUCTS') },
    { key: 'pending_transfers', name: 'Giao dịch chuyển khoản đang chờ duyệt', location: 'SYS_CONFIG_PENDING_TRANSFERS', inSql: configNameSet.has('SYS_CONFIG_PENDING_TRANSFERS') },
    { key: 'resolved_transfers', name: 'Giao dịch chuyển khoản đã duyệt/từ chối', location: 'SYS_CONFIG_RESOLVED_TRANSFERS', inSql: configNameSet.has('SYS_CONFIG_RESOLVED_TRANSFERS') },
    { key: 'order_returns', name: 'Phiếu đổi trả hàng / hoàn tiền của khách', location: 'SYS_CONFIG_ORDER_RETURNS', inSql: configNameSet.has('SYS_CONFIG_ORDER_RETURNS') },
    { key: 'held_orders', name: 'Đơn hàng tạm giữ tại quầy thu ngân', location: 'SYS_CONFIG_HELD_ORDERS', inSql: configNameSet.has('SYS_CONFIG_HELD_ORDERS') },
    { key: 'oven_batches', name: 'Mẻ nướng bánh trong bếp KDS', location: 'SYS_CONFIG_OVEN_BATCHES', inSql: configNameSet.has('SYS_CONFIG_OVEN_BATCHES') },
    { key: 'autobank', name: 'Cấu hình webhook ngân hàng SePAY/Casso', location: 'SYS_CONFIG_AUTOBANK', inSql: configNameSet.has('SYS_CONFIG_AUTOBANK') },
    { key: 'transfer_verify', name: 'Quy tắc xác thực tiền về tài khoản', location: 'SYS_CONFIG_TRANSFER_VERIFY', inSql: configNameSet.has('SYS_CONFIG_TRANSFER_VERIFY') },
    { key: 'delivery_alert', name: 'Cấu hình âm thanh & cảnh báo giờ giao', location: 'SYS_CONFIG_DELIVERY_ALERT', inSql: configNameSet.has('SYS_CONFIG_DELIVERY_ALERT') },
    { key: 'telegram', name: 'Cấu hình báo động đơn hàng qua Telegram', location: 'SYS_CONFIG_TELEGRAM', inSql: configNameSet.has('SYS_CONFIG_TELEGRAM') },
  ];

  console.log(`Đã rà soát ${businessEntities.length} loại dữ liệu nghiệp vụ:`);
  const missingInSql: any[] = [];
  const presentInSql: any[] = [];

  businessEntities.forEach((be) => {
    if (be.inSql) {
      presentInSql.push(be);
      console.log(`   ✅ [ĐÃ CÓ TRÊN SQL] ${be.name.padEnd(45)} ➔ ${be.location}`);
    } else {
      missingInSql.push(be);
      console.log(`   ❌ [CHƯA CÓ TRÊN SQL] ${be.name.padEnd(45)} ➔ ${be.location}`);
    }
  });

  console.log(`\nTổng kết: ${presentInSql.length}/${businessEntities.length} loại dữ liệu đã có trên SQL, còn ${missingInSql.length} loại chưa có.`);
}

runAudit().catch(console.error);
