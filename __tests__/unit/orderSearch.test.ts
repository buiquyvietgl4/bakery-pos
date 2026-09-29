import { describe, it, expect } from 'vitest';
import { matchesOrderSearch } from '@/lib/utils/orderSearch';

describe('matchesOrderSearch', () => {
  const sampleOrder = {
    id: 'ord-uuid-12345',
    order_number: '#BK-PRE-102',
    local_id: 'LOC-9988',
    customer_name: 'Nguyễn Văn A',
    customer_phone: '0901234567',
    cashier: 'mai_thungan',
    notes: 'Bánh giao trước 17h, ít đường',
    cakeName: 'Bánh Kem Bắp Sinh Nhật',
    items: [
      { product_name_snapshot: 'Bánh Mì Hoa Cúc' },
      { name: 'Bánh Croissant Bơ' }
    ]
  };

  it('trả về true khi query rỗng hoặc khoảng trắng', () => {
    expect(matchesOrderSearch(sampleOrder, '')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, '   ')).toBe(true);
  });

  it('tìm kiếm theo mã đơn chính xác hoặc bỏ dấu #', () => {
    expect(matchesOrderSearch(sampleOrder, '#BK-PRE-102')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, 'BK-PRE-102')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, 'bk-pre-102')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, 'BKPRE102')).toBe(true); // normalize bỏ gạch nối
  });

  it('tìm kiếm theo order ID hoặc local_id', () => {
    expect(matchesOrderSearch(sampleOrder, 'ord-uuid-12345')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, '12345')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, 'LOC-9988')).toBe(true);
  });

  it('tìm kiếm theo tên khách hàng', () => {
    expect(matchesOrderSearch(sampleOrder, 'nguyễn văn a')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, 'văn a')).toBe(true);
  });

  it('tìm kiếm theo số điện thoại khách hàng', () => {
    expect(matchesOrderSearch(sampleOrder, '0901234567')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, '1234567')).toBe(true);
  });

  it('tìm kiếm theo tên thu ngân', () => {
    expect(matchesOrderSearch(sampleOrder, 'mai_thungan')).toBe(true);
  });

  it('tìm kiếm theo ghi chú đơn hàng', () => {
    expect(matchesOrderSearch(sampleOrder, 'ít đường')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, 'trước 17h')).toBe(true);
  });

  it('tìm kiếm theo tên bánh đặt (cakeName)', () => {
    expect(matchesOrderSearch(sampleOrder, 'bánh kem bắp')).toBe(true);
  });

  it('tìm kiếm theo sản phẩm trong giỏ hàng (items)', () => {
    expect(matchesOrderSearch(sampleOrder, 'hoa cúc')).toBe(true);
    expect(matchesOrderSearch(sampleOrder, 'croissant')).toBe(true);
  });

  it('trả về false khi không khớp bất kỳ trường nào', () => {
    expect(matchesOrderSearch(sampleOrder, 'pizza hải sản')).toBe(false);
    expect(matchesOrderSearch(sampleOrder, '0988888888')).toBe(false);
  });

  it('hỗ trợ cấu trúc order định dạng camelCase', () => {
    const camelOrder = {
      orderNumber: 'DH-5544',
      customerName: 'Trần Thị B',
      customerPhone: '0912345678',
      cake_name: 'Bánh Mousse Socola'
    };
    expect(matchesOrderSearch(camelOrder, 'DH-5544')).toBe(true);
    expect(matchesOrderSearch(camelOrder, 'trần thị b')).toBe(true);
    expect(matchesOrderSearch(camelOrder, '0912345678')).toBe(true);
    expect(matchesOrderSearch(camelOrder, 'socola')).toBe(true);
  });
});
