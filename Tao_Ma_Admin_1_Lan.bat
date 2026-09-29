@echo off
chcp 65001 >nul
title Bakery ERP - Cong Cu Tao Ma Dang Nhap Admin 1 Lan

cd /d "%~dp0"

echo ======================================================================
echo   HỆ THỐNG QUẢN LÝ TIỆM BÁNH BAKERY ERP - CÔNG CỤ CỨU HỘ ADMIN
echo ======================================================================
echo Đang mở ứng dụng tạo mã đăng nhập Admin 1 lần...
echo.

python scripts\admin_rescue_app.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [THÔNG BÁO] Không thể mở giao diện đồ họa. Đang chạy ở chế độ dòng lệnh:
    python scripts\admin_rescue_app.py --cli
    echo.
    pause
)
