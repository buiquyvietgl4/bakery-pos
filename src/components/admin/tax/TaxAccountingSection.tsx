'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  FileSpreadsheet, Printer, Building2, Calendar, Filter,
  DollarSign, ShieldCheck, ChevronRight, CheckCircle2,
  TrendingUp, TrendingDown, Download, Eye, Edit3, Settings, AlertCircle,
  HelpCircle, Receipt, RefreshCw, FileText, ArrowUpRight, Search,
  Package, Wallet, Layers, Database, Sparkles, AlertTriangle, Check
} from 'lucide-react';
import {
  HouseholdBusinessInfo,
  TAX_BUSINESS_GROUPS,
  S2aRowItem,
  S2aSummaryByGroup,
  S2eRowItem,
  TaxDeclarationFormType,
  TaxRevenueThresholdAnalysis,
  TaxPolicyConfig,
  BkHdkdInventoryRow,
  BkHdkdExpenseSummary,
} from '@/lib/types/taxConfig';
import {
  getHouseholdBusinessInfo,
  saveHouseholdBusinessInfo,
  fetchHouseholdBusinessInfoFromDb,
  saveHouseholdBusinessInfoToDb,
  fetchTaxOrdersFromDb,
  generateS2aLedger,
  generateS2eLedger,
  analyzeTaxRevenueThreshold,
  TAX_CONFIG_UPDATED_EVENT,
  getTaxPolicyConfig,
  saveTaxPolicyConfig,
  fetchTaxPolicyConfigFromDb,
  saveTaxPolicyConfigToDb,
  triggerTaxAutoSyncToDb,
  generate012BkHdkdData,
  PRESET_TAX_POLICIES,
  TAX_POLICY_UPDATED_EVENT,
  TAX_AUTO_SYNC_EVENT,
} from '@/lib/utils/taxSync';
import {
  exportS2aExcel,
  exportFullTaxBooksExcel,
  export01TknCnkdExcel,
  export01CnkdExcel,
  export01CnkdXml,
  autoFillCqtExcelTemplate,
} from '@/lib/utils/exportTaxExcel';
import { TaxBookPrintView } from './TaxBookPrintView';

export interface TaxAccountingSectionProps {
  orders: any[];
  expenses: any[];
  ingredients: any[];
  cashflow: any[];
  adminName: string;
}

export const TaxAccountingSection: React.FC<TaxAccountingSectionProps> = ({
  orders,
  expenses,
  ingredients,
  cashflow,
  adminName,
}) => {
  // ── THÔNG TIN HỘ KINH DOANH & ĐỒNG BỘ SQL TỰ ĐỘNG ──
  const [businessInfo, setBusinessInfo] = useState<HouseholdBusinessInfo>(() => getHouseholdBusinessInfo());
  const [isEditInfoModalOpen, setIsEditInfoModalOpen] = useState(false);
  const [tempInfo, setTempInfo] = useState<HouseholdBusinessInfo>(businessInfo);
  const [isSqlSaving, setIsSqlSaving] = useState(false);
  const [sqlNotice, setSqlNotice] = useState<string | null>(null);

  // Cấu hình chính sách thuế & Biểu mẫu CQT động
  const [taxPolicy, setTaxPolicy] = useState<TaxPolicyConfig>(() => getTaxPolicyConfig());
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  });

  // Tab con trong Tờ khai 01/CNKD: 'main' (Tờ khai chính) | 'appendix' (Phụ lục 01-2/BK-HĐKD)
  const [cnkdViewMode, setCnkdViewMode] = useState<'main' | 'appendix'>('main');

  // Trạng thái nạp file Excel CQT tự động điền
  const [excelUploadNotice, setExcelUploadNotice] = useState<string | null>(null);

  // Danh sách đơn hàng thực tế lấy trực tiếp từ CSDL SQL & POS
  const [liveOrders, setLiveOrders] = useState<any[]>(orders || []);
  const [isRefreshingSql, setIsRefreshingSql] = useState<boolean>(false);

  // Tự động đồng bộ liveOrders khi prop orders từ trang quản trị cập nhật
  useEffect(() => {
    if (Array.isArray(orders) && orders.length > 0) {
      setLiveOrders(orders);
    }
  }, [orders]);

  const loadLiveTaxData = async (showToast = false) => {
    setIsRefreshingSql(true);
    try {
      const [dbInfo, dbOrders, dbPolicy] = await Promise.all([
        fetchHouseholdBusinessInfoFromDb(showToast),
        fetchTaxOrdersFromDb(showToast),
        fetchTaxPolicyConfigFromDb(showToast),
      ]);
      if (dbInfo) {
        setBusinessInfo(dbInfo);
        setTempInfo(dbInfo);
      }
      if (dbPolicy) {
        setTaxPolicy(dbPolicy);
      }
      if (Array.isArray(dbOrders) && dbOrders.length > 0) {
        setLiveOrders(dbOrders);
      }
      const nowStr = new Date().toLocaleTimeString('vi-VN');
      setLastSyncTime(nowStr);
      if (showToast) {
        setSqlNotice(`Đã tự động làm mới và đồng bộ dữ liệu SQL thành công (${nowStr})`);
        setTimeout(() => setSqlNotice(null), 4000);
      }
    } catch (e) {
      console.warn('Lỗi loadLiveTaxData:', e);
    } finally {
      setIsRefreshingSql(false);
    }
  };

  useEffect(() => {
    loadLiveTaxData(false);

    let orderDebounceTimer: any = null;
    const handleOrdersUpdate = () => {
      if (orderDebounceTimer) clearTimeout(orderDebounceTimer);
      orderDebounceTimer = setTimeout(() => {
        fetchTaxOrdersFromDb(false).then((dbOrders) => {
          if (Array.isArray(dbOrders) && dbOrders.length > 0) {
            setLiveOrders(dbOrders);
            const nowStr = new Date().toLocaleTimeString('vi-VN');
            setLastSyncTime(nowStr);
          }
        }).catch(() => {});
      }, 2000);
    };
    window.addEventListener('bakery_orders_updated', handleOrdersUpdate);

    const handleUpdate = (e: any) => {
      if (e.detail) {
        setBusinessInfo(e.detail);
        setTempInfo(e.detail);
      } else {
        const info = getHouseholdBusinessInfo();
        setBusinessInfo(info);
        setTempInfo(info);
      }
    };
    window.addEventListener(TAX_CONFIG_UPDATED_EVENT, handleUpdate);

    const handlePolicyUpdate = (e: any) => {
      if (e.detail) {
        setTaxPolicy(e.detail);
      }
    };
    window.addEventListener(TAX_POLICY_UPDATED_EVENT, handlePolicyUpdate);

    const handleAutoSync = (e: any) => {
      if (e.detail?.synced_at) {
        setLastSyncTime(e.detail.synced_at);
      }
    };
    window.addEventListener(TAX_AUTO_SYNC_EVENT, handleAutoSync);

    return () => {
      if (orderDebounceTimer) clearTimeout(orderDebounceTimer);
      window.removeEventListener(TAX_CONFIG_UPDATED_EVENT, handleUpdate);
      window.removeEventListener(TAX_POLICY_UPDATED_EVENT, handlePolicyUpdate);
      window.removeEventListener(TAX_AUTO_SYNC_EVENT, handleAutoSync);
      window.removeEventListener('bakery_orders_updated', handleOrdersUpdate);
    };
  }, []);

  // ── SUB-TABS TRONG PHÂN HỆ THUẾ ──
  const [activeBookTab, setActiveBookTab] = useState<
    'S2a' | 'S2c' | 'S2d' | 'S2e' | '01_CNKD' | 'other_books' | 'settings'
  >('S2a');

  // ── BỘ LỌC KỲ KẾ TOÁN THUẾ (NGÀY / THÁNG / QUÝ / NĂM) ──
  const [periodPreset, setPeriodPreset] = useState<'month' | 'quarter' | 'year' | 'today' | 'custom'>('month');
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());

  const todayStr = new Date().toISOString().split('T')[0];
  const firstDayOfMonthStr = `${todayStr.slice(0, 7)}-01`;
  const [customStart, setCustomStart] = useState<string>(firstDayOfMonthStr);
  const [customEnd, setCustomEnd] = useState<string>(todayStr);

  // Tìm kiếm giao dịch trong sổ
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTaxGroup, setFilterTaxGroup] = useState<number>(0); // 0 = tất cả

  // Modal xem mẫu in A4 chuẩn Bộ Tài chính
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [currentPrintBook, setCurrentPrintBook] = useState<
    'S1a-HKD' | 'S2a-HKD' | 'S2b-HKD' | 'S2c-HKD' | 'S2d-HKD' | 'S2e-HKD' | 'S3a-HKD' | '01/CNKD' | '01-2/BK-HĐKD' | '01/TKN-CNKD'
  >('S2a-HKD');

  // Phân tích ngưỡng doanh thu năm (Mặc định 1 tỷ theo NĐ 141/2026 hoặc lấy từ chính sách)
  const thresholdAnalysis = useMemo(() => {
    return analyzeTaxRevenueThreshold(liveOrders, selectedYear, taxPolicy.annual_threshold);
  }, [liveOrders, selectedYear, taxPolicy.annual_threshold]);

  // Lựa chọn mẫu tờ khai thuế: '01_TKN_CNKD' (≤ 1 Tỷ - Miễn thuế) hoặc '01_CNKD' (> 1 Tỷ - Kê khai thuế)
  const [selectedDeclarationForm, setSelectedDeclarationForm] = useState<'01_TKN_CNKD' | '01_CNKD'>('01_TKN_CNKD');

  // Tự động đồng bộ mẫu khuyến nghị khi dữ liệu doanh thu thay đổi
  useEffect(() => {
    if (thresholdAnalysis.recommended_form === '01/TKN-CNKD') {
      setSelectedDeclarationForm('01_TKN_CNKD');
    } else {
      setSelectedDeclarationForm('01_CNKD');
    }
  }, [thresholdAnalysis.recommended_form]);

  // ── TÍNH TOÁN KHOẢNG THỜI GIAN THEO KỲ BÁO CÁO ──
  const { startDateStr, endDateStr, periodLabel } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    if (periodPreset === 'today') {
      const dStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return {
        startDateStr: dStr,
        endDateStr: dStr,
        periodLabel: `Hôm nay (${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()})`,
      };
    } else if (periodPreset === 'quarter') {
      const startMonth = (selectedQuarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const lastDayOfEndMonth = new Date(selectedYear, endMonth, 0).getDate();
      const sDate = `${selectedYear}-${pad(startMonth)}-01`;
      const eDate = `${selectedYear}-${pad(endMonth)}-${pad(lastDayOfEndMonth)}`;
      return {
        startDateStr: sDate,
        endDateStr: eDate,
        periodLabel: `Quý ${selectedQuarter}/${selectedYear} (01/${pad(startMonth)} - ${pad(lastDayOfEndMonth)}/${pad(endMonth)}/${selectedYear})`,
      };
    } else if (periodPreset === 'year') {
      return {
        startDateStr: `${selectedYear}-01-01`,
        endDateStr: `${selectedYear}-12-31`,
        periodLabel: `Năm ${selectedYear} (01/01/${selectedYear} - 31/12/${selectedYear})`,
      };
    } else if (periodPreset === 'custom') {
      return {
        startDateStr: customStart,
        endDateStr: customEnd,
        periodLabel: `${customStart} đến ${customEnd}`,
      };
    } else {
      // month
      const currentMonth = pad(now.getMonth() + 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return {
        startDateStr: `${now.getFullYear()}-${currentMonth}-01`,
        endDateStr: `${now.getFullYear()}-${currentMonth}-${pad(lastDay)}`,
        periodLabel: `Tháng ${now.getMonth() + 1}/${now.getFullYear()} (01/${currentMonth} - ${pad(lastDay)}/${currentMonth}/${now.getFullYear()})`,
      };
    }
  }, [periodPreset, selectedQuarter, selectedYear, customStart, customEnd]);

  // ── LỌC ĐƠN HÀNG TRONG KỲ VÀ TẠO DỮ LIỆU SỔ S2A ──
  const periodOrders = useMemo(() => {
    return liveOrders.filter((o: any) => {
      const oDate = (o.created_at || o.createdAt || new Date().toISOString()).slice(0, 10);
      return oDate >= startDateStr && oDate <= endDateStr;
    });
  }, [liveOrders, startDateStr, endDateStr]);

  // Sổ S2a-HKD: Doanh thu tất cả được gom vào bánh bán được kèm phụ kiện/ship trọn gói
  const s2aData = useMemo(() => {
    return generateS2aLedger(periodOrders, taxPolicy);
  }, [periodOrders, taxPolicy]);

  // Dữ liệu Phụ lục Bảng kê Hoạt động kinh doanh 01-2/BK-HĐKD (Kho & 7 chỉ tiêu chi phí [24]-[30])
  const bkhdkdData = useMemo(() => {
    return generate012BkHdkdData(ingredients, expenses, periodOrders, taxPolicy);
  }, [ingredients, expenses, periodOrders, taxPolicy]);

  // Lọc tìm kiếm trên bảng sổ S2a
  const filteredRows = useMemo(() => {
    return s2aData.rows.filter((r) => {
      const matchSearch =
        !searchQuery ||
        r.voucher_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchGroup = filterTaxGroup === 0 || r.group_id === filterTaxGroup;
      return matchSearch && matchGroup;
    });
  }, [s2aData.rows, searchQuery, filterTaxGroup]);

  // ── SỔ S2E-HKD: SỔ CHI TIẾT TIỀN (THU, CHI, TỒN QUỸ) ──
  const [s2eSearchQuery, setS2eSearchQuery] = useState('');
  const [s2eFilterFund, setS2eFilterFund] = useState<'all' | 'cash' | 'bank' | 'income' | 'expense'>('all');
  const [s2eShowAllPeriod, setS2eShowAllPeriod] = useState(false);

  const s2eData = useMemo(() => {
    return generateS2eLedger(cashflow, {
      startDate: s2eShowAllPeriod ? undefined : startDateStr,
      endDate: s2eShowAllPeriod ? undefined : endDateStr,
      orders: periodOrders,
      expenses: expenses,
    });
  }, [cashflow, s2eShowAllPeriod, startDateStr, endDateStr, periodOrders, expenses]);

  const filteredS2eRows = useMemo(() => {
    return s2eData.rows.filter((r) => {
      const matchSearch =
        !s2eSearchQuery ||
        r.voucher_no.toLowerCase().includes(s2eSearchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(s2eSearchQuery.toLowerCase()) ||
        r.fund_type.toLowerCase().includes(s2eSearchQuery.toLowerCase());

      let matchFund = true;
      if (s2eFilterFund === 'cash') matchFund = r.source === 'cash';
      else if (s2eFilterFund === 'bank') matchFund = r.source === 'bank';
      else if (s2eFilterFund === 'income') matchFund = r.type === 'income';
      else if (s2eFilterFund === 'expense') matchFund = r.type === 'expense';

      return matchSearch && matchFund;
    });
  }, [s2eData.rows, s2eSearchQuery, s2eFilterFund]);

  // Xử lý lưu thông tin hộ KD và đồng bộ SQL tự động
  const handleSaveBusinessInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSqlSaving(true);
    const res = await saveHouseholdBusinessInfoToDb(tempInfo);
    setIsSqlSaving(false);
    if (res.success) {
      setBusinessInfo(tempInfo);
      setIsEditInfoModalOpen(false);
      triggerTaxAutoSyncToDb(tempInfo, taxPolicy);
      setSqlNotice('Đã lưu thông tin Hộ KD & Đồng bộ CSDL SQL thành công!');
      setTimeout(() => setSqlNotice(null), 4000);
    } else {
      alert('Lỗi lưu CSDL SQL: ' + (res.error || 'Vui lòng thử lại'));
    }
  };

  // Mở in mẫu sổ
  const handleOpenPrint = (
    book: 'S1a-HKD' | 'S2a-HKD' | 'S2b-HKD' | 'S2c-HKD' | 'S2d-HKD' | 'S2e-HKD' | 'S3a-HKD' | '01/CNKD' | '01-2/BK-HĐKD' | '01/TKN-CNKD'
  ) => {
    setCurrentPrintBook(book);
    setIsPrintModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Thông báo trạng thái đồng bộ CSDL SQL */}
      {sqlNotice && (
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{sqlNotice}</span>
          </div>
          <button
            onClick={() => setSqlNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-semibold cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}
      
      {/* ── TOP HEADER: THÔNG TIN HỘ KINH DOANH & CÁC NÚT HÀNH ĐỘNG NHANH ── */}
      <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-200/80 rounded-3xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          
          {/* Thông tin hành chính của Hộ Kinh Doanh */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-600 text-white font-black text-xs uppercase tracking-wider">
                {taxPolicy.policy_name || 'Thông Tư 88 & 40-BTC'}
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-zinc-900 tracking-tight">
                {businessInfo.shop_name}
              </h2>
              <button
                onClick={() => {
                  setTempInfo(businessInfo);
                  setIsEditInfoModalOpen(true);
                }}
                className="p-1 rounded-lg hover:bg-amber-200/60 text-amber-900 transition cursor-pointer"
                title="Sửa thông tin Hộ Kinh Doanh"
              >
                <Edit3 className="w-4 h-4" />
              </button>

              {/* Live Background Auto-Sync Badge */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-emerald-100/90 text-emerald-900 text-xs font-bold border border-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
                </span>
                <span>Tự động đồng bộ SQL ({lastSyncTime})</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-700">
              <div>
                Mã số thuế: <span className="font-bold text-zinc-900 font-mono">{businessInfo.tax_code}</span>
              </div>
              <span className="text-zinc-300 hidden sm:inline">•</span>
              <div>
                Đại diện: <span className="font-bold text-zinc-900">{businessInfo.owner_name}</span>
              </div>
              <span className="text-zinc-300 hidden sm:inline">•</span>
              <div>
                Địa chỉ: <span className="text-zinc-800">{businessInfo.business_address}</span>
              </div>
            </div>
          </div>

          {/* Các nút Xuất Excel & In Chuẩn A4 (Tự động đồng bộ trong nền, không cần nút ấn) */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => loadLiveTaxData(true)}
              className="p-2 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-700 text-xs font-bold transition cursor-pointer"
              title="Làm mới nhanh số liệu tức thì từ CSDL SQL"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshingSql ? 'animate-spin text-amber-600' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => exportS2aExcel(businessInfo, periodLabel, s2aData.rows, s2aData.summary, s2aData)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold shadow-xs hover:shadow-md transition cursor-pointer"
              title="Xuất Sổ S2a-HKD ra file Excel chuẩn 2 Sheet"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Xuất Excel S2a</span>
            </button>

            <button
              type="button"
              onClick={() => exportFullTaxBooksExcel(businessInfo, periodLabel, liveOrders, expenses, ingredients, cashflow, s2aData)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-300 text-zinc-800 text-xs font-bold shadow-xs hover:shadow-md transition cursor-pointer"
              title="Xuất trọn bộ 7 Sổ Kế Toán HKD sang Excel đa Sheet"
            >
              <Download className="w-4 h-4 text-zinc-600" />
              <span>Xuất Trọn Bộ 7 Sổ</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenPrint('S2a-HKD')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-xs hover:shadow-md transition cursor-pointer"
              title="Xem và in mẫu A4 đúng chuẩn Bộ Tài chính"
            >
              <Printer className="w-4 h-4" />
              <span>In Sổ A4 (S2a)</span>
            </button>
          </div>

        </div>
      </div>

      {/* ── BỘ LỌC KỲ KẾ TOÁN THUẾ (NGÀY / THÁNG / QUÝ / NĂM) ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3 sm:p-4 rounded-2xl border border-zinc-200/80 shadow-2xs text-xs">
        
        {/* Chọn khoảng thời gian */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-600 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            Kỳ kê khai:
          </span>
          <span className="font-black text-zinc-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
            {periodLabel}
          </span>

          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl ml-1">
            <button
              onClick={() => setPeriodPreset('today')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                periodPreset === 'today' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Hôm nay
            </button>
            <button
              onClick={() => setPeriodPreset('month')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                periodPreset === 'month' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Tháng này
            </button>
            <button
              onClick={() => setPeriodPreset('quarter')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                periodPreset === 'quarter' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Theo Quý
            </button>
            <button
              onClick={() => setPeriodPreset('year')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                periodPreset === 'year' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Cả Năm
            </button>
            <button
              onClick={() => setPeriodPreset('custom')}
              className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                periodPreset === 'custom' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Tùy chọn
            </button>
          </div>

          {/* Chọn Quý cụ thể */}
          {periodPreset === 'quarter' && (
            <div className="flex items-center gap-1.5 animate-in fade-in">
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                className="px-2 py-1 rounded-lg bg-zinc-50 border border-zinc-200 font-bold text-zinc-800"
              >
                <option value={1}>Quý 1 (Tháng 1 - 3)</option>
                <option value={2}>Quý 2 (Tháng 4 - 6)</option>
                <option value={3}>Quý 3 (Tháng 7 - 9)</option>
                <option value={4}>Quý 4 (Tháng 10 - 12)</option>
              </select>
              <input
                type="number"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-16 px-2 py-1 rounded-lg bg-zinc-50 border border-zinc-200 font-bold text-zinc-800"
              />
            </div>
          )}

          {/* Tùy chọn ngày */}
          {periodPreset === 'custom' && (
            <div className="flex items-center gap-1 bg-white px-2 py-0.5 rounded-xl border border-zinc-200 animate-in fade-in">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-1 py-0.5 text-zinc-800 font-semibold focus:outline-hidden"
              />
              <span className="text-zinc-400">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-1 py-0.5 text-zinc-800 font-semibold focus:outline-hidden"
              />
            </div>
          )}
        </div>

        {/* Thông tin số lượng chứng từ */}
        <div className="text-xs font-semibold text-zinc-500">
          Tổng số giao dịch: <span className="font-bold text-zinc-900">{periodOrders.length}</span> đơn hàng
        </div>

      </div>

      {/* ── 4 THẺ THỐNG KÊ TỔNG NGHĨA VỤ THUẾ (KPI CARDS) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Doanh thu chịu thuế */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Tổng Doanh Thu Kê Khai</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-zinc-900 mt-2">
            {s2aData.totalRevenue.toLocaleString('vi-VN')} đ
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Tổng cộng từ {periodOrders.length} đơn bán hàng POS
          </p>
        </div>

        {/* Thuế GTGT */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Thuế GTGT Phải Nộp</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
              VAT (1% &amp; 3%)
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-emerald-700 mt-2">
            {s2aData.totalVat.toLocaleString('vi-VN')} đ
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Chế biến bánh 3%, Phụ kiện tiệc 1%
          </p>
        </div>

        {/* Thuế TNCN */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
            <span>Thuế TNCN Phải Nộp</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
              TNCN (0.5% &amp; 1.5%)
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-blue-700 mt-2">
            {s2aData.totalPit.toLocaleString('vi-VN')} đ
          </p>
          <p className="text-[11px] text-zinc-500 mt-1">
            Chế biến bánh 1.5%, Phụ kiện 0.5%
          </p>
        </div>

        {/* Tổng thuế NSNN */}
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 shadow-2xs">
          <div className="flex items-center justify-between text-amber-900 text-xs font-bold">
            <span>Tổng Nghĩa Vụ Thuế NSNN</span>
            <ShieldCheck className="w-4 h-4 text-amber-700" />
          </div>
          <p className="text-xl sm:text-2xl font-black text-amber-900 mt-2">
            {s2aData.totalTax.toLocaleString('vi-VN')} đ
          </p>
          <p className="text-[11px] text-amber-800 mt-1 font-medium">
            Tương đương {s2aData.totalRevenue > 0 ? ((s2aData.totalTax / s2aData.totalRevenue) * 100).toFixed(2) : 0}% tổng doanh thu
          </p>
        </div>

      </div>

      {/* ── BỘ ĐIỀU HƯỚNG CÁC SỔ KẾ TOÁN & TỜ KHAI (SUB-TABS) ── */}
      <div className="flex items-center gap-1.5 bg-zinc-200/80 p-1.5 rounded-2xl overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveBookTab('S2a')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeBookTab === 'S2a' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <FileText className="w-4 h-4 text-amber-600" />
          <span>Sổ S2a-HKD: Doanh Thu &amp; Thuế</span>
        </button>

        <button
          onClick={() => setActiveBookTab('S2c')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeBookTab === 'S2c' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Sổ S2c-HKD: Doanh Thu &amp; Chi Phí</span>
        </button>

        <button
          onClick={() => setActiveBookTab('S2d')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeBookTab === 'S2d' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Package className="w-4 h-4 text-indigo-600" />
          <span>Sổ S2d-HKD: Kho Vật Tư &amp; Bánh</span>
        </button>

        <button
          onClick={() => setActiveBookTab('S2e')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeBookTab === 'S2e' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Wallet className="w-4 h-4 text-blue-600" />
          <span>Sổ S2e-HKD: Sổ Chi Tiết Tiền</span>
        </button>

        <button
          onClick={() => setActiveBookTab('01_CNKD')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeBookTab === '01_CNKD' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Receipt className="w-4 h-4 text-rose-600" />
          <span>Tờ Khai Thuế (Ngưỡng 1 Tỷ)</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              thresholdAnalysis.is_under_threshold
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {thresholdAnalysis.is_under_threshold ? '≤ 1 Tỷ (Miễn thuế)' : '> 1 Tỷ (Kê khai)'}
          </span>
        </button>

        <button
          onClick={() => setActiveBookTab('other_books')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeBookTab === 'other_books' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Layers className="w-4 h-4 text-zinc-600" />
          <span>Bộ Sổ Khác (S1a, S2b, S3a)</span>
        </button>

        <button
          onClick={() => setActiveBookTab('settings')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
            activeBookTab === 'settings' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
          }`}
        >
          <Settings className="w-4 h-4 text-zinc-600" />
          <span>Cấu Hình Thuế &amp; Hộ KD</span>
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* ── SUB-TAB 1: SỔ S2A-HKD: DOANH THU & THUẾ THEO % ── */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {activeBookTab === 'S2a' && (
        <div className="space-y-5">
          
          {/* Bảng tổng hợp theo 5 nhóm ngành nghề chuẩn Tổng cục Thuế */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Tổng Hợp Nghĩa Vụ Thuế Theo 5 Nhóm Ngành Nghề (Thông tư 88/2021/TT-BTC)
              </h3>
              <span className="text-xs text-zinc-500">
                Áp dụng tính thuế theo % Doanh thu
              </span>
            </div>

            <div className="overflow-x-auto overscroll-x-contain mt-3">
              <table className="w-full text-xs text-left min-w-[720px]">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500 font-bold bg-zinc-50/60">
                    <th className="p-2.5">Nhóm Ngành Nghề</th>
                    <th className="p-2.5 text-center">Tỷ lệ GTGT</th>
                    <th className="p-2.5 text-center">Tỷ lệ TNCN</th>
                    <th className="p-2.5 text-center">Tổng Thuế</th>
                    <th className="p-2.5 text-right">Doanh Thu (VNĐ)</th>
                    <th className="p-2.5 text-right">Thuế GTGT</th>
                    <th className="p-2.5 text-right">Thuế TNCN</th>
                    <th className="p-2.5 text-right">Tổng Thuế Phải Nộp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-medium">
                  {s2aData.summary.map((g) => (
                    <tr key={g.group_id} className="hover:bg-zinc-50/80">
                      <td className="p-2.5">
                        <div className="font-bold text-zinc-900">
                          {g.group_id}. {g.group_name}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          {TAX_BUSINESS_GROUPS.find((bg) => bg.id === g.group_id)?.example}
                        </div>
                      </td>
                      <td className="p-2.5 text-center font-semibold text-emerald-700">{g.vat_percent}%</td>
                      <td className="p-2.5 text-center font-semibold text-blue-700">{g.pit_percent}%</td>
                      <td className="p-2.5 text-center font-bold text-amber-700">{g.vat_percent + g.pit_percent}%</td>
                      <td className="p-2.5 text-right font-bold text-zinc-900">
                        {g.total_revenue.toLocaleString('vi-VN')}
                      </td>
                      <td className="p-2.5 text-right text-emerald-800">
                        {g.total_vat.toLocaleString('vi-VN')}
                      </td>
                      <td className="p-2.5 text-right text-blue-800">
                        {g.total_pit.toLocaleString('vi-VN')}
                      </td>
                      <td className="p-2.5 text-right font-black text-amber-900">
                        {g.total_tax.toLocaleString('vi-VN')}
                      </td>
                    </tr>
                  ))}
                  
                  {/* Dòng tổng cộng */}
                  <tr className="bg-amber-50/70 font-bold border-t-2 border-amber-200">
                    <td colSpan={4} className="p-3 text-amber-950 uppercase">
                      TỔNG CỘNG TOÀN TIỆM ({periodOrders.length} đơn hàng)
                    </td>
                    <td className="p-3 text-right font-black text-sm text-zinc-950">
                      {s2aData.totalRevenue.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="p-3 text-right font-black text-emerald-900">
                      {s2aData.totalVat.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="p-3 text-right font-black text-blue-900">
                      {s2aData.totalPit.toLocaleString('vi-VN')} đ
                    </td>
                    <td className="p-3 text-right font-black text-base text-amber-950">
                      {s2aData.totalTax.toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Bảng Chi tiết từng Giao dịch Bán Hàng Ghi Sổ S2a */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-sm text-zinc-900">
                  Chi Tiết Chứng Từ Bán Hàng Ghi Sổ (S2a-HKD)
                </h3>
                <p className="text-xs text-zinc-500">
                  Tự động đồng bộ từ các đơn hàng POS đã thanh toán
                </p>
              </div>

              {/* Ô tìm kiếm & lọc nhóm */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm mã đơn, tên bánh..."
                    className="pl-8 pr-3 py-1.5 text-xs bg-zinc-50 rounded-xl border border-zinc-200 focus:outline-hidden focus:border-amber-500 w-44 sm:w-56"
                  />
                </div>

                <select
                  value={filterTaxGroup}
                  onChange={(e) => setFilterTaxGroup(Number(e.target.value))}
                  className="px-2.5 py-1.5 text-xs bg-zinc-50 rounded-xl border border-zinc-200 font-semibold text-zinc-700"
                >
                  <option value={0}>Tất cả nhóm</option>
                  <option value={1}>Nhóm 1: Phụ kiện (1.5%)</option>
                  <option value={2}>Nhóm 2: Dịch vụ (7%)</option>
                  <option value={3}>Nhóm 3: Tiệm bánh (4.5%)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full text-xs text-left min-w-[760px]">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500 font-bold bg-zinc-50/60">
                    <th className="p-2.5 w-12 text-center">STT</th>
                    <th className="p-2.5 w-32">Ký hiệu chứng từ</th>
                    <th className="p-2.5 w-28">Ngày bán</th>
                    <th className="p-2.5">Diễn giải mặt hàng</th>
                    <th className="p-2.5 w-44">Nhóm ngành nghề</th>
                    <th className="p-2.5 text-right w-28">Doanh thu</th>
                    <th className="p-2.5 text-right w-24">Thuế GTGT</th>
                    <th className="p-2.5 text-right w-24">Thuế TNCN</th>
                    <th className="p-2.5 text-right w-28">Tổng thuế</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-zinc-400 italic">
                        Không có giao dịch nào phù hợp với bộ lọc trong kỳ này.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.slice(0, 100).map((row, idx) => (
                      <tr key={row.id} className="hover:bg-zinc-50/80">
                        <td className="p-2.5 text-center text-zinc-400">{idx + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-zinc-900">{row.voucher_no}</td>
                        <td className="p-2.5 text-zinc-600">{row.voucher_date}</td>
                        <td className="p-2.5 font-medium text-zinc-800">{row.description}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              row.group_id === 3
                                ? 'bg-amber-100 text-amber-800'
                                : row.group_id === 1
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-zinc-100 text-zinc-700'
                            }`}
                          >
                            Nhóm {row.group_id} ({TAX_BUSINESS_GROUPS.find((b) => b.id === row.group_id)?.total_tax_percent}%)
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-bold text-zinc-900">
                          {row.revenue.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-2.5 text-right text-emerald-700 font-semibold">
                          {row.vat_amount.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-2.5 text-right text-blue-700 font-semibold">
                          {row.pit_amount.toLocaleString('vi-VN')}
                        </td>
                        <td className="p-2.5 text-right font-bold text-amber-900">
                          {(row.vat_amount + row.pit_amount).toLocaleString('vi-VN')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 100 && (
              <p className="text-center text-xs text-zinc-400 pt-2">
                Đang hiển thị 100/{filteredRows.length} giao dịch đầu tiên. Bấm "Xuất Excel S2a" để xem đầy đủ 100% dữ liệu.
              </p>
            )}
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* ── SUB-TAB 2: SỔ S2C-HKD: DOANH THU & CHI PHÍ ── */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {activeBookTab === 'S2c' && (
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div>
              <h3 className="font-bold text-sm text-zinc-900">
                Sổ S2c-HKD: Sổ Chi Tiết Doanh Thu, Chi Phí
              </h3>
              <p className="text-xs text-zinc-500">
                Theo dõi toàn bộ các khoản doanh thu bán hàng và chi phí sản xuất kinh doanh hợp lý (bột, bơ, điện nước, mặt bằng...)
              </p>
            </div>
            <button
              onClick={() => handleOpenPrint('S2c-HKD')}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-800 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Sổ S2c</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-xs font-bold text-emerald-800 uppercase">Tổng Doanh Thu Vào</span>
              <p className="text-xl font-black text-emerald-900 mt-1">
                {s2aData.totalRevenue.toLocaleString('vi-VN')} đ
              </p>
            </div>
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
              <span className="text-xs font-bold text-rose-800 uppercase">Tổng Chi Phí Hợp Lý Ra</span>
              <p className="text-xl font-black text-rose-900 mt-1">
                {expenses.reduce((s, e) => s + e.amount, 0).toLocaleString('vi-VN')} đ
              </p>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-xs font-bold text-blue-800 uppercase">Thu Nhập Tính Thuế (TN Ròng)</span>
              <p className="text-xl font-black text-blue-900 mt-1">
                {Math.max(0, s2aData.totalRevenue - expenses.reduce((s, e) => s + e.amount, 0)).toLocaleString('vi-VN')} đ
              </p>
            </div>
          </div>

          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-xs text-left min-w-[640px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-bold">
                  <th className="p-2.5">Ký hiệu chứng từ</th>
                  <th className="p-2.5">Ngày tháng</th>
                  <th className="p-2.5">Diễn giải nội dung kinh tế</th>
                  <th className="p-2.5 text-right">Doanh Thu Vào (VNĐ)</th>
                  <th className="p-2.5 text-right">Chi Phí Ra (VNĐ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {expenses.slice(0, 15).map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-50">
                    <td className="p-2.5 font-mono font-bold text-zinc-800">CP-{e.id}</td>
                    <td className="p-2.5">{e.date}</td>
                    <td className="p-2.5 text-zinc-800">
                      Chi phí: <span className="font-semibold">{e.category}</span> - {e.description}
                    </td>
                    <td className="p-2.5 text-right text-zinc-300">-</td>
                    <td className="p-2.5 text-right font-bold text-rose-700">
                      {e.amount.toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* ── SUB-TAB 3: SỔ S2D-HKD: KHO VẬT TƯ & BÁNH THÀNH PHẨM ── */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {activeBookTab === 'S2d' && (
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div>
              <h3 className="font-bold text-sm text-zinc-900">
                Sổ S2d-HKD: Sổ Chi Tiết Vật Liệu, Dụng Cụ, Sản Phẩm, Hàng Hóa
              </h3>
              <p className="text-xs text-zinc-500">
                Quản lý số lượng và thành tiền nhập - xuất - tồn kho của nguyên vật liệu làm bánh (bột, bơ, sữa, trứng...)
              </p>
            </div>
            <button
              onClick={() => handleOpenPrint('S2d-HKD')}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 rounded-xl text-xs font-bold text-zinc-800 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Sổ S2d</span>
            </button>
          </div>

          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-xs text-left min-w-[660px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 font-bold">
                  <th className="p-2.5">Tên Vật Liệu / Dụng Cụ / Sản Phẩm</th>
                  <th className="p-2.5 text-center">Đơn vị</th>
                  <th className="p-2.5 text-right">Tồn Kho Hiện Tại</th>
                  <th className="p-2.5 text-right">Đơn Giá Vốn (VNĐ)</th>
                  <th className="p-2.5 text-right">Tổng Giá Trị Tồn Kho</th>
                  <th className="p-2.5 text-center">Trạng Thái Kho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {ingredients.map((ing) => {
                  const isLow = ing.stock_qty <= ing.reorder_level;
                  const totalVal = (ing.stock_qty || 0) * (ing.avg_cost || 0);
                  return (
                    <tr key={ing.id} className="hover:bg-zinc-50">
                      <td className="p-2.5 font-bold text-zinc-900">{ing.name}</td>
                      <td className="p-2.5 text-center text-zinc-600">{ing.unit}</td>
                      <td className="p-2.5 text-right font-semibold">
                        {(ing.stock_qty || 0).toLocaleString('vi-VN')}
                      </td>
                      <td className="p-2.5 text-right">{(ing.avg_cost || 0).toLocaleString('vi-VN')} đ</td>
                      <td className="p-2.5 text-right font-bold text-zinc-900">
                        {totalVal.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isLow ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isLow ? 'Cần nhập thêm' : 'Đầy đủ'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* ── SUB-TAB 4: SỔ S2E-HKD: SỔ CHI TIẾT TIỀN (THÔNG TƯ 88/2021/TT-BTC) ── */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {activeBookTab === 'S2e' && (
        <div className="space-y-5">
          {/* ── THẺ THỐNG KÊ 4 KHỐI DÒNG TIỀN & TỒN QUỸ ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/90 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                <span className="uppercase tracking-wider">Tổng Thu Tiền Vào (PT)</span>
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                  <TrendingUp className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-emerald-950 mt-2">
                {s2eData.totalIncome.toLocaleString('vi-VN')} <span className="text-sm font-bold text-emerald-700">đ</span>
              </p>
              <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                Tiền mặt: {s2eData.cashIncome.toLocaleString('vi-VN')} đ | NH: {s2eData.bankIncome.toLocaleString('vi-VN')} đ
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200/90 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-rose-800">
                <span className="uppercase tracking-wider">Tổng Chi Tiền Ra (PC)</span>
                <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
                  <TrendingDown className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-rose-950 mt-2">
                {s2eData.totalExpense.toLocaleString('vi-VN')} <span className="text-sm font-bold text-rose-700">đ</span>
              </p>
              <p className="text-[11px] text-rose-700 mt-1 font-medium">
                Tiền mặt: {s2eData.cashExpense.toLocaleString('vi-VN')} đ | NH: {s2eData.bankExpense.toLocaleString('vi-VN')} đ
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200/90 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-blue-800">
                <span className="uppercase tracking-wider">Dòng Tiền Thuần Trong Kỳ</span>
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                  <ArrowUpRight className="w-4 h-4" />
                </span>
              </div>
              <p className={`text-2xl font-black mt-2 ${s2eData.netCashflow >= 0 ? 'text-blue-950' : 'text-rose-950'}`}>
                {s2eData.netCashflow >= 0 ? '+' : ''}{s2eData.netCashflow.toLocaleString('vi-VN')} <span className="text-sm font-bold text-blue-700">đ</span>
              </p>
              <p className="text-[11px] text-blue-700 mt-1 font-medium">
                {s2eData.netCashflow >= 0 ? 'Dòng tiền thặng dư dương (+)' : 'Dòng tiền thâm hụt âm (-)'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300 shadow-2xs">
              <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                <span className="uppercase tracking-wider">Số Dư Tồn Quỹ Hiện Tại</span>
                <span className="p-1.5 rounded-lg bg-amber-500 text-zinc-950">
                  <Wallet className="w-4 h-4" />
                </span>
              </div>
              <p className="text-2xl font-black text-zinc-900 mt-2">
                {s2eData.closingBalance.toLocaleString('vi-VN')} <span className="text-sm font-bold text-zinc-600">đ</span>
              </p>
              <p className="text-[11px] text-zinc-700 mt-1 font-medium">
                Quỹ mặt: {s2eData.cashBalance.toLocaleString('vi-VN')} đ | VietQR: {s2eData.bankBalance.toLocaleString('vi-VN')} đ
              </p>
            </div>
          </div>

          {/* ── BẢNG SỔ CHI TIẾT TIỀN S2E-HKD ── */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-zinc-900">
                    Sổ S2e-HKD: Sổ Chi Tiết Tiền
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold text-[10px] uppercase">
                    Thông tư 88/2021/TT-BTC
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Theo dõi thu - chi tiền mặt tại quầy (TK 111) và tiền gửi ngân hàng (TK 112 VietQR) • {periodLabel}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setS2eShowAllPeriod(!s2eShowAllPeriod)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    s2eShowAllPeriod
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  {s2eShowAllPeriod ? 'Đang xem: Toàn bộ lịch sử' : 'Lọc theo kỳ báo cáo'}
                </button>
                <button
                  onClick={() => handleOpenPrint('S2e-HKD')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 rounded-xl text-xs font-bold text-zinc-950 transition cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>In Sổ S2e (A4)</span>
                </button>
              </div>
            </div>

            {/* ── BỘ LỌC VÀ TÌM KIẾM SỔ S2E ── */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Tìm theo số hiệu PT/PC, nội dung diễn giải..."
                  value={s2eSearchQuery}
                  onChange={(e) => setS2eSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setS2eFilterFund('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    s2eFilterFund === 'all'
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Tất cả ({s2eData.rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setS2eFilterFund('cash')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    s2eFilterFund === 'cash'
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Quỹ tiền mặt (111)
                </button>
                <button
                  type="button"
                  onClick={() => setS2eFilterFund('bank')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    s2eFilterFund === 'bank'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Ngân hàng VietQR (112)
                </button>
                <button
                  type="button"
                  onClick={() => setS2eFilterFund('income')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    s2eFilterFund === 'income'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Phiếu Thu (PT)
                </button>
                <button
                  type="button"
                  onClick={() => setS2eFilterFund('expense')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    s2eFilterFund === 'expense'
                      ? 'bg-rose-600 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  Phiếu Chi (PC)
                </button>
              </div>
            </div>

            {/* ── BẢNG DỮ LIỆU S2E CHUẨN THÔNG TƯ 88 ── */}
            <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-zinc-200">
              <table className="w-full text-xs text-left min-w-[760px]">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 font-bold">
                    <th className="p-2.5 text-center w-12">STT</th>
                    <th className="p-2.5 text-center w-28">Ký hiệu chứng từ</th>
                    <th className="p-2.5 text-center w-24">Ngày tháng</th>
                    <th className="p-2.5">Diễn giải nội dung thu / chi</th>
                    <th className="p-2.5 text-center w-36">Tài khoản / Quỹ</th>
                    <th className="p-2.5 text-right w-32">Số Tiền Thu (VNĐ)</th>
                    <th className="p-2.5 text-right w-32">Số Tiền Chi (VNĐ)</th>
                    <th className="p-2.5 text-right w-32">Tồn Quỹ (VNĐ)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredS2eRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-zinc-500 italic">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Receipt className="w-8 h-8 text-zinc-300" />
                          <p>Chưa có phát sinh giao dịch thu chi tiền trong bộ lọc này.</p>
                          {!s2eShowAllPeriod && (
                            <button
                              type="button"
                              onClick={() => setS2eShowAllPeriod(true)}
                              className="text-xs text-amber-600 hover:underline font-bold"
                            >
                              Bấm vào đây để xem toàn bộ lịch sử thu chi
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredS2eRows.map((r, idx) => (
                      <tr key={r.id || idx} className="hover:bg-zinc-50/80 transition-colors">
                        <td className="p-2.5 text-center text-zinc-500 font-medium">{idx + 1}</td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-mono font-bold text-xs ${
                              r.type === 'income'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : 'bg-rose-100 text-rose-800 border border-rose-200'
                            }`}
                          >
                            {r.voucher_no}
                          </span>
                        </td>
                        <td className="p-2.5 text-center text-zinc-700 font-medium">
                          {r.voucher_date}
                        </td>
                        <td className="p-2.5 font-semibold text-zinc-900">
                          {r.description}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.source === 'cash'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                            }`}
                          >
                            {r.fund_type}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-bold text-emerald-700">
                          {r.income > 0 ? `+${r.income.toLocaleString('vi-VN')} đ` : <span className="text-zinc-300 font-normal">-</span>}
                        </td>
                        <td className="p-2.5 text-right font-bold text-rose-700">
                          {r.expense > 0 ? `-${r.expense.toLocaleString('vi-VN')} đ` : <span className="text-zinc-300 font-normal">-</span>}
                        </td>
                        <td className="p-2.5 text-right font-black text-zinc-900">
                          {r.balance.toLocaleString('vi-VN')} đ
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredS2eRows.length > 0 && (
                  <tfoot>
                    <tr className="bg-zinc-50 font-bold border-t-2 border-zinc-300 text-zinc-900">
                      <td colSpan={5} className="p-3 text-right uppercase tracking-wider text-xs">
                        Tổng cộng phát sinh và tồn quỹ cuối kỳ:
                      </td>
                      <td className="p-3 text-right text-emerald-800 font-black">
                        +{s2eData.totalIncome.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="p-3 text-right text-rose-800 font-black">
                        -{s2eData.totalExpense.toLocaleString('vi-VN')} đ
                      </td>
                      <td className="p-3 text-right text-zinc-950 font-black text-sm">
                        {s2eData.closingBalance.toLocaleString('vi-VN')} đ
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* ── SUB-TAB 5: TỜ KHAI THUẾ & PHÂN TÍCH NGƯỠNG DOANH THU 1 TỶ ĐỒNG ── */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {activeBookTab === '01_CNKD' && (
        <div className="space-y-6">

          {/* ── THẺ PHÂN TÍCH THÔNG MINH NGƯỠNG DOANH THU 1 TỶ & TỰ ĐỘNG QUYẾT ĐỊNH MẪU ── */}
          <div
            className={`rounded-3xl p-5 sm:p-6 border shadow-xs transition-all ${
              thresholdAnalysis.is_under_threshold
                ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-50/60 to-white border-emerald-300'
                : 'bg-gradient-to-br from-amber-500/10 via-orange-50/60 to-white border-amber-300'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-black uppercase tracking-wider ${
                      thresholdAnalysis.is_under_threshold
                        ? 'bg-emerald-700 text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    {thresholdAnalysis.is_under_threshold
                      ? 'Miễn 100% Thuế (≤ 1 Tỷ/Năm)'
                      : 'Kê Khai Nộp Thuế (> 1 Tỷ/Năm)'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 font-bold text-xs border border-zinc-200">
                    Căn cứ chính sách mới 2026
                  </span>
                </div>

                <h3 className="text-lg sm:text-xl font-black text-zinc-900 flex items-center gap-2">
                  {thresholdAnalysis.is_under_threshold ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  <span>
                    {thresholdAnalysis.is_under_threshold
                      ? `Quyết Định: Áp Dụng Mẫu 01/TKN-CNKD (Được Miễn 100% Thuế GTGT & TNCN)`
                      : `Quyết Định: Bắt Buộc Kê Khai Mẫu 01/CNKD & Hóa Đơn Điện Tử`}
                  </span>
                </h3>

                <p className="text-xs text-zinc-600 leading-relaxed max-w-3xl">
                  {thresholdAnalysis.is_under_threshold ? (
                    <>
                      Theo <b>Nghị định 141/2026/NĐ-CP</b> và <b>Thông tư 50/2026/TT-BTC</b> (chính thức bãi bỏ thuế khoán),
                      hộ kinh doanh có tổng doanh thu từ <b>1 tỷ đồng/năm trở xuống</b> được <b>miễn 100% thuế GTGT &amp; thuế TNCN</b>,
                      đồng thời miễn lệ phí môn bài. Chỉ cần nộp <b>Tờ khai thông báo doanh thu năm (Mẫu 01/TKN-CNKD)</b>.
                    </>
                  ) : (
                    <>
                      Theo <b>Nghị định 68/2026/NĐ-CP</b>, <b>Nghị định 141/2026/NĐ-CP</b> và <b>Thông tư 40/2021/TT-BTC</b>, hộ kinh doanh có tổng doanh thu
                      <b> vượt 1 tỷ đồng/năm</b> bắt buộc áp dụng phương pháp Kê khai định kỳ (tháng/quý), sử dụng
                      <b> Hóa đơn điện tử khởi tạo từ máy tính tiền</b> và nộp thuế theo <b>Mẫu số 01/CNKD</b>
                      (Sản xuất chế biến bánh: GTGT 3%, TNCN 1.5%).
                    </>
                  )}
                </p>
              </div>

              {/* Nút reset tự động */}
              <button
                type="button"
                onClick={() => {
                  setSelectedDeclarationForm(
                    thresholdAnalysis.recommended_form === '01/TKN-CNKD' ? '01_TKN_CNKD' : '01_CNKD'
                  );
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-zinc-50 border border-zinc-300 text-zinc-800 text-xs font-bold shadow-2xs hover:shadow-xs transition self-start lg:self-center cursor-pointer shrink-0"
                title="Tự động đồng bộ mẫu tờ khai theo mức doanh thu thực tế"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>Tự Động Chọn Theo Doanh Thu</span>
              </button>
            </div>

            {/* 4 Thẻ chỉ số tiến độ ngưỡng 1 tỷ */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-zinc-200/60">
              <div className="bg-white/80 rounded-xl p-3 border border-zinc-200/60">
                <span className="text-[11px] font-semibold text-zinc-500">Doanh Thu Năm {selectedYear}</span>
                <p className="text-base sm:text-lg font-black text-zinc-900 mt-0.5">
                  {thresholdAnalysis.current_year_revenue.toLocaleString('vi-VN')} đ
                </p>
              </div>

              <div className="bg-white/80 rounded-xl p-3 border border-zinc-200/60">
                <span className="text-[11px] font-semibold text-zinc-500">Ngưỡng Miễn Thuế 2026</span>
                <p className="text-base sm:text-lg font-black text-emerald-800 mt-0.5">
                  {thresholdAnalysis.annual_threshold.toLocaleString('vi-VN')} đ
                </p>
              </div>

              <div className="bg-white/80 rounded-xl p-3 border border-zinc-200/60">
                <span className="text-[11px] font-semibold text-zinc-500">Tỷ Lệ Đạt Ngưỡng</span>
                <p
                  className={`text-base sm:text-lg font-black mt-0.5 ${
                    thresholdAnalysis.is_under_threshold ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {thresholdAnalysis.percent_of_threshold}%
                </p>
              </div>

              <div className="bg-white/80 rounded-xl p-3 border border-zinc-200/60">
                <span className="text-[11px] font-semibold text-zinc-500">
                  {thresholdAnalysis.is_under_threshold ? 'Dư Địa Đến Ngưỡng 1 Tỷ' : 'Vượt Quá Ngưỡng'}
                </span>
                <p className="text-base sm:text-lg font-black text-zinc-900 mt-0.5">
                  {thresholdAnalysis.remaining_until_threshold.toLocaleString('vi-VN')} đ
                </p>
              </div>
            </div>

            {/* Thanh tiến trình % trực quan */}
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-[11px] font-bold text-zinc-600">
                <span>Tiến độ doanh thu năm so với ngưỡng 1 tỷ đồng</span>
                <span>{thresholdAnalysis.percent_of_threshold}% / 100%</span>
              </div>
              <div className="w-full h-2.5 bg-zinc-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    thresholdAnalysis.is_under_threshold ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, thresholdAnalysis.percent_of_threshold)}%` }}
                />
              </div>
            </div>
          </div>

          {/* ── BỘ CHUYỂN ĐỔI MẪU TỜ KHAI (FORM SWITCHER) ── */}
          {/* ── BỘ CHUYỂN ĐỔI MẪU TỜ KHAI (FORM SWITCHER) ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-100 p-2 rounded-2xl border border-zinc-200">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 sm:pb-0 w-full sm:w-auto -mx-0.5 px-0.5">
              <button
                type="button"
                onClick={() => setSelectedDeclarationForm('01_TKN_CNKD')}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedDeclarationForm === '01_TKN_CNKD'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Mẫu 01/TKN-CNKD (Doanh Thu ≤ 1 Tỷ - Miễn Thuế 100%)</span>
                {thresholdAnalysis.is_under_threshold && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                      selectedDeclarationForm === '01_TKN_CNKD'
                        ? 'bg-emerald-800 text-emerald-100'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    Khuyến Nghị
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setSelectedDeclarationForm('01_CNKD')}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedDeclarationForm === '01_CNKD'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <Receipt className="w-4 h-4" />
                <span>Mẫu 01/CNKD (Doanh Thu &gt; 1 Tỷ - Kê Khai Nộp Thuế)</span>
                {!thresholdAnalysis.is_under_threshold && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                      selectedDeclarationForm === '01_CNKD'
                        ? 'bg-rose-800 text-rose-100'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    Khuyến Nghị
                  </span>
                )}
              </button>
            </div>

            <div className="text-xs text-zinc-500 font-medium px-2 shrink-0">
              Đang xem: <b className="text-zinc-900">{selectedDeclarationForm === '01_TKN_CNKD' ? 'Mẫu 01/TKN-CNKD' : 'Mẫu 01/CNKD'}</b>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════════════ */}
          {/* ── MẪU 1: 01/TKN-CNKD (DOANH THU ≤ 1 TỶ/NĂM - MIỄN THUẾ 100%) ── */}
          {/* ══════════════════════════════════════════════════════════════════════════ */}
          {selectedDeclarationForm === '01_TKN_CNKD' && (
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-emerald-200 shadow-xs space-y-5 sm:space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-xs font-bold uppercase">
                      Mẫu Số 01/TKN-CNKD
                    </span>
                    <span className="text-xs text-zinc-500">
                      Thông tư 50/2026/TT-BTC &amp; Nghị định 141/2026/NĐ-CP
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-zinc-900 mt-1">
                    Tờ Khai Thông Báo Doanh Thu Năm Đối Với Cá Nhân Kinh Doanh
                  </h3>
                  <p className="text-xs text-emerald-800 font-semibold">
                    Áp dụng cho hộ kinh doanh có doanh thu hàng năm từ 1 tỷ đồng trở xuống - MIỄN 100% THUẾ GTGT &amp; TNCN
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => export01TknCnkdExcel(businessInfo, periodLabel, thresholdAnalysis, s2aData.summary, taxPolicy)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Xuất Excel Mẫu 01/TKN</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPrint('01/TKN-CNKD')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>In Mẫu 01/TKN-CNKD (A4)</span>
                  </button>
                </div>
              </div>

              {/* Khối Thông Tin Hành Chính & Căn Cứ Pháp Lý */}
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3.5 sm:p-4 text-xs space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-zinc-700">
                  <div>
                    <span className="font-mono text-zinc-500 font-bold">[01]</span> Kỳ tính thuế: <b className="text-zinc-900">Năm {selectedYear}</b> ({startDateStr} đến {endDateStr})
                  </div>
                  <div>
                    <span className="font-mono text-zinc-500 font-bold">[02]</span> Người nộp thuế: <b className="text-zinc-900">{businessInfo.shop_name}</b> (Đại diện: {businessInfo.owner_name})
                  </div>
                  <div>
                    <span className="font-mono text-zinc-500 font-bold">[03]</span> Mã số thuế: <b className="font-mono text-zinc-900">{businessInfo.tax_code}</b> - ĐT: {businessInfo.phone}
                  </div>
                  <div>
                    <span className="font-mono text-zinc-500 font-bold">[04]</span> Địa chỉ: <span className="text-zinc-900">{businessInfo.business_address}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-emerald-200/80 flex items-center justify-between flex-wrap gap-2 text-[11px] text-emerald-900">
                  <span className="font-medium">
                    🛡️ Căn cứ pháp lý: <b>Nghị định 141/2026/NĐ-CP &amp; Thông tư 50/2026/TT-BTC</b> (Ngưỡng doanh thu miễn thuế: <b>1.000.000.000 đ/năm</b>)
                  </span>
                  <span className="bg-emerald-200/70 text-emerald-950 px-2.5 py-0.5 rounded-full font-bold">
                    ĐỦ ĐIỀU KIỆN MIỄN 100% THUẾ
                  </span>
                </div>
              </div>

              {/* Bảng Kê Chỉ Tiêu Tờ Khai 01/TKN-CNKD */}
              <div className="space-y-2">
                <div className="flex sm:hidden items-center justify-between px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 font-medium shadow-2xs">
                  <span className="flex items-center gap-1.5">
                    👉 <b>Kéo sang phải</b> để xem đủ cột doanh thu &amp; số thuế
                  </span>
                  <span className="text-[10px] bg-emerald-200/70 text-emerald-950 px-1.5 py-0.5 rounded font-bold font-mono">5 Cột</span>
                </div>
                <div className="border border-zinc-200 rounded-xl overflow-x-auto overscroll-x-contain">
                  <table className="w-full text-xs text-left min-w-[680px]">
                    <thead>
                      <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                        <th className="p-3 w-16 text-center shrink-0">Chỉ tiêu</th>
                        <th className="p-3 min-w-[200px]">Nội dung kê khai doanh thu</th>
                        <th className="p-3 w-36 text-center shrink-0">Tỷ lệ quy định</th>
                        <th className="p-3 w-44 text-right shrink-0">Doanh thu phát sinh</th>
                        <th className="p-3 w-44 text-right shrink-0">Số thuế phải nộp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 font-medium">
                      {/* [21] Tổng doanh thu */}
                      <tr className="bg-zinc-50/80 font-bold">
                        <td className="p-3 text-center font-mono text-zinc-900 font-bold">[21]</td>
                        <td className="p-3 text-zinc-950 uppercase font-bold">
                          TỔNG DOANH THU THỰC TẾ PHÁT SINH TRONG NĂM
                        </td>
                        <td className="p-3 text-center text-zinc-400">-</td>
                        <td className="p-3 text-right font-black text-sm text-zinc-950">
                          {thresholdAnalysis.current_year_revenue.toLocaleString('vi-VN')} đ
                        </td>
                        <td className="p-3 text-right font-black text-sm text-emerald-800">
                          0 đ (Miễn thuế)
                        </td>
                      </tr>

                      {/* [22] Doanh thu sản xuất bánh */}
                      <tr>
                        <td className="p-3 text-center font-mono text-zinc-600">[22]</td>
                        <td className="p-3">
                          1. Doanh thu sản xuất bánh kem, bánh mì, đồ uống chế biến tiệm bánh
                        </td>
                        <td className="p-3 text-center text-zinc-600 font-medium">GTGT 3% | TNCN 1.5%</td>
                        <td className="p-3 text-right font-bold text-zinc-900">
                          {(s2aData.summary[2]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-800">
                          0 đ (Miễn thuế)
                        </td>
                      </tr>

                      {/* [23] Phụ kiện tiệc */}
                      <tr>
                        <td className="p-3 text-center font-mono text-zinc-600">[23]</td>
                        <td className="p-3">
                          2. Doanh thu bán lẻ phụ kiện tiệc, nến, mũ, hàng hóa mua bán
                        </td>
                        <td className="p-3 text-center text-zinc-600 font-medium">GTGT 1% | TNCN 0.5%</td>
                        <td className="p-3 text-right font-bold text-zinc-900">
                          {(s2aData.summary[0]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-800">
                          0 đ (Miễn thuế)
                        </td>
                      </tr>

                      {/* [24] Giao hàng, ship bánh */}
                      <tr>
                        <td className="p-3 text-center font-mono text-zinc-600">[24]</td>
                        <td className="p-3">
                          3. Doanh thu dịch vụ giao hàng, ship bánh, trang trí tiệc
                        </td>
                        <td className="p-3 text-center text-zinc-600 font-medium">GTGT 5% | TNCN 2%</td>
                        <td className="p-3 text-right font-bold text-zinc-900">
                          {(s2aData.summary[1]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-800">
                          0 đ (Miễn thuế)
                        </td>
                      </tr>

                      {/* [25] Khác */}
                      <tr>
                        <td className="p-3 text-center font-mono text-zinc-600">[25]</td>
                        <td className="p-3">
                          4. Doanh thu hoạt động kinh doanh khác
                        </td>
                        <td className="p-3 text-center text-zinc-600 font-medium">GTGT 2% | TNCN 1%</td>
                        <td className="p-3 text-right font-bold text-zinc-900">
                          {(s2aData.summary[3]?.total_revenue || 0).toLocaleString('vi-VN')} đ
                        </td>
                        <td className="p-3 text-right font-semibold text-emerald-800">
                          0 đ (Miễn thuế)
                        </td>
                      </tr>

                      {/* [26] Thuế GTGT */}
                      <tr className="bg-emerald-50/40">
                        <td className="p-3 text-center font-mono text-emerald-900 font-bold">[26]</td>
                        <td className="p-3 text-zinc-900 font-semibold">Thuế Giá Trị Gia Tăng (GTGT) phải nộp trong năm:</td>
                        <td className="p-3 text-center text-emerald-800 font-medium">Miễn thuế</td>
                        <td className="p-3 text-right text-zinc-400">-</td>
                        <td className="p-3 text-right font-black text-emerald-800">0 đ</td>
                      </tr>

                      {/* [27] Thuế TNCN */}
                      <tr className="bg-emerald-50/40">
                        <td className="p-3 text-center font-mono text-emerald-900 font-bold">[27]</td>
                        <td className="p-3 text-zinc-900 font-semibold">Thuế Thu Nhập Cá Nhân (TNCN) phải nộp trong năm:</td>
                        <td className="p-3 text-center text-emerald-800 font-medium">Miễn thuế</td>
                        <td className="p-3 text-right text-zinc-400">-</td>
                        <td className="p-3 text-right font-black text-emerald-800">0 đ</td>
                      </tr>

                      {/* [28] Lệ phí môn bài */}
                      <tr className="bg-zinc-50/70">
                        <td className="p-3 text-center font-mono text-zinc-600 font-bold">[28]</td>
                        <td className="p-3 text-zinc-900 font-semibold">Lệ phí môn bài (Đã bãi bỏ đối với HKD từ 01/01/2026):</td>
                        <td className="p-3 text-center font-semibold text-zinc-600">Đã bãi bỏ</td>
                        <td className="p-3 text-right text-zinc-400">-</td>
                        <td className="p-3 text-right font-black text-zinc-900">0 đ</td>
                      </tr>

                      {/* [29] Tổng thuế phải nộp */}
                      <tr className="bg-amber-100/80 font-bold border-t-2 border-emerald-300">
                        <td colSpan={3} className="p-3 text-amber-950 uppercase font-black text-xs sm:text-sm">
                          [29] TỔNG NGHĨA VỤ THUẾ PHẢI NỘP VÀO NGÂN SÁCH NHÀ NƯỚC (VNĐ)
                        </td>
                        <td colSpan={2} className="p-3 text-right font-black text-emerald-900 text-sm sm:text-base">
                          0 VNĐ (MIỄN NỘP THUẾ)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  Hướng dẫn nộp tờ khai Mẫu 01/TKN-CNKD:
                </p>
                <p>
                  Hộ kinh doanh chỉ cần nộp tờ khai này mỗi năm 1 lần cho Chi cục Thuế quản lý trước ngày 31 tháng 1 năm kế tiếp,
                  hoặc tải bản in A4 có chữ ký nộp trực tiếp tại bộ phận Một Cửa. Không phát sinh bất kỳ số tiền thuế nào phải nộp.
                </p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════════════════ */}
          {/* ── MẪU 2: 01/CNKD (DOANH THU > 1 TỶ/NĂM - KÊ KHAI NỘP THUẾ ĐỊNH KỲ) ── */}
          {/* ══════════════════════════════════════════════════════════════════════════ */}
          {selectedDeclarationForm === '01_CNKD' && (
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-zinc-200/80 shadow-xs space-y-5 sm:space-y-6 animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-xs font-bold uppercase">
                      Mẫu Số 01/CNKD
                    </span>
                    <span className="text-xs text-zinc-500">
                      Thông tư 40/2021/TT-BTC &amp; Nghị định 68/2026/NĐ-CP (NĐ 141/2026/NĐ-CP)
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-zinc-900 mt-1">
                    Tờ Khai Thuế Đối Với Cá Nhân Kinh Doanh (Phương Pháp Kê Khai)
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Kê khai tính thuế GTGT và TNCN định kỳ theo % doanh thu trong kỳ ({periodLabel})
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => export01CnkdExcel(businessInfo, periodLabel, s2aData.summary, s2aData, bkhdkdData, taxPolicy)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                    title="Xuất file Excel chuẩn CQT gồm 2 Sheet: Tờ khai chính + Phụ lục 01-2"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Xuất Excel Chuẩn CQT (2 Sheet)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => export01CnkdXml(businessInfo, periodLabel, s2aData.summary, s2aData, bkhdkdData, taxPolicy)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 rounded-xl text-xs font-bold shadow-2xs transition cursor-pointer"
                    title="Tải tệp XML chuẩn eTax để nộp trực tiếp trên thuedientu.gdt.gov.vn"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                    <span>Tải File XML Nộp Thuế (eTax)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPrint('01/CNKD')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    <span>In Tờ Khai 01 (A4)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenPrint('01-2/BK-HĐKD')}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                    title="Xem và in Phụ lục Bảng kê hoạt động kinh doanh 01-2/BK-HĐKD"
                  >
                    <Printer className="w-4 h-4 text-amber-400" />
                    <span>In Phụ Lục 01-2 (A4)</span>
                  </button>
                </div>
              </div>

              {/* Khối Thông Tin Hành Chính & Căn Cứ Pháp Lý Cho Mẫu 01/CNKD */}
              <div className="bg-rose-50/40 border border-rose-200 rounded-xl p-3.5 sm:p-4 text-xs space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-zinc-700">
                  <div>
                    <span className="font-mono text-zinc-500 font-bold">[01]</span> Kỳ tính thuế: <b className="text-zinc-900">{periodLabel}</b> ({startDateStr} đến {endDateStr})
                  </div>
                  <div>
                    <span className="font-mono text-zinc-500 font-bold">[02]</span> Người nộp thuế: <b className="text-zinc-900">{businessInfo.shop_name}</b> (Đại diện: {businessInfo.owner_name})
                  </div>
                  <div>
                    <span className="font-mono text-zinc-500 font-bold">[03]</span> Mã số thuế: <b className="font-mono text-zinc-900">{businessInfo.tax_code}</b> - ĐT: {businessInfo.phone}
                  </div>
                  <div>
                    <span className="font-mono text-zinc-500 font-bold">[04]</span> Địa chỉ: <span className="text-zinc-900">{businessInfo.business_address}</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-rose-200/80 flex items-center justify-between flex-wrap gap-2 text-[11px] text-rose-950">
                  <span className="font-medium">
                    🛡️ Căn cứ pháp lý: <b>Nghị định 68/2026/NĐ-CP, Nghị định 141/2026/NĐ-CP &amp; Thông tư 40/2021/TT-BTC</b> (Doanh thu năm vượt ngưỡng 1 tỷ đồng)
                  </span>
                  <span className="bg-rose-200/70 text-rose-950 px-2.5 py-0.5 rounded-full font-bold">
                    BẮT BUỘC KÊ KHAI ĐỊNH KỲ &amp; HÓA ĐƠN ĐIỆN TỬ
                  </span>
                </div>
              </div>

              {/* Bộ chuyển đổi giữa Tờ khai chính 01/CNKD và Phụ lục 01-2/BK-HĐKD */}
              <div className="flex items-center gap-2 bg-zinc-100 p-1.5 rounded-xl border border-zinc-200 overflow-x-auto scrollbar-none pb-1 sm:pb-1.5">
                <button
                  type="button"
                  onClick={() => setCnkdViewMode('main')}
                  className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    cnkdViewMode === 'main'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <FileText className="w-4 h-4 text-rose-600" />
                  <span>Tờ Khai Chính (Mẫu 01/CNKD)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCnkdViewMode('appendix')}
                  className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    cnkdViewMode === 'appendix'
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Phụ Lục Hoạt Động Kinh Doanh (Mẫu 01-2/BK-HĐKD)</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-100 text-indigo-800 font-bold">
                    Bắt Buộc TT40
                  </span>
                </button>
              </div>

              {/* ── VIEW 1: TỜ KHAI CHÍNH 01/CNKD ── */}
              {cnkdViewMode === 'main' && (
                <div className="space-y-3 sm:space-y-4 animate-in fade-in">
                  <div className="flex sm:hidden items-center justify-between px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-900 font-medium shadow-2xs">
                    <span className="flex items-center gap-1.5">
                      👉 <b>Kéo sang phải</b> để xem đủ cột doanh thu &amp; số thuế
                    </span>
                    <span className="text-[10px] bg-rose-200/70 text-rose-950 px-1.5 py-0.5 rounded font-bold font-mono">5 Cột</span>
                  </div>
                  <div className="border border-zinc-200 rounded-xl overflow-x-auto overscroll-x-contain">
                    <table className="w-full text-xs text-left min-w-[680px]">
                      <thead>
                        <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                          <th className="p-3 w-16 text-center shrink-0">Chỉ tiêu</th>
                          <th className="p-3 min-w-[220px]">Nội dung kinh tế kê khai</th>
                          <th className="p-3 w-36 text-center shrink-0">Tỷ lệ tính thuế</th>
                          <th className="p-3 w-40 text-right shrink-0">Doanh Thu Kê Khai (VNĐ)</th>
                          <th className="p-3 w-40 text-right shrink-0">Số Thuế Phải Nộp (VNĐ)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 font-medium">
                        {/* [28] Tổng doanh thu */}
                        <tr className="bg-zinc-50/50 font-bold">
                          <td className="p-3 text-center text-zinc-900 font-mono">[28]</td>
                          <td className="p-3 text-zinc-900 uppercase">TỔNG DOANH THU TÍNH THUẾ TRONG KỲ</td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-right font-black text-sm text-zinc-900">
                            {s2aData.totalRevenue.toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3 text-right font-black text-sm text-amber-900">
                            {s2aData.totalTax.toLocaleString('vi-VN')}
                          </td>
                        </tr>

                        {/* Nhóm 1: Phân phối hàng hóa */}
                        <tr>
                          <td className="p-3 text-center font-mono text-zinc-500">[29]</td>
                          <td className="p-3">
                            1. Phân phối, cung cấp hàng hóa (Phụ kiện sinh nhật, nến, mũ, bánh nhập sẵn)
                          </td>
                          <td className="p-3 text-center">GTGT: 1% | TNCN: 0.5%</td>
                          <td className="p-3 text-right font-bold text-zinc-800">
                            {(s2aData.summary[0]?.total_revenue || 0).toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3 text-right font-bold text-zinc-800">
                            {(s2aData.summary[0]?.total_tax || 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>

                        {/* Nhóm 2: Dịch vụ */}
                        <tr>
                          <td className="p-3 text-center font-mono text-zinc-500">[30]</td>
                          <td className="p-3">
                            2. Dịch vụ, xây dựng không bao thầu NVL (Phí ship riêng, trang trí tiệc)
                          </td>
                          <td className="p-3 text-center">GTGT: 5% | TNCN: 2.0%</td>
                          <td className="p-3 text-right font-bold text-zinc-800">
                            {(s2aData.summary[1]?.total_revenue || 0).toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3 text-right font-bold text-zinc-800">
                            {(s2aData.summary[1]?.total_tax || 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>

                        {/* Nhóm 3: Sản xuất tiệm bánh (Gom toàn bộ bánh bán được & phụ kiện đi kèm & ship) */}
                        <tr className="bg-amber-50/60">
                          <td className="p-3 text-center font-mono text-amber-900 font-bold">[31]</td>
                          <td className="p-3 font-bold text-amber-950">
                            3. Sản xuất bánh kem, bánh mì, đồ uống chế biến tiệm bánh (Bao gồm phụ kiện &amp; ship trọn gói)
                          </td>
                          <td className="p-3 text-center font-bold text-amber-900">
                            GTGT: {taxPolicy.tax_groups?.find(g => g.id === 3)?.vat_percent || 3}% | TNCN: {taxPolicy.tax_groups?.find(g => g.id === 3)?.pit_percent || 1.5}%
                          </td>
                          <td className="p-3 text-right font-black text-amber-950">
                            {(s2aData.summary[2]?.total_revenue || 0).toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3 text-right font-black text-amber-950">
                            {(s2aData.summary[2]?.total_tax || 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>

                        {/* Nhóm 4: Khác */}
                        <tr>
                          <td className="p-3 text-center font-mono text-zinc-500">[32]</td>
                          <td className="p-3">
                            4. Hoạt động kinh doanh khác
                          </td>
                          <td className="p-3 text-center">GTGT: 2% | TNCN: 1.0%</td>
                          <td className="p-3 text-right font-bold text-zinc-800">
                            {(s2aData.summary[3]?.total_revenue || 0).toLocaleString('vi-VN')}
                          </td>
                          <td className="p-3 text-right font-bold text-zinc-800">
                            {(s2aData.summary[3]?.total_tax || 0).toLocaleString('vi-VN')}
                          </td>
                        </tr>

                        {/* [33] Tổng thuế GTGT */}
                        <tr className="bg-emerald-50/50 font-bold">
                          <td className="p-3 text-center font-mono text-emerald-800">[33]</td>
                          <td className="p-3 text-emerald-950">Tổng số thuế GTGT phải nộp trong kỳ:</td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-right">-</td>
                          <td className="p-3 text-right font-black text-emerald-900 text-sm">
                            {s2aData.totalVat.toLocaleString('vi-VN')} đ
                          </td>
                        </tr>

                        {/* [34] Tổng thuế TNCN */}
                        <tr className="bg-blue-50/50 font-bold">
                          <td className="p-3 text-center font-mono text-blue-800">[34]</td>
                          <td className="p-3 text-blue-950">Tổng số thuế TNCN phải nộp trong kỳ:</td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-right">-</td>
                          <td className="p-3 text-right font-black text-blue-900 text-sm">
                            {s2aData.totalPit.toLocaleString('vi-VN')} đ
                          </td>
                        </tr>

                        {/* [35] Tổng nghĩa vụ thuế */}
                        <tr className="bg-amber-100/60 font-bold border-t-2 border-amber-300">
                          <td className="p-3 text-center font-mono text-amber-950 font-black">[35]</td>
                          <td className="p-3 text-amber-950 uppercase font-black">
                            TỔNG NGHĨA VỤ THUẾ PHẢI NỘP VÀO NSNN (GTGT + TNCN)
                          </td>
                          <td className="p-3 text-center">-</td>
                          <td className="p-3 text-right">-</td>
                          <td className="p-3 text-right font-black text-amber-950 text-base">
                            {s2aData.totalTax.toLocaleString('vi-VN')} đ
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4 bg-amber-50/80 rounded-2xl border border-amber-200 text-xs text-amber-950 space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-amber-700" />
                      Quy tắc tinh giản kế toán tiệm bánh:
                    </p>
                    <p>
                      Toàn bộ phụ kiện (nến, mũ sinh nhật, đĩa thìa) và phí ship đều đi kèm trực tiếp với bánh nên được tính trọn gói vào sản phẩm bánh bán được (Chỉ tiêu [31] - Sản xuất chế biến tiệm bánh). Bạn có thể tải file XML nộp trực tiếp lên <b>thuedientu.gdt.gov.vn</b> hoặc xuất file Excel 2 Sheet chuẩn CQT để lưu trữ.
                    </p>
                  </div>
                </div>
              )}

              {/* ── VIEW 2: PHỤ LỤC 01-2/BK-HĐKD BẢNG KÊ HOẠT ĐỘNG KINH DOANH ── */}
              {cnkdViewMode === 'appendix' && (
                <div className="space-y-6 animate-in fade-in">
                  {/* PHẦN I: BẢNG KÊ VẬT LIỆU, DỤNG CỤ, SẢN PHẨM, HÀNG HÓA */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs uppercase text-zinc-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                        I. Bảng kê vật liệu, dụng cụ, sản phẩm, hàng hóa (Tồn đầu, Nhập, Xuất, Tồn cuối)
                      </h4>
                      <span className="text-[11px] text-zinc-500">
                        {bkhdkdData.inventoryRows.length} mặt hàng trong kho
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex sm:hidden items-center justify-between px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-[11px] text-indigo-900 font-medium shadow-2xs">
                        <span className="flex items-center gap-1.5">
                          👉 <b>Kéo sang phải</b> để xem đủ 11 cột xuất - nhập - tồn kho
                        </span>
                        <span className="text-[10px] bg-indigo-200/70 text-indigo-950 px-1.5 py-0.5 rounded font-bold font-mono">11 Cột</span>
                      </div>
                      <div className="border border-zinc-200 rounded-xl overflow-x-auto overscroll-x-contain">
                        <table className="w-full text-xs text-left min-w-[820px]">
                          <thead>
                            <tr className="bg-zinc-100 text-center font-bold text-zinc-700 border-b border-zinc-200">
                              <th rowSpan={2} className="p-2 w-10 shrink-0">STT</th>
                              <th rowSpan={2} className="p-2 text-left min-w-[150px]">Tên hàng hóa, dịch vụ</th>
                              <th rowSpan={2} className="p-2 w-14 shrink-0">ĐVT</th>
                              <th colSpan={2} className="p-1 border-l border-zinc-200">Tồn đầu kỳ</th>
                              <th colSpan={2} className="p-1 border-l border-zinc-200">Nhập trong kỳ</th>
                              <th colSpan={2} className="p-1 border-l border-zinc-200">Xuất trong kỳ</th>
                              <th colSpan={2} className="p-1 border-l border-zinc-200">Tồn cuối kỳ</th>
                            </tr>
                            <tr className="bg-zinc-50 text-center font-bold text-zinc-600 text-[11px] border-b border-zinc-200">
                              <th className="p-1.5 w-14 border-l border-zinc-200 shrink-0">Lượng</th>
                              <th className="p-1.5 w-24 shrink-0">Tiền (VNĐ)</th>
                              <th className="p-1.5 w-14 border-l border-zinc-200 shrink-0">Lượng</th>
                              <th className="p-1.5 w-24 shrink-0">Tiền (VNĐ)</th>
                              <th className="p-1.5 w-14 border-l border-zinc-200 shrink-0">Lượng</th>
                              <th className="p-1.5 w-24 shrink-0">Tiền (VNĐ)</th>
                              <th className="p-1.5 w-14 border-l border-zinc-200 shrink-0">Lượng</th>
                              <th className="p-1.5 w-28 shrink-0">Tiền (VNĐ)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 font-medium">
                            {bkhdkdData.inventoryRows.length === 0 ? (
                              <tr>
                                <td colSpan={11} className="p-4 text-center italic text-zinc-500">
                                  Chưa phát sinh tồn kho vật tư trong kỳ này.
                                </td>
                              </tr>
                            ) : (
                              bkhdkdData.inventoryRows.slice(0, 30).map((r) => (
                                <tr key={r.stt} className="hover:bg-zinc-50">
                                  <td className="p-2 text-center text-zinc-500">{r.stt}</td>
                                  <td className="p-2 font-semibold text-zinc-900">{r.item_name}</td>
                                  <td className="p-2 text-center text-zinc-600">{r.unit}</td>
                                  <td className="p-2 text-right border-l border-zinc-200">{r.opening_qty.toLocaleString('vi-VN')}</td>
                                  <td className="p-2 text-right">{r.opening_amount.toLocaleString('vi-VN')}</td>
                                  <td className="p-2 text-right border-l border-zinc-200">{r.in_qty.toLocaleString('vi-VN')}</td>
                                  <td className="p-2 text-right">{r.in_amount.toLocaleString('vi-VN')}</td>
                                  <td className="p-2 text-right border-l border-zinc-200">{r.out_qty.toLocaleString('vi-VN')}</td>
                                  <td className="p-2 text-right">{r.out_amount.toLocaleString('vi-VN')}</td>
                                  <td className="p-2 text-right border-l border-zinc-200">{r.closing_qty.toLocaleString('vi-VN')}</td>
                                  <td className="p-2 text-right font-bold text-zinc-900">{r.closing_amount.toLocaleString('vi-VN')}</td>
                                </tr>
                              ))
                            )}
                            <tr className="font-black bg-zinc-100 border-t-2 border-zinc-300 text-zinc-900">
                              <td colSpan={4} className="p-2.5 uppercase">TỔNG CỘNG GIÁ TRỊ TỒN KHO VẬT TƯ</td>
                              <td className="p-2.5 text-right">
                                {bkhdkdData.inventoryRows.reduce((s, r) => s + r.opening_amount, 0).toLocaleString('vi-VN')} đ
                              </td>
                              <td className="p-2.5 text-center">-</td>
                              <td className="p-2.5 text-right">
                                {bkhdkdData.inventoryRows.reduce((s, r) => s + r.in_amount, 0).toLocaleString('vi-VN')} đ
                              </td>
                              <td className="p-2.5 text-center">-</td>
                              <td className="p-2.5 text-right">
                                {bkhdkdData.inventoryRows.reduce((s, r) => s + r.out_amount, 0).toLocaleString('vi-VN')} đ
                              </td>
                              <td className="p-2.5 text-center">-</td>
                              <td className="p-2.5 text-right text-emerald-800 text-sm">
                                {bkhdkdData.inventoryRows.reduce((s, r) => s + r.closing_amount, 0).toLocaleString('vi-VN')} đ
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* PHẦN II: BẢNG KÊ CHI PHÍ QUẢN LÝ KINH DOANH ([24] - [30]) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs uppercase text-zinc-900 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-600"></span>
                        II. Bảng kê 7 chỉ tiêu chi phí quản lý kinh doanh chuẩn CQT ([24] - [30])
                      </h4>
                      <span className="text-[11px] text-zinc-500">
                        Tự động phân loại từ bảng chi phí tiệm bánh
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex sm:hidden items-center justify-between px-3 py-2 bg-zinc-100 border border-zinc-200 rounded-xl text-[11px] text-zinc-800 font-medium shadow-2xs">
                        <span className="flex items-center gap-1.5">
                          👉 <b>Kéo sang phải</b> để xem đủ số tiền &amp; ghi chú chi phí
                        </span>
                        <span className="text-[10px] bg-zinc-200 text-zinc-900 px-1.5 py-0.5 rounded font-bold font-mono">4 Cột</span>
                      </div>
                      <div className="border border-zinc-200 rounded-xl overflow-x-auto overscroll-x-contain">
                        <table className="w-full text-xs text-left min-w-[640px]">
                          <thead>
                            <tr className="bg-zinc-100 text-zinc-700 font-bold border-b border-zinc-200">
                              <th className="p-3 w-20 text-center shrink-0">Chỉ tiêu</th>
                              <th className="p-3 min-w-[220px]">Tên loại chi phí quản lý kinh doanh</th>
                              <th className="p-3 w-48 text-right shrink-0">Số tiền phát sinh (VNĐ)</th>
                              <th className="p-3 w-56 shrink-0">Ghi chú theo Thông tư 40</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 font-medium">
                            {bkhdkdData.expenseSummaryRaw.map((exp) => (
                              <tr key={exp.indicator_code} className="hover:bg-zinc-50">
                                <td className="p-3 text-center font-mono font-bold text-rose-700">
                                  [{exp.indicator_code}]
                                </td>
                                <td className="p-3 font-semibold text-zinc-900">{exp.name}</td>
                                <td className="p-3 text-right font-bold text-zinc-900">
                                  {exp.amount.toLocaleString('vi-VN')} đ
                                </td>
                                <td className="p-3 text-zinc-500 text-xs italic">{exp.note}</td>
                              </tr>
                            ))}
                            <tr className="font-black bg-amber-100/70 border-t-2 border-amber-300 text-amber-950">
                              <td colSpan={2} className="p-3 uppercase">
                                TỔNG CHI PHÍ QUẢN LÝ KINH DOANH TRONG KỲ ([24] đến [30])
                              </td>
                              <td className="p-3 text-right text-base text-amber-950">
                                {bkhdkdData.expenseSummary.total_cost.toLocaleString('vi-VN')} đ
                              </td>
                              <td className="p-3 text-xs italic text-amber-800">Toàn bộ chi phí hợp lệ</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* ── SUB-TAB 6: BỘ SỔ KHÁC (S1A, S2B, S3A) ── */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {activeBookTab === 'other_books' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          
          {/* S1a-HKD */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 text-xs font-bold">Mẫu S1a-HKD</span>
                <span className="text-xs text-zinc-400">TT 88/2021</span>
              </div>
              <h4 className="font-bold text-zinc-900 text-sm mt-3">
                Sổ Doanh Thu Bán Hàng Hóa, Dịch Vụ
              </h4>
              <p className="text-xs text-zinc-500 mt-1">
                Dành riêng cho cá nhân kinh doanh thuộc đối tượng không chịu thuế (doanh thu dưới ngưỡng).
              </p>
            </div>
            <button
              onClick={() => handleOpenPrint('S1a-HKD')}
              className="mt-5 w-full py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Mẫu S1a-HKD</span>
            </button>
          </div>

          {/* S2b-HKD */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-bold">Mẫu S2b-HKD</span>
                <span className="text-xs text-zinc-400">TT 88/2021</span>
              </div>
              <h4 className="font-bold text-zinc-900 text-sm mt-3">
                Sổ Chi Tiết Doanh Thu (GTGT % &amp; TNCN Thu Nhập)
              </h4>
              <p className="text-xs text-zinc-500 mt-1">
                Dành cho hộ kinh doanh nộp thuế GTGT theo % doanh thu và thuế TNCN tính trên thu nhập chịu thuế (Doanh thu - Chi phí).
              </p>
            </div>
            <button
              onClick={() => handleOpenPrint('S2b-HKD')}
              className="mt-5 w-full py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Mẫu S2b-HKD</span>
            </button>
          </div>

          {/* S3a-HKD */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200/80 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-xs font-bold">Mẫu S3a-HKD</span>
                <span className="text-xs text-zinc-400">TT 88/2021</span>
              </div>
              <h4 className="font-bold text-zinc-900 text-sm mt-3">
                Sổ Theo Dõi Nghĩa Vụ Thuế Khác
              </h4>
              <p className="text-xs text-zinc-500 mt-1">
                Theo dõi việc thực hiện nghĩa vụ nộp Lệ phí môn bài, thuế sử dụng đất phi nông nghiệp và các khoản nộp ngân sách nhà nước khác.
              </p>
            </div>
            <button
              onClick={() => handleOpenPrint('S3a-HKD')}
              className="mt-5 w-full py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Mẫu S3a-HKD</span>
            </button>
          </div>

        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {/* ── SUB-TAB 7: CẤU HÌNH THUẾ & HỘ KINH DOANH ── */}
      {/* ════════════════════════════════════════════════════════════════════════════ */}
      {activeBookTab === 'settings' && (
        <div className="space-y-6 animate-in fade-in">
          
          {/* HEADER TAB CÀI ĐẶT */}
          <div className="bg-white rounded-2xl p-5 border border-zinc-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-black text-zinc-900 flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-600" />
                <span>Cấu Hình Pháp Lý Hộ Kinh Doanh &amp; Cơ Chế Biểu Mẫu Thuế</span>
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Dữ liệu tự động đồng bộ 100% lên CSDL Cloud SQL &amp; Local SQL trong nền mà không cần thao tác thủ công.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  setIsRefreshingSql(true);
                  const cloudPolicy = await fetchTaxPolicyConfigFromDb();
                  if (cloudPolicy) {
                    setTaxPolicy(cloudPolicy);
                    saveTaxPolicyConfig(cloudPolicy);
                    setSqlNotice('Đã cập nhật biểu mẫu & chính sách thuế mới nhất từ Cloud SQL!');
                    setTimeout(() => setSqlNotice(null), 4000);
                  }
                  setIsRefreshingSql(false);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 text-xs font-bold transition cursor-pointer"
                title="Cập nhật biểu mẫu và tỷ lệ thuế mới nhất từ máy chủ đám mây"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSql ? 'animate-spin' : ''}`} />
                <span>Cập Nhật Từ Cloud (1-Click)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── CỘT 1: THÔNG TIN PHÁP LÝ HỘ KINH DOANH CHUẨN THÔNG TƯ 40 ── */}
            <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-xs space-y-4">
              <div className="border-b border-zinc-100 pb-3">
                <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-amber-600" />
                  <span>1. Định Danh Hộ Kinh Doanh (Chỉ Tiêu [01]-[15])</span>
                </h4>
                <p className="text-xs text-zinc-500">
                  Xuất hiện tự động trên tiêu đề 7 sổ kế toán và tờ khai nộp thuế điện tử
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSaveBusinessInfo(e);
                }}
                className="space-y-3 text-xs"
              >
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    [02] Tên Hộ Kinh Doanh / Tiệm Bánh
                  </label>
                  <input
                    type="text"
                    value={businessInfo.shop_name}
                    onChange={(e) => {
                      const upd = { ...businessInfo, shop_name: e.target.value };
                      setBusinessInfo(upd);
                      saveHouseholdBusinessInfo(upd);
                      triggerTaxAutoSyncToDb(upd, taxPolicy);
                    }}
                    className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      [03] Mã Số Thuế (MST)
                    </label>
                    <input
                      type="text"
                      value={businessInfo.tax_code}
                      onChange={(e) => {
                        const upd = { ...businessInfo, tax_code: e.target.value };
                        setBusinessInfo(upd);
                        saveHouseholdBusinessInfo(upd);
                        triggerTaxAutoSyncToDb(upd, taxPolicy);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      [02] Đại Diện Pháp Luật
                    </label>
                    <input
                      type="text"
                      value={businessInfo.owner_name}
                      onChange={(e) => {
                        const upd = { ...businessInfo, owner_name: e.target.value };
                        setBusinessInfo(upd);
                        saveHouseholdBusinessInfo(upd);
                        triggerTaxAutoSyncToDb(upd, taxPolicy);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    [04] Địa Chỉ Kinh Doanh
                  </label>
                  <input
                    type="text"
                    value={businessInfo.business_address}
                    onChange={(e) => {
                      const upd = { ...businessInfo, business_address: e.target.value };
                      setBusinessInfo(upd);
                      saveHouseholdBusinessInfo(upd);
                      triggerTaxAutoSyncToDb(upd, taxPolicy);
                    }}
                    className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      [06] Số Điện Thoại
                    </label>
                    <input
                      type="text"
                      value={businessInfo.phone}
                      onChange={(e) => {
                        const upd = { ...businessInfo, phone: e.target.value };
                        setBusinessInfo(upd);
                        saveHouseholdBusinessInfo(upd);
                        triggerTaxAutoSyncToDb(upd, taxPolicy);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      [11] Email Giao Dịch Cơ Quan Thuế
                    </label>
                    <input
                      type="email"
                      placeholder="tiembanh@example.com"
                      value={businessInfo.email || ''}
                      onChange={(e) => {
                        const upd = { ...businessInfo, email: e.target.value };
                        setBusinessInfo(upd);
                        saveHouseholdBusinessInfo(upd);
                        triggerTaxAutoSyncToDb(upd, taxPolicy);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      [12] Diện Tích Kinh Doanh (m²)
                    </label>
                    <input
                      type="number"
                      placeholder="VD: 45"
                      value={businessInfo.business_area || ''}
                      onChange={(e) => {
                        const upd = { ...businessInfo, business_area: Number(e.target.value) || 0 };
                        setBusinessInfo(upd);
                        saveHouseholdBusinessInfo(upd);
                        triggerTaxAutoSyncToDb(upd, taxPolicy);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      [13] Lao Động Thường Xuyên (người)
                    </label>
                    <input
                      type="number"
                      placeholder="VD: 3"
                      value={businessInfo.regular_employees_count || 1}
                      onChange={(e) => {
                        const upd = { ...businessInfo, regular_employees_count: Number(e.target.value) || 1 };
                        setBusinessInfo(upd);
                        saveHouseholdBusinessInfo(upd);
                        triggerTaxAutoSyncToDb(upd, taxPolicy);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      [14] Số Tài Khoản Ngân Hàng KD
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 1903847291823"
                      value={businessInfo.bank_account_number || ''}
                      onChange={(e) => {
                        const upd = { ...businessInfo, bank_account_number: e.target.value };
                        setBusinessInfo(upd);
                        saveHouseholdBusinessInfo(upd);
                        triggerTaxAutoSyncToDb(upd, taxPolicy);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-zinc-700 mb-1">
                      [14] Tên Ngân Hàng
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Vietcombank / Techcombank"
                      value={businessInfo.bank_name || ''}
                      onChange={(e) => {
                        const upd = { ...businessInfo, bank_name: e.target.value };
                        setBusinessInfo(upd);
                        saveHouseholdBusinessInfo(upd);
                        triggerTaxAutoSyncToDb(upd, taxPolicy);
                      }}
                      className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-zinc-700 mb-1">
                    [15] Phần Mềm Bán Hàng / Kế Toán Kết Nối CQT
                  </label>
                  <input
                    type="text"
                    value={businessInfo.software_name || 'Bakery POS & ERP System (Tích Hợp HDDT Khởi Tạo Máy Tính Tiền)'}
                    onChange={(e) => {
                      const upd = { ...businessInfo, software_name: e.target.value };
                      setBusinessInfo(upd);
                      saveHouseholdBusinessInfo(upd);
                      triggerTaxAutoSyncToDb(upd, taxPolicy);
                    }}
                    className="w-full px-3 py-2 bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1 text-emerald-700 font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Tự động lưu &amp; đồng bộ SQL khi nhập
                  </span>
                  <span>Đồng bộ lúc: {lastSyncTime}</span>
                </div>
              </form>
            </div>

            {/* ── CỘT 2: CƠ CHẾ CẬP NHẬT BIỂU MẪU THUẾ KHI NHÀ NƯỚC THAY ĐỔI ── */}
            <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-xs space-y-5">
              <div className="border-b border-zinc-100 pb-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>2. Cơ Chế Cập Nhật Biểu Mẫu CQT Mới</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    Linh Hoạt 100%
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Xử lý trường hợp Cơ quan thuế ban hành Thông tư mới hoặc gửi file Excel biểu mẫu thay đổi
                </p>
              </div>

              {/* A. Chọn Bộ Mẫu Quy Định Định Sẵn (Presets) */}
              <div className="space-y-2 text-xs">
                <label className="block font-bold text-zinc-800">
                  A. Chọn gói quy định pháp luật:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const p = PRESET_TAX_POLICIES['2026_ND141_TT50'];
                      setTaxPolicy(p);
                      saveTaxPolicyConfig(p);
                      triggerTaxAutoSyncToDb(businessInfo, p);
                      setSqlNotice('Đã áp dụng gói chính sách mới 2026 (Nghị định 141 & Thông tư 50)!');
                      setTimeout(() => setSqlNotice(null), 4000);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      taxPolicy.version === '2026.1'
                        ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold shadow-2xs'
                        : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">Mới Nhất 2026 (NĐ 141)</span>
                      {taxPolicy.version === '2026.1' && (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </div>
                    <p className="text-[11px] font-normal text-zinc-500 mt-1">
                      Ngưỡng miễn thuế 1 Tỷ/năm, bãi bỏ thuế khoán &amp; môn bài, Mẫu 01/TKN &amp; 01/CNKD.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const p = PRESET_TAX_POLICIES['TT40_2021'];
                      setTaxPolicy(p);
                      saveTaxPolicyConfig(p);
                      triggerTaxAutoSyncToDb(businessInfo, p);
                      setSqlNotice('Đã áp dụng Thông tư 40/2021/TT-BTC!');
                      setTimeout(() => setSqlNotice(null), 4000);
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      taxPolicy.version === '2021.1'
                        ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold shadow-2xs'
                        : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">Thông Tư 40/2021/TT-BTC</span>
                      {taxPolicy.version === '2021.1' && (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </div>
                    <p className="text-[11px] font-normal text-zinc-500 mt-1">
                      Ngưỡng truyền thống 100 Triệu/năm, kê khai theo % doanh thu.
                    </p>
                  </button>
                </div>
              </div>

              {/* B. Điều chỉnh thông số trực tiếp trên giao diện */}
              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3 text-xs">
                <span className="font-bold text-zinc-800 block">
                  B. Điều chỉnh trực tiếp ngưỡng &amp; tỷ lệ thuế:
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-zinc-600 font-semibold mb-1">
                      Ngưỡng Miễn Thuế (VNĐ)
                    </label>
                    <input
                      type="number"
                      step={50000000}
                      value={taxPolicy.annual_threshold}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        const upd: TaxPolicyConfig = { ...taxPolicy, annual_threshold: val };
                        setTaxPolicy(upd);
                        saveTaxPolicyConfig(upd);
                        triggerTaxAutoSyncToDb(businessInfo, upd);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-zinc-300 font-bold text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-600 font-semibold mb-1">
                      Thuế GTGT Bánh (%)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={taxPolicy.tax_groups?.find(g => g.id === 3)?.vat_percent ?? 3}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0;
                        const groups = (taxPolicy.tax_groups || TAX_BUSINESS_GROUPS).map(g =>
                          g.id === 3 ? { ...g, vat_percent: v } : g
                        );
                        const upd: TaxPolicyConfig = { ...taxPolicy, tax_groups: groups };
                        setTaxPolicy(upd);
                        saveTaxPolicyConfig(upd);
                        triggerTaxAutoSyncToDb(businessInfo, upd);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-zinc-300 font-bold text-emerald-800"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-600 font-semibold mb-1">
                      Thuế TNCN Bánh (%)
                    </label>
                    <input
                      type="number"
                      step={0.1}
                      value={taxPolicy.tax_groups?.find(g => g.id === 3)?.pit_percent ?? 1.5}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0;
                        const groups = (taxPolicy.tax_groups || TAX_BUSINESS_GROUPS).map(g =>
                          g.id === 3 ? { ...g, pit_percent: v } : g
                        );
                        const upd: TaxPolicyConfig = { ...taxPolicy, tax_groups: groups };
                        setTaxPolicy(upd);
                        saveTaxPolicyConfig(upd);
                        triggerTaxAutoSyncToDb(businessInfo, upd);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-zinc-300 font-bold text-blue-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-600 font-semibold mb-1">
                    Căn Cứ Văn Bản Pháp Lý (Tiêu ngữ in trên biểu mẫu)
                  </label>
                  <input
                    type="text"
                    value={taxPolicy.circular_citation}
                    onChange={(e) => {
                      const upd: TaxPolicyConfig = { ...taxPolicy, circular_citation: e.target.value };
                      setTaxPolicy(upd);
                      saveTaxPolicyConfig(upd);
                      triggerTaxAutoSyncToDb(businessInfo, upd);
                    }}
                    className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-zinc-300 font-medium text-zinc-800 text-xs"
                  />
                </div>
              </div>

              {/* C. Cơ chế nạp File Excel Mẫu Của Cơ Quan Thuế (Excel Auto-Fill) */}
              <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    <span>C. Nạp File Excel Mẫu Do Cơ Quan Thuế Ban Hành:</span>
                  </span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                    Tự Động Điền Ô
                  </span>
                </div>
                <p className="text-emerald-900 text-[11px] leading-relaxed">
                  Khi Chi cục Thuế ban hành file Excel biểu mẫu mới (không có dạng JSON), bạn chỉ cần chọn file mẫu trống đó tại đây. Phần mềm sẽ tự động map và điền đầy đủ dữ liệu tiệm bánh vào đúng các ô [01]-[35] và [24]-[30], giữ nguyên định dạng chuẩn của CQT!
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition cursor-pointer">
                    <Download className="w-3.5 h-3.5" />
                    <span>Chọn File Excel Mẫu CQT (.xlsx / .xls)</span>
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setExcelUploadNotice('Đang đọc mẫu Excel và tự động điền số liệu...');
                        const res = await autoFillCqtExcelTemplate(
                          file,
                          businessInfo,
                          periodLabel,
                          s2aData.summary,
                          s2aData,
                          bkhdkdData
                        );
                        if (res.success) {
                          setExcelUploadNotice('Đã điền thành công dữ liệu vào mẫu Excel CQT và tải xuống!');
                          setTimeout(() => setExcelUploadNotice(null), 5000);
                        } else {
                          setExcelUploadNotice('Lỗi xử lý file Excel: ' + (res.message || 'Vui lòng kiểm tra lại file'));
                        }
                      }}
                    />
                  </label>

                  {excelUploadNotice && (
                    <span className="text-xs font-semibold text-emerald-900 animate-in fade-in">
                      {excelUploadNotice}
                    </span>
                  )}
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* ── MODAL CHỈNH SỬA THÔNG TIN HỘ KINH DOANH NHANH ── */}
      {isEditInfoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-zinc-200 space-y-4">
            <h3 className="font-bold text-base text-zinc-900">
              Cập Nhật Thông Tin Hộ Kinh Doanh
            </h3>
            <form onSubmit={handleSaveBusinessInfo} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Tên Tiệm / Hộ KD</label>
                <input
                  type="text"
                  value={tempInfo.shop_name}
                  onChange={(e) => setTempInfo({ ...tempInfo, shop_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Mã Số Thuế</label>
                  <input
                    type="text"
                    value={tempInfo.tax_code}
                    onChange={(e) => setTempInfo({ ...tempInfo, tax_code: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 rounded-xl border border-zinc-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">Đại Diện Pháp Luật</label>
                  <input
                    type="text"
                    value={tempInfo.owner_name}
                    onChange={(e) => setTempInfo({ ...tempInfo, owner_name: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 mb-1">Địa Chỉ Kinh Doanh</label>
                <input
                  type="text"
                  value={tempInfo.business_address}
                  onChange={(e) => setTempInfo({ ...tempInfo, business_address: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-zinc-50 rounded-xl border border-zinc-200 font-semibold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  disabled={isSqlSaving}
                  onClick={() => setIsEditInfoModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSqlSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white shadow-xs transition cursor-pointer"
                >
                  {isSqlSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang Lưu SQL...</span>
                    </>
                  ) : (
                    <>
                      <Database className="w-3.5 h-3.5" />
                      <span>Lưu &amp; Đồng Bộ SQL</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL XEM TRƯỚC VÀ IN BẢN CHUẨN A4 ── */}
      {isPrintModalOpen && (
        <TaxBookPrintView
          info={businessInfo}
          periodLabel={periodLabel}
          bookCode={currentPrintBook}
          rows={s2aData.rows}
          summary={s2aData.summary}
          totals={s2aData}
          policy={taxPolicy}
          inventoryRows={bkhdkdData.inventoryRows}
          expenseSummary={bkhdkdData.expenseSummaryRaw}
          s2eRows={s2eData.rows}
          s2eTotals={s2eData}
          onClose={() => setIsPrintModalOpen(false)}
        />
      )}

    </div>
  );
};
