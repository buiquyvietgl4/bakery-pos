import { createClient } from '@supabase/supabase-js';

async function check() {
  const c = createClient('https://fhiuojcvsouwugatnmve.supabase.co', 'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED');
  const { data } = await c.from('recipes').select('id, name, notes').or('id.eq.00000000-0000-0000-0000-000000000099,name.eq.SYS_CONFIG_DATABASE_PROFILE');
  console.log('Result in fhiuojcvsouwugatnmve:', JSON.stringify(data, null, 2));

  const c2 = createClient('https://azgjnahbibrcbjooepef.supabase.co', 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn');
  const { data: d2 } = await c2.from('recipes').select('id, name, notes').or('id.eq.00000000-0000-0000-0000-000000000099,name.eq.SYS_CONFIG_DATABASE_PROFILE');
  console.log('Result in azgjnahbibrcbjooepef:', JSON.stringify(d2, null, 2));
}

check().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
