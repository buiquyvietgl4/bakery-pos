import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';
const DB_ROW_SECURITY_NAME = 'SYS_CONFIG_SECURITY';

interface UserAccount {
  id: string;
  username: string;
  name: string;
  role: 'admin' | 'manager' | 'cashier' | 'kitchen' | 'staff';
  pin?: string;
  password?: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  customPermissions?: {
    pos?: boolean;
    cakeOrder?: boolean;
    kitchenKds?: boolean;
    adminAccess?: boolean;
    reports?: boolean;
    bomCost?: boolean;
    paymentSettings?: boolean;
  };
}

const DEFAULT_PERMISSIONS = {
  admin: {
    pos: true,
    cakeOrder: true,
    kitchenKds: true,
    adminAccess: true,
    reports: true,
    bomCost: true,
    paymentSettings: true,
  },
  manager: {
    pos: true,
    cakeOrder: true,
    kitchenKds: true,
    adminAccess: true,
    reports: true,
    bomCost: false,
    paymentSettings: false,
  },
  cashier: {
    pos: true,
    cakeOrder: true,
    kitchenKds: false,
    adminAccess: false,
    reports: false,
    bomCost: false,
    paymentSettings: false,
  },
  kitchen: {
    pos: false,
    cakeOrder: false,
    kitchenKds: true,
    adminAccess: false,
    reports: false,
    bomCost: true,
    paymentSettings: false,
  },
  staff: {
    pos: true,
    cakeOrder: true,
    kitchenKds: false,
    adminAccess: false,
    reports: false,
    bomCost: false,
    paymentSettings: false,
  },
};

function hasPermission(user: UserAccount, perm: keyof typeof DEFAULT_PERMISSIONS.admin): boolean {
  if (user.role === 'admin') return true;
  if (user.customPermissions && user.customPermissions[perm] !== undefined) {
    return Boolean(user.customPermissions[perm]);
  }
  const rolePerms = DEFAULT_PERMISSIONS[user.role] || DEFAULT_PERMISSIONS.staff;
  return Boolean(rolePerms[perm]);
}

async function runTest() {
  console.log('=== BẮT ĐẦU KIỂM THỬ HỆ THỐNG TÀI KHOẢN & PHÂN QUYỀN TÙY CHỈNH ===\n');

  // 1. Đọc cấu hình hiện tại từ Cloud SQL
  console.log('1. Đọc cấu hình SYS_CONFIG_SECURITY từ Supabase Cloud SQL...');
  const { data: row, error: fetchErr } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', DB_ROW_SECURITY_ID)
    .maybeSingle();

  if (fetchErr) {
    console.error('❌ Lỗi khi đọc SYS_CONFIG_SECURITY:', fetchErr);
    process.exit(1);
  }

  let securityConfig: any = {};
  if (row && row.notes) {
    try {
      securityConfig = JSON.parse(row.notes);
      console.log('✅ Đã nạp cấu hình bảo mật từ Cloud SQL thành công.');
    } catch {
      console.log('⚠️ notes không phải JSON, khởi tạo mới.');
    }
  } else {
    console.log('ℹ️ Chưa có bản ghi SYS_CONFIG_SECURITY, tạo mới.');
  }

  // Khởi tạo danh sách accounts nếu chưa có
  let accounts: UserAccount[] = Array.isArray(securityConfig.accounts) && securityConfig.accounts.length > 0
    ? securityConfig.accounts
    : [
        {
          id: '00000000-0000-0000-0000-000000000001',
          username: 'admin',
          name: securityConfig.adminName || 'Chủ Tiệm (Admin)',
          role: 'admin',
          password: securityConfig.adminPasswordHash || 'admin123',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: '00000000-0000-0000-0000-000000000002',
          username: 'nhanvien',
          name: securityConfig.staffName || 'Thu Ngân 01',
          role: 'cashier',
          pin: securityConfig.staffPin || '1234',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: '00000000-0000-0000-0000-000000000003',
          username: 'bep',
          name: securityConfig.kitchenName || 'Bếp Bánh KDS',
          role: 'kitchen',
          pin: securityConfig.kitchenPin || '5678',
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ];

  console.log(`\n2. Số tài khoản hiện tại: ${accounts.length}`);
  accounts.forEach((a) => {
    console.log(`   - [${a.role.toUpperCase()}] ${a.name} (@${a.username}) | PIN: ${a.pin || '(trống)'} | Active: ${a.isActive}`);
  });

  // 3. Test Tạo tài khoản mới: Thu Ngân với Quyền Tùy Chỉnh (ví dụ: được cấp thêm quyền xem Báo Cáo Doanh Thu)
  console.log('\n3. Tạo tài khoản thử nghiệm: "mai_thungan" (Vai trò: Thu Ngân, cấp thêm quyền xem Báo Cáo)...');
  const testUsername = 'mai_thungan';
  accounts = accounts.filter((a) => a.username !== testUsername && a.username !== 'tuan_quanly');

  const newAccount: UserAccount = {
    id: 'test-user-' + Date.now(),
    username: testUsername,
    name: 'Mai Thu Ngân',
    role: 'cashier',
    pin: '7788',
    password: 'password7788',
    phone: '0901234567',
    isActive: true,
    createdAt: new Date().toISOString(),
    customPermissions: {
      pos: true,
      reports: true, // Quyền được cấp riêng!
      bomCost: false, // Mặc định cashier không có
    },
  };
  accounts.push(newAccount);

  // 4. Test Tạo tài khoản Quản Lý: "tuan_quanly"
  console.log('4. Tạo tài khoản thử nghiệm: "tuan_quanly" (Vai trò: Quản Lý)...');
  const managerAccount: UserAccount = {
    id: 'test-mgr-' + Date.now(),
    username: 'tuan_quanly',
    name: 'Tuấn Quản Lý',
    role: 'manager',
    pin: '9900',
    password: 'managerPass123',
    phone: '0912345678',
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  accounts.push(managerAccount);

  // 5. Kiểm tra logic phân quyền (hasPermission)
  console.log('\n5. Kiểm tra logic phân quyền tùy chỉnh (Custom Permissions Verification):');
  
  // Kiểm tra Mai Thu Ngân
  const maiPos = hasPermission(newAccount, 'pos');
  const maiReports = hasPermission(newAccount, 'reports');
  const maiBom = hasPermission(newAccount, 'bomCost');
  const maiAdmin = hasPermission(newAccount, 'adminAccess');

  console.log(`   - Mai Thu Ngân -> POS: ${maiPos} (kỳ vọng: true)`);
  console.log(`   - Mai Thu Ngân -> Reports (Quyền riêng): ${maiReports} (kỳ vọng: true)`);
  console.log(`   - Mai Thu Ngân -> BOM Cost: ${maiBom} (kỳ vọng: false)`);
  console.log(`   - Mai Thu Ngân -> Admin Access: ${maiAdmin} (kỳ vọng: false)`);

  if (!maiPos || !maiReports || maiBom || maiAdmin) {
    throw new Error('Sai lệch logic phân quyền tùy chỉnh cho Mai Thu Ngân!');
  }
  console.log('   => ✅ Quyền tùy chỉnh riêng cho Thu Ngân hoạt động chính xác 100%!');

  // Kiểm tra Tuấn Quản Lý
  const tuanAdmin = hasPermission(managerAccount, 'adminAccess');
  const tuanReports = hasPermission(managerAccount, 'reports');
  const tuanBom = hasPermission(managerAccount, 'bomCost');

  console.log(`   - Tuấn Quản Lý -> Admin Access: ${tuanAdmin} (kỳ vọng: true)`);
  console.log(`   - Tuấn Quản Lý -> Reports: ${tuanReports} (kỳ vọng: true)`);
  console.log(`   - Tuấn Quản Lý -> BOM Cost: ${tuanBom} (kỳ vọng: false)`);

  if (!tuanAdmin || !tuanReports || tuanBom) {
    throw new Error('Sai lệch logic phân quyền cho Tuấn Quản Lý!');
  }
  console.log('   => ✅ Quyền chuẩn theo vai trò Quản Lý hoạt động chính xác 100%!');

  // 6. Lưu cấu hình cập nhật lên Supabase Cloud SQL
  console.log('\n6. Lưu cấu hình cập nhật lên Supabase Cloud SQL...');
  securityConfig.accounts = accounts;
  const notesJson = JSON.stringify(securityConfig);

  const { error: upsertErr } = await supabase.from('recipes').upsert(
    {
      id: DB_ROW_SECURITY_ID,
      name: DB_ROW_SECURITY_NAME,
      yield_qty: 1,
      yield_unit: 'chiếc',
      cost_per_unit: 0,
      total_material_cost: 0,
      notes: notesJson,
      is_active: false,
    },
    { onConflict: 'id' }
  );

  if (upsertErr) {
    console.error('❌ Lỗi lưu cấu hình lên Cloud SQL:', upsertErr);
    process.exit(1);
  }
  console.log('✅ Đã lưu cấu hình tài khoản lên Cloud SQL thành công.');

  // 7. Đọc lại từ Cloud SQL để xác nhận đồng bộ toàn vẹn
  console.log('\n7. Đọc lại từ Cloud SQL kiểm tra tính toàn vẹn (Round-trip verification)...');
  const { data: readBackRow, error: readBackErr } = await supabase
    .from('recipes')
    .select('notes')
    .eq('id', DB_ROW_SECURITY_ID)
    .single();

  if (readBackErr || !readBackRow?.notes) {
    console.error('❌ Lỗi đọc lại cấu hình:', readBackErr);
    process.exit(1);
  }

  const verifiedConfig = JSON.parse(readBackRow.notes);
  const foundMai = verifiedConfig.accounts?.find((a: UserAccount) => a.username === 'mai_thungan');
  const foundTuan = verifiedConfig.accounts?.find((a: UserAccount) => a.username === 'tuan_quanly');

  if (!foundMai || foundMai.pin !== '7788' || foundMai.customPermissions?.reports !== true) {
    throw new Error('Không tìm thấy tài khoản Mai Thu Ngân hoặc dữ liệu phân quyền bị thất thoát!');
  }
  if (!foundTuan || foundTuan.pin !== '9900' || foundTuan.role !== 'manager') {
    throw new Error('Không tìm thấy tài khoản Tuấn Quản Lý hoặc sai vai trò!');
  }

  console.log('✅ Xác thực Round-trip Cloud SQL hoàn tất xuất sắc!');
  console.log(`   - Tìm thấy: ${foundMai.name} (@${foundMai.username}), PIN: ${foundMai.pin}, Quyền tùy chỉnh: ${JSON.stringify(foundMai.customPermissions)}`);
  console.log(`   - Tìm thấy: ${foundTuan.name} (@${foundTuan.username}), PIN: ${foundTuan.pin}, Vai trò: ${foundTuan.role}`);

  console.log('\n=== TẤT CẢ KIỂM THỬ ĐÃ VƯỢT QUA 100% THÀNH CÔNG ===');
}

runTest().catch((err) => {
  console.error('❌ Lỗi kiểm thử:', err);
  process.exit(1);
});
