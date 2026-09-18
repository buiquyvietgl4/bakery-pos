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
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)
    section.left_margin = Inches(0.9)
    section.right_margin = Inches(0.9)

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
    cell.width = Inches(6.7)
    
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

# Header Title
p_title = doc.add_paragraph()
p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
p_title.paragraph_format.space_before = Pt(12)
p_title.paragraph_format.space_after = Pt(4)
run_title = p_title.add_run('HƯỚNG DẪN CHI TIẾT TỪNG BƯỚC')
run_title.font.size = Pt(13)
run_title.font.color.rgb = COLOR_SECONDARY
run_title.bold = True

p_main_title = doc.add_paragraph()
p_main_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
p_main_title.paragraph_format.space_after = Pt(8)
run_main = p_main_title.add_run('KHỞI TẠO CƠ SỞ DỮ LIỆU SQL MỚI\nTRÊN SUPABASE')
run_main.font.size = Pt(20)
run_main.bold = True
run_main.font.color.rgb = COLOR_PRIMARY

p_sub = doc.add_paragraph()
p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
p_sub.paragraph_format.space_after = Pt(18)
run_sub = p_sub.add_run('Áp dụng: Cấu hình CSDL Chính (Vận Hành) & CSDL Thử Nghiệm (Test Sandbox)\nHệ Thống Quản Lý Tiệm Bánh Bakery ERP & POS Mini\nPhiên bản cập nhật: Tháng 09/2026')
run_sub.font.size = Pt(10)
run_sub.font.color.rgb = COLOR_MUTED
run_sub.italic = True

# Thước kẻ phân cách
p_hr = doc.add_paragraph()
p_hr.paragraph_format.space_after = Pt(14)
p_hr_border = parse_xml(f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="12" w:space="1" w:color="10B981"/></w:pBdr>')
p_hr._p.get_or_add_pPr().append(p_hr_border)

# 1. MỤC TIÊU & CHUẨN BỊ
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('1. Mục Tiêu & Chuẩn Bị')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Tài liệu này hướng dẫn quý anh/chị từng bước chi tiết để tự tạo một Cơ Sở Dữ Liệu PostgreSQL đám mây hoàn toàn mới trên nền tảng ').font.size = Pt(10.5)
r_sb = p.add_run('Supabase (Miễn phí 100%)')
r_sb.bold = True
p.add_run('. CSDL mới này có thể sử dụng cho 2 mục đích:\n').font.size = Pt(10.5)

p_b1 = doc.add_paragraph(style='List Bullet')
r1 = p_b1.add_run('CSDL Thử Nghiệm (Test & Fix Lỗi): ')
r1.bold = True
p_b1.add_run('Tạo môi trường độc lập để thử công thức bánh, tạo đơn hàng ảo và kiểm tra lỗi mà không sợ ảnh hưởng đến số liệu bán hàng thật của tiệm.')

p_b2 = doc.add_paragraph(style='List Bullet')
r2 = p_b2.add_run('CSDL Chính Mới (Production): ')
r2.bold = True
p_b2.add_run('Dùng khi muốn chuyển nhà sang tài khoản Supabase mới, mở thêm chi nhánh độc lập hoặc làm mới dữ liệu từ đầu.')

add_callout(doc, 
    '• Gói Supabase Miễn Phí (Free Tier) cung cấp 500 MB Database và 1 GB Storage lưu trữ ảnh, hoàn toàn đủ cho tiệm bánh vận hành mượt mà nhiều năm.\n• Toàn bộ quá trình thao tác chỉ mất khoảng 3 đến 5 phút.',
    'THÔNG TIN CHI PHÍ & THỜI GIAN', 'ECFDF5', '10B981')

# 2. BƯỚC 1: ĐĂNG KÝ / ĐĂNG NHẬP
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('2. Bước 1: Đăng Ký / Đăng Nhập Supabase')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('1. Mở trình duyệt web và truy cập địa chỉ: ').font.size = Pt(10.5)
r_url = p.add_run('https://supabase.com\n')
r_url.bold = True
r_url.font.color.rgb = RGBColor(37, 99, 235)
p.add_run('2. Bấm vào nút ').font.size = Pt(10.5)
p.add_run('"Sign In"').bold = True
p.add_run(' hoặc ').font.size = Pt(10.5)
p.add_run('"Start your project"').bold = True
p.add_run(' ở góc trên bên phải màn hình.\n3. Đăng nhập bằng tài khoản ').font.size = Pt(10.5)
p.add_run('GitHub').bold = True
p.add_run(' hoặc tài khoản ').font.size = Pt(10.5)
p.add_run('Email / Google').bold = True
p.add_run(' của anh/chị.')

# 3. BƯỚC 2: TẠO DỰ ÁN MỚI
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('3. Bước 2: Tạo Dự Án Mới (New Project)')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Sau khi đăng nhập vào Dashboard của Supabase:\n').font.size = Pt(10.5)
p.add_run('1. Bấm vào nút ').font.size = Pt(10.5)
p.add_run('"New project"').bold = True
p.add_run(' (nút màu xanh lá cây).\n2. Điền các trường thông tin cơ bản sau:\n').font.size = Pt(10.5)

tbl = doc.add_table(rows=5, cols=2)
tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
headers = ['Trường thông tin', 'Hướng dẫn nhập liệu']
for i, h in enumerate(headers):
    cell = tbl.cell(0, i)
    cell.paragraphs[0].add_run(h).bold = True
    set_cell_background(cell, 'E2E8F0')

rows_data = [
    ('Name (Tên dự án)', 'Đặt tên gợi nhớ, ví dụ: bakery-pos-test (nếu làm DB test) hoặc bakery-pos-main (nếu làm DB chính).'),
    ('Database Password', 'Nhập mật khẩu quản trị DB (ít nhất 8 ký tự gồm chữ, số và ký tự đặc biệt). Hãy lưu lại mật khẩu này cẩn thận.'),
    ('Region (Khu vực máy chủ)', 'QUAN TRỌNG: Chọn vùng "Singapore (ap-southeast-1)" để máy chủ đặt gần Việt Nam nhất, giúp tốc độ phản hồi cực nhanh (~30-50ms).'),
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
p_after.add_run(' ở góc dưới.\n4. Chờ khoảng 1 – 2 phút để hệ thống đám mây Supabase tự động thiết lập và khởi chạy máy chủ PostgreSQL.')

# 4. BƯỚC 3: LẤY THÔNG TIN KẾT NỐI
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('4. Bước 3: Lấy Thông Tin Kết Nối (Project URL & API Key)')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Để phần mềm kết nối được với CSDL mới, anh/chị cần lấy 2 chìa khóa kết nối:\n').font.size = Pt(10.5)
p.add_run('1. Trên thanh menu bên trái màn hình Supabase, bấm vào biểu tượng bánh răng ').font.size = Pt(10.5)
p.add_run('"Project Settings"').bold = True
p.add_run(' (nằm ở góc dưới cùng bên trái).\n2. Trong danh mục bên cạnh, chọn mục ').font.size = Pt(10.5)
p.add_run('"API"').bold = True
p.add_run(' (hoặc Data API).\n3. Sao chép 2 thông tin sau:\n').font.size = Pt(10.5)
p.add_run('   a. Project URL: ').bold = True
p.add_run('Có dạng như: https://abcdefghijklm.supabase.co  -> Bấm nút Copy.\n')
p.add_run('   b. Project API Keys: ').bold = True
p.add_run('Tìm đúng dòng có nhãn ').font.size = Pt(10.5)
p.add_run('"anon" "public"').bold = True
p.add_run(' (hoặc publishable key) -> Bấm nút Copy.\n')

add_callout(doc,
    'Tuyệt đối KHÔNG chia sẻ hoặc dùng nhầm khóa "service_role (secret)" cho ứng dụng bán hàng. Chỉ sao chép khóa "anon public" để đảm bảo an toàn tuyệt đối theo đúng chuẩn bảo mật Supabase.',
    'CẢNH BÁO BẢO MẬT API KEY', 'FEE2E2', 'EF4444')

# 5. BƯỚC 4: KHỞI TẠO CẤU TRÚC BẢNG (SCRIPT MASTER)
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('5. Bước 4: Khởi Tạo Cấu Trúc Bảng (Chạy Script SQL Master)')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Để CSDL mới có sẵn 100% bảng dữ liệu (Menu bánh, Kho nguyên liệu, Đơn hàng, Sổ quỹ, BOM bánh, Phân quyền bảo mật RLS):\n').font.size = Pt(10.5)
p.add_run('1. Trên menu bên trái của Supabase, bấm vào biểu tượng ').font.size = Pt(10.5)
p.add_run('SQL Editor').bold = True
p.add_run(' (biểu tượng có hình dấu ').font.size = Pt(10.5)
p.add_run('>_').bold = True
p.add_run(').\n2. Bấm vào nút ').font.size = Pt(10.5)
p.add_run('"+ New query"').bold = True
p.add_run(' để mở khung soạn thảo SQL mới.\n3. Mở file mã nguồn tổng hợp ').font.size = Pt(10.5)
p.add_run('supabase/schema_full_init.sql').bold = True
p.add_run(' đã được tạo sẵn trong thư mục dự án.\n4. Nhấn ').font.size = Pt(10.5)
p.add_run('Ctrl + A').bold = True
p.add_run(' để sao chép toàn bộ nội dung file này, rồi ').font.size = Pt(10.5)
p.add_run('Dán (Paste)').bold = True
p.add_run(' vào ô SQL Editor trên Supabase.\n5. Bấm nút ').font.size = Pt(10.5)
p.add_run('"Run"').bold = True
p.add_run(' (nút màu xanh lá cây góc dưới bên phải) hoặc nhấn phím tắt ').font.size = Pt(10.5)
p.add_run('Ctrl + Enter').bold = True
p.add_run('.\n6. Chờ khoảng 3 – 5 giây cho đến khi hệ thống báo ').font.size = Pt(10.5)
p.add_run('"Success. No rows returned"').bold = True
p.add_run(' là cơ sở dữ liệu đã sẵn sàng 100%!')

# 6. BƯỚC 5: ĐIỀN VÀO BAKERY POS
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('6. Bước 5: Điền Thông Tin Kết Nối Vào Ứng Dụng Bakery POS')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('1. Mở phần mềm Bakery POS trên trình duyệt, đăng nhập bằng tài khoản ').font.size = Pt(10.5)
p.add_run('Admin').bold = True
p.add_run('.\n2. Chọn tab ').font.size = Pt(10.5)
p.add_run('"CSDL & Sao Lưu SQL"').bold = True
p.add_run(' -> Chọn mục ').font.size = Pt(10.5)
p.add_run('"2. Cài Đặt Cho Online (Cloud SQL)"').bold = True
p.add_run('.\n3. Tại khối ').font.size = Pt(10.5)
p.add_run('"Quản Trị Đa CSDL SQL: Chính & Thử Nghiệm"').bold = True
p.add_run(':\n   • Bấm chọn thẻ ').font.size = Pt(10.5)
p.add_run('🟡 CSDL Thử Nghiệm (Test & Fix Lỗi)').bold = True
p.add_run(' (hoặc thẻ CSDL Chính nếu anh/chị đang thay thế CSDL chính).\n')
p.add_run('   • Ô số 1: Dán ').font.size = Pt(10.5)
p.add_run('Project URL').bold = True
p.add_run(' vừa copy ở Bước 3.\n')
p.add_run('   • Ô số 2: Dán ').font.size = Pt(10.5)
p.add_run('Anon API Key').bold = True
p.add_run(' vừa copy ở Bước 3.\n')
p.add_run('4. Bấm nút ').font.size = Pt(10.5)
p.add_run('"🔍 Kiểm Tra Kết Nối (Ping)"').bold = True
p.add_run(': Hệ thống sẽ đo độ trễ mạng thực tế (ví dụ: ').font.size = Pt(10.5)
p.add_run('"Kết nối thành công! Ping: 42ms"').bold = True
p.add_run(').\n5. Bấm nút ').font.size = Pt(10.5)
p.add_run('"Lưu Thông Tin"').bold = True
p.add_run('.\n6. Bấm nút ').font.size = Pt(10.5)
p.add_run('"Kích Hoạt Ngay"').bold = True
p.add_run(' -> Chọn ').font.size = Pt(10.5)
p.add_run('"1. Tải dữ liệu từ CSDL này về máy (Khuyến nghị)"').bold = True
p.add_run(' để tránh bị trộn lẫn dữ liệu cũ, rồi bấm xác nhận để hệ thống kết nối tức thì!')

# 7. TỔNG KẾT
h1 = doc.add_heading(level=1)
r_h1 = h1.add_run('7. Cách Thử Nghiệm An Toàn Khi Có CSDL Test')
r_h1.font.color.rgb = COLOR_PRIMARY

p = doc.add_paragraph()
p.add_run('Khi đã kích hoạt CSDL Thử Nghiệm:\n').font.size = Pt(10.5)
p.add_run('• Trên đỉnh màn hình POS, Bếp và Admin sẽ luôn có ').font.size = Pt(10.5)
p.add_run('Thanh cảnh báo viền vàng: [CHẾ ĐỘ TEST SQL]').bold = True
p.add_run(' để nhân viên không bị nhầm lẫn với bán hàng thật.\n')
p.add_run('• Muốn có sẵn danh mục bánh và công thức hiện tại của tiệm để test? Chỉ cần bấm nút: ').font.size = Pt(10.5)
p.add_run('"📋 1-Click Sao Chép Sang Test"').bold = True
p.add_run('. Hệ thống tự động đổ toàn bộ menu sang CSDL Test trong 1 giây.\n')
p.add_run('• Khi test xong, chỉ cần bấm nút ').font.size = Pt(10.5)
p.add_run('"Về CSDL Chính (Vận Hành)"').bold = True
p.add_run(' ngay trên thanh cảnh báo là hệ thống tự động quay về bán hàng thật 100% nguyên vẹn.\n')

doc.save('HUONG_DAN_TAO_SQL_SUPABASE_MOI.docx')
print('Successfully generated HUONG_DAN_TAO_SQL_SUPABASE_MOI.docx!')
