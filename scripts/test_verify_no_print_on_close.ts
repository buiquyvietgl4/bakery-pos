import puppeteer from 'puppeteer-core';
import * as path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Khởi động Chrome kiểm thử nghiêm ngặt xem có popup in nào xuất hiện khi chốt ca không...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();

  // Spy on window.print and window.open
  await page.evaluateOnNewDocument(() => {
    (window as any).__printCalls = 0;
    (window as any).__windowOpenCalls = [];

    const origPrint = window.print;
    window.print = function() {
      (window as any).__printCalls++;
      console.log('>>> [SPY DETECTED] window.print() was called!');
    };

    const origOpen = window.open;
    window.open = function(...args: any[]) {
      (window as any).__windowOpenCalls.push(args);
      console.log('>>> [SPY DETECTED] window.open() was called with:', args);
      return (origOpen as any).apply(this, args);
    };
  });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('SPY DETECTED') || text.includes('Lỗi chốt ca')) {
      console.log('  [Console Notice]:', text);
    }
  });

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

    // 2. Mở modal chốt ca
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

    // 3. Reset spy counters
    await page.evaluate(() => {
      (window as any).__printCalls = 0;
      (window as any).__windowOpenCalls = [];
    });

    // 4. Bấm nút [Chốt Ca & Mở Ca Mới]
    console.log('  Đang bấm [Chốt Ca & Mở Ca Mới]...');
    const result = await page.evaluate(async () => {
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Chốt Ca & Mở Ca Mới'));
      if (!closeBtn) return { error: 'Không thấy nút Chốt Ca & Mở Ca Mới' };

      (closeBtn as HTMLButtonElement).click();
      await new Promise(r => setTimeout(r, 2500));

      const printCalls = (window as any).__printCalls;
      const windowOpenCalls = (window as any).__windowOpenCalls;
      const bodyText = document.body.innerText;

      return {
        printCalls,
        windowOpenCalls,
        successMsgPresent: bodyText.includes('thành công'),
        hasManualPrintBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('In Phiếu Ca')),
      };
    });

    console.log('  Kết quả sau khi bấm chốt ca:', result);

    const shotPath = path.join(ARTIFACTS_DIR, 'test_strict_no_print_result.png');
    await page.screenshot({ path: shotPath });
    console.log('  📸 Đã chụp màn hình:', shotPath);

    if (result.printCalls > 0 || (result.windowOpenCalls && result.windowOpenCalls.length > 0)) {
      throw new Error(`THẤT BẠI: Vẫn có lệnh in hoặc window.open được gọi! printCalls=${result.printCalls}, windowOpenCalls=${result.windowOpenCalls?.length}`);
    }

    console.log('  ✅ THÀNH CÔNG TUYỆT ĐỐI: Không hề có bất kỳ lệnh window.print() hay window.open() nào được kích hoạt!');

  } finally {
    await browser.close();
    console.log('🔒 Đã đóng Chrome.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
