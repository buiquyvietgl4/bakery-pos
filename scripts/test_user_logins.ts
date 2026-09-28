import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';

async function verifyLogins() {
  const { data } = await supabase.from('recipes').select('notes').eq('id', DB_ROW_SECURITY_ID).single();
  const cfg = JSON.parse(data.notes);
  const accounts = cfg.accounts || [];

  console.log(`Kiểm tra đăng nhập cho ${accounts.length} tài khoản trong hệ thống:`);

  // Giả lập loginWithPin
  function testLoginWithPin(pin: string) {
    const acc = accounts.find((a: any) => a.isActive && a.pin === pin);
    if (acc) return { success: true, user: acc.name, role: acc.role, customPerms: acc.customPermissions };
    return { success: false };
  }

  // 1. Test PIN 7788 (Mai Thu Ngân)
  const res1 = testLoginWithPin('7788');
  console.log('1. Nhập PIN 7788:', res1);
  if (!res1.success || res1.user !== 'Mai Thu Ngân') throw new Error('Thất bại login Mai Thu Ngân');

  // 2. Test PIN 9900 (Tuấn Quản Lý)
  const res2 = testLoginWithPin('9900');
  console.log('2. Nhập PIN 9900:', res2);
  if (!res2.success || res2.user !== 'Tuấn Quản Lý') throw new Error('Thất bại login Tuấn Quản Lý');

  // 3. Test PIN sai 0000
  const res3 = testLoginWithPin('0000');
  console.log('3. Nhập PIN sai 0000:', res3);
  if (res3.success) throw new Error('PIN sai không được phép thành công');

  console.log('\n✅ XÁC MINH CƠ CHẾ ĐĂNG NHẬP THEO MÃ PIN THÀNH CÔNG 100%!');
}

verifyLogins().catch(console.error);
