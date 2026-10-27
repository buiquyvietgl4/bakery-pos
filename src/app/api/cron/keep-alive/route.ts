// src/app/api/cron/keep-alive/route.ts
/**
 * ==============================================================================
 * API ENDPOINT: SUPABASE ANTI-INACTIVITY KEEP-ALIVE
 * ==============================================================================
 * Endpoint này phục vụ:
 * 1. Vercel Cron Job tự động (chạy mỗi 2 ngày qua cấu hình vercel.json)
 * 2. GitHub Actions Scheduled Workflow (chạy mỗi 3 ngày dự phòng)
 * 3. Client In-App Heartbeat & Nút bấm Kích hoạt thủ công từ Trang Quản Trị
 *
 * Đảm bảo 100% Read-Only, không ghi, không sửa đổi hay xóa bất kỳ dữ liệu nào.
 * ==============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  return handleKeepAlive(req);
}

export async function POST(req: NextRequest) {
  return handleKeepAlive(req);
}

async function handleKeepAlive(req: NextRequest) {
  const startTime = Date.now();
  const searchParams = req.nextUrl.searchParams;
  const source = (searchParams.get('source') || 'vercel-cron') as any;

  try {
    // 1. Xác định thông tin Supabase
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhiuojcvsouwugatnmve.supabase.co';
    const targetUrl = rawUrl.trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/i, '');
    const targetKey = (
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED'
    ).trim();

    if (!targetUrl || !targetKey) {
      return NextResponse.json(
        {
          success: false,
          timestamp: Date.now(),
          latencyMs: Date.now() - startTime,
          message: 'Thiếu cấu hình biến môi trường Supabase URL hoặc Anon Key.',
          dataModified: false,
          source,
        },
        { status: 500 }
      );
    }

    // 2. Thực thi truy vấn siêu nhẹ (Head/Select 1) vào bảng dữ liệu
    const client = createClient(targetUrl, targetKey);
    const candidateTables = ['recipes', 'orders', 'products', 'bakery_bom_settings', 'system_configs'];
    let chosenTable = 'recipes';
    let isSuccess = false;
    let statusCode = 200;
    let errorMsg: string | undefined;

    for (const table of candidateTables) {
      try {
        const { status, error } = await client
          .from(table)
          .select('id', { count: 'exact', head: true });

        if (!error && (status === 200 || status === 204)) {
          chosenTable = table;
          statusCode = status;
          isSuccess = true;
          break;
        } else if (error) {
          errorMsg = error.message;
        }
      } catch (err: any) {
        errorMsg = err?.message || String(err);
      }
    }

    // Fallback qua REST fetch nếu SDK client gặp vấn đề schema
    if (!isSuccess) {
      try {
        const restRes = await fetch(`${targetUrl}/rest/v1/recipes?select=id&limit=1`, {
          method: 'GET',
          headers: {
            apikey: targetKey,
            Authorization: `Bearer ${targetKey}`,
          },
        });
        if (restRes.ok) {
          isSuccess = true;
          statusCode = restRes.status;
          chosenTable = 'recipes (rest api)';
        } else {
          errorMsg = `REST fetch status: ${restRes.status} ${restRes.statusText}`;
        }
      } catch (directErr: any) {
        errorMsg = directErr?.message || errorMsg;
      }
    }

    const latencyMs = Date.now() - startTime;

    if (!isSuccess) {
      return NextResponse.json(
        {
          success: false,
          timestamp: Date.now(),
          latencyMs,
          tableChecked: chosenTable,
          message: `Gửi tín hiệu thất bại: ${errorMsg || 'Không thể phản hồi từ Supabase'}`,
          dataModified: false,
          source,
          error: errorMsg,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        timestamp: Date.now(),
        latencyMs,
        tableChecked: chosenTable,
        statusCode,
        message: 'Tín hiệu kích hoạt Supabase thành công! Thời hạn 7 ngày đã được làm mới.',
        dataModified: false,
        source,
        targetUrl,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json(
      {
        success: false,
        timestamp: Date.now(),
        latencyMs,
        tableChecked: 'unknown',
        message: `Lỗi hệ thống khi gửi tín hiệu: ${err?.message || 'Lỗi ngoại lệ'}`,
        dataModified: false,
        source,
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
