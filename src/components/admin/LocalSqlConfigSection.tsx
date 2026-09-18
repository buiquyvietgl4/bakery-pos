'use client';

import React, { useState, useEffect } from 'react';
import {
  Folder,
  Database,
  FlaskConical,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  FileText,
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
  Wifi,
  Smartphone,
  HardDrive,
} from 'lucide-react';
import {
  getSqlModeConfig,
  saveSqlModeConfig,
  saveLocalEnvConfig,
  switchLocalEnvironment,
  copyLocalProductionToTesting,
  getActiveLocalEnv,
  LocalSqlEnvironmentId,
  LocalSqlEnvironmentConfig,
  SqlModeConfig,
  EVENT_LOCAL_SQL_ENV_CHANGED,
  DB_MODE_CHANGED_EVENT,
  isLocalMode,
} from '@/lib/utils/sqlModeManager';
import {
  selectLocalSqlDirectory,
  getStoredLocalSqlDirHandle,
  writeLocalSqlFiles,
  downloadLocalMasterSql,
  restoreLocalFromFolder,
  restoreLocalFromBackupData,
} from '@/lib/utils/localSqlManager';
import { gatherFullBakeryData } from '@/lib/utils/backupManager';

export default function LocalSqlConfigSection() {
  const [config, setConfig] = useState<SqlModeConfig>(() => getSqlModeConfig());
  const [selectedEnvId, setSelectedEnvId] = useState<LocalSqlEnvironmentId>(() => getActiveLocalEnv());
  const [serverDirPathInput, setServerDirPathInput] = useState<string>('');
  
  // Trạng thái thao tác
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isTestingFolder, setIsTestingFolder] = useState(false);
  const [testFolderResult, setTestFolderResult] = useState<{
    success: boolean;
    path?: string;
    exists?: boolean;
    files?: string[];
    hasMasterSql?: boolean;
    hasJson?: boolean;
    error?: string;
  } | null>(null);

  // Thông báo trạng thái
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modal xác nhận chuyển đổi môi trường
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [switchAction, setSwitchAction] = useState<'load_vault' | 'clone_from_current' | 'clean_slate'>('load_vault');

  // Lắng nghe cập nhật cấu hình
  useEffect(() => {
    const handleUpdate = () => {
      const cfg = getSqlModeConfig();
      setConfig(cfg);
    };
    window.addEventListener(DB_MODE_CHANGED_EVENT, handleUpdate);
    window.addEventListener(EVENT_LOCAL_SQL_ENV_CHANGED, handleUpdate);
    return () => {
      window.removeEventListener(DB_MODE_CHANGED_EVENT, handleUpdate);
      window.removeEventListener(EVENT_LOCAL_SQL_ENV_CHANGED, handleUpdate);
    };
  }, []);

  // Đồng bộ ô input đường dẫn khi chọn tab môi trường khác
  const [networkInfo, setNetworkInfo] = useState<{ ip: string; port: number; posUrl: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    fetch('/api/system/network-info')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setNetworkInfo(d);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const envConfig = config.localEnvs[selectedEnvId];
    if (envConfig) {
      setServerDirPathInput(envConfig.folderPath || '');
      setTestFolderResult(null);
    }
  }, [selectedEnvId, config]);

  const activeEnvId = config.activeLocalEnv || 'production';
  const currentEnvConfig = config.localEnvs[selectedEnvId] || config.localEnvs.production;
  const isActive = selectedEnvId === activeEnvId;

  // Hiển thị thông báo tự tắt
  const showNotice = (type: 'success' | 'error' | 'info', text: string) => {
    setNotice({ type, text });
    setTimeout(() => setNotice(null), 7000);
  };

  // 1. Chọn thư mục qua File System Access API
  const handleChooseFolder = async () => {
    setIsSyncing(true);
    setNotice(null);
    try {
      const res = await selectLocalSqlDirectory(selectedEnvId);
      if (res.success) {
        showNotice(
          'success',
          `Đã liên kết thư mục "${res.folderName}" cho môi trường ${selectedEnvId === 'production' ? 'Local SQL Chính' : 'Local SQL Thử Nghiệm'} thành công!`
        );
      } else if (res.error && res.error !== 'Đã hủy chọn thư mục') {
        showNotice('error', res.error);
      }
    } catch (e: any) {
      showNotice('error', e.message || 'Lỗi khi chọn thư mục');
    } finally {
      setIsSyncing(false);
    }
  };

  // 2. Áp dụng đường dẫn ổ cứng máy tính (C:\... hoặc D:\...)
  const handleApplyPath = async () => {
    const trimmed = serverDirPathInput.trim();
    if (!trimmed) {
      showNotice('error', 'Vui lòng nhập đường dẫn thư mục (ví dụ D:\\CSDL_TiemBanh\\Chinh hoặc C:\\BakerySQL\\Test).');
      return;
    }
    setIsSyncing(true);
    setNotice(null);
    try {
      const res = await fetch('/api/local-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test_or_create',
          dirPath: trimmed,
          env: selectedEnvId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        saveLocalEnvConfig(selectedEnvId, {
          folderPath: data.path,
          folderName: data.path.split(/[/\\]/).pop() || `Thư mục ${selectedEnvId}`,
        });
        showNotice(
          'success',
          `Đã thiết lập đường dẫn "${data.path}" cho ${selectedEnvId === 'production' ? 'Local SQL Chính' : 'Local SQL Thử Nghiệm'} thành công!`
        );
      } else {
        showNotice('error', data.error || 'Lỗi áp dụng đường dẫn');
      }
    } catch (e: any) {
      showNotice('error', e.message || 'Lỗi kết nối API máy chủ');
    } finally {
      setIsSyncing(false);
    }
  };

  // 3. Kiểm tra tình trạng thư mục (Test Ping)
  const handleTestFolder = async () => {
    const targetPath = serverDirPathInput.trim() || currentEnvConfig.folderPath;
    if (!targetPath) {
      showNotice('error', 'Chưa có đường dẫn thư mục để kiểm tra.');
      return;
    }
    setIsTestingFolder(true);
    setTestFolderResult(null);
    try {
      const res = await fetch(`/api/local-sql?dir=${encodeURIComponent(targetPath)}`);
      const data = await res.json();
      setTestFolderResult(data);
      if (data.success && data.exists) {
        showNotice('success', `Thư mục hợp lệ! Tìm thấy ${data.files?.length || 0} tệp trong thư mục.`);
      } else {
        showNotice('info', 'Thư mục chưa tồn tại hoặc chưa có tệp CSDL.');
      }
    } catch (e: any) {
      setTestFolderResult({ success: false, error: e.message });
      showNotice('error', 'Lỗi kiểm tra thư mục: ' + e.message);
    } finally {
      setIsTestingFolder(false);
    }
  };

  // 4. Xuất & Cập nhật CSDL ngay vào thư mục
  const handleSyncNow = async () => {
    setIsSyncing(true);
    setNotice(null);
    try {
      const fullData = await gatherFullBakeryData();
      let done = false;

      // Thử ghi qua Directory Handle nếu có
      const dirHandle = await getStoredLocalSqlDirHandle(selectedEnvId);
      if (dirHandle) {
        try {
          const p = await dirHandle.queryPermission({ mode: 'readwrite' });
          if (p === 'granted' || (await dirHandle.requestPermission({ mode: 'readwrite' })) === 'granted') {
            await writeLocalSqlFiles(dirHandle, fullData);
            saveLocalEnvConfig(selectedEnvId, { lastSyncAt: new Date().toISOString() });
            done = true;
          }
        } catch (_) {}
      }

      // Ghi qua server path nếu có
      const targetPath = currentEnvConfig.folderPath || serverDirPathInput.trim();
      if (targetPath) {
        const res = await fetch('/api/local-sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_sql',
            dirPath: targetPath,
            env: selectedEnvId,
            data: fullData,
          }),
        });
        const d = await res.json();
        if (d.success) {
          saveLocalEnvConfig(selectedEnvId, {
            folderPath: d.path,
            lastSyncAt: new Date().toISOString(),
          });
          done = true;
        }
      }

      if (done) {
        showNotice(
          'success',
          `Đã xuất và cập nhật 100% CSDL vào thư mục ${selectedEnvId === 'production' ? 'Chính' : 'Thử Nghiệm'} thành công (bakery_master.sql, bakery_local_db.json)!`
        );
      } else {
        showNotice(
          'error',
          'Chưa chọn thư mục hoặc chưa nhập đường dẫn. Vui lòng bấm "Chọn Thư Mục..." hoặc nhập đường dẫn ổ đĩa.'
        );
      }
    } catch (e: any) {
      showNotice('error', e.message || 'Lỗi đồng bộ dữ liệu vào thư mục');
    } finally {
      setIsSyncing(false);
    }
  };

  // 5. Nạp lại CSDL từ thư mục
  const handleRestoreNow = async () => {
    if (
      !confirm(
        `Bạn có chắc chắn muốn nạp lại dữ liệu từ thư mục của "${currentEnvConfig.name}" không?\nDữ liệu trên màn hình sẽ được khôi phục theo tệp trong thư mục này.`
      )
    ) {
      return;
    }

    setIsRestoring(true);
    setNotice(null);
    try {
      let res: any = null;
      const dirHandle = await getStoredLocalSqlDirHandle(selectedEnvId);
      if (dirHandle) {
        res = await restoreLocalFromFolder(dirHandle);
      } else if (currentEnvConfig.folderPath) {
        const resp = await fetch('/api/local-sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'read_sql',
            dirPath: currentEnvConfig.folderPath,
            env: selectedEnvId,
          }),
        });
        const d = await resp.json();
        if (d.success && d.data) {
          res = await restoreLocalFromBackupData(d.data);
        } else {
          res = { success: false, message: d.error || 'Lỗi đọc tệp từ máy chủ' };
        }
      } else {
        res = { success: false, message: 'Chưa có thư mục CSDL nào được liên kết.' };
      }

      if (res && res.success) {
        showNotice('success', res.message);
      } else {
        showNotice('error', res?.message || 'Không thể khôi phục từ thư mục');
      }
    } catch (e: any) {
      showNotice('error', e.message || 'Lỗi khôi phục CSDL');
    } finally {
      setIsRestoring(false);
    }
  };

  // 6. Sao chép dữ liệu từ Chính sang Test (1-Click Clone)
  const handleCloneToTest = async () => {
    if (
      !confirm(
        'Bạn có muốn sao chép toàn bộ dữ liệu từ Local SQL Chính sang Local SQL Test không?\n' +
          'Dữ liệu ở Test sẽ được làm mới bằng thực đơn, kho hàng và đơn hàng thực tế của tiệm bánh để bạn thử nghiệm an toàn.'
      )
    ) {
      return;
    }

    setIsCloning(true);
    setNotice(null);
    try {
      // 1. Sao chép trong LocalStorage Vault
      copyLocalProductionToTesting();

      // 2. Sao chép các tệp trên ổ đĩa máy tính chủ qua API
      const res = await fetch('/api/local-sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'clone_production_to_testing',
          dirPath: config.localEnvs.testing.folderPath,
        }),
      });
      const d = await res.json();

      showNotice(
        'success',
        'Đã sao chép 100% dữ liệu từ Local Chính sang Local Test thành công! Bạn có thể chuyển sang Test để thử nghiệm an toàn.'
      );
    } catch (e: any) {
      showNotice('error', e.message || 'Lỗi khi sao chép dữ liệu');
    } finally {
      setIsCloning(false);
    }
  };

  // 7. Kích hoạt môi trường đang chọn
  const handleConfirmSwitch = () => {
    switchLocalEnvironment(selectedEnvId, switchAction);
    setShowSwitchModal(false);
    showNotice(
      'success',
      `Đã chuyển sang môi trường "${selectedEnvId === 'production' ? 'Local SQL Chính' : 'Local SQL Thử Nghiệm'}" thành công!`
    );
    // Tự động tải lại trang nhẹ để cập nhật toàn bộ context
    setTimeout(() => {
      window.location.reload();
    }, 600);
  };

  return (
    <div className="space-y-4">
      {/* ── THANH CHỌN MÔI TRƯỜNG LOCAL SQL (CHÍNH VS TEST) ── */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div>
            <h3 className="font-black text-sm sm:text-base text-zinc-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-600" />
              Cơ Chế 2 CSDL Local SQL (Chính & Thử Nghiệm Test)
            </h3>
            <p className="text-xs text-zinc-500 font-medium mt-0.5">
              Tách biệt hoàn toàn thư mục lưu trữ và dữ liệu giữa bán hàng thực tế và thử nghiệm tính năng
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-black flex items-center gap-1.5 ${
                activeEnvId === 'production'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : 'bg-purple-100 text-purple-900 border border-purple-200'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  activeEnvId === 'production' ? 'bg-emerald-600 animate-pulse' : 'bg-purple-600 animate-pulse'
                }`}
              />
              <span>Đang Chạy: {activeEnvId === 'production' ? 'Local Chính' : 'Local Test'}</span>
            </span>
          </div>
        </div>

        {/* Cụm Tabs chọn giữa Chính & Test */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
          {/* TAB 1: LOCAL CHÍNH */}
          <div
            onClick={() => setSelectedEnvId('production')}
            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
              selectedEnvId === 'production'
                ? 'border-emerald-600 bg-emerald-50/50 shadow-sm'
                : 'border-zinc-200 bg-zinc-50/60 hover:bg-zinc-100/80'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    selectedEnvId === 'production' ? 'bg-emerald-600 text-white' : 'bg-zinc-200 text-zinc-700'
                  }`}
                >
                  <Database className="w-4 h-4" />
                </span>
                <span className="font-black text-xs sm:text-sm text-zinc-900">1. Local SQL Chính (Vận Hành)</span>
              </div>
              {activeEnvId === 'production' && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[10px]">
                  Kích hoạt
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Thư mục chứa dữ liệu bán hàng, công thức và sổ sách kế toán thực tế của tiệm.
            </p>
          </div>

          {/* TAB 2: LOCAL TEST */}
          <div
            onClick={() => setSelectedEnvId('testing')}
            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
              selectedEnvId === 'testing'
                ? 'border-purple-600 bg-purple-50/50 shadow-sm'
                : 'border-zinc-200 bg-zinc-50/60 hover:bg-zinc-100/80'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span
                  className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                    selectedEnvId === 'testing' ? 'bg-purple-600 text-white' : 'bg-zinc-200 text-zinc-700'
                  }`}
                >
                  <FlaskConical className="w-4 h-4" />
                </span>
                <span className="font-black text-xs sm:text-sm text-zinc-900">2. Local SQL Thử Nghiệm (Test)</span>
              </div>
              {activeEnvId === 'testing' && (
                <span className="px-2 py-0.5 rounded-md bg-purple-600 text-white font-bold text-[10px]">
                  Kích hoạt
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 leading-snug">
              Thư mục CSDL độc lập để tạo đơn ảo, thử công thức mà hoàn toàn KHÔNG ảnh hưởng CSDL Chính.
            </p>
          </div>
        </div>
      </div>

      {/* ── KHUNG CÀI ĐẶT THƯ MỤC CỦA MÔI TRƯỜNG ĐANG XEM ── */}
      <div className="bg-white rounded-3xl border border-zinc-200 p-4 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
          <div>
            <h4 className="font-black text-sm text-zinc-900 flex items-center gap-2">
              <Folder className={`w-4 h-4 ${selectedEnvId === 'production' ? 'text-emerald-600' : 'text-purple-600'}`} />
              Thư Mục Lưu Trữ: {currentEnvConfig.name}
            </h4>
            <p className="text-xs text-zinc-500">
              Chọn thư mục ổ đĩa máy tính để lưu trữ các tệp <code>bakery_master.sql</code> và <code>bakery_local_db.json</code>.
            </p>
          </div>

          {!isActive && (
            <button
              type="button"
              onClick={() => setShowSwitchModal(true)}
              className={`px-4 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer active:scale-95 ${
                selectedEnvId === 'production'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Chuyển Sang Kích Hoạt Môi Trường Này</span>
            </button>
          )}
        </div>

        {/* NÚT CHỌN THƯ MỤC & CÔNG CỤ */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleChooseFolder}
              disabled={isSyncing}
              className={`px-4 py-2.5 rounded-2xl text-white font-bold text-xs flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50 ${
                selectedEnvId === 'production'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              <Folder className="w-4 h-4" />
              <span>
                {currentEnvConfig.folderName
                  ? `Đổi Thư Mục (${currentEnvConfig.folderName})...`
                  : 'Chọn Thư Mục Máy Tính...'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="px-4 py-2.5 rounded-2xl bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-800 font-bold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer disabled:opacity-50"
              title="Ghi toàn bộ dữ liệu hiện tại vào thư mục này"
            >
              <RefreshCw className={`w-4 h-4 text-amber-600 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Xuất & Cập Nhật CSDL Ngay</span>
            </button>

            <button
              type="button"
              onClick={handleRestoreNow}
              disabled={isRestoring}
              className="px-4 py-2.5 rounded-2xl bg-white border border-blue-200 hover:bg-blue-50 text-blue-900 font-bold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer disabled:opacity-50"
              title="Khôi phục lại dữ liệu từ thư mục này lên màn hình"
            >
              <Upload className={`w-4 h-4 text-blue-600 ${isRestoring ? 'animate-spin' : ''}`} />
              <span>Nạp Lại Từ Thư Mục</span>
            </button>

            {/* Nút Clone sang Test chỉ hiện khi xem tab Test */}
            {selectedEnvId === 'testing' && (
              <button
                type="button"
                onClick={handleCloneToTest}
                disabled={isCloning}
                className="px-4 py-2.5 rounded-2xl bg-purple-50 border border-purple-300 hover:bg-purple-100 text-purple-900 font-bold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer disabled:opacity-50"
                title="Sao chép toàn bộ món bánh, kho và công thức từ Chính sang Test để thử nghiệm"
              >
                <Copy className={`w-4 h-4 text-purple-600 ${isCloning ? 'animate-spin' : ''}`} />
                <span>⚡ Sao Chép Dữ Liệu Từ Chính Sang Test</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                gatherFullBakeryData().then(downloadLocalMasterSql);
                showNotice('success', 'Đã tải tệp bakery_master.sql về máy tính!');
              }}
              className="px-3.5 py-2.5 rounded-2xl bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-700 font-bold text-xs flex items-center gap-1.5 shadow-2xs transition cursor-pointer ml-auto"
              title="Tải tệp .SQL về máy"
            >
              <Download className="w-4 h-4 text-zinc-500" />
              <span>Tải .SQL</span>
            </button>
          </div>

          {/* Ô NHẬP ĐƯỜNG DẪN Ổ ĐĨA MÁY CHỦ */}
          <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <span className="text-xs text-zinc-600 font-medium shrink-0">
              Đường dẫn ổ đĩa {selectedEnvId === 'production' ? 'Chính' : 'Test'}:
            </span>
            <input
              type="text"
              value={serverDirPathInput}
              onChange={(e) => setServerDirPathInput(e.target.value)}
              placeholder={
                selectedEnvId === 'production'
                  ? 'VD: D:\\CSDL_TiemBanh\\Chinh hoặc C:\\BakerySQL\\Production'
                  : 'VD: D:\\CSDL_TiemBanh\\Test hoặc C:\\BakerySQL\\Testing'
              }
              className="flex-1 px-3 py-1.5 text-xs bg-white border border-zinc-300 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-mono"
            />
            <button
              type="button"
              onClick={handleApplyPath}
              disabled={isSyncing || !serverDirPathInput.trim()}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white font-bold text-xs shrink-0 cursor-pointer disabled:opacity-40"
            >
              Áp Dụng
            </button>
            <button
              type="button"
              onClick={handleTestFolder}
              disabled={isTestingFolder || !serverDirPathInput.trim()}
              className="px-3.5 py-1.5 rounded-xl bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 font-bold text-xs shrink-0 cursor-pointer disabled:opacity-40 flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTestingFolder ? 'animate-spin' : ''}`} />
              <span>Kiểm Tra</span>
            </button>
          </div>

          {/* KẾT QUẢ KIỂM TRA THƯ MỤC */}
          {testFolderResult && (
            <div
              className={`p-3 rounded-2xl border text-xs animate-in fade-in space-y-1.5 ${
                testFolderResult.success && testFolderResult.exists
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                {testFolderResult.success && testFolderResult.exists ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>
                  {testFolderResult.success && testFolderResult.exists
                    ? `Thư mục hợp lệ: "${testFolderResult.path}"`
                    : `Thư mục chưa sẵn sàng: ${testFolderResult.error || 'Chưa tồn tại'}`}
                </span>
              </div>
              {testFolderResult.files && (
                <div className="text-[11px] font-mono text-zinc-600 flex flex-wrap gap-2 pt-1">
                  <span className="font-sans font-bold">Các tệp có sẵn:</span>
                  {testFolderResult.files.map((f) => (
                    <span key={f} className="px-1.5 py-0.5 bg-white rounded border border-zinc-200 text-zinc-800">
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* THÔNG BÁO TRẠNG THÁI */}
        {notice && (
          <div
            className={`p-3 rounded-2xl border text-xs font-medium flex items-center gap-2 animate-in fade-in ${
              notice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : notice.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : notice.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        )}
      </div>

      {/* ── KHỐI GIẢI THÍCH ĐỒNG BỘ MẠNG LAN & CÁC MÁY CON QUA PORT ── */}
      <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/70 to-blue-50/70 rounded-3xl border border-blue-200/80 p-4 sm:p-5 text-xs text-blue-950 space-y-2">
        <div className="font-black text-sm flex items-center gap-2 text-blue-900">
          <Wifi className="w-4 h-4 text-blue-700" />
          <span>Cơ Chế Phân Bố Dữ Liệu Khi Chạy Mạng LAN (Các Máy Con Kết Nối Qua Port 3000)</span>
        </div>

        {/* THẺ HIỂN THỊ ĐỊA CHỈ TRUY CẬP ĐIỆN THOẠI TRỰC TIẾP */}
        {networkInfo && networkInfo.ip !== '127.0.0.1' && (
          <div className="p-3 bg-white rounded-2xl border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Smartphone className="w-5 h-5" />
              </span>
              <div>
                <div className="text-[10px] font-black uppercase text-blue-600 tracking-wider">ĐỊA CHỈ KẾT NỐI CHO ĐIỆN THOẠI / IPAD (CÙNG WIFI):</div>
                <div className="text-sm sm:text-base font-black text-zinc-900 font-mono tracking-tight flex items-center gap-2">
                  <span>{networkInfo.posUrl}</span>
                </div>
                <div className="text-[11px] text-zinc-500 font-medium">Mở Safari hoặc Chrome trên điện thoại và nhập đúng địa chỉ này để bán hàng.</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(networkInfo.posUrl);
                setCopiedUrl(true);
                setTimeout(() => setCopiedUrl(false), 2500);
              }}
              className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 active:scale-95"
            >
              {copiedUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-blue-600" />}
              <span>{copiedUrl ? 'Đã Sao Chép Link!' : 'Sao Chép Địa Chỉ'}</span>
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-[11px] leading-relaxed text-zinc-700">
          <div className="p-3 bg-white/80 rounded-2xl border border-blue-100 space-y-1">
            <div className="font-bold text-blue-900 flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-blue-600" />
              <span>1. Ổ Cứng Máy Chủ Lưu Trữ Tập Trung:</span>
            </div>
            <p>
              Cả 2 thư mục <b>Chính</b> và <b>Test</b> đều nằm trên ổ cứng của máy tính chủ này. Các máy con (điện thoại, iPad)
              không cần cấu hình đường dẫn ổ đĩa, máy chủ sẽ tự động nạp/ghi vào đúng thư mục tương ứng.
            </p>
          </div>

          <div className="p-3 bg-white/80 rounded-2xl border border-blue-100 space-y-1">
            <div className="font-bold text-blue-900 flex items-center gap-1">
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              <span>2. Chống Ghi Đè Dữ Liệu Lẫn Nhau:</span>
            </div>
            <p>
              Khi máy chủ kích hoạt môi trường <b>Test</b>, tất cả thiết bị qua cổng port sẽ tự động hiển thị thanh cảnh báo Test.
              Mọi đơn hàng ảo tạo trên máy con sẽ chỉ lưu vào thư mục Test, <b>100% không ảnh hưởng đến CSDL Chính</b>.
            </p>
          </div>
        </div>
      </div>

      {/* ── MODAL XÁC NHẬN CHUYỂN ĐỔI MÔI TRƯỜNG AN TOÀN ── */}
      {showSwitchModal && (
        <div className="fixed inset-0 z-[10000030] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-zinc-200 text-zinc-900 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  selectedEnvId === 'production'
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-purple-100 text-purple-600'
                }`}
              >
                {selectedEnvId === 'production' ? (
                  <Database className="w-6 h-6" />
                ) : (
                  <FlaskConical className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="font-black text-base text-zinc-900">
                  Kích Hoạt: {selectedEnvId === 'production' ? 'Local SQL Chính' : 'Local SQL Thử Nghiệm'}
                </h3>
                <p className="text-xs text-zinc-500 font-medium">
                  Hệ thống sẽ bảo vệ dữ liệu hiện tại vào két an toàn trước khi chuyển đổi
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-bold text-zinc-700">Chọn cách nạp dữ liệu cho môi trường mới:</p>
              
              <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 cursor-pointer transition">
                <input
                  type="radio"
                  name="switchAction"
                  checked={switchAction === 'load_vault'}
                  onChange={() => setSwitchAction('load_vault')}
                  className="mt-0.5 text-amber-600"
                />
                <div>
                  <div className="font-bold text-zinc-900">Nạp dữ liệu đã lưu của môi trường này (Khuyến nghị)</div>
                  <div className="text-[11px] text-zinc-500">
                    Khôi phục lại phiên làm việc trước đó của môi trường này từ két an toàn Vault.
                  </div>
                </div>
              </label>

              {selectedEnvId === 'testing' && (
                <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 cursor-pointer transition">
                  <input
                    type="radio"
                    name="switchAction"
                    checked={switchAction === 'clone_from_current'}
                    onChange={() => setSwitchAction('clone_from_current')}
                    className="mt-0.5 text-amber-600"
                  />
                  <div>
                    <div className="font-bold text-zinc-900">Sao chép dữ liệu từ Chính sang Test ngay</div>
                    <div className="text-[11px] text-zinc-500">
                      Copy toàn bộ thực đơn, công thức và kho hiện tại để có đồ test ngay lập tức.
                    </div>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 cursor-pointer transition">
                <input
                  type="radio"
                  name="switchAction"
                  checked={switchAction === 'clean_slate'}
                  onChange={() => setSwitchAction('clean_slate')}
                  className="mt-0.5 text-amber-600"
                />
                <div>
                  <div className="font-bold text-zinc-900">Môi trường trắng tinh (Clean Slate)</div>
                  <div className="text-[11px] text-zinc-500">
                    Bắt đầu với dữ liệu trắng, thích hợp để thử nghiệm cài đặt từ đầu.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmSwitch}
                className={`flex-1 py-2.5 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  selectedEnvId === 'production'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Xác Nhận Chuyển Đổi</span>
              </button>
              <button
                type="button"
                onClick={() => setShowSwitchModal(false)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 hover:bg-zinc-100 text-zinc-700 font-bold text-xs transition cursor-pointer"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
