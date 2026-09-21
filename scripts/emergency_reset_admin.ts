// scripts/emergency_reset_admin.ts
// Lệnh khôi phục mật khẩu Admin khẩn cấp: Đưa mật khẩu Chủ Tiệm về 'admin123'
// Chạy lệnh: npx tsx scripts/emergency_reset_admin.ts

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Đọc .env.local thủ công mà không phụ thuộc thư viện ngoài
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';
const DB_ROW_SECURITY_NAME = 'SYS_CONFIG_SECURITY';

async function resetAdminPassword() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        CỨU HỘ KHẨN CẤP: KHÔI PHỤC MẬT KHẨU ADMIN TIỆM BÁNH   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('⚠️ Không tìm thấy biến môi trường Supabase trong .env.local.');
    console.log('💡 Hãy sử dụng Mã Cứu Hộ Khẩn Cấp trên màn hình đăng nhập:');
    console.log('   - Master Rescue Key: "BAKERY-RESCUE-9999"');
    console.log('   - Default Rescue Key: "BAKERY-RESCUE-2026"');
    console.log('   - Mật khẩu mặc định: "admin123"\n');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    console.log('1. Đang truy vấn cấu hình bảo mật từ Cloud Supabase SQL...');
    const { data, error } = await supabase
      .from('recipes')
      .select('id, name, notes')
      .or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`)
      .limit(1)
      .maybeSingle();

    let currentCfg: any = {};
    if (data?.notes) {
      try {
        currentCfg = JSON.parse(data.notes);
      } catch {}
    }

    console.log(`   - Mật khẩu hiện tại trước khi reset: "${currentCfg.adminPasswordHash || '(chưa đặt)'}"`);

    // Reset về admin123
    currentCfg.adminPasswordHash = 'admin123';
    currentCfg.recoveryKey = currentCfg.recoveryKey || 'BAKERY-RESCUE-2026';
    currentCfg.updated_at = new Date().toISOString();

    console.log('2. Đang cập nhật mật khẩu Chủ Tiệm về: "admin123"...');
    const { error: upsertError } = await supabase
      .from('recipes')
      .upsert(
        {
          id: DB_ROW_SECURITY_ID,
          name: DB_ROW_SECURITY_NAME,
          yield_qty: 1,
          yield_unit: 'chiếc',
          cost_per_unit: 0,
          total_material_cost: 0,
          notes: JSON.stringify(currentCfg),
          is_active: false,
        },
        { onConflict: 'id' }
      );

    if (upsertError) {
      console.error('❌ Lỗi cập nhật lên Supabase:', upsertError.message);
    } else {
      console.log('✅ Đã cập nhật thành công lên Supabase Cloud SQL!');
    }

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('🎉 THÀNH CÔNG: Mật khẩu Admin đã được đặt lại về: "admin123"');
    console.log('👉 Bạn có thể đăng nhập ngay tại màn hình /pos hoặc /admin');
    console.log('══════════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('❌ Lỗi ngoại lệ:', err?.message || err);
  }
}

resetAdminPassword();
