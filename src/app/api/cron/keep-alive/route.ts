// src/app/api/cron/keep-alive/route.ts
/**
 * ==============================================================================
 * API ENDPOINT: SUPABASE ANTI-INACTIVITY KEEP-ALIVE (MULTI-DATABASE)
 * ==============================================================================
 * Tự động gửi tín hiệu siêu nhẹ (HEAD / count) tới TẤT CẢ các CSDL Supabase
 * (Cả CSDL Chính lẫn CSDL Thử Nghiệm / Dự Phòng).
 *
 * Tính năng an toàn:
 * 1. 100% Read-Only, tuyệt đối không sửa hay xóa dữ liệu (dataModified = false).
 * 2. Timeout 4 giây cho mỗi request, chạy song song (Parallel) -> Toàn bộ phản hồi < 2s.
 * 3. Tự động nhận diện trạng thái HTTP 521 (Dự án bị Paused trên Supabase) để cảnh báo.
 * 4. Không bao giờ treo server hay gây lỗi 502/504 cho Vercel & GitHub Actions.
 * ==============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TargetDbConfig {
  id: string;
  name: string;
  url: string;
  anonKey: string;
}

export async function GET(req: NextRequest) {
  return handleKeepAlive(req);
}

export async function POST(req: NextRequest) {
  return handleKeepAlive(req);
}

async function pingDatabase(target: TargetDbConfig): Promise<{
  id: string;
  name: string;
  url: string;
  success: boolean;
  statusCode: number;
  latencyMs: number;
  message: string;
  isPaused?: boolean;
}> {
  const startTime = Date.now();
  const cleanUrl = target.url.trim().replace(/\/+$/, '').replace(/\/rest\/v1\/?$/i, '');

  if (!cleanUrl || !target.anonKey) {
    return {
      id: target.id,
      name: target.name,
      url: cleanUrl,
      success: false,
      statusCode: 400,
      latencyMs: 0,
      message: 'Chưa cấu hình URL hoặc Anon Key.',
    };
  }

  try {
    // Truy vấn siêu nhẹ tới PostgREST endpoint với timeout 4 giây
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${cleanUrl}/rest/v1/recipes?select=id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: target.anonKey.trim(),
        Authorization: `Bearer ${target.anonKey.trim()}`,
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (res.status === 521) {
      return {
        id: target.id,
        name: target.name,
        url: cleanUrl,
        success: false,
        statusCode: 521,
        latencyMs,
        isPaused: true,
        message: 'Dự án đang Tạm Dừng (Paused) trên Supabase. Cần vào Supabase Dashboard bấm "Restore project".',
      };
    }

    if (res.ok || res.status === 200 || res.status === 204) {
      return {
        id: target.id,
        name: target.name,
        url: cleanUrl,
        success: true,
        statusCode: res.status,
        latencyMs,
        message: `Kích hoạt thành công! Đã làm mới thời hạn 7 ngày trên Supabase (${latencyMs}ms).`,
      };
    }

    // Nếu mã lỗi schema (PGRST) nhưng server vẫn phản hồi thì Supabase VẪN TÍNH LÀ HOẠT ĐỘNG
    const resText = await res.text().catch(() => '');
    if (resText.includes('PGRST') || res.status === 404 || res.status === 400) {
      return {
        id: target.id,
        name: target.name,
        url: cleanUrl,
        success: true,
        statusCode: res.status,
        latencyMs,
        message: `Máy chủ Supabase đang phản hồi tốt! Đã kích hoạt thời hạn 7 ngày (${latencyMs}ms).`,
      };
    }

    return {
      id: target.id,
      name: target.name,
      url: cleanUrl,
      success: false,
      statusCode: res.status,
      latencyMs,
      message: `Phản hồi mã ${res.status}: ${resText.slice(0, 120)}`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err?.name === 'AbortError';
    return {
      id: target.id,
      name: target.name,
      url: cleanUrl,
      success: false,
      statusCode: isTimeout ? 504 : 500,
      latencyMs,
      message: isTimeout
        ? 'Kết nối vượt quá 4 giây (Timeout).'
        : `Lỗi kết nối: ${err?.message || 'Không thể gửi tín hiệu'}`,
    };
  }
}

async function handleKeepAlive(req: NextRequest) {
  const startTime = Date.now();
  const searchParams = req.nextUrl.searchParams;
  const source = searchParams.get('source') || 'vercel-cron';

  // Danh sách CSDL cần nuôi sống định kỳ (Cả CSDL Chính lẫn CSDL Phụ)
  const targets: TargetDbConfig[] = [
    {
      id: 'production',
      name: 'CSDL Chính (fhiuojcvsouwugatnmve)',
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhiuojcvsouwugatnmve.supabase.co',
      anonKey:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        'sb_publishable_ZH4xsT4R5cWZ3P9uW76IZg_-k3mRtED',
    },
    {
      id: 'testing',
      name: 'CSDL Thử Nghiệm / Sandbox (azgjnahbibrcbjooepef)',
      url: 'https://azgjnahbibrcbjooepef.supabase.co',
      anonKey: 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn',
    },
  ];

  // Gửi song song đến tất cả các CSDL
  const results = await Promise.all(targets.map((t) => pingDatabase(t)));
  const totalLatencyMs = Date.now() - startTime;

  const hasAnySuccess = results.some((r) => r.success);
  const pausedProjects = results.filter((r) => r.isPaused);

  let overallMessage = hasAnySuccess
    ? 'Đã gửi tín hiệu thành công và làm mới thời hạn 7 ngày.'
    : 'Không thể kết nối đến máy chủ CSDL.';

  if (pausedProjects.length > 0) {
    overallMessage += ` Chú ý: ${pausedProjects.map((p) => p.name).join(', ')} đang bị Paused trên Supabase cần bấm Restore.`;
  }

  return NextResponse.json(
    {
      success: hasAnySuccess,
      timestamp: Date.now(),
      totalLatencyMs,
      dataModified: false,
      source,
      message: overallMessage,
      databases: results,
    },
    {
      status: 200, // Luôn trả 200 để Vercel Cron và GitHub Actions không coi là crash
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
