'use client';

import React, { useState, useEffect } from 'react';
import { FlaskConical, ArrowRight, ShieldCheck, Database, X } from 'lucide-react';
import {
  getActiveProfile,
  switchActiveEnvironment,
  EVENT_DB_PROFILE_CHANGED,
  DatabaseProfile,
} from '@/lib/supabase/databaseProfileManager';
import {
  isLocalMode,
  isLocalTestMode,
  switchLocalEnvironment,
  EVENT_LOCAL_SQL_ENV_CHANGED,
  DB_MODE_CHANGED_EVENT,
} from '@/lib/utils/sqlModeManager';

export default function TestModeGlobalBanner() {
  const [activeProfile, setActiveProfile] = useState<DatabaseProfile | null>(null);
  const [localTestActive, setLocalTestActive] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const update = () => {
      setActiveProfile(getActiveProfile());
      setLocalTestActive(isLocalTestMode());
    };
    update();

    window.addEventListener(EVENT_DB_PROFILE_CHANGED, update);
    window.addEventListener(EVENT_LOCAL_SQL_ENV_CHANGED, update);
    window.addEventListener(DB_MODE_CHANGED_EVENT, update);
    return () => {
      window.removeEventListener(EVENT_DB_PROFILE_CHANGED, update);
      window.removeEventListener(EVENT_LOCAL_SQL_ENV_CHANGED, update);
      window.removeEventListener(DB_MODE_CHANGED_EVENT, update);
    };
  }, []);

  const isOnlineTest = !isLocalMode() && activeProfile?.id === 'testing';
  const isTestMode = isOnlineTest || localTestActive;

  // Chỉ hiển thị khi đang ở môi trường Test
  if (!isTestMode || isDismissed) {
    return null;
  }

  const handleReturnToProduction = () => {
    if (confirm('Bạn có muốn QUAY LẠI CSDL CHÍNH (VẬN HÀNH) không?\nHệ thống sẽ nạp lại dữ liệu bán hàng thực tế của tiệm.')) {
      setIsSwitching(true);
      if (localTestActive) {
        switchLocalEnvironment('production', 'load_vault');
      } else {
        switchActiveEnvironment('production', 'fetch_from_new');
      }
      window.location.reload();
    }
  };

  return (
    <div className={`text-zinc-950 text-xs py-2 px-3 sm:px-4 sticky top-0 z-[99999] shadow-md border-b font-medium ${
      localTestActive
        ? 'bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 text-white border-purple-600/40'
        : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-zinc-950 border-amber-600/30'
    }`}>
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`p-1 rounded-md shrink-0 animate-pulse ${
            localTestActive ? 'bg-zinc-900 text-purple-300' : 'bg-zinc-950 text-amber-400'
          }`}>
            <FlaskConical className="w-3.5 h-3.5" />
          </span>
          <div>
            <span className={`font-black uppercase tracking-wide px-1.5 py-0.5 rounded text-[10px] mr-1.5 ${
              localTestActive ? 'bg-zinc-900 text-purple-200' : 'bg-zinc-950 text-amber-300'
            }`}>
              {localTestActive ? 'LOCAL SQL TEST' : 'CLOUD SQL TEST'}
            </span>
            <span className={`font-semibold ${localTestActive ? 'text-white' : 'text-zinc-950'}`}>
              {localTestActive
                ? 'Đang kết nối Thư mục CSDL Local Test. Mọi đơn ảo, công thức test lưu vào thư mục Test, không ảnh hưởng CSDL Chính.'
                : 'Đang kết nối CSDL Thử Nghiệm. Mọi đơn ảo, công thức test hoàn toàn tách biệt, không ảnh hưởng CSDL Chính.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            type="button"
            onClick={handleReturnToProduction}
            disabled={isSwitching}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition shadow cursor-pointer disabled:opacity-50 ${
              localTestActive ? 'bg-white text-purple-950 hover:bg-zinc-100' : 'bg-zinc-950 hover:bg-zinc-800 text-white'
            }`}
            title="Quay lại môi trường bán hàng thật"
          >
            <Database className={`w-3 h-3 ${localTestActive ? 'text-purple-700' : 'text-emerald-400'}`} />
            <span>{isSwitching ? 'Đang chuyển...' : localTestActive ? 'Về Local SQL Chính' : 'Về CSDL Chính (Vận Hành)'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 hover:bg-black/10 rounded-md transition"
            title="Ẩn tạm thời thanh này"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
