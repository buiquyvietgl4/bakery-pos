/**
 * src/lib/utils/formatCurrency.ts
 * Tien ich dinh dang tien te va xu ly input so tien voi dau cham phan cach hang nghin (Viet Nam: 100.000d)
 */

/**
 * Dinh dang so thanh chuoi tien te chuan VND co dau cham phan cach hang nghin.
 * VD: 320000 -> "320.000₫" (hoac "320.000" neu withSymbol = false)
 */
export function formatVND(amount: number | string | undefined | null, withSymbol: boolean = true): string {
  if (amount === undefined || amount === null || amount === '') return withSymbol ? '0₫' : '0';
  let num: number;
  if (typeof amount === 'number') {
    num = amount;
  } else {
    const isNegative = String(amount).trim().startsWith('-');
    const clean = String(amount).replace(/\D/g, '');
    num = clean ? parseInt(clean, 10) : 0;
    if (isNegative) num = -num;
  }
  if (isNaN(num)) return withSymbol ? '0₫' : '0';
  const isNeg = num < 0;
  const absFormatted = Math.abs(Math.round(num)).toLocaleString('vi-VN');
  const formatted = isNeg ? `-${absFormatted}` : absFormatted;
  return withSymbol ? `${formatted}₫` : formatted;
}

/**
 * Dinh dang gia tri hien thi cho cac o Input tien te.
 * Tu dong them dau cham ngan cach hang nghin (VD: 320000 -> "320.000", 0 hoac rong -> "")
 * Neu allowZero = true: 0 -> "0"
 */
export function formatCurrencyInput(val: number | string | undefined | null, allowZero: boolean = false): string {
  if (val === undefined || val === null || val === '') return '';
  const numStr = String(val).replace(/\D/g, '');
  if (!numStr) return '';
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return '';
  if (num === 0) return allowZero ? '0' : '';
  return num.toLocaleString('vi-VN');
}

/**
 * Chuyen chuoi trong o Input (co the chua dau cham, phay) thanh so nguyen (VD: "320.000" -> 320000)
 */
export function parseCurrencyInput(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const clean = String(val).replace(/\D/g, '');
  return clean ? parseInt(clean, 10) : 0;
}
