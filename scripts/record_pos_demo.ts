import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const FRAMES_DIR = path.join(__dirname, 'temp_frames');
const OUTPUT_VIDEO = path.join(ARTIFACTS_DIR, 'demo_pos_animations.mp4');
const BASE_URL = 'http://localhost:3001';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function smoothMouseMove(page: any, startX: number, startY: number, endX: number, endY: number, steps = 18) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const curX = Math.round(startX + (endX - startX) * ease);
    const curY = Math.round(startY + (endY - startY) * ease);
    await page.evaluate((x: number, y: number) => {
      if ((window as any).__moveCursor) (window as any).__moveCursor(x, y);
    }, curX, curY);
    await page.mouse.move(curX, curY);
    await sleep(20);
  }
}

async function record() {
  console.log('🚀 Bắt đầu kịch bản quay video demo hiệu ứng POS sống động...');
  
  if (fs.existsSync(FRAMES_DIR)) {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1400, height: 900, deviceScaleFactor: 1 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu=false']
  });

  const page = await browser.newPage();

  console.log('🌐 Đang tải trang POS...');
  await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle2', timeout: 30000 });

  // Thiết lập auth Admin
  await page.evaluate(() => {
    localStorage.setItem('bakery_current_user', JSON.stringify({
      id: 'admin-demo',
      username: 'admin',
      name: 'Chủ Tiệm (Admin)',
      role: 'admin'
    }));
  });

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);

  // Nhập mã pin nếu màn hình lock xuất hiện
  const hasLockInput = await page.$('input[type="password"]');
  if (hasLockInput) {
    await page.type('input[type="password"]', 'admin123');
    await page.keyboard.press('Enter');
    await sleep(1500);
  }

  // Dọn dẹp các banner push notification để không che màn hình
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach((d) => {
      if (d.textContent?.includes('Bật Thông Báo Khi Tắt Màn Hình')) {
        d.remove();
      }
    });
  });

  // Tiêm con trỏ chuột ảo sắc nét và sống động
  await page.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.id = 'virtual-cursor';
    cursor.style.position = 'fixed';
    cursor.style.width = '24px';
    cursor.style.height = '24px';
    cursor.style.borderRadius = '50%';
    cursor.style.backgroundColor = 'rgba(245, 158, 11, 0.9)';
    cursor.style.border = '2.5px solid #ffffff';
    cursor.style.boxShadow = '0 0 14px rgba(217, 119, 6, 0.7), 0 4px 8px rgba(0,0,0,0.35)';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '9999999';
    cursor.style.transform = 'translate(-50%, -50%)';
    cursor.style.transition = 'transform 0.12s ease-out, background-color 0.15s ease';
    document.body.appendChild(cursor);

    (window as any).__moveCursor = (x: number, y: number) => {
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
    };

    (window as any).__clickCursor = () => {
      cursor.style.transform = 'translate(-50%, -50%) scale(0.6)';
      cursor.style.backgroundColor = 'rgba(217, 119, 6, 1)';
      setTimeout(() => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.backgroundColor = 'rgba(245, 158, 11, 0.9)';
      }, 180);
    };
  });

  // Khởi tạo CDP Session Screencast
  console.log('🎥 Bắt đầu Screencast ghi lại khung hình (CDP)...');
  const client = await page.target().createCDPSession();

  let frameIndex = 0;
  interface FrameMeta {
    fileName: string;
    timestamp: number;
  }
  const frames: FrameMeta[] = [];
  let isRecording = true;

  client.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    if (!isRecording) return;
    frameIndex++;
    const fileName = `frame_${String(frameIndex).padStart(5, '0')}.jpg`;
    const framePath = path.join(FRAMES_DIR, fileName);
    fs.writeFileSync(framePath, Buffer.from(data, 'base64'));
    frames.push({ fileName, timestamp: metadata.timestamp });

    try {
      await client.send('Page.screencastFrameAck', { sessionId });
    } catch {}
  });

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 95,
    maxWidth: 1400,
    maxHeight: 900,
    everyNthFrame: 1,
  });

  let curX = 400;
  let curY = 300;
  await page.evaluate((x: number, y: number) => (window as any).__moveCursor?.(x, y), curX, curY);

  console.log('🎬 Cảnh 1: Hiển thị giỏ hàng ban đầu (Floating basket animation)...');
  await sleep(1500);

  // Lấy các card sản phẩm
  const productCards = await page.$$('.group.bg-white.rounded-3xl');
  console.log(`Tìm thấy ${productCards.length} sản phẩm trên quầy`);

  if (productCards.length >= 3) {
    // CẢNH 2: Thêm món thứ 1
    console.log('🎬 Cảnh 2: Thêm món 1 -> Hiệu ứng Hạt Bánh Bay (Fly-to-Cart) & Rung Giỏ (Cart Jiggle)...');
    const box1 = await productCards[0].boundingBox();
    if (box1) {
      const targetX = box1.x + box1.width / 2;
      const targetY = box1.y + box1.height / 2;
      await smoothMouseMove(page, curX, curY, targetX, targetY, 20);
      curX = targetX;
      curY = targetY;
      await sleep(300);

      await page.evaluate(() => (window as any).__clickCursor?.());
      await page.mouse.click(curX, curY);
      await sleep(1400); // Ngắm hạt bánh bay hình cầu vồng và giỏ rung
    }

    // CẢNH 3: Thêm món thứ 2
    console.log('🎬 Cảnh 3: Thêm món 2 -> Slide-in Right & Glow Pulse tổng tiền...');
    const box2 = await productCards[1].boundingBox();
    if (box2) {
      const targetX = box2.x + box2.width / 2;
      const targetY = box2.y + box2.height / 2;
      await smoothMouseMove(page, curX, curY, targetX, targetY, 20);
      curX = targetX;
      curY = targetY;
      await sleep(300);

      await page.evaluate(() => (window as any).__clickCursor?.());
      await page.mouse.click(curX, curY);
      await sleep(1400);
    }

    // CẢNH 4: Thêm món thứ 3
    console.log('🎬 Cảnh 4: Thêm món 3 -> Tích luỹ giỏ hàng...');
    const box3 = await productCards[2].boundingBox();
    if (box3) {
      const targetX = box3.x + box3.width / 2;
      const targetY = box3.y + box3.height / 2;
      await smoothMouseMove(page, curX, curY, targetX, targetY, 20);
      curX = targetX;
      curY = targetY;
      await sleep(300);

      await page.evaluate(() => (window as any).__clickCursor?.());
      await page.mouse.click(curX, curY);
      await sleep(1400);
    }
  }

  // CẢNH 5: Tăng số lượng trong giỏ
  console.log('🎬 Cảnh 5: Bấm nút tăng số lượng trong giỏ -> Xem Pop-scale và Total Glow Pulse...');
  const cartPlusBtn = await page.$('[data-testid="pos-cart-plus-btn"]');
  if (cartPlusBtn) {
    const plusBox = await cartPlusBtn.boundingBox();
    if (plusBox) {
      const targetX = plusBox.x + plusBox.width / 2;
      const targetY = plusBox.y + plusBox.height / 2;
      await smoothMouseMove(page, curX, curY, targetX, targetY, 20);
      curX = targetX;
      curY = targetY;
      await sleep(400);

      // Click tăng lần 1
      await page.evaluate(() => (window as any).__clickCursor?.());
      await page.mouse.click(curX, curY);
      await sleep(700);

      // Click tăng lần 2
      await page.evaluate(() => (window as any).__clickCursor?.());
      await page.mouse.click(curX, curY);
      await sleep(1000);
    }
  }

  // CẢNH 6: Di chuột đến nút "Thanh Toán Ngay" có hiệu ứng Shimmer
  console.log('🎬 Cảnh 6: Chiêm ngưỡng hiệu ứng Button Shimmer trên nút Thanh Toán...');
  const checkoutBtn = await page.$('#pos-checkout-btn');
  if (checkoutBtn) {
    const payBox = await checkoutBtn.boundingBox();
    if (payBox) {
      const targetX = payBox.x + payBox.width / 2;
      const targetY = payBox.y + payBox.height / 2;
      await smoothMouseMove(page, curX, curY, targetX, targetY, 25);
      curX = targetX;
      curY = targetY;
      await sleep(1600); // Ngắm hiệu ứng vệt sáng kim loại shimmer lướt qua nút

      // Click nút Thanh Toán
      console.log('🎬 Cảnh 7: Bấm mở modal thanh toán...');
      await page.evaluate(() => (window as any).__clickCursor?.());
      await page.mouse.click(curX, curY);
      await sleep(2500); // Giữ modal thanh toán mở để kết thúc video đẹp mắt
    }
  }

  // Hoàn tất quay
  console.log('⏹️ Dừng Screencast...');
  isRecording = false;
  await client.send('Page.stopScreencast');
  await browser.close();

  console.log(`📸 Đã thu được tổng cộng ${frames.length} frames!`);

  if (frames.length === 0) {
    throw new Error('Không thu được frame nào từ Screencast!');
  }

  // Tạo file concat.txt với timestamp thực tế
  console.log('📝 Đang tạo file cấu hình timing khung hình (ffconcat)...');
  const concatFile = path.join(FRAMES_DIR, 'concat.txt');
  let concatLines = 'ffconcat version 1.0\n';

  for (let i = 0; i < frames.length; i++) {
    let duration = 0.04; // mặc định 25fps
    if (i < frames.length - 1) {
      const diff = frames[i + 1].timestamp - frames[i].timestamp;
      // Giới hạn duration tối thiểu và tối đa hợp lý
      duration = Math.min(Math.max(diff, 0.016), 0.2);
    }
    concatLines += `file '${frames[i].fileName}'\n`;
    concatLines += `duration ${duration.toFixed(4)}\n`;
  }
  // Thêm frame cuối
  concatLines += `file '${frames[frames.length - 1].fileName}'\n`;

  fs.writeFileSync(concatFile, concatLines);

  // Ghép video bằng FFmpeg với concat demuxer
  console.log(`🎞️ Đang ghép video bằng FFmpeg -> ${OUTPUT_VIDEO}...`);
  const ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i concat.txt -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${OUTPUT_VIDEO}"`;
  execSync(ffmpegCmd, { cwd: FRAMES_DIR, stdio: 'inherit' });

  if (fs.existsSync(OUTPUT_VIDEO)) {
    const stats = fs.statSync(OUTPUT_VIDEO);
    console.log(`✅ Thành công tạo video demo POS Animation!`);
    console.log(`📁 Dung lượng: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📍 Đường dẫn: ${OUTPUT_VIDEO}`);
  } else {
    throw new Error('File video không tồn tại sau khi chạy ffmpeg!');
  }
}

record().catch((err) => {
  console.error('❌ Lỗi khi quay video demo:', err);
  process.exit(1);
});
