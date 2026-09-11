'use client';

import React, { useState, useMemo } from 'react';
import { 
  BarChart3, DollarSign, FileText, Lock, Calendar, 
  Download, Printer, FileSpreadsheet, Sparkles, ChevronDown, CheckCircle2, ShieldCheck, RefreshCw
} from 'lucide-react';
import { AccountingOverview } from './AccountingOverview';
import { DualCashflowLedger } from './DualCashflowLedger';
import { OpexManager } from './OpexManager';
import { AccountingClosingSection } from '../AccountingClosingSection';

export interface AccountingDashboardProps {
  orders: any[];
  expenses: any[];
  spoilageLogs: any[];
  cashflow: any[];
  adminName: string;
  onAddExpense: (expense: any) => void;
  onDeleteExpense?: (id: string) => void;
  onAddCashflowTransaction?: (tx: any) => void;
  onExportPL: () => void;
  onExportSales: () => void;
  onExportCashflow: () => void;
  onExportFull: () => void;
  initialSubTab?: 'pnl' | 'cashflow' | 'opex' | 'closing';
}

export type DatePreset = 'today' | 'yesterday' | '7days' | 'month' | 'prev_month' | 'all' | 'custom';

export const AccountingDashboard: React.FC<AccountingDashboardProps> = ({
  orders,
  expenses,
  spoilageLogs,
  cashflow,
  adminName,
  onAddExpense,
  onDeleteExpense,
  onAddCashflowTransaction,
  onExportPL,
  onExportSales,
  onExportCashflow,
  onExportFull,
  initialSubTab = 'pnl',
}) => {
  const [subTab, setSubTab] = useState<'pnl' | 'cashflow' | 'opex' | 'closing'>(initialSubTab);
  const [datePreset, setDatePreset] = useState<DatePreset>('month');

  // Custom date range state
  const todayStr = new Date().toISOString().split('T')[0];
  const firstDayOfMonthStr = `${todayStr.slice(0, 7)}-01`;
  const [customStart, setCustomStart] = useState<string>(firstDayOfMonthStr);
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  // Tính toán khoảng thời gian theo Preset
  const { startDateMs, endDateMs, periodLabel, prevStartDateMs, prevEndDateMs } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    let start = new Date();
    let end = new Date();
    let label = '';
    let pStart: Date | undefined;
    let pEnd: Date | undefined;

    if (datePreset === 'today') {
      const dStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      start = new Date(`${dStr}T00:00:00`);
      end = new Date(`${dStr}T23:59:59`);
      label = `Hôm Nay (${pad(now.getDate())}/${pad(now.getMonth() + 1)}/Realtime)`;

      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const yStr = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
      pStart = new Date(`${yStr}T00:00:00`);
      pEnd = new Date(`${yStr}T23:59:59`);
    } else if (datePreset === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const yStr = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
      start = new Date(`${yStr}T00:00:00`);
      end = new Date(`${yStr}T23:59:59`);
      label = `Hôm Qua (${pad(y.getDate())}/${pad(y.getMonth() + 1)})`;
    } else if (datePreset === '7days') {
      const s = new Date(now);
      s.setDate(now.getDate() - 6);
      start = new Date(`${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}T00:00:00`);
      end = new Date(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T23:59:59`);
      label = `7 Ngày Gần Nhất`;

      const prevS = new Date(s);
      prevS.setDate(prevS.getDate() - 7);
      pStart = prevS;
      pEnd = new Date(s.getTime() - 1);
    } else if (datePreset === 'month') {
      const mStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      start = new Date(`${mStr}-01T00:00:00`);
      end = new Date(`${mStr}-${pad(lastDay)}T23:59:59`);
      label = `Tháng ${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

      // Tháng trước
      const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevLastDay = new Date(prevM.getFullYear(), prevM.getMonth() + 1, 0).getDate();
      const pmStr = `${prevM.getFullYear()}-${pad(prevM.getMonth() + 1)}`;
      pStart = new Date(`${pmStr}-01T00:00:00`);
      pEnd = new Date(`${pmStr}-${pad(prevLastDay)}T23:59:59`);
    } else if (datePreset === 'prev_month') {
      const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevLastDay = new Date(prevM.getFullYear(), prevM.getMonth() + 1, 0).getDate();
      const pmStr = `${prevM.getFullYear()}-${pad(prevM.getMonth() + 1)}`;
      start = new Date(`${pmStr}-01T00:00:00`);
      end = new Date(`${pmStr}-${pad(prevLastDay)}T23:59:59`);
      label = `Tháng Trước (${pad(prevM.getMonth() + 1)}/${prevM.getFullYear()})`;
    } else if (datePreset === 'all') {
      start = new Date('2020-01-01T00:00:00');
      end = new Date('2030-12-31T23:59:59');
      label = `Toàn Bộ Dữ Liệu Lịch Sử`;
    } else {
      // custom
      start = new Date(`${customStart}T00:00:00`);
      end = new Date(`${customEnd}T23:59:59`);
      label = `${customStart} đến ${customEnd}`;
    }

    return {
      startDateMs: start.getTime(),
      endDateMs: end.getTime(),
      periodLabel: label,
      prevStartDateMs: pStart ? pStart.getTime() : undefined,
      prevEndDateMs: pEnd ? pEnd.getTime() : undefined,
    };
  }, [datePreset, customStart, customEnd]);

  return (
    <div className="space-y-6">
      
      {/* ── HEADER TRUNG TÂM KẾ TOÁN & BỘ LỌC THỜI GIAN THÔNG MINH ── */}
      <div className="bg-white rounded-3xl border border-zinc-200/90 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-black text-amber-700 uppercase tracking-wider">
                Kế Toán Trưởng & Quản Trị Tài Chính F&B
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                🟢 Realtime POS
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight mt-0.5">
              Trung Tâm Báo Cáo Tài Chính, Sổ Quỹ & Lợi Nhuận P&L
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Tự động hóa 100% doanh thu quầy POS, trừ giá vốn BOM bột bơ sữa, phân bổ OPEX và đối soát két tiền mặt
            </p>
          </div>

          {/* Quick Export Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onExportFull}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-black text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              title="Tải trọn bộ 5 sheet kế toán: P&L, Doanh thu, OPEX, Sổ quỹ, Kho"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Trọn Bộ Hồ Sơ (.xls Đa Sheet)</span>
            </button>

            <button
              type="button"
              onClick={onExportPL}
              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Xuất bảng P&L"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Xuất P&L</span>
            </button>
          </div>
        </div>

        {/* ── BỘ LỌC KỲ HẠN THÔNG MINH (DATE RANGE FILTER) ── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-zinc-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-600" /> Kỳ báo cáo:
            </span>
            <button
              type="button"
              onClick={() => setDatePreset('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                datePreset === 'today'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/80'
              }`}
            >
              Hôm Nay
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('yesterday')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                datePreset === 'yesterday'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/80'
              }`}
            >
              Hôm Qua
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('7days')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                datePreset === '7days'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/80'
              }`}
            >
              7 Ngày Qua
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                datePreset === 'month'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/80'
              }`}
            >
              Tháng Này
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('prev_month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                datePreset === 'prev_month'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/80'
              }`}
            >
              Tháng Trước
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                datePreset === 'all'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/80'
              }`}
            >
              Tất Cả
            </button>
            <button
              type="button"
              onClick={() => setDatePreset('custom')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                datePreset === 'custom'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/80'
              }`}
            >
              Tùy Chọn 📅
            </button>
          </div>

          {/* Nếu chọn Tùy Chọn -> Hiện Date Picker từ ngày -> đến ngày */}
          {datePreset === 'custom' && (
            <div className="flex items-center gap-2 bg-amber-50/80 p-1.5 rounded-2xl border border-amber-200 text-xs">
              <span className="font-bold text-amber-800 text-[11px] pl-1">Từ:</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="p-1 rounded-lg border border-amber-300 bg-white text-xs font-semibold"
              />
              <span className="font-bold text-amber-800 text-[11px]">Đến:</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="p-1 rounded-lg border border-amber-300 bg-white text-xs font-semibold"
              />
            </div>
          )}

          <div className="text-xs text-zinc-500 font-semibold self-start lg:self-auto">
            Đang xem: <strong className="text-zinc-800 bg-zinc-100 px-2.5 py-1 rounded-lg border border-zinc-200">{periodLabel}</strong>
          </div>
        </div>

        {/* ── THANH CHUYỂN PHÂN HỆ KẾ TOÁN (SUB-TABS) ── */}
        <div className="flex items-center gap-1 bg-zinc-100/90 p-1 rounded-2xl overflow-x-auto border border-zinc-200/70 pt-1">
          <button
            type="button"
            onClick={() => setSubTab('pnl')}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'pnl'
                ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/80'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-amber-600" />
            <span>1. Báo Cáo P&L & Chỉ Số Vàng</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('cashflow')}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'cashflow'
                ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/80'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
            }`}
          >
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span>2. Sổ Quỹ Kép (Tiền Mặt & VietQR)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('opex')}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'opex'
                ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/80'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
            }`}
          >
            <FileText className="w-4 h-4 text-rose-600" />
            <span>3. Chi Phí Vận Hành (OPEX)</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('closing')}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black transition cursor-pointer whitespace-nowrap ${
              subTab === 'closing'
                ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/80'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60'
            }`}
          >
            <Lock className="w-4 h-4 text-amber-700" />
            <span>4. Chốt Sổ & Khóa Kỳ Kế Toán</span>
          </button>
        </div>
      </div>

      {/* ── NỘI DUNG PHÂN HỆ ĐƯỢC CHỌN ── */}
      {subTab === 'pnl' && (
        <AccountingOverview
          orders={orders}
          expenses={expenses}
          spoilageLogs={spoilageLogs}
          periodLabel={periodLabel}
          startDateMs={startDateMs}
          endDateMs={endDateMs}
          prevStartDateMs={prevStartDateMs}
          prevEndDateMs={prevEndDateMs}
          onExportPL={onExportPL}
          onExportSales={onExportSales}
          onExportFull={onExportFull}
        />
      )}

      {subTab === 'cashflow' && (
        <DualCashflowLedger
          orders={orders}
          expenses={expenses}
          cashflow={cashflow}
          onAddCashflowTransaction={onAddCashflowTransaction}
          onExportCashflow={onExportCashflow}
          periodLabel={periodLabel}
          startDateMs={startDateMs}
          endDateMs={endDateMs}
        />
      )}

      {subTab === 'opex' && (
        <OpexManager
          expenses={expenses}
          onAddExpense={onAddExpense}
          onDeleteExpense={onDeleteExpense}
          periodLabel={periodLabel}
          startDateMs={startDateMs}
          endDateMs={endDateMs}
        />
      )}

      {subTab === 'closing' && (
        <div className="bg-white rounded-3xl border border-zinc-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <AccountingClosingSection
            orders={orders}
            expenses={expenses}
            spoilageLogs={spoilageLogs}
            adminName={adminName}
          />
        </div>
      )}

    </div>
  );
};
