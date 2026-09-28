// scripts/inspect_backup_keys.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectBackup() {
  console.log('--- Inspecting SAO_LUU_TAM_THOI_7_NGAY_2026-09-26_16-03-13__P19_O187.bakery.json ---');
  const { data, error } = await supabase.storage
    .from('bakery-images')
    .download('cloud_backups_7days/SAO_LUU_TAM_THOI_7_NGAY_2026-09-26_16-03-13__P19_O187.bakery.json');

  if (error || !data) {
    console.error('Download error:', error);
    return;
  }

  const json = JSON.parse(await data.text());
  console.log('Top-level keys in backup:', Object.keys(json));
  console.log('\nEntity counts in backup:');
  console.log('- products:', json.products?.length);
  console.log('- ingredients:', json.ingredients?.length);
  console.log('- recipes:', json.recipes?.length);
  console.log('- orders:', json.orders?.length);
  console.log('- stock_adjustments:', json.stock_adjustments?.length);
  console.log('- spoilage_logs:', json.spoilage_logs?.length);
  console.log('- material_transactions:', json.material_transactions?.length);
  console.log('- material_stock_adjustments:', json.material_stock_adjustments?.length);
  console.log('- expenses:', json.expenses?.length);
  console.log('- cashflow:', json.cashflow?.length);
  console.log('- shifts:', json.shifts?.length);
  console.log('- current_shift:', json.current_shift ? 'present' : 'null');
  console.log('- accounting_closings:', json.accounting_closings?.length);
  console.log('- order_returns:', json.order_returns?.length);
  console.log('- pending_transfers:', json.pending_transfers?.length);
  console.log('- resolved_transfers:', json.resolved_transfers?.length);
  console.log('- oven_batches:', json.oven_batches?.length);
  console.log('- held_orders:', json.held_orders?.length);
  console.log('- notification_history:', json.notification_history?.length);
  console.log('- images:', json.images?.length);
  console.log('- settings keys:', json.settings ? Object.keys(json.settings) : 'none');
}

inspectBackup().catch(console.error);
