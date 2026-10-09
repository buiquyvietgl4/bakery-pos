import { createClient } from '@supabase/supabase-js';

const c = createClient('https://fhiuojcvsouwugatnmve.supabase.co', 'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED');

async function run() {
  const { error: delErr } = await c.from('recipes').delete().in('name', [
    'SYS_CONFIG_RESOLVED_TRANSFERS',
    'SYS_CONFIG_RESOLVED_RETURNS',
    'SYS_CONFIG_DELETED_RECIPES'
  ]);
  console.log('Delete result error:', delErr);

  const { data } = await c.from('recipes').select('id, name, is_active');
  console.log('Remaining rows in recipes table:', data?.length);
  data?.forEach((r, idx) => {
    console.log(`[${idx + 1}] ${r.name} (is_active: ${r.is_active})`);
  });
  process.exit(0);
}

run();
