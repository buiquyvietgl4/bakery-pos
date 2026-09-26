// scripts/seed_missing_sys_configs.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DEFAULT_CUSTOM_CAKE_CONFIG = {
  sizes: [
    { id: 'size_16', name: 'Size 16cm (4 - 6 người)', basePrice: 280000, costPrice: 85000, isDefault: true },
    { id: 'size_18', name: 'Size 18cm (6 - 8 người)', basePrice: 350000, costPrice: 110000 },
    { id: 'size_20', name: 'Size 20cm (8 - 12 người)', basePrice: 420000, costPrice: 135000 },
    { id: 'size_22', name: 'Size 22cm (12 - 16 người)', basePrice: 520000, costPrice: 170000 },
  ],
  flavors: [
    { id: 'flavor_vanilla', name: 'Cốt Vani truyền thống', costPrice: 0, isDefault: true },
    { id: 'flavor_chocolate', name: 'Cốt Socola đậm đà', costPrice: 15000 },
    { id: 'flavor_matcha', name: 'Cốt Trà xanh Matcha Uji', costPrice: 20000 },
    { id: 'flavor_redvelvet', name: 'Cốt Red Velvet nhung đỏ', costPrice: 25000 },
  ],
  fillings: [
    { id: 'fill_strawberry', name: 'Mứt Dâu Tây Đà Lạt', costPrice: 15000, isDefault: true },
    { id: 'fill_mango', name: 'Xoài Cát Chu tươi', costPrice: 20000 },
    { id: 'fill_corn_cheese', name: 'Bắp ngọt sốt Phô mai', costPrice: 25000 },
    { id: 'fill_passion', name: 'Chanh Dây chua ngọt', costPrice: 15000 },
  ],
  creams: [
    { id: 'cream_fresh', name: 'Kem tươi Whipping Anchor', costPrice: 0, isDefault: true },
    { id: 'cream_cheese', name: 'Kem Creamcheese New Zealand', costPrice: 25000 },
    { id: 'cream_chocolate', name: 'Kem Ganache Socola 65%', costPrice: 30000 },
  ],
  packagings: [
    { id: 'pkg_standard', name: 'Hộp giấy tiêu chuẩn + Nến nĩa', costPrice: 0, isDefault: true },
    { id: 'pkg_mica', name: 'Hộp Mica trong suốt cao cấp + Ruy băng', costPrice: 35000 },
  ],
  addons: [
    { id: 'addon_crown', name: 'Vương miện công chúa', costPrice: 25000 },
    { id: 'addon_topper_gold', name: 'Topper Chúc Mừng Sinh Nhật ánh kim', costPrice: 10000 },
  ],
};

const DEFAULT_HOUSEHOLD_INFO = {
  shop_name: 'Tiệm Bánh ABC',
  tax_code: '0318247020',
  business_address: '123 Đường Bánh Ngọt, TP.HCM',
  owner_name: 'Bùi Quí Việt',
  phone: '0901 234 567',
  email: 'tiembanhabc@example.com',
  bank_account_number: '1017919940',
  bank_name: 'Vietcombank',
  district: 'Quận 1',
  province: 'TP. Hồ Chí Minh',
  software_name: 'Bakery POS ERP',
  registered_revenue_level: 2,
  pit_calculation_method: 1,
  regular_employees_count: 5,
  operating_hours: '06:30 - 22:00',
};

const DEFAULT_TAX_POLICY = {
  id: 'POLICY_2026_ND141',
  name: 'Chính sách thuế mới năm 2026 (Nghị định 141/2026/NĐ-CP & Thông tư 50/2026/TT-BTC)',
  version: '2026.1',
  policy_name: 'Nghị Định 141 & Thông Tư 50-BTC (2026)',
  effective_date: '01/01/2026',
  annual_threshold: 1_000_000_000,
  is_active: true,
};

async function seed() {
  console.log('=== SEEDING MISSING SYSTEM CONFIGS TO SUPABASE ===');

  // 1. Cake Costing
  const { error: cErr } = await supabase.from('recipes').upsert({
    id: '00000000-0000-0000-0000-000000000020',
    name: 'SYS_CONFIG_CAKE_COSTING',
    yield_qty: 1,
    yield_unit: 'config',
    cost_per_unit: 0,
    notes: JSON.stringify(DEFAULT_CUSTOM_CAKE_CONFIG),
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  console.log('Cake Costing seeded:', !cErr ? 'SUCCESS' : cErr.message);

  // 2. Tax Household
  const { error: tErr } = await supabase.from('recipes').upsert({
    id: '00000000-0000-0000-0000-00000000000c',
    name: 'SYS_CONFIG_TAX_HOUSEHOLD',
    yield_qty: 1,
    yield_unit: 'config',
    cost_per_unit: 0,
    notes: JSON.stringify(DEFAULT_HOUSEHOLD_INFO),
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  console.log('Tax Household seeded:', !tErr ? 'SUCCESS' : tErr.message);

  // 3. Tax Policy
  const { error: pErr } = await supabase.from('recipes').upsert({
    id: '00000000-0000-0000-0000-00000000000e',
    name: 'SYS_CONFIG_TAX_POLICY',
    yield_qty: 1,
    yield_unit: 'config',
    cost_per_unit: 0,
    notes: JSON.stringify(DEFAULT_TAX_POLICY),
    is_active: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  console.log('Tax Policy seeded:', !pErr ? 'SUCCESS' : pErr.message);
}

seed().catch(console.error);
