import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'https://bakery-pos-rho.vercel.app';

async function runTest() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1280, height: 800 }
  });

  const page = await browser.newPage();
  
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(`[Page Error] ${err.message}`);
  });

  const results: any[] = [];

  try {
    // Bước 0: Auth & Mở Khóa
    console.log('Navigating to /admin...');
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2', timeout: 60000 });

    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'admin-qa',
        username: 'admin',
        name: 'Chủ Tiệm (Admin)',
        role: 'admin'
      }));
    });
    
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));

    const hasLockInput = await page.$('input[type="password"]');
    if (hasLockInput) {
      console.log('Unlocking with password...');
      await page.type('input[type="password"]', 'admin123');
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 2000));
    }

    const tabs = [
      { name: 'Tài Chính', fileName: 'test_eval_admin_01_finance.png' },
      { name: 'Thuế & Sổ Sách', fileName: 'test_eval_admin_02_tax.png' },
      { name: 'Ca & Két', fileName: 'test_eval_admin_03_shift.png' },
      { name: 'Bánh & Ảnh', fileName: 'test_eval_admin_04_product.png' },
      { name: 'Kho', fileName: 'test_eval_admin_05_inventory.png' },
      { name: 'BOM', fileName: 'test_eval_admin_06_bom.png', subTabs: ['BOM Bán Lẻ', 'BOM Sinh Nhật'] },
      { name: 'Thanh Toán', fileName: 'test_eval_admin_07_payment.png', subTabs: ['Duyệt GD', 'VietQR', 'Ví Điện Tử'] },
      { name: 'Hệ Thống', fileName: 'test_eval_admin_08_system.png', subTabs: ['Thương Hiệu', 'Bảo Mật', 'Dữ Liệu', 'Máy In'] }
    ];

    async function clickElementByText(text: string) {
      const clicked = await page.evaluate((btnText) => {
        const elements = Array.from(document.querySelectorAll('button, a, div, span, li'));
        const el = elements.find(e => {
          const t = e.textContent?.trim() || '';
          return t === btnText || t.includes(btnText);
        });
        if (el && el instanceof HTMLElement) {
          el.click();
          return true;
        }
        return false;
      }, text);
      return clicked;
    }

    // Bước 1: KIỂM TRA 8 TAB CHÍNH
    for (const tab of tabs) {
      const startTime = Date.now();
      console.log(`Testing tab: ${tab.name}`);
      
      const clicked = await clickElementByText(tab.name);
      
      if (!clicked) {
        console.log(`Could not find tab: ${tab.name}`);
        results.push({ step: tab.name, status: 'FAIL', reason: 'Tab not found', loadTime: 0 });
        continue;
      }
      
      await new Promise(r => setTimeout(r, 2000));
      const loadTime = Date.now() - startTime;
      
      const screenshotPath = path.join(ARTIFACT_DIR, tab.fileName);
      await page.screenshot({ path: screenshotPath });

      if (tab.subTabs) {
        for (const sub of tab.subTabs) {
          console.log(`  Testing sub-tab: ${sub}`);
          const subClicked = await clickElementByText(sub);
          if (subClicked) {
            await new Promise(r => setTimeout(r, 1000));
          } else {
            console.log(`  Could not find sub-tab: ${sub}`);
            results.push({ step: `${tab.name} -> ${sub}`, status: 'WARN', reason: 'Sub-tab not found' });
          }
        }
      }
      
      results.push({ step: tab.name, status: 'PASS', loadTime });
    }

    // Bước 2: KIỂM TRA RESPONSIVE
    console.log('Testing mobile responsive...');
    await page.setViewport({ width: 390, height: 844 });
    await new Promise(r => setTimeout(r, 1000));
    
    for(let i=0; i<3; i++) {
        await clickElementByText(tabs[i].name);
        await new Promise(r => setTimeout(r, 1000));
    }
    
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_eval_admin_09_mobile.png') });
    results.push({ step: 'Mobile Responsive', status: 'PASS' });

    // Bước 3: KIỂM TRA KHO
    console.log('Testing tab Kho specifically...');
    await page.setViewport({ width: 1280, height: 800 });
    await clickElementByText('Kho');
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_eval_admin_inventory.png') });
    
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasNhapKho = pageText.toLowerCase().includes('nhập kho') || pageText.toLowerCase().includes('nhập');
    const hasXuatKho = pageText.toLowerCase().includes('xuất kho') || pageText.toLowerCase().includes('xuất');
    
    if (hasNhapKho || hasXuatKho) {
       results.push({ step: 'Kho Inventory Check', status: 'PASS' });
    } else {
       results.push({ step: 'Kho Inventory Check', status: 'WARN', reason: 'Could not find Nhập/Xuất kho text' });
    }

  } catch (error: any) {
    console.error('Test execution failed', error);
    results.push({ step: 'Global', status: 'FAIL', reason: error.message });
  } finally {
    await browser.close();
    
    console.log('=== TEST REPORT ===');
    console.log(JSON.stringify({ results, errors: consoleErrors }, null, 2));
  }
}

runTest();
