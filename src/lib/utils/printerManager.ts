import {
  PrinterConfig,
  DeviceDiagnostics,
  DEFAULT_PRINTER_CONFIG,
  ReceiptPaperSize,
  LabelPaperSize,
} from '../types/printerConfig';
import { printHtml } from './printHelper';

const PRINTER_STORAGE_KEY = 'bakery_printer_config';
export const PRINTER_CONFIG_EVENT = 'bakery_printer_config_updated';

/**
 * Tự động phân tích và nhận diện hệ điều hành, thiết bị và khả năng hỗ trợ máy in
 * Tương thích: iPhone (iOS Safari), Điện thoại Android (Chrome), Máy tính Windows / Mac
 */
export function detectDevicePlatform(): DeviceDiagnostics {
  if (typeof window === 'undefined') {
    return {
      isIOS: false,
      isAndroid: false,
      isWindows: false,
      isMac: false,
      isMobile: false,
      browserName: 'Server',
      supportsWebBluetooth: false,
      supportsWebUSB: false,
      supportsWebSerial: false,
    };
  }

  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isWindows = /Windows/.test(ua);
  const isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
  const isMobile = isIOS || isAndroid || /Mobile/.test(ua);

  let browserName = 'Trình duyệt web';
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) browserName = 'Google Chrome';
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browserName = 'Apple Safari';
  else if (/Edg/.test(ua)) browserName = 'Microsoft Edge';
  else if (/Firefox/.test(ua)) browserName = 'Mozilla Firefox';
  else if (/SamsungBrowser/.test(ua)) browserName = 'Samsung Internet';

  const nav = navigator as any;
  const supportsWebBluetooth = typeof nav.bluetooth !== 'undefined';
  const supportsWebUSB = typeof nav.usb !== 'undefined';
  const supportsWebSerial = typeof nav.serial !== 'undefined';

  return {
    isIOS,
    isAndroid,
    isWindows,
    isMac,
    isMobile,
    browserName,
    supportsWebBluetooth,
    supportsWebUSB,
    supportsWebSerial,
  };
}

/**
 * Đọc cấu hình máy in đã lưu
 */
export function getPrinterConfig(): PrinterConfig {
  if (typeof window === 'undefined') return DEFAULT_PRINTER_CONFIG;
  try {
    const raw = localStorage.getItem(PRINTER_STORAGE_KEY);
    if (!raw) return DEFAULT_PRINTER_CONFIG;
    return { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    console.error('Lỗi đọc cấu hình máy in:', e);
    return DEFAULT_PRINTER_CONFIG;
  }
}

/**
 * Lưu cấu hình máy in và thông báo toàn hệ thống
 */
export function savePrinterConfig(config: Partial<PrinterConfig>): PrinterConfig {
  const current = getPrinterConfig();
  const updated = { ...current, ...config };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(PRINTER_STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(PRINTER_CONFIG_EVENT, { detail: updated }));
    } catch (e) {
      console.error('Lỗi lưu cấu hình máy in:', e);
    }
  }
  return updated;
}

/**
 * Thử kết nối máy in nhiệt qua Web Bluetooth (dành cho Android Chrome và PC)
 */
export async function requestBluetoothPrinter(): Promise<{
  success: boolean;
  deviceName?: string;
  deviceId?: string;
  error?: string;
}> {
  const nav = navigator as any;
  if (!nav.bluetooth) {
    const diag = detectDevicePlatform();
    if (diag.isIOS) {
      return {
        success: false,
        error:
          'Hệ điều hành iOS (iPhone/iPad) chặn Web Bluetooth trên Safari theo chính sách bảo mật của Apple. Bạn chỉ cần chọn chế độ "In qua Trình duyệt / AirPrint" để in Bluetooth qua máy in của bạn!',
      };
    }
    return {
      success: false,
      error:
        'Trình duyệt này chưa kích hoạt Web Bluetooth API. Hãy sử dụng Google Chrome trên điện thoại Android hoặc máy tính.',
    };
  }

  try {
    // Tìm kiếm thiết bị Bluetooth hỗ trợ dịch vụ in ấn hoặc mở tìm kiếm tất cả
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb', // Standard Serial / Print
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Xprinter / Rongta
        '49535343-fe7d-41aa-8d19-b0c1aa262527', // ISSC Bluetooth Serial
        '0000ff00-0000-1000-8000-00805f9b34fb', // Custom ESC/POS service
      ],
    });

    if (device && device.name) {
      savePrinterConfig({
        bluetoothDeviceName: device.name,
        bluetoothDeviceId: device.id,
        mode: 'bluetooth',
      });
      return {
        success: true,
        deviceName: device.name,
        deviceId: device.id,
      };
    }

    return { success: false, error: 'Chưa chọn máy in Bluetooth nào.' };
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return { success: false, error: 'Đã hủy tìm kiếm thiết bị Bluetooth.' };
    }
    return { success: false, error: err.message || 'Lỗi kết nối Bluetooth' };
  }
}

/**
 * Thử kết nối máy in cáp USB / Cáp OTG qua WebUSB (dành cho PC và Android OTG)
 */
export async function requestUsbPrinter(): Promise<{
  success: boolean;
  deviceName?: string;
  error?: string;
}> {
  const nav = navigator as any;
  if (!nav.usb) {
    return {
      success: false,
      error:
        'Trình duyệt này không hỗ trợ WebUSB API. Hãy sử dụng Google Chrome trên máy tính hoặc Android qua cáp OTG.',
    };
  }

  try {
    const device = await nav.usb.requestDevice({ filters: [] });
    if (device) {
      const name = device.productName || `Máy in USB (Vendor ${device.vendorId})`;
      savePrinterConfig({
        usbDeviceName: name,
        mode: 'usb',
      });
      return {
        success: true,
        deviceName: name,
      };
    }
    return { success: false, error: 'Chưa chọn máy in USB nào.' };
  } catch (err: any) {
    if (err.name === 'NotFoundError') {
      return { success: false, error: 'Đã hủy nhận diện máy in USB.' };
    }
    return { success: false, error: err.message || 'Lỗi kết nối USB' };
  }
}

/**
 * In thử nghiệm Hóa Đơn Nhiệt (Test Print Receipt 80mm hoặc 58mm)
 */
export function printTestReceipt(size: ReceiptPaperSize = '80mm') {
  const config = getPrinterConfig();
  const is58 = size === '58mm';
  const widthMm = is58 ? '58mm' : '80mm';

  const testReceiptHtml = `
    <div style="font-family: 'Courier New', Courier, monospace, sans-serif; font-size: 12px; color: #000; padding: 2px 4px; line-height: 1.35; text-align: center;">
      <div style="border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <h2 style="margin: 0; font-size: 15px; font-weight: 900; text-transform: uppercase;">${config.storeName}</h2>
        <p style="margin: 2px 0 0 0; font-size: 10px;">${config.storeAddress}</p>
        <p style="margin: 2px 0 0 0; font-size: 10px;">Hotline: ${config.storeHotline}</p>
        <div style="margin-top: 6px; font-weight: 900; font-size: 13px; background: #000; color: #fff; padding: 3px 0; border-radius: 4px;">
          PHIẾU IN TEST MÁY IN
        </div>
        <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: bold;">Khổ giấy: ${widthMm} Thermal</p>
      </div>

      <div style="text-align: left; font-size: 11px; margin-bottom: 6px; border-bottom: 1px dashed #000; padding-bottom: 6px;">
        <div>⏰ Thời gian: ${new Date().toLocaleString('vi-VN')}</div>
        <div>📱 Thiết bị: ${detectDevicePlatform().browserName}</div>
        <div>🔌 Phương thức: ${config.mode.toUpperCase()} (Tự động canh lề)</div>
      </div>

      <div style="text-align: left; font-size: 11px; border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-bottom: 4px;">
          <span>Tên món bánh</span>
          <span>Thành tiền</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Bánh Mì Hoa Cúc x1</span>
          <span>45.000₫</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
          <span>Bông Lan Trứng Muối x1</span>
          <span>120.000₫</span>
        </div>
      </div>

      <div style="text-align: right; font-size: 13px; font-weight: 900; margin-bottom: 8px;">
        TỔNG CỘNG: 165.000₫
      </div>

      <div style="border: 1px dashed #000; padding: 6px; font-size: 10px; margin-bottom: 8px; border-radius: 4px; text-align: center;">
        ✅ <b>KẾT NỐI MÁY IN THÀNH CÔNG!</b><br/>
        Máy in phản hồi chuẩn xác 100%, không bị tràn trang và không ngắt chữ.
      </div>

      <div style="font-size: 10px; color: #333; margin-top: 6px;">
        *** Cảm Ơn Quý Khách ***
      </div>
      <div style="margin-top: 10px; font-size: 9px; color: #777;">
        - - - - - - Cắt tại đây - - - - - -
      </div>
    </div>
  `;

  printHtml(testReceiptHtml, {
    title: `In_Test_${size}`,
    pageSize: size === '58mm' ? 'auto' : '80mm',
    customCss: `
      html, body {
        width: ${widthMm} !important;
        max-width: ${widthMm} !important;
        margin: 0 auto !important;
        padding: 2mm 1mm !important;
        background: #fff !important;
      }
    `,
  });
}

/**
 * In thử nghiệm Tem Nhãn Dán Bánh (Test Print Sticker 50x30mm hoặc 50x40mm)
 */
export function printTestSticker(size: LabelPaperSize = '50x30') {
  const config = getPrinterConfig();
  const heightMm = size === '50x30' ? '30mm' : '40mm';

  const testStickerHtml = `
    <div id="printable-cake-sticker" style="width: 50mm; height: ${heightMm}; box-sizing: border-box; padding: 1.5mm 2mm; background: #fff; color: #000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; font-size: 8px;">
      <!-- Header -->
      <div style="border-bottom: 1px solid #000; padding-bottom: 1px; display: flex; justify-content: space-between; align-items: center; font-size: 8px; line-height: 1.1;">
        <div>
          <b style="font-size: 8.5px; text-transform: uppercase;">${config.storeName}</b>
          <span style="display: block; font-size: 7px; color: #333;">Hotline: ${config.storeHotline}</span>
        </div>
        <span style="background: #000; color: #fff; padding: 1px 3px; border-radius: 2px; font-weight: bold; font-size: 8px;">
          #TEST-OK
        </span>
      </div>

      <!-- Content -->
      <div style="padding: 1px 0;">
        <div style="font-weight: 900; font-size: 9.5px; text-transform: uppercase; line-height: 1.2; max-height: 24px; overflow: hidden;">
          BÁNH BÔNG LAN KEM TƯƠI 18CM
        </div>
        <div style="font-size: 8px; font-weight: bold; font-style: italic; border-left: 2px solid #000; padding-left: 3px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ✍️ "Happy Birthday - Chúc Mừng Sinh Nhật"
        </div>
        <div style="font-size: 7.5px; margin-top: 1px; color: #111; line-height: 1.2;">
          <div>👤 Khách test: Anh Hoàng • 0901.234.567</div>
          <div style="font-weight: bold;">⏰ Hẹn giao: 17:30 ngày mai (Đúng giờ)</div>
          <div style="font-weight: bold; color: #000;">🏪 Nhận: Tại tiệm (${config.storeAddress.split(',')[0]})</div>
        </div>
      </div>

      <!-- Footer Barcode & Dates -->
      <div style="border-top: 1px solid #000; padding-top: 1px; display: flex; flex-direction: column; align-items: center;">
        <div style="width: 100%; display: flex; justify-content: center; height: 12px;">
          <svg style="width: 80%; height: 100%;" viewBox="0 0 160 20" preserveAspectRatio="none">
            <rect x="0" y="0" width="2" height="20" fill="black" />
            <rect x="5" y="0" width="1" height="20" fill="black" />
            <rect x="9" y="0" width="3" height="20" fill="black" />
            <rect x="15" y="0" width="2" height="20" fill="black" />
            <rect x="20" y="0" width="4" height="20" fill="black" />
            <rect x="28" y="0" width="2" height="20" fill="black" />
            <rect x="35" y="0" width="3" height="20" fill="black" />
            <rect x="42" y="0" width="1" height="20" fill="black" />
            <rect x="46" y="0" width="4" height="20" fill="black" />
            <rect x="54" y="0" width="2" height="20" fill="black" />
            <rect x="60" y="0" width="3" height="20" fill="black" />
            <rect x="67" y="0" width="1" height="20" fill="black" />
            <rect x="72" y="0" width="4" height="20" fill="black" />
            <rect x="80" y="0" width="2" height="20" fill="black" />
            <rect x="86" y="0" width="3" height="20" fill="black" />
            <rect x="93" y="0" width="1" height="20" fill="black" />
            <rect x="98" y="0" width="4" height="20" fill="black" />
            <rect x="106" y="0" width="2" height="20" fill="black" />
            <rect x="112" y="0" width="3" height="20" fill="black" />
            <rect x="120" y="0" width="2" height="20" fill="black" />
            <rect x="126" y="0" width="4" height="20" fill="black" />
            <rect x="134" y="0" width="2" height="20" fill="black" />
            <rect x="140" y="0" width="3" height="20" fill="black" />
            <rect x="147" y="0" width="2" height="20" fill="black" />
            <rect x="154" y="0" width="3" height="20" fill="black" />
          </svg>
        </div>
        <div style="width: 100%; display: flex; justify-content: space-between; font-size: 6.5px; font-weight: bold; color: #444; margin-top: 1px;">
          <span>NSX: ${new Date().toLocaleDateString('vi-VN')}</span>
          <span>HSD: 48 Giờ (Bảo quản 2-5°C)</span>
        </div>
      </div>
    </div>
  `;

  printHtml(testStickerHtml, {
    title: `In_Tem_Test_${size}`,
    pageSize: size,
    customCss: `
      html, body {
        width: 50mm !important;
        height: ${heightMm} !important;
        max-width: 50mm !important;
        max-height: ${heightMm} !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
    `,
  });
}
