// scripts/get_network_ip.js
// Tự động quét và trả về địa chỉ IP mạng nội bộ (WiFi/LAN) của máy tính chủ
const os = require('os');

function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Bỏ qua IPv6 và loopback (127.0.0.1)
      if (net.family === 'IPv4' && !net.internal) {
        // Bỏ qua dải APIPA 169.254.x.x (khi chưa có DHCP)
        if (!net.address.startsWith('169.254.')) {
          // Ưu tiên dải IP mạng gia đình/cửa hàng thông dụng (192.168.x, 10.x, 172.16-31.x)
          if (net.address.startsWith('192.168.') || net.address.startsWith('10.') || net.address.startsWith('172.')) {
            candidates.unshift(net.address);
          } else {
            candidates.push(net.address);
          }
        }
      }
    }
  }

  return candidates[0] || '127.0.0.1';
}

const ip = getLanIp();
console.log(ip);
