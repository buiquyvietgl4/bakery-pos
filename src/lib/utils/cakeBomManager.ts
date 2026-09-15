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

// ── LƯU CẤU HÌNH VÀO LOCALSTORAGE VÀ SYNC CLOUD ──
export function saveFullCakeBomConfig(config: FullCakeBomConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CAKE_BOM_CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(CAKE_BOM_UPDATED_EVENT, { detail: config }));
  } catch (e) {
    console.error('Lỗi lưu cấu hình BOM vào localStorage:', e);
  }

  // Tự động đồng bộ lên Supabase nếu có bảng hoặc lưu vào settings
  syncCakeBomConfigToDb(config).catch((err) => {
    console.warn('Lỗi đồng bộ BOM lên CSDL Cloud:', err);
  });
}

// ── ĐỒNG BỘ LÊN SUPABASE CLOUD ──
export async function syncCakeBomConfigToDb(config: FullCakeBomConfig): Promise<void> {
  try {
    const payload = {
      id: 'primary',
      config_data: config,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('bakery_bom_settings').upsert(payload);
  } catch {
    // Fallback: lưu vào bảng cấu hình chung nếu bảng chưa tạo
    try {
      await supabase.from('system_settings').upsert({
        key: 'bakery_full_bom_config',
        value: JSON.stringify(config),
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }
}

// ── TẢI CẤU HÌNH TỪ SUPABASE CLOUD ──
export async function fetchFullCakeBomConfigFromDb(): Promise<FullCakeBomConfig | null> {
  try {
    const { data, error } = await supabase
      .from('bakery_bom_settings')
      .select('config_data')
      .eq('id', 'primary')
      .single();

    if (!error && data?.config_data) {
      const remote = data.config_data as FullCakeBomConfig;
      if (typeof window !== 'undefined') {
        localStorage.setItem(CAKE_BOM_CONFIG_KEY, JSON.stringify(remote));
        window.dispatchEvent(new CustomEvent(CAKE_BOM_UPDATED_EVENT, { detail: remote }));
      }
      return remote;
    }
  } catch {}

  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'bakery_full_bom_config')
      .single();
    if (data?.value) {
      const parsed = JSON.parse(data.value);
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
  cakeBaseSizeId: string;
  creamCoatingId: string;
  creamCoatingSizeId: string;
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
  const baseSize = base?.sizes.find((s) => s.id === params.cakeBaseSizeId) || base?.sizes[0];
  const baseCost = baseSize?.baseCost ?? 0;

  // 2. Kem phủ
  const cream = config.creamCoatings.find((c) => c.id === params.creamCoatingId) || config.creamCoatings[0];
  const creamSize = cream?.sizes.find((s) => s.id === params.creamCoatingSizeId) || cream?.sizes[0];
  const creamCost = creamSize?.baseCost ?? 0;

  // 3. Nhân bánh
  const filling = config.fillings.find((f) => f.id === params.fillingId);
  const fillingCost = filling?.costPrice ?? 0;
  const fillingPrice = filling?.extraPrice ?? 0;

  // 4. Hộp và bao bì
  const pkg = config.packagings.find((p) => p.id === params.packagingId);
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
  const baseSize = base?.sizes.find((s) => s.id === params.cakeBaseSizeId) || base?.sizes[0];

  const cream = config.creamCoatings.find((c) => c.id === params.creamCoatingId) || config.creamCoatings[0];
  const creamSize = cream?.sizes.find((s) => s.id === params.creamCoatingSizeId) || cream?.sizes[0];

  const filling = config.fillings.find((f) => f.id === params.fillingId);
  const pkg = config.packagings.find((p) => p.id === params.packagingId);

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
