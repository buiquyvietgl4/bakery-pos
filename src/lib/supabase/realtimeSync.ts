import { supabase } from '@/lib/supabase/client';

export interface SyncOrderPayload {
  order_number: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  updated_at: string;
  order_data?: any;
}

type StatusCallback = (payload: SyncOrderPayload) => void;
type NewOrderCallback = (order: any) => void;
type ClearDemoCallback = () => void;
type DbChangeCallback = () => void;
export type ProductChangePayload = {
  action: 'create' | 'update' | 'delete';
  product: any;
};
type ProductChangeCallback = (payload: ProductChangePayload) => void;
type TelegramConfigCallback = (config: any) => void;

const statusListeners = new Set<StatusCallback>();
const newOrderListeners = new Set<NewOrderCallback>();
const clearDemoListeners = new Set<ClearDemoCallback>();
const dbChangeListeners = new Set<DbChangeCallback>();
const productListeners = new Set<ProductChangeCallback>();
const telegramConfigListeners = new Set<TelegramConfigCallback>();

let syncChannelInstance: any = null;

/**
 * Khởi tạo kênh Realtime singleton duy nhất cho toàn hệ thống.
 * Đính kèm TẤT CẢ các bộ lắng nghe (broadcast & postgres_changes) TRƯỚC KHI gọi subscribe()
 * để ngăn chặn hoàn toàn lỗi: "cannot add postgres_changes callbacks after channel has subscribed"
 */
function ensureSyncChannel() {
  if (syncChannelInstance) return syncChannelInstance;

  try {
    syncChannelInstance = supabase.channel('bakery_cross_device_sync', {
      config: {
        broadcast: {
          self: false,
        },
      },
    });

    syncChannelInstance
      .on('broadcast', { event: 'kds_status_update' }, ({ payload }: any) => {
        statusListeners.forEach((cb) => {
          try {
            cb(payload);
          } catch (e) {
            console.warn('Lỗi statusListener:', e);
          }
        });
      })
      .on('broadcast', { event: 'pos_order_created' }, ({ payload }: any) => {
        newOrderListeners.forEach((cb) => {
          try {
            cb(payload?.order);
          } catch (e) {
            console.warn('Lỗi newOrderListener:', e);
          }
        });
      })
      .on('broadcast', { event: 'kds_clear_demo' }, () => {
        clearDemoListeners.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.warn('Lỗi clearDemoListener:', e);
          }
        });
      })
      .on('broadcast', { event: 'product_changed' }, ({ payload }: any) => {
        productListeners.forEach((cb) => {
          try {
            cb(payload);
          } catch (e) {
            console.warn('Lỗi productListener:', e);
          }
        });
      })
      .on('broadcast', { event: 'telegram_config_updated' }, ({ payload }: any) => {
        if (payload?.config) {
          telegramConfigListeners.forEach((cb) => {
            try {
              cb(payload.config);
            } catch (e) {
              console.warn('Lỗi telegramConfigListener:', e);
            }
          });
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          dbChangeListeners.forEach((cb) => {
            try {
              cb();
            } catch (e) {
              console.warn('Lỗi dbChangeListener:', e);
            }
          });
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('Lỗi khởi tạo Realtime Channel:', err);
  }

  return syncChannelInstance;
}

/**
 * Lấy channel để gửi dữ liệu
 */
export function getSyncChannel() {
  return ensureSyncChannel();
}

/**
 * Phát sóng cập nhật trạng thái đơn (Mới nhận -> Đang làm -> Sẵn sàng -> Hoàn thành)
 * Tới tất cả điện thoại, máy tính bảng và máy tính đang mở ứng dụng trong vòng ~50ms
 */
export async function broadcastOrderStatusUpdate(
  orderNumber: string,
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled',
  orderData?: any
) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'kds_status_update',
        payload: {
          order_number: orderNumber,
          status,
          updated_at: new Date().toISOString(),
          order_data: orderData,
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastOrderStatusUpdate:', err);
  }
}

/**
 * Phát sóng khi POS tạo đơn hàng mới (bán trực tiếp hoặc đặt bánh sinh nhật)
 */
export async function broadcastNewOrder(order: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'pos_order_created',
        payload: {
          order,
          created_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastNewOrder:', err);
  }
}

/**
 * Phát sóng khi người dùng bấm "Xóa Đơn Mẫu" trên bất kỳ thiết bị nào
 */
export async function broadcastClearDemoOrders() {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'kds_clear_demo',
        payload: {
          cleared_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastClearDemoOrders:', err);
  }
}

/**
 * Phát sóng khi có thay đổi sản phẩm (tạo bánh mới, đổi ảnh bánh, xóa bánh)
 * Để tất cả máy tính và điện thoại đồng bộ tức thì menu và ảnh trong ~50ms
 */
export async function broadcastProductChange(payload: ProductChangePayload) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'product_changed',
        payload,
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastProductChange:', err);
  }
}

/**
 * Phát sóng cập nhật cấu hình Telegram tới tất cả thiết bị
 */
export async function broadcastTelegramConfig(config: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'telegram_config_updated',
        payload: {
          config,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastTelegramConfig:', err);
  }
}

/**
 * Đăng ký lắng nghe sự kiện đồng bộ từ các thiết bị khác
 * An toàn tuyệt đối với React StrictMode và Remount
 */
export function subscribeCrossDeviceSync(callbacks: {
  onStatusUpdate?: StatusCallback;
  onNewOrder?: NewOrderCallback;
  onClearDemo?: ClearDemoCallback;
  onDbChange?: DbChangeCallback;
  onProductChange?: ProductChangeCallback;
  onTelegramConfigChange?: TelegramConfigCallback;
}) {
  ensureSyncChannel();

  const { onStatusUpdate, onNewOrder, onClearDemo, onDbChange, onProductChange, onTelegramConfigChange } = callbacks;

  if (onStatusUpdate) statusListeners.add(onStatusUpdate);
  if (onNewOrder) newOrderListeners.add(onNewOrder);
  if (onClearDemo) clearDemoListeners.add(onClearDemo);
  if (onDbChange) dbChangeListeners.add(onDbChange);
  if (onProductChange) productListeners.add(onProductChange);
  if (onTelegramConfigChange) telegramConfigListeners.add(onTelegramConfigChange);

  return () => {
    if (onStatusUpdate) statusListeners.delete(onStatusUpdate);
    if (onNewOrder) newOrderListeners.delete(onNewOrder);
    if (onClearDemo) clearDemoListeners.delete(onClearDemo);
    if (onDbChange) dbChangeListeners.delete(onDbChange);
    if (onProductChange) productListeners.delete(onProductChange);
    if (onTelegramConfigChange) telegramConfigListeners.delete(onTelegramConfigChange);
  };
}

/**
 * Đồng bộ trạng thái đơn xuống cơ sở dữ liệu Supabase (PostgreSQL)
 * Nếu đơn chưa có trên Supabase (như đơn demo hoặc đơn offline), tự động INSERT lên Supabase
 */
export async function syncOrderToSupabase(
  order: any,
  nextStatus: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const orderNum = order.order_number || order.orderNumber;
  if (!orderNum) return;

  try {
    // 1. Thử cập nhật trạng thái nếu đơn đã tồn tại trong Supabase
    const { data: updatedRows, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('order_number', orderNum)
      .select('id');

    // 2. Nếu đơn chưa có trong Supabase (0 dòng cập nhật), tiến hành INSERT đơn lên Supabase
    if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
      const orderPayload: any = {
        order_number: orderNum,
        order_type: order.order_type || (order.preorder_pickup_at ? 'preorder' : 'takeaway'),
        status: nextStatus,
        notes: order.notes || '',
        subtotal: order.total_amount || order.totalPrice || 0,
        total_amount: order.total_amount || order.totalPrice || 0,
      };

      if (order.preorder_pickup_at) {
        orderPayload.preorder_pickup_at = order.preorder_pickup_at.includes('T')
          ? order.preorder_pickup_at
          : new Date().toISOString();
      }
      if (order.customer_name) orderPayload.customer_name = order.customer_name;
      if (order.customer_phone) orderPayload.customer_phone = order.customer_phone;
      if (order.cake_message) orderPayload.cake_message = order.cake_message;

      const { data: insertedOrder, error: insertErr } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single();

      if (!insertErr && insertedOrder && Array.isArray(order.items) && order.items.length > 0) {
        const itemsToInsert = order.items.map((it: any) => ({
          order_id: insertedOrder.id,
          product_name_snapshot: it.product_name_snapshot || it.name || 'Bánh',
          quantity: it.quantity || 1,
          unit_price: it.unit_price || 0,
          notes: it.notes || '',
        }));

        await supabase.from('order_items').insert(itemsToInsert);
      }
    }
  } catch (err) {
    console.warn('Lỗi syncOrderToSupabase:', err);
  }
}

/**
 * Trích xuất thông tin đặt bánh từ trường ghi chú (notes)
 * Làm chốt an toàn khi dữ liệu đồng bộ qua các hệ thống hoặc thiết bị khác nhau
 */
export function parsePreorderFromNotes(notes?: string) {
  if (!notes || typeof notes !== 'string') {
    return {
      delivery_method: undefined,
      shipping_address: undefined,
      deposit_amount: undefined,
      remaining_amount: undefined,
    };
  }

  const isShip =
    notes.includes('Hình thức: Giao tận nơi') ||
    notes.includes('Ship bánh') ||
    notes.includes('Đ/C:') ||
    notes.toLowerCase().includes('giao tận nơi') ||
    notes.toLowerCase().includes('ship');

  let shippingAddress: string | undefined = undefined;
  const addrMatch = notes.match(/Đ\/C:\s*([^|]+)/i);
  if (addrMatch && addrMatch[1]) {
    shippingAddress = addrMatch[1].trim();
  }

  let remainingAmount: number | undefined = undefined;
  const remMatch = notes.match(/CÒN (?:LẠI PHẢI|THU KHI GIAO|CẦN THU|LẠI CẦN THU):\s*([\d\.\,]+)/i);
  if (remMatch && remMatch[1]) {
    const cleanNum = parseInt(remMatch[1].replace(/\D/g, ''), 10);
    if (!isNaN(cleanNum)) remainingAmount = cleanNum;
  }

  let depositAmount: number | undefined = undefined;
  const depMatch = notes.match(/Đã cọc:\s*([\d\.\,]+)/i);
  if (depMatch && depMatch[1]) {
    const cleanNum = parseInt(depMatch[1].replace(/\D/g, ''), 10);
    if (!isNaN(cleanNum)) depositAmount = cleanNum;
  }

  let referenceImageUrl: string | undefined = undefined;
  const imgMatch = notes.match(/\[MẪU_ẢNH:([^\]]+)\]/);
  if (imgMatch && imgMatch[1]) {
    referenceImageUrl = imgMatch[1].trim();
  }

  let cakeName: string | undefined = undefined;
  let cakeSize: string | undefined = undefined;
  const cakeMatch = notes.match(/Bánh:\s*([^\(\|]+)(?:\(([^)]+)\))?/i);
  if (cakeMatch) {
    if (cakeMatch[1]) cakeName = cakeMatch[1].trim();
    if (cakeMatch[2]) cakeSize = cakeMatch[2].trim();
  }

  let customerName: string | undefined = undefined;
  let customerPhone: string | undefined = undefined;
  const custMatch = notes.match(/Khách:\s*([^\(\|]+)(?:\(([^)]+)\))?/i);
  if (custMatch) {
    if (custMatch[1]) customerName = custMatch[1].trim();
    if (custMatch[2]) customerPhone = custMatch[2].trim();
  }

  let pickupTime: string | undefined = undefined;
  const pickupMatch = notes.match(/Hẹn:\s*([^|]+)/i);
  if (pickupMatch && pickupMatch[1]) {
    pickupTime = pickupMatch[1].trim();
  }

  let cakeMessage: string | undefined = undefined;
  const msgMatch = notes.match(/Chữ:\s*\"?([^\"]+)\"?/i);
  if (msgMatch && msgMatch[1]) {
    cakeMessage = msgMatch[1].trim();
  }

  return {
    delivery_method: isShip ? ('shipping' as const) : undefined,
    shipping_address: shippingAddress,
    deposit_amount: depositAmount,
    remaining_amount: remainingAmount,
    reference_image_url: referenceImageUrl,
    cake_name: cakeName,
    cake_size: cakeSize,
    customer_name: customerName,
    customer_phone: customerPhone,
    preorder_pickup_at: pickupTime,
    cake_message: cakeMessage,
  };
}

/**
 * Làm sạch chuỗi ghi chú hiển thị ra giao diện (loại bỏ tag hình ảnh Base64 nếu có)
 */
export function cleanDisplayNotes(notes?: string): string {
  if (!notes || typeof notes !== 'string') return '';
  return notes.replace(/\[MẪU_ẢNH:[^\]]+\]/g, '').trim();
}

/**
 * Định dạng ngày giờ hẹn giao / nhận bánh thân thiện cho thợ làm bánh và nhân viên
 * Ví dụ: '2026-09-09T17:30:00+00:00' -> '17:30 ngày 09/09/2026'
 */
export function formatPickupDateTime(dt?: string): string {
  if (!dt || typeof dt !== 'string') return '';

  // Nếu đã ở dạng chuỗi đẹp như "17:30 ngày mai (08/09)" thì giữ nguyên
  if (!dt.includes('T') && !dt.includes('Z')) {
    return dt;
  }

  try {
    const d = new Date(dt);
    if (!isNaN(d.getTime())) {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${hours}:${minutes} ngày ${day}/${month}/${year}`;
    }
  } catch {}

  return dt;
}
