import { describe, it, expect } from 'vitest';
import { getOrderPaymentMethod, isOrderCash } from '@/components/admin/accounting/AccountingOverview';

describe('getOrderPaymentMethod & isOrderCash', () => {
  it('nhận diện chính xác đơn tiền mặt từ payment_method', () => {
    const order = { payment_method: 'cash', total_amount: 100000 };
    expect(getOrderPaymentMethod(order)).toBe('cash');
    expect(isOrderCash(order)).toBe(true);
  });

  it('nhận diện chính xác đơn chuyển khoản VietQR từ payment_method', () => {
    const order = { payment_method: 'transfer', total_amount: 150000 };
    expect(getOrderPaymentMethod(order)).toBe('transfer');
    expect(isOrderCash(order)).toBe(false);
  });

  it('nhận diện chính xác đơn ví MoMo', () => {
    const order = { payment_method: 'momo', total_amount: 80000 };
    expect(getOrderPaymentMethod(order)).toBe('momo');
    expect(isOrderCash(order)).toBe(false);
  });

  it('nhận diện chính xác đơn ví ZaloPay', () => {
    const order = { payment_method: 'zalopay', total_amount: 95000 };
    expect(getOrderPaymentMethod(order)).toBe('zalopay');
    expect(isOrderCash(order)).toBe(false);
  });

  it('nhận diện chính xác đơn Viettel Money', () => {
    const order = { payment_method: 'viettelmoney', total_amount: 110000 };
    expect(getOrderPaymentMethod(order)).toBe('viettelmoney');
    expect(isOrderCash(order)).toBe(false);
  });

  it('nhận diện chính xác đơn thanh toán kết hợp Split (TM + CK) từ payments array', () => {
    const order = {
      order_number: 'BK-20260928-001',
      total_amount: 90000,
      payments: [
        { method: 'cash', amount: 45000 },
        { method: 'transfer', amount: 45000 },
      ],
    };
    expect(getOrderPaymentMethod(order)).toBe('split');
    expect(isOrderCash(order)).toBe(false);
  });

  it('nhận diện chính xác phương thức từ payments array đơn lẻ', () => {
    const order1 = {
      total_amount: 50000,
      payments: [{ method: 'cash', amount: 50000 }],
    };
    expect(getOrderPaymentMethod(order1)).toBe('cash');
    expect(isOrderCash(order1)).toBe(true);

    const order2 = {
      total_amount: 120000,
      payments: [{ method: 'transfer', amount: 120000 }],
    };
    expect(getOrderPaymentMethod(order2)).toBe('transfer');
    expect(isOrderCash(order2)).toBe(false);
  });

  it('suy luận phương thức từ ảnh bill chuyển khoản hoặc ghi chú', () => {
    const orderWithProof = {
      total_amount: 200000,
      transfer_proof_image: 'data:image/png;base64,...',
    };
    expect(getOrderPaymentMethod(orderWithProof)).toBe('transfer');
    expect(isOrderCash(orderWithProof)).toBe(false);

    const orderWithNote = {
      total_amount: 200000,
      notes: 'Khách thanh toán chuyển khoản qua VietQR MB Bank',
    };
    expect(getOrderPaymentMethod(orderWithNote)).toBe('transfer');
    expect(isOrderCash(orderWithNote)).toBe(false);
  });

  it('mặc định tiền mặt cho đơn hoàn thành tại quầy nếu không có dữ liệu thanh toán khác', () => {
    const plainOrder = {
      order_number: 'BK-001',
      total_amount: 35000,
    };
    expect(getOrderPaymentMethod(plainOrder)).toBe('cash');
    expect(isOrderCash(plainOrder)).toBe(true);
  });
});

import { calculateClosingMetrics } from '@/lib/utils/closingManager';

describe('calculateClosingMetrics - Phân loại doanh thu Tiền mặt & Chuyển khoản', () => {
  it('tính chính xác cashRevenue và bankRevenue cho đơn Split có splitCashAmount & splitTransferAmount', () => {
    const testDate = '2026-09-30T10:00:00';
    const orders = [
      {
        order_number: 'BK-SPLIT-01',
        created_at: '2026-09-30T10:15:00',
        total_amount: 200000,
        payment_method: 'split',
        splitCashAmount: 120000,
        splitTransferAmount: 80000,
      },
    ];

    const result = calculateClosingMetrics('day', testDate, orders, [], []);
    expect(result.totalRevenue).toBe(200000);
    expect(result.cashRevenue).toBe(120000);
    expect(result.bankRevenue).toBe(80000);
  });

  it('nhận diện chính xác đơn chuyển khoản sử dụng camelCase paymentMethod', () => {
    const testDate = '2026-09-30T10:00:00';
    const orders = [
      {
        order_number: 'BK-CK-01',
        created_at: '2026-09-30T10:30:00',
        total_amount: 150000,
        paymentMethod: 'transfer', // camelCase không có payment_method
      },
      {
        order_number: 'BK-MOMO-01',
        created_at: '2026-09-30T11:00:00',
        total_amount: 50000,
        paymentMethod: 'momo',
      },
      {
        order_number: 'BK-ZALO-01',
        created_at: '2026-09-30T11:15:00',
        total_amount: 70000,
        paymentMethod: 'zalopay',
      },
      {
        order_number: 'BK-VIETTEL-01',
        created_at: '2026-09-30T11:20:00',
        total_amount: 80000,
        paymentMethod: 'viettelmoney',
      },
      {
        order_number: 'BK-CASH-01',
        created_at: '2026-09-30T11:30:00',
        total_amount: 100000,
        paymentMethod: 'cash',
      },
    ];

    const result = calculateClosingMetrics('day', testDate, orders, [], []);
    expect(result.totalRevenue).toBe(450000);
    expect(result.cashRevenue).toBe(100000);
    expect(result.bankRevenue).toBe(350000); // 150k transfer + 50k momo + 70k zalo + 80k viettel
  });

  it('chia đều 50/50 cho đơn Split nếu không có trường số tiền cụ thể', () => {
    const testDate = '2026-09-30T10:00:00';
    const orders = [
      {
        order_number: 'BK-SPLIT-FALLBACK',
        created_at: '2026-09-30T12:00:00',
        total_amount: 100000,
        payment_method: 'split',
      },
    ];

    const result = calculateClosingMetrics('day', testDate, orders, [], []);
    expect(result.totalRevenue).toBe(100000);
    expect(result.cashRevenue).toBe(50000);
    expect(result.bankRevenue).toBe(50000);
  });
});

