# HƯỚNG DẪN CHI TIẾT TỪNG BƯỚC: KHỞI TẠO CƠ SỞ DỮ LIỆU SQL MỚI TRÊN SUPABASE

> **Áp dụng:** Cấu hình CSDL Chính (Vận Hành) & CSDL Thử Nghiệm (Test Sandbox)  
> **Dự án:** Hệ Thống Quản Lý Tiệm Bánh Bakery ERP & POS Mini  
> **Phiên bản:** Tháng 09/2026

---

## 1. Mục Tiêu & Chuẩn Bị

Tài liệu này hướng dẫn chi tiết từng bước để tạo một Cơ Sở Dữ Liệu PostgreSQL đám mây hoàn toàn mới trên nền tảng **Supabase (Miễn phí 100%)**. 

CSDL mới này có thể sử dụng cho 2 mục đích:
1. **CSDL Thử Nghiệm (Test & Fix Lỗi)**: Tạo môi trường độc lập để thử công thức bánh, tạo đơn hàng ảo và kiểm tra lỗi mà không sợ ảnh hưởng đến số liệu bán hàng thật của tiệm.
2. **CSDL Chính Mới (Production)**: Dùng khi muốn chuyển nhà sang tài khoản Supabase mới, mở thêm chi nhánh độc lập hoặc làm mới dữ liệu từ đầu.

> [!NOTE]
> **Thông tin gói miễn phí (Free Tier)**:
> - Cung cấp **500 MB Database** và **1 GB Storage** lưu trữ ảnh, hoàn toàn đủ cho tiệm bánh vận hành mượt mà nhiều năm.
> - Toàn bộ quá trình thao tác chỉ mất khoảng **3 đến 5 phút**.

---

## 2. Bước 1: Đăng Ký / Đăng Nhập Supabase

1. Mở trình duyệt web và truy cập địa chỉ: **[https://supabase.com](https://supabase.com)**
2. Bấm vào nút **"Sign In"** hoặc **"Start your project"** ở góc trên bên phải màn hình.
3. Đăng nhập bằng tài khoản **GitHub** hoặc tài khoản **Google / Email**.

---

## 3. Bước 2: Tạo Dự Án Mới (New Project)

Sau khi đăng nhập vào Supabase Dashboard:
1. Bấm vào nút **"New project"** (màu xanh lá cây).
2. Điền các trường thông tin cơ bản:

| Trường thông tin | Hướng dẫn nhập liệu |
|---|---|
| **Name (Tên dự án)** | Đặt tên gợi nhớ, ví dụ: `bakery-pos-test` (nếu làm DB test) hoặc `bakery-pos-main` (nếu làm DB chính). |
| **Database Password** | Nhập mật khẩu quản trị DB (ít nhất 8 ký tự gồm chữ, số và ký tự đặc biệt). *Hãy lưu lại mật khẩu này cẩn thận.* |
| **Region (Khu vực máy chủ)** | **QUAN TRỌNG:** Chọn vùng **"Singapore (ap-southeast-1)"** để máy chủ đặt gần Việt Nam nhất, giúp tốc độ phản hồi cực nhanh (~30-50ms). |
| **Pricing Plan** | Chọn **"Free"** ($0/month - Miễn phí 100%). |

3. Bấm nút **"Create new project"** ở góc dưới.
4. Chờ khoảng **1 – 2 phút** để hệ thống đám mây Supabase tự động thiết lập và khởi chạy máy chủ PostgreSQL.

---

## 4. Bước 3: Lấy Thông Tin Kết Nối (Project URL & API Key)

Để phần mềm kết nối được với CSDL mới, anh cần lấy 2 thông tin:
1. Trên thanh menu bên trái màn hình Supabase, bấm vào biểu tượng bánh răng **"Project Settings"** (nằm ở góc dưới cùng bên trái).
2. Trong danh mục bên cạnh, chọn mục **"API"** (hoặc Data API).
3. Sao chép 2 thông tin sau:
   - **a. Project URL**: Có dạng `https://abcdefghijklm.supabase.co` ➔ Bấm nút **Copy**.
   - **b. Project API Keys**: Tìm đúng dòng có nhãn **`anon` `public`** (hoặc publishable key) ➔ Bấm nút **Copy**.

> [!CAUTION]
> **Cảnh báo bảo mật:**
> Tuyệt đối **KHÔNG** dùng khóa `service_role (secret)` cho ứng dụng. Chỉ sao chép khóa **`anon public`** để đảm bảo an toàn theo đúng chuẩn bảo mật Supabase.

---

## 5. Bước 4: Khởi Tạo Cấu Trúc Bảng (Chạy Script SQL Master)

Để CSDL mới có sẵn 100% bảng dữ liệu (Menu bánh, Kho nguyên liệu, Đơn hàng, Sổ quỹ, BOM bánh, Phân quyền bảo mật RLS):
1. Trên menu bên trái của Supabase, bấm vào biểu tượng **SQL Editor** (icon `>_`).
2. Bấm vào nút **"+ New query"** để mở khung soạn thảo SQL mới.
3. Mở file mã nguồn tổng hợp: **`supabase/schema_full_init.sql`** (đã tạo sẵn trong thư mục dự án).
4. Nhấn `Ctrl + A` để sao chép toàn bộ nội dung file này, rồi **Dán (Paste)** vào ô SQL Editor trên Supabase.
5. Bấm nút **"Run"** (màu xanh lá cây góc dưới bên phải) hoặc nhấn phím tắt **`Ctrl + Enter`**.
6. Chờ khoảng 3 – 5 giây cho đến khi hệ thống báo **"Success. No rows returned"** là cơ sở dữ liệu đã sẵn sàng 100%!

---

## 6. Bước 5: Điền Thông Tin Kết Nối Vào Ứng Dụng Bakery POS

1. Mở phần mềm Bakery POS trên trình duyệt, đăng nhập bằng tài khoản **Admin**.
2. Chọn tab **"CSDL & Sao Lưu SQL"** ➔ Chọn mục **"2. Cài Đặt Cho Online (Cloud SQL)"**.
3. Tại khối **"Quản Trị Đa CSDL SQL: Chính & Thử Nghiệm"**:
   - Bấm chọn thẻ **🟡 CSDL Thử Nghiệm (Test & Fix Lỗi)** (hoặc thẻ CSDL Chính nếu anh đang thay thế CSDL chính).
   - **Ô số 1**: Dán **Project URL** vừa copy ở Bước 3.
   - **Ô số 2**: Dán **Anon API Key** vừa copy ở Bước 3.
4. Bấm nút **"🔍 Kiểm Tra Kết Nối (Ping)"**: Hệ thống sẽ đo độ trễ mạng thực tế (ví dụ: *"Kết nối thành công! Ping: 42ms"*).
5. Bấm nút **"Lưu Thông Tin"**.
6. Bấm nút **"Kích Hoạt Ngay"** ➔ Chọn **"1. Tải dữ liệu từ CSDL này về máy (Khuyến nghị)"** để tránh bị trộn lẫn dữ liệu cũ, rồi bấm xác nhận để hệ thống kết nối tức thì!

---

## 7. Cách Thử Nghiệm An Toàn Khi Có CSDL Test

- Trên đỉnh màn hình POS, Bếp và Admin sẽ luôn có **Thanh cảnh báo viền vàng: [CHẾ ĐỘ TEST SQL]** để nhân viên không bị nhầm lẫn với bán hàng thật.
- Muốn có sẵn danh mục bánh và công thức hiện tại của tiệm để test? Chỉ cần bấm nút: **"📋 1-Click Sao Chép Sang Test"**. Hệ thống tự động đổ toàn bộ menu sang CSDL Test trong 1 giây.
- Khi test xong, chỉ cần bấm nút **"Về CSDL Chính (Vận Hành)"** ngay trên thanh cảnh báo là hệ thống tự động quay về bán hàng thật 100% nguyên vẹn.
