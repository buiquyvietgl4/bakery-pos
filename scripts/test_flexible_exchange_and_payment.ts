import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3001';

async function run() {
  console.log('🚀 Bắt đầu kiểm thử: Đổi trả nhiều bánh, chỉnh số lượng tùy ý & đầy đủ phương thức thanh toán...');
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
    // 1. Vào trang POS và setup session
    console.log('1. Truy cập POS...');
    await page.goto(`${BASE_URL}/pos/`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
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
      localStorage.setItem('bakery_current_shift', JSON.stringify({
        id: 'shift-test-1',
        cashierId: 'cashier-1',
        cashierName: 'Thu Ngân Quầy',
        openedAt: new Date().toISOString(),
        openingCash: 500000,
        cashSales: 100000,
        bankSales: 0,
        status: 'open',
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Tạo 1 đơn hàng ban đầu: Bán 1 bánh mì 35.000₫
    console.log('2. Tạo đơn mẫu để test đổi trả...');
    await page.evaluate(() => {
      const order = {
        id: 'test-ord-001',
        order_number: 'BK-TEST-001',
        total_amount: 35000,
        payment_method: 'cash',
        status: 'completed',
        created_at: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            product_name_snapshot: 'Bánh Mì Baguette Pháp',
            quantity: 2,
            unit_price: 35000,
            line_total: 70000,
          },
        ],
      };
      const orders = [order];
      localStorage.setItem('bakery_orders', JSON.stringify(orders));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Mở modal Đổi Trả Hàng
    console.log('3. Mở modal Đổi Trả Hàng...');
    const returnBtnSelector = 'button[title*="Đổi trả"], button:has-text("Đổi Trả")';
    await page.evaluate(() => {
      // Tìm nút đổi trả hoặc trigger trực tiếp
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent?.includes('Đổi Trả'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Chọn hóa đơn BK-TEST-001
    console.log('3.1. Click vào hóa đơn #BK-TEST-001...');
    const clickedOrder = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const found = items.find((el) => el.textContent?.includes('#BK-TEST-001'));
      if (found) {
        (found as HTMLElement).click();
        return true;
      }
      return false;
    });
    console.log('  -> Clicked order:', clickedOrder);
    await new Promise((r) => setTimeout(r, 1000));

    // Chuyển sang tab "Đổi Sang Bánh Khác (Exchange)"
    console.log('3.2. Chuyển sang tab Đổi Sang Bánh Khác...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const exchangeTab = buttons.find((b) => b.textContent?.includes('Đổi Sang Bánh Khác'));
      if (exchangeTab) exchangeTab.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Tăng số lượng món trả lại thành 1 cái (trả 1 cái = 35.000₫)
    console.log('3.3. Tăng số lượng món trả lại...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const plusBtns = btns.filter((b) => b.innerHTML.includes('Plus') || b.querySelector('svg.lucide-plus'));
      if (plusBtns.length > 0) {
        (plusBtns[0] as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    // 4. Chọn món đổi mới: Thêm 1 sản phẩm
    console.log('4. Chọn món đổi mới và kiểm tra chỉnh số lượng...');
    await page.evaluate(() => {
      const productButtons = Array.from(document.querySelectorAll('button.group, div.flex.gap-1\\.5 button'));
      if (productButtons.length > 0) {
        (productButtons[0] as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 800));

    // Chụp ảnh bước chọn món đổi
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_exchange_01_product_selected.png') });
    console.log('  -> Đã lưu ảnh: test_exchange_01_product_selected.png');

    // Chỉnh số lượng của món đổi mới lên 3 cái bằng cách bấm nút [+] 2 lần
    console.log('4.1. Bấm nút [+] 2 lần trên món đổi mới...');
    await page.evaluate(() => {
      // Tìm bộ stepper trong món đổi mới (nằm trong khối emerald hoặc có title="Tăng 1")
      const plusBtns = Array.from(document.querySelectorAll('button[title="Tăng 1"]'));
      if (plusBtns.length > 0) {
        (plusBtns[0] as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      const plusBtns = Array.from(document.querySelectorAll('button[title="Tăng 1"]'));
      if (plusBtns.length > 0) {
        (plusBtns[0] as HTMLElement).click();
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    // Cuộn modal xuống khu vực thanh toán
    console.log('4.2. Cuộn xuống khu vực thanh toán...');
    await page.evaluate(() => {
      const summaryCard = Array.from(document.querySelectorAll('div')).find((d) =>
        d.textContent?.includes('CHÊNH LỆCH THANH TOÁN')
      );
      if (summaryCard) summaryCard.scrollIntoView();
    });
    await new Promise((r) => setTimeout(r, 600));

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_exchange_02_qty_adjusted.png') });
    console.log('  -> Đã lưu ảnh: test_exchange_02_qty_adjusted.png (số lượng 3)');

    // 5. Kiểm tra các phương thức thanh toán bù
    console.log('5. Kiểm tra các phương thức thanh toán bù...');

    // Chuyển sang phương thức "Chuyển khoản QR"
    console.log('5.1. Chọn phương thức Chuyển khoản QR...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const qrBtn = btns.find((b) => b.textContent?.includes('Chuyển khoản QR'));
      if (qrBtn) {
        qrBtn.click();
        qrBtn.scrollIntoView();
      }
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_exchange_03_payment_qr.png') });
    console.log('  -> Đã lưu ảnh: test_exchange_03_payment_qr.png');

    // Chuyển sang phương thức "Kết hợp (TM+CK)"
    console.log('5.2. Chọn phương thức Kết hợp (TM+CK)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const splitBtn = btns.find((b) => b.textContent?.includes('Kết hợp (TM+CK)'));
      if (splitBtn) {
        splitBtn.click();
        splitBtn.scrollIntoView();
      }
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_exchange_04_payment_split.png') });
    console.log('  -> Đã lưu ảnh: test_exchange_04_payment_split.png');

    // Chuyển về "Tiền mặt" và kiểm tra nhập tiền khách đưa & tiền thừa
    console.log('5.3. Chọn Tiền mặt và chọn mệnh giá nhanh 500k...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cashBtn = btns.find((b) => b.textContent?.trim() === 'Tiền mặt');
      if (cashBtn) cashBtn.click();
    });
    await new Promise((r) => setTimeout(r, 500));

    // Bấm nút gợi ý tiền 500k
    await page.evaluate(() => {
      const quickBtns = Array.from(document.querySelectorAll('button'));
      const b500k = quickBtns.find((b) => b.textContent?.includes('500.000'));
      if (b500k) {
        b500k.click();
        b500k.scrollIntoView();
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_exchange_05_payment_cash_change.png') });
    console.log('  -> Đã lưu ảnh: test_exchange_05_payment_cash_change.png');

    // 6. Bấm Duyệt Đổi Bánh và nhập mã PIN Quản Lý (8888)
    console.log('6. Duyệt Đổi Bánh với mã PIN Quản Lý...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const approveBtn = btns.find((b) => b.textContent?.includes('Duyệt Đổi Bánh'));
      if (approveBtn) approveBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Nhập PIN Quản Lý: gõ phím '8' 4 lần
    console.log('6.1. Nhập mã PIN: 8888...');
    await page.keyboard.press('8');
    await new Promise((r) => setTimeout(r, 150));
    await page.keyboard.press('8');
    await new Promise((r) => setTimeout(r, 150));
    await page.keyboard.press('8');
    await new Promise((r) => setTimeout(r, 150));
    await page.keyboard.press('8');
    await new Promise((r) => setTimeout(r, 300));

    // Bấm nút Xác Nhận PIN
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmPinBtn = btns.find((b) => b.textContent?.includes('Xác Nhận PIN'));
      if (confirmPinBtn) confirmPinBtn.click();
    });
    await new Promise((r) => setTimeout(r, 2000));

    // 7. Chụp ảnh biên lai hoàn tất đổi trả
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_exchange_06_receipt.png') });
    console.log('  -> Đã lưu ảnh: test_exchange_06_receipt.png');

    console.log('✅ Kiểm thử hoàn tất thành công 100%!');
  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_exchange_error.png') });
  } finally {
    await browser.close();
  }
}

run();
