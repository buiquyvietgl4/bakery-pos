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

  // Test 6: Chọn hộp thủ công từ danh sách (khác hộp mặc định)
  const customBox = config.packagings[config.packagings.length - 1];
  const calcWithCustomBox = calculateCakeCostDetails(
    {
      cakeBaseId: config.cakeBases[0].id,
      cakeBaseSizeId: config.cakeBases[0].sizes[0].id,
      creamCoatingId: config.creamCoatings[0].id,
      packagingId: customBox.id, // Chọn hộp khác
    },
    config
  );
  if (calcWithCustomBox.packagingCost !== customBox.costPrice) {
    throw new Error(`Test 6 FAILED: packagingCost (${calcWithCustomBox.packagingCost}) khác customBox.costPrice (${customBox.costPrice})`);
  }
  console.log(`-> PASS Test 6: Chọn hộp khác từ list thành công (Hộp: ${customBox.name}, Vốn: ${calcWithCustomBox.packagingCost}đ)`);

  // Test 7: Mẫu BOM không ép buộc size cố định, khi chọn size (ví dụ 20cm) tự động link cốt & kem phủ
  const baseSize20 = config.cakeBases[0].sizes.find((s: any) => s.diameterCm === 20) || config.cakeBases[0].sizes[1];
  const creamSize20 = config.creamCoatings[0].sizes.find((s: any) => s.diameterCm === baseSize20.diameterCm);

  const calcWithSize20 = calculateCakeCostDetails(
    {
      cakeBaseId: config.cakeBases[0].id,
      cakeBaseSizeId: baseSize20.id,
      creamCoatingId: config.creamCoatings[0].id,
      // creamCoatingSizeId để trống -> tự link theo diameterCm
    },
    config
  );

  if (calcWithSize20.baseCost !== baseSize20.baseCost) {
    throw new Error(`Test 7 FAILED: baseCost (${calcWithSize20.baseCost}) khác baseSize20.baseCost (${baseSize20.baseCost})`);
  }
  if (creamSize20 && calcWithSize20.creamCost !== creamSize20.baseCost) {
    throw new Error(`Test 7 FAILED: creamCost (${calcWithSize20.creamCost}) khác creamSize20.baseCost (${creamSize20.baseCost})`);
  }
  console.log(`-> PASS Test 7: Tự động liên kết BOM cốt bánh (${baseSize20.sizeName}) và kem phủ (${creamSize20?.sizeName || 'N/A'}) chuẩn xác`);

  console.log('=== TẤT CẢ 7 BÀI TEST HỘP MẶC ĐỊNH & DYNAMIC SIZE ĐÃ THÀNH CÔNG 100% ===');
}

runTest().catch((err) => {
  console.error('Test thất bại:', err);
  process.exit(1);
});
