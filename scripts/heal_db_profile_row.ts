import { createClient } from '@supabase/supabase-js';

const PROD_URL = 'https://fhiuojcvsouwugatnmve.supabase.co';
const PROD_KEY = 'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED';

const TEST_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const TEST_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';

async function fix() {
  const c1 = createClient(PROD_URL, PROD_KEY);
  const c2 = createClient(TEST_URL, TEST_KEY);

  const payload = {
    url: PROD_URL,
    anonKey: PROD_KEY,
    name: 'CSDL Chính (Vận Hành)',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system_heal',
    version: Date.now(),
  };

  // Cập nhật CSDL Chính
  await c1.from('recipes').upsert({
    id: '00000000-0000-0000-0000-000000000099',
    name: 'SYS_CONFIG_DATABASE_PROFILE',
    notes: JSON.stringify(payload),
    is_active: false,
  }, { onConflict: 'id' });

  // Cập nhật CSDL Test
  await c2.from('recipes').upsert({
    id: '00000000-0000-0000-0000-000000000099',
    name: 'SYS_CONFIG_DATABASE_PROFILE',
    notes: JSON.stringify(payload),
    is_active: false,
  }, { onConflict: 'id' });

  console.log('✅ Đã sửa lại SYS_CONFIG_DATABASE_PROFILE về CSDL Chính chuẩn: fhiuojcvsouwugatnmve');
}

fix().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
