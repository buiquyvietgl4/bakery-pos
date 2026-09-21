import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkOrders() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('RECENT ORDERS IN SUPABASE:');
  for (const o of orders || []) {
    console.log(`Order: ${o.order_number || o.id} | Total: ${o.total_amount} | Final: ${o.final_amount} | Payment: ${o.payment_method} | Created: ${o.created_at}`);
  }

  // Check sum of today cash sales
  const today = new Date().toISOString().slice(0, 10);
  const todayOrders = (orders || []).filter(o => (o.created_at || '').startsWith(today));
  console.log(`\nToday orders count: ${todayOrders.length}`);
  const cashTotal = todayOrders
    .filter(o => o.payment_method === 'cash')
    .reduce((sum, o) => sum + Number(o.final_amount || 0), 0);
  console.log(`Today Cash Orders Total: ${cashTotal}`);

  // Check all recipes rows
  const { data: recipes } = await supabase.from('recipes').select('id, name, updated_at');
  console.log('\nALL RECIPES ROWS:');
  console.log(recipes);
}

checkOrders().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
