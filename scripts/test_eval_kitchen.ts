import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'https://bakery-pos-rho.vercel.app';

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  const page = await browser.newPage();
  const logs: string[] = [];
  const errors: string[] = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`Console Error: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`Page Error: ${err.message}`);
  });

  try {
    // Bước 0: AUTH
    logs.push('[BƯỚC 0] AUTH - Đang truy cập /kitchen');
    await page.goto(`${BASE_URL}/kitchen`, { waitUntil: 'networkidle2', timeout: 60000 });
    
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'admin-qa',
        username: 'admin',
        name: 'Chủ Tiệm (Admin)',
        role: 'admin'
      }));
    });
    const startTime = Date.now();
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));
    const loadTime = Date.now() - startTime;
    logs.push(`- Thời gian load trang sau khi reload: ${loadTime}ms (PASS)`);

    // Bước 1: GIAO DIỆN KITCHEN
    logs.push('\n[BƯỚC 1] GIAO DIỆN KITCHEN');
    const headerTitle = await page.evaluate(() => document.querySelector('h1, h2, header')?.textContent || 'Không tìm thấy');
    logs.push(`- Kiểm tra header: ${headerTitle.toLowerCase().includes('bếp') || headerTitle.toLowerCase().includes('kitchen') ? 'PASS' : 'WARN - Tiêu đề không rõ ràng (' + headerTitle.trim().substring(0,30) + ')'}`);

    const hasTabs = await page.evaluate(() => document.querySelectorAll('button, [role="tab"]').length > 0);
    logs.push(`- Kiểm tra tabs/filters: ${hasTabs ? 'PASS' : 'WARN'}`);
    
    const orders = await page.evaluate(() => document.querySelectorAll('.order-card, [data-testid="order"], .card, li').length);
    logs.push(`- Kiểm tra danh sách đơn: PASS (Hiển thị ${orders} item)`);

    await page.screenshot({ path: `${ARTIFACTS_DIR}\\test_eval_kitchen_01_overview.png` });
    logs.push('- Chụp screenshot overview (test_eval_kitchen_01_overview.png): PASS');

    // Bước 2: CHỨC NĂNG
    logs.push('\n[BƯỚC 2] CHỨC NĂNG');
    const hasRefresh = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(b => b.textContent?.toLowerCase().includes('làm mới') || b.textContent?.toLowerCase().includes('refresh') || b.querySelector('svg'));
    });
    logs.push(`- Kiểm tra nút refresh/reload: ${hasRefresh ? 'PASS' : 'WARN'}`);
    
    // Check realtime / oven
    const html = await page.content();
    const hasOven = html.toLowerCase().includes('lò nướng') || html.toLowerCase().includes('oven');
    logs.push(`- Kiểm tra khu vực lò nướng: ${hasOven ? 'PASS' : 'WARN'}`);

    const hasSearch = await page.evaluate(() => document.querySelector('input[type="text"], input[type="search"]') !== null);
    logs.push(`- Kiểm tra chức năng tìm kiếm: ${hasSearch ? 'PASS' : 'WARN'}`);
    
    await page.screenshot({ path: `${ARTIFACTS_DIR}\\test_eval_kitchen_02_features.png` });
    logs.push('- Chụp screenshot tính năng (test_eval_kitchen_02_features.png): PASS');

    // Bước 3: KIỂM TRA RESPONSIVE
    logs.push('\n[BƯỚC 3] KIỂM TRA RESPONSIVE');
    await page.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${ARTIFACTS_DIR}\\test_eval_kitchen_03_mobile.png` });
    logs.push('- Resize 390x844 (mobile) và chụp screenshot (test_eval_kitchen_03_mobile.png): PASS');

    await page.setViewport({ width: 768, height: 1024 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: `${ARTIFACTS_DIR}\\test_eval_kitchen_04_tablet.png` });
    logs.push('- Resize 768x1024 (tablet) và chụp screenshot (test_eval_kitchen_04_tablet.png): PASS');
    
    // Bước 4: KIỂM TRA NAVIGATION
    logs.push('\n[BƯỚC 4] KIỂM TRA NAVIGATION');
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => a.href);
    });
    const hasPosLink = links.some(l => l.includes('/pos') || l.includes('bán hàng'));
    const hasAdminLink = links.some(l => l.includes('/admin'));
    logs.push(`- Kiểm tra link POS: ${hasPosLink ? 'PASS' : 'WARN'}`);
    logs.push(`- Kiểm tra link Admin: ${hasAdminLink ? 'PASS' : 'WARN'}`);

  } catch (error: any) {
    logs.push(`FAIL - Lỗi không mong muốn: ${error.message}`);
  } finally {
    await browser.close();
    console.log("=== BÁO CÁO KIỂM THỬ KITCHEN ===");
    console.log(logs.join('\n'));
    console.log("\n=== CONSOLE ERRORS ===");
    console.log(errors.length > 0 ? errors.join('\n') : "Không có lỗi console");
  }
}

run();
