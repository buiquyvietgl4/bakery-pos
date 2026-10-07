'use client';

import React, { useState, useEffect } from 'react';
import { FlaskConical, ArrowRight, Database, X, HardDrive, Globe } from 'lucide-react';
import {
  getActiveUnifiedSqlEnv,
  getActiveUnifiedSqlEnvInfo,
  switchUnifiedSqlEnv,
  EVENT_UNIFIED_SQL_ENV_CHANGED,
  UnifiedSqlEnvId,
} from '@/lib/utils/unifiedSqlManager';
import { DB_MODE_CHANGED_EVENT, EVENT_LOCAL_SQL_ENV_CHANGED } from '@/lib/utils/sqlModeManager';
import { EVENT_DB_PROFILE_CHANGED } from '@/lib/supabase/databaseProfileManager';

export default function TestModeGlobalBanner() {
  const [activeEnvId, setActiveEnvId] = useState<UnifiedSqlEnvId>(() => getActiveUnifiedSqlEnv());
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const update = () => {
      setActiveEnvId(getActiveUnifiedSqlEnv());
    };
    update();

    window.addEventListener(EVENT_UNIFIED_SQL_ENV_CHANGED, update);
    window.addEventListener(DB_MODE_CHANGED_EVENT, update);
    window.addEventListener(EVENT_LOCAL_SQL_ENV_CHANGED, update);
    window.addEventListener(EVENT_DB_PROFILE_CHANGED, update);
    return () => {
      window.removeEventListener(EVENT_UNIFIED_SQL_ENV_CHANGED, update);
      window.removeEventListener(DB_MODE_CHANGED_EVENT, update);
      window.removeEventListener(EVENT_LOCAL_SQL_ENV_CHANGED, update);
      window.removeEventListener(EVENT_DB_PROFILE_CHANGED, update);
    };
  }, []);

  const envInfo = getActiveUnifiedSqlEnvInfo();

  // Chỉ hiển thị banner cảnh báo nếu KHÔNG PHẢI là Cloud SQL Chính (môi trường sản xuất mặc định)
  if (activeEnvId === 'cloud_production' || isDismissed) {
    return null;
  }

  const handleReturnToCloudProduction = () => {
    if (
      confirm(
        'Bạn có muốn QUAY LẠI 🌐 CLOUD SQL CHÍNH (VẬN HÀNH) không?\nỨng dụng sẽ kết nối lại CSDL Cloud chính thức của tiệm bánh.'
      )
    ) {
      setIsSwitching(true);
      switchUnifiedSqlEnv('cloud_production');
      setTimeout(() => {
        window.location.reload();
      }, 300);
    }
  };

  const isLocalTest = activeEnvId === 'local_testing';
  const isCloudTest = activeEnvId === 'cloud_testing';
  const isLocalProd = activeEnvId === 'local_production';

  return (
    <div
      className={`text-zinc-950 text-xs py-2 px-3 sm:px-4 sticky top-0 z-[99999] shadow-md border-b font-medium ${
        isLocalTest
          ? 'bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-600 text-white border-purple-600/40'
          : isCloudTest
          ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-zinc-950 border-amber-600/30'
          : 'bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-600 text-white border-blue-600/40'
      }`}
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`p-1 rounded-md shrink-0 animate-pulse ${
              isLocalTest
                ? 'bg-zinc-900 text-purple-300'
                : isCloudTest
                ? 'bg-zinc-950 text-amber-400'
                : 'bg-zinc-900 text-blue-300'
            }`}
          >
            {isCloudTest || isLocalTest ? (
              <FlaskConical className="w-3.5 h-3.5" />
            ) : (
              <HardDrive className="w-3.5 h-3.5" />
            )}
          </span>
          <div>
            <span
              className={`font-black uppercase tracking-wide px-1.5 py-0.5 rounded text-[10px] mr-1.5 ${
                isLocalTest
                  ? 'bg-zinc-900 text-purple-200'
                  : isCloudTest
                  ? 'bg-zinc-950 text-amber-300'
                  : 'bg-zinc-900 text-blue-200'
              }`}
            >
              {envInfo.badgeLabel}
            </span>
            <span
              className={`font-semibold ${
                isLocalTest || isLocalProd ? 'text-white' : 'text-zinc-950'
              }`}
            >
              {isCloudTest &&
                'Đang làm việc trên Cloud SQL Test (azgjnahbibrcbjooepef). Mọi đơn ảo, công thức test lưu độc lập trên Cloud Test, không ảnh hưởng CSDL Chính.'}
              {isLocalTest &&
                'Đang làm việc trên Thư mục Local SQL Test (SQL TEST). Mọi dữ liệu lưu tại ổ cứng máy tính, không ảnh hưởng Local Chính.'}
              {isLocalProd &&
                'Đang chạy chế độ Local SQL Chính Offline. Dữ liệu lưu tại thư mục máy tính (SQL LOCAL), không gửi lên Cloud.'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button
            type="button"
            onClick={handleReturnToCloudProduction}
            disabled={isSwitching}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition shadow cursor-pointer disabled:opacity-50 ${
              isLocalTest || isLocalProd
                ? 'bg-white text-zinc-900 hover:bg-zinc-100'
                : 'bg-zinc-950 hover:bg-zinc-800 text-white'
            }`}
            title="Quay lại CSDL Cloud Chính"
          >
            <Globe className="w-3 h-3 text-emerald-500" />
            <span>{isSwitching ? 'Đang chuyển...' : 'Về Cloud SQL Chính'}</span>
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="p-1 hover:bg-black/10 rounded-md transition cursor-pointer"
            title="Ẩn tạm thời thanh này"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
