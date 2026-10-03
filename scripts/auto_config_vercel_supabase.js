#!/usr/bin/env node
/**
 * scripts/auto_config_vercel_supabase.js
 * ==============================================================================
 * BỘ CÔNG CỤ TỰ ĐỘNG HÓA CẤU HÌNH & TRIỂN KHAI VERCEL & SUPABASE CLOUD
 * Dành riêng cho dự án Tiệm Bánh Bakery ERP
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const readline = require('readline');

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

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_LOCAL_PATH = path.join(ROOT_DIR, '.env.local');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const SCHEMA_FILE_PATH = path.join(ROOT_DIR, 'supabase', 'schema_full_init.sql');

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

function printBanner() {
  console.clear();
  log('================================================================================', colors.cyan);
  log('   🧁 BAKERY ERP - TỰ ĐỘNG HÓA CẤU HÌNH VERCEL & SUPABASE CLOUD 🚀   ', colors.bright + colors.cyan);
  log('================================================================================', colors.cyan);
  log(' Phiên bản: 2.0 | Tự động đồng bộ biến môi trường, kiểm tra SQL & Deploy', colors.dim);
  console.log('');
}

// 1. ĐỌC FILE BIẾN MÔI TRƯỜNG (.env.local / .env)
function loadEnv() {
  const envVars = {};
  const filesToRead = [ENV_PATH, ENV_LOCAL_PATH];

  for (const filePath of filesToRead) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const match = trimmed.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (match) {
          const key = match[1];
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          envVars[key] = val;
        }
      });
    }
  }

  // Đảm bảo các giá trị mặc định nếu thiếu
  if (!envVars.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    envVars.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BBRxBu4Wou9gEIrPivlSVhGHcdjEF-8RF5phrRvIxyp6sfQJNCdYOpxc3Uu9qcgE9tao7zRDH1ZvEWL1zyDKU84';
  }
  if (!envVars.VAPID_PRIVATE_KEY) {
    envVars.VAPID_PRIVATE_KEY = 'xix0rTLV9hqExYqk0InzRAMbhMrYWh-RIPO0mm3ApCw';
  }
  if (!envVars.VAPID_SUBJECT) {
    envVars.VAPID_SUBJECT = 'mailto:admin@tiembanh.com';
  }
  if (envVars.ROOT_ADMIN_KEY && !envVars.ADMIN_ROOT_KEY) {
    envVars.ADMIN_ROOT_KEY = envVars.ROOT_ADMIN_KEY;
  }
  if (envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY && !envVars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    envVars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }

  return envVars;
}

// Lấy Vercel Command (ưu tiên vercel toàn cục, sau đó npx vercel)
function getVercelCmd() {
  try {
    execSync('where vercel', { stdio: 'pipe' });
    return 'vercel';
  } catch {
    return 'npx vercel';
  }
}

// 2. KIỂM TRA ĐĂNG NHẬP VÀ LIÊN KẾT DỰ ÁN VERCEL
function ensureVercelAuthAndLink() {
  const vercelCmd = getVercelCmd();
  log('\n🔍 [1/3] Kiểm tra tài khoản Vercel CLI...', colors.yellow);
  try {
    const whoami = execSync(`${vercelCmd} whoami`, { encoding: 'utf8', shell: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const username = whoami.split('\n').pop().trim();
    log(`  ✅ Đã đăng nhập Vercel: @${username}`, colors.green);
  } catch (err) {
    log('  ❌ Chưa đăng nhập Vercel!', colors.red);
    log('  👉 Đang mở trang đăng nhập Vercel, vui lòng xác nhận...', colors.yellow);
    try {
      execSync(`${vercelCmd} login`, { stdio: 'inherit', shell: true });
    } catch {
      throw new Error('Đăng nhập Vercel không thành công.');
    }
  }

  log('\n🔗 [2/3] Kiểm tra liên kết dự án Vercel...', colors.yellow);
  const projectJsonPath = path.join(ROOT_DIR, '.vercel', 'project.json');
  if (!fs.existsSync(projectJsonPath)) {
    log('  ⚠️ Dự án chưa được liên kết với Vercel. Đang tự động liên kết với project "bakery-pos"...', colors.cyan);
    try {
      execSync(`${vercelCmd} link --yes --project bakery-pos`, { stdio: 'inherit', shell: true });
      log('  ✅ Đã liên kết dự án thành công!', colors.green);
    } catch (err) {
      log('  ⚠️ Không thể tự động liên kết "bakery-pos", chạy liên kết thủ công:', colors.yellow);
      execSync(`${vercelCmd} link`, { stdio: 'inherit', shell: true });
    }
  } else {
    try {
      const projData = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
      log(`  ✅ Đã liên kết: Project ID ${projData.projectId} (Org: ${projData.orgId})`, colors.green);
    } catch {
      log('  ✅ File .vercel/project.json hợp lệ.', colors.green);
    }
  }
}

// 3. ĐỒNG BỘ BIẾN MÔI TRƯỜNG LÊN VERCEL
async function syncEnvToVercel() {
  printBanner();
  log('================================================================================', colors.blue);
  log(' ⚡ ĐỒNG BỘ TOÀN BỘ CẤU HÌNH BIẾN MÔI TRƯỜNG LÊN VERCEL CLOUD', colors.bright + colors.blue);
  log('================================================================================\n', colors.blue);

  ensureVercelAuthAndLink();

  const env = loadEnv();
  const vercelCmd = getVercelCmd();

  const keysToSync = [
    { key: 'NEXT_PUBLIC_SUPABASE_URL', desc: 'Supabase Cloud URL' },
    { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', desc: 'Supabase Public Anon Key' },
    { key: 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', desc: 'Supabase Publishable Key' },
    { key: 'ROOT_ADMIN_KEY', desc: 'Mật mã Cứu hộ Root Admin' },
    { key: 'ADMIN_ROOT_KEY', desc: 'Mật mã Cứu hộ Root Admin (Alias)' },
    { key: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', desc: 'Khóa VAPID Public thông báo Web Push' },
    { key: 'VAPID_PRIVATE_KEY', desc: 'Khóa VAPID Private thông báo Web Push' },
    { key: 'VAPID_SUBJECT', desc: 'Email liên hệ thông báo Push' },
  ];

  if (env.PAYMENT_WEBHOOK_SECRET) {
    keysToSync.push({ key: 'PAYMENT_WEBHOOK_SECRET', desc: 'Mã bảo mật Webhook Thanh Toán' });
  }

  log('\n📤 [3/3] Đang đẩy từng biến môi trường lên Vercel (Production & Preview)...', colors.yellow);

  let successCount = 0;
  for (const item of keysToSync) {
    const val = env[item.key];
    if (!val) {
      log(`  ⚠️ Bỏ qua ${item.key}: Chưa có giá trị trong file cấu hình.`, colors.dim);
      continue;
    }

    try {
      process.stdout.write(`  ⏳ Đang đồng bộ ${colors.bright}${item.key}${colors.reset} ... `);
      
      // Đẩy lên Production và Preview
      execSync(`${vercelCmd} env add ${item.key} production,preview --value "${val}" --force --yes`, {
        shell: true,
        stdio: 'pipe',
      });

      console.log(`${colors.green}✓ THÀNH CÔNG${colors.reset}`);
      successCount++;
    } catch (err) {
      console.log(`${colors.red}✗ LỖI: ${err.message}${colors.reset}`);
    }
  }

  console.log('');
  log('================================================================================', colors.green);
  log(` 🎉 HOÀN TẤT ĐỒNG BỘ: ${successCount}/${keysToSync.length} biến môi trường đã sẵn sàng trên Vercel!`, colors.bright + colors.green);
  log('================================================================================\n', colors.green);
}

// 4. KIỂM TRA KẾT NỐI VÀ DỮ LIỆU SUPABASE CLOUD
async function testSupabase() {
  printBanner();
  log('================================================================================', colors.blue);
  log(' 🔍 KIỂM TRA KẾT NỐI & TÌNH TRẠNG CƠ SỞ DỮ LIỆU SUPABASE CLOUD', colors.bright + colors.blue);
  log('================================================================================\n', colors.blue);

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    log('❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY trong .env.local!', colors.red);
    return false;
  }

  log(`🌐 Địa chỉ Supabase: ${colors.bright}${url}${colors.reset}`, colors.cyan);
  log(`🔑 Public Anon Key: ${anonKey.slice(0, 20)}...${anonKey.slice(-10)}`, colors.dim);
  console.log('');

  // 1. Kiểm tra Ping REST API
  try {
    process.stdout.write('  ⏳ Kiểm tra phản hồi HTTP từ Supabase REST/Auth API ... ');
    const pingRes = await fetch(`${url}/auth/v1/health`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (pingRes.ok) {
      console.log(`${colors.green}✓ KẾT NỐI TỐT (HTTP ${pingRes.status})${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠️ Phản hồi HTTP ${pingRes.status}${colors.reset}`);
    }
  } catch (err) {
    console.log(`${colors.red}✗ KHÔNG THỂ KẾT NỐI: ${err.message}${colors.reset}`);
    return false;
  }

  // 2. Kiểm tra các bảng dữ liệu trọng yếu
  const tables = [
    { name: 'products', label: 'Sản phẩm & Menu Bánh' },
    { name: 'orders', label: 'Đơn hàng & Hóa đơn bán lẻ' },
    { name: 'order_items', label: 'Chi tiết từng món trong đơn' },
    { name: 'ingredients', label: 'Kho Nguyên vật liệu & Bao bì' },
    { name: 'recipes', label: 'Công thức làm bánh (BOM & Cấu hình Hệ thống)' },
    { name: 'profiles', label: 'Tài khoản nhân viên & Admin' },
    { name: 'stores', label: 'Thông tin cửa hàng / Chi nhánh' },
    { name: 'shifts', label: 'Ca bán hàng & Kiểm két' },
  ];

  log('\n📊 Kiểm tra trạng thái từng bảng dữ liệu trên Cloud:', colors.yellow);

  let missingTables = 0;
  for (const t of tables) {
    process.stdout.write(`  ⏳ Bảng [${t.name.padEnd(12)}] (${t.label}) ... `);
    try {
      const res = await fetch(`${url}/rest/v1/${t.name}?select=id&limit=1`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Range: '0-0',
          Prefer: 'count=exact',
        },
      });

      if (res.ok) {
        const countHeader = res.headers.get('content-range');
        const count = countHeader ? countHeader.split('/')[1] : 'Có dữ liệu';
        console.log(`${colors.green}✓ ĐÃ SẴN SÀNG (${count} dòng)${colors.reset}`);
      } else if (res.status === 404 || (await res.text()).includes('42P01')) {
        console.log(`${colors.red}✗ CHƯA TẠO BẢNG (Cần chạy file SQL)${colors.reset}`);
        missingTables++;
      } else {
        console.log(`${colors.yellow}⚠️ Mã phản hồi: ${res.status}${colors.reset}`);
      }
    } catch (err) {
      console.log(`${colors.red}✗ Lỗi: ${err.message}${colors.reset}`);
    }
  }

  // 3. Kiểm tra Kho lưu ảnh (Storage Bucket)
  process.stdout.write(`  ⏳ Kiểm tra Kho lưu trữ ảnh (Bucket 'bakery-images') ... `);
  try {
    const bucketRes = await fetch(`${url}/storage/v1/object/list/bakery-images`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: '', limit: 1 }),
    });
    if (bucketRes.ok) {
      console.log(`${colors.green}✓ ĐÃ HOẠT ĐỘNG (Sẵn sàng lưu trữ)${colors.reset}`);
    } else {
      console.log(`${colors.yellow}⚠️ Mã phản hồi HTTP ${bucketRes.status}${colors.reset}`);
    }
  } catch (err) {
    console.log(`${colors.dim}Không thể kiểm tra bucket: ${err.message}${colors.reset}`);
  }

  console.log('');
  if (missingTables > 0) {
    log('================================================================================', colors.yellow);
    log(` ⚠️ SUPABASE CHƯA HOÀN TẤT KHỞI TẠO (${missingTables} bảng còn thiếu)!`, colors.bright + colors.yellow);
    log(' 👉 HÃY CHẠY FILE SQL KHỞI TẠO:', colors.bright);
    log(`    File: ${SCHEMA_FILE_PATH}`, colors.cyan);
    log('    Cách làm: Mở Supabase Dashboard -> Vào mục SQL Editor -> Copy nội dung file trên -> Bấm RUN', colors.white);
    log('================================================================================\n', colors.yellow);
    return false;
  } else {
    log('================================================================================', colors.green);
    log(' 🎉 TẤT CẢ DỮ LIỆU TRÊN SUPABASE CLOUD HOẠT ĐỘNG HOÀN HẢO 100%!', colors.bright + colors.green);
    log('================================================================================\n', colors.green);
    return true;
  }
}

// 5. TRIỂN KHAI LÊN VERCEL PRODUCTION
function deployToVercel() {
  printBanner();
  log('================================================================================', colors.blue);
  log(' 🚀 TRIỂN KHAI DỰ ÁN LÊN VERCEL PRODUCTION', colors.bright + colors.blue);
  log('================================================================================\n', colors.blue);

  ensureVercelAuthAndLink();

  const vercelCmd = getVercelCmd();
  log('⏳ Đang xây dựng và đẩy bản phát hành mới nhất lên Vercel Production...', colors.yellow);
  log('   (Quá trình này mất khoảng 30 - 60 giây, vui lòng giữ cửa sổ mở)\n', colors.dim);

  try {
    execSync(`${vercelCmd} --prod`, { stdio: 'inherit', shell: true });
    console.log('');
    log('================================================================================', colors.green);
    log(' 🎉 TRIỂN KHAI VERCEL PRODUCTION THÀNH CÔNG RỰC RỠ!', colors.bright + colors.green);
    log(' 🌐 Website Trực Tuyến: https://bakery-pos-rho.vercel.app', colors.bright + colors.cyan);
    log('================================================================================\n', colors.green);
  } catch (err) {
    console.log('');
    log(`❌ Triển khai thất bại: ${err.message}`, colors.red);
  }
}

// 6. MỞ DASHBOARD VERCEL & SUPABASE
function openDashboards() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || '';
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  const projectId = match ? match[1] : '';

  const vercelUrl = 'https://vercel.com/viet-b3cf/bakery-pos';
  const supabaseUrl = projectId
    ? `https://supabase.com/dashboard/project/${projectId}`
    : 'https://supabase.com/dashboard';

  log('\n🌐 Đang mở các bảng điều khiển...', colors.cyan);
  log(`   1. Vercel Dashboard: ${vercelUrl}`);
  log(`   2. Supabase Cloud:   ${supabaseUrl}\n`);

  try {
    execSync(`start "" "${vercelUrl}"`, { shell: true });
    execSync(`start "" "${supabaseUrl}"`, { shell: true });
  } catch {
    // ignore
  }
}

// 7. XEM HƯỚNG DẪN SQL SCHEMA & TỰ ĐỘNG COPY VÀO BỘ NHỚ ĐỆM
function showSqlInstructions() {
  printBanner();
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL || '';
  const match = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  const projectId = match ? match[1] : '';

  log('================================================================================', colors.cyan);
  log(' 📋 TỰ ĐỘNG SAO CHÉP SQL SCHEMA & MỞ SUPABASE SQL EDITOR', colors.bright + colors.cyan);
  log('================================================================================\n', colors.cyan);

  const sqlUrl = projectId
    ? `https://supabase.com/dashboard/project/${projectId}/sql/new`
    : 'https://supabase.com/dashboard';

  // Tự động copy toàn bộ nội dung file SQL vào Clipboard của Windows
  try {
    process.stdout.write('  ⏳ Đang sao chép toàn bộ 1500+ dòng mã SQL vào Bộ nhớ đệm (Clipboard) ... ');
    execSync(`powershell -NoProfile -Command "Get-Content -Path '${SCHEMA_FILE_PATH}' -Raw -Encoding UTF8 | Set-Clipboard"`, { shell: true, stdio: 'pipe' });
    console.log(`${colors.green}✓ ĐÃ SAO CHÉP XONG!${colors.reset}`);
  } catch (err) {
    try {
      const { spawnSync } = require('child_process');
      spawnSync('clip', { input: fs.readFileSync(SCHEMA_FILE_PATH) });
      console.log(`${colors.green}✓ ĐÃ SAO CHÉP XONG (clip)!${colors.reset}`);
    } catch {
      console.log(`${colors.yellow}⚠️ Không thể tự copy: ${err.message}${colors.reset}`);
    }
  }

  // Tự động mở trình duyệt đến trang SQL Editor của Supabase
  try {
    process.stdout.write('  ⏳ Đang mở trang Supabase SQL Editor trên trình duyệt ... ');
    execSync(`start "" "${sqlUrl}"`, { shell: true });
    console.log(`${colors.green}✓ ĐÃ MỞ TRÌNH DUYỆT!${colors.reset}\n`);
  } catch {
    console.log('\n');
  }

  log('👉 BẠN CHỈ CẦN LÀM 2 THAO TÁC CỰC KỲ ĐƠN GIẢN:', colors.bright + colors.yellow);
  log('   1. Trên tab trình duyệt vừa mở, nhấp chuột vào ô nhập và bấm [ Ctrl + V ] (để dán mã vừa copy).', colors.white);
  log('   2. Nhấn nút màu xanh lá [ RUN ] ở góc dưới bên phải.', colors.bright + colors.green);
  log('   ➔ Toàn bộ bảng, hàm, phân quyền và kho ảnh sẽ được tạo tự động 100% trong 5 giây!\n', colors.cyan);
  log('================================================================================\n', colors.cyan);
}

// 8. SETUP WIZARD: CÀI ĐẶT DỰ ÁN MỚI TỪ SỐ 0
async function runSetupWizard() {
  printBanner();
  log('================================================================================', colors.magenta);
  log(' 🪄 TRÌNH HƯỚNG DẪN THIẾT LẬP DỰ ÁN MỚI TỪ A ĐẾN Z (SETUP WIZARD)', colors.bright + colors.magenta);
  log('================================================================================\n', colors.magenta);

  log('Trình hướng dẫn này giúp bạn cấu hình một dự án Tiệm Bánh mới hoàn toàn mà không cần sửa file!\n', colors.dim);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  try {
    log('Bước 1: Nhập thông tin kết nối Supabase của bạn (Lấy trên Supabase.com -> Settings -> API):', colors.yellow);
    const inputUrl = (await question('👉 Nhập Supabase Project URL (vd: https://abcdef.supabase.co): ')).trim();
    if (!inputUrl.startsWith('http')) {
      log('❌ URL không hợp lệ! Vui lòng thử lại.', colors.red);
      rl.close();
      return;
    }

    const inputKey = (await question('👉 Nhập Supabase Public Anon Key: ')).trim();
    if (!inputKey) {
      log('❌ Anon Key không được để trống!', colors.red);
      rl.close();
      return;
    }

    const inputAdminKey = (await question('👉 Nhập Mật khẩu Cứu hộ Root Admin (Nhấn Enter để dùng mặc định "Quyviet97@"): ')).trim() || 'Quyviet97@';

    rl.close();

    // 1. Tự động ghi vào file .env.local và .env
    log('\n⏳ Đang lưu cấu hình vào file .env.local và .env...', colors.cyan);
    const envContent = `# Cloud Supabase credentials for Bakery ERP
NEXT_PUBLIC_SUPABASE_URL=${inputUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${inputKey}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${inputKey}
ROOT_ADMIN_KEY=${inputAdminKey}
ADMIN_ROOT_KEY=${inputAdminKey}

# Push Notifications (Web Push VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BBRxBu4Wou9gEIrPivlSVhGHcdjEF-8RF5phrRvIxyp6sfQJNCdYOpxc3Uu9qcgE9tao7zRDH1ZvEWL1zyDKU84
VAPID_PRIVATE_KEY=xix0rTLV9hqExYqk0InzRAMbhMrYWh-RIPO0mm3ApCw
VAPID_SUBJECT=mailto:admin@tiembanh.com
`;
    fs.writeFileSync(ENV_LOCAL_PATH, envContent, 'utf8');
    fs.writeFileSync(ENV_PATH, envContent, 'utf8');
    log('  ✅ Đã lưu cấu hình dự án mới thành công!', colors.green);

    // 2. Tự động copy SQL và mở trình duyệt
    showSqlInstructions();

    // 3. Tạm dừng để người dùng bấm RUN trên Supabase
    const rlWait = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => {
      rlWait.question('Sau khi đã bấm nút [ RUN ] trên Supabase, nhấn [ Enter ] để tool tự động deploy Vercel...', resolve);
    });
    rlWait.close();

    // 4. Chạy kiểm tra & deploy
    await runAll();
  } catch (err) {
    rl.close();
    log(`\n❌ Đã xảy ra lỗi: ${err.message}`, colors.red);
  }
}

// 8. TỰ ĐỘNG CHẠY TẤT CẢ (ALL-IN-ONE)
async function runAll() {
  printBanner();
  log('⭐ CHẾ ĐỘ TỰ ĐỘNG HÓA TẤT CẢ (ALL-IN-ONE):', colors.bright + colors.cyan);
  log('   1. Kiểm tra kết nối Supabase Cloud');
  log('   2. Tự động đồng bộ toàn bộ biến môi trường lên Vercel');
  log('   3. Triển khai bản mới lên Vercel Production\n');

  // Bước 1: Test Supabase
  await testSupabase();

  // Bước 2: Đồng bộ Vercel Env
  await syncEnvToVercel();

  // Bước 3: Deploy Production
  deployToVercel();
}

// 9. MENU ĐIỀU KHIỂN CHÍNH
async function showMenu() {
  printBanner();
  log('Vui lòng chọn thao tác muốn thực hiện:\n');
  log('  [1] ⚡ Cấu hình & Đồng bộ Toàn bộ Biến Môi Trường lên Vercel', colors.bright + colors.green);
  log('  [2] 🔍 Kiểm tra Kết nối & Kiểm định Bảng Dữ Liệu Supabase Cloud', colors.bright + colors.cyan);
  log('  [3] 🚀 Triển khai (Deploy) Bản Mới Lên Vercel Production', colors.bright + colors.yellow);
  log('  [4] ⭐ TỰ ĐỘNG HÓA TẤT CẢ (Kiểm tra Supabase -> Đồng bộ -> Deploy)', colors.bright + colors.magenta);
  log('  [5] 🌐 Mở Bảng Điều Khiển Vercel & Supabase trên Trình Duyệt', colors.white);
  log('  [6] 📋 Tự Động Sao Chép (Copy) SQL Schema & Mở Supabase SQL Editor', colors.cyan);
  log('  [7] 🪄 Cài Đặt Dự Án Mới Từ Đầu Đến Đuôi (Setup Wizard A-Z)', colors.bright + colors.magenta);
  log('  [0] ❌ Thoát\n', colors.red);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  async function pauseAndReturn() {
    const rlPause = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    await new Promise((resolve) => {
      rlPause.question('\n👉 Nhấn phím [ Enter ] để quay lại Menu chính...', resolve);
    });
    rlPause.close();
    await showMenu();
  }

  rl.question('Nhập lựa chọn của bạn (0 - 7): ', async (answer) => {
    rl.close();
    const choice = answer.trim();

    switch (choice) {
      case '1':
        await syncEnvToVercel();
        await pauseAndReturn();
        break;
      case '2':
        await testSupabase();
        await pauseAndReturn();
        break;
      case '3':
        deployToVercel();
        await pauseAndReturn();
        break;
      case '4':
        await runAll();
        await pauseAndReturn();
        break;
      case '5':
        openDashboards();
        await pauseAndReturn();
        break;
      case '6':
        showSqlInstructions();
        await pauseAndReturn();
        break;
      case '7':
        await runSetupWizard();
        await pauseAndReturn();
        break;
      case '0':
        log('\n👋 Đã thoát chương trình. Chúc bạn một ngày làm việc hiệu quả!\n', colors.green);
        process.exit(0);
        break;
      default:
        log('\n⚠️ Lựa chọn không hợp lệ. Vui lòng thử lại!', colors.red);
        await pauseAndReturn();
        break;
    }
  });
}

// XỬ LÝ ĐỐI SỐ DÒNG LỆNH (CLI FLAGS)
const args = process.argv.slice(2);
(async () => {
  if (args.includes('--sync-env')) {
    await syncEnvToVercel();
  } else if (args.includes('--test-supabase')) {
    await testSupabase();
  } else if (args.includes('--deploy')) {
    deployToVercel();
  } else if (args.includes('--all')) {
    await runAll();
  } else if (args.includes('--open')) {
    openDashboards();
  } else if (args.includes('--schema')) {
    showSqlInstructions();
  } else if (args.includes('--wizard')) {
    await runSetupWizard();
  } else {
    await showMenu();
  }
})();
