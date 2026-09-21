import puppeteer from 'puppeteer-core';
import * as path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Khởi động Chrome kiểm thử menu Cài Đặt hợp nhất...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();

  try {
    // 1. Vào POS
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

    // 2. Tìm nút Cài Đặt mới
    const settingsBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const found = btns.find(b => b.innerText.includes('Cài Đặt') && !b.innerText.includes('Báo'));
      if (found) {
        found.click();
        return true;
      }
      return false;
    });

    console.log('  Tìm và bấm nút Cài Đặt:', settingsBtn ? '✅ Tìm thấy và đã click' : '❌ Không thấy');
    await new Promise((r) => setTimeout(r, 800));

    // 3. Kiểm tra xem 3 mục con có hiển thị trong dropdown không
    const dropdownCheck = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasPrinter: text.includes('Máy In Hóa Đơn'),
        hasSound: text.includes('Cài Đặt Báo & Âm Thanh'),
        hasSync: text.includes('Đồng Bộ SQL'),
      };
    });

    console.log('  Kiểm tra các mục trong menu Cài Đặt:', dropdownCheck);

    const shotPath = path.join(ARTIFACTS_DIR, 'test_unified_settings_dropdown.png');
    await page.screenshot({ path: shotPath });
    console.log('  📸 Đã chụp màn hình menu Cài Đặt:', shotPath);

    if (!dropdownCheck.hasPrinter || !dropdownCheck.hasSound || !dropdownCheck.hasSync) {
      throw new Error('Menu Cài Đặt thiếu mục!');
    }

    console.log('  🎉 TẤT CẢ 3 MỤC ĐÃ ĐƯỢC GỘP CHUNG VÀO MENU CÀI ĐẶT HOÀN HẢO!');

  } finally {
    await browser.close();
    console.log('🔒 Đã đóng Chrome.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
