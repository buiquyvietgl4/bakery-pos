'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Zap,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Server,
  Radio,
  ExternalLink,
  Shield,
  Layers,
} from 'lucide-react';
import {
  getKeepAliveStatus,
  executeKeepAlivePing,
  EVENT_KEEP_ALIVE_UPDATED,
  KeepAliveStatus,
  SUPABASE_INACTIVITY_LIMIT_DAYS,
} from '@/lib/supabase/keepAliveManager';

export default function SupabaseKeepAliveSection() {
  const [status, setStatus] = useState<KeepAliveStatus>(() => getKeepAliveStatus());
  const [isPinging, setIsPinging] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    latency?: number;
    table?: string;
  } | null>(null);

  useEffect(() => {
    // Cập nhật trạng thái ban đầu
    setStatus(getKeepAliveStatus());

    // Lắng nghe sự kiện cập nhật Keep-Alive từ bất kỳ tiến trình nào
    const handleUpdate = () => {
      setStatus(getKeepAliveStatus());
    };

    window.addEventListener(EVENT_KEEP_ALIVE_UPDATED, handleUpdate);
    return () => {
      window.removeEventListener(EVENT_KEEP_ALIVE_UPDATED, handleUpdate);
    };
  }, []);

  const handleManualPing = async () => {
    setIsPinging(true);
    setFeedback(null);
    try {
      const res = await executeKeepAlivePing('admin-manual');
      if (res.success) {
        setFeedback({
          type: 'success',
          text: `Gửi tín hiệu thành công! Đã kích hoạt lại thời hạn 7 ngày trên Supabase Cloud.`,
          latency: res.latencyMs,
          table: res.tableChecked,
        });
      } else {
        setFeedback({
          type: 'error',
          text: `Gửi tín hiệu thất bại: ${res.error || res.message}`,
          latency: res.latencyMs,
        });
      }
      setStatus(getKeepAliveStatus());
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: `Lỗi: ${err?.message || 'Không thể gửi tín hiệu'}`,
      });
    } finally {
      setIsPinging(false);
    }
  };

  // Định dạng ngày giờ hiển thị
  const formatTime = (ts: number | null) => {
    if (!ts) return 'Chưa có lượt ping nào';
    const d = new Date(ts);
    return `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} - ${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  };

  const getSourceLabel = (src?: string) => {
    switch (src) {
      case 'vercel-cron':
        return 'Vercel Cron (Đám mây)';
      case 'github-actions':
        return 'GitHub Actions (Dự phòng)';
      case 'client-auto':
        return 'In-App Heartbeat (Mở ứng dụng)';
      case 'admin-manual':
        return 'Kích hoạt thủ công';
      default:
        return src || 'Tự động';
    }
  };

  const daysSafe = status.daysRemaining ?? SUPABASE_INACTIVITY_LIMIT_DAYS;
  const progressPercent = Math.min(100, Math.max(10, (daysSafe / SUPABASE_INACTIVITY_LIMIT_DAYS) * 100));

  return (
    <div className="bg-white rounded-3xl border border-amber-900/10 p-6 shadow-xs space-y-5">
      {/* TIÊU ĐỀ & TRẠNG THÁI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-700">
              <ShieldCheck className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-black text-sm sm:text-base text-zinc-900">
              Cơ Chế Chống Khóa Tạm Thời CSDL Supabase Cloud (Anti-Inactivity)
            </h3>
          </div>
          <p className="text-xs text-zinc-500 max-w-2xl leading-relaxed">
            Supabase Free Tier sẽ tạm dừng dự án nếu không có hoạt động trong 7 ngày. Hệ thống đã cài đặt cơ chế <b>tự động gửi tín hiệu đọc siêu nhẹ mỗi 2 ngày</b> để kích hoạt lại thời hạn 7 ngày, đảm bảo <b>100% không làm thay đổi hay ảnh hưởng dữ liệu</b>.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Đang bảo vệ 24/7 (Mỗi 2 ngày)</span>
          </span>
        </div>
      </div>

      {/* 3 THẺ CHỈ SỐ HOẠT ĐỘNG */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* THẺ 1: THỜI HẠN AN TOÀN CÒN LẠI */}
        <div className="p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200/80 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Thời hạn an toàn Supabase</span>
            </span>
            <span className="font-black text-emerald-700 text-xs">
              {daysSafe} / {SUPABASE_INACTIVITY_LIMIT_DAYS} ngày
            </span>
          </div>
          <div className="w-full h-2.5 bg-zinc-200 rounded-full overflow-hidden p-0.5">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-[11px] text-zinc-500 flex items-center justify-between">
            <span>Ngưỡng tạm dừng: 0 ngày</span>
            <span className="text-emerald-700 font-semibold">Tự động gia hạn liên tục</span>
          </p>
        </div>

        {/* THẺ 2: LẦN GỬI TÍN HIỆU GẦN NHẤT */}
        <div className="p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-amber-600" />
              <span>Lần gửi tín hiệu gần nhất</span>
            </span>
            {status.lastResult?.latencyMs && (
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                {status.lastResult.latencyMs} ms
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-zinc-900 truncate">
            {formatTime(status.lastPingTime)}
          </div>
          <div className="text-[11px] text-zinc-500 truncate">
            Nguồn: <b className="text-zinc-700">{getSourceLabel(status.lastResult?.source)}</b>
            {status.lastResult?.tableChecked && (
              <span> • Bảng: <code className="text-zinc-800">{status.lastResult.tableChecked}</code></span>
            )}
          </div>
        </div>

        {/* THẺ 3: BẢO VỆ DỮ LIỆU TUYỆT ĐỐI */}
        <div className="p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>Tác động dữ liệu CSDL</span>
            </span>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
              100% Read-Only
            </span>
          </div>
          <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>0 bản ghi bị thêm / sửa / xóa</span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Sử dụng truy vấn siêu nhẹ (HEAD đếm 1 mục), dung lượng ~200 bytes, bảo toàn 100% dữ liệu gốc.
          </p>
        </div>
      </div>

      {/* CƠ CHẾ 3 TẦNG BẢO VỆ TỰ ĐỘNG */}
      <div className="p-4 rounded-2xl bg-amber-50/40 border border-amber-900/10 space-y-3">
        <h4 className="font-bold text-xs text-amber-950 flex items-center gap-2">
          <Layers className="w-4 h-4 text-amber-700" />
          <span>Hệ Thống 3 Tầng Kích Hoạt Tự Động Định Kỳ:</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-white border border-amber-900/10 space-y-1">
            <div className="font-black text-amber-900 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-amber-600" />
              <span>1. Vercel Cron Cloud</span>
            </div>
            <p className="text-[11px] text-zinc-600 leading-tight">
              Chạy tự động mỗi <b>2 ngày</b> lúc 11:00 AM trực tiếp trên server Vercel (kể cả khi tiệm nghỉ lễ).
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-white border border-amber-900/10 space-y-1">
            <div className="font-black text-amber-900 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              <span>2. GitHub Actions Cron</span>
            </div>
            <p className="text-[11px] text-zinc-600 leading-tight">
              Bộ kích hoạt độc lập định kỳ mỗi <b>3 ngày</b>, đảm bảo tính sẵn sàng dự phòng 100%.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-white border border-amber-900/10 space-y-1">
            <div className="font-black text-amber-900 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-amber-600" />
              <span>3. In-App Heartbeat</span>
            </div>
            <p className="text-[11px] text-zinc-600 leading-tight">
              Tự động gửi tín hiệu khi thu ngân hoặc quản lý mở app nếu đã quá <b>48 giờ</b> kể từ lần cuối.
            </p>
          </div>
        </div>
      </div>

      {/* FEEDBACK THÔNG BÁO THỦ CÔNG */}
      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center justify-between gap-2 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          {feedback.latency && (
            <span className="font-bold shrink-0 bg-white/80 px-2 py-0.5 rounded-md border border-emerald-300/60">
              {feedback.latency} ms
            </span>
          )}
        </div>
      )}

      {/* THANH THAO TÁC THỦ CÔNG */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
        <div className="text-[11px] text-zinc-500 text-center sm:text-left">
          💡 Bạn có thể bấm nút bên phải để kiểm tra đường truyền và kích hoạt Supabase ngay lập tức bất cứ lúc nào.
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <a
            href="/api/cron/keep-alive/"
            target="_blank"
            rel="noreferrer"
            className="flex-1 sm:flex-initial px-3 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            title="Xem phản hồi JSON trực tiếp từ Endpoint API"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
            <span>Endpoint API</span>
          </a>

          <button
            type="button"
            onClick={handleManualPing}
            disabled={isPinging}
            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 hover:from-amber-700 hover:to-orange-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-60 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
            <span>{isPinging ? 'Đang gửi tín hiệu...' : '🚀 Kích Hoạt Ngay (Ping Supabase)'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
