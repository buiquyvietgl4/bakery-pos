'use client';

import React, { useState, useEffect } from 'react';
import {
  Database,
  Globe,
  FlaskConical,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Copy,
  Check,
  Zap,
  RotateCcw,
  ArrowRight,
  Shield,
  HelpCircle,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import {
  getMultiSqlConfig,
  getActiveProfile,
  saveDatabaseProfile,
  switchActiveEnvironment,
  resetProfileToDefault,
  cloneDataBetweenProfiles,
  testSupabaseConnection,
  EVENT_DB_PROFILE_CHANGED,
  DatabaseProfile,
  MultiSqlConfig,
  DEFAULT_PRODUCTION_URL,
} from '@/lib/supabase/databaseProfileManager';

export default function CustomSqlConfigSection() {
  const [config, setConfig] = useState<MultiSqlConfig>(() => getMultiSqlConfig());
  const [selectedProfileId, setSelectedProfileId] = useState<string>('production');
  const [editUrl, setEditUrl] = useState('');
  const [editKey, setEditKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Trạng thái Test Ping
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);

  // Modal xác nhận chuyển đổi môi trường & chống trộn dữ liệu
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [targetSwitchAction, setTargetSwitchAction] = useState<'fetch_from_new' | 'push_current' | 'clean_slate'>('fetch_from_new');
  const [isActivating, setIsActivating] = useState(false);

  // Thông báo trạng thái chung
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Lắng nghe cập nhật
  useEffect(() => {
    const handleUpdate = () => {
      const cfg = getMultiSqlConfig();
      setConfig(cfg);
    };
    window.addEventListener(EVENT_DB_PROFILE_CHANGED, handleUpdate);
    return () => window.removeEventListener(EVENT_DB_PROFILE_CHANGED, handleUpdate);
  }, []);

  // Đồng bộ form khi chọn profile khác
  useEffect(() => {
    const prof = config.profiles.find((p) => p.id === selectedProfileId);
    if (prof) {
      setEditUrl(prof.url || '');
      setEditKey(prof.anonKey || '');
      setTestResult(null);
    }
  }, [selectedProfileId, config]);

  const activeProfile = getActiveProfile();
  const currentSelectedProfile =
    config.profiles.find((p) => p.id === selectedProfileId) || config.profiles[0];
  const isActive = activeProfile.id === selectedProfileId;

  // Xử lý Test kết nối
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await testSupabaseConnection(editUrl, editKey);
    setIsTesting(false);
    setTestResult(res);
  };

  // Xử lý lưu cấu hình (vẫn ở môi trường hiện tại hoặc cập nhật profile)
  const handleSaveProfile = () => {
    if (!editUrl.trim()) {
      alert('Vui lòng nhập Supabase Project URL');
      return;
    }
    if (!editKey.trim()) {
      alert('Vui lòng nhập Khóa API (Anon / Publishable Key)');
      return;
    }

    saveDatabaseProfile(
      {
        ...currentSelectedProfile,
        url: editUrl,
        anonKey: editKey,
      },
      'fetch_from_new'
    );

    setNotice({
      type: 'success',
      text: `Đã lưu thành công cấu hình cho "${currentSelectedProfile.name}"!`,
    });
    setTimeout(() => setNotice(null), 4000);
  };

  // Khôi phục về mặc định
  const handleResetToDefault = () => {
    if (
      confirm(
        `Bạn có chắc chắn muốn khôi phục cấu hình của "${currentSelectedProfile.name}" về mặc định ban đầu không?`
      )
    ) {
      resetProfileToDefault(selectedProfileId);
      setNotice({
        type: 'info',
        text: `Đã khôi phục "${currentSelectedProfile.name}" về mặc định hệ thống.`,
      });
      setTimeout(() => setNotice(null), 4000);
    }
  };

  // Mở modal kích hoạt
  const handleOpenActivateModal = () => {
    if (!editUrl.trim() || !editKey.trim()) {
      alert('Vui lòng điền đầy đủ URL và API Key trước khi kích hoạt!');
      return;
    }
    // Lưu lại trước
    saveDatabaseProfile(
      {
        ...currentSelectedProfile,
        url: editUrl,
        anonKey: editKey,
      },
      'fetch_from_new'
    );
    setShowSwitchModal(true);
  };

  // Thực hiện kích hoạt môi trường đã chọn
  const handleConfirmSwitch = () => {
    setIsActivating(true);
    // Chuyển môi trường và xử lý cách ly dữ liệu
    switchActiveEnvironment(selectedProfileId, targetSwitchAction);
    setShowSwitchModal(false);

    // Tải lại trang sau 300ms để áp dụng sạch sẽ toàn bộ kết nối
    setTimeout(() => {
      window.location.reload();
    }, 300);
  };

  // Xử lý tiện ích Clone dữ liệu từ Chính sang Test
  const handleCloneProdToTest = () => {
    if (
      confirm(
        'Bạn có muốn SAO CHÉP MENU BÁNH & CÔNG THỨC từ CSDL Chính sang CSDL Test không?\nToàn bộ danh mục bánh và BOM nguyên liệu sẽ được nạp sang môi trường Test để bạn tha hồ thử nghiệm mà không ảnh hưởng CSDL Chính.'
      )
    ) {
      const res = cloneDataBetweenProfiles('production', 'testing');
      if (res.success) {
        setNotice({
          type: 'success',
          text: 'Đã sao chép thành công danh mục từ CSDL Chính sang CSDL Thử Nghiệm!',
        });
        setTimeout(() => setNotice(null), 5000);
      } else {
        setNotice({
          type: 'error',
          text: res.error || 'Lỗi khi sao chép dữ liệu',
        });
      }
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs space-y-6">
      {/* TIÊU ĐỀ KHỐI */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-100">
        <div>
          <h3 className="font-black text-base text-zinc-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-600" />
            Quản Trị Đa CSDL SQL: Chính (Vận Hành) &amp; Thử Nghiệm (Test)
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tùy biến liên kết SQL linh hoạt, chuyển đổi 1-click giữa môi trường bán hàng thật và môi trường test độc lập.
          </p>
        </div>

        {/* BADGE TRẠNG THÁI ACTIVE HIỆN TẠI */}
        <div className="flex items-center gap-2">
          {activeProfile.id === 'testing' ? (
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5 animate-pulse">
              <FlaskConical className="w-4 h-4 text-amber-600" />
              Đang Chạy: CSDL Thử Nghiệm
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
              Đang Chạy: CSDL Chính (Vận Hành)
            </span>
          )}
        </div>
      </div>

      {/* THÔNG BÁO TẠM THỜI NẾU CÓ */}
      {notice && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 border ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : notice.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200'
              : 'bg-blue-50 text-blue-900 border-blue-200'
          }`}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-zinc-500 hover:text-zinc-800 text-xs"
          >
            Đóng
          </button>
        </div>
      )}

      {/* CHỌN MÔI TRƯỜNG (TABS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {config.profiles.map((prof) => {
          const isSelected = prof.id === selectedProfileId;
          const isCurrentActive = prof.id === activeProfile.id;
          const isTest = prof.id === 'testing';

          return (
            <button
              key={prof.id}
              type="button"
              onClick={() => setSelectedProfileId(prof.id)}
              className={`p-4 rounded-2xl text-left border-2 transition-all cursor-pointer relative ${
                isSelected
                  ? isTest
                    ? 'border-amber-500 bg-amber-50/50 shadow-sm'
                    : 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                  : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/40'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 font-black text-sm text-zinc-900">
                  {isTest ? (
                    <FlaskConical className={`w-4 h-4 ${isSelected ? 'text-amber-600' : 'text-zinc-500'}`} />
                  ) : (
                    <Database className={`w-4 h-4 ${isSelected ? 'text-emerald-600' : 'text-zinc-500'}`} />
                  )}
                  <span>{prof.name}</span>
                </div>

                {isCurrentActive && (
                  <span className="px-2 py-0.5 rounded-md bg-zinc-900 text-white text-[10px] font-bold tracking-wide uppercase">
                    Đang Kích Hoạt
                  </span>
                )}
              </div>

              <p className="text-xs text-zinc-500 line-clamp-2">{prof.description}</p>

              <div className="mt-2.5 pt-2 border-t border-zinc-200/60 flex items-center justify-between text-[11px]">
                <span className="text-zinc-500 font-medium truncate max-w-[220px]">
                  {prof.url ? prof.url.replace(/^https?:\/\//, '') : 'Chưa cấu hình URL'}
                </span>
                <span className="font-bold text-zinc-600">
                  {isSelected ? 'Đang chỉnh sửa ⚙️' : 'Bấm để xem'}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* FORM CHI TIẾT CỦA PROFILE ĐƯỢC CHỌN */}
      <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
              <span>Cấu Hình Chi Tiết:</span>
              <span className={selectedProfileId === 'testing' ? 'text-amber-700' : 'text-emerald-700'}>
                {currentSelectedProfile.name}
              </span>
            </h4>
            <p className="text-xs text-zinc-500">
              Nhập Supabase Project URL và Public Anon Key tương ứng với môi trường này.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isActive ? (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Hệ Thống Đang Kết Nối Môi Trường Này
              </span>
            ) : (
              <button
                type="button"
                onClick={handleOpenActivateModal}
                className="px-3.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Kích Hoạt Chuyển Sang Môi Trường Này</span>
              </button>
            )}
          </div>
        </div>

        {/* TRƯỜNG 1: SUPABASE URL */}
        <div className="space-y-1.5">
          <label className="block text-xs font-bold text-zinc-700">
            1. Supabase Project URL (Địa chỉ máy chủ SQL)
          </label>
          <div className="relative">
            <input
              type="text"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder="https://xyzproject.supabase.co"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-zinc-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs font-mono text-zinc-900"
            />
          </div>
          <p className="text-[11px] text-zinc-500">
            Ví dụ: <code className="text-zinc-700 bg-zinc-200/60 px-1 py-0.5 rounded">https://azgjnahbibrcbjooepef.supabase.co</code> hoặc domain server riêng.
          </p>
        </div>

        {/* TRƯỜNG 2: SUPABASE ANON / API KEY */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold text-zinc-700">
              2. Supabase Anon / Public API Key
            </label>
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="text-[11px] text-zinc-500 hover:text-zinc-800 flex items-center gap-1"
            >
              {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{showKey ? 'Ẩn mã khóa' : 'Hiện mã khóa'}</span>
            </button>
          </div>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={editKey}
              onChange={(e) => setEditKey(e.target.value)}
              placeholder="sb_publishable_... hoặc eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-zinc-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-xs font-mono text-zinc-900"
            />
          </div>
          <p className="text-[11px] text-zinc-500">
            Lấy tại Supabase Dashboard: <b>Settings</b> ➔ <b>API</b> ➔ Khóa <b>anon public</b> hoặc <b>Publishable key</b>.
          </p>
        </div>

        {/* KẾT QUẢ TEST PING NẾU CÓ */}
        {testResult && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              testResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900 font-medium'
                : 'bg-rose-50 border-rose-200 text-rose-900 font-medium'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <div>
              {testResult.success ? (
                <div>
                  <b>Kết nối thành công!</b> Độ trễ mạng (Ping):{' '}
                  <span className="font-black text-emerald-700">{testResult.latencyMs} ms</span>.
                  {testResult.error && <p className="text-[11px] text-amber-800 mt-0.5">{testResult.error}</p>}
                </div>
              ) : (
                <div>
                  <b>Kết nối thất bại:</b> {testResult.error}
                </div>
              )}
            </div>
          </div>
        )}

        {/* HÀNG NÚT THAO TÁC */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-200">
          <div className="flex items-center gap-2">
            {/* Nút Test Ping */}
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-100 text-zinc-700 font-bold text-xs border border-zinc-300 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-emerald-600' : ''}`} />
              <span>{isTesting ? 'Đang đo ping...' : '🔍 Kiểm Tra Kết Nối (Ping)'}</span>
            </button>

            {/* Nút Khôi phục mặc định */}
            {selectedProfileId === 'production' && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-3 py-2 rounded-xl text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 font-semibold text-xs transition cursor-pointer flex items-center gap-1"
                title="Quay lại URL gốc ban đầu"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Khôi Phục Mặc Định</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Nút Lưu cấu hình */}
            <button
              type="button"
              onClick={handleSaveProfile}
              className="px-4 py-2 rounded-xl bg-zinc-200 hover:bg-zinc-300 text-zinc-900 font-bold text-xs transition cursor-pointer"
            >
              Lưu Thông Tin
            </button>

            {/* Nút Kích hoạt chuyển đổi nếu profile chưa active */}
            {!isActive && (
              <button
                type="button"
                onClick={handleOpenActivateModal}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Kích Hoạt Ngay</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TIỆN ÍCH DÀNH RIÊNG CHO MÔI TRƯỜNG TEST: CLONE TỪ PROD SANG TEST */}
      {selectedProfileId === 'testing' && (
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="font-bold text-amber-950 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>Tiện Ích: Sao Chép Danh Mục &amp; Công Thức Sang CSDL Test</span>
            </div>
            <button
              type="button"
              onClick={handleCloneProdToTest}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>1-Click Sao Chép Sang Test</span>
            </button>
          </div>
          <p className="text-amber-800 text-[11px] leading-relaxed">
            Giúp bạn tự động lấy toàn bộ menu bánh, công thức BOM và danh sách nguyên liệu hiện có ở CSDL Chính nạp sang môi trường Thử Nghiệm. Bạn có thể thoải mái tạo đơn hàng ảo, giả lập đơn lỗi để sửa mà <b>không tốn công nhập lại danh mục</b> và <b>tuyệt đối không ảnh hưởng đến CSDL Chính</b>.
          </p>
        </div>
      )}

      {/* MODAL XÁC NHẬN CHUYỂN ĐỔI MÔI TRƯỜNG & CHỐNG TRỘN DỮ LIỆU */}
      {showSwitchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-3 pb-3 border-b border-zinc-100">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700 shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-base text-zinc-900">
                  Xác Nhận Chuyển Môi Trường CSDL SQL
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Bạn chuẩn bị chuyển sang: <b>{currentSelectedProfile.name}</b>.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed">
              🛡️ <b>Cơ chế chống trộn dữ liệu tự động</b>: Dữ liệu của môi trường cũ sẽ được đóng gói niêm phong an toàn. Hệ thống sẽ tạm khóa tính năng tự động đẩy bù để bảo đảm <b>không bị bơm ngược dữ liệu cũ lên CSDL mới</b>.
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-zinc-800">
                Chọn hướng xử lý dữ liệu trên thiết bị này:
              </label>

              {/* LỰA CHỌN 1: KHUYẾN NGHỊ */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  targetSwitchAction === 'fetch_from_new'
                    ? 'border-emerald-600 bg-emerald-50/60'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <input
                  type="radio"
                  name="syncAction"
                  checked={targetSwitchAction === 'fetch_from_new'}
                  onChange={() => setTargetSwitchAction('fetch_from_new')}
                  className="mt-1"
                />
                <div className="text-xs">
                  <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                    <span>1. Tải dữ liệu từ CSDL này về máy</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-black">
                      Khuyến Nghị
                    </span>
                  </div>
                  <p className="text-zinc-500 mt-0.5">
                    Làm sạch bộ nhớ đệm cũ trên máy, kéo 100% dữ liệu gốc của CSDL này về. Tuyệt đối không gửi đơn cũ lên.
                  </p>
                </div>
              </label>

              {/* LỰA CHỌN 2: DI CHUYỂN TIỆM */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  targetSwitchAction === 'push_current'
                    ? 'border-amber-500 bg-amber-50/60'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <input
                  type="radio"
                  name="syncAction"
                  checked={targetSwitchAction === 'push_current'}
                  onChange={() => setTargetSwitchAction('push_current')}
                  className="mt-1"
                />
                <div className="text-xs">
                  <div className="font-bold text-zinc-900">
                    2. Di chuyển dữ liệu: Đẩy toàn bộ dữ liệu trên máy lên CSDL này
                  </div>
                  <p className="text-zinc-500 mt-0.5">
                    Chỉ dùng khi bạn chuyển nhà sang Supabase mới và muốn bê nguyên toàn bộ bánh, đơn hàng hiện có lên CSDL mới.
                  </p>
                </div>
              </label>

              {/* LỰA CHỌN 3: BẮT ĐẦU TRẮNG */}
              <label
                className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition ${
                  targetSwitchAction === 'clean_slate'
                    ? 'border-zinc-700 bg-zinc-100'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <input
                  type="radio"
                  name="syncAction"
                  checked={targetSwitchAction === 'clean_slate'}
                  onChange={() => setTargetSwitchAction('clean_slate')}
                  className="mt-1"
                />
                <div className="text-xs">
                  <div className="font-bold text-zinc-900">3. Bắt đầu mới tinh (Clean Slate)</div>
                  <p className="text-zinc-500 mt-0.5">
                    Xóa sạch dữ liệu tạm trên máy và kết nối vào CSDL này như một tiệm bánh mới mở.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowSwitchModal(false)}
                disabled={isActivating}
                className="px-4 py-2 rounded-xl text-zinc-600 hover:bg-zinc-100 text-xs font-semibold transition cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmSwitch}
                disabled={isActivating}
                className="px-5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md disabled:opacity-50"
              >
                {isActivating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang kích hoạt &amp; Tải lại trang...</span>
                  </>
                ) : (
                  <>
                    <span>Xác Nhận Kích Hoạt &amp; Tải Lại</span>
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
