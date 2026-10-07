// scripts/migrate_db1_to_db2.ts
import { createClient } from '@supabase/supabase-js';

const s1 = createClient('https://azgjnahbibrcbjooepef.supabase.co', 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn');
const s2 = createClient('https://fhiuojcvsouwugatnmve.supabase.co', 'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED');

async function migrate() {
  console.log('=== MIGRATING ALL DATA FROM DB1 (azgjnahbibrcbjooepef) TO DB2 (fhiuojcvsouwugatnmve) ===\n');

  // 1. PRODUCTS (21)
  console.log('1. Migrating products...');
  const { data: prods1, error: errP1 } = await s1.from('products').select('*');
  if (errP1) console.error('Lỗi đọc products từ DB1:', errP1);
  if (prods1 && prods1.length > 0) {
    // Omit food_cost_pct because it is a generated column in DB2
    const cleanProds = prods1.map(p => ({
      id: p.id,
      name: p.name,
      category: p.category,
      image_url: p.image_url,
      base_cost_price: p.base_cost_price,
      selling_price: p.selling_price,
      is_active: p.is_active,
      is_preorder_only: p.is_preorder_only,
      recipe_id: p.recipe_id,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));
    const { error: errP2 } = await s2.from('products').upsert(cleanProds, { onConflict: 'id' });
    if (errP2) console.error('❌ Lỗi upsert products sang DB2:', errP2.message);
    else console.log(`  ✓ Đã đồng bộ ${cleanProds.length} sản phẩm sang DB2 thành công!`);
  }

  // 2. INGREDIENTS (10)
  console.log('\n2. Migrating ingredients...');
  const { data: ings1, error: errI1 } = await s1.from('ingredients').select('*');
  if (errI1) console.error('Lỗi đọc ingredients từ DB1:', errI1);
  if (ings1 && ings1.length > 0) {
    const cleanIngs = ings1.map(i => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      category: i.category,
      stock_qty: i.stock_qty,
      reorder_level: i.reorder_level,
      avg_cost: i.avg_cost,
      wastage_pct: i.wastage_pct,
      is_active: i.is_active,
      created_at: i.created_at,
      updated_at: i.updated_at,
    }));
    const { error: errI2 } = await s2.from('ingredients').upsert(cleanIngs, { onConflict: 'id' });
    if (errI2) console.error('❌ Lỗi upsert ingredients sang DB2:', errI2.message);
    else console.log(`  ✓ Đã đồng bộ ${cleanIngs.length} nguyên liệu sang DB2 thành công!`);
  }

  // 3. RECIPES (37: 4 real recipes + 33 system configs)
  console.log('\n3. Migrating recipes & system configs...');
  const { data: recs1, error: errR1 } = await s1.from('recipes').select('*');
  if (errR1) console.error('Lỗi đọc recipes từ DB1:', errR1);
  if (recs1 && recs1.length > 0) {
    const cleanRecs = recs1.map(r => ({
      id: r.id,
      name: r.name,
      product_id: r.product_id,
      yield_qty: r.yield_qty,
      yield_unit: r.yield_unit,
      total_material_cost: r.total_material_cost,
      cost_per_unit: r.cost_per_unit,
      notes: r.notes,
      is_active: r.is_active,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    const { error: errR2 } = await s2.from('recipes').upsert(cleanRecs, { onConflict: 'id' });
    if (errR2) console.error('❌ Lỗi upsert recipes sang DB2:', errR2.message);
    else console.log(`  ✓ Đã đồng bộ ${cleanRecs.length} công thức & cấu hình hệ thống sang DB2 thành công!`);
  }

  // 4. RECIPE ITEMS (17)
  console.log('\n4. Migrating recipe_items...');
  const { data: rItems1, error: errRI1 } = await s1.from('recipe_items').select('*');
  if (errRI1) console.error('Lỗi đọc recipe_items từ DB1:', errRI1);
  if (rItems1 && rItems1.length > 0) {
    const cleanRItems = rItems1.map(ri => ({
      id: ri.id,
      recipe_id: ri.recipe_id,
      ingredient_id: ri.ingredient_id,
      quantity: ri.quantity,
      unit: ri.unit,
      line_cost: ri.line_cost,
      created_at: ri.created_at,
    }));
    const { error: errRI2 } = await s2.from('recipe_items').upsert(cleanRItems, { onConflict: 'id' });
    if (errRI2) console.error('❌ Lỗi upsert recipe_items sang DB2:', errRI2.message);
    else console.log(`  ✓ Đã đồng bộ ${cleanRItems.length} chi tiết định mức BOM sang DB2 thành công!`);
  }

  // 5. ORDERS (201)
  console.log('\n5. Migrating orders...');
  const { data: orders1, error: errO1 } = await s1.from('orders').select('*');
  if (errO1) console.error('Lỗi đọc orders từ DB1:', errO1);
  if (orders1 && orders1.length > 0) {
    const cleanOrders = orders1.map(o => ({
      id: o.id,
      local_id: o.local_id,
      order_number: o.order_number,
      created_by: o.created_by,
      store_id: o.store_id,
      order_type: o.order_type,
      status: o.status,
      preorder_pickup_at: o.preorder_pickup_at,
      subtotal: o.subtotal,
      discount_amount: o.discount_amount,
      discount_pct: o.discount_pct,
      total_amount: o.total_amount,
      total_cogs: o.total_cogs,
      notes: o.notes,
      shift_id: o.shift_id,
      sync_status: o.sync_status,
      created_at: o.created_at,
      updated_at: o.updated_at,
      customer_name: o.customer_name,
      customer_phone: o.customer_phone,
      cake_message: o.cake_message,
    }));
    // Batch upsert orders in chunks of 50
    for (let i = 0; i < cleanOrders.length; i += 50) {
      const chunk = cleanOrders.slice(i, i + 50);
      const { error: errO2 } = await s2.from('orders').upsert(chunk, { onConflict: 'id' });
      if (errO2) console.error(`❌ Lỗi upsert orders chunk ${i}:`, errO2.message);
    }
    console.log(`  ✓ Đã đồng bộ ${cleanOrders.length} đơn hàng sang DB2 thành công!`);
  }

  // 6. ORDER ITEMS (213)
  console.log('\n6. Migrating order_items...');
  const { data: oItems1, error: errOI1 } = await s1.from('order_items').select('*');
  if (errOI1) console.error('Lỗi đọc order_items từ DB1:', errOI1);
  if (oItems1 && oItems1.length > 0) {
    const cleanOItems = oItems1.map(oi => ({
      id: oi.id,
      order_id: oi.order_id,
      product_id: oi.product_id,
      variant_id: oi.variant_id,
      product_name_snapshot: oi.product_name_snapshot,
      quantity: oi.quantity,
      unit_price: oi.unit_price,
      unit_cost: oi.unit_cost,
      notes: oi.notes,
    }));
    // Batch upsert order_items in chunks of 50
    for (let i = 0; i < cleanOItems.length; i += 50) {
      const chunk = cleanOItems.slice(i, i + 50);
      const { error: errOI2 } = await s2.from('order_items').upsert(chunk, { onConflict: 'id' });
      if (errOI2) console.error(`❌ Lỗi upsert order_items chunk ${i}:`, errOI2.message);
    }
    console.log(`  ✓ Đã đồng bộ ${cleanOItems.length} chi tiết món ăn đơn hàng sang DB2 thành công!`);
  }

  console.log('\n=== MIGRATION COMPLETE! VERIFYING COUNTS IN DB2 ===');
  const tables = ['products', 'ingredients', 'recipes', 'recipe_items', 'orders', 'order_items'];
  for (const t of tables) {
    const { count } = await s2.from(t).select('*', { count: 'exact', head: true });
    console.log(`DB2 ${t}: ${count}`);
  }
}

migrate().catch(console.error);
