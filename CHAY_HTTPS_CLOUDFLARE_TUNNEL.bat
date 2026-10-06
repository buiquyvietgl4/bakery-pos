@echo off
chcp 65001 >nul
title DUONG HAM HTTPS CLOUDFLARE (KET NOI DIEN THOAI VA NHAN THONG BAO)
color 0a

cd /d "%~dp0"

cls
echo ================================================================================
echo    🧁 BAKERY ERP - DUONG HAM HTTPS CLOUDFLARE CHO TIEM BANH 🚀
echo ================================================================================
echo.
echo  [CHU Y QUAN TRONG]:
echo  1. Hay dam bao ban da bat phan mem truoc bang file: CHAY_PHAN_MEM_TIEM_BANH.bat
echo  2. Cong cu nay se tao duong link HTTPS bao mat mien phi cho ban.
echo  3. Ban lay dien thoai mo link nay, bam "Cho phep thong bao" la xong!
echo.
echo ================================================================================
echo  Dang ket noi va tao duong dan HTTPS, vui long doi vai giay...
echo ================================================================================
echo.

if not exist "tools\cloudflared.exe" (
    echo [THONG BAO] Dang tu dong tai cong cu Cloudflare Tunnel...
    if not exist "tools" mkdir "tools"
    curl.exe -L -o "tools\cloudflared.exe" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
)

:: Khoi chay Cloudflare Quick Tunnel tro ve cong 3000
tools\cloudflared.exe tunnel --url http://localhost:3000

pause
