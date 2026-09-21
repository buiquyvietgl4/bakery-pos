import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const { data } = await supabase
    .from('recipes')
    .select('id, name, notes, updated_at')
    .in('id', [
      '00000000-0000-0000-0000-000000000012',
      '00000000-0000-0000-0000-000000000013',
      '00000000-0000-0000-0000-000000000030',
    ]);
  for (const r of data || []) {
    console.log(`=== ROW ID: ${r.id} | NAME: ${r.name} | UPDATED: ${r.updated_at} ===`);
    console.log(r.notes);
  }
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
