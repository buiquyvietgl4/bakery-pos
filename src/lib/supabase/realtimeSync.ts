import { supabase } from '@/lib/supabase/client';

export interface SyncOrderPayload {
  order_number: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  updated_at: string;
  order_data?: any;
}

let syncChannelInstance: any = null;

/**
 * Lấy hoặc khởi tạo channel Supabase Realtime Broadcast cho toàn bộ hệ thống
 */
export function getSyncChannel() {
  if (!syncChannelInstance) {
    syncChannelInstance = supabase.channel('bakery_cross_device_sync', {
      config: {
        broadcast: {
          self: false, // Không nhận lại sự kiện do chính tab/thiết bị này gửi
        },
      },
    });
    syncChannelInstance.subscribe();
  }
  return syncChannelInstance;
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
    const channel = getSyncChannel();
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
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastOrderStatusUpdate:', err);
  }
}

/**
 * Phát sóng khi POS tạo đơn hàng mới (bán trực tiếp hoặc đặt bánh sinh nhật)
 */
export async function broadcastNewOrder(order: any) {
  try {
    const channel = getSyncChannel();
    await channel.send({
      type: 'broadcast',
      event: 'pos_order_created',
      payload: {
        order,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastNewOrder:', err);
  }
}

/**
 * Phát sóng khi người dùng bấm "Xóa Đơn Mẫu" trên bất kỳ thiết bị nào
 */
export async function broadcastClearDemoOrders() {
  try {
    const channel = getSyncChannel();
    await channel.send({
      type: 'broadcast',
      event: 'kds_clear_demo',
      payload: {
        cleared_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastClearDemoOrders:', err);
  }
}

/**
 * Đăng ký lắng nghe sự kiện đồng bộ từ các thiết bị khác
 */
export function subscribeCrossDeviceSync(callbacks: {
  onStatusUpdate?: (payload: SyncOrderPayload) => void;
  onNewOrder?: (order: any) => void;
  onClearDemo?: () => void;
  onDbChange?: () => void;
}) {
  const channel = supabase.channel(`kds_sub_${Date.now()}_${Math.random().toString(36).substring(7)}`, {
    config: {
      broadcast: { self: false },
    },
  });

  if (callbacks.onStatusUpdate) {
    channel.on('broadcast', { event: 'kds_status_update' }, ({ payload }) => {
      callbacks.onStatusUpdate?.(payload);
    });
  }

  if (callbacks.onNewOrder) {
    channel.on('broadcast', { event: 'pos_order_created' }, ({ payload }) => {
      callbacks.onNewOrder?.(payload?.order);
    });
  }

  if (callbacks.onClearDemo) {
    channel.on('broadcast', { event: 'kds_clear_demo' }, () => {
      callbacks.onClearDemo?.();
    });
  }

  if (callbacks.onDbChange) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => {
        callbacks.onDbChange?.();
      }
    );
  }

  channel.subscribe();

  return () => {
    supabase.removeChannel(channel);
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
