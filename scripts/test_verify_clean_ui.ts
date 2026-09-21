import puppeteer from 'puppeteer-core';
import * as path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Khởi động Chrome kiểm thử giao diện sạch (đã ẩn huy hiệu mã vạch & bỏ nút sửa vốn)...');
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

    // 2. Kiểm tra xem huy hiệu súng quét còn tồn tại trên giao diện không
    const hasBarcodeBadge = await page.evaluate(() => {
      return document.body.innerText.includes('Súng quét: Sẵn sàng');
    });

    console.log('  Kiểm tra huy hiệu Súng quét: Sẵn sàng:', hasBarcodeBadge ? '❌ Vẫn còn' : '✅ Đã ẩn hoàn toàn');

    // Chụp màn hình POS tổng thể
    const shotPos = path.join(ARTIFACTS_DIR, 'test_cleaned_pos_header.png');
    await page.screenshot({ path: shotPos });
    console.log('  📸 Đã chụp màn hình POS Header:', shotPos);

    // 3. Mở modal chốt ca
    await page.evaluate(() => {
      const shiftBtn = document.querySelector('button[title*="Bàn giao ca"]') as HTMLButtonElement
        || Array.from(document.querySelectorAll('button')).find(b => 
            b.title?.toLowerCase().includes('bàn giao') || 
            b.innerText.toLowerCase().includes('giao ca') || 
            b.innerText.includes('1.600.000') ||
            b.innerText.includes('500.000')
          );
      if (shiftBtn) shiftBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // 4. Kiểm tra xem nút [Sửa vốn] còn không
    const hasSuaVonBtn = await page.evaluate(() => {
      return document.body.innerText.includes('[Sửa vốn]');
    });
    console.log('  Kiểm tra nút [Sửa vốn]:', hasSuaVonBtn ? '❌ Vẫn còn' : '✅ Đã xóa hoàn toàn');

    const shotModal = path.join(ARTIFACTS_DIR, 'test_cleaned_shift_modal.png');
    await page.screenshot({ path: shotModal });
    console.log('  📸 Đã chụp màn hình Modal Bàn giao ca:', shotModal);

    if (hasBarcodeBadge || hasSuaVonBtn) {
      throw new Error(`Kiểm thử thất bại: hasBarcodeBadge=${hasBarcodeBadge}, hasSuaVonBtn=${hasSuaVonBtn}`);
    }

    console.log('  🎉 TẤT CẢ KIỂM THỬ GIAO DIỆN ĐỀU ĐẠT CHUẨN 100%!');

  } finally {
    await browser.close();
    console.log('🔒 Đã đóng Chrome.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
