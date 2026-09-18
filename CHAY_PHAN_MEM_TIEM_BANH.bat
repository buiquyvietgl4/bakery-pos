@echo off
chcp 65001 >nul
title HỆ THỐNG BÁN HÀNG & QUẢN TRỊ TIỆM BÁNH (BAKERY POS & ERP)

echo ======================================================================
echo       HỆ THỐNG BÁN HÀNG & QUẢN LÝ TIỆM BÁNH (BAKERY POS)
echo ======================================================================
echo.

cd /d "C:\Users\H\.gemini\antigravity\scratch\bakery-erp"

echo [1/3] Đang tìm địa chỉ IP máy tính trong mạng WiFi...
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"Địa chỉ IPv4"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
set IP=%IP: =%

echo.
echo ======================================================================
echo   ĐƯỜNG DẪN TRUY CẬP VÀO PHẦN MỀM:
echo.
echo   1. TRÊN MÁY TÍNH NÀY (MÁY CHỦ):
echo      - Màn hình Bán hàng (POS): http://localhost:3000/pos
echo      - Màn hình Quản trị Admin: http://localhost:3000/admin
echo      - Màn hình Bếp làm bánh:   http://localhost:3000/kitchen
echo.
if not "%IP%"=="" (
echo   2. TRÊN ĐIỆN THOẠI / IPAD / MÁY CON (CÙNG MẠNG WIFI):
echo      - Mở trình duyệt gõ:       http://%IP%:3000/pos
echo      - Hoặc:                    http://%IP%:3000
echo.
)
echo ======================================================================
echo.
echo [2/3] Đang tự động mở trình duyệt vào màn hình Bán hàng...
start "" "http://localhost:3000/pos"

echo [3/3] Đang chạy Server phần mềm (Cổng Port 3000)...
echo (Lưu ý: Giữ cửa sổ đen này chạy trong suốt ca làm việc. Đóng lại để tắt phần mềm)
echo.

npm run start -- -H 0.0.0.0 -p 3000
if %errorlevel% neq 0 (
    echo.
    echo Cảnh báo: Chế độ Start gặp lỗi, tự động chuyển sang chế độ Dev...
    npm run dev -- -H 0.0.0.0 -p 3000
)

pause
