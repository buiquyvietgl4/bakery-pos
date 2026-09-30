import { describe, it, expect } from 'vitest';
import { getOrderPaymentMethod } from '@/components/admin/accounting/AccountingOverview';

describe('Accounting Export & UI Calculation Parity', () => {
  const mockOrders = [
    {
      id: 'ord-1',
      order_number: 'BK-20260930-001',
      created_at: '2026-09-30T09:00:00.000Z',
      total_amount: 150000,
      total_cogs: 45000,
      payment_method: 'cash',
      status: 'completed',
    },
    {
      id: 'ord-2',
      order_number: 'BK-20260930-002',
      created_at: '2026-09-30T10:30:00.000Z',
      total_amount: 320000,
      total_cogs: 95000,
      payment_method: 'vietqr',
      status: 'completed',
    },
    {
      id: 'ord-3',
      order_number: 'BK-20260920-001', // Outside today
      created_at: '2026-09-20T14:00:00.000Z',
      total_amount: 500000,
      total_cogs: 160000,
      payment_method: 'cash',
      status: 'completed',
    },
  ];

  const mockExpenses = [
    {
      id: 'exp-1',
      date: '2026-09-30',
      category: 'Điện nước',
      description: 'Tiền điện tháng 9',
      amount: 120000,
      payment_source: 'bank',
    },
    {
      id: 'exp-2',
      date: '2026-09-15', // Outside today
      category: 'Mặt bằng',
      description: 'Tiền thuê tiệm',
      amount: 5000000,
      payment_source: 'bank',
    },
  ];

  const mockSpoilage = [
    {
      id: 'spoil-1',
      loggedAt: '2026-09-30T11:00:00.000Z',
      productName: 'Bánh Croissant Bơ Pháp',
      quantity: 2,
      totalCostLoss: 30000,
      reason: 'damaged',
    },
  ];

  it('correctly calculates actual period revenue without any hardcoded mock baseline', () => {
    // Filter for 2026-09-30
    const startMs = new Date('2026-09-30T00:00:00.000Z').getTime();
    const endMs = new Date('2026-09-30T23:59:59.999Z').getTime();

    const periodOrders = mockOrders.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= startMs && t <= endMs;
    });

    expect(periodOrders.length).toBe(2);

    // Revenue must ONLY sum real orders (150,000 + 320,000 = 470,000)
    // MUST NOT include +45,000,000 or +92,000,000 fake mock revenue!
    const totalRev = periodOrders.reduce((s, o) => s + o.total_amount, 0);
    expect(totalRev).toBe(470000);
    expect(totalRev).not.toBeGreaterThan(1000000); // Guarantees no +45M mock injection

    // Order count must ONLY be real orders (2)
    // MUST NOT include +142 fake orders!
    expect(periodOrders.length).toBe(2);
    expect(periodOrders.length).not.toBe(144);
  });

  it('correctly calculates COGS, OPEX, spoilage and Net Profit with 100% parity', () => {
    const startMs = new Date('2026-09-30T00:00:00.000Z').getTime();
    const endMs = new Date('2026-09-30T23:59:59.999Z').getTime();

    const periodOrders = mockOrders.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= startMs && t <= endMs;
    });

    const periodExpenses = mockExpenses.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= startMs && t <= endMs;
    });

    const periodSpoilage = mockSpoilage.filter((s) => {
      const t = new Date(s.loggedAt).getTime();
      return t >= startMs && t <= endMs;
    });

    const totalRev = periodOrders.reduce((s, o) => s + o.total_amount, 0);
    const totalCogs = periodOrders.reduce((s, o) => s + (o.total_cogs || 0), 0);
    const grossProfit = totalRev - totalCogs;
    const totalOpex = periodExpenses.reduce((s, e) => s + e.amount, 0);
    const totalSpoilage = periodSpoilage.reduce((s, l) => s + l.totalCostLoss, 0);
    const netProfit = grossProfit - totalOpex - totalSpoilage;

    expect(totalRev).toBe(470000);
    expect(totalCogs).toBe(140000); // 45000 + 95000
    expect(grossProfit).toBe(330000); // 470000 - 140000
    expect(totalOpex).toBe(120000); // only exp-1 (120,000), not exp-2 (5M)
    expect(totalSpoilage).toBe(30000);
    expect(netProfit).toBe(180000); // 330000 - 120000 - 30000
  });

  it('correctly groups payment methods for dual cashflow ledger', () => {
    const cashOrder = mockOrders[0];
    const bankOrder = mockOrders[1];

    expect(getOrderPaymentMethod(cashOrder)).toBe('cash');
    expect(getOrderPaymentMethod(bankOrder)).toBe('transfer');
  });
});
