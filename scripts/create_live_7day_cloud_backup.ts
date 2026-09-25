// scripts/create_live_7day_cloud_backup.ts
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
const envVars: Record<string, string> = {};
envFile.split('\n').forEach(l => {
  const [k, ...v] = l.trim().split('=');
  if (k && v.length) envVars[k.trim()] = v.join('=').trim();
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: prods } = await supabase.from('products').select('*');
  const { data: orders } = await supabase.from('orders').select('*');
  console.log(`📊 Tìm thấy ${prods?.length || 0} sản phẩm và ${orders?.length || 0} đơn hàng trong CSDL`);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const pCount = prods?.length || 0;
  const oCount = orders?.length || 0;
  const filename = `SAO_LUU_TAM_THOI_7_NGAY_${timeStr}__P${pCount}_O${oCount}.bakery.json`;
  const storagePath = `cloud_backups_7days/${filename}`;

  const payload = {
    schemaVersion: 'bakery-backup-v2',
    exportedAt: now.toISOString(),
    storeName: 'Tiệm Bánh - Dữ Liệu Thực Tế',
    metadata: {
      totalProducts: pCount,
      totalOrders: oCount,
      totalImages: 0,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      isTemporary7Day: true,
      retentionDays: 7,
    },
    products: prods || [],
    orders: orders || [],
    ingredients: [],
    recipes: [],
    stock_adjustments: [],
    spoilage_logs: [],
    expenses: [],
    cashflow: [],
    images: [],
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const { error } = await supabase.storage.from('bakery-images').upload(storagePath, Buffer.from(jsonStr, 'utf-8'), {
    contentType: 'application/json',
    upsert: true,
  });

  if (error) {
    console.error('❌ Upload Storage thất bại:', error.message);
  } else {
    console.log(`✅ ĐÃ TẠO THÀNH CÔNG BẢN SAO LƯU 7 NGÀY TRÊN STORAGE 1GB: ${storagePath}`);
  }
}

run();
