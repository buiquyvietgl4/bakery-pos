import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isDuplicateNotification,
  deduplicateNotifications,
  addNotificationLog,
  getNotificationHistory,
  clearNotificationHistory,
  NotificationLogItem,
} from '@/lib/utils/notificationHistory';

describe('Notification Deduplication Engine', () => {
  beforeEach(() => {
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        Object.keys(store).forEach((k) => delete store[k]);
      },
    });
    clearNotificationHistory();
  });

  it('phát hiện đúng thông báo trùng lặp giữa In-App và PWA cho cùng 1 đơn hàng', () => {
    const inAppNotif: NotificationLogItem = {
      id: 'notif-1728200000000-abc1',
      type: 'new_order',
      title: '🎂 Đơn Bánh Sinh Nhật Mới #BK-20261006-0001',
      message: 'Bánh Kem Bắp • SL: 1 cái • Hẹn: 18:00',
      timestamp: 1728200000000,
      createdAtFormatted: '18:00:00 06/10/2026',
      isRead: false,
      sender: 'Quầy Thu Ngân',
      orderNumber: 'BK-20261006-0001',
      channel: 'in_app',
    };

    const pwaNotif: NotificationLogItem = {
      id: 'notif-1728200000150-xyz2',
      type: 'new_order',
      title: '🎂 ĐƠN BÁNH SINH NHẬT MỚI #BK-20261006-0001',
      message: 'Khách hàng Nguyễn Văn A • Bánh Kem Bắp',
      timestamp: 1728200000150,
      createdAtFormatted: '18:00:00 06/10/2026',
      isRead: false,
      sender: 'PWA Web Push Server',
      orderNumber: 'BK-20261006-0001',
      channel: 'pwa',
    };

    expect(isDuplicateNotification(inAppNotif, pwaNotif)).toBe(true);
    expect(isDuplicateNotification(pwaNotif, inAppNotif)).toBe(true);
  });

  it('loại bỏ bản sao PWA và ưu tiên giữ thông tin chi tiết In-App trong deduplicateNotifications', () => {
    const list: NotificationLogItem[] = [
      {
        id: 'pwa-clone',
        type: 'new_order',
        title: '🎂 ĐƠN BÁNH SINH NHẬT MỚI #BK-101',
        message: 'Khách A • Bánh Bắp',
        timestamp: 1728200000100,
        createdAtFormatted: '18:00:00 06/10/2026',
        isRead: false,
        sender: 'PWA Web Push Server',
        orderNumber: 'BK-101',
        channel: 'pwa',
      },
      {
        id: 'in-app-original',
        type: 'new_order',
        title: '🎂 Đơn Bánh Sinh Nhật Mới #BK-101',
        message: 'Bánh Bắp • SL: 1 cái • Hẹn: 18:00 • Ghi: "Chúc Mừng Sinh Nhật"',
        timestamp: 1728200000000,
        createdAtFormatted: '18:00:00 06/10/2026',
        isRead: false,
        sender: 'Thu Ngân Mai',
        orderNumber: 'BK-101',
        channel: 'in_app',
      },
    ];

    const result = deduplicateNotifications(list);
    expect(result.length).toBe(1);
    expect(result[0].sender).toBe('Thu Ngân Mai');
    expect(result[0].channel).toBe('in_app');
    expect(result[0].message).toContain('Chúc Mừng Sinh Nhật');
  });

  it('addNotificationLog không nhân đôi thông báo khi cùng 1 sự kiện được gọi nhiều lần', () => {
    // 1. In-app gọi tạo thông báo
    addNotificationLog({
      type: 'new_order',
      title: '🎂 Đơn Bánh Sinh Nhật Mới #BK-888',
      message: 'Bánh Tiramisu 20cm',
      orderNumber: 'BK-888',
      channel: 'in_app',
      sender: 'Quầy Thu Ngân',
    });

    let history = getNotificationHistory();
    expect(history.length).toBe(1);
    expect(history[0].orderNumber).toBe('BK-888');

    // 2. Kênh PWA push cố gắng ghi thêm log lần 2 cho cùng đơn hàng
    addNotificationLog({
      type: 'new_order',
      title: '🎂 ĐƠN BÁNH SINH NHẬT MỚI #BK-888',
      message: 'Khách VIP • Bánh Tiramisu 20cm',
      orderNumber: 'BK-888',
      channel: 'pwa',
      sender: 'PWA Web Push Server',
    });

    // Số lượng thông báo vẫn chỉ là 1, không hề bị nhân đôi!
    history = getNotificationHistory();
    expect(history.length).toBe(1);
    expect(history[0].channel).toBe('in_app');
    expect(history[0].sender).toBe('Quầy Thu Ngân');
  });

  it('phát hiện và khử trùng lặp cho sự kiện lò nướng bếp (bake_done)', () => {
    const bakeInApp: NotificationLogItem = {
      id: 'oven-done-b1',
      type: 'bake_done',
      title: '🔔 BÁNH ĐÃ NƯỚNG XONG: Bánh Mì Bơ Tỏi',
      message: 'Mẻ nướng 10 cái đã hoàn thành!',
      timestamp: 1728200005000,
      createdAtFormatted: '18:00:05 06/10/2026',
      isRead: false,
      sender: 'Lò nướng: 10 cái (180°C)',
      channel: 'in_app',
    };

    const bakePwa: NotificationLogItem = {
      id: 'notif-oven-pwa',
      type: 'bake_done',
      title: '🔔 LÒ NƯỚNG: BÁNH ĐÃ CHÍN!',
      message: 'Mẻ 10 cái Bánh Mì Bơ Tỏi đã nướng xong!',
      timestamp: 1728200005200,
      createdAtFormatted: '18:00:05 06/10/2026',
      isRead: false,
      sender: 'PWA Web Push Server',
      channel: 'pwa',
    };

    expect(isDuplicateNotification(bakeInApp, bakePwa)).toBe(true);

    const deduped = deduplicateNotifications([bakeInApp, bakePwa]);
    expect(deduped.length).toBe(1);
    expect(deduped[0].channel).toBe('in_app');
    expect(deduped[0].sender).toBe('Lò nướng: 10 cái (180°C)');
  });

  it('giữ nguyên các thông báo khác nhau cho các đơn hàng hoặc giai đoạn khác nhau', () => {
    const order1: NotificationLogItem = {
      id: 'o1',
      type: 'new_order',
      title: '🎂 Đơn Bánh Mới #BK-101',
      message: 'Bánh Mì',
      timestamp: 1728200000000,
      createdAtFormatted: '18:00:00',
      isRead: false,
      orderNumber: 'BK-101',
      channel: 'in_app',
    };

    const order2: NotificationLogItem = {
      id: 'o2',
      type: 'new_order',
      title: '🛒 Đơn Bán Mới #BK-102',
      message: 'Bánh Chuối',
      timestamp: 1728200001000,
      createdAtFormatted: '18:00:01',
      isRead: false,
      orderNumber: 'BK-102',
      channel: 'in_app',
    };

    expect(isDuplicateNotification(order1, order2)).toBe(false);

    const deduped = deduplicateNotifications([order1, order2]);
    expect(deduped.length).toBe(2);
  });
});
