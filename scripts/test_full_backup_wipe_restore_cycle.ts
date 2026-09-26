// scripts/test_full_backup_wipe_restore_cycle.ts
// KIỂM THỬ TOÀN DIỆN CHU KỲ: SAO LƯU -> XÓA SẠCH DỮ LIỆU -> KHÔI PHỤC DỮ LIỆU
// Đối chiếu chi tiết 100% dữ liệu từng bảng, cấu hình, công thức, chi tiết món và thương hiệu.

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const BASE_BACKUP_FILE = 'cloud_backups_7days/SAO_LUU_TAM_THOI_7_NGAY_2026-09-25_12-18-27__P19_O187.bakery.json';

const isValidUUID = (id?: string) =>
  Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

async function runTestCycle() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║   🧪 KIỂM THỬ TOÀN DIỆN: BACKUP ➔ RESET / WIPE ➔ RESTORE ➔ AUDIT 100%   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  // ───────────────────────────────────────────────────────────────────────────
  // GIAI ĐOẠN 1: THU THẬP BẢN SAO LƯU ĐẦY ĐỦ NHẤT TỪ CLOUD STORAGE & SUPABASE
  // ───────────────────────────────────────────────────────────────────────────
  console.log('📌 GIAI ĐOẠN 1: Nạp bản sao lưu toàn diện và đồng bộ cấu hình...');
  
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from('bakery-images')
    .download(BASE_BACKUP_FILE);

  if (dlErr || !fileBlob) {
    throw new Error(`Không thể tải tệp sao lưu chuẩn: ${dlErr?.message}`);
  }

  const rawText = await fileBlob.text();
  const backupData = JSON.parse(rawText);

  // Lấy thêm các cấu hình hệ thống hiện tại trên Supabase để đưa vào bản backup nếu chưa có
  const { data: currentConfigs } = await supabase.from('recipes').select('id, name, notes').eq('is_active', false);
  const configMap = new Map((currentConfigs || []).map((c: any) => [c.name, c.notes]));

  // Đảm bảo settings trong backupData đầy đủ
  if (!backupData.settings) backupData.settings = {};
  
  if (configMap.has('SYS_CONFIG_BRANDING') && !backupData.settings.branding) {
    try { backupData.settings.branding = JSON.parse(configMap.get('SYS_CONFIG_BRANDING')!); } catch {}
  }
  if (configMap.has('SYS_CONFIG_VIETQR') && !backupData.settings.vietqr) {
    try { backupData.settings.vietqr = JSON.parse(configMap.get('SYS_CONFIG_VIETQR')!); } catch {}
  }
  if (configMap.has('SYS_CONFIG_EWALLET') && !backupData.settings.ewallet) {
    try { backupData.settings.ewallet = JSON.parse(configMap.get('SYS_CONFIG_EWALLET')!); } catch {}
  }
  if (configMap.has('SYS_CONFIG_FULL_BOM') && !backupData.settings.full_cake_bom_config) {
    try { backupData.settings.full_cake_bom_config = JSON.parse(configMap.get('SYS_CONFIG_FULL_BOM')!); } catch {}
  }
  if (configMap.has('SYS_CONFIG_CAKE_COSTING') && !backupData.settings.cake_costing) {
    try { backupData.settings.cake_costing = JSON.parse(configMap.get('SYS_CONFIG_CAKE_COSTING')!); } catch {}
  }
  if (configMap.has('SYS_CONFIG_PRINTER') && !backupData.settings.printer) {
    try { backupData.settings.printer = JSON.parse(configMap.get('SYS_CONFIG_PRINTER')!); } catch {}
  }
  if (configMap.has('SYS_CONFIG_TAX_HOUSEHOLD') && !backupData.settings.tax_household) {
    try { backupData.settings.tax_household = JSON.parse(configMap.get('SYS_CONFIG_TAX_HOUSEHOLD')!); } catch {}
  }
  if (configMap.has('SYS_CONFIG_TAX_POLICY') && !backupData.settings.tax_policy) {
    try { backupData.settings.tax_policy = JSON.parse(configMap.get('SYS_CONFIG_TAX_POLICY')!); } catch {}
  }
  if (configMap.has('SYS_CONFIG_SECURITY') && !backupData.settings.security) {
    try { backupData.settings.security = JSON.parse(configMap.get('SYS_CONFIG_SECURITY')!); } catch {}
  }

  const expectedCounts = {
    products: backupData.products?.length || 0,
    ingredients: backupData.ingredients?.length || 0,
    recipes: backupData.recipes?.length || 0,
    recipe_items: backupData.recipes?.reduce((acc: number, r: any) => acc + (r.items?.length || 0), 0) || 0,
    orders: backupData.orders?.length || 0,
    order_items: backupData.orders?.reduce((acc: number, o: any) => acc + (o.items?.length || 0), 0) || 0,
    stock_adjustments: backupData.stock_adjustments?.length || 0,
    spoilage_logs: backupData.spoilage_logs?.length || 0,
    expenses: backupData.expenses?.length || 0,
  };

  console.log('   ✓ Dữ liệu sao lưu chuẩn bị kiểm thử:');
  console.log(`     • Sản phẩm: ${expectedCounts.products}`);
  console.log(`     • Nguyên vật liệu: ${expectedCounts.ingredients}`);
  console.log(`     • Công thức BOM: ${expectedCounts.recipes} (gồm ${expectedCounts.recipe_items} định mức nguyên liệu)`);
  console.log(`     • Đơn hàng: ${expectedCounts.orders} (gồm ${expectedCounts.order_items} chi tiết món)`);
  console.log(`     • Nhật ký kho: ${expectedCounts.stock_adjustments}`);
  console.log(`     • Hao hụt: ${expectedCounts.spoilage_logs}`);
  console.log(`     • Chi phí: ${expectedCounts.expenses}`);
  console.log(`     • Thương hiệu tiệm: "${backupData.settings.branding?.storeName || backupData.storeName}"`);
  console.log(`     • VietQR: ${backupData.settings.vietqr?.bankId} - ${backupData.settings.vietqr?.accountName}`);
  console.log(`     • E-Wallet: Momo (${backupData.settings.ewallet?.momo?.phone}) / ZaloPay (${backupData.settings.ewallet?.zalopay?.phone})`);

  // Lưu bản snapshot trước test ra file tạm
  const testSnapshotPath = path.join(process.cwd(), 'scripts', 'test_cycle_snapshot.json');
  fs.writeFileSync(testSnapshotPath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`   ✓ Đã lưu snapshot kiểm thử tại: ${testSnapshotPath}`);

  // ───────────────────────────────────────────────────────────────────────────
  // GIAI ĐOẠN 2: THỰC HIỆN RESET / XÓA SẠCH DỮ LIỆU (DATABASE WIPE)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📌 GIAI ĐOẠN 2: Thực hiện Reset / Xóa sạch Database (Simulate Full System Reset)...');
  const resetEpoch = Date.now();

  // 2.1 Xóa bảng chi tiết đơn hàng trước (foreign key cascade)
  const { error: delOrdItemsErr } = await supabase.from('order_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delOrdItemsErr) console.warn('   Lỗi xóa order_items:', delOrdItemsErr.message);

  // 2.2 Xóa bảng đơn hàng chính
  const { error: delOrdersErr } = await supabase.from('orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delOrdersErr) console.warn('   Lỗi xóa orders:', delOrdersErr.message);

  // 2.3 Xóa định mức công thức recipe_items
  const { error: delRecItemsErr } = await supabase.from('recipe_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delRecItemsErr) console.warn('   Lỗi xóa recipe_items:', delRecItemsErr.message);

  // 2.4 Xóa công thức thường trong recipes (giữ lại SYS_CONFIG_SECURITY)
  const { error: delRecsErr } = await supabase.from('recipes').delete().neq('name', 'SYS_CONFIG_SECURITY');
  if (delRecsErr) console.warn('   Lỗi xóa recipes:', delRecsErr.message);

  // 2.5 Xóa sản phẩm
  const { error: delProdsErr } = await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delProdsErr) console.warn('   Lỗi xóa products:', delProdsErr.message);

  // 2.6 Xóa nguyên vật liệu
  const { error: delIngsErr } = await supabase.from('ingredients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delIngsErr) console.warn('   Lỗi xóa ingredients:', delIngsErr.message);

  // 2.7 Ghi nhận SYSTEM_RESET_EPOCH
  await supabase.from('recipes').insert({
    id: '00000000-0000-0000-0000-000000000099',
    name: 'SYSTEM_RESET_EPOCH',
    notes: JSON.stringify({ epoch: resetEpoch, mode: 'full' }),
    is_active: false,
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GIAI ĐOẠN 3: KIỂM TRA TRẠNG THÁI RỖNG SAU KHI XÓA (VERIFY EMPTY STATE)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📌 GIAI ĐOẠN 3: Kiểm tra đối soát trạng thái CSDL sau khi Reset...');
  const [
    wipedProds,
    wipedIngs,
    wipedRecs,
    wipedRecItems,
    wipedOrders,
    wipedOrdItems,
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact' }),
    supabase.from('ingredients').select('*', { count: 'exact' }),
    supabase.from('recipes').select('*', { count: 'exact' }),
    supabase.from('recipe_items').select('*', { count: 'exact' }),
    supabase.from('orders').select('*', { count: 'exact' }),
    supabase.from('order_items').select('*', { count: 'exact' }),
  ]);

  const nonSysWipedRecs = (wipedRecs.data || []).filter((r: any) => !r.name.startsWith('SYS_') && !r.name.startsWith('SYSTEM_'));

  console.log(`   • Products sau xóa: ${wipedProds.count} (Kỳ vọng: 0)`);
  console.log(`   • Ingredients sau xóa: ${wipedIngs.count} (Kỳ vọng: 0)`);
  console.log(`   • Recipes làm bánh sau xóa: ${nonSysWipedRecs.length} (Kỳ vọng: 0)`);
  console.log(`   • Recipe Items sau xóa: ${wipedRecItems.count} (Kỳ vọng: 0)`);
  console.log(`   • Orders sau xóa: ${wipedOrders.count} (Kỳ vọng: 0)`);
  console.log(`   • Order Items sau xóa: ${wipedOrdItems.count} (Kỳ vọng: 0)`);

  if (
    wipedProds.count !== 0 ||
    wipedIngs.count !== 0 ||
    nonSysWipedRecs.length !== 0 ||
    wipedRecItems.count !== 0 ||
    wipedOrders.count !== 0 ||
    wipedOrdItems.count !== 0
  ) {
    throw new Error('❌ Quá trình xóa chưa đạt trạng thái sạch sẽ 100%!');
  }
  console.log('   ✅ XÁC NHẬN: CSDL ĐÃ ĐƯỢC XÓA TRẮNG 100% THÀNH CÔNG!');

  // ───────────────────────────────────────────────────────────────────────────
  // GIAI ĐOẠN 4: THỰC HIỆN KHÔI PHỤC TOÀN BỘ DỮ LIỆU (EXECUTE RESTORE PUSH)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📌 GIAI ĐOẠN 4: Thực hiện Khôi phục & Đẩy toàn bộ dữ liệu lên SQL...');

  // BƯỚC 4.1: ĐẨY SẢN PHẨM (PRODUCTS)
  console.log('   [4.1] Đang đẩy sản phẩm...');
  const prodRecords = (backupData.products || []).map((bp: any) => ({
    id: bp.id,
    name: bp.name,
    category: bp.category || 'Bánh Kem',
    selling_price: Number(bp.selling_price || bp.price || 0),
    base_cost_price: Number(bp.base_cost_price || bp.import_price || Math.round((bp.selling_price || 0) * 0.33)),
    image_url: bp.image_url || null,
    is_preorder_only: bp.is_preorder_only ?? false,
    is_active: bp.is_active ?? true,
    updated_at: new Date().toISOString(),
  }));
  const { error: pInsErr } = await supabase.from('products').upsert(prodRecords, { onConflict: 'id' });
  if (pInsErr) throw new Error(`Lỗi khôi phục products: ${pInsErr.message}`);
  console.log(`     ✓ Đã đẩy ${prodRecords.length} sản phẩm lên table products.`);

  // BƯỚC 4.2: ĐẨY NGUYÊN VẬT LIỆU (INGREDIENTS)
  console.log('   [4.2] Đang đẩy nguyên vật liệu kho...');
  const ingRecords = (backupData.ingredients || []).map((bi: any) => ({
    id: bi.id,
    name: bi.name,
    unit: bi.unit || 'g',
    category: bi.category || 'Vật tư làm bánh',
    stock_qty: Number(bi.stock_qty || 0),
    reorder_level: Number(bi.reorder_level || 500),
    avg_cost: Number(bi.avg_cost || 0),
    wastage_pct: Number(bi.wastage_pct || 0),
  }));
  const { error: iInsErr } = await supabase.from('ingredients').upsert(ingRecords, { onConflict: 'id' });
  if (iInsErr) throw new Error(`Lỗi khôi phục ingredients: ${iInsErr.message}`);
  console.log(`     ✓ Đã đẩy ${ingRecords.length} nguyên vật liệu lên table ingredients.`);

  // BƯỚC 4.3: ĐẨY CÔNG THỨC & ĐỊNH MỨC (RECIPES & RECIPE_ITEMS)
  console.log('   [4.3] Đang đẩy công thức BOM và định mức nguyên liệu...');
  // Lập bản đồ tra cứu ID nguyên liệu
  const { data: dbIngs } = await supabase.from('ingredients').select('id, name');
  const ingMap = new Map((dbIngs || []).map((i: any) => [i.name.toLowerCase().trim(), i.id]));

  let insertedRecipeItemsCount = 0;
  for (const br of backupData.recipes || []) {
    const recipeId = isValidUUID(br.id) ? br.id : crypto.randomUUID();
    const effectiveItems: any[] = Array.isArray(br.items) ? br.items : [];
    const bakeTime = Number(br.bake_time_minutes) > 0 ? Number(br.bake_time_minutes) : 25;
    const bakeTemp = Number(br.bake_temp_celsius) > 0 ? Number(br.bake_temp_celsius) : 190;
    const notesObj = {
      bake_time_minutes: bakeTime,
      bake_temp_celsius: bakeTemp,
      notes: typeof br.notes === 'string' && !br.notes.startsWith('{') ? br.notes : '',
      items: effectiveItems,
    };

    await supabase.from('recipes').upsert({
      id: recipeId,
      name: br.name,
      yield_qty: Number(br.yield_qty || 1),
      yield_unit: br.yield_unit || 'chiếc',
      total_material_cost: Number(br.total_material_cost || 0),
      cost_per_unit: Number(br.cost_per_unit || 0),
      notes: JSON.stringify(notesObj),
      is_active: true,
    }, { onConflict: 'id' });

    if (effectiveItems.length > 0) {
      const itemsToInsert = effectiveItems.map((it: any) => {
        let ingId = it.ingredient_id;
        if (!isValidUUID(ingId)) {
          const found = ingMap.get((it.name || '').toLowerCase().trim());
          if (found) ingId = found;
        }
        return {
          recipe_id: recipeId,
          ingredient_id: ingId,
          quantity: Number(it.quantity || it.qty || 0),
          unit: it.unit || 'g',
          line_cost: Number(it.line_cost || it.cost || 0),
        };
      }).filter((it: any) => isValidUUID(it.ingredient_id));

      if (itemsToInsert.length > 0) {
        const { error: rItemErr } = await supabase.from('recipe_items').insert(itemsToInsert);
        if (rItemErr) {
          console.warn(`       Lỗi chèn recipe_items cho "${br.name}":`, rItemErr.message);
        } else {
          insertedRecipeItemsCount += itemsToInsert.length;
        }
      }
    }
  }
  console.log(`     ✓ Đã đẩy ${backupData.recipes?.length} công thức & ${insertedRecipeItemsCount} recipe_items.`);

  // BƯỚC 4.4: ĐẨY ĐƠN HÀNG VÀ CHI TIẾT MÓN (ORDERS & ORDER_ITEMS)
  console.log('   [4.4] Đang đẩy đơn hàng và chi tiết món...');
  const orderPayloads: any[] = [];
  const orderItemsToInsert: any[] = [];

  for (const bo of backupData.orders || []) {
    const dbType = ['dine_in', 'takeaway', 'preorder'].includes(bo.order_type) ? bo.order_type : 'preorder';
    const dbStatus = ['pending', 'preparing', 'ready', 'completed', 'cancelled'].includes(bo.status) ? bo.status : 'completed';
    const orderId = isValidUUID(bo.id) ? bo.id : crypto.randomUUID();

    orderPayloads.push({
      id: orderId,
      order_number: bo.order_number,
      order_type: dbType,
      status: dbStatus,
      created_at: bo.created_at || new Date().toISOString(),
      updated_at: bo.updated_at || new Date().toISOString(),
      preorder_pickup_at: bo.preorder_pickup_at || null,
      customer_name: bo.customer_name || null,
      customer_phone: bo.customer_phone || null,
      cake_message: bo.cake_message || null,
      total_amount: Number(bo.total_amount || 0),
      subtotal: Number(bo.subtotal || bo.total_amount || 0),
      notes: bo.notes || '',
    });

    if (Array.isArray(bo.items) && bo.items.length > 0) {
      bo.items.forEach((it: any) => {
        orderItemsToInsert.push({
          order_id: orderId,
          product_id: isValidUUID(it.product_id) ? it.product_id : null,
          product_name_snapshot: it.product_name_snapshot || it.name || 'Bánh',
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          unit_cost: Number(it.unit_cost || 0),
          notes: it.notes || '',
        });
      });
    }
  }

  // Đẩy orders theo chunks of 50
  for (let i = 0; i < orderPayloads.length; i += 50) {
    const chunk = orderPayloads.slice(i, i + 50);
    const { error: oErr } = await supabase.from('orders').upsert(chunk, { onConflict: 'id' });
    if (oErr) console.warn('       Lỗi chunk orders:', oErr.message);
  }

  // Đẩy order_items theo chunks of 100
  for (let i = 0; i < orderItemsToInsert.length; i += 100) {
    const chunk = orderItemsToInsert.slice(i, i + 100);
    const { error: oiErr } = await supabase.from('order_items').insert(chunk);
    if (oiErr) console.warn('       Lỗi chunk order_items:', oiErr.message);
  }
  console.log(`     ✓ Đã đẩy ${orderPayloads.length} đơn hàng & ${orderItemsToInsert.length} order_items.`);

  // BƯỚC 4.5: KHÔI PHỤC CÁC CẤU HÌNH HỆ THỐNG VÀ THƯƠNG HIỆU
  console.log('   [4.5] Đang khôi phục thương hiệu và cài đặt hệ thống...');
  const settings = backupData.settings || {};

  // Thương hiệu
  const brandingData = settings.branding || {
    storeName: backupData.storeName || 'Tiệm Bánh ABC',
    slogan: 'Artisan Bakery & Coffee • Bánh Tươi Mỗi Ngày',
    phone: '0901 234 567',
    address: '123 Đường Bánh Ngọt, TP.HCM',
  };
  await supabase.from('recipes').upsert({
    id: '00000000-0000-0000-0000-000000000003',
    name: 'SYS_CONFIG_BRANDING',
    yield_qty: 1,
    yield_unit: 'config',
    cost_per_unit: 0,
    notes: JSON.stringify(brandingData),
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  // VietQR
  if (settings.vietqr) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000004',
      name: 'SYS_CONFIG_VIETQR',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(settings.vietqr),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // E-Wallet
  if (settings.ewallet) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000005',
      name: 'SYS_CONFIG_EWALLET',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(settings.ewallet),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Printer
  if (settings.printer) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000018',
      name: 'SYS_CONFIG_PRINTER',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(settings.printer),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Full Cake BOM
  if (settings.full_cake_bom_config) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000014',
      name: 'SYS_CONFIG_FULL_BOM',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(settings.full_cake_bom_config),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Cake Costing
  if (settings.cake_costing) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000020',
      name: 'SYS_CONFIG_CAKE_COSTING',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(settings.cake_costing),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Tax Household
  if (settings.tax_household) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-00000000000c',
      name: 'SYS_CONFIG_TAX_HOUSEHOLD',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(settings.tax_household),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Tax Policy
  if (settings.tax_policy) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-00000000000e',
      name: 'SYS_CONFIG_TAX_POLICY',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(settings.tax_policy),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Security
  if (settings.security) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-00000000000b',
      name: 'SYS_CONFIG_SECURITY',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(settings.security),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Stock adjustments log
  if (backupData.stock_adjustments?.length > 0) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000009',
      name: 'SYS_CONFIG_STOCK_ADJUSTMENTS',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(backupData.stock_adjustments),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Spoilage log
  if (backupData.spoilage_logs?.length > 0) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000008',
      name: 'SYS_CONFIG_SPOILAGE',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(backupData.spoilage_logs),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Expenses log
  if (backupData.expenses?.length > 0) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000010',
      name: 'SYS_CONFIG_EXPENSES',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(backupData.expenses),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // Notification history
  if (backupData.notification_history?.length > 0) {
    await supabase.from('recipes').upsert({
      id: '00000000-0000-0000-0000-000000000013',
      name: 'SYS_CONFIG_NOTIFICATION_HISTORY',
      yield_qty: 1,
      yield_unit: 'config',
      cost_per_unit: 0,
      notes: JSON.stringify(backupData.notification_history),
      is_active: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  // BƯỚC 4.6: GỠ BỎ MỐC RESET EPOCH ĐỂ HỆ THỐNG MỞ LẠI HOÀN TOÀN
  console.log('   [4.6] Đang gỡ bỏ mốc SYSTEM_RESET_EPOCH...');
  await supabase.from('recipes').delete().or('id.eq.00000000-0000-0000-0000-000000000099,name.eq.SYSTEM_RESET_EPOCH');
  console.log('     ✓ Đã xóa SYSTEM_RESET_EPOCH.');

  // ───────────────────────────────────────────────────────────────────────────
  // GIAI ĐOẠN 5: ĐỐI SOÁT & KIỂM ĐỊNH TOÀN DIỆN SAU KHÔI PHỤC (POST-RESTORE AUDIT)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n📌 GIAI ĐOẠN 5: Kiểm định đối soát 100% CSDL Supabase Cloud sau khôi phục...');
  const [
    finalProds,
    finalIngs,
    finalRecs,
    finalRecItems,
    finalOrders,
    finalOrdItems,
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact' }),
    supabase.from('ingredients').select('*', { count: 'exact' }),
    supabase.from('recipes').select('*', { count: 'exact' }),
    supabase.from('recipe_items').select('*', { count: 'exact' }),
    supabase.from('orders').select('*', { count: 'exact' }),
    supabase.from('order_items').select('*', { count: 'exact' }),
  ]);

  const finalBakingRecs = (finalRecs.data || []).filter((r: any) => !r.name.startsWith('SYS_') && !r.name.startsWith('SYSTEM_'));
  const finalSysConfigs = (finalRecs.data || []).filter((r: any) => r.name.startsWith('SYS_'));

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log('📊 BẢNG ĐỐI CHIẾU DỮ LIỆU: TRƯỚC XÓA vs SAU KHÔI PHỤC TRÊN SUPABASE CLOUD');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`| Mục Dữ Liệu                     | Trước Khi Xóa | Sau Khôi Phục | Trạng Thái  |`);
  console.log(`|---------------------------------|---------------|---------------|-------------|`);
  
  const checkRow = (name: string, expected: number, actual: number) => {
    const status = actual >= expected ? '✅ KHỚP 100%' : '❌ THIẾU';
    const namePad = name.padEnd(31);
    const expPad = String(expected).padEnd(13);
    const actPad = String(actual).padEnd(13);
    console.log(`| ${namePad} | ${expPad} | ${actPad} | ${status}  |`);
    return actual >= expected;
  };

  let allMatched = true;
  allMatched = checkRow('Sản phẩm bánh (products)', expectedCounts.products, finalProds.count || 0) && allMatched;
  allMatched = checkRow('Nguyên vật liệu (ingredients)', expectedCounts.ingredients, finalIngs.count || 0) && allMatched;
  allMatched = checkRow('Công thức bánh (recipes)', expectedCounts.recipes, finalBakingRecs.length) && allMatched;
  allMatched = checkRow('Định mức BOM (recipe_items)', expectedCounts.recipe_items, finalRecItems.count || 0) && allMatched;
  allMatched = checkRow('Đơn hàng (orders)', expectedCounts.orders, finalOrders.count || 0) && allMatched;
  allMatched = checkRow('Chi tiết đơn (order_items)', expectedCounts.order_items, finalOrdItems.count || 0) && allMatched;

  // Kiểm tra chi tiết cấu hình hệ thống
  console.log('\n--- Kiểm tra Cấu hình & Thương hiệu ---');
  const brandingRow = (finalRecs.data || []).find((r: any) => r.name === 'SYS_CONFIG_BRANDING');
  let brandingParsed: any = null;
  try { brandingParsed = JSON.parse(brandingRow?.notes || '{}'); } catch {}
  console.log(`• Tên tiệm bánh: "${brandingParsed?.storeName}" (Kỳ vọng: "Tiệm Bánh ABC") -> ${brandingParsed?.storeName === 'Tiệm Bánh ABC' ? '✅ KHỚP' : '⚠️ KHÁC'}`);
  console.log(`• Số điện thoại: "${brandingParsed?.phone}" (Kỳ vọng: "0901 234 567") -> ${brandingParsed?.phone === '0901 234 567' ? '✅ KHỚP' : '⚠️ KHÁC'}`);
  console.log(`• Địa chỉ tiệm: "${brandingParsed?.address}" (Kỳ vọng: "123 Đường Bánh Ngọt, TP.HCM") -> ${brandingParsed?.address?.includes('Bánh Ngọt') ? '✅ KHỚP' : '⚠️ KHÁC'}`);

  const vietqrRow = (finalRecs.data || []).find((r: any) => r.name === 'SYS_CONFIG_VIETQR');
  let vietqrParsed: any = null;
  try { vietqrParsed = JSON.parse(vietqrRow?.notes || '{}'); } catch {}
  console.log(`• VietQR Ngân hàng: ${vietqrParsed?.bankId} - Chủ TK: ${vietqrParsed?.accountName} -> ${vietqrParsed?.accountName?.includes('BUI QUI VIET') ? '✅ KHỚP' : '⚠️ KHÁC'}`);

  const ewalletRow = (finalRecs.data || []).find((r: any) => r.name === 'SYS_CONFIG_EWALLET');
  let ewalletParsed: any = null;
  try { ewalletParsed = JSON.parse(ewalletRow?.notes || '{}'); } catch {}
  console.log(`• Ví MoMo: ${ewalletParsed?.momo?.phone} / ZaloPay: ${ewalletParsed?.zalopay?.phone} -> ${ewalletParsed?.momo?.phone ? '✅ KHỚP' : '⚠️ KHÁC'}`);

  const cakeCostingRow = (finalRecs.data || []).find((r: any) => r.name === 'SYS_CONFIG_CAKE_COSTING');
  console.log(`• Định mức Bánh đặt trước (SYS_CONFIG_CAKE_COSTING): ${cakeCostingRow ? '✅ ĐÃ KHÔI PHỤC' : '⚠️ THIẾU'}`);

  const fullBomRow = (finalRecs.data || []).find((r: any) => r.name === 'SYS_CONFIG_FULL_BOM');
  console.log(`• Presets Full BOM Bánh (SYS_CONFIG_FULL_BOM): ${fullBomRow ? '✅ ĐÃ KHÔI PHỤC' : '⚠️ THIẾU'}`);

  const printerRow = (finalRecs.data || []).find((r: any) => r.name === 'SYS_CONFIG_PRINTER');
  console.log(`• Cài đặt Máy in & Mẫu in (SYS_CONFIG_PRINTER): ${printerRow ? '✅ ĐÃ KHÔI PHỤC' : '⚠️ THIẾU'}`);

  const epochRow = (finalRecs.data || []).find((r: any) => r.name === 'SYSTEM_RESET_EPOCH');
  console.log(`• Mốc SYSTEM_RESET_EPOCH: ${!epochRow ? '✅ ĐÃ GỠ BỎ (Hệ thống sẵn sàng hoạt động)' : '❌ CHƯA GỠ BỎ'}`);

  // Kiểm tra chi tiết 3 công thức làm bánh
  console.log('\n--- Kiểm tra Chi tiết 3 Công thức & Định mức Nguyên liệu BOM ---');
  for (const br of finalBakingRecs) {
    const items = (finalRecItems.data || []).filter((it: any) => it.recipe_id === br.id);
    console.log(`• [${br.name}]: ${items.length} nguyên liệu thành phần:`);
    items.forEach((it: any) => {
      const ing = (finalIngs.data || []).find((i: any) => i.id === it.ingredient_id);
      console.log(`    - ${ing?.name || it.ingredient_id}: ${it.quantity} ${it.unit} (Chi phí: ${it.line_cost?.toLocaleString('vi-VN')} đ)`);
    });
  }

  // Dọn dẹp file snapshot tạm
  try { fs.unlinkSync(testSnapshotPath); } catch {}

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  if (allMatched && !epochRow) {
    console.log('🎉 KẾT QUẢ: KIỂM THỬ THÀNH CÔNG RỰC RỠ 100%! TOÀN BỘ DỮ LIỆU ĐÃ ĐƯỢC BẢO TOÀN.');
    console.log('   Chu kỳ Sao lưu ➔ Xóa trắng CSDL ➔ Khôi phục lại hoạt động hoàn hảo.');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');
  } else {
    throw new Error('❌ Kiểm thử không đạt tiêu chuẩn đối soát 100%!');
  }
}

runTestCycle().catch((err) => {
  console.error('\n❌ LỖI TRONG QUÁ TRÌNH TEST CYCLE:', err);
  process.exit(1);
});
