#!/usr/bin/env node
/**
 * scripts/run_tunnel.js
 * ==============================================================================
 * KÍCH HOẠT ĐƯỜNG HẦM HTTPS CLOUDFLARE CHO TIỆM BÁNH BAKERY ERP
 * ==============================================================================
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const CLOUDFLARED_PATH = path.join(ROOT_DIR, 'tools', 'cloudflared.exe');

// Màu sắc console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

if (!fs.existsSync(CLOUDFLARED_PATH)) {
  console.clear();
  log('================================================================================', colors.red);
  log(' ❌ KHÔNG TÌM THẤY CÔNG CỤ CLOUDFLARE TUNNEL (tools\\cloudflared.exe)', colors.bright + colors.red);
  log('================================================================================\n', colors.red);
  log('Đang tự động tải lại công cụ, vui lòng đợi trong giây lát...', colors.yellow);
  try {
    const toolsDir = path.join(ROOT_DIR, 'tools');
    if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });
    execSync(`curl.exe -L -o "${CLOUDFLARED_PATH}" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"`, { stdio: 'inherit' });
  } catch (err) {
    log(`Lỗi khi tải: ${err.message}`, colors.red);
    process.exit(1);
  }
}

console.clear();
log('================================================================================', colors.cyan);
log('   🧁 BAKERY ERP - ĐƯỜNG HẦM HTTPS CLOUDFLARE CHO TIỆM BÁNH 🚀   ', colors.bright + colors.cyan);
log('================================================================================', colors.cyan);
log('⏳ Đang kết nối mạng lưới toàn cầu Cloudflare và tạo đường dẫn bảo mật HTTPS...', colors.yellow);
log('   (Quá trình này mất khoảng 3 - 5 giây, vui lòng đợi)\n', colors.dim);

// Chạy cloudflared với giao thức http2 chuẩn TCP, tránh lỗi timeout DNS của mạng Việt Nam
const child = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', 'http://localhost:3000', '--protocol', 'http2'], {
  cwd: ROOT_DIR,
  windowsHide: true,
});

let tunnelUrl = null;

function copyToClipboard(text) {
  try {
    execSync(`powershell -NoProfile -Command "Set-Clipboard -Value '${text}'"`, { stdio: 'ignore' });
    return true;
  } catch {
    try {
      execSync(`cmd /c "echo ${text}| clip"`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}

function displayReadyScreen(url) {
  console.clear();
  log('================================================================================', colors.green);
  log('   🎉 ĐƯỜNG HẦM HTTPS CLOUDFLARE ĐÃ SẴN SÀNG HOẠT ĐỘNG! 🚀   ', colors.bright + colors.green);
  log('================================================================================\n', colors.green);

  log('🔗 ĐƯỜNG LINK HTTPS CHÍNH THỨC CỦA TIỆM BÁNH:', colors.bright + colors.yellow);
  log(`   👉 ${url}\n`, colors.bright + colors.cyan);

  const copied = copyToClipboard(url);
  if (copied) {
    log('📋 [ĐÃ TỰ ĐỘNG SAO CHÉP]: Đường link trên đã được nạp vào bộ nhớ đệm (Clipboard)!', colors.bright + colors.green);
    log('   (Bạn chỉ cần mở Zalo hoặc tin nhắn trên máy tính, bấm [ Ctrl + V ] gửi sang điện thoại)\n', colors.dim);
  }

  log('--------------------------------------------------------------------------------', colors.dim);
  log('📱 HƯỚNG DẪN DÙNG TRÊN ĐIỆN THOẠI ĐỂ NHẬN THÔNG BÁO KHI TẮT MÀN HÌNH:', colors.bright + colors.white);
  log('   1. Mở link trên bằng Safari (trên iPhone) hoặc Chrome (trên Android).', colors.white);
  log('   2. Vào mục bán hàng: ' + `${url}/pos`, colors.cyan);
  log('   3. Khi trình duyệt hỏi "Cho phép nhận thông báo?" -> Bấm "Cho phép" (Allow).', colors.white);
  log('   4. Khóa màn hình điện thoại lại, rồi thử tạo 1 đơn hàng trên máy tính.', colors.white);
  log('   ➔ Điện thoại sẽ sáng màn hình, rung và phát chuông báo có đơn mới!\n', colors.green);

  log('--------------------------------------------------------------------------------', colors.dim);
  log('💡 LƯU Ý:', colors.yellow);
  log('   • Giữ cửa sổ này luôn mở trong suốt thời gian bán hàng tại tiệm.', colors.dim);
  log('   • Đảm bảo phần mềm tiệm bánh (CHAY_PHAN_MEM_TIEM_BANH.bat) cũng đang chạy song song.', colors.dim);
  log('   • Bấm [ Ctrl + C ] hoặc đóng cửa sổ này khi kết thúc ngày bán hàng.\n', colors.dim);
  log('================================================================================', colors.green);
  log('🟢 TRẠNG THÁI: Đang duy trì kết nối an toàn với máy chủ Cloudflare...', colors.bright + colors.green);
}

function handleOutput(data) {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match && !tunnelUrl) {
    tunnelUrl = match[0];
    displayReadyScreen(tunnelUrl);
  }
}

child.stdout.on('data', handleOutput);
child.stderr.on('data', handleOutput);

child.on('close', (code) => {
  log(`\n⚠️ Đường hầm đã đóng (Mã thoát: ${code}).\n`, colors.yellow);
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  child.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  child.kill();
  process.exit(0);
});
