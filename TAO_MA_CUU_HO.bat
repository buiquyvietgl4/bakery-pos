@echo off
chcp 65001 >nul
title TAO MA CUU HO ADMIN DUNG 1 LAN - BAKERY POS
color 0B
cls

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\generate_otp.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Thong bao] Thu chay bang che do du phong Node.js...
    call npx tsx "%~dp0scripts\generate_one_time_code.ts"
)

echo.
echo Nhan phim bat ky de thoat...
pause >nul
