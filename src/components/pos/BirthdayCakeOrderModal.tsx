// src/components/pos/BirthdayCakeOrderModal.tsx
// Modal Đặt Bánh Sinh Nhật Theo Cơ Chế Mới (Flowchart Excel)
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
} from '@/lib/types/bakery-bom';
import {
  getFullCakeBomConfig,
  calculateCakeCostDetails,
  buildCakeOrderSpec,
} from '@/lib/utils/cakeBomManager';
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
} from 'lucide-react';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';

interface BirthdayCakeOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: any;
  onConfirmOrder: (orderPayload: any) => void;
}

export function BirthdayCakeOrderModal({
  isOpen,
  onClose,
  product,
  onConfirmOrder,
}: BirthdayCakeOrderModalProps) {
  const [config, setConfig] = useState<FullCakeBomConfig>(() => getFullCakeBomConfig());

  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  const [selectedBaseId, setSelectedBaseId] = useState<string>('');
  const [selectedBaseSizeId, setSelectedBaseSizeId] = useState<string>('');
  const [selectedCreamId, setSelectedCreamId] = useState<string>('');
  const [selectedCreamSizeId, setSelectedCreamSizeId] = useState<string>('');
  const [selectedFillingId, setSelectedFillingId] = useState<string>('');
  const [selectedPackagingId, setSelectedPackagingId] = useState<string>('');
  const [selectedFreeAccessoryIds, setSelectedFreeAccessoryIds] = useState<string[]>([]);
  const [selectedDecorAddonIds, setSelectedDecorAddonIds] = useState<string[]>([]);

  const [customMarkupPct, setCustomMarkupPct] = useState<number>(36.5);
  const [finalPriceInput, setFinalPriceInput] = useState<number>(0);

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
  const [cakeMessage, setCakeMessage] = useState('');
  const [decorNotes, setDecorNotes] = useState('');

  useEffect(() => {
    const currentConfig = getFullCakeBomConfig();
    setConfig(currentConfig);
    setCustomMarkupPct(currentConfig.targetFoodCostPct || 36.5);

    const defaultPreset =
      (product?.bom_preset_id && currentConfig.birthdayBomPresets.find((p) => p.id === product.bom_preset_id)) ||
      currentConfig.birthdayBomPresets[0];

    if (defaultPreset) {
      applyPreset(defaultPreset, currentConfig);
    } else {
      applyDefaultCustom(currentConfig);
    }
  }, [product, isOpen]);

  const applyPreset = (preset: BirthdayCakeBomPreset, currentConfig: FullCakeBomConfig) => {
    setSelectedPresetId(preset.id);
    setSelectedBaseId(preset.cakeBaseId);
    setSelectedBaseSizeId(preset.cakeBaseSizeId);
    setSelectedCreamId(preset.creamCoatingId);
    setSelectedCreamSizeId(preset.creamCoatingSizeId);
    setSelectedFillingId(preset.fillingId || currentConfig.fillings[0]?.id || '');
    setSelectedPackagingId(preset.packagingId || currentConfig.packagings[0]?.id || '');
    setSelectedFreeAccessoryIds(preset.freeAccessoryIds || []);
    setSelectedDecorAddonIds(preset.decorAddonIds || []);
  };

  const applyDefaultCustom = (currentConfig: FullCakeBomConfig) => {
    const base = currentConfig.cakeBases[0];
    const cream = currentConfig.creamCoatings[0];
    setSelectedBaseId(base?.id || '');
    setSelectedBaseSizeId(base?.sizes[0]?.id || '');
    setSelectedCreamId(cream?.id || '');
    setSelectedCreamSizeId(cream?.sizes[0]?.id || '');
    setSelectedFillingId(currentConfig.fillings[0]?.id || '');
    setSelectedPackagingId(currentConfig.packagings[0]?.id || '');
    setSelectedFreeAccessoryIds(currentConfig.freeAccessories.filter((a) => a.isDefaultIncluded).map((a) => a.id));
    setSelectedDecorAddonIds([]);
  };

  const costResult = useMemo(() => {
    if (!selectedBaseId || !selectedBaseSizeId) {
      return { totalCost: 0, suggestedPrice: 0, baseCost: 0, creamCost: 0, fillingCost: 0, packagingCost: 0, freeAccessoriesCost: 0, decorCost: 0, markupPctUsed: 36.5 };
    }
    return calculateCakeCostDetails(
      {
        cakeBaseId: selectedBaseId,
        cakeBaseSizeId: selectedBaseSizeId,
        creamCoatingId: selectedCreamId,
        creamCoatingSizeId: selectedCreamSizeId,
        fillingId: selectedFillingId,
        packagingId: selectedPackagingId,
        freeAccessoryIds: selectedFreeAccessoryIds,
        decorAddonIds: selectedDecorAddonIds,
        customMarkupPct: customMarkupPct,
      },
      config
    );
  }, [
    selectedBaseId,
    selectedBaseSizeId,
    selectedCreamId,
    selectedCreamSizeId,
    selectedFillingId,
    selectedPackagingId,
    selectedFreeAccessoryIds,
    selectedDecorAddonIds,
    customMarkupPct,
    config,
  ]);

  useEffect(() => {
    if (costResult.suggestedPrice > 0) {
      setFinalPriceInput(costResult.suggestedPrice);
    }
  }, [costResult.suggestedPrice]);

  if (!isOpen) return null;

  const currentBase = config.cakeBases.find((b) => b.id === selectedBaseId);
  const currentCream = config.creamCoatings.find((c) => c.id === selectedCreamId);
  const cakeStock = product?.stock_qty ?? 0;
  const hasStock = cakeStock > 0;

  const handleConfirm = () => {
    if (finalPriceInput <= 0) {
      alert('Vui lòng nhập giá bán hợp lệ!');
      return;
    }

    const orderSpec: CakeOrderSpec = buildCakeOrderSpec(
      {
        cakeBaseId: selectedBaseId,
        cakeBaseSizeId: selectedBaseSizeId,
        creamCoatingId: selectedCreamId,
        creamCoatingSizeId: selectedCreamSizeId,
        fillingId: selectedFillingId,
        packagingId: selectedPackagingId,
        freeAccessoryIds: selectedFreeAccessoryIds,
        decorAddonIds: selectedDecorAddonIds,
        customMarkupPct: customMarkupPct,
        finalPrice: finalPriceInput,
        cakeMessage: cakeMessage,
        decorNotes: decorNotes,
        bomPresetId: mode === 'preset' ? selectedPresetId : undefined,
      },
      config
    );

    const initialStatus = hasStock ? 'ready' : 'pending';

    const orderPayload = {
      product: {
        id: product?.id || 'birthday-cake-' + Date.now(),
        name: product?.name || 'Bánh Sinh Nhật Đặt Theo Yêu Cầu',
        selling_price: finalPriceInput,
        cake_type_label: 'birthday',
      },
      cakeOrderSpec: orderSpec,
      customerName: customerName || 'Khách Đặt Bánh Sinh Nhật',
      customerPhone,
      pickupDateTime: `${pickupDate}T${pickupTime}`,
      orderDeliveryType,
      deliveryAddress: orderDeliveryType === 'ship' ? deliveryAddress : undefined,
      finalPrice: finalPriceInput,
      initialKdsStatus: initialStatus,
      hasStock: hasStock,
    };

    onConfirmOrder(orderPayload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-pink-200 p-5 space-y-4 max-h-[95vh] flex flex-col animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-pink-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-600 to-rose-500 text-white flex items-center justify-center shadow-md shadow-pink-500/30">
              <Cake className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base text-zinc-900 flex items-center gap-2">
                <span>Đặt Bánh Sinh Nhật Mới</span>
                {product?.name && (
                  <span className="text-xs text-pink-700 font-bold px-2.5 py-0.5 rounded-full bg-pink-50 border border-pink-200">
                    {product.name}
                  </span>
                )}
              </h3>
              <p className="text-xs text-zinc-500">
                Định mức BOM tự động tính giá cost & gợi ý giá bán chuẩn xác theo flowchart tiệm bánh.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* THÔNG BÁO TỒN KHO THEO FLOWCHART */}
        <div
          className={`p-3 rounded-2xl flex items-center justify-between text-xs font-bold ${
            hasStock
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border border-amber-200 text-amber-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 shrink-0" />
            <span>
              Tồn kho tiệm: <b>{hasStock ? `Còn ${cakeStock} cái có sẵn` : 'Hết tồn kho (0 cái)'}</b>
            </span>
          </div>
          <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-white/80 shadow-2xs">
            {hasStock
              ? '⚡ Có tồn: Đơn tự động nhảy sang Bước 3 (Chờ Ship / Sẵn Sàng)'
              : '👨‍🍳 Hết tồn: Đơn tự động nhả vào Bếp để thợ làm bánh'}
          </span>
        </div>

        {/* CHỌN NHÁNH */}
        <div className="flex items-center gap-2 bg-pink-50/60 p-1 rounded-2xl border border-pink-200">
          <button
            type="button"
            onClick={() => setMode('preset')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'preset'
                ? 'bg-pink-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/60'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Nhánh 1: Chọn BOM Bánh Có Sẵn (Preset)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('custom')}
            className={`flex-1 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
              mode === 'custom'
                ? 'bg-pink-600 text-white shadow-xs'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/60'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Nhánh 2: Chọn Loại Bánh Tùy Chọn (Custom Từng Món)</span>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {mode === 'preset' && (
            <div className="space-y-2 bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
              <label className="font-black text-zinc-900 text-xs flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5 text-pink-600" />
                <span>Chọn Mẫu BOM Sinh Nhật Chuẩn:</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {config.birthdayBomPresets.map((preset) => {
                  const isSel = selectedPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset, config)}
                      className={`p-3 rounded-2xl text-left border transition cursor-pointer active:scale-95 ${
                        isSel
                          ? 'bg-pink-50 border-pink-600 ring-2 ring-pink-200 text-pink-900 shadow-xs'
                          : 'bg-white border-zinc-200 text-zinc-700 hover:border-pink-300'
                      }`}
                    >
                      <div className="font-bold text-xs line-clamp-1">{preset.name}</div>
                      <div className="text-[11px] text-zinc-500 mt-1 line-clamp-1">{preset.notes}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 1. CỐT BÁNH & SIZE */}
          <div className="p-3.5 rounded-2xl bg-pink-50/40 border border-pink-200 space-y-2.5">
            <span className="font-black text-xs text-pink-900 flex items-center gap-1.5">
              <Cake className="w-4 h-4 text-pink-600" />
              <span>1. Chọn Cốt Bánh & Kích Thước (Size)</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="font-bold text-zinc-600 block mb-1">Loại Cốt Bánh:</label>
                <select
                  value={selectedBaseId}
                  onChange={(e) => {
                    setSelectedBaseId(e.target.value);
                    const b = config.cakeBases.find((x) => x.id === e.target.value);
                    if (b && b.sizes[0]) setSelectedBaseSizeId(b.sizes[0].id);
                  }}
                  className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold"
                >
                  {config.cakeBases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-600 block mb-1">Size Cốt Bánh:</label>
                <select
                  value={selectedBaseSizeId}
                  onChange={(e) => setSelectedBaseSizeId(e.target.value)}
                  className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold text-pink-800"
                >
                  {currentBase?.sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sizeName} — Vốn: {s.baseCost.toLocaleString('vi-VN')}₫
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 2. KEM PHỦ & SIZE */}
          <div className="p-3.5 rounded-2xl bg-pink-50/40 border border-pink-200 space-y-2.5">
            <span className="font-black text-xs text-pink-900 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-pink-600" />
              <span>2. Chọn Loại Kem Phủ & Size Kem</span>
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="font-bold text-zinc-600 block mb-1">Loại Kem Phủ:</label>
                <select
                  value={selectedCreamId}
                  onChange={(e) => {
                    setSelectedCreamId(e.target.value);
                    const c = config.creamCoatings.find((x) => x.id === e.target.value);
                    if (c && c.sizes[0]) setSelectedCreamSizeId(c.sizes[0].id);
                  }}
                  className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold"
                >
                  {config.creamCoatings.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-600 block mb-1">Size Kem Phủ:</label>
                <select
                  value={selectedCreamSizeId}
                  onChange={(e) => setSelectedCreamSizeId(e.target.value)}
                  className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold text-pink-800"
                >
                  {currentCream?.sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.sizeName} — Vốn: {s.baseCost.toLocaleString('vi-VN')}₫
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 3. NHÂN BÁNH, HỘP */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-1.5">
              <span className="font-bold text-zinc-900 flex items-center gap-1">
                <Utensils className="w-3.5 h-3.5 text-pink-600" /> 3. Nhân Bánh:
              </span>
              <select
                value={selectedFillingId}
                onChange={(e) => setSelectedFillingId(e.target.value)}
                className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold"
              >
                {config.fillings.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.extraPrice > 0 ? `(+ ${f.extraPrice.toLocaleString('vi-VN')}₫)` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-1.5">
              <span className="font-bold text-zinc-900 flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-pink-600" /> 4. Hộp & Bao Bì:
              </span>
              <select
                value={selectedPackagingId}
                onChange={(e) => setSelectedPackagingId(e.target.value)}
                className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold"
              >
                {config.packagings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.sellingPrice > 0 ? `(+ ${p.sellingPrice.toLocaleString('vi-VN')}₫)` : '(Tiêu chuẩn)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 5. VẬT TƯ TẶNG KÈM MẶC ĐỊNH */}
          <div className="p-3 bg-rose-50/40 rounded-2xl border border-rose-200 space-y-2">
            <span className="font-bold text-rose-900 text-xs flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5 text-rose-600" />
              <span>5. Vật Tư Tặng Kèm (Mặc định trong bánh sinh nhật):</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {config.freeAccessories.map((acc) => {
                const isChecked = selectedFreeAccessoryIds.includes(acc.id);
                return (
                  <label
                    key={acc.id}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 cursor-pointer transition ${
                      isChecked
                        ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                        : 'bg-white text-zinc-600 border-zinc-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFreeAccessoryIds([...selectedFreeAccessoryIds, acc.id]);
                        } else {
                          setSelectedFreeAccessoryIds(selectedFreeAccessoryIds.filter((id) => id !== acc.id));
                        }
                      }}
                      className="hidden"
                    />
                    <span>🎁 {acc.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* 6. PHỤ KIỆN & DECOR */}
          <div className="p-3 bg-pink-50/40 rounded-2xl border border-pink-200 space-y-2">
            <span className="font-bold text-pink-900 text-xs flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-pink-600" />
              <span>6. Phụ Kiện Decor Thêm:</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {config.decorAddons.map((dec) => {
                const isSelected = selectedDecorAddonIds.includes(dec.id);
                return (
                  <button
                    key={dec.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDecorAddonIds(selectedDecorAddonIds.filter((id) => id !== dec.id));
                      } else {
                        setSelectedDecorAddonIds([...selectedDecorAddonIds, dec.id]);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-pink-600 text-white border-pink-600 shadow-2xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:border-pink-300'
                    }`}
                  >
                    <span>{dec.icon || '✨'}</span>
                    <span>{dec.name}</span>
                    <span className={`text-[10px] ${isSelected ? 'text-pink-100' : 'text-pink-700 font-black'}`}>
                      +{dec.sellingPrice.toLocaleString('vi-VN')}₫
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* THÔNG TIN KHÁCH HÀNG & GIAO BÁNH */}
          <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-3 text-xs">
            <span className="font-bold text-zinc-900 block">Thông Tin Khách Đặt & Giao Nhận Bánh:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Tên khách hàng *"
                className="p-2 rounded-xl bg-white border border-zinc-200 font-bold"
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Số điện thoại khách *"
                className="p-2 rounded-xl bg-white border border-zinc-200 font-bold"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="font-semibold text-zinc-500 block mb-1">Ngày lấy bánh:</label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold"
                />
              </div>
              <div>
                <label className="font-semibold text-zinc-500 block mb-1">Giờ lấy:</label>
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold"
                />
              </div>
              <div>
                <label className="font-semibold text-zinc-500 block mb-1">Hình thức nhận:</label>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setOrderDeliveryType('store')}
                    className={`flex-1 py-1.5 rounded-lg font-bold border transition ${
                      orderDeliveryType === 'store'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-zinc-600 border-zinc-200'
                    }`}
                  >
                    Tại quầy
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderDeliveryType('ship')}
                    className={`flex-1 py-1.5 rounded-lg font-bold border transition ${
                      orderDeliveryType === 'ship'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-zinc-600 border-zinc-200'
                    }`}
                  >
                    Đơn ship
                  </button>
                </div>
              </div>
            </div>

            {orderDeliveryType === 'ship' && (
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Địa chỉ giao bánh chi tiết *"
                className="w-full p-2 rounded-xl bg-white border border-blue-200 font-bold text-zinc-900"
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={cakeMessage}
                onChange={(e) => setCakeMessage(e.target.value)}
                placeholder="Chữ viết lên bánh (VD: Chúc Mừng Sinh Nhật Bé Bo 3 Tuổi)..."
                className="p-2 rounded-xl bg-white border border-pink-200 font-bold text-pink-900"
              />
              <input
                type="text"
                value={decorNotes}
                onChange={(e) => setDecorNotes(e.target.value)}
                placeholder="Ghi chú thợ trang trí (Tone màu xanh, ít ngọt, nến số 3)..."
                className="p-2 rounded-xl bg-white border border-zinc-200"
              />
            </div>
          </div>
        </div>

        {/* ── BẢNG TÍNH GIÁ COST TẤT CẢ & GIÁ BÁN GỢI Ý ── */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs text-zinc-600">
              <div>
                Cốt: <b className="text-zinc-900">{costResult.baseCost.toLocaleString('vi-VN')}₫</b>
              </div>
              <div>
                Kem: <b className="text-zinc-900">{costResult.creamCost.toLocaleString('vi-VN')}₫</b>
              </div>
              <div>
                Nhân: <b className="text-zinc-900">{costResult.fillingCost.toLocaleString('vi-VN')}₫</b>
              </div>
              <div>
                Hộp: <b className="text-zinc-900">{costResult.packagingCost.toLocaleString('vi-VN')}₫</b>
              </div>
              <div>
                Quà: <b className="text-zinc-900">{costResult.freeAccessoriesCost.toLocaleString('vi-VN')}₫</b>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div>
                <span className="text-[10px] text-zinc-500 block">Tổng Cost BOM:</span>
                <span className="font-black text-rose-600 text-sm">
                  {costResult.totalCost.toLocaleString('vi-VN')}₫
                </span>
              </div>

              <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-xl border border-pink-200">
                <span className="text-[10px] text-pink-700 font-bold">Markup:</span>
                <input
                  type="number"
                  step="0.5"
                  value={customMarkupPct}
                  onChange={(e) => setCustomMarkupPct(parseFloat(e.target.value) || 36.5)}
                  className="w-12 text-center font-black text-xs text-pink-700 bg-pink-50 rounded py-0.5 border-none focus:outline-none"
                  title="Nhập tỷ lệ mong muốn (mặc định mốc 36.5%)"
                />
                <span className="text-[10px] text-zinc-500">%</span>
              </div>

              <div className="pl-3 border-l border-zinc-200">
                <span className="text-[10px] text-pink-700 font-bold block">
                  Giá Gợi Ý (~{customMarkupPct}%):
                </span>
                <span className="font-black text-pink-700 text-sm">
                  {costResult.suggestedPrice.toLocaleString('vi-VN')}₫
                </span>
              </div>
            </div>
          </div>

          {/* CHỐT GIÁ BÁN & HOÀN THÀNH ĐƠN ĐẶT HÀNG */}
          <div className="pt-3 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-zinc-900">Chốt Giá Bán Cuối Cùng (VND) *:</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrencyInput(finalPriceInput)}
                onChange={(e) => setFinalPriceInput(parseCurrencyInput(e.target.value))}
                className="w-36 px-3 py-1.5 rounded-xl border-2 border-pink-500 bg-white font-black text-base text-pink-700 focus:outline-none text-center shadow-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-bold text-xs cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white font-black text-xs shadow-md shadow-pink-600/30 flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Chốt Giá & Đặt Bánh Vào Hệ Thống</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
