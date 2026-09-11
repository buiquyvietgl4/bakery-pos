'use client';

import React, { useState, useMemo } from 'react';
import { 
  BarChart3, DollarSign, FileText, Lock, Calendar, 
  Download, Printer, FileSpreadsheet, Sparkles, ChevronDown, CheckCircle2, ShieldCheck, RefreshCw,
  Building2, Store
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

export type DatePreset = 'today' | 'month' | 'prev_month' | 'custom';

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

  // Tính toán khoảng thời gian theo Preset chuẩn Mockup
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
      label = `Hôm nay (${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()})`;

      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      const yStr = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
      pStart = new Date(`${yStr}T00:00:00`);
      pEnd = new Date(`${yStr}T23:59:59`);
    } else if (datePreset === 'prev_month') {
      const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevLastDay = new Date(prevM.getFullYear(), prevM.getMonth() + 1, 0).getDate();
      const pmStr = `${prevM.getFullYear()}-${pad(prevM.getMonth() + 1)}`;
      start = new Date(`${pmStr}-01T00:00:00`);
      end = new Date(`${pmStr}-${pad(prevLastDay)}T23:59:59`);
      label = `Tháng trước (01/${pad(prevM.getMonth() + 1)} - ${pad(prevLastDay)}/${pad(prevM.getMonth() + 1)}/${prevM.getFullYear()})`;

      const prev2M = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const prev2LastDay = new Date(prev2M.getFullYear(), prev2M.getMonth() + 1, 0).getDate();
      const p2mStr = `${prev2M.getFullYear()}-${pad(prev2M.getMonth() + 1)}`;
      pStart = new Date(`${p2mStr}-01T00:00:00`);
      pEnd = new Date(`${p2mStr}-${pad(prev2LastDay)}T23:59:59`);
    } else if (datePreset === 'custom') {
      start = new Date(`${customStart}T00:00:00`);
      end = new Date(`${customEnd}T23:59:59`);
      label = `${customStart} - ${customEnd}`;
    } else {
      // month
      const mStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      start = new Date(`${mStr}-01T00:00:00`);
      end = new Date(`${mStr}-${pad(lastDay)}T23:59:59`);
      label = `Tháng này (01/${pad(now.getMonth() + 1)} - ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()})`;

      const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevLastDay = new Date(prevM.getFullYear(), prevM.getMonth() + 1, 0).getDate();
      const pmStr = `${prevM.getFullYear()}-${pad(prevM.getMonth() + 1)}`;
      pStart = new Date(`${pmStr}-01T00:00:00`);
      pEnd = new Date(`${pmStr}-${pad(prevLastDay)}T23:59:59`);
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
    <div className="space-y-4">
      
      {/* ── TOP HEADER CHUẨN MOCKUP: HỆ THỐNG KẾ TOÁN BAKERY & STORE BRANDING ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight">
            Hệ Thống Kế Toán Bakery
          </h1>
        </div>

        {/* Store Logo Badge & Quick Export Actions */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              🥖
            </div>
            <span className="text-xs font-bold text-zinc-800">
              {adminName || 'Le Pain Quotidien'}
            </span>
          </div>

          <button
            type="button"
            onClick={onExportFull}
            className="px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl text-xs font-bold text-zinc-700 shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
            title="Xuất trọn bộ sổ sách kế toán (.xls đa sheet)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Xuất Excel</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl text-xs font-bold text-zinc-700 shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
            title="In báo cáo A4"
          >
            <Printer className="w-3.5 h-3.5 text-zinc-600" />
            <span className="hidden sm:inline">In A4</span>
          </button>
        </div>
      </div>

      {/* ── DATE FILTER BAR & SUB-TABS (CHUẨN MOCKUP) ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        
        {/* Left: Kỳ báo cáo & Pill Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-700">Kỳ báo cáo:</span>
          <span className="font-bold text-zinc-900">{periodLabel}</span>

          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-zinc-200/80 shadow-2xs ml-1">
            <button
              onClick={() => setDatePreset('today')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                datePreset === 'today'
                  ? 'bg-slate-700 text-white font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setDatePreset('month')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                datePreset === 'month'
                  ? 'bg-slate-700 text-white font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Tháng này
            </button>
            <button
              onClick={() => setDatePreset('prev_month')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                datePreset === 'prev_month'
                  ? 'bg-slate-700 text-white font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Tháng trước
            </button>
            <button
              onClick={() => setDatePreset('custom')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                datePreset === 'custom'
                  ? 'bg-slate-700 text-white font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Tùy chọn
            </button>
          </div>

          {datePreset === 'custom' && (
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-zinc-200 text-xs animate-in fade-in">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-1 py-0.5 text-zinc-700 border-none font-semibold focus:outline-hidden"
              />
              <span className="text-zinc-400">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-1 py-0.5 text-zinc-700 border-none font-semibold focus:outline-hidden"
              />
            </div>
          )}
        </div>

        {/* Right: Sub-tab Navigator */}
        <div className="flex items-center gap-1 bg-zinc-200/70 p-1 rounded-xl overflow-x-auto scrollbar-none">
          <button
            onClick={() => setSubTab('pnl')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              subTab === 'pnl'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Tổng Quan (P&L)</span>
          </button>
          <button
            onClick={() => setSubTab('cashflow')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              subTab === 'cashflow'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 text-blue-600" />
            <span>Sổ Quỹ Kép</span>
          </button>
          <button
            onClick={() => setSubTab('opex')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              subTab === 'opex'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-rose-600" />
            <span>Chi Phí OPEX</span>
          </button>
          <button
            onClick={() => setSubTab('closing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              subTab === 'closing'
                ? 'bg-white text-zinc-900 shadow-2xs'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-amber-600" />
            <span>Chốt Sổ Ca</span>
          </button>
        </div>

      </div>

      {/* ── SUB-TAB CONTENT ── */}
      {subTab === 'pnl' && (
        <AccountingOverview
          orders={orders}
          expenses={expenses}
          spoilageLogs={spoilageLogs}
          cashflow={cashflow}
          periodLabel={periodLabel}
          startDateMs={startDateMs}
          endDateMs={endDateMs}
          prevStartDateMs={prevStartDateMs}
          prevEndDateMs={prevEndDateMs}
          onExportPL={onExportPL}
          onExportSales={onExportSales}
          onExportFull={onExportFull}
          onOpenCashflow={() => setSubTab('cashflow')}
          onOpenOpex={() => setSubTab('opex')}
          onOpenClosing={() => setSubTab('closing')}
        />
      )}

      {subTab === 'cashflow' && (
        <DualCashflowLedger
          orders={orders}
          expenses={expenses}
          cashflow={cashflow}
          startDateMs={startDateMs}
          endDateMs={endDateMs}
          periodLabel={periodLabel}
          onAddCashflowTransaction={onAddCashflowTransaction}
          onExportCashflow={onExportCashflow}
        />
      )}

      {subTab === 'opex' && (
        <OpexManager
          expenses={expenses}
          startDateMs={startDateMs}
          endDateMs={endDateMs}
          periodLabel={periodLabel}
          onAddExpense={onAddExpense}
          onDeleteExpense={onDeleteExpense}
        />
      )}

      {subTab === 'closing' && (
        <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-xs">
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
