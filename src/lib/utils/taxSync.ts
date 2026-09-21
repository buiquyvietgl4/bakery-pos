import {
  HouseholdBusinessInfo,
  TaxPolicyConfig,
  BkHdkdInventoryRow,
  BkHdkdExpenseSummary,
  BkHdkdExpenseItemRow,
  TAX_BUSINESS_GROUPS,
  S2aRowItem,
  S2aSummaryByGroup,
  S2eRowItem,
  TaxDeclarationFormType,
  TaxRevenueThresholdAnalysis,
} from '@/lib/types/taxConfig';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { parsePreorderFromNotes } from '@/lib/supabase/realtimeSync';
import { pruneOrdersCache, MAX_CACHED_ORDERS } from '@/lib/utils/deliveryAlerts';
import { isImportedProduct } from '@/lib/utils/productManager';

export const TAX_CONFIG_KEY = 'bakery_tax_household_config';
export const TAX_CONFIG_UPDATED_EVENT = 'bakery_tax_config_updated';

export const TAX_POLICY_KEY = 'bakery_tax_policy_config';
export const TAX_POLICY_UPDATED_EVENT = 'bakery_tax_policy_updated';
export const TAX_AUTO_SYNC_EVENT = 'bakery_tax_auto_synced';

export const DB_ROW_TAX_ID = '00000000-0000-0000-0000-00000000000c';
export const DB_ROW_TAX_NAME = 'SYS_CONFIG_TAX_HOUSEHOLD';

export const DB_ROW_TAX_POLICY_ID = '00000000-0000-0000-0000-00000000000e';
export const DB_ROW_TAX_POLICY_NAME = 'SYS_CONFIG_TAX_POLICY';

export const DEFAULT_HOUSEHOLD_INFO: HouseholdBusinessInfo = {
  shop_name: 'Hộ Kinh Doanh Tiệm Bánh Ngọt',
  tax_code: '0318247020',
  business_address: '123 Phố Bánh Ngọt, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
  owner_name: 'Nguyễn Văn Chủ Tiệm',
  phone: '0981247020',
  email: 'tiembanhngot@example.com',
  business_area: 85,
  bank_account_number: '1029384756',
  bank_name: 'Vietcombank',
  district: 'Quận 1',
  province: 'TP. Hồ Chí Minh',
  software_name: 'Bakery POS ERP',
  registered_revenue_level: 2, // 500 triệu - 3 tỷ
  pit_calculation_method: 1,   // % trên doanh thu
  regular_employees_count: 5,
  operating_hours: '06:30 - 22:00',
};

export const DEFAULT_TAX_POLICY: TaxPolicyConfig = {
  id: 'POLICY_2026_ND141',
  name: 'Chính sách thuế mới năm 2026 (Nghị định 141/2026/NĐ-CP & Thông tư 50/2026/TT-BTC)',
  version: '2026.1',
  policy_name: 'Nghị Định 141 & Thông Tư 50-BTC (2026)',
  effective_date: '01/01/2026',
  annual_threshold: 1_000_000_000, // 1 Tỷ đồng
  is_active: true,
  notes: 'Bãi bỏ thuế khoán, bãi bỏ lệ phí môn bài. Doanh thu <= 1 tỷ miễn 100% thuế GTGT & TNCN. Doanh thu > 1 tỷ nộp thuế theo phương pháp kê khai định kỳ và áp dụng HĐĐT máy tính tiền.',
  circular_citation: 'Thông tư số 50/2026/TT-BTC & Nghị định 141/2026/NĐ-CP',
  circular_01_tkn_ref: 'Mẫu số 01/TKN-CNKD ban hành kèm theo Thông tư số 50/2026/TT-BTC & Nghị định 141/2026/NĐ-CP',
  circular_01_cnkd_ref: 'Mẫu số 01/CNKD ban hành kèm theo Thông tư số 40/2021/TT-BTC & Nghị định số 68/2026/NĐ-CP (NĐ 141/2026/NĐ-CP)',
  circular_01_2_bkhdkd_ref: 'Phụ lục 01-2/BK-HĐKD ban hành kèm theo Thông tư số 40/2021/TT-BTC',
  circular_books_ref: 'Thông tư số 88/2021/TT-BTC & Thông tư số 152/2025/TT-BTC',
  tax_groups: TAX_BUSINESS_GROUPS,
  cost_indicators: [
    { code: '[24]', label: 'Chi phí nhân công', keywords: ['lương', 'nhân công', 'thợ', 'phụ cấp', 'thưởng', 'công nhật', 'tiền công'] },
    { code: '[25]', label: 'Chi phí điện', keywords: ['điện', 'tiền điện', 'lò nướng', 'evn'] },
    { code: '[26]', label: 'Chi phí nước', keywords: ['nước', 'tiền nước', 'thủy cục', 'sawaco'] },
    { code: '[27]', label: 'Chi phí viễn thông', keywords: ['internet', 'wifi', 'điện thoại', 'viễn thông', 'cước', 'vnpt', 'viettel', 'fpt'] },
    { code: '[28]', label: 'Chi phí thuê kho bãi, mặt bằng kinh doanh', keywords: ['thuê mặt bằng', 'mặt bằng', 'thuê nhà', 'thuê tiệm', 'tiền thuê', 'kho'] },
    { code: '[29]', label: 'Chi phí quản lý', keywords: ['văn phòng', 'quản lý', 'giấy', 'bút', 'bao bì', 'túi', 'hộp', 'dao', 'dĩa', 'nến', 'công cụ'] },
    { code: '[30]', label: 'Chi phí khác', keywords: [] },
  ],
};

export const PRESET_TAX_POLICIES: Record<string, TaxPolicyConfig> = {
  POLICY_2026_ND141: DEFAULT_TAX_POLICY,
  '2026_ND141_TT50': DEFAULT_TAX_POLICY,
  TT40_2021: {
    id: 'POLICY_TT40_LEGACY',
    name: 'Chính sách truyền thống TT 40/2021/TT-BTC (Ngưỡng 100 triệu)',
    version: '2021.1',
    policy_name: 'Thông Tư 40/2021/TT-BTC',
    effective_date: '01/01/2022',
    annual_threshold: 100_000_000,
    is_active: false,
    notes: 'Áp dụng theo Thông tư 40/2021/TT-BTC trước khi nâng ngưỡng lên 1 tỷ.',
    circular_citation: 'Thông tư số 40/2021/TT-BTC',
    circular_01_tkn_ref: 'Mẫu số 01/TKN-CNKD ban hành kèm theo Thông tư số 40/2021/TT-BTC',
    circular_01_cnkd_ref: 'Mẫu số 01/CNKD ban hành kèm theo Thông tư số 40/2021/TT-BTC',
    circular_01_2_bkhdkd_ref: 'Phụ lục 01-2/BK-HĐKD ban hành kèm theo Thông tư số 40/2021/TT-BTC',
    circular_books_ref: 'Thông tư số 88/2021/TT-BTC',
    tax_groups: TAX_BUSINESS_GROUPS,
    cost_indicators: DEFAULT_TAX_POLICY.cost_indicators,
  },
  POLICY_TT40_LEGACY: {
    id: 'POLICY_TT40_LEGACY',
    name: 'Chính sách truyền thống TT 40/2021/TT-BTC (Ngưỡng 100 triệu)',
    version: '2021.1',
    policy_name: 'Thông Tư 40/2021/TT-BTC',
    effective_date: '01/01/2022',
    annual_threshold: 100_000_000,
    is_active: false,
    notes: 'Áp dụng theo Thông tư 40/2021/TT-BTC trước khi nâng ngưỡng lên 1 tỷ.',
    circular_citation: 'Thông tư số 40/2021/TT-BTC',
    circular_01_tkn_ref: 'Mẫu số 01/TKN-CNKD ban hành kèm theo Thông tư số 40/2021/TT-BTC',
    circular_01_cnkd_ref: 'Mẫu số 01/CNKD ban hành kèm theo Thông tư số 40/2021/TT-BTC',
    circular_01_2_bkhdkd_ref: 'Phụ lục 01-2/BK-HĐKD ban hành kèm theo Thông tư số 40/2021/TT-BTC',
    circular_books_ref: 'Thông tư số 88/2021/TT-BTC',
    tax_groups: TAX_BUSINESS_GROUPS,
    cost_indicators: DEFAULT_TAX_POLICY.cost_indicators,
  },
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
let cachedInfo: HouseholdBusinessInfo | null = null;
let lastFetchInfoTime = 0;
let inflightInfoPromise: Promise<HouseholdBusinessInfo> | null = null;
const INFO_CACHE_TTL_MS = 60_000; // 1 phút

export async function fetchHouseholdBusinessInfoFromDb(force = false): Promise<HouseholdBusinessInfo> {
  const fallback = getHouseholdBusinessInfo();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  const now = Date.now();
  if (!force && cachedInfo && now - lastFetchInfoTime < INFO_CACHE_TTL_MS) {
    return cachedInfo;
  }

  if (inflightInfoPromise) {
    return inflightInfoPromise;
  }

  inflightInfoPromise = (async () => {
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
            cachedInfo = loaded;
            lastFetchInfoTime = Date.now();
            try {
              localStorage.setItem(TAX_CONFIG_KEY, JSON.stringify(loaded));
            } catch {}
            return loaded;
          }
        } catch (e) {
          console.warn('Lỗi parse JSON cấu hình thuế từ SQL:', e);
        }
      }
    } catch (err) {
      console.warn('Lỗi fetchHouseholdBusinessInfoFromDb:', err);
    } finally {
      inflightInfoPromise = null;
    }
    cachedInfo = fallback;
    lastFetchInfoTime = Date.now();
    return fallback;
  })();

  return inflightInfoPromise;
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
 * Lấy cấu hình chính sách thuế hiện hành
 */
export function getTaxPolicyConfig(): TaxPolicyConfig {
  if (typeof window === 'undefined') return DEFAULT_TAX_POLICY;
  try {
    const raw = localStorage.getItem(TAX_POLICY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!parsed.annual_threshold || parsed.annual_threshold < 500_000_000) {
        parsed.annual_threshold = 1_000_000_000;
      }
      return { ...DEFAULT_TAX_POLICY, ...parsed };
    }
  } catch {}
  return DEFAULT_TAX_POLICY;
}

/**
 * Lưu cấu hình chính sách thuế cục bộ
 */
export function saveTaxPolicyConfig(policy: TaxPolicyConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TAX_POLICY_KEY, JSON.stringify(policy));
    window.dispatchEvent(new CustomEvent(TAX_POLICY_UPDATED_EVENT, { detail: policy }));
  } catch {}
}

/**
 * Nạp cấu hình chính sách thuế từ Supabase Cloud SQL
 */
let cachedPolicy: TaxPolicyConfig | null = null;
let lastFetchPolicyTime = 0;
let inflightPolicyPromise: Promise<TaxPolicyConfig> | null = null;
const POLICY_CACHE_TTL_MS = 60_000; // 1 phút

export async function fetchTaxPolicyConfigFromDb(force = false): Promise<TaxPolicyConfig> {
  const fallback = getTaxPolicyConfig();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  const now = Date.now();
  if (!force && cachedPolicy && now - lastFetchPolicyTime < POLICY_CACHE_TTL_MS) {
    return cachedPolicy;
  }

  if (inflightPolicyPromise) {
    return inflightPolicyPromise;
  }

  inflightPolicyPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('notes')
        .or(`id.eq.${DB_ROW_TAX_POLICY_ID},name.eq.${DB_ROW_TAX_POLICY_NAME}`)
        .limit(1)
        .maybeSingle();

      if (!error && data?.notes) {
        try {
          const parsed = JSON.parse(data.notes);
          if (parsed && typeof parsed === 'object' && (parsed.annual_threshold || parsed.tax_groups)) {
            const loaded: TaxPolicyConfig = {
              ...DEFAULT_TAX_POLICY,
              ...parsed,
            };
            cachedPolicy = loaded;
            lastFetchPolicyTime = Date.now();
            try {
              localStorage.setItem(TAX_POLICY_KEY, JSON.stringify(loaded));
            } catch {}
            return loaded;
          }
        } catch (e) {
          console.warn('Lỗi parse JSON chính sách thuế từ SQL:', e);
        }
      }
    } catch (err) {
      console.warn('Lỗi fetchTaxPolicyConfigFromDb:', err);
    } finally {
      inflightPolicyPromise = null;
    }
    cachedPolicy = fallback;
    lastFetchPolicyTime = Date.now();
    return fallback;
  })();

  return inflightPolicyPromise;
}

/**
 * Lưu cấu hình chính sách thuế đồng bộ lên CSDL SQL
 */
export async function saveTaxPolicyConfigToDb(
  policy: TaxPolicyConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    saveTaxPolicyConfig(policy);

    try {
      autoSyncToLocalSqlFolder();
    } catch {}

    if (isLocalMode()) {
      return { success: true };
    }

    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_TAX_POLICY_ID,
        name: DB_ROW_TAX_POLICY_NAME,
        notes: JSON.stringify(policy),
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      const { error: updateErr } = await supabase
        .from('recipes')
        .update({
          name: DB_ROW_TAX_POLICY_NAME,
          notes: JSON.stringify(policy),
          is_active: false,
        })
        .eq('id', DB_ROW_TAX_POLICY_ID);

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi lưu chính sách thuế vào SQL' };
  }
}

/**
 * TỰ ĐỘNG ĐỒNG BỘ DỮ LIỆU THUẾ LÊN SQL TRONG NỀN (BACKGROUND AUTO-SYNC)
 * Người dùng không cần bấm nút thủ công. Hệ thống tự động ghi nhận và lưu lên SQL.
 */
let autoSyncTimeout: any = null;
export function triggerTaxAutoSyncToDb(
  info?: HouseholdBusinessInfo,
  policy?: TaxPolicyConfig
): void {
  if (typeof window === 'undefined') return;

  if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
  autoSyncTimeout = setTimeout(async () => {
    try {
      const curInfo = info || getHouseholdBusinessInfo();
      const curPolicy = policy || getTaxPolicyConfig();

      await Promise.allSettled([
        saveHouseholdBusinessInfoToDb(curInfo),
        saveTaxPolicyConfigToDb(curPolicy),
      ]);

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      window.dispatchEvent(
        new CustomEvent(TAX_AUTO_SYNC_EVENT, {
          detail: { timestamp: timeStr, success: true },
        })
      );
    } catch (e) {
      console.warn('Auto sync tax in background error:', e);
    }
  }, 1000);
}

/**
 * Nạp danh sách đơn hàng thực tế từ Supabase Cloud SQL
 * Kèm đầy đủ chi tiết order_items để phục vụ tính toán chính xác 100% cho Sổ S2a, S2c, S2d, S2e và Tờ khai thuế 01/CNKD
 * Được bảo vệ với Cache 25s và khử trùng lặp yêu cầu mạng (In-flight deduplication)
 */
let cachedTaxOrders: any[] | null = null;
let lastFetchTaxOrdersTime = 0;
let inflightTaxOrdersPromise: Promise<any[]> | null = null;
const TAX_ORDERS_CACHE_TTL_MS = 25_000; // 25 giây cache

export async function fetchTaxOrdersFromDb(force = false): Promise<any[]> {
  const localOrdersRaw = typeof window !== 'undefined' ? localStorage.getItem('bakery_orders') : null;
  let localOrders: any[] = [];
  if (localOrdersRaw) {
    try {
      const parsed = JSON.parse(localOrdersRaw);
      if (Array.isArray(parsed)) localOrders = parsed;
    } catch {}
  }

  if (isLocalMode() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    cachedTaxOrders = localOrders;
    lastFetchTaxOrdersTime = Date.now();
    return localOrders;
  }

  const now = Date.now();
  if (!force && cachedTaxOrders && now - lastFetchTaxOrdersTime < TAX_ORDERS_CACHE_TTL_MS) {
    return cachedTaxOrders;
  }

  if (inflightTaxOrdersPromise) {
    return inflightTaxOrdersPromise;
  }

  inflightTaxOrdersPromise = (async () => {
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
            product_id,
            product_name_snapshot,
            quantity,
            unit_price,
            line_total,
            notes
          )
        `)
        .order('created_at', { ascending: false })
        .limit(300);

      if (!error && Array.isArray(dbOrders) && dbOrders.length > 0) {
        const orderMap = new Map<string, any>();
        const localByNumber = new Map<string, any>();
        localOrders.forEach((lo) => {
          const key = String(lo.order_number || lo.id || '');
          if (key) localByNumber.set(key, lo);
        });

        // 1. Nguồn chân lý từ Supabase SQL (đầy đủ order_items chuẩn, kết hợp metadata cục bộ)
        dbOrders.forEach((so) => {
          const key = String(so.order_number || so.id);
          const existing = localByNumber.get(key);
          const items = Array.isArray(so.order_items) && so.order_items.length > 0
            ? so.order_items.map((soItem: any) => {
                const existingItem = Array.isArray(existing?.items)
                  ? existing.items.find((ei: any) =>
                      (soItem.product_id && (ei.product_id === soItem.product_id || ei.product?.id === soItem.product_id || ei.id === soItem.product_id)) ||
                      (soItem.product_name_snapshot && (ei.product_name_snapshot === soItem.product_name_snapshot || ei.name === soItem.product_name_snapshot || ei.product?.name === soItem.product_name_snapshot))
                    )
                  : null;
                return {
                  ...existingItem,
                  ...soItem,
                  product_type: existingItem?.product_type || existingItem?.product?.product_type || soItem.product_type,
                  category: existingItem?.category || existingItem?.product?.category || soItem.category,
                  supplier_name: existingItem?.supplier_name || existingItem?.product?.supplier_name || soItem.supplier_name,
                };
              })
            : (existing?.items || []);

          orderMap.set(key, {
            ...existing,
            ...so,
            items,
          });
        });

        // 2. Chỉ bổ sung các đơn hàng POS tạo offline đang chờ đẩy lên Supabase
        localOrders.forEach((lo) => {
          if (!lo || !lo.order_number) return;
          const key = String(lo.order_number || lo.id);
          if (!orderMap.has(key) && (lo.sync_status === 'pending' || lo.is_offline === true)) {
            orderMap.set(key, lo);
          }
        });

        const merged = Array.from(orderMap.values());
        cachedTaxOrders = merged;
        lastFetchTaxOrdersTime = Date.now();

        // Cập nhật âm thầm vào localStorage nếu có khác biệt (TUYỆT ĐỐI KHÔNG dispatch event để tránh đệ quy vô tận)
        if (typeof window !== 'undefined') {
          try {
            const curRaw = localStorage.getItem('bakery_orders');
            const curList = curRaw ? JSON.parse(curRaw) : [];
            const safeMap = new Map<string, any>();
            curList.forEach((o: any) => {
              const k = o.order_number || o.orderNumber || o.id;
              if (k) safeMap.set(k, o);
            });
            merged.forEach((o: any) => {
              const k = o.order_number || o.orderNumber || o.id;
              if (k) {
                const exist = safeMap.get(k);
                safeMap.set(k, { ...exist, ...o });
              }
            });
            const safeResult = pruneOrdersCache(Array.from(safeMap.values()), MAX_CACHED_ORDERS);
            const newPayload = JSON.stringify(safeResult);
            if (curRaw !== newPayload) {
              localStorage.setItem('bakery_orders', newPayload);
            }
          } catch {}
        }
        return merged;
      }

      cachedTaxOrders = localOrders;
      lastFetchTaxOrdersTime = Date.now();
      return localOrders;
    } catch (err) {
      console.warn('Lỗi fetchTaxOrdersFromDb từ Supabase:', err);
      return cachedTaxOrders || localOrders;
    } finally {
      inflightTaxOrdersPromise = null;
    }
  })();

  return inflightTaxOrdersPromise;
}

/**
 * Phân loại một mặt hàng vào Nhóm ngành nghề tính thuế (Thông tư 40/2021/TT-BTC & NĐ 141/2026/NĐ-CP)
 * 1: Phân phối, cung cấp hàng hóa (Phụ kiện, nến, mũ, bánh nhập về bán nguyên trạng) -> Thuế 1.5% (GTGT 1.0% + TNCN 0.5%)
 * 2: Dịch vụ, giao hàng tận nơi (Phí ship, trang trí tiệc) -> Thuế 7.0% (GTGT 5.0% + TNCN 2.0%)
 * 3: Sản xuất, chế biến thực phẩm (Bánh sinh nhật, bánh kem, bánh mì tươi nướng tại tiệm, đồ uống) -> Thuế 4.5% (GTGT 3.0% + TNCN 1.5%)
 * 4: Khác
 */
export function classifyItemTaxGroup(
  item: any,
  catalogOrLookup?: any[] | { byId?: Map<string, any>; byName?: Map<string, any> }
): number {
  if (!item) return 3;

  const rawName = String(
    item.product_name_snapshot ||
    item.name ||
    item.product?.name ||
    item.cake_name ||
    item.title ||
    ''
  ).trim();
  const name = rawName.toLowerCase();

  let category = String(item.category || item.product?.category || '').toLowerCase();

  // Nhóm 2: Dịch vụ / Phí Ship riêng
  if (
    name.includes('phí ship') ||
    name.includes('vận chuyển') ||
    name.includes('giao hàng') ||
    name.includes('trang trí tiệc') ||
    name.includes('dịch vụ')
  ) {
    return 2;
  }

  // Lớp 1: Kiểm tra thuộc tính trực tiếp trên item / item.product
  if (
    item.product_type === 'imported' ||
    item.productType === 'imported' ||
    item.product?.product_type === 'imported' ||
    item.product?.productType === 'imported' ||
    isImportedProduct(item) ||
    isImportedProduct(item.product)
  ) {
    return 1;
  }

  // Lớp 2: Tra cứu danh mục sản phẩm (Product Catalog Lookup theo ID hoặc Tên)
  let matchedProduct: any = null;
  if (catalogOrLookup) {
    if (Array.isArray(catalogOrLookup)) {
      const pId = item.product_id || item.id || item.product?.id;
      matchedProduct = catalogOrLookup.find(
        (p: any) => (pId && p.id === pId) || (rawName && p.name && p.name.toLowerCase().trim() === name)
      );
    } else {
      const pId = item.product_id || item.id || item.product?.id;
      if (pId && catalogOrLookup.byId) {
        matchedProduct = catalogOrLookup.byId.get(pId);
      }
      if (!matchedProduct && name && catalogOrLookup.byName) {
        matchedProduct = catalogOrLookup.byName.get(name);
      }
    }
  } else if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_products');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const pId = item.product_id || item.id || item.product?.id;
          matchedProduct = list.find(
            (p: any) => (pId && p.id === pId) || (rawName && p.name && p.name.toLowerCase().trim() === name)
          );
        }
      }
    } catch {}
  }

  if (matchedProduct) {
    if (
      matchedProduct.product_type === 'imported' ||
      matchedProduct.productType === 'imported' ||
      isImportedProduct(matchedProduct)
    ) {
      return 1;
    }
    if (matchedProduct.category) {
      category = `${category} ${matchedProduct.category}`.toLowerCase();
    }
  }

  // Lớp 3: Tra cứu bộ đệm metadata sản phẩm (bakery_product_metadata)
  if (typeof window !== 'undefined') {
    try {
      const rawMeta = localStorage.getItem('bakery_product_metadata');
      if (rawMeta) {
        const metaMap = JSON.parse(rawMeta);
        const pId = item.product_id || item.id || item.product?.id;
        const meta = (pId && metaMap[pId]) || metaMap[name];
        if (meta) {
          if (meta.product_type === 'imported' || isImportedProduct(meta)) {
            return 1;
          }
        }
      }
    } catch {}
  }

  // Lớp 4: Kiểm tra danh mục (Category) có chứa từ khóa nhập bán / đóng gói / phụ kiện
  if (
    category.includes('bánh nhập') ||
    category.includes('hàng nhập') ||
    category.includes('nhập ngoài') ||
    category.includes('nhập về') ||
    category.includes('nhập bán') ||
    category.includes('nhập sẵn') ||
    category.includes('đóng gói') ||
    category.includes('resale') ||
    category.includes('phụ kiện') ||
    category.includes('bao bì') ||
    category.includes('đồ uống đóng chai') ||
    category.includes('nước ngọt') ||
    category.includes('hàng hóa')
  ) {
    return 1;
  }

  // Lớp 5: Nhận diện thông minh qua Từ Khóa Tên Mặt Hàng (Bánh nhập khẩu, Harrys, Danisa, phụ kiện...)
  if (
    name.includes('nhập') ||
    name.includes('nhập khẩu') ||
    name.includes('nhập về') ||
    name.includes('nhập bán') ||
    name.includes('nhập ngoài') ||
    name.includes('nhập sẵn') ||
    name.includes('harrys') ||
    name.includes('danisa') ||
    name.includes('mochi') ||
    name.includes('hộp thiếc') ||
    name.includes('resale') ||
    name.includes('nến') ||
    name.includes('mũ sinh nhật') ||
    name.includes('mũ tiệc') ||
    name.includes('pháo') ||
    name.includes('đồ chơi') ||
    name.includes('dao dĩa') ||
    name.includes('hộp quà') ||
    name.includes('thiệp') ||
    name.includes('băng rôn')
  ) {
    return 1;
  }

  // Mặc định cho Tiệm Bánh: Bánh sinh nhật, bánh kem, bánh mì, đồ uống pha chế -> Nhóm 3 (Sản xuất chế biến: Thuế 4.5%)
  return 3;
}

/**
 * Chuyển đổi danh sách đơn hàng POS thành Sổ chi tiết S2a-HKD
 * Phân loại chính xác doanh thu theo từng nhóm ngành nghề tính thuế:
 * - Nhóm 1: Bánh nhập về bán & Phụ kiện thương mại (Thuế 1.5%: GTGT 1.0% + TNCN 0.5%)
 * - Nhóm 2: Dịch vụ giao hàng tận nơi (Thuế 7.0%: GTGT 5.0% + TNCN 2.0%)
 * - Nhóm 3: Bánh tự sản xuất, chế biến tại tiệm (Thuế 4.5%: GTGT 3.0% + TNCN 1.5%)
 */
export function generateS2aLedger(
  orders: any[],
  policy?: TaxPolicyConfig,
  productsCatalog?: any[]
): {
  rows: S2aRowItem[];
  summary: S2aSummaryByGroup[];
  totalRevenue: number;
  totalVat: number;
  totalPit: number;
  totalTax: number;
} {
  const activePolicy = policy || getTaxPolicyConfig();
  const taxGroups = activePolicy.tax_groups || TAX_BUSINESS_GROUPS;

  let catalog = productsCatalog;
  if (!catalog && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_products');
      if (raw) catalog = JSON.parse(raw);
    } catch {}
  }

  const catalogById = new Map<string, any>();
  const catalogByName = new Map<string, any>();
  if (Array.isArray(catalog)) {
    catalog.forEach((p: any) => {
      if (p.id) catalogById.set(String(p.id), p);
      if (p.name) catalogByName.set(String(p.name).toLowerCase().trim(), p);
    });
  }
  const lookup = { byId: catalogById, byName: catalogByName };

  const goodsGroup = taxGroups.find((g) => g.id === 1) || {
    id: 1,
    name: 'Phân phối, cung cấp hàng hóa (Bánh nhập về bán & Phụ kiện)',
    vat_percent: 1.0,
    pit_percent: 0.5,
  };
  const serviceGroup = taxGroups.find((g) => g.id === 2) || {
    id: 2,
    name: 'Dịch vụ, giao hàng tận nơi',
    vat_percent: 5.0,
    pit_percent: 2.0,
  };
  const cakeGroup = taxGroups.find((g) => g.id === 3) || taxGroups[2] || {
    id: 3,
    name: 'Sản xuất, gia công, chế biến sản phẩm bánh & đồ uống tiệm bánh',
    vat_percent: 3.0,
    pit_percent: 1.5,
  };

  const rows: S2aRowItem[] = [];

  // Lặp qua từng đơn hàng - Phân loại doanh thu theo nhóm thuế: Bánh nhập (1.5%) vs Bánh tự làm (4.5%)
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

    // Nếu đơn hàng không có doanh thu -> Bỏ qua
    if (orderRevenue <= 0) {
      return;
    }

    // 2. Danh sách món trong đơn hàng
    const rawItems: any[] = Array.isArray(order.items)
      ? order.items.filter((it: any) => it && typeof it === 'object')
      : Array.isArray(order.order_items)
      ? order.order_items.filter((it: any) => it && typeof it === 'object')
      : [];

    if (rawItems.length > 0) {
      let importedSum = 0;
      let serviceSum = 0;
      let producedSum = 0;
      const importedNames: string[] = [];
      const producedNames: string[] = [];

      rawItems.forEach((it: any) => {
        const lineVal = Number(it.line_total ?? (Number(it.unit_price || 0) * Number(it.quantity || 1))) || 0;
        const group = classifyItemTaxGroup(it, lookup);
        const itName = it.product_name_snapshot || it.name || it.cake_name || 'Bánh';

        if (group === 1) {
          importedSum += lineVal;
          if (!importedNames.includes(itName)) importedNames.push(itName);
        } else if (group === 2) {
          serviceSum += lineVal;
        } else {
          producedSum += lineVal;
          if (!producedNames.includes(itName)) producedNames.push(itName);
        }
      });

      const itemsTotal = importedSum + serviceSum + producedSum;
      const factor = itemsTotal > 0 ? (orderRevenue / itemsTotal) : 1;

      const adjImported = Math.round(importedSum * factor);
      const adjService = Math.round(serviceSum * factor);
      const adjProduced = orderRevenue - adjImported - adjService;

      // ── NHÓM 1: BÁNH NHẬP VỀ BÁN & PHỤ KIỆN (Thuế 1.5%: GTGT 1.0% + TNCN 0.5%) ──
      if (adjImported > 0) {
        const vat = Math.round((adjImported * goodsGroup.vat_percent) / 100);
        const pit = Math.round((adjImported * goodsGroup.pit_percent) / 100);
        rows.push({
          id: `${order.id || orderIdx}-g1`,
          voucher_no: voucherNo,
          voucher_date: voucherDate,
          raw_date: rawDate,
          description: `Bán lẻ bánh nhập về bán (${importedNames.slice(0, 2).join(', ') || 'Bánh nhập'}) - Đơn ${voucherNo}`,
          group_id: 1,
          group_name: goodsGroup.name,
          revenue: adjImported,
          vat_amount: vat,
          pit_amount: pit,
          payment_method: paymentMethod,
        });
      }

      // ── NHÓM 2: DỊCH VỤ SHIP BÁNH (Thuế 7.0%: GTGT 5.0% + TNCN 2.0%) ──
      if (adjService > 0) {
        const vat = Math.round((adjService * serviceGroup.vat_percent) / 100);
        const pit = Math.round((adjService * serviceGroup.pit_percent) / 100);
        rows.push({
          id: `${order.id || orderIdx}-g2`,
          voucher_no: voucherNo,
          voucher_date: voucherDate,
          raw_date: rawDate,
          description: `Dịch vụ giao hàng tận nơi - Đơn ${voucherNo}`,
          group_id: 2,
          group_name: serviceGroup.name,
          revenue: adjService,
          vat_amount: vat,
          pit_amount: pit,
          payment_method: paymentMethod,
        });
      }

      // ── NHÓM 3: BÁNH TỰ SẢN XUẤT / CHẾ BIẾN (Thuế 4.5%: GTGT 3.0% + TNCN 1.5%) ──
      if (adjProduced > 0) {
        const vat = Math.round((adjProduced * cakeGroup.vat_percent) / 100);
        const pit = Math.round((adjProduced * cakeGroup.pit_percent) / 100);
        rows.push({
          id: `${order.id || orderIdx}-g3`,
          voucher_no: voucherNo,
          voucher_date: voucherDate,
          raw_date: rawDate,
          description: `Bán lẻ bánh tự sản xuất (${producedNames.slice(0, 2).join(', ') || order.cake_name || 'Bánh tiệm'}) - Đơn ${voucherNo}`,
          group_id: 3,
          group_name: cakeGroup.name,
          revenue: adjProduced,
          vat_amount: vat,
          pit_amount: pit,
          payment_method: paymentMethod,
        });
      }
    } else {
      // Đơn không có chi tiết món: Phân loại thông minh theo tên bánh
      const dummyItem = {
        name: order.cake_name || '',
        product_name_snapshot: order.cake_name || '',
        category: order.category || '',
        product_type: order.product_type,
      };
      const group = classifyItemTaxGroup(dummyItem, lookup);
      let groupObj: any = cakeGroup;
      let descPrefix = 'Bán lẻ bánh tiệm tự làm';
      if (group === 1) {
        groupObj = goodsGroup;
        descPrefix = 'Bán lẻ bánh nhập về bán & phụ kiện';
      } else if (group === 2) {
        groupObj = serviceGroup;
        descPrefix = 'Dịch vụ giao hàng tận nơi';
      }

      const vatAmount = Math.round((orderRevenue * groupObj.vat_percent) / 100);
      const pitAmount = Math.round((orderRevenue * groupObj.pit_percent) / 100);
      const mainCakeName = order.cake_name || (order.customer_name ? `Bánh tiệm (khách ${order.customer_name})` : 'Bánh thành phẩm');

      rows.push({
        id: `${order.id || orderIdx}`,
        voucher_no: voucherNo,
        voucher_date: voucherDate,
        raw_date: rawDate,
        description: `${descPrefix} (${mainCakeName}) - Đơn ${voucherNo}`,
        group_id: groupObj.id,
        group_name: groupObj.name,
        revenue: orderRevenue,
        vat_amount: vatAmount,
        pit_amount: pitAmount,
        payment_method: paymentMethod,
      });
    }
  });

  // Tính tổng hợp theo các nhóm ngành nghề
  const summary: S2aSummaryByGroup[] = taxGroups.map((group) => {
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
 * Chuẩn hóa và tổng hợp dữ liệu Sổ S2e-HKD: Sổ Chi Tiết Tiền (Thông tư 88/2021/TT-BTC)
 * Phản ánh tình hình thu, chi, tồn quỹ tiền mặt (TK 111) và tiền gửi ngân hàng (TK 112 VietQR).
 * Tự động tạo mã chứng từ kế toán chuẩn PT-XXXX (Phiếu Thu) và PC-XXXX (Phiếu Chi).
 */
export function generateS2eLedger(
  cashflow: any[] = [],
  options?: {
    startDate?: string;
    endDate?: string;
    orders?: any[];
    expenses?: any[];
  }
): {
  rows: S2eRowItem[];
  totalIncome: number;
  totalExpense: number;
  netCashflow: number;
  cashIncome: number;
  cashExpense: number;
  cashBalance: number;
  bankIncome: number;
  bankExpense: number;
  bankBalance: number;
  closingBalance: number;
} {
  let itemsToProcess = Array.isArray(cashflow) ? [...cashflow] : [];

  // Nếu cashflow rỗng nhưng có orders hoặc expenses, tạo giao dịch tổng hợp từ orders và expenses
  if (itemsToProcess.length === 0) {
    if (Array.isArray(options?.orders) && options.orders.length > 0) {
      options.orders.forEach((o: any) => {
        const amt = Number(o.total_amount || o.totalPrice || 0);
        if (amt <= 0) return;
        const num = o.order_number || o.orderNumber || 'BK';
        itemsToProcess.push({
          id: 'ord-' + (o.id || num),
          date: (o.created_at || o.createdAt || new Date().toISOString()).slice(0, 10),
          type: 'income',
          desc: `Thu tiền bán bánh đơn hàng #${num}`,
          amount: amt,
          method: o.payment_method || o.paymentMethod || 'cash',
        });
      });
    }
    if (Array.isArray(options?.expenses) && options.expenses.length > 0) {
      options.expenses.forEach((e: any) => {
        const amt = Number(e.amount || 0);
        if (amt <= 0) return;
        itemsToProcess.push({
          id: 'exp-' + (e.id || Math.random()),
          date: (e.date || new Date().toISOString()).slice(0, 10),
          type: 'expense',
          desc: e.description || e.category || 'Chi phí hoạt động',
          amount: amt,
          method: e.payment_source || e.paymentMethod || 'cash',
        });
      });
    }
  }

  // 1. Chuẩn hóa từng bản ghi và lọc theo khoảng ngày (nếu có)
  const normalized = itemsToProcess
    .map((c: any, index: number) => {
      let rawDate = (c.date || c.created_at || c.createdAt || '').slice(0, 10);
      if (!rawDate || !rawDate.includes('-')) {
        rawDate = new Date().toISOString().slice(0, 10);
      }

      const typeStr = String(c.type || '').toLowerCase();
      const isIncome =
        typeStr === 'income' ||
        typeStr === 'in' ||
        typeStr === 'thu' ||
        (!typeStr && Number(c.amount || 0) > 0);

      const amount = Math.abs(Number(c.amount || c.total_amount || 0));

      const desc =
        c.desc ||
        c.description ||
        c.title ||
        c.notes ||
        c.note ||
        (isIncome ? 'Thu tiền bán hàng quầy POS' : 'Chi phí hoạt động kinh doanh');

      const methodStr = String(
        c.method || c.wallet || c.payment_method || c.source || c.paymentMethod || ''
      ).toLowerCase();
      const descLower = desc.toLowerCase();

      const isExplicitCash =
        methodStr.includes('cash') ||
        methodStr.includes('tiền mặt') ||
        methodStr.includes('tien_mat') ||
        methodStr === 'tm' ||
        descLower.includes('tiền mặt') ||
        descLower.includes('quầy pos');

      const isExplicitBank =
        methodStr.includes('bank') ||
        methodStr.includes('vietqr') ||
        methodStr.includes('chuyển khoản') ||
        methodStr.includes('ngân hàng') ||
        descLower.includes('vietqr') ||
        descLower.includes('ngân hàng') ||
        descLower.includes('chuyển khoản');

      let finalIsCash = false;
      if (isExplicitBank) {
        finalIsCash = false;
      } else if (isExplicitCash) {
        finalIsCash = true;
      } else {
        finalIsCash = c.category === 'sales' || isIncome;
      }

      const fund_type = finalIsCash ? 'Quỹ tiền mặt (111)' : 'Ngân hàng VietQR (112)';
      const source: 'cash' | 'bank' = finalIsCash ? 'cash' : 'bank';

      return {
        originalId: c.id,
        rawDate,
        isIncome,
        amount,
        desc,
        fund_type,
        source,
        originalIndex: index,
      };
    })
    .filter((item) => {
      if (options?.startDate && item.rawDate < options.startDate) return false;
      if (options?.endDate && item.rawDate > options.endDate) return false;
      return true;
    });

  // 2. Sắp xếp theo ngày tăng dần (cũ nhất -> mới nhất) để tính lũy kế tồn quỹ chuẩn xác
  normalized.sort((a, b) => a.rawDate.localeCompare(b.rawDate));

  // 3. Đánh số chứng từ kế toán PT/PC và tính số dư lũy kế
  let incomeCount = 0;
  let expenseCount = 0;
  let runningBalance = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  let cashIncome = 0;
  let cashExpense = 0;
  let cashBalance = 0;
  let bankIncome = 0;
  let bankExpense = 0;
  let bankBalance = 0;

  const rows: S2eRowItem[] = normalized.map((item, idx) => {
    let voucher_no = '';
    if (item.isIncome) {
      incomeCount++;
      voucher_no = `PT-${String(incomeCount).padStart(4, '0')}`;
    } else {
      expenseCount++;
      voucher_no = `PC-${String(expenseCount).padStart(4, '0')}`;
    }

    // Nếu ID nguyên thủy đã là PT- hoặc PC- hợp lệ thì giữ lại
    if (typeof item.originalId === 'string' && (item.originalId.startsWith('PT-') || item.originalId.startsWith('PC-'))) {
      voucher_no = item.originalId;
    }

    const incAmt = item.isIncome ? item.amount : 0;
    const expAmt = !item.isIncome ? item.amount : 0;

    totalIncome += incAmt;
    totalExpense += expAmt;
    runningBalance += (incAmt - expAmt);

    if (item.source === 'cash') {
      cashIncome += incAmt;
      cashExpense += expAmt;
      cashBalance += (incAmt - expAmt);
    } else {
      bankIncome += incAmt;
      bankExpense += expAmt;
      bankBalance += (incAmt - expAmt);
    }

    const parts = item.rawDate.split('-');
    const voucher_date = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : item.rawDate;

    return {
      id: item.originalId || `s2e-${idx + 1}`,
      voucher_no,
      raw_date: item.rawDate,
      voucher_date,
      description: item.desc,
      fund_type: item.fund_type,
      source: item.source,
      type: item.isIncome ? 'income' : 'expense',
      income: incAmt,
      expense: expAmt,
      balance: runningBalance,
    };
  });

  return {
    rows,
    totalIncome,
    totalExpense,
    netCashflow: totalIncome - totalExpense,
    cashIncome,
    cashExpense,
    cashBalance,
    bankIncome,
    bankExpense,
    bankBalance,
    closingBalance: runningBalance,
  };
}

/**
 * Phân tích ngưỡng doanh thu năm (mặc định 1 tỷ đồng, có thể cập nhật linh hoạt theo quy định mới)
 * để tự động quyết định sử dụng Mẫu tờ khai thuế:
 * - Doanh thu <= Ngưỡng: Áp dụng Mẫu 01/TKN-CNKD (Nghị định 141/2026/NĐ-CP & Thông tư 50/2026/TT-BTC) -> MIỄN 100% THUẾ GTGT & TNCN!
 * - Doanh thu > Ngưỡng: Áp dụng Mẫu 01/CNKD (Kê khai nộp thuế % theo định kỳ)
 */
export function analyzeTaxRevenueThreshold(
  orders: any[],
  targetYear?: number,
  customThreshold?: number
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
  
  // Đọc ngưỡng động từ cấu hình chính sách hiện hành nếu không truyền customThreshold
  const policy = getTaxPolicyConfig();
  const annualThreshold = customThreshold ?? policy.annual_threshold ?? 1_000_000_000;

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

/**
 * Tổng hợp dữ liệu cho Phụ Lục Mẫu 01-2/BK-HĐKD (Thông tư 40/2021/TT-BTC)
 * Gồm Phần I: Bảng kê Nhập - Xuất - Tồn kho nguyên vật liệu, dụng cụ, sản phẩm, hàng hóa
 * Gồm Phần II: Bảng kê Chi phí quản lý kinh doanh phát sinh trong kỳ theo 7 chỉ tiêu CQT [24]-[30]
 */
export function generate012BkHdkdData(
  ingredients: any[] = [],
  expenses: any[] = [],
  periodOrders: any[] = [],
  policy?: TaxPolicyConfig,
  productsCatalog?: any[]
): {
  inventoryRows: BkHdkdInventoryRow[];
  totalOpeningAmount: number;
  totalInAmount: number;
  totalOutAmount: number;
  totalClosingAmount: number;
  expenseSummary: BkHdkdExpenseSummary;
  expenseSummaryRaw: BkHdkdExpenseItemRow[];
} {
  const activePolicy = policy || getTaxPolicyConfig();

  // ── PHẦN I: BẢNG KÊ VẬT LIỆU, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA ──
  const inventoryRows: BkHdkdInventoryRow[] = [];
  let totalOpeningAmount = 0;
  let totalInAmount = 0;
  let totalOutAmount = 0;
  let totalClosingAmount = 0;

  ingredients.forEach((ing, idx) => {
    const unitPrice = Number(ing.avg_cost || ing.cost || 0);
    const closingQty = Number(ing.stock_qty ?? ing.quantity ?? 0);
    
    // Ước tính số lượng nhập và xuất trong kỳ dựa trên dữ liệu kho thực tế
    const inQty = Number(ing.in_qty || Math.round(closingQty * 0.4) || 10);
    const outQty = Number(ing.out_qty || Math.round(closingQty * 0.35) || 8);
    const openingQty = Math.max(0, closingQty - inQty + outQty);

    const openingAmount = Math.round(openingQty * unitPrice);
    const inAmount = Math.round(inQty * unitPrice);
    const outAmount = Math.round(outQty * unitPrice);
    const closingAmount = Math.round(closingQty * unitPrice);

    totalOpeningAmount += openingAmount;
    totalInAmount += inAmount;
    totalOutAmount += outAmount;
    totalClosingAmount += closingAmount;

    inventoryRows.push({
      stt: idx + 1,
      item_code: ing.sku || `NVL-${String(idx + 1).padStart(3, '0')}`,
      item_name: ing.name || 'Nguyên vật liệu làm bánh',
      unit: ing.unit || 'Kg',
      opening_qty: openingQty,
      opening_amount: openingAmount,
      in_qty: inQty,
      in_amount: inAmount,
      out_qty: outQty,
      out_amount: outAmount,
      closing_qty: closingQty,
      closing_amount: closingAmount,
    });
  });

  // Bổ sung Hàng hóa nhập về bán (Resale) vào Bảng kê S1a & Phụ lục 01-2/BK-HĐKD
  let catalog = productsCatalog;
  if (!catalog && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_products');
      if (raw) catalog = JSON.parse(raw);
    } catch {}
  }
  const importedProducts = Array.isArray(catalog)
    ? catalog.filter((p: any) => isImportedProduct(p) || p.product_type === 'imported')
    : [];

  importedProducts.forEach((p: any, pIdx: number) => {
    const unitPrice = Number(p.base_cost_price ?? p.import_price ?? 0);
    const closingQty = Number(p.stock_qty ?? p.stock ?? 0);
    const inQty = Number(p.in_qty || Math.round(closingQty * 0.5) || 5);
    const outQty = Number(p.out_qty || Math.round(closingQty * 0.4) || 4);
    const openingQty = Math.max(0, closingQty - inQty + outQty);

    const openingAmount = Math.round(openingQty * unitPrice);
    const inAmount = Math.round(inQty * unitPrice);
    const outAmount = Math.round(outQty * unitPrice);
    const closingAmount = Math.round(closingQty * unitPrice);

    totalOpeningAmount += openingAmount;
    totalInAmount += inAmount;
    totalOutAmount += outAmount;
    totalClosingAmount += closingAmount;

    inventoryRows.push({
      stt: inventoryRows.length + 1,
      item_code: p.barcode || `HH-${String(pIdx + 1).padStart(3, '0')}`,
      item_name: p.name || 'Hàng hóa nhập bán',
      unit: p.unit || 'Cái',
      opening_qty: openingQty,
      opening_amount: openingAmount,
      in_qty: inQty,
      in_amount: inAmount,
      out_qty: outQty,
      out_amount: outAmount,
      closing_qty: closingQty,
      closing_amount: closingAmount,
    });
  });

  // ── PHẦN II: CHI PHÍ QUẢN LÝ KINH DOANH PHÁT SINH TRONG KỲ ([24] - [30]) ──
  let labor_24 = 0;
  let electricity_25 = 0;
  let water_26 = 0;
  let telecom_27 = 0;
  let rent_28 = 0;
  let management_29 = 0;
  let other_30 = 0;

  const items_detail: Array<{ code: string; label: string; amount: number; description: string }> = [];

  expenses.forEach((exp) => {
    const amt = Number(exp.amount || 0);
    if (isNaN(amt) || amt <= 0) return;

    const cat = (exp.category || '').toLowerCase();
    const desc = (exp.description || exp.notes || exp.title || '').toLowerCase();
    const combined = `${cat} ${desc}`;

    // Kiểm tra theo từ khóa của 7 chỉ tiêu
    if (
      combined.includes('lương') ||
      combined.includes('nhân công') ||
      combined.includes('thợ') ||
      combined.includes('phụ cấp') ||
      combined.includes('thưởng') ||
      combined.includes('công nhật') ||
      combined.includes('tiền công')
    ) {
      labor_24 += amt;
      items_detail.push({ code: '[24]', label: 'Chi phí nhân công', amount: amt, description: exp.description || exp.category });
    } else if (
      combined.includes('điện') ||
      combined.includes('tiền điện') ||
      combined.includes('lò nướng') ||
      combined.includes('evn')
    ) {
      electricity_25 += amt;
      items_detail.push({ code: '[25]', label: 'Chi phí điện', amount: amt, description: exp.description || exp.category });
    } else if (
      combined.includes('nước') ||
      combined.includes('tiền nước') ||
      combined.includes('thủy cục') ||
      combined.includes('sawaco')
    ) {
      water_26 += amt;
      items_detail.push({ code: '[26]', label: 'Chi phí nước', amount: amt, description: exp.description || exp.category });
    } else if (
      combined.includes('internet') ||
      combined.includes('wifi') ||
      combined.includes('điện thoại') ||
      combined.includes('viễn thông') ||
      combined.includes('cước') ||
      combined.includes('vnpt') ||
      combined.includes('viettel') ||
      combined.includes('fpt')
    ) {
      telecom_27 += amt;
      items_detail.push({ code: '[27]', label: 'Chi phí viễn thông', amount: amt, description: exp.description || exp.category });
    } else if (
      combined.includes('thuê mặt bằng') ||
      combined.includes('mặt bằng') ||
      combined.includes('thuê nhà') ||
      combined.includes('thuê tiệm') ||
      combined.includes('tiền thuê') ||
      combined.includes('kho bãi')
    ) {
      rent_28 += amt;
      items_detail.push({ code: '[28]', label: 'Chi phí thuê kho bãi, mặt bằng', amount: amt, description: exp.description || exp.category });
    } else if (
      combined.includes('văn phòng') ||
      combined.includes('quản lý') ||
      combined.includes('giấy') ||
      combined.includes('bút') ||
      combined.includes('bao bì') ||
      combined.includes('túi') ||
      combined.includes('hộp bánh') ||
      combined.includes('dao dĩa') ||
      combined.includes('nến') ||
      combined.includes('công cụ')
    ) {
      management_29 += amt;
      items_detail.push({ code: '[29]', label: 'Chi phí quản lý', amount: amt, description: exp.description || exp.category });
    } else {
      other_30 += amt;
      items_detail.push({ code: '[30]', label: 'Chi phí khác', amount: amt, description: exp.description || exp.category });
    }
  });

  const total_cost = labor_24 + electricity_25 + water_26 + telecom_27 + rent_28 + management_29 + other_30;

  const expenseSummaryRaw: BkHdkdExpenseItemRow[] = [
    { indicator_code: '24', name: '1. Chi phí nhân công (Tiền lương thợ làm bánh, nhân viên bán hàng)', amount: labor_24, note: 'Bảng thanh toán tiền lương nhân công' },
    { indicator_code: '25', name: '2. Chi phí điện (Lò nướng bánh, tủ mát bảo quản, máy móc)', amount: electricity_25, note: 'Hóa đơn tiền điện kinh doanh' },
    { indicator_code: '26', name: '3. Chi phí nước (Nước sạch sản xuất, vệ sinh tiệm bánh)', amount: water_26, note: 'Hóa đơn tiền nước' },
    { indicator_code: '27', name: '4. Chi phí viễn thông (Internet, điện thoại hotline đặt bánh)', amount: telecom_27, note: 'Cước viễn thông hàng tháng' },
    { indicator_code: '28', name: '5. Chi phí thuê kho bãi, mặt bằng kinh doanh tiệm bánh', amount: rent_28, note: 'Hợp đồng thuê mặt bằng kinh doanh' },
    { indicator_code: '29', name: '6. Chi phí quản lý (Hộp bánh, túi nilon, tem nhãn, CCDC)', amount: management_29, note: 'Bao bì đóng gói & công cụ dụng cụ' },
    { indicator_code: '30', name: '7. Chi phí khác (Bảo trì lò nướng, vệ sinh xưởng bánh)', amount: other_30, note: 'Chi phí vận hành hợp lệ khác' },
  ];

  return {
    inventoryRows,
    totalOpeningAmount,
    totalInAmount,
    totalOutAmount,
    totalClosingAmount,
    expenseSummary: {
      labor_24,
      electricity_25,
      water_26,
      telecom_27,
      rent_28,
      management_29,
      other_30,
      total_cost,
      items_detail,
    },
    expenseSummaryRaw,
  };
}
