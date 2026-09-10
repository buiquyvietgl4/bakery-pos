// src/lib/utils/closingManager.ts

import { AccountingClosingRecord, ClosingPeriodType } from '@/lib/types/closing';
import { getStoreBranding } from './storeBranding';

const STORAGE_KEY = 'bakery_closing_records';
export const CLOSING_UPDATED_EVENT = 'bakery_closing_records_updated';

/**
 * Lấy toàn bộ danh sách các kỳ đã chốt sổ
 */
export function getClosingRecords(): AccountingClosingRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Lỗi khi đọc danh sách chốt sổ:', e);
    return [];
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

    // Phân loại tiền mặt vs chuyển khoản / ví
    let isCash = true;
    if (Array.isArray(o.payments) && o.payments.length > 0) {
      const hasBank = o.payments.some((p: any) => p.method !== 'cash');
      if (hasBank) isCash = false;
    } else if (o.payment_method && o.payment_method !== 'cash') {
      isCash = false;
    }

    if (isCash) {
      cashRevenue += amt;
    } else {
      bankRevenue += amt;
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
    <html>
      <head>
        <meta charset="utf-8">
        <title>Phiếu Chốt Sổ - ${record.periodLabel}</title>
        <style>
          @page { size: auto; margin: 5mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 12px; margin: 0; color: #111; font-size: 13px; line-height: 1.4; }
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
