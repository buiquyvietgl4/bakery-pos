import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('--- CHỤP ẢNH XÁC THỰC 2 BƯỚC CHO THANH TOÁN KẾT HỢP ---');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
  });

  const page = await browser.newPage();

  page.on('dialog', async (dialog) => {
    console.log(`  [Dialog Popup]: "${dialog.message()}" -> Chấp nhận (OK)`);
    await dialog.accept();
  });

  try {
    await page.goto('http://localhost:3000/pos', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000);

    // Kích hoạt chế độ 2 bước
    await page.evaluate(() => {
      const cfg = {
        mode: 'two_step',
        twoStep: { skipForAdmin: false, alertSound: true, autoCompleteOnApprove: true },
        two_step: { skipForAdmin: false, alertSound: true, autoCompleteOnApprove: true },
      };
      localStorage.setItem('bakery_transfer_verification_config', JSON.stringify(cfg));
      window.dispatchEvent(new CustomEvent('bakery_transfer_verification_config_updated', { detail: cfg }));
    });
    await sleep(500);

    // Click bánh có sẵn tồn kho: Bánh Bông Lan Vani (Còn: 5)
    console.log('Chọn Bánh Bông Lan Vani...');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div, button'));
      const cakeCard = cards.find((el) => el.textContent?.includes('Bông Lan Vani') && el.textContent?.includes('Còn'));
      if (cakeCard) (cakeCard as HTMLElement).click();
    });
    await sleep(1000);

    // Mở modal thanh toán
    console.log('Mở modal thanh toán...');
    await page.evaluate(() => {
      const checkoutBtn =
        document.getElementById('pos-checkout-btn') ||
        Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Thanh Toán Ngay'));
      if (checkoutBtn) (checkoutBtn as HTMLElement).click();
    });
    await sleep(1500);

    // Bấm chọn Kết hợp (TM+CK)
    console.log('Chọn phương thức Kết hợp (TM+CK)...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const splitBtn = buttons.find((b) => b.textContent?.includes('Kết hợp (TM+CK)'));
      if (splitBtn) (splitBtn as HTMLElement).click();
    });
    await sleep(1000);

    // Cuộn xuống xem thông báo xác thực 2 bước
    await page.evaluate(() => {
      const scrollContainers = Array.from(document.querySelectorAll('.overflow-y-auto'));
      scrollContainers.forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
    });
    await sleep(500);

    const shot3Path = path.join(ARTIFACT_DIR, 'test_split_03_twostep_notice.png');
    await page.screenshot({ path: shot3Path, fullPage: false });
    console.log('📸 Đã chụp ảnh 3 (Thông báo 2 bước):', shot3Path);

    // Bấm Gửi Duyệt CK 2 Bước
    console.log('Bấm Gửi Duyệt CK 2 Bước...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const actionBtn = buttons.find((b) =>
        b.className.includes('bg-amber-600') && (b.textContent?.includes('Gửi Duyệt') || b.textContent?.includes('Xác Nhận'))
      );
      if (actionBtn) (actionBtn as HTMLElement).click();
    });
    await sleep(1500);

    // Cuộn xuống chụp box đang chờ Admin duyệt
    await page.evaluate(() => {
      const scrollContainers = Array.from(document.querySelectorAll('.overflow-y-auto'));
      scrollContainers.forEach((el) => {
        el.scrollTop = el.scrollHeight;
      });
    });
    await sleep(500);

    const shot4Path = path.join(ARTIFACT_DIR, 'test_split_04_waiting_admin.png');
    await page.screenshot({ path: shot4Path, fullPage: false });
    console.log('📸 Đã chụp ảnh 4 (Đang chờ Admin duyệt):', shot4Path);

    console.log('--- HOÀN TẤT KIỂM THỬ THÀNH CÔNG ---');
  } catch (err) {
    console.error('Lỗi:', err);
  } finally {
    await browser.close();
  }
}

run();
