import puppeteer from 'puppeteer-core';
import * as path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('📱 Khởi động Chrome kiểm thử menu Cài Đặt trên giao diện Mobile (Điện thoại)...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();

  try {
    // 1. Vào POS với kích thước màn hình điện thoại iPhone 13/14 (390 x 844)
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'admin-qa',
        username: 'admin',
        name: 'Chủ Tiệm (Admin)',
        role: 'admin'
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1200));

    // 2. Kiểm tra thanh tab bar phía trên cùng có nút Cài Đặt không
    const hasSettingsTab = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => b.innerText.includes('Cài Đặt'));
    });
    console.log('  1. Nút tab "Cài Đặt" trên thanh điều hướng di động:', hasSettingsTab ? '✅ Có' : '❌ Không');

    // 3. Bấm vào nút Cài Đặt trên mobile (hoặc tab Cài Đặt hoặc icon Settings Tầng 1)
    const clicked = await page.evaluate(() => {
      // Ưu tiên click nút Cài Đặt trên tab bar
      const btns = Array.from(document.querySelectorAll('button'));
      const settingsTab = btns.find(b => b.innerText.trim().includes('Cài Đặt'));
      if (settingsTab) {
        settingsTab.click();
        return 'tab_cai_dat';
      }
      // Hoặc nút có title chứa Cài đặt
      const titleBtn = btns.find(b => b.getAttribute('title')?.includes('Cài đặt hệ thống'));
      if (titleBtn) {
        titleBtn.click();
        return 'icon_settings_toolbar';
      }
      return null;
    });

    console.log('  2. Đã click mở menu Cài Đặt:', clicked);
    await new Promise((r) => setTimeout(r, 800));

    // 4. Kiểm tra cả 3 mục đã gộp chung trên giao diện Mobile
    const menuCheck = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasPrinter: text.includes('Máy In Hóa Đơn & Tem'),
        hasSound: text.includes('Cài Đặt Báo & Âm Thanh'),
        hasSync: text.includes('Đồng Bộ SQL'),
        hasInventory: text.includes('Kho Bánh Sẵn'),
      };
    });

    console.log('  3. Kiểm tra các mục trong menu Cài Đặt Mobile:', menuCheck);

    const shotPath = path.join(ARTIFACTS_DIR, 'test_mobile_unified_settings.png');
    await page.screenshot({ path: shotPath });
    console.log('  📸 Đã chụp màn hình menu Cài Đặt trên Mobile:', shotPath);

    if (!menuCheck.hasPrinter || !menuCheck.hasSound || !menuCheck.hasSync) {
      throw new Error('Menu Cài Đặt trên Mobile thiếu mục!');
    }

    console.log('  🎉 HOÀN THÀNH: Menu Cài Đặt hợp nhất hoạt động xuất sắc trên giao diện Mobile (Điện thoại)!');

  } finally {
    await browser.close();
    console.log('🔒 Đã đóng Chrome.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
