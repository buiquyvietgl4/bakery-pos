import {
  HouseholdBusinessInfo,
  TAX_BUSINESS_GROUPS,
  S2aRowItem,
  S2aSummaryByGroup,
  TaxDeclarationFormType,
  TaxRevenueThresholdAnalysis,
} from '@/lib/types/taxConfig';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { parsePreorderFromNotes } from '@/lib/supabase/realtimeSync';

export const TAX_CONFIG_KEY = 'bakery_tax_household_config';
export const TAX_CONFIG_UPDATED_EVENT = 'bakery_tax_config_updated';

export const DB_ROW_TAX_ID = '00000000-0000-0000-0000-000000000008';
export const DB_ROW_TAX_NAME = 'SYS_CONFIG_TAX_HOUSEHOLD';

export const DEFAULT_HOUSEHOLD_INFO: HouseholdBusinessInfo = {
  shop_name: 'Hộ Kinh Doanh Tiệm Bánh Ngọt',
  tax_code: '0318247020',
  business_address: '123 Phố Bánh Ngọt, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
  owner_name: 'Nguyễn Văn Chủ Tiệm',
  phone: '0981247020',
  registered_revenue_level: 2, // 500 triệu - 3 tỷ
  pit_calculation_method: 1,   // % trên doanh thu
  regular_employees_count: 5,
  operating_hours: '06:30 - 22:00',
};

export function getHouseholdBusinessInfo(): HouseholdBusinessInfo {
  if (typeof window === 'undefined') return DEFAULT_HOUSEHOLD_INFO;
  try {
    const raw = localStorage.getItem(TAX_CONFIG_KEY);
    if (raw) {
      return { ...DEFAULT_HOUSEHOLD_INFO, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_HOUSEHOLD_INFO;
}

export function saveHouseholdBusinessInfo(info: HouseholdBusinessInfo): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TAX_CONFIG_KEY, JSON.stringify(info));
    window.dispatchEvent(new CustomEvent(TAX_CONFIG_UPDATED_EVENT, { detail: info }));
  } catch {}
}

/**
 * Nạp thông tin Hộ Kinh Doanh từ Supabase SQL (hoặc Local SQL)
 */
export async function fetchHouseholdBusinessInfoFromDb(): Promise<HouseholdBusinessInfo> {
  const fallback = getHouseholdBusinessInfo();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_TAX_ID},name.eq.${DB_ROW_TAX_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed === 'object' && (parsed.shop_name || parsed.tax_code)) {
          const loaded: HouseholdBusinessInfo = {
            ...DEFAULT_HOUSEHOLD_INFO,
            ...parsed,
          };
          saveHouseholdBusinessInfo(loaded);
          return loaded;
        }
      } catch (e) {
        console.warn('Lỗi parse JSON cấu hình thuế từ SQL:', e);
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchHouseholdBusinessInfoFromDb:', err);
  }

  return fallback;
}

/**
 * Lưu thông tin Hộ Kinh Doanh đồng bộ lên CSDL SQL (Supabase Cloud + Local SQL)
 */
export async function saveHouseholdBusinessInfoToDb(
  info: HouseholdBusinessInfo
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Lưu cục bộ
    saveHouseholdBusinessInfo(info);

    // 2. Kích hoạt đồng bộ Local SQL folder nếu đang liên kết
    try {
      autoSyncToLocalSqlFolder();
    } catch {}

    if (isLocalMode()) {
      return { success: true };
    }

    // 3. Lưu lên Supabase Cloud SQL
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_TAX_ID,
        name: DB_ROW_TAX_NAME,
        notes: JSON.stringify(info),
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      console.warn('Upsert tax config thất bại, thử update trực tiếp:', upsertErr);
      const { error: updateErr } = await supabase
        .from('recipes')
        .update({
          name: DB_ROW_TAX_NAME,
          notes: JSON.stringify(info),
          is_active: false,
        })
        .eq('id', DB_ROW_TAX_ID);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.warn('Lỗi saveHouseholdBusinessInfoToDb:', err);
    return { success: false, error: err.message || 'Lỗi lưu vào SQL' };
  }
}

/**
 * Nạp toàn bộ danh sách đơn hàng thực tế trực tiếp từ Supabase Cloud SQL
 * Kèm đầy đủ chi tiết order_items để phục vụ tính toán chính xác 100% cho Sổ S2a, S2c, S2d, S2e và Tờ khai thuế 01/CNKD
 */
export async function fetchTaxOrdersFromDb(): Promise<any[]> {
  const localOrdersRaw = typeof window !== 'undefined' ? localStorage.getItem('bakery_orders') : null;
  let localOrders: any[] = [];
  if (localOrdersRaw) {
    try {
      const parsed = JSON.parse(localOrdersRaw);
      if (Array.isArray(parsed)) localOrders = parsed;
    } catch {}
  }

  if (isLocalMode()) {
    return localOrders;
  }

  try {
    const { data: dbOrders, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        order_type,
        status,
        created_at,
        preorder_pickup_at,
        subtotal,
        discount_amount,
        discount_pct,
        total_amount,
        notes,
        customer_name,
        customer_phone,
        cake_message,
        order_items (
          id,
          product_name_snapshot,
          quantity,
          unit_price,
          line_total,
          notes
        )
      `)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!error && Array.isArray(dbOrders) && dbOrders.length > 0) {
      const orderMap = new Map<string, any>();

      // 1. Cho local orders vào trước
      localOrders.forEach((lo) => {
        const key = String(lo.order_number || lo.id || Math.random());
        orderMap.set(key, lo);
      });

      // 2. Phủ dữ liệu Supabase lên (dữ liệu SQL có đầy đủ order_items)
      dbOrders.forEach((so) => {
        const key = String(so.order_number || so.id);
        const existing = orderMap.get(key);
        const items = Array.isArray(so.order_items) && so.order_items.length > 0
          ? so.order_items
          : (existing?.items || []);

        orderMap.set(key, {
          ...existing,
          ...so,
          items,
        });
      });

      const merged = Array.from(orderMap.values());
      // Lưu lại vào localStorage để offline hoặc các màn hình khác cũng có dữ liệu
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('bakery_orders', JSON.stringify(merged.slice(0, 100)));
          window.dispatchEvent(new Event('bakery_orders_updated'));
        } catch {}
      }
      return merged;
    }
  } catch (err) {
    console.warn('Lỗi fetchTaxOrdersFromDb từ Supabase:', err);
  }

  return localOrders;
}

/**
 * Phân loại một mặt hàng vào Nhóm ngành nghề tính thuế
 * 1: Hàng hóa thương mại (phụ kiện, nến, mũ, đồ chơi, pháo, bánh nhập sẵn)
 * 2: Dịch vụ (phí ship, trang trí tiệc)
 * 3: Sản xuất chế biến (bánh kem sinh nhật, bánh mì, bánh ngọt làm tại tiệm, đồ uống)
 * 4: Khác
 */
export function classifyItemTaxGroup(item: any): number {
  const name = (
    item.product_name_snapshot ||
    item.name ||
    item.product?.name ||
    item.cake_name ||
    item.title ||
    ''
  ).toLowerCase();
  const category = (item.category || item.product?.category || '').toLowerCase();

  // Nhóm 2: Dịch vụ / Phí Ship
  if (
    name.includes('phí ship') ||
    name.includes('vận chuyển') ||
    name.includes('giao hàng') ||
    name.includes('trang trí tiệc') ||
    name.includes('dịch vụ')
  ) {
    return 2;
  }

  // Nhóm 1: Phụ kiện tiệc, nến, mũ, đồ chơi, pháo, phụ kiện
  if (
    category.includes('phụ kiện') ||
    category.includes('bao bì') ||
    name.includes('nến') ||
    name.includes('mũ sinh nhật') ||
    name.includes('pháo') ||
    name.includes('đồ chơi') ||
    name.includes('dao dĩa') ||
    name.includes('hộp quà') ||
    name.includes('thiệp') ||
    item.product_type === 'imported'
  ) {
    return 1;
  }

  // Mặc định cho Tiệm Bánh: Bánh sinh nhật, bánh kem, bánh mì, đồ uống chế biến -> Nhóm 3 (Sản xuất chế biến)
  return 3;
}

/**
 * Chuyển đổi danh sách đơn hàng POS thành Sổ chi tiết S2a-HKD
 */
export function generateS2aLedger(orders: any[]): {
  rows: S2aRowItem[];
  summary: S2aSummaryByGroup[];
  totalRevenue: number;
  totalVat: number;
  totalPit: number;
  totalTax: number;
} {
  const rows: S2aRowItem[] = [];

  // Lặp qua từng đơn hàng
  orders.forEach((order, orderIdx) => {
    // Bỏ qua đơn đã hủy nếu không phát sinh tiền
    if (order.status === 'cancelled') {
      const oTot = Number(order.total_amount || 0);
      if (oTot === 0) return;
    }

    const rawDate = (order.created_at || order.createdAt || new Date().toISOString()).slice(0, 10);
    const parts = rawDate.split('-');
    const voucherDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : rawDate;
    const voucherNo = order.order_number || order.orderNumber || order.id || `HD-${String(orderIdx + 1).padStart(4, '0')}`;
    const paymentMethod = order.payment_method || order.paymentMethod || 'Tiền mặt';

    // 1. Xác định tổng doanh thu của đơn hàng
    let orderRevenue = Number(order.total_amount ?? order.totalPrice ?? order.subtotal ?? 0);
    if (isNaN(orderRevenue)) orderRevenue = 0;

    // Nếu đơn hàng có ghi chú [ĐẶT BÁNH KEM], thử bóc tách nếu orderRevenue = 0
    if (orderRevenue === 0 && order.notes && typeof order.notes === 'string') {
      const fromNotes = parsePreorderFromNotes(order.notes);
      if (fromNotes.total_amount) {
        orderRevenue = fromNotes.total_amount;
      } else if (fromNotes.deposit_amount && fromNotes.remaining_amount) {
        orderRevenue = fromNotes.deposit_amount + fromNotes.remaining_amount;
      }
    }

    const rawItems = Array.isArray(order.items)
      ? order.items.filter((it: any) => it && typeof it === 'object')
      : Array.isArray(order.order_items)
      ? order.order_items.filter((it: any) => it && typeof it === 'object')
      : [];

    // Nếu đơn hàng test dummy có 0đ doanh thu và không có items -> Bỏ qua không đưa vào sổ thuế
    if (orderRevenue === 0 && rawItems.length === 0) {
      return;
    }

    // 2. Xử lý các món hàng chi tiết (items)
    if (rawItems.length > 0) {
      let sumItemsRev = 0;
      const parsedItems = rawItems.map((item: any) => {
        const lineQty = Math.max(1, Number(item.quantity || item.qty) || 1);
        let lineRev = Number(item.line_total);
        if (isNaN(lineRev) || lineRev === 0) {
          const uPrice = Number(item.unit_price ?? item.price ?? 0);
          lineRev = uPrice * lineQty;
        }
        sumItemsRev += lineRev;
        return { item, lineQty, lineRev };
      });

      // Nếu tổng items = 0 nhưng cả đơn có orderRevenue > 0: Phân bổ cho các món
      if (sumItemsRev === 0 && orderRevenue > 0) {
        const splitAmount = Math.round(orderRevenue / parsedItems.length);
        parsedItems.forEach((pi: any, idx: number) => {
          if (idx === parsedItems.length - 1) {
            pi.lineRev = orderRevenue - splitAmount * (parsedItems.length - 1);
          } else {
            pi.lineRev = splitAmount;
          }
        });
      }

      parsedItems.forEach(({ item, lineQty, lineRev }: { item: any; lineQty: number; lineRev: number }, itemIdx: number) => {
        // Nếu dòng này không có tiền (ví dụ quà tặng 0đ), bỏ qua không tính thuế
        if (lineRev === 0 && orderRevenue === 0) return;

        const groupId = classifyItemTaxGroup(item);
        const groupDef = TAX_BUSINESS_GROUPS.find((g) => g.id === groupId) || TAX_BUSINESS_GROUPS[2];
        const vatAmount = Math.round((lineRev * groupDef.vat_percent) / 100);
        const pitAmount = Math.round((lineRev * groupDef.pit_percent) / 100);

        const itemName =
          item.product_name_snapshot ||
          item.name ||
          item.product?.name ||
          item.cake_name ||
          order.cake_name ||
          'Sản phẩm tiệm bánh';

        rows.push({
          id: `${order.id || orderIdx}-${itemIdx}`,
          voucher_no: voucherNo,
          voucher_date: voucherDate,
          raw_date: rawDate,
          description: `Bán lẻ: ${itemName} (x${lineQty})`,
          group_id: groupId,
          group_name: groupDef.name,
          revenue: lineRev,
          vat_amount: vatAmount,
          pit_amount: pitAmount,
          payment_method: paymentMethod,
        });
      });
    } else {
      // Đơn hàng không có mảng chi tiết (tính theo tổng đơn)
      if (orderRevenue === 0) return;
      const groupId = 3; // Nhóm 3 mặc định: Sản xuất bánh
      const groupDef = TAX_BUSINESS_GROUPS[2];
      const vatAmount = Math.round((orderRevenue * groupDef.vat_percent) / 100);
      const pitAmount = Math.round((orderRevenue * groupDef.pit_percent) / 100);

      const desc = order.customer_name
        ? `Bán lẻ bánh theo yêu cầu khách ${order.customer_name} - Đơn ${voucherNo}`
        : `Bán lẻ bánh và đồ uống tại quầy - Đơn ${voucherNo}`;

      rows.push({
        id: `${order.id || orderIdx}`,
        voucher_no: voucherNo,
        voucher_date: voucherDate,
        raw_date: rawDate,
        description: desc,
        group_id: groupId,
        group_name: groupDef.name,
        revenue: orderRevenue,
        vat_amount: vatAmount,
        pit_amount: pitAmount,
        payment_method: paymentMethod,
      });
    }
  });

  // Tính tổng hợp theo 5 nhóm ngành nghề
  const summary: S2aSummaryByGroup[] = TAX_BUSINESS_GROUPS.map((group) => {
    const groupRows = rows.filter((r) => r.group_id === group.id);
    const total_revenue = groupRows.reduce((s, r) => s + r.revenue, 0);
    const total_vat = groupRows.reduce((s, r) => s + r.vat_amount, 0);
    const total_pit = groupRows.reduce((s, r) => s + r.pit_amount, 0);
    return {
      group_id: group.id,
      group_name: group.name,
      vat_percent: group.vat_percent,
      pit_percent: group.pit_percent,
      total_revenue,
      total_vat,
      total_pit,
      total_tax: total_vat + total_pit,
      count: groupRows.length,
    };
  });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalVat = summary.reduce((s, g) => s + g.total_vat, 0);
  const totalPit = summary.reduce((s, g) => s + g.total_pit, 0);
  const totalTax = totalVat + totalPit;

  return {
    rows,
    summary,
    totalRevenue,
    totalVat,
    totalPit,
    totalTax,
  };
}

/**
 * Phân tích ngưỡng doanh thu năm (1 tỷ đồng) để tự động quyết định sử dụng Mẫu tờ khai thuế:
 * - Doanh thu <= 1 Tỷ: Áp dụng Mẫu 01/TKN-CNKD (Nghị định 141/2026/NĐ-CP & Thông tư 50/2026/TT-BTC) -> MIỄN 100% THUẾ GTGT & TNCN!
 * - Doanh thu > 1 Tỷ: Áp dụng Mẫu 01/CNKD (Kê khai nộp thuế % theo định kỳ)
 */
export function analyzeTaxRevenueThreshold(
  orders: any[],
  targetYear?: number
): TaxRevenueThresholdAnalysis {
  const currentYear = targetYear || new Date().getFullYear();
  const yearPrefix = `${currentYear}-`;

  // Lọc các đơn hàng trong năm mục tiêu
  const annualOrders = orders.filter((o) => {
    const rawDate = (o.created_at || o.createdAt || '').slice(0, 10);
    return rawDate.startsWith(yearPrefix) || !rawDate;
  });

  const s2a = generateS2aLedger(annualOrders);
  const currentYearRevenue = s2a.totalRevenue;
  const annualThreshold = 1_000_000_000; // 1 Tỷ đồng

  const isUnder = currentYearRevenue <= annualThreshold;
  const recommendedForm: TaxDeclarationFormType = isUnder ? '01/TKN-CNKD' : '01/CNKD';
  const percentOfThreshold = Math.min(100, Math.round((currentYearRevenue / annualThreshold) * 1000) / 10);
  const remainingUntilThreshold = Math.max(0, annualThreshold - currentYearRevenue);

  return {
    annual_threshold: annualThreshold,
    current_year_revenue: currentYearRevenue,
    is_under_threshold: isUnder,
    recommended_form: recommendedForm,
    tax_exemption_status: isUnder,
    percent_of_threshold: percentOfThreshold,
    remaining_until_threshold: remainingUntilThreshold,
  };
}
