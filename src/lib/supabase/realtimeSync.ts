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
type StoreBrandingCallback = (branding: any) => void;

const statusListeners = new Set<StatusCallback>();
const newOrderListeners = new Set<NewOrderCallback>();
const clearDemoListeners = new Set<ClearDemoCallback>();
const dbChangeListeners = new Set<DbChangeCallback>();
const productListeners = new Set<ProductChangeCallback>();
const telegramConfigListeners = new Set<TelegramConfigCallback>();
const storeBrandingListeners = new Set<StoreBrandingCallback>();

const recentlyNotifiedOrders = new Map<string, number>();

function notifyNewOrderToListeners(order: any) {
  if (!order) return;
  const orderNum = order.order_number || order.orderNumber;
  if (orderNum) {
    const last = recentlyNotifiedOrders.get(orderNum) || 0;
    // Chống kêu chuông lặp 2 lần nếu cả Broadcast và Database Changes cùng báo về trong 4 giây
    if (Date.now() - last < 4000) return;
    recentlyNotifiedOrders.set(orderNum, Date.now());
  }

  newOrderListeners.forEach((cb) => {
    try {
      cb(order);
    } catch (e) {
      console.warn('Lỗi newOrderListener:', e);
    }
  });
}

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
        if (payload?.order) {
          notifyNewOrderToListeners(payload.order);
        }
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
      .on('broadcast', { event: 'store_branding_updated' }, ({ payload }: any) => {
        if (payload?.branding) {
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('bakery_store_branding', JSON.stringify(payload.branding));
              window.dispatchEvent(new CustomEvent('bakery_branding_updated', { detail: payload.branding }));
            } catch {}
          }
          storeBrandingListeners.forEach((cb) => {
            try {
              cb(payload.branding);
            } catch (e) {
              console.warn('Lỗi storeBrandingListener:', e);
            }
          });
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload: any) => {
          // 1. Kích hoạt toàn bộ bộ lắng nghe CSDL (Kitchen loadOrders, POS reloadOrdersData)
          dbChangeListeners.forEach((cb) => {
            try {
              cb();
            } catch (e) {
              console.warn('Lỗi dbChangeListener:', e);
            }
          });

          // 2. Nếu có đơn hàng mới vừa được INSERT lên CSDL Supabase
          if (payload?.eventType === 'INSERT' && payload?.new) {
            notifyNewOrderToListeners(payload.new);
          }
          // 3. Nếu đơn hàng được UPDATE trạng thái trên CSDL Supabase
          else if (payload?.eventType === 'UPDATE' && payload?.new) {
            const o = payload.new;
            statusListeners.forEach((cb) => {
              try {
                cb({
                  order_number: o.order_number,
                  status: o.status,
                  updated_at: o.updated_at || new Date().toISOString(),
                  order_data: o,
                });
              } catch (e) {
                console.warn('Lỗi statusListener từ postgres_changes:', e);
              }
            });
          }
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

      // Gửi nhắc lại sau 350ms đề phòng websocket vừa khởi tạo đang hoàn tất bắt tay
      setTimeout(() => {
        try {
          channel.send({
            type: 'broadcast',
            event: 'pos_order_created',
            payload: {
              order,
              created_at: new Date().toISOString(),
            },
          }).catch(() => {});
        } catch {}
      }, 350);
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
 * Phát sóng cập nhật nhận diện thương hiệu (Tên tiệm, Logo, SĐT, Địa chỉ) tới tất cả thiết bị
 */
export async function broadcastStoreBranding(branding: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'store_branding_updated',
        payload: {
          branding,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastStoreBranding:', err);
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
  onStoreBrandingChange?: StoreBrandingCallback;
}) {
  ensureSyncChannel();

  const {
    onStatusUpdate,
    onNewOrder,
    onClearDemo,
    onDbChange,
    onProductChange,
    onTelegramConfigChange,
    onStoreBrandingChange,
  } = callbacks;

  if (onStatusUpdate) statusListeners.add(onStatusUpdate);
  if (onNewOrder) newOrderListeners.add(onNewOrder);
  if (onClearDemo) clearDemoListeners.add(onClearDemo);
  if (onDbChange) dbChangeListeners.add(onDbChange);
  if (onProductChange) productListeners.add(onProductChange);
  if (onTelegramConfigChange) telegramConfigListeners.add(onTelegramConfigChange);
  if (onStoreBrandingChange) storeBrandingListeners.add(onStoreBrandingChange);

  return () => {
    if (onStatusUpdate) statusListeners.delete(onStatusUpdate);
    if (onNewOrder) newOrderListeners.delete(onNewOrder);
    if (onClearDemo) clearDemoListeners.delete(onClearDemo);
    if (onDbChange) dbChangeListeners.delete(onDbChange);
    if (onProductChange) productListeners.delete(onProductChange);
    if (onTelegramConfigChange) telegramConfigListeners.delete(onTelegramConfigChange);
    if (onStoreBrandingChange) storeBrandingListeners.delete(onStoreBrandingChange);
  };
}

/**
 * Phân tích chuỗi ngày giờ hẹn giao sang ISO Timestamp chuẩn
 * Hỗ trợ các định dạng tiếng Việt phổ biến:
 * - "14:02 ngày 10/09/2026" hoặc "14:02 ngày 2026-09-10"
 * - "10/09/2026 14:02"
 * - ISO string: "2026-09-10T14:02:00.000Z"
 */
export function parseToIsoTimestamp(dtStr?: string): string | null {
  if (!dtStr || typeof dtStr !== 'string') return null;
  const s = dtStr.trim();
  if (!s) return null;

  // 1. Nếu đã là chuỗi ISO chuẩn
  if (s.includes('T') || s.includes('Z')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 2. Định dạng: "HH:mm ngày DD/MM/YYYY" hoặc "HH:mm, DD/MM/YYYY"
  const dmyMatch = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(?:ngày|,)?\s*)(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
  if (dmyMatch) {
    const [, h, m, day, mon, yr] = dmyMatch;
    const d = new Date(parseInt(yr, 10), parseInt(mon, 10) - 1, parseInt(day, 10), parseInt(h, 10), parseInt(m, 10));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 3. Định dạng: "HH:mm ngày YYYY-MM-DD"
  const ymdMatch = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(?:ngày|,)?\s*)(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/i);
  if (ymdMatch) {
    const [, h, m, yr, mon, day] = ymdMatch;
    const d = new Date(parseInt(yr, 10), parseInt(mon, 10) - 1, parseInt(day, 10), parseInt(h, 10), parseInt(m, 10));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 4. Định dạng: "DD/MM/YYYY HH:mm"
  const revMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s*(?:lúc|,)?\s*(\d{1,2}):(\d{2})/i);
  if (revMatch) {
    const [, day, mon, yr, h, m] = revMatch;
    const d = new Date(parseInt(yr, 10), parseInt(mon, 10) - 1, parseInt(day, 10), parseInt(h, 10), parseInt(m, 10));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 5. Thử new Date(s)
  const directDate = new Date(s);
  if (!isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  return null;
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
    // LƯU Ý QUAN TRỌNG: Chỉ cập nhật status và updated_at, TUYỆT ĐỐI KHÔNG ghi đè preorder_pickup_at!
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
        order_type: order.order_type || (order.preorder_pickup_at || order.pickupDateTime ? 'preorder' : 'takeaway'),
        status: nextStatus,
        notes: order.notes || '',
        subtotal: Number(order.subtotal || order.total_amount || order.totalPrice || 0),
        total_amount: Number(order.total_amount || order.totalPrice || 0),
      };

      // Nếu có id dạng UUID hợp lệ thì dùng id đó
      if (order.id && typeof order.id === 'string' && order.id.length === 36 && order.id.includes('-')) {
        orderPayload.id = order.id;
      }

      // Bảo toàn chính xác giờ hẹn giao ban đầu của khách:
      // Tuyệt đối không fallback về new Date().toISOString() vì sẽ biến giờ hẹn thành giờ ấn nút!
      const rawPickup = order.preorder_pickup_at || order.pickupDateTime;
      if (rawPickup) {
        const parsedIso = parseToIsoTimestamp(rawPickup);
        if (parsedIso) {
          orderPayload.preorder_pickup_at = parsedIso;
        } else {
          orderPayload.preorder_pickup_at = rawPickup;
        }
      }
      const cName = order.customer_name || order.customerName;
      if (cName) orderPayload.customer_name = cName;
      const cPhone = order.customer_phone || order.customerPhone;
      if (cPhone) orderPayload.customer_phone = cPhone;
      const cMsg = order.cake_message || order.cakeMessage;
      if (cMsg) orderPayload.cake_message = cMsg;

      const { data: insertedOrder, error: insertErr } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single();

      if (insertErr) {
        console.error('Lỗi INSERT đơn lên Supabase SQL:', insertErr);
      } else if (insertedOrder) {
        // Ghi các món bánh vào order_items
        if (Array.isArray(order.items) && order.items.length > 0) {
          const itemsToInsert = order.items.map((it: any) => ({
            order_id: insertedOrder.id,
            product_name_snapshot: it.product_name_snapshot || it.name || it.product?.name || 'Bánh',
            quantity: Number(it.quantity || 1),
            unit_price: Number(it.unit_price || it.selling_price || it.product?.selling_price || 0),
            notes: it.notes || '',
          }));

          await supabase.from('order_items').insert(itemsToInsert);
        }

        // Ghi thanh toán / tiền cọc vào payments
        if (Array.isArray(order.payments) && order.payments.length > 0) {
          const paymentsToInsert = order.payments.map((p: any) => ({
            order_id: insertedOrder.id,
            method: p.method || 'cash',
            amount: Number(p.amount || 0),
            reference_code: p.reference_code || `Thanh toán đơn ${orderNum}`,
          }));

          await supabase.from('payments').insert(paymentsToInsert);
        } else if (order.deposit_amount || order.depositAmount) {
          const depAmt = Number(order.deposit_amount || order.depositAmount || 0);
          if (depAmt > 0) {
            await supabase.from('payments').insert({
              order_id: insertedOrder.id,
              method: order.payment_method || order.paymentMethod || 'cash',
              amount: depAmt,
              reference_code: `Cọc đơn đặt bánh ${orderNum}`,
            });
          }
        }
      }
      return insertedOrder;
    }
    return updatedRows?.[0];
  } catch (err) {
    console.warn('Lỗi syncOrderToSupabase:', err);
  }
}

export interface ParsedPreorderNotes {
  delivery_method?: 'shipping';
  shipping_address?: string;
  total_amount?: number;
  deposit_amount?: number;
  remaining_amount?: number;
  reference_image_url?: string;
  cake_name?: string;
  cake_size?: string;
  customer_name?: string;
  customer_phone?: string;
  preorder_pickup_at?: string;
  pickup_time?: string;
  cake_message?: string;
  special_request?: string;
}

/**
 * Trích xuất thông tin đặt bánh từ trường ghi chú (notes)
 * Làm chốt an toàn khi dữ liệu đồng bộ qua các hệ thống hoặc thiết bị khác nhau
 */
export function parsePreorderFromNotes(notes?: string): ParsedPreorderNotes {
  if (!notes || typeof notes !== 'string') {
    return {};
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

  let specialRequest: string | undefined = undefined;
  const reqMatch = notes.match(/Yêu cầu:\s*([^|]+)/i);
  if (reqMatch && reqMatch[1]) {
    specialRequest = reqMatch[1].trim();
  }

  let totalAmount: number | undefined = undefined;
  const totalMatch = notes.match(/GIÁ CUỐI:\s*([\d\.\,]+)/i);
  if (totalMatch && totalMatch[1]) {
    const cleanNum = parseInt(totalMatch[1].replace(/\D/g, ''), 10);
    if (!isNaN(cleanNum)) totalAmount = cleanNum;
  }

  return {
    delivery_method: isShip ? ('shipping' as const) : undefined,
    shipping_address: shippingAddress,
    total_amount: totalAmount,
    deposit_amount: depositAmount,
    remaining_amount: remainingAmount,
    reference_image_url: referenceImageUrl,
    cake_name: cakeName,
    cake_size: cakeSize,
    customer_name: customerName,
    customer_phone: customerPhone,
    preorder_pickup_at: pickupTime,
    pickup_time: pickupTime,
    cake_message: cakeMessage,
    special_request: specialRequest,
  };
}

/**
 * Làm sạch chuỗi ghi chú hiển thị ra giao diện:
 * - Loại bỏ tag hình ảnh Base64
 * - Nếu là chuỗi dữ liệu đặt bánh [ĐẶT BÁNH KEM] thì chỉ trích xuất phần 'Yêu cầu:' thực tế
 */
export function cleanDisplayNotes(notes?: string): string {
  if (!notes || typeof notes !== 'string') return '';
  const cleaned = notes.replace(/\[MẪU_ẢNH:[^\]]+\]/g, '').trim();
  if (cleaned.startsWith('[ĐẶT BÁNH KEM]')) {
    const reqMatch = cleaned.match(/Yêu cầu:\s*([^|]+)/i);
    return reqMatch && reqMatch[1] ? reqMatch[1].trim() : '';
  }
  return cleaned;
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
