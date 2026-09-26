// scripts/create_full_enriched_cloud_backup.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function createEnrichedBackup() {
  console.log('=== CREATING FULL ENRICHED 7-DAY CLOUD BACKUP ===');

  const [
    prods,
    ings,
    recs,
    recItems,
    orders,
    ordItems,
  ] = await Promise.all([
    supabase.from('products').select('*'),
    supabase.from('ingredients').select('*'),
    supabase.from('recipes').select('*'),
    supabase.from('recipe_items').select('*'),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('order_items').select('*'),
  ]);

  const cleanRecs = (recs.data || []).filter((r: any) => !r.name.startsWith('SYS_') && !r.name.startsWith('SYSTEM_'));
  const sysConfigs = (recs.data || []).filter((r: any) => r.name.startsWith('SYS_'));
  const configMap = new Map(sysConfigs.map((c: any) => [c.name, c.notes]));

  // Map recipe items into recipes
  const itemsByRecipe = new Map<string, any[]>();
  (recItems.data || []).forEach((it: any) => {
    if (!itemsByRecipe.has(it.recipe_id)) itemsByRecipe.set(it.recipe_id, []);
    const ing = (ings.data || []).find((i: any) => i.id === it.ingredient_id);
    itemsByRecipe.get(it.recipe_id)!.push({
      id: it.id,
      ingredient_id: it.ingredient_id,
      name: ing?.name || 'Nguyên liệu',
      quantity: Number(it.quantity) || 0,
      unit: it.unit || ing?.unit || 'g',
      line_cost: Number(it.line_cost) || 0,
    });
  });

  const fullRecipes = cleanRecs.map((r: any) => ({
    ...r,
    items: itemsByRecipe.get(r.id) || [],
  }));

  // Map order items into orders
  const itemsByOrder = new Map<string, any[]>();
  (ordItems.data || []).forEach((it: any) => {
    if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
    itemsByOrder.get(it.order_id)!.push(it);
  });

  const fullOrders = (orders.data || []).map((o: any) => ({
    ...o,
    items: itemsByOrder.get(o.id) || [],
  }));

  const parseCfg = (name: string) => {
    if (!configMap.has(name)) return null;
    try { return JSON.parse(configMap.get(name)!); } catch { return null; }
  };

  const branding = parseCfg('SYS_CONFIG_BRANDING');
  const vietqr = parseCfg('SYS_CONFIG_VIETQR');
  const ewallet = parseCfg('SYS_CONFIG_EWALLET');
  const printer = parseCfg('SYS_CONFIG_PRINTER');
  const fullBom = parseCfg('SYS_CONFIG_FULL_BOM');
  const cakeCosting = parseCfg('SYS_CONFIG_CAKE_COSTING');
  const taxHousehold = parseCfg('SYS_CONFIG_TAX_HOUSEHOLD');
  const taxPolicy = parseCfg('SYS_CONFIG_TAX_POLICY');
  const security = parseCfg('SYS_CONFIG_SECURITY');
  const stockAdjustments = parseCfg('SYS_CONFIG_STOCK_ADJUSTMENTS') || [];
  const spoilageLogs = parseCfg('SYS_CONFIG_SPOILAGE') || [];
  const expenses = parseCfg('SYS_CONFIG_EXPENSES') || [];
  const notifs = parseCfg('SYS_CONFIG_NOTIFICATION_HISTORY') || [];

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const filename = `SAO_LUU_TAM_THOI_7_NGAY_${timeStr}__P${prods.data?.length || 0}_O${orders.data?.length || 0}.bakery.json`;
  const storagePath = `cloud_backups_7days/${filename}`;

  const payload = {
    schemaVersion: 'bakery-backup-v2',
    exportedAt: now.toISOString(),
    storeName: branding?.storeName || 'Tiệm Bánh ABC',
    metadata: {
      totalProducts: prods.data?.length || 0,
      totalOrders: orders.data?.length || 0,
      totalRecipes: fullRecipes.length,
      totalIngredients: ings.data?.length || 0,
      totalStockLogs: stockAdjustments.length,
      totalSpoilageLogs: spoilageLogs.length,
      totalExpenses: expenses.length,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      isTemporary7Day: true,
      retentionDays: 7,
    },
    products: prods.data || [],
    ingredients: ings.data || [],
    recipes: fullRecipes,
    orders: fullOrders,
    stock_adjustments: stockAdjustments,
    spoilage_logs: spoilageLogs,
    expenses,
    notification_history: notifs,
    settings: {
      branding,
      vietqr,
      ewallet,
      printer,
      full_cake_bom_config: fullBom,
      cake_costing: cakeCosting,
      tax_household: taxHousehold,
      tax_policy: taxPolicy,
      security,
      admin_pin: security?.adminPin || 'admin123',
    },
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const { error: upErr } = await supabase.storage.from('bakery-images').upload(
    storagePath,
    Buffer.from(jsonStr, 'utf-8'),
    { contentType: 'application/json', upsert: true }
  );

  if (upErr) {
    console.error('Upload error:', upErr.message);
  } else {
    console.log(`✅ ĐÃ LƯU BẢN SAO LƯU 7 NGÀY MỚI NHẤT LÊN SUPABASE STORAGE 1GB: ${storagePath}`);
    console.log(`   • Dung lượng: ${Math.round(jsonStr.length / 1024)} KB`);
    console.log(`   • Sản phẩm: ${payload.products.length}`);
    console.log(`   • Nguyên vật liệu: ${payload.ingredients.length}`);
    console.log(`   • Công thức: ${payload.recipes.length}`);
    console.log(`   • Đơn hàng: ${payload.orders.length}`);
    console.log(`   • Thương hiệu: "${payload.storeName}"`);
  }
}

createEnrichedBackup().catch(console.error);
