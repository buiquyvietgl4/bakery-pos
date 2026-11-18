// src/lib/supabase/keepAliveManager.ts
/**
 * ==============================================================================
 * BỘ QUẢN LÝ CHỐNG KHÓA / TẠM DỪNG CƠ SỞ DỮ LIỆU CLOUD SUPABASE (ANTI-INACTIVITY)
 * ==============================================================================
 * Supabase Free Tier sẽ tự động tạm dừng (pause) dự án nếu không có bất kỳ API
 * request nào trong vòng 7 ngày.
 *
 * Module này cung cấp:
 * 1. Tín hiệu đánh thức siêu nhẹ (Ultra-lightweight Read-Only Ping) dùng HEAD / count.
 * 2. Đảm bảo 100% KHÔNG ẢNH HƯỞNG, KHÔNG THAY ĐỔI, KHÔNG XÓA DỮ LIỆU CSDL (Data Modified = 0).
 * 3. Hỗ trợ kích hoạt ĐỒNG THỜI cả CSDL Chính lẫn CSDL Thử Nghiệm / Dự Phòng.
 * 4. Tự động nhận diện lỗi HTTP 521 (Paused) để hướng dẫn mở lại CSDL trên Dashboard.
 * ==============================================================================
 */

import {
  DEFAULT_PRODUCTION_URL,
  DEFAULT_PRODUCTION_KEY,
  DEFAULT_TESTING_URL,
  DEFAULT_TESTING_KEY,
  cleanSupabaseUrl,
  getActiveProfile,
} from './databaseProfileManager';

export interface DatabasePingResult {
  id: string;
  name: string;
  url: string;
  success: boolean;
  statusCode: number;
  latencyMs: number;
  message: string;
  isPaused?: boolean;
}

export interface KeepAliveResult {
  success: boolean;
  timestamp: number;
  latencyMs: number;
  tableChecked: string;
  message: string;
  dataModified: false;
  source: 'vercel-cron' | 'github-actions' | 'client-auto' | 'admin-manual';
  error?: string;
  statusCode?: number;
  databases?: DatabasePingResult[];
}

export interface KeepAliveStatus {
  lastPingTime: number | null;
  lastResult: KeepAliveResult | null;
  isProtecting: boolean;
  daysRemaining: number;
}

export const STORAGE_KEY_KEEP_ALIVE_INFO = 'bakery_supabase_keep_alive_info';
export const EVENT_KEEP_ALIVE_UPDATED = 'bakery_keep_alive_status_updated';

// Khoảng cách tối thiểu giữa 2 lần ping tự động (48 giờ = 2 ngày)
export const KEEP_ALIVE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
// Thời hạn tối đa của Supabase trước khi bị pause (7 ngày)
export const SUPABASE_INACTIVITY_LIMIT_DAYS = 7;

/**
 * Lấy trạng thái hiện tại của cơ chế Chống Tạm Dừng Supabase
 */
export function getKeepAliveStatus(): KeepAliveStatus {
  if (typeof window === 'undefined') {
    return {
      lastPingTime: null,
      lastResult: null,
      isProtecting: true,
      daysRemaining: SUPABASE_INACTIVITY_LIMIT_DAYS,
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_KEEP_ALIVE_INFO);
    if (!raw) {
      return {
        lastPingTime: null,
        lastResult: null,
        isProtecting: true,
        daysRemaining: SUPABASE_INACTIVITY_LIMIT_DAYS,
      };
    }

    const lastResult: KeepAliveResult = JSON.parse(raw);
    const lastPingTime = lastResult.timestamp || null;

    let daysRemaining = SUPABASE_INACTIVITY_LIMIT_DAYS;
    if (lastPingTime) {
      const elapsedDays = (Date.now() - lastPingTime) / (24 * 60 * 60 * 1000);
      daysRemaining = Math.max(0, Number((SUPABASE_INACTIVITY_LIMIT_DAYS - elapsedDays).toFixed(1)));
    }

    return {
      lastPingTime,
      lastResult,
      isProtecting: true,
      daysRemaining,
    };
  } catch {
    return {
      lastPingTime: null,
      lastResult: null,
      isProtecting: true,
      daysRemaining: SUPABASE_INACTIVITY_LIMIT_DAYS,
    };
  }
}

/**
 * Lưu kết quả kích hoạt vào localStorage và phát sự kiện cập nhật UI
 */
export function saveKeepAliveResult(result: KeepAliveResult): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_KEEP_ALIVE_INFO, JSON.stringify(result));
    window.dispatchEvent(new CustomEvent(EVENT_KEEP_ALIVE_UPDATED, { detail: result }));
  } catch (err) {
    console.warn('[KeepAlive] Không thể lưu trạng thái keep-alive vào localStorage:', err);
  }
}

/**
 * Ping trực tiếp một endpoint Supabase bằng fetch siêu nhẹ (timeout 4 giây).
 */
async function pingSingleDb(
  id: string,
  name: string,
  rawUrl: string,
  anonKey: string
): Promise<DatabasePingResult> {
  const startTime = Date.now();
  const cleanUrl = cleanSupabaseUrl(rawUrl);

  if (!cleanUrl || !anonKey) {
    return {
      id,
      name,
      url: cleanUrl,
      success: false,
      statusCode: 400,
      latencyMs: 0,
      message: 'Chưa cấu hình URL hoặc Anon Key.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${cleanUrl}/rest/v1/recipes?select=id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: anonKey.trim(),
        Authorization: `Bearer ${anonKey.trim()}`,
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (res.status === 521) {
      return {
        id,
        name,
        url: cleanUrl,
        success: false,
        statusCode: 521,
        latencyMs,
        isPaused: true,
        message: 'Dự án đang Tạm Dừng (Paused) trên Supabase. Cần vào Dashboard bấm "Restore project".',
      };
    }

    if (res.ok || res.status === 200 || res.status === 204) {
      return {
        id,
        name,
        url: cleanUrl,
        success: true,
        statusCode: res.status,
        latencyMs,
        message: `Đã kích hoạt thành công (${latencyMs}ms).`,
      };
    }

    const resText = await res.text().catch(() => '');
    if (resText.includes('PGRST') || res.status === 404 || res.status === 400) {
      return {
        id,
        name,
        url: cleanUrl,
        success: true,
        statusCode: res.status,
        latencyMs,
        message: `Máy chủ Supabase phản hồi tốt (${latencyMs}ms).`,
      };
    }

    return {
      id,
      name,
      url: cleanUrl,
      success: false,
      statusCode: res.status,
      latencyMs,
      message: `Phản hồi mã ${res.status}: ${resText.slice(0, 100)}`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const isTimeout = err?.name === 'AbortError';
    return {
      id,
      name,
      url: cleanUrl,
      success: false,
      statusCode: isTimeout ? 504 : 500,
      latencyMs,
      message: isTimeout ? 'Vượt quá 4 giây (Timeout).' : (err?.message || 'Lỗi kết nối'),
    };
  }
}

/**
 * Thực thi một tín hiệu kiểm tra (Read-Only Ping) trực tiếp tới các CSDL Supabase.
 * TUYỆT ĐỐI KHÔNG GHI/SỬA/XÓA BẤT KỲ DỮ LIỆU NÀO TRÊN CSDL.
 */
export async function executeKeepAlivePing(
  source: KeepAliveResult['source'] = 'admin-manual',
  overrideUrl?: string,
  overrideKey?: string
): Promise<KeepAliveResult> {
  const startTime = Date.now();

  try {
    // Nếu có overrideUrl thì ping đơn
    if (overrideUrl && overrideKey) {
      const single = await pingSingleDb('custom', 'CSDL Tùy Chọn', overrideUrl, overrideKey);
      const result: KeepAliveResult = {
        success: single.success,
        timestamp: Date.now(),
        latencyMs: single.latencyMs,
        tableChecked: 'recipes',
        message: single.message,
        dataModified: false,
        source,
        statusCode: single.statusCode,
        error: single.success ? undefined : single.message,
        databases: [single],
      };
      saveKeepAliveResult(result);
      return result;
    }

    // Nếu chạy trên trình duyệt, thử gọi endpoint API nội bộ trước
    if (typeof window !== 'undefined') {
      try {
        const apiRes = await fetch(`/api/cron/keep-alive/?source=${source}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        });
        if (apiRes.ok) {
          const json = await apiRes.json();
          const keepAliveRes: KeepAliveResult = {
            success: Boolean(json.success),
            timestamp: json.timestamp || Date.now(),
            latencyMs: json.totalLatencyMs || (Date.now() - startTime),
            tableChecked: 'recipes',
            message: json.message || 'Đã gửi tín hiệu thành công.',
            dataModified: false,
            source,
            databases: json.databases || [],
          };
          saveKeepAliveResult(keepAliveRes);
          return keepAliveRes;
        }
      } catch {
        // Fallback sang ping client trực tiếp
      }
    }

    // Fallback: Ping trực tiếp từ client đến cả CSDL Chính & CSDL Phụ
    const active = typeof window !== 'undefined' ? getActiveProfile() : null;
    const prodUrl = cleanSupabaseUrl(active?.url || DEFAULT_PRODUCTION_URL);
    const prodKey = (active?.anonKey || DEFAULT_PRODUCTION_KEY || '').trim();

    const targets = [
      { id: 'production', name: 'CSDL Chính (fhiuojcvsouwugatnmve)', url: prodUrl, anonKey: prodKey },
      { id: 'testing', name: 'CSDL Thử Nghiệm (azgjnahbibrcbjooepef)', url: DEFAULT_TESTING_URL, anonKey: DEFAULT_TESTING_KEY },
    ];

    const dbResults = await Promise.all(targets.map((t) => pingSingleDb(t.id, t.name, t.url, t.anonKey)));
    const hasAnySuccess = dbResults.some((d) => d.success);
    const totalLatency = Date.now() - startTime;

    const result: KeepAliveResult = {
      success: hasAnySuccess,
      timestamp: Date.now(),
      latencyMs: totalLatency,
      tableChecked: 'recipes',
      message: hasAnySuccess
        ? `Đã gửi tín hiệu thành công (${totalLatency}ms).`
        : 'Không thể kết nối đến máy chủ CSDL.',
      dataModified: false,
      source,
      databases: dbResults,
    };

    saveKeepAliveResult(result);
    return result;
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const result: KeepAliveResult = {
      success: false,
      timestamp: Date.now(),
      latencyMs,
      tableChecked: 'recipes',
      message: `Lỗi kết nối kiểm tra: ${err?.message || 'Lỗi không xác định'}`,
      dataModified: false,
      source,
      error: err?.message || String(err),
    };
    saveKeepAliveResult(result);
    return result;
  }
}

/**
 * Kiểm tra và kích hoạt Keep-Alive tự động phía Client (In-App Smart Heartbeat).
 * Chỉ chạy nếu lần kích hoạt gần nhất đã cách đây >= 2 ngày (48 giờ).
 * Chạy ngầm hoàn toàn không ảnh hưởng đến tốc độ hay trải nghiệm người dùng.
 */
export async function checkAndTriggerClientKeepAlive(): Promise<KeepAliveResult | null> {
  if (typeof window === 'undefined') return null;

  try {
    const status = getKeepAliveStatus();
    const now = Date.now();

    // Nếu chưa từng ping hoặc đã quá 48 giờ kể từ lần ping cuối
    if (!status.lastPingTime || now - status.lastPingTime >= KEEP_ALIVE_INTERVAL_MS) {
      console.log('⏰ [Supabase Keep-Alive] Đã quá 2 ngày kể từ lần kích hoạt cuối, đang gửi tín hiệu duy trì CSDL Cloud...');
      const res = await executeKeepAlivePing('client-auto');
      console.log(`✅ [Supabase Keep-Alive] Hoàn tất: ${res.message}`);
      return res;
    }
  } catch (err) {
    console.warn('[Supabase Keep-Alive] Lỗi kiểm tra tự động client:', err);
  }

  return null;
}
