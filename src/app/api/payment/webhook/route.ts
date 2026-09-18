// src/app/api/payment/webhook/route.ts
// Universal Auto-Bank Webhook Gateway for Vietnamese Banking & FinTech Providers
// Hỗ trợ đồng thời: SePay, PayOS, Casso, MBBank, Vietcombank, và Generic Webhook

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

interface NormalizedTransaction {
  gateway: string;
  amount: number;
  content: string;
  orderCode: string | null;
  transactionId: string;
  accountNumber: string;
  transferType?: 'in' | 'out';
  rawPayload: any;
}

/**
 * Trích xuất thông minh mã đơn hàng từ nội dung chuyển khoản ngân hàng
 * Ví dụ: "DH123456", "DH-987654", "BK-PRE-102", "BK-SHIP-2409", "DH 445566"
 */
export function extractOrderCode(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Mã đơn đặt bánh kem / giao hàng: BK-PRE-xxx, BK-SHIP-xxx, BK-xxx
  const bkMatch = text.match(/\b(BK-(?:PRE|SHIP)-[A-Za-z0-9-]+|BK-[A-Za-z0-9-]+)\b/i);
  if (bkMatch) return bkMatch[1].toUpperCase();

  // 2. Mã đơn POS / VietQR tiêu chuẩn: DH123456, DH-123456, DH_123456
  const dhMatch = text.match(/\b(DH[-_]?[A-Za-z0-9]{4,16})\b/i);
  if (dhMatch) return dhMatch[1].toUpperCase();

  // 3. Mã đơn tiền tố ORD hoặc ORDER: ORD-12345, ORDER-12345
  const ordMatch = text.match(/\b((?:ORD|ORDER)[-_]?[A-Za-z0-9]{3,16})\b/i);
  if (ordMatch) return ordMatch[1].toUpperCase();

  // 4. Trường hợp có khoảng trắng giữa tiền tố và số: "DH 123456"
  const dhSpaceMatch = text.match(/\bDH\s*([0-9]{4,12})\b/i);
  if (dhSpaceMatch) return `DH${dhSpaceMatch[1]}`;

  return null;
}

/**
 * Tự động nhận diện và chuẩn hóa dữ liệu từ các nhà cung cấp khác nhau
 */
function normalizePayload(body: any): NormalizedTransaction[] {
  if (!body) return [];

  // ── 1. CỔNG CASSO (casso.vn) ──
  // Format: { error: 0, data: [ { id, tid, description, amount, bankName, bank_sub_acc_id, ... } ] }
  if (Array.isArray(body.data)) {
    return body.data.map((item: any) => {
      const content = String(item.description || item.memo || '');
      return {
        gateway: String(item.bankName || 'Casso'),
        amount: Math.abs(Number(item.amount || 0)),
        content,
        orderCode: extractOrderCode(content),
        transactionId: String(item.tid || item.id || ''),
        accountNumber: String(item.bank_sub_acc_id || item.subAccId || ''),
        transferType: Number(item.amount || 0) < 0 ? 'out' : 'in',
        rawPayload: item,
      };
    });
  }

  // ── 2. CỔNG PAYOS (payos.vn) ──
  // Format: { code: "00", desc: "success", data: { orderCode, amount, description, accountNumber, reference } }
  if (body.code === '00' || (body.data && typeof body.data === 'object' && body.data.orderCode !== undefined)) {
    const data = body.data || body;
    const content = String(data.description || '');
    const explicitOrderCode = data.orderCode ? String(data.orderCode) : null;
    const extracted = extractOrderCode(content);

    return [
      {
        gateway: 'PayOS',
        amount: Math.abs(Number(data.amount || 0)),
        content,
        orderCode: explicitOrderCode || extracted,
        transactionId: String(data.reference || data.paymentLinkId || explicitOrderCode || ''),
        accountNumber: String(data.accountNumber || ''),
        transferType: 'in',
        rawPayload: body,
      },
    ];
  }

  // ── 3. CỔNG SEPAY (sepay.vn) ──
  // Format: { id, gateway, accountNumber, content, transferType: "in", transferAmount, referenceCode }
  if (body.transferAmount !== undefined || body.gateway !== undefined || body.referenceCode !== undefined) {
    const content = String(body.content || body.description || '');
    return [
      {
        gateway: String(body.gateway || 'SePay'),
        amount: Math.abs(Number(body.transferAmount || body.amount || 0)),
        content,
        orderCode: extractOrderCode(content) || (body.code ? String(body.code) : null),
        transactionId: String(body.referenceCode || body.id || ''),
        accountNumber: String(body.accountNumber || ''),
        transferType: body.transferType === 'out' ? 'out' : 'in',
        rawPayload: body,
      },
    ];
  }

  // ── 4. CỔNG GENERIC / CUSTOM WEBHOOK HOẶC APP TỰ ĐỘNG ──
  // Chấp nhận mọi JSON có trường amount/money/transferAmount và content/description/message
  const content = String(body.content || body.description || body.notes || body.message || body.memo || body.order_number || '');
  const amount = Math.abs(Number(body.amount || body.transferAmount || body.money || body.total || 0));
  const explicitOrderCode = body.order_number || body.orderCode || body.order_code || body.code || null;

  return [
    {
      gateway: String(body.gateway || body.bank || body.provider || 'GenericBank'),
      amount,
      content,
      orderCode: explicitOrderCode ? String(explicitOrderCode) : extractOrderCode(content),
      transactionId: String(body.transaction_id || body.transactionId || body.id || body.reference || Date.now()),
      accountNumber: String(body.account_number || body.accountNumber || body.accountNo || ''),
      transferType: body.transferType === 'out' ? 'out' : 'in',
      rawPayload: body,
    },
  ];
}

/**
 * Kiểm tra xác thực Token / Secret từ Request
 */
function verifySecret(req: NextRequest): boolean {
  const serverSecret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.AUTOBANK_SECRET || '';
  if (!serverSecret) {
    // Không cài đặt secret key trên server -> cho phép mở để dễ dàng tích hợp
    return true;
  }

  // 1. Kiểm tra qua URL Query: ?token=xyz hoặc ?secret=xyz hoặc ?apiKey=xyz
  const url = new URL(req.url);
  const querySecret = url.searchParams.get('token') || url.searchParams.get('secret') || url.searchParams.get('apiKey');
  if (querySecret && querySecret === serverSecret) return true;

  // 2. Kiểm tra qua HTTP Headers
  const authHeader = req.headers.get('authorization') || '';
  const apiKeyHeader = req.headers.get('x-api-key') || req.headers.get('secure-token') || req.headers.get('x-webhook-secret') || req.headers.get('x-sepay-token');

  if (apiKeyHeader && apiKeyHeader === serverSecret) return true;

  if (authHeader) {
    const bearer = authHeader.replace(/^Bearer\s+|^Apikey\s+/i, '').trim();
    if (bearer === serverSecret) return true;
  }

  return false;
}

/**
 * GET Handler - Phục vụ kiểm tra kết nối (Ping/Health-check) khi thêm webhook trên cổng
 */
export async function GET() {
  return NextResponse.json({
    status: 200,
    success: true,
    service: 'Bakery ERP Auto-Bank Payment Webhook Gateway',
    version: '2.0.0',
    supported_providers: ['SePay', 'PayOS', 'Casso', 'Custom/Generic'],
    message: 'Webhook endpoint is active and ready to receive real-time banking payments.',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST Handler - Tiếp nhận biến động số dư và phát sóng thời gian thực
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Xác thực bảo mật (nếu có cấu hình secret)
    if (!verifySecret(req)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Sai mã bí mật Webhook Secret hoặc thiếu Token' },
        { status: 401 }
      );
    }

    // 2. Đọc payload từ request body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body format' },
        { status: 400 }
      );
    }

    // 3. Chuẩn hóa danh sách giao dịch
    const transactions = normalizePayload(body);
    if (!transactions.length) {
      return NextResponse.json(
        { success: false, message: 'No valid transaction found in payload' },
        { status: 400 }
      );
    }

    const processedResults = [];

    // 4. Xử lý từng giao dịch (thường là 1, Casso có thể gửi nhiều giao dịch 1 lúc)
    for (const tx of transactions) {
      // Bỏ qua nếu là biến động trừ tiền (chuyển đi)
      if (tx.transferType === 'out') {
        processedResults.push({
          transactionId: tx.transactionId,
          status: 'skipped_outgoing',
          amount: tx.amount,
        });
        continue;
      }

      if (tx.amount <= 0) {
        processedResults.push({
          transactionId: tx.transactionId,
          status: 'skipped_zero_amount',
        });
        continue;
      }

      let matchedOrder: any = null;
      let matchedOrderNumber: string | undefined = undefined;

      // 5. Tìm kiếm đơn hàng khớp trong CSDL Supabase (nếu có mã đơn)
      if (tx.orderCode) {
        try {
          const cleanCode = tx.orderCode.trim();
          // Tìm theo order_number chính xác hoặc chứa mã đơn
          const { data: orders } = await supabase
            .from('orders')
            .select('id, order_number, total_amount, status, notes')
            .or(`order_number.eq.${cleanCode},order_number.ilike.%${cleanCode}%`)
            .limit(1);

          if (orders && orders.length > 0) {
            matchedOrder = orders[0];
            matchedOrderNumber = matchedOrder.order_number;

            const updatedNotes = matchedOrder.notes
              ? `${matchedOrder.notes}\n[AutoBank ${tx.gateway}]: Nhận ${tx.amount.toLocaleString('vi-VN')}₫ (GD: ${tx.transactionId || 'CK'})`
              : `[AutoBank ${tx.gateway}]: Nhận ${tx.amount.toLocaleString('vi-VN')}₫ (GD: ${tx.transactionId || 'CK'})`;

            await supabase
              .from('orders')
              .update({
                notes: updatedNotes,
                updated_at: new Date().toISOString(),
              })
              .eq('id', matchedOrder.id);
          }
        } catch (dbErr) {
          console.warn('Cảnh báo khi tìm/cập nhật đơn hàng trong DB:', dbErr);
        }
      }

      // 6. Chuẩn bị payload thông báo thanh toán thành công
      const paymentPayload = {
        order_number: matchedOrderNumber || tx.orderCode || undefined,
        order_code: tx.orderCode || undefined,
        amount: tx.amount,
        gateway: tx.gateway,
        transaction_id: tx.transactionId,
        account_number: tx.accountNumber,
        content: tx.content,
        received_at: new Date().toISOString(),
        matched: !!matchedOrder,
      };

      // 7. Phát sóng Realtime Channel qua Supabase WebSocket để mọi màn hình POS & KDS nhận ngay
      try {
        const syncChannel = supabase.channel('bakery_cross_device_sync');
        await new Promise<void>((resolve) => {
          syncChannel.subscribe((subStatus) => {
            if (subStatus === 'SUBSCRIBED') {
              resolve();
            }
          });
          // Timeout dự phòng 1.5 giây
          setTimeout(resolve, 1500);
        });

        await syncChannel.send({
          type: 'broadcast',
          event: 'payment_received',
          payload: paymentPayload,
        });

        // Dọn dẹp kênh sau khi phát sóng
        setTimeout(() => {
          try {
            supabase.removeChannel(syncChannel);
          } catch {}
        }, 500);
      } catch (broadcastErr) {
        console.warn('Cảnh báo khi phát sóng Realtime từ API Route:', broadcastErr);
      }

      processedResults.push({
        transactionId: tx.transactionId,
        gateway: tx.gateway,
        amount: tx.amount,
        orderCode: tx.orderCode,
        matched: !!matchedOrder,
        matchedOrderNumber,
        status: 'success',
      });
    }

    return NextResponse.json({
      success: true,
      status: 200,
      error: 0,
      message: 'Payment webhook received and processed successfully',
      results: processedResults,
      count: processedResults.length,
    });
  } catch (err: any) {
    console.error('Lỗi nghiêm trọng khi xử lý Webhook thanh toán:', err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Lỗi xử lý webhook nội bộ máy chủ',
      },
      { status: 500 }
    );
  }
}
