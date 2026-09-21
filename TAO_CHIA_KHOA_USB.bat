@echo off
chcp 65001 >nul
title TAO CHIA KHOA CUNG ROOT CHO CHU TIEM - BAKERY POS
color 0A
cls
echo ======================================================================
echo       HE THONG TIEM BANH - TAO FILE CHIA KHOA CUNG ROOT (USB)
echo ======================================================================
echo.
echo  Dang khoi tao File Chia Khoa Ky Thuat So voi Ma Root: Quyviet97@ ...
echo.

call npx tsx scripts/generate_owner_key.ts

echo.
echo ======================================================================
echo  [HOAN TAT] File chia khoa (.key) da duoc tao thanh cong!
echo.
echo  HE THONG SE DONG THOI MO THU MUC CHUA FILE DE BAN DE DANG:
echo  1. Chep (Copy) file .key nay vao USB ca nhan cua ban.
echo  2. Xoa file tren may sau khi da luu vao USB de dam bao an toan 100%%.
echo ======================================================================
echo.
explorer .
echo Nhan phim bat ky de dong cua so nay...
pause >nul
