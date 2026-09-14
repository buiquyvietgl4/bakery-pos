// src/lib/utils/customCakeCosting.ts
// Quản lý định mức cấu phần chi phí (Size, Cốt, Kem, Hộp, Phụ kiện) cho Bánh sinh nhật đặt trước

import {
  CustomCakeCostingConfig,
  DEFAULT_CUSTOM_CAKE_CONFIG,
  CakeSizeOption,
  CakeFlavorOption,
  CakeCreamOption,
  CakePackagingOption,
  CakeAddonOption,
} from '@/lib/constants/cakeCostingData';
import { supabase } from '@/lib/supabase/client';

export const CAKE_COSTING_KEY = 'bakery_cake_costing_config';
export const CAKE_COSTING_UPDATED_EVENT = 'bakery_cake_costing_updated';

/**
 * Lấy cấu hình định mức chi phí bánh đặt hiện hành
 */
export function getCakeCostingConfig(): CustomCakeCostingConfig {
  if (typeof window === 'undefined') {
    return DEFAULT_CUSTOM_CAKE_CONFIG;
  }
  try {
    const raw = localStorage.getItem(CAKE_COSTING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.sizes) && parsed.sizes.length > 0) {
        return {
          ...DEFAULT_CUSTOM_CAKE_CONFIG,
          ...parsed,
          sizes: parsed.sizes.length > 0 ? parsed.sizes : DEFAULT_CUSTOM_CAKE_CONFIG.sizes,
          flavors: parsed.flavors?.length > 0 ? parsed.flavors : DEFAULT_CUSTOM_CAKE_CONFIG.flavors,
          creams: parsed.creams?.length > 0 ? parsed.creams : DEFAULT_CUSTOM_CAKE_CONFIG.creams,
          packagings: parsed.packagings?.length > 0 ? parsed.packagings : DEFAULT_CUSTOM_CAKE_CONFIG.packagings,
          addons: parsed.addons?.length > 0 ? parsed.addons : DEFAULT_CUSTOM_CAKE_CONFIG.addons,
        };
      }
    }
  } catch (err) {
    console.warn('[CakeCosting] Lỗi đọc cấu hình local:', err);
  }
  return DEFAULT_CUSTOM_CAKE_CONFIG;
}

/**
 * Lưu cấu hình định mức chi phí bánh đặt
 */
export function saveCakeCostingConfig(config: CustomCakeCostingConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CAKE_COSTING_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(CAKE_COSTING_UPDATED_EVENT, { detail: config }));
  } catch (err) {
    console.warn('[CakeCosting] Lỗi lưu cấu hình local:', err);
  }

  // Đồng bộ lên Supabase nếu online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      supabase
        .from('recipes')
        .upsert(
          {
            id: 'sys-cake-costing-config',
            name: 'SYS_CONFIG_CAKE_COSTING',
            category: 'Hệ thống',
            yield_qty: 1,
            yield_unit: 'config',
            cost_per_unit: 0,
            notes: JSON.stringify(config),
            is_active: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        )
        .then(({ error }) => {
          if (error) console.warn('[CakeCosting] Lỗi đồng bộ Supabase:', error);
        });
    } catch {}
  }
}

/**
 * Khôi phục cấu hình định mức về mặc định
 */
export function resetCakeCostingConfig(): CustomCakeCostingConfig {
  const def = { ...DEFAULT_CUSTOM_CAKE_CONFIG };
  saveCakeCostingConfig(def);
  return def;
}

/**
 * Tải cấu hình từ Supabase khi mở ứng dụng
 */
export async function fetchCakeCostingFromDb(): Promise<CustomCakeCostingConfig | null> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return null;
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .eq('name', 'SYS_CONFIG_CAKE_COSTING')
      .eq('is_active', false)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (parsed && Array.isArray(parsed.sizes)) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(CAKE_COSTING_KEY, JSON.stringify(parsed));
          window.dispatchEvent(new CustomEvent(CAKE_COSTING_UPDATED_EVENT, { detail: parsed }));
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[CakeCosting] Lỗi nạp cấu hình từ DB:', err);
  }
  return null;
}

export interface CakeCostCalculationResult {
  size: CakeSizeOption | null;
  flavor: CakeFlavorOption | null;
  cream: CakeCreamOption | null;
  packaging: CakePackagingOption | null;
  selectedAddons: CakeAddonOption[];
  baseCost: number;
  flavorCost: number;
  creamCost: number;
  packagingCost: number;
  addonCost: number;
  customAddonCost: number;
  totalCost: number; // Tổng giá vốn ước tính
  suggestedPrice: number; // Giá bán đề xuất
  estimatedProfit: number; // Lợi nhuận gộp ước tính
  foodCostPct: number; // Tỷ lệ vốn %
  statusLevel: 'good' | 'warning' | 'danger'; // good: <= 35%, warning: 36-45%, danger: > 45%
  summaryText: string;
}

/**
 * Hàm tính toán chi phí vốn và giá bán đề xuất cho bánh đặt
 */
export function calculateCustomCakeCost(
  selection: {
    sizeId?: string;
    sizeName?: string;
    flavorId?: string;
    flavorName?: string;
    creamId?: string;
    creamName?: string;
    packagingId?: string;
    packagingName?: string;
    addonIds?: string[];
    customAddonCost?: number;
    sellingPrice?: number;
  },
  config?: CustomCakeCostingConfig
): CakeCostCalculationResult {
  const cfg = config || getCakeCostingConfig();

  // 1. Tìm Size
  let size = cfg.sizes.find((s) => s.id === selection.sizeId) || null;
  if (!size && selection.sizeName) {
    size = cfg.sizes.find((s) => selection.sizeName?.includes(s.name) || s.name.includes(selection.sizeName || '')) || null;
  }
  if (!size) {
    size = cfg.sizes.find((s) => s.isDefault) || cfg.sizes[0] || null;
  }

  // 2. Tìm Cốt bánh
  let flavor = cfg.flavors.find((f) => f.id === selection.flavorId) || null;
  if (!flavor && selection.flavorName) {
    flavor = cfg.flavors.find((f) => selection.flavorName?.toLowerCase().includes(f.name.toLowerCase())) || null;
  }
  if (!flavor) {
    flavor = cfg.flavors[0] || null;
  }

  // 3. Tìm Loại kem
  let cream = cfg.creams.find((c) => c.id === selection.creamId) || null;
  if (!cream && selection.creamName) {
    cream = cfg.creams.find((c) => selection.creamName?.toLowerCase().includes(c.name.toLowerCase())) || null;
  }
  if (!cream) {
    cream = cfg.creams[0] || null;
  }

  // 4. Tìm Hộp bao bì
  let packaging = cfg.packagings.find((p) => p.id === selection.packagingId) || null;
  if (!packaging && selection.packagingName) {
    packaging = cfg.packagings.find((p) => selection.packagingName?.toLowerCase().includes(p.name.toLowerCase())) || null;
  }
  if (!packaging) {
    packaging = cfg.packagings.find((p) => p.isDefault) || cfg.packagings[0] || null;
  }

  // 5. Tìm Phụ kiện
  const selectedAddons: CakeAddonOption[] = [];
  if (Array.isArray(selection.addonIds)) {
    selection.addonIds.forEach((id) => {
      const a = cfg.addons.find((item) => item.id === id);
      if (a) selectedAddons.push(a);
    });
  }

  const baseCost = size ? size.baseCost : 90000;
  const flavorCost = flavor ? flavor.extraCost : 0;
  const creamCost = cream ? cream.extraCost : 0;
  const packagingCost = packaging ? packaging.extraCost : 0;
  const addonCost = selectedAddons.reduce((sum, item) => sum + item.cost, 0);
  const customAddonCost = Number(selection.customAddonCost || 0);

  const totalCost = baseCost + flavorCost + creamCost + packagingCost + addonCost + customAddonCost;

  // Tính giá bán đề xuất:
  // Base price từ size + extra price các thành phần
  const baseSuggestedPrice = size ? size.suggestedPrice : 365000;
  const flavorPrice = flavor ? flavor.extraPrice : 0;
  const creamPrice = cream ? cream.extraPrice : 0;
  const packagingPrice = packaging ? packaging.extraPrice : 0;
  const addonPrice = selectedAddons.reduce((sum, item) => sum + item.price, 0);

  // Suggested Price có thể là tổng các thành phần bán, hoặc bảo đảm food cost <= 33%
  const sumComponentsPrice = baseSuggestedPrice + flavorPrice + creamPrice + packagingPrice + addonPrice;
  const targetMultiplier = cfg.targetFoodCostPct > 0 ? 100 / cfg.targetFoodCostPct : 3;
  const targetPrice = Math.round((totalCost * targetMultiplier) / 5000) * 5000; // Làm tròn 5.000đ

  const suggestedPrice = Math.max(sumComponentsPrice, targetPrice);

  const actualSellingPrice = selection.sellingPrice && selection.sellingPrice > 0 ? selection.sellingPrice : suggestedPrice;
  const estimatedProfit = Math.max(0, actualSellingPrice - totalCost);
  const foodCostPct = actualSellingPrice > 0 ? Math.round((totalCost / actualSellingPrice) * 1000) / 10 : 33.3;

  let statusLevel: 'good' | 'warning' | 'danger' = 'good';
  if (foodCostPct > 45) {
    statusLevel = 'danger';
  } else if (foodCostPct > 35) {
    statusLevel = 'warning';
  }

  const addonNames = selectedAddons.map((a) => a.name).join(', ');
  const summaryText = [
    size ? size.name : '',
    flavor && flavor.extraCost > 0 ? flavor.name : '',
    cream && cream.extraCost > 0 ? cream.name : '',
    packaging && packaging.extraCost > 0 ? packaging.name : '',
    addonNames ? `Phụ kiện: ${addonNames}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    size,
    flavor,
    cream,
    packaging,
    selectedAddons,
    baseCost,
    flavorCost,
    creamCost,
    packagingCost,
    addonCost,
    customAddonCost,
    totalCost,
    suggestedPrice,
    estimatedProfit,
    foodCostPct,
    statusLevel,
    summaryText,
  };
}

/**
 * Làm sạch tên bánh và kích thước, xử lý trường hợp lồng ngoặc đơn ví dụ "BÁNH KEM (Size 18cm (6 - 8 người))"
 * Giúp tên bánh không bị thừa dấu ngoặc đóng ')' như "BÁNH KEM)"
 */
export function cleanCakeNameAndSize(fullName: string, existingSize?: string): { name: string; size: string } {
  if (!fullName) return { name: 'Bánh Kem Theo Yêu Cầu', size: existingSize || '' };
  
  let name = fullName.trim();
  let size = (existingSize || '').trim();

  // Tìm vị trí mở ngoặc đầu tiên
  const firstParenIdx = name.indexOf('(');
  if (firstParenIdx !== -1) {
    const candidateName = name.slice(0, firstParenIdx).trim();
    let candidateSize = name.slice(firstParenIdx).trim();
    if (candidateSize.startsWith('(') && candidateSize.endsWith(')')) {
      candidateSize = candidateSize.slice(1, -1).trim();
    }
    if (candidateName) {
      name = candidateName;
    }
    if (!size && candidateSize) {
      size = candidateSize;
    }
  }

  // Xóa các dấu đóng ngoặc dư thừa ở cuối tên bánh
  name = name.replace(/[\(\)]+$/g, '').trim();

  // Làm sạch kích thước
  if (size) {
    size = size.replace(/^\(+/, '').replace(/\)+$/, '').trim();
  }

  return { name: name || fullName, size };
}

/**
 * Lấy icon biểu tượng cho từng loại phụ kiện trang trí (Phù hợp với 7 cấu hình Admin)
 */
export function getAddonIcon(name: string): string {
  if (!name) return '✨';
  const lower = name.toLowerCase();
  if (lower.includes('chữ') || lower.includes('vẽ') || lower.includes('icon')) return '✍️';
  if (lower.includes('trái cây') || lower.includes('dâu') || lower.includes('nho') || lower.includes('xoài') || lower.includes('hoa quả')) return '🍓';
  if (lower.includes('vương miện') || lower.includes('mô hình') || lower.includes('đồ chơi') || lower.includes('búp bê') || lower.includes('topper')) return '👑';
  if (lower.includes('hoa tươi') || lower.includes('bông tươi')) return '💐';
  if (lower.includes('nến') || lower.includes('pháo')) return '🕯️';
  if (lower.includes('đèn') || lower.includes('led') || lower.includes('sáng')) return '✨';
  if (lower.includes('tiền') || lower.includes('rút tiền')) return '💸';
  if (lower.includes('mũ') || lower.includes('nón')) return '🎩';
  return '🎁';
}

/**
 * Tách một chuỗi theo dấu phân cách (mặc định là dấu phẩy), nhưng KHÔNG tách các dấu phân cách nằm bên trong dấu ngoặc đơn (hoặc ngoặc vuông/nhọn).
 * Ví dụ: "Vương miện, Trái cây tươi (Dâu, Nho, Xoài...), Nến số"
 * -> ["Vương miện", "Trái cây tươi (Dâu, Nho, Xoài...)", "Nến số"]
 */
export function splitRespectingParentheses(input?: string, delimiter: string = ','): string[] {
  if (!input || typeof input !== 'string') return [];
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '(' || char === '[' || char === '{') {
      parenDepth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
    } else if (char === delimiter && parenDepth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Tự động phát hiện các phụ kiện khách yêu cầu qua ghi chú / yêu cầu đặc biệt
 */
export function extractAccessoriesFromText(text?: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const detected: string[] = [];

  // Nến số / nến pháo nghệ thuật
  if (
    lower.includes('nến số') ||
    lower.includes('kèm nến') ||
    lower.includes('nến pháo') ||
    lower.includes('pháo bông') ||
    lower.includes('thêm nến') ||
    lower.includes('nến sinh nhật')
  ) {
    const numMatch = text.match(/nến\s*(?:số)?\s*(\d+)/i);
    if (numMatch) {
      detected.push(`Bộ nến số ${numMatch[1]} (Theo yêu cầu khách)`);
    } else {
      detected.push('Bộ nến số / Nến pháo nghệ thuật (Khách yêu cầu)');
    }
  }

  // Vương miện / mô hình / đồ chơi
  if (lower.includes('vương miện') || lower.includes('vuong mien')) {
    detected.push('Vương miện công chúa / hoàng gia');
  }
  if (
    lower.includes('mô hình') ||
    lower.includes('đồ chơi') ||
    lower.includes('búp bê') ||
    lower.includes('siêu nhân') ||
    lower.includes('oto') ||
    lower.includes('ô tô')
  ) {
    detected.push('Mô hình đồ chơi / Phụ kiện cắm bánh');
  }
  if (lower.includes('topper') || lower.includes('cắm chữ')) {
    detected.push('Topper cắm bánh nghệ thuật');
  }

  // Hoa tươi
  if (lower.includes('hoa tươi') || lower.includes('bông tươi')) {
    detected.push('Hoa tươi trang trí cao cấp');
  }

  // Đèn LED
  if (lower.includes('đèn led') || lower.includes('dây led') || lower.includes('phát sáng')) {
    detected.push('Dây đèn LED nhấp nháy phát sáng');
  }

  // Hộp rút tiền
  if (lower.includes('rút tiền') || lower.includes('hộp tiền')) {
    detected.push('Hộp rút tiền bên trong bánh');
  }

  // Trái cây tươi
  if (lower.includes('trái cây') || lower.includes('dâu tây') || lower.includes('nho xanh') || lower.includes('hoa quả')) {
    detected.push('Trái cây tươi (Dâu, Nho, Xoài...)');
  }

  // Mũ sinh nhật
  if (lower.includes('mũ sinh nhật') || lower.includes('nón sinh nhật')) {
    detected.push('Mũ / Nón sinh nhật');
  }

  return Array.from(new Set(detected));
}

/**
 * Danh mục phụ kiện tiêu chuẩn luôn tặng kèm miễn phí cho mỗi bánh sinh nhật
 */
export const STANDARD_INCLUDED_ACCESSORIES = [
  { name: 'Dao cắt bánh kem', icon: '🍴', desc: '1 dao nhựa an toàn' },
  { name: 'Bộ đĩa & thìa ăn bánh', icon: '🍽️', desc: 'Đĩa giấy & thìa' },
  { name: 'Nến sinh nhật tiêu chuẩn', icon: '🕯️', desc: 'Nến cây tiệm tặng kèm' },
  { name: 'Hộp & đế lót bánh', icon: '📦', desc: 'Đế lót định hình & hộp' },
];
