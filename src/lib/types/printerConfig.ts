export type PrinterConnectionMode = 'browser' | 'bluetooth' | 'usb' | 'rawbt';
export type ReceiptPaperSize = '80mm' | '58mm';
export type LabelPaperSize = '50x30' | '50x40';

export interface PrinterConfig {
  mode: PrinterConnectionMode;
  receiptSize: ReceiptPaperSize;
  labelSize: LabelPaperSize;
  bluetoothDeviceName?: string;
  bluetoothDeviceId?: string;
  usbDeviceName?: string;
  storeName: string;
  storeAddress: string;
  storeHotline: string;
  autoCut?: boolean;
  printDeliveryAddress: boolean;
  copies: number;
}

export interface DeviceDiagnostics {
  isIOS: boolean;
  isAndroid: boolean;
  isWindows: boolean;
  isMac: boolean;
  isMobile: boolean;
  browserName: string;
  supportsWebBluetooth: boolean;
  supportsWebUSB: boolean;
  supportsWebSerial: boolean;
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  mode: 'browser',
  receiptSize: '80mm',
  labelSize: '50x30',
  storeName: 'TIỆM BÁNH HOÀNG GIA',
  storeAddress: '123 Đường Bánh Ngọt, TP.HCM',
  storeHotline: '0901.234.567',
  autoCut: true,
  printDeliveryAddress: true,
  copies: 1,
};
