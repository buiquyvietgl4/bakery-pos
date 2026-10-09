import { createClient } from '@supabase/supabase-js';

async function checkProfiles() {
  const c1 = createClient('https://fhiuojcvsouwugatnmve.supabase.co', 'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED');
  const c2 = createClient('https://azgjnahbibrcbjooepef.supabase.co', 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn');

  const { data: p1 } = await c1.from('profiles').select('*');
  const { data: p2 } = await c2.from('profiles').select('*');

  console.log('=== 🌐 CSDL CHÍNH (fhiuojcvsouwugatnmve) ===');
  console.log('Bảng profiles (tài khoản auth):', p1?.length || 0, JSON.stringify(p1, null, 2));

  console.log('\n=== 🧪 CSDL TEST (azgjnahbibrcbjooepef) ===');
  console.log('Bảng profiles (tài khoản auth):', p2?.length || 0, JSON.stringify(p2, null, 2));

  // Kiểm tra tài khoản trong cấu hình SYS_CONFIG_SECURITY
  const { data: sec1 } = await c1.from('recipes').select('notes').eq('name', 'SYS_CONFIG_SECURITY').maybeSingle();
  const { data: sec2 } = await c2.from('recipes').select('notes').eq('name', 'SYS_CONFIG_SECURITY').maybeSingle();

  if (sec1?.notes) {
    try {
      const parsed = JSON.parse(sec1.notes);
      console.log('\n🌐 CSDL CHÍNH - SYS_CONFIG_SECURITY:');
      console.log(' - Admin PIN:', parsed.adminPin ? 'Có' : 'Không');
      console.log(' - Danh sách tài khoản nội bộ (accounts):', parsed.accounts?.map((a: any) => ({ username: a.username, name: a.name, role: a.role })));
    } catch {}
  }

  if (sec2?.notes) {
    try {
      const parsed = JSON.parse(sec2.notes);
      console.log('\n🧪 CSDL TEST - SYS_CONFIG_SECURITY:');
      console.log(' - Admin PIN:', parsed.adminPin ? 'Có' : 'Không');
      console.log(' - Danh sách tài khoản nội bộ (accounts):', parsed.accounts?.map((a: any) => ({ username: a.username, name: a.name, role: a.role })));
    } catch {}
  }
}

checkProfiles().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
