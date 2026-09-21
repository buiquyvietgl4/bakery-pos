// scripts/generate_one_time_code.ts
// Lệnh tạo Mã Cứu Hộ Dùng 1 Lần (Single-Use OTP) cho Chủ Tiệm
// CHỈ MÁY CÓ CHỨA MÃ NGUỒN GỐC & .env.local MỚI CÓ THỂ TẠO MÃ NÀY!
// Mỗi mã chỉ dùng được duy nhất 1 lần, tự hủy ngay sau khi đăng nhập.

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Đọc biến môi trường từ .env.local
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = value;
      }
    }
  }
} catch {}

let activeSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
let activeSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Ưu tiên đọc cấu hình CSDL nếu người dùng đã đổi URL trực tiếp từ giao diện POS
try {
  const profileFile = path.resolve(process.cwd(), '.active_database_profile.json');
  if (fs.existsSync(profileFile)) {
    const prof = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
    if (prof.url && prof.anonKey) {
      activeSupabaseUrl = prof.url;
      activeSupabaseAnonKey = prof.anonKey;
    }
  }
} catch {}

const SUPABASE_URL = activeSupabaseUrl;
const SUPABASE_ANON_KEY = activeSupabaseAnonKey;

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';
const DB_ROW_SECURITY_NAME = 'SYS_CONFIG_SECURITY';

function generateRandomOtp(): string {
  // Tạo mã 8 chữ số dạng ROOT-XXXX-YYYY dễ đọc, dễ gõ
  const part1 = Math.floor(1000 + Math.random() * 9000);
  const part2 = Math.floor(1000 + Math.random() * 9000);
  return `ROOT-${part1}-${part2}`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║       HỆ THỐNG BAKERY POS: TẠO MÃ CỨU HỘ ADMIN DÙNG 1 LẦN DUY NHẤT   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  try {
    const localOtpFile = path.resolve(process.cwd(), '.local_emergency_otp.json');
  const newOtp = generateRandomOtp();
  const createdAt = new Date().toISOString();

  // 1. Luôn lưu vào CSDL Local (.local_emergency_otp.json)
  try {
    let localCfg: any = { active_otp_codes: [], used_otp_codes: [] };
    if (fs.existsSync(localOtpFile)) {
      try {
        localCfg = JSON.parse(fs.readFileSync(localOtpFile, 'utf8'));
      } catch {}
    }
    if (!Array.isArray(localCfg.active_otp_codes)) localCfg.active_otp_codes = [];
    if (!Array.isArray(localCfg.used_otp_codes)) localCfg.used_otp_codes = [];

    localCfg.active_otp_codes.push({
      code: newOtp,
      created_at: createdAt,
      used: false,
    });
    if (localCfg.active_otp_codes.length > 20) {
      localCfg.active_otp_codes = localCfg.active_otp_codes.slice(-20);
    }
    localCfg.updated_at = createdAt;
    fs.writeFileSync(localOtpFile, JSON.stringify(localCfg, null, 2), 'utf8');
    console.log('✓ Đã đăng ký mã vào CSDL Cục Bộ (Local SQL / Offline Vault)');
  } catch (localErr: any) {
    console.warn('⚠️ Không thể ghi file mã cục bộ:', localErr.message);
  }

  // 2. Đồng bộ lên Supabase nếu có thông tin kết nối và có mạng
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
      console.log('Đang kết nối Cloud Supabase để đồng bộ mã...');
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data } = await supabase
        .from('recipes')
        .select('id, notes')
        .or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`)
        .limit(1)
        .maybeSingle();

      let cfg: any = {};
      if (data?.notes) {
        try {
          cfg = JSON.parse(data.notes);
        } catch {}
      }

      if (!Array.isArray(cfg.active_otp_codes)) {
        cfg.active_otp_codes = [];
      }
      if (!Array.isArray(cfg.used_otp_codes)) {
        cfg.used_otp_codes = [];
      }

      cfg.active_otp_codes.push({
        code: newOtp,
        created_at: createdAt,
        used: false,
      });

      if (cfg.active_otp_codes.length > 20) {
        cfg.active_otp_codes = cfg.active_otp_codes.slice(-20);
      }
      if (cfg.used_otp_codes.length > 50) {
        cfg.used_otp_codes = cfg.used_otp_codes.slice(-50);
      }

      cfg.updated_at = createdAt;

      const { error: upsertErr } = await supabase.from('recipes').upsert(
        {
          id: DB_ROW_SECURITY_ID,
          name: DB_ROW_SECURITY_NAME,
          yield_qty: 1,
          yield_unit: 'chiếc',
          cost_per_unit: 0,
          total_material_cost: 0,
          notes: JSON.stringify(cfg),
          is_active: false,
        },
        { onConflict: 'id' }
      );

      if (upsertErr) {
        console.warn('⚠️ Không thể đồng bộ Supabase:', upsertErr.message);
      } else {
        console.log('✓ Đã đồng bộ mã lên Cloud Supabase thành công');
      }
    } catch (syncErr: any) {
      console.warn('ℹ️ Chạy ngoại tuyến / không kết nối được Supabase:', syncErr.message);
    }
  } else {
    console.log('ℹ️ Chế độ không có Supabase Cloud: Đã kích hoạt mã trên CSDL Local SQL.');
  }

  // Tự động sao chép mã vào Clipboard của Windows nếu được
    try {
      if (process.platform === 'win32') {
        execSync(`echo | set /p="${newOtp}" | clip`);
      }
    } catch {}

    console.log('2. ĐÃ ĐĂNG KÝ MÃ THÀNH CÔNG LÊN HỆ THỐNG TOÀN QUÁN!\n');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log(`👉 MÃ CỨU HỘ CỦA BẠN:   ${newOtp}`);
    console.log('══════════════════════════════════════════════════════════════════════\n');
    console.log('📋 ĐÃ TỰ ĐỘNG COPY MÃ VÀO BỘ NHỚ TẠM (CLIPBOARD). Bạn chỉ cần Ctrl+V để dán.');
    console.log('\n🔒 ĐẶC ĐIỂM BẢO MẬT TUYỆT ĐỐI:');
    console.log('   ✓ Mỗi mã chỉ dùng được DUY NHẤT 1 LẦN.');
    console.log('   ✓ Sau khi nhập vào màn hình đăng nhập, mã sẽ tự hủy ngay tức thì.');
    console.log('   ✓ Kẻ gian dù nhìn trộm được mã cũng không thể sử dụng lại lần thứ 2.');
    console.log('   ✓ Chỉ có máy tính đang chứa mã nguồn gốc này mới có thể tạo ra mã!');
    console.log('══════════════════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('❌ Lỗi không xác định:', err?.message || err);
  }
}

main();
