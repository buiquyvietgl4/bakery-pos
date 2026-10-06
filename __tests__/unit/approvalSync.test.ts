import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveResolvedTransferRecordToDb,
  checkTransferResolvedStatus,
  saveResolvedReturnRecordToDb,
  checkReturnResolvedStatus,
} from '@/lib/supabase/realtimeSync';

describe('Approval Synchronization & Status Check (Duyệt Chuyển Khoản & Đổi Trả)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Duyệt Chuyển Khoản (Bank Transfer Approval)', () => {
    it('Lưu và kiểm tra kết quả duyệt chuyển khoản thành công với mã đơn viết hoa', async () => {
      await saveResolvedTransferRecordToDb({
        order_number: 'BK-12345',
        action: 'approved',
        amount: 250000,
        resolved_by: 'Admin Test',
      });

      const res = await checkTransferResolvedStatus('BK-12345');
      expect(res).not.toBeNull();
      expect(res?.action).toBe('approved');
      expect(res?.order_number).toBe('BK-12345');
    });

    it('Xử lý chuẩn hóa mã đơn (chữ thường, khoảng trắng thừa)', async () => {
      await saveResolvedTransferRecordToDb({
        order_number: 'BK-99999',
        action: 'approved',
        amount: 150000,
      });

      // Tra cứu với chữ thường và khoảng trắng
      const res = await checkTransferResolvedStatus('  bk-99999  ');
      expect(res).not.toBeNull();
      expect(res?.action).toBe('approved');
    });

    it('Xử lý từ chối giao dịch chuyển khoản (rejected)', async () => {
      await saveResolvedTransferRecordToDb({
        order_number: 'BK-REJECT-01',
        action: 'rejected',
        reason: 'Chưa thấy tiền vào tài khoản',
      });

      const res = await checkTransferResolvedStatus('BK-REJECT-01');
      expect(res).not.toBeNull();
      expect(res?.action).toBe('rejected');
      expect(res?.reason).toBe('Chưa thấy tiền vào tài khoản');
    });

    it('Trả về null khi đơn chưa được duyệt', async () => {
      const res = await checkTransferResolvedStatus('BK-NOT-EXIST');
      expect(res).toBeNull();
    });
  });

  describe('Duyệt Đổi Trả (Return & Exchange Approval)', () => {
    it('Lưu và kiểm tra kết quả duyệt đổi trả thành công qua order_number', async () => {
      await saveResolvedReturnRecordToDb({
        id: 'REQ-RET-001',
        order_number: 'BK-RETURN-10',
        action: 'approved',
        resolved_by: 'Admin Test',
      });

      const res = await checkReturnResolvedStatus('BK-RETURN-10');
      expect(res).not.toBeNull();
      expect(res?.action).toBe('approved');
      expect(res?.order_number).toBe('BK-RETURN-10');
    });

    it('Kiểm tra duyệt đổi trả bằng request ID (REQ-RET-xxxx)', async () => {
      await saveResolvedReturnRecordToDb({
        id: 'REQ-RET-002',
        order_number: 'BK-RETURN-20',
        action: 'approved',
      });

      const res = await checkReturnResolvedStatus('', 'REQ-RET-002');
      expect(res).not.toBeNull();
      expect(res?.action).toBe('approved');
    });

    it('Xử lý chuẩn hóa mã đơn đổi trả không phân biệt hoa thường', async () => {
      await saveResolvedReturnRecordToDb({
        id: 'REQ-RET-003',
        order_number: 'BK-RETURN-30',
        action: 'rejected',
        reason: 'Bánh đã qua 24h không thể đổi trả',
      });

      const res = await checkReturnResolvedStatus('  bk-return-30  ');
      expect(res).not.toBeNull();
      expect(res?.action).toBe('rejected');
      expect(res?.reason).toBe('Bánh đã qua 24h không thể đổi trả');
    });
  });
});
