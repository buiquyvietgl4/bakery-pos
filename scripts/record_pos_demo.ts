import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = 'C:\\Users\\H\\.gemini\\antigravity\\brain\\60b78812-4fb4-4b45-a7e5-90bb596df1a5';
const FRAMES_DIR = path.join(__dirname, 'temp_frames');
const OUTPUT_VIDEO = path.join(ARTIFACTS_DIR, 'demo_pos_animations.mp4');
const OUTPUT_GIF = path.join(ARTIFACTS_DIR, 'demo_pos_animations.gif');
const BASE_URL = 'http://localhost:3001';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function record() {
  console.log('🚀 Bắt đầu ghi hình bản demo POS Animation 60FPS siêu mượt...');

  if (fs.existsSync(FRAMES_DIR)) {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1400, height: 900, deviceScaleFactor: 1 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--enable-accelerated-2d-canvas',
      '--enable-gpu-rasterization',
      '--disable-gpu-vsync=false',
    ]
  });

  const page = await browser.newPage();

  console.log('🌐 Đang tải trang POS...');
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

  // Tiêm con trỏ chuột mượt mà 60fps qua requestAnimationFrame và ticker giữ compositor luôn hoạt động
  await page.evaluate(`(() => {
    // 1. Ticker 60fps giữ Chrome compositor liên tục xuất frame mượt mà
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

    // 2. Con trỏ chuột ảo rực rỡ cao cấp
    const cursor = document.createElement('div');
    cursor.id = 'virtual-cursor';
    cursor.style.cssText = 'position:fixed;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #fbbf24, #d97706);border:2.5px solid #ffffff;box-shadow:0 0 16px rgba(217, 119, 6, 0.75), 0 4px 8px rgba(0,0,0,0.3);pointer-events:none;z-index:99999999;transform:translate(-50%, -50%);will-change:transform, left, top;';
    document.body.appendChild(cursor);

    let curX = 400;
    let curY = 300;
    cursor.style.left = curX + 'px';
    cursor.style.top = curY + 'px';

    window.__glideCursorTo = function(destX, destY, duration) {
      if (!duration) duration = 400;
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
          cursor.style.left = curX + 'px';
          cursor.style.top = curY + 'px';

          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            curX = destX;
            curY = destY;
            cursor.style.left = curX + 'px';
            cursor.style.top = curY + 'px';
            resolve();
          }
        }

        requestAnimationFrame(step);
      });
    };

    window.__clickCursorFeedback = function() {
      cursor.style.transform = 'translate(-50%, -50%) scale(0.65)';
      cursor.style.filter = 'brightness(1.2)';
      setTimeout(function() {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.filter = 'none';
      }, 160);
    };
  })()`);

  // Bắt đầu CDP Screencast
  console.log('🎥 Bắt đầu Screencast (CDP)...');
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

  console.log('🎬 Cảnh 1: Chiêm ngưỡng giỏ hàng ban đầu (Floating Slow)...');
  await sleep(1500);

  // Lấy các thẻ sản phẩm
  const productCards = await page.$$('.group.bg-white.rounded-3xl');
  console.log(`Tìm thấy ${productCards.length} sản phẩm trên quầy`);

  async function clickProductWithGlide(index: number, label: string) {
    console.log(`🎬 Di chuột và thêm món: ${label}...`);
    const card = productCards[index];
    const box = await card.boundingBox();
    if (box) {
      const targetX = Math.round(box.x + box.width / 2);
      const targetY = Math.round(box.y + box.height / 2);

      // Lướt chuột mượt mà 60fps đến sản phẩm
      await page.evaluate(`window.__glideCursorTo(${targetX}, ${targetY}, 500)`);
      await sleep(550);

      // Hiệu ứng bấm chuột và trigger click thực tế
      await page.evaluate(`window.__clickCursorFeedback()`);
      await page.mouse.click(targetX, targetY);

      // Chờ trọn vẹn quỹ đạo parabol bay 1150ms + rung giỏ squash 600ms + trượt slide-in
      await sleep(1800);
    }
  }

  if (productCards.length >= 3) {
    // Cảnh 2: Thêm món thứ 1
    await clickProductWithGlide(0, 'Món 1 - Cốt Bánh Bắp Phô Mai 20cm');

    // Cảnh 3: Thêm món thứ 2
    await clickProductWithGlide(1, 'Món 2 - Cốt Bánh Bông Lan Vani 18cm');

    // Cảnh 4: Thêm món thứ 3
    await clickProductWithGlide(2, 'Món 3 - Sốt Phô Mai Trứng Muối');
  }

  // Cảnh 5: Di chuyển mượt mà sang giỏ hàng bấm tăng số lượng (+)
  console.log('🎬 Cảnh 5: Thao tác tăng số lượng trong giỏ hàng...');
  const cartPlusBtn = await page.$('[data-testid="pos-cart-plus-btn"]');
  if (cartPlusBtn) {
    const plusBox = await cartPlusBtn.boundingBox();
    if (plusBox) {
      const targetX = Math.round(plusBox.x + plusBox.width / 2);
      const targetY = Math.round(plusBox.y + plusBox.height / 2);

      await page.evaluate(`window.__glideCursorTo(${targetX}, ${targetY}, 550)`);
      await sleep(350);

      // Bấm tăng lần 1
      await page.evaluate(`window.__clickCursorFeedback()`);
      await page.mouse.click(targetX, targetY);
      await sleep(750);

      // Bấm tăng lần 2
      await page.evaluate(`window.__clickCursorFeedback()`);
      await page.mouse.click(targetX, targetY);
      await sleep(1000);
    }
  }

  // Cảnh 6: Di chuột sang nút "Thanh Toán Ngay" ngắm vệt sáng Shimmer
  console.log('🎬 Cảnh 6: Chiêm ngưỡng hiệu ứng Luxury Shimmer trên nút Thanh Toán...');
  const checkoutBtn = await page.$('#pos-checkout-btn');
  if (checkoutBtn) {
    const payBox = await checkoutBtn.boundingBox();
    if (payBox) {
      const targetX = Math.round(payBox.x + payBox.width / 2);
      const targetY = Math.round(payBox.y + payBox.height / 2);

      await page.evaluate(`window.__glideCursorTo(${targetX}, ${targetY}, 600)`);
      await sleep(1800); // Ngắm vệt sáng kim loại sang trọng lướt qua nút

      // Cảnh 7: Bấm mở modal thanh toán
      console.log('🎬 Cảnh 7: Bấm mở modal thanh toán...');
      await page.evaluate(`window.__clickCursorFeedback()`);
      await page.mouse.click(targetX, targetY);
      await sleep(2500); // Giữ modal hiển thị đẹp mắt
    }
  }

  // Kết thúc ghi hình
  console.log('⏹️ Dừng Screencast...');
  isRecording = false;
  await client.send('Page.stopScreencast');
  await browser.close();

  console.log(`📸 Thu được ${frames.length} frames mượt mà!`);

  // Ghép video MP4 30FPS mượt mà tuyệt đối từ chuỗi frame (zero jitter)
  console.log(`🎞️ Đang render video MP4 30FPS siêu mượt -> ${OUTPUT_VIDEO}...`);
  const ffmpegVideoCmd = `ffmpeg -y -framerate 30 -i "frame_%05d.jpg" -c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow -movflags +faststart "${OUTPUT_VIDEO}"`;
  execSync(ffmpegVideoCmd, { cwd: FRAMES_DIR, stdio: 'inherit' });

  // Xuất GIF mượt mà 24FPS
  console.log(`🖼️ Đang xuất ảnh động GIF 24FPS -> ${OUTPUT_GIF}...`);
  const ffmpegGifCmd = `ffmpeg -y -i "${OUTPUT_VIDEO}" -vf "fps=24,scale=760:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer" "${OUTPUT_GIF}"`;
  execSync(ffmpegGifCmd, { cwd: FRAMES_DIR, stdio: 'inherit' });

  console.log('🎉 Hoàn tất xuất Video và GIF demo siêu mượt!');
}

record().catch((err) => {
  console.error('❌ Lỗi khi quay video:', err);
  process.exit(1);
});
