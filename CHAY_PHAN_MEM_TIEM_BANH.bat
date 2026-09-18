@echo off
chcp 65001 >nul
title HE THONG TIEM BANH (BAKERY POS)

cd /d "C:\Users\H\.gemini\antigravity\scratch\bakery-erp"

cls
node scripts\print_lan_banner.js

start "" "http://localhost:3000/pos"

npm run start -- -H 0.0.0.0 -p 3000
if %errorlevel% neq 0 (
    echo.
    echo Chuyen sang che do Dev...
    npm run dev -- -H 0.0.0.0 -p 3000
)

pause
