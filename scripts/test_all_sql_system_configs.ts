// scripts/test_all_sql_system_configs.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface ConfigTestDef {
  key: string;
  id: string;
  name: string;
  testPayload: any;
}

const ALL_SYSTEM_CONFIGS: ConfigTestDef[] = [
  { key: 'TELEGRAM', id: '00000000-0000-0000-0000-000000000001', name: 'SYS_CONFIG_TELEGRAM', testPayload: { enabled: false, botToken: '', chatId: '' } },
  { key: 'BRANDING', id: '00000000-0000-0000-0000-000000000003', name: 'SYS_CONFIG_BRANDING', testPayload: { storeName: 'Test Bakery' } },
  { key: 'VIETQR', id: '00000000-0000-0000-0000-000000000004', name: 'SYS_CONFIG_VIETQR', testPayload: { bankId: 'VCB' } },
  { key: 'EWALLET', id: '00000000-0000-0000-0000-000000000005', name: 'SYS_CONFIG_EWALLET', testPayload: { activeWallet: 'zalopay' } },
  { key: 'AUTOBANK', id: '00000000-0000-0000-0000-000000000006', name: 'SYS_CONFIG_AUTOBANK', testPayload: { enabled: true } },
  { key: 'TRANSFER_VERIFY', id: '00000000-0000-0000-0000-000000000007', name: 'SYS_CONFIG_TRANSFER_VERIFY', testPayload: { mode: 'two_step' } },
  { key: 'SPOILAGE', id: '00000000-0000-0000-0000-000000000008', name: 'SYS_CONFIG_SPOILAGE', testPayload: [] },
  { key: 'STOCK_ADJUSTMENTS', id: '00000000-0000-0000-0000-000000000009', name: 'SYS_CONFIG_STOCK_ADJUSTMENTS', testPayload: [] },
  { key: 'CLOSINGS', id: '00000000-0000-0000-0000-00000000000a', name: 'SYS_CONFIG_CLOSINGS', testPayload: [] },
  { key: 'SECURITY', id: '00000000-0000-0000-0000-00000000000b', name: 'SYS_CONFIG_SECURITY', testPayload: { adminUsername: 'admin' } },
  { key: 'TAX_HOUSEHOLD', id: '00000000-0000-0000-0000-00000000000c', name: 'SYS_CONFIG_TAX_HOUSEHOLD', testPayload: {} },
  { key: 'TAX_POLICY', id: '00000000-0000-0000-0000-00000000000e', name: 'SYS_CONFIG_TAX_POLICY', testPayload: {} },
  { key: 'EXPENSES', id: '00000000-0000-0000-0000-000000000010', name: 'SYS_CONFIG_EXPENSES', testPayload: [] },
  { key: 'CASHFLOW', id: '00000000-0000-0000-0000-000000000011', name: 'SYS_CONFIG_CASHFLOW', testPayload: [] },
  { key: 'CURRENT_SHIFT', id: '00000000-0000-0000-0000-000000000012', name: 'SYS_CONFIG_CURRENT_SHIFT', testPayload: {} },
  { key: 'NOTIFICATION_HISTORY', id: '00000000-0000-0000-0000-000000000013', name: 'SYS_CONFIG_NOTIFICATION_HISTORY', testPayload: [] },
  { key: 'FULL_BOM', id: '00000000-0000-0000-0000-000000000014', name: 'SYS_CONFIG_FULL_BOM', testPayload: {} },
  { key: 'MATERIAL_STOCK_ADJUSTMENTS', id: '00000000-0000-0000-0000-000000000015', name: 'SYS_CONFIG_MATERIAL_STOCK_ADJUSTMENTS', testPayload: [] },
  { key: 'DELIVERY_ALERT', id: '00000000-0000-0000-0000-000000000016', name: 'SYS_CONFIG_DELIVERY_ALERT', testPayload: {} },
  { key: 'PENDING_TRANSFERS', id: '00000000-0000-0000-0000-000000000017', name: 'SYS_CONFIG_PENDING_TRANSFERS', testPayload: [] },
  { key: 'PRINTER', id: '00000000-0000-0000-0000-000000000018', name: 'SYS_CONFIG_PRINTER', testPayload: {} },
  { key: 'CAKE_COSTING', id: '00000000-0000-0000-0000-000000000020', name: 'SYS_CONFIG_CAKE_COSTING', testPayload: {} },
  { key: 'DELETED_PRODUCTS', id: '00000000-0000-0000-0000-000000000021', name: 'SYS_CONFIG_DELETED_PRODUCTS', testPayload: [] },
  { key: 'OVEN_BATCHES', id: '00000000-0000-0000-0000-000000000022', name: 'SYS_CONFIG_OVEN_BATCHES', testPayload: [] },
  { key: 'RESOLVED_TRANSFERS', id: '00000000-0000-0000-0000-000000000023', name: 'SYS_CONFIG_RESOLVED_TRANSFERS', testPayload: [] },
  { key: 'ORDER_RETURNS', id: '00000000-0000-0000-0000-000000000027', name: 'SYS_CONFIG_ORDER_RETURNS', testPayload: [] },
  { key: 'PENDING_RETURNS', id: '00000000-0000-0000-0000-000000000028', name: 'SYS_CONFIG_PENDING_RETURNS', testPayload: [] },
  { key: 'HELD_ORDERS', id: '00000000-0000-0000-0000-000000000029', name: 'SYS_CONFIG_HELD_ORDERS', testPayload: [] },
  { key: 'RESOLVED_RETURNS', id: '00000000-0000-0000-0000-00000000002a', name: 'SYS_CONFIG_RESOLVED_RETURNS', testPayload: [] },
  { key: 'STOCKS', id: '00000000-0000-0000-0000-00000000002b', name: 'SYS_CONFIG_STOCKS', testPayload: {} },
  { key: 'SHIFT_HISTORY', id: '00000000-0000-0000-0000-000000000030', name: 'SYS_CONFIG_SHIFT_HISTORY', testPayload: [] },
  { key: 'MATERIAL_TRANSACTIONS', id: '00000000-0000-0000-0000-000000000031', name: 'SYS_CONFIG_MATERIAL_TRANSACTIONS', testPayload: [] },
  { key: 'PUSH_SUBSCRIPTIONS', id: '00000000-0000-0000-0000-000000000040', name: 'SYS_PUSH_SUBSCRIPTIONS', testPayload: [] },
  { key: 'RESET_EPOCH', id: '00000000-0000-0000-0000-000000000099', name: 'SYSTEM_RESET_EPOCH', testPayload: { epoch: 1 } },
];

async function runAudit() {
  console.log('=== RUNNING COMPREHENSIVE AUDIT OF ALL SQL CONFIG ROWS IN SUPABASE ===');

  // 1. Kiểm tra tính độc nhất (Unique IDs and Names)
  const idSet = new Set<string>();
  const nameSet = new Set<string>();
  const duplicates: string[] = [];

  for (const cfg of ALL_SYSTEM_CONFIGS) {
    if (idSet.has(cfg.id)) duplicates.push(`DUPLICATE ID: ${cfg.id} in ${cfg.name}`);
    idSet.add(cfg.id);

    if (nameSet.has(cfg.name)) duplicates.push(`DUPLICATE NAME: ${cfg.name} with ID ${cfg.id}`);
    nameSet.add(cfg.name);
  }

  if (duplicates.length > 0) {
    console.error('❌ PHÁT HIỆN TRÙNG LẶP KHÓA CẤU HÌNH:');
    duplicates.forEach((d) => console.error('  -', d));
  } else {
    console.log('✅ Định nghĩa 34 cấu hình hệ thống hoàn toàn độc nhất (No Duplicates in Code Defs)!');
  }

  // 2. Kiểm tra trạng thái hiện tại trong CSDL Supabase
  console.log('\n--- Kiểm tra trạng thái thực tế từng hàng trên Supabase ---');
  let successCount = 0;
  let missingCount = 0;
  let conflictCount = 0;

  for (const cfg of ALL_SYSTEM_CONFIGS) {
    const { data, error } = await supabase
      .from('recipes')
      .select('id, name, notes')
      .or(`id.eq.${cfg.id},name.eq.${cfg.name}`);

    if (error) {
      console.error(`❌ [${cfg.key}] Query error:`, error.message);
      conflictCount++;
      continue;
    }

    if (!data || data.length === 0) {
      console.warn(`⚠️ [${cfg.key}] Chưa có bản ghi trên Supabase (ID: ${cfg.id}, Name: ${cfg.name})`);
      missingCount++;
    } else if (data.length === 1) {
      const row = data[0];
      if (row.id !== cfg.id || row.name !== cfg.name) {
        console.error(`🚨 [${cfg.key}] LỆCH KHÓA HOẶC TÊN! Kỳ vọng: id=${cfg.id}, name=${cfg.name}. Thực tế trên DB: id=${row.id}, name=${row.name}`);
        conflictCount++;
      } else {
        console.log(`✅ [${cfg.key}] Khớp chuẩn: id=${row.id}, name=${row.name}`);
        successCount++;
      }
    } else {
      console.error(`🚨 [${cfg.key}] XUNG ĐỘT! Có ${data.length} hàng cùng khớp id hoặc name:`, data.map((r: any) => `[${r.id}] ${r.name}`).join(' | '));
      conflictCount++;
    }
  }

  console.log(`\n=== TỔNG KẾT: ${successCount} Chuẩn | ${missingCount} Chưa có | ${conflictCount} Xung đột/Lỗi ===`);
}

runAudit().catch(console.error);
