'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  History,
  TrendingUp,
  TrendingDown,
  Search,
  Filter,
  Trash2,
  Download,
  Package,
  Clock,
  User,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { StockAdjustmentLog, COMMON_STOCK_ADJUSTMENT_REASONS } from '@/lib/types/stockAdjustment';
import {
  getStockAdjustmentLogs,
  clearStockAdjustmentLogs,
  fetchStockAdjustmentLogsFromDb,
  STOCK_ADJUSTMENT_EVENT,
} from '@/lib/utils/stockAdjustmentManager';

interface StockAdjustmentHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  filterProductId?: string | null;
}

export const StockAdjustmentHistoryModal: React.FC<StockAdjustmentHistoryModalProps> = ({
  isOpen,
  onClose,
  filterProductId,
}) => {
  const [logs, setLogs] = useState<StockAdjustmentLog[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'increase' | 'decrease'>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>(filterProductId || 'all');

  // Cập nhật khi filterProductId thay đổi
  useEffect(() => {
    if (filterProductId) {
      setSelectedProductId(filterProductId);
    } else {
      setSelectedProductId('all');
    }
  }, [filterProductId]);

  // Đọc danh sách log
  const loadLogs = () => {
    setLogs(getStockAdjustmentLogs());
    fetchStockAdjustmentLogsFromDb().then((dbLogs) => {
      if (dbLogs && dbLogs.length > 0) setLogs(dbLogs);
    }).catch(console.error);
  };

  useEffect(() => {
    if (!isOpen) return;
    loadLogs();

    const handleUpdate = () => loadLogs();
    window.addEventListener(STOCK_ADJUSTMENT_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(STOCK_ADJUSTMENT_EVENT, handleUpdate);
    };
  }, [isOpen]);

  // Danh sách bánh duy nhất có trong lịch sử để đưa vào bộ lọc
  const uniqueProducts = useMemo(() => {
    const map = new Map<string, string>();
    logs.forEach((l) => {
      if (l.productId && l.productName) {
        map.set(l.productId, l.productName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  // Bộ lọc dữ liệu
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Lọc theo sản phẩm
      if (selectedProductId !== 'all' && log.productId !== selectedProductId) {
        return false;
      }

      // Lọc theo loại tăng / giảm
      if (typeFilter === 'increase' && log.deltaQuantity <= 0) return false;
      if (typeFilter === 'decrease' && log.deltaQuantity >= 0) return false;

      // Lọc theo lý do
      if (reasonFilter !== 'all' && log.reason !== reasonFilter) return false;

      // Lọc theo từ khóa tìm kiếm
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = log.productName.toLowerCase().includes(query);
        const matchReason = log.reason.toLowerCase().includes(query);
        const matchNotes = log.notes?.toLowerCase().includes(query);
        const matchUser = log.adjustedBy?.toLowerCase().includes(query);
        if (!matchName && !matchReason && !matchNotes && !matchUser) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedProductId, typeFilter, reasonFilter, searchTerm]);

  // Thống kê nhanh
  const stats = useMemo(() => {
    let totalIncreased = 0;
    let totalDecreased = 0;
    filteredLogs.forEach((l) => {
      if (l.deltaQuantity > 0) totalIncreased += l.deltaQuantity;
      if (l.deltaQuantity < 0) totalDecreased += Math.abs(l.deltaQuantity);
    });
    return {
      totalLogs: filteredLogs.length,
      totalIncreased,
      totalDecreased,
    };
  }, [filteredLogs]);

  const handleClearHistory = () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử thay đổi tồn kho không? Hành động này không thể hoàn tác.')) {
      clearStockAdjustmentLogs();
      setLogs([]);
    }
  };

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      alert('Không có dữ liệu lịch sử để xuất file.');
      return;
    }

    const headers = ['Thời gian', 'Tên Bánh', 'Số Lượng Cũ', 'Số Lượng Mới', 'Chênh Lệch', 'Lý Do Thay Đổi', 'Ghi Chú', 'Người Thực Hiện'];
    const rows = filteredLogs.map((l) => [
      `"${new Date(l.adjustedAt).toLocaleString('vi-VN')}"`,
      `"${l.productName.replace(/"/g, '""')}"`,
      l.oldQuantity,
      l.newQuantity,
      l.deltaQuantity > 0 ? `+${l.deltaQuantity}` : l.deltaQuantity,
      `"${(l.reason || '').replace(/"/g, '""')}"`,
      `"${(l.notes || '').replace(/"/g, '""')}"`,
      `"${(l.adjustedBy || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `LichSuTonKho_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150 border border-zinc-200 text-zinc-900 max-h-[92dvh] flex flex-col">
        {/* Header Modal */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-zinc-900 flex items-center gap-2">
                Lịch Sử Thay Đổi Số Lượng Bánh
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  {filteredLogs.length} bản ghi
                </span>
              </h3>
              <p className="text-xs text-zinc-500 font-medium">
                Theo dõi chi tiết mọi thao tác điều chỉnh tồn kho bánh và lý do thay đổi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thẻ tóm tắt thống kê */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
          <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200/80">
            <div className="text-[11px] font-bold text-zinc-500 flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-zinc-400" />
              Tổng lượt chỉnh
            </div>
            <div className="text-base sm:text-lg font-black text-zinc-900 mt-0.5">
              {stats.totalLogs} <span className="text-xs font-medium text-zinc-500">lần</span>
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200/80">
            <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              Tổng bánh tăng (+)
            </div>
            <div className="text-base sm:text-lg font-black text-emerald-700 mt-0.5">
              +{stats.totalIncreased} <span className="text-xs font-medium text-emerald-600">cái</span>
            </div>
          </div>

          <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200/80">
            <div className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
              Tổng bánh giảm (-)
            </div>
            <div className="text-base sm:text-lg font-black text-rose-700 mt-0.5">
              -{stats.totalDecreased} <span className="text-xs font-medium text-rose-600">cái</span>
            </div>
          </div>
        </div>

        {/* Thanh công cụ tìm kiếm và lọc */}
        <div className="space-y-2 shrink-0 bg-zinc-50/80 p-3 rounded-2xl border border-zinc-200">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Ô tìm kiếm */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm theo tên bánh, lý do, ghi chú..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Lọc theo loại tăng / giảm */}
            <div className="flex gap-1 bg-white p-1 rounded-xl border border-zinc-200 shrink-0 text-xs font-bold">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  typeFilter === 'all'
                    ? 'bg-amber-600 text-white'
                    : 'text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                Tất cả
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('increase')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  typeFilter === 'increase'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <TrendingUp className="w-3 h-3" /> Tăng (+)
              </button>
              <button
                type="button"
                onClick={() => setTypeFilter('decrease')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                  typeFilter === 'decrease'
                    ? 'bg-rose-600 text-white'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                <TrendingDown className="w-3 h-3" /> Giảm (-)
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Lọc theo sản phẩm */}
            {uniqueProducts.length > 1 && (
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              >
                <option value="all">🍰 Tất cả loại bánh ({uniqueProducts.length})</option>
                {uniqueProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}

            {/* Lọc theo lý do */}
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="bg-white border border-zinc-200 rounded-xl px-2.5 py-1.5 text-xs text-zinc-700 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
            >
              <option value="all">📋 Mọi lý do thay đổi</option>
              {COMMON_STOCK_ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            {/* Nút hành động */}
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredLogs.length === 0}
                className="px-2.5 py-1.5 rounded-xl bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 text-xs font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                title="Xuất dữ liệu ra file CSV"
              >
                <Download className="w-3.5 h-3.5 text-amber-600" />
                <span>Xuất CSV</span>
              </button>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  title="Xóa toàn bộ lịch sử thay đổi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Xóa lịch sử</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Danh sách bản ghi lịch sử (Scrollable Container) */}
        <div className="flex-1 overflow-y-auto min-h-[260px] pr-1 space-y-2">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center py-12 text-center text-zinc-400">
              <div className="w-14 h-14 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
                <History className="w-7 h-7 stroke-1 text-zinc-300" />
              </div>
              <p className="font-bold text-sm text-zinc-600">Chưa có bản ghi lịch sử thay đổi nào</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                Khi bạn hoặc nhân viên thay đổi số lượng tồn kho bánh tại thẻ thực đơn kèm theo lý do, toàn bộ dữ liệu sẽ được ghi nhận chi tiết tại đây.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLogs.map((log) => {
                const dateObj = new Date(log.adjustedAt);
                const timeStr = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
                const isIncrease = log.deltaQuantity > 0;
                const isDecrease = log.deltaQuantity < 0;

                return (
                  <div
                    key={log.id}
                    className="p-3 bg-white rounded-2xl border border-zinc-200/90 hover:border-amber-300 shadow-2xs transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    {/* Cột trái: Tên bánh & Thời gian & Người sửa */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-zinc-900 truncate">
                          {log.productName}
                        </span>
                        {log.productCategory && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500">
                            {log.productCategory}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-500 mt-1">
                        <span className="flex items-center gap-1 font-medium">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          {timeStr} • {dateStr}
                        </span>
                        {log.adjustedBy && (
                          <span className="flex items-center gap-1 text-zinc-600 font-medium">
                            <User className="w-3 h-3 text-zinc-400" />
                            {log.adjustedBy}
                          </span>
                        )}
                      </div>

                      {/* Lý do & ghi chú */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/80">
                          {log.reason || 'Điều chỉnh tồn kho'}
                        </span>
                        {log.notes && (
                          <span className="text-zinc-600 italic text-[11px]">
                            — "{log.notes}"
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Cột phải: Số lượng cũ -> mới & Chênh lệch */}
                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-center bg-zinc-50 sm:bg-transparent p-2 sm:p-0 rounded-xl sm:rounded-none w-full sm:w-auto justify-between sm:justify-end border sm:border-0 border-zinc-100">
                      {/* Biến động số lượng */}
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-600">
                          <span className="text-zinc-400">{log.oldQuantity} cái</span>
                          <ArrowRight className="w-3 h-3 text-zinc-400" />
                          <span className="text-zinc-900 font-black">{log.newQuantity} cái</span>
                        </div>
                      </div>

                      {/* Huy hiệu chênh lệch */}
                      <div
                        className={`px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 shrink-0 ${
                          isIncrease
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs'
                            : isDecrease
                            ? 'bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs'
                            : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                        }`}
                      >
                        {isIncrease && <TrendingUp className="w-3.5 h-3.5 text-emerald-700" />}
                        {isDecrease && <TrendingDown className="w-3.5 h-3.5 text-rose-700" />}
                        <span>
                          {isIncrease ? `+${log.deltaQuantity}` : log.deltaQuantity} cái
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="pt-3 border-t border-zinc-100 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs transition cursor-pointer"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockAdjustmentHistoryModal;
