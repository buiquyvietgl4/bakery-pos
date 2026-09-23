// src/lib/supabase/autoOrderWatcher.ts

import { supabase } from './client';
import { phoneNotificationService } from '@/lib/utils/phoneNotification';
import { formatPickupDateTime, parsePreorderFromNotes, parseOrderBakeShortage, subscribeCrossDeviceSync } from './realtimeSync';
import { getDeliveryUrgency, isOrderCompletedOrCancelled, pruneOrdersCache, prunePreordersCache, MAX_CACHED_ORDERS, MAX_CACHED_PREORDERS } from '@/lib/utils/deliveryAlerts';
import { sendTelegramOrderAlert, sendTelegramUrgentAlert } from '@/lib/utils/telegramNotify';
import { soundManager } from '@/lib/utils/audioAlert';
import { offlineSyncWorker } from './offlineSyncWorker';

class AutoOrderWatcher {
  private knownOrders: Set<string> = new Set();
  private alertedUrgentMap: Map<string, number> = new Map();
  private isWatching: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private urgentTimer: NodeJS.Timeout | null = null;
  private unsubCrossSync: (() => void) | null = null;

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

    // 2. Lắng nghe cập nhật trạng thái đa thiết bị thời gian thực (Supabase Realtime Broadcast)
    this.unsubCrossSync = subscribeCrossDeviceSync({
      onStatusUpdate: (payload?: any) => {
        if (payload && payload.order_number) {
          if (isOrderCompletedOrCancelled({ status: payload.status })) {
            this.markOrderCompletedLocally(payload.order_number, payload.status, payload.order_data);
          }
        }
      },
    });

    // 3. Lắng nghe sự kiện cập nhật đơn nội bộ
    window.addEventListener('bakery_orders_updated', this.handleLocalOrdersUpdated);

    // 4. Vòng quét đồng bộ Supabase định kỳ (WebSocket Realtime đã bắn tức thì ~50ms, polling làm chốt an toàn)
    this.pollTimer = setInterval(() => {
      this.checkNewOrdersFromSupabase();
    }, 15000);

    // 5. Vòng quét cảnh báo giao gấp tự động mỗi 15 giây
    this.urgentTimer = setInterval(() => {
      this.checkUrgentDeliveries();
    }, 15000);

    // 6. Kích hoạt Background Worker tự động đẩy bù đơn hàng offline lên Supabase SQL
    offlineSyncWorker.start();

    console.log('✅ AutoOrderWatcher started - Đang giám sát đơn hàng thực tế real-time');
  }

  public stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.urgentTimer) clearInterval(this.urgentTimer);
    offlineSyncWorker.stop();
    if (this.unsubCrossSync) {
      this.unsubCrossSync();
      this.unsubCrossSync = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('bakery_orders_updated', this.handleLocalOrdersUpdated);
    }
    this.isWatching = false;
  }

  private handleLocalOrdersUpdated = () => {
    try {
      const raw = localStorage.getItem('bakery_orders');
      if (!raw) return;
      const list = JSON.parse(raw);
      if (!Array.isArray(list)) return;

      list.forEach((o: any) => {
        if (isOrderCompletedOrCancelled(o)) {
          const num = o.order_number || o.orderNumber;
          if (num && this.alertedUrgentMap.has(num)) {
            this.alertedUrgentMap.delete(num);
          }
          if (o.id && this.alertedUrgentMap.has(String(o.id))) {
            this.alertedUrgentMap.delete(String(o.id));
          }
        }
      });
    } catch {}
  };

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
   * Đánh dấu một đơn hàng đã hoàn thành / giao thành công trong localStorage
   * và xóa ngay khỏi danh sách cảnh báo quá hạn.
   */
  public markOrderCompletedLocally(orderNum: string, status: string = 'completed', orderData?: any) {
    if (!orderNum || typeof window === 'undefined') return;

    // 1. Xóa ngay khỏi bộ đệm cảnh báo quá hạn cho cả mã gốc và mã -LAM
    const relatedNumbers = new Set<string>();
    relatedNumbers.add(orderNum);
    if (orderNum.endsWith('-LAM')) {
      relatedNumbers.add(orderNum.replace(/-LAM$/, ''));
    } else {
      relatedNumbers.add(`${orderNum}-LAM`);
    }

    relatedNumbers.forEach((num) => {
      this.alertedUrgentMap.delete(num);
    });

    try {
      // 2. Cập nhật bakery_orders
      const raw = localStorage.getItem('bakery_orders');
      let ordersUpdated = false;
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const updated = list.map((o: any) => {
            const match =
              relatedNumbers.has(o.order_number) ||
              relatedNumbers.has(o.orderNumber) ||
              relatedNumbers.has(o.id) ||
              relatedNumbers.has(String(o.id));
            if (match) {
              ordersUpdated = true;
              return {
                ...o,
                ...(orderData || {}),
                status: 'completed',
                remaining_amount: 0,
                remainingAmount: 0,
                payment_status: 'paid',
                updated_at: new Date().toISOString(),
              };
            }
            return o;
          });
          if (ordersUpdated) {
            localStorage.setItem('bakery_orders', JSON.stringify(pruneOrdersCache(updated, MAX_CACHED_ORDERS)));
          }
        }
      }

      // 3. Cập nhật bakery_preorders
      const rawPo = localStorage.getItem('bakery_preorders');
      let preordersUpdated = false;
      if (rawPo) {
        const poList = JSON.parse(rawPo);
        if (Array.isArray(poList)) {
          const updatedPo = poList.map((p: any) => {
            const match =
              relatedNumbers.has(p.order_number) ||
              relatedNumbers.has(p.orderNumber) ||
              relatedNumbers.has(p.id) ||
              relatedNumbers.has(String(p.id));
            if (match) {
              preordersUpdated = true;
              return {
                ...p,
                ...(orderData || {}),
                status: 'completed',
                remaining_amount: 0,
                remainingAmount: 0,
                payment_status: 'paid',
                updated_at: new Date().toISOString(),
              };
            }
            return p;
          });
          if (preordersUpdated) {
            localStorage.setItem('bakery_preorders', JSON.stringify(prunePreordersCache(updatedPo, MAX_CACHED_PREORDERS)));
          }
        }
      }

      if (ordersUpdated || preordersUpdated) {
        window.dispatchEvent(new Event('bakery_orders_updated'));
      }
    } catch (e) {
      console.warn('Lỗi markOrderCompletedLocally:', e);
    }
  }

  /**
   * Tự động kiểm tra đơn mới và cập nhật trạng thái từ Supabase
   */
  public async checkNewOrdersFromSupabase() {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;
    if (typeof document !== 'undefined' && document.hidden) return;

    try {
      // Quét song song cả đơn mới nhất (created_at DESC) lẫn đơn vừa đổi trạng thái (updated_at DESC)
      const [resCreated, resUpdated] = await Promise.all([
        supabase
          .from('orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('orders')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(25),
      ]);

      const orderMap = new Map<string, any>();
      (resCreated.data || []).forEach((o: any) => {
        if (o && o.order_number) orderMap.set(o.order_number, o);
      });
      (resUpdated.data || []).forEach((o: any) => {
        if (o && o.order_number) orderMap.set(o.order_number, o);
      });

      const data = Array.from(orderMap.values());
      if (data.length === 0) return;

      for (const order of data) {
        const orderNum = order.order_number;
        const idStr = String(order.id);

        // Trường hợp 1: ĐƠN MỚI CHƯA BIẾT ĐẾN
        if (orderNum && !this.knownOrders.has(orderNum) && !this.knownOrders.has(idStr)) {
          this.knownOrders.add(orderNum);
          this.knownOrders.add(idStr);

          // Cập nhật đơn mới vào localStorage máy này
          this.saveOrderToLocalStorage(order);

          // Nếu đơn tải về đã là đơn hoàn tất / đã giao thì không báo chuông đơn mới
          if (isOrderCompletedOrCancelled(order)) {
            continue;
          }

          // KÍCH HOẠT THÔNG BÁO NỔI & CHUÔNG BÁO TỰ ĐỘNG 100%!
          try {
            soundManager.playNewOrderChime();
          } catch {}

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
            appTitle: isCake ? 'BẾP LÀM BÁNH (KDS)' : 'TIỆM BÁNH HẠNH PHÚC (POS)',
            title: isCake ? `🎂 Bếp Nhận Đơn Bánh Mới #${orderNum}` : `🛒 Đơn Bán Mới #${orderNum}`,
            sender: `${custName}${custPhone ? ' (' + custPhone + ')' : ''}`,
            message: `${pickupStr ? '⏰ Hẹn: ' + pickupStr + ' • ' : ''}${cakeDetails}`,
            extraDetails: order.cake_message ? `Ghi chữ: "${order.cake_message}"` : (fromN.cake_message ? `Ghi chữ: "${fromN.cake_message}"` : undefined),
            orderNumber: orderNum,
            pickupTime: pickupStr,
            actionLabel: isCake ? 'Vào Bếp Ngay' : 'Xem Chi Tiết',
            onAction: () => {
              if (typeof window !== 'undefined') {
                window.location.href = isCake ? '/kitchen' : '/pos';
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
        // Trường hợp 2: ĐƠN ĐÃ BIẾT -> KIỂM TRA NẾU ĐƠN ĐÃ ĐƯỢC HOÀN TẤT / GIAO HÀNG TRÊN SUPABASE
        else if (orderNum && isOrderCompletedOrCancelled(order)) {
          this.markOrderCompletedLocally(orderNum, order.status, order);
        }
      }
    } catch (e) {
      console.warn('AutoOrderWatcher check notice:', e);
    }
  }

  /**
   * Tự động quét các đơn hẹn giao bánh sắp tới hạn hoặc quá hạn
   * ĐẶC BIỆT: Khóa chặt chẽ, tuyệt đối KHÔNG gửi thông báo cho đơn đã giao thành công.
   */
  public async checkUrgentDeliveries() {
    if (typeof window === 'undefined') return;

    try {
      const raw = localStorage.getItem('bakery_orders');
      if (!raw) return;
      const orders = JSON.parse(raw);
      if (!Array.isArray(orders)) return;

      // Thu thập các đơn đã hoàn thành từ cả bakery_orders và bakery_preorders
      const completedOrderNums = new Set<string>();
      orders.forEach((o: any) => {
        if (isOrderCompletedOrCancelled(o)) {
          if (o.order_number) completedOrderNums.add(o.order_number);
          if (o.orderNumber) completedOrderNums.add(o.orderNumber);
          if (o.id) completedOrderNums.add(String(o.id));
        }
      });

      const rawPo = localStorage.getItem('bakery_preorders');
      if (rawPo) {
        try {
          const poList = JSON.parse(rawPo);
          if (Array.isArray(poList)) {
            poList.forEach((p: any) => {
              if (isOrderCompletedOrCancelled(p)) {
                if (p.order_number) completedOrderNums.add(p.order_number);
                if (p.orderNumber) completedOrderNums.add(p.orderNumber);
                if (p.id) completedOrderNums.add(String(p.id));
              }
            });
          }
        } catch {}
      }

      const now = new Date();
      const pendingPreorders = orders.filter((o) => {
        if (!o) return false;
        // Bỏ qua tuyệt đối đơn đã hoàn thành / đã giao
        if (isOrderCompletedOrCancelled(o)) return false;

        const orderNum = o.order_number || o.orderNumber || o.id;
        if (orderNum && completedOrderNums.has(orderNum)) return false;

        return o.order_type === 'preorder' || o.preorder_pickup_at || o.order_number?.startsWith('BK-PRE');
      });

      for (const order of pendingPreorders) {
        const pickup = order.preorder_pickup_at || order.pickupDateTime;
        if (!pickup) continue;

        const urg = getDeliveryUrgency(pickup, order, now);
        if (urg.isUrgent) {
          const orderNum = order.order_number || order.orderNumber || order.id || 'ĐƠN MỚI';

          // Kiểm tra kép lại trong tập completedOrderNums
          if (completedOrderNums.has(orderNum)) {
            this.alertedUrgentMap.delete(orderNum);
            continue;
          }

          const lastAlert = this.alertedUrgentMap.get(orderNum) || 0;

          // Báo động lại sau mỗi 3 phút nếu đơn thực sự vẫn chưa được giao
          if (Date.now() - lastAlert > 180000) {
            // Kiểm tra bảo vệ thời gian thực trên Supabase: nếu đơn đã được giao từ máy khác, lập tức hủy báo động!
            if (typeof navigator !== 'undefined' && navigator.onLine && order.order_number) {
              try {
                const { data: sbCheck } = await supabase
                  .from('orders')
                  .select('status')
                  .eq('order_number', order.order_number)
                  .maybeSingle();

                if (sbCheck && isOrderCompletedOrCancelled(sbCheck)) {
                  this.markOrderCompletedLocally(order.order_number, sbCheck.status);
                  continue;
                }
              } catch {}
            }

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
      const rawDel = localStorage.getItem('bakery_deleted_order_keys');
      if (rawDel) {
        const delArr = JSON.parse(rawDel);
        if (Array.isArray(delArr)) {
          const delSet = new Set(delArr.map(String));
          const oId = String(order.id || '');
          const oNum = String(order.order_number || '');
          if ((oId && delSet.has(oId)) || (oNum && (delSet.has(oNum) || delSet.has(oNum.replace(/-LAM$/, ''))))) {
            return;
          }
        }
      }

      const fromN = parsePreorderFromNotes(order.notes);
      const isShip = (order.delivery_method || fromN.delivery_method) === 'shipping';
      const isPre = order.order_type === 'preorder' || (order.order_number && order.order_number.startsWith('BK-PRE')) || !!order.preorder_pickup_at;
      const shortage = parseOrderBakeShortage(order);

      const unified: any = {
        id: String(order.id),
        order_number: order.order_number,
        orderNumber: order.order_number,
        order_type: order.order_type || (isPre ? 'preorder' : 'takeaway'),
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
        orderQuantity: shortage.totalOrderQty,
        need_bake_qty: shortage.needBakeQty,
        ready_stock_qty: shortage.readyStockQty,
        bake_status: shortage.bakeStatus,
        is_waiting_bake: shortage.isWaitingBake,
        items: Array.isArray(order.items) && order.items.length > 0
          ? order.items
          : [
              {
                id: 'cake-item-auto',
                product_name_snapshot: fromN.cake_name || 'Bánh Đặt Trước',
                quantity: shortage.totalOrderQty || 1,
                notes: order.cake_message ? `Chữ: "${order.cake_message}"` : '',
              }
            ],
      };

      const raw = localStorage.getItem('bakery_orders');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        const idx = list.findIndex((o: any) => o.order_number === unified.order_number || o.id === unified.id);
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...unified };
        } else {
          list.unshift(unified);
        }
        localStorage.setItem('bakery_orders', JSON.stringify(pruneOrdersCache(list, MAX_CACHED_ORDERS)));
      }

      if (isPre) {
        const rawPo = localStorage.getItem('bakery_preorders');
        const poList = rawPo ? JSON.parse(rawPo) : [];
        if (Array.isArray(poList)) {
          const pIdx = poList.findIndex((o: any) => (o.order_number || o.orderNumber) === unified.order_number || o.id === unified.id);
          if (pIdx >= 0) {
            poList[pIdx] = { ...poList[pIdx], ...unified };
          } else {
            poList.unshift(unified);
          }
          localStorage.setItem('bakery_preorders', JSON.stringify(prunePreordersCache(poList, MAX_CACHED_PREORDERS)));
        }
      }

      // Kích hoạt cập nhật giao diện quầy POS và Bếp tức thì
      window.dispatchEvent(new Event('bakery_orders_updated'));
    } catch {}
  }
}

export const autoOrderWatcher = new AutoOrderWatcher();
