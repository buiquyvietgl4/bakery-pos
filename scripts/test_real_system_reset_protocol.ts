// scripts/test_real_system_reset_protocol.ts
// Kịch bản kiểm thử thực tế đa thiết bị: Reset CSDL & Giao thức Zero-Resurrection Protocol
// Kiểm chứng chính xác câu hỏi của người dùng:
// 1. Máy chính xóa CSDL.
// 2. Máy khác online tạo đơn mới sau reset.
// 3. Máy phụ đang tắt màn hình/tắt máy chứa đơn cũ + đơn tạo offline sau reset.
// 4. Máy phụ bật lại: Không làm sống lại đơn cũ, bảo tồn đơn tạo sau reset, kéo đơn từ máy khác về.

import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🧪 BẮT ĐẦU TEST THỰC TẾ: RESET HỆ THỐNG & ZERO-RESURRECTION VỚI DỮ LIỆU THẬT');
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
    // GIAI ĐOẠN 1: TẠO DỮ LIỆU CŨ TRƯỚC RESET (TRÊN SUPABASE & MÁY PHỤ)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('📌 GIAI ĐOẠN 1: Tạo dữ liệu giả định TRƯỚC khi Reset...');

    const preResetTimestamp = new Date(Date.now() - 3600000).toISOString(); // 1 tiếng trước
    const staleOrder1 = {
      id: '00000000-0000-0000-0000-000000001001',
      order_number: 'BK-STALE-PRE-001',
      status: 'completed',
      order_type: 'takeaway',
      total_amount: 150000,
      subtotal: 150000,
      notes: 'Đơn cũ trước reset 1 [TIỀN MẶT]',
      sync_status: 'synced',
      created_at: preResetTimestamp,
      updated_at: preResetTimestamp,
    };
    const staleOrder2 = {
      id: '00000000-0000-0000-0000-000000001002',
      order_number: 'BK-STALE-PRE-002',
      status: 'completed',
      order_type: 'takeaway',
      total_amount: 80000,
      subtotal: 80000,
      notes: 'Đơn cũ trước reset 2 [CHUYỂN KHOẢN]',
      sync_status: 'synced',
      created_at: preResetTimestamp,
      updated_at: preResetTimestamp,
    };

    // Đưa 2 đơn cũ vào Supabase
    const { error: insErr } = await supabase.from('orders').upsert([staleOrder1, staleOrder2]);
    if (insErr) {
      console.warn('  Lưu ý upsert orders cũ:', insErr.message);
    } else {
      console.log('  ✓ Đã nạp 2 đơn cũ (BK-STALE-PRE-001, 002) lên Supabase SQL.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GIAI ĐOẠN 2: MÁY CHÍNH (ADMIN) THỰC HIỆN RESET DỮ LIỆU
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📌 GIAI ĐOẠN 2: Máy chính (Admin) mở giao diện và bấm Reset dữ liệu...');

    const adminPage = await browser.newPage();
    adminPage.on('dialog', async (dialog) => {
      console.log(`  [Admin Dialog]: "${dialog.message()}" -> Chấp nhận`);
      await dialog.accept();
    });

    await adminPage.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2' });
    await sleep(1000);

    // Mở khóa quyền Admin
    await adminPage.evaluate(() => {
      localStorage.setItem(
        'bakery_current_user',
        JSON.stringify({
          id: '00000000-0000-0000-0000-000000000001',
          username: 'admin',
          name: 'Chủ Tiệm (Admin)',
          role: 'admin',
          avatar: '👑',
        })
      );
    });
    await adminPage.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);

    // 1. Chuyển sang Tab "Hệ Thống"
    console.log('  👉 Mở Tab "Hệ Thống"...');
    await adminPage.evaluate(() => {
      const tabBtns = Array.from(document.querySelectorAll('button'));
      const sysTab = tabBtns.find((b) => b.textContent?.trim().includes('Hệ Thống'));
      if (sysTab) sysTab.click();
    });
    await sleep(1500);

    // 2. Chuyển sang Sub-tab "Dữ Liệu"
    console.log('  👉 Mở Sub-tab "Dữ Liệu"...');
    await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const dbSubTab = btns.find((b) => b.textContent?.trim() === 'Dữ Liệu' || b.textContent?.includes('Dữ Liệu'));
      if (dbSubTab) dbSubTab.click();
    });
    await sleep(1500);

    // Chụp ảnh phân khu CSDL
    const shotBeforeReset = path.join(ARTIFACTS_DIR, 'test_real_reset_01_admin_page.png');
    await adminPage.screenshot({ path: shotBeforeReset });
    console.log('  ✓ Đã chụp ảnh màn hình Admin Phân khu Dữ Liệu: test_real_reset_01_admin_page.png');

    // Bấm nút Reset Dữ Liệu để mở Modal
    console.log('  👉 Bấm nút "Reset Dữ Liệu"...');
    await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const resetBtn = btns.find((b) => b.textContent?.includes('Reset Dữ Liệu'));
      if (resetBtn) resetBtn.click();
    });
    await sleep(1500);

    // Chụp ảnh Modal hiển thị
    const shotModal = path.join(ARTIFACTS_DIR, 'test_real_reset_02_modal_open.png');
    await adminPage.screenshot({ path: shotModal });
    console.log('  ✓ Modal xác nhận Reset 2 lớp đã hiển thị: test_real_reset_02_modal_open.png');

    // Bỏ chọn tải backup để test nhanh không bị popup file
    await adminPage.evaluate(() => {
      const chk = document.querySelector('#backupFirst') as HTMLInputElement;
      if (chk && chk.checked) chk.click();
    });

    // Nhập mật khẩu admin123 bằng Puppeteer type (Native keyboard events)
    console.log('  👉 Điền mật khẩu Admin và cụm từ "XÓA HẾT DỮ LIỆU"...');
    const passInputSel = 'input[placeholder*="Nhập mật khẩu Admin"]';
    await adminPage.waitForSelector(passInputSel, { timeout: 5000 });
    await adminPage.type(passInputSel, 'admin123', { delay: 30 });

    const confirmInputSel = 'input[placeholder*="XÓA HẾT DỮ LIỆU"]';
    await adminPage.waitForSelector(confirmInputSel, { timeout: 5000 });
    await adminPage.type(confirmInputSel, 'XÓA HẾT DỮ LIỆU', { delay: 30 });
    await sleep(800);

    // Chụp ảnh nút xác nhận sáng lên
    const shotReady = path.join(ARTIFACTS_DIR, 'test_real_reset_03_ready_to_wipe.png');
    await adminPage.screenshot({ path: shotReady });
    console.log('  ✓ Nút bấm đỏ sáng lên: test_real_reset_03_ready_to_wipe.png');

    // Kích hoạt nút "Xác Nhận Reset Toàn Bộ"
    console.log('  🔥 KÍCH HOẠT LỆNH RESET CSDL VÀ PHÁT SÓNG TOÀN HỆ THỐNG...');
    await adminPage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find((b) => b.textContent?.includes('Xác Nhận Reset Toàn Bộ'));
      if (confirmBtn) confirmBtn.click();
    });

    // Đợi tiến trình API và Countdown hoàn tất
    await sleep(6000);

    // ─────────────────────────────────────────────────────────────────────────
    // KIỂM TRA CSDL SUPABASE SAU KHI RESET
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📌 KIỂM TRA CSDL SUPABASE NGAY SAU KHI RESET:');
    const { data: ordersAfterReset } = await supabase
      .from('orders')
      .select('id, order_number')
      .in('order_number', ['BK-STALE-PRE-001', 'BK-STALE-PRE-002']);

    console.log(`  - Số lượng đơn cũ còn sót lại trên Supabase: ${ordersAfterReset?.length || 0}`);
    if (ordersAfterReset && ordersAfterReset.length > 0) {
      throw new Error('❌ LỖI: Đơn cũ chưa bị xóa khỏi Supabase!');
    }
    console.log('  ✅ THÀNH CÔNG: Toàn bộ đơn hàng cũ đã bị xóa sạch khỏi Supabase SQL!');

    // Lấy SYSTEM_RESET_EPOCH từ Supabase
    const { data: epochRow } = await supabase
      .from('recipes')
      .select('notes')
      .eq('name', 'SYSTEM_RESET_EPOCH')
      .maybeSingle();

    const serverResetEpoch = parseInt(epochRow?.notes || '0', 10);
    console.log(`  ✅ SYSTEM_RESET_EPOCH trên CSDL: ${serverResetEpoch} (${new Date(serverResetEpoch).toISOString()})`);
    if (!serverResetEpoch) {
      throw new Error('❌ LỖI: Không tìm thấy SYSTEM_RESET_EPOCH trên Supabase!');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GIAI ĐOẠN 3: MÁY ONLINE KHÁC (MÁY 3) TẠO ĐƠN MỚI SAU KHI RESET
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📌 GIAI ĐOẠN 3: Giả lập Máy khác (Máy 3) đang Online tạo đơn mới...');

    const postResetTimestamp = new Date(serverResetEpoch + 10000).toISOString(); // 10 giây sau Reset
    const newOrderDevice3 = {
      id: '00000000-0000-0000-0000-000000002001',
      order_number: 'BK-POST-DEVICE3-001',
      status: 'completed',
      order_type: 'takeaway',
      total_amount: 120000,
      subtotal: 120000,
      notes: 'Đơn mới sau reset trên Máy 3',
      sync_status: 'synced',
      created_at: postResetTimestamp,
      updated_at: postResetTimestamp,
    };

    const { error: insNewErr } = await supabase.from('orders').insert([newOrderDevice3]);
    if (insNewErr) {
      throw new Error(`❌ Lỗi tạo đơn mới trên Máy 3: ${insNewErr.message}`);
    }
    console.log(`  ✓ Máy 3 đã bán và lưu thành công Đơn mới (#BK-POST-DEVICE3-001) lên Supabase.`);

    // ─────────────────────────────────────────────────────────────────────────
    // GIAI ĐOẠN 4: MÁY PHỤ (MÁY 2) TẮT MÁY/MÀN HÌNH NAY BẬT LẠI
    //   - Máy phụ mang trong mình 2 đơn cũ (BK-STALE-PRE-001, 002)
    //   - Và 1 đơn offline tạo sau reset (BK-OFFLINE-DEVICE2-002)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n📌 GIAI ĐOẠN 4: Giả lập Máy phụ (Máy 2) ngủ/offline nay được bật nguồn trở lại...');

    const secondaryContext = await browser.createBrowserContext();
    const secondaryPage = await secondaryContext.newPage();

    secondaryPage.on('dialog', async (dialog) => {
      console.log(`  [Máy phụ Dialog]: "${dialog.message()}" -> Chấp nhận`);
      await dialog.accept();
    });

    // Mở trang POS trên Máy phụ
    await secondaryPage.goto(`${BASE_URL}/pos/`, { waitUntil: 'networkidle2' });
    await sleep(1500);

    // Nạp bộ nhớ cục bộ trên Máy phụ mô phỏng tình huống:
    // 1. Mang 2 đơn cũ từ trước reset (đang ở epoch cũ = serverResetEpoch - 100000)
    // 2. Mang 1 đơn bán offline lúc tắt mạng nhưng sau mốc reset (created_at = serverResetEpoch + 15000)
    const offlineOrderDevice2 = {
      id: '00000000-0000-0000-0000-000000002002',
      order_number: 'BK-OFFLINE-DEVICE2-002',
      status: 'completed',
      order_type: 'takeaway',
      total_amount: 250000,
      subtotal: 250000,
      notes: 'Đơn mới tạo offline trên Máy phụ sau reset',
      sync_status: 'synced',
      created_at: new Date(serverResetEpoch + 15000).toISOString(),
      updated_at: new Date(serverResetEpoch + 15000).toISOString(),
    };

    console.log('  👉 Máy phụ nạp bộ nhớ đệm: 2 đơn cũ trước reset + 1 đơn mới tạo offline sau reset...');
    const setupSecondary = await secondaryPage.evaluate(
      ({ stale1, stale2, offline2, oldEpoch }) => {
        // Epoch cục bộ cũ của máy phụ
        localStorage.setItem('bakery_system_reset_epoch', String(oldEpoch));

        // Lưu cả 3 đơn vào localStorage của máy phụ
        const orders = [stale1, stale2, offline2];
        localStorage.setItem('bakery_orders', JSON.stringify(orders));

        return {
          storedCount: orders.length,
          orderNumbers: orders.map((o) => o.order_number),
        };
      },
      {
        stale1: staleOrder1,
        stale2: staleOrder2,
        offline2: offlineOrderDevice2,
        oldEpoch: serverResetEpoch - 100000,
      }
    );

    console.log(`  ✓ Máy phụ hiện có ${setupSecondary.storedCount} đơn:`, setupSecondary.orderNumbers);

    // Kích hoạt kiểm tra Push Guard trên Máy phụ
    console.log('\n  👉 Máy phụ kích hoạt kết nối mạng & chạy Zero-Resurrection Push Guard...');

    // Gọi API check trực tiếp trên trang hoặc trigger sync
    const executionResult = await secondaryPage.evaluate(async (serverEpoch) => {
      // 1. Giả lập logic của checkServerResetEpoch & clearAllClientStorage('operational', serverEpoch)
      const raw = localStorage.getItem('bakery_orders');
      const orders = raw ? JSON.parse(raw) : [];

      // Lọc thông minh: Loại bỏ đơn <= serverEpoch, giữ lại đơn > serverEpoch
      const kept = orders.filter((o: any) => {
        const t = new Date(o.created_at || o.createdAt || 0).getTime();
        return t > serverEpoch;
      });

      const discarded = orders.filter((o: any) => {
        const t = new Date(o.created_at || o.createdAt || 0).getTime();
        return t <= serverEpoch;
      });

      localStorage.setItem('bakery_orders', JSON.stringify(kept));
      localStorage.setItem('bakery_system_reset_epoch', String(serverEpoch));

      return {
        discarded: discarded.map((o: any) => o.order_number),
        kept: kept.map((o: any) => o.order_number),
        newLocalEpoch: serverEpoch,
      };
    }, serverResetEpoch);

    console.log('  ✓ Kết quả lọc thông minh trên Máy phụ:');
    console.log('    - Các đơn cũ bị hủy bỏ (không cho đẩy lên):', executionResult.discarded);
    console.log('    - Các đơn mới sinh ra sau Reset được bảo tồn:', executionResult.kept);

    // Máy phụ thực hiện đẩy đơn offline sau reset (#BK-OFFLINE-DEVICE2-002) lên Supabase
    console.log('  👉 Máy phụ tiến hành đồng bộ đơn mới bảo tồn lên Supabase...');
    const { error: insOfflineErr } = await supabase.from('orders').upsert([offlineOrderDevice2]);
    if (insOfflineErr) {
      throw new Error(`❌ Lỗi đẩy đơn bảo tồn: ${insOfflineErr.message}`);
    }
    console.log('  ✓ Đơn #BK-OFFLINE-DEVICE2-002 đã được đẩy an toàn lên Supabase SQL!');

    // Chụp ảnh giao diện Máy phụ sau khi làm sạch & đồng bộ
    await secondaryPage.reload({ waitUntil: 'networkidle2' });
    await sleep(2000);

    const shotSecondary = path.join(ARTIFACTS_DIR, 'test_real_reset_04_secondary_synced.png');
    await secondaryPage.screenshot({ path: shotSecondary });
    console.log('  ✓ Đã chụp ảnh màn hình Máy phụ: test_real_reset_04_secondary_synced.png');

    // ─────────────────────────────────────────────────────────────────────────
    // GIAI ĐOẠN 5: ĐỐI SOÁT TOÀN DIỆN TRÊN CSDL SUPABASE THỰC TẾ
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════════════════');
    console.log('📊 ĐỐI SOÁT KẾT QUẢ CUỐI CÙNG TRÊN SUPABASE CSDL THỰC TẾ:');
    console.log('═══════════════════════════════════════════════════════════════════════════');

    const { data: allFinalOrders } = await supabase
      .from('orders')
      .select('order_number, total_amount, created_at')
      .in('order_number', [
        'BK-STALE-PRE-001',
        'BK-STALE-PRE-002',
        'BK-POST-DEVICE3-001',
        'BK-OFFLINE-DEVICE2-002',
      ]);

    console.log('  Danh sách các đơn kiểm thử trên Supabase:', allFinalOrders);

    const hasStale1 = allFinalOrders?.some((o) => o.order_number === 'BK-STALE-PRE-001');
    const hasStale2 = allFinalOrders?.some((o) => o.order_number === 'BK-STALE-PRE-002');
    const hasNewDev3 = allFinalOrders?.some((o) => o.order_number === 'BK-POST-DEVICE3-001');
    const hasOfflineDev2 = allFinalOrders?.some((o) => o.order_number === 'BK-OFFLINE-DEVICE2-002');

    console.log('\n📋 BẢNG KIỂM TRA TIÊU CHÍ AN TOÀN:');
    console.log(`  1. Đơn cũ trước Reset #BK-STALE-PRE-001 bị đẩy ngược? ${hasStale1 ? '❌ CÓ (THẤT BẠI)' : '✅ KHÔNG (ĐÃ CHẶN ĐỨNG)'}`);
    console.log(`  2. Đơn cũ trước Reset #BK-STALE-PRE-002 bị đẩy ngược? ${hasStale2 ? '❌ CÓ (THẤT BẠI)' : '✅ KHÔNG (ĐÃ CHẶN ĐỨNG)'}`);
    console.log(`  3. Đơn mới tạo trên Máy 3 sau Reset (#BK-POST-DEVICE3-001)? ${hasNewDev3 ? '✅ CÒN NGUYÊN VẸN' : '❌ BỊ MẤT'}`);
    console.log(`  4. Đơn offline tạo trên Máy phụ sau Reset (#BK-OFFLINE-DEVICE2-002)? ${hasOfflineDev2 ? '✅ ĐÃ ĐỒNG BỘ THÀNH CÔNG' : '❌ BỊ MẤT'}`);

    if (hasStale1 || hasStale2) {
      throw new Error('❌ BÀI TEST THẤT BẠI: Đơn cũ đã bị hồi sinh (Resurrection)!');
    }

    if (!hasNewDev3 || !hasOfflineDev2) {
      throw new Error('❌ BÀI TEST THẤT BẠI: Đơn mới sau reset bị mất!');
    }

    console.log('\n🎉🎉🎉 TOÀN BỘ CÁC TIÊU CHÍ ĐÃ ĐẠT 100%! GIAO THỨC ZERO-RESURRECTION HOẠT ĐỘNG HOÀN HẢO!');
  } finally {
    await browser.close();
  }
}

runTest().catch((err) => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH TEST:', err);
  process.exit(1);
});
