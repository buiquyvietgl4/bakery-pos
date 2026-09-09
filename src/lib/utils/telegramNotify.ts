// src/lib/utils/telegramNotify.ts
import { supabase } from '@/lib/supabase/client';
import {
  broadcastTelegramConfig,
  subscribeCrossDeviceSync,
  parsePreorderFromNotes,
  formatPickupDateTime,
} from '@/lib/supabase/realtimeSync';
import { addNotificationLog } from './notificationHistory';

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  updated_at?: string;
  updated_by?: string;
}

const STORAGE_KEY = 'bakery_telegram_config';
const DB_ROW_ID = '00000000-0000-0000-0000-000000000001';
const DB_ROW_NAME = 'SYS_CONFIG_TELEGRAM';

// KHÔNG KHÓA CỨNG: Mặc định hoàn toàn trống, toàn bộ được nạp & đồng bộ từ cơ sở dữ liệu Supabase SQL
const DEFAULT_CONFIG: TelegramConfig = {
  enabled: false,
  botToken: '',
  chatId: '',
};

let inMemoryConfig: TelegramConfig | null = null;
let isInitStarted = false;

/**
 * Cập nhật cấu hình cục bộ trong bộ nhớ và LocalStorage
 */
export function updateLocalTelegramConfig(config: TelegramConfig) {
  inMemoryConfig = config;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }
}

/**
 * Lấy cấu hình Telegram hiện tại từ bộ nhớ hoặc LocalStorage
 */
/**
 * Lấy cấu hình Telegram hiện tại từ bộ nhớ hoặc LocalStorage
 */
export function getTelegramConfig(): TelegramConfig {
  if (inMemoryConfig && inMemoryConfig.enabled && inMemoryConfig.botToken) {
    return inMemoryConfig;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.botToken) {
          inMemoryConfig = parsed;
          return parsed;
        }
      }
    } catch {}
  }
  return inMemoryConfig || DEFAULT_CONFIG;
}

/**
 * Đảm bảo luôn lấy cấu hình mới nhất từ bộ nhớ, LocalStorage hoặc Supabase DB
 */
export async function getOrFetchTelegramConfig(): Promise<TelegramConfig> {
  const current = getTelegramConfig();
  if (current && current.enabled && current.botToken && current.chatId) {
    return current;
  }
  return await fetchTelegramConfigFromDb();
}

/**
 * Đọc cấu hình Telegram mới nhất từ cơ sở dữ liệu Supabase SQL
 * Tự động cập nhật cache cục bộ khi tải xong
 */
export async function fetchTelegramConfigFromDb(): Promise<TelegramConfig> {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .eq('name', DB_ROW_NAME)
      .maybeSingle();

    if (!error && data && data.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed === 'object') {
          const loadedConfig: TelegramConfig = {
            enabled: !!parsed.enabled,
            botToken: (parsed.botToken || '').trim(),
            chatId: (parsed.chatId || '').trim(),
            updated_at: parsed.updated_at,
            updated_by: parsed.updated_by,
          };
          updateLocalTelegramConfig(loadedConfig);
          return loadedConfig;
        }
      } catch (e) {
        console.warn('Lỗi phân tích cú pháp JSON cấu hình Telegram từ SQL:', e);
      }
    }
  } catch (err) {
    console.warn('Lỗi kết nối fetchTelegramConfigFromDb:', err);
  }

  return getTelegramConfig();
}

/**
 * Lưu cấu hình lên SQL:
 * 1. Tự động xóa mã cấu hình cũ trên SQL.
 * 2. Chèn bản ghi mã mới vào Supabase SQL.
 * 3. Lưu LocalStorage & Bộ nhớ.
 * 4. Phát sóng Realtime để tất cả thiết bị khác cập nhật tức thì trong ~50ms.
 */
export async function saveTelegramConfigToDb(
  config: TelegramConfig,
  updatedBy: string = 'admin'
): Promise<{ success: boolean; error?: string }> {
  try {
    const fullConfig: TelegramConfig = {
      enabled: config.enabled,
      botToken: (config.botToken || '').trim(),
      chatId: (config.chatId || '').trim(),
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    // 1. Cập nhật bộ nhớ cục bộ ngay lập tức
    updateLocalTelegramConfig(fullConfig);

    // 2. Xóa bản ghi cũ trên SQL để xóa sạch mã token cũ
    await supabase.from('recipes').delete().eq('name', DB_ROW_NAME);

    // 3. Chèn bản ghi cấu hình mới vào SQL
    const { error: insertErr } = await supabase.from('recipes').insert({
      id: DB_ROW_ID,
      name: DB_ROW_NAME,
      notes: JSON.stringify(fullConfig),
      is_active: false,
    });

    if (insertErr) {
      console.error('Lỗi khi lưu cấu hình Telegram vào Supabase SQL:', insertErr);
      return { success: false, error: 'Lỗi lưu vào CSDL: ' + insertErr.message };
    }

    // 4. Phát sóng Realtime cho toàn bộ các thiết bị (POS, KDS, ĐT, Laptop) đang mở
    await broadcastTelegramConfig(fullConfig);

    return { success: true };
  } catch (err: any) {
    console.error('Lỗi ngoại lệ saveTelegramConfigToDb:', err);
    return { success: false, error: err?.message || 'Lỗi không xác định khi lưu cấu hình' };
  }
}

/**
 * Xóa hoàn toàn cấu hình Bot Telegram trên SQL và đồng bộ xóa trên mọi thiết bị
 */
export async function deleteTelegramConfigFromDb(
  updatedBy: string = 'admin'
): Promise<{ success: boolean; error?: string }> {
  try {
    await supabase.from('recipes').delete().eq('name', DB_ROW_NAME);
    const emptyConfig: TelegramConfig = {
      enabled: false,
      botToken: '',
      chatId: '',
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };
    updateLocalTelegramConfig(emptyConfig);
    await broadcastTelegramConfig(emptyConfig);
    return { success: true };
  } catch (err: any) {
    console.error('Lỗi khi xóa cấu hình Telegram trên SQL:', err);
    return { success: false, error: err?.message || 'Lỗi xóa cấu hình' };
  }
}

/**
 * Tương thích ngược với các lời gọi cũ
 */
export function saveTelegramConfig(config: TelegramConfig) {
  saveTelegramConfigToDb(config);
}

/**
 * Gửi tin nhắn Telegram với xử lý lỗi chi tiết
 */
export async function sendTelegramMessage(
  text: string,
  configOverride?: TelegramConfig
): Promise<{ success: boolean; error?: string }> {
  const config = configOverride || await getOrFetchTelegramConfig();
  if (!config.enabled && !configOverride) {
    console.warn('[Telegram] Tính năng chưa bật');
    return { success: false, error: 'Chưa bật tính năng gửi qua Telegram' };
  }
  if (!config.botToken || !config.chatId) {
    console.warn('[Telegram] Thiếu Bot Token hoặc Chat ID');
    return { success: false, error: 'Thiếu Bot Token hoặc Chat ID' };
  }

  try {
    const url = `https://api.telegram.org/bot${config.botToken.trim()}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId.trim(),
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      console.log('[Telegram] Gửi thành công:', text.slice(0, 40));
      if (text.includes('KIỂM TRA KẾT NỐI')) {
        try {
          addNotificationLog({
            type: 'test',
            title: '✈️ [Telegram] Kiểm Tra Kết Nối Bot',
            message: 'Điện thoại đã kết nối nhận thông báo đơn hàng & lò nướng qua Telegram thành công!',
            channel: 'telegram',
            sender: 'Telegram Bot',
          });
        } catch {}
      }
      return { success: true };
    } else {
      console.warn('[Telegram] API Lỗi:', data);
      return { success: false, error: data.description || 'Lỗi gửi tin nhắn Telegram' };
    }
  } catch (err: any) {
    console.warn('Lỗi kết nối Telegram:', err);
    return { success: false, error: err.message || 'Không thể kết nối máy chủ Telegram' };
  }
}

/**
 * Báo đơn mới tới Telegram
 */
export async function sendTelegramOrderAlert(order: any): Promise<{ success: boolean; error?: string }> {
  const config = await getOrFetchTelegramConfig();
  if (!config.enabled || !config.botToken || !config.chatId) {
    return { success: false, error: 'Chưa cấu hình Telegram' };
  }

  const orderNum = order.order_number || order.orderNumber || 'DH-NEW';
  const custName = order.customer_name || order.customerName || 'Khách đặt qua POS';
  const custPhone = order.customer_phone || order.customerPhone || '';
  const isCake = order.order_type === 'preorder' || orderNum.startsWith('BK-PRE') || !!order.preorder_pickup_at;
  
  const pickup = order.preorder_pickup_at || order.pickupDateTime || '';
  const cakeName = order.cake_name || order.cakeName || (order.items?.[0]?.product_name_snapshot) || 'Bánh tươi';
  const cakeSize = order.cake_size || order.cakeSize || '';
  const cakeMsg = order.cake_message || order.cakeMessage || '';
  const total = (order.total_amount || order.totalPrice || 0).toLocaleString('vi-VN');
  const deposit = (order.deposit_amount || order.depositAmount || 0).toLocaleString('vi-VN');
  const method = order.payment_method || order.paymentMethod || 'cash';
  const methodText = method === 'cash' ? '💵 Tiền mặt' : method === 'transfer' ? '🏦 Chuyển khoản' : '📱 Ví MoMo';

  const fromNotes = parsePreorderFromNotes(order.notes);
  const isShip =
    order.delivery_method === 'shipping' ||
    fromNotes.delivery_method === 'shipping' ||
    (order.notes && (order.notes.includes('Giao tận nơi') || order.notes.includes('Ship bánh') || order.notes.includes('Đ/C:')));
  const shipAddr = order.shipping_address || order.shippingAddress || fromNotes.shipping_address || '';
  const remCod = (
    order.remaining_amount !== undefined
      ? order.remaining_amount
      : fromNotes.remaining_amount !== undefined
      ? fromNotes.remaining_amount
      : 0
  ).toLocaleString('vi-VN');

  let text = '';
  if (isCake) {
    text = `🎂 <b>TIỆM BÁNH CÓ ĐƠN ${isShip ? 'SHIP BÁNH TẬN NƠI' : 'ĐẶT TRƯỚC'} #${orderNum}</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Khách hàng:</b> ${custName} ${custPhone ? '(' + custPhone + ')' : ''}\n` +
      `🚚 <b>Hình thức:</b> ${isShip ? 'Giao hàng tận nơi' : 'Khách đến tiệm lấy'}\n` +
      (isShip && shipAddr ? `📍 <b>Địa chỉ:</b> ${shipAddr}\n` : '') +
      `⏰ <b>Hẹn ${isShip ? 'giao' : 'lấy'}:</b> ${formatPickupDateTime(pickup) || pickup || 'Trong ngày'}\n` +
      `🎂 <b>Loại bánh:</b> ${cakeName}${cakeSize ? ' (' + cakeSize + ')' : ''}\n` +
      (cakeMsg ? `✍️ <b>Ghi chữ:</b> <i>"${cakeMsg}"</i>\n` : '') +
      `💰 <b>Tổng đơn:</b> ${total}₫ (Đã cọc: ${deposit}₫)\n` +
      (remCod !== '0' ? `💵 <b>Cần thu khi ${isShip ? 'giao (COD)' : 'lấy'}:</b> <b>${remCod}₫</b>\n` : '') +
      `💳 <b>Thanh toán cọc:</b> ${methodText}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `⚡ <i>Thông báo tự động: Vui lòng vào bếp chuẩn bị bánh đúng hẹn!</i>`;
  } else {
    text = `🛒 <b>ĐƠN BÁN TẠI QUẦY MỚI #${orderNum}</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `👤 <b>Thu ngân:</b> ${order.cashier || 'Quầy POS'}\n` +
      `📦 <b>Số món:</b> ${order.items?.length || 1} món bánh\n` +
      `💰 <b>Tổng tiền:</b> ${total}₫\n` +
      `💳 <b>Hình thức:</b> ${methodText}\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ <i>Đã lưu hóa đơn thành công!</i>`;
  }

  return await sendTelegramMessage(text);
}

/**
 * Cảnh báo đơn gấp sát giờ giao tới Telegram
 */
export async function sendTelegramUrgentAlert(order: any, minutesLeft: number): Promise<void> {
  const config = getTelegramConfig();
  if (!config.enabled || !config.botToken || !config.chatId) return;

  const orderNum = order.order_number || order.orderNumber || 'DH-URG';
  const custName = order.customer_name || order.customerName || 'Khách đặt trước';
  const custPhone = order.customer_phone || order.customerPhone || '';
  const pickup = order.preorder_pickup_at || order.pickupDateTime || '';
  const cakeName = order.cake_name || order.cakeName || 'Bánh kem';
  const cakeMsg = order.cake_message || order.cakeMessage || '';

  const timeWarning = minutesLeft < 0 
    ? `🚨 <b>ĐÃ QUÁ HẠN HẸN GIAO ${Math.abs(minutesLeft)} PHÚT!</b>`
    : `⚠️ <b>CHỈ CÒN ${minutesLeft} PHÚT NỮA ĐẾN GIỜ GIAO!</b>`;

  const text = `🚨 <b>CẢNH BÁO BẾP: ĐƠN CẦN GIAO GẤP!</b>\n` +
    `📋 <b>Mã đơn:</b> #${orderNum}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${timeWarning}\n` +
    `⏰ <b>Giờ hẹn giao:</b> ${pickup}\n` +
    `👤 <b>Khách hàng:</b> ${custName} ${custPhone ? '(' + custPhone + ')' : ''}\n` +
    `🎂 <b>Bánh cần làm:</b> ${cakeName}\n` +
    (cakeMsg ? `✍️ <b>Ghi chữ:</b> <i>"${cakeMsg}"</i>\n` : '') +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔥 <i>Thợ bánh ưu tiên hoàn thiện và đóng hộp giao khách ngay!</i>`;

  await sendTelegramMessage(text);
}

/**
 * Thông báo khi Bếp hoàn thành Bước 2 (Bánh chín/trang trí xong -> Sang chế độ Chờ Ship / Sẵn sàng)
 */
export async function sendTelegramReadyForShipAlert(order: any): Promise<void> {
  const config = getTelegramConfig();
  if (!config.enabled || !config.botToken || !config.chatId) return;

  const orderNum = order.order_number || order.orderNumber || 'DH-READY';
  const fromNotes = parsePreorderFromNotes(order.notes);

  const isShip =
    order.delivery_method === 'shipping' ||
    fromNotes.delivery_method === 'shipping' ||
    (order.notes && (order.notes.includes('Giao tận nơi') || order.notes.includes('Ship bánh') || order.notes.includes('Đ/C:')));
  const custName = order.customer_name || order.customerName || fromNotes.customer_name || 'Khách đặt bánh';
  const custPhone = order.customer_phone || order.customerPhone || fromNotes.customer_phone || '';
  const shipAddr = order.shipping_address || order.shippingAddress || fromNotes.shipping_address || '';
  const pickup = formatPickupDateTime(order.preorder_pickup_at || order.pickupDateTime || fromNotes.preorder_pickup_at) || 'Trong ngày';
  const cakeName = order.cake_name || order.cakeName || fromNotes.cake_name || order.items?.[0]?.product_name_snapshot || 'Bánh tươi';
  const cakeSize = order.cake_size || order.cakeSize || fromNotes.cake_size || '';
  const cakeMsg = order.cake_message || order.cakeMessage || fromNotes.cake_message || '';
  const total = (order.total_amount || order.totalPrice || 0).toLocaleString('vi-VN');
  const remainingCOD = (
    order.remaining_amount !== undefined
      ? order.remaining_amount
      : fromNotes.remaining_amount !== undefined
      ? fromNotes.remaining_amount
      : 0
  ).toLocaleString('vi-VN');

  let text = '';
  if (isShip) {
    text = `🛵 <b>BÁNH ĐÃ LÀM XONG — CHỜ GIAO HÀNG (CHỜ SHIP)!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>Mã đơn:</b> #${orderNum}\n` +
      `👤 <b>Khách hàng:</b> ${custName} ${custPhone ? '(' + custPhone + ')' : ''}\n` +
      `📍 <b>Địa chỉ nhận:</b> ${shipAddr || 'Xem chi tiết đơn hàng'}\n` +
      `⏰ <b>Giờ hẹn giao:</b> ${pickup}\n` +
      `🎂 <b>Loại bánh:</b> ${cakeName}${cakeSize ? ' (' + cakeSize + ')' : ''}\n` +
      (cakeMsg ? `✍️ <b>Ghi chữ:</b> <i>"${cakeMsg}"</i>\n` : '') +
      `💰 <b>Thu khi giao (COD):</b> <b>${remainingCOD}₫</b> (Tổng: ${total}₫)\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📦 <i>Bếp đã đóng hộp hoàn tất! Shipper hoặc nhân viên giao hàng lấy bánh đi giao ngay nhé!</i>`;
  } else {
    text = `🎂 <b>BÁNH ĐÃ LÀM XONG — SẴN SÀNG CHỜ KHÁCH LẤY!</b>\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `📋 <b>Mã đơn:</b> #${orderNum}\n` +
      `👤 <b>Khách hàng:</b> ${custName} ${custPhone ? '(' + custPhone + ')' : ''}\n` +
      `⏰ <b>Giờ hẹn lấy:</b> ${pickup}\n` +
      `🎂 <b>Loại bánh:</b> ${cakeName}${cakeSize ? ' (' + cakeSize + ')' : ''}\n` +
      (cakeMsg ? `✍️ <b>Ghi chữ:</b> <i>"${cakeMsg}"</i>\n` : '') +
      `💰 <b>Còn lại phải thu:</b> <b>${remainingCOD}₫</b> (Tổng: ${total}₫)\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ <i>Bánh đã đặt tại quầy thu ngân sẵn sàng bàn giao cho khách!</i>`;
  }

  await sendTelegramMessage(text);
}

/**
 * Thông báo khi Ship xong nhấn Hoàn Thành (Giao hàng thành công)
 */
export async function sendTelegramDeliveredSuccessAlert(order: any): Promise<void> {
  const config = getTelegramConfig();
  if (!config.enabled || !config.botToken || !config.chatId) return;

  const orderNum = order.order_number || order.orderNumber || 'DH-COMPLETED';
  const fromNotes = parsePreorderFromNotes(order.notes);

  const isShip =
    order.delivery_method === 'shipping' ||
    fromNotes.delivery_method === 'shipping' ||
    (order.notes && (order.notes.includes('Giao tận nơi') || order.notes.includes('Ship bánh') || order.notes.includes('Đ/C:')));
  const custName = order.customer_name || order.customerName || fromNotes.customer_name || 'Khách hàng';
  const custPhone = order.customer_phone || order.customerPhone || fromNotes.customer_phone || '';
  const shipAddr = order.shipping_address || order.shippingAddress || fromNotes.shipping_address || '';
  const cakeName = order.cake_name || order.cakeName || fromNotes.cake_name || order.items?.[0]?.product_name_snapshot || 'Bánh tươi';
  const total = (order.total_amount || order.totalPrice || 0).toLocaleString('vi-VN');

  const text = `🎉 <b>GIAO HÀNG THÀNH CÔNG! #${orderNum}</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `👤 <b>Khách hàng:</b> ${custName} ${custPhone ? '(' + custPhone + ')' : ''}\n` +
    `🚚 <b>Hình thức:</b> ${isShip ? 'Giao tận nơi (Shipper)' : 'Khách nhận tại quầy tiệm'}\n` +
    (isShip && shipAddr ? `📍 <b>Địa chỉ:</b> ${shipAddr}\n` : '') +
    `🎂 <b>Món bánh:</b> ${cakeName}\n` +
    `💰 <b>Đã thanh toán đủ:</b> ${total}₫\n` +
    `⏰ <b>Thời gian:</b> ${new Date().toLocaleTimeString('vi-VN')} ngày ${new Date().toLocaleDateString('vi-VN')}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `⭐ <i>Đơn hàng đã hoàn tất trọn vẹn và đóng hồ sơ thành công!</i>`;

  await sendTelegramMessage(text);
}

/**
 * Gửi thông báo Telegram khi lò nướng bánh hoàn thành (bánh chín / sẵn sàng ra lò)
 */
export async function sendTelegramBakeDoneAlert(batch: {
  cake_name: string;
  quantity: number;
  unit?: string;
  bake_temp?: number;
  duration_minutes?: number;
}): Promise<{ success: boolean; error?: string }> {
  const text = `🔔 <b>LÒ NƯỚNG: BÁNH ĐÃ NƯỚNG XONG (SẴN SÀNG RA LÒ)!</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🥖 <b>Mẻ bánh:</b> ${batch.cake_name}\n` +
    `🔢 <b>Số lượng:</b> ${batch.quantity} ${batch.unit || 'cái'}\n` +
    (batch.bake_temp ? `🌡️ <b>Nhiệt độ nướng:</b> ${batch.bake_temp}°C\n` : '') +
    (batch.duration_minutes ? `⏱️ <b>Thời gian nướng:</b> ${batch.duration_minutes} phút\n` : '') +
    `⏰ <b>Thời điểm nướng xong:</b> ${new Date().toLocaleTimeString('vi-VN')} ngày ${new Date().toLocaleDateString('vi-VN')}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✨ <i>Bánh đã chín vàng giòn thơm nức! Vui lòng thợ bánh bấm 'Ra Lò' để xuất kho quầy bán ngay!</i>`;

  return await sendTelegramMessage(text);
}

/**
 * Gửi thông báo Telegram khi bắt đầu cho mẻ bánh vào lò nướng
 */
export async function sendTelegramStartBakeAlert(batch: {
  cake_name: string;
  quantity: number;
  unit?: string;
  bake_temp?: number;
  duration_minutes?: number;
}): Promise<{ success: boolean; error?: string }> {
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + (batch.duration_minutes || 20) * 60 * 1000);

  const text = `🔥 <b>LÒ NƯỚNG: BẮT ĐẦU NƯỚNG BÁNH!</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🥖 <b>Món bánh:</b> ${batch.cake_name}\n` +
    `🔢 <b>Số lượng nướng:</b> ${batch.quantity} ${batch.unit || 'cái'}\n` +
    (batch.bake_temp ? `🌡️ <b>Nhiệt độ lò:</b> ${batch.bake_temp}°C\n` : '') +
    (batch.duration_minutes ? `⏱️ <b>Thời gian nướng:</b> ${batch.duration_minutes} phút\n` : '') +
    `⏰ <b>Bắt đầu lúc:</b> ${startTime.toLocaleTimeString('vi-VN')} ngày ${startTime.toLocaleDateString('vi-VN')}\n` +
    `⏳ <b>Dự kiến chín:</b> ${endTime.toLocaleTimeString('vi-VN')}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔔 <i>Lò nướng đang chạy, hệ thống sẽ tự động gửi chuông & tin nhắn khi bánh chín!</i>`;

  return await sendTelegramMessage(text);
}

/**
 * Gửi thông báo Telegram khi bấm nút ra lò và nhập kho thành phẩm POS
 */
export async function sendTelegramDischargedAlert(batch: {
  cake_name: string;
  quantity: number;
  unit?: string;
}): Promise<{ success: boolean; error?: string }> {
  const text = `🥖 <b>BÁNH RA LÒ: ĐÃ NHẬP KHO QUẦY BÁN (POS)!</b>\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🥐 <b>Món bánh:</b> ${batch.cake_name}\n` +
    `🔢 <b>Số lượng ra lò:</b> +${batch.quantity} ${batch.unit || 'cái'}\n` +
    `📦 <b>Cập nhật kho:</b> Đã cộng dồn trực tiếp vào số lượng tồn kho hiển thị tại quầy POS!\n` +
    `⏰ <b>Thời điểm ra lò:</b> ${new Date().toLocaleTimeString('vi-VN')} ngày ${new Date().toLocaleDateString('vi-VN')}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `✨ <i>Bánh tươi mới nóng hổi đã sẵn sàng để quầy thu ngân phục vụ khách!</i>`;

  return await sendTelegramMessage(text);
}


/**
 * Tự động đăng ký lắng nghe cập nhật Realtime đa thiết bị và nạp từ SQL khi chạy trên Client
 */
if (typeof window !== 'undefined' && !isInitStarted) {
  isInitStarted = true;

  // 1. Tải ngay từ SQL khi khởi động
  fetchTelegramConfigFromDb().catch(() => {});

  // 2. Lắng nghe phát sóng từ các thiết bị khác khi Admin cập nhật mã mới
  try {
    subscribeCrossDeviceSync({
      onTelegramConfigChange: (newConfig: any) => {
        if (newConfig && typeof newConfig === 'object') {
          updateLocalTelegramConfig({
            enabled: !!newConfig.enabled,
            botToken: newConfig.botToken || '',
            chatId: newConfig.chatId || '',
            updated_at: newConfig.updated_at,
            updated_by: newConfig.updated_by,
          });
        }
      },
    });
  } catch (err) {
    console.warn('Lỗi đăng ký lắng nghe Telegram sync:', err);
  }
}
