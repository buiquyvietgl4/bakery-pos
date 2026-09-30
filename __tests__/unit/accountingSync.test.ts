import { describe, it, expect } from 'vitest';
import { deduplicateExpenses, deduplicateCashflow, ExpenseItem, CashflowTransaction } from '@/lib/utils/accountingSync';

describe('deduplicateExpenses', () => {
  it('loại bỏ các khoản chi bị trùng lặp ID', () => {
    const raw: ExpenseItem[] = [
      { id: 'exp-1', category: 'Tiền mặt bằng', amount: 8000000, description: 'Tiền thuê mặt bằng', date: '2026-09-01' },
      { id: 'exp-2', category: 'Tiền điện', amount: 2500000, description: 'Tiền điện', date: '2026-09-03' },
      { id: 'exp-1', category: 'Tiền mặt bằng', amount: 8000000, description: 'Tiền thuê mặt bằng', date: '2026-09-01' },
    ];
    const res = deduplicateExpenses(raw);
    expect(res).toHaveLength(2);
    expect(res.map((e) => e.id)).toEqual(['exp-1', 'exp-2']);
  });

  it('loại bỏ các khoản chi bị trùng lặp nội dung dù khác id rỗng', () => {
    const raw: ExpenseItem[] = [
      { id: '', category: 'Tiền Gas', amount: 800000, description: 'Đổi bình gas', date: '2026-09-02' },
      { id: '', category: 'Tiền Gas', amount: 800000, description: 'Đổi bình gas', date: '2026-09-02' },
    ];
    const res = deduplicateExpenses(raw);
    expect(res).toHaveLength(1);
    expect(res[0].amount).toBe(800000);
  });

  it('giữ nguyên các khoản chi hợp lệ khác nhau', () => {
    const raw: ExpenseItem[] = [
      { id: 'exp-1', category: 'Tiền Gas', amount: 800000, description: 'Đổi gas đợt 1', date: '2026-09-02' },
      { id: 'exp-2', category: 'Tiền Gas', amount: 800000, description: 'Đổi gas đợt 2', date: '2026-09-20' },
    ];
    const res = deduplicateExpenses(raw);
    expect(res).toHaveLength(2);
  });

  it('xử lý mảng rỗng hoặc không hợp lệ', () => {
    expect(deduplicateExpenses([])).toEqual([]);
    expect(deduplicateExpenses(null as any)).toEqual([]);
    expect(deduplicateExpenses(undefined as any)).toEqual([]);
  });
});

describe('deduplicateCashflow', () => {
  it('loại bỏ các giao dịch dòng tiền bị trùng ID', () => {
    const raw: CashflowTransaction[] = [
      { id: 'cf-1', type: 'income', category: 'Bán hàng', amount: 350000, desc: 'Bán bánh', date: '2026-09-15' },
      { id: 'cf-1', type: 'income', category: 'Bán hàng', amount: 350000, desc: 'Bán bánh', date: '2026-09-15' },
      { id: 'cf-2', type: 'expense', category: 'Gas', amount: 800000, desc: 'Mua gas', date: '2026-09-16' },
    ];
    const res = deduplicateCashflow(raw);
    expect(res).toHaveLength(2);
    expect(res.map((c) => c.id)).toEqual(['cf-1', 'cf-2']);
  });

  it('xử lý an toàn khi mảng rỗng', () => {
    expect(deduplicateCashflow([])).toEqual([]);
  });
});
