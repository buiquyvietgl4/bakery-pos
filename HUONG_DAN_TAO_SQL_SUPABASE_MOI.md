# CẨM NANG HƯỚNG DẪN KỸ THUẬT TOÀN DIỆN
# KHỞI TẠO CƠ SỞ DỮ LIỆU SQL & KHO LƯU TRỮ ẢNH TRÊN SUPABASE

> **Hệ Thống Quản Lý Tiệm Bánh:** Bakery ERP & POS Mini  
> **Áp dụng:** CSDL Vận Hành (Production) & CSDL Thử Nghiệm (Test Sandbox)  
> **Phiên bản cập nhật đầy đủ:** Tháng 09/2026

---

## 1. Tổng Quan & Khi Nào Cần Tạo CSDL Mới?

Hệ thống tiệm bánh cần một cơ sở dữ liệu đám mây PostgreSQL và một kho lưu trữ hình ảnh (Supabase Storage). Anh/chị sẽ cần khởi tạo CSDL mới trong các trường hợp sau:

- **Tạo CSDL Thử Nghiệm (Testing / Sandbox):** Dùng để nhân viên/quản lý tạo đơn hàng ảo, thử nghiệm công thức bánh mới, hoặc tái hiện và fix lỗi mà không làm ảnh hưởng hay sai lệch doanh thu của CSDL Chính.
- **Di chuyển sang CSDL Chính mới (Migration):** Dùng khi tài khoản Supabase cũ bị đầy gói cước Egress, hết hạn hoặc tiệm muốn làm mới dữ liệu từ đầu.
- **Mở thêm chi nhánh mới:** Mỗi chi nhánh có thể sở hữu một database riêng biệt, không bị lẫn lộn đơn hàng và kho.

> [!NOTE]
> **Thông tin gói dịch vụ miễn phí (Free Tier) của Supabase:**
> - **Chi phí:** Hoàn toàn MIỄN PHÍ ($0/tháng).
> - **Dung lượng:** Bao gồm **500 MB Database PostgreSQL** và **1 GB Storage lưu ảnh** (đủ chứa hơn 10.000 ảnh bánh & hóa đơn).
> - **Thời gian thực hiện:** Chỉ từ 3 đến 5 phút.

---

## 2. Bước 1: Đăng Ký / Đăng Nhập Supabase

1. Truy cập vào trang chủ Supabase: **[https://supabase.com](https://supabase.com)**
2. Bấm vào nút **"Sign In"** (Đăng nhập) hoặc **"Start your project"** ở góc trên bên phải.
3. Đăng nhập nhanh bằng tài khoản **GitHub** hoặc tài khoản **Google / Email** của anh/chị.

---

## 3. Bước 2: Tạo Dự Án Mới (New Project)

1. Tại màn hình Dashboard, bấm nút **"New project"** (màu xanh lá).
2. Điền thông tin dự án theo bảng hướng dẫn sau:

| Trường thông tin | Hướng dẫn chi tiết |
|---|---|
| **Name (Tên dự án)** | Đặt tên gợi nhớ. Ví dụ: `bakery-pos-test` (nếu làm database test) hoặc `bakery-pos-main` (nếu làm database chính). |
| **Database Password** | Nhập mật khẩu quản trị DB (tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số). *Hãy ghi lại mật khẩu này cẩn thận.* |
| **Region (Khu vực máy chủ)** | **CỰC KỲ QUAN TRỌNG:** Chọn vùng **"Singapore (ap-southeast-1)"** để máy chủ gần Việt Nam nhất, tốc độ phản hồi cực nhanh (~30-50ms). |
| **Pricing Plan** | Chọn **"Free"** ($0/month - Miễn phí 100%). |

3. Bấm nút **"Create new project"**. Chờ khoảng 1 – 2 phút để Supabase chuẩn bị máy chủ.

---

## 4. Bước 3: Lấy Thông Tin Kết Nối (Project URL & API Key)

1. Trên thanh menu bên trái của Supabase, bấm vào biểu tượng bánh răng **"Project Settings"** ở góc dưới cùng bên trái.
2. Chọn mục **"API"** trong danh sách cài đặt.
3. Sao chép 2 chuỗi ký tự sau:
   - **Project URL:** Có dạng `https://abcdefghijklm.supabase.co` ➔ Bấm nút **Copy**.
   - **Project API Keys:** Tìm đúng dòng có nhãn **`anon` `public`** ➔ Bấm nút **Copy**.

> [!CAUTION]
> Tuyệt đối **KHÔNG** chia sẻ hoặc copy nhầm khóa `service_role (secret)`. Chỉ dùng duy nhất khóa `anon public` cho ứng dụng bán hàng POS để đảm bảo an toàn tuyệt đối.

---

## 5. Bước 4: Danh Sách Chi Tiết 16 File SQL Cần Chạy

Hệ thống phần mềm tiệm bánh bao gồm tổng cộng **16 file migration SQL** (nằm trong thư mục `supabase/migrations/`). Dưới đây là danh sách chi tiết và ý nghĩa của từng file:

| STT / Tên File Migration | Nội Dung & Chức Năng | Bắt Buộc? |
|---|---|:---:|
| **00001_create_profiles_roles.sql** | Tạo bảng tài khoản người dùng, vai trò phân quyền (admin, kitchen, staff). | Có |
| **00002_create_stores_settings.sql** | Tạo bảng thông tin tiệm bánh, cài đặt in hóa đơn và thương hiệu cửa hàng. | Có |
| **00003_create_ingredients.sql** | Tạo bảng danh mục nguyên vật liệu làm bánh, tồn kho và mức cảnh báo sắp hết. | Có |
| **00004_create_recipes.sql** | Tạo bảng công thức sản xuất bánh (BOM), định mức nguyên liệu và tỷ lệ hao hụt. | Có |
| **00005_create_products.sql** | Tạo bảng danh mục sản phẩm/bánh bán lẻ tại quầy, phân loại nhóm bánh và giá bán. | Có |
| **00006_create_shifts_orders.sql** | Tạo bảng ca làm việc thu ngân, đơn hàng bán lẻ (POS) và đơn đặt bánh trước (Preorder). | Có |
| **00007_create_expenses_cashflow.sql** | Tạo bảng chi phí vận hành (OPEX), sổ thu chi tiền mặt (111) và ngân hàng VietQR (112). | Có |
| **00008_create_accounting_summary.sql** | Tạo bảng tổng hợp chốt sổ kế toán ngày, tháng và lịch sử kiểm kê định kỳ. | Có |
| **00009_create_functions_triggers.sql** | Tạo các hàm Trigger tự động trừ kho nguyên liệu khi bán bánh, tính giá vốn bình quân (WAC). | Có |
| **00010_create_views.sql** | Tạo các View hiển thị an toàn che giấu thông tin giá vốn (COGS) đối với nhân viên (`security_invoker = true`). | Có |
| **00011_create_rls_policies.sql** | Thiết lập chính sách bảo mật theo từng dòng dữ liệu (Row Level Security - RLS). | Có |
| **00012_fix_cross_device_sync.sql** | Bổ sung cơ chế đồng bộ Realtime tức thì đa thiết bị giữa máy POS và màn hình Bếp. | Có |
| **00013_fix_products_sync.sql** | Tối ưu hóa đồng bộ danh mục sản phẩm bánh nhanh chóng giữa các màn hình. | Có |
| **00014_add_resale_goods_and_cake_costing.sql** | Bổ sung tính năng định giá bánh kem thiết kế riêng và quản lý hàng thương mại bán kèm. | Có |
| **00015_enable_rls_secure_policies.sql** | Khóa bảo mật RLS toàn diện 100% các bảng và cố định search_path để triệt tiêu lỗi Security Advisor. | Có |
| **00016_create_storage_buckets.sql** | Tạo kho lưu trữ ảnh Supabase Storage (`bakery-images` & `product-images`) và cấp quyền upload. | **CỰC KỲ QUAN TRỌNG** |

---

## 6. Bước 5: Cách Thực Thi SQL Trên Supabase

Anh/chị có thể lựa chọn 1 trong 2 cách sau để chạy SQL:

### 🌟 CÁCH 1 (KHUYẾN NGHỊ - NHANH NHẤT 1-CLICK):
Hệ thống đã tự động gộp toàn bộ 16 file trên vào **DUY NHẤT 1 FILE TỔNG HỢP**: **`supabase/schema_full_init.sql`** *(đã bao gồm toàn bộ bảng, hàm, views và TẠO CẢ KHO ẢNH STORAGE!)*.

1. Mở Supabase, bấm vào menu **SQL Editor** (biểu tượng `>_`) bên trái màn hình.
2. Bấm nút **"+ New query"** để mở trang soạn thảo mới.
3. Mở file **`supabase/schema_full_init.sql`** trong thư mục dự án, nhấn `Ctrl + A` copy toàn bộ và **Dán (Paste)** vào ô SQL Editor trên Supabase.
4. Bấm nút **"Run"** màu xanh lá (hoặc bấm phím `Ctrl + Enter`).
5. Chờ khoảng 3 – 5 giây cho đến khi hiện thông báo **"Success. No rows returned"** là xong 100%!

### CÁCH 2 (CHẠY THỦ CÔNG TỪNG FILE):
Nếu muốn kiểm tra từng phần, anh/chị mở từng file trong thư mục `supabase/migrations/` và copy dán vào SQL Editor chạy lần lượt đúng theo thứ tự từ **`00001` ➔ `00016`** *(tuyệt đối không chạy nhảy cóc vì các bảng có quan hệ ràng buộc khóa ngoại với nhau)*.

---

## 7. Chi Tiết: Tạo Kho Lưu Trữ Ảnh Riêng 1 GB (Supabase Storage Bucket)

### 💡 Tại sao cần tạo kho lưu trữ ảnh riêng 1 GB?
Nền tảng Supabase gói Miễn phí (Free Tier) cung cấp **2 phân vùng bộ nhớ hoàn toàn độc lập**:
1. **Phân vùng CSDL PostgreSQL (Database - 500 MB):** Chuyên dùng để lưu dữ liệu văn bản/số (đơn hàng, hóa đơn, tồn kho nguyên liệu, công thức bánh, thông tin khách hàng).
2. **Phân vùng Kho Tệp Tin (Supabase Storage - 1.000 MB / 1 GB):** Chuyên dùng để lưu trữ hình ảnh (ảnh chụp bánh kem thực tế, ảnh mẫu bánh khách đặt, logo tiệm bánh, ảnh chứng từ bill chuyển khoản).

> [!IMPORTANT]
> **Quy Tắc Tiết Kiệm Dung Lượng Cốt Lõi:**
> Tuyệt đối **không lưu ảnh trực tiếp (dạng Base64) vào bảng SQL**, vì mỗi ảnh nặng 1 - 2 MB sẽ làm CSDL 500MB bị đầy rất nhanh!
> Thay vào đó, toàn bộ file ảnh gốc được đưa vào **Kho Storage 1 GB** (đủ sức chứa **hơn 10.000 - 20.000 bức ảnh bánh**). Bảng SQL chỉ lưu một đường link URL ngắn (~100 bytes), giúp database chạy siêu mượt và không bao giờ lo quá tải.

---

### 🌟 CÁCH 1: Chạy Bằng Lệnh SQL Tự Động (Nhanh Nhất - Khuyên Dùng)

Đoạn SQL này đã được tích hợp sẵn ở cuối file master **`supabase/schema_full_init.sql`** và file migration **`00016_create_storage_buckets.sql`**. Nếu anh/chị muốn chạy riêng lẻ cho kho ảnh, chỉ cần mở **SQL Editor** trên Supabase, copy đoạn code bên dưới và bấm **Run**:

```sql
-- ============================================================================
-- LỆNH SQL TẠO KHO LƯU TRỮ ẢNH RIÊNG 1 GB TRÊN SUPABASE
-- ============================================================================

-- 1. Kích hoạt tiện ích mở rộng uuid
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tạo Bucket chính "bakery-images" (Công khai, giới hạn 5MB/ảnh)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bakery-images',
  'bakery-images',
  true,
  5242880, -- Giới hạn tối đa 5MB mỗi ảnh để khai thác tối ưu kho 1GB
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

-- 3. Tạo Bucket dự phòng "product-images"
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

-- 4. Bật bảo mật RLS cho bảng quản lý tệp tin storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 5. Cấp quyền XEM ẢNH CÔNG KHAI (SELECT) cho máy POS, Bếp và điện thoại khách hàng
DROP POLICY IF EXISTS "Public Access Bakery Images" ON storage.objects;
CREATE POLICY "Public Access Bakery Images"
ON storage.objects FOR SELECT
USING (bucket_id IN ('bakery-images', 'product-images'));

-- 6. Cấp quyền TẢI ẢNH LÊN (INSERT) từ giao diện thu ngân và thợ làm bánh
DROP POLICY IF EXISTS "Allow Upload Bakery Images" ON storage.objects;
CREATE POLICY "Allow Upload Bakery Images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id IN ('bakery-images', 'product-images'));

-- 7. Cấp quyền CẬP NHẬT (UPDATE) & XÓA ẢNH (DELETE) khi đổi mẫu bánh hoặc xóa đơn
DROP POLICY IF EXISTS "Allow Update Bakery Images" ON storage.objects;
CREATE POLICY "Allow Update Bakery Images"
ON storage.objects FOR UPDATE
USING (bucket_id IN ('bakery-images', 'product-images'));

DROP POLICY IF EXISTS "Allow Delete Bakery Images" ON storage.objects;
CREATE POLICY "Allow Delete Bakery Images"
ON storage.objects FOR DELETE
USING (bucket_id IN ('bakery-images', 'product-images'));
```

---

### 🖱️ CÁCH 2: Tạo Bằng Tay Trên Giao Diện Supabase (Thao Tác Chuột)

Nếu không dùng lệnh SQL, anh/chị có thể thao tác trực tiếp trên giao diện quản trị Supabase Dashboard:

1. Trên thanh menu bên trái của Supabase, nhấp vào mục **Storage** (biểu tượng chiếc xô / thùng chứa).
2. Bấm nút **"New bucket"** ở góc phải màn hình.
3. Nhập chính xác tên bucket: **`bakery-images`** *(chữ thường, có dấu gạch ngang ở giữa)*.
4. **BƯỚC QUAN TRỌNG:** Gạt bật công tắc **"Public bucket"** sang màu xanh lá *(bắt buộc bật để ảnh có thể hiển thị công khai trên màn hình POS, máy tính bảng Bếp và điện thoại)*.
5. Mục **File size limit (Giới hạn kích thước file):** Nhập `5MB` (hoặc để trống mặc định).
6. Mục **Allowed MIME types:** Có thể chọn các định dạng ảnh phổ biến `image/jpeg, image/png, image/webp`.
7. Bấm nút **"Save"** để hoàn tất tạo kho lưu trữ.

---

## 8. Bước 6: Kết Nối Vào Ứng Dụng Bakery POS

1. Mở phần mềm Bakery POS trên trình duyệt, đăng nhập tài khoản **Admin**.
2. Chọn tab **"CSDL & Sao Lưu SQL"** ➔ Chọn mục **"2. Cài Đặt Cho Online (Cloud SQL)"**.
3. Tại khối **"Quản Trị Đa CSDL SQL: Chính & Thử Nghiệm"**:
   - Chọn thẻ **🟡 CSDL Thử Nghiệm (Test & Fix Lỗi)** (hoặc thẻ CSDL Chính nếu đang thay thế CSDL chính).
   - **Ô số 1:** Dán **Project URL** vừa lấy ở Bước 3.
   - **Ô số 2:** Dán **Anon API Key** vừa lấy ở Bước 3.
4. Bấm nút **"🔍 Kiểm Tra Kết Nối (Ping)"**: Hệ thống đo tốc độ kết nối (ví dụ: *"Kết nối thành công! Ping: 42ms"*).
5. Bấm nút **"Lưu Thông Tin"**.
6. Bấm nút **"Kích Hoạt Ngay"** ➔ Chọn **"1. Tải dữ liệu từ CSDL này về máy (Khuyến nghị)"** để tránh trộn dữ liệu cũ, rồi bấm xác nhận để hệ thống kết nối tức thì!

---

## 9. Tiện Ích Thử Nghiệm An Toàn (Test Sandbox)

- **Thanh cảnh báo viền vàng `[CHẾ ĐỘ TEST SQL]`**: Xuất hiện ở đầu tất cả màn hình (POS, Bếp, Admin) giúp nhân viên luôn biết rõ đang trong môi trường thử nghiệm.
- **Nút "📋 1-Click Sao Chép Sang Test"**: Giúp anh/chị lấy toàn bộ menu bánh và công thức BOM hiện có ở CSDL Chính đổ sang CSDL Test trong 1 giây để tha hồ thử nghiệm mà không mất công gõ lại.
- **Nút "Về CSDL Chính (Vận Hành)"**: Bấm 1 click là hệ thống tự động đưa ứng dụng quay về bán hàng thật 100% nguyên vẹn.
