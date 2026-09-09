// src/lib/utils/webPushManager.ts
// Quản lý đăng ký và kích hoạt Web Push trực tiếp cho PWA
import { addNotificationLog } from './notificationHistory';

const FALLBACK_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BBRxBu4Wou9gEIrPivlSVhGHcdjEF-8RF5phrRvIxyp6sfQJNCdYOpxc3Uu9qcgE9tao7zRDH1ZvEWL1zyDKU84';

export interface PushStatusInfo {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  endpoint?: string;
  totalDevices: number;
}

export interface ClientPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  type?: 'new_order' | 'urgent_alert' | 'bake_done' | 'bake_start' | 'bake_discharge' | 'test';
  isUrgent?: boolean;
  orderNumber?: string;
}

/**
 * Chuyển đổi mã chuỗi Base64 của VAPID Public Key thành Uint8Array
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Kiểm tra xem trình duyệt / thiết bị hiện tại có hỗ trợ Service Worker và Web Push không
 */
export function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Lấy Service Worker Registration hiện tại
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isWebPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) return reg;
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('Lỗi đăng ký Service Worker:', err);
    return null;
  }
}

/**
 * Kiểm tra trạng thái đăng ký của thiết bị hiện tại
 */
export async function checkPushSubscriptionStatus(): Promise<PushStatusInfo> {
  if (!isWebPushSupported()) {
    return {
      isSupported: false,
      permission: 'unsupported',
      isSubscribed: false,
      totalDevices: 0,
    };
  }

  const permission = Notification.permission;
  let isSubscribed = false;
  let endpoint: string | undefined = undefined;
  let totalDevices = 0;

  try {
    const reg = await getServiceWorkerRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        isSubscribed = true;
        endpoint = sub.endpoint;
      }
    }

    // Hỏi server tổng số thiết bị đã đăng ký
    const res = await fetch(`/api/push/subscribe${endpoint ? '?endpoint=' + encodeURIComponent(endpoint) : ''}`);
    if (res.ok) {
      const data = await res.json();
      totalDevices = data.totalDevices || 0;
      if (data.isSubscribed !== undefined) {
        isSubscribed = data.isSubscribed;
      }
    }
  } catch (err) {
    console.warn('Lỗi kiểm tra push status:', err);
  }

  return {
    isSupported: true,
    permission,
    isSubscribed,
    endpoint,
    totalDevices,
  };
}

/**
 * Đăng ký thiết bị hiện tại nhận thông báo Push từ máy chủ
 */
export async function subscribeCurrentDeviceToPush(deviceLabel?: string): Promise<{
  success: boolean;
  message: string;
  totalDevices?: number;
}> {
  if (!isWebPushSupported()) {
    return {
      success: false,
      message: 'Thiết bị hoặc trình duyệt này không hỗ trợ Web Push. (Nếu dùng iPhone, vui lòng mở bằng Safari và bấm "Thêm vào Màn hình chính").',
    };
  }

  try {
    // 1. Xin quyền thông báo
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        message: 'Bạn chưa cấp quyền thông báo. Vui lòng bấm "Cho phép" trong cài đặt trình duyệt.',
      };
    }

    // 2. Lấy VAPID public key
    let publicKey = FALLBACK_VAPID_PUBLIC_KEY;
    try {
      const keyRes = await fetch('/api/push/vapid-key');
      if (keyRes.ok) {
        const keyData = await keyRes.json();
        if (keyData.publicKey) publicKey = keyData.publicKey;
      }
    } catch {}

    // 3. Đăng ký qua Service Worker PushManager
    const reg = await getServiceWorkerRegistration();
    if (!reg) {
      return { success: false, message: 'Không thể khởi động Service Worker.' };
    }

    // Nếu đã có subscription cũ thì lấy lại hoặc tạo mới
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });
    }

    // 4. Gửi subscription lên Backend API để lưu vào CSDL Supabase
    const deviceInfo = deviceLabel || (
      /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iPhone PWA' :
      /Android/.test(navigator.userAgent) ? 'Android PWA' :
      /Windows/.test(navigator.userAgent) ? 'Windows PC' :
      /Macintosh/.test(navigator.userAgent) ? 'Mac OS' : 'Trình duyệt Web'
    );

    const subJson = subscription.toJSON();
    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subJson,
        deviceInfo: `${deviceInfo} (${new Date().toLocaleTimeString('vi-VN')})`,
      }),
    });

    const saveData = await saveRes.json();
    if (!saveRes.ok || !saveData.success) {
      return {
        success: false,
        message: saveData.error || 'Lỗi khi lưu thông tin thiết bị lên máy chủ.',
      };
    }

    return {
      success: true,
      message: 'Đăng ký nhận thông báo trực tiếp PWA thành công!',
      totalDevices: saveData.totalDevices,
    };
  } catch (err: any) {
    console.error('Lỗi subscribeCurrentDeviceToPush:', err);
    return {
      success: false,
      message: err.message || 'Lỗi kết nối khi đăng ký Web Push.',
    };
  }
}

/**
 * Hủy đăng ký thông báo Push trên thiết bị hiện tại
 */
export async function unsubscribeCurrentDeviceFromPush(): Promise<{ success: boolean; message: string }> {
  try {
    const reg = await getServiceWorkerRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        });
      }
    }
    return { success: true, message: 'Đã hủy nhận thông báo trên thiết bị này.' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Lỗi khi hủy nhận thông báo.' };
  }
}

/**
 * Bắn thông báo đẩy từ Client gọi Backend Server phát sóng tới toàn bộ thiết bị
 */
export async function triggerServerPush(payload: ClientPushPayload): Promise<{ success: boolean; stats?: any }> {
  try {
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    // Ghi vào lịch sử thông báo
    try {
      addNotificationLog({
        type: (payload.type as any) || (payload.isUrgent ? 'urgent_alert' : 'new_order'),
        title: payload.title,
        message: payload.body,
        orderNumber: payload.orderNumber,
        url: payload.url,
        channel: 'pwa',
        sender: 'PWA Web Push Server',
      });
    } catch {}

    return { success: res.ok, stats: data.stats };
  } catch (err) {
    console.warn('triggerServerPush warning:', err);
    return { success: false };
  }
}

/**
 * Gửi thông báo mẫu thử nghiệm từ Backend
 */
export async function triggerTestPush(): Promise<{ success: boolean; message: string; stats?: any }> {
  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();

    if (res.ok && data.success) {
      try {
        addNotificationLog({
          type: 'test',
          title: '🔔 [Thử Nghiệm] Thông Báo PWA Trực Tiếp',
          message: 'Kiểm tra nhận thông báo đẩy khi khóa máy hoặc tắt app trên điện thoại thành công!',
          channel: 'pwa',
          sender: 'Máy Chủ PWA',
        });
      } catch {}
    }

    return {
      success: res.ok && data.success,
      message: data.message || 'Đã gửi lệnh thử nghiệm',
      stats: data.stats,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Không thể kết nối máy chủ gửi thử nghiệm',
    };
  }
}
