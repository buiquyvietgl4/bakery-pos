import { HouseholdBusinessInfo, TAX_BUSINESS_GROUPS, S2aRowItem, S2aSummaryByGroup } from '@/lib/types/taxConfig';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

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
 * Phân loại một mặt hàng vào Nhóm ngành nghề tính thuế
 * 1: Hàng hóa thương mại (phụ kiện, nến, bánh nhập sẵn)
 * 2: Dịch vụ (phí ship, trang trí tiệc)
 * 3: Sản xuất chế biến (bánh kem sinh nhật, bánh mì, bánh ngọt làm tại tiệm, đồ uống)
 * 4: Khác
 */
export function classifyItemTaxGroup(item: any): number {
  const name = (item.name || item.product_name || item.title || '').toLowerCase();
  const category = (item.category || '').toLowerCase();

  // Nhóm 2: Dịch vụ / Ship
  if (name.includes('phí ship') || name.includes('vận chuyển') || name.includes('giao hàng') || name.includes('trang trí tiệc')) {
    return 2;
  }

  // Nhóm 1: Phụ kiện tiệc, nến, mũ, đồ chơi, pháo
  if (
    category.includes('phụ kiện') ||
    category.includes('bao bì') ||
    name.includes('nến') ||
    name.includes('mũ sinh nhật') ||
    name.includes('pháo') ||
    name.includes('đồ chơi') ||
    name.includes('dao dĩa') ||
    name.includes('hộp quà')
  ) {
    return 1;
  }

  // Mặc định cho Tiệm Bánh: Bánh sinh nhật, bánh kem, bánh mì, đồ uống chế biến -> Nhóm 3
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
    const rawDate = (order.created_at || order.createdAt || new Date().toISOString()).slice(0, 10);
    const parts = rawDate.split('-');
    const voucherDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : rawDate;
    const voucherNo = order.order_number || order.orderNumber || order.id || `HD-${String(orderIdx + 1).padStart(4, '0')}`;
    const paymentMethod = order.payment_method || order.paymentMethod || 'Tiền mặt';

    // Nếu đơn hàng có mảng chi tiết items
    if (Array.isArray(order.items) && order.items.length > 0) {
      order.items.forEach((item: any, itemIdx: number) => {
        const groupId = classifyItemTaxGroup(item);
        const groupDef = TAX_BUSINESS_GROUPS.find((g) => g.id === groupId) || TAX_BUSINESS_GROUPS[2];
        const lineQty = item.quantity || item.qty || 1;
        const linePrice = item.price || item.unit_price || 0;
        const lineRevenue = (item.total || linePrice * lineQty) || 0;
        const vatAmount = Math.round((lineRevenue * groupDef.vat_percent) / 100);
        const pitAmount = Math.round((lineRevenue * groupDef.pit_percent) / 100);

        rows.push({
          id: `${order.id || orderIdx}-${itemIdx}`,
          voucher_no: voucherNo,
          voucher_date: voucherDate,
          raw_date: rawDate,
          description: `Bán lẻ: ${item.name || 'Sản phẩm tiệm bánh'} (x${lineQty})`,
          group_id: groupId,
          group_name: groupDef.name,
          revenue: lineRevenue,
          vat_amount: vatAmount,
          pit_amount: pitAmount,
          payment_method: paymentMethod,
        });
      });
    } else {
      // Đơn hàng không có mảng chi tiết (tính theo tổng đơn)
      const lineRevenue = order.total_amount || order.totalPrice || 0;
      const groupId = 3; // Nhóm 3 mặc định: Sản xuất bánh
      const groupDef = TAX_BUSINESS_GROUPS[2];
      const vatAmount = Math.round((lineRevenue * groupDef.vat_percent) / 100);
      const pitAmount = Math.round((lineRevenue * groupDef.pit_percent) / 100);

      rows.push({
        id: `${order.id || orderIdx}`,
        voucher_no: voucherNo,
        voucher_date: voucherDate,
        raw_date: rawDate,
        description: `Bán lẻ bánh và đồ uống tại quầy - Đơn ${voucherNo}`,
        group_id: groupId,
        group_name: groupDef.name,
        revenue: lineRevenue,
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
