// src/lib/supabase/keepAliveManager.ts
/**
 * ==============================================================================
 * BỘ QUẢN LÝ CHỐNG KHÓA / TẠM DỪNG CƠ SỞ DỮ LIỆU CLOUD SUPABASE (ANTI-INACTIVITY)
 * ==============================================================================
 * Supabase Free Tier sẽ tự động tạm dừng (pause) dự án nếu không có bất kỳ API
 * request nào trong vòng 7 ngày.
 *
 * Module này cung cấp:
 * 1. Tín hiệu đánh thức siêu nhẹ (Ultra-lightweight Read-Only Ping) dùng HEAD/SELECT 1.
 * 2. Đảm bảo 100% KHÔNG ẢNH HƯỞNG, KHÔNG THAY ĐỔI, KHÔNG XÓA DỮ LIỆU CSDL (Data Modified = 0).
 * 3. Chu kỳ định kỳ 2 - 3 ngày / lần (Vercel Cron + In-App Smart Heartbeat).
 * 4. Ghi nhận thời gian kích hoạt, độ trễ mạng (latency) và trạng thái an toàn.
 * ==============================================================================
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_PRODUCTION_URL,
  DEFAULT_PRODUCTION_KEY,
  cleanSupabaseUrl,
  getActiveProfile,
} from './databaseProfileManager';

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
 * Thực thi một tín hiệu kiểm tra (Read-Only Ping) trực tiếp tới Supabase.
 * TUYỆT ĐỐI KHÔNG GHI/SỬA/XÓA BẤT KỲ DỮ LIỆU NÀO TRÊN CSDL.
 */
export async function executeKeepAlivePing(
  source: KeepAliveResult['source'] = 'admin-manual',
  overrideUrl?: string,
  overrideKey?: string
): Promise<KeepAliveResult> {
  const startTime = Date.now();

  try {
    // 1. Xác định URL và API Key
    let targetUrl = overrideUrl;
    let targetKey = overrideKey;

    if (!targetUrl || !targetKey) {
      const active = typeof window !== 'undefined' ? getActiveProfile() : null;
      targetUrl = cleanSupabaseUrl(active?.url || DEFAULT_PRODUCTION_URL);
      targetKey = (active?.anonKey || DEFAULT_PRODUCTION_KEY || '').trim();
    }

    if (!targetUrl || !targetKey) {
      throw new Error('Chưa cấu hình URL hoặc Anon Key của Supabase Cloud.');
    }

    // 2. Khởi tạo client riêng biệt cho mục đích ping
    const pingClient: SupabaseClient = createClient(targetUrl, targetKey);

    // 3. Thực thi truy vấn siêu nhẹ (HEAD request đếm số lượng hoặc lấy 1 dòng)
    // Ưu tiên bảng 'recipes' hoặc 'orders' hoặc 'products'
    const candidateTables = ['recipes', 'orders', 'products', 'bakery_bom_settings', 'system_configs'];
    let chosenTable = 'recipes';
    let isSuccess = false;
    let errorMsg: string | undefined;
    let statusCode = 200;

    for (const table of candidateTables) {
      try {
        const { status, error } = await pingClient
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

    const latencyMs = Date.now() - startTime;

    if (!isSuccess) {
      // Thử phương án REST fetch trực tiếp nếu client thư viện gặp vấn đề
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
          chosenTable = 'recipes (direct rest)';
        }
      } catch (directErr: any) {
        errorMsg = directErr?.message || errorMsg;
      }
    }

    const result: KeepAliveResult = {
      success: isSuccess,
      timestamp: Date.now(),
      latencyMs,
      tableChecked: chosenTable,
      message: isSuccess
        ? `Gửi tín hiệu thành công! Đã kích hoạt lại thời hạn 7 ngày trên Supabase Cloud (${latencyMs}ms).`
        : `Gửi tín hiệu không thành công: ${errorMsg || 'Không thể kết nối tới Supabase'}`,
      dataModified: false,
      source,
      statusCode,
      error: isSuccess ? undefined : errorMsg,
    };

    saveKeepAliveResult(result);
    return result;
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const result: KeepAliveResult = {
      success: false,
      timestamp: Date.now(),
      latencyMs,
      tableChecked: 'none',
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
