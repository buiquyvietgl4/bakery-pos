// scripts/inspect_current_data.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspect() {
  console.log('=== INSPECTING CURRENT SUPABASE CLOUD DATA ===');
  
  const [
    prods,
    ings,
    recs,
    recItems,
    orders,
    ordItems,
  ] = await Promise.all([
    supabase.from('products').select('id, name, selling_price, category', { count: 'exact' }),
    supabase.from('ingredients').select('id, name, stock_qty, unit', { count: 'exact' }),
    supabase.from('recipes').select('id, name, yield_qty, notes', { count: 'exact' }),
    supabase.from('recipe_items').select('id, recipe_id, ingredient_id, quantity, unit, line_cost', { count: 'exact' }),
    supabase.from('orders').select('id, order_number, total_amount, status', { count: 'exact' }),
    supabase.from('order_items').select('id, order_id, product_name_snapshot, quantity, unit_price', { count: 'exact' }),
  ]);

  console.log(`Products: ${prods.count} rows (Error: ${prods.error?.message || 'none'})`);
  console.log(`Ingredients: ${ings.count} rows (Error: ${ings.error?.message || 'none'})`);
  console.log(`Recipes: ${recs.count} rows (Error: ${recs.error?.message || 'none'})`);
  console.log(`Recipe Items: ${recItems.count} rows (Error: ${recItems.error?.message || 'none'})`);
  console.log(`Orders: ${orders.count} rows (Error: ${orders.error?.message || 'none'})`);
  console.log(`Order Items: ${ordItems.count} rows (Error: ${ordItems.error?.message || 'none'})`);

  const sysRecs = (recs.data || []).filter((r: any) => r.name.startsWith('SYS_') || r.name.startsWith('DB_') || r.name.startsWith('SPOILAGE'));
  console.log('\n--- System Config Rows in recipes table ---');
  sysRecs.forEach((r: any) => {
    let preview = r.notes ? r.notes.slice(0, 60) + '...' : '(empty)';
    console.log(`- [${r.id}] ${r.name}: ${preview}`);
  });

  const actualRecs = (recs.data || []).filter((r: any) => !r.name.startsWith('SYS_') && !r.name.startsWith('DB_') && !r.name.startsWith('SPOILAGE'));
  console.log('\n--- Actual Baking Recipes ---');
  actualRecs.forEach((r: any) => {
    const items = (recItems.data || []).filter((it: any) => it.recipe_id === r.id);
    console.log(`- [${r.id}] ${r.name} (${r.yield_qty} chiếc) -> ${items.length} items`);
  });

  // Check sample order items
  console.log('\n--- Sample Order Items ---');
  console.log('Sample item:', ordItems.data?.[0]);

  // Check sample recipe item
  console.log('\n--- Sample Recipe Item ---');
  console.log('Sample recipe item:', recItems.data?.[0]);
}

inspect().catch(console.error);
