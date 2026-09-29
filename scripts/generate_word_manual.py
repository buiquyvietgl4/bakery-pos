# -*- coding: utf-8 -*-
"""
Script tạo file Word (.docx) chuyên nghiệp cho Hướng dẫn Khởi tạo SQL & Triển khai Vercel.
Hệ thống: Tiệm Bánh Bakery ERP
"""

import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, hex_color):
    """Đặt màu nền cho một ô trong bảng"""
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    """Đặt lề trong ô của bảng"""
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def add_callout(doc, text, title="LƯU Ý QUAN TRỌNG", box_type="important"):
    """Tạo hộp ghi chú / cảnh báo đẹp mắt"""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    
    bg_color = "FFF8E7" if box_type == "tip" else ("FFF0F0" if box_type == "warning" else "F4F6F9")
    border_color = "D97706" if box_type == "tip" else ("E11D48" if box_type == "warning" else "2563EB")
    
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    
    # Border trái đậm, các viền khác ẩn
    tcPr = cell._element.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="none"/>
            <w:left w:val="single" w:sz="36" w:space="0" w:color="{border_color}"/>
            <w:bottom w:val="none"/>
            <w:right w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    run_title = p.add_run(f"📌 {title}: ")
    run_title.bold = True
    run_title.font.size = Pt(10.5)
    run_title.font.name = "Segoe UI"
    run_title.font.color.rgb = RGBColor.from_string(border_color)
    
    run_text = p.add_run(text)
    run_text.font.size = Pt(10)
    run_text.font.name = "Segoe UI"
    run_text.font.color.rgb = RGBColor(50, 50, 50)
    
    doc.add_paragraph() # Spacer

def add_code_block(doc, code_text):
    """Tạo ô hiển thị đoạn mã code chuyên nghiệp"""
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, "F8F9FA")
    set_cell_margins(cell, top=120, bottom=120, left=180, right=180)
    
    tcPr = cell._element.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="6" w:space="0" w:color="E5E7EB"/>
            <w:left w:val="single" w:sz="18" w:space="0" w:color="9CA3AF"/>
            <w:bottom w:val="single" w:sz="6" w:space="0" w:color="E5E7EB"/>
            <w:right w:val="single" w:sz="6" w:space="0" w:color="E5E7EB"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(code_text)
    run.font.name = "Consolas"
    run.font.size = Pt(9.5)
    run.font.color.rgb = RGBColor(30, 41, 59)
    
    doc.add_paragraph()

def style_table(table, col_widths, headers, data, header_bg="2A4365"):
    """Định dạng bảng biểu đẹp, viền xám nhạt, xen kẽ màu nền"""
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    # Header row
    hdr_cells = table.rows[0].cells
    for i, header_text in enumerate(headers):
        hdr_cells[i].text = header_text
        set_cell_background(hdr_cells[i], header_bg)
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs:
            r.bold = True
            r.font.name = "Segoe UI"
            r.font.size = Pt(10)
            r.font.color.rgb = RGBColor(255, 255, 255)
            
    # Data rows
    for r_idx, row_data in enumerate(data):
        row_cells = table.add_row().cells
        bg = "FFFFFF" if r_idx % 2 == 0 else "F9FAFB"
        for c_idx, cell_value in enumerate(row_data):
            row_cells[c_idx].text = str(cell_value)
            set_cell_background(row_cells[c_idx], bg)
            set_cell_margins(row_cells[c_idx], top=90, bottom=90, left=120, right=120)
            p = row_cells[c_idx].paragraphs[0]
            for r in p.runs:
                r.font.name = "Segoe UI"
                r.font.size = Pt(9.5)
                r.font.color.rgb = RGBColor(30, 30, 30)
                
    # Set widths & borders
    for row in table.rows:
        for i, w in enumerate(col_widths):
            row.cells[i].width = Inches(w)
            tcPr = row.cells[i]._element.get_or_add_tcPr()
            borders = parse_xml(f'''
                <w:tcBorders {nsdecls("w")}>
                    <w:top w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
                    <w:left w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
                    <w:bottom w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
                    <w:right w:val="single" w:sz="4" w:space="0" w:color="E5E7EB"/>
                </w:tcBorders>
            ''')
            tcPr.append(borders)
    doc_add_spacer = True

def create_document():
    doc = Document()
    
    # Lề trang: 1 inch (2.54 cm)
    for section in doc.sections:
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)
        
        # Header & Footer
        header = section.header
        hp = header.paragraphs[0]
        hp.text = "Tiệm Bánh Bakery ERP — Cẩm Nang Cài Đặt & Triển Khai"
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        hp.runs[0].font.name = "Segoe UI"
        hp.runs[0].font.size = Pt(8.5)
        hp.runs[0].font.color.rgb = RGBColor(150, 150, 150)
        
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.text = "Tài liệu nội bộ — Phát hành tháng 09/2026 — Phiên bản chuẩn bảo mật Supabase & Vercel"
        fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        fp.runs[0].font.name = "Segoe UI"
        fp.runs[0].font.size = Pt(8.5)
        fp.runs[0].font.color.rgb = RGBColor(160, 160, 160)

    # 1. TIÊU ĐỀ CHÍNH (COVER / HEADER)
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(10)
    p_title.paragraph_format.space_after = Pt(2)
    r_sub = p_title.add_run("HỆ THỐNG QUẢN LÝ TIỆM BÁNH TOÀN DIỆN (BAKERY ERP)\n")
    r_sub.font.name = "Segoe UI"
    r_sub.font.size = Pt(11)
    r_sub.bold = True
    r_sub.font.color.rgb = RGBColor(180, 83, 9) # Amber-700
    
    r_main = p_title.add_run("HƯỚNG DẪN KHỞI TẠO CƠ SỞ DỮ LIỆU SQL\nVÀ TRIỂN KHAI VERCEL TỪ A - Z")
    r_main.font.name = "Segoe UI"
    r_main.font.size = Pt(20)
    r_main.bold = True
    r_main.font.color.rgb = RGBColor(30, 58, 138) # Deep Blue
    
    p_meta = doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_meta.paragraph_format.space_after = Pt(16)
    r_meta = p_meta.add_run("Phân hệ: Bán Hàng (POS) · Bếp Bánh (KDS) · Quản Trị & Kế Toán · Hạ Tầng Cloud SQL\nNgày phát hành: 29/09/2026 · Phiên bản: v2.0 Production")
    r_meta.font.name = "Segoe UI"
    r_meta.font.size = Pt(9.5)
    r_meta.font.italic = True
    r_meta.font.color.rgb = RGBColor(100, 100, 100)
    
    # Kẻ đường phân cách
    p_div = doc.add_paragraph()
    p_div.paragraph_format.space_after = Pt(12)
    p_div_border = parse_xml(f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="12" w:space="1" w:color="3B82F6"/></w:pBdr>')
    p_div._element.get_or_add_pPr().append(p_div_border)

    # 2. MỤC LỤC TỔNG QUAN
    p_toc = doc.add_paragraph()
    r = p_toc.add_run("📑 MỤC LỤC CHÍNH")
    r.bold = True
    r.font.name = "Segoe UI"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    toc_items = [
        "1. Tổng quan Kiến trúc Hệ thống & Luồng Dữ liệu",
        "2. PHẦN 1: Hướng Dẫn Khởi Tạo Cơ Sở Dữ Liệu SQL trên Supabase",
        "   - Bước 1.1: Tạo Project mới tại Singapore",
        "   - Bước 1.2: Chạy File SQL Tổng thể (schema_full_init.sql)",
        "   - Bước 1.3: Lấy Project URL và Anon API Key",
        "3. PHẦN 2: Hướng Dẫn Đẩy Mã Nguồn Lên GitHub & Xác Thực Token",
        "   - Bước 2.1: Cách đẩy cập nhật code hàng ngày (Dự án hiện tại)",
        "   - Bước 2.2: Cách đẩy một dự án mới tinh từ con số 0",
        "   - Bước 2.3: Cách lấy Personal Access Token khi GitHub đòi mật khẩu",
        "   - Bước 2.4: Dùng công cụ trực quan GitHub Desktop",
        "4. PHẦN 3: Hướng Dẫn Cấu Hình Môi Trường & Triển Khai Lên Vercel",
        "   - CÁCH 1: Triển khai trực tiếp bằng Vercel CLI (Không cần qua Git)",
        "   - CÁCH 2: Kết nối qua GitHub Repository (Tự động đồng bộ CI/CD)",
        "   - Bước 3.2: Thiết lập các Biến Môi Trường (Environment Variables)",
        "   - Bước 3.3: Biên dịch và Xuất bản website",
        "5. PHẦN 4: Danh Sách Tài Khoản Đăng Nhập & Quy Trình Nghiệm Thu",
        "6. PHẦN 5: Hướng Dẫn Vận Hành, Sao Lưu Dự Phòng & Xử Lý Sự Cố"
    ]
    for itm in toc_items:
        p_item = doc.add_paragraph()
        p_item.paragraph_format.space_before = Pt(1)
        p_item.paragraph_format.space_after = Pt(1)
        p_item.paragraph_format.left_indent = Inches(0.2)
        r = p_item.add_run(itm)
        r.font.name = "Segoe UI"
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(50, 50, 50)
        
    doc.add_paragraph()

    # 3. NỘI DUNG CHI TIẾT
    # --- MỤC 1: TỔNG QUAN KIẾN TRÚC ---
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    r = h1.add_run("1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG")
    r.bold = True
    r.font.name = "Segoe UI"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(180, 83, 9)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.15
    r = p.add_run("Hệ thống Bakery ERP được xây dựng theo kiến trúc Progressive Web App (PWA) hiện đại với khả năng hoạt động trực tuyến liên tục (Online) và sẵn sàng bán hàng ngay cả khi mất mạng cáp quang (Offline).")
    r.font.name = "Segoe UI"
    r.font.size = Pt(10)
    
    # Danh sách module
    modules = [
        ("Phân hệ Bán Hàng (POS):", "Chạy trên màn hình cảm ứng hoặc máy tính bảng thu ngân. Hỗ trợ tạo đơn, quét mã QR thanh toán, in hóa đơn K80, in tem nhãn bánh kem và quản lý đổi trả."),
        ("Phân hệ Bếp Bánh (KDS):", "Màn hình dành riêng cho thợ làm bánh. Nhận đơn tức thời qua WebSocket Realtime kèm âm thanh báo động, quản lý định mức nguyên liệu (BOM) và trừ kho theo mẻ nướng."),
        ("Phân hệ Quản Trị & Kế Toán:", "Quản lý danh mục bánh, quản lý giá vốn, bảng kê thu chi kép (Dual Cashflow), báo cáo doanh thu, chốt ca kiểm kê két tiền và phân quyền tài khoản."),
        ("Hạ tầng Cloud SQL Supabase:", "Lưu trữ tập trung 27 bảng dữ liệu trên nền tảng PostgreSQL, tích hợp kênh phát sóng Realtime và kho lưu trữ hình ảnh Storage Buckets.")
    ]
    for m_title, m_desc in modules:
        p_m = doc.add_paragraph()
        p_m.paragraph_format.left_indent = Inches(0.2)
        p_m.paragraph_format.space_after = Pt(3)
        r_b = p_m.add_run(f"• {m_title} ")
        r_b.bold = True
        r_b.font.name = "Segoe UI"
        r_b.font.size = Pt(9.5)
        r_b.font.color.rgb = RGBColor(30, 58, 138)
        r_d = p_m.add_run(m_desc)
        r_d.font.name = "Segoe UI"
        r_d.font.size = Pt(9.5)

    doc.add_paragraph()

    # --- MỤC 2: PHẦN 1 - SUPABASE ---
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    r = h1.add_run("2. PHẦN 1: HƯỚNG DẪN KHỞI TẠO SQL TRÊN SUPABASE")
    r.bold = True
    r.font.name = "Segoe UI"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(180, 83, 9)

    add_callout(
        doc,
        "Bạn chỉ cần thực hiện bước này khi tạo mới một chi nhánh tiệm bánh, chuyển sang tài khoản Supabase mới hoặc muốn xóa trắng làm mới toàn bộ dữ liệu.",
        title="KHI NÀO CẦN CHẠY BƯỚC NÀY",
        box_type="tip"
    )

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("Bước 1.1: Tạo Project mới tại Singapore\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "1. Truy cập https://supabase.com và đăng nhập bằng tài khoản GitHub hoặc Google.\n"
        "2. Bấm nút 'New Project'.\n"
        "3. Đặt tên dự án (ví dụ: Bakery-ERP-Production), đặt mật khẩu Database quản trị và lưu lại an toàn.\n"
        "4. Mục Region: Bắt buộc chọn Singapore (ap-southeast-1) để đường truyền tại Việt Nam có tốc độ phản hồi nhanh nhất (< 50ms).\n"
        "5. Bấm 'Create new project' và chờ khoảng 1 - 2 phút để máy chủ khởi tạo."
    )
    r_body.font.size = Pt(10)
    
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("Bước 1.2: Chạy File SQL Tổng thể (schema_full_init.sql)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "1. Trong menu bên trái của Supabase Dashboard, bấm vào biểu tượng SQL Editor (icon >_).\n"
        "2. Bấm vào nút '+ New query' để tạo một trang soạn thảo mới.\n"
        "3. Mở file mã nguồn trong máy tính của bạn tại: supabase/schema_full_init.sql\n"
        "4. Nhấn Ctrl + A để chọn tất cả -> Ctrl + C để sao chép toàn bộ nội dung.\n"
        "5. Dán vào ô soạn thảo trên Supabase -> Bấm nút 'Run' (hoặc nhấn Ctrl + Enter).\n"
        "6. Khi thấy thông báo màu xanh 'Success. No rows returned' là toàn bộ 27 bảng và phân quyền đã hoàn tất!"
    )
    r_body.font.size = Pt(10)

    add_callout(
        doc,
        "File schema_full_init.sql đã được nâng cấp tự động bổ sung khối lệnh ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL... "
        "đảm bảo tuân thủ tuyệt đối chính sách bảo mật mới ngày 30/10 của Supabase. Bất kỳ bảng mới nào tạo trong tương lai cũng tự động có quyền kết nối với Web.",
        title="TIÊU CHUẨN BẢO MẬT 30/10",
        box_type="important"
    )

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("Bước 1.3: Lấy Thông Tin Kết Nối (Project URL & Anon Key)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "1. Ở góc dưới bên trái màn hình Supabase, bấm vào biểu tượng bánh răng Settings (⚙️ Project Settings).\n"
        "2. Chọn mục 'API' (nằm dưới mục Configuration).\n"
        "3. Sao chép 2 giá trị sau ra Notepad:\n"
        "   • Project URL: Dạng https://xxxxxxxxxxxxxxxxxxxx.supabase.co\n"
        "   • Project API Keys (anon / public): Chuỗi mã dài bắt đầu bằng sb_publishable_... hoặc eyJ..."
    )
    r_body.font.size = Pt(10)

    doc.add_paragraph()

    # --- MỤC 3: PHẦN 2 - GITHUB ---
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    r = h1.add_run("3. PHẦN 2: HƯỚNG DẪN ĐẨY MÃ NGUỒN LÊN GITHUB & CẤU HÌNH TOKEN")
    r.bold = True
    r.font.name = "Segoe UI"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(180, 83, 9)

    p = doc.add_paragraph()
    r = p.add_run("Bước 2.1: Cách Đẩy Cập Nhật Hàng Ngày (Cho Dự Án Hiện Tại)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "Dự án Bakery ERP hiện tại đã liên kết với repository: https://github.com/buiquyvietgl4/bakery-pos.git (nhánh main).\n"
        "Mỗi khi bạn sửa đổi code và muốn đẩy lên để Vercel tự động cập nhật, chạy 3 lệnh sau:\n\n"
        "   git add .\n"
        "   git commit -m \"cập nhật tính năng mới\"\n"
        "   git push origin main\n"
    )
    r_body.font.size = Pt(10)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("Bước 2.2: Cách Đẩy Một Dự Án Mới Tinh Từ Con Số 0\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "1. Tạo repository trống trên GitHub: Vào https://github.com -> Bấm dấu '+' -> New repository -> Đặt tên repo.\n"
        "   ⚠️ Lưu ý: KHÔNG tích chọn Add README, .gitignore hoặc License (để repo hoàn toàn trống).\n"
        "2. Copy đường link HTTPS (dạng https://github.com/buiquyvietgl4/my-new-project.git).\n"
        "3. Chạy chuỗi lệnh sau tại thư mục máy tính:\n\n"
        "   git init\n"
        "   git add .\n"
        "   git commit -m \"Initial commit\"\n"
        "   git branch -M main\n"
        "   git remote add origin <link_https_vừa_copy>\n"
        "   git push -u origin main\n"
    )
    r_body.font.size = Pt(10)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("Bước 2.3: Cách Tạo Personal Access Token (Khi GitHub Đòi Mật Khẩu)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "GitHub không cho dùng mật khẩu đăng nhập thông thường khi push mã nguồn qua HTTPS. Bạn cần dùng Token:\n"
        "1. Vào GitHub -> Bấm ảnh đại diện góc trên phải -> Settings -> Developer settings (dưới cùng bên trái).\n"
        "2. Chọn Personal access tokens -> Tokens (classic) -> Generate new token (classic).\n"
        "3. Note: Điền tên máy tính (ví dụ: Laptop-Dell). Expiration: Chọn No expiration.\n"
        "4. Tích chọn ô vuông 'repo' (toàn quyền mã nguồn) -> Bấm Generate token.\n"
        "5. Copy chuỗi token (dạng ghp_...) và lưu lại. Khi Terminal hỏi Password, dán Token này vào là xong!"
    )
    r_body.font.size = Pt(10)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("Bước 2.4: Dùng Công Cụ Trực Quan GitHub Desktop (Không Cần Gõ Lệnh)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "Tải ứng dụng miễn phí tại https://desktop.github.com/ -> Đăng nhập tài khoản GitHub -> Kéo thả thư mục dự án vào -> "
        "Bấm 'Commit to main' -> Bấm 'Push origin'. Tất cả thao tác chỉ bằng chuột!"
    )
    r_body.font.size = Pt(10)

    doc.add_paragraph()

    # --- MỤC 4: PHẦN 3 - VERCEL ---
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    r = h1.add_run("4. PHẦN 3: HƯỚNG DẪN TRIỂN KHAI ỨNG DỤNG LÊN VERCEL")
    r.bold = True
    r.font.name = "Segoe UI"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(180, 83, 9)

    p = doc.add_paragraph()
    r = p.add_run("LỰA CHỌN PHƯƠNG THỨC TRIỂN KHAI:\n")
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(180, 83, 9)
    r_body = p.add_run(
        "Bạn có thể chọn 1 trong 2 cách sau để triển khai ứng dụng lên máy chủ đám mây Vercel:\n"
        "• CÁCH 1 (Khuyên dùng - Nhanh nhất): Triển khai trực tiếp từ máy tính bằng Vercel CLI — KHÔNG CẦN QUA GIT/GITHUB.\n"
        "• CÁCH 2: Kết nối tự động qua GitHub Repository (Tự động build lại mỗi khi đẩy code)."
    )
    r_body.font.size = Pt(10)

    # CÁCH 1: VERCEL CLI
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    r = p.add_run("🚀 CÁCH 1: TRIỂN KHAI TRỰC TIẾP LÊN VERCEL (KHÔNG CẦN DÙNG GIT)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    
    add_callout(
        doc,
        "Ưu điểm lớn nhất của cách này: Bạn KHÔNG CẦN tài khoản GitHub, không cần tạo repo, không cần gõ lệnh git commit hay push. Toàn bộ mã nguồn trên máy tính sẽ được Vercel CLI đóng gói và tải thẳng lên đám mây Vercel!",
        title="ĐIỂM NỔI BẬT",
        box_type="tip"
    )

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("Bước 3.1A: Đăng nhập Vercel CLI trên máy tính\n")
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "1. Mở PowerShell / Command Prompt tại thư mục dự án bakery-erp.\n"
        "2. Chạy lệnh: npx vercel login\n"
        "3. Dùng phím mũi tên chọn 'Continue with Email' (hoặc GitHub/Google) -> Nhập Email -> Bấm Enter.\n"
        "4. Mở hòm thư Email, bấm nút 'Verify' để xác nhận. Màn hình Terminal sẽ báo 'Success! Email confirmed'."
    )
    r_body.font.size = Pt(10)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("Bước 3.1B: Chạy lệnh đẩy dự án lên Vercel\n")
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "Tại thư mục dự án, chạy lệnh: npx vercel\n"
        "Hệ thống sẽ hỏi 5 câu cấu hình ban đầu (chỉ hỏi 1 lần đầu tiên):\n"
        "  1. Set up and deploy? -> Gõ Y rồi Enter.\n"
        "  2. Which scope? -> Bấm Enter (chọn tài khoản của bạn).\n"
        "  3. Link to existing project? -> Gõ N (nếu là dự án mới) rồi Enter.\n"
        "  4. What's your project's name? -> Nhập tên bakery-pos rồi Enter.\n"
        "  5. In which directory is your code located? -> Bấm Enter (để nguyên ./).\n"
        "  6. Want to modify these settings? -> Gõ N rồi Enter.\n"
        "Vercel sẽ tự động nén mã nguồn, tải lên máy chủ và cấp cho bạn 1 đường link Preview chạy thử ngay lập tức!"
    )
    r_body.font.size = Pt(10)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("Bước 3.1C: Xuất bản chính thức (Production Deploy)\n")
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "Khi muốn cập nhật bản chính thức ổn định lên môi trường Production, chỉ cần chạy đúng 1 lệnh:\n\n"
        "   npx vercel --prod\n\n"
        "Mỗi lần bạn sửa đổi code trên máy tính, chỉ cần gõ đúng 1 dòng lệnh trên là website tự động cập nhật ngay lập tức mà không cần đụng đến Git!"
    )
    r_body.font.size = Pt(10)

    # CÁCH 2: QUA GITHUB
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    r = p.add_run("🌐 CÁCH 2: IMPORT QUA GITHUB (TỰ ĐỘNG ĐỒNG BỘ CI/CD)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "Nếu bạn muốn liên kết dự án với GitHub để mỗi khi chạy 'git push' Vercel tự động build lại:\n"
        "1. Truy cập https://vercel.com và đăng nhập bằng tài khoản GitHub.\n"
        "2. Bấm nút 'Add New...' (góc phải trên) -> chọn 'Project'.\n"
        "3. Tại danh sách repositories hiện ra, tìm 'bakery-pos' -> bấm nút 'Import'."
    )
    r_body.font.size = Pt(10)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("Bước 3.2: Thiết Lập Biến Môi Trường (Environment Variables)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run("Tại trang cấu hình dự án trên Vercel, mở mục 'Environment Variables' và điền đầy đủ các thông số sau:")
    r_body.font.size = Pt(10)

    # Bảng biến môi trường
    env_headers = ["Tên Biến (Key)", "Giá Trị Mẫu (Value)", "Mô Tả Chức Năng", "Bắt Buộc?"]
    env_data = [
        ["NEXT_PUBLIC_SUPABASE_URL", "https://azgjnahbibrcbjooepef.supabase.co", "Đường dẫn kết nối database Supabase", "BẮT BUỘC"],
        ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_Cup5tD9Wt-_-cBcFKJut5g...", "Khóa công khai Data API của Supabase", "BẮT BUỘC"],
        ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BBRxBu4Wou9gEIrPivlSVhGHcdjEF...", "Khóa phát sóng thông báo Web Push", "Khuyên dùng"],
        ["VAPID_PRIVATE_KEY", "xix0rTLV9hqExYqk0InzRAMbhMrYWh...", "Khóa bí mật gửi Push từ máy chủ", "Khuyên dùng"],
        ["VAPID_SUBJECT", "mailto:admin@tiembanh.com", "Email định danh máy chủ gửi Push", "Khuyên dùng"],
        ["ROOT_ADMIN_KEY", "BAKERY-RESCUE-2026", "Khóa khôi phục mật khẩu Admin khẩn cấp", "Khuyên dùng"]
    ]
    t_env = doc.add_table(rows=1, cols=4)
    style_table(t_env, [2.1, 2.1, 1.6, 0.7], env_headers, env_data, header_bg="1E3A8A")

    doc.add_paragraph()
    
    add_callout(
        doc,
        "Bạn có thể mở file .env.example trong dự án, copy toàn bộ nội dung và dán thẳng vào giao diện Vercel. Vercel sẽ tự động bóc tách từng cặp Key - Value một cách chính xác mà không cần nhập từng dòng.",
        title="MẸO NHẬP NHANH VÀO VERCEL",
        box_type="tip"
    )

    p = doc.add_paragraph()
    r = p.add_run("Bước 3.3: Tiến Hành Triển Khai (Deploy)\n")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "1. Framework Preset: Để mặc định Next.js.\n"
        "2. Build Command: Để mặc định 'next build'.\n"
        "3. Install Command: Để mặc định. Dự án đã có sẵn file .npmrc chứa 'legacy-peer-deps=true', đảm bảo không bị lỗi xung đột phiên bản gói.\n"
        "4. Bấm nút 'Deploy' màu xanh và chờ 1 - 2 phút để hoàn tất xuất bản website!"
    )
    r_body.font.size = Pt(10)

    doc.add_paragraph()

    # --- MỤC 5: PHẦN 4 - TÀI KHOẢN & NGHIỆM THU ---
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    r = h1.add_run("5. PHẦN 4: DANH SÁCH TÀI KHOẢN MẶC ĐỊNH & NGHIỆM THU")
    r.bold = True
    r.font.name = "Segoe UI"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(180, 83, 9)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run("Hệ thống đã cài đặt sẵn 5 tài khoản mẫu để bạn kiểm thử ngay sau khi triển khai thành công:")
    r.font.size = Pt(10)

    acc_headers = ["Tên Đăng Nhập", "Mật Khẩu", "Tên Nhân Viên", "Vai Trò (Role)", "Quyền Hạn"]
    acc_data = [
        ["@admin", "admin123", "Chủ Tiệm (Admin)", "Chủ tiệm", "Toàn quyền: POS, Bếp, Quản trị, Kế toán, Reset"],
        ["@nhanvien", "123456", "Thu Ngân Bán Hàng", "Bán hàng", "Bán hàng POS, mở/đóng ca, in bill, đổi trả"],
        ["@bep", "123456", "Nhân Viên Bếp", "Thợ Bếp", "Màn hình KDS, nhận đơn, mẻ nướng, trừ kho BOM"],
        ["@mai_thungan", "password7788", "Mai Thu Ngân", "Thu ngân", "Bán hàng, tạo đơn mang về, kiểm tiền két"],
        ["@tuan_quanly", "managerPass123", "Tuấn Quản Lý", "Quản lý", "Duyệt đổi trả, xem báo cáo doanh thu, chốt ca"]
    ]
    t_acc = doc.add_table(rows=1, cols=5)
    style_table(t_acc, [1.1, 1.2, 1.4, 0.9, 1.9], acc_headers, acc_data, header_bg="9A3412")

    doc.add_paragraph()

    p = doc.add_paragraph()
    r = p.add_run("Checklist 5 Bước Nghiệm Thu Sau Khi Mở Ứng Dụng:\n")
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(30, 58, 138)
    checklist = [
        "1. Trạng thái kết nối: Nhìn góc trên bên phải thanh Header có chấm tròn xanh và chữ 'Live Sync' -> Đã nối Cloud SQL Supabase thành công.",
        "2. Đăng nhập Admin: Bấm Đăng Nhập -> nhập @admin / admin123 -> Tên 'Chủ Tiệm (Admin)' hiển thị rõ ràng trên header máy tính.",
        "3. Mở ca & Bán hàng: Vào POS -> Nhập tiền đầu ca 1.000.000đ -> Bấm Mở Ca -> Thêm 2 bánh vào giỏ -> Thanh toán hoàn tất.",
        "4. Màn hình Bếp KDS: Mở tab /kitchen -> Khi POS tạo đơn, màn hình Bếp phải nhận được đơn tức thời kèm chuông báo.",
        "5. Giao diện Mobile: Mở thử trên điện thoại -> Tên tài khoản thu gọn dạng banner chạy ngang, chuông thông báo hiển thị đầy đủ."
    ]
    for chk in checklist:
        p_c = doc.add_paragraph()
        p_c.paragraph_format.left_indent = Inches(0.2)
        p_c.paragraph_format.space_after = Pt(2)
        r_c = p_c.add_run(chk)
        r_c.font.size = Pt(9.5)

    doc.add_paragraph()

    # --- MỤC 6: PHẦN 5 - VẬN HÀNH & SỰ CỐ ---
    h1 = doc.add_paragraph()
    h1.paragraph_format.space_before = Pt(14)
    h1.paragraph_format.space_after = Pt(4)
    r = h1.add_run("6. PHẦN 5: HƯỚNG DẪN VẬN HÀNH, SAO LƯU & XỬ LÝ SỰ CỐ")
    r.bold = True
    r.font.name = "Segoe UI"
    r.font.size = Pt(13)
    r.font.color.rgb = RGBColor(180, 83, 9)

    p = doc.add_paragraph()
    r = p.add_run("5.1. Cơ Chế Bán Hàng Khi Mất Mạng (Offline Resiliency)\n")
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "• Khi mất Internet, thanh Header tự động chuyển sang badge màu đỏ 'Offline'.\n"
        "• Thu ngân vẫn thao tác bấm chọn bánh và thanh toán tiền mặt bình thường. Dữ liệu được lưu trữ kiên cố vào bộ nhớ IndexedDB của trình duyệt.\n"
        "• Khi có mạng trở lại, hệ thống đối soát tự động kích hoạt và đẩy toàn bộ các đơn hàng offline lên Supabase mà không làm mất bất kỳ đơn nào."
    )
    r_body.font.size = Pt(9.5)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(6)
    r = p.add_run("5.2. Sao Lưu & Phục Hồi Dữ Liệu\n")
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(30, 58, 138)
    r_body = p.add_run(
        "• Tự động: Hệ thống tự lưu snapshot đám mây khi thực hiện chốt ca cuối ngày.\n"
        "• Thủ công: Vào Quản trị & Kế toán -> chọn tab 'Sao Lưu & Phục Hồi' -> Bấm 'Xuất Bản Sao Lưu (JSON v2)' để tải file về máy tính cá nhân cất giữ an toàn.\n"
        "• Phục hồi: Khi cần khôi phục lại dữ liệu cũ, chỉ cần bấm 'Khôi phục từ file' và chọn file JSON đã lưu."
    )
    r_body.font.size = Pt(9.5)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("5.3. Bảng Xử Lý Sự Cố Nhanh (Troubleshooting)\n")
    r.bold = True
    r.font.size = Pt(10.5)
    r.font.color.rgb = RGBColor(30, 58, 138)

    trouble_headers = ["Hiện Tượng / Lỗi", "Nguyên Nhân", "Cách Khắc Phục Nhanh"]
    trouble_data = [
        ["Vercel báo lỗi ERESOLVE khi cài gói", "Xung đột phiên bản npm", "Kiểm tra file .npmrc có dòng legacy-peer-deps=true rồi push lại lên GitHub."],
        ["Header báo lỗi Offline đỏ liên tục", "Sai biến môi trường Supabase", "Vào Vercel Settings -> Environment Variables kiểm tra URL và Anon Key."],
        ["Bấm vào Quản trị báo 'Khóa'", "Chưa đăng nhập quyền Admin", "Đăng nhập tài khoản @admin / admin123 hoặc bấm nút Mở Admin trên thanh Header."],
        ["Quên mật khẩu Chủ Tiệm (Admin)", "Mất mật khẩu tài khoản", "Nhập mã khôi phục tối cao BAKERY-RESCUE-2026 tại form đăng nhập để đặt lại mật khẩu."],
        ["Báo lỗi permission denied for table...", "Thiếu cấp quyền Data API", "Chạy file supabase/migrations/00020_post_oct30_data_api_grants.sql trên Supabase SQL Editor."]
    ]
    t_trouble = doc.add_table(rows=1, cols=3)
    style_table(t_trouble, [1.8, 1.8, 2.9], trouble_headers, trouble_data, header_bg="475569")

    # Lưu tài liệu vào Artifacts
    artifact_path = r"C:\Users\H\.gemini\antigravity\brain\60b78812-4fb4-4b45-a7e5-90bb596df1a5\HUONG_DAN_CAI_DAT_VA_TRIEN_KHAI_BAKERY_ERP.docx"
    doc.save(artifact_path)
    print(f"Artifact document created at: {artifact_path}")

    # Lưu tài liệu vào thư mục dự án
    output_path = r"C:\Users\H\.gemini\antigravity\scratch\bakery-erp\HUONG_DAN_CAI_DAT_VA_TRIEN_KHAI_BAKERY_ERP.docx"
    try:
        doc.save(output_path)
        print(f"Document successfully created at: {output_path}")
    except PermissionError:
        fallback_path = r"C:\Users\H\.gemini\antigravity\scratch\bakery-erp\HUONG_DAN_CAI_DAT_VA_TRIEN_KHAI_BAKERY_ERP_MOI.docx"
        doc.save(fallback_path)
        print(f"Main docx file is open in Word. Saved updated file to: {fallback_path}")

if __name__ == "__main__":
    create_document()
