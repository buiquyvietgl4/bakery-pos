'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { X, CheckCircle2, Circle, Scale, RefreshCw, Printer, Info, ChefHat } from 'lucide-react';
import { getCakeCostingConfig } from '@/lib/utils/customCakeCosting';
import { CakeSizeOption, CakeSizeBomItem } from '@/lib/constants/cakeCostingData';
import { parsePreorderFromNotes } from '@/lib/supabase/realtimeSync';
import { printHtml } from '@/lib/utils/printHelper';

export interface CakeBomModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
}

export const CakeBomModal: React.FC<CakeBomModalProps> = ({ isOpen, onClose, order }) => {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [batchMultiplier, setBatchMultiplier] = useState<number>(1);

  // Khởi tạo multiplier theo số lượng trong đơn khi mở
  useEffect(() => {
    if (order) {
      const mainItem = order.items?.[0];
      const qty = Number(mainItem?.quantity) || 1;
      setBatchMultiplier(Math.max(1, qty));
      setCheckedItems({});
    }
  }, [order?.id, order?.order_number]);

  const cakeCostingConfig = useMemo(() => getCakeCostingConfig(), [isOpen]);

  if (!isOpen || !order) return null;

  const mainItem = order.items?.[0];
  const fromN = parsePreorderFromNotes(order.notes);
  const cakeName = order.cake_name || fromN.cake_name || mainItem?.product_name_snapshot || 'Bánh Sinh Nhật';
  const rawSize = order.cake_size || order.size || fromN.cake_size || '';
  const flavor = order.flavor || fromN.flavor || 'Cốt Vani truyền thống';
  const cream = order.cream || fromN.cream || 'Kem tươi Topping thanh mát';
  const filling = order.filling || fromN.filling;
  const orderNum = order.order_number || order.orderNumber || order.id || 'ĐƠN MỚI';

  // 1. Tìm size bánh tương ứng từ cấu hình BOM
  let matchedSize: CakeSizeOption | null = null;
  const allSizes = cakeCostingConfig.sizes || [];

  // Tìm theo đường kính cm trong size hoặc tên bánh
  const diamMatch = rawSize.match(/(\d+)\s*cm/i) || cakeName.match(/(\d+)\s*cm/i);
  if (diamMatch && diamMatch[1]) {
    const diamNum = parseInt(diamMatch[1], 10);
    matchedSize = allSizes.find((s) => s.diameterCm === diamNum) || null;
  }

  // Nếu chưa tìm thấy, tìm theo tên size
  if (!matchedSize && rawSize) {
    matchedSize = allSizes.find(
      (s) => s.name.toLowerCase().includes(rawSize.toLowerCase()) || rawSize.toLowerCase().includes(s.name.toLowerCase())
    ) || null;
  }

  // Fallback mặc định (Size 18cm hoặc phần tử đầu)
  if (!matchedSize) {
    matchedSize = allSizes.find((s) => s.isDefault) || allSizes[2] || allSizes[0] || null;
  }

  const bomIngredients: CakeSizeBomItem[] = matchedSize?.bomIngredients || [];

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
    if (!matchedSize) return;
    const itemsHtml = bomIngredients
      .map((it, idx) => {
        const scaledQty = Math.round(Number(it.quantity || 0) * batchMultiplier * 10) / 10;
        return `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 6px 4px; font-weight: bold; font-size: 11pt;">${idx + 1}. ${it.name}</td>
            <td style="padding: 6px 4px; text-align: right; font-weight: 900; font-size: 12pt; color: #b91c1c;">${scaledQty} ${it.unit}</td>
          </tr>
        `;
      })
      .join('');

    const printContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 10px; max-width: 80mm; margin: 0 auto; color: #000;">
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
          <h2 style="margin: 0; font-size: 14pt; font-weight: 900; text-transform: uppercase;">CÔNG THỨC BOM CỐT BÁNH</h2>
          <div style="font-size: 10pt; font-weight: bold; margin-top: 4px;">Đơn: #${orderNum}</div>
        </div>
        <div style="font-size: 10pt; margin-bottom: 8px; line-height: 1.4;">
          <div><b>Bánh:</b> ${cakeName}</div>
          <div><b>Kích thước:</b> ${matchedSize.name} (Ø${matchedSize.diameterCm}cm)</div>
          <div><b>Cốt & Kem:</b> ${flavor} - ${cream}</div>
          ${filling ? `<div><b>Nhân bánh:</b> 🍓 ${filling}</div>` : ''}
          <div><b>Số lượng mẻ làm:</b> <span style="font-size: 12pt; font-weight: 900; color: #b91c1c;">${batchMultiplier} cái</span></div>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
          <thead>
            <tr style="background: #eee; font-size: 9pt;">
              <th style="padding: 4px; text-align: left;">Nguyên liệu</th>
              <th style="padding: 4px; text-align: right;">Định lượng</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        ${filling ? `
          <div style="margin-top: 10px; padding: 6px; border: 1px solid #000; border-radius: 4px; font-size: 9pt;">
            <b>🍓 Nhân bánh:</b> ${filling}<br/>
            <i>Định lượng khuyên dùng: ~${Math.round(100 * batchMultiplier)}g</i>
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

  const totalIngredientsCount = bomIngredients.length;
  const checkedCount = bomIngredients.filter((it, idx) => checkedItems[it.id || `${it.name}-${idx}`]).length;
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
                  Công Thức BOM Cốt Bánh
                </span>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-amber-300 border border-zinc-700">
                  #{orderNum}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Định mức nguyên vật liệu chuẩn cho thợ bếp cân đo làm cốt bánh
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
              <div className="flex items-center gap-2 mt-1 flex-wrap text-xs">
                <span className="px-2.5 py-0.5 rounded-lg bg-pink-950/80 text-pink-300 border border-pink-700/80 font-black">
                  📏 {matchedSize?.name || rawSize || 'Size 18cm'} (Ø{matchedSize?.diameterCm || 18}cm)
                </span>
                <span className="text-zinc-400 font-semibold">
                  🌾 {flavor}
                </span>
                <span className="text-zinc-400 font-semibold">
                  🍦 {cream}
                </span>
              </div>
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

          {/* Nhân bánh sinh nhật nếu có */}
          {filling && (
            <div className="p-2.5 rounded-xl bg-pink-950/40 border border-pink-700/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="text-base">🍓</span>
                <div>
                  <span className="text-[10px] text-pink-300 font-bold block">Nhân bánh sinh nhật:</span>
                  <span className="text-pink-100 font-black text-sm">{filling}</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-zinc-400 block">Định lượng gợi ý:</span>
                <span className="font-mono font-black text-pink-300">~{Math.round(100 * batchMultiplier)} g</span>
              </div>
            </div>
          )}
        </div>

        {/* Bảng nguyên liệu BOM & Checklist cân đo */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-zinc-300 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-pink-400" />
                Danh Sách Cân Định Mức Nguyên Liệu ({totalIngredientsCount})
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

          {bomIngredients.length === 0 ? (
            <div className="p-6 text-center rounded-2xl bg-zinc-950 border border-zinc-800 text-zinc-400 text-xs">
              Chưa có công thức BOM cho kích thước này. Bạn có thể cài đặt BOM trong mục Quản trị &gt; Định mức bánh đặt.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="max-h-[38vh] overflow-y-auto divide-y divide-zinc-800/80">
                {bomIngredients.map((item, idx) => {
                  const itemId = item.id || `${item.name}-${idx}`;
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

        {/* Hướng dẫn kỹ thuật nướng bánh */}
        <div className="p-3 bg-amber-950/20 rounded-2xl border border-amber-800/40 text-[11px] text-amber-200/90 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <b>Lưu ý kỹ thuật:</b> Nướng cốt bánh ở nhiệt độ <b>155°C - 160°C</b> trong khoảng <b>45 - 50 phút</b>. Sau khi nướng xong, gõ nhẹ khuôn và úp ngược lên rack để cốt bánh giữ trọn độ cao, không bị xẹp lõm.
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
            <span>In Công Thức</span>
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
