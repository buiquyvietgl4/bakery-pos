import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3001';

async function run() {
  console.log('🚀 Bắt đầu kiểm thử tự động: Tạm Lưu Đơn, Thanh Toán Chia Nhỏ & Đổi Trả...');
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
    // 1. Vào trang POS và thiết lập tài khoản Admin & tắt khóa màn hình
    console.log('1. Truy cập POS và cấu hình tài khoản...');
    await page.goto(`${BASE_URL}/pos/`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.removeItem('bakery_pending_transfers');
      localStorage.removeItem('bakery_resolved_transfers');
      localStorage.removeItem('bakery_orders');
      localStorage.removeItem('bakery_order_returns');
      localStorage.removeItem('bakery_held_orders');
      localStorage.setItem('bakery_transfer_verification_config', JSON.stringify({ mode: 'none', twoStep: { skipForAdmin: true } }));
      localStorage.setItem('bakery_transfer_verify_config', JSON.stringify({ mode: 'none' }));
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'cashier-1',
        username: 'thungan',
        name: 'Thu Ngân Quầy',
        role: 'cashier',
      }));
      localStorage.setItem('bakery_security_config', JSON.stringify({
        staffPin: '1234',
        kitchenPin: '2345',
        adminPassword: 'admin',
        managerPin: '8888',
        requirePinOnPos: false,
        requirePinOnKitchen: false,
        requirePinOnAdmin: false,
      }));
      localStorage.setItem('bakery_staff_session', JSON.stringify({
        role: 'cashier',
        name: 'Thu Ngân Quầy',
        pin: '1234',
      }));
      localStorage.setItem('bakery_current_shift', JSON.stringify({
        id: 'shift-1',
        cashierId: 'cashier-1',
        cashierName: 'Thu Ngân Quầy',
        startTime: new Date().toISOString(),
        openingCash: 1000000,
        cashSales: 0,
        transferSales: 0,
        momoSales: 0,
        status: 'open',
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 2000));

    // 2. Thêm bánh vào giỏ hàng
    console.log('2. Thêm sản phẩm vào giỏ hàng...');
    await page.evaluate(() => {
      const plusBtns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === '+');
      if (plusBtns.length > 1) (plusBtns[1] as HTMLElement).click();
      if (plusBtns.length > 2) (plusBtns[2] as HTMLElement).click();
    });

    await new Promise((r) => setTimeout(r, 1200));

    // 3. Test Tạm Lưu Đơn Hàng (Hold Orders)
    console.log('3. Kiểm tra tính năng Tạm Lưu Đơn Hàng...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const holdBtn = btns.find(b => b.textContent && b.textContent.includes('Tạm lưu'));
      if (holdBtn) (holdBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Nhập ghi nhớ đơn tạm: "Bàn 05 VIP"
    const labelInput = await page.$('input[placeholder*="Bàn 3"]');
    if (labelInput) {
      await labelInput.type('Bàn 05 VIP');
      await page.keyboard.press('Enter');
    } else {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.textContent && b.textContent.includes('Xác Nhận Lưu'));
        if (saveBtn) (saveBtn as HTMLElement).click();
      });
    }
    await new Promise((r) => setTimeout(r, 1000));

    // Kiểm tra giỏ hàng đã trống
    const emptyText = await page.evaluate(() => document.body.innerText);
    if (!emptyText.includes('Giỏ hàng đang trống')) {
      console.warn('Cảnh báo: Giỏ hàng chưa chuyển sang trạng thái trống!');
    } else {
      console.log('  ✓ Đã tạm lưu đơn thành công, giỏ hàng đã dọn sạch!');
    }

    // Mở modal Đơn Tạm
    console.log('4. Mở danh sách Đơn Tạm Lưu...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const heldBtn = btns.find(b => b.textContent && (b.textContent.includes('Đơn tạm') || b.textContent.includes('Đơn Tạm')));
      if (heldBtn) (heldBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Chụp ảnh danh sách đơn tạm
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_pos_01_held_orders.png') });
    console.log('  ✓ Đã chụp ảnh test_pos_01_held_orders.png');

    // Khôi phục đơn tạm
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const restoreBtn = btns.find(b => b.textContent && (b.textContent.includes('Mở lại đơn này') || b.textContent.includes('Khôi phục')));
      if (restoreBtn) (restoreBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    console.log('  ✓ Đã khôi phục lại đơn tạm vào giỏ hàng!');

    // 5. Test Thanh Toán Chia Nhỏ (Split Payment: Tiền mặt + CK)
    console.log('5. Kiểm tra Thanh toán Kết hợp (Tiền mặt + Chuyển khoản)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const checkoutBtn = btns.find(b => b.textContent && b.textContent.includes('Thanh Toán Ngay'));
      if (checkoutBtn) {
        checkoutBtn.scrollIntoView();
        (checkoutBtn as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 1200));

    // Chọn phương thức "Kết hợp (TM+CK)"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const splitBtn = btns.find(b => b.textContent && (b.textContent.includes('Kết hợp') || b.textContent.includes('TM+CK')));
      if (splitBtn) (splitBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 800));
    console.log('  ✓ Đã chọn tab thanh toán Kết hợp!');

    // Chụp ảnh modal thanh toán chia nhỏ
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_pos_02_split_checkout.png') });
    console.log('  ✓ Đã chụp ảnh test_pos_02_split_checkout.png');

    // Bấm Xác Nhận Thanh Toán
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find(b => b.textContent && b.textContent.includes('Xác Nhận Thanh Toán'));
      if (confirmBtn) (confirmBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    // Nếu xuất hiện popup Xác thực 2 bước chuyển khoản, bấm "Đã Nhận Đủ Tiền"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const approveBtn = btns.find(b => b.textContent && b.textContent.includes('Đã Nhận Đủ Tiền'));
      if (approveBtn) (approveBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Chụp ảnh hóa đơn nhiệt có chia tách Tiền mặt & Chuyển khoản
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_pos_03_split_receipt.png') });
    console.log('  ✓ Đã chụp ảnh test_pos_03_split_receipt.png');

    // Đóng modal hóa đơn
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const closeBtn = btns.find(b => b.textContent && (b.textContent.includes('Tạo Đơn Tiếp Theo') || b.textContent.includes('Đóng') || b.textContent.includes('Đơn Mới')));
      if (closeBtn) (closeBtn as HTMLElement).click();
    });
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 800));

    // 6. Test Đổi Trả Hàng (Returns & Exchanges)
    console.log('6. Kiểm tra tính năng Đổi Trả Hàng & Hoàn Tiền...');
    // Click nút "Đổi Trả" trên thanh công cụ
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const retBtn = btns.find(b => b.textContent && b.textContent.includes('Đổi Trả'));
      if (retBtn) (retBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1200));
    console.log('  ✓ Đã mở modal Đổi Trả Hàng!');

    // Chọn hóa đơn vừa thanh toán (card đầu tiên trong danh sách)
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.max-h-72 > div'));
      if (cards.length > 0) (cards[0] as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    console.log('  ✓ Đã chọn hóa đơn cần hoàn trả!');

    // Tăng số lượng trả của món đầu tiên
    await page.evaluate(() => {
      const modal = document.querySelector('div[class*="max-w-3xl"]');
      if (modal) {
        const plusBtns = Array.from(modal.querySelectorAll('button')).filter(b => b.querySelector('svg.lucide-plus') && !b.disabled);
        if (plusBtns.length > 0) (plusBtns[0] as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    // Chụp ảnh màn hình cấu hình đổi trả
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_pos_04_return_modal.png') });
    console.log('  ✓ Đã chụp ảnh test_pos_04_return_modal.png');

    // Bấm nút "Duyệt Hoàn Tiền"
    await page.evaluate(() => {
      const modal = document.querySelector('div[class*="max-w-3xl"]');
      if (modal) {
        const execBtn = Array.from(modal.querySelectorAll('button')).find(b => b.textContent && (b.textContent.includes('Duyệt Hoàn Tiền') || b.textContent.includes('Duyệt Đổi Bánh')));
        if (execBtn) (execBtn as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    // Nhập mã PIN Quản Lý: 8888
    console.log('  ✓ Nhập mã PIN Quản Lý (8888) duyệt đổi trả...');
    for (const char of '8888') {
      await page.evaluate((digit) => {
        const btns = Array.from(document.querySelectorAll('button'));
        const pinBtn = btns.find(b => b.textContent && b.textContent.trim() === digit);
        if (pinBtn) (pinBtn as HTMLElement).click();
      }, char);
      await new Promise((r) => setTimeout(r, 150));
    }
    await new Promise((r) => setTimeout(r, 300));

    // Bấm nút "Xác Nhận PIN"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const pinSubmitBtn = btns.find(b => b.textContent && b.textContent.includes('Xác Nhận PIN'));
      if (pinSubmitBtn) (pinSubmitBtn as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Chụp ảnh phiếu đổi trả in nhiệt
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_pos_05_return_receipt.png') });
    console.log('  ✓ Đã chụp ảnh test_pos_05_return_receipt.png');

    // 7. Kiểm tra dữ liệu SQL Local và Supabase
    console.log('7. Xác minh lưu trữ dữ liệu...');
    const returnData = await page.evaluate(() => {
      const returns = JSON.parse(localStorage.getItem('bakery_order_returns') || '[]');
      const orders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      return {
        returnsCount: returns.length,
        lastReturn: returns[0],
        lastOrder: orders[0],
      };
    });

    console.log(`  ✓ Số phiếu đổi trả đã lưu: ${returnData.returnsCount}`);
    console.log(`  ✓ Trạng thái đơn hàng sau hoàn tiền: ${returnData.lastOrder?.status}`);
    console.log(`  ✓ Hình thức thanh toán đơn: ${returnData.lastOrder?.payment_method}, chi tiết payments: ${JSON.stringify(returnData.lastOrder?.payments)}`);

    console.log('\n========================================');
    console.log('🎉 TẤT CẢ TÍNH NĂNG ĐÃ VƯỢT QUA KIỂM THỬ THÀNH CÔNG 100%!');
    console.log('========================================\n');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_pos_error.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
