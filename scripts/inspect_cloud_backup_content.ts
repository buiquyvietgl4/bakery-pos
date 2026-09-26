// scripts/inspect_cloud_backup_content.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectBackup() {
  const filename = 'cloud_backups_7days/SAO_LUU_TAM_THOI_7_NGAY_2026-09-25_12-18-27__P19_O187.bakery.json';
  console.log(`Downloading ${filename}...`);

  const { data, error } = await supabase.storage.from('bakery-images').download(filename);
  if (error || !data) {
    console.error('Failed to download:', error);
    return;
  }

  const text = await data.text();
  const json = JSON.parse(text);

  console.log('=== BACKUP FILE CONTENT AUDIT ===');
  console.log('Schema Version:', json.schemaVersion);
  console.log('Exported At:', json.exportedAt);
  console.log('Store Name:', json.storeName);
  console.log('Total Products:', json.products?.length);
  console.log('Total Ingredients:', json.ingredients?.length);
  console.log('Total Recipes:', json.recipes?.length);
  console.log('Total Orders:', json.orders?.length);
  console.log('Total Stock Adjustments:', json.stock_adjustments?.length);
  console.log('Total Spoilage Logs:', json.spoilage_logs?.length);
  console.log('Total Expenses:', json.expenses?.length);
  console.log('Total Images:', json.images?.length);

  // Check recipes items
  let totalRecipeItems = 0;
  json.recipes?.forEach((r: any) => {
    const itemsCount = r.items?.length || 0;
    totalRecipeItems += itemsCount;
    console.log(`  - Recipe "${r.name}": ${itemsCount} items`);
  });
  console.log('Total Recipe Items across all recipes:', totalRecipeItems);

  // Check order items
  let totalOrderItems = 0;
  json.orders?.forEach((o: any) => {
    totalOrderItems += (o.items?.length || 0);
  });
  console.log('Total Order Items across all orders:', totalOrderItems);

  // Check settings
  console.log('\n--- Settings in Backup ---');
  console.log('Branding:', json.settings?.branding || '(none)');
  console.log('VietQR:', json.settings?.vietqr?.bankId, json.settings?.vietqr?.accountNumber, json.settings?.vietqr?.accountName);
  console.log('EWallet momo:', json.settings?.ewallet?.momo?.phone, 'zalopay:', json.settings?.ewallet?.zalopay?.phone);
  console.log('Printer:', json.settings?.printer ? 'present' : '(none)');
  console.log('Print templates:', json.settings?.print_templates ? Object.keys(json.settings.print_templates) : '(none)');
  console.log('Security:', json.settings?.security ? 'present' : '(none)');
  console.log('Admin PIN:', json.settings?.admin_pin || json.settings?.security?.adminPin);
  console.log('Cake costing:', json.settings?.cake_costing ? 'present' : '(none)');
  console.log('Full Cake BOM:', json.settings?.full_cake_bom_config ? 'present' : '(none)');
  console.log('Tax Household:', json.settings?.tax_household ? 'present' : '(none)');
  console.log('Tax Policy:', json.settings?.tax_policy ? 'present' : '(none)');
}

inspectBackup().catch(console.error);
