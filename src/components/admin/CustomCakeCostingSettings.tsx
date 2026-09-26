// src/components/admin/CustomCakeCostingSettings.tsx
'use client';

import React, { useState, useEffect } from 'react';
import {
  FullCakeBomConfig,
  CakeBaseModel,
  CakeBaseSizeConfig,
  CreamCoatingModel,
  CreamCoatingSizeConfig,
  CakeFillingModel,
  PackagingBoxModel,
  FreeAccessoryModel,
  CakeDecorAddonModel,
  BirthdayCakeBomPreset,
  CakeBomItem,
} from '@/lib/types/bakery-bom';
import {
  getFullCakeBomConfig,
  saveFullCakeBomConfig,
  fetchFullCakeBomConfigFromDb,
  calculateCakeCostDetails,
} from '@/lib/utils/cakeBomManager';
import { INITIAL_FULL_CAKE_BOM_CONFIG } from '@/lib/constants/defaultCakeBomData';
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
  Utensils,
  Gift,
  Boxes,
  X,
  Sliders,
  Percent,
} from 'lucide-react';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';

export function CustomCakeCostingSettings() {
  const [config, setConfig] = useState<FullCakeBomConfig>(() => getFullCakeBomConfig());
  const [activeTab, setActiveTab] = useState<
    'cake_bases' | 'cream_coatings' | 'fillings' | 'packagings' | 'free_accessories' | 'decor_addons' | 'bom_presets'
  >('cake_bases');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [availableIngredients, setAvailableIngredients] = useState<any[]>([]);

  const [editingBaseBom, setEditingBaseBom] = useState<{
    baseIndex: number;
    sizeIndex: number;
    baseName: string;
    size: CakeBaseSizeConfig;
  } | null>(null);

  const [editingCreamBom, setEditingCreamBom] = useState<{
    creamIndex: number;
    sizeIndex: number;
    creamName: string;
    size: CreamCoatingSizeConfig;
  } | null>(null);

  useEffect(() => {
    fetchFullCakeBomConfigFromDb().then((remote) => {
      if (remote) setConfig(remote);
    });

    const loadIngredients = async () => {
      let loadedIngs: any[] = [];
      try {
        const { data: dbIngs } = await supabase.from('ingredients').select('id, name, unit, avg_cost, category');
        if (dbIngs && dbIngs.length > 0) {
          setAvailableIngredients(dbIngs);
          loadedIngs = dbIngs;
        }
      } catch {}

      if (loadedIngs.length === 0) {
        try {
          const local = localStorage.getItem('bakery_ingredients');
          if (local) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setAvailableIngredients(parsed);
              loadedIngs = parsed;
            }
          }
        } catch {}
      }

      if (loadedIngs.length > 0) {
        setConfig((prev) => {
          let changed = false;
          const updatedBases = prev.cakeBases.map((b) => ({
            ...b,
            sizes: b.sizes.map((s) => ({
              ...s,
              bomIngredients: s.bomIngredients.map((item) => {
                if (!item.ingredientId) {
                  const matched = loadedIngs.find(
                    (i) => i.name.toLowerCase().trim() === item.name.toLowerCase().trim() ||
                           i.name.toLowerCase().includes(item.name.toLowerCase()) ||
                           item.name.toLowerCase().includes(i.name.toLowerCase())
                  );
                  if (matched) {
                    changed = true;
                    return { ...item, ingredientId: matched.id };
                  }
                }
                return item;
              }),
            })),
          }));

          const updatedCreams = prev.creamCoatings.map((c) => ({
            ...c,
            sizes: c.sizes.map((s) => ({
              ...s,
              bomIngredients: s.bomIngredients.map((item) => {
                if (!item.ingredientId) {
                  const matched = loadedIngs.find(
                    (i) => i.name.toLowerCase().trim() === item.name.toLowerCase().trim() ||
                           i.name.toLowerCase().includes(item.name.toLowerCase()) ||
                           item.name.toLowerCase().includes(i.name.toLowerCase())
                  );
                  if (matched) {
                    changed = true;
                    return { ...item, ingredientId: matched.id };
                  }
                }
                return item;
              }),
            })),
          }));

          if (!changed) return prev;
          const mapped = { ...prev, cakeBases: updatedBases, creamCoatings: updatedCreams };
          saveFullCakeBomConfig(mapped);
          return mapped;
        });
      }
    };
    loadIngredients();
  }, []);

  const handleSave = () => {
    saveFullCakeBomConfig(config);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  const handleResetToDefault = () => {
    if (confirm('Bạn có chắc chắn muốn khôi phục toàn bộ bảng định mức BOM bánh sinh nhật về mẫu chuẩn ban đầu?')) {
      setConfig(INITIAL_FULL_CAKE_BOM_CONFIG);
      saveFullCakeBomConfig(INITIAL_FULL_CAKE_BOM_CONFIG);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
  };

  // 1. CỐT BÁNH HANDLERS
  const handleAddCakeBase = () => {
    const newBase: CakeBaseModel = {
      id: 'base-' + Date.now(),
      name: 'Cốt Bánh Mới',
      description: 'Mô tả cốt bánh mới',
      sizes: [
        {
          id: 'size-16-' + Date.now(),
          sizeName: 'Size 16cm (4 - 6 người)',
          diameterCm: 16,
          servings: '4 - 6 người',
          baseCost: 20000,
          bomIngredients: [
            { name: 'Bột mì số 8', unit: 'g', quantity: 90, unitCost: 24, totalCost: 2160 },
            { name: 'Trứng gà ta', unit: 'quả', quantity: 3, unitCost: 3500, totalCost: 10500 },
            { name: 'Đường cát trắng', unit: 'g', quantity: 65, unitCost: 20, totalCost: 1300 },
          ],
        },
        {
          id: 'size-18-' + Date.now(),
          sizeName: 'Size 18cm (6 - 8 người)',
          diameterCm: 18,
          servings: '6 - 8 người',
          baseCost: 28000,
          bomIngredients: [
            { name: 'Bột mì số 8', unit: 'g', quantity: 120, unitCost: 24, totalCost: 2880 },
            { name: 'Trứng gà ta', unit: 'quả', quantity: 4, unitCost: 3500, totalCost: 14000 },
            { name: 'Đường cát trắng', unit: 'g', quantity: 85, unitCost: 20, totalCost: 1700 },
          ],
        },
      ],
    };
    setConfig({ ...config, cakeBases: [...config.cakeBases, newBase] });
  };

  const handleUpdateCakeBase = (baseIdx: number, field: keyof CakeBaseModel, value: any) => {
    const updated = [...config.cakeBases];
    updated[baseIdx] = { ...updated[baseIdx], [field]: value };
    setConfig({ ...config, cakeBases: updated });
  };

  const handleDeleteCakeBase = (baseIdx: number) => {
    if (config.cakeBases.length <= 1) {
      alert('Phải giữ lại ít nhất 1 loại cốt bánh!');
      return;
    }
    setConfig({ ...config, cakeBases: config.cakeBases.filter((_, i) => i !== baseIdx) });
  };

  const handleAddBaseSize = (baseIdx: number) => {
    const base = config.cakeBases[baseIdx];
    const newSize: CakeBaseSizeConfig = {
      id: 'size-' + Date.now(),
      sizeName: 'Size mới 22cm',
      diameterCm: 22,
      servings: '12 - 16 người',
      baseCost: 45000,
      bomIngredients: [
        { name: 'Bột mì số 8', unit: 'g', quantity: 180, unitCost: 24, totalCost: 4320 },
        { name: 'Trứng gà tươi', unit: 'quả', quantity: 6, unitCost: 3500, totalCost: 21000 },
      ],
    };
    const updatedSizes = [...base.sizes, newSize];
    handleUpdateCakeBase(baseIdx, 'sizes', updatedSizes);
  };

  const handleDeleteBaseSize = (baseIdx: number, sizeIdx: number) => {
    const base = config.cakeBases[baseIdx];
    if (base.sizes.length <= 1) {
      alert('Cốt bánh phải có ít nhất 1 kích thước!');
      return;
    }
    const updatedSizes = base.sizes.filter((_, i) => i !== sizeIdx);
    handleUpdateCakeBase(baseIdx, 'sizes', updatedSizes);
  };

  const handleSaveBaseBomModal = () => {
    if (!editingBaseBom) return;
    const { baseIndex, sizeIndex, size } = editingBaseBom;
    const totalBomCost = size.bomIngredients.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const updatedSize = { ...size, baseCost: totalBomCost };

    const base = config.cakeBases[baseIndex];
    const updatedSizes = [...base.sizes];
    updatedSizes[sizeIndex] = updatedSize;

    handleUpdateCakeBase(baseIndex, 'sizes', updatedSizes);
    setEditingBaseBom(null);
  };

  // 2. KEM PHỦ HANDLERS
  const handleAddCreamCoating = () => {
    const newCream: CreamCoatingModel = {
      id: 'cream-' + Date.now(),
      name: 'Kem Phủ Mới',
      description: 'Mô tả loại kem phủ mới',
      sizes: [
        {
          id: 'cream-size-16-' + Date.now(),
          sizeName: 'Size 16cm',
          diameterCm: 16,
          baseCost: 35000,
          bomIngredients: [
            { name: 'Kem tươi whipping', unit: 'ml', quantity: 250, unitCost: 120, totalCost: 30000 },
            { name: 'Đường bột', unit: 'g', quantity: 30, unitCost: 25, totalCost: 750 },
          ],
        },
        {
          id: 'cream-size-18-' + Date.now(),
          sizeName: 'Size 18cm',
          diameterCm: 18,
          baseCost: 50000,
          bomIngredients: [
            { name: 'Kem tươi whipping', unit: 'ml', quantity: 380, unitCost: 120, totalCost: 45600 },
            { name: 'Đường bột', unit: 'g', quantity: 45, unitCost: 25, totalCost: 1125 },
          ],
        },
      ],
    };
    setConfig({ ...config, creamCoatings: [...config.creamCoatings, newCream] });
  };

  const handleUpdateCreamCoating = (creamIdx: number, field: keyof CreamCoatingModel, value: any) => {
    const updated = [...config.creamCoatings];
    updated[creamIdx] = { ...updated[creamIdx], [field]: value };
    setConfig({ ...config, creamCoatings: updated });
  };

  const handleDeleteCreamCoating = (creamIdx: number) => {
    if (config.creamCoatings.length <= 1) {
      alert('Phải giữ lại ít nhất 1 loại kem phủ!');
      return;
    }
    setConfig({ ...config, creamCoatings: config.creamCoatings.filter((_, i) => i !== creamIdx) });
  };

  const handleAddCreamSize = (creamIdx: number) => {
    const cream = config.creamCoatings[creamIdx];
    const newSize: CreamCoatingSizeConfig = {
      id: 'cream-size-' + Date.now(),
      sizeName: 'Size mới 20cm',
      diameterCm: 20,
      baseCost: 65000,
      bomIngredients: [
        { name: 'Kem tươi whipping', unit: 'ml', quantity: 480, unitCost: 120, totalCost: 57600 },
      ],
    };
    const updatedSizes = [...cream.sizes, newSize];
    handleUpdateCreamCoating(creamIdx, 'sizes', updatedSizes);
  };

  const handleDeleteCreamSize = (creamIdx: number, sizeIdx: number) => {
    const cream = config.creamCoatings[creamIdx];
    if (cream.sizes.length <= 1) {
      alert('Kem phủ phải có ít nhất 1 kích thước!');
      return;
    }
    const updatedSizes = cream.sizes.filter((_, i) => i !== sizeIdx);
    handleUpdateCreamCoating(creamIdx, 'sizes', updatedSizes);
  };

  const handleSaveCreamBomModal = () => {
    if (!editingCreamBom) return;
    const { creamIndex, sizeIndex, size } = editingCreamBom;
    const totalBomCost = size.bomIngredients.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const updatedSize = { ...size, baseCost: totalBomCost };

    const cream = config.creamCoatings[creamIndex];
    const updatedSizes = [...cream.sizes];
    updatedSizes[sizeIndex] = updatedSize;

    handleUpdateCreamCoating(creamIndex, 'sizes', updatedSizes);
    setEditingCreamBom(null);
  };

  // 3. NHÂN BÁNH HANDLERS
  const handleAddFilling = () => {
    const newFill: CakeFillingModel = {
      id: 'fill-' + Date.now(),
      name: 'Nhân mới (VD: Mứt Dâu Tây)',
      costPrice: 15000,
      extraPrice: 20000,
    };
    setConfig({ ...config, fillings: [...config.fillings, newFill] });
  };

  const handleImportFillingFromInventory = (ingredientId: string) => {
    const found = availableIngredients.find((i) => i.id === ingredientId);
    if (!found) return;
    const newFill: CakeFillingModel = {
      id: 'fill-' + Date.now(),
      name: found.name,
      ingredientId: found.id,
      costPrice: Number(found.avg_cost) || 0,
      extraPrice: Math.round((Number(found.avg_cost) || 0) * 1.5),
    };
    setConfig({ ...config, fillings: [...config.fillings, newFill] });
  };

  const handleUpdateFilling = (idx: number, field: keyof CakeFillingModel, value: any) => {
    const updated = [...config.fillings];
    updated[idx] = { ...updated[idx], [field]: value };
    setConfig({ ...config, fillings: updated });
  };

  const handleDeleteFilling = (idx: number) => {
    setConfig({ ...config, fillings: config.fillings.filter((_, i) => i !== idx) });
  };

  // 4. HỘP VÀ BAO BÌ HANDLERS
  const handleAddPackaging = () => {
    const newPkg: PackagingBoxModel = {
      id: 'pkg-' + Date.now(),
      name: 'Hộp Mica Trong Suốt 18cm',
      costPrice: 20000,
      sellingPrice: 25000,
    };
    setConfig({ ...config, packagings: [...config.packagings, newPkg] });
  };

  const handleImportPackagingFromInventory = (ingredientId: string) => {
    const found = availableIngredients.find((i) => i.id === ingredientId);
    if (!found) return;
    const newPkg: PackagingBoxModel = {
      id: 'pkg-' + Date.now(),
      name: found.name,
      ingredientId: found.id,
      costPrice: Number(found.avg_cost) || 0,
      sellingPrice: Math.round((Number(found.avg_cost) || 0) * 1.3),
    };
    setConfig({ ...config, packagings: [...config.packagings, newPkg] });
  };

  const handleUpdatePackaging = (idx: number, field: keyof PackagingBoxModel, value: any) => {
    const updated = [...config.packagings];
    updated[idx] = { ...updated[idx], [field]: value };
    setConfig({ ...config, packagings: updated });
  };

  const handleDeletePackaging = (idx: number) => {
    setConfig({ ...config, packagings: config.packagings.filter((_, i) => i !== idx) });
  };

  // 5. VẬT TƯ TẶNG KÈM HANDLERS
  const handleAddFreeAccessory = () => {
    const newAcc: FreeAccessoryModel = {
      id: 'acc-' + Date.now(),
      name: 'Vật tư tặng kèm mới',
      costPrice: 3000,
      isDefaultIncluded: true,
      quantityDefault: 1,
    };
    setConfig({ ...config, freeAccessories: [...config.freeAccessories, newAcc] });
  };

  const handleImportFreeAccessoryFromInventory = (ingredientId: string) => {
    const found = availableIngredients.find((i) => i.id === ingredientId);
    if (!found) return;
    const newAcc: FreeAccessoryModel = {
      id: 'acc-' + Date.now(),
      name: found.name,
      ingredientId: found.id,
      costPrice: Number(found.avg_cost) || 0,
      isDefaultIncluded: true,
      quantityDefault: 1,
    };
    setConfig({ ...config, freeAccessories: [...config.freeAccessories, newAcc] });
  };

  const handleUpdateFreeAccessory = (idx: number, field: keyof FreeAccessoryModel, value: any) => {
    const updated = [...config.freeAccessories];
    updated[idx] = { ...updated[idx], [field]: value };
    setConfig({ ...config, freeAccessories: updated });
  };

  const handleDeleteFreeAccessory = (idx: number) => {
    setConfig({ ...config, freeAccessories: config.freeAccessories.filter((_, i) => i !== idx) });
  };

  // 6. PHỤ KIỆN VÀ DECOR HANDLERS
  const handleAddDecorAddon = () => {
    const newAddon: CakeDecorAddonModel = {
      id: 'decor-' + Date.now(),
      name: 'Vương miện / Đèn LED mới',
      category: 'decor',
      costPrice: 15000,
      sellingPrice: 30000,
      icon: '👑',
    };
    setConfig({ ...config, decorAddons: [...config.decorAddons, newAddon] });
  };

  const handleUpdateDecorAddon = (idx: number, field: keyof CakeDecorAddonModel, value: any) => {
    const updated = [...config.decorAddons];
    updated[idx] = { ...updated[idx], [field]: value };
    setConfig({ ...config, decorAddons: updated });
  };

  const handleDeleteDecorAddon = (idx: number) => {
    setConfig({ ...config, decorAddons: config.decorAddons.filter((_, i) => i !== idx) });
  };

  // 7. BOM BÁNH SINH NHẬT HANDLERS
  const handleAddBomPreset = () => {
    const defaultBase = config.cakeBases[0];
    const defaultCream = config.creamCoatings[0];
    const newPreset: BirthdayCakeBomPreset = {
      id: 'bom-preset-' + Date.now(),
      name: 'BOM Mẫu Bánh Sinh Nhật Mới',
      cakeBaseId: defaultBase?.id || '',
      creamCoatingId: defaultCream?.id || '',
      fillingId: config.fillings[0]?.id,
      freeAccessoryIds: config.freeAccessories.filter((a) => a.isDefaultIncluded).map((a) => a.id),
      decorAddonIds: [],
      targetFoodCostPct: config.targetFoodCostPct || 36.5,
      suggestedSellingPrice: 350000,
      notes: 'Mẫu bánh sinh nhật định mức chuẩn (chọn size khi đặt bánh)',
    };
    setConfig({ ...config, birthdayBomPresets: [...config.birthdayBomPresets, newPreset] });
  };

  const handleUpdateBomPreset = (idx: number, field: keyof BirthdayCakeBomPreset, value: any) => {
    const updated = [...config.birthdayBomPresets];
    updated[idx] = { ...updated[idx], [field]: value };
    setConfig({ ...config, birthdayBomPresets: updated });
  };

  const handleDeleteBomPreset = (idx: number) => {
    setConfig({ ...config, birthdayBomPresets: config.birthdayBomPresets.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION & ACTIONS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-amber-500/10 border border-pink-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-pink-600 text-white flex items-center justify-center shadow-md shadow-pink-600/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-black text-base text-zinc-900 flex items-center gap-2">
              Mục Định Mức Đặt Bánh & Cài Đặt BOM
              <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 text-[10px] font-black border border-pink-200">
                Sơ đồ Flowchart Mới
              </span>
            </h2>
            <p className="text-xs text-zinc-600">
              Quản lý định mức BOM 7 thành phần: Cốt bánh, Kem phủ, Nhân, Hộp, Quà tặng kèm, Decor và BOM tổng hợp.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Ô TỰ NHẬP BIÊN LỢI NHUẬN / FOOD COST MỤC TIÊU (MẶC ĐỊNH 36.5%) */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-white border border-pink-200 shadow-xs">
            <Percent className="w-3.5 h-3.5 text-pink-600" />
            <span className="text-[11px] font-bold text-zinc-600">Markup COGS:</span>
            <input
              type="number"
              step="0.5"
              min="10"
              max="100"
              value={config.targetFoodCostPct}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setConfig({ ...config, targetFoodCostPct: e.target.value === '' ? ('' as any) : parseFloat(e.target.value) })}
              className="w-14 text-center font-black text-xs text-pink-700 bg-pink-50 rounded-lg py-0.5 border border-pink-200 focus:outline-none"
              title="Tỷ lệ giá vốn mục tiêu, mặc định 36.5%. Tự động tính giá bán gợi ý = Cost / %"
            />
            <span className="text-xs font-bold text-zinc-500">%</span>
          </div>

          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-3 py-2 rounded-2xl bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-600 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Khôi phục về mẫu định mức chuẩn"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Khôi phục</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 rounded-2xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-black shadow-md shadow-pink-600/30 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
          >
            <Save className="w-4 h-4" />
            <span>Lưu Định Mức</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Đã lưu thành công toàn bộ bảng định mức BOM! Mọi máy POS và Bếp KDS tự động cập nhật.
        </div>
      )}

      {/* ── 7 TABS THEO ĐÚNG NGUYÊN VĂN FLOWCHART EXCEL ── */}
      <div className="flex items-center gap-1.5 bg-zinc-100 p-1.5 rounded-2xl overflow-x-auto scrollbar-none border border-zinc-200">
        {[
          { id: 'cake_bases', label: '1. Cốt Bánh', icon: Cake, count: config.cakeBases.length },
          { id: 'cream_coatings', label: '2. Kem Phủ Bánh', icon: Layers, count: config.creamCoatings.length },
          { id: 'fillings', label: '3. Nhân Bánh', icon: Utensils, count: config.fillings.length },
          { id: 'packagings', label: '4. Hộp & Bao Bì', icon: Package, count: config.packagings.length },
          { id: 'free_accessories', label: '5. Vật Tư Tặng Kèm', icon: Gift, count: config.freeAccessories.length },
          { id: 'decor_addons', label: '6. Phụ Kiện & Decor', icon: Sparkles, count: config.decorAddons.length },
          { id: 'bom_presets', label: '7. BOM Bánh Sinh Nhật', icon: Boxes, count: config.birthdayBomPresets.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-white/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  isActive ? 'bg-pink-700 text-white' : 'bg-zinc-200 text-zinc-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: CỐT BÁNH */}
      {activeTab === 'cake_bases' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                <Cake className="w-4 h-4 text-pink-600" />
                <span>1. Danh Mục Cốt Bánh & Định Mức BOM Từng Size</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Mỗi size bánh có 1 nút <strong>&ldquo;Cài BOM Cốt Bánh&rdquo;</strong> riêng và bảng tính giá cost tự động từ nguyên liệu kho.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddCakeBase}
              className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Cốt Bánh
            </button>
          </div>

          <div className="space-y-4">
            {config.cakeBases.map((base, baseIdx) => (
              <div key={base.id} className="p-4 rounded-2xl bg-white border border-zinc-200 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-pink-100 text-pink-700 font-black text-xs flex items-center justify-center">
                      {baseIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={base.name}
                      onChange={(e) => handleUpdateCakeBase(baseIdx, 'name', e.target.value)}
                      className="font-black text-sm text-zinc-900 bg-transparent border-b border-dashed border-zinc-300 focus:border-pink-600 focus:outline-none flex-1 min-w-0"
                      placeholder="Tên loại cốt bánh"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddBaseSize(baseIdx)}
                      className="px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Thêm Size
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCakeBase(baseIdx)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                      title="Xóa loại cốt bánh này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {base.sizes.map((sz, szIdx) => (
                    <div
                      key={sz.id}
                      className="p-3 rounded-xl bg-pink-50/40 border border-pink-200/80 space-y-2 flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            value={sz.sizeName}
                            onChange={(e) => {
                              const updatedSizes = [...base.sizes];
                              updatedSizes[szIdx] = { ...sz, sizeName: e.target.value };
                              handleUpdateCakeBase(baseIdx, 'sizes', updatedSizes);
                            }}
                            className="font-bold text-xs text-pink-900 bg-transparent border-b border-transparent focus:border-pink-500 focus:outline-none w-full"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteBaseSize(baseIdx, szIdx)}
                            className="text-zinc-400 hover:text-rose-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Đường kính: Ø{sz.diameterCm}cm</span>
                          <span>{sz.bomIngredients?.length || 0} nguyên liệu</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-pink-200/60 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-600 font-medium">Giá vốn cốt:</span>
                          <span className="font-black text-rose-600">
                            {(sz.baseCost || 0).toLocaleString('vi-VN')}₫
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingBaseBom({
                              baseIndex: baseIdx,
                              sizeIndex: szIdx,
                              baseName: base.name,
                              size: JSON.parse(JSON.stringify(sz)),
                            })
                          }
                          className="w-full py-1.5 rounded-lg bg-white hover:bg-pink-600 hover:text-white text-pink-700 border border-pink-300 font-bold text-xs flex items-center justify-center gap-1 shadow-2xs transition cursor-pointer"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>Cài BOM Size Này</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: KEM PHỦ BÁNH */}
      {activeTab === 'cream_coatings' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-pink-600" />
                <span>2. Danh Mục Kem Phủ & Định Mức BOM Từng Size</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Mỗi size kem phủ có 1 nút <strong>&ldquo;Cài BOM Kem Phủ&rdquo;</strong> riêng và bảng tính giá cost tự động theo công thức kem.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddCreamCoating}
              className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Kem Phủ
            </button>
          </div>

          <div className="space-y-4">
            {config.creamCoatings.map((cream, creamIdx) => (
              <div key={cream.id} className="p-4 rounded-2xl bg-white border border-zinc-200 space-y-3 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-pink-100 text-pink-700 font-black text-xs flex items-center justify-center">
                      {creamIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={cream.name}
                      onChange={(e) => handleUpdateCreamCoating(creamIdx, 'name', e.target.value)}
                      className="font-black text-sm text-zinc-900 bg-transparent border-b border-dashed border-zinc-300 focus:border-pink-600 focus:outline-none flex-1 min-w-0"
                      placeholder="Tên loại kem phủ"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAddCreamSize(creamIdx)}
                      className="px-2.5 py-1 rounded-lg bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" /> Thêm Size Kem
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCreamCoating(creamIdx)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-rose-600 transition cursor-pointer"
                      title="Xóa loại kem phủ này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {cream.sizes.map((sz, szIdx) => (
                    <div
                      key={sz.id}
                      className="p-3 rounded-xl bg-pink-50/40 border border-pink-200/80 space-y-2 flex flex-col justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <input
                            type="text"
                            value={sz.sizeName}
                            onChange={(e) => {
                              const updatedSizes = [...cream.sizes];
                              updatedSizes[szIdx] = { ...sz, sizeName: e.target.value };
                              handleUpdateCreamCoating(creamIdx, 'sizes', updatedSizes);
                            }}
                            className="font-bold text-xs text-pink-900 bg-transparent border-b border-transparent focus:border-pink-500 focus:outline-none w-full"
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteCreamSize(creamIdx, szIdx)}
                            className="text-zinc-400 hover:text-rose-600 p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Đường kính: Ø{sz.diameterCm}cm</span>
                          <span>{sz.bomIngredients?.length || 0} nguyên liệu</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-pink-200/60 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-600 font-medium">Giá vốn kem:</span>
                          <span className="font-black text-rose-600">
                            {(sz.baseCost || 0).toLocaleString('vi-VN')}₫
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setEditingCreamBom({
                              creamIndex: creamIdx,
                              sizeIndex: szIdx,
                              creamName: cream.name,
                              size: JSON.parse(JSON.stringify(sz)),
                            })
                          }
                          className="w-full py-1.5 rounded-lg bg-white hover:bg-pink-600 hover:text-white text-pink-700 border border-pink-300 font-bold text-xs flex items-center justify-center gap-1 shadow-2xs transition cursor-pointer"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>Cài BOM Kem Size Này</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: NHÂN BÁNH */}
      {activeTab === 'fillings' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                <Utensils className="w-4 h-4 text-pink-600" />
                <span>3. Danh Mục Loại Nhân Bánh & Giá Cost</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Nhập trực tiếp giá vốn (cost) của từng loại nhân bánh và phụ thu bán khi khách chọn thêm.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {availableIngredients.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleImportFillingFromInventory(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-800 font-bold text-xs cursor-pointer focus:outline-none max-w-full truncate"
                  defaultValue=""
                >
                  <option value="" disabled>
                    + Nạp từ Kho Vật Tư...
                  </option>
                  {availableIngredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      🍓 {ing.name} (Vốn: {Number(ing.avg_cost || 0).toLocaleString('vi-VN')}₫)
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleAddFilling}
                className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm Nhân Bánh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.fillings.map((fill, idx) => (
              <div key={fill.id} className="p-3.5 rounded-2xl bg-white border border-zinc-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center text-base shrink-0">
                      🍓
                    </span>
                    <input
                      type="text"
                      value={fill.name}
                      placeholder="Tên nhân bánh..."
                      onChange={(e) => handleUpdateFilling(idx, 'name', e.target.value)}
                      className="font-bold text-xs text-zinc-900 bg-transparent border-b border-zinc-200 focus:border-pink-500 focus:outline-none flex-1 min-w-0 py-1"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <label className="flex items-center gap-1 text-[11px] text-zinc-600 font-bold cursor-pointer hover:text-pink-600 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-200">
                      <input
                        type="radio"
                        name="default_filling"
                        checked={!!fill.isDefault}
                        onChange={() => {
                          const updated = config.fillings.map((f, i) => ({ ...f, isDefault: i === idx }));
                          setConfig({ ...config, fillings: updated });
                        }}
                        className="w-3.5 h-3.5 text-pink-600 focus:ring-pink-500 cursor-pointer"
                      />
                      <span>Mặc định</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeleteFilling(idx)}
                      className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer transition"
                      title="Xóa nhân bánh"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-semibold block">Giá Vốn Cost:</span>
                    <input
                      type="text"
                      value={formatCurrencyInput(fill.costPrice || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleUpdateFilling(idx, 'costPrice', parseCurrencyInput(e.target.value))}
                      className="w-full font-black text-rose-600 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:bg-white focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-semibold block">Phụ Thu Bán:</span>
                    <input
                      type="text"
                      value={formatCurrencyInput(fill.extraPrice || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleUpdateFilling(idx, 'extraPrice', parseCurrencyInput(e.target.value))}
                      className="w-full font-black text-amber-700 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:bg-white focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: HỘP VÀ BAO BÌ */}
      {activeTab === 'packagings' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-pink-600" />
                <span>4. Hộp Đựng & Bao Bì Bánh Sinh Nhật</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Nhập trực tiếp từ kho vật tư, giá cost tự động lấy từ giá nhập vào kho.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {availableIngredients.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleImportPackagingFromInventory(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-800 font-bold text-xs cursor-pointer focus:outline-none max-w-full truncate"
                  defaultValue=""
                >
                  <option value="" disabled>
                    + Nạp từ Kho Vật Tư...
                  </option>
                  {availableIngredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      📦 {ing.name} (Vốn: {Number(ing.avg_cost || 0).toLocaleString('vi-VN')}₫)
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleAddPackaging}
                className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm Hộp Mới
              </button>
            </div>
          </div>

          <div className="p-3 bg-pink-50 border border-pink-200 rounded-2xl flex items-center gap-2.5 text-xs text-pink-900">
            <span className="text-base">📦</span>
            <div>
              <span className="font-bold">Cơ chế Hộp & Bao Bì Mặc Định Chung:</span> Hộp được đánh dấu <strong className="text-pink-700 font-bold">Mặc định</strong> sẽ tự động áp dụng chung cho tất cả đơn đặt bánh sinh nhật và công thức BOM Presets (không cần nhân viên chọn tay khi bán hàng). Mọi thay đổi được lưu và đồng bộ tức thì vào Cloud SQL & Local SQL.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.packagings.map((pkg, idx) => (
              <div 
                key={pkg.id} 
                className={`p-3.5 rounded-2xl bg-white border shadow-xs space-y-2.5 transition ${
                  pkg.isDefault 
                    ? 'border-pink-500 ring-2 ring-pink-300/80 bg-pink-50/20' 
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center text-base shrink-0">
                      📦
                    </span>
                    <input
                      type="text"
                      value={pkg.name}
                      placeholder="Tên hộp & bao bì..."
                      onChange={(e) => handleUpdatePackaging(idx, 'name', e.target.value)}
                      className="font-bold text-xs text-zinc-900 bg-transparent border-b border-zinc-200 focus:border-pink-500 focus:outline-none flex-1 min-w-0 py-1"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = config.packagings.map((p, i) => ({ ...p, isDefault: i === idx }));
                        const newConfig = { ...config, packagings: updated };
                        setConfig(newConfig);
                        saveFullCakeBomConfig(newConfig);
                        setSaveSuccess(true);
                        setTimeout(() => setSaveSuccess(false), 2500);
                      }}
                      className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl border transition cursor-pointer ${
                        pkg.isDefault
                          ? 'bg-pink-600 text-white border-pink-600 shadow-2xs'
                          : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:border-pink-300 hover:text-pink-600 hover:bg-pink-50/40'
                      }`}
                      title={pkg.isDefault ? "Hộp này đang được chọn mặc định chung cho toàn quán" : "Bấm để chọn hộp này làm mặc định chung (tự động lưu vào SQL)"}
                    >
                      {pkg.isDefault ? '✓ Mặc định' : 'Chọn mặc định'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePackaging(idx)}
                      className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer transition"
                      title="Xóa bao bì"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-semibold block">Giá Vốn Nhập:</span>
                    <input
                      type="text"
                      value={formatCurrencyInput(pkg.costPrice || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleUpdatePackaging(idx, 'costPrice', parseCurrencyInput(e.target.value))}
                      className="w-full font-black text-rose-600 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:bg-white focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-semibold block">Phụ Thu Bán:</span>
                    <input
                      type="text"
                      value={formatCurrencyInput(pkg.sellingPrice || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleUpdatePackaging(idx, 'sellingPrice', parseCurrencyInput(e.target.value))}
                      className="w-full font-black text-amber-700 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:bg-white focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: VẬT TƯ TẶNG KÈM */}
      {activeTab === 'free_accessories' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                <Gift className="w-4 h-4 text-pink-600" />
                <span>5. Vật Tư Tặng Kèm (Mũ, Nến, Dao, Đĩa...)</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Nhập trực tiếp từ kho vật tư, giá cost là giá nhập kho. Mặc định tự động tặng kèm trong bánh sinh nhật.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {availableIngredients.length > 0 && (
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleImportFreeAccessoryFromInventory(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-pink-50 border border-pink-200 text-pink-800 font-bold text-xs cursor-pointer focus:outline-none max-w-full truncate"
                  defaultValue=""
                >
                  <option value="" disabled>
                    + Nạp từ Kho Vật Tư...
                  </option>
                  {availableIngredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      🎁 {ing.name} (Vốn: {Number(ing.avg_cost || 0).toLocaleString('vi-VN')}₫)
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleAddFreeAccessory}
                className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm Món Tặng Kèm
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.freeAccessories.map((acc, idx) => (
              <div key={acc.id} className="p-3.5 rounded-2xl bg-white border border-zinc-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-pink-50 border border-pink-200 flex items-center justify-center text-base shrink-0">
                      🎁
                    </span>
                    <input
                      type="text"
                      value={acc.name}
                      placeholder="Tên vật tư tặng kèm..."
                      onChange={(e) => handleUpdateFreeAccessory(idx, 'name', e.target.value)}
                      className="font-bold text-xs text-zinc-900 bg-transparent border-b border-zinc-200 focus:border-pink-500 focus:outline-none flex-1 min-w-0 py-1"
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 font-bold cursor-pointer hover:text-pink-600 bg-zinc-50 px-2 py-1 rounded-lg border border-zinc-200">
                      <input
                        type="checkbox"
                        checked={acc.isDefaultIncluded}
                        onChange={(e) => handleUpdateFreeAccessory(idx, 'isDefaultIncluded', e.target.checked)}
                        className="w-3.5 h-3.5 text-pink-600 rounded-md focus:ring-pink-500 cursor-pointer"
                      />
                      <span>Tặng kèm</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleDeleteFreeAccessory(idx)}
                      className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer transition"
                      title="Xóa vật tư tặng kèm"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-semibold block">Số Lượng Tặng:</span>
                    <input
                      type="number"
                      min="1"
                      value={acc.quantityDefault || ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        handleUpdateFreeAccessory(idx, 'quantityDefault', e.target.value === '' ? ('' as any) : Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="w-full font-black text-zinc-900 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs text-center focus:bg-white focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 font-semibold block">Giá Cost Vốn:</span>
                    <input
                      type="text"
                      value={formatCurrencyInput(acc.costPrice || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) =>
                        handleUpdateFreeAccessory(idx, 'costPrice', parseCurrencyInput(e.target.value))
                      }
                      className="w-full font-black text-rose-600 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:bg-white focus:border-pink-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: PHỤ KIỆN VÀ DECOR */}
      {activeTab === 'decor_addons' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-pink-600" />
                <span>6. Phụ Kiện & Decor Trang Trí Thêm (Giữ nguyên)</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Các phụ kiện trang trí cộng thêm như Vương miện ngọc trai, Đèn LED, Topper mica, Quả cầu vàng...
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddDecorAddon}
              className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm Phụ Kiện
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {config.decorAddons.map((dec, idx) => (
              <div key={dec.id} className="p-3.5 rounded-2xl bg-white border border-zinc-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="text"
                      value={dec.icon || '🎁'}
                      onChange={(e) => handleUpdateDecorAddon(idx, 'icon', e.target.value)}
                      className="w-8 h-8 text-center bg-pink-50 rounded-xl text-base border border-pink-200"
                    />
                    <input
                      type="text"
                      value={dec.name}
                      onChange={(e) => handleUpdateDecorAddon(idx, 'name', e.target.value)}
                      className="font-bold text-xs text-zinc-900 bg-transparent border-b border-transparent focus:border-pink-500 focus:outline-none flex-1 min-w-0"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteDecorAddon(idx)}
                    className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Giá Vốn Cost:</span>
                    <input
                      type="text"
                      value={formatCurrencyInput(dec.costPrice || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleUpdateDecorAddon(idx, 'costPrice', parseCurrencyInput(e.target.value))}
                      className="w-full font-black text-rose-600 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-500 block">Giá Bán Thu:</span>
                    <input
                      type="text"
                      value={formatCurrencyInput(dec.sellingPrice || 0)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleUpdateDecorAddon(idx, 'sellingPrice', parseCurrencyInput(e.target.value))}
                      className="w-full font-black text-amber-700 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 text-xs focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 7: BOM BÁNH SINH NHẬT */}
      {activeTab === 'bom_presets' && (
        <div className="space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-pink-600" />
                <span>7. Cấu Hình BOM Bánh Sinh Nhật Chuẩn (Presets)</span>
              </h3>
              <p className="text-xs text-zinc-500">
                Tạo mẫu BOM bánh sinh nhật chuẩn gồm: Cốt bánh + Kem phủ + Nhân + Quà tặng kèm + Decor. Size bánh và Hộp đựng sẽ do nhân viên chọn khi tạo đơn tại POS.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddBomPreset}
              className="px-3 py-1.5 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Tạo Mẫu BOM Mới
            </button>
          </div>

          <div className="space-y-4">
            {config.birthdayBomPresets.map((preset, pIdx) => {
              const currentBase = config.cakeBases.find((b) => b.id === preset.cakeBaseId);
              const currentCream = config.creamCoatings.find((c) => c.id === preset.creamCoatingId);
              // Lấy size mẫu (18cm hoặc size đầu tiên) để tính giá tham khảo trong Admin
              const sampleSize = currentBase?.sizes.find((s) => s.diameterCm === 18) || currentBase?.sizes[0];
              const calc = calculateCakeCostDetails(
                {
                  cakeBaseId: preset.cakeBaseId,
                  cakeBaseSizeId: sampleSize?.id,
                  creamCoatingId: preset.creamCoatingId,
                  fillingId: preset.fillingId,
                  freeAccessoryIds: preset.freeAccessoryIds,
                  decorAddonIds: preset.decorAddonIds,
                  customMarkupPct: preset.targetFoodCostPct || config.targetFoodCostPct,
                },
                config
              );

              return (
                <div
                  key={preset.id}
                  className="p-4 rounded-3xl bg-white border border-zinc-200 shadow-xs space-y-3.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-pink-600 text-white font-black text-xs flex items-center justify-center">
                        {pIdx + 1}
                      </span>
                      <input
                        type="text"
                        value={preset.name}
                        onChange={(e) => handleUpdateBomPreset(pIdx, 'name', e.target.value)}
                        className="font-black text-sm text-zinc-900 bg-transparent border-b border-dashed border-zinc-300 focus:border-pink-600 focus:outline-none flex-1 min-w-0"
                        placeholder="Tên mẫu BOM bánh sinh nhật"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteBomPreset(pIdx)}
                      className="text-zinc-400 hover:text-rose-600 p-1 cursor-pointer self-end sm:self-auto"
                      title="Xóa mẫu BOM này"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* CÁC THÀNH PHẦN CỦA BOM BÁNH SINH NHẬT - 3 CỘT (CỐT, KEM, NHÂN) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-pink-50/50 rounded-2xl border border-pink-100 space-y-1.5">
                      <span className="font-bold text-pink-800 flex items-center gap-1">🍰 Cốt Bánh:</span>
                      <select
                        value={preset.cakeBaseId}
                        onChange={(e) => handleUpdateBomPreset(pIdx, 'cakeBaseId', e.target.value)}
                        className="w-full p-2 rounded-lg bg-white border border-zinc-200 font-bold text-xs"
                      >
                        {config.cakeBases.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-zinc-500 italic">* Size và BOM cốt bánh tự nhận theo size khi đặt bánh</p>
                    </div>

                    <div className="p-3 bg-pink-50/50 rounded-2xl border border-pink-100 space-y-1.5">
                      <span className="font-bold text-pink-800 flex items-center gap-1">🍦 Kem Phủ:</span>
                      <select
                        value={preset.creamCoatingId}
                        onChange={(e) => handleUpdateBomPreset(pIdx, 'creamCoatingId', e.target.value)}
                        className="w-full p-2 rounded-lg bg-white border border-zinc-200 font-bold text-xs"
                      >
                        {config.creamCoatings.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-zinc-500 italic">* BOM kem phủ tự động khớp theo size cốt bánh</p>
                    </div>

                    <div className="p-3 bg-pink-50/50 rounded-2xl border border-pink-100 space-y-1.5">
                      <span className="font-bold text-pink-800 flex items-center gap-1">🍓 Loại Nhân:</span>
                      <select
                        value={preset.fillingId || ''}
                        onChange={(e) => handleUpdateBomPreset(pIdx, 'fillingId', e.target.value)}
                        className="w-full p-2 rounded-lg bg-white border border-zinc-200 font-bold text-xs"
                      >
                        {config.fillings.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} (+{(Number(f.costPrice) || 0).toLocaleString('vi-VN')}₫)
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-zinc-500 italic">* Nhân mứt/hoa quả theo công thức</p>
                    </div>
                  </div>

                  {/* THỐNG KÊ CHI TIẾT VỐN & GIÁ BÁN GỢI Ý THAM KHẢO */}
                  <div className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-3 text-zinc-600">
                      <span className="text-[10px] bg-pink-100 text-pink-800 font-bold px-2 py-0.5 rounded-full border border-pink-200">
                        Ước tính mẫu size {sampleSize?.diameterCm || 18}cm:
                      </span>
                      <div>
                        Cốt: <b className="text-zinc-900">{(Number(calc?.baseCost) || 0).toLocaleString('vi-VN')}₫</b>
                      </div>
                      <div>
                        Kem: <b className="text-zinc-900">{(Number(calc?.creamCost) || 0).toLocaleString('vi-VN')}₫</b>
                      </div>
                      <div>
                        Nhân: <b className="text-zinc-900">{(Number(calc?.fillingCost) || 0).toLocaleString('vi-VN')}₫</b>
                      </div>
                      <div>
                        Quà tặng: <b className="text-zinc-900">{(Number(calc?.freeAccessoriesCost) || 0).toLocaleString('vi-VN')}₫</b>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Cost BOM tham khảo:</span>
                        <span className="font-black text-rose-600 text-sm">
                          {(Number(calc?.totalCost) || 0).toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                      <div className="pl-4 border-l border-zinc-200">
                        <span className="text-[10px] text-pink-700 block font-bold">
                          Giá Bán Gợi Ý (~{preset.targetFoodCostPct || config.targetFoodCostPct}%):
                        </span>
                        <span className="font-black text-pink-700 text-base">
                          {(Number(calc?.suggestedPrice) || 0).toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL CÀI BOM CHO 1 SIZE CỐT BÁNH - DẠNG KÉO DÀI LIỀN MẠCH MOBILE UX */}
      {editingBaseBom && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-zinc-200 p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto my-auto animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center shrink-0">
                  <Cake className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-sm sm:text-base text-zinc-900">
                    Cài Đặt BOM: {editingBaseBom.baseName} — {editingBaseBom.size.sizeName}
                  </h4>
                  <p className="text-[11px] text-zinc-500">
                    Khai báo công thức nguyên liệu chuẩn & thông số nướng lò cho kích thước cốt bánh này
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBaseBom(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* THÔNG SỐ NƯỚNG & GHI CHÚ KỸ THUẬT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl">
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  🔥 Nhiệt Độ Nướng (°C):
                </label>
                <input
                  type="text"
                  value={editingBaseBom.size.bakingTemperature ?? ''}
                  onChange={(e) => {
                    setEditingBaseBom({
                      ...editingBaseBom,
                      size: { ...editingBaseBom.size, bakingTemperature: e.target.value },
                    });
                  }}
                  placeholder="VD: 155 - 160°C"
                  className="w-full text-xs font-bold px-3 py-2 bg-white border border-amber-300 rounded-xl focus:border-pink-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  ⏱️ Thời Gian Nướng (phút):
                </label>
                <input
                  type="text"
                  value={editingBaseBom.size.bakingTimeMinutes ?? ''}
                  onChange={(e) => {
                    setEditingBaseBom({
                      ...editingBaseBom,
                      size: { ...editingBaseBom.size, bakingTimeMinutes: e.target.value },
                    });
                  }}
                  placeholder="VD: 45 - 50 phút"
                  className="w-full text-xs font-bold px-3 py-2 bg-white border border-amber-300 rounded-xl focus:border-pink-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-amber-900 mb-1">
                  💡 Ghi Chú Kỹ Thuật Thợ:
                </label>
                <input
                  type="text"
                  value={editingBaseBom.size.notes ?? ''}
                  onChange={(e) => {
                    setEditingBaseBom({
                      ...editingBaseBom,
                      size: { ...editingBaseBom.size, notes: e.target.value },
                    });
                  }}
                  placeholder="VD: Cắm tăm khô trước khi lấy ra"
                  className="w-full text-xs px-3 py-2 bg-white border border-amber-300 rounded-xl focus:border-pink-500 focus:outline-none"
                />
              </div>
            </div>

            {/* DANH SÁCH THÀNH PHẦN NGUYÊN LIỆU BOM */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-zinc-800 text-xs">
                  Định mức nguyên liệu cấu thành ({editingBaseBom.size.bomIngredients.length} thành phần):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const newItem: CakeBomItem = {
                      name: 'Nguyên liệu mới',
                      unit: 'g',
                      quantity: 50,
                      unitCost: 30,
                      totalCost: 1500,
                    };
                    setEditingBaseBom({
                      ...editingBaseBom,
                      size: {
                        ...editingBaseBom.size,
                        bomIngredients: [...editingBaseBom.size.bomIngredients, newItem],
                      },
                    });
                  }}
                  className="text-xs font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm dòng mới
                </button>
              </div>

              <div className="space-y-2.5">
                {editingBaseBom.size.bomIngredients.map((item, idx) => {
                  const lineCost = item.quantity * item.unitCost;
                  return (
                    <div
                      key={idx}
                      className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2 hover:border-pink-400/60 transition"
                    >
                      {/* Hàng 1: Dropdown chọn nguyên liệu full width hiển thị trọn vẹn tên */}
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-pink-100 text-pink-800 font-black text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        {availableIngredients.length > 0 ? (
                          <select
                            value={item.ingredientId || (availableIngredients.find(i => i.name.toLowerCase() === item.name.toLowerCase())?.id) || ''}
                            onChange={(e) => {
                              const ing = availableIngredients.find((i) => i.id === e.target.value);
                              if (ing) {
                                const updated = [...editingBaseBom.size.bomIngredients];
                                const unitCost = Number(ing.avg_cost) || item.unitCost || 0;
                                updated[idx] = {
                                  ...item,
                                  ingredientId: ing.id,
                                  name: ing.name,
                                  unit: ing.unit || item.unit || 'g',
                                  unitCost: unitCost,
                                  totalCost: item.quantity * unitCost,
                                };
                                setEditingBaseBom({
                                  ...editingBaseBom,
                                  size: { ...editingBaseBom.size, bomIngredients: updated },
                                });
                              }
                            }}
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
                          >
                            <option value="" disabled>-- Chọn nguyên liệu kho --</option>
                            {!availableIngredients.some(i => i.id === item.ingredientId || i.name.toLowerCase() === item.name.toLowerCase()) && (
                              <option value={item.ingredientId || ''}>⚠️ {item.name} ({item.unit})</option>
                            )}
                            {availableIngredients.map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name} ({ing.unit}) • {Number(ing.avg_cost || 0).toLocaleString('vi-VN')}₫
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const updated = [...editingBaseBom.size.bomIngredients];
                              updated[idx] = { ...item, name: e.target.value };
                              setEditingBaseBom({
                                ...editingBaseBom,
                                size: { ...editingBaseBom.size, bomIngredients: updated },
                              });
                            }}
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold text-xs text-zinc-900 focus:border-pink-500 focus:outline-none"
                            placeholder="Tên nguyên liệu..."
                          />
                        )}
                      </div>

                      {/* Hàng 2: Định lượng, đơn vị, đơn giá, thành tiền và nút xóa */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-200/60 text-xs">
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-[11px] font-medium text-zinc-500 shrink-0">Định lượng:</span>
                          <input
                            type="number"
                            min={0.1}
                            step="any"
                            value={item.quantity ?? ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = e.target.value;
                              const qty = val === '' ? ('' as any) : (parseFloat(val) || 0);
                              const updated = [...editingBaseBom.size.bomIngredients];
                              updated[idx] = { ...item, quantity: qty, totalCost: (typeof qty === 'number' ? qty : 0) * item.unitCost };
                              setEditingBaseBom({
                                ...editingBaseBom,
                                size: { ...editingBaseBom.size, bomIngredients: updated },
                              });
                            }}
                            className="w-20 p-1.5 bg-white border border-zinc-200 rounded-lg font-black text-center text-xs focus:ring-1 focus:ring-pink-500"
                          />
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => {
                              const updated = [...editingBaseBom.size.bomIngredients];
                              updated[idx] = { ...item, unit: e.target.value };
                              setEditingBaseBom({
                                ...editingBaseBom,
                                size: { ...editingBaseBom.size, bomIngredients: updated },
                              });
                            }}
                            className="w-14 p-1.5 bg-white border border-zinc-200 rounded-lg font-bold text-center text-xs text-zinc-600 focus:ring-1 focus:ring-pink-500"
                            placeholder="Đơn vị"
                          />
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] text-zinc-400 block leading-tight">Thành tiền</span>
                            <span className="font-black text-rose-600 text-xs">
                              {(Number(lineCost) || 0).toLocaleString('vi-VN')}₫
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = editingBaseBom.size.bomIngredients.filter((_, i) => i !== idx);
                              setEditingBaseBom({
                                ...editingBaseBom,
                                size: { ...editingBaseBom.size, bomIngredients: updated },
                              });
                            }}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer transition"
                            title="Xóa nguyên liệu này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Nút thêm từ kho nhanh */}
              {availableIngredients.length > 0 && (
                <div className="pt-1">
                  <select
                    onChange={(e) => {
                      const ing = availableIngredients.find((i) => i.id === e.target.value);
                      if (ing) {
                        const newItem: CakeBomItem = {
                          ingredientId: ing.id,
                          name: ing.name,
                          unit: ing.unit || 'g',
                          quantity: 100,
                          unitCost: Number(ing.avg_cost) || 50,
                          totalCost: 100 * (Number(ing.avg_cost) || 50),
                        };
                        setEditingBaseBom({
                          ...editingBaseBom,
                          size: {
                            ...editingBaseBom.size,
                            bomIngredients: [...editingBaseBom.size.bomIngredients, newItem],
                          },
                        });
                        e.target.value = '';
                      }
                    }}
                    className="w-full p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 font-bold text-xs cursor-pointer border border-zinc-200"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      + Bấm để chọn thêm nguyên liệu từ Kho Vật Tư...
                    </option>
                    {availableIngredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit}) • {Number(i.avg_cost || 0).toLocaleString('vi-VN')}₫
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* TỔNG KẾT VỐN & NÚT BẤM (CUỐI TRANG CUỘN, KHÔNG BỊ CỐ ĐỊNH CHE CHẮN) */}
            <div className="p-3.5 bg-pink-50/80 rounded-2xl border border-pink-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pink-900">Tổng Vốn Cốt Bánh (BOM):</span>
                <span className="font-black text-rose-600 text-lg">
                  {(
                    Number(
                      editingBaseBom.size.bomIngredients.reduce(
                        (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0),
                        0
                      )
                    ) || 0
                  ).toLocaleString('vi-VN')}
                  ₫
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingBaseBom(null)}
                className="flex-1 py-3 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50 text-xs cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveBaseBomModal}
                className="flex-2 py-3 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-black text-xs cursor-pointer shadow-md shadow-pink-600/20"
              >
                Lưu Công Thức BOM Cốt Bánh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CÀI BOM CHO 1 SIZE KEM PHỦ - DẠNG KÉO DÀI LIỀN MẠCH MOBILE UX */}
      {editingCreamBom && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-zinc-200 p-4 sm:p-6 space-y-4 max-h-[92vh] overflow-y-auto my-auto animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-sm sm:text-base text-zinc-900">
                    Cài Đặt BOM Kem: {editingCreamBom.creamName} — {editingCreamBom.size.sizeName}
                  </h4>
                  <p className="text-[11px] text-zinc-500">
                    Khai báo công thức nguyên liệu kem phủ chuẩn cho kích thước bánh này
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCreamBom(null)}
                className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DANH SÁCH THÀNH PHẦN NGUYÊN LIỆU KEM BOM */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-zinc-800 text-xs">
                  Định mức nguyên liệu cấu thành ({editingCreamBom.size.bomIngredients.length} thành phần):
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const newItem: CakeBomItem = {
                      name: 'Nguyên liệu kem mới',
                      unit: 'g',
                      quantity: 50,
                      unitCost: 50,
                      totalCost: 2500,
                    };
                    setEditingCreamBom({
                      ...editingCreamBom,
                      size: {
                        ...editingCreamBom.size,
                        bomIngredients: [...editingCreamBom.size.bomIngredients, newItem],
                      },
                    });
                  }}
                  className="text-xs font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm dòng mới
                </button>
              </div>

              <div className="space-y-2.5">
                {editingCreamBom.size.bomIngredients.map((item, idx) => {
                  const lineCost = item.quantity * item.unitCost;
                  return (
                    <div
                      key={idx}
                      className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2 hover:border-pink-400/60 transition"
                    >
                      {/* Hàng 1: Dropdown chọn nguyên liệu full width hiển thị trọn vẹn tên */}
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-pink-100 text-pink-800 font-black text-[10px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        {availableIngredients.length > 0 ? (
                          <select
                            value={item.ingredientId || (availableIngredients.find(i => i.name.toLowerCase() === item.name.toLowerCase())?.id) || ''}
                            onChange={(e) => {
                              const ing = availableIngredients.find((i) => i.id === e.target.value);
                              if (ing) {
                                const updated = [...editingCreamBom.size.bomIngredients];
                                const unitCost = Number(ing.avg_cost) || item.unitCost || 0;
                                updated[idx] = {
                                  ...item,
                                  ingredientId: ing.id,
                                  name: ing.name,
                                  unit: ing.unit || item.unit || 'g',
                                  unitCost: unitCost,
                                  totalCost: item.quantity * unitCost,
                                };
                                setEditingCreamBom({
                                  ...editingCreamBom,
                                  size: { ...editingCreamBom.size, bomIngredients: updated },
                                });
                              }
                            }}
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-pink-500 cursor-pointer"
                          >
                            <option value="" disabled>-- Chọn nguyên liệu kho --</option>
                            {!availableIngredients.some(i => i.id === item.ingredientId || i.name.toLowerCase() === item.name.toLowerCase()) && (
                              <option value={item.ingredientId || ''}>⚠️ {item.name} ({item.unit})</option>
                            )}
                            {availableIngredients.map((ing) => (
                              <option key={ing.id} value={ing.id}>
                                {ing.name} ({ing.unit}) • {Number(ing.avg_cost || 0).toLocaleString('vi-VN')}₫
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const updated = [...editingCreamBom.size.bomIngredients];
                              updated[idx] = { ...item, name: e.target.value };
                              setEditingCreamBom({
                                ...editingCreamBom,
                                size: { ...editingCreamBom.size, bomIngredients: updated },
                              });
                            }}
                            className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold text-xs text-zinc-900 focus:border-pink-500 focus:outline-none"
                            placeholder="Tên nguyên liệu kem..."
                          />
                        )}
                      </div>

                      {/* Hàng 2: Định lượng, đơn vị, đơn giá, thành tiền và nút xóa */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-200/60 text-xs">
                        <div className="flex items-center gap-1.5 flex-1">
                          <span className="text-[11px] font-medium text-zinc-500 shrink-0">Định lượng:</span>
                          <input
                            type="number"
                            min={0.1}
                            step="any"
                            value={item.quantity ?? ''}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = e.target.value;
                              const qty = val === '' ? ('' as any) : (parseFloat(val) || 0);
                              const updated = [...editingCreamBom.size.bomIngredients];
                              updated[idx] = { ...item, quantity: qty, totalCost: (typeof qty === 'number' ? qty : 0) * item.unitCost };
                              setEditingCreamBom({
                                ...editingCreamBom,
                                size: { ...editingCreamBom.size, bomIngredients: updated },
                              });
                            }}
                            className="w-20 p-1.5 bg-white border border-zinc-200 rounded-lg font-black text-center text-xs focus:ring-1 focus:ring-pink-500"
                          />
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => {
                              const updated = [...editingCreamBom.size.bomIngredients];
                              updated[idx] = { ...item, unit: e.target.value };
                              setEditingCreamBom({
                                ...editingCreamBom,
                                size: { ...editingCreamBom.size, bomIngredients: updated },
                              });
                            }}
                            className="w-14 p-1.5 bg-white border border-zinc-200 rounded-lg font-bold text-center text-xs text-zinc-600 focus:ring-1 focus:ring-pink-500"
                            placeholder="Đơn vị"
                          />
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <div className="text-right">
                            <span className="text-[10px] text-zinc-400 block leading-tight">Thành tiền</span>
                            <span className="font-black text-rose-600 text-xs">
                              {(Number(lineCost) || 0).toLocaleString('vi-VN')}₫
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = editingCreamBom.size.bomIngredients.filter((_, i) => i !== idx);
                              setEditingCreamBom({
                                ...editingCreamBom,
                                size: { ...editingCreamBom.size, bomIngredients: updated },
                              });
                            }}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer transition"
                            title="Xóa nguyên liệu này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Nút thêm từ kho nhanh */}
              {availableIngredients.length > 0 && (
                <div className="pt-1">
                  <select
                    onChange={(e) => {
                      const ing = availableIngredients.find((i) => i.id === e.target.value);
                      if (ing) {
                        const newItem: CakeBomItem = {
                          ingredientId: ing.id,
                          name: ing.name,
                          unit: ing.unit || 'g',
                          quantity: 100,
                          unitCost: Number(ing.avg_cost) || 50,
                          totalCost: 100 * (Number(ing.avg_cost) || 50),
                        };
                        setEditingCreamBom({
                          ...editingCreamBom,
                          size: {
                            ...editingCreamBom.size,
                            bomIngredients: [...editingCreamBom.size.bomIngredients, newItem],
                          },
                        });
                        e.target.value = '';
                      }
                    }}
                    className="w-full p-2 rounded-xl bg-zinc-100 hover:bg-zinc-200/80 text-zinc-700 font-bold text-xs cursor-pointer border border-zinc-200"
                    defaultValue=""
                  >
                    <option value="" disabled>
                      + Bấm để chọn thêm nguyên liệu từ Kho Vật Tư...
                    </option>
                    {availableIngredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.unit}) • {Number(i.avg_cost || 0).toLocaleString('vi-VN')}₫
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* TỔNG KẾT VỐN & NÚT BẤM (CUỐI TRANG CUỘN, KHÔNG BỊ CỐ ĐỊNH CHE CHẮN) */}
            <div className="p-3.5 bg-pink-50/80 rounded-2xl border border-pink-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-pink-900">Tổng Vốn Kem Phủ (BOM):</span>
                <span className="font-black text-rose-600 text-lg">
                  {(
                    Number(
                      editingCreamBom.size.bomIngredients.reduce(
                        (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0),
                        0
                      )
                    ) || 0
                  ).toLocaleString('vi-VN')}
                  ₫
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingCreamBom(null)}
                className="flex-1 py-3 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50 text-xs cursor-pointer"
              >
                Hủy Bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveCreamBomModal}
                className="flex-2 py-3 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-black text-xs cursor-pointer shadow-md shadow-pink-600/20"
              >
                Lưu Công Thức BOM Kem Phủ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
