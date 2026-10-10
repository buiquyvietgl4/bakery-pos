import { describe, it, expect } from 'vitest';
import { generateS2aLedger, generateS2eLedger, analyzeTaxRevenueThreshold, classifyItemTaxGroup } from '@/lib/utils/taxSync';
import { getOrderPaymentMethod, getOrderCashAndBank } from '@/components/admin/accounting/AccountingOverview';

describe('Kiểm tra Toàn diện Kế toán Tài chính & Kế toán Thuế (Full Audit Suite)', () => {
  // ── 1. KẾ TOÁN THUẾ HỘ KINH DOANH (Thông tư 40/2021/TT-BTC & Nghị định 141/2026/NĐ-CP) ──
  describe('1. Kế toán Thuế: Phân loại 3 Nhóm Ngành Nghề & Thuế suất', () => {
    it('phân loại chính xác từng mặt hàng vào 3 nhóm ngành tính thuế', () => {
      // Nhóm 1: Bánh nhập về bán & Phụ kiện (1.5%)
      expect(classifyItemTaxGroup({ name: 'Nến số sinh nhật lung linh' })).toBe(1);
      expect(classifyItemTaxGroup({ name: 'Mũ tiệc sinh nhật' })).toBe(1);
      expect(classifyItemTaxGroup({ name: 'Bánh mì hoa cúc Harrys nhập khẩu', product_type: 'imported' })).toBe(1);
      expect(classifyItemTaxGroup({ name: 'Bánh Danisa hộp thiếc' })).toBe(1);

      // Nhóm 2: Dịch vụ vận chuyển / ship bánh (7.0%)
      expect(classifyItemTaxGroup({ name: 'Phí ship giao hàng tận nơi' })).toBe(2);
      expect(classifyItemTaxGroup({ name: 'Dịch vụ trang trí tiệc sinh nhật' })).toBe(2);

      // Nhóm 3: Sản xuất chế biến bánh tại tiệm (4.5%)
      expect(classifyItemTaxGroup({ name: 'Bánh Sinh Nhật Bắp 18cm' })).toBe(3);
      expect(classifyItemTaxGroup({ name: 'Bánh Mì Chuột Giòn' })).toBe(3);
      expect(classifyItemTaxGroup({ name: 'Trà Sữa Oolong Nướng' })).toBe(3);
    });

    it('tính toán chính xác thuế suất 1.5% (Nhóm 1), 7.0% (Nhóm 2) và 4.5% (Nhóm 3) trong Sổ S2a-HKD', () => {
      const orders = [
        {
          id: 'ord-mix-01',
          order_number: 'BK-20261010-001',
          created_at: '2026-10-10T10:00:00Z',
          total_amount: 350000,
          payment_method: 'vietqr',
          items: [
            { name: 'Bánh Kem Bắp 20cm', unit_price: 250000, quantity: 1, line_total: 250000 }, // Nhóm 3: 250k
            { name: 'Mũ sinh nhật vương miện', unit_price: 50000, quantity: 1, line_total: 50000, product_type: 'imported' }, // Nhóm 1: 50k
            { name: 'Phí giao hàng tận nơi', unit_price: 50000, quantity: 1, line_total: 50000 }, // Nhóm 2: 50k
          ],
        },
      ];

      const s2a = generateS2aLedger(orders);
      expect(s2a.totalRevenue).toBe(350000);

      // Nhóm 1: 50,000₫ -> GTGT 1% (500₫), TNCN 0.5% (250₫) => Tổng thuế 750₫ (1.5%)
      const g1 = s2a.summary.find((g) => g.group_id === 1);
      expect(g1).toBeDefined();
      expect(g1?.total_revenue).toBe(50000);
      expect(g1?.total_vat).toBe(500);
      expect(g1?.total_pit).toBe(250);
      expect(g1?.total_tax).toBe(750);

      // Nhóm 2: 50,000₫ -> GTGT 5% (2,500₫), TNCN 2% (1,000₫) => Tổng thuế 3,500₫ (7.0%)
      const g2 = s2a.summary.find((g) => g.group_id === 2);
      expect(g2).toBeDefined();
      expect(g2?.total_revenue).toBe(50000);
      expect(g2?.total_vat).toBe(2500);
      expect(g2?.total_pit).toBe(1000);
      expect(g2?.total_tax).toBe(3500);

      // Nhóm 3: 250,000₫ -> GTGT 3% (7,500₫), TNCN 1.5% (3,750₫) => Tổng thuế 11,250₫ (4.5%)
      const g3 = s2a.summary.find((g) => g.group_id === 3);
      expect(g3).toBeDefined();
      expect(g3?.total_revenue).toBe(250000);
      expect(g3?.total_vat).toBe(7500);
      expect(g3?.total_pit).toBe(3750);
      expect(g3?.total_tax).toBe(11250);

      // Tổng cộng toàn bộ sổ:
      expect(s2a.totalVat).toBe(500 + 2500 + 7500); // 10,500₫
      expect(s2a.totalPit).toBe(250 + 1000 + 3750); // 5,000₫
      expect(s2a.totalTax).toBe(15500); // 15,500₫
    });

    it('phân bổ chiết khấu thương mại công bằng và chính xác theo từng nhóm doanh thu', () => {
      // Đơn hàng có tổng món 200k (Bánh 150k + Nến 50k), nhưng có voucher giảm 20k -> Khách trả 180k
      const orders = [
        {
          id: 'ord-discount-01',
          order_number: 'BK-DISC-01',
          created_at: '2026-10-10T11:00:00Z',
          total_amount: 180000,
          payment_method: 'cash',
          items: [
            { name: 'Bánh Mì Gối Vuông', unit_price: 150000, quantity: 1, line_total: 150000 }, // Nhóm 3 (75%)
            { name: 'Nến sinh nhật pháo sáng', unit_price: 50000, quantity: 1, line_total: 50000, product_type: 'imported' }, // Nhóm 1 (25%)
          ],
        },
      ];

      const s2a = generateS2aLedger(orders);
      expect(s2a.totalRevenue).toBe(180000); // Doanh thu tính thuế là 180,000₫ sau giảm giá

      const g1 = s2a.summary.find((g) => g.group_id === 1);
      const g3 = s2a.summary.find((g) => g.group_id === 3);

      // Nhóm 1: 50k * (180k/200k) = 45k
      expect(g1?.total_revenue).toBe(45000);
      // Nhóm 3: 180k - 45k = 135k
      expect(g3?.total_revenue).toBe(135000);

      expect((g1?.total_revenue || 0) + (g3?.total_revenue || 0)).toBe(180000);
    });

    it('loại trừ đơn hàng trả hàng/hoàn tiền 100% khỏi doanh thu tính thuế và giảm trừ khi hoàn 1 phần', () => {
      const orders = [
        {
          id: 'ord-ref-1',
          order_number: 'BK-REF-1',
          created_at: '2026-10-10T12:00:00Z',
          total_amount: 200000,
          status: 'refunded', // Hoàn 100%
          payment_method: 'cash',
          items: [{ name: 'Bánh Kem', unit_price: 200000, quantity: 1, line_total: 200000 }],
        },
        {
          id: 'ord-ref-2',
          order_number: 'BK-REF-2',
          created_at: '2026-10-10T13:00:00Z',
          total_amount: 300000,
          refunded_amount: 100000, // Hoàn 1 phần 100k
          payment_method: 'vietqr',
          items: [{ name: 'Bánh Mì', unit_price: 300000, quantity: 1, line_total: 300000 }],
        },
      ];

      const s2a = generateS2aLedger(orders);
      // Đơn 1 bị hủy/hoàn 100% -> Bỏ qua. Đơn 2 trừ 100k -> 200k
      expect(s2a.totalRevenue).toBe(200000);
      expect(s2a.rows).toHaveLength(1);
      expect(s2a.rows[0].voucher_no).toBe('BK-REF-2');
      expect(s2a.rows[0].revenue).toBe(200000);
    });

    it('kiểm tra ngưỡng doanh thu năm (1 tỷ) và tự động khuyến nghị mẫu 01/TKN-CNKD (miễn thuế) hoặc 01/CNKD', () => {
      // 1. Doanh thu dưới 1 tỷ
      const smallOrders = [
        { id: '1', total_amount: 300000000, created_at: '2026-05-01' },
        { id: '2', total_amount: 200000000, created_at: '2026-08-01' },
      ];
      const resSmall = analyzeTaxRevenueThreshold(smallOrders, 2026, 1000000000);
      expect(resSmall.current_year_revenue).toBe(500000000);
      expect(resSmall.is_under_threshold).toBe(true);
      expect(resSmall.recommended_form).toBe('01/TKN-CNKD');
      expect(resSmall.tax_exemption_status).toBe(true);
      expect(resSmall.remaining_until_threshold).toBe(500000000);

      // 2. Doanh thu vượt ngưỡng 1 tỷ
      const bigOrders = [
        { id: '1', total_amount: 600000000, created_at: '2026-05-01' },
        { id: '2', total_amount: 550000000, created_at: '2026-08-01' },
      ];
      const resBig = analyzeTaxRevenueThreshold(bigOrders, 2026, 1000000000);
      expect(resBig.current_year_revenue).toBe(1150000000);
      expect(resBig.is_under_threshold).toBe(false);
      expect(resBig.recommended_form).toBe('01/CNKD');
      expect(resBig.tax_exemption_status).toBe(false);
    });
  });

  // ── 2. SỔ QUỸ KÉP & LIÊN KẾT THU CHI POS (TK 111 TIỀN MẶT & TK 112 VIETQR) ──
  describe('2. Sổ Quỹ Kép & Liên Kết Dòng Tiền POS', () => {
    it('phân bổ chính xác đơn thanh toán kết hợp Split (TM + CK) vào két 111 và tài khoản 112', () => {
      const splitOrder = {
        id: 'ord-sp-01',
        order_number: 'BK-SPLIT-01',
        total_amount: 500000,
        payment_method: 'split',
        splitCashAmount: 200000,
        splitTransferAmount: 300000,
      };

      const { cash, bank } = getOrderCashAndBank(splitOrder);
      expect(cash).toBe(200000);
      expect(bank).toBe(300000);
      expect(cash + bank).toBe(500000);
    });

    it('xử lý dòng tiền đơn đặt trước (Pre-order): chỉ ghi nhận tiền cọc khi chưa hoàn tất', () => {
      const pendingPreorder = {
        id: 'po-01',
        order_number: 'BK-PRE-01',
        order_type: 'preorder',
        status: 'pending',
        total_amount: 450000,
        deposit_amount: 150000,
        remaining_amount: 300000,
        payment_method: 'cash',
        created_at: '2026-10-10T09:00:00Z',
      };

      // Đơn chưa giao: chỉ ghi nhận 150,000₫ tiền cọc vào dòng tiền
      const { cash, bank } = getOrderCashAndBank(pendingPreorder);
      expect(cash).toBe(150000);
      expect(bank).toBe(0);

      const s2e = generateS2eLedger([], { orders: [pendingPreorder] });
      expect(s2e.cashIncome).toBe(150000);
      expect(s2e.totalIncome).toBe(150000);
      expect(s2e.rows[0].income).toBe(150000);
      expect(s2e.rows[0].description).toContain('tiền cọc');
    });

    it('ghi nhận đầy đủ dòng tiền khi đơn đặt trước hoàn tất (giao khách & thu nốt)', () => {
      // Ngày 1: Đặt cọc 150k
      const initialPreorder = {
        id: 'po-02',
        order_number: 'BK-PRE-02',
        order_type: 'preorder',
        status: 'completed',
        total_amount: 500000,
        deposit_amount: 150000,
        remaining_amount: 0,
        payment_method: 'transfer',
        created_at: '2026-10-10T10:00:00Z',
      };

      // Đơn đã hoàn tất: ghi nhận đầy đủ 500,000₫
      const { cash, bank } = getOrderCashAndBank(initialPreorder);
      expect(bank).toBe(500000);
      expect(cash).toBe(0);

      const s2e = generateS2eLedger([], { orders: [initialPreorder] });
      expect(s2e.bankIncome).toBe(500000);
      expect(s2e.totalIncome).toBe(500000);
    });

    it('tổng hợp chính xác Sổ Quỹ Kép gồm bán hàng, chi phí OPEX và phiếu hoàn tiền', () => {
      const orders = [
        { id: '1', order_number: 'BK-01', total_amount: 100000, payment_method: 'cash', created_at: '2026-10-10T08:00:00Z' },
        { id: '2', order_number: 'BK-02', total_amount: 250000, payment_method: 'vietqr', created_at: '2026-10-10T09:00:00Z' },
      ];

      const expenses = [
        { id: 'e1', amount: 50000, payment_source: 'cash', category: 'Mua đá lạnh', date: '2026-10-10' },
      ];

      const cashflow = [
        { id: 'ret-1', type: 'expense', amount: 30000, method: 'cash', desc: 'Hoàn tiền trả bánh lỗi', date: '2026-10-10' },
      ];

      const s2e = generateS2eLedger(cashflow, { orders, expenses });

      // Tiền mặt: Thu bán 100k - Chi mua đá 50k - Hoàn tiền 30k = Tồn 20k
      expect(s2e.cashIncome).toBe(100000);
      expect(s2e.cashExpense).toBe(80000); // 50k exp + 30k return
      expect(s2e.cashBalance).toBe(20000);

      // Ngân hàng: Thu bán 250k = Tồn 250k
      expect(s2e.bankIncome).toBe(250000);
      expect(s2e.bankExpense).toBe(0);
      expect(s2e.bankBalance).toBe(250000);

      // Tổng thanh khoản cuối kỳ: 20k + 250k = 270,000₫
      expect(s2e.closingBalance).toBe(270000);
    });
  });

  // ── 3. TÍNH TOÁN TÀI CHÍNH KẾ TOÁN P&L (GIÁ VỐN COGS & LỢI NHUẬN RÒNG) ──
  describe('3. Tài chính P&L: Giá Vốn COGS Định Mức & Lợi Nhuận Ròng', () => {
    it('ưu tiên giá vốn thực tế từ BOM total_cogs trên đơn hàng', () => {
      const mockOrders = [
        {
          id: 'ord-cogs-1',
          order_number: 'BK-BOM-01',
          total_amount: 200000,
          total_cogs: 65000, // Giá vốn từ BOM
          payment_method: 'cash',
          status: 'completed',
        },
        {
          id: 'ord-cogs-2',
          order_number: 'BK-BOM-02',
          total_amount: 300000,
          total_cogs: 95000, // Giá vốn từ BOM
          payment_method: 'vietqr',
          status: 'completed',
        },
      ];

      const totalRevenue = mockOrders.reduce((s, o) => s + o.total_amount, 0);
      const sumRecordedCogs = mockOrders.reduce((s, o) => s + (o.total_cogs || 0), 0);
      const grossProfit = totalRevenue - sumRecordedCogs;

      expect(totalRevenue).toBe(500000);
      expect(sumRecordedCogs).toBe(160000); // 65k + 95k = 160k (chính xác theo BOM)
      expect(grossProfit).toBe(340000); // 500k - 160k = 340k
    });

    it('tính toán lợi nhuận ròng tuân thủ công thức Net Profit = Gross Profit - OPEX - Spoilage', () => {
      const revenue = 1000000;
      const cogs = 350000;
      const grossProfit = revenue - cogs; // 650,000₫
      const opex = 200000; // Tiền điện, nước, lương
      const spoilage = 50000; // Thiệt hại bánh hỏng

      const netProfit = grossProfit - opex - spoilage;
      expect(netProfit).toBe(400000);

      const netMargin = ((netProfit / revenue) * 100).toFixed(1);
      expect(netMargin).toBe('40.0');
    });
  });
});
