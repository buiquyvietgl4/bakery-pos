// scripts/test_reset_notifications_and_cross_device.ts
// Kiểm chứng toàn diện:
// 1. Sau khi Reset Hệ Thống: Lịch sử thông báo ("Lịch Sử Báo 2") biến mất hoàn toàn, badge = 0, không tự động hồi sinh demo notifications.
// 2. Các máy khác (Kitchen KDS, Quầy POS) tự động nhận lệnh xóa và làm sạch dữ liệu cũ kể cả khi không bấm OK modal.

import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runVerification() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ: FIX LỊCH SỬ THÔNG BÁO BẾP & ĐỒNG BỘ XÓA MÁY PHỤ');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // Mở trình duyệt Chrome
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: CHÈN THÔNG BÁO VÀO SUPABASE & LOCAL TRƯỚC KHI RESET
    // ─────────────────────────────────────────────────────────────────────────
    console.log('📌 BƯỚC 1: Nạp 3 thông báo thử nghiệm vào Supabase SQL recipes row...');
    const notifRowId = '00000000-0000-0000-0000-000000000013';
    const notifRowName = 'SYS_CONFIG_NOTIFICATION_HISTORY';
    const testNotifs = [
      {
        id: 'test-notif-1',
        type: 'new_order',
        title: 'Đơn hàng mới #BK-999',
        message: 'Khách vừa đặt bánh kem',
        timestamp: Date.now() - 60000,
        createdAtFormatted: '12:00:00 24/09/2026',
        isRead: false,
      },
      {
        id: 'test-notif-2',
        type: 'bake_done',
        title: 'Bánh đã chín ra lò',
        message: 'Bánh mì bơ tỏi đã nướng xong',
        timestamp: Date.now() - 30000,
        createdAtFormatted: '12:00:30 24/09/2026',
        isRead: false,
      },
    ];

    await supabase.from('recipes').upsert({
      id: notifRowId,
      name: notifRowName,
      yield_qty: 1,
      yield_unit: 'chiếc',
      cost_per_unit: 0,
      total_material_cost: 0,
      notes: JSON.stringify(testNotifs),
      is_active: false,
    });
    console.log('  ✓ Đã lưu thông báo test lên Supabase row SYS_CONFIG_NOTIFICATION_HISTORY.');

    // ─────────────────────────────────────────────────────────────────────────
    // BƯỚC 2: GỌI API RESET DATA (OPERATIONAL)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📌 BƯỚC 2: Gọi API reset-data để xóa dữ liệu vận hành & thông báo...');
    const resetRes = await fetch(`${BASE_URL}/api/system/reset-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'operational',
        adminPassword: 'admin123',
        epoch: Date.now(),
      }),
    });
    const resetJson = await resetRes.json();
    console.log('  Kết quả API reset:', resetJson);

    if (!resetJson.success) {
      throw new Error(`Reset API thất bại: ${JSON.stringify(resetJson)}`);
    }

    // Kiểm tra Supabase recipes table: row notification history đã bị xóa chưa
    const { data: dbCheck } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${notifRowId},name.eq.${notifRowName}`)
      .maybeSingle();

    if (dbCheck) {
      throw new Error(`THẤT BẠI: Supabase row SYS_CONFIG_NOTIFICATION_HISTORY vẫn còn tồn tại!`);
    } else {
      console.log('  ✓ Supabase SQL đã XÓA SẠCH bản ghi SYS_CONFIG_NOTIFICATION_HISTORY.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BƯỚC 3: MỞ TRANG BẾP (/kitchen) KIỂM TRA SỐ LƯỢNG THÔNG BÁO VÀ NÚT "LỊCH SỬ BÁO"
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📌 BƯỚC 3: Mở trang Bếp (/kitchen) kiểm tra hiển thị Lịch Sử Báo...');
    const kitchenPage = await browser.newPage();
    await kitchenPage.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const kitchenNotifState = await kitchenPage.evaluate(() => {
      const raw = localStorage.getItem('bakery_notification_history');
      const parsed = raw ? JSON.parse(raw) : null;
      const historyBtnText = document.querySelector('button[title*="lịch sử thông báo"]')?.textContent || '';
      const badge = document.querySelector('button[title*="lịch sử thông báo"] span.bg-rose-500')?.textContent || '';
      return {
        raw,
        parsedCount: parsed ? parsed.length : 0,
        historyBtnText,
        badge,
      };
    });

    console.log('  Trạng thái thông báo Bếp thực tế:', kitchenNotifState);
    if (kitchenNotifState.badge !== '') {
      throw new Error(`THẤT BẠI: Vẫn còn badge thông báo chưa đọc: "${kitchenNotifState.badge}"!`);
    }
    if (kitchenNotifState.parsedCount !== 0) {
      throw new Error(`THẤT BẠI: localStorage bakery_notification_history vẫn có ${kitchenNotifState.parsedCount} mục!`);
    }
    console.log('  ✓ ĐẠT CHUẨN 100%: Trang Bếp không còn badge đỏ, lịch sử thông báo = 0, không tự động re-seed demo notifications!');

    // ─────────────────────────────────────────────────────────────────────────
    // BƯỚC 4: TEST MÁY PHỤ (POS & KITCHEN) VẮNG MẶT / TỰ ĐỘNG XÓA DỮ LIỆU CŨ
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📌 BƯỚC 4: Kiểm tra Máy Phụ: Đang chứa đơn cũ nhưng vắng mặt lúc reset...');
    const posPage = await browser.newPage();
    await posPage.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    // Giả lập máy phụ: Nạp đơn cũ và đặt localEpoch = 0 (như thể máy phụ tắt máy suốt lúc reset)
    await posPage.evaluate(() => {
      localStorage.setItem('bakery_system_reset_epoch', '0');
      localStorage.setItem(
        'bakery_orders',
        JSON.stringify([
          {
            id: 'pos-stale-001',
            order_number: 'BK-POS-STALE-001',
            total_amount: 50000,
            status: 'completed',
            created_at: new Date(Date.now() - 3600000).toISOString(),
          },
        ])
      );
    });

    console.log('  Đã nạp đơn giả lập cũ vào Máy Phụ POS. Kích hoạt syncOrdersFromSupabase...');
    // Gọi reload/sync trên POS
    await posPage.evaluate(async () => {
      // Kích hoạt online event để POS tự động chạy syncOrdersFromSupabase
      window.dispatchEvent(new Event('online'));
    });
    await sleep(2500);

    // Kiểm tra POS đã tự động dọn sạch đơn cũ chưa
    const posOrdersCount = await posPage.evaluate(() => {
      const raw = localStorage.getItem('bakery_orders');
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    });

    console.log(`  Số lượng đơn trên POS sau khi tự động nhận diện Reset Epoch: ${posOrdersCount}`);
    if (posOrdersCount !== 0) {
      throw new Error(`THẤT BẠI: Máy phụ POS vẫn còn ${posOrdersCount} đơn cũ sau khi sync!`);
    }
    console.log('  ✓ ĐẠT CHUẨN 100%: Máy phụ POS tự động phát hiện Reset Epoch từ Supabase và làm sạch đơn cũ!');

    // ─────────────────────────────────────────────────────────────────────────
    // BƯỚC 5: TẠO ĐƠN MỚI SAU RESET -> MÁY PHỤ BẢO TỒN VÀ ĐỒNG BỘ ĐẦY ĐỦ
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📌 BƯỚC 5: Tạo đơn hàng mới sau mốc reset trên Supabase...');
    const postResetOrder = {
      id: '00000000-0000-0000-0000-000000009999',
      order_number: 'BK-POST-RESET-NEW-999',
      status: 'pending',
      order_type: 'takeaway',
      total_amount: 120000,
      subtotal: 120000,
      notes: 'Đơn mới tạo sau reset [TIỀN MẶT]',
      sync_status: 'synced',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await supabase.from('orders').upsert([postResetOrder]);
    console.log('  ✓ Đã tạo đơn mới BK-POST-RESET-NEW-999 trên Supabase.');

    // POS đồng bộ lại
    await posPage.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });
    await sleep(3000);

    const posNewOrderFound = await posPage.evaluate(() => {
      const raw = localStorage.getItem('bakery_orders');
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.some((o: any) => o.order_number === 'BK-POST-RESET-NEW-999');
    });

    console.log(`  Đơn mới sau reset có trên POS: ${posNewOrderFound}`);
    if (!posNewOrderFound) {
      throw new Error('THẤT BẠI: Đơn mới sau reset không được đồng bộ về POS!');
    }
    console.log('  ✓ ĐẠT CHUẨN 100%: Đơn mới tạo sau Reset được bảo tồn và đồng bộ chính xác!');

    // Dọn dẹp đơn test
    await supabase.from('orders').delete().eq('id', '00000000-0000-0000-0000-000000009999');
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('🎉 TẤT CẢ CÁC BÀI TEST ĐÃ VƯỢT QUA XUẤT SẮC!');
    console.log('═══════════════════════════════════════════════════════════════════════════');
  } finally {
    await browser.close();
  }
}

runVerification().catch((err) => {
  console.error('\n❌ TEST THẤT BẠI VỚI LỖI:', err);
  process.exit(1);
});
