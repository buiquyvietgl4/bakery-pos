// src/lib/supabase/autoOrderWatcher.ts

import { supabase } from './client';
import { phoneNotificationService } from '@/lib/utils/phoneNotification';
import { formatPickupDateTime, parsePreorderFromNotes } from './realtimeSync';
import { getDeliveryUrgency } from '@/lib/utils/deliveryAlerts';
import { sendTelegramOrderAlert, sendTelegramUrgentAlert } from '@/lib/utils/telegramNotify';

interface DemoCustomer {
  name: string;
  phone: string;
  cakeName: string;
  size: string;
  message: string;
  price: number;
}

const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    name: 'Chị Minh Thư',
    phone: '0938.112.233',
    cakeName: 'Bánh Mousse Dâu Tây',
    size: 'Size 16cm',
    message: 'Chúc mừng sinh nhật mẹ yêu',
    price: 320000,
  },
  {
    name: 'Anh Hoàng Nam',
    phone: '0909.887.766',
    cakeName: 'Bánh Kem Bắp Phô Mai',
    size: 'Size 20cm',
    message: 'Happy Birthday My Love',
    price: 420000,
  },
  {
    name: 'Cô Thu Hương',
    phone: '0918.334.556',
    cakeName: 'Bánh Red Velvet Trái Tim',
    size: 'Size 16cm',
    message: 'Kỷ niệm 10 năm ngày cưới',
    price: 390000,
  },
  {
    name: 'Bác Quang Huy',
    phone: '0982.556.778',
    cakeName: 'Bánh Bông Lan Trứng Muối',
    size: 'Size 18cm',
    message: 'Mừng thọ Bác 70 tuổi',
    price: 365000,
  },
  {
    name: 'Bạn Thùy Trang',
    phone: '0977.441.229',
    cakeName: 'Bánh Tiramisu Ý Hộp Vuông',
    size: 'Hộp Vuông 15cm',
    message: 'Chúc mừng tốt nghiệp cử nhân',
    price: 250000,
  }
];

class AutoOrderWatcher {
  private knownOrders: Set<string> = new Set();
  private alertedUrgentMap: Map<string, number> = new Map();
  private isWatching: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private urgentTimer: NodeJS.Timeout | null = null;
  private demoTimer: NodeJS.Timeout | null = null;
  private autoDemoActive: boolean = false;
  private demoIndex: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedDemo = localStorage.getItem('bakery_auto_demo_enabled');
      this.autoDemoActive = savedDemo === 'true';
      (window as any).bakeryAutoOrderWatcher = this;
    }
  }

  public isAutoDemoEnabled(): boolean {
    return this.autoDemoActive;
  }

  public toggleAutoDemo(): boolean {
    this.autoDemoActive = !this.autoDemoActive;
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_auto_demo_enabled', String(this.autoDemoActive));
      window.dispatchEvent(new CustomEvent('bakery_auto_demo_toggle', { detail: { enabled: this.autoDemoActive } }));
    }
    if (this.autoDemoActive) {
      this.startDemoGenerator();
      // Tạo ngay 1 đơn đầu tiên sau 2.5 giây để người dùng thấy thông báo tự động ngay lập tức
      setTimeout(() => this.createSimulatedOrder(), 2500);
    } else {
      this.stopDemoGenerator();
    }
    return this.autoDemoActive;
  }

  /**
   * Khởi động bộ giám sát tự động toàn hệ thống
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

    // 4. Nếu chế độ tự động nhận đơn mẫu đang bật, khởi động bộ tạo đơn
    if (this.autoDemoActive) {
      this.startDemoGenerator();
    }

    console.log('✅ AutoOrderWatcher started - Đang giám sát đơn hàng tự động real-time');
  }

  public stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.urgentTimer) clearInterval(this.urgentTimer);
    this.stopDemoGenerator();
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

  /**
   * Tạo đơn mô phỏng tự động vào Supabase để người dùng thấy ứng dụng tự động nhận đơn
   */
  public async createSimulatedOrder() {
    try {
      const demoCust = DEMO_CUSTOMERS[this.demoIndex % DEMO_CUSTOMERS.length];
      this.demoIndex++;

      const now = new Date();
      const orderNum = `BK-PRE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(100 + Math.random() * 900))}`;
      
      // Hẹn giao trong 45 phút nữa
      const pickupDate = new Date(now.getTime() + 45 * 60 * 1000);
      const isoPickup = pickupDate.toISOString();
      const pickupStr = `${String(pickupDate.getHours()).padStart(2, '0')}:${String(pickupDate.getMinutes()).padStart(2, '0')} hôm nay`;

      const fullNotes = `[ĐẶT BÁNH KEM] Khách: ${demoCust.name} (${demoCust.phone}) | Hẹn: ${pickupStr} | Bánh: ${demoCust.cakeName} (${demoCust.size}) | Chữ: "${demoCust.message}" | Tổng: ${demoCust.price.toLocaleString('vi-VN')}đ | Đã cọc: ${demoCust.price.toLocaleString('vi-VN')}đ`;

      let insertedId = '';

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const { data: insertedOrder, error } = await supabase
          .from('orders')
          .insert({
            order_number: orderNum,
            order_type: 'preorder',
            status: 'pending',
            customer_name: demoCust.name,
            customer_phone: demoCust.phone,
            preorder_pickup_at: isoPickup,
            notes: fullNotes,
            subtotal: demoCust.price,
            total_amount: demoCust.price,
            cake_message: demoCust.message,
          })
          .select('id')
          .single();

        if (!error && insertedOrder) {
          insertedId = String(insertedOrder.id);
          await supabase.from('order_items').insert([
            {
              order_id: insertedOrder.id,
              product_name_snapshot: `${demoCust.cakeName} (${demoCust.size})`,
              quantity: 1,
              unit_price: demoCust.price,
              line_total: demoCust.price,
              notes: `Chữ: "${demoCust.message}"`,
            }
          ]);
        }
      }

      // Lưu vào local để hiển thị ngay cả khi offline
      const unified: any = {
        id: insertedId || `local-${Date.now()}`,
        order_number: orderNum,
        orderNumber: orderNum,
        order_type: 'preorder',
        status: 'pending',
        created_at: new Date().toISOString(),
        preorder_pickup_at: isoPickup,
        pickupDateTime: isoPickup,
        delivery_method: 'pickup',
        customer_name: demoCust.name,
        customer_phone: demoCust.phone,
        cake_name: demoCust.cakeName,
        cake_size: demoCust.size,
        cake_message: demoCust.message,
        notes: fullNotes,
        total_amount: demoCust.price,
        subtotal: demoCust.price,
        deposit_amount: demoCust.price,
        remaining_amount: 0,
      };

      const raw = localStorage.getItem('bakery_orders');
      const list = raw ? JSON.parse(raw) : [];
      list.unshift(unified);
      localStorage.setItem('bakery_orders', JSON.stringify(list.slice(0, 100)));

      // Ghi nhớ để tránh quét trùng
      this.knownOrders.add(orderNum);
      if (insertedId) this.knownOrders.add(insertedId);

      // Kích hoạt ngay thông báo nổi + chuông + rung!
      phoneNotificationService.triggerOrderNotification({
        id: 'sim-' + orderNum,
        type: 'new_order',
        appTitle: 'TIỆM BÁNH HẠNH PHÚC (TỰ ĐỘNG)',
        title: `🎂 Đơn Bánh Mới #${orderNum}`,
        sender: `${demoCust.name} (${demoCust.phone})`,
        message: `⏰ Hẹn: ${pickupStr} • ${demoCust.cakeName} (${demoCust.size})`,
        extraDetails: `Ghi chữ: "${demoCust.message}" - ${demoCust.price.toLocaleString('vi-VN')}₫`,
        orderNumber: orderNum,
        pickupTime: pickupStr,
        actionLabel: 'Xem Đơn Ngay',
        onAction: () => {
          if (typeof window !== 'undefined') {
            window.location.href = '/pos';
          }
        }
      });

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('bakery_orders_updated'));
      }
    } catch (e) {
      console.warn('Create simulated order notice:', e);
    }
  }

  private startDemoGenerator() {
    this.stopDemoGenerator();
    // Tạo đơn mới tự động mỗi 30 giây khi bật chế độ nhận đơn mẫu
    this.demoTimer = setInterval(() => {
      if (this.autoDemoActive) {
        this.createSimulatedOrder();
      }
    }, 30000);
  }

  private stopDemoGenerator() {
    if (this.demoTimer) {
      clearInterval(this.demoTimer);
      this.demoTimer = null;
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
