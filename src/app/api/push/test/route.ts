import { NextResponse } from 'next/server';
import { sendWebPushToAll } from '@/lib/server/webPushServer';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const now = new Date();
    const result = await sendWebPushToAll({
      title: '🎂 TIỆM BÁNH ABC: KIỂM TRA THÔNG BÁO PWA',
      body: `✅ Điện thoại của bạn đã kết nối nhận thông báo trực tiếp thành công lúc ${now.toLocaleTimeString('vi-VN')}! Ngay cả khi tắt màn hình, chuông vẫn sẽ reo!`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      url: '/kitchen',
      type: 'test',
      isUrgent: false,
    });

    return NextResponse.json({
      success: true,
      message: `Đã phát lệnh gửi tới ${result.totalDevices} thiết bị (${result.sentCount} thành công)!`,
      stats: result,
    });
  } catch (err: any) {
    console.error('API /api/push/test error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
