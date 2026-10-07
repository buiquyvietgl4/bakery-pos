// scripts/verify_env_integrity.ts
// Kiểm tra tính nhất quán giữa .env, .env.local và CSDL Supabase thực tế

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

function extractRef(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.split('.')[0] || url;
  } catch {
    const m = url.match(/https?:\/\/([^\.]+)\.supabase\.co/);
    return m ? m[1] : url;
  }
}

async function run() {
  console.log('========================================================');
  console.log('   🔍 BỘ KIỂM TRA TÍNH TOÀN VẸN CSDL & BIẾN MÔI TRƯỜNG   ');
  console.log('========================================================\n');

  const rootDir = process.cwd();
  const envPath = path.join(rootDir, '.env');
  const envLocalPath = path.join(rootDir, '.env.local');

  const envData = parseEnvFile(envPath);
  const envLocalData = parseEnvFile(envLocalPath);

  const urlEnv = envData['NEXT_PUBLIC_SUPABASE_URL'] || '';
  const urlLocal = envLocalData['NEXT_PUBLIC_SUPABASE_URL'] || '';
  const keyLocal = envLocalData['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || envLocalData['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] || '';

  console.log(`1. Đối Chiếu Biến Môi Trường:`);
  console.log(`   • .env:       ${urlEnv ? `${urlEnv} (Ref: ${extractRef(urlEnv)})` : 'Chưa thiết lập'}`);
  console.log(`   • .env.local: ${urlLocal ? `${urlLocal} (Ref: ${extractRef(urlLocal)})` : 'Chưa thiết lập'}`);

  if (urlEnv && urlLocal && urlEnv !== urlLocal) {
    console.warn(`   ⚠️ CẢNH BÁO: URL trong .env khác với .env.local! Ứng dụng Next.js ưu tiên .env.local.`);
  } else if (urlEnv === urlLocal && urlLocal) {
    console.log(`   ✓ .env và .env.local đồng nhất 100%!`);
  }

  const activeUrl = urlLocal || urlEnv;
  const activeKey = keyLocal || envData['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';

  if (!activeUrl || !activeKey) {
    console.error(`\n❌ LỖI: Không tìm thấy Supabase URL hoặc API Key trong file môi trường!`);
    process.exit(1);
  }

  console.log(`\n2. Đo Kiểm Tra CSDL Đang Kích Hoạt (${extractRef(activeUrl)}):`);
  const client = createClient(activeUrl, activeKey, { auth: { persistSession: false } });

  try {
    const [prod, ord, rec, ing] = await Promise.all([
      client.from('products').select('*', { count: 'exact', head: true }),
      client.from('orders').select('*', { count: 'exact', head: true }),
      client.from('recipes').select('*', { count: 'exact', head: true }),
      client.from('ingredients').select('*', { count: 'exact', head: true }),
    ]);

    console.log(`   🍰 Sản phẩm (Products):   ${prod.count ?? 0} món`);
    console.log(`   📋 Đơn hàng (Orders):     ${ord.count ?? 0} đơn`);
    console.log(`   📜 Công thức (Recipes):   ${rec.count ?? 0} công thức & configs`);
    console.log(`   🌾 Nguyên liệu (Kho):     ${ing.count ?? 0} loại`);

    const isEmpty = (prod.count ?? 0) === 0 && (ord.count ?? 0) === 0;
    if (isEmpty) {
      console.error(`\n⚠️ NGUY HIỂM: CSDL ${extractRef(activeUrl)} hiện đang RỖNG (0 đơn, 0 sản phẩm)!`);
      console.error(`   Cần chạy "npx tsx scripts/migrate_db1_to_db2.ts" hoặc dùng bộ Cloner trong Admin để đồng bộ dữ liệu.`);
      process.exit(1);
    } else {
      console.log(`\n✅ HOÀN TẤT: CSDL ${extractRef(activeUrl)} đang hoạt động bình thường, đầy đủ dữ liệu.`);
    }
  } catch (err: any) {
    console.error(`\n❌ LỖI KẾT NỐI:`, err?.message || err);
    process.exit(1);
  }
}

run();
