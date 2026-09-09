// src/lib/utils/phoneNotification.ts

import { soundManager } from './audioAlert';
import { addNotificationLog } from './notificationHistory';

export interface PhoneNotificationPayload {
  id: string;
  type: 'new_order' | 'urgent_alert' | 'info';
  appTitle?: string;
  title: string;
  subtitle?: string;
  sender?: string;
  message: string;
  extraDetails?: string;
  orderNumber?: string;
  pickupTime?: string;
  url?: string;
  channel?: 'in_app' | 'pwa' | 'telegram' | 'native' | 'system';
  onAction?: () => void;
  actionLabel?: string;
}

class PhoneNotificationService {
  private swRegistration: ServiceWorkerRegistration | null = null;
  private isRegistered: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initServiceWorker();
    }
  }

  public async initServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return null;
    }
    try {
      if (this.swRegistration) return this.swRegistration;
      const reg = await navigator.serviceWorker.register('/sw.js');
      this.swRegistration = reg;
      this.isRegistered = true;
      return reg;
    } catch (e) {
      console.warn('SW registration notice:', e);
      return null;
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  public getPermission(): NotificationPermission | 'unsupported' {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  public isGranted(): boolean {
    return this.isSupported() && Notification.permission === 'granted';
  }

  /**
   * Yêu cầu quyền gửi thông báo từ người dùng
   */
  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) {
      alert('Trình duyệt trên thiết bị này không hỗ trợ Web Notification.');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        await this.initServiceWorker();
        // Rung nhẹ & phát chuông xác nhận đã bật
        this.vibrate([100, 50, 100]);
        soundManager.playNewOrderChime();

        // Gửi ngay 1 thông báo mẫu để người dùng thấy trên thanh thông báo điện thoại
        await this.sendNativeNotification({
          title: '🎂 Tiệm Bánh ABC: Đã bật thông báo!',
          body: 'Bạn sẽ nhận được thông báo như tin nhắn khi có đơn làm bánh mới hoặc đơn cần giao gấp.',
          tag: 'welcome-notification',
          url: '/pos'
        });
        return true;
      }
      return false;
    } catch (e) {
      console.error('Request notification permission failed:', e);
      return false;
    }
  }

  /**
   * Rung phản hồi điện thoại (Mobile Vibration API)
   */
  public vibrate(pattern: number | number[] = [200, 100, 200]) {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }

  /**
   * Gửi thông báo hệ thống điện thoại (Web Notification / Service Worker Push)
   */
  public async sendNativeNotification(options: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    url?: string;
  }) {
    if (!this.isGranted()) return false;

    const iconUrl = options.icon || '/icon-192.png';
    const badgeUrl = options.badge || '/icon-192.png';
    const tag = options.tag || 'bakery-msg-' + Date.now();

    try {
      const reg = this.swRegistration || (await this.initServiceWorker());
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(options.title, {
          body: options.body,
          icon: iconUrl,
          badge: badgeUrl,
          tag: tag,
          vibrate: [200, 100, 200],
          data: { url: options.url || '/pos' }
        } as any);
        return true;
      }
    } catch (swErr) {
      console.warn('SW notification fallback to window.Notification:', swErr);
    }

    // Fallback: new Notification
    try {
      const notif = new Notification(options.title, {
        body: options.body,
        icon: iconUrl,
        badge: badgeUrl,
        tag: tag
      });
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
      return true;
    } catch (e) {
      console.warn('Native notification failed:', e);
      return false;
    }
  }

  /**
   * Phát thông báo kép: Vừa gửi thông báo hệ thống điện thoại, vừa kích hoạt banner tin nhắn nổi trong app
   * Đồng thời tự động ghi nhận vào Lịch Sử Thông Báo (Notification History Store)
   */
  public triggerOrderNotification(payload: PhoneNotificationPayload) {
    // 1. Rung điện thoại
    if (payload.type === 'urgent_alert') {
      this.vibrate([300, 100, 300, 100, 300]);
      soundManager.playUrgentAlert();
    } else {
      this.vibrate([200, 100, 200]);
      soundManager.playNewOrderChime();
    }

    // 2. Gửi thông báo hệ thống ngoài màn hình điện thoại (nếu đã cấp quyền)
    if (this.isGranted()) {
      const senderText = payload.sender ? payload.sender + ': ' : '';
      this.sendNativeNotification({
        title: payload.title,
        body: `${senderText}${payload.message}`,
        tag: 'order-' + (payload.orderNumber || payload.id),
        url: payload.url || (payload.orderNumber ? `/pos?order=${payload.orderNumber}` : '/pos')
      });
    }

    // 3. Bắn CustomEvent để banner tin nhắn nổi trượt xuống trên màn hình
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('phone_message_banner', {
          detail: payload
        })
      );
    }

    // 4. Lưu vào lịch sử thông báo (Notification History Store)
    try {
      let notifType: any = payload.type;
      const lowerTitle = (payload.title || '').toLowerCase();
      if (lowerTitle.includes('bắt đầu nướng') || lowerTitle.includes('cho vào lò')) {
        notifType = 'bake_start';
      } else if (lowerTitle.includes('bánh đã chín') || lowerTitle.includes('cần ra lò')) {
        notifType = 'bake_done';
      } else if (lowerTitle.includes('đã ra lò') || lowerTitle.includes('xuất xưởng')) {
        notifType = 'bake_discharge';
      } else if (payload.type === 'urgent_alert' || lowerTitle.includes('gấp') || lowerTitle.includes('báo động') || lowerTitle.includes('quá hạn')) {
        notifType = 'urgent_alert';
      } else if (lowerTitle.includes('đơn') || payload.orderNumber) {
        notifType = 'new_order';
      }

      addNotificationLog({
        id: payload.id,
        type: notifType,
        title: payload.title,
        message: payload.message,
        sender: payload.sender || (lowerTitle.includes('lò') || lowerTitle.includes('bếp') ? 'Bếp & Lò Nướng' : 'Quầy Thu Ngân'),
        orderNumber: payload.orderNumber,
        url: payload.url || (payload.orderNumber ? `/pos?order=${payload.orderNumber}` : (lowerTitle.includes('lò') || lowerTitle.includes('bếp') ? '/kitchen' : '/pos')),
        extraDetails: payload.extraDetails || payload.subtitle,
        channel: payload.channel || 'in_app',
      });
    } catch (logErr) {
      console.warn('Lỗi ghi log lịch sử thông báo:', logErr);
    }
  }
}

export const phoneNotificationService = new PhoneNotificationService();
