import { describe, it, expect } from 'vitest';
import { formatVND, formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';

describe('formatVND', () => {
  it('định dạng số dương chuẩn có ký hiệu ₫', () => {
    // Lưu ý toLocaleString('vi-VN') có thể dùng dấu chấm hoặc non-breaking space tùy môi trường
    const res = formatVND(320000);
    expect(res).toContain('320');
    expect(res).toContain('000');
    expect(res.endsWith('₫')).toBe(true);
  });

  it('định dạng khi withSymbol = false', () => {
    const res = formatVND(320000, false);
    expect(res).toContain('320');
    expect(res).toContain('000');
    expect(res).not.toContain('₫');
  });

  it('xử lý giá trị 0', () => {
    expect(formatVND(0)).toBe('0₫');
    expect(formatVND(0, false)).toBe('0');
  });

  it('xử lý null, undefined và chuỗi rỗng', () => {
    expect(formatVND(null)).toBe('0₫');
    expect(formatVND(undefined)).toBe('0₫');
    expect(formatVND('')).toBe('0₫');
    expect(formatVND('', false)).toBe('0');
  });

  it('xử lý chuỗi số có ký tự định dạng sẵn', () => {
    const res = formatVND('500.000');
    expect(res).toContain('500');
    expect(res).toContain('000');
    expect(res.endsWith('₫')).toBe(true);
  });

  it('xử lý số âm', () => {
    const res = formatVND(-150000);
    expect(res.startsWith('-')).toBe(true);
    expect(res).toContain('150');
    expect(res.endsWith('₫')).toBe(true);

    const resStr = formatVND('-150000');
    expect(resStr.startsWith('-')).toBe(true);
    expect(resStr).toContain('150');
  });

  it('làm tròn số thập phân', () => {
    const res = formatVND(10000.7);
    expect(res).toContain('10');
    expect(res).toContain('001');
  });
});

describe('formatCurrencyInput', () => {
  it('định dạng số thành chuỗi hiển thị input', () => {
    const res = formatCurrencyInput(1000000);
    expect(res).toContain('1');
    expect(res).toContain('000');
  });

  it('xử lý số 0 với allowZero = false mặc định', () => {
    expect(formatCurrencyInput(0)).toBe('');
    expect(formatCurrencyInput('0')).toBe('');
  });

  it('xử lý số 0 với allowZero = true', () => {
    expect(formatCurrencyInput(0, true)).toBe('0');
    expect(formatCurrencyInput('0', true)).toBe('0');
  });

  it('xử lý null/undefined/empty', () => {
    expect(formatCurrencyInput(null)).toBe('');
    expect(formatCurrencyInput(undefined)).toBe('');
    expect(formatCurrencyInput('')).toBe('');
    expect(formatCurrencyInput('abc')).toBe('');
  });
});

describe('parseCurrencyInput', () => {
  it('chuyển chuỗi phân cách hàng nghìn thành số nguyên', () => {
    expect(parseCurrencyInput('320.000')).toBe(320000);
    expect(parseCurrencyInput('1,500,000')).toBe(1500000);
    expect(parseCurrencyInput('1000000')).toBe(1000000);
  });

  it('xử lý input đã là số', () => {
    expect(parseCurrencyInput(50000)).toBe(50000);
    expect(parseCurrencyInput(0)).toBe(0);
    expect(parseCurrencyInput(NaN)).toBe(0);
  });

  it('xử lý falsy input', () => {
    expect(parseCurrencyInput(null)).toBe(0);
    expect(parseCurrencyInput(undefined)).toBe(0);
    expect(parseCurrencyInput('')).toBe(0);
    expect(parseCurrencyInput('abc')).toBe(0);
  });
});
