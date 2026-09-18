// scripts/print_lan_banner.js
// In thông tin địa chỉ kết nối mạng LAN to, rõ ràng, không lỗi font
const os = require('os');

function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.')) {
        if (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.')) {
          candidates.unshift(net.address);
        } else {
          candidates.push(net.address);
        }
      }
    }
  }
  return candidates[0] || '127.0.0.1';
}

const ip = getLanIp();
const port = process.env.PORT || 3000;

console.log('');
console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║        HỆ THỐNG BÁN HÀNG VÀ QUẢN TRỊ TIỆM BÁNH (BAKERY POS)            ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('  👉 TRÊN MÁY TÍNH NÀY (MÁY CHỦ):');
console.log(`     - Màn hình Bán hàng (POS): http://localhost:${port}/pos`);
console.log(`     - Màn hình Quản trị Admin: http://localhost:${port}/admin`);
console.log(`     - Màn hình Bếp làm bánh:   http://localhost:${port}/kitchen`);
console.log('');
if (ip !== '127.0.0.1') {
  console.log('  📱 TRÊN ĐIỆN THOẠI / IPAD / MÁY CON (CÙNG MẠNG WIFI):');
  console.log(`     👉👉👉  http://${ip}:${port}/pos  👈👈👈`);
  console.log(`     - Hoặc trang chủ: http://${ip}:${port}`);
  console.log('     (Mở Safari hoặc Chrome trên điện thoại và gõ chính xác dòng trên)');
} else {
  console.log('  ⚠️ Chưa phát hiện địa chỉ WiFi. Hãy kết nối máy tính vào mạng WiFi của tiệm.');
}
console.log('');
console.log('════════════════════════════════════════════════════════════════════════');
console.log('  Đang khởi động Server... Vui lòng giữ cửa sổ này trong suốt ca bán.');
console.log('════════════════════════════════════════════════════════════════════════');
console.log('');
