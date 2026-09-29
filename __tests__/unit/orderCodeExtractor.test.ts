import { describe, it, expect } from 'vitest';
import { extractOrderCode } from '@/lib/utils/orderCodeExtractor';

describe('extractOrderCode', () => {
  it('trả về null khi input rỗng hoặc không phải chuỗi', () => {
    expect(extractOrderCode('')).toBe(null);
    expect(extractOrderCode(null as any)).toBe(null);
    expect(extractOrderCode(undefined as any)).toBe(null);
    expect(extractOrderCode(12345 as any)).toBe(null);
  });

  it('trích xuất mã BK-PRE (đặt bánh kem)', () => {
    expect(extractOrderCode('Chuyen khoan cho don BK-PRE-102')).toBe('BK-PRE-102');
    expect(extractOrderCode('Thanh toan bk-pre-9988')).toBe('BK-PRE-9988');
    expect(extractOrderCode('BK-PRE-2026-ABC tien banh')).toBe('BK-PRE-2026-ABC');
  });

  it('trích xuất mã BK-SHIP (giao hàng)', () => {
    expect(extractOrderCode('Tien ship don BK-SHIP-2409 cam on')).toBe('BK-SHIP-2409');
    expect(extractOrderCode('bk-ship-001')).toBe('BK-SHIP-001');
  });

  it('trích xuất mã BK tổng quát', () => {
    expect(extractOrderCode('Chuyen khoan BK-8877')).toBe('BK-8877');
  });

  it('trích xuất mã chuẩn DH / VietQR', () => {
    expect(extractOrderCode('DH123456 thanh toan hoa don')).toBe('DH123456');
    expect(extractOrderCode('TT don hang DH-987654')).toBe('DH-987654');
    expect(extractOrderCode('DH_445566')).toBe('DH_445566');
  });

  it('trích xuất mã ORD / ORDER', () => {
    expect(extractOrderCode('Noi dung ORD-12345')).toBe('ORD-12345');
    expect(extractOrderCode('Chuyen tien ORDER-998877')).toBe('ORDER-998877');
    expect(extractOrderCode('ord_7788')).toBe('ORD_7788');
  });

  it('trích xuất mã có khoảng trắng giữa DH và số', () => {
    expect(extractOrderCode('Chuyen khoan DH 445566')).toBe('DH445566');
    expect(extractOrderCode('DH   12345678')).toBe('DH12345678');
  });

  it('trả về null nếu không chứa bất kỳ mẫu mã đơn nào', () => {
    expect(extractOrderCode('Nguyen Van A mung sinh nhat')).toBe(null);
    expect(extractOrderCode('tien an trua 50000')).toBe(null);
    expect(extractOrderCode('DH 12')).toBe(null); // Quá ngắn (< 4 số)
  });
});
