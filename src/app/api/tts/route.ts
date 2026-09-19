import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get('text') || searchParams.get('q');

    if (!text || !text.trim()) {
      return new NextResponse('Missing text parameter', { status: 400 });
    }

    // Giới hạn độ dài câu thông báo tối đa 250 ký tự để phản hồi nhanh
    const sanitizedText = text.trim().slice(0, 250);
    const googleTtsUrl = 'https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=' + encodeURIComponent(sanitizedText);

    const res = await fetch(googleTtsUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'audio/mpeg, audio/*;q=0.9',
      },
    });

    if (!res.ok) {
      return new NextResponse('Failed to fetch TTS audio', { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    console.error('Error in /api/tts:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
