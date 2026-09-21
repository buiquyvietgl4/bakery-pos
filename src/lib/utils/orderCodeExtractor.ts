/**
 * Trích xuất thông minh mã đơn hàng từ nội dung chuyển khoản ngân hàng
 * Ví dụ: "DH123456", "DH-987654", "BK-PRE-102", "BK-SHIP-2409", "DH 445566"
 */
export function extractOrderCode(text: string): string | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Mã đơn đặt bánh kem / giao hàng: BK-PRE-xxx, BK-SHIP-xxx, BK-xxx
  const bkMatch = text.match(/\b(BK-(?:PRE|SHIP)-[A-Za-z0-9-]+|BK-[A-Za-z0-9-]+)\b/i);
  if (bkMatch) return bkMatch[1].toUpperCase();

  // 2. Mã đơn POS / VietQR tiêu chuẩn: DH123456, DH-123456, DH_123456
  const dhMatch = text.match(/\b(DH[-_]?[A-Za-z0-9]{4,16})\b/i);
  if (dhMatch) return dhMatch[1].toUpperCase();

  // 3. Mã đơn tiền tố ORD hoặc ORDER: ORD-12345, ORDER-12345
  const ordMatch = text.match(/\b((?:ORD|ORDER)[-_]?[A-Za-z0-9]{3,16})\b/i);
  if (ordMatch) return ordMatch[1].toUpperCase();

  // 4. Trường hợp có khoảng trắng giữa tiền tố và số: "DH 123456"
  const dhSpaceMatch = text.match(/\bDH\s*([0-9]{4,12})\b/i);
  if (dhSpaceMatch) return `DH${dhSpaceMatch[1]}`;

  return null;
}
