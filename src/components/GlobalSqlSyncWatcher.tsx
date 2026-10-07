'use client';

import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  fetchAndApplyGlobalSqlProfile,
  EVENT_GLOBAL_SQL_SYNCED,
  EVENT_DB_PROFILE_CHANGED,
} from '@/lib/supabase/databaseProfileManager';
import { EVENT_UNIFIED_SQL_ENV_CHANGED } from '@/lib/utils/unifiedSqlManager';
import { isLocalMode } from '@/lib/utils/sqlModeManager';

export default function GlobalSqlSyncWatcher() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const isCheckingRef = useRef(false);

  const performCheck = async (isInitial = false) => {
    if (isLocalMode()) return;
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    try {
      const res = await fetchAndApplyGlobalSqlProfile();
      if (res.changed && res.updatedProfile) {
        // Kiểm tra chống lặp reload vô tận: Chỉ reload tối đa 1 lần trong 30 giây
        let canReload = false;
        try {
          const lastReload = sessionStorage.getItem('bakery_last_sync_reload');
          const now = Date.now();
          if (!lastReload || now - Number(lastReload) > 30000) {
            sessionStorage.setItem('bakery_last_sync_reload', String(now));
            canReload = true;
          }
        } catch {}

        if (canReload) {
          setToastMessage(
            `🔄 CSDL Chính đã được Quản trị viên cập nhật (${res.updatedProfile.url.replace(/^https?:\/\//, '').split('.')[0]}). Đang làm mới dữ liệu...`
          );
          window.dispatchEvent(new CustomEvent(EVENT_UNIFIED_SQL_ENV_CHANGED));
          window.dispatchEvent(new CustomEvent(EVENT_DB_PROFILE_CHANGED));

          setTimeout(() => {
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }, 1200);
        } else {
          // Nếu đã reload rồi thì chỉ cập nhật client ngầm, tuyệt đối không reload nữa
          window.dispatchEvent(new CustomEvent(EVENT_UNIFIED_SQL_ENV_CHANGED));
          window.dispatchEvent(new CustomEvent(EVENT_DB_PROFILE_CHANGED));
        }
      }
    } catch (err) {
      // Bỏ qua lỗi kết nối nền
    } finally {
      isCheckingRef.current = false;
    }
  };

  useEffect(() => {
    // 1. Kiểm tra khi app vừa khởi động (sau 800ms)
    const initialTimer = setTimeout(() => {
      performCheck(true);
    }, 800);

    // 2. Kiểm tra khi người dùng mở lại tab hoặc mở màn hình điện thoại
    const handleFocus = () => {
      performCheck();
    };
    window.addEventListener('focus', handleFocus);

    // 3. Kiểm tra định kỳ mỗi 60 giây
    const intervalTimer = setInterval(() => {
      performCheck();
    }, 60000);

    // 4. Lắng nghe sự kiện đồng bộ giữa các tab
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'bakery_multi_sql_config' || e.key === 'bakery_last_global_sql_sync_ts') {
        performCheck();
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  if (!toastMessage) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[9999] max-w-md bg-zinc-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-zinc-700 flex items-center gap-3 animate-bounce">
      <RefreshCw className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
      <div className="text-xs font-semibold leading-relaxed">
        {toastMessage}
      </div>
    </div>
  );
}
