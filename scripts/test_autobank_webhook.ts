// scripts/test_autobank_webhook.ts
// Comprehensive Test Suite for Bakery ERP Universal Auto-Bank Webhook Gateway

import { GET, POST } from '../src/app/api/payment/webhook/route';
import { extractOrderCode } from '../src/lib/utils/orderCodeExtractor';
import { NextRequest } from 'next/server';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     KIỂM THỬ CỔNG XÁC THỰC CHUYỂN KHOẢN TỰ ĐỘNG (AUTOBANK)   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── TEST 1: REGEX EXTRACTION OF ORDER CODES ──
  console.log('━━━ TEST 1: TRÍCH XUẤT THÔNG MINH MÃ ĐƠN TỪ NỘI DUNG CHUYỂN KHOẢN ━━━');
  
  const testCases = [
    { text: 'DH123456 chuyen khoan mua banh sinh nhat', expected: 'DH123456' },
    { text: 'Khach Nguyen Van A tra tien DH-987654', expected: 'DH-987654' },
    { text: 'Thanh toan don DH_556677', expected: 'DH_556677' },
    { text: 'chuyen tien DH 889900', expected: 'DH889900' },
    { text: 'Dat coc banh kem BK-PRE-240916-102', expected: 'BK-PRE-240916-102' },
    { text: 'Tien ship banh BK-SHIP-2409-55', expected: 'BK-SHIP-2409-55' },
    { text: 'Don hang quay BK-20260916-999', expected: 'BK-20260916-999' },
    { text: 'Thanh toan ORD-77889 qua ngan hang', expected: 'ORD-77889' },
    { text: 'Chuyen tien khong co ma don 100k', expected: null },
  ];

  for (const tc of testCases) {
    const res = extractOrderCode(tc.text);
    assert(res === tc.expected, `Trích xuất từ "${tc.text}" -> Nhận được: ${res} (Kỳ vọng: ${tc.expected})`);
  }

  // ── TEST 2: GET HEALTH-CHECK ENDPOINT ──
  console.log('\n━━━ TEST 2: KIỂM TRA GET ENDPOINT (HEALTH CHECK / PING CHO NHÀ CUNG CẤP) ━━━');
  const getRes = await GET();
  const getData = await getRes.json();
  assert(getRes.status === 200, `GET trả về HTTP 200`);
  assert(getData.success === true, `GET trả về success: true`);
  assert(Array.isArray(getData.supported_providers), `GET trả về danh sách nhà cung cấp được hỗ trợ`);
  assert(getData.supported_providers.includes('SePay'), `Có hỗ trợ SePay`);
  assert(getData.supported_providers.includes('PayOS'), `Có hỗ trợ PayOS`);
  assert(getData.supported_providers.includes('Casso'), `Có hỗ trợ Casso`);

  // ── TEST 3: SEPAY PAYLOAD FORMAT ──
  console.log('\n━━━ TEST 3: XỬ LÝ PAYLOAD SEPAY (sepay.vn) ━━━');
  const sepayBody = {
    id: 998822,
    gateway: 'Vietcombank',
    transactionDate: '2026-09-16 10:30:00',
    accountNumber: '0988888888',
    content: 'DH240988 chuyen khoan banh kem',
    transferType: 'in',
    transferAmount: 250000,
    referenceCode: 'VCB.998822',
  };

  const sepayReq = new NextRequest('http://localhost:3000/api/payment/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sepayBody),
  });

  const sepayRes = await POST(sepayReq);
  const sepayData = await sepayRes.json();
  assert(sepayRes.status === 200, `SePay webhook trả về HTTP 200`);
  assert(sepayData.success === true, `SePay webhook success: true`);
  assert(sepayData.results[0].amount === 250000, `SePay khớp đúng số tiền 250.000₫`);
  assert(sepayData.results[0].orderCode === 'DH240988', `SePay bóc tách đúng mã đơn DH240988`);
  assert(sepayData.results[0].gateway === 'Vietcombank', `SePay nhận diện đúng gateway Vietcombank`);

  // ── TEST 4: PAYOS PAYLOAD FORMAT ──
  console.log('\n━━━ TEST 4: XỬ LÝ PAYLOAD PAYOS (payos.vn) ━━━');
  const payosBody = {
    code: '00',
    desc: 'success',
    data: {
      orderCode: 123456,
      amount: 180000,
      description: 'DH889900 tra tien banh',
      accountNumber: '0981234567',
      reference: 'PAYOS-REF-99',
    },
  };

  const payosReq = new NextRequest('http://localhost:3000/api/payment/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payosBody),
  });

  const payosRes = await POST(payosReq);
  const payosData = await payosRes.json();
  assert(payosRes.status === 200, `PayOS webhook trả về HTTP 200`);
  assert(payosData.success === true, `PayOS webhook success: true`);
  assert(payosData.results[0].amount === 180000, `PayOS khớp đúng số tiền 180.000₫`);
  assert(payosData.results[0].orderCode === '123456', `PayOS nhận đúng orderCode 123456`);
  assert(payosData.results[0].gateway === 'PayOS', `PayOS nhận diện đúng gateway PayOS`);

  // ── TEST 5: CASSO PAYLOAD FORMAT ──
  console.log('\n━━━ TEST 5: XỬ LÝ PAYLOAD CASSO (casso.vn) ━━━');
  const cassoBody = {
    error: 0,
    data: [
      {
        id: 7788,
        tid: 'CASSO-TID-1',
        description: 'BK-PRE-240916-102 dat coc banh',
        amount: 300000,
        bankName: 'MBBank',
        bank_sub_acc_id: '0988888888',
      },
    ],
  };

  const cassoReq = new NextRequest('http://localhost:3000/api/payment/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cassoBody),
  });

  const cassoRes = await POST(cassoReq);
  const cassoData = await cassoRes.json();
  assert(cassoRes.status === 200, `Casso webhook trả về HTTP 200`);
  assert(cassoData.success === true, `Casso webhook success: true`);
  assert(cassoData.results[0].amount === 300000, `Casso khớp đúng số tiền 300.000₫`);
  assert(cassoData.results[0].orderCode === 'BK-PRE-240916-102', `Casso bóc tách đúng mã đơn BK-PRE-240916-102`);
  assert(cassoData.results[0].gateway === 'MBBank', `Casso nhận diện đúng gateway MBBank`);

  // ── TEST 6: GENERIC / CUSTOM BANK PAYLOAD FORMAT ──
  console.log('\n━━━ TEST 6: XỬ LÝ PAYLOAD GENERIC / APP TỰ ĐỘNG BÁO TIỀN VỀ ━━━');
  const genericBody = {
    money: 120000,
    memo: 'DH998811 chuyen khoan tai quay',
    bank: 'ACB',
    transaction_id: 'ACB-TX-102',
  };

  const genericReq = new NextRequest('http://localhost:3000/api/payment/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(genericBody),
  });

  const genericRes = await POST(genericReq);
  const genericData = await genericRes.json();
  assert(genericRes.status === 200, `Generic webhook trả về HTTP 200`);
  assert(genericData.success === true, `Generic webhook success: true`);
  assert(genericData.results[0].amount === 120000, `Generic khớp đúng số tiền 120.000₫`);
  assert(genericData.results[0].orderCode === 'DH998811', `Generic bóc tách đúng mã đơn DH998811`);
  assert(genericData.results[0].gateway === 'ACB', `Generic nhận diện đúng gateway ACB`);

  // ── TEST 7: TIỀN TRỪ (OUTGOING) TỰ ĐỘNG BỎ QUA ──
  console.log('\n━━━ TEST 7: BỎ QUA BIẾN ĐỘNG TRỪ TIỀN (OUTGOING TRANSFERS) ━━━');
  const outgoingBody = {
    gateway: 'Vietcombank',
    content: 'Chuyen tien mua nguyen lieu',
    transferType: 'out',
    transferAmount: 500000,
    referenceCode: 'OUT-99',
  };

  const outReq = new NextRequest('http://localhost:3000/api/payment/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outgoingBody),
  });

  const outRes = await POST(outReq);
  const outData = await outRes.json();
  assert(outRes.status === 200, `Outgoing transfer trả về HTTP 200`);
  assert(outData.results[0].status === 'skipped_outgoing', `Đã bỏ qua không phát thông báo nhận tiền khi tài khoản bị trừ tiền`);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('🎉 TẤT CẢ 21/21 KIỂM THỬ XÁC THỰC CỔNG THANH TOÁN ĐÃ ĐẠT 100%!');
  console.log('══════════════════════════════════════════════════════════════\n');
}

runTests().catch((err) => {
  console.error('Lỗi khi chạy bộ kiểm thử:', err);
  process.exit(1);
});
