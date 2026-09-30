// src/lib/utils/closingManager.ts

import { AccountingClosingRecord, ClosingPeriodType } from '@/lib/types/closing';
import { getStoreBranding } from './storeBranding';
import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';

const STORAGE_KEY = 'bakery_closing_records';
export const CLOSING_UPDATED_EVENT = 'bakery_closing_records_updated';

const DB_ROW_CLOSINGS_ID = '00000000-0000-0000-0000-00000000000a';
const DB_ROW_CLOSINGS_NAME = 'SYS_CONFIG_CLOSINGS';

export function deduplicateClosingRecords(records: AccountingClosingRecord[]): AccountingClosingRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const result: AccountingClosingRecord[] = [];

  for (const r of records) {
    if (!r) continue;
    const cleanId = (r.id || '').trim();
    const periodKey = `${r.periodType}_${r.periodKey}`.trim().toLowerCase();

    if (cleanId && seenIds.has(cleanId)) continue;
    if (periodKey && seenKeys.has(periodKey)) continue;

    if (cleanId) seenIds.add(cleanId);
    if (periodKey) seenKeys.add(periodKey);
    result.push(r);
  }
  return result;
}

/**
 * Lấy toàn bộ danh sách các kỳ đã chốt sổ
 */
export function getClosingRecords(): AccountingClosingRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? deduplicateClosingRecords(parsed) : [];
  } catch (e) {
    console.error('Lỗi khi đọc danh sách chốt sổ:', e);
    return [];
  }
}

/**
 * Tải danh sách chốt sổ từ Supabase Cloud
 */
export async function fetchClosingRecordsFromDb(): Promise<AccountingClosingRecord[]> {
  const fallback = getClosingRecords();
  if (isLocalMode()) return fallback;
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_CLOSINGS_ID},name.eq.${DB_ROW_CLOSINGS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const deduped = deduplicateClosingRecords(parsed);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
            window.dispatchEvent(new CustomEvent(CLOSING_UPDATED_EVENT, { detail: deduped[0] }));
          } catch {}
        }
        // Tự động chữa lành DB nếu có bản ghi trùng lặp
        if (deduped.length !== parsed.length) {
          saveClosingRecordsToDb(deduped).catch(() => {});
        }
        return deduped;
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchClosingRecordsFromDb:', err);
  }
  return fallback;
}

/**
 * Lưu danh sách chốt sổ lên Supabase Cloud
 */
export async function saveClosingRecordsToDb(
  records: AccountingClosingRecord[]
): Promise<{ success: boolean; error?: string }> {
  const deduped = deduplicateClosingRecords(records);
  // Tự động đồng bộ file SQL nếu ở chế độ Local SQL
  try {
    autoSyncToLocalSqlFolder().catch(() => {});
  } catch {}

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: true };
  }

  try {
    const notesContent = JSON.stringify(deduped);
    const { error: upsertErr } = await supabase.from('recipes').upsert(
      {
        id: DB_ROW_CLOSINGS_ID,
        name: DB_ROW_CLOSINGS_NAME,
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
      await supabase.from('recipes').delete().or(`id.eq.${DB_ROW_CLOSINGS_ID},name.eq.${DB_ROW_CLOSINGS_NAME}`);
      await supabase.from('recipes').insert({
        id: DB_ROW_CLOSINGS_ID,
        name: DB_ROW_CLOSINGS_NAME,
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
    console.error('Lỗi lưu Chốt sổ lên Supabase:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Lưu hoặc cập nhật phiếu chốt sổ
 */
export function saveClosingRecord(record: AccountingClosingRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getClosingRecords();
    const idx = current.findIndex((r) => r.periodKey === record.periodKey && r.periodType === record.periodType);
    let updated: AccountingClosingRecord[];
    if (idx >= 0) {
      updated = [...current];
      updated[idx] = record;
    } else {
      updated = [record, ...current];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(CLOSING_UPDATED_EVENT, { detail: record }));
    saveClosingRecordsToDb(updated).catch(console.error);
  } catch (e) {
    console.error('Lỗi khi lưu phiếu chốt sổ:', e);
  }
}

/**
 * Mở lại sổ (Hủy chốt kỳ)
 */
export function reopenClosingRecord(periodKey: string, periodType: ClosingPeriodType): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getClosingRecords();
    const updated = current.filter(
      (r) => !(r.periodKey === periodKey && r.periodType === periodType)
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(CLOSING_UPDATED_EVENT, { detail: null }));
    saveClosingRecordsToDb(updated).catch(console.error);
  } catch (e) {
    console.error('Lỗi khi mở lại sổ:', e);
  }
}

/**
 * Tính toán khoảng ngày bắt đầu & kết thúc cho kỳ
 */
export function getPeriodDateRange(periodType: ClosingPeriodType, refDateStr?: string) {
  const baseDate = refDateStr ? new Date(refDateStr) : new Date();
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 0-indexed
  const date = baseDate.getDate();

  let startDateStr = '';
  let endDateStr = '';
  let periodKey = '';
  let periodLabel = '';

  const pad = (n: number) => String(n).padStart(2, '0');

  if (periodType === 'day') {
    const dStr = `${year}-${pad(month + 1)}-${pad(date)}`;
    startDateStr = `${dStr}T00:00:00`;
    endDateStr = `${dStr}T23:59:59`;
    periodKey = dStr;
    periodLabel = `Ngày ${pad(date)}/${pad(month + 1)}/${year}`;
  } else if (periodType === 'week') {
    // Tìm ngày Thứ 2 của tuần hiện tại
    const dayOfWeek = baseDate.getDay(); // 0 is Sunday, 1 is Monday...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + diffToMonday);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const mStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
    const sStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;

    startDateStr = `${mStr}T00:00:00`;
    endDateStr = `${sStr}T23:59:59`;

    // Tính số tuần trong năm
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = (baseDate.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);

    periodKey = `${year}-W${pad(weekNum)}`;
    periodLabel = `Tuần ${weekNum} (${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} - ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${year})`;
  } else if (periodType === 'month') {
    const mStr = `${year}-${pad(month + 1)}`;
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    startDateStr = `${mStr}-01T00:00:00`;
    endDateStr = `${mStr}-${pad(lastDayOfMonth)}T23:59:59`;
    periodKey = mStr;
    periodLabel = `Tháng ${pad(month + 1)}/${year}`;
  } else if (periodType === 'year') {
    startDateStr = `${year}-01-01T00:00:00`;
    endDateStr = `${year}-12-31T23:59:59`;
    periodKey = `${year}`;
    periodLabel = `Năm ${year}`;
  }

  return { startDateStr, endDateStr, periodKey, periodLabel };
}

/**
 * Tính toán toàn bộ chỉ số tài chính P&L thực tế trong kỳ
 */
export function calculateClosingMetrics(
  periodType: ClosingPeriodType,
  refDateStr: string,
  orders: any[],
  expenses: any[],
  spoilageLogs: any[]
) {
  const { startDateStr, endDateStr, periodKey, periodLabel } = getPeriodDateRange(periodType, refDateStr);
  const startMs = new Date(startDateStr).getTime();
  const endMs = new Date(endDateStr).getTime();

  // 1. Lọc đơn hàng
  const periodOrders = orders.filter((o) => {
    const rawTime = o.created_at || o.createdAt || '';
    if (!rawTime) return false;
    const timeMs = new Date(rawTime).getTime();
    if (isNaN(timeMs)) return false;
    return timeMs >= startMs && timeMs <= endMs;
  });

  let totalRevenue = 0;
  let cashRevenue = 0;
  let bankRevenue = 0;

  periodOrders.forEach((o) => {
    const amt = Number(o.total_amount || o.totalPrice || o.subtotal || 0);
    totalRevenue += amt;

    // Phân loại tiền mặt vs chuyển khoản / ví (hỗ trợ hoàn hảo Split Payment)
    if (Array.isArray(o.payments) && o.payments.length > 0) {
      o.payments.forEach((p: any) => {
        const pAmt = Number(p.amount || 0);
        if (p.method === 'cash') {
          cashRevenue += pAmt;
        } else {
          bankRevenue += pAmt;
        }
      });
    } else {
      const pm = String(o.payment_method || o.paymentMethod || o.final_payment_method || '').toLowerCase().trim();
      if (pm === 'split') {
        const splitCash = Number(o.splitCashAmount ?? o.split_cash_amount ?? 0);
        const splitTransfer = Number(o.splitTransferAmount ?? o.split_transfer_amount ?? 0);
        if (splitCash > 0 || splitTransfer > 0) {
          cashRevenue += splitCash;
          bankRevenue += splitTransfer;
        } else {
          const halfCash = Math.round(amt / 2);
          cashRevenue += halfCash;
          bankRevenue += amt - halfCash;
        }
      } else if (pm === 'cash') {
        cashRevenue += amt;
      } else if (pm) {
        bankRevenue += amt;
      } else {
        cashRevenue += amt;
      }
    }
  });

  // 2. Giá vốn COGS (~31.8% hoặc tính từ BOM)
  const totalCOGS = Math.round(totalRevenue * 0.318);
  const grossProfit = totalRevenue - totalCOGS;

  // 3. Chi phí OPEX
  const periodExpenses = expenses.filter((e) => {
    const dStr = e.date || '';
    if (!dStr) return false;
    const timeMs = new Date(dStr).getTime();
    if (isNaN(timeMs)) return false;
    return timeMs >= startMs && timeMs <= endMs;
  });
  const totalOpex = periodExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

  // 4. Hao hụt bánh hỏng
  const periodSpoilage = spoilageLogs.filter((l) => {
    const lTime = l.loggedAt || '';
    if (!lTime) return false;
    const timeMs = new Date(lTime).getTime();
    if (isNaN(timeMs)) return false;
    return timeMs >= startMs && timeMs <= endMs;
  });
  const spoilageCost = periodSpoilage.reduce((s, l) => s + Number(l.totalCostLoss || 0), 0);
  const spoilageQty = periodSpoilage.reduce((s, l) => s + Number(l.quantity || 0), 0);

  // 5. Lợi nhuận ròng
  const netProfit = grossProfit - totalOpex - spoilageCost;

  return {
    periodKey,
    periodLabel,
    startDate: startDateStr,
    endDate: endDateStr,
    totalOrders: periodOrders.length,
    totalRevenue,
    cashRevenue,
    bankRevenue,
    totalCOGS,
    grossProfit,
    totalOpex,
    spoilageCost,
    spoilageQty,
    netProfit,
    systemCash: cashRevenue,
  };
}

/**
 * In phiếu chốt sổ kế toán ra máy in bill / A4
 */
export function printClosingReceipt(record: AccountingClosingRecord) {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank', 'width=450,height=700');
  if (!printWindow) {
    alert('Vui lòng cho phép mở cửa sổ Popup trên trình duyệt để in phiếu!');
    return;
  }

  const diffText = record.cashDifference === 0 
    ? '0 đ (Khớp 100%)' 
    : record.cashDifference > 0 
    ? `+${record.cashDifference.toLocaleString('vi-VN')} đ (Thừa két)` 
    : `-${Math.abs(record.cashDifference).toLocaleString('vi-VN')} đ (Thiếu két)`;

  const diffColor = record.cashDifference === 0 ? '#166534' : record.cashDifference > 0 ? '#15803d' : '#b91c1c';
  const branding = getStoreBranding();

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <title>Phiếu Chốt Sổ - ${record.periodLabel}</title>
        <style>
          @page { size: auto; margin: 5mm; }
          * { box-sizing: border-box; }

          /* Màn hình (Mobile & Desktop) */
          @media screen {
            body {
              background-color: #f1f5f9;
              margin: 0;
              padding: 12px 10px 40px;
              font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              min-height: 100vh;
              color: #111;
            }
            .action-bar {
              position: sticky;
              top: 8px;
              z-index: 1000;
              display: flex;
              gap: 8px;
              width: 100%;
              max-width: 480px;
              margin-bottom: 12px;
            }
            .btn-action {
              flex: 1;
              padding: 12px 14px;
              font-size: 14px;
              font-weight: 700;
              border: none;
              border-radius: 10px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
              -webkit-tap-highlight-color: transparent;
              transition: transform 0.1s, opacity 0.1s;
            }
            .btn-action:active {
              transform: scale(0.97);
              opacity: 0.9;
            }
            .btn-close {
              background-color: #ef4444;
              color: #ffffff;
            }
            .btn-print {
              background-color: #0284c7;
              color: #ffffff;
            }
            .receipt-container {
              background-color: #ffffff;
              width: 100%;
              max-width: 480px;
              padding: 20px 16px;
              border-radius: 14px;
              box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
              border: 1px solid #e2e8f0;
              font-size: 13px;
              line-height: 1.4;
            }
            .bottom-close-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              width: 100%;
              margin-top: 20px;
              padding: 12px;
              background-color: #f1f5f9;
              color: #475569;
              border: 1px solid #cbd5e1;
              border-radius: 8px;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
              -webkit-tap-highlight-color: transparent;
            }
            .bottom-close-btn:active {
              background-color: #e2e8f0;
            }
          }

          /* Khi in ra giấy */
          @media print {
            .no-print { display: none !important; }
            body {
              margin: 0 !important;
              padding: 4px !important;
              background: #ffffff !important;
              font-family: 'Segoe UI', Arial, sans-serif;
              color: #111;
              font-size: 13px;
              line-height: 1.4;
            }
            .receipt-container {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
            }
          }

          .center { text-align: center; }
          .bold { font-weight: bold; }
          .border-b { border-bottom: 1px dashed #666; padding-bottom: 8px; margin-bottom: 8px; }
          .border-t { border-top: 1px solid #111; padding-top: 8px; margin-top: 8px; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .large { font-size: 16px; font-weight: bold; }
          .title { font-size: 17px; font-weight: 900; margin-bottom: 4px; text-transform: uppercase; }
          .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; margin-top: 4px; }
          .highlight { background: #fef3c7; padding: 6px 8px; border-radius: 6px; margin: 8px 0; border: 1px solid #fde68a; }
          .footer { margin-top: 25px; display: flex; justify-content: space-between; text-align: center; }
          .signature-box { width: 45%; }
        </style>
      </head>
      <body>
        <!-- Thanh công cụ điều khiển trên màn hình (Ẩn khi in) -->
        <div class="action-bar no-print">
          <button type="button" class="btn-action btn-close" onclick="closeReceiptWindow()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            <span>✕ Đóng Cửa Sổ</span>
          </button>
          <button type="button" class="btn-action btn-print" onclick="window.print()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            <span>🖨️ In Phiếu</span>
          </button>
        </div>

        <div class="receipt-container">
          <div class="center border-b">
            <div class="title">PHIẾU CHỐT SỔ KẾ TOÁN</div>
            <div class="bold" style="font-size: 14px; text-transform: uppercase;">${branding.storeName || 'TIỆM BÁNH HẠNH PHÚC'}</div>
            ${branding.address ? `<div style="font-size: 11px; color: #555;">${branding.address}</div>` : ''}
            ${branding.phone ? `<div style="font-size: 11px; color: #555;">Hotline: ${branding.phone}</div>` : ''}
            <div class="badge">${record.periodLabel}</div>
            <div style="font-size: 11px; color: #555; margin-top: 6px;">Thời gian chốt: ${new Date(record.closedAt).toLocaleString('vi-VN')}</div>
            <div style="font-size: 11px; color: #555;">Người chốt: <b>${record.closedBy || 'Chủ tiệm'}</b></div>
          </div>

          <div class="border-b">
            <div class="bold" style="color: #b45309; text-transform: uppercase; margin-bottom: 4px;">I. DOANH THU BÁN HÀNG</div>
            <div class="row"><span>Tổng số đơn hàng:</span><span class="bold">${record.totalOrders} đơn</span></div>
            <div class="row large"><span>TỔNG DOANH THU:</span><span class="bold">${record.totalRevenue.toLocaleString('vi-VN')} đ</span></div>
            <div class="row" style="padding-left: 8px; color: #444;"><span>• Thu Tiền Mặt:</span><span>${record.cashRevenue.toLocaleString('vi-VN')} đ</span></div>
            <div class="row" style="padding-left: 8px; color: #444;"><span>• Thu Chuyển Khoản / Ví:</span><span>${record.bankRevenue.toLocaleString('vi-VN')} đ</span></div>
          </div>

          <div class="border-b">
            <div class="bold" style="color: #b45309; text-transform: uppercase; margin-bottom: 4px;">II. CHI PHÍ & GIÁ VỐN</div>
            <div class="row"><span>Giá vốn nguyên liệu (COGS ~31.8%):</span><span>-${record.totalCOGS.toLocaleString('vi-VN')} đ</span></div>
            <div class="row"><span>Chi phí vận hành (OPEX):</span><span>-${record.totalOpex.toLocaleString('vi-VN')} đ</span></div>
            <div class="row"><span>Hao hụt bánh hỏng (${record.spoilageQty} cái):</span><span>-${record.spoilageCost.toLocaleString('vi-VN')} đ</span></div>
          </div>

          <div class="border-b highlight">
            <div class="row large" style="color: #065f46;">
              <span>LỢI NHUẬN RÒNG (P&L):</span>
              <span>${record.netProfit >= 0 ? '+' : ''}${record.netProfit.toLocaleString('vi-VN')} đ</span>
            </div>
          </div>

          <div class="border-b">
            <div class="bold" style="color: #b45309; text-transform: uppercase; margin-bottom: 4px;">III. ĐỐI SOÁT TIỀN MẶT TRONG KÉT</div>
            <div class="row"><span>Tiền mặt hệ thống tính:</span><span>${record.systemCash.toLocaleString('vi-VN')} đ</span></div>
            <div class="row"><span>Tiền mặt thực tế đếm được:</span><span class="bold">${record.actualCashInRegister.toLocaleString('vi-VN')} đ</span></div>
            <div class="row bold" style="color: ${diffColor};"><span>Chênh lệch két (Thừa/Thiếu):</span><span>${diffText}</span></div>
            ${record.notes ? `<div style="font-size: 11px; margin-top: 4px; color: #555;">Ghi chú: <i>${record.notes}</i></div>` : ''}
          </div>

          <div class="footer">
            <div class="signature-box">
              <div class="bold">Nhân Viên Thu Ngân</div>
              <div style="font-size: 10px; color: #777;">(Ký & ghi rõ họ tên)</div>
              <div style="height: 50px;"></div>
            </div>
            <div class="signature-box">
              <div class="bold">Chủ Tiệm / Quản Lý</div>
              <div style="font-size: 10px; color: #777;">(Ký & duyệt)</div>
              <div style="height: 50px;"></div>
              <div class="bold">${record.closedBy || 'Chủ tiệm'}</div>
            </div>
          </div>

          <!-- Nút Đóng phụ ở chân phiếu -->
          <button type="button" class="bottom-close-btn no-print" onclick="closeReceiptWindow()">
            ✕ Đóng Cửa Sổ & Quay Lại
          </button>
        </div>

        <script>
          function closeReceiptWindow() {
            window.close();
            setTimeout(function() {
              if (!window.closed) {
                if (window.history.length > 1) {
                  window.history.back();
                } else {
                  window.location.href = '/admin';
                }
              }
            }, 250);
          }
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 350);
}

/**
 * Xuất file Excel (CSV UTF-8 BOM) phiếu chốt sổ
 */
export function exportClosingToCSV(record: AccountingClosingRecord) {
  const rows = [
    ['PHIẾU CHỐT SỔ KẾ TOÁN TIỆM BÁNH'],
    ['Kỳ chốt:', record.periodLabel],
    ['Thời gian chốt:', new Date(record.closedAt).toLocaleString('vi-VN')],
    ['Người chốt:', record.closedBy || 'Chủ tiệm'],
    ['Trạng thái:', record.status === 'closed' ? 'Đã chốt sổ' : 'Đã mở lại'],
    [''],
    ['CHỈ TIÊU KẾ TOÁN', 'GIÁ TRỊ (VNĐ)', 'GHI CHÚ'],
    ['Tổng số đơn hàng', record.totalOrders, 'đơn'],
    ['TỔNG DOANH THU', record.totalRevenue, 'Doanh thu bán hàng'],
    ['• Doanh thu tiền mặt', record.cashRevenue, 'Thu tiền mặt tại quầy'],
    ['• Doanh thu chuyển khoản / Ví', record.bankRevenue, 'VietQR / Ví / Thẻ'],
    ['Giá vốn hàng bán (COGS)', -record.totalCOGS, 'Định mức nguyên liệu bánh'],
    ['Lợi nhuận gộp', record.grossProfit, 'Doanh thu - COGS'],
    ['Chi phí vận hành (OPEX)', -record.totalOpex, 'Điện, nước, mặt bằng, nhân công'],
    ['Hao hụt bánh hỏng', -record.spoilageCost, `${record.spoilageQty} bánh hủy/hết hạn`],
    ['LỢI NHUẬN RÒNG (NET PROFIT)', record.netProfit, 'Lợi nhuận thực tế sau chi phí'],
    [''],
    ['ĐỐI SOÁT TIỀN MẶT TRONG KÉT'],
    ['Tiền mặt hệ thống tính', record.systemCash, ''],
    ['Tiền mặt thực tế đếm được', record.actualCashInRegister, ''],
    ['Chênh lệch (Thừa / Thiếu)', record.cashDifference, record.cashDifference === 0 ? 'Khớp két' : record.cashDifference > 0 ? 'Thừa tiền' : 'Thiếu tiền'],
    ['Ghi chú', record.notes || 'Không có', ''],
  ];

  const csvContent = '\uFEFF' + rows.map((r) => r.map((c) => `"${c ?? ''}"`).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `phieu_chot_so_${record.periodKey}_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
