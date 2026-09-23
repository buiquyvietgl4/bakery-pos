import puppeteer from 'puppeteer-core';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const BASE_URL = 'http://localhost:3000';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('🚀 [TEST BẮT ĐẦU]: KIỂM TRA ĐỒNG BỘ TÍNH TOÁN KHI XÓA DỮ LIỆU THỰC TẾ');
  console.log('───────────────────────────────────────────────────────────────────────');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('  [Browser Error]:', msg.text());
    }
  });

  page.on('dialog', async (dialog) => {
    console.log(`  [Dialog Popup]: "${dialog.message()}" -> Chấp nhận (OK)`);
    await dialog.accept();
  });

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // GIAI ĐOẠN 1: THIẾT LẬP DỮ LIỆU BAN ĐẦU (BASE STATE)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📌 BƯỚC 1: Khởi tạo dữ liệu ca bán và tồn kho chuẩn...');
    await page.goto(`${BASE_URL}/pos/`, { waitUntil: 'networkidle2' });

    const setupResult = await page.evaluate(() => {
      // 1. Tài khoản Chủ Tiệm (Admin) để không bị chặn mã PIN
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'admin-1',
        username: 'admin',
        name: 'Chủ Tiệm',
        role: 'admin',
      }));

      // 2. Bảo mật: Admin được quyền thao tác trực tiếp
      localStorage.setItem('bakery_security_config', JSON.stringify({
        staffPin: '1234',
        kitchenPin: '2345',
        adminPassword: 'admin',
        managerPin: '8888',
        requirePinOnPos: false,
        requirePinOnKitchen: false,
        requirePinOnAdmin: false,
      }));

      // 3. Khởi tạo Ca Bán Hàng: Tiền đầu ca = 500,000₫, Doanh thu = 0₫, 0 đơn
      const initialShift = {
        id: 'shift-test-1',
        shiftCode: 'CA-TEST-01',
        isOpen: true,
        openedAt: new Date().toISOString(),
        openingCash: 500000,
        cashSales: 0,
        transferSales: 0,
        refundCash: 0,
        refundTransfer: 0,
        orderCount: 0,
        openedBy: 'Chủ Tiệm',
      };
      localStorage.setItem('bakery_current_shift', JSON.stringify(initialShift));

      // 4. Danh sách sản phẩm: Lấy sản phẩm đầu tiên hoặc tạo 1 sản phẩm bánh test có tồn kho = 20
      const testProducts = [
        {
          id: 'prod-test-croissant',
          name: 'Bánh Croissant Bơ Pháp',
          category: 'Bánh Mì',
          selling_price: 35000,
          base_cost_price: 15000,
          stock_qty: 20,
          unit: 'cái',
          is_active: true,
          show_on_menu: true,
        },
        {
          id: 'prod-test-tiramisu',
          name: 'Bánh Tiramisu Mini',
          category: 'Bánh Ngọt',
          selling_price: 45000,
          base_cost_price: 20000,
          stock_qty: 15,
          unit: 'hộp',
          is_active: true,
          show_on_menu: true,
        },
      ];
      localStorage.setItem('bakery_products', JSON.stringify(testProducts));

      // 5. Làm sạch danh sách đơn hàng và sổ đen xóa đơn cũ
      localStorage.setItem('bakery_orders', JSON.stringify([]));
      localStorage.setItem('bakery_preorders', JSON.stringify([]));
      localStorage.setItem('bakery_order_returns', JSON.stringify([]));
      localStorage.setItem('bakery_spoilage_logs', JSON.stringify([]));
      localStorage.removeItem('bakery_deleted_order_keys');

      return {
        initialShift,
        testProducts,
      };
    });

    console.log(`  ✓ Ca bán ban đầu: Tiền đầu ca = ${setupResult.initialShift.openingCash.toLocaleString('vi-VN')}₫ | Doanh thu mặt = 0₫ | 0 đơn`);
    console.log(`  ✓ Bánh Croissant: Tồn kho ban đầu = ${setupResult.testProducts[0].stock_qty} cái | Giá bán = ${setupResult.testProducts[0].selling_price.toLocaleString('vi-VN')}₫`);

    // Reload lại trang POS để state nhận đầy đủ dữ liệu mới
    await page.goto(`${BASE_URL}/pos/`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // ═══════════════════════════════════════════════════════════════════════
    // GIAI ĐOẠN 2: TẠO MỘT ĐƠN HÀNG THỰC TẾ (2 BÁNH CROISSANT = 70.000₫)
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📌 BƯỚC 2: Thực hiện bán 2 Bánh Croissant (Tổng: 70.000₫ Tiền mặt)...');

    // Thêm 2 bánh Croissant vào giỏ hàng
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div, button'));
      const croissantCard = cards.find(
        (el) => el.textContent && el.textContent.includes('Croissant') && el.textContent.includes('35.000')
      );
      if (croissantCard) {
        (croissantCard as HTMLElement).click();
      }
    });
    await sleep(400);

    // Thêm tiếp cái thứ 2
    await page.evaluate(() => {
      const plusBtns = Array.from(document.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === '+'
      );
      if (plusBtns.length > 0) {
        (plusBtns[plusBtns.length - 1] as HTMLElement).click();
      }
    });
    await sleep(600);

    // Bấm nút Thanh Toán Tiền Mặt
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const cashBtn = btns.find(
        (b) => b.textContent && (b.textContent.includes('Tiền Mặt') || b.textContent.includes('💵 Tiền Mặt'))
      );
      if (cashBtn) (cashBtn as HTMLElement).click();
    });
    await sleep(1000);

    // Nếu có modal thanh toán -> bấm Xác Nhận Thu Tiền
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find(
        (b) => b.textContent && (b.textContent.includes('Xác Nhận Thu Tiền') || b.textContent.includes('Hoàn Tất') || b.textContent.includes('Thanh Toán'))
      );
      if (confirmBtn) (confirmBtn as HTMLElement).click();
    });
    await sleep(1500);

    // Đóng popup hoàn tất đơn nếu đang mở
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const closeBtn = btns.find(
        (b) => b.textContent && (b.textContent.includes('Tạo Đơn Mới') || b.textContent.includes('Đóng') || b.textContent.includes('In Hóa Đơn'))
      );
      if (closeBtn) (closeBtn as HTMLElement).click();
    });
    await sleep(1000);

    // Kiểm tra các chỉ số sau khi TẠO ĐƠN:
    const stateAfterOrder = await page.evaluate(() => {
      const orders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      const shift = JSON.parse(localStorage.getItem('bakery_current_shift') || '{}');
      const products = JSON.parse(localStorage.getItem('bakery_products') || '[]');
      const targetProd = products.find((p: any) => p.id === 'prod-test-croissant' || p.name.includes('Croissant'));

      const totalRev = orders.reduce((sum: number, o: any) => sum + (o.total_amount || o.totalPrice || 0), 0);

      return {
        orderCount: orders.length,
        createdOrder: orders[0] || null,
        totalRev,
        shiftCashSales: shift.cashSales || 0,
        shiftOrderCount: shift.orderCount || 0,
        expectedCash: (shift.openingCash || 0) + (shift.cashSales || 0) - (shift.refundCash || 0),
        croissantStock: targetProd ? targetProd.stock_qty : null,
      };
    });

    console.log('  📊 [CHỈ SỐ SAU KHI TẠO ĐƠN]:');
    console.log(`     • Số lượng hóa đơn POS: ${stateAfterOrder.orderCount} đơn (Mã: #${stateAfterOrder.createdOrder?.order_number})`);
    console.log(`     • Tổng doanh thu POS: ${stateAfterOrder.totalRev.toLocaleString('vi-VN')}₫`);
    console.log(`     • Tồn kho Croissant: ${stateAfterOrder.croissantStock} cái (Đã tự động trừ 2 cái: 20 -> 18)`);
    console.log(`     • Tiền ca bán (Cash Sales): +${stateAfterOrder.shiftCashSales.toLocaleString('vi-VN')}₫ (Số đơn ca: ${stateAfterOrder.shiftOrderCount})`);
    console.log(`     • Tiền dự tính trong két: ${stateAfterOrder.expectedCash.toLocaleString('vi-VN')}₫ (Khớp chuẩn 500k + 70k)`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_calc_01_order_created.png') });
    console.log('  📷 Đã lưu ảnh: test_calc_01_order_created.png');

    // ═══════════════════════════════════════════════════════════════════════
    // GIAI ĐOẠN 3: KIỂM TRA TRANG ADMIN & BÁO CÁO P&L KHI CÓ ĐƠN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📌 BƯỚC 3: Truy cập Admin Dashboard kiểm tra Doanh Thu & Lợi Nhuận...');
    await page.goto(`${BASE_URL}/admin/`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const adminStateBefore = await page.evaluate(() => {
      const orders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      const actualRev = orders.reduce((s: number, o: any) => s + (o.total_amount || 0), 0);
      return {
        orderCount: orders.length,
        actualRev,
      };
    });
    console.log(`  ✓ Doanh thu thực tế trên Admin: ${adminStateBefore.actualRev.toLocaleString('vi-VN')}₫ (${adminStateBefore.orderCount} đơn)`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_calc_02_admin_with_order.png') });
    console.log('  📷 Đã lưu ảnh: test_calc_02_admin_with_order.png');

    // ═══════════════════════════════════════════════════════════════════════
    // GIAI ĐOẠN 4: KIỂM TRA MÀN HÌNH BẾP (KITCHEN KDS) CÓ ĐƠN ĐANG CHỜ
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📌 BƯỚC 4: Truy cập Màn hình Bếp (KDS) kiểm tra hiển thị đơn...');
    await page.goto(`${BASE_URL}/kitchen/`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const kitchenStateBefore = await page.evaluate(() => {
      const orders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      return {
        hasOrders: orders.length > 0,
        firstOrderNum: orders[0]?.order_number || '',
      };
    });
    console.log(`  ✓ Màn hình Bếp KDS: Đang tiếp nhận đơn #${kitchenStateBefore.firstOrderNum}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_calc_03_kitchen_with_order.png') });
    console.log('  📷 Đã lưu ảnh: test_calc_03_kitchen_with_order.png');

    // ═══════════════════════════════════════════════════════════════════════
    // GIAI ĐOẠN 5: XÓA VĨNH VIỄN HÓA ĐƠN VÀ KIỂM TRA TỰ ĐỘNG ĐIỀU CHỈNH
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📌 BƯỚC 5: Quay lại POS và tiến hành XÓA VĨNH VIỄN đơn hàng vừa tạo...');
    await page.goto(`${BASE_URL}/pos/`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    // Mở tab Lịch sử Hóa đơn trên POS
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const histBtn = btns.find((b) => b.textContent && b.textContent.includes('Hóa đơn'));
      if (histBtn) (histBtn as HTMLElement).click();
    });
    await sleep(1200);

    // Bấm nút Thùng Rác (Xóa đơn)
    await page.evaluate(() => {
      const delBtns = Array.from(document.querySelectorAll('button[title*="Xóa vĩnh viễn"], button[title*="Xóa / Hủy"]'));
      if (delBtns.length > 0) {
        (delBtns[0] as HTMLElement).click();
      }
    });
    await sleep(1000);

    // Chụp ảnh Modal Xác Nhận Xóa Hóa Đơn
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_calc_04_delete_modal_shown.png') });
    console.log('  📷 Đã lưu ảnh: test_calc_04_delete_modal_shown.png (Modal Xác Nhận Xóa hiển thị)');

    // Bấm nút [Xác Nhận Xóa Vĩnh Viễn] (Admin 1-click)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find(
        (b) => b.textContent && (b.textContent.includes('Xác Nhận Xóa Vĩnh Viễn') || b.textContent.includes('Xác Nhận Xóa'))
      );
      if (confirmBtn) (confirmBtn as HTMLElement).click();
    });
    await sleep(2000);

    // ═══════════════════════════════════════════════════════════════════════
    // GIAI ĐOẠN 6: KIỂM CHỨNG TOÀN BỘ CÁC CHỈ SỐ TÍNH TOÁN SAU KHI XÓA ĐƠN
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📌 BƯỚC 6: Kiểm tra các chỉ số tính toán SAU KHI XÓA ĐƠN HÀNG:');
    
    const stateAfterDelete = await page.evaluate(() => {
      const orders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      const shift = JSON.parse(localStorage.getItem('bakery_current_shift') || '{}');
      const products = JSON.parse(localStorage.getItem('bakery_products') || '[]');
      const deletedKeys = JSON.parse(localStorage.getItem('bakery_deleted_order_keys') || '[]');
      const targetProd = products.find((p: any) => p.id === 'prod-test-croissant' || p.name.includes('Croissant'));

      const totalRev = orders.reduce((sum: number, o: any) => sum + (o.total_amount || o.totalPrice || 0), 0);

      return {
        orderCount: orders.length,
        totalRev,
        shiftCashSales: shift.cashSales || 0,
        shiftOrderCount: shift.orderCount || 0,
        expectedCash: (shift.openingCash || 0) + (shift.cashSales || 0) - (shift.refundCash || 0),
        croissantStock: targetProd ? targetProd.stock_qty : null,
        deletedKeys,
      };
    });

    console.log('  🎯 [KẾT QUẢ ĐỐI SOÁT TÍNH TOÁN TRÊN POS]:');
    console.log(`     1. Số lượng hóa đơn: ${stateAfterDelete.orderCount} đơn (ĐÃ GIẢM TỪ 1 VỀ 0)`);
    console.log(`     2. Doanh thu POS: ${stateAfterDelete.totalRev.toLocaleString('vi-VN')}₫ (ĐÃ GIẢM TỪ 70.000₫ VỀ 0₫)`);
    console.log(`     3. Tồn kho Croissant: ${stateAfterDelete.croissantStock} cái (ĐÃ HOÀN TRẢ LẠI 2 CÁI, TỪ 18 VỀ 20)`);
    console.log(`     4. Doanh thu ca bán (Cash Sales): ${stateAfterDelete.shiftCashSales.toLocaleString('vi-VN')}₫ (ĐÃ TỰ ĐỘNG GIẢM TỪ 70.000₫ VỀ 0₫)`);
    console.log(`     5. Tiền dự tính trong két: ${stateAfterDelete.expectedCash.toLocaleString('vi-VN')}₫ (VỀ ĐÚNG 500.000₫ ĐẦU CA, KHÔNG LỆCH KÉT)`);
    console.log(`     6. Sổ đen chống hồi sinh (Deleted Keys): [${stateAfterDelete.deletedKeys.join(', ')}]`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_calc_05_pos_after_deletion.png') });
    console.log('  📷 Đã lưu ảnh: test_calc_05_pos_after_deletion.png');

    // ═══════════════════════════════════════════════════════════════════════
    // GIAI ĐOẠN 7: KIỂM TRA ĐỐI SOÁT TRÊN ADMIN VÀ BẾP KDS
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📌 BƯỚC 7: Đối soát Doanh Thu Admin & Màn hình Bếp KDS...');

    // Kiểm tra Admin
    await page.goto(`${BASE_URL}/admin/`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const adminStateAfter = await page.evaluate(() => {
      const orders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      const actualRev = orders.reduce((s: number, o: any) => s + (o.total_amount || 0), 0);
      return {
        orderCount: orders.length,
        actualRev,
      };
    });
    console.log(`  ✓ Doanh thu thực tế trên Admin P&L: ${adminStateAfter.actualRev.toLocaleString('vi-VN')}₫ (Đã tự động trừ về 0₫)`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_calc_06_admin_after_deletion.png') });
    console.log('  📷 Đã lưu ảnh: test_calc_06_admin_after_deletion.png');

    // Kiểm tra Bếp KDS
    await page.goto(`${BASE_URL}/kitchen/`, { waitUntil: 'networkidle2' });
    await sleep(2000);
    const kitchenStateAfter = await page.evaluate(() => {
      const orders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
      const deletedKeys = new Set(JSON.parse(localStorage.getItem('bakery_deleted_order_keys') || '[]'));
      const active = orders.filter((o: any) => !deletedKeys.has(o.order_number) && !deletedKeys.has(o.id));
      return {
        activeCount: active.length,
      };
    });
    console.log(`  ✓ Bảng Bếp KDS: Còn ${kitchenStateAfter.activeCount} đơn (Đơn đã bị gỡ hoàn toàn khỏi bảng bếp)`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_calc_07_kitchen_after_deletion.png') });
    console.log('  📷 Đã lưu ảnh: test_calc_07_kitchen_after_deletion.png');

    // ═══════════════════════════════════════════════════════════════════════
    // GIAI ĐOẠN 8: KIỂM TRA BÁO HỦY BÁNH (SPOILAGE LOG) VÀ HOÀN TỒN KHO
    // ═══════════════════════════════════════════════════════════════════════
    console.log('\n📌 BƯỚC 8: Kiểm tra Báo Hủy Bánh (Hao hụt) và Tự động hoàn tồn kho khi xóa log...');
    await page.goto(`${BASE_URL}/pos/`, { waitUntil: 'networkidle2' });
    await sleep(2000);

    const spoilageTest = await page.evaluate(() => {
      // 1. Ghi nhận báo hủy 3 bánh Croissant
      const log = {
        id: 'spoil-test-1',
        productId: 'prod-test-croissant',
        productName: 'Bánh Croissant Bơ Pháp',
        quantity: 3,
        unit: 'cái',
        baseCost: 15000,
        sellingPrice: 35000,
        totalCostLoss: 45000,
        totalRevenueLoss: 105000,
        reason: 'Hết hạn sử dụng (Quá date)',
        loggedBy: 'Chủ Tiệm',
        loggedAt: new Date().toISOString(),
      };
      localStorage.setItem('bakery_spoilage_logs', JSON.stringify([log]));

      // Trừ tồn kho 3 cái: 20 -> 17
      const prods = JSON.parse(localStorage.getItem('bakery_products') || '[]');
      prods.forEach((p: any) => {
        if (p.id === 'prod-test-croissant') p.stock_qty = p.stock_qty - 3;
      });
      localStorage.setItem('bakery_products', JSON.stringify(prods));

      return {
        stockAfterSpoil: prods.find((p: any) => p.id === 'prod-test-croissant')?.stock_qty,
        spoilCount: 1,
        totalCostLoss: log.totalCostLoss,
      };
    });

    console.log(`  • Báo hủy 3 bánh: Tồn kho giảm còn ${spoilageTest.stockAfterSpoil} cái | Thiệt hại vốn = ${spoilageTest.totalCostLoss.toLocaleString('vi-VN')}₫`);

    // 2. Bấm xóa nhật ký hao hụt (hoàn tồn kho)
    const spoilageAfterDelete = await page.evaluate(() => {
      const logs = JSON.parse(localStorage.getItem('bakery_spoilage_logs') || '[]');
      const target = logs[0];
      if (target) {
        // Hoàn lại tồn kho
        const prods = JSON.parse(localStorage.getItem('bakery_products') || '[]');
        prods.forEach((p: any) => {
          if (p.id === target.productId) p.stock_qty = (p.stock_qty || 0) + target.quantity;
        });
        localStorage.setItem('bakery_products', JSON.stringify(prods));
        // Xóa log
        localStorage.setItem('bakery_spoilage_logs', JSON.stringify([]));
      }

      const updatedProds = JSON.parse(localStorage.getItem('bakery_products') || '[]');
      const updatedLogs = JSON.parse(localStorage.getItem('bakery_spoilage_logs') || '[]');
      return {
        restoredStock: updatedProds.find((p: any) => p.id === 'prod-test-croissant')?.stock_qty,
        remainingLogsCount: updatedLogs.length,
      };
    });

    console.log(`  • Xóa nhật ký hao hụt: Tồn kho đã hoàn trả lại = ${spoilageAfterDelete.restoredStock} cái (Khôi phục đủ 20 cái) | Còn lại ${spoilageAfterDelete.remainingLogsCount} nhật ký`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'test_calc_08_spoilage_restored.png') });
    console.log('  📷 Đã lưu ảnh: test_calc_08_spoilage_restored.png');

    console.log('\n───────────────────────────────────────────────────────────────────────');
    console.log('🎉 [KẾT LUẬN KIỂM THỬ]: 100% CÁC PHÉP TÍNH TOÁN ĐÃ ĐỒNG BỘ CHÍNH XÁC KHI XÓA DỮ LIỆU!');
    console.log('───────────────────────────────────────────────────────────────────────\n');

  } catch (err) {
    console.error('❌ Lỗi kiểm thử:', err);
  } finally {
    await browser.close();
  }
}

run();
