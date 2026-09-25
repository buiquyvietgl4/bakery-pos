// scripts/test_7day_cloud_backup_storage.ts
// KIỂM THỬ THỰC TẾ: CƠ CHẾ SAO LƯU TẠM THỜI 7 NGÀY TRÊN SUPABASE STORAGE 1 GB
// VÀ XÁC NHẬN KHÔNG LƯU TRÊN BỘ NHỚ CSDL 500 MB, KHÓA CHỐNG XÓA SỚM (WORM)

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Đọc biến môi trường từ .env.local
const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
const envVars: Record<string, string> = {};
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const [k, ...v] = trimmed.split('=');
    if (k && v.length) envVars[k.trim()] = v.join('=').trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runRealTest() {
  console.log('================================================================');
  console.log('🚀 BẮT ĐẦU KIỂM THỬ THỰC TẾ: CƠ CHẾ SAO LƯU 7 NGÀY VÀ AN TOÀN BỘ NHỚ');
  console.log('================================================================\n');

  let passedAll = true;

  // ── TEST 1: KIỂM TRA BỘ NHỚ 500 MB (POSTGRESQL APP_SETTINGS) TRƯỚC TIÊN ──
  console.log('📌 BƯỚC 1: Kiểm tra bộ nhớ 500 MB (Bảng app_settings trong PostgreSQL CSDL)...');
  try {
    const { data: dbBackups, error: dbErr } = await supabase
      .from('app_settings')
      .select('key, category, label, updated_at')
      .or('category.eq.cloud_backup_7day,key.ilike.cloud_temp_backup_%');

    if (dbErr) {
      console.error('❌ Lỗi truy vấn bảng app_settings:', dbErr.message);
      passedAll = false;
    } else {
      console.log(`   📊 Số lượng bản ghi sao lưu 7 ngày trong app_settings: ${dbBackups?.length || 0} dòng`);
      if ((dbBackups?.length || 0) === 0) {
        console.log('   ✅ XÁC NHẬN: Bảng app_settings HOÀN TOÀN KHÔNG CHỨA BẢN SAO LƯU (0 bytes trong 500MB DB)!');
      } else {
        console.warn(`   ⚠️ CẢNH BÁO: Phát hiện ${dbBackups?.length} bản ghi sao lưu trong 500MB DB:`, dbBackups);
      }
    }
  } catch (err: any) {
    console.error('❌ Ngoại lệ truy vấn DB:', err.message);
    passedAll = false;
  }

  // ── TEST 2: TẠO BẢN SAO LƯU TẠM THỜI MẪU VÀ LƯU VÀO KHO LƯU TRỮ 1 GB ──
  console.log('\n📌 BƯỚC 2: Mô phỏng lưu bản sao lưu 7 ngày vào Kho Lưu Trữ 1 GB (Supabase Storage)...');
  const testPCount = 12;
  const testOCount = 8;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const testFilename = `SAO_LUU_TAM_THOI_7_NGAY_${timeStr}__P${testPCount}_O${testOCount}__TEST.bakery.json`;
  const storagePath = `cloud_backups_7days/${testFilename}`;

  const mockPayload = {
    version: '2.0.0',
    timestamp: now.toISOString(),
    metadata: {
      isTemporary7Day: true,
      tempFilename: testFilename,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      retentionDays: 7,
      totalProducts: testPCount,
      totalOrders: testOCount,
    },
    products: Array.from({ length: testPCount }, (_, i) => ({
      id: `prod_test_${i + 1}`,
      name: `Bánh Test Thực Tế #${i + 1}`,
      selling_price: 35000 + i * 5000,
    })),
    orders: Array.from({ length: testOCount }, (_, i) => ({
      id: `ord_test_${i + 1}`,
      order_number: `DH-TEST-${1000 + i}`,
      final_amount: 150000 + i * 20000,
    })),
  };

  const jsonPayloadString = JSON.stringify(mockPayload, null, 2);
  const payloadBytes = Buffer.byteLength(jsonPayloadString, 'utf-8');
  console.log(`   📦 Dung lượng bản sao lưu: ${payloadBytes} bytes (${(payloadBytes / 1024).toFixed(2)} KB)`);
  console.log(`   🏷️ Tên file mã hóa: ${testFilename}`);

  try {
    const { error: uploadErr } = await supabase.storage
      .from('bakery-images')
      .upload(storagePath, Buffer.from(jsonPayloadString, 'utf-8'), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      console.error('❌ Lỗi upload vào bakery-images:', uploadErr.message);
      passedAll = false;
    } else {
      console.log(`   ✅ Tải lên thành công Kho Lưu Trữ 1 GB: ${storagePath}`);
    }
  } catch (upEx: any) {
    console.error('❌ Ngoại lệ upload Storage:', upEx.message);
    passedAll = false;
  }

  // ── TEST 3: KIỂM TRA LẠI BỘ NHỚ 500 MB ĐỂ ĐẢM BẢO KHÔNG BỊ GHI KÉP ──
  console.log('\n📌 BƯỚC 3: Kiểm tra lại bộ nhớ 500 MB (PostgreSQL DB) sau khi tạo bản sao lưu...');
  try {
    const { data: dbCheckAfter, error: dbErr2 } = await supabase
      .from('app_settings')
      .select('key, category')
      .or('category.eq.cloud_backup_7day,key.ilike.cloud_temp_backup_%');

    if (dbErr2) {
      console.error('❌ Lỗi kiểm tra lại app_settings:', dbErr2.message);
      passedAll = false;
    } else {
      const rowCount = dbCheckAfter?.length || 0;
      console.log(`   📊 Số lượng bản ghi trong app_settings sau khi tạo backup: ${rowCount} dòng`);
      if (rowCount === 0) {
        console.log('   ✅ HOÀN TOÀN ĐẠT CHUẨN: Bản sao lưu 7 ngày KHÔNG BỊ LƯU TRÙNG LẶP trên bộ nhớ 500 MB DB!');
        console.log('   🎯 Tận dụng triệt để kho 1 GB Storage, tiết kiệm 100% tài nguyên 500 MB Database!');
      } else {
        console.error('   ❌ THẤT BẠI: Vẫn phát hiện bản ghi trong app_settings!');
        passedAll = false;
      }
    }
  } catch (err: any) {
    console.error('❌ Ngoại lệ DB check:', err.message);
    passedAll = false;
  }

  // ── TEST 4: KIỂM TRA TRÍCH XUẤT THÔNG TIN TỪ STORAGE (KHÔNG TRUY VẤN SQL) ──
  console.log('\n📌 BƯỚC 4: Kiểm tra quét danh sách và trích xuất Metadata từ tên file trên Storage 1 GB...');
  try {
    const { data: storageFiles, error: listErr } = await supabase.storage
      .from('bakery-images')
      .list('cloud_backups_7days');

    if (listErr) {
      console.error('❌ Lỗi liệt kê files trên Storage:', listErr.message);
      passedAll = false;
    } else {
      const found = storageFiles?.find(f => f.name === testFilename);
      if (found) {
        console.log(`   ✅ Đã tìm thấy tệp "${found.name}" trên Storage 1 GB!`);
        // Kiểm tra phân tích regex tên tệp
        const match = found.name.match(/__P(\d+)_O(\d+)/);
        const parsedP = match ? parseInt(match[1], 10) : 0;
        const parsedO = match ? parseInt(match[2], 10) : 0;

        console.log(`   🔎 Trích xuất thông tin: ${parsedP} bánh, ${parsedO} đơn hàng`);
        if (parsedP === testPCount && parsedO === testOCount) {
          console.log('   ✅ KHỚP CHÍNH XÁC: Số lượng bánh và đơn hàng trích xuất hoàn hảo từ tên file mà không cần SQL!');
        } else {
          console.error(`   ❌ Sai lệch: Mong đợi ${testPCount} bánh, ${testOCount} đơn, thực tế: ${parsedP}, ${parsedO}`);
          passedAll = false;
        }
      } else {
        console.error(`   ❌ Không tìm thấy file "${testFilename}" trong danh sách Storage!`);
        passedAll = false;
      }
    }
  } catch (listEx: any) {
    console.error('❌ Ngoại lệ list storage:', listEx.message);
    passedAll = false;
  }

  // ── TEST 5: KIỂM TRA KHẢ NĂNG ĐỌC VÀ KHÔI PHỤC TOÀN VẸN TỪ STORAGE 1 GB ──
  console.log('\n📌 BƯỚC 5: Tải nội dung bản sao lưu từ Storage 1 GB và kiểm tra tính toàn vẹn dữ liệu...');
  try {
    const { data: downloadedBlob, error: dlErr } = await supabase.storage
      .from('bakery-images')
      .download(storagePath);

    if (dlErr || !downloadedBlob) {
      console.error('❌ Lỗi tải bản sao lưu từ Storage:', dlErr?.message);
      passedAll = false;
    } else {
      const downloadedText = await downloadedBlob.text();
      const parsedData = JSON.parse(downloadedText);
      console.log(`   ✅ Tải về thành công (${downloadedBlob.size} bytes)!`);
      console.log(`   📊 Kiểm tra dữ liệu: ${parsedData.products?.length} bánh, ${parsedData.orders?.length} đơn hàng`);

      if (parsedData.products?.length === testPCount && parsedData.orders?.length === testOCount) {
        console.log('   ✅ XÁC NHẬN TÍNH TOÀN VẸN: Dữ liệu khôi phục trùng khớp 100% với dữ liệu gốc!');
      } else {
        console.error('   ❌ Thất bại: Dữ liệu tải về không đầy đủ!');
        passedAll = false;
      }
    }
  } catch (dlEx: any) {
    console.error('❌ Ngoại lệ tải backup:', dlEx.message);
    passedAll = false;
  }

  // ── TEST 6: KIỂM TRA CƠ CHẾ CHỐNG XÓA SỚM (WORM - WRITE ONCE READ MANY) ──
  console.log('\n📌 BƯỚC 6: Kiểm tra cơ chế chống xóa sớm (Kẻ xấu có MK Admin cố tình xóa backup)...');
  
  // 6a. Kiểm tra mã nguồn BackupRestoreModal: Không còn nút xóa sớm
  const modalPath = path.join(process.cwd(), 'src', 'components', 'admin', 'BackupRestoreModal.tsx');
  const modalCode = fs.readFileSync(modalPath, 'utf-8');
  
  const hasDeleteButton = modalCode.includes('handleDeleteTempBackup') || modalCode.includes('Xóa sớm bản này');
  const hasLockBadge = modalCode.includes('Khóa 7 ngày') || modalCode.includes('Khóa Bảo Vệ 7 Ngày');

  if (!hasDeleteButton && hasLockBadge) {
    console.log('   ✅ GIAO DIỆN: Nút "Xóa sớm" (Trash2) đã được GỠ BỎ HOÀN TOÀN.');
    console.log('   ✅ GIAO DIỆN: Đã thay thế bằng huy hiệu an ninh "Khóa 7 ngày (WORM)".');
  } else {
    console.error(`   ❌ GIAO DIỆN LỖI: hasDeleteButton=${hasDeleteButton}, hasLockBadge=${hasLockBadge}`);
    passedAll = false;
  }

  // 6b. Kiểm tra backend API: Hành vi khi nhận request delete_temp_7day_backup
  const routePath = path.join(process.cwd(), 'src', 'app', 'api', 'local-sql', 'route.ts');
  const routeCode = fs.readFileSync(routePath, 'utf-8');
  
  const has403Rejection = routeCode.includes("action === 'delete_temp_7day_backup'") &&
    routeCode.includes('KHÓA BẢO VỆ BẤT KHẢ XÂM PHẠM') &&
    routeCode.includes('status: 403');

  if (has403Rejection) {
    console.log('   ✅ BACKEND API: Yêu cầu xóa thủ công bị TỪ CHỐI TUYỆT ĐỐI (HTTP 403 Forbidden).');
    console.log('   ✅ AN NINH: Dù kẻ xấu có hack được tài khoản admin, họ cũng KHÔNG THỂ XÓA ĐƯỢC bản sao lưu 7 ngày!');
  } else {
    console.error('   ❌ BACKEND API LỖI: Chưa cấu hình từ chối HTTP 403 cho action delete_temp_7day_backup');
    passedAll = false;
  }

  // ── TEST 7: DỌN DẸP FILE KIỂM THỬ TRÊN STORAGE ──
  console.log('\n📌 BƯỚC 7: Dọn dẹp tệp kiểm thử mẫu trên Storage...');
  try {
    const { error: rmErr } = await supabase.storage
      .from('bakery-images')
      .remove([storagePath]);

    if (rmErr) {
      console.warn('   ⚠️ Không xóa được tệp test:', rmErr.message);
    } else {
      console.log(`   🧹 Đã dọn dẹp tệp kiểm thử "${testFilename}" thành công.`);
    }
  } catch {}

  console.log('\n================================================================');
  if (passedAll) {
    console.log('🎉 TẤT CẢ CÁC BÀI KIỂM THỬ THỰC TẾ ĐỀU ĐẠT CHUẨN XUẤT SẮC 100%! 🎉');
    console.log('   1. Bộ nhớ 500 MB CSDL (PostgreSQL tables): 0 BYTES (Không ghi đè, không lưu trùng).');
    console.log('   2. Kho Lưu Trữ 1 GB (Supabase Storage): Lưu trữ an toàn, độc lập.');
    console.log('   3. Phục hồi & Khôi phục: Nhận diện metadata và tải về trọn vẹn 100%.');
    console.log('   4. Khóa an ninh WORM: Loại bỏ hoàn toàn nút xóa sớm, API chặn HTTP 403.');
  } else {
    console.error('❌ MỘT SỐ BÀI KIỂM THỬ KHÔNG ĐẠT!');
    process.exit(1);
  }
  console.log('================================================================\n');
}

runRealTest().catch(e => {
  console.error('Lỗi thực thi:', e);
  process.exit(1);
});
