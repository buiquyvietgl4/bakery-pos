import {
  LabelPaperSize,
  ReceiptPaperSize,
  StickerTemplateConfig,
  ReceiptTemplateConfig,
  StickerElementConfig,
  ReceiptBlockConfig,
} from '../types/printTemplate';

export const PRINT_TEMPLATE_UPDATED_EVENT = 'bakery_print_template_updated';

// ============================================================================
// TEMPLATE MẶC ĐỊNH CHO TEM DÁN 50x30 mm
// ============================================================================
export const DEFAULT_STICKER_TEMPLATE_50X30: StickerTemplateConfig = {
  canvasSize: '50x30',
  showBorder: false,
  elements: [
    {
      id: 'store_name',
      label: 'Tên tiệm bánh',
      visible: true,
      x: 2,
      y: 2,
      width: 65,
      fontSize: 7.5,
      fontWeight: 'black',
      align: 'left',
    },
    {
      id: 'order_code',
      label: 'Mã đơn hàng',
      visible: true,
      x: 68,
      y: 2,
      width: 30,
      fontSize: 7,
      fontWeight: 'black',
      align: 'right',
    },
    {
      id: 'store_hotline',
      label: 'Hotline tiệm',
      visible: true,
      x: 2,
      y: 10,
      width: 96,
      fontSize: 5.5,
      fontWeight: 'normal',
      align: 'left',
    },
    {
      id: 'store_address',
      label: 'Địa chỉ tiệm / quán',
      visible: false,
      x: 2,
      y: 16,
      width: 96,
      fontSize: 5,
      fontWeight: 'normal',
      align: 'left',
    },
    {
      id: 'cake_name',
      label: 'Tên món bánh',
      visible: true,
      x: 2,
      y: 22,
      width: 96,
      fontSize: 8,
      fontWeight: 'black',
      align: 'left',
    },
    {
      id: 'cake_message',
      label: 'Lời nhắn viết bánh',
      visible: true,
      x: 2,
      y: 35,
      width: 96,
      fontSize: 6.2,
      fontWeight: 'bold',
      fontStyle: 'italic',
      align: 'left',
    },
    {
      id: 'pickup_time',
      label: 'Giờ hẹn lấy/giao',
      visible: true,
      x: 2,
      y: 47,
      width: 96,
      fontSize: 6.5,
      fontWeight: 'black',
      align: 'left',
    },
    {
      id: 'customer_info',
      label: 'Khách hàng & SĐT',
      visible: true,
      x: 2,
      y: 58,
      width: 96,
      fontSize: 6,
      fontWeight: 'bold',
      align: 'left',
    },
    {
      id: 'delivery_method',
      label: 'Hình thức nhận (Ship/Tiệm)',
      visible: true,
      x: 2,
      y: 68,
      width: 96,
      fontSize: 6,
      fontWeight: 'bold',
      align: 'left',
    },
    {
      id: 'shipping_address',
      label: 'Địa chỉ nhận hàng',
      visible: false,
      x: 2,
      y: 77,
      width: 96,
      fontSize: 5.8,
      fontWeight: 'bold',
      align: 'left',
    },
    {
      id: 'price_and_cod',
      label: 'Giá bánh & Còn thu COD',
      visible: true,
      x: 2,
      y: 83,
      width: 96,
      fontSize: 6.5,
      fontWeight: 'black',
      align: 'left',
    },
    {
      id: 'dates',
      label: 'Ngày đặt & HSD',
      visible: false,
      x: 2,
      y: 92,
      width: 96,
      fontSize: 5,
      fontWeight: 'normal',
      align: 'left',
    },
    {
      id: 'barcode',
      label: 'Mã vạch Barcode',
      visible: false,
      x: 10,
      y: 84,
      width: 80,
      fontSize: 7,
      fontWeight: 'normal',
      align: 'center',
    },
    {
      id: 'filling_flavor',
      label: 'Hương vị / Nhân bánh',
      visible: false,
      x: 2,
      y: 77,
      width: 96,
      fontSize: 5.8,
      fontWeight: 'normal',
      align: 'left',
    },
    {
      id: 'custom_note',
      label: 'Ghi chú thêm',
      visible: false,
      x: 2,
      y: 92,
      width: 96,
      fontSize: 5.5,
      fontWeight: 'normal',
      align: 'left',
      customText: 'Bảo quản ngăn mát 2-5°C',
    },
  ],
};

// ============================================================================
// TEMPLATE MẶC ĐỊNH CHO TEM DÁN 50x40 mm (Khổ tem lớn)
// ============================================================================
export const DEFAULT_STICKER_TEMPLATE_50X40: StickerTemplateConfig = {
  canvasSize: '50x40',
  showBorder: false,
  elements: [
    {
      id: 'store_name',
      label: 'Tên tiệm bánh',
      visible: true,
      x: 2,
      y: 2,
      width: 65,
      fontSize: 8.5,
      fontWeight: 'black',
      align: 'left',
    },
    {
      id: 'store_hotline',
      label: 'Hotline tiệm',
      visible: true,
      x: 2,
      y: 9,
      width: 65,
      fontSize: 7,
      fontWeight: 'normal',
      align: 'left',
    },
    {
      id: 'store_address',
      label: 'Địa chỉ tiệm / quán',
      visible: false,
      x: 2,
      y: 15,
      width: 96,
      fontSize: 6.5,
      fontWeight: 'normal',
      align: 'left',
    },
    {
      id: 'order_code',
      label: 'Mã đơn hàng',
      visible: true,
      x: 70,
      y: 2,
      width: 28,
      fontSize: 8,
      fontWeight: 'black',
      align: 'right',
    },
    {
      id: 'cake_name',
      label: 'Tên món bánh',
      visible: true,
      x: 2,
      y: 18,
      width: 96,
      fontSize: 10.5,
      fontWeight: 'black',
      align: 'left',
    },
    {
      id: 'cake_message',
      label: 'Lời nhắn viết bánh',
      visible: true,
      x: 2,
      y: 32,
      width: 96,
      fontSize: 7.5,
      fontWeight: 'bold',
      fontStyle: 'italic',
      align: 'left',
    },
    {
      id: 'customer_info',
      label: 'Khách hàng & SĐT',
      visible: true,
      x: 2,
      y: 43,
      width: 96,
      fontSize: 7,
      fontWeight: 'bold',
      align: 'left',
    },
    {
      id: 'pickup_time',
      label: 'Giờ hẹn lấy/giao',
      visible: true,
      x: 2,
      y: 52,
      width: 96,
      fontSize: 7.2,
      fontWeight: 'black',
      align: 'left',
    },
    {
      id: 'delivery_method',
      label: 'Hình thức nhận (Ship/Tiệm)',
      visible: true,
      x: 2,
      y: 60,
      width: 96,
      fontSize: 7,
      fontWeight: 'bold',
      align: 'left',
    },
    {
      id: 'filling_flavor',
      label: 'Hương vị / Nhân bánh',
      visible: true,
      x: 2,
      y: 68,
      width: 96,
      fontSize: 6.8,
      fontWeight: 'normal',
      align: 'left',
    },
    {
      id: 'price_and_cod',
      label: 'Giá bánh & Còn thu COD',
      visible: true,
      x: 2,
      y: 76,
      width: 96,
      fontSize: 7.5,
      fontWeight: 'black',
      align: 'left',
    },
    {
      id: 'barcode',
      label: 'Mã vạch Barcode',
      visible: true,
      x: 10,
      y: 84,
      width: 80,
      fontSize: 7,
      fontWeight: 'normal',
      align: 'center',
    },
    {
      id: 'dates',
      label: 'Ngày đặt & HSD',
      visible: true,
      x: 2,
      y: 93,
      width: 96,
      fontSize: 6,
      fontWeight: 'normal',
      align: 'left',
    },
    {
      id: 'shipping_address',
      label: 'Địa chỉ nhận hàng',
      visible: false,
      x: 2,
      y: 60,
      width: 96,
      fontSize: 6.8,
      fontWeight: 'bold',
      align: 'left',
    },
    {
      id: 'custom_note',
      label: 'Ghi chú thêm',
      visible: false,
      x: 2,
      y: 88,
      width: 96,
      fontSize: 6.5,
      fontWeight: 'normal',
      align: 'left',
      customText: 'Bảo quản tủ mát',
    },
  ],
};

// ============================================================================
// TEMPLATE MẶC ĐỊNH CHO HÓA ĐƠN IN NHIỆT K80 (80mm)
// ============================================================================
export const DEFAULT_RECEIPT_TEMPLATE_80MM: ReceiptTemplateConfig = {
  paperSize: '80mm',
  blocks: [
    {
      id: 'header_store',
      label: 'Thương hiệu & Thông tin cửa hàng',
      visible: true,
      order: 1,
      options: {
        showLogo: true,
        showSlogan: true,
        showAddress: true,
        showHotline: true,
      },
    },
    {
      id: 'order_meta',
      label: 'Tiêu đề hóa đơn & Số đơn',
      visible: true,
      order: 2,
      options: {
        showCashier: true,
      },
    },
    {
      id: 'customer_info',
      label: 'Thông tin khách hàng & Giờ hẹn',
      visible: true,
      order: 3,
      options: {
        showAddress: true,
      },
    },
    {
      id: 'items_table',
      label: 'Bảng danh sách món bánh',
      visible: true,
      order: 4,
      options: {
        showCakeMessage: true,
      },
    },
    {
      id: 'pricing_summary',
      label: 'Tổng tiền, Giảm giá & Tiền cọc/COD',
      visible: true,
      order: 5,
      options: {
        showDiscount: true,
        showShippingFee: true,
      },
    },
    {
      id: 'payment_details',
      label: 'Phương thức thanh toán & Tiền thừa',
      visible: true,
      order: 6,
      options: {
        showChangeAmount: true,
      },
    },
    {
      id: 'vietqr_cod',
      label: 'Mã VietQR thu tiền COD khi giao bánh',
      visible: true,
      order: 7,
      options: {
        showVietQrCod: true,
      },
    },
    {
      id: 'footer_greeting',
      label: 'Lời cảm ơn chân trang',
      visible: true,
      order: 8,
      options: {
        showFooterMessage: true,
      },
    },
  ],
};

// ============================================================================
// TEMPLATE MẶC ĐỊNH CHO HÓA ĐƠN IN NHIỆT K58 (58mm)
// ============================================================================
export const DEFAULT_RECEIPT_TEMPLATE_58MM: ReceiptTemplateConfig = {
  paperSize: '58mm',
  blocks: [
    {
      id: 'header_store',
      label: 'Thương hiệu & Thông tin cửa hàng',
      visible: true,
      order: 1,
      options: {
        showLogo: true,
        showSlogan: false,
        showAddress: true,
        showHotline: true,
      },
    },
    {
      id: 'order_meta',
      label: 'Tiêu đề hóa đơn & Số đơn',
      visible: true,
      order: 2,
      options: {
        showCashier: true,
      },
    },
    {
      id: 'customer_info',
      label: 'Thông tin khách hàng & Giờ hẹn',
      visible: true,
      order: 3,
      options: {
        showAddress: true,
      },
    },
    {
      id: 'items_table',
      label: 'Bảng danh sách món bánh',
      visible: true,
      order: 4,
      options: {
        showCakeMessage: true,
      },
    },
    {
      id: 'pricing_summary',
      label: 'Tổng tiền, Giảm giá & Tiền cọc/COD',
      visible: true,
      order: 5,
      options: {
        showDiscount: true,
        showShippingFee: true,
      },
    },
    {
      id: 'payment_details',
      label: 'Phương thức thanh toán & Tiền thừa',
      visible: true,
      order: 6,
      options: {
        showChangeAmount: true,
      },
    },
    {
      id: 'vietqr_cod',
      label: 'Mã VietQR thu tiền COD khi giao bánh',
      visible: true,
      order: 7,
      options: {
        showVietQrCod: true,
      },
    },
    {
      id: 'footer_greeting',
      label: 'Lời cảm ơn chân trang',
      visible: true,
      order: 8,
      options: {
        showFooterMessage: true,
      },
    },
  ],
};

// ============================================================================
// HÀM TIỆN ÍCH LƯU TRỮ VÀ TRUY XUẤT CẤU HÌNH
// ============================================================================

/**
 * Lấy cấu hình mẫu tem dán hộp bánh đã lưu
 */
export function getStickerTemplate(size: LabelPaperSize = '50x30'): StickerTemplateConfig {
  if (typeof window === 'undefined') {
    return size === '50x40' ? DEFAULT_STICKER_TEMPLATE_50X40 : DEFAULT_STICKER_TEMPLATE_50X30;
  }
  try {
    const key = `bakery_print_sticker_template_${size}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.elements)) {
        // Hợp nhất các field mặc định mới nếu trong storage thiếu
        const defaultTmpl = size === '50x40' ? DEFAULT_STICKER_TEMPLATE_50X40 : DEFAULT_STICKER_TEMPLATE_50X30;
        const mergedElements = defaultTmpl.elements.map((defEl) => {
          const found = parsed.elements.find((el: StickerElementConfig) => el.id === defEl.id);
          return found ? { ...defEl, ...found } : defEl;
        });
        // Bổ sung thêm các custom element do người dùng tự tạo nếu có
        const customElements = parsed.elements.filter((el: StickerElementConfig) => !defaultTmpl.elements.some((d) => d.id === el.id));
        return {
          canvasSize: size,
          showBorder: parsed.showBorder ?? defaultTmpl.showBorder,
          elements: [...mergedElements, ...customElements],
          updatedAt: parsed.updatedAt,
        };
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc template tem dán:', err);
  }
  return size === '50x40' ? DEFAULT_STICKER_TEMPLATE_50X40 : DEFAULT_STICKER_TEMPLATE_50X30;
}

/**
 * Lưu cấu hình mẫu tem dán vào localStorage và phát event đồng bộ
 */
export function saveStickerTemplate(config: StickerTemplateConfig): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `bakery_print_sticker_template_${config.canvasSize}`;
    const toSave = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(toSave));
    window.dispatchEvent(new CustomEvent(PRINT_TEMPLATE_UPDATED_EVENT, { detail: { type: 'sticker', size: config.canvasSize } }));
  } catch (err) {
    console.error('Lỗi lưu template tem dán:', err);
  }
}

/**
 * Khôi phục mẫu tem dán về mặc định
 */
export function resetStickerTemplate(size: LabelPaperSize): StickerTemplateConfig {
  const defaultTmpl = size === '50x40' ? DEFAULT_STICKER_TEMPLATE_50X40 : DEFAULT_STICKER_TEMPLATE_50X30;
  saveStickerTemplate(defaultTmpl);
  return defaultTmpl;
}

/**
 * Lấy cấu hình mẫu hóa đơn in nhiệt đã lưu
 */
export function getReceiptTemplate(size: ReceiptPaperSize = '80mm'): ReceiptTemplateConfig {
  if (typeof window === 'undefined') {
    return size === '58mm' ? DEFAULT_RECEIPT_TEMPLATE_58MM : DEFAULT_RECEIPT_TEMPLATE_80MM;
  }
  try {
    const key = `bakery_print_receipt_template_${size}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.blocks)) {
        const defaultTmpl = size === '58mm' ? DEFAULT_RECEIPT_TEMPLATE_58MM : DEFAULT_RECEIPT_TEMPLATE_80MM;
        // Sắp xếp các block theo thứ tự order đã lưu
        const blockMap = new Map(parsed.blocks.map((b: ReceiptBlockConfig) => [b.id, b]));
        const mergedBlocks = defaultTmpl.blocks.map((defB) => {
          const found = blockMap.get(defB.id) as ReceiptBlockConfig | undefined;
          if (found) {
            return {
              ...defB,
              ...found,
              options: { ...defB.options, ...found.options },
            };
          }
          return defB;
        });
        mergedBlocks.sort((a, b) => a.order - b.order);
        return {
          paperSize: size,
          blocks: mergedBlocks,
          updatedAt: parsed.updatedAt,
        };
      }
    }
  } catch (err) {
    console.warn('Lỗi đọc template hóa đơn:', err);
  }
  return size === '58mm' ? DEFAULT_RECEIPT_TEMPLATE_58MM : DEFAULT_RECEIPT_TEMPLATE_80MM;
}

/**
 * Lưu cấu hình mẫu hóa đơn vào localStorage và phát event đồng bộ
 */
export function saveReceiptTemplate(config: ReceiptTemplateConfig): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `bakery_print_receipt_template_${config.paperSize}`;
    const toSave = {
      ...config,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(toSave));
    window.dispatchEvent(new CustomEvent(PRINT_TEMPLATE_UPDATED_EVENT, { detail: { type: 'receipt', size: config.paperSize } }));
  } catch (err) {
    console.error('Lỗi lưu template hóa đơn:', err);
  }
}

/**
 * Khôi phục mẫu hóa đơn về mặc định
 */
export function resetReceiptTemplate(size: ReceiptPaperSize): ReceiptTemplateConfig {
  const defaultTmpl = size === '58mm' ? DEFAULT_RECEIPT_TEMPLATE_58MM : DEFAULT_RECEIPT_TEMPLATE_80MM;
  saveReceiptTemplate(defaultTmpl);
  return defaultTmpl;
}
