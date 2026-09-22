import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const FRAMES_DIR = path.join(__dirname, 'temp_mobile_frames');
const OUTPUT_VIDEO = path.join(ARTIFACTS_DIR, 'demo_pos_mobile_animations.mp4');
const OUTPUT_GIF = path.join(ARTIFACTS_DIR, 'demo_pos_mobile_animations.gif');
const BASE_URL = 'http://localhost:3001';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function record() {
  console.log('📱 Bắt đầu ghi hình bản demo POS Mobile Animation...');

  if (fs.existsSync(FRAMES_DIR)) {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-accelerated-2d-canvas',
      '--enable-gpu-rasterization',
      '--disable-gpu-vsync=false',
    ],
  });

  const page = await browser.newPage();

  console.log('🌐 Đang tải trang POS Mobile...');
  await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle2', timeout: 30000 });

  // Thiết lập auth Admin
  await page.evaluate(`(() => {
    localStorage.setItem('bakery_current_user', JSON.stringify({
      id: 'admin-demo',
      username: 'admin',
      name: 'Chủ Tiệm (Admin)',
      role: 'admin'
    }));
  })()`);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);

  // Nhập mã pin nếu màn hình lock xuất hiện
  const hasLockInput = await page.$('input[type="password"]');
  if (hasLockInput) {
    await page.type('input[type="password"]', 'admin123');
    await page.keyboard.press('Enter');
    await sleep(1500);
  }

  // Dọn dẹp các banner push notification
  await page.evaluate(`(() => {
    document.querySelectorAll('div').forEach((d) => {
      if (d.textContent && d.textContent.indexOf('Bật Thông Báo Khi Tắt Màn Hình') !== -1) {
        d.remove();
      }
    });
  })()`);

  // Log tọa độ thực tế của tab Giỏ hàng trên Mobile
  const cartTabInfo = await page.evaluate(`(() => {
    const el = document.getElementById('pos-cart-mobile-tab-target');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, centerX: r.left + r.width / 2, centerY: r.top + r.height / 2 };
  })()`);
  console.log('📍 Tọa độ tab Giỏ hàng trên mobile:', cartTabInfo);

  // Tiêm con trỏ touch ảo mượt mà và ticker compositor
  await page.evaluate(`(() => {
    // 1. Ticker giữ compositor hoạt động liên tục
    const tickerCanvas = document.createElement('canvas');
    tickerCanvas.width = 2;
    tickerCanvas.height = 2;
    tickerCanvas.style.cssText = 'position:fixed;top:0;left:0;opacity:0.01;pointer-events:none;z-index:9999999;';
    document.body.appendChild(tickerCanvas);
    const ctx = tickerCanvas.getContext('2d');
    let tickCount = 0;
    function keepCompositorAlive() {
      tickCount++;
      if (ctx) {
        ctx.fillStyle = tickCount % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'rgba(255,255,255,0.01)';
        ctx.fillRect(0, 0, 2, 2);
      }
      requestAnimationFrame(keepCompositorAlive);
    }
    requestAnimationFrame(keepCompositorAlive);

    // 2. Con trỏ ngón tay / touch ảo
    const touchCursor = document.createElement('div');
    touchCursor.id = 'virtual-touch';
    touchCursor.style.cssText = 'position:fixed;width:32px;height:32px;border-radius:50%;background:rgba(245,158,11,0.4);border:2px solid #f59e0b;box-shadow:0 0 12px rgba(245,158,11,0.6);pointer-events:none;z-index:99999999;transform:translate(-50%, -50%);transition:transform 0.15s ease-out;';
    document.body.appendChild(touchCursor);

    let curX = 195;
    let curY = 400;
    touchCursor.style.left = curX + 'px';
    touchCursor.style.top = curY + 'px';

    window.__glideTouchTo = function(destX, destY, duration) {
      if (!duration) duration = 350;
      return new Promise(function(resolve) {
        var startX = curX;
        var startY = curY;
        var startTime = performance.now();

        function step(now) {
          var elapsed = now - startTime;
          var progress = Math.min(elapsed / duration, 1);
          var ease = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

          curX = startX + (destX - startX) * ease;
          curY = startY + (destY - startY) * ease;
          touchCursor.style.left = curX + 'px';
          touchCursor.style.top = curY + 'px';

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            curX = destX;
            curY = destY;
            touchCursor.style.left = curX + 'px';
            touchCursor.style.top = curY + 'px';
            resolve();
          }
        }

        requestAnimationFrame(step);
      });
    };

    window.__touchTapFeedback = function() {
      touchCursor.style.transform = 'translate(-50%, -50%) scale(0.7)';
      touchCursor.style.background = 'rgba(217,119,6,0.8)';
      setTimeout(function() {
        touchCursor.style.transform = 'translate(-50%, -50%) scale(1)';
        touchCursor.style.background = 'rgba(245,158,11,0.4)';
      }, 180);
    };
  })()`);

  // Bắt đầu Screencast
  console.log('🎥 Bắt đầu Screencast (CDP)...');
  const client = await page.target().createCDPSession();

  let frameIndex = 0;
  let isRecording = true;

  client.on('Page.screencastFrame', async ({ data, sessionId }) => {
    if (!isRecording) return;
    frameIndex++;
    const fileName = `frame_${String(frameIndex).padStart(5, '0')}.jpg`;
    const framePath = path.join(FRAMES_DIR, fileName);
    fs.writeFileSync(framePath, Buffer.from(data, 'base64'));

    try {
      await client.send('Page.screencastFrameAck', { sessionId });
    } catch {}
  });

  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 95,
    maxWidth: 780,
    maxHeight: 1688,
    everyNthFrame: 1,
  });

  console.log('🎬 Cảnh 1: Giao diện POS Mobile ban đầu với thanh 6 Tab...');
  await sleep(1500);

  // Tìm các sản phẩm hiển thị trên màn hình
  const productCards = await page.$$('.group.bg-white.rounded-3xl, .bg-white.rounded-2xl.border');
  console.log(`Tìm thấy ${productCards.length} sản phẩm trên màn hình mobile`);

  async function tapProduct(index: number, label: string) {
    console.log(`🎬 Chạm ngón tay và thêm món: ${label}...`);
    const card = productCards[index];
    if (!card) return;
    const box = await card.boundingBox();
    if (box) {
      const targetX = Math.round(box.x + box.width / 2);
      const targetY = Math.round(box.y + box.height / 2);

      await page.evaluate(`window.__glideTouchTo(${targetX}, ${targetY}, 400)`);
      await sleep(450);

      await page.evaluate(`window.__touchTapFeedback()`);
      await page.mouse.click(targetX, targetY);

      // Chờ quan sát hiệu ứng bánh bay thẳng vào tab Giỏ hàng trên thanh điều hướng đỉnh
      await sleep(1600);
    }
  }

  // Chạm món 1
  if (productCards.length > 0) {
    await tapProduct(0, 'Món 1');
  }

  // Chạm món 2
  if (productCards.length > 1) {
    await tapProduct(1, 'Món 2');
  }

  // Chuyển sang Cảnh 3: Chạm vào Tab Giỏ Hàng ở trên cùng để xem giỏ hàng
  console.log('🎬 Cảnh 3: Chạm mở tab Giỏ Hàng trên thanh điều hướng...');
  const cartTabBtn = await page.$('#pos-cart-mobile-tab-target');
  if (cartTabBtn) {
    const tabBox = await cartTabBtn.boundingBox();
    if (tabBox) {
      const targetX = Math.round(tabBox.x + tabBox.width / 2);
      const targetY = Math.round(tabBox.y + tabBox.height / 2);

      await page.evaluate(`window.__glideTouchTo(${targetX}, ${targetY}, 400)`);
      await sleep(450);

      await page.evaluate(`window.__touchTapFeedback()`);
      await page.mouse.click(targetX, targetY);
      await sleep(2000);
    }
  }

  // Cảnh 4: Xem giỏ hàng mobile và nút Thanh toán
  console.log('🎬 Cảnh 4: Xem chi tiết giỏ hàng và tổng tiền...');
  await sleep(2000);

  // Dừng quay
  console.log('⏹️ Dừng Screencast...');
  isRecording = false;
  await client.send('Page.stopScreencast');
  await browser.close();

  console.log(`📸 Thu được ${frameIndex} frames!`);

  // Render MP4
  console.log(`🎞️ Render video MP4 -> ${OUTPUT_VIDEO}...`);
  const ffmpegVideoCmd = `ffmpeg -y -framerate 30 -i "frame_%05d.jpg" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -movflags +faststart "${OUTPUT_VIDEO}"`;
  execSync(ffmpegVideoCmd, { cwd: FRAMES_DIR, stdio: 'inherit' });

  // Render GIF
  console.log(`🖼️ Xuất ảnh GIF -> ${OUTPUT_GIF}...`);
  const ffmpegGifCmd = `ffmpeg -y -i "${OUTPUT_VIDEO}" -vf "fps=20,scale=390:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer" "${OUTPUT_GIF}"`;
  execSync(ffmpegGifCmd, { cwd: FRAMES_DIR, stdio: 'inherit' });

  console.log('🎉 Hoàn tất xuất Video và GIF demo POS Mobile!');
}

record().catch((err) => {
  console.error('❌ Lỗi khi quay video mobile:', err);
  process.exit(1);
});
