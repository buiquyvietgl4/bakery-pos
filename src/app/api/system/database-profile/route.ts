// src/app/api/system/database-profile/route.ts
// Đồng bộ cấu hình CSDL URL và Anon Key từ màn hình POS / Admin xuống ổ cứng máy chủ
// Giúp file TAO_MA_CUU_HO.bat và các tiến trình máy chủ luôn tự động kết nối đúng URL mới nhất

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const PROFILE_FILE = path.join(process.cwd(), '.active_database_profile.json');
const ENV_LOCAL_FILE = path.join(process.cwd(), '.env.local');

export async function GET() {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const raw = fs.readFileSync(PROFILE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return NextResponse.json({ success: true, data });
    }
  } catch (err) {
    console.warn('[database-profile] Lỗi đọc file profile:', err);
  }

  return NextResponse.json({
    success: true,
    data: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      activeProfileId: 'production',
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, anonKey, activeProfileId, name } = body;

    const cleanUrl = (url || '').trim().replace(/\/+$/, '');
    const cleanKey = (anonKey || '').trim();

    const profileData = {
      activeProfileId: activeProfileId || 'production',
      name: name || 'CSDL Tùy Chỉnh',
      url: cleanUrl,
      anonKey: cleanKey,
      updatedAt: new Date().toISOString(),
    };

    // 1. Lưu vào .active_database_profile.json để các script đọc ngay lập tức
    try {
      fs.writeFileSync(PROFILE_FILE, JSON.stringify(profileData, null, 2), 'utf-8');
    } catch (writeErr) {
      console.warn('[database-profile] Không thể ghi .active_database_profile.json:', writeErr);
    }

    // 2. Nếu có .env.local và URL hợp lệ, cập nhật luôn .env.local để đồng bộ toàn diện
    try {
      if (cleanUrl && cleanKey && fs.existsSync(ENV_LOCAL_FILE)) {
        let envContent = fs.readFileSync(ENV_LOCAL_FILE, 'utf-8');
        if (/NEXT_PUBLIC_SUPABASE_URL=/.test(envContent)) {
          envContent = envContent.replace(/NEXT_PUBLIC_SUPABASE_URL=.*/, `NEXT_PUBLIC_SUPABASE_URL=${cleanUrl}`);
        } else {
          envContent += `\nNEXT_PUBLIC_SUPABASE_URL=${cleanUrl}`;
        }

        if (/NEXT_PUBLIC_SUPABASE_ANON_KEY=/.test(envContent)) {
          envContent = envContent.replace(/NEXT_PUBLIC_SUPABASE_ANON_KEY=.*/, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${cleanKey}`);
        } else {
          envContent += `\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${cleanKey}`;
        }

        fs.writeFileSync(ENV_LOCAL_FILE, envContent, 'utf-8');
      }
    } catch (envErr) {
      console.warn('[database-profile] Không thể cập nhật .env.local:', envErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Đã cập nhật URL và Khóa CSDL mới xuống ổ cứng máy chủ thành công!',
      data: profileData,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi lưu cấu hình CSDL' },
      { status: 500 }
    );
  }
}
