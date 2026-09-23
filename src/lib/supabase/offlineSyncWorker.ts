// src/lib/supabase/offlineSyncWorker.ts
// Background Worker: Tự động quét và đẩy bù (Catch-up sync) các đơn hàng tạo khi offline/mất mạng lên Supabase SQL

import { db } from '@/lib/db/dexie';
import { syncOrderToSupabase, broadcastNewOrder } from './realtimeSync';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

class OfflineSyncWorker {
  private isRunning: boolean = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;

  public start() {
    if (this.isRunning || typeof window === 'undefined') return;
    this.isRunning = true;

    // 1. Quét định kỳ mỗi 20 giây
    this.intervalTimer = setInterval(() => {
      this.flushPendingOrders();
    }, 20000);

    // 2. Kích hoạt tức thì khi trình duyệt có mạng trở lại
    window.addEventListener('online', this.handleOnline);

    // 3. Chạy 1 vòng quét khởi động sau 1.5 giây
    setTimeout(() => {
      this.notifyQueueChanged();
      this.flushPendingOrders();
    }, 1500);

    console.log('🚀 OfflineSyncWorker started - Sẵn sàng tự động đẩy bù đơn offline lên Supabase SQL');
  }

  public stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
    this.isRunning = false;
  }

  private handleOnline = () => {
    console.log('🌐 Kết nối mạng phục hồi - Kích hoạt đẩy bù đơn hàng offline ngay lập tức');
    this.flushPendingOrders();
  };

  /**
   * Đếm số lượng đơn hàng đang tồn trong hàng đợi offline chưa được đồng bộ
   */
  public async getPendingOrdersCount(): Promise<number> {
    if (typeof window === 'undefined') return 0;
    try {
      let dexieCount = 0;
      try {
        dexieCount = await db.orders
          .filter((o: any) => o.sync_status === 'pending' || o.is_offline === true)
          .count();
      } catch {}

      let localCount = 0;
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            localCount = arr.filter((o: any) => o.sync_status === 'pending' || o.is_offline === true).length;
          }
        }
      } catch {}

      return Math.max(dexieCount, localCount);
    } catch {
      return 0;
    }
  }

  /**
   * Phát thông báo cập nhật số lượng đơn trong hàng đợi offline cho Header và toàn hệ thống
   */
  public notifyQueueChanged(count?: number) {
    if (typeof window === 'undefined') return;
    if (typeof count === 'number') {
      window.dispatchEvent(new CustomEvent('bakery_offline_queue_changed', { detail: { count } }));
    } else {
      this.getPendingOrdersCount().then((c) => {
        window.dispatchEvent(new CustomEvent('bakery_offline_queue_changed', { detail: { count: c } }));
      });
    }
  }

  /**
   * Quét và đẩy toàn bộ các đơn hàng chưa đồng bộ lên Supabase Cloud SQL
   */
  public async flushPendingOrders(): Promise<{ syncedCount: number; errors: any[] }> {
    if (this.isSyncing || typeof window === 'undefined') return { syncedCount: 0, errors: [] };
    if (typeof navigator !== 'undefined' && !navigator.onLine) return { syncedCount: 0, errors: [] };
    if (isLocalMode()) return { syncedCount: 0, errors: [] };

    this.isSyncing = true;
    let syncedCount = 0;
    const errors: any[] = [];

    try {
      // A. Thu thập các đơn pending từ Dexie DB
      let dexiePending: any[] = [];
      try {
        dexiePending = await db.orders
          .filter((o: any) => o.sync_status === 'pending' || o.is_offline === true)
          .toArray();
      } catch (dErr) {
        console.warn('Lỗi đọc pending orders từ Dexie:', dErr);
      }

      // B. Thu thập các đơn pending từ localStorage
      let localPending: any[] = [];
      let fullLocalOrders: any[] = [];
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          fullLocalOrders = JSON.parse(raw);
          if (Array.isArray(fullLocalOrders)) {
            localPending = fullLocalOrders.filter(
              (o: any) => o.sync_status === 'pending' || o.is_offline === true
            );
          }
        }
      } catch {}

      // C. Hợp nhất danh sách đơn cần đẩy bù (tránh trùng lặp theo order_number)
      const pendingMap = new Map<string, any>();
      dexiePending.forEach((o) => {
        const key = o.order_number || o.orderNumber || o.id;
        if (key) pendingMap.set(key, o);
      });
      localPending.forEach((o) => {
        const key = o.order_number || o.orderNumber || o.id;
        if (key && !pendingMap.has(key)) pendingMap.set(key, o);
      });

      // Lọc bỏ bất kỳ đơn nào đã bị xóa vĩnh viễn khỏi hàng đợi đẩy lên đám mây
      const deletedKeys = new Set<string>();
      try {
        const rawDel = localStorage.getItem('bakery_deleted_order_keys');
        if (rawDel) {
          const arr = JSON.parse(rawDel);
          if (Array.isArray(arr)) arr.forEach((k: any) => deletedKeys.add(String(k)));
        }
      } catch {}

      let ordersToSync = Array.from(pendingMap.values());
      if (deletedKeys.size > 0) {
        ordersToSync = ordersToSync.filter((o) => {
          const k1 = o.order_number ? String(o.order_number) : '';
          const k2 = o.orderNumber ? String(o.orderNumber) : '';
          const k3 = o.id ? String(o.id) : '';
          const k4 = o.local_id ? String(o.local_id) : '';
          return !deletedKeys.has(k1) && !deletedKeys.has(k2) && !deletedKeys.has(k3) && !deletedKeys.has(k4);
        });
      }

      if (ordersToSync.length === 0) {
        this.notifyQueueChanged(0);
        return { syncedCount: 0, errors: [] };
      }

      this.notifyQueueChanged(ordersToSync.length);
      console.log(`⏳ Tìm thấy ${ordersToSync.length} đơn hàng offline đang chờ đẩy lên Supabase SQL...`);

      let hasLocalChanges = false;

      for (const order of ordersToSync) {
        try {
          const status = order.status || 'completed';
          await syncOrderToSupabase(order, status);
          await broadcastNewOrder(order).catch(() => {});

          // Đánh dấu đã đồng bộ trong Dexie DB
          try {
            const keyId = order.local_id || order.id;
            if (keyId) {
              await db.orders.update(keyId, {
                sync_status: 'synced',
                is_offline: false,
              } as any);
            }
          } catch {}

          // Đánh dấu đã đồng bộ trong localStorage
          const orderNum = order.order_number || order.orderNumber || order.id;
          const idx = fullLocalOrders.findIndex(
            (lo: any) => (lo.order_number || lo.orderNumber || lo.id) === orderNum
          );
          if (idx >= 0) {
            fullLocalOrders[idx] = {
              ...fullLocalOrders[idx],
              sync_status: 'synced',
              is_offline: false,
            };
            hasLocalChanges = true;
          }

          syncedCount++;
          console.log(`✅ Đã đẩy bù thành công đơn offline #${orderNum} lên Supabase SQL!`);
        } catch (syncErr) {
          console.warn(`❌ Lỗi đẩy bù đơn #${order.order_number}:`, syncErr);
          errors.push(syncErr);
        }
      }

      // Cập nhật lại localStorage nếu có thay đổi
      if (hasLocalChanges) {
        localStorage.setItem('bakery_orders', JSON.stringify(fullLocalOrders));
        window.dispatchEvent(new Event('bakery_orders_updated'));
      }

      // Tự động cập nhật file Local SQL trên máy nếu có đơn vừa được đẩy thành công
      if (syncedCount > 0) {
        autoSyncToLocalSqlFolder().catch(() => {});
      }
    } catch (err) {
      console.warn('Lỗi trong chu kỳ OfflineSyncWorker:', err);
    } finally {
      this.isSyncing = false;
      this.notifyQueueChanged();
    }

    return { syncedCount, errors };
  }
}

export const offlineSyncWorker = new OfflineSyncWorker();
