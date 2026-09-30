'use client';

import React, { useState, useMemo } from 'react';
import { 
  BarChart3, DollarSign, FileText, Lock, Calendar, 
  Download, Printer, FileSpreadsheet, Sparkles, ChevronDown, CheckCircle2, ShieldCheck, RefreshCw,
  Building2, Store
} from 'lucide-react';
import { AccountingOverview, getOrderCashAndBank } from './AccountingOverview';
import { DualCashflowLedger } from './DualCashflowLedger';
import { OpexManager } from './OpexManager';
import { AccountingClosingSection } from '../AccountingClosingSection';
import { exportMultiSheetExcel, ExcelSheet } from '@/lib/utils/exportExcel';

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

export type DatePreset = 'today' | 'week' | 'prev_week' | 'month' | 'prev_month' | 'custom';

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
    } else if (datePreset === 'week') {
      // Tuần này (Thứ 2 đến Chủ Nhật)
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const mStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
      const sStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
      start = new Date(`${mStr}T00:00:00`);
      end = new Date(`${sStr}T23:59:59`);
      label = `Tuần này (${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} - ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()})`;

      // Tuần trước để so sánh
      const prevMonday = new Date(monday);
      prevMonday.setDate(monday.getDate() - 7);
      const prevSunday = new Date(sunday);
      prevSunday.setDate(sunday.getDate() - 7);
      const pmStr = `${prevMonday.getFullYear()}-${pad(prevMonday.getMonth() + 1)}-${pad(prevMonday.getDate())}`;
      const psStr = `${prevSunday.getFullYear()}-${pad(prevSunday.getMonth() + 1)}-${pad(prevSunday.getDate())}`;
      pStart = new Date(`${pmStr}T00:00:00`);
      pEnd = new Date(`${psStr}T23:59:59`);
    } else if (datePreset === 'prev_week') {
      // Tuần trước
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday - 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      const mStr = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
      const sStr = `${sunday.getFullYear()}-${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
      start = new Date(`${mStr}T00:00:00`);
      end = new Date(`${sStr}T23:59:59`);
      label = `Tuần trước (${pad(monday.getDate())}/${pad(monday.getMonth() + 1)} - ${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()})`;

      const prevMonday = new Date(monday);
      prevMonday.setDate(monday.getDate() - 7);
      const prevSunday = new Date(sunday);
      prevSunday.setDate(sunday.getDate() - 7);
      const pmStr = `${prevMonday.getFullYear()}-${pad(prevMonday.getMonth() + 1)}-${pad(prevMonday.getDate())}`;
      const psStr = `${prevSunday.getFullYear()}-${pad(prevSunday.getMonth() + 1)}-${pad(prevSunday.getDate())}`;
      pStart = new Date(`${pmStr}T00:00:00`);
      pEnd = new Date(`${psStr}T23:59:59`);
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

  // ── XUẤT TRỌN BỘ HỒ SƠ KẾ TOÁN RA EXCEL (.XLSX) KHỚP 100% KỲ ĐANG XEM ──
  const handleExportFull_Direct = () => {
    const safeLabel = (periodLabel || 'Ky_Ke_Toan').replace(/[/\\?%*:|"<> ()]/g, '_');

    // 1. Lọc dữ liệu theo đúng startDateMs và endDateMs
    const periodOrders = orders.filter((o) => {
      const timeStr = o.created_at || o.createdAt || '';
      if (!timeStr) return true;
      const t = new Date(timeStr).getTime();
      return isNaN(t) || (t >= startDateMs && t <= endDateMs);
    });

    const periodExpenses = expenses.filter((e) => {
      if (!e.date) return true;
      const t = new Date(e.date).getTime();
      return isNaN(t) || (t >= startDateMs && t <= endDateMs);
    });

    const periodSpoilage = spoilageLogs.filter((l) => {
      const t = l.loggedAt ? new Date(l.loggedAt).getTime() : 0;
      return t >= startDateMs && t <= endDateMs;
    });

    // Tính toán số liệu P&L
    const totalRev = periodOrders.reduce((s, o) => {
      const isCompleted = o.status === 'completed';
      const tot = Number(o.total_amount || o.totalPrice || 0);
      const dep = Number(o.deposit_amount !== undefined ? o.deposit_amount : (o.depositAmount || 0));
      return s + (isCompleted ? tot : (dep > 0 ? dep : tot));
    }, 0);

    const totalCogs = periodOrders.reduce((s, o: any) => {
      if (typeof o.total_cogs === 'number' && o.total_cogs > 0) return s + o.total_cogs;
      if (typeof o.totalCogs === 'number' && o.totalCogs > 0) return s + o.totalCogs;
      const r = Number(o.total_amount || o.totalPrice) || 0;
      return s + Math.round(r * 0.318);
    }, 0);

    const grossProfit = totalRev - totalCogs;
    const totalOpex = periodExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalSpoilage = periodSpoilage.reduce((s, l) => s + (Number(l.totalCostLoss) || 0), 0);
    const netProfit = grossProfit - totalOpex - totalSpoilage;

    // Sheet 1: P&L
    const sheetPL: ExcelSheet = {
      name: 'Bao_Cao_PL_Chi_Tiet',
      title: 'BÁO CÁO KẾT QUẢ KINH DOANH (P&L)',
      subtitles: [
        `Kỳ kế toán: ${periodLabel}`,
        `Thời điểm xuất: ${new Date().toLocaleString('vi-VN')}`,
        `Doanh thu thuần: ${(totalRev).toLocaleString('vi-VN')}₫ | Lợi nhuận ròng: ${(netProfit).toLocaleString('vi-VN')}₫`,
      ],
      columns: [
        { header: 'Chỉ Tiêu Tài Chính', key: 'chi_tieu', width: 250, type: 'string' },
        { header: 'Số Tiền (VNĐ)', key: 'gia_tri', width: 140, type: 'currency' },
        { header: 'Tỷ Trọng (%)', key: 'ty_le', width: 100, type: 'string' },
        { header: 'Ghi Chú', key: 'ghi_chu', width: 260, type: 'string' },
      ],
      data: [
        { chi_tieu: 'I. TỔNG DOANH THU THUẦN', gia_tri: totalRev, ty_le: '100.0%', ghi_chu: `${periodOrders.length} đơn hàng thực tế` },
        { chi_tieu: 'II. GIÁ VỐN HÀNG BÁN (COGS)', gia_tri: -totalCogs, ty_le: totalRev > 0 ? `${((totalCogs / totalRev) * 100).toFixed(1)}%` : '0.0%', ghi_chu: 'Định mức BOM nguyên vật liệu' },
        { chi_tieu: 'III. LỢI NHUẬN GỘP (GROSS PROFIT)', gia_tri: grossProfit, ty_le: totalRev > 0 ? `${((grossProfit / totalRev) * 100).toFixed(1)}%` : '0.0%', ghi_chu: 'Doanh thu trừ giá vốn' },
        { chi_tieu: 'IV. CHI PHÍ VẬN HÀNH (OPEX)', gia_tri: -totalOpex, ty_le: totalRev > 0 ? `${((totalOpex / totalRev) * 100).toFixed(1)}%` : '0.0%', ghi_chu: `${periodExpenses.length} khoản chi phí trong kỳ` },
        { chi_tieu: 'V. HAO HỤT BÁNH HỎNG', gia_tri: -totalSpoilage, ty_le: totalRev > 0 ? `${((totalSpoilage / totalRev) * 100).toFixed(1)}%` : '0.0%', ghi_chu: `${periodSpoilage.reduce((s, l) => s + (l.quantity || 0), 0)} bánh hủy` },
        { chi_tieu: 'VI. LỢI NHUẬN RÒNG (NET PROFIT)', gia_tri: netProfit, ty_le: totalRev > 0 ? `${((netProfit / totalRev) * 100).toFixed(1)}%` : '0.0%', ghi_chu: 'Lợi nhuận thực tế sau toàn bộ chi phí' },
      ],
    };

    // Sheet 2: Doanh Thu Bán Hàng
    const sheetSales: ExcelSheet = {
      name: 'Nhat_Ky_Hoa_Don',
      title: 'NHẬT KÝ HÓA ĐƠN & DOANH THU BÁN HÀNG',
      subtitles: [`Kỳ báo cáo: ${periodLabel}`, `Tổng số đơn: ${periodOrders.length} đơn`],
      columns: [
        { header: 'STT', key: 'stt', width: 50, type: 'number' },
        { header: 'Mã Hóa Đơn', key: 'ma_don', width: 140, type: 'string' },
        { header: 'Ngày Giờ', key: 'ngay', width: 130, type: 'string' },
        { header: 'Loại Đơn', key: 'loai_don', width: 110, type: 'string' },
        { header: 'Khách Hàng', key: 'khach_hang', width: 140, type: 'string' },
        { header: 'SĐT', key: 'sdt', width: 110, type: 'string' },
        { header: 'Chi Tiết Sản Phẩm', key: 'san_pham', width: 250, type: 'string' },
        { header: 'Doanh Thu Thuần', key: 'doanh_thu', width: 130, type: 'currency' },
        { header: 'Tổng Tiền Đơn', key: 'tong_tien', width: 130, type: 'currency' },
        { header: 'Hình Thức TT', key: 'hinh_thuc', width: 120, type: 'string' },
        { header: 'Trạng Thái', key: 'trang_thai', width: 110, type: 'string' },
      ],
      data: periodOrders.map((o: any, idx: number) => {
        const isCompleted = o.status === 'completed';
        const total = Number(o.total_amount || o.totalPrice || 0);
        const deposit = Number(o.deposit_amount !== undefined ? o.deposit_amount : (o.depositAmount || 0));
        const net = isCompleted ? total : (deposit > 0 ? deposit : total);
        const m = String(o.payment_method || o.paymentMethod || '').toLowerCase().trim();
        const { cash, bank } = getOrderCashAndBank(o);
        const methodLabel =
          m === 'cash' || m === 'tiền mặt' ? 'Tiền mặt' :
          m === 'transfer' || m === 'bank' || m === 'vietqr' ? 'VietQR / CK' :
          m === 'momo' ? 'Ví MoMo' :
          m === 'zalopay' ? 'Ví ZaloPay' :
          m === 'viettelmoney' || m === 'viettel' ? 'Viettel Money' :
          m === 'split' || m === 'kết hợp' ? `Kết hợp (TM: ${cash.toLocaleString('vi-VN')}₫ + CK: ${bank.toLocaleString('vi-VN')}₫)` :
          m === 'card' ? 'Quẹt thẻ' : 'Tiền mặt';

        return {
          stt: idx + 1,
          ma_don: o.order_number || o.orderNumber || `BK-${idx + 1}`,
          ngay: o.created_at ? new Date(o.created_at).toLocaleString('vi-VN') : '',
          loai_don: o.order_type === 'preorder' || o.pickupDateTime ? 'Đặt bánh' : 'Tại quầy',
          khach_hang: o.customer_name || o.customerName || 'Khách lẻ',
          sdt: o.customer_phone || o.customerPhone || '',
          san_pham: Array.isArray(o.items) ? o.items.map((i: any) => `${i.quantity}x ${i.product_name_snapshot || i.name}`).join('; ') : o.cakeName || '',
          doanh_thu: net,
          tong_tien: total,
          hinh_thuc: methodLabel,
          trang_thai: o.status === 'completed' ? 'Hoàn tất' : o.status === 'ready' ? 'Sẵn sàng giao' : 'Đang xử lý',
        };
      }),
    };

    // Sheet 3: Chi Phí OPEX
    const sheetOpex: ExcelSheet = {
      name: 'Chi_Phi_Van_Hanh_OPEX',
      title: 'BẢNG KÊ CHI TIẾT CHI PHÍ VẬN HÀNH (OPEX)',
      subtitles: [`Kỳ báo cáo: ${periodLabel}`, `Tổng chi phí: ${(totalOpex).toLocaleString('vi-VN')}₫`],
      columns: [
        { header: 'STT', key: 'stt', width: 50, type: 'number' },
        { header: 'Ngày Chi', key: 'date', width: 110, type: 'string' },
        { header: 'Hạng Mục', key: 'category', width: 160, type: 'string' },
        { header: 'Diễn Giải Chi Tiết', key: 'description', width: 260, type: 'string' },
        { header: 'Nguồn Chi', key: 'source', width: 120, type: 'string' },
        { header: 'Số Tiền (VNĐ)', key: 'amount', width: 140, type: 'currency' },
      ],
      data: periodExpenses.map((e, idx) => ({
        stt: idx + 1,
        date: e.date || '',
        category: e.category || 'Chi phí khác',
        description: e.description || '',
        source: e.payment_source === 'bank' ? 'VietQR / CK' : 'Tiền mặt',
        amount: Number(e.amount || 0),
      })),
    };

    // Sheet 4: Bánh Hủy & Hao Hụt
    const sheetSpoilage: ExcelSheet = {
      name: 'Hao_Hut_Banh_Hong',
      title: 'BẢNG KÊ THIỆT HẠI BÁNH HỦY & HAO HỤT',
      subtitles: [`Kỳ báo cáo: ${periodLabel}`, `Tổng thiệt hại: ${(totalSpoilage).toLocaleString('vi-VN')}₫`],
      columns: [
        { header: 'STT', key: 'stt', width: 50, type: 'number' },
        { header: 'Thời Gian', key: 'time', width: 140, type: 'string' },
        { header: 'Tên Sản Phẩm Bánh', key: 'product', width: 220, type: 'string' },
        { header: 'Số Lượng', key: 'qty', width: 90, type: 'number' },
        { header: 'Lý Do Hủy', key: 'reason', width: 140, type: 'string' },
        { header: 'Nhân Viên', key: 'staff', width: 130, type: 'string' },
        { header: 'Thiệt Hại Giá Vốn (VNĐ)', key: 'cost', width: 140, type: 'currency' },
      ],
      data: periodSpoilage.map((s, idx) => ({
        stt: idx + 1,
        time: s.loggedAt ? new Date(s.loggedAt).toLocaleString('vi-VN') : '',
        product: s.productName || 'Bánh',
        qty: s.quantity || 1,
        reason: s.reason === 'damaged' ? 'Lỗi/hỏng' : s.reason === 'expired' ? 'Cận date' : (s.reason || 'Hao hụt'),
        staff: s.loggedBy || 'Nhân viên',
        cost: Number(s.totalCostLoss || 0),
      })),
    };

    exportMultiSheetExcel(`Ho_So_Ke_Toan_Tai_Chinh_${safeLabel}_${Date.now()}`, [
      sheetPL,
      sheetSales,
      sheetOpex,
      sheetSpoilage,
    ]);
  };

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
            onClick={handleExportFull_Direct}
            className="px-3 py-1.5 bg-white hover:bg-zinc-50 border border-zinc-200/90 rounded-xl text-xs font-bold text-zinc-700 shadow-2xs flex items-center gap-1.5 transition cursor-pointer"
            title="Xuất trọn bộ sổ sách kế toán (.xlsx đa sheet khớp kỳ hiển thị)"
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
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                datePreset === 'today'
                  ? 'bg-slate-700 text-white font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setDatePreset('week')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                datePreset === 'week'
                  ? 'bg-slate-700 text-white font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Tuần này
            </button>
            <button
              onClick={() => setDatePreset('prev_week')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                datePreset === 'prev_week'
                  ? 'bg-slate-700 text-white font-bold shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Tuần trước
            </button>
            <button
              onClick={() => setDatePreset('month')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
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
            <span>Khóa Sổ Kỳ (Kế Toán)</span>
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
          datePreset={datePreset}
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
