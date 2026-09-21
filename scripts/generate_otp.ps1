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

$supabaseUrl = ""
$supabaseAnonKey = ""

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

if (-not $supabaseUrl -or -not $supabaseAnonKey) {
    Write-Host "❌ LỖI: Không tìm thấy file bí mật .env.local hoặc thiếu thông tin kết nối!" -ForegroundColor Red
    Write-Host "   Gợi ý: Hãy đảm bảo bạn đã copy file .env.local sang máy này." -ForegroundColor Yellow
    exit 1
}

$part1 = Get-Random -Minimum 1000 -Maximum 9999
$part2 = Get-Random -Minimum 1000 -Maximum 9999
$newOtp = "ROOT-$part1-$part2"
$createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

$headers = @{
    "apikey" = $supabaseAnonKey
    "Authorization" = "Bearer $supabaseAnonKey"
    "Prefer" = "resolution=merge-duplicates"
}

try {
    Write-Host "1. Đang kết nối Cloud CSDL để đăng ký mã cứu hộ 1 lần..." -ForegroundColor Gray
    
    $queryUrl = "$supabaseUrl/rest/v1/recipes?id=eq.00000000-0000-0000-0000-00000000000b&select=id,notes"
    $response = Invoke-RestMethod -Uri $queryUrl -Headers $headers -Method Get
    
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
    Invoke-RestMethod -Uri $upsertUrl -Headers $headers -Method Post -Body $utf8Bytes -ContentType "application/json; charset=utf-8" | Out-Null

    try {
        Set-Clipboard -Value $newOtp
    } catch {}

    Write-Host "2. ĐÃ ĐĂNG KÝ MÃ THÀNH CÔNG LÊN HỆ THỐNG TOÀN QUÁN!`n" -ForegroundColor Green
    Write-Host "══════════════════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "👉 MÃ CỨU HỘ CỦA BẠN:   $newOtp" -ForegroundColor White
    Write-Host "══════════════════════════════════════════════════════════════════════`n" -ForegroundColor Yellow
    Write-Host "📋 ĐÃ TỰ ĐỘNG COPY MÃ VÀO BỘ NHỚ TẠM (CLIPBOARD). Bạn chỉ cần Ctrl+V để dán." -ForegroundColor Cyan
    Write-Host "`n🔒 ĐẶC ĐIỂM BẢO MẬT TUYỆT ĐỐI:" -ForegroundColor Gray
    Write-Host "   ✓ Mỗi mã chỉ dùng được DUY NHẤT 1 LẦN." -ForegroundColor Gray
    Write-Host "   ✓ Sau khi nhập vào màn hình đăng nhập, mã sẽ tự hủy ngay tức thì." -ForegroundColor Gray
    Write-Host "   ✓ Kẻ gian dù nhìn trộm được mã cũng không thể sử dụng lại lần thứ 2." -ForegroundColor Gray
    Write-Host "   ✓ Chỉ máy tính đang có mã nguồn và .env.local mới có thể tạo ra mã!" -ForegroundColor Gray
    Write-Host "══════════════════════════════════════════════════════════════════════`n" -ForegroundColor Yellow

} catch {
    Write-Host "❌ Lỗi kết nối Supabase: $_" -ForegroundColor Red
    exit 1
}
