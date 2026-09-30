import { describe, it, expect } from 'vitest';
import { generateS2eLedger, generateS2aLedger } from '@/lib/utils/taxSync';

describe('generateS2eLedger', () => {
  it('phân loại chính xác đơn chuyển khoản VietQR vào Ngân hàng (TK 112)', () => {
    const orders = [
      {
        id: 'ord-01',
        order_number: 'BK-001',
        total_amount: 120000,
        payment_method: 'transfer',
        created_at: '2026-09-25T10:00:00',
      },
    ];
    const res = generateS2eLedger([], { orders });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].fund_type).toBe('Ngân hàng VietQR (112)');
    expect(res.rows[0].source).toBe('bank');
    expect(res.bankIncome).toBe(120000);
    expect(res.cashIncome).toBe(0);
  });

  it('phân loại chính xác đơn tiền mặt vào Quỹ tiền mặt (TK 111)', () => {
    const orders = [
      {
        id: 'ord-02',
        order_number: 'BK-002',
        total_amount: 50000,
        payment_method: 'cash',
        created_at: '2026-09-25T11:00:00',
      },
    ];
    const res = generateS2eLedger([], { orders });
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].fund_type).toBe('Quỹ tiền mặt (111)');
    expect(res.rows[0].source).toBe('cash');
    expect(res.cashIncome).toBe(50000);
    expect(res.bankIncome).toBe(0);
  });

  it('tách chính xác đơn thanh toán kết hợp Split thành 2 dòng chứng từ riêng biệt', () => {
    const orders = [
      {
        id: 'ord-03',
        order_number: 'BK-003',
        total_amount: 90000,
        payment_method: 'split',
        splitCashAmount: 40000,
        splitTransferAmount: 50000,
        created_at: '2026-09-25T12:00:00',
      },
    ];
    const res = generateS2eLedger([], { orders });
    expect(res.rows).toHaveLength(2);
    
    const cashRow = res.rows.find((r) => r.source === 'cash');
    const bankRow = res.rows.find((r) => r.source === 'bank');
    
    expect(cashRow).toBeDefined();
    expect(cashRow?.fund_type).toBe('Quỹ tiền mặt (111)');
    expect(cashRow?.income).toBe(40000);

    expect(bankRow).toBeDefined();
    expect(bankRow?.fund_type).toBe('Ngân hàng VietQR (112)');
    expect(bankRow?.income).toBe(50000);

    expect(res.cashIncome).toBe(40000);
    expect(res.bankIncome).toBe(50000);
    expect(res.totalIncome).toBe(90000);
  });

  it('xử lý đầy đủ cả orders khi cashflow không rỗng (không bị chặn)', () => {
    const cashflow = [
      { id: 'cf-po-1', type: 'expense', amount: 300000, method: 'bank', date: '2026-09-25' },
    ];
    const orders = [
      { id: 'ord-04', order_number: 'BK-004', total_amount: 70000, payment_method: 'cash', created_at: '2026-09-25T14:00:00' },
    ];
    const res = generateS2eLedger(cashflow, { orders });
    expect(res.rows.length).toBeGreaterThanOrEqual(2);
    expect(res.cashIncome).toBe(70000);
    expect(res.bankExpense).toBe(300000);
  });
});

describe('generateS2aLedger paymentMethod formatting', () => {
  it('định dạng tiếng Việt chuẩn cho phương thức thanh toán trong S2a', () => {
    const orders = [
      {
        id: 'ord-10',
        order_number: 'BK-010',
        total_amount: 60000,
        payment_method: 'transfer',
        created_at: '2026-09-25T15:00:00',
        items: [{ name: 'Bánh Mì', quantity: 2, unit_price: 30000 }],
      },
      {
        id: 'ord-11',
        order_number: 'BK-011',
        total_amount: 80000,
        payment_method: 'split',
        created_at: '2026-09-25T16:00:00',
        items: [{ name: 'Bánh Kem', quantity: 1, unit_price: 80000 }],
      },
    ];
    const s2a = generateS2aLedger(orders);
    expect(s2a.rows[0].payment_method).toBe('Chuyển khoản (VietQR)');
    expect(s2a.rows[1].payment_method).toBe('Kết hợp (TM + CK)');
  });
});
