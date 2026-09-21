@echo off
chcp 65001 >nul
title TAO MA CUU HO ADMIN DUNG 1 LAN - BAKERY POS
color 0B
cls

call npx tsx scripts/generate_one_time_code.ts

echo.
echo Nhan phim bat ky de thoat...
pause >nul
