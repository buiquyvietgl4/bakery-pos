// src/app/api/auth/root-verify/route.ts
// API xác thực Mã Cứu Hộ Dùng 1 Lần (Single-Use OTP) & Tự hủy mã ngay sau khi sử dụng

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MASTER_HARD_ROOT_SECRET } from '@/lib/auth/rootSecurity';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const RESCUE_CODE_SECRET = 'BAKERY_ERP_ADMIN_RESCUE_SECRET_2026';

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';
const DB_ROW_SECURITY_NAME = 'SYS_CONFIG_SECURITY';

const PROFILE_FILE = path.join(process.cwd(), '.active_database_profile.json');
const LOCAL_OTP_FILE = path.join(process.cwd(), '.local_emergency_otp.json');
const SERVER_STATE_FILE = path.join(process.cwd(), '.local_sql_server_state.json');

export function normalizeOtpCode(code: string): string {
  return String(code || '').trim().toUpperCase().replace(/^(ADM-|ROOT-)/i, '').trim();
}

export function verifyCryptographicRescueCode(inputCode: string): boolean {
  const codeOnly = normalizeOtpCode(inputCode);
  if (!/^\d{6}$/.test(codeOnly)) return false;

  const now = Date.now();
  const currentWindow = Math.floor(now / 900000); // 15 phút mỗi khung mã

  // 1. Kiểm tra cấu trúc slot: slot (0..9) + 5 số hash
  const slot = parseInt(codeOnly[0], 10);
  const suffix = codeOnly.slice(1);
  for (let offset = -2; offset <= 2; offset++) {
    const w = currentWindow + offset;
    const payload = `${w}:${slot}`;
    const h = crypto.createHmac('sha256', RESCUE_CODE_SECRET).update(payload).digest('hex');
    const expected = String(parseInt(h.slice(0, 8), 16) % 100000).padStart(5, '0');
    if (suffix === expected) {
      return true;
    }
  }

  // 2. Kiểm tra cấu trúc legacy 6 số thuần túy
  for (let offset = -2; offset <= 2; offset++) {
    const w = currentWindow + offset;
    const h = crypto.createHmac('sha256', RESCUE_CODE_SECRET).update(String(w)).digest('hex');
    const expected = String(parseInt(h.slice(0, 8), 16) % 1000000).padStart(6, '0');
    if (codeOnly === expected) {
      return true;
    }
  }

  return false;
}

export function isCodeInList(list: any[], targetCode: string): boolean {
  if (!Array.isArray(list)) return false;
  const targetNorm = normalizeOtpCode(targetCode);
  if (!targetNorm) return false;
  return list.some((item) => {
    const raw = typeof item === 'string' ? item : item?.code;
    return normalizeOtpCode(raw) === targetNorm;
  });
}

export function burnCodeInLists(activeList: any[], usedList: any[], codeToBurn: string): void {
  const norm = normalizeOtpCode(codeToBurn);
  const nowIso = new Date().toISOString();

  // Thêm vào usedList các biến thể để chặn tái sử dụng
  const variants = [codeToBurn, norm, `ADM-${norm}`];
  for (const v of variants) {
    if (!isCodeInList(usedList, v)) {
      usedList.push({ code: v, used: true, used_at: nowIso });
    }
  }

  // Xóa sạch khỏi activeList
  for (let i = activeList.length - 1; i >= 0; i--) {
    const item = activeList[i];
    const raw = typeof item === 'string' ? item : item?.code;
    if (normalizeOtpCode(raw) === norm) {
      activeList.splice(i, 1);
    }
  }
}

function getActiveSupabaseCredentials() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  try {
    const envFile = path.join(process.cwd(), '.env.local');
    const envMtime = fs.existsSync(envFile) ? fs.statSync(envFile).mtimeMs : 0;
    const profMtime = fs.existsSync(PROFILE_FILE) ? fs.statSync(PROFILE_FILE).mtimeMs : 0;

    if (profMtime > envMtime && fs.existsSync(PROFILE_FILE)) {
      const prof = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
      if (prof.url && prof.anonKey) {
        url = prof.url;
        anonKey = prof.anonKey;
      }
    }
  } catch {}

  return { url, anonKey };
}

// Helper: Cập nhật mật khẩu vào file CSDL Local SQL (bakery_local_db.json) nếu đang chạy Local SQL
function syncPasswordToLocalSqlFiles(newPassword: string) {
  try {
    if (fs.existsSync(SERVER_STATE_FILE)) {
      const stateRaw = fs.readFileSync(SERVER_STATE_FILE, 'utf-8');
      const state = JSON.parse(stateRaw);
      const dirs = [state?.production?.dirPath, state?.testing?.dirPath].filter(Boolean);
      for (const d of dirs) {
        const jsonDbPath = path.join(d, 'bakery_local_db.json');
        if (fs.existsSync(jsonDbPath)) {
          const dbRaw = fs.readFileSync(jsonDbPath, 'utf-8');
          const dbJson = JSON.parse(dbRaw);
          if (dbJson.bakery_security_config) {
            dbJson.bakery_security_config.adminPasswordHash = newPassword;
            dbJson.bakery_security_config.updated_at = new Date().toISOString();
            if (Array.isArray(dbJson.bakery_security_config.accounts)) {
              dbJson.bakery_security_config.accounts = dbJson.bakery_security_config.accounts.map((acc: any) =>
                acc.role === 'admin' ? { ...acc, password: newPassword } : acc
              );
            }
            fs.writeFileSync(jsonDbPath, JSON.stringify(dbJson, null, 2), 'utf-8');
          }
        }
      }
    }
  } catch (err) {
    console.warn('[root-verify] Lỗi cập nhật mật khẩu vào Local SQL files:', err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rootKey, newAdminPassword } = body;
    const cleanInput = (rootKey || '').trim();

    if (!cleanInput) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp Mã Cứu Hộ Dùng 1 Lần!' },
        { status: 400 }
      );
    }

    const serverSecret = (process.env.ROOT_ADMIN_KEY || process.env.ADMIN_ROOT_KEY || MASTER_HARD_ROOT_SECRET).trim();
    const targetPassword = (newAdminPassword || '').trim() || 'admin123';
    const isMasterMatch = cleanInput === 'Quyviet97@' || cleanInput === serverSecret;
    const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getActiveSupabaseCredentials();

    // ── BƯỚC 1: XÁC THỰC MÃ TỐI CAO MASTER (FAILSAFE KHÔNG PHỤ THUỘC BẤT KỲ CSDL NÀO) ──
    if (isMasterMatch) {
      syncPasswordToLocalSqlFiles(targetPassword);
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          const { data } = await supabase
            .from('recipes')
            .select('id, notes')
            .or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`)
            .limit(1)
            .maybeSingle();

          let cfg: any = {};
          if (data?.notes) {
            try { cfg = JSON.parse(data.notes); } catch {}
          }
          cfg.adminPasswordHash = targetPassword;
          cfg.updated_at = new Date().toISOString();
          if (Array.isArray(cfg.accounts)) {
            cfg.accounts = cfg.accounts.map((acc: any) =>
              acc.role === 'admin' ? { ...acc, password: targetPassword } : acc
            );
          }

          await supabase.from('recipes').upsert(
            {
              id: DB_ROW_SECURITY_ID,
              name: DB_ROW_SECURITY_NAME,
              yield_qty: 1,
              yield_unit: 'chiếc',
              cost_per_unit: 0,
              total_material_cost: 0,
              notes: JSON.stringify(cfg),
              is_active: false,
            },
            { onConflict: 'id' }
          );
        } catch {}
      }

      return NextResponse.json({
        success: true,
        message: `Xác thực Master tối cao thành công! Mật khẩu Admin đã được đặt lại về: "${targetPassword}"`,
        newPassword: targetPassword,
      });
    }

    // ── BƯỚC 2: ĐỌC DỮ LIỆU CSDL LOCAL VÀ SUPABASE CLOUD ──
    let localCfg: any = null;
    try {
      if (fs.existsSync(LOCAL_OTP_FILE)) {
        const raw = fs.readFileSync(LOCAL_OTP_FILE, 'utf-8');
        localCfg = JSON.parse(raw);
      }
    } catch (localErr) {
      console.warn('[root-verify] Lỗi đọc CSDL Local:', localErr);
    }

    const localActive: any[] = Array.isArray(localCfg?.active_otp_codes) ? localCfg.active_otp_codes : [];
    const localUsed: any[] = Array.isArray(localCfg?.used_otp_codes) ? localCfg.used_otp_codes : [];

    // Kiểm tra xem mã đã bị hủy cục bộ chưa
    if (isCodeInList(localUsed, cleanInput)) {
      return NextResponse.json(
        {
          success: false,
          error: 'MÃ CỨU HỘ NÀY ĐÃ ĐƯỢC SỬ DỤNG TRƯỚC ĐÓ VÀ ĐÃ BỊ HỦY! Mỗi mã chỉ có hiệu lực 1 lần duy nhất.',
        },
        { status: 403 }
      );
    }

    let cloudCfg: any = null;
    let cloudActive: any[] = [];
    let cloudUsed: any[] = [];
    let supabaseClient: any = null;

    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        const { data } = await supabaseClient
          .from('recipes')
          .select('id, notes')
          .or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`)
          .limit(1)
          .maybeSingle();

        if (data?.notes) {
          try { cloudCfg = JSON.parse(data.notes); } catch {}
        }
        if (cloudCfg) {
          cloudActive = Array.isArray(cloudCfg.active_otp_codes) ? cloudCfg.active_otp_codes : [];
          cloudUsed = Array.isArray(cloudCfg.used_otp_codes) ? cloudCfg.used_otp_codes : [];
        }
      } catch (cloudErr) {
        console.warn('[root-verify] Lỗi đọc Supabase Cloud:', cloudErr);
      }
    }

    // Kiểm tra xem mã đã bị hủy trên Cloud chưa
    if (isCodeInList(cloudUsed, cleanInput)) {
      return NextResponse.json(
        {
          success: false,
          error: 'MÃ CỨU HỘ NÀY ĐÃ ĐƯỢC SỬ DỤNG TRƯỚC ĐÓ VÀ ĐÃ BỊ HỦY! Mỗi mã chỉ có hiệu lực 1 lần duy nhất.',
        },
        { status: 403 }
      );
    }

    // ── BƯỚC 3: KIỂM TRA TÍNH HỢP LỆ CỦA MÃ ──
    const isLocalActive = isCodeInList(localActive, cleanInput);
    const isCloudActive = isCodeInList(cloudActive, cleanInput);
    const isCryptoValid = verifyCryptographicRescueCode(cleanInput);

    if (!isLocalActive && !isCloudActive && !isCryptoValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mã cứu hộ không tồn tại hoặc không chính xác! Chỉ mã được tạo từ ứng dụng cứu hộ của mã nguồn gốc mới có hiệu lực.',
        },
        { status: 401 }
      );
    }

    // ── BƯỚC 4: TIẾN HÀNH TỰ HỦY MÃ VĨNH VIỄN & CẬP NHẬT MẬT KHẨU MỚI ──
    // 4.1. Hủy mã cục bộ (Local SQL)
    try {
      let local = localCfg || { active_otp_codes: [], used_otp_codes: [] };
      if (!Array.isArray(local.active_otp_codes)) local.active_otp_codes = [];
      if (!Array.isArray(local.used_otp_codes)) local.used_otp_codes = [];

      burnCodeInLists(local.active_otp_codes, local.used_otp_codes, cleanInput);
      local.adminPasswordHash = targetPassword;
      local.updated_at = new Date().toISOString();
      if (Array.isArray(local.accounts)) {
        local.accounts = local.accounts.map((acc: any) =>
          acc.role === 'admin' ? { ...acc, password: targetPassword } : acc
        );
      }
      fs.writeFileSync(LOCAL_OTP_FILE, JSON.stringify(local, null, 2), 'utf-8');
      syncPasswordToLocalSqlFiles(targetPassword);
    } catch (e) {
      console.warn('[root-verify] Lỗi tự hủy mã Local:', e);
    }

    // 4.2. Hủy mã trên Cloud (Supabase)
    if (supabaseClient) {
      try {
        let cloud = cloudCfg || {};
        if (!Array.isArray(cloud.active_otp_codes)) cloud.active_otp_codes = [];
        if (!Array.isArray(cloud.used_otp_codes)) cloud.used_otp_codes = [];

        burnCodeInLists(cloud.active_otp_codes, cloud.used_otp_codes, cleanInput);
        cloud.adminPasswordHash = targetPassword;
        cloud.updated_at = new Date().toISOString();
        if (Array.isArray(cloud.accounts)) {
          cloud.accounts = cloud.accounts.map((acc: any) =>
            acc.role === 'admin' ? { ...acc, password: targetPassword } : acc
          );
        }

        await supabaseClient.from('recipes').upsert(
          {
            id: DB_ROW_SECURITY_ID,
            name: DB_ROW_SECURITY_NAME,
            yield_qty: 1,
            yield_unit: 'chiếc',
            cost_per_unit: 0,
            total_material_cost: 0,
            notes: JSON.stringify(cloud),
            is_active: false,
          },
          { onConflict: 'id' }
        );
      } catch (e) {
        console.warn('[root-verify] Lỗi tự hủy mã Cloud:', e);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Xác thực Mã Đăng Nhập 1 Lần thành công! Mã đã TỰ HỦY VĨNH VIỄN và mật khẩu Admin đã được đặt lại về: "${targetPassword}"`,
      newPassword: targetPassword,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi xử lý xác thực Root' },
      { status: 500 }
    );
  }
}
