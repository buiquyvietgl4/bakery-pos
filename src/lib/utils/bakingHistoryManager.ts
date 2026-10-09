// src/lib/utils/bakingHistoryManager.ts
// Quản lý Lịch Sử Làm Bánh (Baking / Production History)
// Lưu trữ nhật ký sản xuất bánh, chi tiết nguyên liệu tiêu thụ và đồng bộ đa nền tảng (Cloud SQL + Local SQL)

import { BakingHistoryRecord } from '@/lib/types/bakingHistory';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

export const STORAGE_KEY_BAKING_HISTORY = 'bakery_baking_history';
export const BAKING_HISTORY_STORAGE_KEY = STORAGE_KEY_BAKING_HISTORY;
export const BAKING_HISTORY_UPDATED_EVENT = 'bakery_baking_history_updated';

// Khóa chỉ mục lưu trên Supabase Cloud
export const DB_ROW_BAKING_HISTORY_ID = '00000000-0000-0000-0000-000000000032';
export const DB_ROW_BAKING_HISTORY_NAME = 'SYS_CONFIG_BAKING_HISTORY';

/**
 * Khử trùng lặp danh sách lịch sử làm bánh
 */
export function deduplicateBakingHistory(records: BakingHistoryRecord[]): BakingHistoryRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const seenIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const result: BakingHistoryRecord[] = [];

  for (const rec of records) {
    if (!rec) continue;
    const cleanId = (rec.id || '').trim();
    if (cleanId && seenIds.has(cleanId)) continue;

    const cake = (rec.cakeName || '').trim().toLowerCase();
    const qty = Number(rec.quantity) || 0;
    const date = (rec.createdAt || '').slice(0, 19);
    const fingerprint = `${date}_${cake}_${qty}`;

    if (seenFingerprints.has(fingerprint)) continue;

    if (cleanId) seenIds.add(cleanId);
    seenFingerprints.add(fingerprint);
    result.push(rec);
  }

  // Sắp xếp bản ghi mới nhất lên đầu
  return result.sort((a, b) => {
    const tA = new Date(a.createdAt || 0).getTime();
    const tB = new Date(b.createdAt || 0).getTime();
    return tB - tA;
  });
}

/**
 * Lấy toàn bộ danh sách lịch sử làm bánh từ LocalStorage
 */
export function getBakingHistory(): BakingHistoryRecord[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BAKING_HISTORY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? deduplicateBakingHistory(parsed) : [];
    } catch (e) {
      console.warn('Lỗi khi đọc lịch sử làm bánh từ localStorage:', e);
      return [];
    }
  }
  return [];
}

/**
 * Lưu toàn bộ danh sách lịch sử làm bánh vào Database (Supabase Cloud & Local SQL)
 */
export async function saveBakingHistoryToDb(records: BakingHistoryRecord[]): Promise<void> {
  const deduped = deduplicateBakingHistory(records);

  // 1. Lưu LocalStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_BAKING_HISTORY, JSON.stringify(deduped));
      window.dispatchEvent(new CustomEvent(BAKING_HISTORY_UPDATED_EVENT, { detail: deduped }));
    } catch (e) {
      console.warn('Lỗi lưu bakery_baking_history vào localStorage:', e);
    }
  }

  // 2. Đồng bộ lên Cloud Supabase nếu online & không ở chế độ Local Mode
  if (typeof navigator !== 'undefined' && navigator.onLine && !isLocalMode()) {
    try {
      const payload = JSON.stringify(deduped);
      const { error } = await supabase.from('recipes').upsert(
        {
          id: DB_ROW_BAKING_HISTORY_ID,
          name: DB_ROW_BAKING_HISTORY_NAME,
          notes: payload,
          is_active: false,
        },
        { onConflict: 'id' }
      );

      if (error) {
        console.warn('Lỗi upsert SYS_CONFIG_BAKING_HISTORY lên Supabase:', error.message);
      }
    } catch (cloudErr) {
      console.warn('Lỗi đồng bộ lịch sử làm bánh lên Cloud SQL:', cloudErr);
    }
  }

  // 3. Đồng bộ vào Local SQL nếu có
  try {
    await autoSyncToLocalSqlFolder();
  } catch (localErr) {
    console.warn('Lỗi autoSyncToLocalSqlFolder khi lưu lịch sử làm bánh:', localErr);
  }
}

/**
 * Ghi nhận thêm 1 bản ghi làm bánh mới
 */
export async function recordBakingLog(
  record: Omit<BakingHistoryRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<BakingHistoryRecord> {
  const fullRecord: BakingHistoryRecord = {
    id: record.id || `bake-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: record.createdAt || new Date().toISOString(),
    ...record,
  };
  const current = getBakingHistory();
  const updated = [fullRecord, ...current];
  await saveBakingHistoryToDb(updated);
  return fullRecord;
}

/**
 * Tải lịch sử làm bánh từ Cloud Supabase về đồng bộ
 */
export async function fetchBakingHistoryFromDb(): Promise<BakingHistoryRecord[]> {
  const fallback = getBakingHistory();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_BAKING_HISTORY_ID},name.eq.${DB_ROW_BAKING_HISTORY_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = deduplicateBakingHistory([...parsed, ...fallback]);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY_BAKING_HISTORY, JSON.stringify(merged));
            window.dispatchEvent(new CustomEvent(BAKING_HISTORY_UPDATED_EVENT, { detail: merged }));
          } catch {}
        }
        return merged;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchBakingHistoryFromDb:', err);
  }
  return fallback;
}
