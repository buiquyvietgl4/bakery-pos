// public/sw.js - Tiệm Bánh ERP & POS Service Worker

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Lắng nghe sự kiện Web Push từ máy chủ khi điện thoại ĐANG TẮT MÀN HÌNH / KHÓA MÁY
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: '🎂 TIỆM BÁNH ABC', body: event.data.text() };
    }
  }

  const type = data.type || 'info';
  const isUrgent = data.isUrgent || type === 'urgent_alert' || type === 'bake_done';

  let defaultTitle = '🎂 TIỆM BÁNH ABC';
  let defaultUrl = '/pos';
  let vibratePattern = [200, 100, 200];

  if (type === 'new_order') {
    defaultTitle = '🎂 ĐƠN HÀNG MỚI';
    defaultUrl = data.orderNumber ? `/pos?order=${data.orderNumber}` : '/pos';
    vibratePattern = [200, 100, 200, 100, 200];
  } else if (type === 'urgent_alert') {
    defaultTitle = '🚨 BẾP: CẦN GIAO GẤP!';
    defaultUrl = '/kitchen';
    vibratePattern = [500, 150, 500, 150, 500];
  } else if (type === 'bake_done') {
    defaultTitle = '🔔 LÒ NƯỚNG: BÁNH ĐÃ CHÍN!';
    defaultUrl = '/kitchen';
    vibratePattern = [300, 100, 300, 100, 300, 100, 600];
  } else if (type === 'bake_start') {
    defaultTitle = '🔥 LÒ NƯỚNG: BẮT ĐẦU NƯỚNG!';
    defaultUrl = '/kitchen';
    vibratePattern = [150, 100, 150];
  } else if (type === 'bake_discharge') {
    defaultTitle = '🥖 BẾP RA LÒ: ĐÃ NHẬP KHO POS!';
    defaultUrl = '/pos';
    vibratePattern = [200, 100, 300];
  }

  const title = data.title || defaultTitle;
  const options = {
    body: data.body || data.message || 'Hệ thống Tiệm Bánh có thông báo mới.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: vibratePattern,
    tag: data.tag || ('bakery-push-' + (data.orderNumber || type || Date.now())),
    renotify: true,
    requireInteraction: isUrgent,
    data: {
      url: data.url || defaultUrl,
      orderNumber: data.orderNumber,
      type: type,
    },
    actions: [
      { action: 'open', title: '👀 Mở Xem Ngay' },
      { action: 'dismiss', title: '✕ Đóng' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Xử lý khi bấm vào thông báo trên thanh thông báo / màn hình khóa
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/pos';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.includes(self.location.origin)) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
