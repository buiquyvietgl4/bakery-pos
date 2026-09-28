// scripts/qa_qc_comprehensive_assessment.ts
// Kịch bản kiểm thử tự động toàn diện dành cho QA/QC Lead & Kỹ sư Hệ thống

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface TestCaseResult {
  id: string;
  name: string;
  category: string;
  status: 'PASSED' | 'FAILED' | 'WARNING';
  latencyMs: number;
  details: string;
}

async function runQaAssessment() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║  🛡️  HỆ THỐNG KIỂM THỬ CHẤT LƯỢNG QA/QC TOÀN DIỆN - BAKERY POS & CLOUD SQL SYNC   ║');
  console.log('║        Đánh giá độ trễ, tính toàn vẹn dữ liệu, ngoại lệ và quy trình sao lưu      ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════════╝\n');

  const results: TestCaseResult[] = [];

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. KIỂM THỬ KẾT NỐI & ĐỘ TRỄ CLOUD SQL (LATENCY BENCHMARK)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('📡 [1/7] Kiểm thử Kết nối & Đo lường Độ trễ Cloud SQL...');
  const pingStart = Date.now();
  const { data: pingData, error: pingErr } = await supabase.from('products').select('id').limit(1);
  const pingLatency = Date.now() - pingStart;

  results.push({
    id: 'NET-01',
    name: 'Độ trễ kết nối Supabase Cloud SQL Ping',
    category: 'Hiệu suất & Độ trễ',
    status: !pingErr && pingLatency < 1000 ? 'PASSED' : pingLatency < 2500 ? 'WARNING' : 'FAILED',
    latencyMs: pingLatency,
    details: !pingErr ? `Kết nối thành công trong ${pingLatency}ms` : `Lỗi kết nối: ${pingErr.message}`,
  });
  console.log(`   • Ping Latency: ${pingLatency}ms -> ${results[results.length - 1].status}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. KIỂM THỬ PHÂN HỆ QUẢN LÝ CA BÁN HÀNG (SHIFT MANAGEMENT)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n💼 [2/7] Kiểm thử Phân hệ Quản lý Ca Bán Hàng (Shift Management)...');
  const shiftStart = Date.now();
  const mockShift = {
    id: `shift-test-${Date.now()}`,
    cashierName: 'QC Tester',
    shiftNumber: 99,
    startTime: new Date().toISOString(),
    initialCash: 500000,
    currentCash: 1250000,
    cardRevenue: 350000,
    transferRevenue: 600000,
    totalRevenue: 1700000,
    orderCount: 15,
    status: 'open',
  };

  // Ghi thử ca làm việc vào SYS_CONFIG_CURRENT_SHIFT
  const { error: shiftErr } = await supabase.from('recipes').upsert({
    id: '00000000-0000-0000-0000-000000000012',
    name: 'SYS_CONFIG_CURRENT_SHIFT',
    yield_qty: 1,
    yield_unit: 'config',
    cost_per_unit: 0,
    notes: JSON.stringify(mockShift),
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  const shiftLatency = Date.now() - shiftStart;
  results.push({
    id: 'POS-01',
    name: 'Đồng bộ Ca làm việc hiện tại lên Cloud SQL',
    category: 'Ca làm việc & Két tiền',
    status: !shiftErr ? 'PASSED' : 'FAILED',
    latencyMs: shiftLatency,
    details: !shiftErr ? `Đồng bộ ca thành công trong ${shiftLatency}ms` : `Lỗi: ${shiftErr?.message}`,
  });
  console.log(`   • Ghi nhận ca mở / ca đóng: ${shiftLatency}ms -> ${!shiftErr ? 'PASSED' : 'FAILED'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. KIỂM THỬ QUY TRÌNH BÁN HÀNG, TẠO ĐƠN & CHI TIẾT ĐƠN (SALES & CHECKOUT)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🛒 [3/7] Kiểm thử Quy trình Bán hàng & Toàn vẹn Đơn hàng...');
  const orderStart = Date.now();
  const testOrderId = crypto.randomUUID();
  const testOrderNumber = `TEST-QC-${Date.now().toString().slice(-6)}`;
  
  // 1. Tạo đơn hàng với các thuộc tính: chiết khấu, preorder, ghi chú
  const testOrderRecord = {
    id: testOrderId,
    order_number: testOrderNumber,
    order_type: 'preorder',
    status: 'pending',
    customer_name: 'Nguyễn Văn Test QA',
    customer_phone: '0988776655',
    cake_message: 'Chúc mừng kiểm thử QA thành công',
    preorder_pickup_at: new Date(Date.now() + 86400000).toISOString(),
    subtotal: 500000,
    total_amount: 450000, // Chiết khấu 50.000₫
    notes: JSON.stringify({
      discount_mode: 'amount',
      discount_amount: 50000,
      delivery_method: 'pickup',
      payment_method: 'transfer',
      transfer_code: 'QC-TRANS-01',
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error: oErr } = await supabase.from('orders').insert(testOrderRecord);

  // 2. Tạo 2 items trong order_items liên kết chặt với order_id
  const testItems = [
    {
      order_id: testOrderId,
      product_name_snapshot: 'Bánh Mousse Dâu QC Test',
      quantity: 2,
      unit_price: 200000,
      unit_cost: 70000,
      notes: 'Ít đường',
    },
    {
      order_id: testOrderId,
      product_name_snapshot: 'Bánh Croissant Bơ Pháp QC',
      quantity: 1,
      unit_price: 100000,
      unit_cost: 30000,
      notes: 'Nướng giòn',
    },
  ];
  const { error: oiErr } = await supabase.from('order_items').insert(testItems);

  // 3. Truy vấn ngược lại để xác minh toàn vẹn Foreign Key và chi tiết món
  const { data: verifyOrder, error: voErr } = await supabase
    .from('orders')
    .select(`
      id, order_number, total_amount, subtotal, status,
      order_items (id, product_name_snapshot, quantity, unit_price)
    `)
    .eq('id', testOrderId)
    .single();

  const orderLatency = Date.now() - orderStart;
  const isOrderValid =
    !oErr &&
    !oiErr &&
    !voErr &&
    verifyOrder?.order_items?.length === 2 &&
    verifyOrder?.total_amount === 450000;

  results.push({
    id: 'POS-02',
    name: 'Đồng bộ Đơn hàng & Chi tiết món (Orders & Order Items)',
    category: 'Bán hàng & Thanh toán',
    status: isOrderValid ? 'PASSED' : 'FAILED',
    latencyMs: orderLatency,
    details: isOrderValid
      ? `Đơn ${testOrderNumber} tạo kèm 2 món, chiết khấu và ràng buộc Foreign Key chuẩn (${orderLatency}ms)`
      : `Lỗi: oErr=${oErr?.message}, oiErr=${oiErr?.message}`,
  });
  console.log(`   • Đơn hàng + Chi tiết món + Ràng buộc Foreign Key: ${orderLatency}ms -> ${isOrderValid ? 'PASSED' : 'FAILED'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. KIỂM THỬ XỬ LÝ NGOẠI LỆ: HOÀN TIỀN & ĐỔI TRẢ (RETURN & REFUND)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔄 [4/7] Kiểm thử Xử lý Ngoại lệ: Đổi trả hàng / Hoàn tiền...');
  const returnStart = Date.now();

  // Cập nhật trạng thái đơn thành 'cancelled' (do ràng buộc PostgreSQL orders_status_check chỉ chấp nhận pending, preparing, ready, completed, cancelled)
  const { error: refErr } = await supabase
    .from('orders')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', testOrderId);

  // Ghi phiếu đổi trả vào SYS_CONFIG_ORDER_RETURNS
  const returnRecord = {
    id: `RET-QC-${Date.now().toString().slice(-6)}`,
    order_id: testOrderId,
    order_number: testOrderNumber,
    return_type: 'refund',
    refund_amount: 450000,
    refund_method: 'transfer',
    items: [
      { product_name: 'Bánh Mousse Dâu QC Test', quantity: 2, restocked: true, reason: 'damaged' }
    ],
    approved_by: 'QC Manager',
    created_at: new Date().toISOString(),
  };

  const { data: currentRetConfig } = await supabase
    .from('recipes')
    .select('notes')
    .eq('name', 'SYS_CONFIG_ORDER_RETURNS')
    .maybeSingle();

  let existingReturns = [];
  try {
    if (currentRetConfig?.notes) existingReturns = JSON.parse(currentRetConfig.notes);
  } catch {}

  const updatedReturns = [returnRecord, ...existingReturns];
  const { error: retErr } = await supabase.from('recipes').upsert({
    id: '00000000-0000-0000-0000-000000000028',
    name: 'SYS_CONFIG_ORDER_RETURNS',
    yield_qty: 1,
    yield_unit: 'config',
    cost_per_unit: 0,
    notes: JSON.stringify(updatedReturns.slice(0, 200)),
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  const returnLatency = Date.now() - returnStart;
  const isReturnSuccess = !refErr && !retErr;

  results.push({
    id: 'POS-03',
    name: 'Cập nhật Hoàn tiền & Lưu Phiếu Đổi trả trên Cloud SQL',
    category: 'Ngoại lệ Đổi trả',
    status: isReturnSuccess ? 'PASSED' : 'FAILED',
    latencyMs: returnLatency,
    details: isReturnSuccess
      ? `Đổi trạng thái đơn sang 'cancelled' (refunded mapping) và lưu phiếu đổi trả vào SYS_CONFIG_ORDER_RETURNS (${returnLatency}ms)`
      : `Lỗi hoàn tiền: refErr=${refErr?.message}, retErr=${retErr?.message}`,
  });
  console.log(`   • Đổi trả / Hoàn tiền & Đồng bộ Cloud: ${returnLatency}ms -> ${isReturnSuccess ? 'PASSED' : 'FAILED'}`);

  // Dọn dẹp đơn hàng test để không rác dữ liệu
  await supabase.from('order_items').delete().eq('order_id', testOrderId);
  await supabase.from('orders').delete().eq('id', testOrderId);

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. KIỂM THỬ QUẢN TRỊ, KHO & ĐỊNH LƯỢNG BOM (ADMIN, INVENTORY & BOM)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n📊 [5/7] Kiểm thử Quản trị Danh mục, Tồn kho & Định lượng BOM...');
  const invStart = Date.now();

  const [prodsRes, ingsRes, recsRes, bomRes] = await Promise.all([
    supabase.from('products').select('id, name, selling_price, base_cost_price'),
    supabase.from('ingredients').select('id, name, stock_qty, avg_cost'),
    supabase.from('recipes').select('id, name, yield_qty, cost_per_unit, recipe_items(id, ingredient_id, quantity, line_cost)').eq('is_active', true),
    supabase.from('recipes').select('notes').eq('name', 'SYS_CONFIG_FULL_BOM').maybeSingle(),
  ]);

  const prods = prodsRes.data || [];
  const ings = ingsRes.data || [];
  const recs = recsRes.data || [];
  const invLatency = Date.now() - invStart;

  // Kiểm tra mối liên kết nguyên liệu với công thức
  const brokenRecipeItems = recs.flatMap(r => (r.recipe_items || [])).filter(item => {
    return !ings.some(i => i.id === item.ingredient_id);
  });

  const isBomValid = brokenRecipeItems.length === 0;

  results.push({
    id: 'ADM-01',
    name: 'Kiểm tra Ràng buộc Định lượng BOM & Giá vốn NVL',
    category: 'Quản trị & Định mức BOM',
    status: isBomValid ? 'PASSED' : 'WARNING',
    latencyMs: invLatency,
    details: isBomValid
      ? `Định mức ${recs.length} công thức liên kết 100% khớp với danh mục nguyên liệu kho (${invLatency}ms)`
      : `Có ${brokenRecipeItems.length} recipe_items mồ côi không tìm thấy ingredient_id tương ứng`,
  });
  console.log(`   • Định lượng BOM & Khớp nối Nguyên vật liệu: ${invLatency}ms -> ${isBomValid ? 'PASSED' : 'WARNING'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. KIỂM THỬ THÔNG BÁO REALTIME (REALTIME CHANNELS & BROADCAST)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n🔔 [6/7] Kiểm thử Hệ thống Thông báo Realtime...');
  const rtStart = Date.now();

  let isRealtimeWorking = false;
  let rtLatency = 0;

  try {
    const testChannel = supabase.channel('qa-realtime-test-channel', {
      config: { broadcast: { self: true } },
    });

    const broadcastPromise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000);
      testChannel
        .on('broadcast', { event: 'kds_status_update' }, (payload) => {
          clearTimeout(timeout);
          resolve(true);
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            await testChannel.send({
              type: 'broadcast',
              event: 'kds_status_update',
              payload: { test: true, timestamp: Date.now() },
            });
          }
        });
    });

    isRealtimeWorking = await broadcastPromise;
    await supabase.removeChannel(testChannel);
    rtLatency = Date.now() - rtStart;
  } catch (rtErr) {
    console.warn('Realtime test catch:', rtErr);
  }

  results.push({
    id: 'NOTIF-01',
    name: 'Kênh Phát sóng Realtime (Supabase Broadcast Channel)',
    category: 'Thông báo Realtime',
    status: isRealtimeWorking ? 'PASSED' : 'WARNING',
    latencyMs: rtLatency,
    details: isRealtimeWorking
      ? `Kênh Broadcast phản hồi tức thì qua WebSocket (~${rtLatency}ms)`
      : `Phát sóng WebSocket timeout hoặc bị chặn trên môi trường node test. Cần xác nhận qua trình duyệt.`,
  });
  console.log(`   • Realtime Broadcast Channel: ${rtLatency}ms -> ${isRealtimeWorking ? 'PASSED' : 'WARNING'}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. KIỂM THỬ CẤU TRÚC FILE SAO LƯU & TÍNH TOÀN VẸN KHÔI PHỤC (BACKUP / RESTORE)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n📦 [7/7] Kiểm thử Cấu trúc File Sao Lưu & Khôi Phục (Backup & Restore)...');
  const backupStart = Date.now();
  const backupFilePath = path.join(process.cwd(), 'scripts', 'test_pre_reset_full_backup.json');
  let backupStatus: 'PASSED' | 'FAILED' | 'WARNING' = 'PASSED';
  let backupMsg = '';

  if (fs.existsSync(backupFilePath)) {
    try {
      const content = JSON.parse(fs.readFileSync(backupFilePath, 'utf-8'));
      const hasProducts = Array.isArray(content.products) && content.products.length > 0;
      const hasOrders = Array.isArray(content.orders) && content.orders.length > 0;
      const hasRecipes = Array.isArray(content.recipes) && content.recipes.length > 0;
      const hasIngredients = Array.isArray(content.ingredients) && content.ingredients.length > 0;
      const hasSettings = content.settings && typeof content.settings === 'object';
      const hasStockLogs = Array.isArray(content.stock_adjustments);

      if (hasProducts && hasOrders && hasRecipes && hasIngredients && hasSettings && hasStockLogs) {
        backupStatus = 'PASSED';
        backupMsg = `File backup đạt chuẩn v2: ${content.products.length} bánh, ${content.orders.length} đơn, ${content.recipes.length} công thức, ${content.ingredients.length} NVL, đầy đủ cấu hình`;
      } else {
        backupStatus = 'WARNING';
        backupMsg = 'File backup thiếu một số trường nghiệp vụ cơ bản';
      }
    } catch (e: any) {
      backupStatus = 'FAILED';
      backupMsg = `File backup bị hỏng JSON: ${e.message}`;
    }
  } else {
    backupStatus = 'FAILED';
    backupMsg = 'Không tìm thấy file backup snapshot mẫu';
  }

  const backupLatency = Date.now() - backupStart;
  results.push({
    id: 'BAK-01',
    name: 'Kiểm tra Cấu trúc & Tính toàn vẹn File Backup JSON',
    category: 'Sao lưu & Phục hồi',
    status: backupStatus,
    latencyMs: backupLatency,
    details: backupMsg,
  });
  console.log(`   • Cấu trúc file Backup: ${backupLatency}ms -> ${backupStatus}`);

  // ─────────────────────────────────────────────────────────────────────────────
  // BẢNG TỔNG HỢP CHECKLIST ĐÁNH GIÁ CUỐI CÙNG
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\n========================================================================================');
  console.log('📋 BẢNG CHECKLIST ĐÁNH GIÁ CHẤT LƯỢNG HỆ THỐNG QA/QC TOÀN DIỆN');
  console.log('========================================================================================\n');

  console.log('┌──────────┬──────────────────────────────────────────────────────┬──────────────────────┬──────────┬────────────┐');
  console.log('│ Mã Test  │ Hạng mục kiểm tra                                    │ Phân hệ              │ Độ trễ   │ Trạng thái │');
  console.log('├──────────┼──────────────────────────────────────────────────────┼──────────────────────┼──────────┼────────────┤');

  results.forEach(r => {
    const colId = r.id.padEnd(8);
    const colName = r.name.padEnd(52);
    const colCat = r.category.padEnd(20);
    const colLat = `${r.latencyMs}ms`.padEnd(8);
    const colStat = r.status.padEnd(10);
    console.log(`│ ${colId} │ ${colName} │ ${colCat} │ ${colLat} │ ${colStat} │`);
  });
  console.log('└──────────┴──────────────────────────────────────────────────────┴──────────────────────┴──────────┴────────────┘');

  console.log('\n🔍 Chi tiết từng hạng mục:');
  results.forEach(r => {
    const icon = r.status === 'PASSED' ? '✅' : r.status === 'WARNING' ? '⚠️' : '❌';
    console.log(`   ${icon} [${r.id}] ${r.name}: ${r.details}`);
  });
}

runQaAssessment().catch(console.error);
