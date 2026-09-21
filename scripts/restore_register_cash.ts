import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SYS_CONFIG_CURRENT_SHIFT = '00000000-0000-0000-0000-000000000012';
const SYS_CONFIG_CURRENT_SHIFT_NAME = 'SYS_CONFIG_CURRENT_SHIFT';

async function restore() {
  const currentShift = {
    id: `shift-${Date.now()}`,
    shiftCode: 'CA-260921-04',
    isOpen: true,
    openedAt: new Date().toISOString(),
    openingCash: 1600000,
    cashSales: 0,
    transferSales: 0,
    orderCount: 0,
    openedBy: 'Chủ Tiệm (Admin)',
    notes: 'Khôi phục số dư két tiền 1.600.000₫ theo yêu cầu',
  };

  const { error } = await supabase.from('recipes').upsert({
    id: SYS_CONFIG_CURRENT_SHIFT,
    name: SYS_CONFIG_CURRENT_SHIFT_NAME,
    yield_qty: 1,
    yield_unit: 'ca',
    cost_per_unit: 0,
    total_material_cost: 0,
    notes: JSON.stringify(currentShift),
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  if (error) {
    console.error('Lỗi khi khôi phục két:', error);
    process.exit(1);
  }

  console.log('✅ Đã cập nhật thành công két ca hiện tại lên 1.600.000₫ trên Supabase Cloud SQL!');
}

restore().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
