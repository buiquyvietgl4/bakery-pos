import webpush from 'web-push';
import { supabase } from '@/lib/supabase/client';

export interface StoredSubscription {
  id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  device_info?: string;
  user_agent?: string;
  created_at: string;
}

export interface PushMessagePayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  type?: 'new_order' | 'urgent_alert' | 'bake_done' | 'bake_start' | 'bake_discharge' | 'test';
  isUrgent?: boolean;
  orderNumber?: string;
}

const DB_ROW_NAME = 'SYS_PUSH_SUBSCRIPTIONS';
const DB_ROW_ID = '00000000-0000-0000-0000-000000000002';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BBRxBu4Wou9gEIrPivlSVhGHcdjEF-8RF5phrRvIxyp6sfQJNCdYOpxc3Uu9qcgE9tao7zRDH1ZvEWL1zyDKU84';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'xix0rTLV9hqExYqk0InzRAMbhMrYWh-RIPO0mm3ApCw';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@tiembanh.com';

let isVapidConfigured = false;

export function ensureVapidConfig() {
  if (!isVapidConfigured) {
    try {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      isVapidConfigured = true;
    } catch (err) {
      console.warn('VAPID setVapidDetails error:', err);
    }
  }
}

export async function getAllPushSubscriptions(): Promise<StoredSubscription[]> {
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .eq('name', DB_ROW_NAME)
      .maybeSingle();

    if (!error && data && data.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Lỗi nạp push subscriptions từ SQL:', err);
  }
  return [];
}

export async function savePushSubscription(sub: Omit<StoredSubscription, 'id' | 'created_at'>): Promise<{ success: boolean; total: number; error?: string }> {
  try {
    const existing = await getAllPushSubscriptions();
    const filtered = existing.filter((item) => item.endpoint !== sub.endpoint);
    const newRecord: StoredSubscription = {
      ...sub,
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      created_at: new Date().toISOString(),
    };
    const updated = [newRecord, ...filtered];

    await supabase.from('recipes').delete().eq('name', DB_ROW_NAME);
    const { error } = await supabase.from('recipes').insert({
      id: DB_ROW_ID,
      name: DB_ROW_NAME,
      notes: JSON.stringify(updated),
      is_active: false,
    });

    if (error) throw error;
    return { success: true, total: updated.length };
  } catch (err: any) {
    console.error('Lỗi lưu push subscription:', err);
    return { success: false, total: 0, error: err?.message || 'Lỗi lưu dữ liệu' };
  }
}

export async function removePushSubscription(endpoint: string): Promise<{ success: boolean; total: number; error?: string }> {
  try {
    const existing = await getAllPushSubscriptions();
    const updated = existing.filter((item) => item.endpoint !== endpoint);

    await supabase.from('recipes').delete().eq('name', DB_ROW_NAME);
    const { error } = await supabase.from('recipes').insert({
      id: DB_ROW_ID,
      name: DB_ROW_NAME,
      notes: JSON.stringify(updated),
      is_active: false,
    });

    if (error) throw error;
    return { success: true, total: updated.length };
  } catch (err: any) {
    console.error('Lỗi xóa push subscription:', err);
    return { success: false, total: 0, error: err?.message || 'Lỗi xóa thiết bị' };
  }
}

export async function sendWebPushToAll(payload: PushMessagePayload): Promise<{
  totalDevices: number;
  sentCount: number;
  failedCount: number;
  purgedCount: number;
}> {
  ensureVapidConfig();
  const subscriptions = await getAllPushSubscriptions();
  if (subscriptions.length === 0) {
    return { totalDevices: 0, sentCount: 0, failedCount: 0, purgedCount: 0 };
  }

  const payloadString = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-192.png',
    tag: payload.tag || ('bakery-' + Date.now()),
    url: payload.url || '/pos',
    type: payload.type || 'info',
    isUrgent: payload.isUrgent || false,
    orderNumber: payload.orderNumber,
  });

  let sentCount = 0;
  let failedCount = 0;
  const expiredEndpoints: string[] = [];

  const promises = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        payloadString,
        {
          TTL: 60 * 60 * 24, // 24 hours
          urgency: payload.isUrgent ? 'high' : 'normal',
        }
      );
      sentCount++;
    } catch (err: any) {
      failedCount++;
      // 410 Gone hoặc 404 Not Found: thiết bị đã gỡ app hoặc hủy quyền
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredEndpoints.push(sub.endpoint);
      } else {
        console.warn('Lỗi gửi Web Push cho thiết bị:', err.message || err);
      }
    }
  });

  await Promise.allSettled(promises);

  // Tự động xóa các subscription đã chết
  if (expiredEndpoints.length > 0) {
    try {
      const active = subscriptions.filter((s) => !expiredEndpoints.includes(s.endpoint));
      await supabase.from('recipes').delete().eq('name', DB_ROW_NAME);
      await supabase.from('recipes').insert({
        id: DB_ROW_ID,
        name: DB_ROW_NAME,
        notes: JSON.stringify(active),
        is_active: false,
      });
    } catch (cleanErr) {
      console.error('Lỗi dọn dẹp subscription hết hạn:', cleanErr);
    }
  }

  return {
    totalDevices: subscriptions.length,
    sentCount,
    failedCount,
    purgedCount: expiredEndpoints.length,
  };
}
