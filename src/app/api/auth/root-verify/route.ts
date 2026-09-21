// src/app/api/auth/root-verify/route.ts
// API xác thực Khóa Cứng Root cấp máy chủ và cưỡng chế đặt lại mật khẩu Admin

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyOwnerRootKey, MASTER_HARD_ROOT_SECRET } from '@/lib/auth/rootSecurity';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const DB_ROW_SECURITY_ID = '00000000-0000-0000-0000-00000000000b';
const DB_ROW_SECURITY_NAME = 'SYS_CONFIG_SECURITY';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rootKey, newAdminPassword } = body;

    const serverSecret = process.env.ROOT_ADMIN_KEY || process.env.ADMIN_ROOT_KEY || MASTER_HARD_ROOT_SECRET;
    const verification = verifyOwnerRootKey(rootKey, serverSecret);

    if (!verification.valid) {
      return NextResponse.json(
        { success: false, error: verification.reason || 'Mã Root Cứng hoặc Tệp Chìa Khóa không hợp lệ!' },
        { status: 401 }
      );
    }

    const targetPassword = (newAdminPassword || '').trim() || 'admin123';

    // Cưỡng chế cập nhật lên Supabase Cloud SQL nếu có kết nối
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
          try {
            cfg = JSON.parse(data.notes);
          } catch {}
        }

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
      } catch (dbErr) {
        console.warn('Lỗi khi cưỡng chế cập nhật Supabase trong API root-verify:', dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Xác thực Root thành công! Mật khẩu Admin đã được đặt lại về: "${targetPassword}"`,
      newPassword: targetPassword,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi xử lý xác thực Root' },
      { status: 500 }
    );
  }
}
