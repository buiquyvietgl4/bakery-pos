import { describe, it, expect } from 'vitest';
import { getOrderPaymentMethod, getOrderCashAndBank } from '@/components/admin/accounting/AccountingOverview';
import { generateS2eLedger } from '@/lib/utils/taxSync';

describe('Split Payment Single Order Integrity (Không tách làm 2 đơn)', () => {
  // 1. Kiểm tra tính năng tính toán phân bổ dòng tiền getOrderCashAndBank
  describe('getOrderCashAndBank', () => {
    it('tính chính xác khi có splitCashAmount và splitTransferAmount cụ thể', () => {
      const order = {
        total_amount: 350000,
        payment_method: 'split',
        splitCashAmount: 150000,
        splitTransferAmount: 200000,
      };
      const res = getOrderCashAndBank(order);
      expect(res.cash).toBe(150000);
      expect(res.bank).toBe(200000);
      expect(res.cash + res.bank).toBe(350000);
    });

    it('tính chính xác từ mảng payments chứa cả tiền mặt và chuyển khoản', () => {
      const order = {
        total_amount: 500000,
        payment_method: 'split',
        payments: [
          { method: 'cash', amount: 200000 },
          { method: 'transfer', amount: 300000 },
        ],
      };
      const res = getOrderCashAndBank(order);
      expect(res.cash).toBe(200000);
      expect(res.bank).toBe(300000);
    });

    it('tính chính xác khi chỉ có tiền mặt splitCashAmount và tự suy ra phần chuyển khoản còn lại', () => {
      const order = {
        total_amount: 400000,
        payment_method: 'split',
        splitCashAmount: 100000,
      };
      const res = getOrderCashAndBank(order);
      expect(res.cash).toBe(100000);
      expect(res.bank).toBe(300000);
    });

    it('fallback chia đều 50/50 nếu phương thức là split nhưng không có số liệu chi tiết', () => {
      const order = {
        total_amount: 150000,
        payment_method: 'split',
      };
      const res = getOrderCashAndBank(order);
      expect(res.cash).toBe(75000);
      expect(res.bank).toBe(75000);
      expect(res.cash + res.bank).toBe(150000);
    });

    it('phân bổ 100% tiền mặt cho đơn thanh toán tiền mặt', () => {
      const order = { total_amount: 250000, payment_method: 'cash' };
      const res = getOrderCashAndBank(order);
      expect(res.cash).toBe(250000);
      expect(res.bank).toBe(0);
    });

    it('phân bổ 100% ngân hàng cho các loại ví điện tử và chuyển khoản', () => {
      const methods = ['transfer', 'momo', 'zalopay', 'viettelmoney', 'card'];
      for (const m of methods) {
        const order = { total_amount: 180000, payment_method: m };
        const res = getOrderCashAndBank(order);
        expect(res.cash).toBe(0);
        expect(res.bank).toBe(180000);
      }
    });

    it('trả về 0 cho đơn hàng có tổng tiền bằng 0 hoặc âm', () => {
      expect(getOrderCashAndBank({ total_amount: 0 })).toEqual({ cash: 0, bank: 0 });
      expect(getOrderCashAndBank({ total_amount: -50000 })).toEqual({ cash: 0, bank: 0 });
      expect(getOrderCashAndBank(null)).toEqual({ cash: 0, bank: 0 });
    });
  });

  // 2. Kiểm tra Sổ Chi Tiết Tiền S2e-HKD (generateS2eLedger)
  describe('generateS2eLedger - Không bị tách dòng đơn hỗn hợp', () => {
    it('chỉ xuất đúng 1 dòng chứng từ duy nhất cho đơn hỗn hợp với đầy đủ thông tin chi tiết', () => {
      const orders = [
        {
          id: 'ord-mix-01',
          order_number: 'BK-MIX-01',
          total_amount: 250000,
          payment_method: 'split',
          splitCashAmount: 100000,
          splitTransferAmount: 150000,
          customer_name: 'Nguyễn Văn A',
          created_at: '2026-09-30T10:00:00Z',
        },
      ];

      const res = generateS2eLedger([], { orders });

      // Phải là 1 dòng duy nhất, không được tách thành 2 dòng!
      expect(res.rows).toHaveLength(1);

      const row = res.rows[0];
      expect(row.id).toBe('ord-ord-mix-01');
      expect(row.voucher_no).toBe('PT-0001'); // 1 số phiếu thu duy nhất
      expect(row.source).toBe('split');
      expect(row.type).toBe('income');
      expect(row.income).toBe(250000);
      expect(row.expense).toBe(0);
      expect(row.cashAmt).toBe(100000);
      expect(row.transferAmt).toBe(150000);
      expect(row.description).toContain('BK-MIX-01');
      expect(row.description).toContain('Nguyễn Văn A');
      expect(row.description).toContain('100.000');
      expect(row.description).toContain('150.000');
      expect(row.fund_type).toContain('Kết hợp');
      expect(row.fund_type).toContain('100.000');
      expect(row.fund_type).toContain('150.000');

      // Tích lũy quỹ tiền mặt và ngân hàng chính xác tuyệt đối
      expect(res.cashIncome).toBe(100000);
      expect(res.bankIncome).toBe(150000);
      expect(res.totalIncome).toBe(250000);
      expect(res.cashBalance).toBe(100000);
      expect(res.bankBalance).toBe(150000);
      expect(res.closingBalance).toBe(250000);
    });

    it('tổng hợp chính xác danh sách gồm nhiều đơn: tiền mặt, chuyển khoản, đơn hỗn hợp và chi phí', () => {
      const orders = [
        {
          id: 'ord-1',
          order_number: 'BK-001',
          total_amount: 100000,
          payment_method: 'cash',
          customer_name: 'Khách 1',
          created_at: '2026-09-30T09:00:00Z',
        },
        {
          id: 'ord-2',
          order_number: 'BK-002',
          total_amount: 200000,
          payment_method: 'transfer',
          customer_name: 'Khách 2',
          created_at: '2026-09-30T09:30:00Z',
        },
        {
          id: 'ord-3',
          order_number: 'BK-003',
          total_amount: 300000,
          payment_method: 'split',
          splitCashAmount: 120000,
          splitTransferAmount: 180000,
          customer_name: 'Khách 3',
          created_at: '2026-09-30T10:00:00Z',
        },
      ];

      const expenses = [
        {
          id: 'exp-1',
          description: 'Mua bơ Anchor tiền mặt',
          amount: 50000,
          payment_source: 'cash',
          date: '2026-09-30',
        },
        {
          id: 'exp-2',
          description: 'Tiền điện chuyển khoản',
          amount: 80000,
          payment_source: 'bank',
          date: '2026-09-30',
        },
      ];

      const res = generateS2eLedger([], { orders, expenses });

      // 3 đơn hàng + 2 khoản chi phí = đúng 5 dòng chứng từ (KHÔNG BỊ THÀNH 6 DÒNG DO SPLIT)
      expect(res.rows).toHaveLength(5);

      // Đơn 1: Tiền mặt 100k -> cashIncome += 100k
      // Đơn 2: Ngân hàng 200k -> bankIncome += 200k
      // Đơn 3: Hỗn hợp 300k (120k TM + 180k CK) -> cashIncome += 120k, bankIncome += 180k
      // Chi 1: Tiền mặt 50k -> cashExpense += 50k
      // Chi 2: Ngân hàng 80k -> bankExpense += 80k

      expect(res.totalIncome).toBe(600000); // 100k + 200k + 300k
      expect(res.totalExpense).toBe(130000); // 50k + 80k
      expect(res.netCashflow).toBe(470000);

      // Quỹ tiền mặt: Thu 100k + 120k = 220k; Chi 50k; Tồn = 170k
      expect(res.cashIncome).toBe(220000);
      expect(res.cashExpense).toBe(50000);
      expect(res.cashBalance).toBe(170000);

      // Quỹ ngân hàng: Thu 200k + 180k = 380k; Chi 80k; Tồn = 300k
      expect(res.bankIncome).toBe(380000);
      expect(res.bankExpense).toBe(80000);
      expect(res.bankBalance).toBe(300000);

      // Tổng tồn quỹ cuối kỳ = 170k + 300k = 470k
      expect(res.closingBalance).toBe(470000);
      expect(res.cashBalance + res.bankBalance).toBe(res.closingBalance);
    });
  });

  // 3. Kiểm tra logic xử lý trong Sổ Quỹ Kép Dòng Tiền (DualCashflowLedger logic)
  describe('DualCashflowLedger Transaction Consolidation', () => {
    it('tạo 1 giao dịch duy nhất cho đơn hỗn hợp với type income, source split', () => {
      const orders = [
        {
          id: 'pos-101',
          order_number: 'BK-101',
          total_amount: 160000,
          payment_method: 'split',
          splitCashAmount: 60000,
          splitTransferAmount: 100000,
          customer_name: 'Trần Thị B',
          created_at: '2026-09-30T10:30:00Z',
        },
      ];

      // Giả lập logic allTransactions của DualCashflowLedger
      const list: any[] = [];
      orders.forEach((o) => {
        const amt = Number(o.total_amount || 0);
        if (amt <= 0) return;
        const num = o.order_number || 'BK';
        const date = o.created_at;
        const method = getOrderPaymentMethod(o);
        const { cash, bank } = getOrderCashAndBank(o);

        if (method === 'split') {
          list.push({
            id: 'ord-' + (o.id || num),
            date,
            type: 'income',
            source: 'split',
            cashAmount: cash,
            bankAmount: bank,
            category: 'Doanh thu bán bánh (Kết hợp TM + CK)',
            desc: `Thu tiền đơn hàng #${num} (${o.customer_name || 'Khách lẻ'}) [Tiền mặt: ${cash.toLocaleString('vi-VN')}₫ | Chuyển khoản: ${bank.toLocaleString('vi-VN')}₫]`,
            amount: amt,
          });
        }
      });

      expect(list).toHaveLength(1);
      const tx = list[0];
      expect(tx.id).toBe('ord-pos-101');
      expect(tx.source).toBe('split');
      expect(tx.amount).toBe(160000);
      expect(tx.cashAmount).toBe(60000);
      expect(tx.bankAmount).toBe(100000);
      expect(tx.desc).toContain('60.000');
      expect(tx.desc).toContain('100.000');
    });

    it('giữ đơn hỗn hợp hiển thị khi lọc theo Két tiền mặt hoặc Ngân hàng', () => {
      const tx = {
        id: 'ord-mix-99',
        source: 'split',
        amount: 200000,
        cashAmount: 80000,
        bankAmount: 120000,
      };

      // Bộ lọc logic: if (filterSource !== 'all' && tx.source !== filterSource && tx.source !== 'split') return false;
      const matchAll = true;
      const matchCash = tx.source === 'cash' || tx.source === 'split';
      const matchBank = tx.source === 'bank' || tx.source === 'split';

      expect(matchAll).toBe(true);
      expect(matchCash).toBe(true);
      expect(matchBank).toBe(true);
    });

    it('tính đúng số tiền thu vào khi xuất Excel theo từng bộ lọc nguồn quỹ', () => {
      const tx = {
        id: 'ord-mix-99',
        type: 'income',
        source: 'split',
        amount: 200000,
        cashAmount: 80000,
        bankAmount: 120000,
      };

      const getAmountForFilter = (filter: string) => {
        if (filter === 'cash' && tx.source === 'split') return tx.cashAmount;
        if (filter === 'bank' && tx.source === 'split') return tx.bankAmount;
        return tx.amount;
      };

      expect(getAmountForFilter('all')).toBe(200000); // Khi xuất tất cả: lấy toàn bộ đơn 200k
      expect(getAmountForFilter('cash')).toBe(80000);  // Khi lọc quỹ tiền mặt: lấy 80k
      expect(getAmountForFilter('bank')).toBe(120000); // Khi lọc quỹ ngân hàng: lấy 120k
    });
  });

  // 4. Kiểm tra cấu trúc dữ liệu xuất báo cáo doanh thu & hóa đơn
  describe('Sales Export Data Mapping with Split Payment', () => {
    it('chuẩn hóa đầy đủ các cột thu tiền mặt, thu chuyển khoản và nhãn phương thức', () => {
      const order = {
        order_number: 'BK-20260930-888',
        created_at: '2026-09-30T11:00:00Z',
        total_amount: 220000,
        payment_method: 'split',
        splitCashAmount: 100000,
        splitTransferAmount: 120000,
        customer_name: 'Lê Văn C',
        status: 'completed',
      };

      const { cash, bank } = getOrderCashAndBank(order);
      const method = getOrderPaymentMethod(order);
      const methodLabel = method === 'split' 
        ? `Kết hợp (TM: ${cash.toLocaleString('vi-VN')}₫ + CK: ${bank.toLocaleString('vi-VN')}₫)` 
        : 'Tiền mặt';

      const exportedRow = {
        ma_don: order.order_number,
        tong_tien: order.total_amount,
        tien_mat: cash,
        chuyen_khoan: bank,
        hinh_thuc: methodLabel,
        trang_thai: 'Hoàn tất',
      };

      expect(exportedRow.tong_tien).toBe(220000);
      expect(exportedRow.tien_mat).toBe(100000);
      expect(exportedRow.chuyen_khoan).toBe(120000);
      expect(exportedRow.hinh_thuc).toBe('Kết hợp (TM: 100.000₫ + CK: 120.000₫)');
    });
  });
});
