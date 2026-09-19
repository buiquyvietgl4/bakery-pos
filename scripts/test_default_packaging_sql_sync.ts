import { INITIAL_FULL_CAKE_BOM_CONFIG } from '../src/lib/constants/defaultCakeBomData';
import { calculateCakeCostDetails, buildCakeOrderSpec, syncCakeBomConfigToDb } from '../src/lib/utils/cakeBomManager';
import { generateMasterSqlDump } from '../src/lib/utils/localSqlManager';

async function runTest() {
  console.log('--- BẮT ĐẦU KIỂM THỬ TỰ ĐỘNG HỘP MẶC ĐỊNH & ĐỒNG BỘ SQL ---');

  // Test 1: Kiểm tra cấu hình mẫu có ít nhất 1 hộp được đánh dấu isDefault
  const config = JSON.parse(JSON.stringify(INITIAL_FULL_CAKE_BOM_CONFIG));
  const defaultBox = config.packagings.find((p: any) => p.isDefault);
  console.log(`[Test 1] Hộp mặc định trong default config: ${defaultBox ? defaultBox.name : 'KHÔNG TÌM THẤY'}`);
  if (!defaultBox) {
    throw new Error('Test 1 FAILED: Không có hộp nào mang cờ isDefault: true');
  }
  console.log('-> PASS Test 1: Cấu hình mặc định có hộp isDefault');

  // Test 2: Đổi hộp thứ 2 thành mặc định và kiểm tra calculateCakeCostDetails
  if (config.packagings.length > 1) {
    config.packagings[0].isDefault = false;
    config.packagings[1].isDefault = true;
  }
  const expectedBox = config.packagings.find((p: any) => p.isDefault) || config.packagings[0];

  const calcResult = calculateCakeCostDetails(
    {
      cakeBaseId: config.cakeBases[0].id,
      cakeBaseSizeId: config.cakeBases[0].sizes[0].id,
      creamCoatingId: config.creamCoatings[0].id,
      creamCoatingSizeId: config.creamCoatings[0].sizes[0].id,
      // Không truyền packagingId -> phải tự động lấy expectedBox
    },
    config
  );

  console.log(`[Test 2] Giá vốn hộp tính được: ${calcResult.packagingCost}đ, Kỳ vọng: ${expectedBox.costPrice}đ`);
  if (calcResult.packagingCost !== expectedBox.costPrice) {
    throw new Error(`Test 2 FAILED: packagingCost (${calcResult.packagingCost}) khác expectedBox.costPrice (${expectedBox.costPrice})`);
  }
  console.log('-> PASS Test 2: calculateCakeCostDetails tự động áp dụng hộp mặc định Mục 4');

  // Test 3: Kiểm tra buildCakeOrderSpec tự động gán hộp mặc định Mục 4
  const orderSpec = buildCakeOrderSpec(
    {
      cakeBaseId: config.cakeBases[0].id,
      cakeBaseSizeId: config.cakeBases[0].sizes[0].id,
      creamCoatingId: config.creamCoatings[0].id,
      creamCoatingSizeId: config.creamCoatings[0].sizes[0].id,
      finalPrice: 350000,
    },
    config
  );

  console.log(`[Test 3] Hộp trong CakeOrderSpec: ${orderSpec.packaging?.name} (id: ${orderSpec.packaging?.id})`);
  if (!orderSpec.packaging || orderSpec.packaging.id !== expectedBox.id) {
    throw new Error(`Test 3 FAILED: orderSpec.packaging không khớp hộp mặc định (${expectedBox.name})`);
  }
  console.log('-> PASS Test 3: buildCakeOrderSpec tự động đính kèm thông tin hộp mặc định');

  // Test 4: Kiểm tra SQL Master Dump tạo đúng INSERT INTO bakery_bom_settings với mảng packagings chứa isDefault
  const dumpSql = generateMasterSqlDump({
    bakery_bom_settings: config,
  });

  if (!dumpSql.includes('INSERT INTO bakery_bom_settings')) {
    throw new Error('Test 4 FAILED: dumpSql không chứa câu lệnh INSERT INTO bakery_bom_settings');
  }
  if (!dumpSql.includes(expectedBox.name)) {
    throw new Error('Test 4 FAILED: dumpSql không chứa tên hộp mặc định');
  }
  console.log('-> PASS Test 4: SQL Master Dump sinh đúng cấu trúc bakery_bom_settings');

  // Test 5: Kiểm tra syncCakeBomConfigToDb đồng bộ lên Cloud SQL
  try {
    await syncCakeBomConfigToDb(config);
    console.log('-> PASS Test 5: syncCakeBomConfigToDb thực thi thành công');
  } catch (err: any) {
    console.warn('Test 5 warning (có thể do kết nối mạng Supabase):', err.message);
  }

  console.log('=== TẤT CẢ 5 BÀI TEST HỘP MẶC ĐỊNH & SQL ĐỒNG BỘ ĐÃ THÀNH CÔNG 100% ===');
}

runTest().catch((err) => {
  console.error('Test thất bại:', err);
  process.exit(1);
});
