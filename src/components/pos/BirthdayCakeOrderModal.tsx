// src/components/pos/BirthdayCakeOrderModal.tsx
// Modal Đặt Bánh Sinh Nhật Mobile-First & Bánh Nhiều Tầng (Multi-Tier) Theo Flowchart Excel
'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  CakeTierSpec,
} from '@/lib/types/bakery-bom';
import {
  getFullCakeBomConfig,
  CAKE_BOM_UPDATED_EVENT,
} from '@/lib/utils/cakeBomManager';
import { isImportedProduct } from '@/lib/utils/productManager';
import {
  Cake,
  X,
  Sparkles,
  Layers,
  Utensils,
  Package,
  Gift,
  Boxes,
  Percent,
  CheckCircle2,
  Clock,
  Truck,
  Store,
  Calendar,
  AlertCircle,
  Plus,
  Minus,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';

interface BirthdayCakeOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: any;
  availableProducts?: any[];
  onConfirmOrder: (orderPayload: any) => void;
}

interface TierState {
  cakeBaseId: string;
  cakeBaseSizeId: string;
  creamCoatingId: string;
  creamCoatingSizeId: string;
  fillingId: string;
}

export function BirthdayCakeOrderModal({
  isOpen,
  onClose,
  product,
  availableProducts,
  onConfirmOrder,
}: BirthdayCakeOrderModalProps) {
  const [config, setConfig] = useState<FullCakeBomConfig>(() => getFullCakeBomConfig());

  // 2 Chế độ theo yêu cầu: 1. Bánh có sẵn (Preset) | 2. Bánh tùy chọn (Custom)
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  // Bánh tùy chọn: Hỗ trợ 1 - 3 tầng bánh độc lập
  const [tierCount, setTierCount] = useState<number>(1);
  const [tiers, setTiers] = useState<TierState[]>([
    { cakeBaseId: '', cakeBaseSizeId: '', creamCoatingId: '', creamCoatingSizeId: '', fillingId: '' },
    { cakeBaseId: '', cakeBaseSizeId: '', creamCoatingId: '', creamCoatingSizeId: '', fillingId: '' },
    { cakeBaseId: '', cakeBaseSizeId: '', creamCoatingId: '', creamCoatingSizeId: '', fillingId: '' },
  ]);

  // Phụ kiện, hộp & quà tặng dùng chung cho cả chiếc bánh
  const [selectedPackagingId, setSelectedPackagingId] = useState<string>('');
  const [selectedFreeAccessoryIds, setSelectedFreeAccessoryIds] = useState<string[]>([]);
  const [selectedDecorAddonIds, setSelectedDecorAddonIds] = useState<string[]>([]);
  const [isDecorAccordionOpen, setIsDecorAccordionOpen] = useState(false);
  const [isPackagingAccordionOpen, setIsPackagingAccordionOpen] = useState(false);

  // Tỷ lệ markup và giá bán
  const [customMarkupPct, setCustomMarkupPct] = useState<number>(36.5);
  const [finalPriceInput, setFinalPriceInput] = useState<number>(0);
  const [orderQuantity, setOrderQuantity] = useState<number>(1);

  // Thông tin khách hàng & Lịch hẹn giao
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupDate, setPickupDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [pickupTime, setPickupTime] = useState('15:00');
  const [orderDeliveryType, setOrderDeliveryType] = useState<'store' | 'ship'>('store');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [cakeMessage, setCakeMessage] = useState('');
  const [decorNotes, setDecorNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Lắng nghe sự kiện khi Định Mức Bánh Sinh Nhật thay đổi trong Admin
  useEffect(() => {
    const handleBomUpdated = (e: any) => {
      if (e.detail) setConfig(e.detail);
      else setConfig(getFullCakeBomConfig());
    };
    window.addEventListener(CAKE_BOM_UPDATED_EVENT, handleBomUpdated);
    return () => window.removeEventListener(CAKE_BOM_UPDATED_EVENT, handleBomUpdated);
  }, []);

  // Khởi tạo và đồng bộ khi mở modal
  useEffect(() => {
    if (!isOpen) return;
    setValidationError(null);
    setIsDecorAccordionOpen(false);
    setIsPackagingAccordionOpen(false);
    const currentConfig = getFullCakeBomConfig();
    setConfig(currentConfig);
    setCustomMarkupPct(currentConfig.targetFoodCostPct || 36.5);
    setOrderQuantity(1);

    // Mặc định nạp mẫu Preset nếu sản phẩm có sẵn preset
    const defaultPreset =
      (product?.bom_preset_id && currentConfig.birthdayBomPresets.find((p) => p.id === product.bom_preset_id)) ||
      currentConfig.birthdayBomPresets[0];

    if (defaultPreset) {
      applyPreset(defaultPreset, currentConfig);
    }

    // Thiết lập mặc định cho 3 tầng bánh tùy chọn
    const defaultBase = currentConfig.cakeBases[0];
    const defaultCream = currentConfig.creamCoatings[0];
    const defaultFilling = currentConfig.fillings[0]?.id || '';

    // Tầng 1 (Đáy): ưu tiên size 20 hoặc 18
    const sizeT1 = defaultBase?.sizes[2]?.id || defaultBase?.sizes[0]?.id || '';
    const creamSizeT1 = defaultCream?.sizes[2]?.id || defaultCream?.sizes[0]?.id || '';

    // Tầng 2 (Trên): ưu tiên size 16
    const sizeT2 = defaultBase?.sizes[1]?.id || defaultBase?.sizes[0]?.id || '';
    const creamSizeT2 = defaultCream?.sizes[1]?.id || defaultCream?.sizes[0]?.id || '';

    // Tầng 3 (Chóp): ưu tiên size 14
    const sizeT3 = defaultBase?.sizes[0]?.id || '';
    const creamSizeT3 = defaultCream?.sizes[0]?.id || '';

    setTiers([
      {
        cakeBaseId: defaultBase?.id || '',
        cakeBaseSizeId: sizeT1,
        creamCoatingId: defaultCream?.id || '',
        creamCoatingSizeId: creamSizeT1,
        fillingId: defaultFilling,
      },
      {
        cakeBaseId: defaultBase?.id || '',
        cakeBaseSizeId: sizeT2,
        creamCoatingId: defaultCream?.id || '',
        creamCoatingSizeId: creamSizeT2,
        fillingId: defaultFilling,
      },
      {
        cakeBaseId: defaultBase?.id || '',
        cakeBaseSizeId: sizeT3,
        creamCoatingId: defaultCream?.id || '',
        creamCoatingSizeId: creamSizeT3,
        fillingId: defaultFilling,
      },
    ]);

    // Chọn hộp mặc định từ Định Mức Bánh Sinh Nhật
    const defaultPkg = currentConfig.packagings.find((p) => p.isDefault) || currentConfig.packagings[0];
    setSelectedPackagingId(defaultPkg?.id || '');
    setSelectedFreeAccessoryIds(currentConfig.freeAccessories.filter((a) => a.isDefaultIncluded).map((a) => a.id));
    // Mặc định KHÔNG chọn bất kỳ phụ kiện decor nào khi mở modal
    setSelectedDecorAddonIds([]);
  }, [product, isOpen]);

  const applyPreset = (preset: BirthdayCakeBomPreset, currentConfig: FullCakeBomConfig) => {
    setSelectedPresetId(preset.id);
    const defaultPkg = currentConfig.packagings.find((p) => p.isDefault) || currentConfig.packagings[0];
    setSelectedPackagingId(preset.packagingId || defaultPkg?.id || '');
    setSelectedFreeAccessoryIds(preset.freeAccessoryIds || currentConfig.freeAccessories.filter((a) => a.isDefaultIncluded).map((a) => a.id));
    // Mặc định KHÔNG chọn bất kỳ phụ kiện decor nào theo yêu cầu
    setSelectedDecorAddonIds([]);

    // Gán vào tầng 1
    setTiers((prev) => [
      {
        cakeBaseId: preset.cakeBaseId,
        cakeBaseSizeId: preset.cakeBaseSizeId,
        creamCoatingId: preset.creamCoatingId,
        creamCoatingSizeId: preset.creamCoatingSizeId,
        fillingId: preset.fillingId || currentConfig.fillings[0]?.id || '',
      },
      prev[1],
      prev[2],
    ]);
  };

  const updateTier = (index: number, patch: Partial<TierState>) => {
    setTiers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  // ── TÍNH TOÁN CHI PHÍ TỪNG TẦNG BÁNH ──
  const tierCostBreakdown = useMemo(() => {
    if (mode === 'preset') {
      const preset = config.birthdayBomPresets.find((p) => p.id === selectedPresetId) || config.birthdayBomPresets[0];
      const base = config.cakeBases.find((b) => b.id === preset?.cakeBaseId) || config.cakeBases[0];
      const baseSize = base?.sizes.find((s) => s.id === preset?.cakeBaseSizeId) || base?.sizes[0];
      const baseCost = baseSize?.baseCost ?? 0;

      const cream = config.creamCoatings.find((c) => c.id === preset?.creamCoatingId) || config.creamCoatings[0];
      const creamSize = cream?.sizes.find((s) => s.id === preset?.creamCoatingSizeId) || cream?.sizes[0];
      const creamCost = creamSize?.baseCost ?? 0;

      const filling = config.fillings.find((f) => f.id === preset?.fillingId);
      const fillingCost = filling?.costPrice ?? 0;

      return [
        {
          tierIndex: 1,
          tierName: 'Mẫu Bánh Có Sẵn',
          cakeBaseId: base?.id || '',
          cakeBaseName: base?.name || '',
          cakeBaseCost: baseCost,
          bakingTemperature: preset?.bakingTemperature || baseSize?.bakingTemperature || base?.bakingTemperature || 160,
          bakingTimeMinutes: preset?.bakingTimeMinutes || baseSize?.bakingTimeMinutes || base?.bakingTimeMinutes || 45,
          baseNotes: preset?.notes || baseSize?.notes || base?.notes || '',
          baseBomIngredients: baseSize?.bomIngredients || [],
          sizeId: baseSize?.id || '',
          sizeName: baseSize?.sizeName || '',
          diameterCm: baseSize?.diameterCm || 18,
          creamId: cream?.id || '',
          creamName: cream?.name || '',
          creamCost: creamCost,
          creamBomIngredients: creamSize?.bomIngredients || [],
          fillingId: filling?.id || '',
          fillingName: filling?.name || '',
          fillingCost: fillingCost,
          tierCost: baseCost + creamCost + fillingCost,
        },
      ];
    }

    // Chế độ Custom: Tính toán chi tiết cho từng tầng đang chọn (1, 2 hoặc 3 tầng)
    const active = tiers.slice(0, tierCount);
    return active.map((t, idx) => {
      const base = config.cakeBases.find((b) => b.id === t.cakeBaseId) || config.cakeBases[0];
      const baseSize = base?.sizes.find((s) => s.id === t.cakeBaseSizeId) || base?.sizes[0];
      const baseCost = baseSize?.baseCost ?? 0;

      const cream = config.creamCoatings.find((c) => c.id === t.creamCoatingId) || config.creamCoatings[0];
      const creamSize = cream?.sizes.find((s) => s.id === t.creamCoatingSizeId) || cream?.sizes[0];
      const creamCost = creamSize?.baseCost ?? 0;

      const filling = config.fillings.find((f) => f.id === t.fillingId);
      const fillingCost = filling?.costPrice ?? 0;

      const tierName =
        tierCount === 1
          ? 'Tầng 1 (Tiêu chuẩn)'
          : idx === 0
          ? 'Tầng 1 (Tầng Đáy)'
          : idx === 1 && tierCount === 2
          ? 'Tầng 2 (Tầng Trên)'
          : idx === 1
          ? 'Tầng 2 (Tầng Giữa)'
          : 'Tầng 3 (Tầng Chóp)';

      return {
        tierIndex: idx + 1,
        tierName,
        cakeBaseId: base?.id || '',
        cakeBaseName: base?.name || '',
        cakeBaseCost: baseCost,
        bakingTemperature: baseSize?.bakingTemperature || base?.bakingTemperature || 160,
        bakingTimeMinutes: baseSize?.bakingTimeMinutes || base?.bakingTimeMinutes || 45,
        baseNotes: baseSize?.notes || base?.notes || '',
        baseBomIngredients: baseSize?.bomIngredients || [],
        sizeId: baseSize?.id || '',
        sizeName: baseSize?.sizeName || '',
        diameterCm: baseSize?.diameterCm || (idx === 0 ? 20 : idx === 1 ? 16 : 14),
        creamId: cream?.id || '',
        creamName: cream?.name || '',
        creamCost: creamCost,
        creamBomIngredients: creamSize?.bomIngredients || [],
        fillingId: filling?.id || '',
        fillingName: filling?.name || '',
        fillingCost: fillingCost,
        tierCost: baseCost + creamCost + fillingCost,
      };
    });
  }, [mode, selectedPresetId, tierCount, tiers, config]);

  // ── TỔNG HỢP TOÀN BỘ CHI PHÍ & GIÁ GỢI Ý ──
  const totalCalculation = useMemo(() => {
    const totalTiersCost = tierCostBreakdown.reduce((sum, t) => sum + t.tierCost, 0);

    // Hộp và bao bì
    const pkg = config.packagings.find((p) => p.id === selectedPackagingId);
    const packagingCost = pkg?.costPrice ?? 0;

    // Vật tư tặng kèm
    let freeAccCost = 0;
    for (const accId of selectedFreeAccessoryIds) {
      const acc = config.freeAccessories.find((a) => a.id === accId);
      if (acc) freeAccCost += (acc.costPrice || 0) * (acc.quantityDefault || 1);
    }

    // Phụ kiện trang trí thêm
    let decorCost = 0;
    for (const dId of selectedDecorAddonIds) {
      const d = config.decorAddons.find((item) => item.id === dId);
      if (d) decorCost += d.costPrice || 0;
    }

    const totalCost = totalTiersCost + packagingCost + freeAccCost + decorCost;
    const factor = customMarkupPct > 0 ? customMarkupPct / 100 : 0.365;
    const rawSuggested = totalCost / factor;
    const suggestedPrice = Math.round(rawSuggested / 5000) * 5000;

    return {
      totalTiersCost,
      packagingCost,
      freeAccessoriesCost: freeAccCost,
      decorCost,
      totalCost,
      suggestedPrice,
      markupPct: customMarkupPct,
    };
  }, [tierCostBreakdown, selectedPackagingId, selectedFreeAccessoryIds, selectedDecorAddonIds, customMarkupPct, config]);

  // Tổng giá bán niêm yết của các phụ kiện decor được chọn thêm
  const selectedDecorSellingTotal = useMemo(() => {
    let sum = 0;
    for (const dId of selectedDecorAddonIds) {
      const d = config.decorAddons.find((item) => item.id === dId);
      if (d) sum += d.sellingPrice || d.costPrice || 0;
    }
    return sum;
  }, [selectedDecorAddonIds, config.decorAddons]);

  // Thông tin loại hộp đựng bánh đang được chọn (ưu tiên hộp mặc định của quán)
  const selectedPackagingBox = useMemo(() => {
    return config.packagings.find((p) => p.id === selectedPackagingId) ||
           config.packagings.find((p) => p.isDefault) ||
           config.packagings[0];
  }, [config.packagings, selectedPackagingId]);

  // Tự động điền giá gợi ý khi thay đổi cấu hình
  useEffect(() => {
    if (totalCalculation.suggestedPrice > 0) {
      setFinalPriceInput(totalCalculation.suggestedPrice);
    }
  }, [totalCalculation.suggestedPrice]);

  // Tìm sản phẩm tương ứng trong kho tiệm để lấy tồn kho thực tế
  const matchedProduct = useMemo(() => {
    if (product) return product;
    if (mode === 'preset' && selectedPresetId) {
      const preset = config.birthdayBomPresets.find((p) => p.id === selectedPresetId);
      if (preset && availableProducts && availableProducts.length > 0) {
        return (
          availableProducts.find((p: any) => p.id === preset.id) ||
          availableProducts.find((p: any) => p.name?.toLowerCase() === preset.name?.toLowerCase()) ||
          availableProducts.find((p: any) => p.name?.toLowerCase().includes(preset.name?.toLowerCase()) || preset.name?.toLowerCase().includes(p.name?.toLowerCase())) ||
          null
        );
      }
    }
    return null;
  }, [product, mode, selectedPresetId, config.birthdayBomPresets, availableProducts]);

  const cakeStock = Number(matchedProduct?.stock_qty ?? matchedProduct?.stock ?? product?.stock_qty ?? product?.stock ?? 0);
  const hasStock = cakeStock >= orderQuantity;

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!customerName.trim()) {
      setValidationError('Vui lòng nhập Tên khách hàng đặt bánh!');
      return;
    }
    if (!customerPhone.trim()) {
      setValidationError('Vui lòng nhập Số điện thoại khách hàng!');
      return;
    }
    if (orderDeliveryType === 'ship' && !deliveryAddress.trim()) {
      setValidationError('Vui lòng nhập Địa chỉ giao hàng khi chọn Giao tận nơi (Ship bánh)!');
      return;
    }
    if (finalPriceInput <= 0) {
      setValidationError('Vui lòng nhập giá bán hợp lệ!');
      return;
    }
    setValidationError(null);

    const primaryTier = tierCostBreakdown[0];
    const isMultiTier = mode === 'custom' && tierCount > 1;

    const orderSpec: CakeOrderSpec = {
      isBirthdayCake: true,
      bomPresetId: mode === 'preset' ? selectedPresetId : undefined,
      tierCount: mode === 'preset' ? 1 : tierCount,
      tiers: tierCostBreakdown.map((t) => ({
        tierIndex: t.tierIndex,
        tierName: t.tierName,
        sizeId: t.sizeId,
        sizeName: t.sizeName,
        diameterCm: t.diameterCm,
        cakeBase: {
          id: t.cakeBaseId,
          name: t.cakeBaseName,
          cost: t.cakeBaseCost,
          bakingTemperature: t.bakingTemperature,
          bakingTimeMinutes: t.bakingTimeMinutes,
          notes: t.baseNotes,
          bomIngredients: t.baseBomIngredients,
        },
        creamCoating: {
          id: t.creamId,
          name: t.creamName,
          cost: t.creamCost,
          bomIngredients: t.creamBomIngredients,
        },
        filling: t.fillingId
          ? {
              id: t.fillingId,
              name: t.fillingName,
              cost: t.fillingCost,
            }
          : undefined,
        tierCost: t.tierCost,
      })),
      sizeName: isMultiTier
        ? `${tierCount} Tầng (${tierCostBreakdown.map((t) => t.sizeName.split(' ')[1] || t.sizeName).join(' + ')})`
        : primaryTier.sizeName,
      diameterCm: primaryTier.diameterCm,
      cakeBase: {
        id: primaryTier.cakeBaseId,
        name: primaryTier.cakeBaseName,
        cost: primaryTier.cakeBaseCost,
        bakingTemperature: primaryTier.bakingTemperature,
        bakingTimeMinutes: primaryTier.bakingTimeMinutes,
        notes: primaryTier.baseNotes,
        bomIngredients: primaryTier.baseBomIngredients,
      },
      creamCoating: {
        id: primaryTier.creamId,
        name: primaryTier.creamName,
        cost: primaryTier.creamCost,
      },
      filling: primaryTier.fillingId
        ? {
            id: primaryTier.fillingId,
            name: primaryTier.fillingName,
            cost: primaryTier.fillingCost,
          }
        : undefined,
      packaging: selectedPackagingId
        ? {
            id: selectedPackagingId,
            name: config.packagings.find((p) => p.id === selectedPackagingId)?.name || 'Hộp tiêu chuẩn',
            cost: totalCalculation.packagingCost,
          }
        : undefined,
      freeAccessories: selectedFreeAccessoryIds.map((id) => {
        const acc = config.freeAccessories.find((a) => a.id === id);
        return {
          id,
          name: acc?.name || '',
          quantity: acc?.quantityDefault || 1,
          cost: acc?.costPrice || 0,
        };
      }),
      decorAddons: selectedDecorAddonIds.map((id) => {
        const d = config.decorAddons.find((item) => item.id === id);
        return {
          id,
          name: d?.name || '',
          price: d?.sellingPrice || 0,
          cost: d?.costPrice || 0,
        };
      }),
      cakeMessage,
      decorNotes,
      totalCost: totalCalculation.totalCost,
      targetFoodCostPct: customMarkupPct,
      suggestedPrice: totalCalculation.suggestedPrice,
      finalPrice: finalPriceInput,
    };

    if (isImportedProduct(matchedProduct || product)) {
      if (cakeStock <= 0 || orderQuantity > cakeStock) {
        alert(`❌ Sản phẩm "${matchedProduct?.name || product?.name}" là HÀNG NHẬP NGOÀI VỀ BÁN (Tồn kho hiện có: ${cakeStock} cái).\n\n⚠️ Vì đây là hàng nhập sẵn từ bên ngoài, thợ bếp không thể tự làm/nướng bánh này, do đó không thể đặt vượt quá số lượng tồn kho thực tế!`);
        return;
      }
    }

    const initialStatus = hasStock ? 'ready' : 'pending';

    const orderPayload = {
      product: {
        id: matchedProduct?.id || product?.id || 'birthday-cake-' + Date.now(),
        name: isMultiTier
          ? `${matchedProduct?.name || product?.name || 'Bánh Sinh Nhật'} (${tierCount} Tầng)`
          : (matchedProduct?.name || product?.name || 'Bánh Sinh Nhật Đặt Theo Yêu Cầu'),
        selling_price: finalPriceInput,
        cake_type_label: 'birthday',
        stock_qty: cakeStock,
      },
      cakeOrderSpec: orderSpec,
      quantity: orderQuantity,
      unitPrice: finalPriceInput,
      finalPrice: finalPriceInput * orderQuantity + (orderDeliveryType === 'ship' ? shippingFee : 0),
      customerName: customerName || 'Khách Đặt Bánh Sinh Nhật',
      customerPhone,
      pickupDateTime: `${pickupDate}T${pickupTime}`,
      orderDeliveryType: orderDeliveryType === 'ship' ? 'ship' : 'pickup',
      deliveryAddress: orderDeliveryType === 'ship' ? deliveryAddress : undefined,
      shippingFee: orderDeliveryType === 'ship' ? shippingFee : 0,
      initialKdsStatus: initialStatus,
      hasStock: hasStock,
      cakeStock: cakeStock,
    };

    onConfirmOrder(orderPayload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      {/* Cửa sổ tương thích hoàn hảo cả Máy tính (Desktop/Laptop) và Điện thoại/Tablet */}
      <div className="bg-white w-full max-w-2xl lg:max-w-3xl rounded-3xl shadow-2xl border border-pink-200 p-4 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain animate-in zoom-in-95 duration-150">
        
        {/* HEADER MODAL */}
        <div className="flex items-center justify-between pb-3 border-b border-pink-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 text-white flex items-center justify-center shadow-md shadow-pink-500/30 shrink-0">
              <Cake className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-base text-zinc-900 flex items-center gap-2 flex-wrap">
                <span>Đặt Bánh Sinh Nhật Mới</span>
                {product?.name && (
                  <span className="text-[11px] text-pink-700 font-bold px-2 py-0.5 rounded-full bg-pink-50 border border-pink-200 truncate max-w-[180px]">
                    {product.name}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-zinc-500 truncate">
                Định mức BOM tính vốn chuẩn xác & phân luồng thợ bếp
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* THÔNG BÁO LỖI NẾU THIẾU THÔNG TIN BẮT BUỘC */}
        {validationError && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-800 font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-sm animate-shake">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* THÔNG BÁO TỒN KHO THEO FLOWCHART */}
        <div
          className={`p-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs font-bold ${
            hasStock
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 shrink-0" />
            <span>
              Tồn kho tiệm: <b>{cakeStock > 0 ? `Còn ${cakeStock} cái có sẵn` : 'Hết tồn kho (0 cái)'}</b>
              {orderQuantity > 1 && (
                <span className="ml-1 text-[11px] font-normal">
                  (Đặt <b>{orderQuantity}</b> cái {cakeStock >= orderQuantity ? '✓ Đủ tồn' : `⚠️ Thiếu ${orderQuantity - cakeStock} cái`})
                </span>
              )}
            </span>
          </div>
          <span className="text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-xl bg-white/80 shadow-2xs">
            {hasStock
              ? '⚡ Đủ tồn: Đơn vào Bước 3 (Chờ Giao / Sẵn Sàng)'
              : '👨‍🍳 Thiếu tồn: Đơn vào Bếp Bước 1 (Làm Mới)'}
          </span>
        </div>

        {/* CHỌN 2 MỤC: 1. BÁNH CÓ SẴN & 2. BÁNH TÙY CHỌN */}
        <div className="flex items-center gap-2 bg-pink-50/80 p-1.5 rounded-2xl border border-pink-200">
          <button
            type="button"
            onClick={() => setMode('preset')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'preset'
                ? 'bg-pink-600 text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/60'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>1. Bánh có sẵn</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'custom'
                ? 'bg-pink-600 text-white shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/60'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>2. Bánh tùy chọn</span>
          </button>
        </div>
          
          {/* ══════════════ MỤC 1: BÁNH CÓ SẴN (PRESET BOM) ══════════════ */}
          {mode === 'preset' && (
            <div className="space-y-3 bg-zinc-50/70 p-3 sm:p-4 rounded-2xl border border-zinc-200">
              <label className="font-black text-zinc-900 text-xs sm:text-sm flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-pink-600" />
                <span>Chọn Mẫu Bánh Định Mức Chuẩn:</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {config.birthdayBomPresets.map((preset) => {
                  const isSel = selectedPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset, config)}
                      className={`p-3.5 rounded-2xl text-left border transition cursor-pointer active:scale-98 ${
                        isSel
                          ? 'bg-pink-50 border-pink-600 ring-2 ring-pink-300 text-pink-950 shadow-sm'
                          : 'bg-white border-zinc-200 text-zinc-700 hover:border-pink-300 hover:bg-pink-50/20'
                      }`}
                    >
                      <div className="font-bold text-xs sm:text-sm flex items-center justify-between">
                        <span className="line-clamp-1">{preset.name}</span>
                        {isSel && <Check className="w-4 h-4 text-pink-600 shrink-0" />}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
                        {preset.notes || 'Mẫu bánh sinh nhật định mức BOM chuẩn'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════ MỤC 2: BÁNH TÙY CHỌN (HỖ TRỢ 1 - 3 TẦNG BÁNH) ══════════════ */}
          {mode === 'custom' && (
            <div className="space-y-4">
              
              {/* BỘ CHỌN SỐ TẦNG BÁNH */}
              <div className="p-3.5 bg-gradient-to-r from-pink-50 to-rose-50 rounded-2xl border border-pink-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs sm:text-sm text-pink-950 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-pink-600" />
                    <span>Chọn Số Tầng Bánh:</span>
                  </span>
                  <span className="text-[11px] text-pink-700 font-bold bg-white px-2 py-0.5 rounded-full border border-pink-200">
                    {tierCount === 1 ? 'Bánh đơn 1 tầng' : `Bánh ${tierCount} tầng xếp chồng`}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTierCount(num)}
                      className={`py-2.5 px-2 rounded-xl text-xs font-black transition flex flex-col items-center justify-center gap-1 cursor-pointer border ${
                        tierCount === num
                          ? 'bg-pink-600 text-white border-pink-600 shadow-sm'
                          : 'bg-white text-zinc-700 border-pink-200 hover:bg-pink-100/50'
                      }`}
                    >
                      <span className="text-base leading-none">
                        {num === 1 ? '🎂' : num === 2 ? '🎂🎂' : '🎂🎂🎂'}
                      </span>
                      <span>{num === 1 ? '1 Tầng' : num === 2 ? '2 Tầng' : '3 Tầng'}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* CẤU HÌNH CHI TIẾT TỪNG TẦNG BÁNH */}
              {tiers.slice(0, tierCount).map((tier, idx) => {
                const tierInfo = tierCostBreakdown[idx] || {
                  tierName: `Tầng ${idx + 1}`,
                  tierCost: 0,
                };
                const currentBase = config.cakeBases.find((b) => b.id === tier.cakeBaseId) || config.cakeBases[0];
                const currentCream = config.creamCoatings.find((c) => c.id === tier.creamCoatingId) || config.creamCoatings[0];

                return (
                  <div
                    key={idx}
                    className="p-3.5 sm:p-4 rounded-2xl bg-white border-2 border-pink-200 shadow-xs space-y-3"
                  >
                    {/* Header từng tầng */}
                    <div className="flex items-center justify-between pb-2 border-b border-pink-100">
                      <span className="font-black text-xs sm:text-sm text-pink-900 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-pink-100 text-pink-700 flex items-center justify-center text-xs">
                          {idx + 1}
                        </span>
                        <span>{tierInfo.tierName}</span>
                      </span>
                      <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                        Vốn: {tierInfo.tierCost.toLocaleString('vi-VN')}₫
                      </span>
                    </div>

                    {/* 1. Chọn Size đường kính bánh */}
                    <div>
                      <label className="text-[11px] font-bold text-zinc-700 block mb-1">
                        Kích thước (Đường kính):
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {currentBase?.sizes.map((s) => {
                          const isSel = tier.cakeBaseSizeId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                updateTier(idx, { cakeBaseSizeId: s.id });
                                // Tự động đồng bộ size kem tương ứng
                                const matchingCreamSize = currentCream?.sizes.find((cs) => cs.diameterCm === s.diameterCm) || currentCream?.sizes[0];
                                if (matchingCreamSize) {
                                  updateTier(idx, { creamCoatingSizeId: matchingCreamSize.id });
                                }
                              }}
                              className={`p-2 rounded-xl text-center border text-xs font-bold transition cursor-pointer ${
                                isSel
                                  ? 'bg-pink-600 text-white border-pink-600 shadow-2xs'
                                  : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-pink-50'
                              }`}
                            >
                              <div className="text-xs font-black">{s.diameterCm}cm</div>
                              <div className="text-[10px] opacity-80 mt-0.5">~{s.baseCost.toLocaleString('vi-VN')}₫</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Cốt bánh, Kem phủ & Nhân bánh */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <div>
                        <label className="font-bold text-zinc-700 block mb-1">Cốt bánh:</label>
                        <select
                          value={tier.cakeBaseId}
                          onChange={(e) => {
                            const newBaseId = e.target.value;
                            const b = config.cakeBases.find((x) => x.id === newBaseId);
                            updateTier(idx, {
                              cakeBaseId: newBaseId,
                              cakeBaseSizeId: b?.sizes[0]?.id || '',
                            });
                          }}
                          className="w-full p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 font-bold text-zinc-900 text-xs focus:bg-white"
                        >
                          {config.cakeBases.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="font-bold text-zinc-700 block mb-1">Kem phủ:</label>
                        <select
                          value={tier.creamCoatingId}
                          onChange={(e) => {
                            const newCreamId = e.target.value;
                            const c = config.creamCoatings.find((x) => x.id === newCreamId);
                            updateTier(idx, {
                              creamCoatingId: newCreamId,
                              creamCoatingSizeId: c?.sizes[0]?.id || '',
                            });
                          }}
                          className="w-full p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 font-bold text-zinc-900 text-xs focus:bg-white"
                        >
                          {config.creamCoatings.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="font-bold text-zinc-700 block mb-1">Nhân bánh:</label>
                        <select
                          value={tier.fillingId}
                          onChange={(e) => updateTier(idx, { fillingId: e.target.value })}
                          className="w-full p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 font-bold text-zinc-900 text-xs focus:bg-white"
                        >
                          {config.fillings.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name} {f.costPrice > 0 ? `(+${f.costPrice.toLocaleString('vi-VN')}₫)` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ══════════════ PHỤ KIỆN & BAO BÌ CHUNG ══════════════ */}
          <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-3 text-xs">
            <span className="font-black text-zinc-900 flex items-center gap-1.5 text-xs sm:text-sm">
              <Package className="w-4 h-4 text-pink-600" />
              <span>Hộp Đóng Gói & Phụ Kiện Decor:</span>
            </span>

            {/* Loại Hộp Đựng Bánh (Dạng cửa sổ thu gọn tương tự Phụ kiện Decor) */}
            <div className="rounded-2xl border border-pink-200 bg-pink-50/40 overflow-hidden">
              {/* Header thu gọn / mở rộng */}
              <button
                type="button"
                onClick={() => setIsPackagingAccordionOpen((prev) => !prev)}
                className="w-full p-3 flex items-center justify-between gap-2 text-left hover:bg-pink-100/50 transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-pink-500/15 text-pink-700 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-pink-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-zinc-900 text-xs truncate flex items-center gap-2">
                      <span>Loại Hộp Đựng Bánh:</span>
                      {selectedPackagingBox?.isDefault && (
                        <span className="text-[9px] bg-pink-200 text-pink-800 font-bold px-1.5 py-0.5 rounded-md">
                          Mặc định quán
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-600 font-medium truncate mt-0.5">
                      {selectedPackagingBox ? (
                        <span className="text-pink-900 font-bold">
                          {selectedPackagingBox.name} (~{(selectedPackagingBox.sellingPrice || selectedPackagingBox.costPrice || 0).toLocaleString('vi-VN')}₫)
                        </span>
                      ) : (
                        'Nhấn để chọn loại hộp đựng...'
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 font-bold text-[10px]">
                    1 hộp đã chọn
                  </span>
                  {isPackagingAccordionOpen ? (
                    <ChevronUp className="w-4 h-4 text-pink-700" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-pink-700" />
                  )}
                </div>
              </button>

              {/* Tag tóm tắt hộp đang chọn khi thu gọn */}
              {!isPackagingAccordionOpen && selectedPackagingBox && (
                <div className="px-3 pb-3 pt-0 flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center gap-1.5 bg-pink-100 text-pink-950 border border-pink-300 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                    <span>📦 {selectedPackagingBox.name}</span>
                    <span className="text-pink-700 font-black">
                      (~{(selectedPackagingBox.sellingPrice || selectedPackagingBox.costPrice || 0).toLocaleString('vi-VN')}₫)
                    </span>
                    {selectedPackagingBox.isDefault && (
                      <span className="bg-white/80 text-pink-700 px-1 rounded text-[9px] font-bold">
                        Mặc định
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Cửa sổ / List mở rộng để chọn 1 loại hộp */}
              {isPackagingAccordionOpen && (
                <div className="p-3 border-t border-pink-200 bg-white space-y-2.5 animate-fade-in">
                  <div className="flex items-center justify-between text-[11px] pb-1 border-b border-zinc-100">
                    <span className="text-zinc-500 font-medium">
                      Chọn 1 loại hộp đựng (Cài đặt hộp mặc định trong tab <strong>Hộp & Bao Bì</strong> của Định Mức Bánh):
                    </span>
                  </div>

                  {config.packagings.length === 0 ? (
                    <div className="text-center py-3 text-zinc-400 text-xs">
                      Chưa có loại hộp nào được cài đặt trong định mức bánh sinh nhật.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {config.packagings.map((pkg) => {
                        const isSel = selectedPackagingId === pkg.id;
                        return (
                          <div
                            key={pkg.id}
                            onClick={() => setSelectedPackagingId(pkg.id)}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition select-none ${
                              isSel
                                ? 'bg-pink-50 border-pink-500 text-pink-950 ring-1 ring-pink-300'
                                : 'bg-zinc-50/70 border-zinc-200 text-zinc-700 hover:bg-zinc-100/70'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSel
                                    ? 'border-pink-600 bg-pink-600 text-white'
                                    : 'border-zinc-300 bg-white'
                                }`}
                              >
                                {isSel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate flex items-center gap-1.5">
                                  <span className="truncate">{pkg.name}</span>
                                  {pkg.isDefault && (
                                    <span className="text-[9px] bg-pink-100 text-pink-700 px-1.5 py-0.2 rounded font-bold shrink-0">
                                      Mặc định
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className={`text-[11px] font-black shrink-0 ${isSel ? 'text-pink-700' : 'text-zinc-500'}`}>
                              ~{(pkg.sellingPrice || pkg.costPrice || 0).toLocaleString('vi-VN')}₫
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">
                      Đang chọn: <strong className="text-pink-800 font-bold">{selectedPackagingBox?.name}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPackagingAccordionOpen(false)}
                      className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs cursor-pointer shadow-xs transition"
                    >
                      Đóng danh sách
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Phụ kiện decor tính thêm (Dạng cửa sổ thu gọn theo yêu cầu) */}
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 overflow-hidden">
              {/* Header thu gọn / mở rộng */}
              <button
                type="button"
                onClick={() => setIsDecorAccordionOpen((prev) => !prev)}
                className="w-full p-3 flex items-center justify-between gap-2 text-left hover:bg-amber-100/50 transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/15 text-amber-800 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-zinc-900 text-xs truncate">
                      Phụ kiện & Decor đặt thêm (nếu có):
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                      {selectedDecorAddonIds.length === 0 ? (
                        'Mặc định không chọn • Nhấn để chọn thêm nến, vương miện, đèn LED...'
                      ) : (
                        <span className="text-amber-800 font-bold">
                          Đã chọn {selectedDecorAddonIds.length} món (+{selectedDecorSellingTotal.toLocaleString('vi-VN')}₫)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedDecorAddonIds.length > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-bold text-[10px]">
                      {selectedDecorAddonIds.length} món
                    </span>
                  ) : (
                    <span className="text-[11px] text-zinc-400 font-medium">Bấm để chọn</span>
                  )}
                  {isDecorAccordionOpen ? (
                    <ChevronUp className="w-4 h-4 text-amber-700" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-amber-700" />
                  )}
                </div>
              </button>

              {/* Danh sách chip các món đã chọn khi đang thu gọn */}
              {!isDecorAccordionOpen && selectedDecorAddonIds.length > 0 && (
                <div className="px-3 pb-3 pt-0 flex flex-wrap gap-1.5">
                  {selectedDecorAddonIds.map((id) => {
                    const addon = config.decorAddons.find((a) => a.id === id);
                    if (!addon) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 bg-amber-100 text-amber-900 border border-amber-300 px-2 py-1 rounded-lg text-[11px] font-bold"
                      >
                        ✓ {addon.name} (+{(addon.sellingPrice || addon.costPrice).toLocaleString('vi-VN')}₫)
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDecorAddonIds((prev) => prev.filter((x) => x !== id));
                          }}
                          className="hover:text-rose-600 ml-0.5 cursor-pointer"
                          title="Bỏ chọn"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Cửa sổ / List mở rộng để tích chọn */}
              {isDecorAccordionOpen && (
                <div className="p-3 border-t border-amber-200 bg-white space-y-2.5 animate-fade-in">
                  <div className="flex items-center justify-between text-[11px] pb-1 border-b border-zinc-100">
                    <span className="text-zinc-500 font-medium">
                      Tích chọn phụ kiện từ danh mục Định Mức Bánh Sinh Nhật:
                    </span>
                    {selectedDecorAddonIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedDecorAddonIds([])}
                        className="text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                      >
                        Bỏ chọn tất cả
                      </button>
                    )}
                  </div>

                  {config.decorAddons.length === 0 ? (
                    <div className="text-center py-3 text-zinc-400 text-xs">
                      Chưa có phụ kiện decor nào được cài đặt trong định mức bánh sinh nhật.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {config.decorAddons.map((addon) => {
                        const isSel = selectedDecorAddonIds.includes(addon.id);
                        return (
                          <div
                            key={addon.id}
                            onClick={() => {
                              setSelectedDecorAddonIds((prev) =>
                                isSel ? prev.filter((x) => x !== addon.id) : [...prev, addon.id]
                              );
                            }}
                            className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition select-none ${
                              isSel
                                ? 'bg-amber-50 border-amber-400 text-amber-950 ring-1 ring-amber-300'
                                : 'bg-zinc-50/70 border-zinc-200 text-zinc-700 hover:bg-zinc-100/70'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                                  isSel
                                    ? 'bg-amber-600 border-amber-600 text-white'
                                    : 'border-zinc-300 bg-white'
                                }`}
                              >
                                {isSel && <Check className="w-3 h-3 stroke-[3]" />}
                              </div>
                              <span className="text-xs font-bold truncate">{addon.name}</span>
                            </div>
                            <span className={`text-[11px] font-black shrink-0 ${isSel ? 'text-amber-800' : 'text-zinc-500'}`}>
                              +{(addon.sellingPrice || addon.costPrice).toLocaleString('vi-VN')}₫
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">
                      Tổng tiền phụ kiện: <strong className="text-amber-800 font-black">+{selectedDecorSellingTotal.toLocaleString('vi-VN')}₫</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsDecorAccordionOpen(false)}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer shadow-xs transition"
                    >
                      Đóng danh sách
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Ghi chữ & Dặn dò tạo hình */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div>
                <label className="font-bold text-zinc-700 block mb-1">Ghi chữ lên bánh:</label>
                <input
                  type="text"
                  value={cakeMessage}
                  onChange={(e) => setCakeMessage(e.target.value)}
                  placeholder="VD: Chúc mừng sinh nhật bé Bắp"
                  className="w-full p-2.5 rounded-xl bg-white border border-zinc-200 font-bold text-xs text-zinc-900"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Yêu cầu tạo hình / Dặn thợ:</label>
                <input
                  type="text"
                  value={decorNotes}
                  onChange={(e) => setDecorNotes(e.target.value)}
                  placeholder="VD: Tone màu hồng pastel, ít ngọt"
                  className="w-full p-2.5 rounded-xl bg-white border border-zinc-200 font-medium text-xs text-zinc-900"
                />
              </div>
            </div>
          </div>

          {/* ══════════════ THÔNG TIN KHÁCH HÀNG & GIAO NHẬN ══════════════ */}
          <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-3 text-xs">
            <span className="font-black text-blue-900 flex items-center gap-1.5 text-xs sm:text-sm">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>Thông Tin Khách Hàng & Hẹn Giờ Giao Nhận:</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="font-bold text-zinc-700 block mb-1">
                  Tên khách hàng: <span className="text-rose-600 font-black">*</span>
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="VD: Chị Mai"
                  className="w-full p-2.5 rounded-xl bg-white border border-blue-200 font-bold text-xs text-zinc-900"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">
                  Số điện thoại: <span className="text-rose-600 font-black">*</span>
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="VD: 0988..."
                  className="w-full p-2.5 rounded-xl bg-white border border-blue-200 font-bold text-xs text-zinc-900"
                />
              </div>
            </div>

            {/* Hình thức nhận */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderDeliveryType('store')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition border text-xs cursor-pointer ${
                  orderDeliveryType === 'store'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <Store className="w-4 h-4" /> Khách lấy tại tiệm
              </button>
              <button
                type="button"
                onClick={() => setOrderDeliveryType('ship')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition border text-xs cursor-pointer ${
                  orderDeliveryType === 'ship'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <Truck className="w-4 h-4" /> Giao hàng tận nơi
              </button>
            </div>

            {orderDeliveryType === 'ship' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="sm:col-span-2">
                  <label className="font-bold text-zinc-700 block mb-1">Địa chỉ nhận bánh chi tiết *:</label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Số nhà, tên đường, phường/xã..."
                    className="w-full p-2.5 rounded-xl bg-white border border-blue-200 font-bold text-xs text-zinc-900"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Phí ship (₫):</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(shippingFee)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setShippingFee(parseCurrencyInput(e.target.value))}
                    placeholder="0"
                    className="w-full p-2.5 rounded-xl bg-white border border-blue-200 font-bold text-xs text-zinc-900 text-right"
                  />
                </div>
              </div>
            )}

            {/* Ngày giờ hẹn (trên mobile xếp 1 cột, trên tablet/desktop 2 cột tránh bị chồng chéo) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="min-w-0">
                <label className="font-bold text-zinc-700 block mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>Ngày hẹn nhận bánh:</span>
                </label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full min-w-0 p-2.5 rounded-xl bg-white border border-blue-200 font-bold text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="min-w-0">
                <label className="font-bold text-zinc-700 block mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Giờ hẹn nhận bánh:</span>
                </label>
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full min-w-0 p-2.5 rounded-xl bg-white border border-blue-200 font-bold text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
          </div>

        {/* ══════════════ PHẦN CHỐT GIÁ VÀ ĐẶT ĐƠN ══════════════ */}
        <div className="pt-3 border-t-2 border-zinc-200 space-y-3 bg-white">
          {/* Tóm tắt chi phí BOM */}
          <div className="flex items-center justify-between text-xs bg-pink-50/60 p-2.5 rounded-xl border border-pink-200">
            <div>
              <span className="text-[10px] text-zinc-500 block">Tổng Vốn BOM ({mode === 'custom' ? `${tierCount} tầng` : '1 tầng'}):</span>
              <span className="font-black text-rose-600 text-sm">
                {totalCalculation.totalCost.toLocaleString('vi-VN')}₫
              </span>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-pink-700 font-bold block">
                Giá Gợi Ý (~{customMarkupPct}%):
              </span>
              <span className="font-black text-pink-700 text-sm">
                {totalCalculation.suggestedPrice.toLocaleString('vi-VN')}₫
              </span>
            </div>
          </div>

          {/* Hàng điều khiển số lượng, giá chốt và nút đặt */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              {/* Stepper số lượng */}
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-300">
                <button
                  type="button"
                  onClick={() => setOrderQuantity((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg bg-white hover:bg-zinc-200 text-zinc-800 font-bold flex items-center justify-center shadow-2xs active:scale-90"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-7 text-center font-black text-xs text-zinc-900">
                  {orderQuantity}
                </span>
                <button
                  type="button"
                  onClick={() => setOrderQuantity((q) => q + 1)}
                  className="w-8 h-8 rounded-lg bg-white hover:bg-zinc-200 text-zinc-800 font-bold flex items-center justify-center shadow-2xs active:scale-90"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Ô chốt giá bán */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-zinc-700 hidden sm:inline">Giá:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatCurrencyInput(finalPriceInput)}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setFinalPriceInput(parseCurrencyInput(e.target.value))}
                  placeholder="Giá bán chốt"
                  className="w-28 sm:w-32 px-2.5 py-1.5 rounded-xl border-2 border-pink-500 bg-white font-black text-sm text-pink-700 focus:outline-none text-center shadow-xs"
                />
              </div>

              {orderQuantity > 1 && (
                <div className="text-[11px] font-bold text-zinc-600">
                  Tổng: <b className="text-pink-700">{(finalPriceInput * orderQuantity).toLocaleString('vi-VN')}₫</b>
                </div>
              )}
            </div>

            {/* Nút Hủy & Chốt đơn */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 via-rose-600 to-pink-700 hover:from-pink-700 hover:to-rose-800 text-white font-black text-xs sm:text-sm shadow-md shadow-pink-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Chốt Giá & Đặt Bánh</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
