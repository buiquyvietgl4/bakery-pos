// src/components/admin/BackupRestoreModal.tsx

import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, HardDrive, Download, Upload, RefreshCw, CheckCircle2, 
  AlertTriangle, X, Folder, Clock, ShieldCheck, FileText, Image as ImageIcon,
  Check, ArrowRight, Layers, HelpCircle, AlertCircle, Trash2
} from 'lucide-react';
import { 
  BakeryBackupData, 
  AutoBackupConfig, 
  ReconciliationReport, 
  MergeMode, 
  EntityType 
} from '@/lib/types/backup';
import { 
  getAutoBackupConfig, 
  saveAutoBackupConfig, 
  selectBackupDirectory, 
  gatherFullBakeryData, 
  saveBackupToFile, 
  isFileSystemAccessSupported,
  checkDirectoryPermission,
  requestDirectoryPermission,
  cleanOldBackupsNow
} from '@/lib/utils/backupManager';
import { 
  reconcileBackupWithCurrentState, 
  executePushToSQL 
} from '@/lib/utils/backupReconciler';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore'>('backup');

  // ── STATE TAB 1: SAO LƯU ──
  const [config, setConfig] = useState<AutoBackupConfig>(getAutoBackupConfig());
  const [isSavingBackup, setIsSavingBackup] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const [backupErrorMsg, setBackupErrorMsg] = useState<string | null>(null);
  const [folderSelecting, setFolderSelecting] = useState(false);
  const [isCleaningOldFiles, setIsCleaningOldFiles] = useState(false);

  const handleCleanOldBackups = async () => {
    setIsCleaningOldFiles(true);
    setBackupSuccessMsg(null);
    setBackupErrorMsg(null);
    try {
      const res = await cleanOldBackupsNow();
      if (res.success) {
        setBackupSuccessMsg(res.message);
        updatePermStatus();
        setTimeout(() => setBackupSuccessMsg(null), 6000);
      } else {
        setBackupErrorMsg(res.message);
      }
    } catch (e: any) {
      setBackupErrorMsg(e.message || 'Lỗi khi dọn dẹp thư mục');
    } finally {
      setIsCleaningOldFiles(false);
    }
  };
  const [isApiSupported, setIsApiSupported] = useState(false);
  const [permStatus, setPermStatus] = useState<'granted' | 'prompt' | 'denied' | 'no_handle' | 'unsupported'>('no_handle');

  const updatePermStatus = async () => {
    const p = await checkDirectoryPermission();
    setPermStatus(p);
  };

  // ── STATE TAB 2: KHÔI PHỤC & ĐẨY SQL ──
  const [selectedBackupData, setSelectedBackupData] = useState<BakeryBackupData | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconciliationReport, setReconciliationReport] = useState<ReconciliationReport | null>(null);
  const [activeEntityFilter, setActiveEntityFilter] = useState<EntityType | 'all'>('all');
  const [mergeMode, setMergeMode] = useState<MergeMode>('smart_merge');

  // Push to SQL state
  const [isPushingToSQL, setIsPushingToSQL] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ percent: number; msg: string }>({ percent: 0, msg: '' });
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsApiSupported(isFileSystemAccessSupported());
      setConfig(getAutoBackupConfig());
      updatePermStatus();
    }
  }, [isOpen]);

  const handleRequestPermission = async () => {
    try {
      const ok = await requestDirectoryPermission();
      if (ok) {
        setPermStatus('granted');
        setConfig(getAutoBackupConfig());
        setBackupSuccessMsg(`Đã cấp quyền ghi thành công! Bản sao lưu mới nhất đã được lưu vào thư mục "${config.folderName}".`);
        setTimeout(() => setBackupSuccessMsg(null), 6000);
      } else {
        setBackupErrorMsg('Trình duyệt chưa cấp quyền ghi vào thư mục.');
      }
    } catch (err: any) {
      setBackupErrorMsg(err.message || 'Lỗi cấp quyền');
    }
  };

  if (!isOpen) return null;

  // ── HÀNH ĐỘNG CHỌN THƯ MỤC ──
  const handleChooseFolder = async () => {
    setFolderSelecting(true);
    setBackupErrorMsg(null);
    try {
      const res = await selectBackupDirectory();
      if (res.success && res.folderName) {
        setConfig(getAutoBackupConfig());
        setPermStatus('granted');
        setBackupSuccessMsg(`Đã kết nối thư mục "${res.folderName}" và tự động tạo bản sao lưu đầu tiên vào thư mục thành công!`);
        setTimeout(() => setBackupSuccessMsg(null), 6000);
      } else if (res.error && res.error !== 'Đã hủy chọn thư mục') {
        setBackupErrorMsg(res.error);
      }
    } finally {
      setFolderSelecting(false);
    }
  };

  // ── HÀNH ĐỘNG BẬT/TẮT CẤU HÌNH AUTO BACKUP ──
  const handleToggleAutoBackup = (enabled: boolean) => {
    const updated = saveAutoBackupConfig({ enabled });
    setConfig(updated);
  };

  const handleChangeInterval = (minutes: number) => {
    const updated = saveAutoBackupConfig({ intervalMinutes: minutes });
    setConfig(updated);
  };

  // ── HÀNH ĐỘNG THỰC HIỆN SAO LƯU NGAY ──
  const handleManualBackupNow = async (forceDownload = false) => {
    setIsSavingBackup(true);
    setBackupSuccessMsg(null);
    setBackupErrorMsg(null);
    try {
      const fullData = await gatherFullBakeryData();
      const res = await saveBackupToFile(fullData, forceDownload, true);
      if (res.success) {
        const sizeKb = Math.round(res.sizeBytes / 1024);
        const methodText = res.method === 'directory' 
          ? `thư mục máy tính "${config.folderName}"` 
          : res.method === 'download'
          ? 'thư mục Tải về (Downloads)'
          : 'bộ nhớ IndexedDB trình duyệt';
        updatePermStatus();
        setBackupSuccessMsg(`Sao lưu thành công! Đã lưu file ${res.filename} (${sizeKb} KB, ${fullData.metadata.totalProducts} bánh, ${fullData.metadata.totalOrders} đơn, ${fullData.metadata.totalImages} ảnh) vào ${methodText}.`);
        setConfig(getAutoBackupConfig());
      } else {
        setBackupErrorMsg(res.error || 'Không thể tạo bản sao lưu');
      }
    } catch (err: any) {
      setBackupErrorMsg(err.message || 'Lỗi khi sao lưu dữ liệu');
    } finally {
      setIsSavingBackup(false);
    }
  };

  // ── HÀNH ĐỘNG ĐỌC FILE BACKUP TẢI LÊN ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setIsParsingFile(true);
    setReconciliationReport(null);
    setPushResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.schemaVersion || !json.products || !json.orders) {
          alert('Tệp sao lưu không hợp lệ hoặc sai định dạng Bakery ERP!');
          setIsParsingFile(false);
          return;
        }

        setSelectedBackupData(json as BakeryBackupData);
        // Tự động kích hoạt đối soát ngay sau khi đọc file
        setIsReconciling(true);
        const report = await reconcileBackupWithCurrentState(json);
        setReconciliationReport(report);
      } catch (err: any) {
        alert('Lỗi đọc tệp sao lưu: ' + (err.message || 'File JSON bị lỗi'));
      } finally {
        setIsParsingFile(false);
        setIsReconciling(false);
      }
    };
    reader.readAsText(file);
  };

  // ── HÀNH ĐỘNG ĐẨY LÊN CSDL SQL ──
  const handleConfirmPushToSQL = async () => {
    if (!selectedBackupData || !reconciliationReport) return;

    const confirmMsg = mergeMode === 'full_overwrite'
      ? 'CẢNH BÁO: Chế độ "Khôi phục toàn bộ" sẽ ghi đè toàn bộ dữ liệu hiện tại bằng dữ liệu từ tệp sao lưu. Bạn có chắc chắn muốn tiếp tục?'
      : 'Hệ thống sẽ đối soát thông minh và đẩy dữ liệu chính xác lên CSDL Cloud SQL. Tiếp tục thực hiện?';

    if (!window.confirm(confirmMsg)) return;

    setIsPushingToSQL(true);
    setPushResult(null);

    try {
      const res = await executePushToSQL(
        selectedBackupData,
        reconciliationReport,
        mergeMode,
        (percent, msg) => {
          setPushProgress({ percent, msg });
        }
      );
      setPushResult(res);
    } catch (err: any) {
      setPushResult({
        success: false,
        message: err.message || 'Lỗi khi đẩy dữ liệu lên SQL',
      });
    } finally {
      setIsPushingToSQL(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden border border-amber-100">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-amber-100 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md">
              <Database className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Trung Tâm Sao Lưu & Phục Hồi SQL</h2>
              <p className="text-xs text-amber-100">Bảo vệ 100% dữ liệu tiệm bánh, hình ảnh & đối soát thông minh tránh trùng lặp</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex border-b border-gray-200 bg-amber-50/50 px-6 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 rounded-t-xl px-5 py-2.5 text-sm font-semibold transition-all ${
              activeTab === 'backup'
                ? 'bg-white text-amber-700 shadow-sm border-t-2 border-amber-600'
                : 'text-gray-600 hover:text-amber-800 hover:bg-amber-100/50'
            }`}
          >
            <HardDrive className="h-4 w-4" />
            1. Tự Động Sao Lưu (Auto Backup)
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`flex items-center gap-2 rounded-t-xl px-5 py-2.5 text-sm font-semibold transition-all ${
              activeTab === 'restore'
                ? 'bg-white text-amber-700 shadow-sm border-t-2 border-amber-600'
                : 'text-gray-600 hover:text-amber-800 hover:bg-amber-100/50'
            }`}
          >
            <Upload className="h-4 w-4" />
            2. Khôi Phục & Đẩy Lên SQL
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ════════ TAB 1: SAO LƯU DỮ LIỆU ════════ */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              {/* THÔNG BÁO THÀNH CÔNG / LỖI */}
              {backupSuccessMsg && (
                <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 border border-emerald-200 text-emerald-900 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <p>{backupSuccessMsg}</p>
                </div>
              )}
              {backupErrorMsg && (
                <div className="flex items-start gap-3 rounded-xl bg-rose-50 p-4 border border-rose-200 text-rose-900 text-sm">
                  <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                  <p>{backupErrorMsg}</p>
                </div>
              )}

              {/* CARD CẤU HÌNH AUTO BACKUP */}
              <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-amber-50/40 via-white to-orange-50/30 p-5 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      Chế Độ Tự Động Kiểm Tra & Sao Lưu Định Kỳ
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Hệ thống tự động phát hiện khi có đơn hàng mới, cập nhật kho hoặc sản phẩm để tạo bản sao lưu an toàn.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={config.enabled}
                      onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                    <span className="ml-2.5 text-sm font-semibold text-gray-700">
                      {config.enabled ? 'Đang BẬT' : 'Đã TẮT'}
                    </span>
                  </label>
                </div>

                {/* THƯ MỤC LƯU TRỮ */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      <Folder className="h-4 w-4 text-amber-600" />
                      Vị trí thư mục lưu trữ trên máy tính:
                    </span>
                    {isApiSupported ? (
                      permStatus === 'granted' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                          <Check className="h-3.5 w-3.5" /> Đã kết nối & Tự động ghi vào ổ cứng
                        </span>
                      ) : permStatus === 'prompt' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300 animate-pulse">
                          <AlertCircle className="h-3.5 w-3.5" /> Cần cấp lại quyền truy cập
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                          <Check className="h-3 w-3" /> Hỗ trợ ghi trực tiếp vào ổ cứng (Chrome/Edge)
                        </span>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                        Chế độ tải về file tự động
                      </span>
                    )}
                  </div>

                  {permStatus === 'prompt' && (
                    <div className="p-3 bg-amber-100/90 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-amber-950 font-bold">
                        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>Trình duyệt yêu cầu xác nhận lại quyền ghi vào thư mục máy tính.</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRequestPermission}
                        className="px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white font-black rounded-xl shrink-0 cursor-pointer shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck className="w-4 h-4" /> Bấm Để Cấp Quyền & Lưu Ngay
                      </button>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex-1 w-full flex items-center gap-3 bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 shadow-inner">
                      <HardDrive className="h-4 w-4 text-gray-500 shrink-0" />
                      <span className="truncate">{config.folderName}</span>
                    </div>
                    {isApiSupported && (
                      <button
                        onClick={handleChooseFolder}
                        disabled={folderSelecting}
                        className="w-full sm:w-auto px-4 py-2.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-colors border border-amber-300 shrink-0"
                      >
                        <Folder className="h-4 w-4 text-amber-700" />
                        {folderSelecting ? 'Đang mở hộp thoại...' : 'Chọn thư mục lưu...'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    💡 Bạn có thể chọn bất kỳ thư mục nào trên ổ đĩa máy tính (ví dụ: <code className="bg-gray-100 px-1 py-0.5 rounded text-amber-900 font-mono">D:\SaoLuu_TiemBanh</code> hoặc thư mục Google Drive/Dropbox trên PC).
                  </p>

                  {/* CƠ CHẾ TIẾT KIỆM BỘ NHỚ: CHỈ GIỮ 1 BẢN MỚI NHẤT & NÚT DỌN DẸP */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-bold text-emerald-950">Cơ chế lưu trữ: </span>
                        <span>Tự động dọn dẹp file cũ, luôn chỉ giữ duy nhất <strong>1 tệp data đầy đủ gần nhất</strong> (<code className="font-mono text-emerald-800 bg-white px-1 py-0.5 rounded border border-emerald-200">latest_backup.bakery.json</code>) để tránh bị nở dung lượng ổ cứng.</span>
                      </div>
                    </div>
                    {isApiSupported && (
                      <button
                        type="button"
                        onClick={handleCleanOldBackups}
                        disabled={isCleaningOldFiles}
                        className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg border border-emerald-300 shadow-sm shrink-0 flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-60 cursor-pointer"
                        title="Xóa tất cả các file sao lưu cũ tích tụ trước đó trong thư mục"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-emerald-700" />
                        {isCleaningOldFiles ? 'Đang dọn dẹp...' : 'Dọn dẹp file cũ ngay'}
                      </button>
                    )}
                  </div>
                </div>

                {/* CHU KỲ SAO LƯU */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Chu kỳ kiểm tra dữ liệu mới:
                  </div>
                  <select
                    value={config.intervalMinutes}
                    onChange={(e) => handleChangeInterval(Number(e.target.value))}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm focus:border-amber-500 focus:outline-none"
                  >
                    <option value={5}>Mỗi 5 phút (Rất nhanh)</option>
                    <option value={15}>Mỗi 15 phút (Khuyên dùng)</option>
                    <option value={30}>Mỗi 30 phút</option>
                    <option value={60}>Mỗi 1 giờ</option>
                    <option value={360}>Mỗi 6 giờ</option>
                    <option value={1440}>Mỗi ngày 1 lần</option>
                  </select>
                </div>
              </div>

              {/* TÙY CHỌN SAO LƯU THỦ CÔNG NGAY */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                    <Download className="h-4 w-4 text-amber-700" />
                    Sao Lưu Tức Thì & Đóng Gói Toàn Diện
                  </h4>
                  {config.lastBackupAt && (
                    <span className="text-xs text-amber-800">
                      Lần sao lưu gần nhất: {new Date(config.lastBackupAt).toLocaleString('vi-VN')}
                    </span>
                  )}
                </div>

                <p className="text-xs text-amber-900/80 leading-relaxed">
                  Bản sao lưu sẽ đóng gói <strong>100% dữ liệu tiệm bánh</strong>: Danh mục sản phẩm, Công thức định mức BOM, Tồn kho nguyên vật liệu, Lịch sử hao hụt & chỉnh sửa số lượng bánh, Toàn bộ đơn hàng & đơn đặt trước, Sổ thu chi, Cài đặt máy in và <strong>toàn bộ hình ảnh bánh/ảnh mẫu/mã QR</strong> dưới dạng độc lập.
                </p>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => handleManualBackupNow(false)}
                    disabled={isSavingBackup}
                    className="flex-1 sm:flex-none px-5 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                  >
                    {isSavingBackup ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Đang đóng gói và sao lưu...
                      </>
                    ) : (
                      <>
                        <HardDrive className="h-4 w-4" />
                        Sao Lưu Ngay (Vào thư mục đã chọn)
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleManualBackupNow(true)}
                    disabled={isSavingBackup}
                    className="px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold border border-gray-300 shadow-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Download className="h-4 w-4 text-gray-500" />
                    Tải Về File (.bakery.json)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════ TAB 2: PHỤC HỒI & ĐẨY LÊN SQL ════════ */}
          {activeTab === 'restore' && (
            <div className="space-y-6">
              
              {/* BƯỚC 1: CHỌN FILE SAO LƯU */}
              <div className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/30 p-6 text-center hover:bg-amber-50/60 transition-colors">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 mb-3">
                  <Upload className="h-7 w-7" />
                </div>
                <h3 className="text-base font-bold text-gray-900">
                  {selectedFileName ? `Tệp đã nạp: ${selectedFileName}` : 'Chọn hoặc Kéo Thả Tệp Sao Lưu (.bakery.json)'}
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Hệ thống sẽ tự động quét, phân tích và thực hiện <strong>đối soát thông minh</strong> để phân biệt cái nào đã có, cái nào mới, và cái nào trùng lặp.
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isParsingFile || isReconciling}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 transition-all"
                  >
                    <Folder className="h-4 w-4" />
                    {selectedFileName ? 'Chọn tệp sao lưu khác...' : 'Duyệt tìm tệp trên máy tính'}
                  </button>
                </div>
              </div>

              {/* TRẠNG THÁI QUÉT VÀ ĐỐI SOÁT */}
              {isReconciling && (
                <div className="flex items-center justify-center gap-3 p-8 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-semibold">
                  <RefreshCw className="h-5 w-5 animate-spin text-amber-600" />
                  Đang tiến hành đối soát thông minh với cơ sở dữ liệu Cloud SQL...
                </div>
              )}

              {/* BẢNG KẾT QUẢ ĐỐI SOÁT THÔNG MINH */}
              {reconciliationReport && selectedBackupData && (
                <div className="space-y-5 animate-fade-in">
                  
                  {/* BẢNG TỔNG QUAN ĐỐI SOÁT */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tổng bản ghi trong file</div>
                      <div className="text-2xl font-black text-gray-900 mt-1">
                        {reconciliationReport.summary.totalBackupItems}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">Bao gồm {selectedBackupData.metadata.totalImages} ảnh</div>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                      <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                        Mới (Chưa có trong SQL)
                      </div>
                      <div className="text-2xl font-black text-emerald-700 mt-1">
                        {reconciliationReport.summary.newItemsCount}
                      </div>
                      <div className="text-[11px] text-emerald-600 mt-0.5">Sẽ được bổ sung vào CSDL</div>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
                      <div className="text-xs font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500"></span>
                        Có cập nhật / khác biệt
                      </div>
                      <div className="text-2xl font-black text-amber-700 mt-1">
                        {reconciliationReport.summary.updatedItemsCount}
                      </div>
                      <div className="text-[11px] text-amber-600 mt-0.5">Có thay đổi trạng thái/giá</div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                        Trùng khớp 100%
                      </div>
                      <div className="text-2xl font-black text-slate-700 mt-1">
                        {reconciliationReport.summary.identicalItemsCount}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Tự động giữ nguyên tránh trùng lặp</div>
                    </div>
                  </div>

                  {/* BỘ LỌC CHI TIẾT THEO BẢNG */}
                  <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
                    <span className="text-xs font-bold text-gray-500 uppercase mr-1">Xem theo loại:</span>
                    <button
                      onClick={() => setActiveEntityFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        activeEntityFilter === 'all'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Tất cả ({reconciliationReport.summary.totalBackupItems})
                    </button>
                    {(['orders', 'products', 'ingredients', 'recipes', 'stock_adjustments', 'images'] as EntityType[]).map((type) => {
                      const entityData = reconciliationReport.byEntity[type];
                      if (!entityData || entityData.total === 0) return null;
                      const labels: Record<string, string> = {
                        orders: 'Đơn hàng',
                        products: 'Sản phẩm',
                        ingredients: 'Kho & Vật tư',
                        recipes: 'Công thức BOM',
                        stock_adjustments: 'Lịch sử kho',
                        images: 'Hình ảnh',
                      };
                      return (
                        <button
                          key={type}
                          onClick={() => setActiveEntityFilter(type)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            activeEntityFilter === type
                              ? 'bg-amber-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <span>{labels[type] || type}</span>
                          <span className="rounded-full bg-black/10 px-1.5 py-0.2 text-[10px]">
                            {entityData.total}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* DANH SÁCH CHI TIẾT CÁC BẢN GHI ĐỐI SOÁT */}
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100 bg-white">
                    {(() => {
                      const itemsToShow = activeEntityFilter === 'all'
                        ? Object.values(reconciliationReport.byEntity).flatMap((e) => e.items)
                        : reconciliationReport.byEntity[activeEntityFilter]?.items || [];

                      if (itemsToShow.length === 0) {
                        return (
                          <div className="p-6 text-center text-sm text-gray-400">
                            Không có bản ghi nào trong mục này.
                          </div>
                        );
                      }

                      return itemsToShow.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-xs">
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              item.status === 'new'
                                ? 'bg-emerald-100 text-emerald-800'
                                : item.status === 'updated'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {item.status === 'new' ? 'MỚI' : item.status === 'updated' ? 'CẬP NHẬT' : 'TRÙNG'}
                            </span>
                            <div>
                              <div className="font-semibold text-gray-900">{item.displayName}</div>
                              {item.details && (
                                <div className="text-gray-500 text-[11px] mt-0.5">{item.details}</div>
                              )}
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-400 capitalize">{item.entityType}</span>
                        </div>
                      ));
                    })()}
                  </div>

                  {/* CHỌN CHẾ ĐỘ GỘP DỮ LIỆU (MERGE MODE) */}
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                    <span className="text-xs font-bold text-gray-800 uppercase flex items-center gap-2">
                      <Layers className="h-4 w-4 text-amber-700" />
                      Lựa chọn chế độ hợp nhất dữ liệu vào SQL:
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                        mergeMode === 'smart_merge'
                          ? 'border-amber-600 bg-white shadow-md ring-1 ring-amber-600'
                          : 'border-gray-200 bg-white/70 hover:bg-white'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-amber-900">Gộp Thông Minh (Smart Merge)</span>
                          <input
                            type="radio"
                            name="mergeMode"
                            value="smart_merge"
                            checked={mergeMode === 'smart_merge'}
                            onChange={() => setMergeMode('smart_merge')}
                            className="text-amber-600 focus:ring-amber-500"
                          />
                        </div>
                        <span className="text-[11px] text-gray-500 mt-1">
                          Thêm mới cái chưa có, cập nhật cái có thay đổi, bỏ qua cái trùng lặp 100%. (Khuyên dùng)
                        </span>
                      </label>

                      <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                        mergeMode === 'append_only'
                          ? 'border-amber-600 bg-white shadow-md ring-1 ring-amber-600'
                          : 'border-gray-200 bg-white/70 hover:bg-white'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-900">Chỉ Thêm Mới (Append Only)</span>
                          <input
                            type="radio"
                            name="mergeMode"
                            value="append_only"
                            checked={mergeMode === 'append_only'}
                            onChange={() => setMergeMode('append_only')}
                            className="text-amber-600 focus:ring-amber-500"
                          />
                        </div>
                        <span className="text-[11px] text-gray-500 mt-1">
                          Chỉ bổ sung các đơn hàng và sản phẩm mới chưa từng có, tuyệt đối không chỉnh sửa dữ liệu cũ.
                        </span>
                      </label>

                      <label className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                        mergeMode === 'full_overwrite'
                          ? 'border-rose-600 bg-white shadow-md ring-1 ring-rose-600'
                          : 'border-gray-200 bg-white/70 hover:bg-white'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-900">Khôi Phục Toàn Bộ (Full Overwrite)</span>
                          <input
                            type="radio"
                            name="mergeMode"
                            value="full_overwrite"
                            checked={mergeMode === 'full_overwrite'}
                            onChange={() => setMergeMode('full_overwrite')}
                            className="text-rose-600 focus:ring-rose-500"
                          />
                        </div>
                        <span className="text-[11px] text-gray-500 mt-1">
                          Ghi đè và tái thiết lập toàn bộ cơ sở dữ liệu (Dành cho trường hợp mất SQL hoặc đổi máy).
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* TIẾN TRÌNH ĐẨY SQL NẾU ĐANG CHẠY */}
                  {isPushingToSQL && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
                          {pushProgress.msg || 'Đang thực thi đẩy dữ liệu...'}
                        </span>
                        <span>{pushProgress.percent}%</span>
                      </div>
                      <div className="w-full bg-amber-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-amber-600 to-orange-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${pushProgress.percent}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {/* KẾT QUẢ ĐẨY DỮ LIỆU SQL */}
                  {pushResult && (
                    <div className={`p-4 rounded-xl border text-sm flex items-start gap-3 ${
                      pushResult.success 
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}>
                      {pushResult.success ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-bold">{pushResult.message}</div>
                        {pushResult.details && (
                          <div className="text-xs mt-1.5 opacity-90">
                            • Sản phẩm: {pushResult.details.productsPushed} | Đơn hàng: {pushResult.details.ordersPushed} | Nguyên liệu: {pushResult.details.ingredientsPushed} | Hình ảnh: {pushResult.details.imagesUploaded} | Lịch sử kho: {pushResult.details.stockLogsPushed}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* NÚT THỰC THI ĐẨY LÊN SQL */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      onClick={handleConfirmPushToSQL}
                      disabled={isPushingToSQL}
                      className="px-6 py-3 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-xl flex items-center gap-2 transition-all disabled:opacity-60"
                    >
                      {isPushingToSQL ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Đang Đẩy Dữ Liệu Lên SQL...
                        </>
                      ) : (
                        <>
                          <Database className="h-4 w-4" />
                          Xác Nhận Đẩy Dữ Liệu Lên CSDL SQL
                        </>
                      )}
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3.5 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Bakery Backup Engine v2.0 • Tích hợp Supabase Storage & IndexedDB
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-gray-100 text-gray-700 rounded-lg font-medium border border-gray-300 transition-colors"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
