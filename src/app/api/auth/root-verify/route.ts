// src/app/api/auth/root-verify/route.ts
// API xác thực Mã Cứu Hộ Dùng 1 Lần (Single-Use OTP) & Tự hủy mã ngay sau khi sử dụng

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MASTER_HARD_ROOT_SECRET } from '@/lib/auth/rootSecurity';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';
const DB_ROW_SECURITY_NAME = 'SYS_CONFIG_SECURITY';

import fs from 'fs';
import path from 'path';

const LOCAL_OTP_FILE = path.join(process.cwd(), '.local_emergency_otp.json');
const SERVER_STATE_FILE = path.join(process.cwd(), '.local_sql_server_state.json');

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

    // ── BƯỚC 1: KIỂM TRA MÃ TRONG CSDL CỤC BỘ (LOCAL SQL / OFFLINE VAULT) ──
    let localVerified = false;
    let localCfg: any = null;

    try {
      if (fs.existsSync(LOCAL_OTP_FILE)) {
        const raw = fs.readFileSync(LOCAL_OTP_FILE, 'utf-8');
        localCfg = JSON.parse(raw);
        const localActive: any[] = Array.isArray(localCfg.active_otp_codes) ? localCfg.active_otp_codes : [];
        const localUsed: any[] = Array.isArray(localCfg.used_otp_codes) ? localCfg.used_otp_codes : [];

        // Kiểm tra xem mã đã bị hủy cục bộ chưa
        const isUsedLocal = localUsed.some(
          (item) => (typeof item === 'string' ? item : item.code) === cleanInput
        ) || localActive.some((item) => item.code === cleanInput && item.used === true);

        if (isUsedLocal && !isMasterMatch) {
          return NextResponse.json(
            {
              success: false,
              error: 'MÃ CỨU HỘ NÀY ĐÃ ĐƯỢC SỬ DỤNG TRƯỚC ĐÓ VÀ ĐÃ BỊ HỦY! Mỗi mã chỉ có hiệu lực 1 lần duy nhất.',
            },
            { status: 403 }
          );
        }

        // Tìm trong mã đang kích hoạt cục bộ
        const localIdx = localActive.findIndex((item) => item.code === cleanInput && !item.used);
        if (localIdx !== -1) {
          // Tự hủy mã cục bộ ngay tức thì
          const burned = localActive[localIdx];
          burned.used = true;
          burned.used_at = new Date().toISOString();
          localUsed.push(burned);
          localActive.splice(localIdx, 1);

          localCfg.active_otp_codes = localActive;
          localCfg.used_otp_codes = localUsed;
          localCfg.adminPasswordHash = targetPassword;
          localCfg.updated_at = new Date().toISOString();

          fs.writeFileSync(LOCAL_OTP_FILE, JSON.stringify(localCfg, null, 2), 'utf-8');
          syncPasswordToLocalSqlFiles(targetPassword);
          localVerified = true;
        }
      }
    } catch (localErr) {
      console.warn('[root-verify] Lỗi kiểm tra CSDL Local:', localErr);
    }

    // ── BƯỚC 2: XÁC THỰC MÃ TỐI CAO MASTER (FAILSAFE KHÔNG PHỤ THUỘC BẤT KỲ CSDL NÀO) ──
    if (isMasterMatch) {
      syncPasswordToLocalSqlFiles(targetPassword);
      // Đồng bộ sang Cloud nếu có mạng
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        try {
          const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
          await supabase.from('recipes').upsert(
            {
              id: DB_ROW_SECURITY_ID,
              name: DB_ROW_SECURITY_NAME,
              yield_qty: 1,
              yield_unit: 'chiếc',
              cost_per_unit: 0,
              total_material_cost: 0,
              notes: JSON.stringify({ adminPasswordHash: targetPassword, updated_at: new Date().toISOString() }),
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

    // Nếu đã xác thực thành công qua file Local Cục Bộ:
    if (localVerified) {
      // Cố gắng đồng bộ hủy mã lên Supabase nếu có mạng
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
          const activeCodes: any[] = Array.isArray(cfg.active_otp_codes) ? cfg.active_otp_codes : [];
          const usedCodes: any[] = Array.isArray(cfg.used_otp_codes) ? cfg.used_otp_codes : [];
          const idx = activeCodes.findIndex((item) => item.code === cleanInput);
          if (idx !== -1) {
            const b = activeCodes[idx];
            b.used = true;
            b.used_at = new Date().toISOString();
            usedCodes.push(b);
            activeCodes.splice(idx, 1);
          }
          cfg.active_otp_codes = activeCodes;
          cfg.used_otp_codes = usedCodes;
          cfg.adminPasswordHash = targetPassword;
          cfg.updated_at = new Date().toISOString();

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
        message: `Xác thực CSDL Cục Bộ (Local SQL) thành công! Mã cứu hộ đã TỰ HỦY và mật khẩu Admin đã được đặt lại về: "${targetPassword}"`,
        newPassword: targetPassword,
      });
    }

    // ── BƯỚC 3: NẾU CHƯA XÁC THỰC ĐƯỢC CỤC BỘ → KIỂM TRA TRÊN CLOUD SUPABASE ──
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mã cứu hộ không tồn tại trong CSDL Cục Bộ và hệ thống chưa cấu hình Cloud Supabase!',
        },
        { status: 401 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await supabase
      .from('recipes')
      .select('id, notes')
      .or(`id.eq.${DB_ROW_SECURITY_ID},name.eq.${DB_ROW_SECURITY_NAME}`)
      .limit(1)
      .maybeSingle();

    let cfg: any = {};
    if (data?.notes) {
      try {
        cfg = JSON.parse(data.notes);
      } catch {}
    }

    const activeCodes: any[] = Array.isArray(cfg.active_otp_codes) ? cfg.active_otp_codes : [];
    const usedCodes: any[] = Array.isArray(cfg.used_otp_codes) ? cfg.used_otp_codes : [];

    // Kiểm tra đã sử dụng chưa
    const isAlreadyUsed = usedCodes.some(
      (item) => (typeof item === 'string' ? item : item.code) === cleanInput
    ) || activeCodes.some(
      (item) => item.code === cleanInput && item.used === true
    );

    if (isAlreadyUsed) {
      return NextResponse.json(
        {
          success: false,
          error: 'MÃ CỨU HỘ NÀY ĐÃ ĐƯỢC SỬ DỤNG TRƯỚC ĐÓ VÀ ĐÃ BỊ HỦY! Mỗi mã chỉ có hiệu lực 1 lần duy nhất.',
        },
        { status: 403 }
      );
    }

    // Kiểm tra trong mã đang kích hoạt
    const activeIndex = activeCodes.findIndex((item) => item.code === cleanInput && !item.used);

    if (activeIndex === -1) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mã cứu hộ không tồn tại hoặc không chính xác! Chỉ mã được tạo từ máy tính có mã nguồn gốc mới có hiệu lực.',
        },
        { status: 401 }
      );
    }

    // Hủy mã trên Cloud Supabase
    const usedItem = activeCodes[activeIndex];
    usedItem.used = true;
    usedItem.used_at = new Date().toISOString();

    usedCodes.push(usedItem);
    activeCodes.splice(activeIndex, 1);

    cfg.active_otp_codes = activeCodes;
    cfg.used_otp_codes = usedCodes;
    cfg.adminPasswordHash = targetPassword;
    cfg.updated_at = new Date().toISOString();

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

    // Đồng bộ ngược lại file Local SQL nếu có
    syncPasswordToLocalSqlFiles(targetPassword);

    return NextResponse.json({
      success: true,
      message: `Xác thực Cloud thành công! Mã cứu hộ đã được HỦY VĨNH VIỄN và mật khẩu Admin đã được đặt lại về: "${targetPassword}"`,
      newPassword: targetPassword,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi xử lý xác thực Root' },
      { status: 500 }
    );
  }
}
