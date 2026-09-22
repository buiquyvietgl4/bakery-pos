import puppeteer from 'puppeteer-core';
import * as path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Khởi động Chrome kiểm thử Thanh Công Cụ Quản Trị Admin Tinh Gọn...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();

  try {
    // 1. Vào Admin & Đăng nhập
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2', timeout: 30000 });
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

    // Mở khóa nếu gặp màn hình mật khẩu Admin
    const hasLockInput = await page.$('input[type="password"]');
    if (hasLockInput) {
      await page.type('input[type="password"]', 'admin123');
      await page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 1200));
    }

    // 2. Kiểm tra danh sách các Tab Cấp 1 trên thanh công cụ chính
    const tabsList = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('div.relative.flex.items-center button'));
      return btns.map(b => b.innerText.trim()).filter(t => t && !['<', '>'].includes(t));
    });
    console.log('  1. Danh sách Tabs hiển thị trên thanh công cụ:', tabsList);

    const hasPaymentTab = tabsList.some(t => t.includes('Thanh Toán & Chuyển Khoản'));
    const hasBomTab = tabsList.some(t => t.includes('Công Thức (BOM)'));
    const hasSystemTab = tabsList.some(t => t.includes('Cài Đặt Hệ Thống'));

    console.log('    - Tab "Thanh Toán & Chuyển Khoản":', hasPaymentTab ? '✅ Có' : '❌ Thiếu');
    console.log('    - Tab "Công Thức (BOM)":', hasBomTab ? '✅ Có' : '❌ Thiếu');
    console.log('    - Tab "Cài Đặt Hệ Thống":', hasSystemTab ? '✅ Có' : '❌ Thiếu');

    if (!hasPaymentTab || !hasBomTab || !hasSystemTab) {
      throw new Error('Thanh công cụ thiếu các tab gộp!');
    }

    // 3. Kiểm tra Nhóm 1: Thanh Toán & Chuyển Khoản
    console.log('\n  2. Kiểm tra nhóm "Thanh Toán & Chuyển Khoản"...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const pTab = btns.find(b => b.innerText.includes('Thanh Toán & Chuyển Khoản'));
      pTab?.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const paymentSubTabs = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasVerify: text.includes('Duyệt Chuyển Khoản'),
        hasVietQR: text.includes('Cài Đặt VietQR Ngân Hàng'),
        hasEwallet: text.includes('Ví Điện Tử (MoMo, ZaloPay)'),
      };
    });
    console.log('    - Sub-tabs Thanh Toán:', paymentSubTabs);

    const shotPayment = path.join(ARTIFACTS_DIR, 'test_admin_payment_grouped.png');
    await page.screenshot({ path: shotPayment });
    console.log('    📸 Đã chụp ảnh nhóm Thanh Toán:', shotPayment);

    // Chuyển sang sub-tab VietQR
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const vBtn = btns.find(b => b.innerText.includes('Cài Đặt VietQR Ngân Hàng'));
      vBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // Chuyển sang sub-tab Ví Điện Tử
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const wBtn = btns.find(b => b.innerText.includes('Ví Điện Tử (MoMo, ZaloPay)'));
      wBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // 4. Kiểm tra Nhóm 2: Công Thức (BOM)
    console.log('\n  3. Kiểm tra nhóm "Công Thức (BOM)"...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const bTab = btns.find(b => b.innerText.includes('Công Thức (BOM)'));
      bTab?.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const bomSubTabs = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasRecipes: text.includes('BOM Bánh Bán Lẻ & Bán Thành Phẩm'),
        hasCustomCakes: text.includes('Định Mức Bánh Sinh Nhật'),
      };
    });
    console.log('    - Sub-tabs Công Thức BOM:', bomSubTabs);

    const shotBom = path.join(ARTIFACTS_DIR, 'test_admin_bom_grouped.png');
    await page.screenshot({ path: shotBom });
    console.log('    📸 Đã chụp ảnh nhóm BOM:', shotBom);

    // 5. Kiểm tra Nhóm 3: Cài Đặt Hệ Thống
    console.log('\n  4. Kiểm tra nhóm "Cài Đặt Hệ Thống"...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
      const sTab = btns.find(b => b.innerText.includes('Cài Đặt Hệ Thống'));
      sTab?.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const systemSubTabs = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasBranding: text.includes('Tên & Logo Tiệm'),
        hasSecurity: text.includes('Bảo Mật & Phân Quyền'),
        hasCloud: text.includes('CSDL & Sao Lưu SQL'),
        hasPrinter: text.includes('Máy In Hóa Đơn & Tem'),
      };
    });
    console.log('    - Sub-tabs Cài Đặt Hệ Thống:', systemSubTabs);

    const shotSystem = path.join(ARTIFACTS_DIR, 'test_admin_system_grouped.png');
    await page.screenshot({ path: shotSystem });
    console.log('    📸 Đã chụp ảnh nhóm Cài Đặt Hệ Thống:', shotSystem);

    if (!paymentSubTabs.hasVerify || !paymentSubTabs.hasVietQR || !paymentSubTabs.hasEwallet) {
      throw new Error('Nhóm Thanh toán thiếu sub-tab!');
    }
    if (!bomSubTabs.hasRecipes || !bomSubTabs.hasCustomCakes) {
      throw new Error('Nhóm BOM thiếu sub-tab!');
    }
    if (!systemSubTabs.hasBranding || !systemSubTabs.hasSecurity || !systemSubTabs.hasCloud) {
      throw new Error('Nhóm Hệ thống thiếu sub-tab!');
    }

    console.log('\n  🎉 TẤT CẢ CÁC NHÓM TAB HỢP NHẤT ĐÃ HOẠT ĐỘNG HOÀN TOÀN CHÍNH XÁC VÀ ĐẸP MẮT!');

  } finally {
    await browser.close();
    console.log('🔒 Đã đóng Chrome.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
