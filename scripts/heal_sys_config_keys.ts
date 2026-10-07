// scripts/heal_sys_config_keys.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function healSystemConfigs() {
  console.log('=== HEALING SYSTEM CONFIG KEYS & ROWS ON SUPABASE ===');

  // 1. CHUẨN HÓA SYS_CONFIG_SHIFT_HISTORY (id: 0000...0030)
  console.log('1. Kiểm tra và chuẩn hóa hàng SHIFT_HISTORY (0000...0030)...');
  const { data: shiftHistoryRow } = await supabase
    .from('recipes')
    .select('*')
    .or('id.eq.00000000-0000-0000-0000-000000000030,name.eq.SYS_CONFIG_SHIFTS,name.eq.SYS_CONFIG_SHIFT_HISTORY');

  let currentShiftNotes = '[]';
  if (shiftHistoryRow && shiftHistoryRow.length > 0) {
    const existing = shiftHistoryRow.find(r => r.notes && r.notes !== '[]') || shiftHistoryRow[0];
    currentShiftNotes = existing.notes || '[]';
  }

  // Xóa bất kỳ row nào có name = 'SYS_CONFIG_SHIFTS'
  await supabase.from('recipes').delete().eq('name', 'SYS_CONFIG_SHIFTS');

  // Upsert chuẩn hóa id và name cho SHIFT_HISTORY
  const { error: errShift } = await supabase.from('recipes').upsert({
    id: '00000000-0000-0000-0000-000000000030',
    name: 'SYS_CONFIG_SHIFT_HISTORY',
    yield_qty: 1,
    yield_unit: 'config',
    cost_per_unit: 0,
    total_material_cost: 0,
    notes: currentShiftNotes,
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (errShift) console.error('Lỗi upsert SHIFT_HISTORY:', errShift.message);
  else console.log('  ✓ SHIFT_HISTORY đã chuẩn hóa thành công (id: ...0030, name: SYS_CONFIG_SHIFT_HISTORY).');

  // 2. KHỞI TẠO SYS_CONFIG_RESOLVED_RETURNS (id: 0000...002a)
  console.log('2. Chuẩn hóa RESOLVED_RETURNS (id: 0000...002a)...');
  const { data: resReturnsData } = await supabase
    .from('recipes')
    .select('notes')
    .eq('id', '00000000-0000-0000-0000-00000000002a')
    .maybeSingle();

  if (!resReturnsData) {
    const { error: errRR } = await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-00000000002a',
      name: 'SYS_CONFIG_RESOLVED_RETURNS',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      total_material_cost: 0,
      notes: '[]',
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (errRR) console.error('Lỗi upsert RESOLVED_RETURNS:', errRR.message);
    else console.log('  ✓ Đã tạo hàng cấu hình chuẩn SYS_CONFIG_RESOLVED_RETURNS (...002a).');
  } else {
    console.log('  ✓ RESOLVED_RETURNS đã tồn tại.');
  }

  // 3. KHỞI TẠO SYS_CONFIG_PENDING_RETURNS (id: 0000...0028)
  console.log('3. Chuẩn hóa PENDING_RETURNS (id: 0000...0028)...');
  const { data: pendingReturnsData } = await supabase
    .from('recipes')
    .select('notes')
    .eq('id', '00000000-0000-0000-0000-000000000028')
    .maybeSingle();

  if (!pendingReturnsData) {
    const { error: errPR } = await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000028',
      name: 'SYS_CONFIG_PENDING_RETURNS',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      total_material_cost: 0,
      notes: '[]',
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (errPR) console.error('Lỗi upsert PENDING_RETURNS:', errPR.message);
    else console.log('  ✓ Đã tạo hàng cấu hình chuẩn SYS_CONFIG_PENDING_RETURNS (...0028).');
  } else {
    console.log('  ✓ PENDING_RETURNS đã tồn tại.');
  }

  // 4. KHỞI TẠO SYS_PUSH_SUBSCRIPTIONS (id: 0000...0040)
  console.log('4. Chuẩn hóa PUSH_SUBSCRIPTIONS (id: 0000...0040)...');
  const { data: pushSubData } = await supabase
    .from('recipes')
    .select('notes')
    .eq('id', '00000000-0000-0000-0000-000000000040')
    .maybeSingle();

  if (!pushSubData) {
    const { error: errPush } = await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000040',
      name: 'SYS_PUSH_SUBSCRIPTIONS',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      total_material_cost: 0,
      notes: '[]',
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (errPush) console.error('Lỗi upsert PUSH_SUBSCRIPTIONS:', errPush.message);
    else console.log('  ✓ Đã tạo hàng cấu hình chuẩn SYS_PUSH_SUBSCRIPTIONS (...0040).');
  } else {
    console.log('  ✓ PUSH_SUBSCRIPTIONS đã tồn tại.');
  }

  // 5. BẢO TOÀN SYS_CONFIG_HELD_ORDERS (id: 0000...0029)
  console.log('5. Kiểm tra tính toàn vẹn của HELD_ORDERS (id: 0000...0029)...');
  const { data: heldOrderData } = await supabase
    .from('recipes')
    .select('id, name, notes')
    .eq('id', '00000000-0000-0000-0000-000000000029')
    .maybeSingle();
  if (heldOrderData) {
    console.log(`  ✓ HELD_ORDERS hợp lệ (name: ${heldOrderData.name}, size: ${heldOrderData.notes?.length || 0} bytes).`);
  } else {
    console.log('  ⚠️ HELD_ORDERS trống, tạo mặc định...');
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000029',
      name: 'SYS_CONFIG_HELD_ORDERS',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      total_material_cost: 0,
      notes: '[]',
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  console.log('=== HOÀN TẤT HEALING SYSTEM CONFIGS ===');
}

healSystemConfigs().catch(console.error);
