import { NextRequest, NextResponse } from 'next/server';
import { removePushSubscription } from '@/lib/server/webPushServer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json({ error: 'Thiếu endpoint cần hủy' }, { status: 400 });
    }

    const result = await removePushSubscription(endpoint);
    return NextResponse.json({
      success: true,
      totalDevices: result.total,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
