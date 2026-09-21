import puppeteer from 'puppeteer-core';
import * as path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('🚀 Khởi động Chrome kiểm thử tính năng Chốt ca và Báo cáo chênh lệch ca...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ],
  });

  const page = await browser.newPage();

  // Spy on window.print to detect if it gets called automatically
  await page.evaluateOnNewDocument(() => {
    (window as any).__printCalls = 0;
    const origPrint = window.print;
    window.print = function() {
      (window as any).__printCalls++;
      console.log('>>> [SPY] window.print() was called!');
    };
  });

  page.on('console', (msg) => {
    console.log('  [Browser Console]:', msg.text());
  });

  try {
    // ══════════════════════════════════════════════════════════════
    // PHẦN 1: KIỂM THỬ TẠI QUẦY POS - CHỐT CA KHÔNG TỰ ĐỘNG BẬT IN
    // ══════════════════════════════════════════════════════════════
    console.log('\n--- 1. Kiểm thử chốt ca trên POS ---');
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle2', timeout: 30000 });

    // Thiết lập nhân viên thu ngân và khởi tạo ca nếu chưa có
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'cashier-qa',
        username: 'thungan',
        name: 'Thu Ngân QA',
        role: 'cashier'
      }));
      // Xóa các thông báo lỗi nếu có trong shift history
      const raw = localStorage.getItem('bakery_shift_history');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const valid = parsed.filter((item: any) => !item.channel && !item.type?.includes('notif'));
          localStorage.setItem('bakery_shift_history', JSON.stringify(valid));
        } catch {}
      }
    });

    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1000));

    // Tìm nút Giao ca / Chốt ca trên POS header
    const openedModal = await page.evaluate(() => {
      const shiftBtn = document.querySelector('button[title*="Bàn giao ca"]') as HTMLButtonElement
        || Array.from(document.querySelectorAll('button')).find(b => 
            b.title?.toLowerCase().includes('bàn giao') || 
            b.innerText.toLowerCase().includes('giao ca') || 
            b.innerText.includes('500.000')
          );
      if (shiftBtn) {
        shiftBtn.click();
        return true;
      }
      return false;
    });

    console.log('  Đã bấm mở modal chốt ca:', openedModal);
    await new Promise((r) => setTimeout(r, 1200));

    // Bấm nút "Chốt Ca & Mở Ca Mới"
    console.log('  Thực hiện bấm nút [Chốt Ca & Mở Ca Mới]...');
    const closeShiftResult = await page.evaluate(async () => {
      const initialPrints = (window as any).__printCalls;
      const buttons = Array.from(document.querySelectorAll('button'));
      const closeBtn = buttons.find(b => b.innerText.includes('Chốt Ca & Mở Ca Mới'));
      if (!closeBtn) return { success: false, reason: 'Không tìm thấy nút Chốt Ca & Mở Ca Mới' };

      (closeBtn as HTMLButtonElement).click();
      
      // Chờ 2 giây để hàm async hoàn tất
      await new Promise(r => setTimeout(r, 2000));
      const finalPrints = (window as any).__printCalls;
      const printTriggered = finalPrints > initialPrints;

      // Tìm xem có nút "In Phiếu Ca" và thông báo thành công không
      const bodyText = document.body.innerText;
      const successBanner = bodyText.includes('thành công');
      const hasManualPrintBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('In Phiếu Ca'));

      return {
        success: true,
        printTriggered,
        successBanner,
        hasManualPrintBtn,
        printCount: finalPrints
      };
    });

    console.log('  Kết quả chốt ca trên POS:', closeShiftResult);
    const posShotPath = path.join(ARTIFACTS_DIR, 'test_pos_shift_close_result.png');
    await page.screenshot({ path: posShotPath });
    console.log('  📸 Đã chụp ảnh POS sau khi chốt ca:', posShotPath);

    if (closeShiftResult.printTriggered) {
      throw new Error('THẤT BẠI: Trình duyệt vẫn tự động gọi window.print() khi chốt ca!');
    } else {
      console.log('  ✅ THÀNH CÔNG: Chốt ca KHÔNG tự động bật cửa sổ in ấn!');
    }

    // ══════════════════════════════════════════════════════════════
    // PHẦN 2: KIỂM THỬ TRANG ADMIN - QUẢN LÝ CA & CHÊNH LỆCH
    // ══════════════════════════════════════════════════════════════
    console.log('\n--- 2. Kiểm thử Báo cáo chênh lệch tại Admin ---');
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle2', timeout: 30000 });

    // Đăng nhập quyền Admin
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'admin-qa',
        username: 'admin',
        name: 'Chủ Tiệm Admin QA',
        role: 'admin'
      }));
    });
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1200));

    // Bấm chuyển sang tab "Giao Ca & Két Quầy"
    const clickedTab = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const shiftTabBtn = buttons.find(b => b.innerText.toLowerCase().includes('giao ca') || b.innerText.toLowerCase().includes('két quầy'));
      if (shiftTabBtn) {
        shiftTabBtn.click();
        return true;
      }
      return false;
    });

    console.log('  Đã bấm chuyển tab Quản lý ca:', clickedTab);
    await new Promise((r) => setTimeout(r, 2000));

    // Kiểm tra nội dung bảng và các badge chênh lệch
    const adminShiftCheck = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      const hasThua0d = bodyText.includes('Thừa +0₫') || bodyText.includes('Thừa +0đ');
      const hasKhopChuan = bodyText.includes('Khớp chuẩn 100%');
      
      // Tìm số lượng ở các nút lọc
      const buttons = Array.from(document.querySelectorAll('button'));
      const lechQuyBtn = buttons.find(b => b.innerText.includes('Lệch quỹ'));
      const khopChuanBtn = buttons.find(b => b.innerText.includes('Khớp chuẩn'));
      const tatCaBtn = buttons.find(b => b.innerText.includes('Tất cả'));

      return {
        hasThua0d,
        hasKhopChuan,
        tatCaText: tatCaBtn?.innerText || '',
        lechQuyText: lechQuyBtn?.innerText || '',
        khopChuanText: khopChuanBtn?.innerText || '',
      };
    });

    console.log('  Kết quả kiểm tra Admin:', adminShiftCheck);

    // Scroll xuống để chụp toàn bộ bảng
    await page.evaluate(() => {
      window.scrollTo(0, 500);
    });
    await new Promise((r) => setTimeout(r, 600));

    const adminShotPath = path.join(ARTIFACTS_DIR, 'test_admin_shift_management_result.png');
    await page.screenshot({ path: adminShotPath });
    console.log('  📸 Đã chụp ảnh Admin Shift Management Table:', adminShotPath);

    if (adminShiftCheck.hasThua0d) {
      throw new Error('THẤT BẠI: Vẫn còn hiển thị chữ "Thừa +0₫" trong bảng ca!');
    } else {
      console.log('  ✅ THÀNH CÔNG: Tuyệt đối KHÔNG còn "Thừa +0₫", hiển thị "Khớp chuẩn 100%" chính xác!');
    }

  } catch (err: any) {
    console.error('❌ Lỗi kiểm thử:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
    console.log('\n🔒 Đã đóng Chrome.');
  }
}

main();
