// src/components/admin/CustomCakeCostingSettings.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  CustomCakeCostingConfig,
  CakeSizeOption,
  CakeSizeBomItem,
  CakeFlavorOption,
  CakeCreamOption,
  CakeFillingOption,
  CakePackagingOption,
  CakeAddonOption,
  DEFAULT_CUSTOM_CAKE_CONFIG,
  DEFAULT_CAKE_FILLINGS,
} from '@/lib/constants/cakeCostingData';
import {
  getCakeCostingConfig,
  saveCakeCostingConfig,
  resetCakeCostingConfig,
  fetchCakeCostingFromDb,
} from '@/lib/utils/customCakeCosting';
import { supabase } from '@/lib/supabase/client';
import {
  Cake,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  CheckCircle2,
  Sparkles,
  Package,
  Layers,
  Sliders,
  X,
  Utensils,
  Calculator,
} from 'lucide-react';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';

export function CustomCakeCostingSettings() {
  const [config, setConfig] = useState<CustomCakeCostingConfig>(() => getCakeCostingConfig());
  const [activeSubTab, setActiveSubTab] = useState<'sizes' | 'flavors_creams' | 'fillings' | 'packagings' | 'addons'>('sizes');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [availableIngredients, setAvailableIngredients] = useState<any[]>([]);
  const [editingBomSize, setEditingBomSize] = useState<{ index: number; size: CakeSizeOption } | null>(null);

  useEffect(() => {
    fetchCakeCostingFromDb().then((remote) => {
      if (remote) setConfig(remote);
    });

    const loadIngredients = async () => {
      try {
        const { data: dbIngs } = await supabase.from('ingredients').select('id, name, unit, avg_cost');
        if (dbIngs && dbIngs.length > 0) {
          setAvailableIngredients(dbIngs);
          return;
        }
      } catch {}
      try {
        const local = localStorage.getItem('bakery_ingredients');
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setAvailableIngredients(parsed);
          }
        }
      } catch {}
    };
    loadIngredients();
  }, []);

  const handleSave = () => {
    saveCakeCostingConfig(config);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  const handleReset = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục toàn bộ bảng định mức bánh sinh nhật về mặc định ban đầu?')) {
      const def = resetCakeCostingConfig();
      setConfig(def);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // --- HANDLERS CHO SIZES ---
  const handleUpdateSize = (index: number, field: keyof CakeSizeOption, value: any) => {
    const updatedSizes = [...config.sizes];
    updatedSizes[index] = { ...updatedSizes[index], [field]: value };
    setConfig({ ...config, sizes: updatedSizes });
  };

  const handleAddSize = () => {
    const newSize: CakeSizeOption = {
      id: 'size-' + Date.now(),
      name: 'Size mới 24cm',
      diameterCm: 24,
      servings: '16 - 20 người',
      baseCost: 190000,
      suggestedPrice: 650000,
      bomIngredients: [
        { name: 'Trứng gà tươi', quantity: 6, unit: 'quả', unitCost: 3500 },
        { name: 'Bột mì số 8 chuyên dụng', quantity: 200, unit: 'g', unitCost: 40 },
        { name: 'Đường cát tinh luyện', quantity: 180, unit: 'g', unitCost: 30 },
        { name: 'Sữa tươi & Bơ lạt Anchor', quantity: 150, unit: 'ml', unitCost: 150 },
        { name: 'Kem Whipping & Topping phết nền', quantity: 450, unit: 'ml', unitCost: 190 },
      ],
    };
    const totalBom = newSize.bomIngredients!.reduce((sum, it) => sum + (it.quantity * it.unitCost), 0);
    if (totalBom > 0) newSize.baseCost = totalBom;
    setConfig({ ...config, sizes: [...config.sizes, newSize] });
  };

  const handleDeleteSize = (index: number) => {
    if (config.sizes.length <= 1) {
      alert('Phải giữ lại ít nhất 1 kích thước bánh!');
      return;
    }
    const updatedSizes = config.sizes.filter((_, i) => i !== index);
    setConfig({ ...config, sizes: updatedSizes });
  };

  // --- HANDLERS CHO BOM MODAL ---
  const handleOpenBomModal = (index: number, size: CakeSizeOption) => {
    const clonedSize = JSON.parse(JSON.stringify(size));
    if (!clonedSize.bomIngredients || clonedSize.bomIngredients.length === 0) {
      clonedSize.bomIngredients = [
        { name: 'Trứng gà tươi', quantity: 4, unit: 'quả', unitCost: 3500 },
        { name: 'Bột mì làm bánh', quantity: 150, unit: 'g', unitCost: 40 },
        { name: 'Đường cát trắng', quantity: 120, unit: 'g', unitCost: 30 },
        { name: 'Kem tươi phết nền', quantity: 250, unit: 'ml', unitCost: 180 },
      ];
    }
    setEditingBomSize({ index, size: clonedSize });
  };

  const handleAddBomItem = () => {
    if (!editingBomSize) return;
    const newItem: CakeSizeBomItem = {
      name: '',
      quantity: 100,
      unit: 'g',
      unitCost: 50,
    };
    const updatedBom = [...(editingBomSize.size.bomIngredients || []), newItem];
    setEditingBomSize({
      ...editingBomSize,
      size: { ...editingBomSize.size, bomIngredients: updatedBom },
    });
  };

  const handleUpdateBomItem = (itemIdx: number, field: keyof CakeSizeBomItem, value: any) => {
    if (!editingBomSize) return;
    const updatedBom = [...(editingBomSize.size.bomIngredients || [])];
    updatedBom[itemIdx] = { ...updatedBom[itemIdx], [field]: value };
    setEditingBomSize({
      ...editingBomSize,
      size: { ...editingBomSize.size, bomIngredients: updatedBom },
    });
  };

  const handleSelectIngredientForBom = (itemIdx: number, ingredientId: string) => {
    if (!editingBomSize) return;
    const found = availableIngredients.find((i) => i.id === ingredientId);
    if (!found) return;

    const updatedBom = [...(editingBomSize.size.bomIngredients || [])];
    updatedBom[itemIdx] = {
      ...updatedBom[itemIdx],
      ingredientId: found.id,
      name: found.name,
      unit: found.unit || 'g',
      unitCost: Number(found.avg_cost) || updatedBom[itemIdx].unitCost || 0,
    };
    setEditingBomSize({
      ...editingBomSize,
      size: { ...editingBomSize.size, bomIngredients: updatedBom },
    });
  };

  const handleDeleteBomItem = (itemIdx: number) => {
    if (!editingBomSize) return;
    const updatedBom = (editingBomSize.size.bomIngredients || []).filter((_, i) => i !== itemIdx);
    setEditingBomSize({
      ...editingBomSize,
      size: { ...editingBomSize.size, bomIngredients: updatedBom },
    });
  };

  const handleSaveBomToSize = () => {
    if (!editingBomSize) return;
    const bom = editingBomSize.size.bomIngredients || [];
    const calculatedBaseCost = bom.reduce((sum, it) => sum + (Number(it.quantity || 0) * Number(it.unitCost || 0)), 0);

    const updatedSizes = [...config.sizes];
    updatedSizes[editingBomSize.index] = {
      ...updatedSizes[editingBomSize.index],
      bomIngredients: bom,
      baseCost: calculatedBaseCost > 0 ? calculatedBaseCost : updatedSizes[editingBomSize.index].baseCost,
    };

    setConfig({ ...config, sizes: updatedSizes });
    setEditingBomSize(null);
  };

  // --- HANDLERS CHO FILLINGS (NHÂN BÁNH SINH NHẬT) ---
  const currentFillings = config.fillings && config.fillings.length > 0 ? config.fillings : DEFAULT_CAKE_FILLINGS;

  const handleUpdateFilling = (index: number, field: keyof CakeFillingOption, value: any) => {
    const list = [...currentFillings];
    list[index] = { ...list[index], [field]: value };
    setConfig({ ...config, fillings: list });
  };

  const handleAddFilling = () => {
    const item: CakeFillingOption = {
      id: 'fill-' + Date.now(),
      name: 'Nhân mứt mới',
      extraCost: 15000,
      extraPrice: 30000,
      icon: '🍓',
    };
    setConfig({ ...config, fillings: [...currentFillings, item] });
  };

  const handleDeleteFilling = (index: number) => {
    if (currentFillings.length <= 1) {
      alert('Phải giữ lại ít nhất 1 loại nhân (hoặc Không nhân)!');
      return;
    }
    setConfig({ ...config, fillings: currentFillings.filter((_, i) => i !== index) });
  };

  // --- HANDLERS CHO FLAVORS & CREAMS ---
  const handleUpdateFlavor = (index: number, field: keyof CakeFlavorOption, value: any) => {
    const updated = [...config.flavors];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, flavors: updated });
  };

  const handleAddFlavor = () => {
    const item: CakeFlavorOption = {
      id: 'flavor-' + Date.now(),
      name: 'Cốt bánh mới',
      extraCost: 15000,
      extraPrice: 30000,
      icon: '🎂',
    };
    setConfig({ ...config, flavors: [...config.flavors, item] });
  };

  const handleDeleteFlavor = (index: number) => {
    if (config.flavors.length <= 1) return;
    setConfig({ ...config, flavors: config.flavors.filter((_, i) => i !== index) });
  };

  const handleUpdateCream = (index: number, field: keyof CakeCreamOption, value: any) => {
    const updated = [...config.creams];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, creams: updated });
  };

  const handleAddCream = () => {
    const item: CakeCreamOption = {
      id: 'cream-' + Date.now(),
      name: 'Loại kem mới',
      extraCost: 20000,
      extraPrice: 35000,
      icon: '🍦',
    };
    setConfig({ ...config, creams: [...config.creams, item] });
  };

  const handleDeleteCream = (index: number) => {
    if (config.creams.length <= 1) return;
    setConfig({ ...config, creams: config.creams.filter((_, i) => i !== index) });
  };

  // --- HANDLERS CHO PACKAGINGS ---
  const handleUpdatePackaging = (index: number, field: keyof CakePackagingOption, value: any) => {
    const updated = [...config.packagings];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, packagings: updated });
  };

  const handleAddPackaging = () => {
    const item: CakePackagingOption = {
      id: 'pack-' + Date.now(),
      name: 'Hộp bánh mới',
      extraCost: 20000,
      extraPrice: 35000,
      icon: '📦',
    };
    setConfig({ ...config, packagings: [...config.packagings, item] });
  };

  const handleDeletePackaging = (index: number) => {
    if (config.packagings.length <= 1) return;
    setConfig({ ...config, packagings: config.packagings.filter((_, i) => i !== index) });
  };

  // --- HANDLERS CHO ADDONS ---
  const handleUpdateAddon = (index: number, field: keyof CakeAddonOption, value: any) => {
    const updated = [...config.addons];
    updated[index] = { ...updated[index], [field]: value };
    setConfig({ ...config, addons: updated });
  };

  const handleAddAddon = () => {
    const item: CakeAddonOption = {
      id: 'addon-' + Date.now(),
      name: 'Phụ kiện mới',
      category: 'other',
      cost: 20000,
      price: 35000,
      icon: '🎁',
    };
    setConfig({ ...config, addons: [...config.addons, item] });
  };

  const handleDeleteAddon = (index: number) => {
    setConfig({ ...config, addons: config.addons.filter((_, i) => i !== index) });
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-pink-200 shadow-sm space-y-6 text-zinc-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-pink-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-pink-100 text-pink-600 flex items-center justify-center shadow-xs">
            <Cake className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg sm:text-xl text-zinc-900">
                Tùy Chọn Định Mức Bánh Đặt (Size & Phụ Kiện)
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-pink-50 text-pink-700 border border-pink-200 uppercase">
                Costing Engine
              </span>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Cài đặt chi phí vốn và giá bán gợi ý cho từng kích thước, cốt bánh, kem, hộp và phụ kiện trang trí khi khách đặt bánh sinh nhật.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:text-zinc-800 bg-zinc-100 hover:bg-zinc-200 transition flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Khôi Phục Mặc Định
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-black text-white bg-pink-600 hover:bg-pink-700 active:scale-95 shadow-md shadow-pink-200 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" /> Lưu Cài Đặt
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold flex items-center justify-between animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Đã lưu thành công định mức chi phí bánh sinh nhật! Toàn bộ Quầy POS và Bếp đã được cập nhật tức thì.</span>
          </div>
        </div>
      )}

      {/* Target Food Cost Setting Bar */}
      <div className="bg-pink-50/60 rounded-2xl p-4 border border-pink-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-pink-600 shrink-0" />
          <div>
            <span className="font-bold text-xs text-zinc-900 block">Tỷ Lệ Chi Phí Vốn Mục Tiêu (Target Food Cost %):</span>
            <span className="text-[11px] text-zinc-500">
              Tỷ lệ lý tưởng của tiệm bánh ngọt là 28% - 35% giá bán (giúp tiệm luôn đạt tỷ suất lợi nhuận gộp 65% - 72%).
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="15"
            max="60"
            value={config.targetFoodCostPct}
            onChange={(e) => setConfig({ ...config, targetFoodCostPct: Math.max(15, Math.min(60, Number(e.target.value) || 33)) })}
            className="w-20 p-2 text-center rounded-xl bg-white border border-pink-300 font-black text-pink-700 text-sm"
          />
          <span className="font-black text-pink-800 text-sm">%</span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-zinc-100 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('sizes')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'sizes'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Cake className="w-3.5 h-3.5" /> 1. Kích Thước Bánh & BOM ({config.sizes.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('flavors_creams')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'flavors_creams'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> 2. Cốt Bánh & Kem ({config.flavors.length + config.creams.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('fillings')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'fillings'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Utensils className="w-3.5 h-3.5" /> 3. Nhân Bánh ({currentFillings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('packagings')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'packagings'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" /> 4. Hộp & Bao Bì ({config.packagings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('addons')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'addons'
              ? 'bg-pink-600 text-white shadow-xs'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> 5. Phụ Kiện & Decor ({config.addons.length})
        </button>
      </div>

      {/* SUB-TAB 1: SIZES & BOM */}
      {activeSubTab === 'sizes' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-black text-sm text-zinc-900">Bảng Định Mức Vốn BOM & Giá Gợi Ý Theo Kích Thước</h4>
              <p className="text-[11px] text-zinc-500">
                Thay vì nhập số tiền vốn thủ công, bạn bấm <strong>&ldquo;Cài đặt BOM&rdquo;</strong> để nhập công thức làm cốt bánh. Hệ thống sẽ tự động tính chính xác giá vốn.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddSize}
              className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Size
            </button>
          </div>

          <div className="overflow-x-auto border border-zinc-200 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 text-zinc-600 font-bold border-b border-zinc-200">
                <tr>
                  <th className="p-3">Tên Size & Phục Vụ</th>
                  <th className="p-3 text-center">Đường kính (cm)</th>
                  <th className="p-3 text-right text-rose-700">Chi Phí Vốn Cốt Bánh (BOM)</th>
                  <th className="p-3 text-right text-emerald-700">Giá Bán Đề Xuất (VND)</th>
                  <th className="p-3 text-center">Tỷ lệ Food Cost</th>
                  <th className="p-3 text-center w-12">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {config.sizes.map((s, idx) => {
                  const fc = s.suggestedPrice > 0 ? ((s.baseCost / s.suggestedPrice) * 100).toFixed(1) : '0';
                  const bomCount = s.bomIngredients?.length || 0;

                  return (
                    <tr key={s.id} className="hover:bg-pink-50/40 transition">
                      <td className="p-2.5 min-w-[200px]">
                        <input
                          type="text"
                          value={s.name}
                          onChange={(e) => handleUpdateSize(idx, 'name', e.target.value)}
                          className="w-full p-1.5 rounded-lg border border-zinc-200 font-bold text-zinc-900"
                        />
                      </td>
                      <td className="p-2.5 text-center min-w-[90px]">
                        <input
                          type="number"
                          value={s.diameterCm}
                          onChange={(e) => handleUpdateSize(idx, 'diameterCm', Number(e.target.value) || 0)}
                          className="w-16 p-1.5 text-center rounded-lg border border-zinc-200 font-bold"
                        />
                      </td>
                      <td className="p-2.5 text-right min-w-[200px]">
                        <div className="flex items-center justify-end gap-2">
                          <div className="text-right">
                            <span className="font-black text-rose-700 block text-xs">
                              {s.baseCost.toLocaleString('vi-VN')} đ
                            </span>
                            <span className="text-[10px] text-zinc-400 font-medium">
                              {bomCount > 0 ? `${bomCount} nguyên liệu BOM` : 'Chưa có BOM'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenBomModal(idx, s)}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs flex items-center gap-1 transition shadow-2xs cursor-pointer shrink-0"
                            title="Cài đặt công thức nguyên liệu BOM cho size này"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                            <span>Cài đặt BOM</span>
                          </button>
                        </div>
                      </td>
                      <td className="p-2.5 text-right min-w-[140px]">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(s.suggestedPrice)}
                          onChange={(e) => handleUpdateSize(idx, 'suggestedPrice', parseCurrencyInput(e.target.value))}
                          className="w-32 p-1.5 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 bg-emerald-50/40"
                        />
                      </td>
                      <td className="p-2.5 text-center font-bold text-zinc-600">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                          Number(fc) > 40 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {fc}%
                        </span>
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteSize(idx)}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: FLAVORS & CREAMS */}
      {activeSubTab === 'flavors_creams' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* CỐT BÁNH */}
          <div className="space-y-3 p-4 rounded-2xl border border-zinc-200 bg-zinc-50/50">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-sm text-zinc-900">Cốt Bánh (Vani, Socola, Matcha...)</h4>
                <p className="text-[10px] text-zinc-500">Chi phí nguyên liệu thêm và phụ thu cho từng loại cốt.</p>
              </div>
              <button
                type="button"
                onClick={handleAddFlavor}
                className="px-2.5 py-1 rounded-lg bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Thêm Cốt
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {config.flavors.map((f, idx) => (
                <div key={f.id} className="p-3 bg-white rounded-2xl border border-zinc-200 space-y-2 hover:border-pink-300 transition shadow-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={f.icon || '🎂'}
                      onChange={(e) => handleUpdateFlavor(idx, 'icon', e.target.value)}
                      className="w-9 p-1 text-center rounded-lg border border-zinc-200 text-sm shrink-0"
                      title="Biểu tượng cốt bánh"
                    />
                    <input
                      type="text"
                      placeholder="Tên loại cốt bánh (vd: Cốt Vani, Cốt Socola...)"
                      value={f.name}
                      onChange={(e) => handleUpdateFlavor(idx, 'name', e.target.value)}
                      className="flex-1 min-w-0 p-1.5 rounded-lg border border-zinc-200 font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-pink-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteFlavor(idx)}
                      className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg transition cursor-pointer shrink-0"
                      title="Xóa loại cốt này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-xs">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[10px] text-rose-600 font-bold shrink-0">Giá Vốn:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInput(f.extraCost)}
                        onChange={(e) => handleUpdateFlavor(idx, 'extraCost', parseCurrencyInput(e.target.value))}
                        className="w-full p-1 text-right rounded-lg border border-rose-200 font-bold text-rose-700 bg-rose-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                      />
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[10px] text-emerald-600 font-bold shrink-0">Phụ Thu:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInput(f.extraPrice)}
                        onChange={(e) => handleUpdateFlavor(idx, 'extraPrice', parseCurrencyInput(e.target.value))}
                        className="w-full p-1 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 bg-emerald-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* LOẠI KEM */}
          <div className="space-y-3 p-4 rounded-2xl border border-zinc-200 bg-zinc-50/50">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-black text-sm text-zinc-900">Loại Kem (Topping, Whipping, Phô mai...)</h4>
                <p className="text-[10px] text-zinc-500">Chi phí kem cao cấp và mức phụ thu đối với khách.</p>
              </div>
              <button
                type="button"
                onClick={handleAddCream}
                className="px-2.5 py-1 rounded-lg bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Thêm Kem
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {config.creams.map((c, idx) => (
                <div key={c.id} className="p-3 bg-white rounded-2xl border border-zinc-200 space-y-2 hover:border-pink-300 transition shadow-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={c.icon || '🍦'}
                      onChange={(e) => handleUpdateCream(idx, 'icon', e.target.value)}
                      className="w-9 p-1 text-center rounded-lg border border-zinc-200 text-sm shrink-0"
                      title="Biểu tượng loại kem"
                    />
                    <input
                      type="text"
                      placeholder="Tên loại kem (vd: Kem Topping, Kem Whipping, Phô mai...)"
                      value={c.name}
                      onChange={(e) => handleUpdateCream(idx, 'name', e.target.value)}
                      className="flex-1 min-w-0 p-1.5 rounded-lg border border-zinc-200 font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-pink-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeleteCream(idx)}
                      className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg transition cursor-pointer shrink-0"
                      title="Xóa loại kem này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-xs">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[10px] text-rose-600 font-bold shrink-0">Giá Vốn:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInput(c.extraCost)}
                        onChange={(e) => handleUpdateCream(idx, 'extraCost', parseCurrencyInput(e.target.value))}
                        className="w-full p-1 text-right rounded-lg border border-rose-200 font-bold text-rose-700 bg-rose-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                      />
                    </div>
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[10px] text-emerald-600 font-bold shrink-0">Phụ Thu:</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInput(c.extraPrice)}
                        onChange={(e) => handleUpdateCream(idx, 'extraPrice', parseCurrencyInput(e.target.value))}
                        className="w-full p-1 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 bg-emerald-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: FILLINGS (NHÂN BÁNH SINH NHẬT) */}
      {activeSubTab === 'fillings' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-black text-sm text-zinc-900">Danh Mục Nhân Bánh Sinh Nhật</h4>
              <p className="text-[11px] text-zinc-500">
                Các loại nhân mứt trái cây, socola ganache, phô mai hoặc trứng muối bên trong bánh. Khi khách chọn, hệ thống sẽ tự tính phụ thu và báo thợ bếp.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddFilling}
              className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Loại Nhân
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentFillings.map((f, idx) => (
              <div key={f.id} className="p-3 bg-white rounded-2xl border border-zinc-200 space-y-2 hover:border-pink-300 transition shadow-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={f.icon || '🍓'}
                    onChange={(e) => handleUpdateFilling(idx, 'icon', e.target.value)}
                    className="w-9 p-1 text-center rounded-lg border border-zinc-200 text-sm shrink-0"
                    title="Biểu tượng nhân bánh"
                  />
                  <input
                    type="text"
                    placeholder="Tên loại nhân bánh (vd: Mứt Dâu Tây Đà Lạt...)"
                    value={f.name}
                    onChange={(e) => handleUpdateFilling(idx, 'name', e.target.value)}
                    className="flex-1 min-w-0 p-1.5 rounded-lg border border-zinc-200 font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteFilling(idx)}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg transition cursor-pointer shrink-0"
                    title="Xóa loại nhân này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-xs">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-rose-600 font-bold shrink-0">Giá Vốn:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(f.extraCost)}
                      onChange={(e) => handleUpdateFilling(idx, 'extraCost', parseCurrencyInput(e.target.value))}
                      className="w-full p-1 text-right rounded-lg border border-rose-200 font-bold text-rose-700 bg-rose-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-emerald-600 font-bold shrink-0">Phụ Thu:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(f.extraPrice)}
                      onChange={(e) => handleUpdateFilling(idx, 'extraPrice', parseCurrencyInput(e.target.value))}
                      className="w-full p-1 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 bg-emerald-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: PACKAGINGS */}
      {activeSubTab === 'packagings' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-black text-sm text-zinc-900">Hộp Đóng Gói & Bao Bì Bánh</h4>
              <p className="text-[11px] text-zinc-500">Định mức giá vốn và mức phụ thu đối với các loại hộp đặc biệt (như hộp mica trong suốt cao cấp).</p>
            </div>
            <button
              type="button"
              onClick={handleAddPackaging}
              className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Hộp Mới
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {config.packagings.map((pkg, idx) => (
              <div key={pkg.id} className="p-3 bg-white rounded-2xl border border-zinc-200 space-y-2 hover:border-pink-300 transition shadow-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={pkg.icon || '📦'}
                    onChange={(e) => handleUpdatePackaging(idx, 'icon', e.target.value)}
                    className="w-9 p-1 text-center rounded-lg border border-zinc-200 text-sm shrink-0"
                    title="Biểu tượng hộp bánh"
                  />
                  <input
                    type="text"
                    placeholder="Tên loại hộp bánh (vd: Hộp giấy tiêu chuẩn, Hộp mica trong suốt...)"
                    value={pkg.name}
                    onChange={(e) => handleUpdatePackaging(idx, 'name', e.target.value)}
                    className="flex-1 min-w-0 p-1.5 rounded-lg border border-zinc-200 font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeletePackaging(idx)}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg transition cursor-pointer shrink-0"
                    title="Xóa hộp này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-xs">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-rose-600 font-bold shrink-0">Giá Vốn:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(pkg.extraCost)}
                      onChange={(e) => handleUpdatePackaging(idx, 'extraCost', parseCurrencyInput(e.target.value))}
                      className="w-full p-1 text-right rounded-lg border border-rose-200 font-bold text-rose-700 bg-rose-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-emerald-600 font-bold shrink-0">Phụ Thu:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(pkg.extraPrice)}
                      onChange={(e) => handleUpdatePackaging(idx, 'extraPrice', parseCurrencyInput(e.target.value))}
                      className="w-full p-1 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 bg-emerald-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: ADDONS */}
      {activeSubTab === 'addons' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-black text-sm text-zinc-900">Phụ Kiện Trang Trí & Decor Bánh</h4>
              <p className="text-[11px] text-zinc-500">Quầy POS có thể tích chọn nhanh các phụ kiện này khi tạo đơn đặt bánh sinh nhật.</p>
            </div>
            <button
              type="button"
              onClick={handleAddAddon}
              className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Phụ Kiện
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {config.addons.map((a, idx) => (
              <div key={a.id} className="p-3 bg-white rounded-2xl border border-zinc-200 space-y-2 hover:border-pink-300 transition">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={a.icon || '✨'}
                    onChange={(e) => handleUpdateAddon(idx, 'icon', e.target.value)}
                    className="w-9 p-1 text-center rounded-lg border border-zinc-200 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Tên phụ kiện (vd: Vương miện, Nến số, Topper...)"
                    value={a.name}
                    onChange={(e) => handleUpdateAddon(idx, 'name', e.target.value)}
                    className="flex-1 min-w-0 p-1.5 rounded-lg border border-zinc-200 font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-pink-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteAddon(idx)}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg transition cursor-pointer shrink-0"
                    title="Xóa phụ kiện này"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-xs">
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-rose-600 font-bold shrink-0">Giá Vốn:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(a.cost)}
                      onChange={(e) => handleUpdateAddon(idx, 'cost', parseCurrencyInput(e.target.value))}
                      className="w-full p-1 text-right rounded-lg border border-rose-200 font-bold text-rose-700 bg-rose-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                  </div>
                  <div className="flex items-center gap-1 flex-1 min-w-0">
                    <span className="text-[10px] text-emerald-600 font-bold shrink-0">Giá Bán:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(a.price)}
                      onChange={(e) => handleUpdateAddon(idx, 'price', parseCurrencyInput(e.target.value))}
                      className="w-full p-1 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 bg-emerald-50/40 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL CÀI ĐẶT ĐỊNH MỨC NGUYÊN LIỆU BOM CHO CỐT BÁNH ── */}
      {editingBomSize && (
        <div className="fixed inset-0 z-[10000005] bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-zinc-200 text-zinc-900 animate-in zoom-in-95 duration-150 my-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg text-zinc-900 flex items-center gap-2">
                    Công Thức BOM Cốt Bánh: <span className="text-pink-600 uppercase">{editingBomSize.size.name}</span>
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Nhập định mức nguyên liệu làm cốt bánh bông lan và kem nền. Tổng giá vốn các nguyên liệu sẽ tự động trở thành Giá Vốn Chuẩn.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBomSize(null)}
                className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bảng nguyên liệu BOM */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-black text-xs text-zinc-700 flex items-center gap-1.5">
                  <Utensils className="w-3.5 h-3.5 text-pink-600" />
                  Danh Sách Nguyên Liệu ({editingBomSize.size.bomIngredients?.length || 0})
                </span>
                <button
                  type="button"
                  onClick={handleAddBomItem}
                  className="px-2.5 py-1 rounded-xl bg-pink-50 hover:bg-pink-100 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition border border-pink-200"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm Nguyên Liệu
                </button>
              </div>

              <div className="overflow-x-auto border border-zinc-200 rounded-2xl max-h-[42vh] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-600 font-bold border-b border-zinc-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">Tên Nguyên Liệu</th>
                      <th className="p-2.5 text-center w-24">Định Lượng</th>
                      <th className="p-2.5 text-center w-20">Đơn Vị</th>
                      <th className="p-2.5 text-right w-28">Đơn Giá Vốn (đ)</th>
                      <th className="p-2.5 text-right w-28 text-rose-700">Thành Tiền</th>
                      <th className="p-2.5 text-center w-10">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-medium">
                    {(editingBomSize.size.bomIngredients || []).map((it, bIdx) => {
                      const itemTotal = Number(it.quantity || 0) * Number(it.unitCost || 0);

                      return (
                        <tr key={bIdx} className="hover:bg-zinc-50/70 transition">
                          <td className="p-2 min-w-[180px]">
                            {/* Chọn nhanh từ kho nếu có, hoặc nhập tay */}
                            <div className="space-y-1">
                              <input
                                type="text"
                                placeholder="Tên nguyên liệu..."
                                value={it.name}
                                onChange={(e) => handleUpdateBomItem(bIdx, 'name', e.target.value)}
                                className="w-full p-1.5 rounded-lg border border-zinc-200 font-bold text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-pink-500"
                              />
                              {availableIngredients.length > 0 && (
                                <select
                                  value={it.ingredientId || ''}
                                  onChange={(e) => handleSelectIngredientForBom(bIdx, e.target.value)}
                                  className="w-full text-[10px] p-1 rounded-md border border-dashed border-zinc-300 text-zinc-500 bg-white"
                                >
                                  <option value="">-- Chọn nhanh từ kho nguyên liệu --</option>
                                  {availableIngredients.map((ing) => (
                                    <option key={ing.id} value={ing.id}>
                                      {ing.name} ({ing.unit}) - {Number(ing.avg_cost || 0).toLocaleString()}đ
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="number"
                              step="any"
                              min={0}
                              value={it.quantity}
                              onChange={(e) => handleUpdateBomItem(bIdx, 'quantity', Number(e.target.value) || 0)}
                              className="w-20 p-1.5 text-center rounded-lg border border-zinc-200 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                            />
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="text"
                              placeholder="g"
                              value={it.unit}
                              onChange={(e) => handleUpdateBomItem(bIdx, 'unit', e.target.value)}
                              className="w-16 p-1.5 text-center rounded-lg border border-zinc-200 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={formatCurrencyInput(it.unitCost)}
                              onChange={(e) => handleUpdateBomItem(bIdx, 'unitCost', parseCurrencyInput(e.target.value))}
                              className="w-24 p-1.5 text-right rounded-lg border border-zinc-200 font-bold text-xs focus:outline-none focus:ring-1 focus:ring-pink-500"
                            />
                          </td>
                          <td className="p-2 text-right font-black text-rose-700 text-xs">
                            {itemTotal.toLocaleString('vi-VN')} đ
                          </td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteBomItem(bIdx)}
                              className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                              title="Xóa nguyên liệu này"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Khối Tổng Kết Tính Toán Giá Vốn */}
            {(() => {
              const totalBom = (editingBomSize.size.bomIngredients || []).reduce(
                (sum, it) => sum + (Number(it.quantity || 0) * Number(it.unitCost || 0)),
                0
              );
              const sugPrice = editingBomSize.size.suggestedPrice || 0;
              const estFoodCost = sugPrice > 0 ? ((totalBom / sugPrice) * 100).toFixed(1) : '0';

              return (
                <div className="bg-rose-50/70 p-3.5 rounded-2xl border border-rose-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-rose-600" />
                      TỔNG GIÁ VỐN NGUYÊN LIỆU (BOM):
                    </span>
                    <span className="text-base font-black text-rose-700 font-mono">
                      {totalBom.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-600 pt-1 border-t border-rose-200/80">
                    <span>
                      Giá bán đề xuất hiện tại: <strong>{sugPrice.toLocaleString('vi-VN')} đ</strong>
                    </span>
                    <span className="font-bold">
                      Tỷ lệ Food Cost: <span className={Number(estFoodCost) > 40 ? 'text-amber-600' : 'text-emerald-700 font-black'}>{estFoodCost}%</span>
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setEditingBomSize(null)}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 font-bold text-xs transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveBomToSize}
                className="px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-pink-200 transition cursor-pointer"
              >
                <Save className="w-4 h-4" /> Áp Dụng Vào Size Bánh
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
