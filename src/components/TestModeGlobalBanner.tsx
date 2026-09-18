'use client';

import React, { useState, useEffect } from 'react';
import { FlaskConical, ArrowRight, ShieldCheck, Database, X } from 'lucide-react';
import {
  getActiveProfile,
  switchActiveEnvironment,
  EVENT_DB_PROFILE_CHANGED,
  DatabaseProfile,
} from '@/lib/supabase/databaseProfileManager';

export default function TestModeGlobalBanner() {
  const [activeProfile, setActiveProfile] = useState<DatabaseProfile | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const update = () => {
      setActiveProfile(getActiveProfile());
    };
    update();

    window.addEventListener(EVENT_DB_PROFILE_CHANGED, update);
    return () => {
      window.removeEventListener(EVENT_DB_PROFILE_CHANGED, update);
    };
  }, []);

  // Chỉ hiển thị khi đang ở môi trường Test
  if (!activeProfile || activeProfile.id !== 'testing' || isDismissed) {
    return null;
  }

  const handleReturnToProduction = () => {
    if (confirm('Bạn có muốn QUAY LẠI CSDL CHÍNH (VẬN HÀNH) không?\nHệ thống sẽ nạp lại dữ liệu bán hàng thực tế của tiệm.')) {
      setIsSwitching(true);
      switchActiveEnvironment('production', 'fetch_from_new');
      window.location.reload();
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-zinc-950 text-xs py-2 px-3 sm:px-4 sticky top-0 z-[99999] shadow-md border-b border-amber-600/30 font-medium">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="p-1 rounded-md bg-zinc-950 text-amber-400 shrink-0 animate-pulse">
            <FlaskConical className="w-3.5 h-3.5" />
          </span>
          <div>
            <span className="font-black uppercase tracking-wide bg-zinc-950 text-amber-300 px-1.5 py-0.5 rounded text-[10px] mr-1.5">
              CHẾ ĐỘ TEST SQL
            </span>
            <span className="text-zinc-950 font-semibold">
              Đang kết nối <b>CSDL Thử Nghiệm</b>. Mọi đơn ảo, công thức test hoàn toàn tách biệt, <b>không ảnh hưởng CSDL Chính</b>.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            type="button"
            onClick={handleReturnToProduction}
            disabled={isSwitching}
            className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-white font-bold text-[11px] flex items-center gap-1 transition shadow cursor-pointer disabled:opacity-50"
            title="Quay lại môi trường bán hàng thật"
          >
            <Database className="w-3 h-3 text-emerald-400" />
            <span>{isSwitching ? 'Đang chuyển...' : 'Về CSDL Chính (Vận Hành)'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 hover:bg-black/10 rounded-md transition text-zinc-800"
            title="Ẩn tạm thời thanh này"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
