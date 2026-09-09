import { NextRequest, NextResponse } from 'next/server';
import { savePushSubscription, getAllPushSubscriptions } from '@/lib/server/webPushServer';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const list = await getAllPushSubscriptions();
    const endpointParam = req.nextUrl.searchParams.get('endpoint');
    const isSubscribed = endpointParam ? list.some(s => s.endpoint === endpointParam) : false;

    return NextResponse.json({
      totalDevices: list.length,
      isSubscribed,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscription, deviceInfo } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return NextResponse.json({ error: 'Dữ liệu subscription không hợp lệ' }, { status: 400 });
    }

    const userAgent = req.headers.get('user-agent') || 'Unknown';
    const result = await savePushSubscription({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      device_info: deviceInfo || 'Thiết bị Web/PWA',
      user_agent: userAgent,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Không thể lưu subscription' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Đăng ký nhận thông báo PWA thành công!',
      totalDevices: result.total,
    });
  } catch (err: any) {
    console.error('API /api/push/subscribe error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
