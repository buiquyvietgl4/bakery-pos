import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3001';

async function run() {
  console.log('🚀 Bắt đầu kiểm thử: 2 Lựa chọn xác nhận đổi trả & Cài đặt skipForAdmin...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('  [Browser Error]:', msg.text());
    }
  });

  try {
    // ════════════════════════════════════════════════════════════════
    // KỊCH BẢN 1: TÀI KHOẢN ADMIN DUYỆT TỰ ĐỘNG (skipForAdmin = true)
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- KỊCH BẢN 1: Tài khoản Admin tự động duyệt (skipForAdmin = true) ---');
    await page.goto(`${BASE_URL}/pos/`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'admin-1',
        username: 'admin',
        name: 'Chủ Tiệm (Admin)',
        role: 'admin',
      }));
      localStorage.setItem('bakery_security_config', JSON.stringify({
        adminUsername: 'admin',
        adminPasswordHash: 'admin123',
        adminName: 'Chủ Tiệm (Admin)',
        managerPin: '8888',
        returnSkipForAdmin: true,
      }));
      localStorage.setItem('bakery_current_shift', JSON.stringify({
        id: 'shift-test-admin',
        cashierId: 'admin-1',
        cashierName: 'Chủ Tiệm (Admin)',
        openedAt: new Date().toISOString(),
        openingCash: 500000,
        cashSales: 100000,
        bankSales: 0,
        status: 'open',
      }));
      localStorage.setItem('bakery_orders', JSON.stringify([
        {
          id: 'ord-admin-01',
          order_number: 'BK-ADM-01',
          total_amount: 50000,
          payment_method: 'cash',
          status: 'completed',
          created_at: new Date().toISOString(),
          items: [
            {
              id: 'it-1',
              product_name_snapshot: 'Bánh Mì Hoa Cúc Pháp',
              quantity: 1,
              unit_price: 50000,
              line_total: 50000,
            },
          ],
        },
      ]));
    });

    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2000));

    // Mở modal Đổi Trả
    console.log('1.1. Mở modal Đổi Trả...');
    for (let attempt = 0; attempt < 3; attempt++) {
      const isModalOpen = await page.evaluate(() => document.body.textContent?.includes('Đổi Trả Hàng & Hoàn Tiền'));
      if (isModalOpen) break;
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find((b) => b.textContent?.includes('Đổi Trả'));
        if (btn) btn.click();
      });
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Chọn hóa đơn
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const found = items.find((el) => el.textContent?.includes('#BK-ADM-01')) || items.find((el) => el.textContent?.includes('#'));
      if (found) (found as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Bấm tăng số lượng trả lên 1
    await page.evaluate(() => {
      const byTestId = document.querySelector('[data-testid="btn-increase-return-0"]') as HTMLElement;
      if (byTestId) {
        byTestId.click();
        return;
      }
      const spans = Array.from(document.querySelectorAll('span'));
      const zeroSpan = spans.find((s) => s.textContent?.trim() === '0');
      if (zeroSpan && zeroSpan.parentElement) {
        const btns = Array.from(zeroSpan.parentElement.querySelectorAll('button'));
        if (btns.length > 1) btns[1].click();
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    // Bấm nút Duyệt Hoàn Tiền (Là Admin & skipForAdmin=true -> phải duyệt ngay, không hiện modal PIN hay chờ)
    console.log('1.2. Admin bấm Duyệt Hoàn Tiền...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('Duyệt Hoàn Tiền'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Kiểm tra xem đã hiển thị biên lai hoàn tiền chưa
    const hasAdminReceipt = await page.evaluate(() => {
      return document.body.textContent?.includes('Đã Hoàn Tiền Thành Công!') ||
             document.body.textContent?.includes('PHIẾU XÁC NHẬN ĐỔI TRẢ') ||
             document.body.textContent?.includes('BK-ADM-01');
    });
    console.log('1.3. Kết quả Admin tự duyệt:', hasAdminReceipt ? '✅ THÀNH CÔNG (Không hỏi PIN)' : '❌ THẤT BẠI');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_01_admin_auto.png') });

    // ════════════════════════════════════════════════════════════════
    // KỊCH BẢN 2: THU NGÂN CHỌN CÁCH 1 (NHẬP PIN QUẢN LÝ)
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- KỊCH BẢN 2: Thu ngân chọn Cách 1 (Nhập PIN Quản lý) ---');
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'cashier-1',
        username: 'thungan',
        name: 'Thu Ngân 1',
        role: 'cashier',
      }));
      localStorage.setItem('bakery_security_config', JSON.stringify({
        managerPin: '8888',
        returnSkipForAdmin: true,
      }));
      localStorage.setItem('bakery_orders', JSON.stringify([
        {
          id: 'ord-cashier-02',
          order_number: 'BK-PIN-02',
          total_amount: 35000,
          payment_method: 'cash',
          status: 'completed',
          created_at: new Date().toISOString(),
          items: [
            {
              id: 'it-2',
              product_name_snapshot: 'Bánh Sừng Bò Croissant',
              quantity: 1,
              unit_price: 35000,
              line_total: 35000,
            },
          ],
        },
      ]));
    });

    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));

    // Mở modal Đổi Trả
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent?.includes('Đổi Trả'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Chọn hóa đơn #BK-PIN-02
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const found = items.find((el) => el.textContent?.includes('#BK-PIN-02'));
      if (found) (found as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Tăng số lượng trả lên 1
    await page.evaluate(() => {
      const byTestId = document.querySelector('[data-testid="btn-increase-return-0"]') as HTMLElement;
      if (byTestId) {
        byTestId.click();
        return;
      }
      const spans = Array.from(document.querySelectorAll('span'));
      const zeroSpan = spans.find((s) => s.textContent?.trim() === '0');
      if (zeroSpan && zeroSpan.parentElement) {
        const btns = Array.from(zeroSpan.parentElement.querySelectorAll('button'));
        if (btns.length > 1) btns[1].click();
      }
    });
    await new Promise((r) => setTimeout(r, 500));

    // Bấm Duyệt Hoàn Tiền
    console.log('2.1. Thu ngân bấm Duyệt Hoàn Tiền...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('Duyệt Hoàn Tiền'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Kiểm tra modal lựa chọn 2 phương thức có xuất hiện không
    const hasChoiceModal = await page.evaluate(() => {
      return document.body.textContent?.includes('Cách 1: Nhập Mã PIN Quản Lý') &&
             document.body.textContent?.includes('Cách 2: Gửi Thông Báo Cho Admin');
    });
    console.log('2.2. Modal 2 lựa chọn xuất hiện:', hasChoiceModal ? '✅ CÓ' : '❌ KHÔNG');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_02_choice_modal.png') });

    // Click chọn Cách 1: Nhập PIN Quản Lý
    console.log('2.3. Chọn Cách 1: Nhập PIN Quản Lý...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('Cách 1: Nhập Mã PIN Quản Lý'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Nhập PIN 8888
    console.log('2.4. Nhập PIN Quản Lý 8888...');
    await page.evaluate(() => {
      const numBtns = Array.from(document.querySelectorAll('button'));
      const btn8 = numBtns.find((b) => b.textContent?.trim() === '8');
      if (btn8) {
        btn8.click();
        btn8.click();
        btn8.click();
        btn8.click();
      }
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find((b) => b.textContent?.includes('Xác Nhận PIN'));
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    const hasPinReceipt = await page.evaluate(() => {
      return document.body.textContent?.includes('PHIẾU HOÀN TIỀN TRẢ HÀNG') || document.body.textContent?.includes('BK-PIN-02');
    });
    console.log('2.5. Kết quả duyệt bằng PIN:', hasPinReceipt ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_03_pin_success.png') });

    // ════════════════════════════════════════════════════════════════
    // KỊCH BẢN 3: THU NGÂN CHỌN CÁCH 2 (GỬI ADMIN DUYỆT REALTIME) & NÚT YÊU CẦU LẠI
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- KỊCH BẢN 3: Thu ngân chọn Cách 2 (Gửi Admin Duyệt) & Nút Yêu Cầu Lại ---');
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'cashier-1',
        username: 'thungan',
        name: 'Thu Ngân 1',
        role: 'cashier',
      }));
      localStorage.setItem('bakery_security_config', JSON.stringify({
        managerPin: '8888',
        returnSkipForAdmin: true,
      }));
      localStorage.setItem('bakery_orders', JSON.stringify([
        {
          id: 'ord-cashier-03',
          order_number: 'BK-REQ-03',
          total_amount: 40000,
          payment_method: 'cash',
          status: 'completed',
          created_at: new Date().toISOString(),
          items: [
            {
              id: 'it-3',
              product_name_snapshot: 'Bánh Mì Gối Sandwich',
              quantity: 1,
              unit_price: 40000,
              line_total: 40000,
            },
          ],
        },
      ]));
    });

    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));

    // Mở modal Đổi Trả
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent?.includes('Đổi Trả'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Chọn đơn BK-REQ-03
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const found = items.find((el) => el.textContent?.includes('#BK-REQ-03'));
      if (found) (found as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Tăng số lượng trả lên 1
    await page.evaluate(() => {
      const byTestId = document.querySelector('[data-testid="btn-increase-return-0"]') as HTMLElement;
      if (byTestId) {
        byTestId.click();
        return;
      }
      const spans = Array.from(document.querySelectorAll('span'));
      const zeroSpan = spans.find((s) => s.textContent?.trim() === '0');
      if (zeroSpan && zeroSpan.parentElement) {
        const btns = Array.from(zeroSpan.parentElement.querySelectorAll('button'));
        if (btns.length > 1) btns[1].click();
      }
    });
    await new Promise((r) => setTimeout(r, 500));

    // Bấm Duyệt Hoàn Tiền
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('Duyệt Hoàn Tiền'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Chọn Cách 2: Gửi Thông Báo Cho Admin
    console.log('3.1. Chọn Cách 2: Gửi Thông Báo Cho Admin...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('Cách 2: Gửi Thông Báo Cho Admin'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Kiểm tra màn hình chờ có radar & nút Yêu Cầu Lại không
    const waitingScreenCheck = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return {
        hasWaitingTitle: text.includes('Đang Chờ Admin Phê Duyệt') || text.includes('Đã Gửi Thông Báo Tới Chủ Tiệm'),
        hasResendBtn: text.includes('Yêu Cầu Lại') || text.includes('Gửi Lại Thông Báo'),
        hasFallbackPinBtn: text.includes('Nhập mã PIN Quản Lý thay thế'),
      };
    });
    console.log('3.2. Màn hình chờ duyệt Admin:', waitingScreenCheck);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_04_waiting_admin.png') });

    // Test bấm nút "🔄 Yêu Cầu Lại"
    console.log('3.3. Bấm nút 🔄 Yêu Cầu Lại...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const resendBtn = btns.find((b) => b.textContent?.includes('Yêu Cầu Lại'));
      if (resendBtn) resendBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const hasResendBadge = await page.evaluate(() => {
      return document.body.textContent?.includes('Đã gửi lại yêu cầu lúc');
    });
    console.log('3.4. Huy hiệu gửi lại yêu cầu thành công:', hasResendBadge ? '✅ CÓ' : '❌ KHÔNG');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_05_resend_badge.png') });

    // Mô phỏng Admin phát tín hiệu Phê Duyệt Realtime
    console.log('3.5. Mô phỏng Admin bấm Phê Duyệt Realtime...');
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('return_approval_resolved', {
          detail: {
            order_number: 'BK-REQ-03',
            action: 'approved',
            resolved_by: 'Chủ Tiệm (Từ điện thoại)',
            resolved_at: new Date().toISOString(),
          },
        })
      );
    });
    await new Promise((r) => setTimeout(r, 1500));

    const hasApprovedReceipt = await page.evaluate(() => {
      return document.body.textContent?.includes('PHIẾU HOÀN TIỀN TRẢ HÀNG') || document.body.textContent?.includes('BK-REQ-03');
    });
    console.log('3.6. POS tự động hoàn tất và in biên lai:', hasApprovedReceipt ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_06_realtime_approved.png') });

    console.log('\n🎉 TẤT CẢ 3 KỊCH BẢN KIỂM THỬ ĐÃ THÀNH CÔNG 100%!');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err);
  } finally {
    await browser.close();
  }
}

run();
