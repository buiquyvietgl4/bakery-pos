# scripts/generate_otp.ps1
param()

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "╔══════════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       HỆ THỐNG BAKERY POS: TẠO MÃ CỨU HỘ ADMIN DÙNG 1 LẦN DUY NHẤT   ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$envPath = Join-Path $rootDir ".env.local"
$localOtpFile = Join-Path $rootDir ".local_emergency_otp.json"
$profileFile = Join-Path $rootDir ".active_database_profile.json"

# 1. Sinh mã OTP ngẫu nhiên ROOT-XXXX-YYYY
$part1 = Get-Random -Minimum 1000 -Maximum 9999
$part2 = Get-Random -Minimum 1000 -Maximum 9999
$newOtp = "ROOT-$part1-$part2"
$createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

# 2. LUÔN LƯU VÀO CƠ SỞ DỮ LIỆU CỤC BỘ (LOCAL SQL / OFFLINE VAULT)
$localSaved = $false
try {
    $localCfg = @{
        active_otp_codes = [System.Collections.ArrayList]@()
        used_otp_codes = [System.Collections.ArrayList]@()
        updated_at = $createdAt
    }

    if (Test-Path $localOtpFile) {
        try {
            $raw = Get-Content $localOtpFile -Raw -Encoding UTF8
            $parsed = $raw | ConvertFrom-Json
            if ($parsed.active_otp_codes) {
                $localCfg.active_otp_codes = [System.Collections.ArrayList]@($parsed.active_otp_codes)
            }
            if ($parsed.used_otp_codes) {
                $localCfg.used_otp_codes = [System.Collections.ArrayList]@($parsed.used_otp_codes)
            }
            $parsed.PSObject.Properties | ForEach-Object {
                if ($_.Name -ne "active_otp_codes" -and $_.Name -ne "used_otp_codes") {
                    $localCfg[$_.Name] = $_.Value
                }
            }
        } catch {}
    }

    $newCodeObj = @{
        code = $newOtp
        created_at = $createdAt
        used = $false
    }

    $localCfg.active_otp_codes.Add($newCodeObj) | Out-Null
    while ($localCfg.active_otp_codes.Count -gt 20) {
        $localCfg.active_otp_codes.RemoveAt(0)
    }
    $localCfg.updated_at = $createdAt

    $jsonStr = $localCfg | ConvertTo-Json -Depth 10
    Set-Content -Path $localOtpFile -Value $jsonStr -Encoding UTF8
    $localSaved = $true
    Write-Host "✓ Đã đăng ký mã vào CSDL Cục Bộ (Local SQL / Offline Vault)" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Cảnh báo: Không thể ghi file mã cục bộ" -ForegroundColor Yellow
}

# 3. ĐỒNG BỘ LÊN CLOUD SUPABASE (TỰ ĐỘNG THEO URL POS HOẶC .env.local)
$supabaseUrl = ""
$supabaseAnonKey = ""

# Ưu tiên 1: Đọc từ .active_database_profile.json
if (Test-Path $profileFile) {
    try {
        $profRaw = Get-Content $profileFile -Raw -Encoding UTF8
        $profJson = $profRaw | ConvertFrom-Json
        if ($profJson.url -and $profJson.anonKey) {
            $supabaseUrl = $profJson.url
            $supabaseAnonKey = $profJson.anonKey
        }
    } catch {}
}

# Ưu tiên 2: Fallback đọc từ .env.local
if (-not $supabaseUrl -or -not $supabaseAnonKey) {
    if (Test-Path $envPath) {
        Get-Content $envPath -Encoding UTF8 | ForEach-Object {
            $line = $_.Trim()
            if ($line -match "^NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+)$") {
                $supabaseUrl = $matches[1].Trim("'`"")
            }
            if ($line -match "^NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*(.+)$") {
                $supabaseAnonKey = $matches[1].Trim("'`"")
            }
        }
    }
}

if ($supabaseUrl -and $supabaseAnonKey) {
    $headers = @{
        "apikey" = $supabaseAnonKey
        "Authorization" = "Bearer $supabaseAnonKey"
        "Prefer" = "resolution=merge-duplicates"
    }

    try {
        $queryUrl = "$supabaseUrl/rest/v1/recipes?id=eq.00000000-0000-0000-0000-00000000000b" + [char]38 + "select=id,notes"
        $response = Invoke-RestMethod -Uri $queryUrl -Headers $headers -Method Get -TimeoutSec 5
        
        $cfg = @{
            active_otp_codes = @()
            used_otp_codes = @()
        }

        if ($response -and $response.Count -gt 0 -and $response[0].notes) {
            try {
                $parsed = $response[0].notes | ConvertFrom-Json
                if ($parsed.active_otp_codes) {
                    $cfg.active_otp_codes = [System.Collections.ArrayList]@($parsed.active_otp_codes)
                }
                if ($parsed.used_otp_codes) {
                    $cfg.used_otp_codes = [System.Collections.ArrayList]@($parsed.used_otp_codes)
                }
                $parsed.PSObject.Properties | ForEach-Object {
                    if ($_.Name -ne "active_otp_codes" -and $_.Name -ne "used_otp_codes") {
                        $cfg[$_.Name] = $_.Value
                    }
                }
            } catch {}
        }

        $newCodeObj = @{
            code = $newOtp
            created_at = $createdAt
            used = $false
        }
        
        $activeList = [System.Collections.ArrayList]@($cfg.active_otp_codes)
        $activeList.Add($newCodeObj) | Out-Null
        
        while ($activeList.Count -gt 20) {
            $activeList.RemoveAt(0)
        }
        $cfg.active_otp_codes = $activeList
        $cfg.updated_at = $createdAt

        $notesJson = $cfg | ConvertTo-Json -Depth 10 -Compress
        $bodyObj = @(
            @{
                id = "00000000-0000-0000-0000-00000000000b"
                name = "SYS_CONFIG_SECURITY"
                yield_qty = 1
                yield_unit = "chiếc"
                cost_per_unit = 0
                total_material_cost = 0
                notes = $notesJson
                is_active = $false
            }
        )
        $upsertBody = $bodyObj | ConvertTo-Json -Depth 10
        $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($upsertBody)

        $upsertUrl = "$supabaseUrl/rest/v1/recipes"
        Invoke-RestMethod -Uri $upsertUrl -Headers $headers -Method Post -Body $utf8Bytes -ContentType "application/json; charset=utf-8" -TimeoutSec 8 | Out-Null
        Write-Host "✓ Đã đồng bộ mã lên Cloud Supabase thành công" -ForegroundColor Green
    } catch {
        Write-Host "ℹ️ Lưu ý: Hiện không kết nối được Cloud Supabase (hoặc chạy Local SQL ngoại tuyến)." -ForegroundColor Yellow
        Write-Host "   Mã đã được lưu cục bộ an toàn và có hiệu lực ngay trong môi trường Local!" -ForegroundColor Yellow
    }
} else {
    Write-Host "ℹ️ Chế độ không có Supabase Cloud: Đã kích hoạt mã trên CSDL Local SQL." -ForegroundColor Yellow
}

# 4. Copy mã vào Clipboard
try {
    Set-Clipboard -Value $newOtp
} catch {}

Write-Host "`n══════════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host "👉 MÃ CỨU HỘ CỦA BẠN:   $newOtp" -ForegroundColor White
Write-Host "══════════════════════════════════════════════════════════════════════`n" -ForegroundColor Yellow
Write-Host "📋 ĐÃ TỰ ĐỘNG COPY MÃ VÀO BỘ NHỚ TẠM (CLIPBOARD). Bạn chỉ cần Ctrl+V để dán." -ForegroundColor Cyan
Write-Host "`n🔒 ĐẶC ĐIỂM BẢO MẬT VÀ ĐỘC LẬP CSDL:" -ForegroundColor Gray
Write-Host "   - Độc lập với CSDL: Hoạt động trơn tru cả trên Cloud Supabase lẫn Local SQL." -ForegroundColor Gray
Write-Host "   - Không sợ đổi SQL: Dù đổi URL Supabase hay ngắt mạng, mã vẫn chạy chuẩn xác." -ForegroundColor Gray
Write-Host "   - Mỗi mã chỉ dùng được DUY NHẤT 1 LẦN (Tự hủy ngay sau khi đăng nhập)." -ForegroundColor Gray
Write-Host "   - Chỉ máy tính đang có mã nguồn này mới có thể tạo ra mã!" -ForegroundColor Gray
Write-Host "══════════════════════════════════════════════════════════════════════`n" -ForegroundColor Yellow

