// src/app/api/system/database-profile/route.ts
// Đồng bộ cấu hình CSDL URL và Anon Key từ màn hình POS / Admin xuống ổ cứng máy chủ
// Giúp file TAO_MA_CUU_HO.bat và các tiến trình máy chủ luôn tự động kết nối đúng URL mới nhất

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

const PROFILE_FILE = path.join(process.cwd(), '.active_database_profile.json');
const TMP_PROFILE_FILE = path.join(os.tmpdir(), '.active_database_profile.json');
const ENV_LOCAL_FILE = path.join(process.cwd(), '.env.local');

const DEFAULT_PROD_URL = 'https://fhiuojcvsouwugatnmve.supabase.co';
const DEFAULT_PROD_KEY = 'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED';

function readSavedProfile(): any | null {
  // 1. Thử đọc từ globalThis (in-memory)
  if ((globalThis as any).__active_db_profile) {
    return (globalThis as any).__active_db_profile;
  }
  // 2. Thử đọc từ PROFILE_FILE trong root project
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const raw = fs.readFileSync(PROFILE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.url) {
        (globalThis as any).__active_db_profile = data;
        return data;
      }
    }
  } catch {}
  // 3. Thử đọc từ TMP_PROFILE_FILE (dành cho container / Vercel Serverless)
  try {
    if (fs.existsSync(TMP_PROFILE_FILE)) {
      const raw = fs.readFileSync(TMP_PROFILE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data && data.url) {
        (globalThis as any).__active_db_profile = data;
        return data;
      }
    }
  } catch {}
  return null;
}

export async function GET() {
  try {
    const saved = readSavedProfile();
    if (saved && saved.url) {
      return NextResponse.json({ success: true, data: saved });
    }
  } catch (err) {
    console.warn('[database-profile] Lỗi đọc file profile:', err);
  }

  return NextResponse.json({
    success: true,
    data: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_PROD_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PROD_KEY,
      activeProfileId: 'production',
      updatedAt: new Date().toISOString(),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, anonKey, activeProfileId, name } = body;

    const cleanUrl = (url || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
    const cleanKey = (anonKey || '').trim();

    const profileData = {
      activeProfileId: activeProfileId || 'production',
      name: name || 'CSDL Chính (Vận Hành)',
      url: cleanUrl,
      anonKey: cleanKey,
      updatedAt: new Date().toISOString(),
    };

    // 1. Lưu vào in-memory để phục vụ ngay các request tiếp theo
    (globalThis as any).__active_db_profile = profileData;

    // 2. Lưu vào .active_database_profile.json
    try {
      fs.writeFileSync(PROFILE_FILE, JSON.stringify(profileData, null, 2), 'utf-8');
    } catch (writeErr) {
      // Bỏ qua lỗi read-only trên serverless
    }

    // 3. Lưu vào TMP_PROFILE_FILE (luôn ghi được trên hầu hết hệ điều hành)
    try {
      fs.writeFileSync(TMP_PROFILE_FILE, JSON.stringify(profileData, null, 2), 'utf-8');
    } catch {}

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
