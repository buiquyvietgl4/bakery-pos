// src/components/admin/BackupRestoreModal.tsx

import React, { useState, useEffect, useRef } from 'react';
import { 
  Database, HardDrive, Download, Upload, RefreshCw, CheckCircle2, 
  AlertTriangle, X, Folder, Clock, ShieldCheck, FileText, Image as ImageIcon,
  Check, ArrowRight, Layers, HelpCircle, AlertCircle, Trash2, RotateCcw, Shield, Cloud
} from 'lucide-react';
import { 
  BakeryBackupData, 
  AutoBackupConfig, 
  ReconciliationReport, 
  MergeMode, 
  EntityType,
  TempBackupItem
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
  cleanOldBackupsNow,
  normalizeBackupData,
  clearStoredDirectoryHandle
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

  // Custom folder path input
  const [customPathInput, setCustomPathInput] = useState<string>('');
  const [showCustomPathForm, setShowCustomPathForm] = useState(false);
  const [isSavingCustomPath, setIsSavingCustomPath] = useState(false);

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
  const [isDragging, setIsDragging] = useState(false);

  // Push to SQL state
  const [isPushingToSQL, setIsPushingToSQL] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ percent: number; msg: string }>({ percent: 0, msg: '' });
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tùy chọn các phần dữ liệu khôi phục (Selective Restore Entities)
  const [selectedEntities, setSelectedEntities] = useState<Record<string, boolean>>({
    orders: true,
    products: true,
    ingredients: true,
    recipes: true,
    stock_adjustments: true,
    spoilage_logs: true,
    expenses: true,
    images: true,
  });
  const [isSavingCloudBackup, setIsSavingCloudBackup] = useState(false);

  // ── SERVER DISK BACKUP STATE ──
  const [serverBackupInfo, setServerBackupInfo] = useState<{
    exists: boolean;
    folderPath?: string;
    folderName?: string;
    filename?: string;
    mtime?: string | null;
    sizeBytes?: number;
    metadata?: {
      totalProducts: number;
      totalOrders: number;
      totalImages: number;
      createdAt?: string;
    } | null;
    latestPreResetBackup?: {
      filename: string;
      folderPath: string;
      mtime: string;
      sizeBytes: number;
      metadata?: {
        totalProducts: number;
        totalOrders: number;
        totalImages: number;
        createdAt?: string;
      } | null;
    } | null;
    temp7DayBackups?: TempBackupItem[];
  } | null>(null);

  const fetchServerBackupInfo = async () => {
    try {
      const res = await fetch('/api/local-sql?check_backup=true');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setServerBackupInfo(json);
        }
      }
    } catch {}
  };

  const handleDownloadBackupFile = (filename: string, cloudKey?: string, storagePath?: string) => {
    const link = document.createElement('a');
    let param = `file=${encodeURIComponent(filename)}`;
    if (storagePath) {
      param = `storage_path=${encodeURIComponent(storagePath)}`;
    } else if (cloudKey) {
      param = `cloud_key=${encodeURIComponent(cloudKey)}`;
    }
    link.href = `/api/local-sql?download_file=true&${param}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      setIsApiSupported(isFileSystemAccessSupported());
      setConfig(getAutoBackupConfig());
      updatePermStatus();
      fetchServerBackupInfo();

      const handleBackupSaved = () => {
        setConfig(getAutoBackupConfig());
        fetchServerBackupInfo();
        updatePermStatus();
      };
      const handleConfigUpdated = () => {
        setConfig(getAutoBackupConfig());
      };

      window.addEventListener('bakery_backup_saved', handleBackupSaved);
      window.addEventListener('bakery_backup_config_updated', handleConfigUpdated);

      return () => {
        window.removeEventListener('bakery_backup_saved', handleBackupSaved);
        window.removeEventListener('bakery_backup_config_updated', handleConfigUpdated);
      };
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
        const updated = getAutoBackupConfig();
        setConfig(updated);
        setPermStatus('granted');
        fetchServerBackupInfo();
        setBackupSuccessMsg(`Đã kết nối thư mục máy tính "${res.folderName}" và tự động tạo bản sao lưu đầu tiên thành công!`);
        setTimeout(() => setBackupSuccessMsg(null), 6000);
      } else if (res.error && res.error !== 'Đã hủy chọn thư mục') {
        setBackupErrorMsg(res.error);
      }
    } finally {
      setFolderSelecting(false);
    }
  };

  const handleResetDefaultFolder = async () => {
    await clearStoredDirectoryHandle();
    const updated = saveAutoBackupConfig({
      folderName: 'SQL backup/auto backup',
      folderPath: undefined,
    });
    setConfig(updated);
    setCustomPathInput('');
    setShowCustomPathForm(false);
    updatePermStatus();
    fetchServerBackupInfo();
    setBackupSuccessMsg('Đã đặt lại vị trí lưu trữ về thư mục mặc định: SQL backup/auto backup');
    setTimeout(() => setBackupSuccessMsg(null), 5000);
  };

  const handleSaveCustomPath = async () => {
    if (!customPathInput.trim()) return;
    setIsSavingCustomPath(true);
    setBackupErrorMsg(null);
    try {
      const trimmed = customPathInput.trim();
      const folderName = trimmed.split(/[/\\\\]/).filter(Boolean).pop() || trimmed;
      const updated = saveAutoBackupConfig({
        folderPath: trimmed,
        folderName,
      });
      setConfig(updated);
      setShowCustomPathForm(false);
      // Thực hiện sao lưu ngay một bản vào thư mục vừa nhập
      const fullData = await gatherFullBakeryData();
      const res = await saveBackupToFile(fullData, false, false);
      if (res.success) {
        fetchServerBackupInfo();
        setBackupSuccessMsg(`Đã kết nối và lưu bản sao lưu mới nhất vào thư mục: "${trimmed}"`);
        setTimeout(() => setBackupSuccessMsg(null), 6000);
      }
    } catch (e: any) {
      setBackupErrorMsg(e.message || 'Lỗi lưu đường dẫn');
    } finally {
      setIsSavingCustomPath(false);
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
          : res.method === 'server_disk'
          ? `thư mục ổ cứng máy tính "${res.folderPath || 'SQL backup/auto backup'}"`
          : res.method === 'download'
          ? 'thư mục Tải về (Downloads)'
          : 'bộ nhớ IndexedDB trình duyệt';
        updatePermStatus();
        fetchServerBackupInfo();
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

  // ── HÀNH ĐỘNG SAO LƯU TRỰC TIẾP LÊN CLOUD STORAGE 1 GB (LƯU TRỮ 7 NGÀY) ──
  const handleSaveCloud7DayBackupNow = async () => {
    setIsSavingCloudBackup(true);
    setBackupSuccessMsg(null);
    setBackupErrorMsg(null);
    try {
      const fullData = await gatherFullBakeryData();
      const { saveTemporary7DayBackup } = await import('@/lib/utils/backupManager');
      const res = await saveTemporary7DayBackup(fullData);
      if (res.success) {
        await fetchServerBackupInfo();
        setBackupSuccessMsg(`Đã tạo bản sao lưu an toàn lên Kho Lưu Trữ Đám Mây 1 GB (Lưu trữ 7 ngày): "${res.filename}" (${fullData.metadata.totalProducts} bánh, ${fullData.metadata.totalOrders} đơn).`);
        setTimeout(() => setBackupSuccessMsg(null), 7000);
      } else {
        setBackupErrorMsg(res.error || 'Không thể tạo bản sao lưu lên Cloud Storage 1 GB');
      }
    } catch (err: any) {
      setBackupErrorMsg(err.message || 'Lỗi khi sao lưu lên Cloud');
    } finally {
      setIsSavingCloudBackup(false);
    }
  };

  // ── HÀNH ĐỘNG NẠP NHANH FILE SAO LƯU TỪ Ổ CỨNG HOẶC CLOUD SQL / STORAGE 1GB ──
  const handleLoadServerBackup = async (specificFilename?: string, cloudKey?: string, storagePath?: string) => {
    setIsParsingFile(true);
    setReconciliationReport(null);
    setPushResult(null);
    try {
      let url = '/api/local-sql?load_backup=true';
      if (storagePath) {
        url = `/api/local-sql?load_backup=true&storage_path=${encodeURIComponent(storagePath)}`;
      } else if (cloudKey) {
        url = `/api/local-sql?load_backup=true&cloud_key=${encodeURIComponent(cloudKey)}`;
      } else if (specificFilename) {
        url = `/api/local-sql?load_backup=true&file=${encodeURIComponent(specificFilename)}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('Không thể tải file sao lưu từ máy chủ hoặc Cloud Storage.');
      const resJson = await res.json();
      if (!resJson.success || !resJson.data) throw new Error(resJson.error || 'Dữ liệu file sao lưu không hợp lệ');

      setSelectedFileName(resJson.filename || specificFilename || 'latest_backup.bakery.json');
      const json = normalizeBackupData(resJson.data);
      setSelectedBackupData(json);
      setIsReconciling(true);
      const report = await reconcileBackupWithCurrentState(json);
      setReconciliationReport(report);
    } catch (err: any) {
      alert('Lỗi nạp bản sao lưu: ' + (err.message || 'Không thể đọc tệp'));
    } finally {
      setIsParsingFile(false);
      setIsReconciling(false);
    }
  };

  // ── XỬ LÝ ĐỌC FILE SAO LƯU (HỖ TRỢ MỌI PHIÊN BẢN BACKUP, KỂ CẢ TRƯỚC RESET) ──
  const processUploadedFile = (file: File) => {
    setSelectedFileName(file.name);
    setIsParsingFile(true);
    setReconciliationReport(null);
    setPushResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = (event.target?.result as string) || '';
        // Gỡ bỏ ký tự BOM (\uFEFF) nếu có từ Windows / Notepad
        text = text.replace(/^\uFEFF/, '').trim();
        if (!text) {
          throw new Error('Tệp rỗng không có nội dung JSON');
        }

        const rawJson = JSON.parse(text);
        const json = normalizeBackupData(rawJson);
        if (!json || (!Array.isArray(json.products) && !Array.isArray(json.orders))) {
          alert('Tệp sao lưu không hợp lệ hoặc không tìm thấy dữ liệu tiệm bánh trong file!');
          setIsParsingFile(false);
          return;
        }

        setSelectedBackupData(json);
        // Tự động kích hoạt đối soát ngay sau khi đọc file
        setIsReconciling(true);
        const report = await reconcileBackupWithCurrentState(json);
        setReconciliationReport(report);
      } catch (err: any) {
        alert('Lỗi đọc tệp sao lưu: ' + (err.message || 'File JSON bị lỗi định dạng'));
      } finally {
        setIsParsingFile(false);
        setIsReconciling(false);
      }
    };
    reader.onerror = () => {
      alert('Không thể đọc file từ thiết bị của bạn.');
      setIsParsingFile(false);
      setIsReconciling(false);
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = ''; // Cho phép chọn lại cùng 1 file
    if (!file) return;
    processUploadedFile(file);
  };

  // ── HÀNH ĐỘNG ĐẨY LÊN CSDL SQL ──
  const handleConfirmPushToSQL = async () => {
    if (!selectedBackupData || !reconciliationReport) return;

    const hasAnySelected = Object.values(selectedEntities).some(Boolean);
    if (!hasAnySelected) {
      alert('Vui lòng chọn ít nhất 1 phần dữ liệu để khôi phục!');
      return;
    }

    const confirmMsg = mergeMode === 'full_overwrite'
      ? 'CẢNH BÁO: Chế độ "Khôi phục toàn bộ" sẽ ghi đè toàn bộ dữ liệu hiện tại bằng dữ liệu từ tệp sao lưu. Bạn có chắc chắn muốn tiếp tục?'
      : 'Hệ thống sẽ đối soát thông minh và đẩy các phần dữ liệu đã chọn lên CSDL Cloud SQL. Tiếp tục thực hiện?';

    if (!window.confirm(confirmMsg)) return;

    setIsPushingToSQL(true);
    setPushResult(null);

    // Lọc dữ liệu theo các phần người dùng đã tùy chọn tích chọn
    const filteredBackupData: BakeryBackupData = {
      ...selectedBackupData,
      products: selectedEntities.products ? selectedBackupData.products : [],
      orders: selectedEntities.orders ? selectedBackupData.orders : [],
      ingredients: selectedEntities.ingredients ? selectedBackupData.ingredients : [],
      recipes: selectedEntities.recipes ? selectedBackupData.recipes : [],
      stock_adjustments: selectedEntities.stock_adjustments ? selectedBackupData.stock_adjustments : [],
      spoilage_logs: selectedEntities.spoilage_logs ? selectedBackupData.spoilage_logs : [],
      expenses: selectedEntities.expenses ? selectedBackupData.expenses : [],
      cashflow: selectedEntities.expenses ? selectedBackupData.cashflow : [],
      images: selectedEntities.images ? selectedBackupData.images : [],
    };

    try {
      const res = await executePushToSQL(
        filteredBackupData,
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
                    {serverBackupInfo?.exists ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <Check className="h-3.5 w-3.5" /> Đã kết nối ổ cứng máy tính (Tự động ghi ngầm 100%)
                      </span>
                    ) : isApiSupported && permStatus === 'granted' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <Check className="h-3.5 w-3.5" /> Đã kết nối & Tự động ghi vào ổ cứng
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                        <Check className="h-3 w-3" /> Tự động ghi trực tiếp qua Server Local
                      </span>
                    )}
                  </div>

                  {permStatus === 'prompt' && (
                    <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-amber-950 font-medium">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Hệ thống luôn tự động lưu ngầm vào ổ cứng máy tính. Bạn có thể cấp thêm quyền để trình duyệt đồng thời ghi vào thư mục tùy chọn riêng.</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRequestPermission}
                        className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg shrink-0 cursor-pointer shadow-sm transition active:scale-95 flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Cấp Quyền Trình Duyệt
                      </button>
                    </div>
                  )}

                  {/* VỊ TRÍ VÀ TÙY CHỈNH THƯ MỤC */}
                  {(() => {
                    const isCustomFolder = (config.folderName && !config.folderName.includes('SQL backup/auto backup') && !config.folderName.includes('Mặc định')) || !!config.folderPath;
                    const displayFolderName = config.folderPath || (isCustomFolder ? config.folderName : (serverBackupInfo?.folderPath || 'SQL backup/auto backup'));

                    return (
                      <div className="space-y-2.5">
                        <div className="flex flex-col sm:flex-row items-center gap-3">
                          <div className="flex-1 w-full flex items-center justify-between gap-3 bg-gray-50 border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 shadow-inner">
                            <div className="flex items-center gap-2.5 truncate">
                              <HardDrive className="h-4 w-4 text-amber-600 shrink-0" />
                              <span className="truncate font-semibold text-gray-900" title={displayFolderName}>
                                {displayFolderName}
                              </span>
                            </div>
                            {isCustomFolder && (
                              <span className="text-[10px] uppercase font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                                Thư mục tùy chọn
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            {isApiSupported && (
                              <button
                                type="button"
                                onClick={handleChooseFolder}
                                disabled={folderSelecting}
                                className="flex-1 sm:flex-none px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm shrink-0 cursor-pointer"
                                title="Mở hộp thoại Windows để chọn thư mục lưu (D:\, USB, Google Drive...)"
                              >
                                <Folder className="h-4 w-4" />
                                {folderSelecting ? 'Đang mở...' : 'Chọn thư mục khác...'}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setShowCustomPathForm(!showCustomPathForm);
                                if (!customPathInput) setCustomPathInput(config.folderPath || '');
                              }}
                              className="px-3 py-2.5 bg-white hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold border border-gray-300 shadow-sm shrink-0 transition-colors"
                              title="Gõ đường dẫn ổ đĩa tùy chọn (Ví dụ: D:\SaoLuu)"
                            >
                              {showCustomPathForm ? 'Đóng nhập' : 'Nhập đường dẫn'}
                            </button>

                            {isCustomFolder && (
                              <button
                                type="button"
                                onClick={handleResetDefaultFolder}
                                className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold border border-rose-200 shadow-sm shrink-0 transition-colors"
                                title="Quay lại thư mục mặc định: SQL backup/auto backup"
                              >
                                Về mặc định
                              </button>
                            )}
                          </div>
                        </div>

                        {showCustomPathForm && (
                          <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-xl space-y-2 animate-fade-in">
                            <label className="text-xs font-bold text-amber-950 block">
                              Nhập đường dẫn thư mục tuyệt đối trên máy tính của bạn:
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={customPathInput}
                                onChange={(e) => setCustomPathInput(e.target.value)}
                                placeholder="Ví dụ: D:\SaoLuu_TiemBanh hoặc E:\BackupDrive"
                                className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                              />
                              <button
                                type="button"
                                onClick={handleSaveCustomPath}
                                disabled={isSavingCustomPath || !customPathInput.trim()}
                                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold shadow-sm shrink-0 transition active:scale-95 disabled:opacity-50"
                              >
                                {isSavingCustomPath ? 'Đang lưu...' : 'Lưu đường dẫn'}
                              </button>
                            </div>
                            <p className="text-[11px] text-amber-800">
                              💡 Máy chủ sẽ tự động tạo thư mục (nếu chưa có) và ghi dữ liệu sao lưu thẳng vào đây mà không bao giờ bị trình duyệt chặn.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
                  {(config.lastBackupAt || serverBackupInfo?.mtime) && (
                    <span className="text-xs text-amber-800 font-medium">
                      Lần sao lưu gần nhất: {new Date(config.lastBackupAt || serverBackupInfo!.mtime!).toLocaleString('vi-VN')}
                      {serverBackupInfo?.metadata && (
                        <span className="text-emerald-700 font-semibold ml-1.5">
                          ({serverBackupInfo.metadata.totalProducts} bánh, {serverBackupInfo.metadata.totalOrders} đơn hàng)
                        </span>
                      )}
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
                    className="px-4 py-3 bg-white hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-semibold border border-gray-300 shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-gray-500" />
                    Tải Về File (.bakery.json)
                  </button>

                  <button
                    onClick={handleSaveCloud7DayBackupNow}
                    disabled={isSavingBackup || isSavingCloudBackup}
                    className="px-5 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer active:scale-95"
                    title="Lưu độc lập vào Kho Storage 1.000 MB (Lưu trữ an toàn 7 ngày, hoàn toàn không tốn 500MB DB)"
                  >
                    {isSavingCloudBackup ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Đang tải lên Cloud 1 GB...
                      </>
                    ) : (
                      <>
                        <Cloud className="h-4 w-4" />
                        Sao Lưu Lên Cloud 1 GB (Lưu 7 Ngày)
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ════════ TAB 2: PHỤC HỒI & ĐẨY LÊN SQL ════════ */}
          {activeTab === 'restore' && (
            <div className="space-y-6">
              
              {/* PHAO CỨU SINH TỐI HẬU: BẢN SAO LƯU TRƯỚC KHI RESET */}
              {serverBackupInfo?.latestPreResetBackup && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-300 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shrink-0 shadow-md">
                      <Shield className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900 bg-emerald-200/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                          🛡️ Bản Sao Lưu Tối Hậu Trước Khi Reset
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          {new Date(serverBackupInfo.latestPreResetBackup.mtime).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-gray-900 mt-1">
                        Hệ thống đã tự động chụp lại dữ liệu tiệm bánh ngay trước lệnh Reset gần nhất
                      </h4>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Tệp: <code className="font-mono font-semibold text-emerald-900 bg-white px-1 py-0.5 rounded border border-emerald-200">{serverBackupInfo.latestPreResetBackup.filename}</code>
                        {serverBackupInfo.latestPreResetBackup.metadata && (
                          <span className="text-emerald-700 font-bold ml-1.5">
                            ({serverBackupInfo.latestPreResetBackup.metadata.totalProducts} bánh, {serverBackupInfo.latestPreResetBackup.metadata.totalOrders} đơn hàng)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleDownloadBackupFile(serverBackupInfo.latestPreResetBackup?.filename!)}
                      className="px-3.5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 rounded-xl text-xs sm:text-sm font-bold border border-emerald-300 shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                      title="Tải tệp sao lưu tối hậu này về máy tính"
                    >
                      <Download className="h-4 w-4 text-emerald-600" />
                      Tải Về Máy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadServerBackup(serverBackupInfo.latestPreResetBackup?.filename)}
                      disabled={isParsingFile || isReconciling}
                      className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Khôi Phục Bản Này Ngay
                    </button>
                  </div>
                </div>
              )}

              {/* ════════ KHU VỰC BẢN SAO LƯU ĐÁM MÂY 7 NGÀY (SUPABASE STORAGE 1 GB) ════════ */}
              <div className="rounded-2xl border-2 border-emerald-300 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-sky-50/60 p-4 sm:p-5 shadow-sm space-y-4 animate-fade-in">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-sm shrink-0">
                      <Cloud className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-extrabold text-emerald-950 flex items-center gap-1.5">
                          <span>Kho Sao Lưu Đám Mây 7 Ngày (Supabase Storage 1 GB)</span>
                        </h4>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 border border-emerald-300">
                          Bộ nhớ 1 GB Độc Lập
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-800 border border-emerald-200 shadow-2xs">
                          Tiết kiệm 100% CSDL 500 MB
                        </span>
                      </div>
                      <p className="text-xs text-emerald-900/85 mt-0.5 leading-relaxed">
                        Lưu trữ tạm thời 7 ngày độc lập trên Cloud Storage (không mất khi thiết bị hỏng hay format). Tự động lưu trước khi Reset hoặc tạo ngay thủ công.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={handleSaveCloud7DayBackupNow}
                      disabled={isSavingBackup || isSavingCloudBackup}
                      className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                      title="Chủ động chụp ngay 1 bản sao lưu toàn bộ tiệm bánh đẩy lên Kho Đám Mây 1 GB"
                    >
                      {isSavingCloudBackup ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                      <span>Sao Lưu Lên Cloud 1 GB Ngay</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchServerBackupInfo()}
                      className="p-2 text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-100 rounded-xl border border-emerald-300 transition cursor-pointer shadow-2xs"
                      title="Quét và làm mới danh sách bản sao lưu trên Cloud"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* DANH SÁCH BẢN SAO LƯU ĐÁM MÂY */}
                {serverBackupInfo?.temp7DayBackups && serverBackupInfo.temp7DayBackups.length > 0 ? (
                  <div className="space-y-2.5">
                    {serverBackupInfo.temp7DayBackups.map((item) => {
                      const sizeKb = Math.round(item.sizeBytes / 1024);
                      const isUrgent = item.daysRemaining <= 1;
                      return (
                        <div
                          key={item.storagePath || item.cloudKey || item.filename}
                          className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all shadow-2xs bg-white/95 border-emerald-300 hover:border-emerald-500"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-600 text-white flex items-center gap-1 shadow-xs">
                                <Cloud className="w-3 h-3" />
                                Kho Lưu Trữ 1 GB
                              </span>
                              <span className="font-mono text-xs font-bold text-gray-900 bg-emerald-50/50 px-2 py-0.5 rounded border border-emerald-200">
                                {item.filename}
                              </span>
                              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                                isUrgent 
                                  ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse' 
                                  : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              }`}>
                                <Clock className="w-3 h-3" />
                                {item.daysRemaining > 0 
                                  ? `Còn ${item.daysRemaining} ngày ${item.hoursRemaining} giờ` 
                                  : `Hết hạn trong ${item.hoursRemaining} giờ`}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                              <span>🕒 Tạo lúc: <b>{new Date(item.createdAt).toLocaleString('vi-VN')}</b></span>
                              <span>⏳ Hết hạn: <b>{new Date(item.expiresAt).toLocaleDateString('vi-VN')}</b></span>
                              {item.metadata && (
                                <span className="text-emerald-700 font-semibold">
                                  📊 {item.metadata.totalProducts} bánh • {item.metadata.totalOrders} đơn ({sizeKb} KB)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
                            <button
                              type="button"
                              onClick={() => handleLoadServerBackup(item.filename, item.cloudKey, item.storagePath)}
                              disabled={isParsingFile || isReconciling}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
                              title="Nạp bản sao lưu này vào hệ thống để đối soát và khôi phục"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Khôi Phục
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadBackupFile(item.filename, item.cloudKey, item.storagePath)}
                              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                              title="Tải tệp .bakery.json này về máy tính của bạn"
                            >
                              <Download className="h-3.5 w-3.5" />
                              Tải Về Máy
                            </button>
                            <div
                              className="px-2.5 py-1.5 rounded-xl bg-amber-100/70 border border-amber-200/80 text-amber-900 text-[11px] font-bold flex items-center gap-1.5 shadow-2xs select-none"
                              title="Bản sao lưu tạm thời được khóa bảo vệ an toàn 7 ngày (WORM). Không thể xóa sớm trước thời hạn để ngăn chặn kẻ xấu phá hoại dữ liệu."
                            >
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                              <span>Khóa 7 ngày</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 sm:p-5 rounded-xl bg-white/80 border border-emerald-200/80 text-center space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div className="text-xs font-bold text-emerald-950">
                      Chưa có bản sao lưu tạm thời nào trên Kho Lưu Trữ Đám Mây 1 GB
                    </div>
                    <p className="text-[11px] text-zinc-500 max-w-md mx-auto">
                      Khi Quản trị viên thực hiện <b>Reset hệ thống</b>, 1 bản sao lưu sẽ tự động được gửi và khóa bảo vệ 7 ngày tại đây. Hoặc bạn có thể bấm nút bên dưới để tạo ngay 1 bản lưu dự phòng đám mây độc lập.
                    </p>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={handleSaveCloud7DayBackupNow}
                        disabled={isSavingBackup || isSavingCloudBackup}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Cloud className="w-3.5 h-3.5" />
                        <span>Tạo Bản Sao Lưu Đám Mây 1 GB Đầu Tiên</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* BƯỚC 1: CHỌN FILE SAO LƯU */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) processUploadedFile(f);
                }}
                className={`rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                  isDragging
                    ? 'border-amber-500 bg-amber-100/70 scale-[1.01] shadow-lg ring-2 ring-amber-400'
                    : 'border-amber-300 bg-amber-50/30 hover:bg-amber-50/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.bakery.json,application/json"
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
                  Hỗ trợ cả file sao lưu tự động định kỳ, file xuất thủ công, và file an toàn trước khi Reset hệ thống.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {serverBackupInfo?.exists && (
                    <button
                      type="button"
                      onClick={() => handleLoadServerBackup()}
                      disabled={isParsingFile || isReconciling}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-md flex items-center gap-2 transition-all cursor-pointer"
                    >
                      <Database className="h-4 w-4" />
                      ⚡ Nạp nhanh tệp từ ổ cứng ({serverBackupInfo.metadata ? `${serverBackupInfo.metadata.totalProducts} bánh, ${serverBackupInfo.metadata.totalOrders} đơn` : 'latest_backup.bakery.json'})
                    </button>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isParsingFile || isReconciling}
                    className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold shadow-sm flex items-center gap-2 transition-all cursor-pointer"
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
                    {(['orders', 'products', 'ingredients', 'recipes', 'stock_adjustments', 'spoilage_logs', 'expenses', 'images'] as EntityType[]).map((type) => {
                      const entityData = reconciliationReport.byEntity[type];
                      if (!entityData || entityData.total === 0) return null;
                      const labels: Record<string, string> = {
                        orders: 'Đơn hàng',
                        products: 'Sản phẩm',
                        ingredients: 'Kho & Vật tư',
                        recipes: 'Công thức BOM',
                        stock_adjustments: 'Lịch sử kho',
                        spoilage_logs: 'Hao hụt',
                        expenses: 'Sổ quỹ & Chi phí',
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

                  {/* TÙY CHỌN CÁC PHẦN DỮ LIỆU MUỐN KHÔI PHỤC (SELECTIVE RESTORE) */}
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-50/50 p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/80 pb-2.5">
                      <span className="text-xs font-bold text-emerald-950 uppercase flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Tùy chọn các phần dữ liệu muốn khôi phục:
                      </span>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedEntities({
                            orders: true, products: true, ingredients: true,
                            recipes: true, stock_adjustments: true,
                            spoilage_logs: true, expenses: true, images: true,
                          })}
                          className="font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                        >
                          Chọn tất cả
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEntities({
                            orders: false, products: false, ingredients: false,
                            recipes: false, stock_adjustments: false,
                            spoilage_logs: false, expenses: false, images: false,
                          })}
                          className="font-bold text-gray-500 hover:text-gray-700 underline cursor-pointer"
                        >
                          Bỏ chọn hết
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                      {[
                        { key: 'orders', label: 'Đơn hàng & Đặt trước', count: selectedBackupData?.orders?.length || 0, icon: '📋' },
                        { key: 'products', label: 'Bánh & Sản phẩm', count: selectedBackupData?.products?.length || 0, icon: '🎂' },
                        { key: 'ingredients', label: 'Kho & Nguyên vật liệu', count: selectedBackupData?.ingredients?.length || 0, icon: '📦' },
                        { key: 'recipes', label: 'Công thức định mức BOM', count: selectedBackupData?.recipes?.length || 0, icon: '🥣' },
                        { key: 'stock_adjustments', label: 'Lịch sử kho & Biến động', count: selectedBackupData?.stock_adjustments?.length || 0, icon: '📊' },
                        { key: 'spoilage_logs', label: 'Báo cáo hao hụt bánh', count: selectedBackupData?.spoilage_logs?.length || 0, icon: '🗑️' },
                        { key: 'expenses', label: 'Sổ quỹ thu chi & Chi phí', count: (selectedBackupData?.expenses?.length || 0) + (selectedBackupData?.cashflow?.length || 0), icon: '💰' },
                        { key: 'images', label: 'Hình ảnh bánh & QR (Cloud)', count: selectedBackupData?.images?.length || 0, icon: '🖼️' },
                      ].map((item) => (
                        <label
                          key={item.key}
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold cursor-pointer transition select-none ${
                            selectedEntities[item.key]
                              ? 'bg-white border-emerald-500 text-emerald-950 shadow-2xs ring-1 ring-emerald-400/40'
                              : 'bg-white/40 border-gray-200 text-gray-400'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!selectedEntities[item.key]}
                            onChange={(e) => setSelectedEntities((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                            className="rounded accent-emerald-600 w-4 h-4 cursor-pointer shrink-0"
                          />
                          <span className="text-sm shrink-0">{item.icon}</span>
                          <span className="truncate flex-1">{item.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold shrink-0 ${
                            selectedEntities[item.key] ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {item.count}
                          </span>
                        </label>
                      ))}
                    </div>
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
