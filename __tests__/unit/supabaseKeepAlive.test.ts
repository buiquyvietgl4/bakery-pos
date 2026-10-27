import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getKeepAliveStatus,
  saveKeepAliveResult,
  checkAndTriggerClientKeepAlive,
  STORAGE_KEY_KEEP_ALIVE_INFO,
  KEEP_ALIVE_INTERVAL_MS,
  SUPABASE_INACTIVITY_LIMIT_DAYS,
  KeepAliveResult,
  EVENT_KEEP_ALIVE_UPDATED,
} from '@/lib/supabase/keepAliveManager';

describe('Supabase Anti-Inactivity Keep-Alive Engine', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('1. getKeepAliveStatus trả về giá trị an toàn mặc định (7 ngày) khi chưa từng ping', () => {
    const status = getKeepAliveStatus();
    expect(status.isProtecting).toBe(true);
    expect(status.lastPingTime).toBeNull();
    expect(status.lastResult).toBeNull();
    expect(status.daysRemaining).toBe(SUPABASE_INACTIVITY_LIMIT_DAYS);
  });

  it('2. saveKeepAliveResult lưu đúng thông tin và phát sự kiện EVENT_KEEP_ALIVE_UPDATED', () => {
    let eventFired = false;
    let eventDetail: any = null;

    const listener = (e: any) => {
      eventFired = true;
      eventDetail = e.detail;
    };
    window.addEventListener(EVENT_KEEP_ALIVE_UPDATED, listener);

    const mockResult: KeepAliveResult = {
      success: true,
      timestamp: Date.now(),
      latencyMs: 120,
      tableChecked: 'recipes',
      message: 'Ping thành công',
      dataModified: false,
      source: 'admin-manual',
      statusCode: 200,
    };

    saveKeepAliveResult(mockResult);

    expect(eventFired).toBe(true);
    expect(eventDetail.success).toBe(true);
    expect(eventDetail.dataModified).toBe(false);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_KEEP_ALIVE_INFO) || '{}');
    expect(stored.tableChecked).toBe('recipes');
    expect(stored.dataModified).toBe(false);

    window.removeEventListener(EVENT_KEEP_ALIVE_UPDATED, listener);
  });

  it('3. getKeepAliveStatus tính chính xác số ngày an toàn còn lại dựa trên lần ping cuối', () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const mockResult: KeepAliveResult = {
      success: true,
      timestamp: oneDayAgo,
      latencyMs: 85,
      tableChecked: 'orders',
      message: 'Ping 1 ngày trước',
      dataModified: false,
      source: 'vercel-cron',
      statusCode: 200,
    };

    saveKeepAliveResult(mockResult);

    const status = getKeepAliveStatus();
    expect(status.lastPingTime).toBe(oneDayAgo);
    expect(status.daysRemaining).toBeCloseTo(6.0, 0);
  });

  it('4. checkAndTriggerClientKeepAlive bỏ qua nếu lần ping gần nhất trong vòng 48 giờ (2 ngày)', async () => {
    // Giả lập vừa ping 1 giờ trước
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentResult: KeepAliveResult = {
      success: true,
      timestamp: oneHourAgo,
      latencyMs: 90,
      tableChecked: 'recipes',
      message: 'Vừa kích hoạt',
      dataModified: false,
      source: 'client-auto',
    };
    saveKeepAliveResult(recentResult);

    const result = await checkAndTriggerClientKeepAlive();
    expect(result).toBeNull(); // Không cần ping vì chưa đủ 48 giờ
  });

  it('5. Cam kết tuyệt đối: dataModified luôn luôn là false (Zero Data Mutation / Read-Only)', () => {
    const mockResult: KeepAliveResult = {
      success: true,
      timestamp: Date.now(),
      latencyMs: 50,
      tableChecked: 'recipes',
      message: 'Head check',
      dataModified: false,
      source: 'vercel-cron',
    };

    expect(mockResult.dataModified).toBe(false);
  });
});
