@echo off
chcp 65001 >nul
title HỆ THỐNG QUẢN LÝ TIỆM BÁNH (CHẾ ĐỘ DEV - TỰ ĐỘNG CẬP NHẬT CODE)

echo ======================================================================
echo    CHẠY CHẾ ĐỘ PHÁT TRIỂN / SỬA CODE (NEXT.JS DEV MODE)
echo ======================================================================
echo.

cd /d "C:\Users\H\.gemini\antigravity\scratch\bakery-erp"

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"Địa chỉ IPv4"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
set IP=%IP: =%

echo Truy cập máy tính: http://localhost:3000/pos
if not "%IP%"=="" (
echo Truy cập điện thoại: http://%IP%:3000/pos
)
echo.

start "" "http://localhost:3000/pos"

npm run dev -- -H 0.0.0.0 -p 3000

pause
