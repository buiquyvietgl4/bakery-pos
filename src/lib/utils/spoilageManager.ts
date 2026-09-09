import { SpoilageLog } from '@/lib/types/spoilage';
import { generateUUID } from '@/lib/utils/uuid';

const STORAGE_KEY = 'bakery_spoilage_logs';

export function getSpoilageLogs(): SpoilageLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Lỗi khi đọc nhật ký hao hụt bánh:', err);
  }
  return [];
}

export function saveSpoilageLogs(logs: SpoilageLog[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
    window.dispatchEvent(new Event('bakery_spoilage_updated'));
  } catch (err) {
    console.error('Lỗi khi lưu nhật ký hao hụt bánh:', err);
  }
}

export function addSpoilageLog(
  entry: Omit<SpoilageLog, 'id' | 'loggedAt'>
): SpoilageLog {
  const currentLogs = getSpoilageLogs();
  const newLog: SpoilageLog = {
    ...entry,
    id: 'spoil-' + generateUUID(),
    loggedAt: new Date().toISOString(),
  };

  const updated = [newLog, ...currentLogs];
  saveSpoilageLogs(updated);
  return newLog;
}

export function deleteSpoilageLog(id: string): void {
  const currentLogs = getSpoilageLogs();
  const updated = currentLogs.filter((l) => l.id !== id);
  saveSpoilageLogs(updated);
}

export function getTodaySpoilageSummary(): {
  totalCostLoss: number;
  totalRevenueLoss: number;
  totalItems: number;
  count: number;
} {
  const logs = getSpoilageLogs();
  const todayStr = new Date().toISOString().substring(0, 10);
  const todayLogs = logs.filter((l) => (l.loggedAt || '').substring(0, 10) === todayStr);

  return {
    totalCostLoss: todayLogs.reduce((sum, l) => sum + (l.totalCostLoss || 0), 0),
    totalRevenueLoss: todayLogs.reduce((sum, l) => sum + (l.totalRevenueLoss || 0), 0),
    totalItems: todayLogs.reduce((sum, l) => sum + (l.quantity || 0), 0),
    count: todayLogs.length,
  };
}
