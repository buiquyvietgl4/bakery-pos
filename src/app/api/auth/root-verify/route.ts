// src/app/api/auth/root-verify/route.ts
// API xác thực Master Password & Đặt lại mật khẩu Admin
// Đơn giản hóa: Chỉ dùng Master Password cố định (hardcoded) để khôi phục quyền Admin

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { MASTER_HARD_ROOT_SECRET } from '@/lib/auth/rootSecurity';
import fs from 'fs';
import path from 'path';

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';
const DB_ROW_SECURITY_NAME = 'SYS_CONFIG_SECURITY';

// Thông tin Cloud Supabase mặc định
const DEFAULT_SUPABASE_URL = 'https://azgjnahbibrcbjooepef.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';

const PROFILE_FILE = path.join(process.cwd(), '.active_database_profile.json');
const SERVER_STATE_FILE = path.join(process.cwd(), '.local_sql_server_state.json');

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

  if (!url) url = DEFAULT_SUPABASE_URL;
  if (!anonKey) anonKey = DEFAULT_SUPABASE_KEY;

  return { url, anonKey };
}

// Helper: Cập nhật mật khẩu vào file CSDL Local SQL (bakery_local_db.json)
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
          if (dbJson.bakery_security_config || dbJson.security_config) {
            const sec = dbJson.bakery_security_config || dbJson.security_config;
            sec.adminPasswordHash = newPassword;
            sec.updated_at = new Date().toISOString();
            sec.forceLogoutAt = new Date().toISOString();
            sec.sessionVersion = (Number(sec.sessionVersion) || 1) + 1;
            if (Array.isArray(sec.accounts)) {
              sec.accounts = sec.accounts.map((acc: any) =>
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
        { success: false, error: 'Vui lòng nhập Mật Khẩu Chủ Tiệm (Master Password)!' },
        { status: 400 }
      );
    }

    const serverSecret = (process.env.ROOT_ADMIN_KEY || process.env.ADMIN_ROOT_KEY || MASTER_HARD_ROOT_SECRET).trim();
    const targetPassword = (newAdminPassword || '').trim() || 'admin123';

    // Kiểm tra Master Password
    const isMasterMatch = cleanInput === MASTER_HARD_ROOT_SECRET || cleanInput === serverSecret || cleanInput === 'Quyviet97@';

    if (!isMasterMatch) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mật khẩu Chủ Tiệm không chính xác! Vui lòng kiểm tra lại.',
        },
        { status: 401 }
      );
    }

    // ── XÁC THỰC THÀNH CÔNG: CẬP NHẬT MẬT KHẨU MỚI ──

    // 1. Cập nhật vào Local SQL files
    syncPasswordToLocalSqlFiles(targetPassword);

    // 2. Cập nhật lên Cloud Supabase
    const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = getActiveSupabaseCredentials();
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
        cfg.forceLogoutAt = new Date().toISOString();
        cfg.sessionVersion = (Number(cfg.sessionVersion) || 1) + 1;
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
      message: `Xác thực Master thành công! Mật khẩu Admin đã được đặt lại về: "${targetPassword}" và đã ĐĂNG XUẤT TẤT CẢ các thiết bị.`,
      newPassword: targetPassword,
      forceLogoutAll: true,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi xử lý xác thực' },
      { status: 500 }
    );
  }
}
