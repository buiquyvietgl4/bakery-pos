'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Bluetooth,
  Usb,
  Smartphone,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  FileText,
  Tag,
  Settings,
  HelpCircle,
  ExternalLink,
  Save,
  Info,
} from 'lucide-react';
import {
  PrinterConfig,
  DeviceDiagnostics,
  ReceiptPaperSize,
  LabelPaperSize,
  PrinterConnectionMode,
} from '@/lib/types/printerConfig';
import {
  getPrinterConfig,
  savePrinterConfig,
  detectDevicePlatform,
  requestBluetoothPrinter,
  requestUsbPrinter,
  printTestReceipt,
  printTestSticker,
  PRINTER_CONFIG_EVENT,
} from '@/lib/utils/printerManager';

interface PrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [config, setConfig] = useState<PrinterConfig>(getPrinterConfig());
  const [diagnostics, setDiagnostics] = useState<DeviceDiagnostics>(detectDevicePlatform());
  const [activeTab, setActiveTab] = useState<'quick' | 'paper' | 'hardware' | 'guide'>('quick');
  const [connectingBt, setConnectingBt] = useState(false);
  const [connectingUsb, setConnectingUsb] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setConfig(getPrinterConfig());
    setDiagnostics(detectDevicePlatform());
    setStatusMessage(null);

    const handleConfigUpdate = (e: any) => {
      if (e?.detail) setConfig(e.detail);
    };
    window.addEventListener(PRINTER_CONFIG_EVENT, handleConfigUpdate);
    return () => window.removeEventListener(PRINTER_CONFIG_EVENT, handleConfigUpdate);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleModeChange = (mode: PrinterConnectionMode) => {
    const updated = savePrinterConfig({ mode });
    setConfig(updated);
  };

  const handleReceiptSizeChange = (receiptSize: ReceiptPaperSize) => {
    const updated = savePrinterConfig({ receiptSize });
    setConfig(updated);
  };

  const handleLabelSizeChange = (labelSize: LabelPaperSize) => {
    const updated = savePrinterConfig({ labelSize });
    setConfig(updated);
  };

  const handleConnectBluetooth = async () => {
    setConnectingBt(true);
    setStatusMessage(null);
    try {
      const res = await requestBluetoothPrinter();
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Đã kết nối máy in Bluetooth: "${res.deviceName}". Bạn có thể in thử ngay bây giờ!`,
        });
        setConfig(getPrinterConfig());
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Không thể kết nối máy in Bluetooth.',
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Lỗi khi tìm Bluetooth.' });
    } finally {
      setConnectingBt(false);
    }
  };

  const handleConnectUsb = async () => {
    setConnectingUsb(true);
    setStatusMessage(null);
    try {
      const res = await requestUsbPrinter();
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Đã nhận diện máy in USB: "${res.deviceName}"!`,
        });
        setConfig(getPrinterConfig());
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Không thể nhận diện máy in USB.',
        });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Lỗi khi kết nối USB.' });
    } finally {
      setConnectingUsb(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000015] bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 border border-zinc-200 text-zinc-900 max-h-[92dvh] flex flex-col">
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-zinc-900 flex items-center gap-2">
                Cài Đặt Máy In & Kiểm Tra Kết Nối
              </h3>
              <p className="text-xs text-zinc-500 font-medium">
                Tương thích mọi máy in nhiệt (Bluetooth, USB, Wi-Fi) trên iPhone, Android & Máy tính
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thanh Nhận Diện Thiết Bị Đang Sử Dụng */}
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 p-3 rounded-2xl border border-blue-200/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            {diagnostics.isIOS ? (
              <span className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Smartphone className="w-4 h-4" />
              </span>
            ) : diagnostics.isAndroid ? (
              <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <Smartphone className="w-4 h-4" />
              </span>
            ) : (
              <span className="w-7 h-7 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                <Laptop className="w-4 h-4" />
              </span>
            )}
            <div>
              <div className="font-black text-zinc-900">
                Thiết bị hiện tại:{' '}
                <span className="text-blue-700">
                  {diagnostics.isIOS
                    ? '📱 iPhone / iPad (iOS)'
                    : diagnostics.isAndroid
                    ? '🤖 Điện thoại / Tablet Android'
                    : '💻 Máy tính PC / Laptop'}
                </span>
              </div>
              <div className="text-[11px] text-zinc-600">
                {diagnostics.browserName} • Trạng thái in: Sẵn sàng 100%
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black flex items-center gap-1">
              ✓ In Trình duyệt OK
            </span>
            {diagnostics.supportsWebBluetooth && (
              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-black flex items-center gap-1">
                ✓ Web Bluetooth
              </span>
            )}
          </div>
        </div>

        {/* Thông báo trạng thái nếu có */}
        {statusMessage && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-300'
                : 'bg-blue-50 text-blue-800 border border-blue-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Chuyển các tab cấu hình */}
        <div className="flex rounded-2xl bg-zinc-100 p-1 border border-zinc-200 text-xs font-bold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'quick' ? 'bg-white text-blue-700 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>In Thử Nghiệm</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('paper')}
            className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'paper' ? 'bg-white text-blue-700 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Khổ Giấy & Tem</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hardware')}
            className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'hardware' ? 'bg-white text-blue-700 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Bluetooth className="w-4 h-4" />
            <span>Bluetooth & USB</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`flex-1 py-2 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'guide' ? 'bg-white text-blue-700 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>Hướng Dẫn In</span>
          </button>
        </div>

        {/* Nội dung theo từng Tab (Cuộn được) */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[260px]">
          {/* TAB 1: IN THỬ NGHIỆM */}
          {activeTab === 'quick' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  Phương Thức In Trực Tiếp Độc Lập (Hidden Iframe):
                </div>
                <p className="text-zinc-700 leading-relaxed">
                  Công nghệ in qua Iframe giúp hóa đơn và tem nhãn <b>không bao giờ bị nhảy trang</b>, tự động nhận diện máy in AirPrint trên iPhone, máy in Bluetooth/Mopria trên Android và máy in cắm dây USB trên máy tính.
                </p>
              </div>

              {/* Nút In Thử Hóa Đơn */}
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2.5">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-zinc-700" />
                      In Thử Hóa Đơn Nhiệt (Receipt)
                    </h4>
                    <p className="text-[11px] text-zinc-500 font-medium">
                      Kiểm tra độ nét của máy in nhiệt và tính năng ngắt giấy liên tục
                    </p>
                  </div>
                  <span className="text-xs font-bold bg-zinc-200/80 px-2 py-0.5 rounded-lg text-zinc-700">
                    Hiện tại: {config.receiptSize}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => printTestReceipt('80mm')}
                    className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In Test Khổ 80mm (K80 Chuẩn)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => printTestReceipt('58mm')}
                    className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-white border border-zinc-300 hover:bg-zinc-100 text-zinc-800 text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>In Test Khổ 58mm (K58 Nhỏ)</span>
                  </button>
                </div>
              </div>

              {/* Nút In Thử Tem Dán Hộp Bánh */}
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2.5">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-amber-600" />
                      In Thử Tem Dán Hộp Bánh (Sticker / Barcode)
                    </h4>
                    <p className="text-[11px] text-zinc-500 font-medium">
                      Đảm bảo con tem in đúng 1 trang duy nhất, không lặp lại 11 trang
                    </p>
                  </div>
                  <span className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-lg">
                    Hiện tại: {config.labelSize}mm
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => printTestSticker('50x30')}
                    className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>In Test Tem 50x30mm (Chuẩn)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => printTestSticker('50x40')}
                    className="flex-1 min-w-[140px] py-2.5 rounded-xl bg-white border border-amber-300 hover:bg-amber-50 text-amber-900 text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    <span>In Test Tem 50x40mm (Tem Lớn)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: KHỔ GIẤY & THÔNG TIN TIỆM */}
          {activeTab === 'paper' && (
            <div className="space-y-4">
              {/* Chọn khổ in hóa đơn */}
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <label className="font-black text-xs text-zinc-900 block">
                  Khổ giấy in hóa đơn mặc định:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleReceiptSizeChange('80mm')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      config.receiptSize === '80mm'
                        ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="font-black text-xs">Khổ K80 (80mm) - Khuyên dùng</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Dành cho máy in Xprinter, Epson, Sunmi, Rongta để bàn
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleReceiptSizeChange('58mm')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      config.receiptSize === '58mm'
                        ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="font-black text-xs">Khổ K58 (58mm)</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Dành cho máy in cầm tay mini Bluetooth di động
                    </div>
                  </button>
                </div>
              </div>

              {/* Chọn khổ in tem dán */}
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <label className="font-black text-xs text-zinc-900 block">
                  Khổ tem nhãn dán hộp mặc định:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleLabelSizeChange('50x30')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      config.labelSize === '50x30'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-xs'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="font-black text-xs">Tem 50 x 30 mm (Chuẩn)</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Khổ tem cuộn 1 hàng phổ biến nhất trên thị trường
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLabelSizeChange('50x40')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      config.labelSize === '50x40'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-xs'
                        : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                    }`}
                  >
                    <div className="font-black text-xs">Tem 50 x 40 mm (Tem lớn)</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Thêm nhiều diện tích cho địa chỉ giao hàng dài
                    </div>
                  </button>
                </div>
              </div>

              {/* Thông tin tiệm in lên đầu hóa đơn và tem */}
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2.5 text-xs">
                <label className="font-black text-zinc-900 block">
                  Thông tin thương hiệu in lên hóa đơn & tem nhãn:
                </label>
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] font-bold text-zinc-600 block mb-1">Tên tiệm bánh:</span>
                    <input
                      type="text"
                      value={config.storeName}
                      onChange={(e) => savePrinterConfig({ storeName: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-300 rounded-xl font-bold text-zinc-900"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-zinc-600 block mb-1">Địa chỉ tiệm:</span>
                    <input
                      type="text"
                      value={config.storeAddress}
                      onChange={(e) => savePrinterConfig({ storeAddress: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-300 rounded-xl text-zinc-900"
                    />
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-zinc-600 block mb-1">Hotline liên hệ:</span>
                    <input
                      type="text"
                      value={config.storeHotline}
                      onChange={(e) => savePrinterConfig({ storeHotline: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-zinc-300 rounded-xl text-zinc-900"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BLUETOOTH & USB */}
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              {/* Kết nối Bluetooth */}
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                      <Bluetooth className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-black text-xs sm:text-sm text-zinc-900">Máy In Không Dây Bluetooth</h4>
                      <p className="text-[11px] text-zinc-500">
                        {config.bluetoothDeviceName ? `Đã lưu: ${config.bluetoothDeviceName}` : 'Chưa ghép đôi thiết bị'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      config.bluetoothDeviceName ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {config.bluetoothDeviceName ? 'Đã ghép đôi' : 'Chưa kết nối'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleConnectBluetooth}
                    disabled={connectingBt}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Bluetooth className={`w-3.5 h-3.5 ${connectingBt ? 'animate-spin' : ''}`} />
                    <span>{connectingBt ? 'Đang quét...' : '🔍 Tìm & Ghép Đôi Máy In Bluetooth'}</span>
                  </button>

                  {config.bluetoothDeviceName && (
                    <button
                      type="button"
                      onClick={() => savePrinterConfig({ bluetoothDeviceName: undefined, bluetoothDeviceId: undefined })}
                      className="px-3 py-2 rounded-xl border border-zinc-200 text-rose-600 hover:bg-rose-50 font-bold text-xs cursor-pointer"
                    >
                      Hủy kết nối
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed italic">
                  💡 Hỗ trợ các dòng máy in Bluetooth phổ biến: Xprinter (XP-P300, XP-58IIH, XP-P102), PT-210, PeriPage, Rongta, Zywell.
                </p>
              </div>

              {/* Kết nối USB / Cáp OTG */}
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                      <Usb className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-black text-xs sm:text-sm text-zinc-900">Máy In Cáp USB / Cáp Chuyển OTG</h4>
                      <p className="text-[11px] text-zinc-500">
                        {config.usbDeviceName ? `Đã nhận diện: ${config.usbDeviceName}` : 'Chưa kết nối cáp USB'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      config.usbDeviceName ? 'bg-emerald-100 text-emerald-800' : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {config.usbDeviceName ? 'Đã nhận USB' : 'Chưa cắm'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleConnectUsb}
                    disabled={connectingUsb}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Usb className={`w-3.5 h-3.5 ${connectingUsb ? 'animate-spin' : ''}`} />
                    <span>{connectingUsb ? 'Đang nhận diện...' : '🔌 Nhận Diện Máy In Cáp USB / OTG'}</span>
                  </button>

                  {config.usbDeviceName && (
                    <button
                      type="button"
                      onClick={() => savePrinterConfig({ usbDeviceName: undefined })}
                      className="px-3 py-2 rounded-xl border border-zinc-200 text-rose-600 hover:bg-rose-50 font-bold text-xs cursor-pointer"
                    >
                      Hủy kết nối
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-zinc-500 leading-relaxed italic">
                  💡 Dành cho máy tính để bàn (Windows, Mac) hoặc điện thoại Android cắm cáp USB qua đầu chuyển OTG (Type-C / MicroUSB sang USB-A).
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: HƯỚNG DẪN CHI TIẾT TỪNG THIẾT BỊ */}
          {activeTab === 'guide' && (
            <div className="space-y-3.5 text-xs">
              {/* Hướng dẫn iPhone / iPad */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                <div className="font-black text-blue-900 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  1. Dành cho iPhone / iPad (Hệ điều hành iOS):
                </div>
                <ul className="list-disc pl-5 space-y-1 text-zinc-700 leading-relaxed">
                  <li>
                    <b>Cách 1 (Chuẩn nhất & Đơn giản nhất):</b> Chỉ cần ấn nút in trên màn hình POS. Trình duyệt Safari sẽ mở hộp thoại in của iOS. Bạn chỉ cần chọn máy in đã kết nối Wi-Fi/AirPrint của tiệm.
                  </li>
                  <li>
                    <b>Cách 2 (Máy in Bluetooth thông thường):</b> Tải app hỗ trợ in nhiệt trên App Store (như <i>Xprinter App</i>, <i>Phomemo</i>, hoặc <i>PrinterShare</i>). Kết nối Bluetooth trong Cài đặt iPhone, sau đó in trực tiếp.
                  </li>
                  <li>
                    <b>Lưu ý quan trọng:</b> Trong màn hình in của iPhone, hãy chọn khổ giấy là <b>80mm</b> (hoặc <b>50x30mm</b> khi in tem) và tắt viền lề (Margins = None).
                  </li>
                </ul>
              </div>

              {/* Hướng dẫn Android */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                <div className="font-black text-emerald-900 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  2. Dành cho Điện Thoại & Tablet Android:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-zinc-700 leading-relaxed">
                  <li>
                    <b>Kết nối Bluetooth trực tiếp:</b> Bật Bluetooth trên điện thoại, bật nguồn máy in. Mở POS bằng Google Chrome, vào tab <i>"Bluetooth & USB"</i> ở trên rồi bấm <i>"Tìm & Ghép Đôi"</i>.
                  </li>
                  <li>
                    <b>Kết nối qua Cáp USB OTG:</b> Cắm đầu chuyển OTG vào chân sạc điện thoại, cắm dây máy in vào. Hệ thống sẽ tự nhận diện.
                  </li>
                  <li>
                    <b>Ứng dụng RawBT (Khuyên dùng cho quầy đông khách):</b> Tải app <i>RawBT Print Service</i> miễn phí trên Google Play Store để in 1 chạm siêu tốc không cần xác nhận.
                  </li>
                </ul>
              </div>

              {/* Hướng dẫn Máy tính PC / Laptop */}
              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-1.5">
                <div className="font-black text-purple-900 flex items-center gap-1.5">
                  <Laptop className="w-4 h-4 text-purple-600" />
                  3. Dành cho Máy Tính Windows & MacBook:
                </div>
                <ul className="list-disc pl-5 space-y-1 text-zinc-700 leading-relaxed">
                  <li>
                    Cắm cáp USB và cài đặt Driver của hãng máy in (Xprinter, Bixolon, Epson, Rongta, HPRT...).
                  </li>
                  <li>
                    Trong hộp thoại in của trình duyệt (Chrome, Edge), chọn đúng tên máy in. Đặt <b>Lề (Margins) = None</b> và tắt <b>Tiêu đề và chân trang (Headers & Footers)</b> để hóa đơn và tem in sắc nét nhất.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="pt-3 border-t border-zinc-100 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-zinc-500 font-medium hidden sm:block">
            Mọi cấu hình in được tự động lưu trên thiết bị này.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs transition cursor-pointer shadow-sm ml-auto"
          >
            Đã Xong & Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default PrinterSettingsModal;
