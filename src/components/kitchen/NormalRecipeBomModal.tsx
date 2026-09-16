'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  X, CheckCircle2, Circle, Scale, RefreshCw, Printer, ChefHat,
  Flame, Clock, BookOpen, AlertCircle, Play
} from 'lucide-react';
import { BakeryRecipe } from '@/lib/constants/bakeryData';
import { printHtml } from '@/lib/utils/printHelper';

export interface NormalRecipeBomModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  recipes: BakeryRecipe[];
  initialProductName?: string;
  productName?: string;
  onStartBaking?: (recipe: BakeryRecipe, batchQty?: number) => void;
}

export const NormalRecipeBomModal: React.FC<NormalRecipeBomModalProps> = ({
  isOpen,
  onClose,
  order,
  recipes,
  initialProductName,
  productName,
  onStartBaking,
}) => {
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(0);
  const [batchMultiplier, setBatchMultiplier] = useState<number>(1);
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // Danh sách các món trong đơn
  const orderItems: any[] = useMemo(() => {
    if (!order?.items || !Array.isArray(order.items) || order.items.length === 0) {
      if (order?.cake_name) {
        return [{ id: 'item-0', product_name_snapshot: order.cake_name, quantity: order.orderQuantity || 1 }];
      }
      return [];
    }
    return order.items.filter((it: any) => {
      const name = it.product_name_snapshot || it.product?.name || it.name || '';
      return !name.toLowerCase().includes('phí giao') && !name.toLowerCase().includes('ship bánh');
    });
  }, [order]);

  // Khởi tạo tab khi mở modal
  const effectiveProductName = productName || initialProductName;
  useEffect(() => {
    if (isOpen && orderItems.length > 0) {
      setCheckedItems({});
      if (effectiveProductName) {
        const foundIdx = orderItems.findIndex((it) => {
          const name = it.product_name_snapshot || it.name || '';
          return name.toLowerCase().includes(effectiveProductName.toLowerCase());
        });
        setSelectedItemIndex(foundIdx >= 0 ? foundIdx : 0);
      } else {
        setSelectedItemIndex(0);
      }
    }
  }, [isOpen, order?.id, effectiveProductName, orderItems]);

  const currentItem = orderItems[selectedItemIndex] || orderItems[0];
  const currentItemName = currentItem?.product_name_snapshot || currentItem?.product?.name || currentItem?.name || '';
  const currentItemQty = Number(currentItem?.quantity) || 1;

  // Tìm công thức tương ứng trong danh sách recipes
  const matchedRecipe = useMemo(() => {
    if (!currentItemName || !recipes || recipes.length === 0) return null;
    const cleanName = currentItemName.toLowerCase().trim();

    // 1. Tìm theo product_id nếu có
    if (currentItem?.product_id) {
      const byId = recipes.find((r) => r.product_id === currentItem.product_id);
      if (byId) return byId;
    }

    // 2. Tìm theo tên chính xác hoặc khớp tương đối
    const exact = recipes.find((r) => r.name.toLowerCase().trim() === cleanName);
    if (exact) return exact;

    const fuzzy = recipes.find((r) => {
      const rName = r.name.toLowerCase().trim();
      return cleanName.includes(rName) || rName.includes(cleanName);
    });
    return fuzzy || null;
  }, [currentItemName, currentItem?.product_id, recipes]);

  // Điều chỉnh multiplier theo số lượng trong đơn
  useEffect(() => {
    if (matchedRecipe) {
      const standardYield = Math.max(1, Number(matchedRecipe.yield_qty) || 1);
      // Tự động gợi ý số lần mẻ đủ để làm đủ số lượng đặt
      const neededMultiplier = Math.max(1, Math.ceil(currentItemQty / standardYield));
      setBatchMultiplier(neededMultiplier);
      setCheckedItems({});
    } else {
      setBatchMultiplier(1);
    }
  }, [matchedRecipe?.id, currentItemQty]);

  if (!isOpen || !order) return null;

  const orderNum = order.order_number || order.orderNumber || 'BK-XXX';
  const rawItems = matchedRecipe?.items || [];
  const recipeNotes = matchedRecipe?.notes || matchedRecipe?.description || '';

  const toggleCheck = (itemId: string) => {
    setCheckedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  };

  const handleResetChecklist = () => {
    setCheckedItems({});
  };

  // In phiếu BOM mẻ nướng
  const handlePrintBom = () => {
    if (!matchedRecipe) return;
    const printContent = `
      <div style="font-family: monospace, sans-serif; padding: 12px; font-size: 13px; color: #000; line-height: 1.4;">
        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 10px;">
          <h2 style="margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase;">PHIẾU ĐỊNH MỨC BOM BÁNH</h2>
          <div style="font-size: 11px; margin-top: 4px;">ĐƠN HÀNG: #${orderNum}</div>
        </div>

        <div style="margin-bottom: 8px;">
          <div><b>Sản phẩm:</b> ${matchedRecipe.name}</div>
          <div><b>Đơn hàng yêu cầu:</b> ${currentItemQty} ${matchedRecipe.yield_unit || 'cái'}</div>
          <div><b>Quy mô làm:</b> ${batchMultiplier} mẻ (${batchMultiplier * (matchedRecipe.yield_qty || 1)} ${matchedRecipe.yield_unit || 'cái'})</div>
          <div><b>Nhiệt độ lò:</b> ${matchedRecipe.bake_temp_celsius || 190}°C | <b>Thời gian:</b> ${matchedRecipe.bake_time_minutes || 25} phút</div>
        </div>

        <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 6px 0; margin-bottom: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="text-align: left; border-bottom: 1px dashed #666;">
                <th style="padding: 4px 0;">Nguyên liệu</th>
                <th style="padding: 4px 0; text-align: right;">Cần cân</th>
              </tr>
            </thead>
            <tbody>
              ${rawItems.map((it) => {
                const scaled = Math.round(Number(it.qty || it.quantity || 0) * batchMultiplier * 10) / 10;
                return `
                  <tr>
                    <td style="padding: 4px 0;">[ ] ${it.name}</td>
                    <td style="padding: 4px 0; text-align: right; font-weight: bold;">${scaled} ${it.unit || 'g'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        ${recipeNotes ? `
          <div style="font-size: 11px; margin-bottom: 8px; background: #eee; padding: 6px; border-radius: 4px;">
            <b>Ghi chú kỹ thuật:</b> ${recipeNotes}
          </div>
        ` : ''}

        <div style="text-align: center; font-size: 10px; color: #555; margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 6px;">
          Kiểm tra kỹ lò nướng & cân đúng khối lượng trước khi nhào bột
        </div>
      </div>
    `;

    printHtml(printContent, {
      title: `BOM_${orderNum}_${matchedRecipe.name}`,
      pageSize: '80mm',
    });
  };

  const totalIngredientsCount = rawItems.length;
  const checkedCount = rawItems.filter((_, idx) => checkedItems[`ing-${idx}`]).length;
  const isAllChecked = totalIngredientsCount > 0 && checkedCount === totalIngredientsCount;

  return (
    <div className="fixed inset-0 z-[10000020] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-amber-500/40 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 text-white animate-in zoom-in-95 duration-150 my-auto max-h-[92vh] overflow-y-auto">
        
        {/* Header Modal */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shadow-xs shrink-0">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm sm:text-base text-amber-300 uppercase tracking-tight">
                  Công Thức BOM Bánh Thường
                </span>
                <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-zinc-800 text-amber-400 border border-zinc-700">
                  #${orderNum}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Định mức nguyên liệu, thông số lò nướng và hướng dẫn kỹ thuật cho thợ bếp
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

        {/* Tabs chọn món trong đơn (nếu có nhiều hơn 1 món bánh) */}
        {orderItems.length > 1 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold text-zinc-400">
              Chọn món trong đơn để xem công thức ({orderItems.length} món):
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {orderItems.map((it, idx) => {
                const itName = it.product_name_snapshot || it.product?.name || it.name || `Món ${idx + 1}`;
                const itQty = it.quantity || 1;
                const isSelected = selectedItemIndex === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setSelectedItemIndex(idx);
                      setCheckedItems({});
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 text-zinc-950 font-black shadow-md shadow-amber-500/20'
                        : 'bg-zinc-800/90 text-zinc-300 hover:bg-zinc-700 hover:text-white border border-zinc-700'
                    }`}
                  >
                    <span className="text-[11px] opacity-80">${itQty}x</span>
                    <span className="truncate max-w-[140px]">${itName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Chi tiết công thức bánh */}
        {!matchedRecipe ? (
          <div className="p-6 text-center rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-950/60 text-amber-400 border border-amber-700/50 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-zinc-200">
                Chưa có công thức BOM cho: &ldquo;${currentItemName}&rdquo;
              </h4>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Món bánh này chưa được khai báo định mức nguyên liệu. Quản trị viên có thể vào mục <b>Quản trị &gt; Công thức (BOM)</b> để thêm công thức cho món này.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Thông tin bánh & Bộ chỉnh số lượng mẻ */}
            <div className="bg-zinc-950 p-3.5 rounded-2xl border border-zinc-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-black text-base text-zinc-100 uppercase">
                    ${matchedRecipe.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-zinc-400">
                    <span>Đơn đặt: <strong className="text-amber-400">${currentItemQty} ${matchedRecipe.yield_unit || 'cái'}</strong></span>
                    <span>•</span>
                    <span>Mẻ chuẩn gốc: <strong className="text-zinc-200">${matchedRecipe.yield_qty} ${matchedRecipe.yield_unit || 'cái'}</strong></span>
                  </div>
                </div>

                {/* Bộ chỉnh số lượng mẻ */}
                <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1.5 rounded-xl border border-zinc-700 self-start sm:self-center shrink-0">
                  <span className="text-[11px] text-zinc-400 font-bold shrink-0">Mẻ làm:</span>
                  <button
                    type="button"
                    onClick={() => setBatchMultiplier((prev) => Math.max(1, prev - 1))}
                    className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-black text-sm flex items-center justify-center text-zinc-200 transition cursor-pointer active:scale-90"
                    title="Giảm số mẻ"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-base text-amber-400 w-6 text-center">
                    ${batchMultiplier}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBatchMultiplier((prev) => prev + 1)}
                    className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 font-black text-sm flex items-center justify-center text-zinc-200 transition cursor-pointer active:scale-90"
                    title="Tăng số mẻ"
                  >
                    +
                  </button>
                  <span className="text-[11px] text-zinc-400 font-semibold shrink-0">
                    (= ${batchMultiplier * (matchedRecipe.yield_qty || 1)} ${matchedRecipe.yield_unit || 'cái'})
                  </span>
                </div>
              </div>

              {/* Thông số nướng lò */}
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800/80">
                <div className="bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-400 shrink-0" />
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-medium">Nhiệt độ lò nướng:</span>
                    <span className="font-black text-orange-300 text-xs sm:text-sm">
                      ${matchedRecipe.bake_temp_celsius || 190}°C
                    </span>
                  </div>
                </div>
                <div className="bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-medium">Thời gian nướng:</span>
                    <span className="font-black text-amber-300 text-xs sm:text-sm">
                      ${matchedRecipe.bake_time_minutes || 25} phút
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bảng nguyên liệu định mức - Tên đầy đủ không cắt ngắn */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-zinc-300 flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-amber-400" />
                    Định Mức Cân Nguyên Liệu (${totalIngredientsCount} loại)
                  </span>
                  {checkedCount > 0 && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isAllChecked ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-300'
                    }`}>
                      Đã cân ${checkedCount}/${totalIngredientsCount}
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

              {rawItems.length === 0 ? (
                <div className="p-4 text-center rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-500 text-xs">
                  Công thức chưa có nguyên liệu nào.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                  <div className="max-h-[40vh] overflow-y-auto divide-y divide-zinc-800/80">
                    {rawItems.map((item, idx) => {
                      const itemId = `ing-${idx}`;
                      const isChecked = !!checkedItems[itemId];
                      const scaledQty = Math.round(Number(item.qty || item.quantity || 0) * batchMultiplier * 10) / 10;

                      return (
                        <div
                          key={idx}
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
                                isChecked ? 'text-zinc-500' : 'text-amber-400'
                              }`}
                            >
                              {scaledQty}
                            </span>
                            <span className="text-xs font-bold text-zinc-400">
                              {item.unit || 'g'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Ghi chú & Hướng dẫn kỹ thuật làm bánh */}
            {recipeNotes && (
              <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-700/50 space-y-1 text-xs">
                <div className="font-bold text-amber-300 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Ghi chú & Hướng dẫn kỹ thuật làm bánh:</span>
                </div>
                <div className="text-zinc-200 text-[11px] leading-relaxed whitespace-pre-line pl-5">
                  {recipeNotes}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800">
          <div className="flex items-center gap-2">
            {matchedRecipe && (
              <button
                type="button"
                onClick={handlePrintBom}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-xs"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>In phiếu BOM</span>
              </button>
            )}

            {matchedRecipe && onStartBaking && (
              <button
                type="button"
                onClick={() => {
                  onStartBaking(matchedRecipe, batchMultiplier * (matchedRecipe.yield_qty || 1));
                  onClose();
                }}
                className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-md shadow-orange-600/30"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Hẹn giờ nướng lò ({matchedRecipe.bake_time_minutes || 25}p)</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs cursor-pointer transition"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};

export default NormalRecipeBomModal;
