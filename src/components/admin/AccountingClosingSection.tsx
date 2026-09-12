// src/components/admin/AccountingClosingSection.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, CheckCircle2, DollarSign, TrendingUp, AlertTriangle, 
  Printer, FileSpreadsheet, Lock, Unlock, Clock, FileText, ArrowRight,
  TrendingDown, ShieldCheck, ChevronLeft, ChevronRight, RefreshCw, AlertCircle
} from 'lucide-react';
import { ClosingPeriodType, AccountingClosingRecord } from '@/lib/types/closing';
import { 
  getClosingRecords, 
  saveClosingRecord, 
  reopenClosingRecord, 
  calculateClosingMetrics, 
  printClosingReceipt, 
  exportClosingToCSV,
  CLOSING_UPDATED_EVENT 
} from '@/lib/utils/closingManager';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';

interface AccountingClosingSectionProps {
  orders: any[];
  expenses: any[];
  spoilageLogs: any[];
  adminName: string;
}

export const AccountingClosingSection: React.FC<AccountingClosingSectionProps> = ({
  orders,
  expenses,
  spoilageLogs,
  adminName,
}) => {
  const [periodType, setPeriodType] = useState<ClosingPeriodType>('day');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState<string>(String(new Date().getFullYear()));

  // Lịch sử các kỳ đã chốt
  const [closingRecords, setClosingRecords] = useState<AccountingClosingRecord[]>([]);

  // Tiền mặt kiểm kê trong két
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Tải danh sách chốt sổ từ LocalStorage
  const loadRecords = () => {
    setClosingRecords(getClosingRecords());
  };

  useEffect(() => {
    loadRecords();
    const handleUpdate = () => loadRecords();
    window.addEventListener(CLOSING_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(CLOSING_UPDATED_EVENT, handleUpdate);
  }, []);

  // Xác định ngày tham chiếu theo loại kỳ
  const refDateStr = useMemo(() => {
    if (periodType === 'day') return selectedDate;
    if (periodType === 'week') return selectedDate;
    if (periodType === 'month') return `${selectedMonth}-01`;
    if (periodType === 'year') return `${selectedYear}-01-01`;
    return selectedDate;
  }, [periodType, selectedDate, selectedMonth, selectedYear]);

  // Tính toán số liệu thực tế P&L cho kỳ đang chọn
  const currentMetrics = useMemo(() => {
    return calculateClosingMetrics(periodType, refDateStr, orders, expenses, spoilageLogs);
  }, [periodType, refDateStr, orders, expenses, spoilageLogs]);

  // Kiểm tra xem kỳ hiện tại đã được chốt chưa
  const existingClosedRecord = useMemo(() => {
    return closingRecords.find(
      (r) => r.periodKey === currentMetrics.periodKey && r.periodType === periodType && r.status === 'closed'
    );
  }, [closingRecords, currentMetrics.periodKey, periodType]);

  // Tự động điền tiền mặt thực tế khi mở kỳ đã chốt hoặc reset khi đổi kỳ
  useEffect(() => {
    if (existingClosedRecord) {
      setActualCashInput(String(existingClosedRecord.actualCashInRegister));
      setClosingNotes(existingClosedRecord.notes || '');
    } else {
      // Mặc định gợi ý bằng đúng số tiền mặt hệ thống tính được
      setActualCashInput(String(currentMetrics.systemCash));
      setClosingNotes('');
    }
  }, [existingClosedRecord, currentMetrics.periodKey, currentMetrics.systemCash]);

  // Độ lệch tiền mặt
  const actualCashNum = Number(actualCashInput.replace(/[^0-9]/g, '')) || 0;
  const cashDifference = actualCashNum - currentMetrics.systemCash;

  // Thực hiện chốt sổ
  const handleConfirmClosing = () => {
    const confirmMsg = `Xác nhận chốt sổ kế toán cho ${currentMetrics.periodLabel}?\n\n• Doanh thu: ${currentMetrics.totalRevenue.toLocaleString('vi-VN')}₫\n• Tiền mặt thực tế: ${actualCashNum.toLocaleString('vi-VN')}₫\n• Lợi nhuận ròng: ${currentMetrics.netProfit.toLocaleString('vi-VN')}₫`;
    if (!window.confirm(confirmMsg)) return;

    const record: AccountingClosingRecord = {
      id: `close-${periodType}-${currentMetrics.periodKey}-${Date.now()}`,
      periodType,
      periodKey: currentMetrics.periodKey,
      periodLabel: currentMetrics.periodLabel,
      startDate: currentMetrics.startDate,
      endDate: currentMetrics.endDate,
      closedAt: new Date().toISOString(),
      closedBy: adminName || 'Chủ tiệm',

      totalOrders: currentMetrics.totalOrders,
      totalRevenue: currentMetrics.totalRevenue,
      cashRevenue: currentMetrics.cashRevenue,
      bankRevenue: currentMetrics.bankRevenue,

      totalCOGS: currentMetrics.totalCOGS,
      grossProfit: currentMetrics.grossProfit,
      totalOpex: currentMetrics.totalOpex,
      spoilageCost: currentMetrics.spoilageCost,
      spoilageQty: currentMetrics.spoilageQty,
      netProfit: currentMetrics.netProfit,

      systemCash: currentMetrics.systemCash,
      actualCashInRegister: actualCashNum,
      cashDifference,

      notes: closingNotes.trim(),
      status: 'closed',
    };

    saveClosingRecord(record);
    loadRecords();
    setActionSuccessMsg(`Đã chốt sổ thành công cho ${currentMetrics.periodLabel}! Số liệu đã được khóa và lưu trữ.`);
    setTimeout(() => setActionSuccessMsg(null), 5000);
  };

  // Mở lại sổ
  const handleReopenClosing = () => {
    if (!window.confirm(`Bạn có chắc muốn mở lại sổ cho ${currentMetrics.periodLabel}?\nKỳ này sẽ được mở khóa để có thể chỉnh sửa hoặc cập nhật thêm số liệu.`)) return;

    reopenClosingRecord(currentMetrics.periodKey, periodType);
    loadRecords();
    setActionSuccessMsg(`Đã mở lại sổ cho ${currentMetrics.periodLabel}!`);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  return (
    <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs space-y-6">
      
      {/* HEADER PHÂN HỆ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            Nghiệp Vụ Kế Toán Trưởng
          </div>
          <h3 className="text-xl font-black text-zinc-900 tracking-tight mt-0.5">
            Chốt Sổ Kế Toán & Khóa Kỳ Thực Tế
          </h3>
          <p className="text-xs text-zinc-500">
            Tổng hợp doanh thu, giá vốn, chi phí và đối soát kiểm két tiền mặt theo Ngày, Tuần, Tháng hoặc Năm
          </p>
        </div>

        {/* BẬT CHỌN LOẠI KỲ: NGÀY / TUẦN / THÁNG / NĂM */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-2xl shrink-0">
          {(['day', 'week', 'month', 'year'] as ClosingPeriodType[]).map((type) => {
            const labels: Record<ClosingPeriodType, string> = {
              day: 'Theo Ngày',
              week: 'Theo Tuần',
              month: 'Theo Tháng',
              year: 'Theo Năm',
            };
            return (
              <button
                key={type}
                type="button"
                onClick={() => setPeriodType(type)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  periodType === type
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {labels[type]}
              </button>
            );
          })}
        </div>
      </div>

      {/* THÔNG BÁO THÀNH CÔNG */}
      {actionSuccessMsg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {actionSuccessMsg}
        </div>
      )}

      {/* KHỐI CHỌN MỐC THỜI GIAN CỤ THỂ */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-50 p-4 rounded-2xl border border-zinc-200 text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-700" />
          <span className="font-bold text-zinc-700">Thời gian kỳ chốt sổ:</span>
          {periodType === 'day' && (
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-white border border-zinc-300 rounded-xl px-3 py-1.5 font-bold text-zinc-800 shadow-2xs focus:border-amber-500 focus:outline-none"
            />
          )}
          {periodType === 'week' && (
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border border-zinc-300 rounded-xl px-3 py-1.5 font-bold text-zinc-800 shadow-2xs focus:border-amber-500 focus:outline-none"
              />
              <span className="text-zinc-400 text-[11px]">(Chọn ngày bất kỳ trong tuần)</span>
            </div>
          )}
          {periodType === 'month' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-white border border-zinc-300 rounded-xl px-3 py-1.5 font-bold text-zinc-800 shadow-2xs focus:border-amber-500 focus:outline-none"
            />
          )}
          {periodType === 'year' && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-white border border-zinc-300 rounded-xl px-3 py-1.5 font-bold text-zinc-800 shadow-2xs focus:border-amber-500 focus:outline-none"
            >
              <option value="2025">Năm 2025</option>
              <option value="2026">Năm 2026</option>
              <option value="2027">Năm 2027</option>
            </select>
          )}
        </div>

        {/* TRẠNG THÁI CHỐT SỔ CỦA KỲ NÀY */}
        <div>
          {existingClosedRecord ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs border border-emerald-300">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ĐÃ CHỐT SỔ ({new Date(existingClosedRecord.closedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 font-bold text-xs border border-amber-300">
              <Clock className="w-3.5 h-3.5 text-amber-700" />
              Chưa chốt sổ (Đang mở)
            </span>
          )}
        </div>
      </div>

      {/* BẢNG TỔNG KẾT P&L THỰC TẾ TRONG KỲ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        
        {/* DOANH THU */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Doanh Thu Thuần</div>
          <div className="text-xl font-black text-zinc-900 mt-1">
            {currentMetrics.totalRevenue.toLocaleString('vi-VN')}₫
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex flex-col gap-0.5">
            <span>• Tiền mặt: <b className="text-zinc-800">{currentMetrics.cashRevenue.toLocaleString('vi-VN')}₫</b></span>
            <span>• C.Khoản/Ví: <b className="text-zinc-800">{currentMetrics.bankRevenue.toLocaleString('vi-VN')}₫</b></span>
            <span>• Tổng đơn: <b>{currentMetrics.totalOrders} đơn</b></span>
          </div>
        </div>

        {/* GIÁ VỐN NGUYÊN LIỆU (COGS) */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Giá Vốn COGS (~31.8%)</div>
          <div className="text-xl font-black text-amber-700 mt-1">
            -{currentMetrics.totalCOGS.toLocaleString('vi-VN')}₫
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Lợi nhuận gộp: <b className="text-zinc-800">{currentMetrics.grossProfit.toLocaleString('vi-VN')}₫</b>
          </div>
        </div>

        {/* CHI PHÍ OPEX & BÁNH HỎNG */}
        <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200">
          <div className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Chi Phí & Hao Hụt</div>
          <div className="text-xl font-black text-rose-700 mt-1">
            -{(currentMetrics.totalOpex + currentMetrics.spoilageCost).toLocaleString('vi-VN')}₫
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 flex flex-col gap-0.5">
            <span>• OPEX: -{currentMetrics.totalOpex.toLocaleString('vi-VN')}₫</span>
            <span>• Hỏng ({currentMetrics.spoilageQty} cái): -{currentMetrics.spoilageCost.toLocaleString('vi-VN')}₫</span>
          </div>
        </div>

        {/* LỢI NHUẬN RÒNG THỰC TẾ (NET PROFIT) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200">
          <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            Lợi Nhuận Ròng (P&L)
          </div>
          <div className={`text-xl font-black mt-1 ${currentMetrics.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
            {currentMetrics.netProfit >= 0 ? '+' : ''}{currentMetrics.netProfit.toLocaleString('vi-VN')}₫
          </div>
          <div className="text-[11px] text-emerald-800/80 mt-1">
            Tỷ suất: <b>{currentMetrics.totalRevenue > 0 ? ((currentMetrics.netProfit / currentMetrics.totalRevenue) * 100).toFixed(1) : 0}%</b>
          </div>
        </div>

      </div>

      {/* KHỐI KIỂM ĐẾM TIỀN MẶT TRONG KÉT THỰC TẾ (CASH AUDIT) */}
      <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/40 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
            <DollarSign className="w-4 h-4 text-amber-700" />
            Kiểm Đếm Tiền Mặt Thực Tế Trong Két (Cash Reconciliation)
          </div>
          <div className="text-xs text-amber-900">
            Hệ thống tính tiền mặt thu được: <b className="font-mono text-zinc-900">{currentMetrics.systemCash.toLocaleString('vi-VN')}₫</b>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700 flex items-center justify-between">
              <span>Tiền mặt thực tế đếm được trong két:</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                cashDifference === 0 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : cashDifference > 0 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-rose-100 text-rose-800'
              }`}>
                {cashDifference === 0 ? '✅ Khớp 100%' : cashDifference > 0 ? `+${cashDifference.toLocaleString('vi-VN')}₫ (Thừa)` : `${cashDifference.toLocaleString('vi-VN')}₫ (Thiếu)`}
              </span>
            </label>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={formatCurrencyInput(actualCashInput)}
                onChange={(e) => setActualCashInput(parseCurrencyInput(e.target.value).toString())}
                placeholder="Nhập số tiền thực tế..."
                disabled={!!existingClosedRecord}
                className="w-full bg-white border border-zinc-300 rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-zinc-900 shadow-2xs focus:border-amber-500 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-600"
              />
              <span className="absolute right-3.5 top-2.5 text-xs text-zinc-400 font-bold">VNĐ</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-700">
              Ghi chú chốt sổ / Bàn giao ca:
            </label>
            <input
              type="text"
              value={closingNotes}
              onChange={(e) => setClosingNotes(e.target.value)}
              placeholder="VD: Đã nộp 5tr vào tài khoản, thừa 10k do khách tip..."
              disabled={!!existingClosedRecord}
              className="w-full bg-white border border-zinc-300 rounded-xl px-3.5 py-2.5 text-xs font-medium text-zinc-900 shadow-2xs focus:border-amber-500 focus:outline-none disabled:bg-zinc-100 disabled:text-zinc-600"
            />
          </div>
        </div>

        {/* NÚT THỰC HIỆN HÀNH ĐỘNG */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {existingClosedRecord ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => printClosingReceipt(existingClosedRecord)}
                className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-black text-white font-bold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                In Phiếu Chốt Sổ
              </button>
              <button
                type="button"
                onClick={() => exportClosingToCSV(existingClosedRecord)}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Xuất Excel Phiếu Chốt Sổ
              </button>
              <button
                type="button"
                onClick={handleReopenClosing}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                Mở Lại Sổ (Sửa đơn/Chi phí)
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConfirmClosing}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              Xác Nhận Chốt Sổ ({currentMetrics.periodLabel})
            </button>
          )}

          {existingClosedRecord && (
            <div className="text-xs text-zinc-500">
              Đã chốt bởi <b>{existingClosedRecord.closedBy}</b> lúc {new Date(existingClosedRecord.closedAt).toLocaleString('vi-VN')}
            </div>
          )}
        </div>
      </div>

      {/* BẢNG LỊCH SỬ CÁC KỲ ĐÃ CHỐT GẦN NHẤT */}
      {closingRecords.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-zinc-600" />
            Lịch Sử Các Kỳ Đã Chốt Sổ ({closingRecords.length} kỳ)
          </h4>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="p-3">Kỳ Chốt Sổ</th>
                  <th className="p-3">Thời Gian Chốt</th>
                  <th className="p-3 text-right">Doanh Thu</th>
                  <th className="p-3 text-right">Lợi Nhuận Ròng</th>
                  <th className="p-3 text-right">Kiểm Két</th>
                  <th className="p-3 text-center">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {closingRecords.slice(0, 10).map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="p-3 font-bold text-zinc-900">
                      {r.periodLabel}
                      {r.notes && <span className="block text-[11px] font-normal text-zinc-400 mt-0.5">{r.notes}</span>}
                    </td>
                    <td className="p-3 text-zinc-500">
                      {new Date(r.closedAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="p-3 text-right font-bold text-zinc-900">
                      {r.totalRevenue.toLocaleString('vi-VN')}₫
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-700">
                      {r.netProfit >= 0 ? '+' : ''}{r.netProfit.toLocaleString('vi-VN')}₫
                    </td>
                    <td className="p-3 text-right">
                      <span className={`inline-block font-bold text-[11px] px-2 py-0.5 rounded-full ${
                        r.cashDifference === 0 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : r.cashDifference > 0 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-rose-50 text-rose-700'
                      }`}>
                        {r.cashDifference === 0 ? 'Khớp két' : r.cashDifference > 0 ? `+${r.cashDifference.toLocaleString('vi-VN')}₫` : `${r.cashDifference.toLocaleString('vi-VN')}₫`}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => printClosingReceipt(r)}
                          className="p-1.5 hover:bg-zinc-200 rounded-lg text-zinc-600 transition"
                          title="In lại phiếu"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => exportClosingToCSV(r)}
                          className="p-1.5 hover:bg-zinc-200 rounded-lg text-emerald-600 transition"
                          title="Tải Excel"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
