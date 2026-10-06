@echo off
chcp 65001 >nul
title DUONG HAM HTTPS CLOUDFLARE (KET NOI DIEN THOAI VA NHAN THONG BAO)

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ================================================================
    echo [LOI] Khong tim thay Node.js tren may tinh!
    echo Vui long cai dat Node.js tu trang web: https://nodejs.org
    echo ================================================================
    echo.
    pause
    exit /b 1
)

node scripts\run_tunnel.js

if %errorlevel% neq 0 (
    echo.
    echo ================================================================
    echo Da dung duong ham Cloudflare.
    echo ================================================================
    echo.
    pause
)
