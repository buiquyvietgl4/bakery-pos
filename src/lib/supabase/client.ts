import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getActiveProfile,
  EVENT_DB_PROFILE_CHANGED,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_PRODUCTION_KEY,
} from './databaseProfileManager';

import { isLocalMode } from '@/lib/utils/sqlModeManager';

export function cleanSupabaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let clean = rawUrl.trim();
  clean = clean.replace(/\/+$/, '');
  clean = clean.replace(/\/rest\/v1\/?$/i, '');
  clean = clean.replace(/\/rest\/?$/i, '');
  clean = clean.replace(/\/+$/, '');
  return clean;
}

/**
 * Khởi tạo client dựa trên cấu hình môi trường Active (Production vs Testing)
 */
function initSupabaseClient(): SupabaseClient {
  try {
    const active = getActiveProfile();
    const rawUrl = active?.url || DEFAULT_PRODUCTION_URL;
    const url = cleanSupabaseUrl(rawUrl);
    const key = (active?.anonKey || DEFAULT_PRODUCTION_KEY || '').trim();
    return createClient(url, key);
  } catch (err) {
    console.warn('Lỗi khởi tạo Supabase client từ Profile, fallback về mặc định:', err);
    return createClient(cleanSupabaseUrl(DEFAULT_PRODUCTION_URL), (DEFAULT_PRODUCTION_KEY || '').trim());
  }
}

let currentClient: SupabaseClient = initSupabaseClient();

export function reinitSupabaseClient(): SupabaseClient {
  currentClient = initSupabaseClient();
  return currentClient;
}

// Lắng nghe sự kiện đổi môi trường DB hoặc sync CSDL mới để khởi tạo lại client ngay lập tức
if (typeof window !== 'undefined') {
  window.addEventListener(EVENT_DB_PROFILE_CHANGED, () => {
    reinitSupabaseClient();
  });
  window.addEventListener('bakery_global_sql_synced', () => {
    reinitSupabaseClient();
  });
}

function createSafeDummyMutation(table: string, methodName: string) {
  const isTest = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST));
  const reason = isTest ? 'đang chạy trong môi trường Kiểm thử (Vitest Suite)' : 'đang chạy ở Chế độ Local SQL';
  console.warn(`🛡️ [SQL Firewall] Đã chặn lệnh ${methodName.toUpperCase()} vào bảng '${table}' trên Cloud Supabase vì ${reason}!`);
  const dummy: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'then') {
        return (resolve?: any) => Promise.resolve({ data: null, error: null }).then(resolve);
      }
      if (prop === 'catch') {
        return (reject?: any) => Promise.resolve({ data: null, error: null }).catch(reject);
      }
      if (prop === 'finally') {
        return (callback?: any) => Promise.resolve({ data: null, error: null }).finally(callback);
      }
      return () => dummy;
    },
  });
  return dummy;
}

/**
 * Proxy Supabase Client: Mọi lệnh gọi supabase.from, supabase.channel, supabase.auth...
 * sẽ tự động chuyển tiếp tới instance client của môi trường CSDL đang hoạt động.
 * 🛡️ SQL FIREWALL: Khi hệ thống đang ở Chế độ Local SQL (isLocalMode = true)
 * hoặc khi chạy trong môi trường kiểm thử (Vitest test),
 * mọi thao tác Ghi/Xóa/Cập nhật (insert, upsert, update, delete) xuống Cloud Supabase
 * đều bị chặn tuyệt đối để bảo vệ 100% tính toàn vẹn và độc lập dữ liệu!
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (prop === 'from') {
      return (table: string) => {
        const originalBuilder = (currentClient as any).from(table);
        const isTestEnv = typeof process !== 'undefined' && (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST));
        if (!isLocalMode() && !isTestEnv) {
          return originalBuilder;
        }
        return new Proxy(originalBuilder, {
          get(target, methodProp, receiver) {
            if (methodProp === 'insert' || methodProp === 'upsert' || methodProp === 'update' || methodProp === 'delete') {
              return () => createSafeDummyMutation(table, String(methodProp));
            }
            return Reflect.get(target, methodProp, receiver);
          },
        });
      };
    }
    return (currentClient as any)[prop];
  },
});
