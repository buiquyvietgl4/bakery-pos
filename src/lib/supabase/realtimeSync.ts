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

const statusListeners = new Set<StatusCallback>();
const newOrderListeners = new Set<NewOrderCallback>();
const clearDemoListeners = new Set<ClearDemoCallback>();
const dbChangeListeners = new Set<DbChangeCallback>();

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
 * Đăng ký lắng nghe sự kiện đồng bộ từ các thiết bị khác
 * An toàn tuyệt đối với React StrictMode và Remount
 */
export function subscribeCrossDeviceSync(callbacks: {
  onStatusUpdate?: StatusCallback;
  onNewOrder?: NewOrderCallback;
  onClearDemo?: ClearDemoCallback;
  onDbChange?: DbChangeCallback;
}) {
  ensureSyncChannel();

  const { onStatusUpdate, onNewOrder, onClearDemo, onDbChange } = callbacks;

  if (onStatusUpdate) statusListeners.add(onStatusUpdate);
  if (onNewOrder) newOrderListeners.add(onNewOrder);
  if (onClearDemo) clearDemoListeners.add(onClearDemo);
  if (onDbChange) dbChangeListeners.add(onDbChange);

  return () => {
    if (onStatusUpdate) statusListeners.delete(onStatusUpdate);
    if (onNewOrder) newOrderListeners.delete(onNewOrder);
    if (onClearDemo) clearDemoListeners.delete(onClearDemo);
    if (onDbChange) dbChangeListeners.delete(onDbChange);
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
