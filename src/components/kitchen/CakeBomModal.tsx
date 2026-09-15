'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, CheckCircle2, Circle, Scale, RefreshCw, Printer, Info, ChefHat, Sparkles, Package, Gift } from 'lucide-react';
import { getCakeCostingConfig } from '@/lib/utils/customCakeCosting';
import { CakeSizeOption, CakeSizeBomItem } from '@/lib/constants/cakeCostingData';
import { parsePreorderFromNotes } from '@/lib/supabase/realtimeSync';
import { printHtml } from '@/lib/utils/printHelper';
import { getFullCakeBomConfig } from '@/lib/utils/cakeBomManager';
import { CakeOrderSpec, CakeBomItem } from '@/lib/types/bakery-bom';

export interface CakeBomModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
}

export const CakeBomModal: React.FC<CakeBomModalProps> = ({ isOpen, onClose, order }) => {
  const [activeTab, setActiveTab] = useState<'base' | 'cream' | 'accessories'>('base');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [batchMultiplier, setBatchMultiplier] = useState<number>(1);

  // Khởi tạo multiplier theo số lượng trong đơn khi mở
  useEffect(() => {
    if (order) {
      const mainItem = order.items?.[0];
      const qty = Number(mainItem?.quantity) || 1;
      setBatchMultiplier(Math.max(1, qty));
      setCheckedItems({});
      setActiveTab('base');
    }
  }, [order?.id, order?.order_number]);

  const cakeCostingConfig = useMemo(() => getCakeCostingConfig(), [isOpen]);
  const fullBomConfig = useMemo(() => getFullCakeBomConfig(), [isOpen]);

  if (!isOpen || !order) return null;

  const spec: CakeOrderSpec | undefined = order.cake_order_spec || order.items?.[0]?.cake_order_spec;
  const mainItem = order.items?.[0];
  const fromN = parsePreorderFromNotes(order.notes);
  const cakeName = order.cake_name || fromN.cake_name || mainItem?.product_name_snapshot || 'Bánh Sinh Nhật';
  const rawSize = spec?.sizeName || order.cake_size || order.size || fromN.cake_size || '';
  const flavor = spec?.cakeBase?.name || order.flavor || fromN.flavor || 'Cốt Vani truyền thống';
  const cream = spec?.creamCoating?.name || order.cream || fromN.cream || 'Kem tươi Topping thanh mát';
  const filling = spec?.filling?.name || order.filling || fromN.filling;
  const packaging = spec?.packaging?.name || order.packaging || fromN.packaging;
  const orderNum = order.order_number || order.orderNumber || order.id || 'ĐƠN MỚI';

  // 1. LẤY NGUYÊN LIỆU CỐT BÁNH
  let baseBomIngredients: CakeBomItem[] = [];
  if (spec?.tiers && spec.tiers.length > 1) {
    const ingMap = new Map<string, CakeBomItem>();
    spec.tiers.forEach((t) => {
      const ings = t.cakeBase?.bomIngredients || [];
      ings.forEach((ing) => {
        const key = ing.id || ing.name;
        if (ingMap.has(key)) {
          const existing = ingMap.get(key)!;
          existing.quantity += Number(ing.quantity || 0);
          existing.totalCost = (existing.totalCost || 0) + (ing.totalCost || 0);
        } else {
          ingMap.set(key, { ...ing });
        }
      });
    });
    baseBomIngredients = Array.from(ingMap.values());
  } else if (spec?.cakeBase?.bomIngredients && spec.cakeBase.bomIngredients.length > 0) {
    baseBomIngredients = spec.cakeBase.bomIngredients;
  } else {
    // Fallback qua legacy config
    let matchedSize: CakeSizeOption | null = null;
    const allSizes = cakeCostingConfig.sizes || [];
    const diamMatch = rawSize.match(/(\d+)\s*cm/i) || cakeName.match(/(\d+)\s*cm/i);
    if (diamMatch && diamMatch[1]) {
      const diamNum = parseInt(diamMatch[1], 10);
      matchedSize = allSizes.find((s) => s.diameterCm === diamNum) || null;
    }
    if (!matchedSize && rawSize) {
      matchedSize = allSizes.find(
        (s) => s.name.toLowerCase().includes(rawSize.toLowerCase()) || rawSize.toLowerCase().includes(s.name.toLowerCase())
      ) || null;
    }
    if (!matchedSize) {
      matchedSize = allSizes.find((s) => s.isDefault) || allSizes[2] || allSizes[0] || null;
    }
    baseBomIngredients = (matchedSize?.bomIngredients || []).map((it) => ({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      unitCost: it.unitCost || 0,
      totalCost: it.totalCost || 0,
    }));
  }

  // 2. LẤY NGUYÊN LIỆU KEM PHỦ
  let creamBomIngredients: CakeBomItem[] = [];
  if (spec?.tiers && spec.tiers.length > 1) {
    const ingMap = new Map<string, CakeBomItem>();
    spec.tiers.forEach((t) => {
      const ings = t.creamCoating?.bomIngredients || [];
      ings.forEach((ing) => {
        const key = ing.id || ing.name;
        if (ingMap.has(key)) {
          const existing = ingMap.get(key)!;
          existing.quantity += Number(ing.quantity || 0);
          existing.totalCost = (existing.totalCost || 0) + (ing.totalCost || 0);
        } else {
          ingMap.set(key, { ...ing });
        }
      });
    });
    creamBomIngredients = Array.from(ingMap.values());
  } else if (spec?.creamCoating?.bomIngredients && spec.creamCoating.bomIngredients.length > 0) {
    creamBomIngredients = spec.creamCoating.bomIngredients;
  } else if (fullBomConfig.creamCoatings?.[0]?.sizes?.[0]?.bomIngredients) {
    creamBomIngredients = fullBomConfig.creamCoatings[0].sizes[0].bomIngredients;
  }

  const freeAccessories = spec?.freeAccessories || [];
  const decorAddons = spec?.decorAddons || [];
  const cakeMessage = spec?.cakeMessage || order.cake_message || fromN.cake_message;
  const decorNotes = spec?.decorNotes || fromN.special_request || '';

  const currentIngredients = activeTab === 'base' ? baseBomIngredients : activeTab === 'cream' ? creamBomIngredients : [];

  const toggleCheck = (idOrName: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [idOrName]: !prev[idOrName],
    }));
  };

  const handleResetChecklist = () => {
    setCheckedItems({});
  };

  // In công thức BOM ra máy in nhiệt hoặc A4 cho thợ bếp
  const handlePrintBom = () => {
    const renderTableRows = (items: CakeBomItem[]) => {
      return items
        .map((it, idx) => {
          const scaledQty = Math.round(Number(it.quantity || 0) * batchMultiplier * 10) / 10;
          return `
            <tr style="border-bottom: 1px solid #ddd;">
              <td style="padding: 5px 4px; font-weight: bold; font-size: 11pt;">${idx + 1}. ${it.name}</td>
              <td style="padding: 5px 4px; text-align: right; font-weight: 900; font-size: 12pt; color: #b91c1c;">${scaledQty} ${it.unit}</td>
            </tr>
          `;
        })
        .join('');
    };

    const baseRows = renderTableRows(baseBomIngredients);
    const creamRows = renderTableRows(creamBomIngredients);

    const printContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 10px; max-width: 80mm; margin: 0 auto; color: #000;">
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <h2 style="margin: 0; font-size: 13pt; font-weight: 900; text-transform: uppercase;">CÔNG THỨC BOM TIỆM BÁNH</h2>
          <div style="font-size: 10pt; font-weight: bold; margin-top: 4px;">Đơn: #${orderNum}</div>
        </div>
        <div style="font-size: 10pt; margin-bottom: 8px; line-height: 1.4;">
          <div><b>Bánh:</b> ${cakeName}</div>
          <div><b>Kích thước:</b> ${rawSize || 'Tiêu chuẩn'}</div>
          <div><b>Cốt:</b> ${flavor}</div>
          <div><b>Kem:</b> ${cream}</div>
          ${filling ? `<div><b>Nhân:</b> 🍓 ${filling}</div>` : ''}
          ${packaging ? `<div><b>Hộp:</b> 📦 ${packaging}</div>` : ''}
          ${cakeMessage ? `<div><b>Ghi chữ:</b> "<i>${cakeMessage}</i>"</div>` : ''}
          <div><b>Số lượng mẻ làm:</b> <span style="font-size: 12pt; font-weight: 900; color: #b91c1c;">${batchMultiplier} cái</span></div>
        </div>

        <!-- 1. BẢNG CỐT BÁNH -->
        <div style="margin-top: 8px; border-top: 1px solid #000; padding-top: 6px;">
          <div style="font-weight: 900; font-size: 10pt; text-transform: uppercase; color: #831843;">🎂 1. ĐỊNH LƯỢNG CỐT BÁNH</div>
          <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
            <thead>
              <tr style="background: #eee; font-size: 8.5pt;">
                <th style="padding: 4px; text-align: left;">Nguyên liệu</th>
                <th style="padding: 4px; text-align: right;">Định lượng</th>
              </tr>
            </thead>
            <tbody>
              ${baseRows}
            </tbody>
          </table>
        </div>

        <!-- 2. BẢNG KEM PHỦ -->
        ${creamBomIngredients.length > 0 ? `
          <div style="margin-top: 10px; border-top: 1px solid #000; padding-top: 6px;">
            <div style="font-weight: 900; font-size: 10pt; text-transform: uppercase; color: #065f46;">🍦 2. ĐỊNH LƯỢNG KEM PHỦ</div>
            <table style="width: 100%; border-collapse: collapse; margin-top: 4px;">
              <thead>
                <tr style="background: #eee; font-size: 8.5pt;">
                  <th style="padding: 4px; text-align: left;">Nguyên liệu</th>
                  <th style="padding: 4px; text-align: right;">Định lượng</th>
                </tr>
              </thead>
              <tbody>
                ${creamRows}
              </tbody>
            </table>
          </div>
        ` : ''}

        <!-- 3. PHỤ KIỆN & QUÀ TẶNG KÈM -->
        ${(freeAccessories.length > 0 || decorAddons.length > 0) ? `
          <div style="margin-top: 10px; border-top: 1px solid #000; padding-top: 6px; font-size: 9pt;">
            <div style="font-weight: 900; text-transform: uppercase;">🎁 3. VẬT TƯ & PHỤ KIỆN TẶNG KÈM:</div>
            <ul style="margin: 4px 0 0 16px; padding: 0;">
              ${freeAccessories.map((a) => `<li>${a.name} (${a.quantity || 1})</li>`).join('')}
              ${decorAddons.map((d) => `<li>${d.name}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div style="margin-top: 12px; font-size: 8pt; text-align: center; color: #666; border-top: 1px dashed #999; padding-top: 6px;">
          Nướng 155-160°C trong 45-50 phút • Kiểm tra tăm khô trước khi lấy ra
        </div>
      </div>
    `;

    printHtml(printContent, {
      title: `BOM_${orderNum}`,
      pageSize: '80mm',
    });
  };

  const totalIngredientsCount = currentIngredients.length;
  const checkedCount = currentIngredients.filter((it, idx) => checkedItems[`${activeTab}-${it.id || it.name}-${idx}`]).length;
  const isAllChecked = totalIngredientsCount > 0 && checkedCount === totalIngredientsCount;

  return (
    <div className="fixed inset-0 z-[10000020] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-pink-500/40 rounded-3xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white animate-in zoom-in-95 duration-150 my-auto">
        
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-pink-500/20 text-pink-400 border border-pink-500/40 flex items-center justify-center shadow-xs shrink-0">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm sm:text-base text-pink-300 uppercase tracking-tight">
                  Công Thức Định Mức BOM
                </span>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-amber-300 border border-zinc-700">
                  #{orderNum}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Định mức nguyên vật liệu chuẩn theo cơ chế flowchart tiệm bánh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 rounded-xl hover:bg-zinc-800 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thông tin bánh & Bộ nhân hệ số mẻ */}
        <div className="bg-zinc-950 p-3.5 rounded-2xl border border-zinc-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-black text-base text-zinc-100 uppercase leading-snug">
                {cakeName}
              </h3>
              {spec?.tiers && spec.tiers.length > 1 ? (
                <div className="mt-2 space-y-1.5">
                  <div className="text-[11px] font-black text-pink-400 uppercase tracking-wider">
                    🎂 Cấu Trúc Bánh {spec.tiers.length} Tầng:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                    {spec.tiers.map((t, idx) => (
                      <div key={idx} className="bg-zinc-900/90 p-2 rounded-xl border border-zinc-800 text-xs">
                        <div className="font-black text-amber-300 flex items-center justify-between pb-1 border-b border-zinc-800">
                          <span>{t.tierName}</span>
                          <span className="text-zinc-300 text-[11px] font-bold bg-zinc-800 px-1.5 py-0.5 rounded">{t.sizeName}</span>
                        </div>
                        <div className="text-[11px] text-zinc-300 mt-1 space-y-0.5">
                          <div>🌾 Cốt: <span className="font-semibold text-zinc-100">{t.cakeBase?.name || 'Vani'}</span></div>
                          <div>🍦 Kem: <span className="font-semibold text-zinc-100">{t.creamCoating?.name || 'Kem tươi'}</span></div>
                          {t.filling?.name && (
                            <div>🍓 Nhân: <span className="font-semibold text-pink-300">{t.filling.name}</span></div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                  <span className="px-2.5 py-0.5 rounded-lg bg-pink-950/80 text-pink-300 border border-pink-700/80 font-black">
                    📏 {rawSize || 'Size tiêu chuẩn'}
                  </span>
                  <span className="text-zinc-400 font-semibold">
                    🌾 {flavor}
                  </span>
                  <span className="text-zinc-400 font-semibold">
                    🍦 {cream}
                  </span>
                </div>
              )}
            </div>

            {/* Điều chỉnh số lượng mẻ làm */}
            <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-700 self-start sm:self-center shrink-0">
              <span className="text-[11px] text-zinc-400 font-bold shrink-0">Mẻ làm:</span>
              <button
                type="button"
                onClick={() => setBatchMultiplier((prev) => Math.max(1, prev - 1))}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-black text-sm flex items-center justify-center text-zinc-200 transition cursor-pointer active:scale-90"
                title="Giảm số lượng mẻ bánh"
              >
                -
              </button>
              <span className="font-mono font-black text-base text-pink-400 w-6 text-center">
                {batchMultiplier}
              </span>
              <button
                type="button"
                onClick={() => setBatchMultiplier((prev) => prev + 1)}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-black text-sm flex items-center justify-center text-zinc-200 transition cursor-pointer active:scale-90"
                title="Tăng số lượng mẻ bánh"
              >
                +
              </button>
              <span className="text-[11px] text-zinc-400 font-bold">cái</span>
            </div>
          </div>

          {/* Ghi chú chữ & Dặn dò nếu có */}
          {(cakeMessage || decorNotes) && (
            <div className="p-2.5 rounded-xl bg-pink-950/30 border border-pink-900/50 text-xs space-y-1">
              {cakeMessage && (
                <div className="text-pink-200 font-bold">
                  ✍️ Chữ ghi: &ldquo;{cakeMessage}&rdquo;
                </div>
              )}
              {decorNotes && (
                <div className="text-zinc-400 italic text-[11px]">
                  💡 Dặn thợ: {decorNotes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TABS CHUYỂN ĐỔI: CỐT BÁNH / KEM PHỦ / BAO BÌ & PHỤ KIỆN */}
        <div className="flex rounded-xl bg-zinc-950 p-1 border border-zinc-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('base')}
            className={`flex-1 py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'base' ? 'bg-pink-600 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🎂 Cốt Bánh ({baseBomIngredients.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cream')}
            className={`flex-1 py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'cream' ? 'bg-pink-600 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🍦 Kem Phủ ({creamBomIngredients.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('accessories')}
            className={`flex-1 py-1.5 rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === 'accessories' ? 'bg-pink-600 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🎁 Bao Bì & Quà Tặng</span>
          </button>
        </div>

        {/* NỘI DUNG THEO TAB */}
        {activeTab !== 'accessories' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-zinc-300 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-pink-400" />
                  Định Mức Cân Nguyên Liệu ({totalIngredientsCount})
                </span>
                {checkedCount > 0 && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isAllChecked ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-300'
                  }`}>
                    Đã cân {checkedCount}/{totalIngredientsCount}
                  </span>
                )}
              </div>
              {checkedCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetChecklist}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 font-bold cursor-pointer transition"
                >
                  <RefreshCw className="w-3 h-3" /> Đặt lại
                </button>
              )}
            </div>

            {currentIngredients.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-400 text-xs">
                Chưa có công thức BOM cho phần này. Bạn có thể cài đặt trong Quản trị &gt; Định mức đặt bánh.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                <div className="max-h-[35vh] overflow-y-auto divide-y divide-zinc-800/80">
                  {currentIngredients.map((item, idx) => {
                    const itemId = `${activeTab}-${item.id || item.name}-${idx}`;
                    const isChecked = !!checkedItems[itemId];
                    const scaledQty = Math.round(Number(item.quantity || 0) * batchMultiplier * 10) / 10;

                    return (
                      <div
                        key={itemId}
                        onClick={() => toggleCheck(itemId)}
                        className={`p-2.5 sm:px-3.5 flex items-center justify-between gap-3 cursor-pointer transition select-none ${
                          isChecked
                            ? 'bg-emerald-950/20 text-zinc-400'
                            : 'hover:bg-zinc-900/90 text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <button
                            type="button"
                            className="shrink-0 transition"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCheck(itemId);
                            }}
                          >
                            {isChecked ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <Circle className="w-5 h-5 text-zinc-600 hover:text-zinc-400" />
                            )}
                          </button>
                          <span
                            className={`text-xs font-bold truncate ${
                              isChecked ? 'line-through text-zinc-500' : 'text-zinc-100'
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>

                        <div className="flex items-baseline gap-1 shrink-0 text-right">
                          <span
                            className={`font-mono font-black text-sm sm:text-base ${
                              isChecked ? 'text-zinc-500' : 'text-pink-400'
                            }`}
                          >
                            {scaledQty}
                          </span>
                          <span className="text-xs font-bold text-zinc-400">
                            {item.unit}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* TAB BAO BÌ & PHỤ KIỆN & QUÀ TẶNG */
          <div className="space-y-3">
            <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-2 text-xs">
              <div className="font-black text-pink-300 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-pink-400" />
                <span>Hộp & Bao Bì Đóng Gói</span>
              </div>
              <div className="text-zinc-200 font-bold pl-5">
                {packaging || 'Hộp giấy tiêu chuẩn + Đế lót bánh'}
              </div>
            </div>

            {freeAccessories.length > 0 && (
              <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-2 text-xs">
                <div className="font-black text-amber-300 flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-amber-400" />
                  <span>Vật Tư Tặng Kèm ({freeAccessories.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pl-2">
                  {freeAccessories.map((acc, i) => (
                    <div key={i} className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                      <span className="text-zinc-200 font-semibold">{acc.name}</span>
                      <span className="font-mono text-amber-400 font-black">x{acc.quantity || 1}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {decorAddons.length > 0 && (
              <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800 space-y-2 text-xs">
                <div className="font-black text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Phụ Kiện Decor Đặt Thêm ({decorAddons.length})</span>
                </div>
                <div className="flex flex-wrap gap-1.5 pl-2">
                  {decorAddons.map((addon, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-purple-950/60 text-purple-200 border border-purple-700/60 font-bold">
                      {addon.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hướng dẫn kỹ thuật nướng bánh */}
        <div className="p-3 bg-amber-950/20 rounded-2xl border border-amber-800/40 text-[11px] text-amber-200/90 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <b>Lưu ý kỹ thuật:</b> Nướng cốt bánh ở nhiệt độ <b>155°C - 160°C</b> trong khoảng <b>45 - 50 phút</b>. Đánh kem ở tốc độ vừa để kem mịn, tránh tách nước.
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={handlePrintBom}
            className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-xs"
            title="In công thức BOM dán lên bàn bếp"
          >
            <Printer className="w-4 h-4 text-amber-400" />
            <span>In Toàn Bộ BOM</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-black text-xs transition cursor-pointer active:scale-95 shadow-md shadow-pink-600/30"
          >
            Đã Nắm Rõ • Đóng
          </button>
        </div>

      </div>
    </div>
  );
};

export default CakeBomModal;
