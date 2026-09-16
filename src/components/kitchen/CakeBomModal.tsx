'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, CheckCircle2, Circle, Scale, RefreshCw, Printer, Info, ChefHat, 
  Sparkles, Package, Gift, Flame, Clock, Layers, ChevronRight, Check
} from 'lucide-react';
import { getCakeCostingConfig } from '@/lib/utils/customCakeCosting';
import { CakeSizeOption } from '@/lib/constants/cakeCostingData';
import { parsePreorderFromNotes } from '@/lib/supabase/realtimeSync';
import { printHtml } from '@/lib/utils/printHelper';
import { getFullCakeBomConfig } from '@/lib/utils/cakeBomManager';
import { CakeOrderSpec, CakeBomItem, CakeTierSpec } from '@/lib/types/bakery-bom';

export interface CakeBomModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  initialTierIndex?: number | 'all';
  initialTab?: 'base' | 'cream' | 'accessories';
}

export const CakeBomModal: React.FC<CakeBomModalProps> = ({ 
  isOpen, 
  onClose, 
  order,
  initialTierIndex = 'all',
  initialTab = 'base'
}) => {
  const [activeTab, setActiveTab] = useState<'base' | 'cream' | 'accessories'>(initialTab);
  const [selectedTierTab, setSelectedTierTab] = useState<number | 'all'>(initialTierIndex);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [batchMultiplier, setBatchMultiplier] = useState<number>(1);

  // Khởi tạo multiplier theo số lượng trong đơn khi mở
  useEffect(() => {
    if (order) {
      const mainItem = order.items?.[0];
      const qty = Number(mainItem?.quantity) || 1;
      setBatchMultiplier(Math.max(1, qty));
      setCheckedItems({});
      setActiveTab(initialTab || 'base');
      setSelectedTierTab(initialTierIndex !== undefined ? initialTierIndex : 'all');
    }
  }, [order?.id, order?.order_number, initialTierIndex, initialTab]);

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

  const isMultiTier = Boolean(spec?.tiers && spec.tiers.length > 1);
  const tiers: CakeTierSpec[] = spec?.tiers || [];

  // 1. LẤY NGUYÊN LIỆU CỐT BÁNH TỔNG HỢP TOÀN BỘ
  let combinedBaseBom: CakeBomItem[] = [];
  if (isMultiTier) {
    const ingMap = new Map<string, CakeBomItem>();
    tiers.forEach((t) => {
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
    combinedBaseBom = Array.from(ingMap.values());
  } else if (spec?.cakeBase?.bomIngredients && spec.cakeBase.bomIngredients.length > 0) {
    combinedBaseBom = spec.cakeBase.bomIngredients;
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
    combinedBaseBom = (matchedSize?.bomIngredients || []).map((it) => ({
      id: it.id,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      unitCost: it.unitCost || 0,
      totalCost: it.totalCost || 0,
    }));
  }

  // 2. LẤY NGUYÊN LIỆU KEM PHỦ TỔNG HỢP TOÀN BỘ
  let combinedCreamBom: CakeBomItem[] = [];
  if (isMultiTier) {
    const ingMap = new Map<string, CakeBomItem>();
    tiers.forEach((t) => {
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
    combinedCreamBom = Array.from(ingMap.values());
  } else if (spec?.creamCoating?.bomIngredients && spec.creamCoating.bomIngredients.length > 0) {
    combinedCreamBom = spec.creamCoating.bomIngredients;
  } else if (fullBomConfig.creamCoatings?.[0]?.sizes?.[0]?.bomIngredients) {
    combinedCreamBom = fullBomConfig.creamCoatings[0].sizes[0].bomIngredients;
  }

  // Danh sách nguyên liệu hiển thị theo tab tầng đang chọn
  const activeTier: CakeTierSpec | undefined = 
    isMultiTier && typeof selectedTierTab === 'number' ? tiers[selectedTierTab] : undefined;

  const currentBaseIngredients: CakeBomItem[] = activeTier
    ? (activeTier.cakeBase?.bomIngredients || [])
    : combinedBaseBom;

  const currentCreamIngredients: CakeBomItem[] = activeTier
    ? (activeTier.creamCoating?.bomIngredients || [])
    : combinedCreamBom;

  const currentIngredients = activeTab === 'base' 
    ? currentBaseIngredients 
    : activeTab === 'cream' 
    ? currentCreamIngredients 
    : [];

  const freeAccessories = spec?.freeAccessories || [];
  const decorAddons = spec?.decorAddons || [];
  const cakeMessage = spec?.cakeMessage || order.cake_message || fromN.cake_message;
  const decorNotes = spec?.decorNotes || fromN.special_request || '';

  // Thông số nướng hiện tại
  const currentBakingTemp = activeTier
    ? (activeTier.cakeBase?.bakingTemperature || '155 - 160°C')
    : (spec?.cakeBase?.bakingTemperature || '155 - 160°C');

  const currentBakingTime = activeTier
    ? (activeTier.cakeBase?.bakingTimeMinutes || '45 - 50 phút')
    : (spec?.cakeBase?.bakingTimeMinutes || '45 - 50 phút');

  const currentBakingNotes = activeTier
    ? (activeTier.cakeBase?.notes || '')
    : (spec?.cakeBase?.notes || '');

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
      if (!items || items.length === 0) {
        return '<tr><td colspan="2" style="padding: 4px; text-align: center; color: #888; font-style: italic;">Chưa có định mức BOM</td></tr>';
      }
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

    let tiersPrintHtml = '';
    if (isMultiTier) {
      tiersPrintHtml = tiers.map((t, idx) => `
        <div style="margin-top: 10px; border: 1.5px solid #000; border-radius: 6px; padding: 6px; page-break-inside: avoid;">
          <div style="font-weight: 900; font-size: 11pt; background: #000; color: #fff; padding: 3px 6px; text-transform: uppercase;">
            ${t.tierName}: ${t.sizeName} (Ø ${t.diameterCm}cm)
          </div>
          <div style="font-size: 9.5pt; margin: 4px 0; line-height: 1.3;">
            <div><b>Cốt bánh:</b> ${t.cakeBase?.name || 'Vani'} | <b>Kem:</b> ${t.creamCoating?.name || 'Kem tươi'}</div>
            ${t.filling?.name ? `<div><b>Nhân bánh:</b> 🍓 ${t.filling.name}</div>` : ''}
            <div style="color: #c2410c; font-weight: bold; margin-top: 2px;">
              🔥 Nướng: ${t.cakeBase?.bakingTemperature || '155 - 160°C'} trong ${t.cakeBase?.bakingTimeMinutes || '45 - 50 phút'}
              ${t.cakeBase?.notes ? ` • <i>${t.cakeBase.notes}</i>` : ''}
            </div>
          </div>
          
          <div style="margin-top: 4px; font-weight: bold; font-size: 9pt; text-transform: uppercase; color: #831843;">🎂 BOM Cốt Bánh ${t.tierName}:</div>
          <table style="width: 100%; border-collapse: collapse;">
            <tbody>${renderTableRows(t.cakeBase?.bomIngredients || [])}</tbody>
          </table>

          ${t.creamCoating?.bomIngredients && t.creamCoating.bomIngredients.length > 0 ? `
            <div style="margin-top: 6px; font-weight: bold; font-size: 9pt; text-transform: uppercase; color: #065f46;">🍦 BOM Kem Phủ ${t.tierName}:</div>
            <table style="width: 100%; border-collapse: collapse;">
              <tbody>${renderTableRows(t.creamCoating.bomIngredients)}</tbody>
            </table>
          ` : ''}
        </div>
      `).join('');
    }

    const baseRows = renderTableRows(combinedBaseBom);
    const creamRows = renderTableRows(combinedCreamBom);

    const printContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 10px; max-width: 80mm; margin: 0 auto; color: #000;">
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <h2 style="margin: 0; font-size: 13pt; font-weight: 900; text-transform: uppercase;">CÔNG THỨC BOM TIỆM BÁNH</h2>
          <div style="font-size: 10pt; font-weight: bold; margin-top: 4px;">Đơn: #${orderNum}</div>
        </div>
        <div style="font-size: 10pt; margin-bottom: 8px; line-height: 1.4;">
          <div><b>Bánh:</b> ${cakeName} ${isMultiTier ? `(${tiers.length} Tầng)` : ''}</div>
          <div><b>Kích thước:</b> ${rawSize || 'Tiêu chuẩn'}</div>
          ${!isMultiTier ? `
            <div><b>Cốt:</b> ${flavor}</div>
            <div><b>Kem:</b> ${cream}</div>
            ${filling ? `<div><b>Nhân:</b> 🍓 ${filling}</div>` : ''}
            <div style="color: #c2410c; font-weight: bold; margin-top: 2px;">
              🔥 Nướng: ${currentBakingTemp} trong ${currentBakingTime}
              ${currentBakingNotes ? ` • <i>${currentBakingNotes}</i>` : ''}
            </div>
          ` : ''}
          ${packaging ? `<div><b>Hộp:</b> 📦 ${packaging}</div>` : ''}
          ${cakeMessage ? `<div><b>Ghi chữ:</b> "<i>${cakeMessage}</i>"</div>` : ''}
          ${decorNotes ? `<div><b>Dặn thợ decor:</b> <i>${decorNotes}</i></div>` : ''}
          <div><b>Số lượng mẻ làm:</b> <span style="font-size: 12pt; font-weight: 900; color: #b91c1c;">${batchMultiplier} cái</span></div>
        </div>

        ${isMultiTier ? `
          <div style="margin-top: 8px; border-top: 1.5px solid #000; padding-top: 6px;">
            <div style="font-weight: 900; font-size: 10pt; text-transform: uppercase; text-align: center; background: #f4f4f5; padding: 4px; border-radius: 4px;">
              CHI TIẾT BOM TỪNG TẦNG BÁNH
            </div>
            ${tiersPrintHtml}
          </div>
        ` : ''}

        <!-- BẢNG TỔNG HỢP NGUYÊN LIỆU TOÀN BỘ BÁNH -->
        <div style="margin-top: 10px; border-top: 2px solid #000; padding-top: 6px;">
          <div style="font-weight: 900; font-size: 10pt; text-transform: uppercase; color: #831843;">
            🎂 ${isMultiTier ? 'TỔNG HỢP NGUYÊN LIỆU CỐT (TẤT CẢ TẦNG)' : '1. ĐỊNH LƯỢNG CỐT BÁNH'}
          </div>
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

        <!-- BẢNG KEM PHỦ -->
        ${combinedCreamBom.length > 0 ? `
          <div style="margin-top: 10px; border-top: 1px solid #000; padding-top: 6px;">
            <div style="font-weight: 900; font-size: 10pt; text-transform: uppercase; color: #065f46;">
              🍦 ${isMultiTier ? 'TỔNG HỢP KEM PHỦ (TẤT CẢ TẦNG)' : '2. ĐỊNH LƯỢNG KEM PHỦ'}
            </div>
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
            <div style="font-weight: 900; text-transform: uppercase;">🎁 VẬT TƯ & PHỤ KIỆN ĐI KÈM:</div>
            <ul style="margin: 4px 0 0 16px; padding: 0;">
              ${freeAccessories.map((a) => `<li>${a.name} (${a.quantity || 1})</li>`).join('')}
              ${decorAddons.map((d) => `<li>${d.name}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div style="margin-top: 12px; font-size: 8pt; text-align: center; color: #666; border-top: 1px dashed #999; padding-top: 6px;">
          Nướng chuẩn nhiệt độ • Cắm tăm khô trước khi lấy ra khỏi lò
        </div>
      </div>
    `;

    printHtml(printContent, {
      title: `BOM_${orderNum}`,
      pageSize: '80mm',
    });
  };

  const totalIngredientsCount = currentIngredients.length;
  const currentChecklistPrefix = `${selectedTierTab}-${activeTab}`;
  const checkedCount = currentIngredients.filter((it, idx) => checkedItems[`${currentChecklistPrefix}-${it.id || it.name}-${idx}`]).length;
  const isAllChecked = totalIngredientsCount > 0 && checkedCount === totalIngredientsCount;

  return (
    <div className="fixed inset-0 z-[10000020] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-pink-500/40 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white animate-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto">
        
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
                {isMultiTier && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-purple-950/80 text-purple-300 border border-purple-700/80">
                    Bánh {tiers.length} Tầng
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Xem công thức định mức BOM nguyên vật liệu chi tiết cho từng tầng và toàn bộ bánh
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

        {/* BỘ CHỌN TẦNG BÁNH (CHO BÁNH NHIỀU TẦNG) */}
        {isMultiTier && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-zinc-400 px-1">
              <span className="flex items-center gap-1 text-pink-300">
                <Layers className="w-3.5 h-3.5 text-pink-400" />
                Chọn xem định mức từng tầng:
              </span>
              <span className="text-[11px] text-zinc-500">Bấm chọn từng tầng để xem công thức riêng</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => {
                  setSelectedTierTab('all');
                  setCheckedItems({});
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                  selectedTierTab === 'all'
                    ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                    : 'bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>🎂 Tổng Hợp Toàn Bộ</span>
              </button>

              {tiers.map((t, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedTierTab(idx);
                    setCheckedItems({});
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                    selectedTierTab === idx
                      ? 'bg-pink-600 text-white shadow-md shadow-pink-600/30'
                      : 'bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-[10px]">
                    {idx + 1}
                  </span>
                  <span>{t.tierName}</span>
                  <span className="text-[10px] font-normal opacity-80">({t.sizeName})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* THÔNG TIN CHI TIẾT TẦNG ĐANG CHỌN HOẶC TỔNG THỂ */}
        <div className="bg-zinc-950 p-3.5 rounded-2xl border border-zinc-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-base text-zinc-100 uppercase leading-snug">
                  {activeTier ? `${activeTier.tierName}: ${cakeName}` : cakeName}
                </h3>
                {activeTier && (
                  <span className="px-2 py-0.5 rounded-lg bg-pink-950/80 text-pink-300 border border-pink-700/80 text-xs font-black">
                    {activeTier.sizeName} (Ø {activeTier.diameterCm}cm)
                  </span>
                )}
              </div>

              {/* Thông tin bánh hoặc các tầng */}
              {!activeTier ? (
                isMultiTier ? (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {tiers.map((t, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedTierTab(idx)}
                        className="bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800 text-xs hover:border-pink-500/50 cursor-pointer transition"
                      >
                        <div className="font-black text-amber-300 flex items-center justify-between pb-1 border-b border-zinc-800">
                          <span>{t.tierName}: {t.sizeName}</span>
                          <span className="text-pink-400 text-[10px] flex items-center gap-0.5">
                            Xem riêng <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-300 mt-1 space-y-0.5">
                          <div>🌾 Cốt: <span className="font-bold text-zinc-100">{t.cakeBase?.name || 'Vani'}</span></div>
                          <div>🍦 Kem: <span className="font-bold text-zinc-100">{t.creamCoating?.name || 'Kem tươi'}</span></div>
                          {t.filling?.name && (
                            <div>🍓 Nhân: <span className="font-bold text-pink-300">{t.filling.name}</span></div>
                          )}
                          <div className="text-orange-300/90 text-[10px] pt-0.5">
                            🔥 Nướng: {t.cakeBase?.bakingTemperature || '155-160°C'} • {t.cakeBase?.bakingTimeMinutes || '45-50p'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
                    <span className="px-2.5 py-0.5 rounded-lg bg-pink-950/80 text-pink-300 border border-pink-700/80 font-black">
                      📏 {rawSize || 'Size tiêu chuẩn'}
                    </span>
                    <span className="text-zinc-300 font-semibold">
                      🌾 {flavor}
                    </span>
                    <span className="text-zinc-300 font-semibold">
                      🍦 {cream}
                    </span>
                    {filling && (
                      <span className="text-pink-300 font-semibold">
                        🍓 {filling}
                      </span>
                    )}
                  </div>
                )
              ) : (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
                  <span className="text-zinc-300 font-semibold">
                    🌾 Cốt: <b className="text-white">{activeTier.cakeBase?.name || 'Vani'}</b>
                  </span>
                  <span className="text-zinc-300 font-semibold">
                    🍦 Kem: <b className="text-white">{activeTier.creamCoating?.name || 'Kem tươi'}</b>
                  </span>
                  {activeTier.filling?.name && (
                    <span className="text-pink-300 font-semibold">
                      🍓 Nhân: <b className="text-pink-200">{activeTier.filling.name}</b>
                    </span>
                  )}
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

          {/* HỘP THÔNG SỐ NƯỚNG KỸ THUẬT CHO THỢ BẾP */}
          <div className="p-2.5 rounded-xl bg-orange-950/30 border border-orange-600/40 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-orange-300 font-black text-[11px] uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-400" />
                Thông Số Nướng Bếp {activeTier ? `(${activeTier.tierName})` : ''}:
              </span>
              <span className="text-[10px] text-zinc-400 font-normal">Cài đặt lò chuẩn</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-0.5">
              <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block">Nhiệt độ nướng:</span>
                <span className="font-black text-orange-300 text-xs sm:text-sm">{currentBakingTemp}</span>
              </div>
              <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800">
                <span className="text-[10px] text-zinc-400 block">Thời gian nướng:</span>
                <span className="font-black text-amber-300 text-xs sm:text-sm">{currentBakingTime}</span>
              </div>
              <div className="bg-zinc-900/80 p-2 rounded-lg border border-zinc-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-zinc-400 block">Kiểm tra lò:</span>
                <span className="font-bold text-zinc-200 text-[11px] block break-words">
                  {currentBakingNotes || 'Cắm tăm khô trước khi lấy ra'}
                </span>
              </div>
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
                <div className="text-zinc-300 italic text-[11px]">
                  💡 Dặn thợ decor: {decorNotes}
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
            className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'base' ? 'bg-pink-600 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🎂 Cốt Bánh ({currentBaseIngredients.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cream')}
            className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'cream' ? 'bg-pink-600 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🍦 Kem Phủ ({currentCreamIngredients.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('accessories')}
            className={`flex-1 py-2 rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'accessories' ? 'bg-pink-600 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>🎁 Bao Bì & Quà</span>
          </button>
        </div>

        {/* NỘI DUNG THEO TAB */}
        {activeTab !== 'accessories' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase text-zinc-300 flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-pink-400" />
                  Định Mức Cân Nguyên Liệu {activeTier ? `[${activeTier.tierName}]` : '[Tổng Hợp]'} ({totalIngredientsCount})
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
                    const itemId = `${currentChecklistPrefix}-${item.id || item.name}-${idx}`;
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
                            className={`text-xs font-bold break-words ${
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
            <b>Lưu ý kỹ thuật:</b> Nướng cốt bánh ở nhiệt độ <b>{currentBakingTemp}</b> trong khoảng <b>{currentBakingTime}</b>. {currentBakingNotes ? `${currentBakingNotes}. ` : ''}Đánh kem ở tốc độ vừa để kem mịn, tránh tách nước.
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
