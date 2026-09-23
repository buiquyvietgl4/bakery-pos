// src/lib/utils/orderSearch.ts
// Bộ lọc tìm kiếm thông minh và linh hoạt cho Đơn Hàng & Hóa Đơn Tiệm Bánh
// Hỗ trợ tra cứu theo mã đơn (#BK-..., BK..., số đuôi), tên khách, SĐT, tên món, thu ngân, ghi chú

export function matchesOrderSearch(order: any, query: string): boolean {
  if (!query || !query.trim()) return true;
  const rawQ = query.trim().toLowerCase();
  if (!rawQ) return true;

  // 1. Chuẩn hóa chuỗi tìm kiếm (loại bỏ dấu # ở đầu nếu có, loại bỏ dấu gạch nối và khoảng trắng)
  const cleanQ = rawQ.replace(/^#+/, '').trim();
  const normQ = cleanQ.replace(/[\s\-_]/g, '');

  // 2. Chuẩn hóa mã đơn hàng
  const orderNum = String(order.order_number || order.orderNumber || '').toLowerCase();
  const cleanOrderNum = orderNum.replace(/^#+/, '').trim();
  const normOrderNum = cleanOrderNum.replace(/[\s\-_]/g, '');

  const orderId = String(order.id || '').toLowerCase();
  const cleanOrderId = orderId.replace(/^#+/, '').trim();
  const normOrderId = cleanOrderId.replace(/[\s\-_]/g, '');

  const localId = String(order.local_id || '').toLowerCase();
  const cleanLocalId = localId.replace(/^#+/, '').trim();

  // Khớp mã đơn
  if (
    orderNum.includes(rawQ) ||
    orderNum.includes(cleanQ) ||
    cleanOrderNum.includes(cleanQ) ||
    (normQ && normOrderNum.includes(normQ)) ||
    orderId.includes(rawQ) ||
    orderId.includes(cleanQ) ||
    (normQ && normOrderId.includes(normQ)) ||
    localId.includes(cleanQ) ||
    cleanLocalId.includes(cleanQ)
  ) {
    return true;
  }

  // 3. Khớp tên khách hàng, số điện thoại, tên bánh đặt, ghi chú, thu ngân
  const customerName = String(order.customer_name || order.customerName || '').toLowerCase();
  const customerPhone = String(order.customer_phone || order.customerPhone || '').toLowerCase();
  const cashier = String(order.cashier || '').toLowerCase();
  const notes = String(order.notes || '').toLowerCase();
  const cakeName = String(order.cakeName || order.cake_name || '').toLowerCase();

  if (
    customerName.includes(cleanQ) ||
    customerPhone.includes(cleanQ) ||
    cashier.includes(cleanQ) ||
    notes.includes(cleanQ) ||
    cakeName.includes(cleanQ)
  ) {
    return true;
  }

  // 4. Khớp tên sản phẩm trong các món của đơn hàng
  if (Array.isArray(order.items)) {
    const itemFound = order.items.some((it: any) => {
      const itName = String(it.product_name_snapshot || it.name || it.product?.name || '').toLowerCase();
      return itName.includes(cleanQ) || itName.includes(rawQ);
    });
    if (itemFound) return true;
  }

  return false;
}
