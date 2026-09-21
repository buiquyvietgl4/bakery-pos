@echo off
chcp 65001 >nul
title KHOI PHUC MAT KHAU ADMIN KHAN CAP - BAKERY POS
color 0C
cls
echo ======================================================================
echo    CUU HO KHAN CAP: KHOI PHUC MAT KHAU QUAN TRI VE 'admin123'
echo ======================================================================
echo.
echo  Dang ket noi den Cloud Supabase SQL de cuong che reset mat khau...
echo.

call npx tsx scripts/emergency_reset_admin.ts

echo.
echo ======================================================================
echo Nhan phim bat ky de thoat...
pause >nul
