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
      await new Promise(r => setTimeout(r, 1500));
    }

    // Đợi 3 giây cho trang load đầy đủ
    await new Promise(r => setTimeout(r, 3000));

    const tabs = [
      { name: 'Tài Chính', fileName: 'test_eval_admin_deep_01_finance.png' },
      { name: 'Thuế & Sổ Sách', fileName: 'test_eval_admin_deep_02_tax.png' },
      { name: 'Ca & Két', fileName: 'test_eval_admin_deep_03_shift.png' },
      { name: 'Bánh & Ảnh', fileName: 'test_eval_admin_deep_04_product.png' },
      { name: 'Kho', fileName: 'test_eval_admin_deep_05_inventory.png' },
      { name: 'BOM', fileName: 'test_eval_admin_deep_06_bom.png', subTabs: ['BOM Bán Lẻ', 'BOM Sinh Nhật'] },
      { name: 'Thanh Toán', fileName: 'test_eval_admin_deep_07_payment.png', subTabs: ['Duyệt GD', 'VietQR', 'Ví Điện Tử'] },
      { name: 'Hệ Thống', fileName: 'test_eval_admin_deep_08_system.png', subTabs: ['Thương Hiệu', 'Bảo Mật', 'Dữ Liệu', 'Máy In'] }
    ];

    async function clickTabButton(text: string) {
      return await page.evaluate((btnText) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const tab = buttons.find(b => {
          const t = b.textContent?.trim() || '';
          return t === btnText || t.includes(btnText);
        });
        if (tab) {
          tab.click();
          return true;
        }
        return false;
      }, text);
    }
    
    async function checkSubTabs(subTabs: string[]) {
      return await page.evaluate((subTabNames) => {
        const textContent = document.body.innerText;
        const missing: string[] = [];
        for (const name of subTabNames) {
           if (!textContent.includes(name)) {
               missing.push(name);
           }
        }
        return missing;
      }, subTabs);
    }

    for (const tab of tabs) {
      const startTime = Date.now();
      console.log(`Testing deep tab: ${tab.name}`);
      
      const clicked = await clickTabButton(tab.name);
      
      if (!clicked) {
        console.log(`Could not find button for tab: ${tab.name}`);
        results.push({ step: tab.name, status: 'FAIL', reason: 'Button not found', loadTime: 0 });
        continue;
      }
      
      await new Promise(r => setTimeout(r, 2000));
      const loadTime = Date.now() - startTime;
      
      const screenshotPath = path.join(ARTIFACT_DIR, tab.fileName);
      await page.screenshot({ path: screenshotPath });

      if (tab.subTabs) {
        const missingSubTabs = await checkSubTabs(tab.subTabs);
        if (missingSubTabs.length === 0) {
            console.log(`  All sub-tabs found for ${tab.name}`);
            results.push({ step: `${tab.name} Sub-tabs`, status: 'PASS' });
        } else {
            console.log(`  Missing sub-tabs for ${tab.name}: ${missingSubTabs.join(', ')}`);
            results.push({ step: `${tab.name} Sub-tabs`, status: 'WARN', reason: `Missing: ${missingSubTabs.join(', ')}` });
        }
      }
      
      results.push({ step: tab.name, status: 'PASS', loadTime });
    }

  } catch (error: any) {
    console.error('Test execution failed', error);
    results.push({ step: 'Global', status: 'FAIL', reason: error.message });
  } finally {
    await browser.close();
    
    console.log('=== DEEP TEST REPORT ===');
    console.log(JSON.stringify({ results, errors: consoleErrors }, null, 2));
  }
}

runTest();
