// src/components/admin/CustomCakeCostingSettings.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  CustomCakeCostingConfig,
  CakeSizeOption,
  CakeFlavorOption,
  CakeCreamOption,
  CakePackagingOption,
  CakeAddonOption,
  DEFAULT_CUSTOM_CAKE_CONFIG,
} from '@/lib/constants/cakeCostingData';
import {
  getCakeCostingConfig,
  saveCakeCostingConfig,
  resetCakeCostingConfig,
  fetchCakeCostingFromDb,
} from '@/lib/utils/customCakeCosting';
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
} from 'lucide-react';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';

export function CustomCakeCostingSettings() {
  const [config, setConfig] = useState<CustomCakeCostingConfig>(() => getCakeCostingConfig());
  const [activeSubTab, setActiveSubTab] = useState<'sizes' | 'flavors_creams' | 'packagings' | 'addons'>('sizes');
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetchCakeCostingFromDb().then((remote) => {
      if (remote) setConfig(remote);
    });
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
    };
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
          <Cake className="w-3.5 h-3.5" /> 1. Kích Thước Bánh ({config.sizes.length})
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
          <Layers className="w-3.5 h-3.5" /> 2. Cốt Bánh & Loại Kem ({config.flavors.length + config.creams.length})
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
          <Package className="w-3.5 h-3.5" /> 3. Hộp & Bao Bì ({config.packagings.length})
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
          <Sparkles className="w-3.5 h-3.5" /> 4. Phụ Kiện & Decor ({config.addons.length})
        </button>
      </div>

      {/* SUB-TAB 1: SIZES */}
      {activeSubTab === 'sizes' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-black text-sm text-zinc-900">Bảng Định Mức Vốn & Giá Gợi Ý Theo Kích Thước</h4>
              <p className="text-[11px] text-zinc-500">Chi phí vốn gồm cốt bánh bông lan tiêu chuẩn + lượng kem phết nền tương ứng theo size.</p>
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
                  <th className="p-3 text-right text-rose-700">Chi Phí Vốn Chuẩn (VND)</th>
                  <th className="p-3 text-right text-emerald-700">Giá Bán Đề Xuất (VND)</th>
                  <th className="p-3 text-center">Tỷ lệ Food Cost</th>
                  <th className="p-3 text-center w-12">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-medium">
                {config.sizes.map((s, idx) => {
                  const fc = s.suggestedPrice > 0 ? ((s.baseCost / s.suggestedPrice) * 100).toFixed(1) : '0';
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
                      <td className="p-2.5 text-right min-w-[140px]">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(s.baseCost)}
                          onChange={(e) => handleUpdateSize(idx, 'baseCost', parseCurrencyInput(e.target.value))}
                          className="w-32 p-1.5 text-right rounded-lg border border-rose-200 font-bold text-rose-700 bg-rose-50/40"
                        />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-150">
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

            <div className="space-y-2">
              {config.flavors.map((f, idx) => (
                <div key={f.id} className="p-2.5 bg-white rounded-xl border border-zinc-200 flex items-center gap-2">
                  <input
                    type="text"
                    value={f.name}
                    onChange={(e) => handleUpdateFlavor(idx, 'name', e.target.value)}
                    className="flex-1 p-1 rounded-lg border border-zinc-200 font-bold text-xs"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-rose-600 font-semibold">Vốn:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(f.extraCost)}
                      onChange={(e) => handleUpdateFlavor(idx, 'extraCost', parseCurrencyInput(e.target.value))}
                      className="w-20 p-1 text-right rounded-lg border border-rose-200 font-bold text-rose-700 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-emerald-600 font-semibold">Phụ thu:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(f.extraPrice)}
                      onChange={(e) => handleUpdateFlavor(idx, 'extraPrice', parseCurrencyInput(e.target.value))}
                      className="w-20 p-1 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteFlavor(idx)}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
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

            <div className="space-y-2">
              {config.creams.map((c, idx) => (
                <div key={c.id} className="p-2.5 bg-white rounded-xl border border-zinc-200 flex items-center gap-2">
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) => handleUpdateCream(idx, 'name', e.target.value)}
                    className="flex-1 p-1 rounded-lg border border-zinc-200 font-bold text-xs"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-rose-600 font-semibold">Vốn:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(c.extraCost)}
                      onChange={(e) => handleUpdateCream(idx, 'extraCost', parseCurrencyInput(e.target.value))}
                      className="w-20 p-1 text-right rounded-lg border border-rose-200 font-bold text-rose-700 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-emerald-600 font-semibold">Phụ thu:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(c.extraPrice)}
                      onChange={(e) => handleUpdateCream(idx, 'extraPrice', parseCurrencyInput(e.target.value))}
                      className="w-20 p-1 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCream(idx)}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PACKAGINGS */}
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

          <div className="space-y-2.5 max-w-2xl">
            {config.packagings.map((pkg, idx) => (
              <div key={pkg.id} className="p-3 bg-white rounded-2xl border border-zinc-200 flex items-center gap-3">
                <input
                  type="text"
                  value={pkg.name}
                  onChange={(e) => handleUpdatePackaging(idx, 'name', e.target.value)}
                  className="flex-1 p-1.5 rounded-xl border border-zinc-200 font-bold text-xs"
                />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-rose-600 font-bold">Vốn vỏ hộp:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(pkg.extraCost)}
                    onChange={(e) => handleUpdatePackaging(idx, 'extraCost', parseCurrencyInput(e.target.value))}
                    className="w-24 p-1.5 text-right rounded-xl border border-rose-200 font-bold text-rose-700 text-xs"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-emerald-600 font-bold">Phụ thu khách:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(pkg.extraPrice)}
                    onChange={(e) => handleUpdatePackaging(idx, 'extraPrice', parseCurrencyInput(e.target.value))}
                    className="w-24 p-1.5 text-right rounded-xl border border-emerald-200 font-bold text-emerald-700 text-xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleDeletePackaging(idx)}
                  className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-xl transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
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
                    value={a.name}
                    onChange={(e) => handleUpdateAddon(idx, 'name', e.target.value)}
                    className="flex-1 p-1.5 rounded-lg border border-zinc-200 font-bold text-xs text-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteAddon(idx)}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-100 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-rose-600 font-bold">Giá Vốn:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(a.cost)}
                      onChange={(e) => handleUpdateAddon(idx, 'cost', parseCurrencyInput(e.target.value))}
                      className="w-24 p-1 text-right rounded-lg border border-rose-200 font-bold text-rose-700 bg-rose-50/40 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-emerald-600 font-bold">Giá Bán / Phụ Thu:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(a.price)}
                      onChange={(e) => handleUpdateAddon(idx, 'price', parseCurrencyInput(e.target.value))}
                      className="w-24 p-1 text-right rounded-lg border border-emerald-200 font-bold text-emerald-700 bg-emerald-50/40 text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
