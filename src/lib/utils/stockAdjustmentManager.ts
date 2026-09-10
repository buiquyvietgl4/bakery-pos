import { StockAdjustmentLog } from '../types/stockAdjustment';

const STORAGE_KEY = 'bakery_stock_adjustment_logs';
export const STOCK_ADJUSTMENT_EVENT = 'bakery_stock_adjustment_logs_updated';

/**
 * Lấy toàn bộ danh sách lịch sử thay đổi tồn kho bánh
 */
export function getStockAdjustmentLogs(): StockAdjustmentLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Lỗi khi đọc lịch sử thay đổi tồn kho:', e);
    return [];
  }
}

/**
 * Ghi nhận một lượt thay đổi số lượng tồn kho bánh mới vào lịch sử
 */
export function addStockAdjustmentLog(
  entry: Omit<StockAdjustmentLog, 'id' | 'adjustedAt'>
): StockAdjustmentLog {
  const newLog: StockAdjustmentLog = {
    ...entry,
    id: 'adj-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    adjustedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      const logs = getStockAdjustmentLogs();
      const updated = [newLog, ...logs].slice(0, 500); // Lưu tối đa 500 bản ghi gần nhất
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent(STOCK_ADJUSTMENT_EVENT, { detail: newLog }));
    } catch (e) {
      console.error('Lỗi khi lưu lịch sử thay đổi tồn kho:', e);
    }
  }

  return newLog;
}

/**
 * Xóa toàn bộ lịch sử thay đổi tồn kho
 */
export function clearStockAdjustmentLogs(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new CustomEvent(STOCK_ADJUSTMENT_EVENT, { detail: null }));
    } catch (e) {
      console.error('Lỗi khi xóa lịch sử thay đổi tồn kho:', e);
    }
  }
}
