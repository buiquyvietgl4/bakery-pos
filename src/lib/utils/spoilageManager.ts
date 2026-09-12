import { SpoilageLog } from '@/lib/types/spoilage';
import { generateUUID } from '@/lib/utils/uuid';
import { supabase } from '@/lib/supabase/client';

const STORAGE_KEY = 'bakery_spoilage_logs';
const DB_ROW_SPOILAGE_ID = '00000000-0000-0000-0000-000000000008';
const DB_ROW_SPOILAGE_NAME = 'SYS_CONFIG_SPOILAGE';

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

export async function fetchSpoilageLogsFromDb(): Promise<SpoilageLog[]> {
  const fallback = getSpoilageLogs();
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_SPOILAGE_ID},name.eq.${DB_ROW_SPOILAGE_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        saveSpoilageLogs(parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchSpoilageLogsFromDb:', err);
  }
  return fallback;
}

export async function saveSpoilageLogsToDb(logs: SpoilageLog[]): Promise<{ success: boolean; error?: string }> {
  saveSpoilageLogs(logs);

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  try {
    const notesContent = JSON.stringify(logs.slice(0, 300));
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_SPOILAGE_ID,
        name: DB_ROW_SPOILAGE_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_SPOILAGE_ID},name.eq.${DB_ROW_SPOILAGE_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_SPOILAGE_ID,
        name: DB_ROW_SPOILAGE_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      });
    }
    return { success: true };
  } catch (err: any) {
    console.error('Lỗi lưu Spoilage lên Supabase:', err);
    return { success: false, error: err.message };
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
  saveSpoilageLogsToDb(updated).catch(console.error);
  return newLog;
}

export function deleteSpoilageLog(id: string): void {
  const currentLogs = getSpoilageLogs();
  const updated = currentLogs.filter((l) => l.id !== id);
  saveSpoilageLogsToDb(updated).catch(console.error);
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
