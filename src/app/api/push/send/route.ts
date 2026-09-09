import { NextRequest, NextResponse } from 'next/server';
import { sendWebPushToAll, PushMessagePayload } from '@/lib/server/webPushServer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body: PushMessagePayload = await req.json();

    if (!body || !body.title) {
      return NextResponse.json({ error: 'Tiêu đề thông báo không được để trống' }, { status: 400 });
    }

    const result = await sendWebPushToAll(body);

    return NextResponse.json({
      success: true,
      stats: result,
    });
  } catch (err: any) {
    console.error('API /api/push/send error:', err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
