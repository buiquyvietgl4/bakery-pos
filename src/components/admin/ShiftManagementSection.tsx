// src/components/admin/ShiftManagementSection.tsx
// Quản trị viên: Giám sát Lịch Sử Giao Ca, Kiểm Két & Kiểm Soát Chênh Lệch Quỹ Từng Ca

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  Search,
  User,
  Clock,
  ArrowRight,
  Filter,
  ShieldAlert,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  ShiftRecord,
  ShiftState,
  getShiftHistoryLocally,
  fetchShiftHistoryFromDb,
  getCurrentShiftLocally,
  fetchCurrentShiftFromDb,
  printShiftHandoverReceipt,
  EVENT_SHIFT_HISTORY_UPDATED,
  EVENT_CURRENT_SHIFT_UPDATED,
} from '@/lib/utils/shiftSync';
import { getStoreBranding } from '@/lib/utils/storeBranding';

interface Props {
  adminName?: string;
}

export const ShiftManagementSection: React.FC<Props> = ({ adminName }) => {
  const [history, setHistory] = useState<ShiftRecord[]>([]);
  const [currentShift, setCurrentShift] = useState<ShiftState>(() => getCurrentShiftLocally());
  const [loading, setLoading] = useState(false);

  // Bộ lọc
  const [statusFilter, setStatusFilter] = useState<'all' | 'discrepancy' | 'balanced'>('all');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dateRange, setDateRange] = useState<'all' | 'today' | '7days' | '30days'>('all');

  const storeBranding = useMemo(() => getStoreBranding(), []);

  const loadData = async () => {
    setLoading(true);
    try {
      setHistory(getShiftHistoryLocally());
      setCurrentShift(getCurrentShiftLocally());

      const [dbHistory, dbCurrent] = await Promise.all([
        fetchShiftHistoryFromDb(),
        fetchCurrentShiftFromDb(),
      ]);

      if (dbHistory) setHistory(dbHistory);
      if (dbCurrent) setCurrentShift(dbCurrent);
    } catch (e) {
      console.warn('Lỗi load dữ liệu ca:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleHistoryUpdate = (e: any) => {
      if (e?.detail) setHistory(e.detail);
      else setHistory(getShiftHistoryLocally());
    };

    const handleShiftUpdate = (e: any) => {
      if (e?.detail) setCurrentShift(e.detail);
      else setCurrentShift(getCurrentShiftLocally());
    };

    window.addEventListener(EVENT_SHIFT_HISTORY_UPDATED, handleHistoryUpdate);
    window.addEventListener(EVENT_CURRENT_SHIFT_UPDATED, handleShiftUpdate);

    return () => {
      window.removeEventListener(EVENT_SHIFT_HISTORY_UPDATED, handleHistoryUpdate);
      window.removeEventListener(EVENT_CURRENT_SHIFT_UPDATED, handleShiftUpdate);
    };
  }, []);

  // Danh sách thu ngân duy nhất để lọc
  const staffNamesList = useMemo(() => {
    const set = new Set<string>();
    history.forEach((h) => {
      if (h.staffName) set.add(h.staffName);
    });
    return Array.from(set);
  }, [history]);

  // Lọc danh sách lịch sử
  const filteredHistory = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    return history.filter((item) => {
      // 1. Lọc theo trạng thái chênh lệch
      const diff = Math.round(Number(item.difference || 0));
      if (statusFilter === 'discrepancy' && diff === 0) return false;
      if (statusFilter === 'balanced' && diff !== 0) return false;

      // 2. Lọc theo nhân viên
      if (staffFilter !== 'all' && item.staffName !== staffFilter) return false;

      // 3. Lọc theo khoảng ngày
      if (dateRange === 'today') {
        if (!item.startedAt?.startsWith(todayStr) && !item.endedAt?.startsWith(todayStr)) return false;
      } else if (dateRange === '7days') {
        const itemTime = new Date(item.endedAt || item.startedAt).getTime();
        if (now.getTime() - itemTime > 7 * 86400000) return false;
      } else if (dateRange === '30days') {
        const itemTime = new Date(item.endedAt || item.startedAt).getTime();
        if (now.getTime() - itemTime > 30 * 86400000) return false;
      }

      // 4. Tìm kiếm tự do
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const codeMatch = (item.shiftCode || '').toLowerCase().includes(term);
        const nameMatch = (item.staffName || '').toLowerCase().includes(term);
        const notesMatch = (item.notes || '').toLowerCase().includes(term);
        if (!codeMatch && !nameMatch && !notesMatch) return false;
      }

      return true;
    });
  }, [history, statusFilter, staffFilter, searchTerm, dateRange]);

  // Thống kê KPI tổng hợp
  const kpi = useMemo(() => {
    const totalShifts = filteredHistory.length;
    let totalCashSales = 0;
    let totalTransferSales = 0;
    let totalRevenue = 0;
    let totalExpectedCash = 0;
    let totalClosingCash = 0;
    let totalDifference = 0;
    let balancedCount = 0;
    let shortageCount = 0;
    let surplusCount = 0;

    filteredHistory.forEach((item) => {
      totalCashSales += Number(item.cashSales || 0);
      totalTransferSales += Number(item.transferSales || 0);
      totalRevenue += Number(item.totalRevenue || (item.cashSales + item.transferSales));
      totalExpectedCash += Number(item.expectedCash || 0);
      const diff = Math.round(Number(item.difference || 0));
      totalDifference += diff;

      if (diff === 0) balancedCount++;
      else if (diff < 0) shortageCount++;
      else surplusCount++;
    });

    const balanceRate = totalShifts > 0 ? Math.round((balancedCount / totalShifts) * 100) : 100;

    return {
      totalShifts,
      totalCashSales,
      totalTransferSales,
      totalRevenue,
      totalExpectedCash,
      totalClosingCash,
      totalDifference,
      balancedCount,
      shortageCount,
      surplusCount,
      balanceRate,
    };
  }, [filteredHistory]);

  const formatVnd = (num: number) => (num || 0).toLocaleString('vi-VN') + '₫';
  const formatDateTime = (isoStr?: string) => {
    if (!isoStr) return '--:--';
    const d = new Date(isoStr);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  // Xuất file CSV báo cáo ca bán hàng
  const handleExportCsv = () => {
    if (filteredHistory.length === 0) {
      alert('Không có dữ liệu ca để xuất báo cáo.');
      return;
    }

    const headers = [
      'Mã Ca',
      'Thu Ngân',
      'Bắt Đầu',
      'Kết Thúc',
      'Số Đơn',
      'Vốn Đầu Ca',
      'DT Tiền Mặt',
      'DT Chuyển Khoản',
      'Tổng Doanh Thu',
      'Tiền Lý Thuyết',
      'Tiền Thực Đếm',
      'Chênh Lệch Quỹ',
      'Trạng Thái',
      'Ghi Chú',
    ];

    const rows = filteredHistory.map((item) => [
      `"${item.shiftCode || item.id}"`,
      `"${item.staffName || ''}"`,
      `"${item.startedAt ? formatDateTime(item.startedAt) : ''}"`,
      `"${item.endedAt ? formatDateTime(item.endedAt) : ''}"`,
      item.orderCount || 0,
      item.openingCash || 0,
      item.cashSales || 0,
      item.transferSales || 0,
      item.totalRevenue || 0,
      item.expectedCash || 0,
      item.closingCash || 0,
      item.difference || 0,
      `"${item.difference === 0 ? 'Khớp' : item.difference > 0 ? 'Thừa quỹ' : 'Thiếu quỹ'}"`,
      `"${(item.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bao_Cao_Giao_Ca_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* ── HEADER CHÍNH ── */}
      <div className="bg-white rounded-3xl border border-stone-200/80 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-black text-xl sm:text-2xl text-stone-900 flex items-center gap-2">
              Quản Lý Lịch Sử Giao Ca & Kiểm Két Quầy
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Kiểm soát độ chênh lệch quỹ (thừa/thiếu/khớp) từng ca bán hàng và đồng bộ 2 chiều CSDL SQL.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-xs font-bold text-stone-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Xuất Báo Cáo CSV</span>
          </button>
        </div>
      </div>

      {/* ── THẺ TRẠNG THÁI KÉT QUẦY HIỆN TẠI (LIVE CASH REGISTER DRAWER) ── */}
      <div className="bg-gradient-to-br from-amber-50 via-white to-amber-100/30 rounded-3xl border border-amber-200/80 p-5 sm:p-6 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 bg-amber-200/60 px-2.5 py-0.5 rounded-full">
                Ca Bán Hàng Đang Mở Tại Quầy POS
              </span>
            </div>
            <div className="font-black text-xl text-stone-900 flex items-center gap-2">
              <span>Mã Ca: {currentShift.shiftCode}</span>
              <span className="text-xs font-normal text-stone-500">
                (Mở lúc {formatDateTime(currentShift.openedAt)})
              </span>
            </div>
            <div className="text-xs text-stone-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>Thu ngân phụ trách: <strong>{currentShift.openedBy || 'Thu Ngân'}</strong></span>
              <span>Đã bán: <strong>{currentShift.orderCount || 0} đơn hàng</strong></span>
              <span>Vốn mở két: <strong>{formatVnd(currentShift.openingCash || 0)}</strong></span>
            </div>
          </div>

          <div className="bg-white/90 backdrop-blur-xs border border-amber-300/70 p-4 rounded-2xl shadow-xs flex flex-wrap items-center gap-4 sm:gap-6 shrink-0">
            <div>
              <div className="text-[11px] text-stone-500 font-medium">DT Tiền mặt trong ca</div>
              <div className="text-base font-black text-emerald-600">+{formatVnd(currentShift.cashSales || 0)}</div>
            </div>
            <div className="h-8 w-[1px] bg-stone-200 hidden sm:block" />
            <div>
              <div className="text-[11px] text-stone-500 font-medium">DT Chuyển khoản / Ví</div>
              <div className="text-base font-black text-blue-600">+{formatVnd(currentShift.transferSales || 0)}</div>
            </div>
            <div className="h-8 w-[1px] bg-stone-200 hidden sm:block" />
            <div>
              <div className="text-[11px] text-amber-900 font-bold">Tiền mặt lý thuyết két</div>
              <div className="text-lg font-black text-amber-700">
                {formatVnd((Number(currentShift.openingCash) || 0) + (Number(currentShift.cashSales) || 0))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 5 THẺ KPI TỔNG HỢP TOÀN TIỆM ── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* KPI 1: Tổng số ca */}
        <div className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-2xs space-y-1">
          <div className="text-stone-500 text-xs font-semibold">Tổng Số Ca Bàn Giao</div>
          <div className="text-2xl font-black text-stone-900">{kpi.totalShifts} ca</div>
          <div className="text-[11px] text-stone-400">Đã chốt & lưu trữ CSDL</div>
        </div>

        {/* KPI 2: DT Tiền mặt */}
        <div className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-2xs space-y-1">
          <div className="text-stone-500 text-xs font-semibold">Tổng DT Tiền Mặt</div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600">{formatVnd(kpi.totalCashSales)}</div>
          <div className="text-[11px] text-stone-400">Thu từ đơn tại quầy</div>
        </div>

        {/* KPI 3: DT Chuyển khoản */}
        <div className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-2xs space-y-1">
          <div className="text-stone-500 text-xs font-semibold">Tổng DT Chuyển Khoản</div>
          <div className="text-xl sm:text-2xl font-black text-blue-600">{formatVnd(kpi.totalTransferSales)}</div>
          <div className="text-[11px] text-stone-400">VietQR / AutoBank / MoMo</div>
        </div>

        {/* KPI 4: CHÊNH LỆCH QUỸ LŨY KẾ (ĐẶC BIỆT QUAN TRỌNG) */}
        <div className={`rounded-2xl p-4 border shadow-2xs space-y-1 ${
          kpi.totalDifference === 0
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
            : kpi.totalDifference < 0
            ? 'bg-rose-50/80 border-rose-200 text-rose-950'
            : 'bg-blue-50/80 border-blue-200 text-blue-950'
        }`}>
          <div className="text-xs font-bold flex items-center justify-between">
            <span>Tổng Lệch Quỹ Lũy Kế</span>
            {kpi.totalDifference < 0 && <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />}
          </div>
          <div className={`text-xl sm:text-2xl font-black ${
            kpi.totalDifference === 0 
              ? 'text-emerald-700' 
              : kpi.totalDifference < 0 
              ? 'text-rose-600' 
              : 'text-blue-700'
          }`}>
            {kpi.totalDifference === 0 
              ? '0₫ (Khớp 100%)' 
              : kpi.totalDifference > 0 
              ? `+${formatVnd(kpi.totalDifference)}` 
              : `-${formatVnd(Math.abs(kpi.totalDifference))}`}
          </div>
          <div className="text-[11px] font-medium opacity-80">
            {kpi.totalDifference === 0 
              ? 'Không có thất thoát quỹ' 
              : kpi.totalDifference < 0 
              ? `Hụt quỹ ${kpi.shortageCount} ca!` 
              : `Thừa két ${kpi.surplusCount} ca`}
          </div>
        </div>

        {/* KPI 5: Tỷ lệ khớp tiền */}
        <div className="bg-white rounded-2xl p-4 border border-stone-200/80 shadow-2xs space-y-1 col-span-2 sm:col-span-1">
          <div className="text-stone-500 text-xs font-semibold">Tỷ Lệ Khớp Quỹ</div>
          <div className="text-2xl font-black text-amber-700">{kpi.balanceRate}%</div>
          <div className="text-[11px] text-stone-400">
            {kpi.balancedCount}/{kpi.totalShifts} ca khớp tuyệt đối
          </div>
        </div>
      </div>

      {/* ── BỘ LỌC TÌM KIẾM ── */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Ô tìm kiếm */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã ca (CA-...), thu ngân, ghi chú..."
              className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>

          {/* Lọc tình trạng chênh lệch */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              Tất cả ({history.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('discrepancy')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                statusFilter === 'discrepancy'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/60'
              }`}
            >
              Lệch quỹ ({history.filter((h) => Math.round(Number(h.difference || 0)) !== 0).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('balanced')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                statusFilter === 'balanced'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
              }`}
            >
              Khớp chuẩn ({history.filter((h) => Math.round(Number(h.difference || 0)) === 0).length})
            </button>
          </div>
        </div>

        {/* Hàng lọc phụ: Khoảng thời gian & Thu ngân */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100 text-xs">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-stone-400" />
            <span className="font-semibold text-stone-600">Thời gian:</span>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="px-2.5 py-1 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold text-stone-800 focus:outline-none"
            >
              <option value="all">Toàn bộ thời gian</option>
              <option value="today">Hôm nay</option>
              <option value="7days">7 ngày qua</option>
              <option value="30days">30 ngày qua</option>
            </select>
          </div>

          {staffNamesList.length > 0 && (
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-stone-400" />
              <span className="font-semibold text-stone-600">Thu ngân:</span>
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="px-2.5 py-1 bg-stone-50 border border-stone-200 rounded-lg text-xs font-bold text-stone-800 focus:outline-none"
              >
                <option value="all">Tất cả thu ngân</option>
                {staffNamesList.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="ml-auto text-[11px] text-stone-400 font-medium">
            Hiển thị {filteredHistory.length} / {history.length} ca bàn giao
          </div>
        </div>
      </div>

      {/* ── BẢNG LỊCH SỬ GIAO CA CHI TIẾT ── */}
      <div className="bg-white rounded-3xl border border-stone-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-50 text-stone-600 border-b border-stone-200 font-bold">
                <th className="py-3.5 px-4">Mã Ca & Thời Gian</th>
                <th className="py-3.5 px-3">Thu Ngân</th>
                <th className="py-3.5 px-3 text-center">Số Đơn</th>
                <th className="py-3.5 px-3 text-right">Vốn Đầu Ca</th>
                <th className="py-3.5 px-3 text-right">Doanh Thu</th>
                <th className="py-3.5 px-3 text-right">Tiền Lý Thuyết</th>
                <th className="py-3.5 px-3 text-right">Tiền Thực Đếm</th>
                <th className="py-3.5 px-4 text-center">Chênh Lệch Quỹ</th>
                <th className="py-3.5 px-3">Ghi Chú Giải Trình</th>
                <th className="py-3.5 px-4 text-center">In Phiếu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-stone-400 italic">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Wallet className="w-8 h-8 text-stone-300" />
                      <p className="font-semibold text-stone-500">Chưa có bản ghi giao ca nào phù hợp điều kiện lọc.</p>
                      <p className="text-[11px] text-stone-400">
                        Khi thu ngân tại quầy POS bấm &quot;Chốt Ca &amp; Mở Ca Mới&quot;, lịch sử sẽ tự động lưu và đồng bộ về đây.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => {
                  const diff = Math.round(Number(item.difference || 0));
                  const isBalanced = diff === 0;
                  const isSurplus = diff > 0;
                  const isShortage = diff < 0;

                  return (
                    <tr key={item.id} className="hover:bg-amber-50/40 transition">
                      {/* Mã Ca & Thời gian */}
                      <td className="py-3.5 px-4">
                        <div className="font-black text-stone-900">{item.shiftCode}</div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{formatDateTime(item.startedAt)} → {formatDateTime(item.endedAt)}</span>
                        </div>
                      </td>

                      {/* Thu ngân */}
                      <td className="py-3.5 px-3">
                        <div className="font-bold text-stone-800 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          <span>{item.staffName}</span>
                        </div>
                      </td>

                      {/* Số đơn */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-bold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-md">
                          {item.orderCount || 0}
                        </span>
                      </td>

                      {/* Vốn đầu ca */}
                      <td className="py-3.5 px-3 text-right font-medium text-stone-700">
                        {formatVnd(item.openingCash || 0)}
                      </td>

                      {/* Doanh thu (Mặt + CK) */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="font-bold text-stone-900">{formatVnd(item.totalRevenue || 0)}</div>
                        <div className="text-[10px] text-stone-400 flex justify-end gap-1.5 mt-0.5">
                          <span className="text-emerald-600">TM: {formatVnd(item.cashSales || 0)}</span>
                          <span>•</span>
                          <span className="text-blue-600">CK: {formatVnd(item.transferSales || 0)}</span>
                        </div>
                      </td>

                      {/* Tiền lý thuyết */}
                      <td className="py-3.5 px-3 text-right font-bold text-stone-700">
                        {formatVnd(item.expectedCash || 0)}
                      </td>

                      {/* Tiền thực đếm */}
                      <td className="py-3.5 px-3 text-right font-black text-stone-900">
                        {formatVnd(item.closingCash || 0)}
                      </td>

                      {/* CHÊNH LỆCH QUỸ (BADGE NỔI BẬT) */}
                      <td className="py-3.5 px-4 text-center">
                        {isBalanced ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Khớp chuẩn 100%</span>
                          </span>
                        ) : isShortage ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-300 text-xs font-black animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Thiếu {formatVnd(Math.abs(diff))}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">
                            <span>Thừa +{formatVnd(diff)}</span>
                          </span>
                        )}
                      </td>

                      {/* Ghi chú giải trình */}
                      <td className="py-3.5 px-3 max-w-[200px]">
                        {item.notes ? (
                          <span className="text-stone-700 text-xs line-clamp-2" title={item.notes}>
                            {item.notes}
                          </span>
                        ) : (
                          <span className="text-stone-300 italic text-[11px]">Không có ghi chú</span>
                        )}
                        {item.transferredToNextShift !== undefined && (
                          <div className="text-[10px] text-stone-400 mt-0.5">
                            Để lại vốn ca sau: {formatVnd(item.transferredToNextShift)}
                          </div>
                        )}
                      </td>

                      {/* Nút In phiếu */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => printShiftHandoverReceipt(item, storeBranding)}
                          className="px-2.5 py-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 text-stone-700 text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer mx-auto active:scale-95"
                          title="In lại phiếu bàn giao ca (80mm)"
                        >
                          <Printer className="w-3.5 h-3.5 text-stone-500" />
                          <span className="hidden sm:inline">In Phiếu</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
