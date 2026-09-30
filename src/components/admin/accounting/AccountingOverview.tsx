'use client';

import React, { useState, useMemo } from 'react';
import { 
  BarChart3, Package, TrendingUp, ArrowDownRight, ArrowUpRight, 
  ChevronDown, ChevronRight, FileSpreadsheet, Search, Eye, Filter,
  RefreshCw, DollarSign, Wallet, ShieldCheck, Printer, ArrowRight,
  Calendar, Sparkles, Award, Camera, X
} from 'lucide-react';
import { exportMultiSheetExcel, ExcelSheet } from '@/lib/utils/exportExcel';

export interface AccountingOverviewProps {
  orders: any[];
  expenses: any[];
  spoilageLogs: any[];
  cashflow: any[];
  datePreset?: string;
  periodLabel: string;
  startDateMs: number;
  endDateMs: number;
  prevStartDateMs?: number;
  prevEndDateMs?: number;
  onExportPL?: () => void;
  onExportSales?: () => void;
  onExportFull?: () => void;
  onOpenCashflow?: () => void;
  onOpenOpex?: () => void;
  onOpenClosing?: () => void;
}

const formatVND = (val: any) => {
  const num = Number(val);
  const rounded = isNaN(num) ? 0 : Math.round(num);
  const prefix = rounded < 0 ? '-' : '';
  return `${prefix}${Math.abs(rounded).toLocaleString('vi-VN')}₫`;
};

export type StandardPaymentMethod = 'cash' | 'transfer' | 'momo' | 'split' | 'card' | 'unknown';

export const getOrderPaymentMethod = (o: any): StandardPaymentMethod => {
  if (!o) return 'cash';

  // 1. Kiểm tra mảng payments chi tiết
  if (Array.isArray(o.payments) && o.payments.length > 0) {
    const methods = new Set(o.payments.map((p: any) => String(p.method || '').toLowerCase().trim()).filter(Boolean));
    if (methods.size > 1 || (methods.has('cash') && (methods.has('transfer') || methods.has('bank')))) {
      return 'split';
    }
    if (methods.has('momo')) return 'momo';
    if (methods.has('card')) return 'card';
    if (methods.has('transfer') || methods.has('bank') || methods.has('vietqr')) return 'transfer';
    if (methods.has('cash')) return 'cash';
  }

  // 2. Kiểm tra các trường payment_method / paymentMethod
  const m = (
    o?.payment_method ||
    o?.paymentMethod ||
    o?.final_payment_method ||
    ''
  ).toString().toLowerCase().trim();

  if (m === 'cash' || m === 'tiền mặt' || m === 'tien mat') return 'cash';
  if (m === 'transfer' || m === 'bank' || m === 'vietqr' || m === 'ck' || m === 'chuyển khoản' || m === 'chuyen khoan') return 'transfer';
  if (m === 'momo' || m === 'ví momo' || m === 'vi momo') return 'momo';
  if (m === 'split' || m === 'kết hợp' || m === 'ket hop') return 'split';
  if (m === 'card' || m === 'thẻ' || m === 'the') return 'card';

  // 3. Kiểm tra ghi chú hoặc ảnh bill chuyển khoản đối soát
  const notes = String(o?.notes || '').toLowerCase();
  if (o?.transfer_proof_image || notes.includes('bill ck') || notes.includes('chuyển khoản') || notes.includes('vietqr')) {
    return 'transfer';
  }
  if (notes.includes('momo')) return 'momo';

  return 'cash';
};

export const isOrderCash = (o: any): boolean => {
  return getOrderPaymentMethod(o) === 'cash';
};

export const AccountingOverview: React.FC<AccountingOverviewProps> = ({
  orders,
  expenses,
  spoilageLogs,
  cashflow,
  datePreset,
  periodLabel,
  startDateMs,
  endDateMs,
  prevStartDateMs,
  prevEndDateMs,
  onExportPL,
  onExportSales,
  onExportFull,
  onOpenCashflow,
  onOpenOpex,
  onOpenClosing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'pos' | 'preorder'>('all');
  const [showOrderDrawer, setShowOrderDrawer] = useState(false);
  const [showWeeklySection, setShowWeeklySection] = useState(true);
  const [weeklyViewMode, setWeeklyViewMode] = useState<'days' | 'weeks'>('days');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    cogs: true,
    opex: true,
  });
  const [viewingProof, setViewingProof] = useState<{ orderNumber: string; image: string } | null>(null);

  const toggleSection = (sec: string) => {
    setExpandedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // 1. Đơn hàng trong kỳ
  const periodOrders = useMemo(() => {
    return orders.filter((o) => {
      // Skip cancelled orders with zero revenue
      const amt = Number(o.total_amount || o.totalPrice || 0);
      if (o.status === 'cancelled' && amt <= 0) return false;

      const timeStr = o.created_at || o.createdAt || '';
      if (!timeStr) return true;
      const t = new Date(timeStr).getTime();
      return isNaN(t) || (t >= startDateMs && t <= endDateMs);
    });
  }, [orders, startDateMs, endDateMs]);

  // Đơn hàng kỳ trước
  const prevPeriodOrders = useMemo(() => {
    if (!prevStartDateMs || !prevEndDateMs) return [];
    return orders.filter((o) => {
      // Skip cancelled orders with zero revenue
      const amt = Number(o.total_amount || o.totalPrice || 0);
      if (o.status === 'cancelled' && amt <= 0) return false;

      const timeStr = o.created_at || o.createdAt || '';
      if (!timeStr) return false;
      const t = new Date(timeStr).getTime();
      return t >= prevStartDateMs && t <= prevEndDateMs;
    });
  }, [orders, prevStartDateMs, prevEndDateMs]);

  const getOrderNetRevenue = (o: any) => {
    if (o.status === 'refunded' || o.status === 'cancelled') return 0;
    const amt = Number(o.total_amount || o.totalPrice || 0);
    const refunded = Number(o.refunded_amount || 0);
    return Math.max(0, amt - refunded);
  };

  // 2. Doanh thu thuần (đã trừ hoàn trả / đổi hàng)
  const totalRevenue = useMemo(() => {
    return periodOrders.reduce((acc, o) => acc + getOrderNetRevenue(o), 0);
  }, [periodOrders]);

  const prevRevenue = useMemo(() => {
    return prevPeriodOrders.reduce((acc, o) => acc + getOrderNetRevenue(o), 0);
  }, [prevPeriodOrders]);

  const revGrowthPct = useMemo(() => {
    if (totalRevenue <= 0 && prevRevenue <= 0) return 0;
    if (prevRevenue <= 0) return totalRevenue > 0 ? 100 : 0;
    const diff = ((totalRevenue - prevRevenue) / prevRevenue) * 100;
    return Math.round(diff);
  }, [totalRevenue, prevRevenue]);

  // Phân tách Doanh thu Tiền mặt & VietQR/Khác thuần
  const cashRevenue = useMemo(() => {
    return periodOrders.reduce((acc, o) => {
      const method = getOrderPaymentMethod(o);
      const netRev = getOrderNetRevenue(o);
      if (method === 'cash') return acc + netRev;
      if (method === 'split') {
        if (Array.isArray(o.payments) && o.payments.length > 0) {
          const cashAmt = o.payments
            .filter((p: any) => String(p.method).toLowerCase() === 'cash')
            .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
          return acc + Math.min(cashAmt, netRev);
        }
        if (o.splitCashAmount) {
          return acc + Math.min(Number(o.splitCashAmount || 0), netRev);
        }
        return acc + Math.round(netRev / 2);
      }
      return acc;
    }, 0);
  }, [periodOrders]);

  const bankRevenue = Math.max(0, totalRevenue - cashRevenue);

  // 3. Giá vốn hàng bán (COGS BOM ~ 36.5% hoặc 31.8%)
  const totalCOGS = useMemo(() => Math.round(totalRevenue * 0.365), [totalRevenue]);
  const flourCost = Math.round(totalCOGS * 0.70);
  const milkPackagingCost = totalCOGS - flourCost;

  // Lợi nhuận gộp
  const grossProfit = totalRevenue - totalCOGS;

  // 4. Chi phí OPEX
  const periodExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return true;
      const t = new Date(e.date).getTime();
      return isNaN(t) || (t >= startDateMs && t <= endDateMs);
    });
  }, [expenses, startDateMs, endDateMs]);

  const totalOpex = useMemo(() => {
    return periodExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
  }, [periodExpenses]);

  // Nhóm chi phí theo hạng mục
  const salaryExpense = useMemo(() => {
    return periodExpenses
      .filter((e) => (e.category || '').toLowerCase().includes('lương'))
      .reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [periodExpenses]);

  const rentExpense = useMemo(() => {
    return periodExpenses
      .filter((e) => (e.category || '').toLowerCase().includes('mặt bằng') || (e.category || '').toLowerCase().includes('thuê'))
      .reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [periodExpenses]);

  const utilityExpense = totalOpex - salaryExpense - rentExpense;

  // 5. Hao hụt bánh hỏng
  const periodSpoilage = useMemo(() => {
    return spoilageLogs.filter((l) => {
      const t = l.loggedAt ? new Date(l.loggedAt).getTime() : 0;
      return t >= startDateMs && t <= endDateMs;
    });
  }, [spoilageLogs, startDateMs, endDateMs]);

  const spoilageCost = useMemo(() => {
    return periodSpoilage.reduce((acc, l) => acc + Number(l.totalCostLoss || 0), 0);
  }, [periodSpoilage]);

  const spoilageQty = useMemo(() => {
    return periodSpoilage.reduce((acc, l) => acc + Number(l.quantity || 0), 0);
  }, [periodSpoilage]);

  // 6. Lợi nhuận ròng (Net Profit)
  const netProfit = grossProfit - totalOpex - spoilageCost;
  const netMarginPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';
  const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // Tỷ lệ % trên doanh thu
  const cogsPct = totalRevenue > 0 ? ((totalCOGS / totalRevenue) * 100).toFixed(1) : '0.0';
  const opexPct = totalRevenue > 0 ? ((totalOpex / totalRevenue) * 100).toFixed(1) : '0.0';
  const spoilagePct = totalRevenue > 0 ? ((spoilageCost / totalRevenue) * 100).toFixed(1) : '0.0';
  const salaryPct = totalRevenue > 0 ? ((salaryExpense / totalRevenue) * 100).toFixed(1) : '0.0';
  const rentPct = totalRevenue > 0 ? ((rentExpense / totalRevenue) * 100).toFixed(1) : '0.0';
  const utilityPct = totalRevenue > 0 ? ((utilityExpense / totalRevenue) * 100).toFixed(1) : '0.0';

  // 7. Sổ quỹ kép (Tiền mặt vs VietQR)
  const cashBalance = useMemo(() => {
    const cashIn = cashRevenue;
    const cashOut = periodExpenses
      .filter((e) => !e.payment_source || e.payment_source === 'cash')
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);
    return Math.max(0, cashIn - cashOut);
  }, [cashRevenue, periodExpenses]);

  const bankBalance = useMemo(() => {
    const bankIn = bankRevenue;
    const bankOut = periodExpenses
      .filter((e) => e.payment_source === 'bank')
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);
    return Math.max(0, bankIn - bankOut);
  }, [bankRevenue, periodExpenses]);

  // 8. ── PHÂN RÃ THEO TUẦN (7 NGÀY TRONG TUẦN T2 -> CN) ──
  const weeklyDayBreakdown = useMemo(() => {
    const days = [
      { key: 1, label: 'Thứ 2', short: 'T2', revenue: 0, orders: 0 },
      { key: 2, label: 'Thứ 3', short: 'T3', revenue: 0, orders: 0 },
      { key: 3, label: 'Thứ 4', short: 'T4', revenue: 0, orders: 0 },
      { key: 4, label: 'Thứ 5', short: 'T5', revenue: 0, orders: 0 },
      { key: 5, label: 'Thứ 6', short: 'T6', revenue: 0, orders: 0 },
      { key: 6, label: 'Thứ 7', short: 'T7', revenue: 0, orders: 0 },
      { key: 0, label: 'Chủ Nhật', short: 'CN', revenue: 0, orders: 0 },
    ];

    periodOrders.forEach((o) => {
      const timeStr = o.created_at || o.createdAt || '';
      if (timeStr) {
        const d = new Date(timeStr);
        if (!isNaN(d.getTime())) {
          const dayIdx = d.getDay();
          const target = days.find((item) => item.key === dayIdx);
          if (target) {
            target.revenue += Number(o.total_amount || o.totalPrice || 0);
            target.orders += 1;
          }
        }
      }
    });

    const maxRev = Math.max(1, ...days.map((d) => d.revenue));
    const totalWeekRev = days.reduce((s, d) => s + d.revenue, 0);
    return { days, maxRev, totalWeekRev };
  }, [periodOrders]);

  // 9. ── PHÂN RÃ 4 TUẦN TRONG THÁNG (TUẦN 1 -> TUẦN 4) ──
  const monthWeeksBreakdown = useMemo(() => {
    const weeks = [
      { id: 1, label: 'Tuần 1 (01 - 07)', short: 'Tuần 1', startDay: 1, endDay: 7, revenue: 0, orders: 0 },
      { id: 2, label: 'Tuần 2 (08 - 14)', short: 'Tuần 2', startDay: 8, endDay: 14, revenue: 0, orders: 0 },
      { id: 3, label: 'Tuần 3 (15 - 21)', short: 'Tuần 3', startDay: 15, endDay: 21, revenue: 0, orders: 0 },
      { id: 4, label: 'Tuần 4 (22 - Cuối)', short: 'Tuần 4', startDay: 22, endDay: 31, revenue: 0, orders: 0 },
    ];

    periodOrders.forEach((o) => {
      const timeStr = o.created_at || o.createdAt || '';
      if (timeStr) {
        const d = new Date(timeStr);
        if (!isNaN(d.getTime())) {
          const dateNum = d.getDate();
          const target = weeks.find((w) => dateNum >= w.startDay && dateNum <= w.endDay);
          if (target) {
            target.revenue += Number(o.total_amount || o.totalPrice || 0);
            target.orders += 1;
          }
        }
      }
    });

    const maxRev = Math.max(1, ...weeks.map((w) => w.revenue));
    const totalMonthRev = weeks.reduce((s, w) => s + w.revenue, 0);
    return { weeks, maxRev, totalMonthRev };
  }, [periodOrders]);

  // Lọc đơn hàng cho bảng kê
  const filteredOrders = useMemo(() => {
    return periodOrders.filter((o) => {
      const q = searchTerm.toLowerCase().trim();
      const num = String(o.order_number || o.orderNumber || '').toLowerCase();
      const name = String(o.customer_name || o.customerName || '').toLowerCase();
      const phone = String(o.customer_phone || o.customerPhone || '').toLowerCase();
      const matchQuery = !q || num.includes(q) || name.includes(q) || phone.includes(q);
      if (!matchQuery) return false;

      const isPre = o.order_type === 'preorder' || o.order_number?.startsWith('BK-PRE') || !!o.preorder_pickup_at;
      if (orderTypeFilter === 'preorder') return isPre;
      if (orderTypeFilter === 'pos') return !isPre;
      return true;
    });
  }, [periodOrders, searchTerm, orderTypeFilter]);

  const currentTimeStr = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }, []);

  const comparisonLabel = useMemo(() => {
    if (datePreset === 'week' || datePreset === 'prev_week') return 'vs. Tuần trước';
    if (datePreset === 'today') return 'vs. Hôm qua';
    return 'vs. Month';
  }, [datePreset]);

  // ── XUẤT BÁO CÁO P&L CHI TIẾT RA EXCEL (KHỚP 100% SỐ LIỆU ĐANG HIỂN THỊ TRÊN MÀN HÌNH) ──
  const handleExportPL_Direct = () => {
    const safeLabel = (periodLabel || 'Ky_Ke_Toan').replace(/[/\\?%*:|"<> ()]/g, '_');

    // Sheet 1: Báo cáo P&L
    const sheetPL: ExcelSheet = {
      name: 'Bao_Cao_PL_Chi_Tiet',
      title: 'BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH (P&L)',
      subtitles: [
        `Kỳ báo cáo: ${periodLabel}`,
        `Thời điểm kết xuất: ${new Date().toLocaleString('vi-VN')}`,
        `Số lượng đơn hàng thực tế phát sinh: ${periodOrders.length} đơn`,
      ],
      columns: [
        { header: 'Chỉ Tiêu Kế Toán Tài Chính', key: 'chi_tieu', width: 260, type: 'string' },
        { header: 'Số Tiền (VNĐ)', key: 'gia_tri', width: 140, type: 'currency' },
        { header: 'Tỷ Trọng (%)', key: 'ty_le', width: 110, type: 'string' },
        { header: 'Diễn Giải Chi Tiết', key: 'ghi_chu', width: 280, type: 'string' },
      ],
      data: [
        { chi_tieu: 'I. TỔNG DOANH THU THUẦN', gia_tri: totalRevenue, ty_le: '100.0%', ghi_chu: `Tổng ${periodOrders.length} đơn hàng trong kỳ (${periodLabel})` },
        { chi_tieu: '   1. Doanh thu Tiền mặt tại quầy', gia_tri: cashRevenue, ty_le: totalRevenue > 0 ? `${((cashRevenue / totalRevenue) * 100).toFixed(1)}%` : '0.0%', ghi_chu: 'Khách thanh toán tiền mặt tại quầy POS' },
        { chi_tieu: '   2. Doanh thu Chuyển khoản / VietQR / Ví', gia_tri: bankRevenue, ty_le: totalRevenue > 0 ? `${((bankRevenue / totalRevenue) * 100).toFixed(1)}%` : '0.0%', ghi_chu: 'Khách thanh toán VietQR, MoMo, Thẻ ngân hàng' },
        { chi_tieu: 'II. GIÁ VỐN HÀNG BÁN (COGS)', gia_tri: -totalCOGS, ty_le: totalRevenue > 0 ? `${cogsPct}%` : '0.0%', ghi_chu: 'Định mức BOM nguyên vật liệu sản xuất bánh (~36.5%)' },
        { chi_tieu: '   1. Chi phí Bột mì, bơ, sữa, kem & nguyên liệu', gia_tri: -flourCost, ty_le: totalRevenue > 0 ? `${((flourCost / (totalRevenue || 1)) * 100).toFixed(1)}%` : '0.0%', ghi_chu: '~70% giá vốn nguyên vật liệu chính' },
        { chi_tieu: '   2. Chi phí Bao bì hộp bánh, dao nến & phụ kiện', gia_tri: -milkPackagingCost, ty_le: totalRevenue > 0 ? `${((milkPackagingCost / (totalRevenue || 1)) * 100).toFixed(1)}%` : '0.0%', ghi_chu: '~30% giá vốn hoàn thiện đóng gói' },
        { chi_tieu: 'III. LỢI NHUẬN GỘP (GROSS PROFIT)', gia_tri: grossProfit, ty_le: totalRevenue > 0 ? `${grossMarginPct}%` : '0.0%', ghi_chu: 'Lợi nhuận gộp sau khi trừ giá vốn' },
        { chi_tieu: 'IV. CHI PHÍ VẬN HÀNH (OPEX)', gia_tri: -totalOpex, ty_le: totalRevenue > 0 ? `${opexPct}%` : '0.0%', ghi_chu: `Tổng ${periodExpenses.length} khoản chi phí phát sinh trong kỳ` },
        { chi_tieu: '   1. Lương nhân viên & thợ bánh', gia_tri: -salaryExpense, ty_le: totalRevenue > 0 ? `${salaryPct}%` : '0.0%', ghi_chu: 'Chi phí nhân sự' },
        { chi_tieu: '   2. Tiền thuê mặt bằng tiệm bánh', gia_tri: -rentExpense, ty_le: totalRevenue > 0 ? `${rentPct}%` : '0.0%', ghi_chu: 'Chi phí mặt bằng cố định' },
        { chi_tieu: '   3. Điện, nước, gas & chi phí khác', gia_tri: -utilityExpense, ty_le: totalRevenue > 0 ? `${utilityPct}%` : '0.0%', ghi_chu: 'Chi phí vận hành biến đổi' },
        { chi_tieu: 'V. HAO HỤT & THIỆT HẠI BÁNH HỎNG', gia_tri: -spoilageCost, ty_le: totalRevenue > 0 ? `${spoilagePct}%` : '0.0%', ghi_chu: `${spoilageQty} cái bánh hủy/hết hạn ghi nhận trong kỳ` },
        { chi_tieu: 'VI. LỢI NHUẬN RÒNG (NET PROFIT)', gia_tri: netProfit, ty_le: totalRevenue > 0 ? `${netMarginPct}%` : '0.0%', ghi_chu: 'Lợi nhuận ròng thực nhận của tiệm bánh' },
      ],
      notes: [
        `Ghi chú: Báo cáo được trích xuất từ dữ liệu kế toán thực tế theo kỳ [${periodLabel}].`,
        `Người lập báo cáo: Kế toán trưởng / Quản lý tiệm bánh.`,
      ],
    };

    // Sheet 2: Chi tiết chi phí OPEX trong kỳ
    const sheetExpenses: ExcelSheet = {
      name: 'Chi_Tiet_Chi_Phi_OPEX',
      title: 'BẢNG KÊ CHI TIẾT CHI PHÍ VẬN HÀNH TRONG KỲ',
      subtitles: [
        `Kỳ báo cáo: ${periodLabel}`,
        `Tổng chi phí OPEX: ${formatVND(totalOpex)} (${periodExpenses.length} khoản chi)`,
      ],
      columns: [
        { header: 'STT', key: 'stt', width: 60, type: 'number' },
        { header: 'Ngày Chi', key: 'ngay', width: 110, type: 'string' },
        { header: 'Khoản Mục Chi Phí', key: 'category', width: 180, type: 'string' },
        { header: 'Nội Dung Diễn Giải', key: 'description', width: 240, type: 'string' },
        { header: 'Nguồn Tiền Chi', key: 'source', width: 130, type: 'string' },
        { header: 'Số Tiền (VNĐ)', key: 'amount', width: 130, type: 'currency' },
      ],
      data: periodExpenses.map((e, idx) => ({
        stt: idx + 1,
        ngay: e.date || '',
        category: e.category || 'Chi phí',
        description: e.description || e.desc || '',
        source: e.payment_source === 'bank' ? 'Chuyển khoản (VietQR)' : 'Tiền mặt tại két',
        amount: Number(e.amount || 0),
      })),
    };

    // Sheet 3: Chi tiết bánh hỏng / hao hụt trong kỳ
    const sheetSpoilage: ExcelSheet = {
      name: 'Chi_Tiet_Banh_Huy_Hao_Hut',
      title: 'BẢNG KÊ CHI TIẾT THIỆT HẠI BÁNH HỎNG / HAO HỤT TRONG KỲ',
      subtitles: [
        `Kỳ báo cáo: ${periodLabel}`,
        `Tổng thiệt hại: ${formatVND(spoilageCost)} (${spoilageQty} cái bánh)`,
      ],
      columns: [
        { header: 'STT', key: 'stt', width: 60, type: 'number' },
        { header: 'Thời Điểm Ghi Nhận', key: 'time', width: 140, type: 'string' },
        { header: 'Tên Sản Phẩm Bánh', key: 'product', width: 220, type: 'string' },
        { header: 'Số Lượng', key: 'qty', width: 90, type: 'number' },
        { header: 'Lý Do Hủy', key: 'reason', width: 140, type: 'string' },
        { header: 'Nhân Viên Báo Hủy', key: 'staff', width: 130, type: 'string' },
        { header: 'Thiệt Hại Giá Vốn (VNĐ)', key: 'cost', width: 140, type: 'currency' },
      ],
      data: periodSpoilage.map((s, idx) => ({
        stt: idx + 1,
        time: s.loggedAt ? new Date(s.loggedAt).toLocaleString('vi-VN') : '',
        product: s.productName || 'Bánh',
        qty: s.quantity || 1,
        reason: s.reason === 'damaged' ? 'Lỗi/hỏng' : s.reason === 'expired' ? 'Cận date / Hết hạn' : (s.reason || 'Hao hụt'),
        staff: s.loggedBy || 'Nhân viên',
        cost: Number(s.totalCostLoss || 0),
      })),
    };

    exportMultiSheetExcel(`Bao_Cao_Ket_Qua_Kinh_Doanh_PL_${safeLabel}_${Date.now()}`, [
      sheetPL,
      sheetExpenses,
      sheetSpoilage,
    ]);
  };

  // ── XUẤT NHẬT KÝ HÓA ĐƠN & DOANH THU TRONG KỲ (KHỚP DANH SÁCH HIỂN THỊ) ──
  const handleExportSales_Direct = () => {
    const safeLabel = (periodLabel || 'Ky_Ke_Toan').replace(/[/\\?%*:|"<> ()]/g, '_');
    const listToExport = filteredOrders.length > 0 ? filteredOrders : periodOrders;

    const sheetSales: ExcelSheet = {
      name: 'Nhat_Ky_Hoa_Don',
      title: 'NHẬT KÝ HÓA ĐƠN & DOANH THU BÁN HÀNG',
      subtitles: [
        `Kỳ báo cáo: ${periodLabel}`,
        `Số lượng đơn hàng: ${listToExport.length} đơn`,
        `Tổng doanh thu thuần: ${formatVND(listToExport.reduce((s, o) => s + getOrderNetRevenue(o), 0))}`,
      ],
      columns: [
        { header: 'STT', key: 'stt', width: 50, type: 'number' },
        { header: 'Mã Hóa Đơn', key: 'ma_don', width: 130, type: 'string' },
        { header: 'Ngày Giờ', key: 'ngay', width: 130, type: 'string' },
        { header: 'Phân Loại', key: 'loai_don', width: 110, type: 'string' },
        { header: 'Hình Thức Nhận', key: 'hinh_thuc_nhan', width: 130, type: 'string' },
        { header: 'Địa Chỉ Giao', key: 'dia_chi_ship', width: 200, type: 'string' },
        { header: 'Thu Ngân', key: 'thu_ngan', width: 110, type: 'string' },
        { header: 'Khách Hàng', key: 'khach_hang', width: 140, type: 'string' },
        { header: 'Số Điện Thoại', key: 'sdt', width: 100, type: 'string' },
        { header: 'Chi Tiết Sản Phẩm Bánh', key: 'san_pham', width: 240, type: 'string' },
        { header: 'Doanh Thu Thuần', key: 'doanh_thu_thuan', width: 120, type: 'currency' },
        { header: 'Tổng Tiền Đơn', key: 'tong_tien', width: 120, type: 'currency' },
        { header: 'Tiền Cọc', key: 'da_coc', width: 110, type: 'currency' },
        { header: 'Còn Thu Khi Giao', key: 'con_thu', width: 120, type: 'currency' },
        { header: 'Hình Thức TT', key: 'hinh_thuc', width: 120, type: 'string' },
        { header: 'Trạng Thái', key: 'trang_thai', width: 110, type: 'string' },
      ],
      data: listToExport.map((o: any, idx: number) => {
        const isShip = (o.delivery_method || o.deliveryMethod) === 'shipping';
        const total = Number(o.total_amount || o.totalPrice || 0);
        const deposit = Number(o.deposit_amount !== undefined ? o.deposit_amount : (o.depositAmount || 0));
        const remaining = Number(o.remaining_amount !== undefined ? o.remaining_amount : (o.remainingAmount || (total - deposit)));
        const method = getOrderPaymentMethod(o);
        const methodLabel =
          method === 'cash' ? 'Tiền mặt' :
          method === 'transfer' ? 'VietQR / CK' :
          method === 'momo' ? 'Ví MoMo' :
          method === 'split' ? 'Kết hợp (TM+CK)' :
          method === 'card' ? 'Quẹt thẻ' : 'Tiền mặt';

        return {
          stt: idx + 1,
          ma_don: o.order_number || o.orderNumber || `BK-${idx + 1}`,
          ngay: o.created_at ? new Date(o.created_at).toLocaleString('vi-VN') : '',
          loai_don: o.order_type === 'preorder' || o.pickupDateTime ? 'Đặt bánh' : 'Tại quầy',
          hinh_thuc_nhan: isShip ? 'Giao tận nơi (Ship)' : (o.order_type === 'preorder' ? 'Lấy tại tiệm' : 'Tại quầy'),
          dia_chi_ship: o.shipping_address || o.shippingAddress || '',
          thu_ngan: o.cashier || 'Thu Ngân',
          khach_hang: o.customer_name || o.customerName || 'Khách lẻ',
          sdt: o.customer_phone || o.customerPhone || '',
          san_pham: Array.isArray(o.items) ? o.items.map((i: any) => `${i.quantity}x ${i.product_name_snapshot || i.name}`).join('; ') : o.cakeName || '',
          doanh_thu_thuan: getOrderNetRevenue(o),
          tong_tien: total,
          da_coc: deposit,
          con_thu: remaining,
          hinh_thuc: methodLabel,
          trang_thai: o.status === 'completed' ? 'Hoàn tất' : o.status === 'ready' ? 'Sẵn sàng giao' : 'Đang xử lý',
        };
      }),
    };

    exportMultiSheetExcel(`Nhat_Ky_Hoa_Don_Doanh_Thu_${safeLabel}_${Date.now()}`, [sheetSales]);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">

      {/* ── ROW 1: 5 CARDS CHỈ SỐ TÀI CHÍNH CHUẨN MOCKUP ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        
        {/* Card 1: Doanh thu thuần */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs flex flex-col justify-between h-[155px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-700">Doanh thu thuần</span>
            <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
              {formatVND(totalRevenue)}
            </div>
            <div className={`text-[11px] font-bold ${revGrowthPct < 0 ? 'text-rose-600' : 'text-emerald-600'} mt-0.5`}>
              {totalRevenue > 0 || prevRevenue > 0 ? (
                `${revGrowthPct >= 0 ? `+${revGrowthPct}%` : `${revGrowthPct}%`} ${comparisonLabel}`
              ) : (
                `0% ${comparisonLabel}`
              )}
            </div>
          </div>
          <div className="h-8 w-full">
            <svg className="w-full h-full" viewBox="0 0 100 26" preserveAspectRatio="none">
              <path 
                d="M0,20 Q15,24 30,15 T60,10 T85,16 T100,8" 
                fill="none" 
                stroke="#334155" 
                strokeWidth="2.2" 
                strokeLinecap="round" 
              />
            </svg>
          </div>
        </div>

        {/* Card 2: Giá vốn (COGS - Nguyên Liệu) */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs flex flex-col justify-between h-[155px]">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-700">Giá vốn</span>
              <span className="text-[10px] text-zinc-400 font-medium">(COGS - Nguyên Liệu)</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
              {formatVND(totalCOGS)}
            </div>
            <div className="text-[11px] font-semibold text-zinc-500 mt-0.5">
              {cogsPct}%
            </div>
          </div>
          <div className="h-8 w-full flex items-end gap-1.5 px-0.5 pb-0.5">
            <div className="flex-1 h-3 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-5 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-3 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-4 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-6 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-5 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-7 bg-emerald-500 rounded-xs"></div>
          </div>
        </div>

        {/* Card 3: Chi phí vận hành (OPEX) */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs flex flex-col justify-between h-[155px]">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-700">Chi phí vận hành</span>
              <span className="text-[10px] text-zinc-400 font-medium">(OPEX)</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
              {formatVND(totalOpex)}
            </div>
            <div className="text-[11px] font-semibold text-zinc-500 mt-0.5">
              {opexPct}%
            </div>
          </div>
          <div className="h-8 w-full flex items-end gap-1.5 px-0.5 pb-0.5">
            <div className="flex-1 h-3 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-5 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-3 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-5 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-4 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-6 bg-slate-700 rounded-xs"></div>
            <div className="flex-1 h-7 bg-emerald-500 rounded-xs"></div>
          </div>
        </div>

        {/* Card 4: Hao hụt bánh hỏng (Hao hụt) */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs flex flex-col justify-between h-[155px]">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-zinc-700">Hao hụt bánh hỏng</span>
              <span className="text-[10px] text-zinc-400 font-medium">(Hao hụt)</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-600">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
              {formatVND(spoilageCost)}
            </div>
            <div className="text-[11px] font-bold text-rose-600 mt-0.5">
              {spoilagePct}%
            </div>
          </div>
          <div className="h-8 w-full">
            <svg className="w-full h-full" viewBox="0 0 100 26" preserveAspectRatio="none">
              <path 
                d="M0,16 Q20,18 40,22 T70,12 T100,18" 
                fill="none" 
                stroke="#334155" 
                strokeWidth="2.2" 
                strokeLinecap="round" 
              />
            </svg>
          </div>
        </div>

        {/* Card 5: Lợi nhuận ròng (Net Profit) - VIỀN XANH 2PX NỀN TRẮNG CHUẨN MOCKUP */}
        <div className="bg-white rounded-2xl p-4 border-2 border-emerald-500 shadow-sm flex flex-col justify-between h-[155px] relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-zinc-900">Lợi nhuận ròng</span>
              <span className="text-[10px] text-zinc-400 font-medium">Net Profit</span>
            </div>
            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center text-white shadow-xs">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg sm:text-xl font-extrabold text-zinc-900 tracking-tight">
              {formatVND(netProfit)}
            </div>
            <div className={`text-[11px] font-bold ${revGrowthPct < 0 ? 'text-rose-600' : 'text-emerald-600'} mt-0.5`}>
              {totalRevenue > 0 || prevRevenue > 0 ? (
                `${revGrowthPct >= 0 ? `+${revGrowthPct}%` : `${revGrowthPct}%`} | ${netMarginPct}% Margin`
              ) : (
                `0% | ${netMarginPct}% Margin`
              )}
            </div>
          </div>
          <div className="h-8 w-full -mb-1">
            <svg className="w-full h-full" viewBox="0 0 100 26" preserveAspectRatio="none">
              <defs>
                <linearGradient id="netProfitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path 
                d="M0,18 Q20,10 40,16 T75,6 T100,12 L100,26 L0,26 Z" 
                fill="url(#netProfitGradient)" 
              />
              <path 
                d="M0,18 Q20,10 40,16 T75,6 T100,12" 
                fill="none" 
                stroke="#10B981" 
                strokeWidth="2.2" 
                strokeLinecap="round" 
              />
            </svg>
          </div>
        </div>

      </div>

      {/* ── KHỐI BIỂU THỊ THEO TUẦN & THEO NGÀY (WEEKLY & DAILY BREAKDOWN) ── */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-zinc-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                <span>Biểu Thị Doanh Thu Theo Tuần</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">
                  {weeklyViewMode === 'days' ? '7 ngày trong tuần' : '4 tuần trong tháng'}
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">Xem diễn biến bán hàng để lên kế hoạch nướng bánh và nguyên liệu</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl text-xs font-bold">
              <button
                onClick={() => setWeeklyViewMode('days')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  weeklyViewMode === 'days' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                7 Ngày Trong Tuần
              </button>
              <button
                onClick={() => setWeeklyViewMode('weeks')}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  weeklyViewMode === 'weeks' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Các Tuần Trong Tháng
              </button>
            </div>

            <button
              onClick={() => setShowWeeklySection(!showWeeklySection)}
              className="px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-zinc-800 transition cursor-pointer"
            >
              {showWeeklySection ? 'Thu gọn' : 'Mở rộng'}
            </button>
          </div>
        </div>

        {showWeeklySection && weeklyViewMode === 'days' && (
          <div className="animate-in fade-in duration-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-1">
              {weeklyDayBreakdown.days.map((d) => {
                const isMax = d.revenue > 0 && d.revenue === weeklyDayBreakdown.maxRev;
                const heightPct = weeklyDayBreakdown.maxRev > 0 
                  ? Math.max(12, Math.round((d.revenue / weeklyDayBreakdown.maxRev) * 100)) 
                  : 12;
                return (
                  <div
                    key={d.key}
                    className={`rounded-xl p-3 border flex flex-col justify-between h-40 transition ${
                      isMax 
                        ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-400/50' 
                        : 'bg-zinc-50/70 border-zinc-200/70 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${isMax ? 'text-emerald-900' : 'text-zinc-700'}`}>
                        {d.label}
                      </span>
                      {isMax && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500 text-white flex items-center gap-0.5">
                          ⭐ Max
                        </span>
                      )}
                    </div>

                    <div className="w-full flex items-end justify-center h-16 py-1">
                      <div className="w-full bg-zinc-200/70 rounded-lg h-full flex items-end p-1">
                        <div 
                          className={`w-full rounded-md transition-all duration-500 ${
                            isMax ? 'bg-emerald-500' : 'bg-slate-700'
                          }`}
                          style={{ height: `${heightPct}%` }}
                        ></div>
                      </div>
                    </div>

                    <div>
                      <div className="font-extrabold text-xs text-zinc-900 truncate">
                        {formatVND(d.revenue)}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-medium">
                        {d.orders} đơn hàng
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {showWeeklySection && weeklyViewMode === 'weeks' && (
          <div className="animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              {monthWeeksBreakdown.weeks.map((w) => {
                const isMax = w.revenue > 0 && w.revenue === monthWeeksBreakdown.maxRev;
                const pctOfTotal = totalRevenue > 0 ? ((w.revenue / totalRevenue) * 100).toFixed(1) : '0.0';
                return (
                  <div
                    key={w.id}
                    className={`rounded-xl p-4 border flex flex-col justify-between space-y-3 transition ${
                      isMax 
                        ? 'bg-emerald-50/50 border-emerald-300 ring-1 ring-emerald-400/50' 
                        : 'bg-zinc-50/70 border-zinc-200/70 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-800">{w.label}</span>
                      {isMax && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500 text-white">
                          ⭐ Cao điểm
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-base font-black text-zinc-900">
                        {formatVND(w.revenue)}
                      </div>
                      <div className="text-[11px] text-zinc-500 font-medium mt-0.5">
                        {w.orders} đơn hàng • {pctOfTotal}% tháng
                      </div>
                    </div>

                    <div className="w-full h-2 bg-zinc-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${isMax ? 'bg-emerald-500' : 'bg-slate-700'}`}
                        style={{ width: `${Math.min(100, parseFloat(pctOfTotal))}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── ROW 2: 3 CỘT SONG SONG (P&L TABLE + PHÂN BỔ CHI PHÍ + DÒNG TIỀN HIỆN TẠI) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">

        {/* ── CỘT 1 (6 COLS): BÁO CÁO KẾT QUẢ KINH DOANH (P&L) CHI TIẾT ── */}
        <div className="lg:col-span-6 bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-extrabold text-sm sm:text-base text-zinc-900">
                Báo Cáo Kết Quả Kinh Doanh (P&L) Chi Tiết
              </h3>
              <button
                onClick={handleExportPL_Direct}
                className="text-[11px] font-bold text-zinc-500 hover:text-emerald-700 flex items-center gap-1 transition cursor-pointer"
                title="Xuất bảng P&L ra Excel (Khớp 100% số liệu hiển thị)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Xuất P&L</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-zinc-100 text-zinc-500 font-semibold text-[11px]">
                    <th className="py-2.5 font-bold">Khoản Mục</th>
                    <th className="py-2.5 text-right font-bold">{periodLabel}</th>
                    <th className="py-2.5 text-right font-bold">% DT</th>
                    <th className="py-2.5 text-right font-bold">So sánh (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50 text-zinc-800">
                  
                  {/* Doanh thu thuần */}
                  <tr className="hover:bg-zinc-50/50">
                    <td className="py-2.5 font-bold text-zinc-900">Doanh thu thuần</td>
                    <td className="py-2.5 text-right font-bold text-zinc-900">{formatVND(totalRevenue)}</td>
                    <td className="py-2.5 text-right font-semibold">{totalRevenue > 0 ? '100.0%' : '0.0%'}</td>
                    <td className="py-2.5 text-right">
                      {totalRevenue > 0 || prevRevenue > 0 ? (
                        <span className={`inline-block px-1.5 py-0.5 rounded-md ${revGrowthPct >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'} font-bold text-[10px]`}>
                          {revGrowthPct >= 0 ? `+${revGrowthPct}%` : `${revGrowthPct}%`}
                        </span>
                      ) : (
                        <span className="text-zinc-400 font-medium">-</span>
                      )}
                    </td>
                  </tr>

                  {/* Giá vốn hàng bán (collapsible) */}
                  <tr 
                    onClick={() => toggleSection('cogs')}
                    className="hover:bg-zinc-50/60 cursor-pointer text-zinc-800"
                  >
                    <td className="py-2 font-semibold flex items-center gap-1">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${expandedSections.cogs ? '' : '-rotate-90'}`} />
                      <span>Giá vốn hàng bán</span>
                    </td>
                    <td className="py-2 text-right font-semibold text-zinc-800">{formatVND(totalCOGS)}</td>
                    <td className="py-2 text-right font-medium">{cogsPct}%</td>
                    <td className="py-2 text-right text-zinc-400">-</td>
                  </tr>

                  {expandedSections.cogs && (
                    <>
                      <tr className="bg-zinc-50/40 text-zinc-600 text-[11px]">
                        <td className="py-1.5 pl-6">Bột, Bơ, Trứng, Sữa (BOM)</td>
                        <td className="py-1.5 text-right">{formatVND(flourCost)}</td>
                        <td className="py-1.5 text-right">{totalRevenue > 0 ? ((flourCost / totalRevenue) * 100).toFixed(1) : '0.0'}%</td>
                        <td className="py-1.5 text-right text-zinc-400 font-medium">-</td>
                      </tr>
                      <tr className="bg-zinc-50/40 text-zinc-600 text-[11px]">
                        <td className="py-1.5 pl-6">Bao bì & hộp bánh</td>
                        <td className="py-1.5 text-right">{formatVND(milkPackagingCost)}</td>
                        <td className="py-1.5 text-right">{totalRevenue > 0 ? ((milkPackagingCost / totalRevenue) * 100).toFixed(1) : '0.0'}%</td>
                        <td className="py-1.5 text-right text-zinc-400 font-medium">-</td>
                      </tr>
                    </>
                  )}

                  {/* Lợi nhuận gộp (TÔ MÀU NHẸ CHUẨN MOCKUP) */}
                  <tr className="bg-[#FAF7F0] font-bold text-zinc-900 border-t border-b border-amber-200/50">
                    <td className="py-2.5">Lợi nhuận gộp</td>
                    <td className="py-2.5 text-right text-zinc-900">{formatVND(grossProfit)}</td>
                    <td className="py-2.5 text-right font-bold">{totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0'}%</td>
                    <td className="py-2.5 text-right font-bold text-emerald-700">
                      {totalRevenue > 0 || prevRevenue > 0 ? (
                        revGrowthPct >= 0 ? `+${revGrowthPct}%` : `${revGrowthPct}%`
                      ) : (
                        <span className="text-zinc-400 font-medium">-</span>
                      )}
                    </td>
                  </tr>

                  {/* Chi phí bán hàng & QL (collapsible) */}
                  <tr 
                    onClick={() => toggleSection('opex')}
                    className="hover:bg-zinc-50/60 cursor-pointer text-zinc-800"
                  >
                    <td className="py-2 font-semibold flex items-center gap-1">
                      <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${expandedSections.opex ? '' : '-rotate-90'}`} />
                      <span>Chi phí bán hàng & QL</span>
                    </td>
                    <td className="py-2 text-right font-semibold">{formatVND(totalOpex)}</td>
                    <td className="py-2 text-right font-medium">{opexPct}%</td>
                    <td className="py-2 text-right text-zinc-400">-</td>
                  </tr>

                  {expandedSections.opex && (
                    <>
                      <tr className="bg-zinc-50/40 text-zinc-600 text-[11px]">
                        <td className="py-1.5 pl-6">Lương NV</td>
                        <td className="py-1.5 text-right">{formatVND(salaryExpense)}</td>
                        <td className="py-1.5 text-right">{salaryPct}%</td>
                        <td className="py-1.5 text-right text-zinc-400 font-medium">-</td>
                      </tr>
                      <tr className="bg-zinc-50/40 text-zinc-600 text-[11px]">
                        <td className="py-1.5 pl-6">Tiền mặt bằng</td>
                        <td className="py-1.5 text-right">{formatVND(rentExpense)}</td>
                        <td className="py-1.5 text-right">{rentPct}%</td>
                        <td className="py-1.5 text-right text-zinc-400 font-medium">-</td>
                      </tr>
                      <tr className="bg-zinc-50/40 text-zinc-600 text-[11px]">
                        <td className="py-1.5 pl-6">Điện, nước, gas</td>
                        <td className="py-1.5 text-right">{formatVND(utilityExpense)}</td>
                        <td className="py-1.5 text-right">{utilityPct}%</td>
                        <td className="py-1.5 text-right text-zinc-400 font-medium">-</td>
                      </tr>
                    </>
                  )}

                  {/* Hao hụt bánh hỏng */}
                  <tr className="hover:bg-zinc-50/50 text-zinc-700">
                    <td className="py-2 font-medium">Hao hụt bánh hỏng</td>
                    <td className="py-2 text-right font-semibold text-rose-600">{formatVND(spoilageCost)}</td>
                    <td className="py-2 text-right font-medium text-rose-600">{spoilagePct}%</td>
                    <td className="py-2 text-right text-zinc-500 text-[11px]">{spoilageQty} bánh</td>
                  </tr>

                  {/* Lợi nhuận trước thuế */}
                  <tr className="hover:bg-zinc-50/50 text-zinc-800">
                    <td className="py-2 font-semibold">Lợi nhuận trước thuế</td>
                    <td className="py-2 text-right font-semibold">{formatVND(netProfit)}</td>
                    <td className="py-2 text-right font-medium">{netMarginPct}%</td>
                    <td className="py-2 text-right font-medium text-zinc-400">-</td>
                  </tr>

                  {/* Lợi nhuận ròng (NỔI BẬT DÒNG CUỐI CHUẨN MOCKUP) */}
                  <tr className="bg-emerald-50/70 font-extrabold text-emerald-950 border-t-2 border-emerald-300">
                    <td className="py-3 font-extrabold">Lợi nhuận ròng</td>
                    <td className="py-3 text-right font-black text-emerald-900">{formatVND(netProfit)}</td>
                    <td className="py-3 text-right font-black">{netMarginPct}%</td>
                    <td className="py-3 text-right font-black text-emerald-700">
                      {totalRevenue > 0 || prevRevenue > 0 ? (
                        revGrowthPct >= 0 ? `+${revGrowthPct}%` : `${revGrowthPct}%`
                      ) : (
                        <span className="text-zinc-400 font-medium">-</span>
                      )}
                    </td>
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-zinc-500 text-[11px]">
            <span>* Chuẩn mực kế toán F&B Việt Nam</span>
            <button
              onClick={() => setShowOrderDrawer(!showOrderDrawer)}
              className="font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 transition cursor-pointer"
            >
              <span>{showOrderDrawer ? 'Ẩn danh sách hóa đơn' : 'Xem chi tiết hóa đơn bán hàng'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ── CỘT 2 (3 COLS): PHÂN BỔ CHI PHÍ (6 THANH TIẾN ĐỘ) ── */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-zinc-900 pb-3 border-b border-zinc-100">
              Phân Bổ Chi Phí
            </h3>

            <div className="space-y-4 pt-3">
              
              {/* 1. Giá vốn NVL */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-700">Giá vốn NVL</span>
                  <span className="text-zinc-900 font-bold">{cogsPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, parseFloat(cogsPct))}%` }}
                  ></div>
                </div>
              </div>

              {/* 2. Lương NV */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-700">Lương NV</span>
                  <span className="text-zinc-900 font-bold">{salaryPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-600 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, parseFloat(salaryPct))}%` }}
                  ></div>
                </div>
              </div>

              {/* 3. Mặt bằng */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-700">Mặt bằng</span>
                  <span className="text-zinc-900 font-bold">{rentPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, parseFloat(rentPct))}%` }}
                  ></div>
                </div>
              </div>

              {/* 4. Vận hành */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-700">Vận hành</span>
                  <span className="text-zinc-900 font-bold">{utilityPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, parseFloat(utilityPct))}%` }}
                  ></div>
                </div>
              </div>

              {/* 5. Hao hụt */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-700">Hao hụt</span>
                  <span className="text-zinc-900 font-bold">{spoilagePct}%</span>
                </div>
                <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, parseFloat(spoilagePct))}%` }}
                  ></div>
                </div>
              </div>

              {/* 6. Lợi nhuận */}
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-zinc-700 font-bold">Lợi nhuận</span>
                  <span className="text-emerald-700 font-extrabold">{netMarginPct}%</span>
                </div>
                <div className="w-full h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, Math.max(0, parseFloat(netMarginPct)))}%` }}
                  ></div>
                </div>
              </div>

            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 text-[11px] text-zinc-400">
            Tổng cơ cấu chi phí chuẩn tiệm bánh
          </div>
        </div>

        {/* ── CỘT 3 (3 COLS): DÒNG TIỀN HIỆN TẠI (QUỸ TIỀN MẶT + VIETQR) ── */}
        <div className="lg:col-span-3 bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-extrabold text-sm sm:text-base text-zinc-900 pb-3 border-b border-zinc-100">
              Dòng Tiền Hiện Tại
            </h3>

            <div className="space-y-4 pt-3">
              <div>
                <span className="text-xs text-zinc-500 font-medium block">
                  Quỹ Tiền Mặt (Cửa Hàng)
                </span>
                <span className="text-xl sm:text-2xl font-black text-zinc-900 block mt-1 tracking-tight">
                  {formatVND(cashBalance)}
                </span>
              </div>

              <div className="border-t border-zinc-100"></div>

              <div>
                <span className="text-xs text-zinc-500 font-medium block">
                  Ngân Hàng VietQR
                </span>
                <span className="text-xl sm:text-2xl font-black text-zinc-900 block mt-1 tracking-tight">
                  {formatVND(bankBalance)}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-zinc-100 mt-6 space-y-3">
            <span className="text-[11px] text-zinc-400 font-medium block">
              updated: {currentTimeStr}
            </span>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onOpenCashflow}
                className="px-2.5 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold text-center transition cursor-pointer"
              >
                Sổ Quỹ Kép
              </button>
              <button
                type="button"
                onClick={onOpenClosing}
                className="px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold text-center transition shadow-2xs cursor-pointer"
              >
                Chốt Sổ Ca
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* ── BẢNG KÊ CHI TIẾT HÓA ĐƠN BÁN HÀNG REALTIME (DRAWER / EXPANDABLE) ── */}
      {showOrderDrawer && (
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs space-y-4 animate-in slide-in-from-top-4 duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
            <div>
              <h4 className="font-extrabold text-sm text-zinc-900">
                Nhật Ký Hóa Đơn Bán Hàng Trong Kỳ ({filteredOrders.length} đơn)
              </h4>
              <p className="text-xs text-zinc-500">Tự động đồng bộ thời gian thực từ quầy POS</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Mã đơn, tên, sđt..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 text-xs bg-zinc-50 w-48 font-medium"
                />
              </div>

              <div className="flex items-center gap-1 bg-zinc-100 p-0.5 rounded-xl text-[11px] font-bold">
                <button
                  onClick={() => setOrderTypeFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${orderTypeFilter === 'all' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'}`}
                >
                  Tất Cả
                </button>
                <button
                  onClick={() => setOrderTypeFilter('pos')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${orderTypeFilter === 'pos' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'}`}
                >
                  Tại Quầy
                </button>
                <button
                  onClick={() => setOrderTypeFilter('preorder')}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${orderTypeFilter === 'preorder' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600'}`}
                >
                  Đặt Bánh
                </button>
              </div>

              <button
                onClick={handleExportSales_Direct}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Xuất bảng kê hóa đơn theo bộ lọc (Khớp 100% dữ liệu hiển thị)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Xuất Excel</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400 text-[11px] font-semibold sticky top-0 bg-white">
                  <th className="py-2">Mã Đơn</th>
                  <th className="py-2">Thời Gian</th>
                  <th className="py-2">Khách Hàng</th>
                  <th className="py-2">Chi Tiết Bánh</th>
                  <th className="py-2 text-right">Tổng Tiền</th>
                  <th className="py-2 text-center">Hình Thức</th>
                  <th className="py-2 text-center">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {filteredOrders.map((o, idx) => (
                  <tr key={o.id || idx} className="hover:bg-zinc-50/60">
                    <td className="py-2.5 font-mono font-bold text-zinc-900">{o.order_number || o.orderNumber || `BK-${idx + 1}`}</td>
                    <td className="py-2.5 text-zinc-500">{o.created_at ? new Date(o.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="py-2.5">
                      <span className="font-bold text-zinc-800 block">{o.customer_name || o.customerName || 'Khách lẻ'}</span>
                      <span className="text-[10px] text-zinc-400">{o.customer_phone || o.customerPhone || ''}</span>
                    </td>
                    <td className="py-2.5 max-w-xs truncate text-zinc-600">
                      {Array.isArray(o.items) ? o.items.map((i: any) => `${i.quantity}x ${i.product_name_snapshot || i.name}`).join('; ') : (o.cakeName || 'Bánh')}
                    </td>
                    <td className="py-2.5 text-right font-black text-zinc-900">{formatVND(o.total_amount || o.totalPrice || 0)}</td>
                    <td className="py-2.5 text-center">
                      {(() => {
                        const m = getOrderPaymentMethod(o);
                        if (m === 'cash') {
                          return (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              Tiền mặt
                            </span>
                          );
                        }
                        if (m === 'transfer') {
                          return (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                              VietQR / CK
                            </span>
                          );
                        }
                        if (m === 'momo') {
                          return (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-50 text-pink-700 border border-pink-200/60">
                              Ví MoMo
                            </span>
                          );
                        }
                        if (m === 'split') {
                          return (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200/60" title={o.splitCashAmount ? `TM: ${formatVND(o.splitCashAmount)} | CK: ${formatVND(o.splitTransferAmount)}` : 'Kết hợp TM + CK'}>
                              Kết hợp (TM+CK)
                            </span>
                          );
                        }
                        if (m === 'card') {
                          return (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                              Quẹt thẻ
                            </span>
                          );
                        }
                        return (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
                            Tiền mặt
                          </span>
                        );
                      })()}
                      {Boolean(o.transfer_proof_image) && (
                        <button
                          type="button"
                          onClick={() => setViewingProof({
                            orderNumber: o.order_number || o.orderNumber || 'BK',
                            image: o.transfer_proof_image,
                          })}
                          className="mt-1 flex items-center justify-center gap-1 mx-auto px-1.5 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200 transition cursor-pointer"
                          title="Xem ảnh bill chuyển khoản đối soát"
                        >
                          <Camera className="w-3 h-3 text-amber-600" />
                          <span>Bill CK</span>
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 text-center">
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-700">
                        {o.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý'}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-400">
                      Chưa có đơn hàng nào phát sinh trong kỳ đã chọn.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lightbox Modal Xem Ảnh Bill CK Đối Soát */}
      {viewingProof && (
        <div
          onClick={() => setViewingProof(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-zinc-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-amber-600" />
                <h4 className="font-black text-sm text-zinc-900">
                  Ảnh Bill Chuyển Khoản ({viewingProof.orderNumber})
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setViewingProof(null)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden bg-zinc-950 flex items-center justify-center max-h-[70vh]">
              <img
                src={viewingProof.image}
                alt={`Bill ${viewingProof.orderNumber}`}
                className="max-h-[70vh] w-auto object-contain rounded-xl"
              />
            </div>

            <div className="flex justify-between items-center text-xs text-zinc-500 pt-1">
              <span>📸 Chụp từ camera POS lưu cùng đơn để đối soát</span>
              <button
                type="button"
                onClick={() => setViewingProof(null)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-bold transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
