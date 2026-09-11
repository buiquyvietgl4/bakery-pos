'use client';

import React, { useState, useMemo } from 'react';
import { 
  FileText, Plus, Trash2, Tag, Calendar, Banknote, 
  QrCode, Search, PieChart, TrendingDown, CheckCircle2, AlertCircle
} from 'lucide-react';

export interface OpexManagerProps {
  expenses: any[];
  onAddExpense: (expense: { category: string; amount: number; description: string; date: string; payment_source?: string }) => void;
  onDeleteExpense?: (id: string) => void;
  periodLabel: string;
  startDateMs: number;
  endDateMs: number;
}

const OPEX_CATEGORIES = [
  { label: 'Tiền mặt bằng (Cố định)', value: 'Tiền mặt bằng', icon: '🏢' },
  { label: 'Tiền điện & Nước (Biến đổi)', value: 'Tiền điện & Nước', icon: '⚡' },
  { label: 'Tiền Gas bếp bánh (Biến đổi)', value: 'Tiền Gas', icon: '🔥' },
  { label: 'Lương nhân viên (Cố định)', value: 'Lương nhân viên', icon: '👨‍🍳' },
  { label: 'Khấu hao thiết bị máy móc', value: 'Khấu hao thiết bị', icon: '⚙️' },
  { label: 'Quảng cáo & Marketing', value: 'Quảng cáo & Marketing', icon: '📢' },
  { label: 'Bao bì & Phụ kiện đóng gói', value: 'Bao bì & Phụ kiện', icon: '📦' },
  { label: 'Sửa chữa & Bảo dưỡng', value: 'Sửa chữa & Bảo dưỡng', icon: '🔧' },
  { label: 'Chi phí khác', value: 'Chi phí khác', icon: '📝' },
];

export const OpexManager: React.FC<OpexManagerProps> = ({
  expenses,
  onAddExpense,
  onDeleteExpense,
  periodLabel,
  startDateMs,
  endDateMs,
}) => {
  const [newCategory, setNewCategory] = useState(OPEX_CATEGORIES[0].value);
  const [newAmount, setNewAmount] = useState<number>(0);
  const [newDesc, setNewDesc] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentSource, setPaymentSource] = useState<'cash' | 'bank'>('cash');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('all');

  // Lọc chi phí theo kỳ
  const periodExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (!e.date) return true;
      const t = new Date(e.date).getTime();
      return isNaN(t) || (t >= startDateMs && t <= endDateMs);
    });
  }, [expenses, startDateMs, endDateMs]);

  const totalPeriodOpex = useMemo(() => {
    return periodExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [periodExpenses]);

  // Phân rã theo nhóm
  const categoryStats = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    periodExpenses.forEach((e) => {
      const cat = e.category || 'Chi phí khác';
      if (!map[cat]) map[cat] = { total: 0, count: 0 };
      map[cat].total += Number(e.amount || 0);
      map[cat].count += 1;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [periodExpenses]);

  // Lọc theo tìm kiếm
  const filteredExpenses = useMemo(() => {
    return periodExpenses.filter((e) => {
      if (filterCat !== 'all' && e.category !== filterCat) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const cat = (e.category || '').toLowerCase();
        return desc.includes(q) || cat.includes(q);
      }
      return true;
    });
  }, [periodExpenses, filterCat, searchTerm]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAmount <= 0) return;

    onAddExpense({
      category: newCategory,
      amount: newAmount,
      description: newDesc || newCategory,
      date: newDate,
      payment_source: paymentSource,
    });

    setNewAmount(0);
    setNewDesc('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* ── BỐ CỤC 2 CỘT: FORM GHI NHẬN & DANH SÁCH CHI PHÍ ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Cột trái: Form Nhập Phiếu Chi Mới */}
        <div className="bg-white rounded-3xl border border-zinc-200/90 p-5 sm:p-6 shadow-xs space-y-4 h-fit">
          <div className="pb-3 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
                <Plus className="w-4 h-4" />
              </div>
              <h2 className="font-black text-base text-zinc-900">Ghi Nhận Chi Phí Mới</h2>
            </div>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
              Trừ vào P&L
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {/* Chọn nhóm chi */}
            <div>
              <label className="font-bold text-zinc-700 block mb-1">Khoản mục chi phí:</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              >
                {OPEX_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.icon} {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Số tiền */}
            <div>
              <label className="font-bold text-zinc-700 block mb-1">Số tiền chi (VNĐ):</label>
              <input
                type="number"
                required
                min="1000"
                step="1000"
                value={newAmount || ''}
                onChange={(e) => setNewAmount(Number(e.target.value))}
                placeholder="Ví dụ: 2,500,000"
                className="w-full p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-rose-600 text-base focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
            </div>

            {/* Nguồn quỹ chi trả */}
            <div>
              <label className="font-bold text-zinc-700 block mb-1">Nguồn tiền chi trả:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentSource('cash')}
                  className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition ${
                    paymentSource === 'cash'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Banknote className="w-3.5 h-3.5" /> Tiền mặt két
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSource('bank')}
                  className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition ${
                    paymentSource === 'bank'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" /> Chuyển khoản
                </button>
              </div>
            </div>

            {/* Ngày chi */}
            <div>
              <label className="font-bold text-zinc-700 block mb-1">Ngày chứng từ / hóa đơn:</label>
              <input
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-semibold text-zinc-800"
              />
            </div>

            {/* Diễn giải */}
            <div>
              <label className="font-bold text-zinc-700 block mb-1">Diễn giải nội dung chi:</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Ví dụ: Đổi bình gas công nghiệp, tiền điện tháng này..."
                className="w-full p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-800"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" /> Lưu Phiếu Chi & Trừ Vào P&L
            </button>
          </form>
        </div>

        {/* Cột phải: Danh sách chi phí & Thống kê */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Thống kê nhóm chi nổi bật */}
          <div className="bg-white rounded-3xl border border-zinc-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-rose-600" />
                <span>Phân Bổ Chi Phí Vận Hành ({periodLabel})</span>
              </h3>
              <span className="font-black text-rose-600 text-sm">
                Tổng cộng: -{totalPeriodOpex.toLocaleString('vi-VN')}₫
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              {categoryStats.map(([cat, stat], idx) => {
                const pct = totalPeriodOpex > 0 ? ((stat.total / totalPeriodOpex) * 100).toFixed(1) : 0;
                return (
                  <div key={idx} className="bg-zinc-50 p-2.5 rounded-2xl border border-zinc-200/80 space-y-1">
                    <div className="text-zinc-600 truncate font-bold text-[11px]">{cat}</div>
                    <div className="font-black text-zinc-900 text-xs sm:text-sm">
                      -{stat.total.toLocaleString('vi-VN')}₫
                    </div>
                    <div className="text-[10px] text-zinc-400 flex justify-between">
                      <span>{stat.count} khoản</span>
                      <span className="font-bold text-rose-600">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bảng kê chi tiết chứng từ */}
          <div className="bg-white rounded-3xl border border-zinc-200/90 p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-zinc-100">
              <div>
                <h3 className="font-black text-sm text-zinc-900">
                  Danh Sách Phiếu Chi ({filteredExpenses.length} khoản chi)
                </h3>
                <p className="text-[11px] text-zinc-500">Các khoản chi đã trừ vào Báo cáo lãi lỗ P&L kỳ này</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm kiếm phiếu chi..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs w-44"
                  />
                </div>

                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                  className="p-1.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold"
                >
                  <option value="all">Tất cả mục</option>
                  {OPEX_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.value}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-zinc-50 text-zinc-600 uppercase font-extrabold border-b border-zinc-200">
                  <tr>
                    <th className="p-2.5">Ngày</th>
                    <th className="p-2.5">Khoản Mục</th>
                    <th className="p-2.5">Nội Dung Chi</th>
                    <th className="p-2.5 text-center">Nguồn Chi</th>
                    <th className="p-2.5 text-right">Số Tiền</th>
                    {onDeleteExpense && <th className="p-2.5 text-center w-12">Xóa</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredExpenses.map((exp: any) => {
                    const isCash = !exp.payment_source || exp.payment_source === 'cash';
                    return (
                      <tr key={exp.id} className="hover:bg-zinc-50 transition">
                        <td className="p-2.5 text-zinc-500 font-mono">{exp.date}</td>
                        <td className="p-2.5 font-bold text-zinc-800">{exp.category}</td>
                        <td className="p-2.5 text-zinc-600 max-w-[220px] truncate" title={exp.description}>
                          {exp.description}
                        </td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isCash ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
                          }`}>
                            {isCash ? 'Tiền mặt' : 'Chuyển khoản'}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-black text-rose-600">
                          -{Number(exp.amount || 0).toLocaleString('vi-VN')}₫
                        </td>
                        {onDeleteExpense && (
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                if (window.confirm(`Xóa khoản chi: "${exp.description || exp.category}"?`)) {
                                  onDeleteExpense(exp.id);
                                }
                              }}
                              className="text-zinc-400 hover:text-rose-600 p-1 rounded transition cursor-pointer"
                              title="Xóa phiếu chi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {filteredExpenses.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-zinc-400 italic">
                        Chưa có phiếu chi nào trong kỳ này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
