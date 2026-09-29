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

// Thông tin Cloud Supabase mặc định dùng làm chốt chặn an toàn khi chạy trên Vercel hoặc chưa cấu hình file .env
const DEFAULT_SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';

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
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

  try {
    for (const f of ['.env.local', '.env']) {
      const p = path.join(process.cwd(), f);
      if (fs.existsSync(p)) {
        const lines = fs.readFileSync(p, 'utf-8').split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [k, ...v] = trimmed.split('=');
            const keyName = k.trim();
            const val = v.join('=').trim().replace(/^['"]|['"]$/g, '');
            if (keyName === 'NEXT_PUBLIC_SUPABASE_URL' && !url) url = val;
            if ((keyName === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' || keyName === 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY') && !anonKey) anonKey = val;
          }
        }
      }
    }

    if (fs.existsSync(PROFILE_FILE)) {
      const prof = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
      if (prof.url && prof.anonKey) {
        url = prof.url;
        anonKey = prof.anonKey;
      }
    }
  } catch {}

  // Chốt chặn mặc định đảm bảo Vercel và máy cục bộ luôn luôn kết nối được Cloud
  if (!url) url = DEFAULT_SUPABASE_URL;
  if (!anonKey) anonKey = DEFAULT_SUPABASE_KEY;

  return { url, anonKey };
}

// Helper: Cập nhật mật khẩu và ghi nhận mã tự hủy vào file CSDL Local SQL (bakery_local_db.json)
function syncPasswordAndBurnToLocalSqlFiles(newPassword: string, codeToBurn?: string) {
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
          if (dbJson.bakery_security_config || dbJson.security_config) {
            const sec = dbJson.bakery_security_config || dbJson.security_config;
            sec.adminPasswordHash = newPassword;
            sec.updated_at = new Date().toISOString();
            if (Array.isArray(sec.accounts)) {
              sec.accounts = sec.accounts.map((acc: any) =>
                acc.role === 'admin' ? { ...acc, password: newPassword } : acc
              );
            }
            if (codeToBurn) {
              if (!Array.isArray(sec.active_otp_codes)) sec.active_otp_codes = [];
              if (!Array.isArray(sec.used_otp_codes)) sec.used_otp_codes = [];
              burnCodeInLists(sec.active_otp_codes, sec.used_otp_codes, codeToBurn);
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

// Helper: Đọc danh sách mã đã dùng từ các tệp Local SQL
function getUsedCodesFromLocalSqlFiles(): string[] {
  const burned: string[] = [];
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
          const sec = dbJson.bakery_security_config || dbJson.security_config;
          if (Array.isArray(sec?.used_otp_codes)) {
            for (const item of sec.used_otp_codes) {
              const c = typeof item === 'string' ? item : item?.code;
              if (c) burned.push(c);
            }
          }
        }
      }
    }
  } catch {}
  return burned;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rootKey, newAdminPassword, clientBurnedCodes } = body;
    const cleanInput = (rootKey || '').trim();

    if (!cleanInput) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp Mã Cứu Hộ Dùng 1 Lần!' },
        { status: 400 }
      );
    }

    // 0. Kiểm tra chốt chặn tức thì từ danh sách mã đã hủy của Trình duyệt (Client-Side Burned Codes)
    if (Array.isArray(clientBurnedCodes) && isCodeInList(clientBurnedCodes, cleanInput)) {
      return NextResponse.json(
        {
          success: false,
          error: 'MÃ CỨU HỘ NÀY ĐÃ ĐƯỢC SỬ DỤNG TRƯỚC ĐÓ VÀ ĐÃ BỊ HỦY! Mỗi mã chỉ có hiệu lực 1 lần duy nhất.',
        },
        { status: 403 }
      );
    }

    const serverSecret = (process.env.ROOT_ADMIN_KEY || process.env.ADMIN_ROOT_KEY || MASTER_HARD_ROOT_SECRET).trim();
    const targetPassword = (newAdminPassword || '').trim() || 'admin123';
    const isMasterMatch = cleanInput === 'Quyviet97@' || cleanInput === serverSecret;
    const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getActiveSupabaseCredentials();

    // ── BƯỚC 1: XÁC THỰC MÃ TỐI CAO MASTER (FAILSAFE KHÔNG PHỤ THUỘC BẤT KỲ CSDL NÀO) ──
    if (isMasterMatch) {
      syncPasswordAndBurnToLocalSqlFiles(targetPassword);
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

          const { error: upsertErr } = await supabase.from('recipes').upsert(
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
          if (upsertErr) {
            await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`);
            await supabase.from('recipes').insert({
              id: DB_ROW_SECURITY_ID,
              name: DB_ROW_SECURITY_NAME,
              yield_qty: 1,
              yield_unit: 'chiếc',
              cost_per_unit: 0,
              total_material_cost: 0,
              notes: JSON.stringify(cfg),
              is_active: false,
            });
          }
        } catch {}
      }

      return NextResponse.json({
        success: true,
        message: `Xác thực Master tối cao thành công! Mật khẩu Admin đã được đặt lại về: "${targetPassword}"`,
        newPassword: targetPassword,
      });
    }

    // ── BƯỚC 2: ĐỌC DỮ LIỆU CSDL LOCAL (FILE JSON) VÀ SUPABASE CLOUD ──
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
    const localSqlUsed = getUsedCodesFromLocalSqlFiles();

    // 2.1. Kiểm tra xem mã đã bị hủy cục bộ ở file .local_emergency_otp hoặc bakery_local_db chưa
    if (isCodeInList(localUsed, cleanInput) || isCodeInList(localSqlUsed, cleanInput)) {
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

    // 2.2. Kiểm tra xem mã đã bị hủy trên Cloud Supabase chưa
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
    // 4.1. Hủy mã cục bộ (Local SQL & local OTP file)
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
      syncPasswordAndBurnToLocalSqlFiles(targetPassword, cleanInput);
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

        const { error: upsertErr } = await supabaseClient.from('recipes').upsert(
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

        if (upsertErr) {
          await supabaseClient.from('recipes').delete().or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`);
          await supabaseClient.from('recipes').insert({
            id: DB_ROW_SECURITY_ID,
            name: DB_ROW_SECURITY_NAME,
            yield_qty: 1,
            yield_unit: 'chiếc',
            cost_per_unit: 0,
            total_material_cost: 0,
            notes: JSON.stringify(cloud),
            is_active: false,
          });
        }
      } catch (e) {
        console.warn('[root-verify] Lỗi tự hủy mã Cloud:', e);
      }
    }

    // Thu thập danh sách tất cả mã đã hủy để gửi về cho client lưu vào localStorage
    const burnedNorm = normalizeOtpCode(cleanInput);
    const combinedBurned = Array.from(new Set([
      cleanInput,
      burnedNorm,
      `ADM-${burnedNorm}`,
      ...localUsed.map((i: any) => typeof i === 'string' ? i : i?.code),
      ...cloudUsed.map((i: any) => typeof i === 'string' ? i : i?.code),
      ...(Array.isArray(clientBurnedCodes) ? clientBurnedCodes : []),
    ])).filter(Boolean);

    return NextResponse.json({
      success: true,
      message: `Xác thực Mã Đăng Nhập 1 Lần thành công! Mã ${cleanInput} đã TỰ HỦY VĨNH VIỄN và mật khẩu Admin đã được đặt lại về: "${targetPassword}"`,
      newPassword: targetPassword,
      burnedCode: cleanInput,
      used_otp_codes: combinedBurned,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi xử lý xác thực Root' },
      { status: 500 }
    );
  }
}
