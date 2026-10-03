@echo off
chcp 65001 >nul
title BAKERY ERP - TU DONG CAU HINH VERCEL VA SUPABASE
color 0b

:: Chuyển đến thư mục chứa dự án
cd /d "%~dp0"

:MENU
cls
echo ================================================================================
echo    🧁 BAKERY ERP - BỘ CÔNG CỤ TỰ ĐỘNG CẤU HÌNH VERCEL & SUPABASE CLOUD 🚀
echo ================================================================================
echo.
echo  Vui lòng chọn thao tác bạn muốn thực hiện:
echo.
echo  [1] ⚡ Cấu hình & Đồng bộ Toàn bộ Biến Môi Trường (.env.local) lên Vercel
echo  [2] 🔍 Kiểm tra Kết nối & Kiểm định Bảng Dữ Liệu Supabase Cloud
echo  [3] 🚀 Triển khai (Deploy) Bản Mới Lên Vercel Production
echo  [4] ⭐ TỰ ĐỘNG HÓA TẤT CẢ (Kiểm tra Supabase -^> Đồng bộ Vercel -^> Deploy)
echo  [5] 🌐 Mở Bảng Điều Khiển Vercel & Supabase trên Trình Duyệt
echo  [6] 📋 Tự Động Sao Chép (Copy) SQL Schema ^& Mở Supabase SQL Editor
echo  [7] 🪄 Cài Đặt Dự Án Mới Từ Đầu Đến Đuôi (Setup Wizard A-Z)
echo  [0] ❌ Thoát
echo.
echo ================================================================================
set /p choice="Nhập lựa chọn của bạn (0 - 7): "

if "%choice%"=="1" (
    cls
    node scripts\auto_config_vercel_supabase.js --sync-env
    echo.
    pause
    goto MENU
)

if "%choice%"=="2" (
    cls
    node scripts\auto_config_vercel_supabase.js --test-supabase
    echo.
    pause
    goto MENU
)

if "%choice%"=="3" (
    cls
    node scripts\auto_config_vercel_supabase.js --deploy
    echo.
    pause
    goto MENU
)

if "%choice%"=="4" (
    cls
    node scripts\auto_config_vercel_supabase.js --all
    echo.
    pause
    goto MENU
)

if "%choice%"=="5" (
    cls
    node scripts\auto_config_vercel_supabase.js --open
    echo.
    pause
    goto MENU
)

if "%choice%"=="6" (
    cls
    node scripts\auto_config_vercel_supabase.js --schema
    echo.
    pause
    goto MENU
)

if "%choice%"=="7" (
    cls
    node scripts\auto_config_vercel_supabase.js --wizard
    echo.
    pause
    goto MENU
)

if "%choice%"=="0" (
    echo.
    echo Tam biet! Chuc ban mot ngay lam viec hieu qua!
    timeout /t 2 >nul
    exit /b 0
)

echo.
echo [!] Lựa chọn không hợp lệ, vui lòng nhập số từ 0 đến 7.
timeout /t 2 >nul
goto MENU
