# scripts/generate_docx_guide.py
# -*- coding: utf-8 -*-
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

doc = docx.Document()

# Thiết lập lề trang
for section in doc.sections:
    section.top_margin = Inches(0.75)
    section.bottom_margin = Inches(0.75)
    section.left_margin = Inches(0.85)
    section.right_margin = Inches(0.85)

# Màu sắc thương hiệu
COLOR_PRIMARY = RGBColor(16, 110, 70)   # Emerald Dark
COLOR_SECONDARY = RGBColor(180, 83, 9)  # Amber Dark
COLOR_TEXT = RGBColor(33, 37, 41)
COLOR_MUTED = RGBColor(108, 117, 125)

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def add_callout(doc, text, title="LƯU Ý QUAN TRỌNG", fill_hex="FEF3C7", border_hex="F59E0B"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, fill_hex)
    cell.width = Inches(6.8)
    
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'<w:left w:val="single" w:sz="24" w:space="0" w:color="{border_hex}"/>'
        f'<w:top w:val="none"/><w:right w:val="none"/><w:bottom w:val="none"/>'
        f'</w:tcBorders>'
    )
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(2)
    run_title = p.add_run(f'📌 {title}\n')
    run_title.bold = True
    run_title.font.size = Pt(10.5)
    run_title.font.color.rgb = RGBColor(146, 64, 14)
    
    run_body = p.add_run(text)
    run_body.font.size = Pt(10)
    run_body.font.color.rgb = RGBColor(60, 60, 60)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

# ==================== TRANG BÌA & TIÊU ĐỀ ====================
p_title = doc.add_paragraph()
p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
p_title.paragraph_format.space_before = Pt(8)
p_title.paragraph_format.space_after = Pt(3)
run_title = p_title.add_run('CẨM NANG HƯỚNG DẪN KỸ THUẬT TOÀN DIỆN')
run_title.font.size = Pt(12)
run_title.font.color.rgb = COLOR_SECONDARY
run_title.bold = True

p_main_title = doc.add_paragraph()
p_main_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
p_main_title.paragraph_format.space_after = Pt(6)
run_main = p_main_title.add_run('KHỞI TẠO CƠ SỞ DỮ LIỆU SQL & KHO LƯU TRỮ ẢNH\nTRÊN NỀN TẢNG SUPABASE')
run_main.font.size = Pt(18)
run_main.bold = True
run_main.font.color.rgb = COLOR_PRIMARY

p_sub = doc.add_paragraph()
p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
p_sub.paragraph_format.space_after = Pt(16)
run_sub = p_sub.add_run('Hệ Thống Quản Lý Tiệm Bánh Bakery ERP & POS Mini\nCấu hình CSDL Vận Hành (Production) & CSDL Thử Nghiệm (Test Sandbox)\nPhiên bản cập nhật đầy đủ: Tháng 09/2026')
run_sub.font.size = Pt(10)
run_sub.font.color.rgb = COLOR_MUTED
run_sub.italic = True

p_hr = doc.add_paragraph()
p_hr.paragraph_format.space_after = Pt(12)
p_hr_border = parse_xml(f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="12" w:space="1" w:color="10B981"/></w:pBdr>')
p_hr._p.get_or_add_pPr().append(p_hr_border)

# ==================== PHẦN 1: MỤC TIÊU ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('1. Tổng Quan & Khi Nào Cần Tạo CSDL Mới?')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Hệ thống tiệm bánh cần một cơ sở dữ liệu đám mây PostgreSQL và một kho lưu trữ hình ảnh (Supabase Storage). Anh/chị sẽ cần khởi tạo CSDL mới trong các trường hợp sau:\n').font.size = Pt(10.5)

p_b1 = doc.add_paragraph(style='List Bullet')
r1 = p_b1.add_run('Tạo CSDL Thử Nghiệm (Testing / Sandbox): ')
r1.bold = True
p_b1.add_run('Dùng để nhân viên/quản lý tạo đơn hàng ảo, thử nghiệm công thức bánh mới, hoặc tái hiện và fix lỗi mà không làm ảnh hưởng hay sai lệch doanh thu của CSDL Chính.')

p_b2 = doc.add_paragraph(style='List Bullet')
r2 = p_b2.add_run('Di chuyển sang CSDL Chính mới (Migration): ')
r2.bold = True
p_b2.add_run('Dùng khi tài khoản Supabase cũ bị đầy gói cước Egress, hết hạn hoặc tiệm muốn làm mới dữ liệu từ đầu.')

p_b3 = doc.add_paragraph(style='List Bullet')
r3 = p_b3.add_run('Mở thêm chi nhánh mới: ')
r3.bold = True
p_b3.add_run('Mỗi chi nhánh có thể sở hữu một database riêng biệt, không bị lẫn lộn đơn hàng và kho.')

add_callout(doc,
    '• Chi phí: Hoàn toàn MIỄN PHÍ ($0/tháng) với gói Free Tier của Supabase.\n• Dung lượng: Bao gồm 500 MB Database PostgreSQL và 1 GB Storage lưu ảnh (đủ chứa hơn 10.000 ảnh bánh & hóa đơn).\n• Thời gian thực hiện: Chỉ từ 3 đến 5 phút.',
    'GÓI DỊCH VỤ MIỄN PHÍ CỦA SUPABASE', 'ECFDF5', '10B981')

# ==================== PHẦN 2: BƯỚC 1 ĐĂNG KÝ ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('2. Bước 1: Đăng Ký / Đăng Nhập Supabase')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('1. Truy cập vào trang chủ Supabase: ').font.size = Pt(10.5)
r_url = p.add_run('https://supabase.com\n')
r_url.bold = True
r_url.font.color.rgb = RGBColor(37, 99, 235)
p.add_run('2. Bấm vào nút ').font.size = Pt(10.5)
p.add_run('"Sign In"').bold = True
p.add_run(' (Đăng nhập) hoặc ').font.size = Pt(10.5)
p.add_run('"Start your project"').bold = True
p.add_run(' ở góc trên bên phải.\n3. Đăng nhập nhanh bằng tài khoản ').font.size = Pt(10.5)
p.add_run('GitHub').bold = True
p.add_run(' hoặc tài khoản ').font.size = Pt(10.5)
p.add_run('Google / Email').bold = True
p.add_run(' của anh/chị.')

# ==================== PHẦN 3: BƯỚC 2 TẠO DỰ ÁN ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('3. Bước 2: Tạo Dự Án Mới (New Project)')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('1. Tại màn hình Dashboard, bấm nút ').font.size = Pt(10.5)
p.add_run('"New project"').bold = True
p.add_run(' (màu xanh lá).\n2. Điền thông tin dự án theo bảng hướng dẫn sau:\n').font.size = Pt(10.5)

tbl = doc.add_table(rows=5, cols=2)
tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
headers = ['Trường thông tin', 'Hướng dẫn chi tiết']
for i, h in enumerate(headers):
    cell = tbl.cell(0, i)
    cell.paragraphs[0].add_run(h).bold = True
    set_cell_background(cell, 'E2E8F0')

rows_data = [
    ('Name (Tên dự án)', 'Đặt tên gợi nhớ. Ví dụ: "bakery-pos-test" (nếu làm database test) hoặc "bakery-pos-main" (nếu làm database chính).'),
    ('Database Password', 'Nhập mật khẩu quản trị DB (tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số). Hãy ghi lại mật khẩu này.'),
    ('Region (Khu vực máy chủ)', 'CỰC KỲ QUAN TRỌNG: Chọn "Singapore (ap-southeast-1)" để máy chủ gần Việt Nam nhất, tốc độ phản hồi cực nhanh (~30-50ms).'),
    ('Pricing Plan', 'Chọn "Free" ($0/month - Miễn phí 100%).')
]

for row_idx, data in enumerate(rows_data, start=1):
    c0 = tbl.cell(row_idx, 0)
    c1 = tbl.cell(row_idx, 1)
    c0.paragraphs[0].add_run(data[0]).bold = True
    c1.paragraphs[0].add_run(data[1])
    if row_idx % 2 == 1:
        set_cell_background(c0, 'F8FAFC')
        set_cell_background(c1, 'F8FAFC')

p_after = doc.add_paragraph()
p_after.paragraph_format.space_before = Pt(6)
p_after.add_run('3. Bấm nút ').font.size = Pt(10.5)
p_after.add_run('"Create new project"').bold = True
p_after.add_run('. Chờ khoảng 1 – 2 phút để Supabase chuẩn bị máy chủ.')

# ==================== PHẦN 4: LẤY URL & KEY ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('4. Bước 3: Lấy Thông Tin Kết Nối (Project URL & API Key)')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('1. Trên thanh menu bên trái của Supabase, bấm vào biểu tượng bánh răng ').font.size = Pt(10.5)
p.add_run('"Project Settings"').bold = True
p.add_run(' ở góc dưới cùng bên trái.\n2. Chọn mục ').font.size = Pt(10.5)
p.add_run('"API"').bold = True
p.add_run(' trong danh sách cài đặt.\n3. Sao chép 2 chuỗi ký tự sau:\n').font.size = Pt(10.5)
p.add_run('   • Project URL: ').bold = True
p.add_run('Có dạng https://abcdefghijklm.supabase.co -> Bấm nút Copy.\n')
p.add_run('   • Project API Keys: ').bold = True
p.add_run('Tìm dòng có nhãn ').font.size = Pt(10.5)
p.add_run('"anon" "public"').bold = True
p.add_run(' -> Bấm nút Copy.\n')

add_callout(doc,
    'Tuyệt đối KHÔNG chia sẻ hoặc copy nhầm khóa "service_role (secret)". Chỉ dùng duy nhất khóa "anon public" cho ứng dụng bán hàng POS để đảm bảo an toàn tuyệt đối.',
    'BẢO MẬT API KEY', 'FEE2E2', 'EF4444')

# ==================== PHẦN 5: DANH SÁCH CÁC FILE SQL CẦN CHẠY ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('5. Bước 4: Danh Sách Các File SQL Cần Chạy')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Hệ thống phần mềm tiệm bánh bao gồm tổng cộng ').font.size = Pt(10.5)
p.add_run('16 file migration SQL').bold = True
p.add_run(' (nằm trong thư mục ').font.size = Pt(10.5)
p.add_run('supabase/migrations/').bold = True
p.add_run('). Dưới đây là danh sách chi tiết và ý nghĩa của từng file:\n').font.size = Pt(10.5)

tbl_sql = doc.add_table(rows=17, cols=3)
tbl_sql.alignment = WD_TABLE_ALIGNMENT.CENTER
sql_headers = ['STT / Tên File Migration', 'Nội Dung & Chức Năng', 'Bắt Buộc?']
for i, h in enumerate(sql_headers):
    cell = tbl_sql.cell(0, i)
    cell.paragraphs[0].add_run(h).bold = True
    set_cell_background(cell, 'E2E8F0')

sql_files_info = [
    ('00001_create_profiles_roles.sql', 'Tạo bảng tài khoản người dùng, vai trò phân quyền (admin, kitchen, staff).', 'Có'),
    ('00002_create_stores_settings.sql', 'Tạo bảng thông tin tiệm bánh, cài đặt in hóa đơn và thương hiệu cửa hàng.', 'Có'),
    ('00003_create_ingredients.sql', 'Tạo bảng danh mục nguyên vật liệu làm bánh, tồn kho và mức cảnh báo sắp hết.', 'Có'),
    ('00004_create_recipes.sql', 'Tạo bảng công thức sản xuất bánh (BOM), định mức nguyên liệu và tỷ lệ hao hụt.', 'Có'),
    ('00005_create_products.sql', 'Tạo bảng danh mục sản phẩm/bánh bán lẻ tại quầy, phân loại nhóm bánh và giá bán.', 'Có'),
    ('00006_create_shifts_orders.sql', 'Tạo bảng ca làm việc thu ngân, đơn hàng bán lẻ (POS) và đơn đặt bánh trước (Preorder).', 'Có'),
    ('00007_create_expenses_cashflow.sql', 'Tạo bảng chi phí vận hành (OPEX), sổ thu chi tiền mặt (111) và ngân hàng VietQR (112).', 'Có'),
    ('00008_create_accounting_summary.sql', 'Tạo bảng tổng hợp chốt sổ kế toán ngày, tháng và lịch sử kiểm kê định kỳ.', 'Có'),
    ('00009_create_functions_triggers.sql', 'Tạo các hàm Trigger tự động trừ kho nguyên liệu khi bán bánh, tính giá vốn bình quân (WAC).', 'Có'),
    ('00010_create_views.sql', 'Tạo các View hiển thị an toàn che giấu thông tin giá vốn (COGS) đối với nhân viên.', 'Có'),
    ('00011_create_rls_policies.sql', 'Thiết lập chính sách bảo mật theo từng dòng dữ liệu (Row Level Security - RLS).', 'Có'),
    ('00012_fix_cross_device_sync.sql', 'Bổ sung cơ chế đồng bộ Realtime tức thì đa thiết bị giữa máy POS và màn hình Bếp.', 'Có'),
    ('00013_fix_products_sync.sql', 'Tối ưu hóa đồng bộ danh mục sản phẩm bánh nhanh chóng giữa các màn hình.', 'Có'),
    ('00014_add_resale_goods_and_cake_costing.sql', 'Bổ sung tính năng định giá bánh kem thiết kế riêng và quản lý hàng thương mại bán kèm.', 'Có'),
    ('00015_enable_rls_secure_policies.sql', 'Khóa bảo mật RLS toàn diện 100% các bảng và cố định search_path để triệt tiêu lỗi Advisor.', 'Có'),
    ('00016_create_storage_buckets.sql', 'Tạo kho lưu trữ ảnh Supabase Storage (bakery-images & product-images) và cấp quyền upload.', 'CỰC KỲ QUAN TRỌNG')
]

for idx, item in enumerate(sql_files_info, start=1):
    c0 = tbl_sql.cell(idx, 0)
    c1 = tbl_sql.cell(idx, 1)
    c2 = tbl_sql.cell(idx, 2)
    c0.paragraphs[0].add_run(item[0]).bold = True
    c0.paragraphs[0].runs[0].font.size = Pt(9.5)
    c1.paragraphs[0].add_run(item[1]).font.size = Pt(9.5)
    c2.paragraphs[0].add_run(item[2]).font.size = Pt(9.5)
    if 'QUAN TRỌNG' in item[2]:
        c2.paragraphs[0].runs[0].bold = True
        c2.paragraphs[0].runs[0].font.color.rgb = RGBColor(220, 38, 38)
    if idx % 2 == 1:
        set_cell_background(c0, 'F8FAFC')
        set_cell_background(c1, 'F8FAFC')
        set_cell_background(c2, 'F8FAFC')

# ==================== PHẦN 6: HƯỚNG DẪN CHẠY SQL ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('6. Bước 5: Cách Thực Thi SQL Trên Supabase')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Anh/chị có thể lựa chọn 1 trong 2 cách sau để chạy SQL:\n').font.size = Pt(10.5)

p_m1 = doc.add_paragraph()
r_m1 = p_m1.add_run('CÁCH 1 (KHUYẾN NGHỊ - NHANH NHẤT 1-CLICK):\n')
r_m1.bold = True
r_m1.font.color.rgb = COLOR_PRIMARY
p_m1.add_run('Hệ thống đã tự động gộp toàn bộ 16 file trên vào DUY NHẤT 1 FILE TỔNG HỢP: ').font.size = Pt(10.5)
p_m1.add_run('supabase/schema_full_init.sql').bold = True
p_m1.add_run(' (đã bao gồm toàn bộ bảng, hàm, view và tạo kho lưu trữ ảnh Storage!).\n').font.size = Pt(10.5)
p_m1.add_run('• Bước 1: Mở Supabase, bấm vào menu ').font.size = Pt(10.5)
p_m1.add_run('SQL Editor').bold = True
p_m1.add_run(' (icon ').font.size = Pt(10.5)
p_m1.add_run('>_').bold = True
p_m1.add_run(') bên trái màn hình.\n• Bước 2: Bấm nút ').font.size = Pt(10.5)
p_m1.add_run('"+ New query"').bold = True
p_m1.add_run(' để mở trang soạn thảo mới.\n• Bước 3: Mở file ').font.size = Pt(10.5)
p_m1.add_run('supabase/schema_full_init.sql').bold = True
p_m1.add_run(', nhấn ').font.size = Pt(10.5)
p_m1.add_run('Ctrl + A').bold = True
p_m1.add_run(' copy toàn bộ và ').font.size = Pt(10.5)
p_m1.add_run('Dán (Paste)').bold = True
p_m1.add_run(' vào ô SQL Editor.\n• Bước 4: Bấm nút ').font.size = Pt(10.5)
p_m1.add_run('\"Run\"').bold = True
p_m1.add_run(' màu xanh lá (hoặc bấm phím ').font.size = Pt(10.5)
p_m1.add_run('Ctrl + Enter').bold = True
p_m1.add_run(').\n• Bước 5: Chờ khoảng 3 – 5 giây cho đến khi hiện thông báo ').font.size = Pt(10.5)
p_m1.add_run('"Success. No rows returned"').bold = True
p_m1.add_run(' là CSDL và Kho ảnh đã hoàn tất 100%!')

p_m2 = doc.add_paragraph()
r_m2 = p_m2.add_run('\nCÁCH 2 (CHẠY THỦ CÔNG TỪNG FILE):\n')
r_m2.bold = True
p_m2.add_run('Nếu muốn kiểm tra từng phần, anh/chị mở từng file trong thư mục ').font.size = Pt(10.5)
p_m2.add_run('supabase/migrations/').bold = True
p_m2.add_run(' và copy dán vào SQL Editor chạy lần lượt đúng theo thứ tự từ ').font.size = Pt(10.5)
p_m2.add_run('00001 -> 00016').bold = True
p_m2.add_run(' (tuyệt đối không chạy nhảy cóc vì các bảng có quan hệ khóa ngoại với nhau).')

# ==================== PHẦN 7: TẠO KHO ẢNH STORAGE BẰNG GIAO DIỆN & SQL ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('7. Chi Tiết: Tạo Kho Lưu Trữ Ảnh Riêng 1 GB (Supabase Storage Bucket)')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('💡 TẠI SAO PHẢI LƯU ẢNH VÀO KHO STORAGE 1 GB MÀ KHÔNG LƯU VÀO BẢNG SQL?\n').bold = True
p.add_run('Nền tảng Supabase gói Miễn phí (Free Tier) cung cấp 2 phân vùng bộ nhớ độc lập:\n').font.size = Pt(10.5)
p.add_run('1. Phân vùng CSDL PostgreSQL (500 MB): ').bold = True
p.add_run('Chuyên lưu dữ liệu chữ và số (đơn hàng, công thức bánh, tồn kho, khách hàng).\n').font.size = Pt(10.5)
p.add_run('2. Phân vùng Kho Tệp Tin Storage (1.000 MB / 1 GB): ').bold = True
p.add_run('Chuyên lưu trữ hình ảnh (ảnh chụp bánh kem thực tế, ảnh mẫu khách gửi, ảnh chứng từ bill chuyển khoản, logo tiệm).\n\n').font.size = Pt(10.5)

add_callout(
    doc,
    'Tuyệt đối KHÔNG lưu ảnh trực tiếp dạng Base64 vào bảng SQL, vì mỗi ảnh nặng 1 - 2 MB sẽ làm CSDL 500MB bị đầy rất nhanh!\n'
    'Bằng cách đưa ảnh vào Kho Storage 1 GB (chứa hơn 10.000 - 20.000 ảnh), bảng SQL chỉ cần lưu link URL ngắn (~100 bytes), giúp CSDL chạy siêu nhẹ và không bao giờ quá tải.',
    title='QUY TẮC TIẾT KIỆM DUNG LƯỢNG CỐT LÕI',
    fill_hex='ECFDF5',
    border_hex='10B981'
)

p_sql_title = doc.add_paragraph()
r_sql_t = p_sql_title.add_run('🌟 CÁCH 1: Chạy Bằng Lệnh SQL Tự Động (1-Click trong SQL Editor)\n')
r_sql_t.bold = True
r_sql_t.font.color.rgb = COLOR_PRIMARY
p_sql_title.add_run('Đoạn lệnh SQL dưới đây sẽ tự động tạo Bucket "bakery-images", thiết lập giới hạn 5MB/ảnh và cấp quyền Public Read & Upload cho toàn bộ máy POS và Bếp:\n').font.size = Pt(10.5)

# Bảng hiển thị code SQL tạo Storage
sql_code_text = (
    "-- 1. Kích hoạt tiện ích mở rộng uuid\n"
    "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";\n\n"
    "-- 2. Tạo Bucket 'bakery-images' (Công khai, giới hạn 5MB/ảnh)\n"
    "INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\n"
    "VALUES (\n"
    "  'bakery-images', 'bakery-images', true, 5242880,\n"
    "  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']\n"
    ")\n"
    "ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;\n\n"
    "-- 3. Cấp quyền XEM CÔNG KHAI và TẢI ẢNH LÊN cho mọi thiết bị\n"
    "ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;\n\n"
    "CREATE POLICY \"Public Access Bakery Images\" ON storage.objects\n"
    "FOR SELECT USING (bucket_id IN ('bakery-images', 'product-images'));\n\n"
    "CREATE POLICY \"Allow Upload Bakery Images\" ON storage.objects\n"
    "FOR INSERT WITH CHECK (bucket_id IN ('bakery-images', 'product-images'));\n\n"
    "CREATE POLICY \"Allow Delete Bakery Images\" ON storage.objects\n"
    "FOR DELETE USING (bucket_id IN ('bakery-images', 'product-images'));"
)

tbl_sql = doc.add_table(rows=1, cols=1)
tbl_sql.alignment = WD_TABLE_ALIGNMENT.CENTER
c_sql = tbl_sql.cell(0, 0)
set_cell_background(c_sql, 'F1F5F9')
c_sql.width = Inches(6.8)
p_code = c_sql.paragraphs[0]
p_code.paragraph_format.space_before = Pt(4)
p_code.paragraph_format.space_after = Pt(4)
r_code = p_code.add_run(sql_code_text)
r_code.font.name = 'Consolas'
r_code.font.size = Pt(8.5)
r_code.font.color.rgb = RGBColor(15, 23, 42)

doc.add_paragraph().paragraph_format.space_after = Pt(4)

p_extra = doc.add_paragraph()
r_extra_t = p_extra.add_run('🖱️ CÁCH 2: Tạo Bằng Tay Trên Giao Diện Supabase (Thao Tác Chuột)\n')
r_extra_t.bold = True
r_extra_t.font.color.rgb = COLOR_SECONDARY
p_extra.add_run('1. Trên menu bên trái của Supabase, bấm vào mục ').font.size = Pt(10.5)
p_extra.add_run('Storage').bold = True
p_extra.add_run(' (biểu tượng chiếc xô / thùng chứa).\n2. Bấm nút ').font.size = Pt(10.5)
p_extra.add_run('\"New bucket\"').bold = True
p_extra.add_run(' ở góc phải màn hình.\n3. Nhập chính xác tên bucket: ').font.size = Pt(10.5)
p_extra.add_run('bakery-images').bold = True
p_extra.add_run(' (chính xác từng chữ thường, có dấu gạch ngang).\n4. ').font.size = Pt(10.5)
p_extra.add_run('BẬT CÔNG TẮC: \"Public bucket\"').bold = True
p_extra.add_run(' sang màu xanh lá (bắt buộc bật để ảnh có thể hiển thị trên màn hình POS và điện thoại).\n5. Mục ').font.size = Pt(10.5)
p_extra.add_run('File size limit:').bold = True
p_extra.add_run(' Nhập 5MB. Bấm nút ').font.size = Pt(10.5)
p_extra.add_run('\"Save\"').bold = True
p_extra.add_run(' là hoàn thành!')

# ==================== PHẦN 8: BƯỚC KẾT NỐI VÀO PHẦN MỀM ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('8. Bước 6: Kết Nối Vào Ứng Dụng Bakery POS')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('1. Mở phần mềm Bakery POS trên trình duyệt, đăng nhập tài khoản ').font.size = Pt(10.5)
p.add_run('Admin').bold = True
p.add_run('.\n2. Chọn tab ').font.size = Pt(10.5)
p.add_run('"CSDL & Sao Lưu SQL"').bold = True
p.add_run(' -> Chọn mục ').font.size = Pt(10.5)
p.add_run('"2. Cài Đặt Cho Online (Cloud SQL)"').bold = True
p.add_run('.\n3. Tại khối ').font.size = Pt(10.5)
p.add_run('"Quản Trị Đa CSDL SQL: Chính & Thử Nghiệm"').bold = True
p.add_run(':\n   • Chọn thẻ ').font.size = Pt(10.5)
p.add_run('🟡 CSDL Thử Nghiệm (Test & Fix Lỗi)').bold = True
p.add_run(' (hoặc thẻ CSDL Chính nếu đang thay thế CSDL chính).\n')
p.add_run('   • Ô số 1: Dán ').font.size = Pt(10.5)
p.add_run('Project URL').bold = True
p.add_run(' vừa lấy ở Bước 3.\n')
p.add_run('   • Ô số 2: Dán ').font.size = Pt(10.5)
p.add_run('Anon API Key').bold = True
p.add_run(' vừa lấy ở Bước 3.\n')
p.add_run('4. Bấm nút ').font.size = Pt(10.5)
p.add_run('"🔍 Kiểm Tra Kết Nối (Ping)"').bold = True
p.add_run(': Hệ thống sẽ đo tốc độ kết nối (ví dụ: "Kết nối thành công! Ping: 42ms").\n5. Bấm nút ').font.size = Pt(10.5)
p.add_run('"Lưu Thông Tin"').bold = True
p.add_run('.\n6. Bấm nút ').font.size = Pt(10.5)
p.add_run('"Kích Hoạt Ngay"').bold = True
p.add_run(' -> Chọn ').font.size = Pt(10.5)
p.add_run('"1. Tải dữ liệu từ CSDL này về máy (Khuyến nghị)"').bold = True
p.add_run(' để tránh trộn dữ liệu cũ, rồi bấm xác nhận để hệ thống kết nối tức thì!')

# ==================== PHẦN 9: TIỆN ÍCH CHẾ ĐỘ TEST ====================
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('9. Tiện Ích Thử Nghiệm An Toàn (Test Sandbox)')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Khi đã kích hoạt CSDL Thử Nghiệm:\n').font.size = Pt(10.5)
p.add_run('• ').font.size = Pt(10.5)
p.add_run('Thanh cảnh báo viền vàng [CHẾ ĐỘ TEST SQL]').bold = True
p.add_run(' xuất hiện ở đầu tất cả màn hình (POS, Bếp, Admin) giúp nhân viên luôn biết rõ đang trong môi trường thử nghiệm.\n')
p.add_run('• Nút ').font.size = Pt(10.5)
p.add_run('"📋 1-Click Sao Chép Sang Test"').bold = True
p.add_run(': Giúp anh/chị lấy toàn bộ menu bánh và công thức BOM hiện có ở CSDL Chính đổ sang CSDL Test trong 1 giây để tha hồ thử nghiệm mà không mất công gõ lại.\n')
p.add_run('• Nút ').font.size = Pt(10.5)
p.add_run('"Về CSDL Chính (Vận Hành)"').bold = True
p.add_run(': Bấm 1 click là hệ thống tự động đưa ứng dụng quay về bán hàng thật 100% nguyên vẹn.\n')

doc.save('HUONG_DAN_TAO_SQL_SUPABASE_MOI.docx')
print('Successfully generated comprehensive HUONG_DAN_TAO_SQL_SUPABASE_MOI.docx!')
