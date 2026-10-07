'use client';

import React, { useState, useEffect } from 'react';
import {
  Globe,
  HardDrive,
  FlaskConical,
  CheckCircle2,
  Zap,
  ArrowRight,
  ShieldCheck,
  Server,
  RefreshCw,
} from 'lucide-react';
import {
  getActiveUnifiedSqlEnv,
  getActiveUnifiedSqlEnvInfo,
  switchUnifiedSqlEnv,
  UNIFIED_SQL_ENVS,
  UnifiedSqlEnvId,
  EVENT_UNIFIED_SQL_ENV_CHANGED,
} from '@/lib/utils/unifiedSqlManager';
import { DB_MODE_CHANGED_EVENT } from '@/lib/utils/sqlModeManager';
import { EVENT_DB_PROFILE_CHANGED } from '@/lib/supabase/databaseProfileManager';

export default function UnifiedSqlSelector() {
  const [activeEnvId, setActiveEnvId] = useState<UnifiedSqlEnvId>(() => getActiveUnifiedSqlEnv());
  const [targetModalEnv, setTargetModalEnv] = useState<UnifiedSqlEnvId | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const handleUpdate = () => {
      setActiveEnvId(getActiveUnifiedSqlEnv());
    };
    window.addEventListener(EVENT_UNIFIED_SQL_ENV_CHANGED, handleUpdate);
    window.addEventListener(DB_MODE_CHANGED_EVENT, handleUpdate);
    window.addEventListener(EVENT_DB_PROFILE_CHANGED, handleUpdate);
    return () => {
      window.removeEventListener(EVENT_UNIFIED_SQL_ENV_CHANGED, handleUpdate);
      window.removeEventListener(DB_MODE_CHANGED_EVENT, handleUpdate);
      window.removeEventListener(EVENT_DB_PROFILE_CHANGED, handleUpdate);
    };
  }, []);

  const activeEnvInfo = UNIFIED_SQL_ENVS[activeEnvId] || UNIFIED_SQL_ENVS.cloud_production;

  const handleConfirmSwitch = () => {
    if (!targetModalEnv) return;
    setIsSwitching(true);
    switchUnifiedSqlEnv(targetModalEnv);
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-zinc-200 p-6 shadow-xs space-y-5">
      {/* TIÊU ĐỀ KHỐI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100">
        <div>
          <h3 className="font-black text-base text-zinc-900 flex items-center gap-2">
            <Server className="w-5 h-5 text-emerald-600" />
            Chọn Môi Trường Làm Việc CSDL (Độc Lập 100%)
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Bấm chọn 1 trong 4 môi trường bên dưới. Khi chọn, ứng dụng <b>chỉ làm việc với dữ liệu trên CSDL đó</b>, không đồng bộ hay trộn lẫn dữ liệu.
          </p>
        </div>

        {/* BADGE MÔI TRƯỜNG HIỆN TẠI */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-3 py-1.5 rounded-full border text-xs font-black flex items-center gap-1.5 ${activeEnvInfo.colorScheme.badgeBg} ${activeEnvInfo.colorScheme.badgeText}`}>
            <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
            Đang Chạy: {activeEnvInfo.shortName}
          </span>
        </div>
      </div>

      {/* LƯỚI 4 THẺ MÔI TRƯỜNG RÕ RÀNG */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {(Object.keys(UNIFIED_SQL_ENVS) as UnifiedSqlEnvId[]).map((envKey) => {
          const env = UNIFIED_SQL_ENVS[envKey];
          const isActive = envKey === activeEnvId;

          return (
            <div
              key={env.id}
              onClick={() => {
                if (!isActive) setTargetModalEnv(env.id);
              }}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between relative space-y-3 ${
                isActive
                  ? `${env.colorScheme.borderActive} ${env.colorScheme.bgActive} shadow-sm ring-3 ring-zinc-900/5`
                  : 'border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 hover:bg-white'
              }`}
            >
              {/* PHẦN ĐẦU THẺ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shadow-2xs ${
                    isActive ? env.colorScheme.iconBg : 'bg-zinc-200 text-zinc-600'
                  }`}>
                    {env.category === 'cloud' ? (
                      env.isTest ? <FlaskConical className="w-4 h-4" /> : <Globe className="w-4 h-4" />
                    ) : (
                      env.isTest ? <FlaskConical className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />
                    )}
                  </div>

                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                    isActive ? env.colorScheme.badgeBg + ' ' + env.colorScheme.badgeText : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                  }`}>
                    {env.badgeLabel}
                  </span>
                </div>

                <div>
                  <h4 className="font-black text-xs text-zinc-900 leading-snug">
                    {env.name}
                  </h4>
                  <div className="text-[11px] font-mono text-zinc-500 mt-0.5 truncate" title={env.storageLocation}>
                    {env.storageLocation}
                  </div>
                </div>

                <p className="text-[11px] text-zinc-600 leading-relaxed line-clamp-3">
                  {env.description}
                </p>
              </div>

              {/* NÚT THAO TÁC / TRẠNG THÁI CHÂN THẺ */}
              <div className="pt-2.5 border-t border-zinc-200/70 flex items-center justify-between">
                {isActive ? (
                  <span className="text-[11px] font-black text-zinc-900 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đang Hoạt Động
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTargetModalEnv(env.id);
                    }}
                    className="text-[11px] font-bold text-zinc-700 hover:text-zinc-900 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Chuyển sang</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL XÁC NHẬN CHUYỂN MÔI TRƯỜNG */}
      {targetModalEnv && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-zinc-200 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 pb-3 border-b border-zinc-100">
              <div className="p-2.5 rounded-2xl bg-emerald-100 text-emerald-800 shrink-0">
                <Zap className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-black text-base text-zinc-900">
                  Xác Nhận Chuyển Môi Trường CSDL
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Bạn chuẩn bị chuyển sang: <b>{UNIFIED_SQL_ENVS[targetModalEnv]?.name}</b>
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 text-xs space-y-2 leading-relaxed text-zinc-700">
              <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Nguyên tắc cách ly dữ liệu độc lập 100%:</span>
              </div>
              <p>
                • Ứng dụng sẽ <b>chỉ kết nối và thao tác với dữ liệu</b> tại vị trí: <code className="bg-zinc-200/80 px-1 py-0.5 rounded font-mono font-bold text-zinc-900">{UNIFIED_SQL_ENVS[targetModalEnv]?.storageLocation}</code>.
              </p>
              <p>
                • Toàn bộ dữ liệu của môi trường cũ được giữ nguyên vẹn 100%, <b>tuyệt đối không bị đồng bộ hay ghi đè</b> sang môi trường mới.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTargetModalEnv(null)}
                disabled={isSwitching}
                className="px-4 py-2 rounded-xl text-zinc-600 hover:bg-zinc-100 text-xs font-semibold cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmSwitch}
                disabled={isSwitching}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md disabled:opacity-50"
              >
                {isSwitching ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang chuyển môi trường...</span>
                  </>
                ) : (
                  <>
                    <span>Xác Nhận &amp; Tải Lại Trang</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
