import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  getActiveProfile,
  EVENT_DB_PROFILE_CHANGED,
  DEFAULT_PRODUCTION_URL,
  DEFAULT_PRODUCTION_KEY,
} from './databaseProfileManager';

/**
 * Khởi tạo client dựa trên cấu hình môi trường Active (Production vs Testing)
 */
function initSupabaseClient(): SupabaseClient {
  try {
    const active = getActiveProfile();
    const url = active?.url || DEFAULT_PRODUCTION_URL;
    const key = active?.anonKey || DEFAULT_PRODUCTION_KEY;
    return createClient(url, key);
  } catch (err) {
    console.warn('Lỗi khởi tạo Supabase client từ Profile, fallback về mặc định:', err);
    return createClient(DEFAULT_PRODUCTION_URL, DEFAULT_PRODUCTION_KEY);
  }
}

let currentClient: SupabaseClient = initSupabaseClient();

// Lắng nghe sự kiện đổi môi trường DB để khởi tạo lại client ngay lập tức
if (typeof window !== 'undefined') {
  window.addEventListener(EVENT_DB_PROFILE_CHANGED, () => {
    currentClient = initSupabaseClient();
  });
}

/**
 * Proxy Supabase Client: Mọi lệnh gọi supabase.from, supabase.channel, supabase.auth...
 * sẽ tự động chuyển tiếp tới instance client của môi trường CSDL đang hoạt động.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (currentClient as any)[prop];
  },
});
