import puppeteer from 'puppeteer-core';
import * as path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Khởi động Chrome kiểm thử hiển thị Két 1.6tr và Bàn Giao Ca Sau...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();
  try {
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle2', timeout: 30000 });

    // Đăng nhập thu ngân / chủ tiệm
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

    // Bấm mở modal két tiền ca
    const opened = await page.evaluate(() => {
      const shiftBtn = document.querySelector('button[title*="Bàn giao ca"]') as HTMLButtonElement
        || Array.from(document.querySelectorAll('button')).find(b => 
            b.title?.toLowerCase().includes('bàn giao') || 
            b.innerText.toLowerCase().includes('giao ca') || 
            b.innerText.includes('1.600.000') ||
            b.innerText.includes('500.000')
          );
      if (shiftBtn) {
        shiftBtn.click();
        return true;
      }
      return false;
    });

    console.log('  Đã mở modal két tiền ca:', opened);
    await new Promise((r) => setTimeout(r, 1000));

    // Đọc thông tin hiển thị trên modal
    const modalData = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        has16m: bodyText.includes('1.600.000₫'),
        hasSuaVon: bodyText.includes('[Sửa vốn]'),
        hasChuyenToanBo: bodyText.includes('Chuyển toàn bộ két'),
        hasRutNopChu: bodyText.includes('Rút nộp chủ / két'),
      };
    });

    console.log('  Kết quả kiểm tra Modal:', modalData);

    const shotPath = path.join(ARTIFACTS_DIR, 'test_handover_verified_modal.png');
    await page.screenshot({ path: shotPath });
    console.log('  📸 Đã chụp ảnh Modal:', shotPath);

    if (!modalData.has16m) {
      console.warn('⚠️ Cảnh báo: Chưa thấy hiển thị 1.600.000₫');
    } else {
      console.log('  ✅ THÀNH CÔNG: Két tiền đã hiển thị chuẩn xác 1.600.000₫!');
    }

    if (!modalData.hasChuyenToanBo || !modalData.hasRutNopChu) {
      throw new Error('THẤT BẠI: Chưa thấy các tùy chọn bàn giao ca sau minh bạch!');
    } else {
      console.log('  ✅ THÀNH CÔNG: Có đầy đủ tùy chọn bàn giao toàn bộ két hoặc rút nộp chủ!');
    }

  } finally {
    await browser.close();
    console.log('🔒 Đã đóng Chrome.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
