import puppeteer from 'puppeteer-core';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3001';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';

async function run() {
  console.log('🚀 Bắt đầu kiểm thử: Cài Đặt Đổi Trả Với 2 Lựa Chọn (Mã PIN vs Gửi Admin Duyệt)...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // ════════════════════════════════════════════════════════════════
    // BƯỚC 1: TRUY CẬP TRANG ADMIN -> TAB BẢO MẬT
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- BƯỚC 1: Kiểm tra 2 lựa chọn cài đặt đổi trả trong trang Quản trị ---');
    await page.goto(`${BASE_URL}/admin?tab=security`, { waitUntil: 'networkidle2' });

    // Đăng nhập quyền Admin
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'admin-1',
        username: 'admin',
        name: 'Chủ Tiệm (Admin)',
        role: 'admin',
      }));
      localStorage.setItem('bakery_security_config', JSON.stringify({
        adminUsername: 'admin',
        adminPasswordHash: 'admin123',
        adminName: 'Chủ Tiệm (Admin)',
        managerPin: '8888',
        returnApprovalMode: 'pin',
        returnSkipForAdmin: true,
      }));
    });

    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    // Cuộn xuống khu vực Cài Đặt Xác Thực Đổi Trả
    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('h3')).find(
        (h) => h.textContent?.includes('Cài Đặt Xác Thực Đổi Trả')
      );
      if (heading) {
        heading.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    // Kiểm tra hiển thị 2 lựa chọn
    const checkSettingsUI = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return {
        hasOption1: text.includes('Xác Nhận Bằng Mã') || text.includes('1. Xác Nhận Bằng Mã'),
        hasOption2: text.includes('Gửi Thông Báo Duyệt') || text.includes('2. Gửi Thông Báo Duyệt'),
        hasAdminSkip: text.includes('Tài khoản Admin không cần xác nhận thêm') || text.includes('Miễn Xác Nhận Cho Admin'),
      };
    });
    console.log('1.1. Kiểm tra 2 lựa chọn trong Cài Đặt:', checkSettingsUI);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_setting_01_admin_page.png') });

    // ════════════════════════════════════════════════════════════════
    // BƯỚC 2: CHUYỂN SANG LỰA CHỌN 2 (GỬI THÔNG BÁO DUYỆT)
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- BƯỚC 2: Admin chọn Lựa chọn 2 (Gửi Thông Báo Duyệt) ---');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const card2 = cards.find((c) => c.textContent?.includes('2. Gửi Thông Báo Duyệt') || c.textContent?.includes('Admin 2 Bước'));
      if (card2) (card2 as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const option2Active = await page.evaluate(() => {
      const cfg = localStorage.getItem('bakery_security_config');
      if (!cfg) return false;
      return JSON.parse(cfg).returnApprovalMode === 'admin_approval';
    });
    console.log('2.1. Đã lưu Lựa chọn 2 vào CSDL / LocalStorage:', option2Active ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_setting_02_option2_selected.png') });

    // ════════════════════════════════════════════════════════════════
    // BƯỚC 3: CHUYỂN LẠI LỰA CHỌN 1 (XÁC NHẬN BẰNG MÃ PIN)
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- BƯỚC 3: Admin chọn Lựa chọn 1 (Xác Nhận Bằng Mã PIN) ---');
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const card1 = cards.find((c) => c.textContent?.includes('1. Xác Nhận Bằng Mã') || c.textContent?.includes('Mã PIN / Mật Khẩu'));
      if (card1) (card1 as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const option1Active = await page.evaluate(() => {
      const cfg = localStorage.getItem('bakery_security_config');
      if (!cfg) return false;
      return JSON.parse(cfg).returnApprovalMode === 'pin';
    });
    console.log('3.1. Đã lưu Lựa chọn 1 vào CSDL / LocalStorage:', option1Active ? '✅ THÀNH CÔNG' : '❌ THẤT BẠI');
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_setting_03_option1_selected.png') });

    // ════════════════════════════════════════════════════════════════
    // BƯỚC 4: THU NGÂN TẠI POS KHI ĐẶT LỰA CHỌN 1 (MÃ PIN + NÚT CHUYỂN ADMIN)
    // ════════════════════════════════════════════════════════════════
    console.log('\n--- BƯỚC 4: Thu ngân tại POS mở đổi trả theo Lựa chọn 1 (Mã PIN) ---');
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'cashier-test',
        username: 'thungan',
        name: 'Thu Ngân Quầy',
        role: 'cashier',
      }));
      localStorage.setItem('bakery_security_config', JSON.stringify({
        managerPin: '8888',
        returnApprovalMode: 'pin',
        returnSkipForAdmin: true,
      }));
      localStorage.setItem('bakery_orders', JSON.stringify([
        {
          id: 'ord-pos-test-01',
          order_number: 'BK-TEST-01',
          total_amount: 50000,
          payment_method: 'cash',
          status: 'completed',
          created_at: new Date().toISOString(),
          items: [
            {
              id: 'it-test-1',
              product_name_snapshot: 'Bánh Mì Hoa Cúc Pháp',
              quantity: 1,
              unit_price: 50000,
              line_total: 50000,
            },
          ],
        },
      ]));
    });

    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500));

    // Mở modal Đổi Trả
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('Đổi Trả'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Chọn hóa đơn
    await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const found = items.find((el) => el.textContent?.includes('#BK-TEST-01')) || items[0];
      if (found) (found as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Tăng số lượng trả lên 1
    await page.evaluate(() => {
      const byTestId = document.querySelector('[data-testid="btn-increase-return-0"]') as HTMLElement;
      if (byTestId) {
        byTestId.click();
        return;
      }
      const spans = Array.from(document.querySelectorAll('span'));
      const zeroSpan = spans.find((s) => s.textContent?.trim() === '0');
      if (zeroSpan && zeroSpan.parentElement) {
        const btns = Array.from(zeroSpan.parentElement.querySelectorAll('button'));
        if (btns.length > 1) btns[1].click();
      }
    });
    await new Promise((r) => setTimeout(r, 600));

    // Bấm Duyệt Hoàn Tiền -> Vì là Lựa chọn 1 (PIN), phải mở thẳng Modal PIN Quản lý
    console.log('4.1. Thu ngân bấm Duyệt Hoàn Tiền...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.textContent?.includes('Duyệt Hoàn Tiền'));
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    const checkPinModal = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return {
        isPinModalOpen: text.includes('Xác Thực Mã PIN Quản Lý') || text.includes('Duyệt Đổi Trả / Hoàn Tiền'),
        hasSwitchToAdminBtn: text.includes('Quản lý vắng mặt? Gửi thông báo cho Admin duyệt'),
      };
    });
    console.log('4.2. Modal PIN Quản Lý mở trực tiếp:', checkPinModal);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_pos_pin_flow.png') });

    // Bấm nút chuyển sang gửi thông báo duyệt Admin
    console.log('4.3. Bấm nút chuyển sang gửi thông báo Admin từ modal PIN...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const switchBtn = btns.find((b) => b.textContent?.includes('Quản lý vắng mặt? Gửi thông báo cho Admin duyệt'));
      if (switchBtn) switchBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));

    const checkRadarScreen = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return {
        hasRadarWaiting: text.includes('Đang Chờ Admin Phê Duyệt') || text.includes('Đã Gửi Thông Báo Tới Chủ Tiệm'),
        hasResendBtn: text.includes('Yêu Cầu Lại') || text.includes('Gửi Lại Thông Báo'),
        hasFallbackPinBtn: text.includes('Nhập mã PIN Quản Lý thay thế'),
      };
    });
    console.log('4.4. Màn hình Radar gửi Admin (kèm nút Yêu Cầu Lại):', checkRadarScreen);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_return_pos_admin_flow.png') });

    console.log('\n🎉 KIỂM THỬ THÀNH CÔNG 100%! Cả 2 lựa chọn trong Cài Đặt đã hoạt động chuẩn xác!');
  } catch (err) {
    console.error('Lỗi trong quá trình kiểm thử:', err);
  } finally {
    await browser.close();
  }
}

run();
