// src/lib/supabase/autoOrderWatcher.ts

import { supabase } from './client';
import { phoneNotificationService } from '@/lib/utils/phoneNotification';
import { formatPickupDateTime, parsePreorderFromNotes } from './realtimeSync';
import { getDeliveryUrgency } from '@/lib/utils/deliveryAlerts';
import { sendTelegramOrderAlert, sendTelegramUrgentAlert } from '@/lib/utils/telegramNotify';

class AutoOrderWatcher {
  private knownOrders: Set<string> = new Set();
  private alertedUrgentMap: Map<string, number> = new Map();
  private isWatching: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private urgentTimer: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bakery_auto_demo_enabled');
      (window as any).bakeryAutoOrderWatcher = this;
    }
  }

  public isAutoDemoEnabled(): boolean {
    return false;
  }

  public toggleAutoDemo(): boolean {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('bakery_auto_demo_enabled');
    }
    return false;
  }

  /**
   * Khởi động bộ giám sát tự động đơn hàng thực tế
   */
  public start() {
    if (this.isWatching || typeof window === 'undefined') return;
    this.isWatching = true;

    // 1. Tải danh sách đơn đã biết ban đầu để không báo lại các đơn cũ
    this.initKnownOrders();

    // 2. Vòng quét đồng bộ Supabase tự động mỗi 4 giây (Bắt trọn mọi đơn từ máy khác/khách đặt)
    this.pollTimer = setInterval(() => {
      this.checkNewOrdersFromSupabase();
    }, 4000);

    // 3. Vòng quét cảnh báo giao gấp tự động mỗi 15 giây
    this.urgentTimer = setInterval(() => {
      this.checkUrgentDeliveries();
    }, 15000);

    console.log('✅ AutoOrderWatcher started - Đang giám sát đơn hàng thực tế real-time');
  }

  public stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.urgentTimer) clearInterval(this.urgentTimer);
    this.isWatching = false;
  }

  private initKnownOrders() {
    try {
      const local = localStorage.getItem('bakery_orders');
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          parsed.forEach((o: any) => {
            if (o.order_number) this.knownOrders.add(o.order_number);
            if (o.id) this.knownOrders.add(String(o.id));
          });
        }
      }
    } catch {}

    // Lấy nhanh danh sách ID hiện có trên Supabase
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      supabase
        .from('orders')
        .select('id, order_number')
        .limit(50)
        .then(({ data }) => {
          if (data && Array.isArray(data)) {
            data.forEach((o) => {
              if (o.order_number) this.knownOrders.add(o.order_number);
              if (o.id) this.knownOrders.add(String(o.id));
            });
          }
        });
    }
  }

  /**
   * Tự động kiểm tra đơn mới từ Supabase
   * Bất kể thiết bị nào (điện thoại hoặc máy tính) tạo đơn, tất cả các máy khác đều nhảy thông báo tức thì!
   */
  public async checkNewOrdersFromSupabase() {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error || !data || !Array.isArray(data)) return;

      for (const order of data) {
        const orderNum = order.order_number;
        const idStr = String(order.id);

        // Nếu đơn này chưa từng được biết đến trên máy này -> ĐÂY LÀ ĐƠN MỚI TỰ ĐỘNG ĐẾN!
        if (orderNum && !this.knownOrders.has(orderNum) && !this.knownOrders.has(idStr)) {
          this.knownOrders.add(orderNum);
          this.knownOrders.add(idStr);

          // Cập nhật đơn mới vào localStorage máy này
          this.saveOrderToLocalStorage(order);

          // KÍCH HOẠT THÔNG BÁO NỔI & CHUÔNG BÁO TỰ ĐỘNG 100%!
          const fromN = parsePreorderFromNotes(order.notes);
          const isCake = order.order_type === 'preorder' || orderNum.startsWith('BK-PRE') || !!order.preorder_pickup_at;
          const pickupStr = formatPickupDateTime(order.preorder_pickup_at || fromN.preorder_pickup_at);
          const custName = order.customer_name || fromN.customer_name || 'Khách đặt qua POS';
          const custPhone = order.customer_phone || fromN.customer_phone || '';
          const cakeDetails = fromN.cake_name 
            ? `${fromN.cake_name} (${fromN.cake_size || 'Tiêu chuẩn'})` 
            : `${(order.total_amount || 0).toLocaleString('vi-VN')}₫`;

          phoneNotificationService.triggerOrderNotification({
            id: 'auto-' + orderNum,
            type: 'new_order',
            appTitle: isCake ? 'TIỆM BÁNH HẠNH PHÚC (ĐƠN MỚI)' : 'TIỆM BÁNH HẠNH PHÚC (POS)',
            title: isCake ? `🎂 Đơn Đặt Bánh Mới #${orderNum}` : `🛒 Đơn Bán Mới #${orderNum}`,
            sender: `${custName}${custPhone ? ' (' + custPhone + ')' : ''}`,
            message: `${pickupStr ? '⏰ Giao: ' + pickupStr + ' • ' : ''}${cakeDetails}`,
            extraDetails: order.cake_message ? `Ghi chữ: "${order.cake_message}"` : (fromN.cake_message ? `Ghi chữ: "${fromN.cake_message}"` : undefined),
            orderNumber: orderNum,
            pickupTime: pickupStr,
            actionLabel: isCake ? 'Xem Lịch Giao' : 'Xem Chi Tiết',
            onAction: () => {
              if (typeof window !== 'undefined') {
                window.location.href = '/pos';
              }
            }
          });

          // Bắn thông báo Telegram ra điện thoại khi tắt app
          sendTelegramOrderAlert(order).catch(() => {});

          // Bắn event để các tab tự động cập nhật bảng KDS và danh sách POS
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('bakery_orders_updated'));
          }
        }
      }
    } catch (e) {
      console.warn('AutoOrderWatcher check notice:', e);
    }
  }

  /**
   * Tự động quét các đơn hẹn giao bánh sắp tới hạn hoặc quá hạn
   */
  public checkUrgentDeliveries() {
    if (typeof window === 'undefined') return;

    try {
      const raw = localStorage.getItem('bakery_orders');
      if (!raw) return;
      const orders = JSON.parse(raw);
      if (!Array.isArray(orders)) return;

      const now = new Date();
      const pendingPreorders = orders.filter((o) => {
        if (!o || o.status === 'completed' || o.status === 'cancelled') return false;
        return o.order_type === 'preorder' || o.preorder_pickup_at || o.order_number?.startsWith('BK-PRE');
      });

      for (const order of pendingPreorders) {
        const pickup = order.preorder_pickup_at || order.pickupDateTime;
        if (!pickup) continue;

        const urg = getDeliveryUrgency(pickup, order.status, now);
        if (urg.isUrgent) {
          const orderNum = order.order_number || order.orderNumber || order.id || 'ĐƠN MỚI';
          const lastAlert = this.alertedUrgentMap.get(orderNum) || 0;

          // Báo động lại sau mỗi 3 phút nếu đơn vẫn chưa được giao/hoàn tất
          if (Date.now() - lastAlert > 180000) {
            this.alertedUrgentMap.set(orderNum, Date.now());
            const custName = order.customer_name || order.customerName || '';
            const custPhone = order.customer_phone || order.customerPhone || '';
            const cakeTitle = order.cake_name || order.cakeName || (order.items?.[0]?.product_name_snapshot) || '';
            const pickupFormatted = pickup ? formatPickupDateTime(pickup) : 'Trong ngày';

            phoneNotificationService.triggerOrderNotification({
              id: 'auto-urgent-' + orderNum,
              type: 'urgent_alert',
              appTitle: '🚨 BÁO ĐỘNG GIAO BÁNH GẤP',
              title: urg.minutesLeft < 0 ? `🚨 QUÁ HẠN GIAO #${orderNum}` : `🚨 CẦN GIAO GẤP #${orderNum}`,
              sender: custName ? `${custName}${custPhone ? ' (' + custPhone + ')' : ''}` : 'Đơn đặt trước',
              message: urg.minutesLeft < 0 ? `Đã quá hạn hẹn giao ${Math.abs(urg.minutesLeft)} phút!` : `Cần giao trong ${urg.minutesLeft} phút nữa! (Hẹn: ${pickupFormatted})`,
              extraDetails: cakeTitle ? `${cakeTitle}${order.cake_message ? ' - Ghi: ' + order.cake_message : ''}` : undefined,
              orderNumber: orderNum,
              pickupTime: pickupFormatted,
              actionLabel: 'Xử Lý Ngay',
              onAction: () => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/pos';
                }
              }
            });
            // Báo qua Telegram khẩn cấp
            sendTelegramUrgentAlert(order, urg.minutesLeft).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('Urgent check warning:', e);
    }
  }

  private saveOrderToLocalStorage(order: any) {
    if (typeof window === 'undefined') return;
    try {
      const fromN = parsePreorderFromNotes(order.notes);
      const isShip = (order.delivery_method || fromN.delivery_method) === 'shipping';
      const unified: any = {
        id: String(order.id),
        order_number: order.order_number,
        orderNumber: order.order_number,
        order_type: order.order_type || (order.preorder_pickup_at ? 'preorder' : 'takeaway'),
        status: order.status || 'pending',
        created_at: order.created_at || new Date().toISOString(),
        preorder_pickup_at: order.preorder_pickup_at || fromN.preorder_pickup_at || '',
        pickupDateTime: order.preorder_pickup_at || fromN.preorder_pickup_at || '',
        delivery_method: isShip ? 'shipping' : 'pickup',
        shipping_address: order.shipping_address || fromN.shipping_address || '',
        customer_name: order.customer_name || fromN.customer_name || '',
        customer_phone: order.customer_phone || fromN.customer_phone || '',
        cake_name: fromN.cake_name || 'Bánh kem',
        cake_size: fromN.cake_size || '',
        cake_message: order.cake_message || fromN.cake_message || '',
        notes: order.notes || '',
        total_amount: order.total_amount || 0,
        subtotal: order.subtotal || order.total_amount || 0,
        deposit_amount: fromN.deposit_amount || 0,
        remaining_amount: fromN.remaining_amount || 0,
      };

      const raw = localStorage.getItem('bakery_orders');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        if (!list.some((o: any) => o.order_number === unified.order_number)) {
          list.unshift(unified);
          localStorage.setItem('bakery_orders', JSON.stringify(list.slice(0, 100)));
        }
      }
    } catch {}
  }
}

export const autoOrderWatcher = new AutoOrderWatcher();
