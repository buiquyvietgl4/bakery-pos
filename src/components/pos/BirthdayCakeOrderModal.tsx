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
  Ruler,
} from 'lucide-react';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';
import { useAuth } from '@/lib/auth/AuthContext';

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
  const { isAdmin, hasPermission } = useAuth();
  const canViewCost = isAdmin || (hasPermission && hasPermission('bomCost'));
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

  // Hộp & bao bì: chọn linh hoạt từ danh sách, mặc định lấy theo cài đặt Mục 4
  const [selectedPackagingId, setSelectedPackagingId] = useState<string>('');
  const [isPackagingAccordionOpen, setIsPackagingAccordionOpen] = useState<boolean>(false);

  // Phụ kiện & quà tặng dùng chung cho cả chiếc bánh
  const [selectedFreeAccessoryIds, setSelectedFreeAccessoryIds] = useState<string[]>([]);
  const [selectedDecorAddonIds, setSelectedDecorAddonIds] = useState<string[]>([]);
  const [isDecorAccordionOpen, setIsDecorAccordionOpen] = useState(false);
  const [isPresetListOpen, setIsPresetListOpen] = useState(false);

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
    setIsPresetListOpen(false);
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

    // Tự động sử dụng hộp mặc định từ Mục 4 (Định Mức Bánh Sinh Nhật)
    const defaultPkg = currentConfig.packagings.find((p) => p.isDefault) || currentConfig.packagings[0];
    setSelectedPackagingId(defaultPkg?.id || '');
    setIsPackagingAccordionOpen(false);

    setSelectedFreeAccessoryIds(currentConfig.freeAccessories.filter((a) => a.isDefaultIncluded).map((a) => a.id));
    // Mặc định KHÔNG chọn bất kỳ phụ kiện decor nào khi mở modal
    setSelectedDecorAddonIds([]);
  }, [product, isOpen]);

  const applyPreset = (preset: BirthdayCakeBomPreset, currentConfig: FullCakeBomConfig) => {
    setSelectedPresetId(preset.id);
    setSelectedFreeAccessoryIds(preset.freeAccessoryIds || currentConfig.freeAccessories.filter((a) => a.isDefaultIncluded).map((a) => a.id));
    // Mặc định KHÔNG chọn bất kỳ phụ kiện decor nào theo yêu cầu
    setSelectedDecorAddonIds([]);

    const base = currentConfig.cakeBases.find((b) => b.id === preset.cakeBaseId) || currentConfig.cakeBases[0];
    const currentSizeId = tiers[0]?.cakeBaseSizeId;
    const existingSize = base?.sizes.find((s) => s.id === currentSizeId);
    const chosenSize = existingSize || base?.sizes.find((s) => s.diameterCm === 18) || base?.sizes[0];

    const cream = currentConfig.creamCoatings.find((c) => c.id === preset.creamCoatingId) || currentConfig.creamCoatings[0];
    const matchingCreamSize = cream?.sizes.find((s) => s.diameterCm === chosenSize?.diameterCm) || cream?.sizes[0];

    // Gán vào tầng 1
    setTiers((prev) => [
      {
        cakeBaseId: preset.cakeBaseId,
        cakeBaseSizeId: chosenSize?.id || '',
        creamCoatingId: preset.creamCoatingId,
        creamCoatingSizeId: matchingCreamSize?.id || '',
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
      const currentTier = tiers[0];
      const baseSize =
        base?.sizes.find((s) => s.id === currentTier?.cakeBaseSizeId) ||
        base?.sizes.find((s) => s.diameterCm === 18) ||
        base?.sizes[0];
      const baseCost = baseSize?.baseCost ?? 0;

      const cream = config.creamCoatings.find((c) => c.id === preset?.creamCoatingId) || config.creamCoatings[0];
      const creamSize =
        cream?.sizes.find((s) => s.id === currentTier?.creamCoatingSizeId) ||
        cream?.sizes.find((s) => s.diameterCm === baseSize?.diameterCm) ||
        cream?.sizes[0];
      const creamCost = creamSize?.baseCost ?? 0;

      const filling = config.fillings.find((f) => f.id === (currentTier?.fillingId || preset?.fillingId));
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

  // Mẫu bánh BOM định mức có sẵn đang được chọn
  const selectedPreset = useMemo(() => {
    return (
      (selectedPresetId && config.birthdayBomPresets.find((p) => p.id === selectedPresetId)) ||
      config.birthdayBomPresets[0]
    );
  }, [config.birthdayBomPresets, selectedPresetId]);

  // Hộp đóng gói: theo loại đã chọn hoặc mặc định theo Mục 4
  const selectedPackagingBox = useMemo(() => {
    return (
      (selectedPackagingId && config.packagings.find((p) => p.id === selectedPackagingId)) ||
      config.packagings.find((p) => p.isDefault) ||
      config.packagings[0]
    );
  }, [config.packagings, selectedPackagingId]);

  // ── TỔNG HỢP TOÀN BỘ CHI PHÍ & GIÁ GỢI Ý ──
  const totalCalculation = useMemo(() => {
    const totalTiersCost = tierCostBreakdown.reduce((sum, t) => sum + t.tierCost, 0);

    // Hộp và bao bì mặc định chung theo Mục 4
    const packagingCost = selectedPackagingBox?.costPrice ?? 0;

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
  }, [tierCostBreakdown, selectedPackagingBox, selectedFreeAccessoryIds, selectedDecorAddonIds, customMarkupPct, config]);

  // Tổng giá bán niêm yết của các phụ kiện decor được chọn thêm
  const selectedDecorSellingTotal = useMemo(() => {
    let sum = 0;
    for (const dId of selectedDecorAddonIds) {
      const d = config.decorAddons.find((item) => item.id === dId);
      if (d) sum += d.sellingPrice || (canViewCost ? (d.costPrice || 0) : 0);
    }
    return sum;
  }, [selectedDecorAddonIds, config.decorAddons, canViewCost]);

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
      setValidationError('⚠️ Vui lòng nhập Tên người mua / khách hàng (bắt buộc nhập)!');
      return;
    }
    if (!customerPhone.trim()) {
      setValidationError('⚠️ Vui lòng nhập Số điện thoại người mua / liên hệ (bắt buộc nhập)!');
      return;
    }
    if (orderDeliveryType === 'ship' && !deliveryAddress.trim()) {
      setValidationError('⚠️ Vui lòng nhập Địa chỉ nhận bánh chi tiết khi chọn Giao hàng tận nơi (bắt buộc nhập)!');
      return;
    }
    if (!pickupDate || !pickupDate.trim()) {
      setValidationError('⚠️ Vui lòng chọn Ngày hẹn nhận bánh (bắt buộc nhập)!');
      return;
    }
    if (!pickupTime || !pickupTime.trim()) {
      setValidationError('⚠️ Vui lòng chọn Giờ hẹn nhận bánh (bắt buộc nhập)!');
      return;
    }
    if (finalPriceInput <= 0) {
      setValidationError('⚠️ Vui lòng nhập giá bán hợp lệ!');
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
      packaging: selectedPackagingBox
        ? {
            id: selectedPackagingBox.id,
            name: selectedPackagingBox.name || 'Hộp tiêu chuẩn',
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
                {isAdmin
                  ? 'Định mức BOM tính vốn chuẩn xác & phân luồng thợ bếp'
                  : 'Tùy chọn kích thước, cốt bánh & tự động gợi ý giá bán'}
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
          
          {/* ══════════════ MỤC 1: BÁNH CÓ SẴN (PRESET BOM) - DẠNG CỬA SỔ CHỌN LIST NỔI BẬT & GỌN GÀNG ══════════════ */}
          {mode === 'preset' && (
            <div className="space-y-3">
              <div className="rounded-2xl sm:rounded-3xl border-2 border-pink-400/90 bg-gradient-to-r from-pink-50/90 via-white to-pink-50/70 shadow-sm overflow-hidden transition-all duration-200">
                {/* Header thu gọn / mở rộng - Kích thước to hơn các mục khác để nổi bật */}
                <button
                  type="button"
                  onClick={() => setIsPresetListOpen((prev) => !prev)}
                  className="w-full p-3 sm:p-4 flex items-center justify-between gap-2.5 text-left hover:bg-pink-100/40 transition cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
                    <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 text-white flex items-center justify-center shadow-md shadow-pink-500/25 shrink-0 group-hover:scale-105 transition">
                      <Boxes className="w-4.5 h-4.5 sm:w-6 sm:h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <span className="text-[11px] sm:text-sm font-black text-pink-900 uppercase tracking-wide">
                          Mẫu Bánh Định Mức (BOM):
                        </span>
                        {selectedPreset && (
                          <span className="text-[9px] sm:text-[11px] bg-pink-600 text-white font-black px-1.5 sm:px-2 py-0.2 sm:py-0.5 rounded-md sm:rounded-lg shadow-2xs">
                            Đang chọn
                          </span>
                        )}
                      </div>
                      <div className="text-xs sm:text-base font-extrabold text-zinc-900 mt-0.5 truncate group-hover:text-pink-700 transition">
                        {selectedPreset?.name || 'Chọn mẫu bánh sinh nhật có sẵn...'}
                      </div>
                      {selectedPreset && (
                        <div className="text-[10px] sm:text-xs text-zinc-600 truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {(() => {
                            const base = config.cakeBases.find((b) => b.id === selectedPreset.cakeBaseId);
                            const cream = config.creamCoatings.find((c) => c.id === selectedPreset.creamCoatingId);
                            const curBaseSize = base?.sizes.find((s) => s.id === tiers[0]?.cakeBaseSizeId) || base?.sizes[0];
                            return (
                              <>
                                {curBaseSize?.sizeName && (
                                  <span className="font-bold text-pink-700 bg-pink-100/70 px-1.5 py-0.2 rounded">
                                    📏 Size {curBaseSize.sizeName} ({curBaseSize.diameterCm}cm)
                                  </span>
                                )}
                                {base?.name && (
                                  <span className="font-semibold text-zinc-700">
                                    • Cốt: {base.name}
                                  </span>
                                )}
                                {cream?.name && (
                                  <span className="font-semibold text-zinc-700">
                                    • Kem: {cream.name}
                                  </span>
                                )}
                                {selectedPreset.notes && (
                                  <span className="text-zinc-500 hidden md:inline">
                                    ({selectedPreset.notes})
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <span className="px-2 py-0.5 rounded-lg bg-pink-100 text-pink-800 font-extrabold text-[11px] hidden md:inline-flex items-center gap-1 border border-pink-200">
                      {config.birthdayBomPresets.length} mẫu có sẵn
                    </span>
                    <div className="flex items-center gap-1 text-[11px] sm:text-xs font-bold text-pink-700 bg-pink-100/80 border border-pink-200 px-2 sm:px-2.5 py-1.5 rounded-xl group-hover:bg-pink-600 group-hover:text-white transition">
                      <span className="hidden xs:inline">{isPresetListOpen ? 'Thu gọn' : 'Đổi mẫu'}</span>
                      {isPresetListOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      )}
                    </div>
                  </div>
                </button>

                {/* Cửa sổ List mở rộng để chọn mẫu bánh */}
                {isPresetListOpen && (
                  <div className="p-3 sm:p-4 border-t-2 border-pink-200 bg-white space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between text-xs pb-1.5 border-b border-zinc-100">
                      <span className="text-zinc-600 font-bold flex items-center gap-1.5 text-[11px] sm:text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-pink-600 shrink-0" />
                        <span>Chọn 1 mẫu bánh từ danh sách (chạm để áp dụng ngay):</span>
                      </span>
                      <span className="text-[10px] text-zinc-400 font-medium hidden sm:inline">
                        ({config.birthdayBomPresets.length} mẫu có sẵn)
                      </span>
                    </div>

                    {/* DANH SÁCH DẠNG LIST DỄ CHỌN VÀ THAO TÁC CẢ TRÊN MOBILE & DESKTOP */}
                    <div className="border border-zinc-200 rounded-2xl overflow-hidden divide-y divide-zinc-100 max-h-56 sm:max-h-64 overflow-y-auto bg-white shadow-2xs">
                      {config.birthdayBomPresets.map((preset) => {
                        const isSel = selectedPreset?.id === preset.id;
                        const base = config.cakeBases.find((b) => b.id === preset.cakeBaseId);
                        const cream = config.creamCoatings.find((c) => c.id === preset.creamCoatingId);
                        const filling = config.fillings.find((f) => f.id === preset.fillingId);

                        return (
                          <div
                            key={preset.id}
                            onClick={() => {
                              applyPreset(preset, config);
                              setIsPresetListOpen(false);
                            }}
                            className={`p-2.5 sm:p-3 flex items-center justify-between gap-2.5 cursor-pointer transition select-none active:bg-pink-100/60 ${
                              isSel
                                ? 'bg-pink-50/90 text-pink-950 font-bold'
                                : 'hover:bg-zinc-50 text-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div
                                className={`w-4 h-4 sm:w-4.5 sm:h-4.5 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSel
                                    ? 'border-pink-600 bg-pink-600 text-white'
                                    : 'border-zinc-300 bg-white'
                                }`}
                              >
                                {isSel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-xs sm:text-sm truncate ${isSel ? 'font-black text-pink-950' : 'font-bold text-zinc-800'}`}>
                                    {preset.name}
                                  </span>
                                  {isSel && (
                                    <span className="text-[9px] bg-pink-200 text-pink-800 font-bold px-1.5 py-0.2 rounded-md shrink-0">
                                      Đang chọn
                                    </span>
                                  )}
                                </div>

                                <div className="text-[11px] text-zinc-500 truncate mt-0.5 flex items-center gap-1.5">
                                  {base?.name && (
                                    <span className="font-semibold text-zinc-700">
                                      Cốt: {base.name}
                                    </span>
                                  )}
                                  {cream?.name && <span className="truncate">• Kem: {cream.name}</span>}
                                  {filling?.name && <span className="truncate">• Nhân: {filling.name}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0 flex items-center gap-1.5 text-right">
                              {isSel ? (
                                <span className="w-6 h-6 rounded-lg bg-pink-600 text-white flex items-center justify-center">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </span>
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-semibold px-2 py-1 rounded-lg hover:bg-pink-100 hover:text-pink-700">
                                  Chọn
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                      <span className="text-xs text-zinc-600 truncate max-w-[60%]">
                        Đang chọn: <strong className="text-pink-700 font-bold">{selectedPreset?.name}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsPresetListOpen(false)}
                        className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs cursor-pointer shadow-xs transition shrink-0"
                      >
                        Đóng danh sách
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* TÙY CHỌN SIZE CHO MẪU BÁNH ĐANG CHỌN (TỰ ĐỘNG LINK GIÁ VỐN & BOM THEO SIZE) */}
              <div className="p-3.5 sm:p-4 rounded-2xl sm:rounded-3xl bg-white border border-pink-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-black text-xs sm:text-sm text-pink-950">
                    <Ruler className="w-4 h-4 text-pink-600" />
                    <span>Tùy Chọn Kích Thước Bánh (Size):</span>
                  </div>
                  {(() => {
                    const base = config.cakeBases.find((b) => b.id === selectedPreset?.cakeBaseId) || config.cakeBases[0];
                    const curSize = base?.sizes.find((s) => s.id === tiers[0]?.cakeBaseSizeId) || base?.sizes[0];
                    return (
                      <span className="text-[11px] font-extrabold text-pink-700 bg-pink-50 px-2.5 py-0.5 rounded-full border border-pink-200">
                        Đang chọn: {curSize?.sizeName || `${curSize?.diameterCm || 18}cm`}
                      </span>
                    );
                  })()}
                </div>

                {/* Các nút bấm chọn Size dạng chip gọn nhẹ, hiển thị đường kính cm và giá vốn */}
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {(() => {
                    const base = config.cakeBases.find((b) => b.id === selectedPreset?.cakeBaseId) || config.cakeBases[0];
                    const cream = config.creamCoatings.find((c) => c.id === selectedPreset?.creamCoatingId) || config.creamCoatings[0];
                    const activeSizeId = tiers[0]?.cakeBaseSizeId || base?.sizes[0]?.id;

                    return base?.sizes.map((s) => {
                      const isSel = activeSizeId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            updateTier(0, { cakeBaseSizeId: s.id });
                            const matchingCream = cream?.sizes.find((cs) => cs.diameterCm === s.diameterCm) || cream?.sizes[0];
                            if (matchingCream) {
                              updateTier(0, { creamCoatingSizeId: matchingCream.id });
                            }
                          }}
                          className={`p-2 sm:p-2.5 rounded-xl sm:rounded-2xl text-center border text-xs font-bold transition cursor-pointer active:scale-95 flex flex-col items-center justify-center ${
                            isSel
                              ? 'bg-pink-600 text-white border-pink-600 shadow-md shadow-pink-600/20'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-pink-50 hover:border-pink-300'
                          }`}
                        >
                          <div className="text-xs sm:text-sm font-black">{s.diameterCm}cm</div>
                          <div className={`text-[10px] mt-0.5 truncate max-w-full ${isSel ? 'text-pink-100' : 'text-zinc-500'}`}>
                            {s.sizeName}
                          </div>
                          {canViewCost && (
                            <div className={`text-[10px] mt-0.5 font-bold ${isSel ? 'text-pink-200' : 'text-rose-600'}`}>
                              ~{(Number(s?.baseCost) || 0).toLocaleString('vi-VN')}₫
                            </div>
                          )}
                        </button>
                      );
                    });
                  })()}
                </div>

                <p className="text-[11px] text-zinc-500 italic">
                  * Khi chọn kích thước, hệ thống tự động liên kết định mức BOM cốt bánh & kem phủ chuẩn xác cho KDS Bếp.
                </p>
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
                      {canViewCost && (
                        <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                          Vốn: {(Number(tierInfo?.tierCost) || 0).toLocaleString('vi-VN')}₫
                        </span>
                      )}
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
                              {canViewCost && (
                                <div className="text-[10px] opacity-80 mt-0.5">~{(Number(s?.baseCost) || 0).toLocaleString('vi-VN')}₫</div>
                              )}
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
                              {f.name} {canViewCost && (Number(f?.costPrice) || 0) > 0 ? `(+${(Number(f?.costPrice) || 0).toLocaleString('vi-VN')}₫)` : ''}
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

            {/* Hộp Đóng Gói & Bao Bì: Mặc định chọn theo Mục 4, cho phép chọn loại khác từ danh sách */}
            <div className="rounded-2xl border border-pink-200 bg-pink-50/50 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsPackagingAccordionOpen((prev) => !prev)}
                className="w-full p-3 flex items-center justify-between gap-2.5 text-left hover:bg-pink-100/40 transition cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="w-7 h-7 rounded-xl bg-pink-500/15 text-pink-700 flex items-center justify-center shrink-0">
                    <Package className="w-4 h-4 text-pink-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-zinc-900 text-xs">Hộp Đựng & Bao Bì:</span>
                      {selectedPackagingBox?.isDefault ? (
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-md border border-emerald-300">
                          Mặc định Mục 4
                        </span>
                      ) : (
                        <span className="text-[9px] bg-pink-100 text-pink-800 font-bold px-1.5 py-0.2 rounded-md border border-pink-300">
                          Tùy chọn
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-pink-950 font-bold truncate mt-0.5 flex items-center gap-1.5">
                      <span>{selectedPackagingBox?.name || 'Hộp tiêu chuẩn'}</span>
                      {canViewCost && selectedPackagingBox && (Number(selectedPackagingBox.costPrice) || 0) > 0 ? (
                        <span className="text-zinc-500 font-normal">
                          (Vốn: {(Number(selectedPackagingBox.costPrice) || 0).toLocaleString('vi-VN')}₫)
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-bold text-pink-700 bg-pink-100/80 px-2.5 py-1 rounded-xl shrink-0">
                  <span>{isPackagingAccordionOpen ? 'Thu gọn' : 'Đổi hộp'}</span>
                  {isPackagingAccordionOpen ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </div>
              </button>

              {/* Danh sách các loại hộp bao bì */}
              {isPackagingAccordionOpen && (
                <div className="p-3 border-t border-pink-200 bg-white space-y-2 animate-fade-in">
                  <div className="text-[11px] text-zinc-500 font-medium">
                    Chọn loại hộp đóng gói (mặc định đã chọn theo cài đặt Mục 4):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
                    {config.packagings.map((pkg) => {
                      const isSel = selectedPackagingBox?.id === pkg.id;
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => {
                            setSelectedPackagingId(pkg.id);
                            setIsPackagingAccordionOpen(false);
                          }}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex items-center justify-between gap-2 select-none active:scale-[0.99] ${
                            isSel
                              ? 'bg-pink-50 border-pink-500 text-pink-950 font-bold shadow-2xs'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate">{pkg.name}</span>
                              {pkg.isDefault && (
                                <span className="text-[8px] bg-emerald-100 text-emerald-800 font-black px-1 py-0.2 rounded shrink-0">
                                  Mặc định
                                </span>
                              )}
                            </div>
                            {canViewCost && (
                              <div className="text-[10px] text-zinc-500 font-normal">
                                Vốn: {(pkg.costPrice || 0).toLocaleString('vi-VN')}₫
                              </div>
                            )}
                          </div>
                          <div className="shrink-0">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSel ? 'border-pink-600 bg-pink-600 text-white' : 'border-zinc-300 bg-white'
                              }`}
                            >
                              {isSel && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
                          Đã chọn {selectedDecorAddonIds.length} món
                          {canViewCost && selectedDecorSellingTotal > 0 ? ` (+${selectedDecorSellingTotal.toLocaleString('vi-VN')}₫)` : ''}
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
                        <span>✓ {addon.name}</span>
                        {canViewCost && (addon.sellingPrice || addon.costPrice) ? (
                          <span className="text-amber-700 font-normal text-[10px]">
                            (+{(addon.sellingPrice || addon.costPrice).toLocaleString('vi-VN')}₫)
                          </span>
                        ) : null}
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
                            {canViewCost && (addon.sellingPrice || addon.costPrice) ? (
                              <span className={`text-[11px] font-black shrink-0 ${isSel ? 'text-amber-800' : 'text-zinc-500'}`}>
                                +{(addon.sellingPrice || addon.costPrice).toLocaleString('vi-VN')}₫
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                    <span className="text-xs text-zinc-500">
                      {canViewCost ? (
                        <>
                          Tổng tiền phụ kiện: <strong className="text-amber-800 font-black">+{selectedDecorSellingTotal.toLocaleString('vi-VN')}₫</strong>
                        </>
                      ) : (
                        <>
                          Đã chọn: <strong className="text-amber-800 font-bold">{selectedDecorAddonIds.length} món phụ kiện</strong>
                        </>
                      )}
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
          <div className="p-3.5 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-3 text-xs overflow-hidden">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="font-black text-blue-900 flex items-center gap-1.5 text-xs sm:text-sm">
                <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Thông Tin Người Mua & Hẹn Giờ Nhận:</span>
              </span>
              <span className="text-[11px] text-rose-600 font-bold bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                * Các ô có dấu đỏ là bắt buộc
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="w-full min-w-0">
                <label className="font-bold text-zinc-700 block mb-1 flex items-center gap-1">
                  <span>Tên người mua / khách hàng:</span>
                  <span className="text-rose-600 font-bold text-xs">* (Bắt buộc)</span>
                </label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="VD: Chị Mai"
                  className={`w-full p-2.5 rounded-xl bg-white border font-bold text-xs text-zinc-900 transition ${
                    !customerName.trim() && validationError
                      ? 'border-rose-400 ring-2 ring-rose-200'
                      : 'border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400'
                  }`}
                />
              </div>

              <div className="w-full min-w-0">
                <label className="font-bold text-zinc-700 block mb-1 flex items-center gap-1">
                  <span>Số điện thoại:</span>
                  <span className="text-rose-600 font-bold text-xs">* (Bắt buộc)</span>
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="VD: 0988..."
                  className={`w-full p-2.5 rounded-xl bg-white border font-bold text-xs text-zinc-900 transition ${
                    !customerPhone.trim() && validationError
                      ? 'border-rose-400 ring-2 ring-rose-200'
                      : 'border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400'
                  }`}
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
                <Store className="w-4 h-4 shrink-0" /> Khách lấy tại tiệm
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
                <Truck className="w-4 h-4 shrink-0" /> Giao hàng tận nơi
              </button>
            </div>

            {orderDeliveryType === 'ship' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div className="sm:col-span-2 w-full min-w-0">
                  <label className="font-bold text-zinc-700 block mb-1 flex items-center gap-1">
                    <span>Địa chỉ nhận bánh chi tiết:</span>
                    <span className="text-rose-600 font-bold text-xs">* (Bắt buộc)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveryAddress}
                    onChange={(e) => {
                      setDeliveryAddress(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="Số nhà, tên đường, phường/xã..."
                    className={`w-full p-2.5 rounded-xl bg-white border font-bold text-xs text-zinc-900 transition ${
                      !deliveryAddress.trim() && validationError
                        ? 'border-rose-400 ring-2 ring-rose-200'
                        : 'border-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-400'
                    }`}
                  />
                </div>
                <div className="w-full min-w-0">
                  <label className="font-bold text-zinc-700 block mb-1">Phí ship (₫):</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(shippingFee)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setShippingFee(parseCurrencyInput(e.target.value))}
                    placeholder="0"
                    className="w-full p-2.5 rounded-xl bg-white border border-blue-200 font-bold text-xs text-zinc-900 text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
            )}

            {/* Ngày giờ hẹn (trên mobile xếp 1 cột, trên tablet/desktop 2 cột tránh bị chồng chéo) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="w-full min-w-0">
                <label className="font-bold text-zinc-700 block mb-1 flex items-center gap-1">
                  <span className="flex items-center gap-1 text-zinc-800">
                    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Ngày hẹn nhận bánh:</span>
                  </span>
                  <span className="text-rose-600 font-bold text-xs">* (Bắt buộc)</span>
                </label>
                <div
                  className={`w-full min-w-0 overflow-hidden rounded-xl border bg-white transition ${
                    !pickupDate.trim() && validationError
                      ? 'border-rose-400 ring-2 ring-rose-200'
                      : 'border-blue-200 focus-within:ring-2 focus-within:ring-blue-400'
                  }`}
                >
                  <input
                    type="date"
                    required
                    value={pickupDate}
                    onChange={(e) => {
                      setPickupDate(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    className="w-full max-w-full box-border block p-2.5 bg-transparent border-0 font-bold text-xs text-zinc-900 focus:outline-none appearance-none [-webkit-appearance:none]"
                  />
                </div>
              </div>

              <div className="w-full min-w-0">
                <label className="font-bold text-zinc-700 block mb-1 flex items-center gap-1">
                  <span className="flex items-center gap-1 text-zinc-800">
                    <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Giờ hẹn nhận bánh:</span>
                  </span>
                  <span className="text-rose-600 font-bold text-xs">* (Bắt buộc)</span>
                </label>
                <div
                  className={`w-full min-w-0 overflow-hidden rounded-xl border bg-white transition ${
                    !pickupTime.trim() && validationError
                      ? 'border-rose-400 ring-2 ring-rose-200'
                      : 'border-blue-200 focus-within:ring-2 focus-within:ring-blue-400'
                  }`}
                >
                  <input
                    type="time"
                    required
                    value={pickupTime}
                    onChange={(e) => {
                      setPickupTime(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    className="w-full max-w-full box-border block p-2.5 bg-transparent border-0 font-bold text-xs text-zinc-900 focus:outline-none appearance-none [-webkit-appearance:none]"
                  />
                </div>
              </div>
            </div>
          </div>

        {/* ══════════════ PHẦN CHỐT GIÁ VÀ ĐẶT ĐƠN ══════════════ */}
        <div className="pt-3 border-t-2 border-zinc-200 space-y-3 bg-white">
          {/* Tóm tắt chi phí BOM & Giá gợi ý bán */}
          {canViewCost ? (
            <div className="flex items-center justify-between text-xs bg-pink-50/60 p-2.5 rounded-xl border border-pink-200">
              <div>
                <span className="text-[10px] text-zinc-500 block">Tổng Vốn BOM ({mode === 'custom' ? `${tierCount} tầng` : '1 tầng'}):</span>
                <span className="font-black text-rose-600 text-sm">
                  {(Number(totalCalculation?.totalCost) || 0).toLocaleString('vi-VN')}₫
                </span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-pink-700 font-bold block">
                  Giá Gợi Ý (~{customMarkupPct}%):
                </span>
                <span className="font-black text-pink-700 text-sm">
                  {(Number(totalCalculation?.suggestedPrice) || 0).toLocaleString('vi-VN')}₫
                </span>
              </div>
            </div>
          ) : (
            /* Đối với tài khoản Bán Hàng và Thợ Bánh: Ẩn hết giá vốn đi, chỉ hiện giá gợi ý bán */
            <div className="flex items-center justify-between text-xs bg-pink-50/70 p-2.5 sm:p-3 rounded-xl border border-pink-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-pink-500/15 text-pink-700 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-pink-600" />
                </div>
                <div>
                  <span className="text-xs font-bold text-zinc-800 block">
                    Giá Gợi Ý Bán ({mode === 'custom' ? `${tierCount} tầng` : '1 tầng'}):
                  </span>
                  <span className="text-[10px] text-zinc-500">Tự động tính theo kích thước & tùy chọn bánh</span>
                </div>
              </div>

              <div className="text-right">
                <span className="font-black text-pink-700 text-base sm:text-lg">
                  {(Number(totalCalculation?.suggestedPrice) || 0).toLocaleString('vi-VN')}₫
                </span>
              </div>
            </div>
          )}

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
