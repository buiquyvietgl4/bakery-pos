'use client';

import React, { useState, useMemo } from 'react';
import { 
  DollarSign, ArrowUpRight, ArrowDownRight, QrCode, Wallet, 
  Search, Plus, Download, FileSpreadsheet, CheckCircle2, 
  Calendar, RefreshCw, Filter, Banknote, Building2, AlertCircle
} from 'lucide-react';
import { isOrderCash, getOrderPaymentMethod } from './AccountingOverview';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';
import { exportMultiSheetExcel, ExcelSheet } from '@/lib/utils/exportExcel';

export interface DualCashflowLedgerProps {
  orders: any[];
  expenses: any[];
  cashflow: any[];
  onAddCashflowTransaction?: (tx: any) => void;
  onExportCashflow?: () => void;
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

  // Hàm tính toán phân bổ Tiền mặt và Ngân hàng của từng đơn hàng
  const getOrderCashAndBank = (o: any) => {
    const total = Number(o.total_amount || o.totalPrice || 0);
    if (total <= 0) return { cash: 0, bank: 0 };
    const method = getOrderPaymentMethod(o);
    if (method === 'cash') return { cash: total, bank: 0 };
    if (method === 'transfer' || method === 'momo' || method === 'card') return { cash: 0, bank: total };
    if (method === 'split') {
      if (Array.isArray(o.payments) && o.payments.length > 0) {
        const cashAmt = o.payments
          .filter((p: any) => String(p.method).toLowerCase() === 'cash')
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
        const bankAmt = o.payments
          .filter((p: any) => String(p.method).toLowerCase() !== 'cash')
          .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
        return { cash: cashAmt, bank: bankAmt || Math.max(0, total - cashAmt) };
      }
      const c = Number(o.splitCashAmount || 0);
      const b = Number(o.splitTransferAmount || 0);
      if (c > 0 || b > 0) return { cash: c, bank: b || Math.max(0, total - c) };
      return { cash: Math.round(total / 2), bank: total - Math.round(total / 2) };
    }
    return { cash: total, bank: 0 };
  };

  // 1. Tính toán Dòng tiền Tiền Mặt
  // Thu tiền mặt: Từ hóa đơn bán hàng
  const cashSalesIncome = useMemo(() => {
    return orders
      .filter((o) => {
        const timeStr = o.created_at || o.createdAt || '';
        if (!timeStr) return true;
        const t = new Date(timeStr).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((acc, o) => acc + getOrderCashAndBank(o).cash, 0);
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

  const cashBalance = cashSalesIncome - cashExpenses;

  // 2. Tính toán Dòng tiền Ngân Hàng VietQR / Chuyển khoản
  const bankSalesIncome = useMemo(() => {
    return orders
      .filter((o) => {
        const timeStr = o.created_at || o.createdAt || '';
        if (!timeStr) return true;
        const t = new Date(timeStr).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((acc, o) => acc + getOrderCashAndBank(o).bank, 0);
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

  const bankBalance = bankSalesIncome - bankExpenses;

  // Tổng tài sản thanh khoản
  const totalLiquidity = cashBalance + bankBalance;

  // 3. Bổ sung giao dịch từ cashflow state vào thẻ thống kê
  const cfCashIncome = useMemo(() => {
    return cashflow
      .filter((c) => {
        if (c.id?.startsWith('ord-') || c.id?.startsWith('exp-')) return false;
        const isIncome = c.type === 'income' || c.type === 'in';
        const isCash = !c.method || c.method === 'cash' || c.source === 'cash';
        if (!isIncome || !isCash) return false;
        if (!c.date) return true;
        const t = new Date(c.date).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((s, c) => s + Number(c.amount || 0), 0);
  }, [cashflow, startDateMs, endDateMs]);

  const cfCashExpense = useMemo(() => {
    return cashflow
      .filter((c) => {
        if (c.id?.startsWith('ord-') || c.id?.startsWith('exp-')) return false;
        const isExpense = c.type === 'expense' || c.type === 'out';
        const isCash = !c.method || c.method === 'cash' || c.source === 'cash';
        if (!isExpense || !isCash) return false;
        if (!c.date) return true;
        const t = new Date(c.date).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((s, c) => s + Number(c.amount || 0), 0);
  }, [cashflow, startDateMs, endDateMs]);

  const cfBankIncome = useMemo(() => {
    return cashflow
      .filter((c) => {
        if (c.id?.startsWith('ord-') || c.id?.startsWith('exp-')) return false;
        const isIncome = c.type === 'income' || c.type === 'in';
        const isBank = c.method === 'bank' || c.source === 'bank';
        if (!isIncome || !isBank) return false;
        if (!c.date) return true;
        const t = new Date(c.date).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((s, c) => s + Number(c.amount || 0), 0);
  }, [cashflow, startDateMs, endDateMs]);

  const cfBankExpense = useMemo(() => {
    return cashflow
      .filter((c) => {
        if (c.id?.startsWith('ord-') || c.id?.startsWith('exp-')) return false;
        const isExpense = c.type === 'expense' || c.type === 'out';
        const isBank = c.method === 'bank' || c.source === 'bank';
        if (!isExpense || !isBank) return false;
        if (!c.date) return true;
        const t = new Date(c.date).getTime();
        return isNaN(t) || (t >= startDateMs && t <= endDateMs);
      })
      .reduce((s, c) => s + Number(c.amount || 0), 0);
  }, [cashflow, startDateMs, endDateMs]);

  // Tổng hợp bao gồm cả cashflow
  const totalCashIncome = cashSalesIncome + cfCashIncome;
  const totalCashExpenses = cashExpenses + cfCashExpense;
  const totalCashBalance = totalCashIncome - totalCashExpenses;

  const totalBankIncome = bankSalesIncome + cfBankIncome;
  const totalBankExpenses = bankExpenses + cfBankExpense;
  const totalBankBalance = totalBankIncome - totalBankExpenses;

  const totalLiquidityFull = totalCashBalance + totalBankBalance;

  // 4. Tổng hợp danh sách giao dịch dòng tiền đầy đủ
  const allTransactions = useMemo(() => {
    const list: any[] = [];

    // Hóa đơn POS (Thu tiền)
    orders.forEach((o) => {
      const amt = Number(o.total_amount || o.totalPrice || 0);
      if (amt <= 0) return;
      const num = o.order_number || o.orderNumber || 'BK';
      const date = o.created_at || o.createdAt || new Date().toISOString();
      const method = getOrderPaymentMethod(o);
      const { cash, bank } = getOrderCashAndBank(o);

      if (method === 'split') {
        if (cash > 0) {
          list.push({
            id: 'ord-' + (o.id || num) + '-cash',
            date,
            type: 'income' as const,
            source: 'cash',
            category: 'Doanh thu bán bánh (Tiền mặt)',
            desc: `Thu tiền mặt đơn hàng #${num} (${o.customer_name || 'Khách lẻ'})`,
            amount: cash,
          });
        }
        if (bank > 0) {
          list.push({
            id: 'ord-' + (o.id || num) + '-bank',
            date,
            type: 'income' as const,
            source: 'bank',
            category: 'Doanh thu bán bánh (VietQR/CK)',
            desc: `Thu VietQR/CK đơn hàng #${num} (${o.customer_name || 'Khách lẻ'})`,
            amount: bank,
          });
        }
      } else {
        const isCash = method === 'cash';
        list.push({
          id: 'ord-' + (o.id || num),
          date,
          type: 'income' as const,
          source: isCash ? 'cash' : 'bank',
          category: isCash 
            ? 'Doanh thu bán bánh (Tiền mặt)' 
            : (method === 'momo' ? 'Doanh thu bán bánh (Ví MoMo)' : 'Doanh thu bán bánh (VietQR/CK)'),
          desc: `Thu tiền đơn hàng #${num} (${o.customer_name || 'Khách lẻ'})`,
          amount: amt,
        });
      }
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

    // Các phiếu khác từ cashflow state (hoàn trả, đổi hàng, nạp/rút quỹ)
    cashflow.forEach((c) => {
      if (c.id?.startsWith('ord-') || c.id?.startsWith('exp-')) return;
      list.push({
        id: c.id || 'cf-' + Math.random(),
        date: c.date ? (String(c.date).includes('T') ? c.date : `${c.date}T10:00:00`) : new Date().toISOString(),
        type: c.type || 'expense',
        source: c.source || c.method || 'cash',
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

  const formatVND = (val: number) => (Number(val) || 0).toLocaleString('vi-VN') + '₫';

  // ── XUẤT SỔ QUỸ KÉP RA EXCEL (.XLSX) KHỚP 100% SỐ LIỆU ĐANG HIỂN THỊ ──
  const handleExportCashflow_Direct = () => {
    const safeLabel = (periodLabel || 'Ky_Ke_Toan').replace(/[/\\?%*:|"<> ()]/g, '_');
    const listToExport = filteredTransactions;

    const totalIncome = listToExport
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const totalExpense = listToExport
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    const sourceLabel =
      filterSource === 'cash' ? 'Quỹ Tiền Mặt' :
      filterSource === 'bank' ? 'Tài Khoản VietQR / Ngân Hàng' : 'Tất Cả Nguồn Quỹ';

    const typeLabel =
      filterType === 'income' ? 'Chỉ Phiếu Thu' :
      filterType === 'expense' ? 'Chỉ Phiếu Chi' : 'Tất Cả Thu & Chi';

    const sheetLedger: ExcelSheet = {
      name: 'So_Quy_Dong_Tien',
      title: 'SỔ QUỸ KÉP THEO DÕI DÒNG TIỀN (TIỀN MẶT & TÀI KHOẢN NGÂN HÀNG)',
      subtitles: [
        `Kỳ kế toán: ${periodLabel}`,
        `Bộ lọc áp dụng: ${sourceLabel} | ${typeLabel}${searchTerm ? ` | Tìm kiếm: "${searchTerm}"` : ''}`,
        `Số lượng giao dịch trong danh sách: ${listToExport.length} giao dịch`,
        `Tổng Thu vào: ${formatVND(totalIncome)} | Tổng Chi ra: ${formatVND(totalExpense)} | Dòng tiền ròng: ${formatVND(totalIncome - totalExpense)}`,
        `Tồn Quỹ Tiền Mặt: ${formatVND(totalCashBalance)} | Tồn Quỹ VietQR/Bank: ${formatVND(totalBankBalance)} | Tổng thanh khoản: ${formatVND(totalLiquidityFull)}`,
      ],
      columns: [
        { header: 'STT', key: 'stt', width: 50, type: 'number' },
        { header: 'Thời Gian', key: 'ngay', width: 140, type: 'string' },
        { header: 'Nguồn Quỹ', key: 'nguon_quy', width: 130, type: 'string' },
        { header: 'Phân Loại', key: 'loai_gd', width: 100, type: 'string' },
        { header: 'Hạng Mục', key: 'hang_muc', width: 180, type: 'string' },
        { header: 'Diễn Giải Chi Tiết', key: 'dien_giai', width: 280, type: 'string' },
        { header: 'Thu Vào (VNĐ)', key: 'thu_vao', width: 140, type: 'currency' },
        { header: 'Chi Ra (VNĐ)', key: 'chi_ra', width: 140, type: 'currency' },
      ],
      data: listToExport.map((t, idx) => ({
        stt: idx + 1,
        ngay: t.date ? new Date(t.date).toLocaleString('vi-VN') : '',
        nguon_quy: t.source === 'cash' ? 'Tiền mặt' : 'VietQR / Bank',
        loai_gd: t.type === 'income' ? 'Thu vào' : 'Chi ra',
        hang_muc: t.category || '',
        dien_giai: t.desc || '',
        thu_vao: t.type === 'income' ? Number(t.amount || 0) : 0,
        chi_ra: t.type === 'expense' ? Number(t.amount || 0) : 0,
      })),
    };

    exportMultiSheetExcel(`So_Quy_Dong_Tien_${safeLabel}_${Date.now()}`, [sheetLedger]);
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
            {(Number(totalCashBalance) || 0).toLocaleString('vi-VN')}₫
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-100">
            <div className="text-emerald-600">
              <span className="text-[10px] text-zinc-400 block">Thu tiền mặt:</span>
              <b>+{(Number(totalCashIncome) || 0).toLocaleString('vi-VN')}₫</b>
            </div>
            <div className="text-rose-600 text-right">
              <span className="text-[10px] text-zinc-400 block">Chi tiền mặt:</span>
              <b>-{(Number(totalCashExpenses) || 0).toLocaleString('vi-VN')}₫</b>
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
            {(Number(totalBankBalance) || 0).toLocaleString('vi-VN')}₫
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-zinc-100">
            <div className="text-emerald-600">
              <span className="text-[10px] text-zinc-400 block">Khách chuyển khoản:</span>
              <b>+{(Number(totalBankIncome) || 0).toLocaleString('vi-VN')}₫</b>
            </div>
            <div className="text-rose-600 text-right">
              <span className="text-[10px] text-zinc-400 block">Chi chuyển khoản:</span>
              <b>-{(Number(totalBankExpenses) || 0).toLocaleString('vi-VN')}₫</b>
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
            {(Number(totalLiquidityFull) || 0).toLocaleString('vi-VN')}₫
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
              onClick={handleExportCashflow_Direct}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-xs"
              title="Xuất sổ quỹ dòng tiền theo bộ lọc (Khớp 100% dữ liệu hiển thị)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Xuất Excel Sổ Quỹ
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
                  type="text"
                  inputMode="numeric"
                  required
                  value={formatCurrencyInput(txAmount)}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setTxAmount(parseCurrencyInput(e.target.value))}
                  placeholder="Ví dụ: 500.000"
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
