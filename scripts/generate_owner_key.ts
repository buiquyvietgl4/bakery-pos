// scripts/generate_owner_key.ts
// Lệnh sinh File Chìa Khóa Cứng Kỹ Thuật Số (.key) Ngoại Tuyến (Air-Gapped Offline)
// Chạy lệnh: npm run create-key
// Không thông qua trình duyệt web -> An toàn tuyệt đối, không ai tại quầy có thể tải lén!

import * as fs from 'fs';
import * as path from 'path';

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  let hash2 = 5381;
  for (let i = str.length - 1; i >= 0; i--) {
    hash2 = (hash2 * 33) ^ str.charCodeAt(i);
    hash2 |= 0;
  }
  const hex2 = Math.abs(hash2).toString(16).padStart(8, '0');
  return `${hex}${hex2}`;
}

const MASTER_HARD_ROOT_SECRET = 'Quyviet97@';

// Đọc bí mật từ .env.local nếu có
let secret = MASTER_HARD_ROOT_SECRET;
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^([^=]+)=(.*)$/);
      if (match && (match[1].trim() === 'ROOT_ADMIN_KEY' || match[1].trim() === 'ADMIN_ROOT_KEY')) {
        secret = match[2].trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
} catch {}

const timestamp = new Date().toISOString();
const keyId = 'root-key-' + Date.now().toString(36);
const fingerprint = simpleHash(`FINGERPRINT:${secret}:${keyId}`);
const signature = simpleHash(`SIG:${secret}:${keyId}:${fingerprint}:ROOT_OWNER_IMMUTABLE`);

const payload = {
  app: 'BakeryERP',
  type: 'OWNER_ROOT_DIGITAL_KEY',
  version: '1.0',
  store_id: 'primary-bakery-store',
  created_at: timestamp,
  root_key_id: keyId,
  fingerprint,
  signature,
};

const fileName = `bakery-owner-root-${new Date().toISOString().slice(0, 10)}.key`;
const filePath = path.resolve(process.cwd(), fileName);

fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║       TẠO THÀNH CÔNG FILE CHÌA KHÓA CỨNG (ROOT DIGITAL KEY)  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log(`📁 Tệp đã tạo: ${fileName}`);
console.log(`📍 Đường dẫn : ${filePath}\n`);
console.log('👉 HƯỚNG DẪN BẢO MẬT:');
console.log('1. Hãy chép (copy) file này vào USB cá nhân của riêng bạn.');
console.log('2. Xóa file này khỏi máy tính chung của cửa hàng sau khi đã chép sang USB.');
console.log('3. Khi cần khôi phục quyền Admin, cắm USB và nạp file này tại màn hình khóa!');
console.log('══════════════════════════════════════════════════════════════\n');
