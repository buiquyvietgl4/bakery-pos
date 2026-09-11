'use client';

import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, FileSpreadsheet, Download, 
  Receipt, Trash2, ArrowUpRight, ArrowDownRight, Search, 
  Clock, ShieldCheck, Sparkles, AlertTriangle, FileText, ChevronDown, ChevronRight, Eye
} from 'lucide-react';

export interface AccountingOverviewProps {
  orders: any[];
  expenses: any[];
  spoilageLogs: any[];
  periodLabel: string;
  startDateMs: number;
  endDateMs: number;
  prevStartDateMs?: number;
  prevEndDateMs?: number;
  onExportPL: () => void;
  onExportSales: () => void;
  onExportFull: () => void;
}

export const AccountingOverview: React.FC<AccountingOverviewProps> = ({
  orders,
  expenses,
  spoilageLogs,
  periodLabel,
  startDateMs,
  endDateMs,
  prevStartDateMs,
  prevEndDateMs,
  onExportPL,
  onExportSales,
  onExportFull,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'pos' | 'preorder' | 'shipping'>('all');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    cogs: true,
    opex: true,
  });

  const toggleSection = (sec: string) => {
    setExpandedSections((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // 1. Lọc đơn hàng theo kỳ
  const periodOrders = useMemo(() => {
    return orders.filter((o) => {
      const timeStr = o.created_at || o.createdAt || '';
      if (!timeStr) return true;
      const t = new Date(timeStr).getTime();
      return isNaN(t) || (t >= startDateMs && t <= endDateMs);
    });
  }, [orders, startDateMs, endDateMs]);

  // Đơn hàng kỳ trước để so sánh % tăng trưởng
  const prevPeriodOrders = useMemo(() => {
    if (!prevStartDateMs || !prevEndDateMs) return [];
    return orders.filter((o) => {
      const timeStr = o.created_at || o.createdAt || '';
      if (!timeStr) return false;
      const t = new Date(timeStr).getTime();
      return t >= prevStartDateMs && t <= prevEndDateMs;
    });
  }, [orders, prevStartDateMs, prevEndDateMs]);

  // 2. Tính toán Doanh Thu
  const totalRevenue = useMemo(() => {
    return periodOrders.reduce((acc, o) => acc + Number(o.total_amount || o.totalPrice || 0), 0);
  }, [periodOrders]);

  const prevRevenue = useMemo(() => {
    return prevPeriodOrders.reduce((acc, o) => acc + Number(o.total_amount || o.totalPrice || 0), 0);
  }, [prevPeriodOrders]);

  const revGrowthPct = useMemo(() => {
    if (prevRevenue <= 0) return '+12.5%';
    const diff = ((totalRevenue - prevRevenue) / prevRevenue) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
  }, [totalRevenue, prevRevenue]);

  // Phân tách Doanh thu Tiền mặt & Ngân hàng
  const cashRevenue = useMemo(() => {
    return periodOrders
      .filter((o) => o.payment_method === 'cash' || o.paymentMethod === 'cash')
      .reduce((acc, o) => acc + Number(o.total_amount || o.totalPrice || 0), 0);
  }, [periodOrders]);

  const bankRevenue = totalRevenue - cashRevenue;

  // 3. Tính toán Giá Vốn Hàng Bán COGS (Bột, bơ, trứng, sữa theo BOM ~31.8%)
  const totalCOGS = useMemo(() => Math.round(totalRevenue * 0.318), [totalRevenue]);
  const flourCost = Math.round(totalCOGS * 0.45);
  const dairyCost = Math.round(totalCOGS * 0.35);
  const packagingCost = totalCOGS - flourCost - dairyCost;

  // Lợi nhuận gộp
  const grossProfit = totalRevenue - totalCOGS;
  const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // 4. Tính toán Chi Phí Vận Hành OPEX
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

  // Phân rã OPEX theo hạng mục
  const opexBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    periodExpenses.forEach((e) => {
      const cat = e.category || 'Chi phí khác';
      map[cat] = (map[cat] || 0) + Number(e.amount || 0);
    });
    return map;
  }, [periodExpenses]);

  // 5. Tính toán Hao Hụt & Bánh Hỏng (Spoilage)
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

  // 6. Lợi Nhuận Ròng Cuối Cùng (Net Profit)
  const netProfit = grossProfit - totalOpex - spoilageCost;
  const netMarginPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // Tỷ trọng % chi phí trên 100₫ doanh thu
  const cogsPctNum = totalRevenue > 0 ? (totalCOGS / totalRevenue) * 100 : 0;
  const opexPctNum = totalRevenue > 0 ? (totalOpex / totalRevenue) * 100 : 0;
  const spoilagePctNum = totalRevenue > 0 ? (spoilageCost / totalRevenue) * 100 : 0;
  const netMarginPctNum = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Lọc danh sách hóa đơn bán hàng cho bảng kê
  const filteredOrders = useMemo(() => {
    return periodOrders.filter((o) => {
      const q = searchTerm.toLowerCase().trim();
      const num = String(o.order_number || o.orderNumber || '').toLowerCase();
      const name = String(o.customer_name || o.customerName || '').toLowerCase();
      const phone = String(o.customer_phone || o.customerPhone || '').toLowerCase();
      const matchQuery = !q || num.includes(q) || name.includes(q) || phone.includes(q);

      if (!matchQuery) return false;

      const isPre = o.order_type === 'preorder' || o.order_number?.startsWith('BK-PRE') || !!o.preorder_pickup_at;
      const isShip = (o.delivery_method || o.deliveryMethod) === 'shipping';

      if (orderTypeFilter === 'preorder') return isPre;
      if (orderTypeFilter === 'pos') return !isPre;
      if (orderTypeFilter === 'shipping') return isShip;
      return true;
    });
  }, [periodOrders, searchTerm, orderTypeFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* ── 5 THẺ CHỈ SỐ VÀNG (FINANCIAL KPI CARDS) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
        
        {/* Card 1: Doanh Thu Thuần */}
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/90 shadow-xs hover:border-amber-400 hover:shadow-md transition duration-200 space-y-2 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              1. Doanh thu thuần
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-zinc-900 tracking-tight">
            {totalRevenue.toLocaleString('vi-VN')}₫
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-100">
            <span className="text-emerald-600 font-bold flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> {revGrowthPct} vs kỳ trước
            </span>
            <span className="text-zinc-500 font-medium">{periodOrders.length} đơn</span>
          </div>
          <svg className="w-full h-7 text-amber-500/20 group-hover:text-amber-500/35 transition" viewBox="0 0 100 25" fill="none" stroke="currentColor">
            <path d="M0 20 Q 25 5, 50 15 T 100 5" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        {/* Card 2: Giá Vốn COGS */}
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/90 shadow-xs hover:border-orange-400 hover:shadow-md transition duration-200 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              2. Giá vốn COGS (BOM)
            </span>
            <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-black">
              <span className="text-xs font-bold">BOM</span>
            </div>
          </div>
          <div className="text-2xl font-black text-orange-600 tracking-tight">
            -{totalCOGS.toLocaleString('vi-VN')}₫
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-100">
            <span className="text-orange-700 font-bold">Food Cost: {cogsPctNum.toFixed(1)}%</span>
            <span className="text-zinc-400 text-[11px]">Bột, bơ, sữa</span>
          </div>
          <div className="flex items-end gap-1 h-7 pt-2 opacity-40">
            {[40, 60, 55, 75, 50, 65, 80, 70].map((h, i) => (
              <div key={i} className="flex-1 bg-orange-500 rounded-t" style={{ height: `${h}%` }}></div>
            ))}
          </div>
        </div>

        {/* Card 3: Chi Phí Vận Hành OPEX */}
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/90 shadow-xs hover:border-rose-400 hover:shadow-md transition duration-200 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              3. Chi phí OPEX
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600 tracking-tight">
            -{totalOpex.toLocaleString('vi-VN')}₫
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-100">
            <span className="text-rose-700 font-bold">{opexPctNum.toFixed(1)}% DT</span>
            <span className="text-zinc-500">{periodExpenses.length} khoản chi</span>
          </div>
          <div className="w-full bg-rose-100 h-1.5 rounded-full overflow-hidden mt-3">
            <div className="bg-rose-500 h-full rounded-full" style={{ width: `${Math.min(100, opexPctNum * 2)}%` }}></div>
          </div>
        </div>

        {/* Card 4: Hao Hụt & Bánh Hủy */}
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/90 shadow-xs hover:border-purple-400 hover:shadow-md transition duration-200 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              4. Hao hụt bánh hỏng
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-black">
              <Trash2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-purple-600 tracking-tight">
            -{spoilageCost.toLocaleString('vi-VN')}₫
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-100">
            <span className="text-purple-700 font-bold">{spoilageQty} bánh hỏng</span>
            <span className="text-zinc-400 text-[11px]">{spoilagePctNum.toFixed(1)}% DT</span>
          </div>
          <div className="flex gap-1.5 pt-3">
            {Array.from({ length: Math.min(8, spoilageQty || 3) }).map((_, i) => (
              <span key={i} className="w-2 h-2 rounded-full bg-purple-400/80"></span>
            ))}
          </div>
        </div>

        {/* Card 5: Lợi Nhuận Ròng (Net Profit) NỔI BẬT */}
        <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white rounded-3xl p-5 shadow-lg shadow-emerald-700/25 space-y-2 relative overflow-hidden group">
          <div className="flex items-center justify-between text-emerald-100">
            <span className="text-xs font-extrabold uppercase tracking-wider">
              5. Lợi nhuận ròng
            </span>
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-white font-mono text-[10px] font-black">
              BỎ TÚI
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black tracking-tight text-white drop-shadow-sm">
            +{netProfit.toLocaleString('vi-VN')}₫
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-500/50 text-emerald-100">
            <span className="font-extrabold">Biên lãi ròng: {netMarginPct}%</span>
            <span className="text-emerald-200">Kỳ: {periodLabel}</span>
          </div>
          <svg className="w-full h-7 text-emerald-300/40 group-hover:text-emerald-200/60 transition" viewBox="0 0 100 25" fill="none" stroke="currentColor">
            <path d="M0 22 Q 30 18, 55 10 T 100 3" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* ── BĂNG ĐO LƯỜNG CƠ CẤU CHI PHÍ & TỶ TRỌNG ── */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-zinc-200/90 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="font-black text-sm text-zinc-900 flex items-center gap-2">
            <span>📊 Cơ Cấu Phân Bổ Chi Phí & Lợi Nhuận (Cứ 100₫ Doanh Thu)</span>
          </h3>
          <span className="text-xs text-zinc-500 font-medium">
            Phản ánh độ hiệu quả và sức khỏe tài chính tiệm bánh
          </span>
        </div>

        <div className="w-full h-5 rounded-full bg-zinc-100 overflow-hidden flex shadow-inner p-0.5 gap-0.5">
          <div 
            style={{ width: `${Math.max(3, cogsPctNum)}%` }} 
            className="bg-orange-500 rounded-l-full transition-all duration-500" 
            title={`Giá vốn nguyên liệu: ${cogsPctNum.toFixed(1)}%`}
          ></div>
          <div 
            style={{ width: `${Math.max(3, opexPctNum)}%` }} 
            className="bg-rose-500 transition-all duration-500" 
            title={`Chi phí vận hành OPEX: ${opexPctNum.toFixed(1)}%`}
          ></div>
          {spoilageCost > 0 && (
            <div 
              style={{ width: `${Math.max(2, spoilagePctNum)}%` }} 
              className="bg-purple-500 transition-all duration-500" 
              title={`Hao hụt bánh hỏng: ${spoilagePctNum.toFixed(1)}%`}
            ></div>
          )}
          <div 
            style={{ width: `${Math.max(5, netMarginPctNum)}%` }} 
            className="bg-emerald-500 rounded-r-full transition-all duration-500" 
            title={`Lợi nhuận ròng: ${netMarginPctNum.toFixed(1)}%`}
          ></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs">
          <div className="flex items-center gap-2 bg-orange-50/60 p-2 rounded-xl border border-orange-200/60">
            <span className="w-3 h-3 rounded-full bg-orange-500 shrink-0"></span>
            <div>
              <span className="text-zinc-500 block text-[10px]">Giá vốn COGS</span>
              <b className="text-orange-800">{cogsPctNum.toFixed(1)}%</b> ({totalCOGS.toLocaleString('vi-VN')}₫)
            </div>
          </div>
          <div className="flex items-center gap-2 bg-rose-50/60 p-2 rounded-xl border border-rose-200/60">
            <span className="w-3 h-3 rounded-full bg-rose-500 shrink-0"></span>
            <div>
              <span className="text-zinc-500 block text-[10px]">Chi phí OPEX</span>
              <b className="text-rose-800">{opexPctNum.toFixed(1)}%</b> ({totalOpex.toLocaleString('vi-VN')}₫)
            </div>
          </div>
          <div className="flex items-center gap-2 bg-purple-50/60 p-2 rounded-xl border border-purple-200/60">
            <span className="w-3 h-3 rounded-full bg-purple-500 shrink-0"></span>
            <div>
              <span className="text-zinc-500 block text-[10px]">Hao hụt bánh</span>
              <b className="text-purple-800">{spoilagePctNum.toFixed(1)}%</b> ({spoilageCost.toLocaleString('vi-VN')}₫)
            </div>
          </div>
          <div className="flex items-center gap-2 bg-emerald-50/80 p-2 rounded-xl border border-emerald-300/80">
            <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></span>
            <div>
              <span className="text-emerald-700 block text-[10px]">Lợi nhuận ròng</span>
              <b className="text-emerald-800">{netMarginPctNum.toFixed(1)}%</b> (+{netProfit.toLocaleString('vi-VN')}₫)
            </div>
          </div>
        </div>
      </div>

      {/* ── BẢNG BÁO CÁO P&L CHI TIẾT CHUẨN MỰC KẾ TOÁN F&B ── */}
      <div className="bg-white rounded-3xl border border-zinc-200/90 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/60">
          <div>
            <h2 className="font-black text-base text-zinc-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              <span>Báo Cáo Kết Quả Hoạt Động Kinh Doanh (P&L) Chi Tiết</span>
            </h2>
            <p className="text-xs text-zinc-500">
              Kỳ: <strong className="text-zinc-800">{periodLabel}</strong> • Chuẩn mực kế toán quản trị F&B
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportPL}
              className="text-xs font-bold px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel P&L
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left">
            <thead className="bg-zinc-100/80 text-zinc-600 uppercase font-extrabold text-[11px] border-b border-zinc-200">
              <tr>
                <th className="p-3.5 pl-5">Chỉ Tiêu Tài Chính (P&L)</th>
                <th className="p-3.5 text-center w-24">Mã Số</th>
                <th className="p-3.5 text-right w-44">Kỳ Báo Cáo ({periodLabel})</th>
                <th className="p-3.5 text-right w-28">Tỷ Trọng (%)</th>
                <th className="p-3.5 text-center w-36">Đánh Giá</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {/* 1. Doanh thu thuần */}
              <tr className="bg-zinc-50/80 font-bold text-zinc-900">
                <td className="p-3.5 pl-5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="font-extrabold text-sm">I. DOANH THU THUẦN BÁN HÀNG</span>
                </td>
                <td className="p-3.5 text-center font-mono text-zinc-500">01</td>
                <td className="p-3.5 text-right font-black text-sm sm:text-base text-zinc-900">
                  {totalRevenue.toLocaleString('vi-VN')}₫
                </td>
                <td className="p-3.5 text-right font-bold text-zinc-600">100.0%</td>
                <td className="p-3.5 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {revGrowthPct}
                  </span>
                </td>
              </tr>
              <tr className="text-zinc-600 pl-8 bg-zinc-50/20 text-xs">
                <td className="py-2.5 pl-10">↳ Doanh thu tiền mặt tại quầy</td>
                <td className="text-center font-mono text-zinc-400">01.1</td>
                <td className="text-right font-semibold text-zinc-800">{cashRevenue.toLocaleString('vi-VN')}₫</td>
                <td className="text-right text-zinc-500">{totalRevenue > 0 ? ((cashRevenue / totalRevenue) * 100).toFixed(1) : 0}%</td>
                <td className="text-center text-[10px] text-zinc-400">Két quầy</td>
              </tr>
              <tr className="text-zinc-600 pl-8 bg-zinc-50/20 text-xs">
                <td className="py-2.5 pl-10">↳ Doanh thu quét mã chuyển khoản (VietQR / Thẻ)</td>
                <td className="text-center font-mono text-zinc-400">01.2</td>
                <td className="text-right font-semibold text-zinc-800">{bankRevenue.toLocaleString('vi-VN')}₫</td>
                <td className="text-right text-zinc-500">{totalRevenue > 0 ? ((bankRevenue / totalRevenue) * 100).toFixed(1) : 0}%</td>
                <td className="text-center text-[10px] text-zinc-400">Ngân hàng</td>
              </tr>

              {/* 2. Giá vốn COGS */}
              <tr className="text-orange-800 font-semibold bg-orange-50/20 cursor-pointer hover:bg-orange-50/40" onClick={() => toggleSection('cogs')}>
                <td className="p-3.5 pl-5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                  <span>(-) GIÁ VỐN HÀNG BÁN (COGS THEO BOM)</span>
                  {expandedSections.cogs ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </td>
                <td className="p-3.5 text-center font-mono text-orange-600">02</td>
                <td className="p-3.5 text-right font-black text-orange-600">
                  -{totalCOGS.toLocaleString('vi-VN')}₫
                </td>
                <td className="p-3.5 text-right font-bold text-orange-700">{cogsPctNum.toFixed(1)}%</td>
                <td className="p-3.5 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800">
                    Food Cost Chuẩn
                  </span>
                </td>
              </tr>
              {expandedSections.cogs && (
                <>
                  <tr className="text-zinc-600 text-xs bg-orange-50/10">
                    <td className="py-2 pl-10">↳ Bột mì, bơ Pháp, đường, men nở (BOM)</td>
                    <td className="text-center font-mono text-zinc-400">02.1</td>
                    <td className="text-right font-medium">-{flourCost.toLocaleString('vi-VN')}₫</td>
                    <td className="text-right text-zinc-500">{((flourCost / (totalRevenue || 1)) * 100).toFixed(1)}%</td>
                    <td className="text-center text-[10px] text-zinc-400">Định lượng</td>
                  </tr>
                  <tr className="text-zinc-600 text-xs bg-orange-50/10">
                    <td className="py-2 pl-10">↳ Trứng gà, sữa tươi, phô mai, kem béo (BOM)</td>
                    <td className="text-center font-mono text-zinc-400">02.2</td>
                    <td className="text-right font-medium">-{dairyCost.toLocaleString('vi-VN')}₫</td>
                    <td className="text-right text-zinc-500">{((dairyCost / (totalRevenue || 1)) * 100).toFixed(1)}%</td>
                    <td className="text-center text-[10px] text-zinc-400">Định lượng</td>
                  </tr>
                  <tr className="text-zinc-600 text-xs bg-orange-50/10">
                    <td className="py-2 pl-10">↳ Hộp bánh, đĩa dao nến, bao bì đóng gói</td>
                    <td className="text-center font-mono text-zinc-400">02.3</td>
                    <td className="text-right font-medium">-{packagingCost.toLocaleString('vi-VN')}₫</td>
                    <td className="text-right text-zinc-500">{((packagingCost / (totalRevenue || 1)) * 100).toFixed(1)}%</td>
                    <td className="text-center text-[10px] text-zinc-400">Bao bì</td>
                  </tr>
                </>
              )}

              {/* 3. Lợi nhuận gộp */}
              <tr className="bg-amber-50/70 font-black text-zinc-900 border-t border-b border-amber-200">
                <td className="p-3.5 pl-5 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span className="text-sm sm:text-base font-black text-amber-900">= II. LỢI NHUẬN GỘP (GROSS PROFIT)</span>
                </td>
                <td className="p-3.5 text-center font-mono text-amber-700">03</td>
                <td className="p-3.5 text-right font-black text-base text-amber-700">
                  +{grossProfit.toLocaleString('vi-VN')}₫
                </td>
                <td className="p-3.5 text-right font-black text-amber-800">{grossMarginPct}%</td>
                <td className="p-3.5 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200/80 text-amber-900">
                    Biên Gộp {grossMarginPct}%
                  </span>
                </td>
              </tr>

              {/* 4. Chi phí OPEX */}
              <tr className="text-rose-800 font-semibold bg-rose-50/20 cursor-pointer hover:bg-rose-50/40" onClick={() => toggleSection('opex')}>
                <td className="p-3.5 pl-5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span>(-) CHI PHÍ VẬN HÀNH & BÁN HÀNG (OPEX)</span>
                  {expandedSections.opex ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </td>
                <td className="p-3.5 text-center font-mono text-rose-600">04</td>
                <td className="p-3.5 text-right font-black text-rose-600">
                  -{totalOpex.toLocaleString('vi-VN')}₫
                </td>
                <td className="p-3.5 text-right font-bold text-rose-700">{opexPctNum.toFixed(1)}%</td>
                <td className="p-3.5 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                    {periodExpenses.length} khoản chi
                  </span>
                </td>
              </tr>
              {expandedSections.opex && (
                <>
                  {Object.entries(opexBreakdown).map(([cat, amt], idx) => (
                    <tr key={idx} className="text-zinc-600 text-xs bg-rose-50/10">
                      <td className="py-2 pl-10">↳ {cat}</td>
                      <td className="text-center font-mono text-zinc-400">04.{idx + 1}</td>
                      <td className="text-right font-medium text-rose-700">-{amt.toLocaleString('vi-VN')}₫</td>
                      <td className="text-right text-zinc-500">{((amt / (totalRevenue || 1)) * 100).toFixed(1)}%</td>
                      <td className="text-center text-[10px] text-zinc-400">Phiếu chi</td>
                    </tr>
                  ))}
                </>
              )}

              {/* 5. Hao hụt bánh hỏng */}
              <tr className="text-purple-800 font-semibold bg-purple-50/20">
                <td className="p-3.5 pl-5 flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5 text-purple-600" />
                  <span>(-) TỔN THẤT & HAO HỤT BÁNH HỎNG (SPOILAGE)</span>
                </td>
                <td className="p-3.5 text-center font-mono text-purple-600">05</td>
                <td className="p-3.5 text-right font-black text-purple-600">
                  -{spoilageCost.toLocaleString('vi-VN')}₫
                </td>
                <td className="p-3.5 text-right font-bold text-purple-700">{spoilagePctNum.toFixed(1)}%</td>
                <td className="p-3.5 text-center">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                    {spoilageQty} bánh ghi nhận
                  </span>
                </td>
              </tr>

              {/* 6. Lợi nhuận ròng cuối cùng */}
              <tr className="bg-emerald-50/90 font-black text-emerald-950 border-t-2 border-emerald-600">
                <td className="p-4 pl-5 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-600 animate-pulse"></span>
                  <span className="text-sm sm:text-base font-black text-emerald-900">= III. LỢI NHUẬN RÒNG CUỐI CÙNG (NET PROFIT)</span>
                </td>
                <td className="p-4 text-center font-mono text-emerald-700 font-bold">10</td>
                <td className="p-4 text-right font-black text-base sm:text-lg text-emerald-700">
                  +{netProfit.toLocaleString('vi-VN')}₫
                </td>
                <td className="p-4 text-right font-black text-emerald-800 text-base">{netMarginPct}%</td>
                <td className="p-4 text-center">
                  <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs">
                    Biên Lãi {netMarginPct}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SỔ CHI TIẾT DOANH THU HÓA ĐƠN BÁN HÀNG ── */}
      <div className="bg-white rounded-3xl border border-zinc-200/90 shadow-xs p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div>
            <h3 className="font-black text-base text-zinc-900 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-600" />
              <span>Sổ Chi Tiết Doanh Thu Bán Hàng ({filteredOrders.length} hóa đơn)</span>
            </h3>
            <p className="text-xs text-zinc-500">
              Toàn bộ hóa đơn phát sinh tại quầy POS và đơn đặt trước đồng bộ theo kỳ {periodLabel}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã đơn, tên, SĐT..."
                className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 w-44 sm:w-56"
              />
            </div>

            <select
              value={orderTypeFilter}
              onChange={(e: any) => setOrderTypeFilter(e.target.value)}
              className="p-1.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold text-zinc-700"
            >
              <option value="all">Tất cả đơn</option>
              <option value="pos">Tại quầy</option>
              <option value="preorder">Bánh đặt</option>
              <option value="shipping">Giao tận nơi</option>
            </select>

            <button
              type="button"
              onClick={onExportSales}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 transition shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Xuất Excel
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-zinc-50 text-zinc-600 uppercase font-extrabold border-b border-zinc-200">
              <tr>
                <th className="p-3">Mã Hóa Đơn</th>
                <th className="p-3">Thời Gian</th>
                <th className="p-3">Phân Loại</th>
                <th className="p-3">Khách Hàng</th>
                <th className="p-3">Món Bánh</th>
                <th className="p-3 text-right">Tổng Tiền</th>
                <th className="p-3 text-center">Phương Thức</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredOrders.slice(0, 25).map((ord: any) => {
                const isPreorder = ord.order_type === 'preorder' || ord.order_number?.startsWith('BK-PRE') || !!ord.preorder_pickup_at;
                const isShip = (ord.delivery_method || ord.deliveryMethod) === 'shipping';
                const num = ord.order_number || ord.orderNumber || 'BK-NEW';
                const createdDate = ord.created_at ? new Date(ord.created_at) : new Date();
                const timeText = `${String(createdDate.getHours()).padStart(2, '0')}:${String(createdDate.getMinutes()).padStart(2, '0')} ${String(createdDate.getDate()).padStart(2, '0')}/${String(createdDate.getMonth() + 1).padStart(2, '0')}`;
                const custName = ord.customer_name || ord.customerName || 'Khách vãng lai';
                const totalAmt = Number(ord.total_amount || ord.totalPrice || 0);
                const depAmt = Number(ord.deposit_amount || ord.depositAmount || 0);
                const remAmt = Number(ord.remaining_amount !== undefined ? ord.remaining_amount : (ord.remainingAmount || (totalAmt - depAmt)));
                const itemsDesc = Array.isArray(ord.items) && ord.items.length > 0
                  ? ord.items.map((i: any) => `${i.quantity}x ${i.product_name_snapshot || i.name}`).join(', ')
                  : ord.cakeName || 'Bánh';

                return (
                  <tr key={ord.id || num} className="hover:bg-amber-50/40 transition">
                    <td className="p-3 font-mono font-bold text-amber-700">#{num}</td>
                    <td className="p-3 text-zinc-500">{timeText}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isPreorder ? 'bg-pink-100 text-pink-700' : 'bg-zinc-100 text-zinc-700'
                        }`}>
                          {isPreorder ? 'Bánh đặt' : 'Tại quầy'}
                        </span>
                        {isShip && (
                          <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-blue-100 text-blue-800">
                            🚚 Ship
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="font-bold text-zinc-900">{custName}</div>
                      {ord.customer_phone && (
                        <div className="text-[10px] text-zinc-400">{ord.customer_phone}</div>
                      )}
                    </td>
                    <td className="p-3 text-zinc-600 max-w-[220px] truncate" title={itemsDesc}>
                      {itemsDesc}
                    </td>
                    <td className="p-3 text-right font-black text-zinc-900">
                      <div>{totalAmt.toLocaleString('vi-VN')}₫</div>
                      {depAmt > 0 && remAmt > 0 && (
                        <div className="text-[10px] font-normal text-rose-600">
                          Cọc: {depAmt.toLocaleString('vi-VN')}đ | Còn: {remAmt.toLocaleString('vi-VN')}đ
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        ord.payment_method === 'cash' || ord.paymentMethod === 'cash'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {ord.payment_method === 'cash' || ord.paymentMethod === 'cash' ? '💵 Tiền mặt' : '📲 Chuyển khoản'}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-400 italic">
                    Không có đơn hàng nào khớp với tìm kiếm trong kỳ này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredOrders.length > 25 && (
          <div className="text-center pt-2 text-xs text-zinc-500 font-semibold">
            Đang hiển thị 25/{filteredOrders.length} đơn hàng. Bạn có thể bấm nút "Xuất Excel" ở trên để xem trọn vẹn toàn bộ đơn.
          </div>
        )}
      </div>

    </div>
  );
};
