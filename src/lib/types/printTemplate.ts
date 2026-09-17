export type LabelPaperSize = '50x30' | '50x40';
export type ReceiptPaperSize = '80mm' | '58mm';

// ==========================================
// ĐỊNH NGHĨA PHẦN TỬ CHO TEM DÁN (STICKER)
// ==========================================
export type StickerFieldId =
  | 'store_name'         // Tên tiệm bánh
  | 'store_hotline'      // Hotline tiệm
  | 'store_address'      // Địa chỉ quán / tiệm bánh
  | 'order_code'         // Mã đơn hàng (VD: #BK-123)
  | 'cake_name'          // Tên món bánh
  | 'cake_message'       // Lời nhắn viết lên bánh
  | 'customer_info'      // Tên & SĐT khách hàng
  | 'pickup_time'        // Giờ hẹn lấy/giao bánh
  | 'delivery_method'    // Nhận tại tiệm hay Giao tận nơi
  | 'shipping_address'   // Địa chỉ giao ship
  | 'filling_flavor'     // Vị / Nhân bánh
  | 'price_and_cod'      // Giá bánh & Tiền còn thu COD
  | 'barcode'            // Mã vạch Barcode
  | 'dates'              // Ngày đặt / NSX - HSD
  | 'custom_note';       // Khung chữ ghi chú tùy ý

export interface StickerElementConfig {
  id: StickerFieldId | string;
  label: string;
  visible: boolean;
  x: number;            // Tọa độ X tính theo % chiều rộng (0 - 100)
  y: number;            // Tọa độ Y tính theo % chiều cao (0 - 100)
  width?: number;       // Chiều rộng tối đa tính theo % (mặc định 100 hoặc theo khung)
  fontSize: number;     // Kích thước font (pt hoặc px)
  fontWeight: 'normal' | 'bold' | 'black';
  fontStyle?: 'normal' | 'italic';
  align: 'left' | 'center' | 'right';
  customText?: string;  // Dành cho khung chữ ghi chú tùy chọn do người dùng nhập
}

export interface StickerTemplateConfig {
  canvasSize: LabelPaperSize;
  elements: StickerElementConfig[];
  showBorder?: boolean;
  updatedAt?: string;
}

// ==========================================
// ĐỊNH NGHĨA KHỐI CHO HÓA ĐƠN IN NHIỆT (BILL)
// ==========================================
export type ReceiptBlockId =
  | 'header_store'       // Logo, Tên tiệm, Hotline, Địa chỉ, Slogan
  | 'order_meta'         // Tiêu đề bill, Mã hóa đơn, Ngày tạo, Thu ngân
  | 'customer_info'      // Tên khách hàng, SĐT, Giờ hẹn giao, Địa chỉ ship
  | 'items_table'        // Bảng danh sách món bánh (Tên, SL, Giá, Tiền, Lời nhắn)
  | 'pricing_summary'    // Tiền bánh, Giảm giá, Phí ship, Tổng cộng giá cuối, Tiền cọc, Còn lại COD
  | 'payment_details'    // Hình thức thanh toán, Tiền khách đưa, Tiền thừa trả khách
  | 'vietqr_cod'         // Mã VietQR quét thu tiền nợ COD khi giao bánh
  | 'footer_greeting';   // Lời cảm ơn & Chân trang

export interface ReceiptBlockConfig {
  id: ReceiptBlockId;
  label: string;
  visible: boolean;
  order: number;         // Thứ tự hiển thị từ trên xuống dưới (1, 2, 3...)
  align?: 'left' | 'center' | 'right';
  options?: {
    showLogo?: boolean;
    showSlogan?: boolean;
    showHotline?: boolean;
    showAddress?: boolean;
    showCashier?: boolean;
    showCakeMessage?: boolean;
    showDiscount?: boolean;
    showShippingFee?: boolean;
    showChangeAmount?: boolean;
    showVietQrCod?: boolean;
    showFooterMessage?: boolean;
    [key: string]: boolean | undefined;
  };
}

export interface ReceiptTemplateConfig {
  paperSize: ReceiptPaperSize;
  blocks: ReceiptBlockConfig[];
  updatedAt?: string;
}
