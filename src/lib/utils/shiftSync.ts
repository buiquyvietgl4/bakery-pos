// src/lib/utils/shiftSync.ts
// Quản lý và đồng bộ Két Tiền Quầy / Ca Bán Hàng & Lịch Sử Giao Ca giữa các thiết bị
// Hỗ trợ cả 2 chế độ: Cloud Supabase SQL và Local SQL Folder (Cục bộ máy tính)

import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { ShiftState, ShiftRecord, ShiftStatus } from '@/lib/types/shift';
import {
  broadcastShiftUpdated,
  broadcastShiftHistoryUpdated,
} from '@/lib/supabase/realtimeSync';

export type { ShiftState, ShiftRecord, ShiftStatus };

export const STORAGE_KEY_CURRENT_SHIFT = 'bakery_current_shift';
export const STORAGE_KEY_SHIFT_HISTORY = 'bakery_shift_history';

export const SYS_CONFIG_CURRENT_SHIFT = '00000000-0000-0000-0000-000000000012';
export const SYS_CONFIG_CURRENT_SHIFT_NAME = 'SYS_CONFIG_CURRENT_SHIFT';

export const SYS_CONFIG_SHIFT_HISTORY = '00000000-0000-0000-0000-000000000030';
export const SYS_CONFIG_SHIFT_HISTORY_NAME = 'SYS_CONFIG_SHIFT_HISTORY';

export const EVENT_CURRENT_SHIFT_UPDATED = 'bakery_current_shift_updated';
export const EVENT_SHIFT_HISTORY_UPDATED = 'bakery_shift_history_updated';

/**
 * Sinh mã ca bán hàng mới chuẩn hóa (Ví dụ: CA-260919-01)
 */
export function generateShiftCode(existingCountToday: number = 0): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dStr = `${String(now.getFullYear()).slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const seq = pad(existingCountToday + 1);
  return `CA-${dStr}-${seq}`;
}

export function createInitialShift(openingCash: number = 0, openedBy: string = 'Thu Ngân'): ShiftState {
  const now = new Date();
  return {
    id: `shift-${Date.now()}`,
    shiftCode: generateShiftCode(0),
    isOpen: true,
    openedAt: now.toISOString(),
    openingCash,
    cashSales: 0,
    transferSales: 0,
    orderCount: 0,
    openedBy,
  };
}

export const DEFAULT_SHIFT: ShiftState = createInitialShift(0, 'Thu Ngân');

// ══════════════════════════════════════════════════════════════════════════════
// 1. QUẢN LÝ CA BÁN HÀNG HIỆN TẠI (CURRENT SHIFT & TIỀN KÉT)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Lấy ca hiện tại từ LocalStorage
 */
export function getCurrentShiftLocally(): ShiftState {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CURRENT_SHIFT);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          id: parsed.id || `shift-${Date.now()}`,
          shiftCode: parsed.shiftCode || generateShiftCode(0),
          isOpen: parsed.isOpen ?? true,
          openedAt: parsed.openedAt || new Date().toISOString(),
          openingCash: Number(parsed.openingCash !== undefined ? parsed.openingCash : 0),
          cashSales: Number(parsed.cashSales ?? 0),
          transferSales: Number(parsed.transferSales ?? 0),
          orderCount: Number(parsed.orderCount ?? 0),
          openedBy: parsed.openedBy || 'Thu Ngân',
          notes: parsed.notes,
        };
      }

      // Nếu chưa có ca hiện tại trong localStorage, kế thừa số dư bàn giao từ ca gần nhất
      const history = getShiftHistoryLocally();
      if (history.length > 0) {
        const last = history[0];
        const lastCash = last.transferredToNextShift !== undefined ? Number(last.transferredToNextShift) : Number(last.closingCash || 0);
        const inheritedShift = createInitialShift(lastCash, last.staffName || 'Thu Ngân');
        saveCurrentShiftLocally(inheritedShift);
        return inheritedShift;
      }
    } catch (e) {
      console.warn('Lỗi đọc ca bán hàng cục bộ:', e);
    }
  }
  return DEFAULT_SHIFT;
}

/**
 * Lưu ca vào LocalStorage và bắn event nội bộ
 */
export function saveCurrentShiftLocally(shift: ShiftState): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_CURRENT_SHIFT, JSON.stringify(shift));
      window.dispatchEvent(new CustomEvent(EVENT_CURRENT_SHIFT_UPDATED, { detail: shift }));
    } catch (e) {
      console.warn('Lỗi lưu ca bán hàng cục bộ:', e);
    }
  }
}

/**
 * Tải ca bán hàng mới nhất từ Supabase Cloud
 */
export async function fetchCurrentShiftFromDb(): Promise<ShiftState> {
  const fallback = getCurrentShiftLocally();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${SYS_CONFIG_CURRENT_SHIFT},name.eq.${SYS_CONFIG_CURRENT_SHIFT_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (parsed && typeof parsed === 'object') {
          const cloudShift: ShiftState = {
            id: parsed.id || fallback.id || `shift-${Date.now()}`,
            shiftCode: parsed.shiftCode || fallback.shiftCode || generateShiftCode(0),
            isOpen: parsed.isOpen ?? true,
            openedAt: parsed.openedAt || fallback.openedAt,
            openingCash: Number(parsed.openingCash !== undefined ? parsed.openingCash : fallback.openingCash),
            cashSales: Number(parsed.cashSales ?? 0),
            transferSales: Number(parsed.transferSales ?? 0),
            orderCount: Number(parsed.orderCount ?? 0),
            openedBy: parsed.openedBy || fallback.openedBy || 'Thu Ngân',
            notes: parsed.notes,
          };
          saveCurrentShiftLocally(cloudShift);
          return cloudShift;
        }
      } catch (parseErr) {
        console.warn('Lỗi parse JSON SYS_CONFIG_CURRENT_SHIFT:', parseErr);
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchCurrentShiftFromDb:', err);
  }

  return fallback;
}

/**
 * Lưu ca bán hàng lên SQL (Đồng bộ cả Cloud SQL Supabase và Local SQL)
 */
export async function saveCurrentShiftToDb(shift: ShiftState): Promise<void> {
  saveCurrentShiftLocally(shift);

  // 1. Chế độ Local SQL: Ghi đĩa cục bộ
  if (isLocalMode()) {
    autoSyncToLocalSqlFolder().catch(() => {});
    return;
  }

  // 2. Chế độ Offline tạm thời
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  // 3. Chế độ Cloud Supabase SQL
  try {
    const notesContent = JSON.stringify(shift);
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: SYS_CONFIG_CURRENT_SHIFT,
        name: SYS_CONFIG_CURRENT_SHIFT_NAME,
        yield_qty: 1,
        yield_unit: 'ca',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      await supabase.from('recipes').delete().or(`id.eq.${SYS_CONFIG_CURRENT_SHIFT},name.eq.${SYS_CONFIG_CURRENT_SHIFT_NAME}`);
      await supabase.from('recipes').insert({
        id: SYS_CONFIG_CURRENT_SHIFT,
        name: SYS_CONFIG_CURRENT_SHIFT_NAME,
        yield_qty: 1,
        yield_unit: 'ca',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
        updated_at: new Date().toISOString(),
      });
    }

    // Phát sóng Realtime cho toàn bộ các thiết bị
    broadcastShiftUpdated(shift).catch(() => {});
  } catch (err) {
    console.warn('Lỗi saveCurrentShiftToDb:', err);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. QUẢN LÝ LỊCH SỬ GIAO CA & KIỂM KÉT (SHIFT HISTORY)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Lấy danh sách lịch sử các ca đã giao từ LocalStorage
 */
export function getShiftHistoryLocally(): ShiftRecord[] {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SHIFT_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Lọc nghiêm ngặt: Phải là bản ghi ca bán hàng thực sự (có shiftCode hoặc openingCash/closingCash)
          // Loại bỏ các object thông báo hay cấu hình khác bị ghi đè nhầm
          const valid = parsed
            .filter(
              (item: any) =>
                item &&
                typeof item === 'object' &&
                !item.type?.includes('notif') &&
                !item.channel &&
                (item.shiftCode || item.openingCash !== undefined || item.closingCash !== undefined)
            )
            .map((item: any) => {
              const diff = Math.round(Number(item.difference ?? 0));
              return {
                ...item,
                difference: diff,
                expectedCash: Math.round(Number(item.expectedCash ?? 0)),
                closingCash: Math.round(Number(item.closingCash ?? 0)),
                openingCash: Math.round(Number(item.openingCash ?? 0)),
                cashSales: Math.round(Number(item.cashSales ?? 0)),
                transferSales: Math.round(Number(item.transferSales ?? 0)),
                totalRevenue: Math.round(Number(item.totalRevenue ?? (Number(item.cashSales || 0) + Number(item.transferSales || 0)))),
                status: diff === 0 ? 'balanced' : diff > 0 ? 'surplus' : 'shortage',
              };
            });

          // Nếu có item rác bị lọc bỏ, đồng bộ lại localStorage cho sạch sẽ
          if (valid.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEY_SHIFT_HISTORY, JSON.stringify(valid));
          }
          return valid;
        }
      }
    } catch (e) {
      console.warn('Lỗi đọc lịch sử giao ca cục bộ:', e);
    }
  }
  return [];
}

/**
 * Lưu danh sách lịch sử giao ca vào LocalStorage và bắn event
 */
export function saveShiftHistoryLocally(history: ShiftRecord[]): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY_SHIFT_HISTORY, JSON.stringify(history));
      window.dispatchEvent(new CustomEvent(EVENT_SHIFT_HISTORY_UPDATED, { detail: history }));
    } catch (e) {
      console.warn('Lỗi lưu lịch sử giao ca cục bộ:', e);
    }
  }
}

/**
 * Tải danh sách lịch sử giao ca từ Cloud Supabase SQL
 */
export async function fetchShiftHistoryFromDb(): Promise<ShiftRecord[]> {
  const fallback = getShiftHistoryLocally();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return fallback;

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${SYS_CONFIG_SHIFT_HISTORY},name.eq.${SYS_CONFIG_SHIFT_HISTORY_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (Array.isArray(parsed)) {
          const valid = parsed
            .filter(
              (item: any) =>
                item &&
                typeof item === 'object' &&
                !item.type?.includes('notif') &&
                !item.channel &&
                (item.shiftCode || item.openingCash !== undefined || item.closingCash !== undefined)
            )
            .map((item: any) => {
              const diff = Math.round(Number(item.difference ?? 0));
              return {
                ...item,
                difference: diff,
                expectedCash: Math.round(Number(item.expectedCash ?? 0)),
                closingCash: Math.round(Number(item.closingCash ?? 0)),
                openingCash: Math.round(Number(item.openingCash ?? 0)),
                cashSales: Math.round(Number(item.cashSales ?? 0)),
                transferSales: Math.round(Number(item.transferSales ?? 0)),
                totalRevenue: Math.round(Number(item.totalRevenue ?? (Number(item.cashSales || 0) + Number(item.transferSales || 0)))),
                status: diff === 0 ? 'balanced' : diff > 0 ? 'surplus' : 'shortage',
              };
            });

          saveShiftHistoryLocally(valid);
          return valid;
        }
      } catch (parseErr) {
        console.warn('Lỗi parse JSON SYS_CONFIG_SHIFT_HISTORY:', parseErr);
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchShiftHistoryFromDb:', err);
  }

  return fallback;
}

/**
 * Lưu danh sách lịch sử giao ca lên SQL (cả Cloud Supabase và Local SQL)
 */
export async function saveShiftHistoryToDb(history: ShiftRecord[]): Promise<void> {
  saveShiftHistoryLocally(history);

  // 1. Chế độ Local SQL: Ghi đĩa cục bộ
  if (isLocalMode()) {
    autoSyncToLocalSqlFolder().catch(() => {});
    return;
  }

  // 2. Chế độ Offline tạm thời
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  // 3. Chế độ Cloud Supabase SQL
  try {
    const notesContent = JSON.stringify(history);
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: SYS_CONFIG_SHIFT_HISTORY,
        name: SYS_CONFIG_SHIFT_HISTORY_NAME,
        yield_qty: 1,
        yield_unit: 'lịch sử',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (upsertErr) {
      await supabase.from('recipes').delete().or(`id.eq.${SYS_CONFIG_SHIFT_HISTORY},name.eq.${SYS_CONFIG_SHIFT_HISTORY_NAME}`);
      await supabase.from('recipes').insert({
        id: SYS_CONFIG_SHIFT_HISTORY,
        name: SYS_CONFIG_SHIFT_HISTORY_NAME,
        yield_qty: 1,
        yield_unit: 'lịch sử',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
        updated_at: new Date().toISOString(),
      });
    }

    broadcastShiftHistoryUpdated(history).catch(() => {});
  } catch (err) {
    console.warn('Lỗi saveShiftHistoryToDb:', err);
  }
}

/**
 * Thực hiện nghiệp vụ Chốt Ca & Bàn Giao Két, tự động lưu lịch sử và mở ca mới
 */
export async function closeShiftAndOpenNew(params: {
  closingCash: number;
  staffName: string;
  notes?: string;
  transferredToNextShift?: number;
  storeId?: string;
}): Promise<{ closedShift: ShiftRecord; newShift: ShiftState }> {
  const current = getCurrentShiftLocally();
  const now = new Date();

  const openingCash = Number(current.openingCash || 0);
  const cashSales = Number(current.cashSales || 0);
  const transferSales = Number(current.transferSales || 0);
  const totalRevenue = cashSales + transferSales;
  const orderCount = Number(current.orderCount || 0);

  const expectedCash = openingCash + cashSales;
  const closingCash = Number(params.closingCash || 0);
  const difference = closingCash - expectedCash;

  let status: ShiftStatus = 'balanced';
  if (difference > 0) status = 'surplus';
  else if (difference < 0) status = 'shortage';

  const history = getShiftHistoryLocally();
  const todayPrefix = now.toISOString().slice(0, 10);
  const todayShiftsCount = history.filter((h) => (h.startedAt || '').startsWith(todayPrefix)).length;

  const closedShift: ShiftRecord = {
    id: current.id || `shift-${Date.now()}`,
    shiftCode: current.shiftCode || generateShiftCode(todayShiftsCount),
    staffName: params.staffName || current.openedBy || 'Thu Ngân',
    storeId: params.storeId || 'primary',
    startedAt: current.openedAt || now.toISOString(),
    endedAt: now.toISOString(),
    openingCash,
    cashSales,
    transferSales,
    totalRevenue,
    orderCount,
    expectedCash,
    closingCash,
    difference,
    status,
    notes: params.notes || '',
    transferredToNextShift: params.transferredToNextShift !== undefined ? params.transferredToNextShift : closingCash,
    createdAt: now.toISOString(),
  };

  // Cập nhật danh sách lịch sử
  const updatedHistory = [closedShift, ...history.filter((h) => h.id !== closedShift.id)];
  await saveShiftHistoryToDb(updatedHistory);

  // Mở ca mới
  const nextOpeningCash = params.transferredToNextShift !== undefined ? params.transferredToNextShift : closingCash;
  const newShift: ShiftState = {
    id: `shift-${Date.now()}`,
    shiftCode: generateShiftCode(todayShiftsCount + 1),
    isOpen: true,
    openedAt: now.toISOString(),
    openingCash: nextOpeningCash,
    cashSales: 0,
    transferSales: 0,
    orderCount: 0,
    openedBy: params.staffName || 'Thu Ngân',
  };
  await saveCurrentShiftToDb(newShift);

  return { closedShift, newShift };
}

/**
 * In phiếu bàn giao ca bán hàng & kiểm két khổ nhiệt 80mm
 */
export function printShiftHandoverReceipt(record: ShiftRecord, storeInfo?: any): void {
  if (typeof window === 'undefined') return;

  const storeName = storeInfo?.storeName || 'TIỆM BÁNH HẠNH PHÚC';
  const storeAddress = storeInfo?.address || '';
  const storePhone = storeInfo?.phone || '';

  const formatVnd = (num: number) => (num || 0).toLocaleString('vi-VN') + '₫';
  const formatDateTime = (isoStr?: string) => {
    if (!isoStr) return '--:--';
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const diffLabel = record.difference === 0 
    ? 'KHỚP 100% (0₫)' 
    : record.difference > 0 
    ? `THỪA +${formatVnd(record.difference)}` 
    : `THIẾU -${formatVnd(Math.abs(record.difference))}`;

  const diffClass = record.difference === 0 ? 'color: green;' : record.difference > 0 ? 'color: blue;' : 'color: red; font-weight: bold;';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Phiếu Bàn Giao Ca - ${record.shiftCode}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      width: 72mm;
      margin: 0 auto;
      padding: 10px 4px;
      color: #000;
      font-size: 12px;
      line-height: 1.4;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .title { font-size: 15px; font-weight: 900; margin: 6px 0 2px; }
    .subtitle { font-size: 11px; margin-bottom: 8px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-top: 2px solid #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    .signatures { display: flex; justify-content: space-between; margin-top: 20px; font-size: 11px; }
    .sig-col { text-align: center; width: 45%; }
  </style>
</head>
<body>
  <div class="text-center font-bold" style="font-size: 13px;">${storeName.toUpperCase()}</div>
  ${storeAddress ? `<div class="text-center" style="font-size: 10px;">${storeAddress}</div>` : ''}
  ${storePhone ? `<div class="text-center" style="font-size: 10px;">Hotline: ${storePhone}</div>` : ''}
  
  <div class="divider"></div>
  <div class="text-center title">BIÊN BẢN BÀN GIAO CA</div>
  <div class="text-center subtitle font-bold">Mã ca: ${record.shiftCode}</div>

  <div class="row"><span>Thu ngân bàn giao:</span><span class="font-bold">${record.staffName}</span></div>
  <div class="row"><span>Bắt đầu ca:</span><span>${formatDateTime(record.startedAt)}</span></div>
  <div class="row"><span>Kết thúc ca:</span><span>${formatDateTime(record.endedAt)}</span></div>
  <div class="row"><span>Số đơn hàng:</span><span class="font-bold">${record.orderCount} đơn</span></div>

  <div class="divider"></div>
  <div class="row"><span>Tiền vốn đầu ca:</span><span class="font-bold">${formatVnd(record.openingCash)}</span></div>
  <div class="row"><span>Doanh thu tiền mặt (+):</span><span class="font-bold">${formatVnd(record.cashSales)}</span></div>
  <div class="row"><span>Doanh thu CK/Ví (+):</span><span class="font-bold">${formatVnd(record.transferSales)}</span></div>
  <div class="row font-bold" style="font-size: 13px;"><span>TỔNG DOANH THU:</span><span>${formatVnd(record.totalRevenue)}</span></div>

  <div class="divider"></div>
  <div class="row font-bold"><span>Tiền mặt lý thuyết két:</span><span>${formatVnd(record.expectedCash)}</span></div>
  <div class="row font-bold" style="font-size: 13px;"><span>TIỀN THỰC TẾ ĐẾM:</span><span>${formatVnd(record.closingCash)}</span></div>
  <div class="row" style="margin-top: 4px;"><span>CHÊNH LỆCH QUỸ:</span><span style="${diffClass}">${diffLabel}</span></div>
  <div class="row" style="margin-top: 4px;"><span>Vốn để lại ca sau:</span><span class="font-bold">${formatVnd(record.transferredToNextShift || 0)}</span></div>

  ${record.notes ? `
    <div class="divider"></div>
    <div style="font-size: 11px;">
      <span class="font-bold">Ghi chú giải trình:</span>
      <div>${record.notes}</div>
    </div>
  ` : ''}

  <div class="double-divider"></div>
  <div class="signatures">
    <div class="sig-col">
      <div class="font-bold">Người bàn giao</div>
      <div style="font-size: 9px; color: #555;">(Ký & ghi rõ họ tên)</div>
      <div style="margin-top: 35px;">${record.staffName}</div>
    </div>
    <div class="sig-col">
      <div class="font-bold">Người nhận / Quản lý</div>
      <div style="font-size: 9px; color: #555;">(Ký & ghi rõ họ tên)</div>
      <div style="margin-top: 35px;">..........................</div>
    </div>
  </div>

  <div class="divider" style="margin-top: 20px;"></div>
  <div class="text-center" style="font-size: 9px; color: #777;">
    Hệ thống Tiệm Bánh ERP • In lúc ${formatDateTime(new Date().toISOString())}
  </div>
</body>
</html>
  `;

  const printWindow = window.open('', '_blank', 'width=380,height=600');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  }
}
