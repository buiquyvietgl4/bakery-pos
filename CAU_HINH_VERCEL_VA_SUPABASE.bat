@echo off
chcp 65001 >nul
title BAKERY ERP - TU DONG CAU HINH VERCEL VA SUPABASE

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

node scripts\auto_config_vercel_supabase.js

if %errorlevel% neq 0 (
    echo.
    echo ================================================================
    echo Da dung chuong trinh.
    echo ================================================================
    echo.
    pause
)
