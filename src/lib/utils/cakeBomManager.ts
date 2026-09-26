// src/lib/utils/cakeBomManager.ts
// Quản lý lưu trữ, đồng bộ và tính toán chi phí định mức BOM Bánh Sinh Nhật

import {
  FullCakeBomConfig,
  CakeBaseModel,
  CreamCoatingModel,
  CakeFillingModel,
  PackagingBoxModel,
  FreeAccessoryModel,
  CakeDecorAddonModel,
  BirthdayCakeBomPreset,
  CakeOrderSpec,
  CakeBomItem,
} from '@/lib/types/bakery-bom';
import { INITIAL_FULL_CAKE_BOM_CONFIG } from '@/lib/constants/defaultCakeBomData';
import { supabase } from '@/lib/supabase/client';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

export const CAKE_BOM_CONFIG_KEY = 'bakery_full_bom_config';
export const CAKE_BOM_UPDATED_EVENT = 'bakery_bom_updated';

// ── LẤY CẤU HÌNH TỪ LOCALSTORAGE ──
export function getFullCakeBomConfig(): FullCakeBomConfig {
  if (typeof window === 'undefined') return INITIAL_FULL_CAKE_BOM_CONFIG;
  try {
    const raw = localStorage.getItem(CAKE_BOM_CONFIG_KEY);
    if (!raw) return INITIAL_FULL_CAKE_BOM_CONFIG;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.cakeBases) return INITIAL_FULL_CAKE_BOM_CONFIG;
    return {
      ...INITIAL_FULL_CAKE_BOM_CONFIG,
      ...parsed,
    };
  } catch {
    return INITIAL_FULL_CAKE_BOM_CONFIG;
  }
}

// ── LƯU CẤU HÌNH VÀO LOCALSTORAGE VÀ SYNC CLOUD & LOCAL SQL ──
export function saveFullCakeBomConfig(config: FullCakeBomConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CAKE_BOM_CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(CAKE_BOM_UPDATED_EVENT, { detail: config }));
  } catch (e) {
    console.error('Lỗi lưu cấu hình BOM vào localStorage:', e);
  }

  // Tự động đồng bộ lên Supabase Cloud SQL và Local SQL
  syncCakeBomConfigToDb(config).catch((err) => {
    console.warn('Lỗi đồng bộ BOM lên CSDL Cloud:', err);
  });
}

// ── ĐỒNG BỘ LÊN SUPABASE CLOUD & LOCAL SQL ──
export async function syncCakeBomConfigToDb(config: FullCakeBomConfig): Promise<void> {
  const defPkg = config.packagings.find((p) => p.isDefault) || config.packagings[0];

  // 1. Supabase Cloud SQL: Bảng bakery_bom_settings
  try {
    const payload = {
      id: 'primary',
      version: config.version || '2.0.0',
      target_food_cost_pct: config.targetFoodCostPct || 36.5,
      cake_bases: config.cakeBases || [],
      cream_coatings: config.creamCoatings || [],
      fillings: config.fillings || [],
      packagings: config.packagings || [],
      free_accessories: config.freeAccessories || [],
      decor_addons: config.decorAddons || [],
      birthday_bom_presets: config.birthdayBomPresets || [],
      updated_at: new Date().toISOString(),
    };
    await supabase.from('bakery_bom_settings').upsert(payload);
  } catch (err) {
    console.warn('Lỗi upsert bakery_bom_settings:', err);
  }

  // 2. Supabase Cloud SQL: Dự phòng kép vào bảng recipes với id 00000000-0000-0000-0000-000000000014
  try {
    await supabase.from('recipes').upsert(
      {
        id: '00000000-0000-0000-0000-000000000014',
        name: 'SYS_CONFIG_FULL_BOM',
        yield_qty: 1,
        yield_unit: 'config',
        cost_per_unit: defPkg?.costPrice || 0,
        notes: JSON.stringify(config),
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch {}

  // 3. Tự động đồng bộ ra file Local SQL & Master Dump
  try {
    autoSyncToLocalSqlFolder();
  } catch {}
}

// ── TẢI CẤU HÌNH TỪ SUPABASE CLOUD ──
export async function fetchFullCakeBomConfigFromDb(): Promise<FullCakeBomConfig | null> {
  try {
    const { data, error } = await supabase
      .from('bakery_bom_settings')
      .select('*')
      .eq('id', 'primary')
      .maybeSingle();

    if (!error && data) {
      const remote: FullCakeBomConfig = {
        version: data.version || '2.0.0',
        targetFoodCostPct: Number(data.target_food_cost_pct || 36.5),
        cakeBases: (typeof data.cake_bases === 'string' ? JSON.parse(data.cake_bases) : data.cake_bases) || [],
        creamCoatings: (typeof data.cream_coatings === 'string' ? JSON.parse(data.cream_coatings) : data.cream_coatings) || [],
        fillings: (typeof data.fillings === 'string' ? JSON.parse(data.fillings) : data.fillings) || [],
        packagings: (typeof data.packagings === 'string' ? JSON.parse(data.packagings) : data.packagings) || [],
        freeAccessories: (typeof data.free_accessories === 'string' ? JSON.parse(data.free_accessories) : data.free_accessories) || [],
        decorAddons: (typeof data.decor_addons === 'string' ? JSON.parse(data.decor_addons) : data.decor_addons) || [],
        birthdayBomPresets: (typeof data.birthday_bom_presets === 'string' ? JSON.parse(data.birthday_bom_presets) : data.birthday_bom_presets) || [],
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem(CAKE_BOM_CONFIG_KEY, JSON.stringify(remote));
        window.dispatchEvent(new CustomEvent(CAKE_BOM_UPDATED_EVENT, { detail: remote }));
      }
      return remote;
    }
  } catch {}

  try {
    const { data } = await supabase
      .from('recipes')
      .select('notes')
      .eq('name', 'SYS_CONFIG_FULL_BOM')
      .maybeSingle();
    if (data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (typeof window !== 'undefined') {
        localStorage.setItem(CAKE_BOM_CONFIG_KEY, JSON.stringify(parsed));
        window.dispatchEvent(new CustomEvent(CAKE_BOM_UPDATED_EVENT, { detail: parsed }));
      }
      return parsed;
    }
  } catch {}

  return null;
}

// ── TÍNH TOÁN CHI PHÍ & GIÁ BÁN GỢI Ý CHO 1 CẤU HÌNH BÁNH SINH NHẬT ──
export interface CakeCostCalculationParams {
  cakeBaseId: string;
  cakeBaseSizeId?: string;
  creamCoatingId: string;
  creamCoatingSizeId?: string;
  fillingId?: string;
  packagingId?: string;
  freeAccessoryIds?: string[];
  decorAddonIds?: string[];
  customMarkupPct?: number; // Tỷ lệ nhập tay, mặc định 36.5%
}

export interface CakeCostCalculationResult {
  baseCost: number; // Tiền vốn cốt bánh
  creamCost: number; // Tiền vốn kem phủ
  fillingCost: number; // Tiền vốn nhân
  packagingCost: number; // Tiền vốn hộp
  freeAccessoriesCost: number; // Tiền vốn quà tặng kèm
  decorCost: number; // Tiền vốn phụ kiện decor
  decorPrice: number; // Phụ thu decor
  fillingPrice: number; // Phụ thu nhân
  packagingPrice: number; // Phụ thu hộp
  totalCost: number; // Tổng giá vốn (BOM)
  suggestedPrice: number; // Giá bán gợi ý (Cost / (Markup / 100))
  markupPctUsed: number;
}

export function calculateCakeCostDetails(
  params: CakeCostCalculationParams,
  config: FullCakeBomConfig = getFullCakeBomConfig()
): CakeCostCalculationResult {
  const markupPct = params.customMarkupPct ?? config.targetFoodCostPct ?? 36.5;

  // 1. Cốt bánh
  const base = config.cakeBases.find((b) => b.id === params.cakeBaseId) || config.cakeBases[0];
  const baseSize =
    (params.cakeBaseSizeId ? base?.sizes.find((s) => s.id === params.cakeBaseSizeId) : null) ||
    base?.sizes[2] ||
    base?.sizes[0];
  const baseCost = baseSize?.baseCost ?? 0;

  // 2. Kem phủ (tự động link size theo đường kính cm của cốt bánh nếu không truyền)
  const cream = config.creamCoatings.find((c) => c.id === params.creamCoatingId) || config.creamCoatings[0];
  const creamSize =
    (params.creamCoatingSizeId ? cream?.sizes.find((s) => s.id === params.creamCoatingSizeId) : null) ||
    cream?.sizes.find((s) => s.diameterCm === baseSize?.diameterCm) ||
    cream?.sizes[0];
  const creamCost = creamSize?.baseCost ?? 0;

  // 3. Nhân bánh
  const filling = config.fillings.find((f) => f.id === params.fillingId);
  const fillingCost = filling?.costPrice ?? 0;
  const fillingPrice = filling?.extraPrice ?? 0;

  // 4. Hộp và bao bì: Tự động áp dụng hộp mặc định chung (isDefault: true) trong Mục 4
  const defaultPkg = config.packagings.find((p) => p.isDefault) || config.packagings[0];
  const pkg = (params.packagingId ? config.packagings.find((p) => p.id === params.packagingId) : null) || defaultPkg;
  const packagingCost = pkg?.costPrice ?? 0;
  const packagingPrice = pkg?.sellingPrice ?? 0;

  // 5. Vật tư tặng kèm
  let freeAccCost = 0;
  if (params.freeAccessoryIds && params.freeAccessoryIds.length > 0) {
    for (const accId of params.freeAccessoryIds) {
      const acc = config.freeAccessories.find((a) => a.id === accId);
      if (acc) {
        freeAccCost += (acc.costPrice || 0) * (acc.quantityDefault || 1);
      }
    }
  } else {
    // Mặc định tính tất cả vật tư có isDefaultIncluded
    for (const acc of config.freeAccessories) {
      if (acc.isDefaultIncluded) {
        freeAccCost += (acc.costPrice || 0) * (acc.quantityDefault || 1);
      }
    }
  }

  // 6. Phụ kiện & Decor
  let decorCost = 0;
  let decorPrice = 0;
  if (params.decorAddonIds && params.decorAddonIds.length > 0) {
    for (const dId of params.decorAddonIds) {
      const d = config.decorAddons.find((item) => item.id === dId);
      if (d) {
        decorCost += d.costPrice || 0;
        decorPrice += d.sellingPrice || 0;
      }
    }
  }

  // Tổng giá vốn (Food Cost)
  const totalCost = baseCost + creamCost + fillingCost + packagingCost + freeAccCost + decorCost;

  // Giá bán gợi ý theo tỷ lệ biên lợi nhuận (Markup):
  // Nếu targetFoodCostPct = 36.5% => Giá bán gợi ý = totalCost / 0.365 (làm tròn đến 5.000đ)
  const factor = markupPct > 0 ? markupPct / 100 : 0.365;
  const rawSuggested = totalCost / factor;
  const suggestedPrice = Math.round(rawSuggested / 5000) * 5000;

  return {
    baseCost,
    creamCost,
    fillingCost,
    packagingCost,
    freeAccessoriesCost: freeAccCost,
    decorCost,
    decorPrice,
    fillingPrice,
    packagingPrice,
    totalCost,
    suggestedPrice,
    markupPctUsed: markupPct,
  };
}

// ── TỔNG HỢP CAKE_ORDER_SPEC ĐỂ LƯU VÀO ĐƠN HÀNG (KDS & HÓA ĐƠN) ──
export function buildCakeOrderSpec(
  params: CakeCostCalculationParams & {
    finalPrice: number;
    cakeMessage?: string;
    decorNotes?: string;
    referenceImageUrl?: string;
    bomPresetId?: string;
  },
  config: FullCakeBomConfig = getFullCakeBomConfig()
): CakeOrderSpec {
  const calc = calculateCakeCostDetails(params, config);

  const base = config.cakeBases.find((b) => b.id === params.cakeBaseId) || config.cakeBases[0];
  const baseSize =
    (params.cakeBaseSizeId ? base?.sizes.find((s) => s.id === params.cakeBaseSizeId) : null) ||
    base?.sizes[2] ||
    base?.sizes[0];

  const cream = config.creamCoatings.find((c) => c.id === params.creamCoatingId) || config.creamCoatings[0];
  const creamSize =
    (params.creamCoatingSizeId ? cream?.sizes.find((s) => s.id === params.creamCoatingSizeId) : null) ||
    cream?.sizes.find((s) => s.diameterCm === baseSize?.diameterCm) ||
    cream?.sizes[0];

  const filling = config.fillings.find((f) => f.id === params.fillingId);
  const pkg =
    (params.packagingId ? config.packagings.find((p) => p.id === params.packagingId) : null) ||
    config.packagings.find((p) => p.isDefault) ||
    config.packagings[0];

  const freeAccessories = (params.freeAccessoryIds || [])
    .map((id) => {
      const a = config.freeAccessories.find((item) => item.id === id);
      if (!a) return null;
      return {
        id: a.id,
        name: a.name,
        quantity: a.quantityDefault || 1,
        cost: (a.costPrice || 0) * (a.quantityDefault || 1),
      };
    })
    .filter(Boolean) as any[];

  const decorAddons = (params.decorAddonIds || [])
    .map((id) => {
      const d = config.decorAddons.find((item) => item.id === id);
      if (!d) return null;
      return {
        id: d.id,
        name: d.name,
        price: d.sellingPrice || 0,
        cost: d.costPrice || 0,
      };
    })
    .filter(Boolean) as any[];

  return {
    isBirthdayCake: true,
    bomPresetId: params.bomPresetId,
    sizeName: baseSize?.sizeName || creamSize?.sizeName || 'Size 18cm',
    diameterCm: baseSize?.diameterCm || creamSize?.diameterCm || 18,
    cakeBase: {
      id: base?.id || '',
      name: base?.name || 'Cốt Vani',
      cost: calc.baseCost,
      bomIngredients: baseSize?.bomIngredients || [],
    },
    creamCoating: {
      id: cream?.id || '',
      name: cream?.name || 'Kem Whipping Anchor',
      cost: calc.creamCost,
      bomIngredients: creamSize?.bomIngredients || [],
    },
    filling: filling
      ? {
          id: filling.id,
          name: filling.name,
          cost: calc.fillingCost,
        }
      : undefined,
    packaging: pkg
      ? {
          id: pkg.id,
          name: pkg.name,
          cost: calc.packagingCost,
        }
      : undefined,
    freeAccessories,
    decorAddons,
    cakeMessage: params.cakeMessage,
    decorNotes: params.decorNotes,
    referenceImageUrl: params.referenceImageUrl,
    totalCost: calc.totalCost,
    targetFoodCostPct: calc.markupPctUsed,
    suggestedPrice: calc.suggestedPrice,
    finalPrice: params.finalPrice,
  };
}
