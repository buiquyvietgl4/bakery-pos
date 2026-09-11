'use client';

import React, { useState, useMemo } from 'react';
import { 
  DollarSign, ArrowUpRight, ArrowDownRight, QrCode, Wallet, 
  Search, Plus, Download, FileSpreadsheet, CheckCircle2, 
  Calendar, RefreshCw, Filter, Banknote, Building2, AlertCircle
} from 'lucide-react';

export interface DualCashflowLedgerProps {
  orders: any[];
  expenses: any[];
  cashflow: any[];
  onAddCashflowTransaction?: (tx: any) => void;
  onExportCashflow: () => void;
  periodLabel: string;
  startDateMs: number;
  endDateMs: number;
}

export const DualCashflowLedger: React.FC<DualCashflowLedgerProps> = ({
  orders,
  expenses,
  cashflow,
  onAddCashflowTransaction,
  onExportCashflow,
  periodLabel,
  startDateMs,
  endDateMs,
}) => {
  const [filterSource, setFilterSource] = useState<'all' | 'cash' | 'bank'>('all');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal Thêm Phiếu Thu / Chi Quỹ
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [txSource, setTxSource] = useState<'cash' | 'bank'>('cash');
  const [txCategory, setTxCategory] = useState('Chi hoạt động');
  const [txAmount, setTxAmount] = useState<number>(0);
  const [txDesc, setTxDesc] = useState('');

  // 1. Tính toán Dòng tiền Tiền Mặt
  // Thu tiền mặt: Từ hóa đơn bán hàng payment_method === 'cash'
  const cashSalesIncome = useMemo(() => {
    return orders
      .filter((o) => {
        const isCash = o.payment_method === 'cash' || o.paymentMethod === 'cash';
        if (!isCash) return false;
        const timeStr = o.created_at || o.createdAt || '';
        if (!timeStr) return true;
        const t = new Date(timeStr).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((acc, o) => acc + Number(o.total_amount || o.totalPrice || 0), 0);
  }, [orders, startDateMs, endDateMs]);

  // Chi tiền mặt từ expenses hoặc cashflow
  const cashExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        const isCash = !e.payment_source || e.payment_source === 'cash';
        if (!isCash) return false;
        if (!e.date) return true;
        const t = new Date(e.date).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);
  }, [expenses, startDateMs, endDateMs]);

  const cashBalance = 15000000 + cashSalesIncome - cashExpenses; // 15 triệu tồn quỹ đầu kỳ

  // 2. Tính toán Dòng tiền Ngân Hàng VietQR
  const bankSalesIncome = useMemo(() => {
    return orders
      .filter((o) => {
        const isBank = o.payment_method !== 'cash' && o.paymentMethod !== 'cash';
        if (!isBank) return false;
        const timeStr = o.created_at || o.createdAt || '';
        if (!timeStr) return true;
        const t = new Date(timeStr).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((acc, o) => acc + Number(o.total_amount || o.totalPrice || 0), 0);
  }, [orders, startDateMs, endDateMs]);

  const bankExpenses = useMemo(() => {
    return expenses
      .filter((e) => {
        const isBank = e.payment_source === 'bank';
        if (!isBank) return false;
        if (!e.date) return true;
        const t = new Date(e.date).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((acc, e) => acc + Number(e.amount || 0), 0);
  }, [expenses, startDateMs, endDateMs]);

  const bankBalance = 48500000 + bankSalesIncome - bankExpenses; // 48.5 triệu tồn tài khoản đầu kỳ

  // Tổng tài sản thanh khoản
  const totalLiquidity = cashBalance + bankBalance;

  // 3. Tổng hợp danh sách giao dịch dòng tiền đầy đủ
  const allTransactions = useMemo(() => {
    const list: any[] = [];

    // Hóa đơn POS (Thu tiền)
    orders.forEach((o) => {
      const isCash = o.payment_method === 'cash' || o.paymentMethod === 'cash';
      const amt = Number(o.total_amount || o.totalPrice || 0);
      if (amt <= 0) return;
      const num = o.order_number || o.orderNumber || 'BK';
      list.push({
        id: 'ord-' + (o.id || num),
        date: o.created_at || o.createdAt || new Date().toISOString(),
        type: 'income' as const,
        source: isCash ? 'cash' : 'bank',
        category: 'Doanh thu bán bánh',
        desc: `Thu tiền đơn hàng #${num} (${o.customer_name || 'Khách lẻ'})`,
        amount: amt,
      });
    });

    // Chi phí OPEX (Chi tiền)
    expenses.forEach((e) => {
      const amt = Number(e.amount || 0);
      if (amt <= 0) return;
      list.push({
        id: 'exp-' + (e.id || Math.random()),
        date: e.date ? `${e.date}T12:00:00` : new Date().toISOString(),
        type: 'expense' as const,
        source: e.payment_source || 'cash',
        category: e.category || 'Chi phí vận hành',
        desc: e.description || e.category || 'Chi hoạt động tiệm bánh',
        amount: amt,
      });
    });

    // Các phiếu khác từ cashflow state
    cashflow.forEach((c) => {
      if (c.id?.startsWith('ord-') || c.id?.startsWith('exp-')) return;
      list.push({
        id: c.id || 'cf-' + Math.random(),
        date: c.date ? `${c.date}T10:00:00` : new Date().toISOString(),
        type: c.type || 'expense',
        source: c.source || 'cash',
        category: c.category || 'Thu chi khác',
        desc: c.desc || 'Nghiệp vụ quỹ',
        amount: Number(c.amount || 0),
      });
    });

    // Sắp xếp thời gian mới nhất lên đầu
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders, expenses, cashflow]);

  // Lọc theo bộ lọc người dùng
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      // Lọc kỳ
      const t = new Date(tx.date).getTime();
      if (!isNaN(t) && (t < startDateMs || t > endDateMs)) {
        return false;
      }

      if (filterSource !== 'all' && tx.source !== filterSource) return false;
      if (filterType !== 'all' && tx.type !== filterType) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const desc = (tx.desc || '').toLowerCase();
        const cat = (tx.category || '').toLowerCase();
        if (!desc.includes(q) && !cat.includes(q)) return false;
      }

      return true;
    });
  }, [allTransactions, startDateMs, endDateMs, filterSource, filterType, searchTerm]);

  // Xử lý tạo phiếu thu/chi mới
  const handleCreateTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (txAmount <= 0) return;

    const newTx = {
      id: 'tx-' + Date.now(),
      type: txType,
      source: txSource,
      category: txCategory,
      amount: txAmount,
      desc: txDesc || `${txType === 'income' ? 'Thu' : 'Chi'} ${txCategory}`,
      date: new Date().toISOString().split('T')[0],
    };

    if (onAddCashflowTransaction) {
      onAddCashflowTransaction(newTx);
    }

    setIsModalOpen(false);
    setTxAmount(0);
    setTxDesc('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* ── 2 HỘP QUỸ KÉP NỔI BẬT: TIỀN MẶT VS NGÂN HÀNG VIETQR ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Box 1: Quỹ Tiền Mặt Tại Két Quầy */}
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/90 shadow-xs hover:border-amber-400 transition space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-zinc-500 uppercase">Quỹ Tiền Mặt Tại Két</span>
                <h3 className="text-sm font-black text-zinc-900">Két Quầy Thu Ngân</h3>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              Tiền mặt
            </span>
          </div>

          <div className="text-2xl font-black text-zinc-900">
            {cashBalance.toLocaleString('vi-VN')}₫
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-100">
            <div className="text-emerald-600">
              <span className="text-[10px] text-zinc-400 block">Thu tiền mặt:</span>
              <b>+{cashSalesIncome.toLocaleString('vi-VN')}₫</b>
            </div>
            <div className="text-rose-600 text-right">
              <span className="text-[10px] text-zinc-400 block">Chi tiền mặt:</span>
              <b>-{cashExpenses.toLocaleString('vi-VN')}₫</b>
            </div>
          </div>
        </div>

        {/* Box 2: Tài Khoản Ngân Hàng VietQR */}
        <div className="bg-white rounded-3xl p-5 border border-zinc-200/90 shadow-xs hover:border-blue-400 transition space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-zinc-500 uppercase">Tài Khoản Ngân Hàng</span>
                <h3 className="text-sm font-black text-zinc-900">VietQR Napas 24/7</h3>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
              Chuyển khoản
            </span>
          </div>

          <div className="text-2xl font-black text-blue-600">
            {bankBalance.toLocaleString('vi-VN')}₫
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-100">
            <div className="text-emerald-600">
              <span className="text-[10px] text-zinc-400 block">Khách chuyển khoản:</span>
              <b>+{bankSalesIncome.toLocaleString('vi-VN')}₫</b>
            </div>
            <div className="text-rose-600 text-right">
              <span className="text-[10px] text-zinc-400 block">Chi chuyển khoản:</span>
              <b>-{bankExpenses.toLocaleString('vi-VN')}₫</b>
            </div>
          </div>
        </div>

        {/* Box 3: Tổng Tài Sản Thanh Khoản (Tiền Mặt + Ngân Hàng) */}
        <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white rounded-3xl p-5 shadow-lg shadow-emerald-700/20 space-y-3">
          <div className="flex items-center justify-between text-emerald-100">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider">Tổng Dòng Tiền Khả Dụng</span>
            </div>
            <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">
              THANH KHOẢN
            </span>
          </div>

          <div className="text-2xl sm:text-3xl font-black text-white">
            {totalLiquidity.toLocaleString('vi-VN')}₫
          </div>

          <p className="text-xs text-emerald-100/90 pt-1 border-t border-emerald-500/50">
            Tổng số dư thực tế trong két quầy và tài khoản ngân hàng sẵn sàng chi trả.
          </p>
        </div>
      </div>

      {/* ── BẢNG NHẬT KÝ DÒNG TIỀN THU CHI REALTIME ── */}
      <div className="bg-white rounded-3xl border border-zinc-200/90 shadow-xs p-5 sm:p-6 space-y-4">
        
        {/* Header Sổ Quỹ & Bộ Lọc */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
          <div>
            <h3 className="font-black text-base text-zinc-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-600" />
              <span>Sổ Quỹ Thu Chi Chi Tiết ({filteredTransactions.length} giao dịch)</span>
            </h3>
            <p className="text-xs text-zinc-500">
              Nhật ký dòng tiền Vào / Ra đối soát theo kỳ {periodLabel}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setTxType('income');
                setIsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Tạo Phiếu Thu
            </button>

            <button
              type="button"
              onClick={() => {
                setTxType('expense');
                setIsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Tạo Phiếu Chi
            </button>

            <button
              type="button"
              onClick={onExportCashflow}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Xuất Excel Sổ Quỹ
            </button>
          </div>
        </div>

        {/* Thanh công cụ lọc */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 bg-zinc-50 p-2.5 rounded-2xl border border-zinc-200/80 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Lọc Nguồn Quỹ */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setFilterSource('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filterSource === 'all' ? 'bg-zinc-900 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Tất cả quỹ
              </button>
              <button
                type="button"
                onClick={() => setFilterSource('cash')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  filterSource === 'cash' ? 'bg-amber-600 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" /> Két Tiền Mặt
              </button>
              <button
                type="button"
                onClick={() => setFilterSource('bank')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  filterSource === 'bank' ? 'bg-blue-600 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" /> Ngân Hàng VietQR
              </button>
            </div>

            {/* Lọc Thu / Chi */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition ${
                  filterType === 'all' ? 'bg-zinc-900 text-white shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Thu & Chi
              </button>
              <button
                type="button"
                onClick={() => setFilterType('income')}
                className={`px-2.5 py-1 rounded-lg font-bold transition text-emerald-700 ${
                  filterType === 'income' ? 'bg-emerald-600 text-white shadow-2xs' : 'hover:bg-emerald-50'
                }`}
              >
                + Chỉ Tiền Thu
              </button>
              <button
                type="button"
                onClick={() => setFilterType('expense')}
                className={`px-2.5 py-1 rounded-lg font-bold transition text-rose-700 ${
                  filterType === 'expense' ? 'bg-rose-600 text-white shadow-2xs' : 'hover:bg-rose-50'
                }`}
              >
                - Chỉ Tiền Chi
              </button>
            </div>
          </div>

          {/* Ô tìm kiếm */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm nghiệp vụ, diễn giải..."
              className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 w-52"
            />
          </div>
        </div>

        {/* Bảng giao dịch */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-zinc-50 text-zinc-600 uppercase font-extrabold border-b border-zinc-200">
              <tr>
                <th className="p-3">Thời Gian</th>
                <th className="p-3">Nguồn Quỹ</th>
                <th className="p-3">Hạng Mục</th>
                <th className="p-3">Diễn Giải Nghiệp Vụ</th>
                <th className="p-3 text-center">Phân Loại</th>
                <th className="p-3 text-right">Số Tiền (VNĐ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredTransactions.slice(0, 30).map((tx) => {
                const isIncome = tx.type === 'income';
                const isCash = tx.source === 'cash';
                const d = new Date(tx.date);
                const dStr = isNaN(d.getTime()) 
                  ? tx.date 
                  : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

                return (
                  <tr key={tx.id} className="hover:bg-zinc-50/80 transition">
                    <td className="p-3 text-zinc-500 font-mono">{dStr}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 w-fit ${
                        isCash ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {isCash ? <Banknote className="w-3 h-3" /> : <QrCode className="w-3 h-3" />}
                        {isCash ? 'Két tiền mặt' : 'VietQR Ngân hàng'}
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-zinc-800">{tx.category}</td>
                    <td className="p-3 text-zinc-600 max-w-[280px] truncate" title={tx.desc}>
                      {tx.desc}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                        isIncome ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {isIncome ? '▲ Tiền Vào' : '▼ Tiền Ra'}
                      </span>
                    </td>
                    <td className={`p-3 text-right font-black text-sm ${
                      isIncome ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {isIncome ? '+' : '-'}{Number(tx.amount || 0).toLocaleString('vi-VN')}₫
                    </td>
                  </tr>
                );
              })}

              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-400 italic">
                    Chưa có giao dịch dòng tiền nào khớp với bộ lọc trong kỳ này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length > 30 && (
          <div className="text-center pt-2 text-xs text-zinc-500">
            Hiển thị 30/{filteredTransactions.length} giao dịch. Hãy bấm &quot;Xuất Excel Sổ Quỹ&quot; để tải toàn bộ.
          </div>
        )}
      </div>

      {/* ── MODAL TẠO PHIẾU THU / CHI NHANH ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-zinc-200 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-black text-base text-zinc-900 flex items-center gap-2">
                {txType === 'income' ? (
                  <span className="text-emerald-600 flex items-center gap-1.5">
                    <ArrowUpRight className="w-5 h-5" /> Lập Phiếu Thu Quỹ
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center gap-1.5">
                    <ArrowDownRight className="w-5 h-5" /> Lập Phiếu Chi Quỹ
                  </span>
                )}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1 rounded-xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTx} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-zinc-700 block mb-1">Nguồn quỹ hạch toán:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxSource('cash')}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition ${
                      txSource === 'cash'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <Banknote className="w-4 h-4" /> Két Tiền Mặt
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxSource('bank')}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition ${
                      txSource === 'bank'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <QrCode className="w-4 h-4" /> Ngân Hàng VietQR
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Hạng mục nghiệp vụ:</label>
                <select
                  value={txCategory}
                  onChange={(e) => setTxCategory(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-semibold text-zinc-800"
                >
                  {txType === 'income' ? (
                    <>
                      <option value="Thu nợ khách hàng">Thu nợ / Thu cọc bổ sung</option>
                      <option value="Nộp tiền mặt vào két">Chủ tiệm nộp thêm vốn tiền mặt</option>
                      <option value="Thu thanh lý bao bì & vỏ hộp">Thanh lý tài sản / bao bì</option>
                      <option value="Thu nhập khác">Thu nhập khác</option>
                    </>
                  ) : (
                    <>
                      <option value="Chi mua nguyên phụ liệu lẻ">Chi mua bột bơ sữa khẩn cấp</option>
                      <option value="Chi tiền mặt bằng">Chi tiền mặt bằng</option>
                      <option value="Chi tiền điện nước gas">Chi tiền điện, nước, gas</option>
                      <option value="Chi tạm ứng lương">Tạm ứng lương nhân viên</option>
                      <option value="Chi sửa chữa bảo dưỡng">Bảo dưỡng máy móc lò nướng</option>
                      <option value="Chi phí khác">Chi phí khác</option>
                    </>
                  )}
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Số tiền (VNĐ):</label>
                <input
                  type="number"
                  required
                  min="1000"
                  step="1000"
                  value={txAmount || ''}
                  onChange={(e) => setTxAmount(Number(e.target.value))}
                  placeholder="Ví dụ: 500,000"
                  className="w-full p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-sm text-zinc-900 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-700 block mb-1">Diễn giải chi tiết:</label>
                <input
                  type="text"
                  required
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder="Ví dụ: Mua thêm 5 hộp kem tươi Anchor tại siêu thị..."
                  className="w-full p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  className={`flex-1 py-3 rounded-xl font-bold text-white shadow-md transition ${
                    txType === 'income'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                      : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                  }`}
                >
                  Xác Nhận Lưu Phiếu
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold transition"
                >
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
