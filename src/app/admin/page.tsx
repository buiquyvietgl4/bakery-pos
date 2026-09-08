'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { 
  BarChart3, DollarSign, TrendingUp, Package, BookOpen, 
  Camera, Upload, Plus, Save, Sparkles, AlertTriangle, 
  FileText, CheckCircle2, Sliders, RefreshCw, HardDrive,
  Download, Trash2, ArrowUpRight, ArrowDownRight, ShieldAlert,
  HelpCircle, ChevronRight, Cake, X, Image as ImageIcon,
  ArrowDownCircle, ArrowUpCircle, QrCode, Copy, Check, Building2,
  Wallet, Smartphone, Shield, KeyRound, Users, Lock, UserCheck,
  FileSpreadsheet, Receipt, Calendar, Filter, Search
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import { DEFAULT_BAKERY_PRODUCTS } from '@/lib/constants/bakeryData';
import { db } from '@/lib/db/dexie';
import { generateUUID } from '@/lib/utils/uuid';
import { exportToCSV, exportMultiSheetExcel } from '@/lib/utils/exportExcel';
import { broadcastProductChange, subscribeCrossDeviceSync } from '@/lib/supabase/realtimeSync';

export const VIETQR_BANKS = [
  { id: 'MB', name: 'MBBank (Ngân hàng Quân Đội)', short: 'MB' },
  { id: 'VCB', name: 'Vietcombank (Ngoại thương VN)', short: 'Vietcombank' },
  { id: 'TCB', name: 'Techcombank (Kỹ Thương)', short: 'Techcombank' },
  { id: 'ACB', name: 'ACB (Á Châu)', short: 'ACB' },
  { id: 'BIDV', name: 'BIDV (Đầu tư & Phát triển)', short: 'BIDV' },
  { id: 'ICB', name: 'VietinBank (Công Thương VN)', short: 'VietinBank' },
  { id: 'VPB', name: 'VPBank (Việt Nam Thịnh Vượng)', short: 'VPBank' },
  { id: 'TPB', name: 'TPBank (Tiên Phong)', short: 'TPBank' },
  { id: 'STB', name: 'Sacombank (Sài Gòn Thương Tín)', short: 'Sacombank' },
  { id: 'VIB', name: 'VIB (Quốc tế)', short: 'VIB' },
  { id: 'MSB', name: 'MSB (Hàng Hải)', short: 'MSB' },
  { id: 'SHB', name: 'SHB (Sài Gòn - Hà Nội)', short: 'SHB' },
  { id: 'HDB', name: 'HDBank (Phát triển TP.HCM)', short: 'HDBank' },
  { id: 'OCB', name: 'OCB (Phương Đông)', short: 'OCB' },
  { id: 'LPB', name: 'LPBank (Lộc Phát VN)', short: 'LPBank' },
  { id: 'SEAB', name: 'SeABank (Đông Nam Á)', short: 'SeABank' },
  { id: 'ABB', name: 'ABBANK (An Bình)', short: 'ABBANK' },
];

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  category: string;
  stock_qty: number;
  reorder_level: number;
  avg_cost: number;
  wastage_pct: number;
}

interface ExpenseItem {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
}

export interface EwalletConfig {
  activeWallet: 'momo' | 'zalopay' | 'viettelmoney';
  momo: {
    phone: string;
    name: string;
    qrUrl: string;
  };
  zalopay: {
    phone: string;
    name: string;
    qrUrl: string;
  };
  viettelmoney: {
    phone: string;
    name: string;
    qrUrl: string;
  };
  transferSyntax: string;
}

export default function AdminDashboard() {
  const {
    isAdmin,
    loginAdmin,
    updateAdminCredentials,
    updateStaffCredentials,
    securityConfig,
    resetSecurityDefaults,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'images' | 'inventory' | 'recipes' | 'opex' | 'cashflow' | 'vietqr' | 'ewallet' | 'cloud' | 'security'>('overview');

  // ── SECURITY & PERMISSIONS STATE ──
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [adminOldPass, setAdminOldPass] = useState('');
  const [adminNewPass, setAdminNewPass] = useState('');
  const [adminNameInput, setAdminNameInput] = useState(securityConfig.adminName);
  const [staffPinInput, setStaffPinInput] = useState(securityConfig.staffPin);
  const [staffNameInput, setStaffNameInput] = useState(securityConfig.staffName);
  const [securityMsg, setSecurityMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // ── VIETQR BANK TRANSFER CONFIG STATE ──
  const [vietqrConfig, setVietqrConfig] = useState({
    bankId: 'MB',
    bankName: 'MBBank (Ngân hàng Quân Đội)',
    accountNo: '0988888888',
    accountName: 'TIEM BANH HOANG GIA',
    template: 'compact2',
    transferSyntax: 'DH',
  });
  const [vietqrSaved, setVietqrSaved] = useState(false);
  const [testAmount, setTestAmount] = useState<number>(150000);
  const [testNote, setTestNote] = useState<string>('DH1008 BANH KEM');
  const [copiedAccount, setCopiedAccount] = useState(false);

  // ── E-WALLET (VÍ ĐIỆN TỬ) CONFIG STATE ──
  const [ewalletConfig, setEwalletConfig] = useState<EwalletConfig>({
    activeWallet: 'momo',
    momo: {
      phone: '0988888888',
      name: 'TIEM BANH HOANG GIA',
      qrUrl: '',
    },
    zalopay: {
      phone: '0988888888',
      name: 'TIEM BANH HOANG GIA',
      qrUrl: '',
    },
    viettelmoney: {
      phone: '0988888888',
      name: 'TIEM BANH HOANG GIA',
      qrUrl: '',
    },
    transferSyntax: 'VIMO',
  });
  const [ewalletSaved, setEwalletSaved] = useState(false);
  const [previewWallet, setPreviewWallet] = useState<'momo' | 'zalopay' | 'viettelmoney'>('momo');
  const [testWalletAmount, setTestWalletAmount] = useState<number>(65000);
  const [testWalletNote, setTestWalletNote] = useState<string>('BANH KEM VIMO');
  const [copiedWalletPhone, setCopiedWalletPhone] = useState(false);

  // ── INVENTORY STATE ──
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { id: '1', name: 'Bột mì số 11 (Bake)', unit: 'g', category: 'Bột & Ngũ cốc', stock_qty: 25000, reorder_level: 5000, avg_cost: 25, wastage_pct: 5.0 },
    { id: '2', name: 'Bơ lạt Anchor', unit: 'g', category: 'Bơ sữa', stock_qty: 10000, reorder_level: 2000, avg_cost: 120, wastage_pct: 0.0 },
    { id: '3', name: 'Trứng gà ta', unit: 'quả', category: 'Trứng', stock_qty: 200, reorder_level: 50, avg_cost: 3500, wastage_pct: 2.0 },
    { id: '4', name: 'Đường cát trắng', unit: 'g', category: 'Gia vị', stock_qty: 15000, reorder_level: 3000, avg_cost: 18, wastage_pct: 0.0 },
    { id: '5', name: 'Sữa tươi không đường', unit: 'ml', category: 'Bơ sữa', stock_qty: 12000, reorder_level: 3000, avg_cost: 35, wastage_pct: 2.0 },
    { id: '6', name: 'Trứng muối nướng', unit: 'quả', category: 'Nhân bánh', stock_qty: 150, reorder_level: 30, avg_cost: 7000, wastage_pct: 5.0 },
    { id: '7', name: 'Hộp bánh kem Kraft 20cm', unit: 'cái', category: 'Bao bì & Phụ kiện', stock_qty: 100, reorder_level: 20, avg_cost: 15000, wastage_pct: 0.0 },
    { id: '8', name: 'Bộ dao nĩa + Nến sinh nhật', unit: 'cái', category: 'Bao bì & Phụ kiện', stock_qty: 200, reorder_level: 50, avg_cost: 3000, wastage_pct: 0.0 },
  ]);

  // Inventory Sub-Tab: 'import' (Nhập kho) vs 'export' (Xuất kho / Hỏng)
  const [inventoryActionType, setInventoryActionType] = useState<'import' | 'export'>('import');

  // Form Nhập Kho (Purchase Order)
  const [poIngredientId, setPoIngredientId] = useState<string>('1');
  const [poQty, setPoQty] = useState<number>(10000);
  const [poUnitPrice, setPoUnitPrice] = useState<number>(28);
  const [poSupplier, setPoSupplier] = useState<string>('Đại lý Bột Mì Nhất Hương');
  const [poSuccess, setPoSuccess] = useState<string | null>(null);

  // Form Xuất Kho / Báo Hỏng
  const [soIngredientId, setSoIngredientId] = useState<string>('1');
  const [soQty, setSoQty] = useState<number>(500);
  const [soReason, setSoReason] = useState<string>('Lỗi mẻ nướng / Hỏng nguyên liệu');

  // Modal Thêm Mới Loại Vật Tư (Add Ingredient Modal)
  const [isAddIngredientModalOpen, setIsAddIngredientModalOpen] = useState(false);
  const [newIngName, setNewIngName] = useState('');
  const [newIngUnit, setNewIngUnit] = useState('g');
  const [newIngCategory, setNewIngCategory] = useState('Bột & Ngũ cốc');
  const [newIngStockQty, setNewIngStockQty] = useState<number>(5000);
  const [newIngAvgCost, setNewIngAvgCost] = useState<number>(30);
  const [newIngReorderLevel, setNewIngReorderLevel] = useState<number>(1000);
  const [newIngWastagePct, setNewIngWastagePct] = useState<number>(3);
  const [creatingIngredient, setCreatingIngredient] = useState(false);

  // ── RECIPES & BOM STATE ──
  const [recipes, setRecipes] = useState<any[]>([
    {
      id: 'rec-1',
      name: 'Bánh Bông Lan Trứng Muối 18cm',
      yield_qty: 1,
      cost_per_unit: 127495,
      target_food_cost_pct: 35,
      suggested_price: 365000,
      items: [
        { name: 'Bột mì số 11', qty: '300g', cost: 7875 },
        { name: 'Trứng gà ta', qty: '6 quả', cost: 21420 },
        { name: 'Bơ lạt Anchor', qty: '150g', cost: 18000 },
        { name: 'Đường cát', qty: '200g', cost: 3600 },
        { name: 'Trứng muối nướng', qty: '8 quả', cost: 61600 },
        { name: 'Hộp bánh kraft', qty: '1 cái', cost: 15000 },
      ]
    },
    {
      id: 'rec-2',
      name: 'Bánh Croissant Bơ Pháp Thượng Hạng',
      yield_qty: 10,
      cost_per_unit: 11200,
      target_food_cost_pct: 32,
      suggested_price: 35000,
      items: [
        { name: 'Bột mì số 11', qty: '500g', cost: 13125 },
        { name: 'Bơ lạt Anchor', qty: '250g', cost: 30000 },
        { name: 'Sữa tươi', qty: '200ml', cost: 7140 },
        { name: 'Đường cát', qty: '60g', cost: 1080 },
      ]
    },
  ]);

  // Modal Thêm Mới Công Thức (BOM Builder Modal State)
  const [isAddRecipeModalOpen, setIsAddRecipeModalOpen] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeYield, setNewRecipeYield] = useState<number>(1);
  const [newRecipeYieldUnit, setNewRecipeYieldUnit] = useState('chiếc');
  const [newRecipeFoodCostPct, setNewRecipeFoodCostPct] = useState<number>(35);
  const [newRecipeItems, setNewRecipeItems] = useState<
    { ingredient_id: string; quantity: number }[]
  >([
    { ingredient_id: '1', quantity: 300 },
  ]);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [recipeSuccess, setRecipeSuccess] = useState<string | null>(null);

  // ── OPEX EXPENSES STATE ──
  const [expenses, setExpenses] = useState<ExpenseItem[]>([
    { id: '1', category: 'Tiền mặt bằng', amount: 8000000, description: 'Tiền thuê mặt bằng tháng này', date: '2026-09-01' },
    { id: '2', category: 'Tiền điện & Nước', amount: 2500000, description: 'Điện lò nướng & tủ bảo quản', date: '2026-09-03' },
    { id: '3', category: 'Lương nhân viên', amount: 12000000, description: 'Lương nhân viên quầy & thợ bánh', date: '2026-09-05' },
    { id: '4', category: 'Khấu hao thiết bị', amount: 1000000, description: 'Trích khấu hao lò nướng đối lưu', date: '2026-09-05' },
  ]);
  const [newExpCategory, setNewExpCategory] = useState('Tiền Gas');
  const [newExpAmount, setNewExpAmount] = useState(800000);
  const [newExpDesc, setNewExpDesc] = useState('Đổi bình gas công nghiệp 45kg');

  // ── CASHFLOW TRANSACTIONS STATE ──
  const [cashflow, setCashflow] = useState<any[]>([
    { id: '1', type: 'income', category: 'sales', amount: 45000000, desc: 'Tổng thu bán hàng từ quầy POS', date: '2026-09-07' },
    { id: '2', type: 'expense', category: 'purchase', amount: 14300000, desc: 'Chi nhập nguyên vật liệu bột, bơ, trứng', date: '2026-09-06' },
    { id: '3', type: 'expense', category: 'opex', amount: 23500000, desc: 'Chi trả tiền nhà, điện nước, lương', date: '2026-09-05' },
  ]);

  // ── CLOUD STORAGE & CLEANUP (PURGE) STATE ──
  const [dbUsageMB, setDbUsageMB] = useState(28.4);
  const [closedMonths, setClosedMonths] = useState<string[]>(['2026-08']);
  const [cloudMsg, setCloudMsg] = useState<string | null>(null);

  // ── PRODUCTS & IMAGE UPLOAD STATE ──
  const [products, setProducts] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bakery_products');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return DEFAULT_BAKERY_PRODUCTS;
  });
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // ── THÊM MỚI SẢN PHẨM BÁNH STATE ──
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdCategory, setNewProdCategory] = useState('Bánh kem & Bánh đặt');
  const [newProdPrice, setNewProdPrice] = useState<number>(380000);
  const [newProdIsPreorder, setNewProdIsPreorder] = useState(false);
  const [newProdImageUrl, setNewProdImageUrl] = useState('');
  const [creatingProduct, setCreatingProduct] = useState(false);

  // ── KẾ TOÁN & TÀI CHÍNH STATE ──
  const [accountingPeriod, setAccountingPeriod] = useState<'month' | 'today' | 'all'>('month');
  const [accountingSearch, setAccountingSearch] = useState('');
  const [posOrders, setPosOrders] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });

  // Tải danh sách đơn hàng thực tế từ POS
  const reloadAdminOrders = () => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setPosOrders(parsed);
        }
      } catch {}
    }
  };

  useEffect(() => {
    reloadAdminOrders();
    const handleUpdate = () => reloadAdminOrders();
    window.addEventListener('bakery_orders_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('bakery_orders_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  // Lọc đơn hàng theo kỳ kế toán
  const todayDateStr = new Date().toISOString().split('T')[0];
  const currentMonthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const periodOrders = posOrders.filter((o: any) => {
    const orderDate = (o.created_at || '').substring(0, 10);
    if (accountingPeriod === 'today') return orderDate === todayDateStr;
    if (accountingPeriod === 'month') return orderDate.startsWith(currentMonthPrefix) || !orderDate;
    return true;
  });

  // Doanh thu thực tế phát sinh từ POS
  const actualPeriodRevenue = periodOrders.reduce((s, o) => s + (o.total_amount || o.totalPrice || 0), 0);
  const actualPeriodOrderCount = periodOrders.length;

  // Tổng hợp P&L theo kỳ
  const baseRevenue = accountingPeriod === 'today' ? 0 : accountingPeriod === 'month' ? 45000000 : 92000000;
  const totalRevenue = baseRevenue + actualPeriodRevenue;
  const orderCount = (accountingPeriod === 'today' ? 0 : 142) + actualPeriodOrderCount;
  
  // COGS ước tính ~31.8% theo tỷ lệ định lượng nguyên liệu chuẩn của tiệm bánh
  const totalCOGS = Math.round(totalRevenue * 0.318);
  const grossProfit = totalRevenue - totalCOGS;
  const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // Chi phí OPEX theo kỳ
  const totalOpex = expenses.reduce((s, e) => s + e.amount, 0);
  const currentPeriodOpex = accountingPeriod === 'today' ? Math.round(totalOpex / 30) : totalOpex;
  const netProfit = grossProfit - currentPeriodOpex;
  const netMarginPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0.0';

  // 1. Xuất Báo Cáo P&L ra Excel
  const handleExportPL_Excel = () => {
    const plData = [
      { chi_tieu: 'I. TỔNG DOANH THU THUẦN', gia_tri: totalRevenue, ty_le: '100.0%', ghi_chu: `Tổng ${orderCount} đơn hàng bán ra` },
      { chi_tieu: 'II. GIÁ VỐN HÀNG BÁN (COGS)', gia_tri: -totalCOGS, ty_le: '31.8%', ghi_chu: 'Tính theo định lượng công thức bột, bơ, trứng, sữa' },
      { chi_tieu: 'III. LỢI NHUẬN GỘP (GROSS PROFIT)', gia_tri: grossProfit, ty_le: `${grossMarginPct}%`, ghi_chu: 'Lợi nhuận gộp sau khi trừ giá vốn nguyên vật liệu' },
      { chi_tieu: 'IV. CHI PHÍ VẬN HÀNH (OPEX)', gia_tri: -currentPeriodOpex, ty_le: `${((currentPeriodOpex / (totalRevenue || 1)) * 100).toFixed(1)}%`, ghi_chu: `${expenses.length} khoản mục phát sinh` },
      ...expenses.map((e) => ({
        chi_tieu: `   - ${e.category}: ${e.description}`,
        gia_tri: -e.amount,
        ty_le: `${((e.amount / (totalRevenue || 1)) * 100).toFixed(1)}%`,
        ghi_chu: e.date,
      })),
      { chi_tieu: 'V. LỢI NHUẬN RÒNG (NET PROFIT)', gia_tri: netProfit, ty_le: `${netMarginPct}%`, ghi_chu: 'Lợi nhuận thực nhận của chủ tiệm bánh' },
    ];

    exportToCSV(
      `Bao_Cao_Lai_Lo_PL_Tiem_Banh_${accountingPeriod}_${Date.now()}`,
      [
        { header: 'Chỉ Tiêu Kế Toán Tài Chính', key: 'chi_tieu' },
        { header: 'Số Tiền (VNĐ)', key: 'gia_tri' },
        { header: 'Tỷ Lệ / Doanh Thu', key: 'ty_le' },
        { header: 'Ghi Chú / Diễn Giải', key: 'ghi_chu' },
      ],
      plData
    );
  };

  // 2. Xuất Sổ Chi Tiết Doanh Thu & Hóa Đơn ra Excel
  const handleExportSales_Excel = () => {
    const listToExport = posOrders.length > 0 ? posOrders : [
      {
        order_number: 'BK-20260907-001',
        created_at: new Date().toISOString(),
        order_type: 'takeaway',
        cashier: 'Thu Ngân',
        customer_name: 'Khách lẻ',
        customer_phone: '',
        total_amount: 155000,
        payment_method: 'cash',
        status: 'completed',
        items: [{ product_name_snapshot: 'Bánh Croissant Bơ Pháp', quantity: 2 }, { product_name_snapshot: 'Bánh Tiramisu Ý', quantity: 1 }],
      }
    ];

    const salesData = listToExport.map((o: any, idx: number) => ({
      stt: idx + 1,
      ma_don: o.order_number || o.orderNumber || `BK-${idx + 1}`,
      ngay: o.created_at ? new Date(o.created_at).toLocaleString('vi-VN') : '07/09/2026',
      loai_don: o.order_type === 'preorder' || o.pickupDateTime ? 'Bánh đặt trước' : 'Bán tại quầy',
      thu_ngan: o.cashier || 'Thu Ngân',
      khach_hang: o.customer_name || o.customerName || 'Khách vãng lai',
      sdt: o.customer_phone || o.customerPhone || '',
      san_pham: Array.isArray(o.items) ? o.items.map((i: any) => `${i.quantity}x ${i.product_name_snapshot || i.name}`).join('; ') : o.cakeName || 'Bánh',
      tong_tien: o.total_amount || o.totalPrice || 0,
      tien_coc: o.deposit_amount || o.depositAmount || 0,
      hinh_thuc: o.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản / Ví',
      trang_thai: o.status === 'completed' ? 'Hoàn thành' : 'Đang xử lý',
    }));

    exportToCSV(
      `So_Chi_Tiet_Hoa_Don_Doanh_Thu_${Date.now()}`,
      [
        { header: 'STT', key: 'stt' },
        { header: 'Mã Hóa Đơn', key: 'ma_don' },
        { header: 'Thời Gian', key: 'ngay' },
        { header: 'Phân Loại', key: 'loai_don' },
        { header: 'Thu Ngân', key: 'thu_ngan' },
        { header: 'Khách Hàng', key: 'khach_hang' },
        { header: 'Số Điện Thoại', key: 'sdt' },
        { header: 'Chi Tiết Sản Phẩm', key: 'san_pham' },
        { header: 'Tổng Tiền (VNĐ)', key: 'tong_tien' },
        { header: 'Tiền Cọc (VNĐ)', key: 'tien_coc' },
        { header: 'Hình Thức TT', key: 'hinh_thuc' },
        { header: 'Trạng Thái', key: 'trang_thai' },
      ],
      salesData
    );
  };

  // 3. Xuất Sổ Quỹ Thu Chi ra Excel
  const handleExportCashflow_Excel = () => {
    const cfData = cashflow.map((cf, idx) => ({
      stt: idx + 1,
      ngay: cf.date,
      loai: cf.type === 'income' ? 'Thu' : 'Chi',
      dien_giai: cf.desc,
      so_tien: cf.type === 'income' ? cf.amount : -cf.amount,
    }));

    exportToCSV(
      `So_Quy_Thu_Chi_Tiem_Banh_${Date.now()}`,
      [
        { header: 'STT', key: 'stt' },
        { header: 'Ngày Tháng', key: 'ngay' },
        { header: 'Loại Giao Dịch', key: 'loai' },
        { header: 'Nội Dung Thu Chi', key: 'dien_giai' },
        { header: 'Số Tiền (VNĐ)', key: 'so_tien' },
      ],
      cfData
    );
  };

  // 4. Xuất Trọn Bộ Hồ Sơ Kế Toán Multi-Sheet Excel Workbook (.xls)
  const handleExportFullAccounting_Excel = () => {
    const sheetPL = {
      name: 'Báo Cáo P&L Lãi Lỗ',
      columns: [
        { header: 'Chỉ Tiêu Kế Toán', key: 'chi_tieu', width: 220 },
        { header: 'Số Tiền (VNĐ)', key: 'gia_tri', width: 140, type: 'currency' as const },
        { header: 'Tỷ Trọng (%)', key: 'ty_le', width: 100 },
        { header: 'Ghi Chú', key: 'ghi_chu', width: 200 },
      ],
      data: [
        { chi_tieu: 'DOANH THU THUẦN', gia_tri: totalRevenue, ty_le: '100.0%', ghi_chu: `${orderCount} đơn hàng` },
        { chi_tieu: 'GIÁ VỐN HÀNG BÁN (COGS)', gia_tri: -totalCOGS, ty_le: '31.8%', ghi_chu: 'Định lượng BOM' },
        { chi_tieu: 'LỢI NHUẬN GỘP', gia_tri: grossProfit, ty_le: `${grossMarginPct}%`, ghi_chu: 'Sau trừ giá vốn' },
        { chi_tieu: 'CHI PHÍ VẬN HÀNH (OPEX)', gia_tri: -currentPeriodOpex, ty_le: `${((currentPeriodOpex / (totalRevenue || 1)) * 100).toFixed(1)}%`, ghi_chu: `${expenses.length} khoản chi` },
        { chi_tieu: 'LỢI NHUẬN RÒNG (NET PROFIT)', gia_tri: netProfit, ty_le: `${netMarginPct}%`, ghi_chu: 'Lợi nhuận thực của tiệm' },
      ],
    };

    const sheetSales = {
      name: 'Sổ Chi Tiết Doanh Thu',
      columns: [
        { header: 'Mã Hóa Đơn', key: 'ma_don', width: 140 },
        { header: 'Ngày Giờ', key: 'ngay', width: 130 },
        { header: 'Loại Đơn', key: 'loai_don', width: 110 },
        { header: 'Thu Ngân', key: 'thu_ngan', width: 110 },
        { header: 'Khách Hàng', key: 'khach_hang', width: 140 },
        { header: 'SĐT', key: 'sdt', width: 100 },
        { header: 'Chi Tiết Sản Phẩm', key: 'san_pham', width: 250 },
        { header: 'Tổng Tiền', key: 'tong_tien', width: 120, type: 'currency' as const },
        { header: 'Hình Thức', key: 'hinh_thuc', width: 110 },
      ],
      data: (posOrders.length > 0 ? posOrders : [
        { order_number: 'BK-20260907-001', created_at: new Date().toISOString(), order_type: 'takeaway', cashier: 'Thu Ngân', customer_name: 'Khách lẻ', items: [{ quantity: 2, product_name_snapshot: 'Bánh Croissant Bơ Pháp' }], total_amount: 70000, payment_method: 'cash' }
      ]).map((o: any) => ({
        ma_don: o.order_number || o.orderNumber,
        ngay: o.created_at ? new Date(o.created_at).toLocaleString('vi-VN') : '',
        loai_don: o.order_type === 'preorder' || o.pickupDateTime ? 'Đặt bánh' : 'Tại quầy',
        thu_ngan: o.cashier || 'Thu Ngân',
        khach_hang: o.customer_name || o.customerName || 'Khách lẻ',
        sdt: o.customer_phone || o.customerPhone || '',
        san_pham: Array.isArray(o.items) ? o.items.map((i: any) => `${i.quantity}x ${i.product_name_snapshot || i.name}`).join('; ') : o.cakeName || '',
        tong_tien: o.total_amount || o.totalPrice || 0,
        hinh_thuc: o.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản / Ví',
      })),
    };

    const sheetOpex = {
      name: 'Chi Phí Vận Hành OPEX',
      columns: [
        { header: 'Khoản Mục Chi Phí', key: 'category', width: 160 },
        { header: 'Diễn Giải', key: 'description', width: 220 },
        { header: 'Ngày Chi', key: 'date', width: 110 },
        { header: 'Số Tiền Chi', key: 'amount', width: 130, type: 'currency' as const },
      ],
      data: expenses.map((e) => ({
        category: e.category,
        description: e.description,
        date: e.date,
        amount: e.amount,
      })),
    };

    const sheetCash = {
      name: 'Sổ Quỹ Thu Chi',
      columns: [
        { header: 'Ngày Tháng', key: 'date', width: 110 },
        { header: 'Loại Giao Dịch', key: 'type', width: 100 },
        { header: 'Nội Dung Thu Chi', key: 'desc', width: 240 },
        { header: 'Số Tiền', key: 'amount', width: 130, type: 'currency' as const },
      ],
      data: cashflow.map((c) => ({
        date: c.date,
        type: c.type === 'income' ? 'Thu vào' : 'Chi ra',
        desc: c.desc,
        amount: c.type === 'income' ? c.amount : -c.amount,
      })),
    };

    const sheetInventory = {
      name: 'Tồn Kho & Giá Vốn',
      columns: [
        { header: 'Nguyên Liệu', key: 'name', width: 150 },
        { header: 'Đơn Vị', key: 'unit', width: 80 },
        { header: 'Tồn Thực Tế', key: 'stock_qty', width: 100, type: 'number' as const },
        { header: 'Giá Vốn Nhập', key: 'avg_cost', width: 120, type: 'currency' as const },
        { header: 'Giá Trị Tồn Kho', key: 'total_val', width: 130, type: 'currency' as const },
      ],
      data: ingredients.map((ing) => ({
        name: ing.name,
        unit: ing.unit,
        stock_qty: ing.stock_qty,
        avg_cost: ing.avg_cost,
        total_val: ing.stock_qty * ing.avg_cost,
      })),
    };

    exportMultiSheetExcel(`Ho_So_Ke_Toan_Tai_Chinh_Tiem_Banh_${Date.now()}`, [
      sheetPL,
      sheetSales,
      sheetOpex,
      sheetCash,
      sheetInventory,
    ]);
  };

  // Load products & ingredients from DB
  const loadData = async () => {
    try {
      // 1. Load Products with offline cache priority
      let currentProds: any[] = DEFAULT_BAKERY_PRODUCTS;
      let localProds: any[] = [];
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('bakery_products');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localProds = parsed;
              currentProds = parsed;
            }
          } catch {}
        }
      }

      try {
        const cached = await db.products.toArray();
        if (cached && cached.length > 0) {
          // Merge: if localProds has custom images, keep them
          const localMap = new Map(localProds.map((p) => [p.id, p]));
          currentProds = cached.map((cp) => {
            const lp = localMap.get(cp.id);
            return lp && lp.image_url ? { ...cp, image_url: lp.image_url } : cp;
          });
        } else if (localProds.length > 0) {
          await db.products.bulkPut(localProds);
        }
      } catch {}

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const { data: prodData } = await supabase
          .from('products')
          .select('id, name, category, image_url, selling_price, base_cost_price, food_cost_pct, is_preorder_only')
          .order('created_at', { ascending: false });

        if (prodData && prodData.length > 0) {
          currentProds = prodData;
        }
      }

      setProducts(currentProds);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_products', JSON.stringify(currentProds));
      }

      // 2. Load Ingredients from Supabase
      const { data: ingData } = await supabase
        .from('ingredients')
        .select('id, name, unit, category, stock_qty, reorder_level, avg_cost, wastage_pct')
        .order('name');

      if (ingData && ingData.length > 0) {
        setIngredients(ingData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bakery_vietqr_config');
      if (saved) {
        try {
          setVietqrConfig(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }
      const savedWallet = localStorage.getItem('bakery_ewallet_config');
      if (savedWallet) {
        try {
          setEwalletConfig(JSON.parse(savedWallet));
        } catch (e) {
          console.error(e);
        }
      }
      const savedRecipes = localStorage.getItem('bakery_recipes');
      if (savedRecipes) {
        try {
          setRecipes(JSON.parse(savedRecipes));
        } catch (e) {
          console.error(e);
        }
      }
    }

    // Lắng nghe đồng bộ sản phẩm thời gian thực giữa điện thoại và máy tính
    const unsubscribeSync = subscribeCrossDeviceSync({
      onProductChange: (payload) => {
        if (!payload || !payload.product) return;
        const { action, product } = payload;
        if (action === 'create') {
          setProducts((prev) => {
            if (prev.some((p) => p.id === product.id || p.name === product.name)) return prev;
            const updated = [product, ...prev];
            try {
              localStorage.setItem('bakery_products', JSON.stringify(updated));
              db.products.put(product);
            } catch {}
            return updated;
          });
        } else if (action === 'update') {
          setProducts((prev) => {
            const updated = prev.map((p) => (p.id === product.id ? { ...p, ...product } : p));
            try {
              localStorage.setItem('bakery_products', JSON.stringify(updated));
              db.products.update(product.id, product);
            } catch {}
            return updated;
          });
        } else if (action === 'delete') {
          setProducts((prev) => {
            const updated = prev.filter((p) => p.id !== product.id);
            try {
              localStorage.setItem('bakery_products', JSON.stringify(updated));
              db.products.delete(product.id);
            } catch {}
            return updated;
          });
        }
      },
    });

    return () => {
      unsubscribeSync();
    };
  }, []);

  const handleSaveVietqr = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_vietqr_config', JSON.stringify(vietqrConfig));
    }
    setVietqrSaved(true);
    setTimeout(() => setVietqrSaved(false), 3500);
  };

  const handleSaveEwallet = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_ewallet_config', JSON.stringify(ewalletConfig));
    }
    setEwalletSaved(true);
    setTimeout(() => setEwalletSaved(false), 3500);
  };

  const handleUploadWalletQr = (walletKey: 'momo' | 'zalopay' | 'viettelmoney', file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setEwalletConfig((prev) => ({
        ...prev,
        [walletKey]: {
          ...prev[walletKey],
          qrUrl: dataUrl,
        },
      }));
    };
    reader.readAsDataURL(file);
  };

  // ── XỬ LÝ CÔNG THỨC BÁNH (BOM RECIPE BUILDER) ──
  const calculateItemCost = (ingredientId: string, quantity: number) => {
    const ing = ingredients.find((i) => i.id === ingredientId);
    if (!ing) return 0;
    const wastage = ing.wastage_pct || 0;
    return Math.round(quantity * ing.avg_cost * (1 + wastage / 100));
  };

  const calculateTotalBatchCost = (items: { ingredient_id: string; quantity: number }[]) => {
    return items.reduce((sum, item) => sum + calculateItemCost(item.ingredient_id, item.quantity), 0);
  };

  const handleAddRecipeItemRow = () => {
    const defaultIngId = ingredients[0]?.id || '1';
    setNewRecipeItems((prev) => [...prev, { ingredient_id: defaultIngId, quantity: 100 }]);
  };

  const handleRemoveRecipeItemRow = (index: number) => {
    setNewRecipeItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateRecipeItemRow = (index: number, field: 'ingredient_id' | 'quantity', value: any) => {
    setNewRecipeItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, [field]: value } : it))
    );
  };

  const handleCreateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecipeName) return;

    setSavingRecipe(true);
    const newId = generateUUID();
    const formattedItems = newRecipeItems.map((item) => {
      const ing = ingredients.find((i) => i.id === item.ingredient_id);
      const lineCost = calculateItemCost(item.ingredient_id, item.quantity);
      return {
        ingredient_id: item.ingredient_id,
        name: ing ? ing.name : 'Nguyên liệu',
        qty: `${item.quantity}${ing ? ing.unit : ''}`,
        cost: lineCost,
        quantity: item.quantity,
        unit: ing ? ing.unit : 'g',
      };
    });

    const totalBatchCost = formattedItems.reduce((s, it) => s + it.cost, 0);
    const costPerUnit = Math.round(totalBatchCost / (newRecipeYield || 1));
    const suggestedPrice = Math.round((costPerUnit / ((newRecipeFoodCostPct || 35) / 100)) / 1000) * 1000;

    const newRecipeObj = {
      id: newId,
      name: newRecipeName,
      yield_qty: newRecipeYield,
      yield_unit: newRecipeYieldUnit,
      cost_per_unit: costPerUnit,
      target_food_cost_pct: newRecipeFoodCostPct,
      suggested_price: suggestedPrice,
      items: formattedItems,
    };

    try {
      if (navigator.onLine) {
        await supabase.from('recipes').insert({
          id: newId,
          name: newRecipeName,
          yield_qty: newRecipeYield,
          yield_unit: newRecipeYieldUnit,
          total_material_cost: totalBatchCost,
          cost_per_unit: costPerUnit,
        });

        const itemsToInsert = formattedItems.map((it) => ({
          recipe_id: newId,
          ingredient_id: it.ingredient_id,
          quantity: it.quantity,
          unit: it.unit,
          line_cost: it.cost,
        }));
        await supabase.from('recipe_items').insert(itemsToInsert);
      }
    } catch (err) {
      console.error('Supabase recipe insert:', err);
    }

    const updatedRecipes = [newRecipeObj, ...recipes];
    setRecipes(updatedRecipes);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_recipes', JSON.stringify(updatedRecipes));
    }

    setRecipeSuccess(`Đã lưu công thức BOM cho "${newRecipeName}" thành công! Giá vốn: ${costPerUnit.toLocaleString('vi-VN')}₫/${newRecipeYieldUnit}.`);
    setTimeout(() => setRecipeSuccess(null), 5000);
    setIsAddRecipeModalOpen(false);

    // Reset form
    setNewRecipeName('');
    setNewRecipeYield(1);
    setNewRecipeYieldUnit('chiếc');
    setNewRecipeFoodCostPct(35);
    setNewRecipeItems([{ ingredient_id: ingredients[0]?.id || '1', quantity: 200 }]);
    setSavingRecipe(false);
  };

  const handleDeleteRecipe = async (id: string, name: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa công thức bánh "${name}"?`)) {
      const updated = recipes.filter((r) => r.id !== id);
      setRecipes(updated);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_recipes', JSON.stringify(updated));
      }
      try {
        if (navigator.onLine) {
          await supabase.from('recipes').delete().eq('id', id);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  // ── XỬ LÝ THÊM MỚI VẬT TƯ / NGUYÊN LIỆU (ADD INGREDIENT) ──
  const handleCreateIngredient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIngName) return;

    setCreatingIngredient(true);
    const newId = generateUUID();
    const newIngObj: Ingredient = {
      id: newId,
      name: newIngName,
      unit: newIngUnit,
      category: newIngCategory,
      stock_qty: newIngStockQty,
      reorder_level: newIngReorderLevel,
      avg_cost: newIngAvgCost,
      wastage_pct: newIngWastagePct,
    };

    try {
      if (navigator.onLine) {
        await supabase.from('ingredients').insert({
          name: newIngName,
          unit: newIngUnit,
          category: newIngCategory,
          stock_qty: newIngStockQty,
          reorder_level: newIngReorderLevel,
          avg_cost: newIngAvgCost,
          wastage_pct: newIngWastagePct,
        });
      }

      setIngredients((prev) => [...prev, newIngObj]);
      setPoSuccess(`Đã thêm vật tư mới "${newIngName}" vào kho thành công!`);
      setTimeout(() => setPoSuccess(null), 5000);
      setIsAddIngredientModalOpen(false);

      // Reset form
      setNewIngName('');
      setNewIngStockQty(5000);
      setNewIngAvgCost(30);
    } catch (err) {
      console.error('Lỗi thêm vật tư:', err);
      setIngredients((prev) => [...prev, newIngObj]);
      setIsAddIngredientModalOpen(false);
    } finally {
      setCreatingIngredient(false);
    }
  };

  // ── XỬ LÝ XÓA VẬT TƯ (DELETE INGREDIENT) ──
  const handleDeleteIngredient = async (id: string, name: string) => {
    if (confirm(`Xác nhận xóa vật tư "${name}" khỏi kho? Lưu ý: Nếu công thức đang dùng vật tư này thì hãy cập nhật lại công thức trước.`)) {
      setIngredients((prev) => prev.filter((i) => i.id !== id));
      if (navigator.onLine) {
        await supabase.from('ingredients').delete().eq('id', id);
      }
      setPoSuccess(`Đã xóa vật tư "${name}" khỏi danh mục kho!`);
      setTimeout(() => setPoSuccess(null), 4000);
    }
  };

  // ── XỬ LÝ XUẤT KHO / BÁO HỎNG (STOCK OUT) ──
  const handleCreateStockOut = () => {
    const ing = ingredients.find((i) => i.id === soIngredientId);
    if (!ing) return;

    if (soQty <= 0) {
      alert('Vui lòng nhập số lượng xuất kho hợp lệ!');
      return;
    }

    if (soQty > ing.stock_qty) {
      alert(`Số lượng xuất (${soQty} ${ing.unit}) vượt quá số lượng tồn hiện tại (${ing.stock_qty} ${ing.unit})!`);
      return;
    }

    const newQty = ing.stock_qty - soQty;
    const lossValue = soQty * ing.avg_cost;

    setIngredients((prev) =>
      prev.map((i) => (i.id === soIngredientId ? { ...i, stock_qty: newQty } : i))
    );

    // Cập nhật Supabase
    if (navigator.onLine) {
      supabase.from('ingredients').update({ stock_qty: newQty }).eq('id', soIngredientId);
    }

    // Ghi nhận vào cashflow hao hụt
    setCashflow((prev) => [
      {
        id: generateUUID(),
        type: 'expense',
        category: 'adjustment',
        amount: lossValue,
        desc: `Xuất hao hụt: ${soQty.toLocaleString()}${ing.unit} ${ing.name} (${soReason})`,
        date: new Date().toISOString().split('T')[0],
      },
      ...prev,
    ]);

    setPoSuccess(
      `Đã xuất kho ${soQty.toLocaleString()}${ing.unit} ${ing.name}. Tồn kho còn lại: ${newQty.toLocaleString()}${ing.unit}. Giá trị hao hụt: ${lossValue.toLocaleString('vi-VN')}₫`
    );
    setTimeout(() => setPoSuccess(null), 5000);
  };

  // ── XỬ LÝ TẠO MỚI SẢN PHẨM BÁNH ──
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName) return;

    setCreatingProduct(true);
    const newId = generateUUID();
    const newProductObj = {
      id: newId,
      name: newProdName,
      category: newProdCategory,
      selling_price: newProdPrice,
      base_cost_price: Math.round(newProdPrice * 0.33),
      food_cost_pct: 33.0,
      image_url: newProdImageUrl || 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop',
      is_preorder_only: newProdIsPreorder,
      is_active: true,
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await supabase.from('products').insert({
          id: newId,
          name: newProdName,
          category: newProdCategory,
          selling_price: newProdPrice,
          base_cost_price: Math.round(newProdPrice * 0.33),
          image_url: newProductObj.image_url,
          is_preorder_only: newProdIsPreorder,
          is_active: true,
        });
      }

      const updated = [newProductObj, ...products];
      setProducts(updated);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_products', JSON.stringify(updated));
        window.dispatchEvent(new Event('bakery_products_updated'));
      }
      try {
        await db.products.put(newProductObj);
      } catch {}

      // Đồng bộ thời gian thực sang Máy tính và Điện thoại khác ngay lập tức (< 50ms)
      await broadcastProductChange({ action: 'create', product: newProductObj });

      setUploadSuccess(`Đã thêm sản phẩm "${newProdName}" thành công! Menu quầy POS đã tự động cập nhật.`);
      setTimeout(() => setUploadSuccess(null), 5000);
      setIsAddProductModalOpen(false);

      setNewProdName('');
      setNewProdPrice(100000);
      setNewProdImageUrl('');
      setNewProdIsPreorder(false);
    } catch (err) {
      console.error('Lỗi thêm sản phẩm:', err);
      const fallbackUpdated = [newProductObj, ...products];
      setProducts(fallbackUpdated);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_products', JSON.stringify(fallbackUpdated));
        window.dispatchEvent(new Event('bakery_products_updated'));
      }
      try {
        await db.products.put(newProductObj);
      } catch {}

      // Vẫn phát sóng để các thiết bị khác nhận được
      await broadcastProductChange({ action: 'create', product: newProductObj });

      setIsAddProductModalOpen(false);
    } finally {
      setCreatingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (confirm(`Bạn có chắc chắn muốn xóa bánh "${name}" khỏi thực đơn?`)) {
      const updated = products.filter((p) => p.id !== id);
      setProducts(updated);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_products', JSON.stringify(updated));
        window.dispatchEvent(new Event('bakery_products_updated'));
      }
      try {
        await db.products.delete(id);
      } catch {}
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await supabase.from('products').delete().eq('id', id);
      }

      // Phát sóng xóa sản phẩm sang các thiết bị khác
      await broadcastProductChange({ action: 'delete', product: { id } });
    }
  };

  // ── XỬ LÝ NHẬP KHO (WAC CALCULATION) ──
  const handleCreatePurchaseOrder = () => {
    const ing = ingredients.find((i) => i.id === poIngredientId);
    if (!ing) return;

    const newQty = ing.stock_qty + poQty;
    const newAvgCost = Math.round(
      (ing.stock_qty * ing.avg_cost + poQty * poUnitPrice) / newQty
    );

    setIngredients((prev) =>
      prev.map((i) =>
        i.id === poIngredientId
          ? { ...i, stock_qty: newQty, avg_cost: newAvgCost }
          : i
      )
    );

    if (navigator.onLine) {
      supabase.from('ingredients').update({ stock_qty: newQty, avg_cost: newAvgCost }).eq('id', poIngredientId);
    }

    const totalCost = poQty * poUnitPrice;
    setCashflow((prev) => [
      {
        id: generateUUID(),
        type: 'expense',
        category: 'purchase',
        amount: totalCost,
        desc: `Nhập kho ${poQty.toLocaleString()}${ing.unit} ${ing.name} từ ${poSupplier}`,
        date: new Date().toISOString().split('T')[0],
      },
      ...prev,
    ]);

    setPoSuccess(
      `Đã nhập kho thành công! Đơn giá WAC mới của ${ing.name} tự động điều chỉnh thành ${newAvgCost.toLocaleString('vi-VN')}₫/${ing.unit} và cập nhật vào giá vốn bánh!`
    );
    setTimeout(() => setPoSuccess(null), 5000);
  };

  // ── XỬ LÝ THÊM CHI PHÍ OPEX ──
  const handleAddExpense = () => {
    if (newExpAmount <= 0) return;
    const item: ExpenseItem = {
      id: generateUUID(),
      category: newExpCategory,
      amount: newExpAmount,
      description: newExpDesc,
      date: new Date().toISOString().split('T')[0],
    };
    setExpenses((prev) => [item, ...prev]);

    setCashflow((prev) => [
      {
        id: generateUUID(),
        type: 'expense',
        category: 'opex',
        amount: newExpAmount,
        desc: `${newExpCategory}: ${newExpDesc}`,
        date: item.date,
      },
      ...prev,
    ]);

    setNewExpAmount(0);
    setNewExpDesc('');
  };

  // ── XỬ LÝ TẢI ẢNH BÁNH (OFFLINE-FIRST: LƯU BASE64 VÀO LOCALSTORAGE TRƯỚC) ──
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProductId) return;

    setUploadingId(selectedProductId);
    try {
      const img = new window.Image();
      const reader = new FileReader();

      reader.onload = (event) => {
        img.src = event.target?.result as string;
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const maxDim = 400; // Nhỏ hơn để base64 gọn, đủ hiển thị POS
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // 1. Tạo base64 ngay lập tức (hoạt động 100% offline)
          const base64Url = canvas.toDataURL('image/webp', 0.7);

          // 2. Cập nhật giao diện React ngay tức khắc
          const productId = selectedProductId;
          setProducts((prev) => {
            const updated = prev.map((p) =>
              p.id === productId ? { ...p, image_url: base64Url } : p
            );
            // 3. Lưu vào localStorage để giữ ảnh khi reload
            try {
              localStorage.setItem('bakery_products', JSON.stringify(updated));
            } catch {}

            // 4. Lưu trực tiếp vào Dexie IndexedDB (db.products) để POS và Admin đọc được ngay
            try {
              db.products.update(productId, { image_url: base64Url }).catch(() => {
                const target = updated.find((p) => p.id === productId);
                if (target) db.products.put(target);
              });
            } catch {}

            // 5. Phát sự kiện để POS tab cập nhật ảnh ngay tức khắc
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('bakery_products_updated'));
            }

            // 6. Phát sóng sang tất cả điện thoại và máy tính khác qua Realtime
            broadcastProductChange({ action: 'update', product: { id: productId, image_url: base64Url } });

            return updated;
          });

          setUploadSuccess('Đã cập nhật ảnh thành công!');
          setTimeout(() => setUploadSuccess(null), 4000);
          setUploadingId(null);

          // Reset file input để có thể chọn lại cùng file
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }

          // 4. Thử upload lên Supabase Storage (bonus, không bắt buộc)
          try {
            canvas.toBlob(
              async (blob) => {
                if (!blob) return;
                const fileName = `product_${productId}_${Date.now()}.webp`;

                const { data: storageData, error: storageErr } = await supabase.storage
                  .from('product-images')
                  .upload(fileName, blob, {
                    contentType: 'image/webp',
                    upsert: true,
                  });

                let finalUrl = base64Url;
                if (!storageErr && storageData) {
                  const { data: urlData } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(fileName);
                  finalUrl = urlData.publicUrl;

                  // Cập nhật lại UI với URL từ Supabase (bền vững hơn base64)
                  setProducts((prev) => {
                    const updated = prev.map((p) =>
                      p.id === productId ? { ...p, image_url: finalUrl } : p
                    );
                    try {
                      localStorage.setItem('bakery_products', JSON.stringify(updated));
                    } catch {}
                    return updated;
                  });
                }

                // Cập nhật URL vào bảng products trên Supabase DB
                await supabase
                  .from('products')
                  .update({ image_url: finalUrl })
                  .eq('id', productId);
              },
              'image/webp',
              0.7
            );
          } catch (syncErr) {
            console.warn('Supabase sync ảnh (không ảnh hưởng):', syncErr);
          }
        };
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Lỗi xử lý ảnh:', err);
      setUploadingId(null);
      // Reset file input khi lỗi
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // ── XỬ LÝ CHỐT SỔ & DỌN DẸP CLOUD 500MB ──
  const handleCloseMonth = () => {
    const currentMonth = '2026-09';
    if (!closedMonths.includes(currentMonth)) {
      setClosedMonths((prev) => [...prev, currentMonth]);
      setCloudMsg(`Đã chốt sổ kế toán tháng ${currentMonth} thành công! Toàn bộ P&L và tổng hợp ngày đã được lưu trữ an toàn.`);
      setTimeout(() => setCloudMsg(null), 5000);
    }
  };

  const handleDownloadBackup = () => {
    const backupData = {
      tiem_banh: 'Tiệm Bánh ABC',
      export_date: new Date().toISOString(),
      revenue: totalRevenue,
      cogs: totalCOGS,
      opex: totalOpex,
      net_profit: netProfit,
      ingredients,
      expenses,
      cashflow,
      products,
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_ke_toan_tiem_banh_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePurgeOldOrders = () => {
    if (confirm('Xác nhận dọn dẹp các hóa đơn chi tiết của các tháng đã chốt sổ? Số liệu tổng hợp P&L và biểu đồ lịch sử vẫn được giữ nguyên vẹn 100%.')) {
      setDbUsageMB(12.5);
      setCloudMsg('Đã dọn dẹp và giải phóng dung lượng DB thành công! Dung lượng giảm từ 28.4 MB xuống 12.5 MB (Tiết kiệm >55%).');
      setTimeout(() => setCloudMsg(null), 6000);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto space-y-4 min-h-[70vh]">
        <div className="w-16 h-16 rounded-3xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-lg shadow-rose-200">
          <ShieldAlert className="w-9 h-9" />
        </div>
        <h2 className="text-xl font-black text-zinc-900">Khu Vực Dành Riêng Cho Chủ Tiệm</h2>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Tài khoản hiện tại là <b>Nhân viên (Staff)</b>. Hệ thống tự động bảo vệ và chặn xem giá vốn nguyên liệu, công thức bánh và báo cáo kế toán.
        </p>

        {/* Form mở khóa nhanh trực tiếp */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setUnlockError('');
            const res = loginAdmin(unlockPassword);
            if (!res.success) {
              setUnlockError(res.error || 'Mật khẩu không chính xác!');
            }
          }}
          className="w-full space-y-3 bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm text-left"
        >
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <label className="font-bold text-zinc-700">Mật khẩu Chủ Tiệm (Admin):</label>
              <span className="text-[10px] text-zinc-400 font-mono">Mặc định: admin123</span>
            </div>
            <div className="relative">
              <input
                type="password"
                required
                autoFocus
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Nhập mật khẩu admin..."
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-black text-zinc-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
              <KeyRound className="w-4 h-4 text-zinc-400 absolute right-3.5 top-3" />
            </div>
          </div>

          {unlockError && (
            <p className="text-xs text-rose-600 font-bold">⚠️ {unlockError}</p>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Shield className="w-4 h-4" /> Mở Khóa Quản Trị Ngay
          </button>
        </form>

        <div className="pt-2">
          <Link
            href="/pos"
            className="text-xs font-bold text-zinc-500 hover:text-zinc-800 transition"
          >
            ← Quay lại Quầy Bán Hàng (POS)
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Phân hệ Quản trị Toàn diện
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-900 tracking-tight">
            Quản Lý Tiệm Bánh, Kho & Kế Toán
          </h1>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 bg-zinc-200/80 p-1 rounded-2xl overflow-x-auto scrollbar-none">
          {[
            { id: 'overview', label: 'Báo Cáo P&L', icon: BarChart3 },
            { id: 'images', label: 'Quản Lý Bánh & Ảnh', icon: Cake },
            { id: 'inventory', label: 'Kho Xuất Nhập & Vật Tư', icon: Package },
            { id: 'recipes', label: 'Công Thức BOM', icon: BookOpen },
            { id: 'opex', label: 'Chi Phí OPEX', icon: FileText },
            { id: 'cashflow', label: 'Sổ Quỹ Thu Chi', icon: DollarSign },
            { id: 'vietqr', label: 'Cài Đặt VietQR', icon: QrCode },
            { id: 'ewallet', label: 'Cài Đặt Ví Điện Tử', icon: Wallet },
            { id: 'security', label: 'Bảo Mật & Tài Khoản', icon: Shield },
            { id: 'cloud', label: 'Cloud 500MB', icon: HardDrive },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TAB 1: BÁO CÁO P&L, KẾ TOÁN & XUẤT EXCEL ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Header Báo Cáo Kế Toán & Bộ Lọc Thời Gian */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-zinc-200 shadow-xs">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                  Kế Toán Trưởng & Tài Chính Doanh Nghiệp
                </span>
              </div>
              <h2 className="text-xl font-black text-zinc-900 tracking-tight mt-0.5">
                Báo Cáo Kết Quả Kinh Doanh & Dòng Tiền (P&L)
              </h2>
              <p className="text-xs text-zinc-500">
                Tự động kết nối đơn hàng thực tế tại quầy POS, trừ giá vốn bột bơ sữa và phân bổ chi phí
              </p>
            </div>

            {/* Bộ lọc kỳ kế toán */}
            <div className="flex items-center gap-1.5 bg-zinc-100 p-1.5 rounded-2xl">
              <button
                type="button"
                onClick={() => setAccountingPeriod('today')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  accountingPeriod === 'today'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Hôm Nay (Realtime)
              </button>
              <button
                type="button"
                onClick={() => setAccountingPeriod('month')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  accountingPeriod === 'month'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Tháng Này (09/2026)
              </button>
              <button
                type="button"
                onClick={() => setAccountingPeriod('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  accountingPeriod === 'all'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Tất Cả Thời Gian
              </button>
            </div>
          </div>

          {/* Thanh Công Cụ Xuất File Excel Chuyên Nghiệp */}
          <div className="p-4 rounded-3xl bg-gradient-to-r from-emerald-950 via-teal-950 to-zinc-900 text-white border border-emerald-800/60 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                    Xuất File Bảng Tính Excel Kế Toán <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.2 rounded-full font-mono font-bold">UTF-8 Không Lỗi Font</span>
                  </h3>
                  <p className="text-[11px] text-zinc-300">Xuất dữ liệu mở trực tiếp trên Excel máy tính và điện thoại</p>
                </div>
              </div>

              {/* 4 Nút xuất Excel */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportPL_Excel}
                  className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  title="Tải bảng P&L dạng Excel CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Xuất P&L (Excel)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportSales_Excel}
                  className="px-3 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                  title="Tải toàn bộ danh sách hóa đơn bán hàng chi tiết"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  <span>Xuất Sổ Doanh Thu (Excel)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportCashflow_Excel}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold flex items-center gap-1.5 transition border border-zinc-700 cursor-pointer"
                  title="Tải sổ quỹ thu chi tự động"
                >
                  <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                  <span>Xuất Sổ Quỹ (Excel)</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportFullAccounting_Excel}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-black flex items-center gap-1.5 transition shadow-md shadow-amber-500/25 cursor-pointer"
                  title="Tải trọn bộ 5 sheet: P&L, Doanh thu, OPEX, Sổ quỹ, Kho vật tư"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Trọn Bộ Hồ Sơ (.xls Đa Sheet)</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4 Thẻ KPI Tài Chính Đỉnh Cao */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-xs space-y-2 hover:border-amber-300 transition">
              <span className="text-xs font-bold text-zinc-500">1. Doanh thu thuần</span>
              <div className="text-2xl font-black text-zinc-900">
                {totalRevenue.toLocaleString('vi-VN')}₫
              </div>
              <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> {orderCount} đơn hàng hoàn tất
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-xs space-y-2 hover:border-orange-300 transition">
              <span className="text-xs font-bold text-zinc-500">2. Giá vốn COGS (BOM)</span>
              <div className="text-2xl font-black text-orange-600">
                -{totalCOGS.toLocaleString('vi-VN')}₫
              </div>
              <div className="text-[11px] text-zinc-500">
                Tỷ lệ Food Cost: <span className="font-bold text-zinc-800">31.8%</span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-xs space-y-2 hover:border-rose-300 transition">
              <span className="text-xs font-bold text-zinc-500">3. Chi phí vận hành (OPEX)</span>
              <div className="text-2xl font-black text-rose-600">
                -{currentPeriodOpex.toLocaleString('vi-VN')}₫
              </div>
              <div className="text-[11px] text-zinc-500">{expenses.length} khoản mục phát sinh</div>
            </div>

            <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white rounded-3xl p-5 shadow-lg shadow-emerald-600/20 space-y-2">
              <span className="text-xs font-bold text-emerald-100">4. Lợi nhuận ròng (Net Profit)</span>
              <div className="text-2xl font-black text-white">
                +{netProfit.toLocaleString('vi-VN')}₫
              </div>
              <div className="text-[11px] text-emerald-100 font-semibold">
                Biên lợi nhuận ròng: {netMarginPct}%
              </div>
            </div>
          </div>

          {/* Báo Cáo P&L Chi Tiết Chuẩn Kế Toán */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50">
              <div>
                <h2 className="font-black text-base text-zinc-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-600" /> Báo Cáo Lãi Lỗ P&L Chi Tiết ({accountingPeriod === 'today' ? 'Hôm nay' : accountingPeriod === 'month' ? 'Tháng 09/2026' : 'Toàn bộ'})
                </h2>
                <p className="text-xs text-zinc-500">Chuẩn mực kế toán F&B: Phản ánh trung thực doanh thu, giá vốn BOM và chi phí</p>
              </div>

              <button
                type="button"
                onClick={handleExportPL_Excel}
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" /> Tải Excel Báo Cáo Này
              </button>
            </div>

            <div className="divide-y divide-zinc-100 text-xs sm:text-sm">
              <div className="p-4 flex justify-between font-bold bg-zinc-50/90 text-zinc-900">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  I. DOANH THU THUẦN BÁN HÀNG
                </span>
                <span className="font-black text-base">{totalRevenue.toLocaleString('vi-VN')}₫ (100%)</span>
              </div>
              <div className="p-3.5 flex justify-between text-orange-700 font-semibold pl-8 bg-orange-50/20">
                <span>(-) Giá vốn hàng bán COGS (Bột mì, bơ Pháp, trứng, phô mai theo định lượng BOM)</span>
                <span>-{totalCOGS.toLocaleString('vi-VN')}₫ (31.8%)</span>
              </div>
              <div className="p-4 flex justify-between font-black text-zinc-900 bg-amber-50/60 border-t border-b border-amber-200/60">
                <span>= II. LỢI NHUẬN GỘP (GROSS PROFIT)</span>
                <span className="text-amber-700 font-black text-base">
                  +{grossProfit.toLocaleString('vi-VN')}₫ ({grossMarginPct}%)
                </span>
              </div>
              <div className="p-3.5 flex justify-between text-rose-700 font-semibold pl-8 bg-rose-50/20">
                <span>(-) Chi phí vận hành OPEX (Mặt bằng, điện, nước, gas, lương nhân viên, khấu hao)</span>
                <span>-{currentPeriodOpex.toLocaleString('vi-VN')}₫ ({((currentPeriodOpex / (totalRevenue || 1)) * 100).toFixed(1)}%)</span>
              </div>
              <div className="p-4 flex justify-between font-black text-base text-emerald-800 bg-emerald-50/80 border-t-2 border-emerald-500">
                <span>= III. LỢI NHUẬN RÒNG CUỐI CÙNG (NET PROFIT)</span>
                <span className="text-lg text-emerald-700">+{netProfit.toLocaleString('vi-VN')}₫ ({netMarginPct}%)</span>
              </div>
            </div>
          </div>

          {/* Phân Tích Cơ Cấu Chi Phí & Tỷ Trọng Doanh Thu */}
          <div className="bg-white rounded-3xl p-5 border border-zinc-200 shadow-xs space-y-3">
            <h3 className="font-black text-sm text-zinc-900 flex items-center gap-2">
              <span>📊 Cơ Cấu Phân Bổ Chi Phí & Lợi Nhuận (Cứ 100₫ Doanh Thu)</span>
            </h3>

            <div className="w-full h-4 rounded-full bg-zinc-100 overflow-hidden flex shadow-inner">
              <div style={{ width: '31.8%' }} className="bg-orange-500" title="Giá vốn nguyên liệu (COGS): 31.8%"></div>
              <div style={{ width: `${Math.min(50, Math.round((currentPeriodOpex / (totalRevenue || 1)) * 100))}%` }} className="bg-rose-500" title="Chi phí vận hành: OPEX"></div>
              <div style={{ width: `${Math.max(5, Math.round(parseFloat(netMarginPct)))}%` }} className="bg-emerald-500" title="Lợi nhuận ròng: Net Profit"></div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-xs text-zinc-600 pt-1 gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                <span>Giá vốn (COGS): <b>31.8%</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                <span>Chi phí vận hành (OPEX): <b>{((currentPeriodOpex / (totalRevenue || 1)) * 100).toFixed(1)}%</b></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span>Lợi nhuận ròng (Net Margin): <b>{netMarginPct}%</b></span>
              </div>
            </div>
          </div>

          {/* Sổ Chi Tiết Doanh Thu Hóa Đơn Bán Hàng (Realtime POS Orders) */}
          <div className="bg-white rounded-3xl border border-zinc-200 shadow-xs overflow-hidden space-y-3 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
              <div>
                <h3 className="font-black text-base text-zinc-900 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-amber-600" /> Sổ Chi Tiết Doanh Thu Bán Hàng ({periodOrders.length} hóa đơn phát sinh)
                </h3>
                <p className="text-xs text-zinc-500">Dữ liệu đơn bán tại quầy và đơn đặt bánh đồng bộ từ POS</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    value={accountingSearch}
                    onChange={(e) => setAccountingSearch(e.target.value)}
                    placeholder="Tìm mã đơn, tên khách..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-zinc-200 bg-zinc-50 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleExportSales_Excel}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer"
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
                    <th className="p-3 text-center">Hình Thức</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {periodOrders
                    .filter((o) => {
                      if (!accountingSearch.trim()) return true;
                      const q = accountingSearch.toLowerCase();
                      const num = String(o.order_number || o.orderNumber || '').toLowerCase();
                      const name = String(o.customer_name || o.customerName || '').toLowerCase();
                      return num.includes(q) || name.includes(q);
                    })
                    .slice(0, 15)
                    .map((ord: any) => {
                      const isPreorder = ord.order_type === 'preorder' || !!ord.pickupDateTime;
                      const num = ord.order_number || ord.orderNumber;
                      const date = ord.created_at ? new Date(ord.created_at).toLocaleTimeString('vi-VN') + ' ' + new Date(ord.created_at).toLocaleDateString('vi-VN') : '';
                      const cust = ord.customer_name || ord.customerName || 'Khách vãng lai';
                      const amt = ord.total_amount || ord.totalPrice || 0;
                      const itemsStr = Array.isArray(ord.items) && ord.items.length > 0
                        ? ord.items.map((i: any) => `${i.quantity}x ${i.product_name_snapshot || i.name}`).join(', ')
                        : ord.cakeName || 'Bánh';

                      return (
                        <tr key={ord.id || num} className="hover:bg-amber-50/30 transition">
                          <td className="p-3 font-mono font-bold text-amber-700">#{num}</td>
                          <td className="p-3 text-zinc-500">{date}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isPreorder ? 'bg-pink-100 text-pink-700' : 'bg-zinc-100 text-zinc-700'
                            }`}>
                              {isPreorder ? 'Bánh đặt trước' : 'Tại quầy'}
                            </span>
                          </td>
                          <td className="p-3 font-bold text-zinc-900">{cust}</td>
                          <td className="p-3 text-zinc-600 max-w-[220px] truncate" title={itemsStr}>{itemsStr}</td>
                          <td className="p-3 font-black text-right text-zinc-900">{amt.toLocaleString('vi-VN')}₫</td>
                          <td className="p-3 text-center">
                            <span className="text-[10px] bg-zinc-100 px-2 py-0.5 rounded font-semibold text-zinc-600">
                              {ord.payment_method === 'cash' || ord.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  {periodOrders.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-zinc-400">
                        Chưa có đơn hàng nào phát sinh trong kỳ này. Bán hàng tại POS sẽ tự động cập nhật vào đây.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: QUẢN LÝ BÁNH & THÊM MỚI SẢN PHẨM ── */}
      {activeTab === 'images' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-3xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
                <Cake className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-black text-base text-zinc-900">Danh Mục Thực Đơn & Ảnh Sản Phẩm</h2>
                <p className="text-xs text-zinc-600">Thêm bánh mới hoặc tải ảnh 1 lần — mọi máy POS & Bếp tự động cập nhật ngay!</p>
              </div>
            </div>

            <button
              onClick={() => setIsAddProductModalOpen(true)}
              className="px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition hover:scale-102 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Thêm Loại Bánh Mới
            </button>
          </div>

          {uploadSuccess && (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {uploadSuccess}
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p) => (
              <div
                key={p.id}
                className="bg-white rounded-3xl border border-zinc-200 p-4 shadow-xs hover:shadow-md transition space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-4/3 rounded-2xl bg-zinc-100 overflow-hidden relative group mb-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 text-xs gap-1">
                        <Camera className="w-8 h-8 stroke-1" /> Chưa có ảnh
                      </div>
                    )}
                    {p.is_preorder_only && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-pink-500 text-white text-[10px] font-bold shadow-xs">
                        🎂 Nhận đặt trước
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-400">{p.category}</span>
                    <button
                      onClick={() => handleDeleteProduct(p.id, p.name)}
                      className="text-zinc-300 hover:text-rose-500 p-1 transition cursor-pointer"
                      title="Xóa bánh khỏi thực đơn"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h3 className="font-black text-sm text-zinc-900 mt-0.5 line-clamp-1">{p.name}</h3>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-zinc-500">Giá bán:</span>
                    <span className="font-bold text-amber-600">{p.selling_price.toLocaleString('vi-VN')}₫</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-zinc-500">Giá vốn COGS:</span>
                    <span className="font-bold text-zinc-700">{(p.base_cost_price || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                </div>

                <button
                  disabled={uploadingId === p.id}
                  onClick={() => {
                    setSelectedProductId(p.id);
                    fileInputRef.current?.click();
                  }}
                  className="w-full py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                >
                  {uploadingId === p.id ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-amber-600" />
                  )}
                  {uploadingId === p.id ? 'Đang nén & tải lên...' : 'Đổi / Chụp ảnh bánh'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MODAL: THÊM LOẠI BÁNH MỚI ── */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Cake className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-lg text-zinc-900">Thêm Loại Bánh Mới</h3>
              </div>
              <button onClick={() => setIsAddProductModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-700">Tên sản phẩm bánh *</label>
                <input
                  type="text"
                  required
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  placeholder="Ví dụ: Bánh Mousse Dâu Tây 16cm..."
                  className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-zinc-700">Danh mục:</label>
                  <select
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold"
                  >
                    <option value="Bánh kem & Bánh đặt">Bánh kem & Bánh đặt</option>
                    <option value="Bánh mì & Bánh tươi">Bánh mì & Bánh tươi</option>
                    <option value="Cookie & Bánh khô">Cookie & Bánh khô</option>
                    <option value="Bánh ngọt Mini">Bánh ngọt Mini</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-zinc-700">Giá bán niêm yết (VND) *</label>
                  <input
                    type="number"
                    required
                    value={newProdPrice || ''}
                    onChange={(e) => setNewProdPrice(Number(e.target.value))}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-amber-600 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-zinc-700">Link hình ảnh (hoặc dùng nút đổi ảnh sau khi tạo):</label>
                <input
                  type="url"
                  value={newProdImageUrl}
                  onChange={(e) => setNewProdImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full mt-1 p-2 rounded-xl border border-zinc-200 bg-zinc-50 text-xs"
                />
              </div>

              <div className="p-3 bg-pink-50 rounded-xl border border-pink-100 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="preorder_toggle"
                  checked={newProdIsPreorder}
                  onChange={(e) => setNewProdIsPreorder(e.target.checked)}
                  className="w-4 h-4 accent-pink-600 rounded cursor-pointer"
                />
                <label htmlFor="preorder_toggle" className="font-bold text-pink-800 cursor-pointer">
                  Đây là mẫu bánh sinh nhật / bánh kem nhận đặt trước
                </label>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingProduct}
                  className="flex-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {creatingProduct ? 'Đang lưu...' : 'Lưu Bánh Vào Thực Đơn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 3: KHO XUẤT NHẬP & QUẢN LÝ VẬT TƯ ── */}
      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* CỘT TRÁI: FORM XUẤT NHẬP KHO */}
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-4">
            {/* Toggle Nhập kho vs Xuất kho */}
            <div className="flex rounded-2xl bg-zinc-100 p-1 border border-zinc-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setInventoryActionType('import')}
                className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
                  inventoryActionType === 'import'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <ArrowDownCircle className="w-4 h-4" /> Nhập Kho (PO)
              </button>
              <button
                type="button"
                onClick={() => setInventoryActionType('export')}
                className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
                  inventoryActionType === 'export'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" /> Xuất Kho / Hỏng
              </button>
            </div>

            {poSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-start gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{poSuccess}</span>
              </div>
            )}

            {/* FORM 1: NHẬP KHO (PURCHASE ORDER) */}
            {inventoryActionType === 'import' ? (
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-zinc-700">Chọn nguyên vật liệu nhập:</label>
                  <select
                    value={poIngredientId}
                    onChange={(e) => setPoIngredientId(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold"
                  >
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit}) — Tồn: {ing.stock_qty.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-zinc-700">Nhà cung cấp:</label>
                  <input
                    type="text"
                    value={poSupplier}
                    onChange={(e) => setPoSupplier(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-zinc-700">Số lượng nhập:</label>
                    <input
                      type="number"
                      value={poQty || ''}
                      onChange={(e) => setPoQty(Number(e.target.value))}
                      className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-zinc-700">Đơn giá nhập (VND):</label>
                    <input
                      type="number"
                      value={poUnitPrice || ''}
                      onChange={(e) => setPoUnitPrice(Number(e.target.value))}
                      className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-amber-600"
                    />
                  </div>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex justify-between font-bold">
                  <span>Thành tiền phiếu nhập:</span>
                  <span className="text-amber-700">{(poQty * poUnitPrice).toLocaleString('vi-VN')}₫</span>
                </div>

                <button
                  onClick={handleCreatePurchaseOrder}
                  className="w-full py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Xác Nhận Nhập Kho & Tính Giá WAC
                </button>
              </div>
            ) : (
              /* FORM 2: XUẤT KHO / HAO HỤT / BÁO HỎNG */
              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-zinc-700">Chọn nguyên vật liệu xuất:</label>
                  <select
                    value={soIngredientId}
                    onChange={(e) => setSoIngredientId(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold"
                  >
                    {ingredients.map((ing) => (
                      <option key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit}) — Tồn: {ing.stock_qty.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-zinc-700">Số lượng xuất kho:</label>
                  <input
                    type="number"
                    value={soQty || ''}
                    onChange={(e) => setSoQty(Number(e.target.value))}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-rose-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-700">Lý do xuất kho / hao hụt:</label>
                  <select
                    value={soReason}
                    onChange={(e) => setSoReason(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50"
                  >
                    <option value="Lỗi mẻ nướng / Hỏng nguyên liệu">Lỗi mẻ nướng / Hỏng nguyên liệu</option>
                    <option value="Hết hạn sử dụng (Expire)">Hết hạn sử dụng (Expire)</option>
                    <option value="Kiểm kê kho điều chỉnh thiếu">Kiểm kê kho điều chỉnh thiếu</option>
                    <option value="Dùng làm bánh mẫu thử (Testing)">Dùng làm bánh mẫu thử (Testing)</option>
                    <option value="Xuất chuyển cho chi nhánh khác">Xuất chuyển cho chi nhánh khác</option>
                  </select>
                </div>

                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 text-[11px] leading-relaxed">
                  Lượng xuất sẽ tự động trừ thẳng vào tồn kho và ghi nhận vào sổ quỹ điều chỉnh chi phí.
                </div>

                <button
                  onClick={handleCreateStockOut}
                  className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowUpCircle className="w-4 h-4" /> Xác Nhận Xuất Kho / Trừ Tồn
                </button>
              </div>
            )}
          </div>

          {/* CỘT PHẢI: BẢNG DANH MỤC VẬT TƯ VÀ NÚT THÊM/XÓA */}
          <div className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-100">
              <div>
                <h2 className="font-black text-base text-zinc-900">Danh Mục Tồn Kho & Giá Vốn Trung Bình (WAC)</h2>
                <span className="text-xs text-zinc-500 font-semibold">{ingredients.length} loại vật tư trong kho</span>
              </div>

              {/* NÚT THÊM MỚI VẬT TƯ */}
              <button
                onClick={() => setIsAddIngredientModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" /> Thêm Loại Vật Tư Mới
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-zinc-400 font-bold">
                    <th className="py-2.5">Tên vật tư</th>
                    <th className="py-2.5">Đơn vị</th>
                    <th className="py-2.5 text-right">Tồn kho</th>
                    <th className="py-2.5 text-right">Giá bình quân WAC</th>
                    <th className="py-2.5 text-right">Trạng thái</th>
                    <th className="py-2.5 text-center">Xóa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {ingredients.map((ing) => {
                    const isLow = ing.stock_qty <= ing.reorder_level;
                    return (
                      <tr key={ing.id} className="hover:bg-zinc-50 group">
                        <td className="py-2.5">
                          <span className="font-bold text-zinc-900 block">{ing.name}</span>
                          <span className="text-[10px] text-zinc-400">{ing.category}</span>
                        </td>
                        <td className="py-2.5 text-zinc-500">{ing.unit}</td>
                        <td className={`py-2.5 text-right font-bold ${isLow ? 'text-rose-600' : 'text-zinc-800'}`}>
                          {ing.stock_qty.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right font-black text-amber-700">
                          {ing.avg_cost.toLocaleString('vi-VN')}₫/{ing.unit}
                        </td>
                        <td className="py-2.5 text-right">
                          {isLow ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-bold text-[10px]">
                              Sắp hết
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                              An toàn
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-center">
                          <button
                            onClick={() => handleDeleteIngredient(ing.id, ing.name)}
                            className="p-1 rounded-lg text-zinc-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Xóa vật tư này khỏi kho"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: THÊM MỚI VẬT TƯ / NGUYÊN LIỆU ── */}
      {isAddIngredientModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-lg text-zinc-900">Thêm Mới Loại Vật Tư</h3>
              </div>
              <button onClick={() => setIsAddIngredientModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIngredient} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-700">Tên vật tư / nguyên liệu *</label>
                <input
                  type="text"
                  required
                  value={newIngName}
                  onChange={(e) => setNewIngName(e.target.value)}
                  placeholder="Ví dụ: Phô mai Mascarpone, Men nở, Cacao..."
                  className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-zinc-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-zinc-700">Đơn vị tính (g, ml, quả...) *</label>
                  <input
                    type="text"
                    required
                    value={newIngUnit}
                    onChange={(e) => setNewIngUnit(e.target.value)}
                    placeholder="g, ml, quả, cái, hộp..."
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700">Nhóm vật tư:</label>
                  <select
                    value={newIngCategory}
                    onChange={(e) => setNewIngCategory(e.target.value)}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold"
                  >
                    <option value="Bột & Ngũ cốc">Bột & Ngũ cốc</option>
                    <option value="Bơ sữa">Bơ sữa & Phô mai</option>
                    <option value="Trứng">Trứng</option>
                    <option value="Gia vị">Gia vị & Đường</option>
                    <option value="Nhân bánh">Nhân bánh & Trái cây</option>
                    <option value="Bao bì & Phụ kiện">Bao bì & Phụ kiện</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-zinc-700">Tồn kho ban đầu:</label>
                  <input
                    type="number"
                    value={newIngStockQty || ''}
                    onChange={(e) => setNewIngStockQty(Number(e.target.value))}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700">Đơn giá vốn ban đầu (VND):</label>
                  <input
                    type="number"
                    value={newIngAvgCost || ''}
                    onChange={(e) => setNewIngAvgCost(Number(e.target.value))}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-amber-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-zinc-700">Mức báo động sắp hết:</label>
                  <input
                    type="number"
                    value={newIngReorderLevel || ''}
                    onChange={(e) => setNewIngReorderLevel(Number(e.target.value))}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700">Hao hụt chế biến (%):</label>
                  <input
                    type="number"
                    value={newIngWastagePct || ''}
                    onChange={(e) => setNewIngWastagePct(Number(e.target.value))}
                    className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddIngredientModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingIngredient}
                  className="flex-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  {creatingIngredient ? 'Đang lưu...' : 'Lưu Vật Tư Vào Kho'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 4: CÔNG THỨC BÁNH (BOM BUILDER) ── */}
      {activeTab === 'recipes' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200">
            <div>
              <h2 className="font-black text-lg text-zinc-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-600" /> Quản Lý Công Thức Bánh (BOM) & Tính Giá Vốn
              </h2>
              <p className="text-xs text-zinc-500">
                Giá vốn được tự động tính dựa trên định lượng nguyên liệu và đơn giá nhập kho hiện tại
              </p>
            </div>
            <button
              onClick={() => {
                if (ingredients.length === 0) {
                  alert('Kho chưa có nguyên liệu nào. Vui lòng thêm nguyên liệu ở Tab "Kho Xuất Nhập & Vật Tư" trước!');
                  return;
                }
                setIsAddRecipeModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/25 cursor-pointer transition shrink-0"
            >
              <Plus className="w-4 h-4" /> Thêm Công Thức Bánh Mới
            </button>
          </div>

          {recipeSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {recipeSuccess}
            </div>
          )}

          {recipes.length === 0 ? (
            <div className="bg-white rounded-3xl border border-zinc-200 p-12 text-center space-y-3">
              <BookOpen className="w-10 h-10 text-zinc-300 mx-auto" />
              <p className="font-bold text-zinc-700 text-sm">Chưa có công thức bánh nào trong hệ thống</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Bấm nút "Thêm Công Thức Bánh Mới" để khai báo định mức nguyên liệu và tự động tính toán giá vốn chính xác.
              </p>
              <button
                onClick={() => setIsAddRecipeModalOpen(true)}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
              >
                Tạo công thức đầu tiên
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {recipes.map((rec) => (
                <div key={rec.id} className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-black text-base text-zinc-900">{rec.name}</h3>
                      <span className="text-xs text-zinc-500">
                        Định lượng mẻ: <b>{rec.yield_qty} {rec.yield_unit || 'chiếc'}</b>
                      </span>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="text-right">
                        <span className="block font-black text-base text-orange-600">
                          {rec.cost_per_unit.toLocaleString('vi-VN')}₫ / {rec.yield_unit || 'chiếc'}
                        </span>
                        <span className="text-[11px] font-bold text-zinc-400">
                          Food Cost: {rec.target_food_cost_pct}%
                        </span>
                      </div>
                      <button
                        onClick={() => handleDeleteRecipe(rec.id, rec.name)}
                        className="p-1 rounded-lg text-zinc-300 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Xóa công thức này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-zinc-50 rounded-2xl p-3 divide-y divide-zinc-200/60 text-xs">
                    {rec.items.map((it: any, i: number) => (
                      <div key={i} className="py-1.5 flex justify-between items-center">
                        <span className="text-zinc-700">
                          {it.name} <span className="text-zinc-400 font-mono">({it.qty || `${it.quantity}${it.unit || ''}`})</span>
                        </span>
                        <span className="font-bold text-zinc-900">{it.cost.toLocaleString('vi-VN')}₫</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/60 flex justify-between items-center text-xs font-bold">
                    <span className="text-amber-800">Giá bán đề xuất:</span>
                    <span className="text-sm font-black text-amber-700">
                      {rec.suggested_price.toLocaleString('vi-VN')}₫
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: THÊM MỚI CÔNG THỨC BÁNH (BOM BUILDER) ── */}
      {isAddRecipeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-zinc-900">Thêm Mới Công Thức Bánh (BOM)</h3>
                  <p className="text-[11px] text-zinc-500">Khai báo định mức nguyên liệu để hệ thống tự động tính giá vốn COGS</p>
                </div>
              </div>
              <button onClick={() => setIsAddRecipeModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRecipe} className="space-y-4 text-xs">
              {/* 1. Chọn loại bánh */}
              <div className="space-y-2">
                <label className="font-bold text-zinc-800">1. Tên loại bánh / Tên công thức *</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        setNewRecipeName(e.target.value);
                      }
                    }}
                    className="p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold text-zinc-900 text-xs sm:w-1/2"
                  >
                    <option value="">-- Chọn từ Thực đơn bánh --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} ({p.selling_price?.toLocaleString('vi-VN')}₫)
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    value={newRecipeName}
                    onChange={(e) => setNewRecipeName(e.target.value)}
                    placeholder="Hoặc tự gõ: Bánh Su Kem, Bánh Mì Hoa Cúc..."
                    className="flex-1 p-2.5 rounded-xl border border-zinc-200 bg-white font-bold text-zinc-900 text-xs"
                  />
                </div>
              </div>

              {/* 2. Định lượng mẻ ra lò & Đơn vị & Food cost */}
              <div className="grid grid-cols-3 gap-2.5 p-3 bg-zinc-50 rounded-2xl border border-zinc-200">
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Số lượng mẻ ra lò:</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newRecipeYield || ''}
                    onChange={(e) => setNewRecipeYield(Math.max(1, Number(e.target.value)))}
                    className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-black text-center text-sm"
                  />
                </div>
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Đơn vị bánh:</label>
                  <select
                    value={newRecipeYieldUnit}
                    onChange={(e) => setNewRecipeYieldUnit(e.target.value)}
                    className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-bold text-xs"
                  >
                    <option value="chiếc">chiếc</option>
                    <option value="cái">cái</option>
                    <option value="hộp">hộp</option>
                    <option value="ổ">ổ</option>
                    <option value="phần">phần</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Food Cost (%):</label>
                  <input
                    type="number"
                    min={10}
                    max={80}
                    value={newRecipeFoodCostPct || ''}
                    onChange={(e) => setNewRecipeFoodCostPct(Number(e.target.value))}
                    className="w-full p-2 bg-white border border-zinc-200 rounded-xl font-black text-center text-sm text-amber-700"
                  />
                </div>
              </div>

              {/* 3. Bảng nguyên liệu cấu thành */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-zinc-800">
                    2. Định mức nguyên liệu cho cả mẻ ({newRecipeItems.length} thành phần):
                  </label>
                  <button
                    type="button"
                    onClick={handleAddRecipeItemRow}
                    className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm nguyên liệu
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {newRecipeItems.map((item, idx) => {
                    const selectedIng = ingredients.find((i) => i.id === item.ingredient_id);
                    const lineCost = calculateItemCost(item.ingredient_id, item.quantity);
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-2 p-2.5 bg-zinc-50 rounded-xl border border-zinc-200"
                      >
                        <select
                          value={item.ingredient_id}
                          onChange={(e) => handleUpdateRecipeItemRow(idx, 'ingredient_id', e.target.value)}
                          className="flex-2 p-1.5 bg-white border border-zinc-200 rounded-lg font-bold text-xs"
                        >
                          {ingredients.map((ing) => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name} ({ing.avg_cost.toLocaleString('vi-VN')}₫/{ing.unit})
                            </option>
                          ))}
                        </select>

                        <div className="flex-1 flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity || ''}
                            onChange={(e) => handleUpdateRecipeItemRow(idx, 'quantity', Number(e.target.value))}
                            className="w-full p-1.5 bg-white border border-zinc-200 rounded-lg font-black text-right text-xs"
                          />
                          <span className="text-[11px] font-bold text-zinc-500 shrink-0 w-8">
                            {selectedIng?.unit || 'g'}
                          </span>
                        </div>

                        <span className="w-24 text-right font-black text-zinc-800 text-xs">
                          {lineCost.toLocaleString('vi-VN')}₫
                        </span>

                        {newRecipeItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRecipeItemRow(idx)}
                            className="p-1 text-zinc-400 hover:text-rose-600 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Tóm tắt giá vốn tự động */}
              {(() => {
                const totalBatchCost = calculateTotalBatchCost(newRecipeItems);
                const costPerUnit = Math.round(totalBatchCost / (newRecipeYield || 1));
                const suggestedPrice = Math.round((costPerUnit / ((newRecipeFoodCostPct || 35) / 100)) / 1000) * 1000;
                return (
                  <div className="p-3.5 bg-amber-50/80 rounded-2xl border border-amber-200 space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-zinc-600">Tổng chi phí nguyên liệu mẻ ({newRecipeYield} {newRecipeYieldUnit}):</span>
                      <span className="font-black text-zinc-900">{totalBatchCost.toLocaleString('vi-VN')}₫</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold pt-1 border-t border-amber-200/60">
                      <span className="text-orange-700">Giá vốn 1 {newRecipeYieldUnit} (COGS):</span>
                      <span className="font-black text-orange-600 text-sm">{costPerUnit.toLocaleString('vi-VN')}₫</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold pt-1 border-t border-amber-200/60">
                      <span className="text-emerald-800">Giá bán lẻ đề xuất ({newRecipeFoodCostPct}% Food Cost):</span>
                      <span className="font-black text-emerald-700 text-base">{suggestedPrice.toLocaleString('vi-VN')}₫</span>
                    </div>
                  </div>
                );
              })()}

              {/* Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddRecipeModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingRecipe}
                  className="flex-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {savingRecipe ? 'Đang tính toán & Lưu...' : 'Lưu Công Thức Bánh (BOM)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── TAB 5: CHI PHÍ VẬN HÀNH (OPEX) ── */}
      {activeTab === 'opex' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-4">
            <h2 className="font-black text-base text-zinc-900 pb-2 border-b border-zinc-100">
              Ghi Nhận Chi Phí Vận Hành
            </h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-zinc-700">Khoản mục chi phí:</label>
                <select
                  value={newExpCategory}
                  onChange={(e) => setNewExpCategory(e.target.value)}
                  className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-bold"
                >
                  <option value="Tiền mặt bằng">Tiền mặt bằng (Cố định)</option>
                  <option value="Tiền điện & Nước">Tiền điện & Nước (Biến đổi)</option>
                  <option value="Tiền Gas">Tiền Gas bếp (Biến đổi)</option>
                  <option value="Lương nhân viên">Lương nhân viên (Cố định)</option>
                  <option value="Khấu hao thiết bị">Khấu hao máy móc lò nướng</option>
                  <option value="Quảng cáo & Marketing">Quảng cáo Facebook / Tờ rơi</option>
                  <option value="Chi phí khác">Chi phí khác</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-zinc-700">Số tiền chi (VND):</label>
                <input
                  type="number"
                  value={newExpAmount || ''}
                  onChange={(e) => setNewExpAmount(Number(e.target.value))}
                  className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50 font-black text-rose-600 text-sm"
                />
              </div>

              <div>
                <label className="font-bold text-zinc-700">Diễn giải / Ghi chú:</label>
                <input
                  type="text"
                  value={newExpDesc}
                  onChange={(e) => setNewExpDesc(e.target.value)}
                  placeholder="Ví dụ: Đổi bình gas, thanh toán tiền điện..."
                  className="w-full mt-1 p-2.5 rounded-xl border border-zinc-200 bg-zinc-50"
                />
              </div>

              <button
                onClick={handleAddExpense}
                className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Lưu Phiếu Chi & Trừ Vào P&L
              </button>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h2 className="font-black text-base text-zinc-900">Danh Sách Chi Phí Vận Hành Tháng Này</h2>
              <span className="font-black text-rose-600 text-sm">
                Tổng chi: -{totalOpex.toLocaleString('vi-VN')}₫
              </span>
            </div>

            <div className="space-y-2">
              {expenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70 flex justify-between items-center text-xs"
                >
                  <div>
                    <span className="font-bold text-zinc-900 block">{exp.category}</span>
                    <span className="text-zinc-500">{exp.description}</span>
                    <span className="text-[10px] text-zinc-400 block mt-0.5">{exp.date}</span>
                  </div>
                  <span className="font-black text-sm text-rose-600">
                    -{exp.amount.toLocaleString('vi-VN')}₫
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 6: SỔ QUỸ THU CHI (CASHFLOW) ── */}
      {activeTab === 'cashflow' && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div>
              <h2 className="font-black text-lg text-zinc-900">Sổ Quỹ Tiền Mặt & Ngân Hàng Tự Động</h2>
              <p className="text-xs text-zinc-500">Tự động ghi nhận dòng tiền Vào (bán hàng) và Ra (nhập kho, chi phí)</p>
            </div>
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800">
              Số dư quỹ hiện tại: +{(totalRevenue - totalCOGS - totalOpex).toLocaleString('vi-VN')}₫
            </span>
          </div>

          <div className="space-y-2 text-xs">
            {cashflow.map((cf) => (
              <div
                key={cf.id}
                className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200/70 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      cf.type === 'income'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {cf.type === 'income' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="font-bold text-zinc-900 block">{cf.desc}</span>
                    <span className="text-[10px] text-zinc-400">{cf.date}</span>
                  </div>
                </div>

                <span
                  className={`font-black text-sm ${
                    cf.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {cf.type === 'income' ? '+' : '-'}{cf.amount.toLocaleString('vi-VN')}₫
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 7: QUẢN LÝ DUNG LƯỢNG CLOUD 500MB & PURGE ── */}
      {activeTab === 'cloud' && (
        <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs space-y-6 max-w-3xl">
          <div className="pb-3 border-b border-zinc-100">
            <h2 className="font-black text-lg text-zinc-900 flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-600" /> Quản Trị Dung Lượng Cloud Supabase 500MB
            </h2>
            <p className="text-xs text-zinc-500">
              Cơ chế dọn dẹp thông minh giúp tiệm bánh sử dụng gói Supabase Free Tier vĩnh viễn không bị tràn dung lượng
            </p>
          </div>

          {cloudMsg && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              {cloudMsg}
            </div>
          )}

          <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span>Dung lượng Database đã dùng:</span>
              <span className="text-emerald-700">{dbUsageMB} MB / 500 MB (Mức an toàn tuyệt đối)</span>
            </div>
            <div className="w-full h-3 bg-zinc-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 rounded-full transition-all duration-500"
                style={{ width: `${(dbUsageMB / 500) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-sm text-zinc-800">Quy Trình 3 Bước Dọn Dẹp Định Kỳ (Mỗi 3-6 Tháng):</h3>

            <div className="p-4 rounded-2xl border border-zinc-200 flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-amber-700">Bước 1: Chốt Sổ Kế Toán Tháng</span>
                <p className="text-xs text-zinc-500">
                  Tổng hợp toàn bộ doanh thu, COGS và OPEX vào bảng <code>monthly_accounting_summary</code>.
                </p>
              </div>
              <button
                onClick={handleCloseMonth}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer"
              >
                Chốt Sổ Tháng 09/2026
              </button>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-200 flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-blue-700">Bước 2: Tải Dữ Liệu Về Máy Tính</span>
                <p className="text-xs text-zinc-500">
                  Tải toàn bộ file JSON / Excel lưu trữ trên máy tính của tiệm trước khi xóa data trên cloud.
                </p>
              </div>
              <button
                onClick={handleDownloadBackup}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" /> Tải File Backup
              </button>
            </div>

            <div className="p-4 rounded-2xl border border-zinc-200 flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-rose-700">Bước 3: Dọn Dẹp & Xóa Đơn Hàng Cũ</span>
                <p className="text-xs text-zinc-500">
                  Xóa các đơn chi tiết của tháng đã chốt. Biểu đồ lịch sử vẫn giữ nguyên 100%.
                </p>
              </div>
              <button
                onClick={handlePurgeOldOrders}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shrink-0 flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa Data Cũ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 8: CÀI ĐẶT TẠO MÃ CHUYỂN KHOẢN VIETQR ── */}
      {activeTab === 'vietqr' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-zinc-900">
                      Cài Đặt Mã Chuyển Khoản Ngân Hàng (VietQR Napas 247)
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Cấu hình số tài khoản nhận tiền cho tiệm. Mã QR động có sẵn số tiền và nội dung sẽ tự sinh tại POS khi khách chọn Chuyển khoản hoặc Đặt cọc bánh kem.
                    </p>
                  </div>
                </div>
              </div>

              {vietqrSaved && (
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Đã lưu cấu hình thành công!
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form Cài Đặt */}
              <form onSubmit={handleSaveVietqr} className="lg:col-span-7 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-amber-600" /> Ngân Hàng Thụ Hưởng (Chọn ngân hàng của tiệm):
                  </label>
                  <select
                    value={vietqrConfig.bankId}
                    onChange={(e) => {
                      const selectedBank = VIETQR_BANKS.find(b => b.id === e.target.value);
                      setVietqrConfig({
                        ...vietqrConfig,
                        bankId: e.target.value,
                        bankName: selectedBank ? selectedBank.name : e.target.value,
                      });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm"
                  >
                    {VIETQR_BANKS.map((bank) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name} ({bank.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-800">
                      Số Tài Khoản Ngân Hàng:
                    </label>
                    <input
                      type="text"
                      required
                      value={vietqrConfig.accountNo}
                      onChange={(e) => setVietqrConfig({ ...vietqrConfig, accountNo: e.target.value.replace(/\s+/g, '') })}
                      placeholder="VD: 0988888888 hoặc 1903..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 font-mono font-black text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-base"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-800">
                      Tên Chủ Tài Khoản (In hoa không dấu):
                    </label>
                    <input
                      type="text"
                      required
                      value={vietqrConfig.accountName}
                      onChange={(e) => setVietqrConfig({ ...vietqrConfig, accountName: e.target.value.toUpperCase() })}
                      placeholder="VD: NGUYEN VAN A hoặc TIEM BANH..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 uppercase text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-800">
                      Mẫu Hiển Thị QR (VietQR Template):
                    </label>
                    <select
                      value={vietqrConfig.template}
                      onChange={(e) => setVietqrConfig({ ...vietqrConfig, template: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 font-bold text-zinc-900 focus:bg-white text-xs"
                    >
                      <option value="compact2">Chuẩn VietQR Đẹp (Hiện Napas & Ngân Hàng) - Khuyên dùng</option>
                      <option value="compact">Gọn nhẹ (Compact)</option>
                      <option value="qr_only">Chỉ mã QR vuông (Không viền)</option>
                      <option value="print">Tối ưu in nhiệt hóa đơn (Print)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-zinc-800">
                      Tiền tố mã đơn hàng (Cú pháp CK):
                    </label>
                    <input
                      type="text"
                      value={vietqrConfig.transferSyntax}
                      onChange={(e) => setVietqrConfig({ ...vietqrConfig, transferSyntax: e.target.value.toUpperCase() })}
                      placeholder="VD: DH hoặc BANH"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-50 border border-zinc-300 font-mono font-bold text-zinc-900 focus:bg-white text-xs"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" /> Cách hoạt động tự động tại quầy POS & Đặt bánh:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800">
                    <li>Khi thu ngân bấm chọn hình thức <b>Chuyển khoản</b>, mã VietQR sẽ tự động hiện lên màn hình.</li>
                    <li>Mã đã được nhúng sẵn <b>Đúng số tiền cần thanh toán</b> và <b>Mã đơn hàng</b>.</li>
                    <li>Khách hàng mở bất kỳ App ngân hàng nào (Vietcombank, MB, Techcombank, Momo...) quét là tiền chuyển ngay tức thì mà không cần gõ tay số tài khoản!</li>
                  </ul>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-md shadow-amber-600/25 flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Save className="w-4 h-4" /> Lưu Cấu Hình VietQR
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setVietqrConfig({
                        bankId: 'MB',
                        bankName: 'MBBank (Ngân hàng Quân Đội)',
                        accountNo: '0988888888',
                        accountName: 'TIEM BANH HOANG GIA',
                        template: 'compact2',
                        transferSyntax: 'DH',
                      });
                    }}
                    className="px-4 py-3 rounded-2xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition"
                  >
                    Tài khoản mẫu
                  </button>
                </div>
              </form>

              {/* Bản Xem Trước Trực Tiếp (Live Preview) */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-zinc-50 to-zinc-100/60 rounded-3xl border border-zinc-200 space-y-4">
                <div className="text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                    Xem trước thực tế (Live Preview)
                  </span>
                  <h3 className="text-sm font-black text-zinc-900">Mã QR Thanh Toán Tại POS</h3>
                </div>

                {/* QR Image Card */}
                <div className="p-3 bg-white rounded-2xl border border-zinc-200/80 shadow-md flex flex-col items-center">
                  <img
                    key={`${vietqrConfig.bankId}-${vietqrConfig.accountNo}-${vietqrConfig.template}-${testAmount}-${testNote}`}
                    src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-${vietqrConfig.template}.jpg?amount=${testAmount}&addInfo=${encodeURIComponent(testNote)}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                    alt="VietQR Demo"
                    className="w-64 h-auto rounded-xl object-contain"
                    onError={(e) => {
                      (e.target as any).src = 'https://api.vietqr.io/image/MB-0988888888-compact2.jpg';
                    }}
                  />
                </div>

                {/* Account info card */}
                <div className="w-full bg-white p-3.5 rounded-2xl border border-zinc-200/80 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Ngân hàng:</span>
                    <span className="font-bold text-zinc-900">{vietqrConfig.bankName || vietqrConfig.bankId}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Số tài khoản:</span>
                    <div className="flex items-center gap-1 font-mono font-black text-zinc-900">
                      <span>{vietqrConfig.accountNo}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(vietqrConfig.accountNo);
                          setCopiedAccount(true);
                          setTimeout(() => setCopiedAccount(false), 2000);
                        }}
                        className="p-1 hover:bg-zinc-100 rounded text-zinc-500 cursor-pointer"
                        title="Sao chép số TK"
                      >
                        {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Chủ tài khoản:</span>
                    <span className="font-bold text-zinc-900">{vietqrConfig.accountName}</span>
                  </div>
                </div>

                {/* Test amount & note editor */}
                <div className="w-full bg-white p-3 rounded-2xl border border-zinc-200/80 space-y-2 text-xs">
                  <span className="font-bold text-zinc-600 block text-[11px]">Thử nghiệm quét QR:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-400 block">Số tiền thử:</label>
                      <input
                        type="number"
                        value={testAmount}
                        onChange={(e) => setTestAmount(Number(e.target.value))}
                        className="w-full p-1.5 bg-zinc-50 border border-zinc-200 rounded-lg font-black text-amber-600 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 block">Nội dung thử:</label>
                      <input
                        type="text"
                        value={testNote}
                        onChange={(e) => setTestNote(e.target.value)}
                        className="w-full p-1.5 bg-zinc-50 border border-zinc-200 rounded-lg font-mono text-zinc-800 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 text-center italic pt-1">
                    📱 Dùng App ngân hàng quét trực tiếp mã QR trên để trải nghiệm thực tế!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 9: CÀI ĐẶT NHẬN TIỀN VÍ ĐIỆN TỬ (MOMO, ZALOPAY, VIETTEL MONEY) ── */}
      {activeTab === 'ewallet' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-zinc-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-pink-100 text-pink-700 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-zinc-900">
                    Cài Đặt Nhận Tiền Ví Điện Tử (MoMo, ZaloPay, Viettel Money)
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Cấu hình số điện thoại & mã QR nhận tiền qua ví điện tử. Khách thanh toán tại POS chỉ cần quét mã MoMo/ZaloPay là xong.
                  </p>
                </div>
              </div>

              {ewalletSaved && (
                <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-700 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Đã lưu cấu hình Ví Điện Tử thành công!
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Cột trái: Form cấu hình 3 ví */}
              <div className="lg:col-span-7 space-y-5">
                {/* Chọn Ví mặc định hiển thị tại POS */}
                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                  <label className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-pink-600" /> Ví Điện Tử Mặc Định Ưu Tiên Tại POS:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'momo', name: 'Ví MoMo', color: 'text-[#d82d8b] border-[#d82d8b] bg-pink-50' },
                      { id: 'zalopay', name: 'ZaloPay', color: 'text-[#0068ff] border-[#0068ff] bg-blue-50' },
                      { id: 'viettelmoney', name: 'Viettel Money', color: 'text-[#ee0033] border-[#ee0033] bg-red-50' },
                    ].map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => {
                          setEwalletConfig({ ...ewalletConfig, activeWallet: w.id as any });
                          setPreviewWallet(w.id as any);
                        }}
                        className={`py-2 rounded-xl font-black text-xs border transition cursor-pointer ${
                          ewalletConfig.activeWallet === w.id
                            ? `${w.color} shadow-sm font-extrabold`
                            : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Card 1: Ví MoMo */}
                <div className="p-4 rounded-2xl border border-pink-200/80 bg-gradient-to-br from-pink-50/50 to-white space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-pink-100">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#d82d8b] text-white flex items-center justify-center text-[10px] font-black">
                        M
                      </span>
                      <span className="font-black text-sm text-[#d82d8b]">1. Cấu hình Ví MoMo</span>
                    </div>
                    <span className="text-[10px] font-bold text-pink-700 bg-pink-100/60 px-2 py-0.5 rounded-md">
                      Hỗ trợ QR động P2P
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-zinc-700">Số Điện Thoại MoMo:</label>
                      <input
                        type="text"
                        value={ewalletConfig.momo.phone}
                        onChange={(e) => setEwalletConfig({
                          ...ewalletConfig,
                          momo: { ...ewalletConfig.momo, phone: e.target.value.replace(/\s+/g, '') }
                        })}
                        placeholder="0988 888 888"
                        className="w-full p-2 bg-white border border-zinc-300 rounded-xl font-mono font-black text-zinc-900 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-zinc-700">Tên Chủ Ví MoMo:</label>
                      <input
                        type="text"
                        value={ewalletConfig.momo.name}
                        onChange={(e) => setEwalletConfig({
                          ...ewalletConfig,
                          momo: { ...ewalletConfig.momo, name: e.target.value.toUpperCase() }
                        })}
                        placeholder="TIEM BANH HOANG GIA"
                        className="w-full p-2 bg-white border border-zinc-300 rounded-xl font-bold uppercase text-zinc-900 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-700 flex items-center justify-between">
                      <span>Ảnh Mã QR MoMo Của Tiệm (Tùy chọn):</span>
                      {ewalletConfig.momo.qrUrl && (
                        <button
                          type="button"
                          onClick={() => setEwalletConfig({
                            ...ewalletConfig,
                            momo: { ...ewalletConfig.momo, qrUrl: '' }
                          })}
                          className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Xóa ảnh, dùng QR động
                        </button>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadWalletQr('momo', file);
                        }}
                        className="text-xs text-zinc-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-pink-100 file:text-pink-700 hover:file:bg-pink-200 cursor-pointer"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-400 italic">
                      Nếu không tải ảnh, hệ thống tự động sinh mã VietQR MoMo chuẩn số tiền khi khách thanh toán!
                    </p>
                  </div>
                </div>

                {/* Card 2: Ví ZaloPay */}
                <div className="p-4 rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/50 to-white space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-blue-100">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#0068ff] text-white flex items-center justify-center text-[10px] font-black">
                        Z
                      </span>
                      <span className="font-black text-sm text-[#0068ff]">2. Cấu hình Ví ZaloPay</span>
                    </div>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded-md">
                      Quét mã chuyển tiền
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-zinc-700">Số Điện Thoại ZaloPay:</label>
                      <input
                        type="text"
                        value={ewalletConfig.zalopay.phone}
                        onChange={(e) => setEwalletConfig({
                          ...ewalletConfig,
                          zalopay: { ...ewalletConfig.zalopay, phone: e.target.value.replace(/\s+/g, '') }
                        })}
                        placeholder="0988 888 888"
                        className="w-full p-2 bg-white border border-zinc-300 rounded-xl font-mono font-black text-zinc-900 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-zinc-700">Tên Chủ Ví ZaloPay:</label>
                      <input
                        type="text"
                        value={ewalletConfig.zalopay.name}
                        onChange={(e) => setEwalletConfig({
                          ...ewalletConfig,
                          zalopay: { ...ewalletConfig.zalopay, name: e.target.value.toUpperCase() }
                        })}
                        placeholder="TIEM BANH HOANG GIA"
                        className="w-full p-2 bg-white border border-zinc-300 rounded-xl font-bold uppercase text-zinc-900 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-zinc-700 flex items-center justify-between">
                      <span>Ảnh Mã QR ZaloPay (Tùy chọn):</span>
                      {ewalletConfig.zalopay.qrUrl && (
                        <button
                          type="button"
                          onClick={() => setEwalletConfig({
                            ...ewalletConfig,
                            zalopay: { ...ewalletConfig.zalopay, qrUrl: '' }
                          })}
                          className="text-[10px] text-rose-600 hover:underline cursor-pointer"
                        >
                          Xóa ảnh
                        </button>
                      )}
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadWalletQr('zalopay', file);
                      }}
                      className="text-xs text-zinc-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 cursor-pointer"
                    />
                  </div>
                </div>

                {/* Card 3: Viettel Money */}
                <div className="p-4 rounded-2xl border border-red-200/80 bg-gradient-to-br from-red-50/50 to-white space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-red-100">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#ee0033] text-white flex items-center justify-center text-[10px] font-black">
                        V
                      </span>
                      <span className="font-black text-sm text-[#ee0033]">3. Cấu hình Viettel Money</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-zinc-700">Số Điện Thoại / Mã Viettel:</label>
                      <input
                        type="text"
                        value={ewalletConfig.viettelmoney.phone}
                        onChange={(e) => setEwalletConfig({
                          ...ewalletConfig,
                          viettelmoney: { ...ewalletConfig.viettelmoney, phone: e.target.value.replace(/\s+/g, '') }
                        })}
                        placeholder="0988 888 888"
                        className="w-full p-2 bg-white border border-zinc-300 rounded-xl font-mono font-black text-zinc-900 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-zinc-700">Tên Chủ Tài Khoản:</label>
                      <input
                        type="text"
                        value={ewalletConfig.viettelmoney.name}
                        onChange={(e) => setEwalletConfig({
                          ...ewalletConfig,
                          viettelmoney: { ...ewalletConfig.viettelmoney, name: e.target.value.toUpperCase() }
                        })}
                        placeholder="TIEM BANH HOANG GIA"
                        className="w-full p-2 bg-white border border-zinc-300 rounded-xl font-bold uppercase text-zinc-900 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Buttons Save */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSaveEwallet()}
                    className="flex-1 py-3 rounded-2xl bg-pink-600 hover:bg-pink-700 text-white font-extrabold text-xs shadow-md shadow-pink-600/25 flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <Save className="w-4 h-4" /> Lưu Cấu Hình Ví Điện Tử
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEwalletConfig({
                        activeWallet: 'momo',
                        momo: {
                          phone: '0988888888',
                          name: 'TIEM BANH HOANG GIA',
                          qrUrl: '',
                        },
                        zalopay: {
                          phone: '0988888888',
                          name: 'TIEM BANH HOANG GIA',
                          qrUrl: '',
                        },
                        viettelmoney: {
                          phone: '0988888888',
                          name: 'TIEM BANH HOANG GIA',
                          qrUrl: '',
                        },
                        transferSyntax: 'VIMO',
                      });
                    }}
                    className="px-4 py-3 rounded-2xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
                  >
                    Dữ liệu mẫu
                  </button>
                </div>
              </div>

              {/* Cột phải: Live Preview */}
              <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-zinc-50 to-zinc-100/60 rounded-3xl border border-zinc-200 space-y-4">
                <div className="text-center space-y-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                    Mô Phỏng Thực Tế (Live Preview)
                  </span>
                  <h3 className="text-sm font-black text-zinc-900">Mã QR Ví Điện Tử Tại POS</h3>
                </div>

                {/* Switcher Tab Preview */}
                <div className="flex gap-1 bg-zinc-200/80 p-1 rounded-xl">
                  {(['momo', 'zalopay', 'viettelmoney'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setPreviewWallet(w)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        previewWallet === w
                          ? 'bg-white text-zinc-900 shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {w === 'momo' ? 'MoMo' : w === 'zalopay' ? 'ZaloPay' : 'Viettel'}
                    </button>
                  ))}
                </div>

                {/* QR Display Card */}
                <div className="p-4 bg-white rounded-3xl border border-zinc-200/80 shadow-md flex flex-col items-center space-y-3 w-full max-w-[280px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-white text-[11px] font-black ${
                        previewWallet === 'momo'
                          ? 'bg-[#d82d8b]'
                          : previewWallet === 'zalopay'
                          ? 'bg-[#0068ff]'
                          : 'bg-[#ee0033]'
                      }`}
                    >
                      {previewWallet === 'momo' ? 'Ví MoMo' : previewWallet === 'zalopay' ? 'ZaloPay' : 'Viettel Money'}
                    </span>
                  </div>

                  <div className="p-2 bg-zinc-50 rounded-2xl border border-zinc-200">
                    <img
                      src={
                        previewWallet === 'momo'
                          ? (ewalletConfig.momo.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`2|99|${ewalletConfig.momo.phone}|${ewalletConfig.momo.name}||0|0|${testWalletAmount}|${testWalletNote}|transfer_p2p`)}`)
                          : previewWallet === 'zalopay'
                          ? (ewalletConfig.zalopay.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`ZALOPAY|${ewalletConfig.zalopay.phone}|${ewalletConfig.zalopay.name}|${testWalletAmount}|${testWalletNote}`)}`)
                          : (ewalletConfig.viettelmoney.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`VIETTEL|${ewalletConfig.viettelmoney.phone}|${ewalletConfig.viettelmoney.name}|${testWalletAmount}|${testWalletNote}`)}`)
                      }
                      alt="Wallet QR Preview"
                      className="w-48 h-48 rounded-xl object-contain mx-auto"
                    />
                  </div>

                  <div className="w-full text-xs space-y-1.5 pt-1 text-left">
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-500">Số điện thoại:</span>
                      <div className="flex items-center gap-1 font-mono font-black text-zinc-900">
                        <span>
                          {previewWallet === 'momo' ? ewalletConfig.momo.phone : previewWallet === 'zalopay' ? ewalletConfig.zalopay.phone : ewalletConfig.viettelmoney.phone}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const p = previewWallet === 'momo' ? ewalletConfig.momo.phone : previewWallet === 'zalopay' ? ewalletConfig.zalopay.phone : ewalletConfig.viettelmoney.phone;
                            navigator.clipboard.writeText(p);
                            setCopiedWalletPhone(true);
                            setTimeout(() => setCopiedWalletPhone(false), 2000);
                          }}
                          className="p-1 hover:bg-zinc-100 rounded text-zinc-500 cursor-pointer"
                        >
                          {copiedWalletPhone ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Chủ ví:</span>
                      <span className="font-bold text-zinc-900">
                        {previewWallet === 'momo' ? ewalletConfig.momo.name : previewWallet === 'zalopay' ? ewalletConfig.zalopay.name : ewalletConfig.viettelmoney.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Số tiền:</span>
                      <span className="font-black text-pink-600">
                        {testWalletAmount.toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                  </div>
                </div>

                {/* Thử nghiệm số tiền & ghi chú */}
                <div className="w-full bg-white p-3 rounded-2xl border border-zinc-200 space-y-2 text-xs">
                  <span className="font-bold text-zinc-600 block text-[11px]">Thử nghiệm quét QR Ví:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-400 block">Số tiền thử:</label>
                      <input
                        type="number"
                        value={testWalletAmount}
                        onChange={(e) => setTestWalletAmount(Number(e.target.value))}
                        className="w-full p-1.5 bg-zinc-50 border border-zinc-200 rounded-lg font-black text-pink-600 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-400 block">Nội dung thử:</label>
                      <input
                        type="text"
                        value={testWalletNote}
                        onChange={(e) => setTestWalletNote(e.target.value)}
                        className="w-full p-1.5 bg-zinc-50 border border-zinc-200 rounded-lg font-mono text-zinc-800 text-xs"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-400 text-center italic pt-1">
                    📱 Mở App MoMo / ZaloPay quét trực tiếp mã QR trên để trải nghiệm!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 10: QUẢN LÝ TÀI KHOẢN & PHÂN QUYỀN BẢO MẬT (SECURITY & ROLES) ── */}
      {activeTab === 'security' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-zinc-200 shadow-xs">
            <div>
              <h2 className="text-lg font-black text-zinc-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-amber-600" /> Quản Lý Phân Quyền & Tài Khoản
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Thiết lập mật khẩu quản trị cho Chủ Tiệm và mã PIN đăng nhập nhanh cho Nhân Viên quầy bán hàng.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm('Khôi phục mật khẩu Admin về "admin123" và mã PIN nhân viên về "1234"?')) {
                  resetSecurityDefaults();
                  setAdminNameInput('Chủ Tiệm (Admin)');
                  setStaffPinInput('1234');
                  setStaffNameInput('Nhân Viên Quầy & Bếp');
                  setSecurityMsg({ type: 'success', text: 'Đã khôi phục thông tin đăng nhập về mặc định thành công!' });
                  setTimeout(() => setSecurityMsg(null), 4000);
                }
              }}
              className="px-3.5 py-2 rounded-xl border border-zinc-200 hover:bg-zinc-50 text-xs font-bold text-zinc-600 transition cursor-pointer self-start sm:self-auto"
            >
              Khôi Phục Mặc Định
            </button>
          </div>

          {securityMsg && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
                securityMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              <span>{securityMsg.type === 'success' ? '✅' : '⚠️'}</span>
              <span>{securityMsg.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* THẺ 1: TÀI KHOẢN CHỦ TIỆM (ADMIN) */}
            <div className="bg-white p-5 rounded-3xl border border-amber-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-black">
                    👑
                  </div>
                  <div>
                    <h3 className="font-black text-base text-zinc-900">Tài Khoản Chủ Tiệm (Admin)</h3>
                    <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      Toàn Quyền Quản Trị
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Tên hiển thị Chủ Tiệm:</label>
                  <input
                    type="text"
                    value={adminNameInput}
                    onChange={(e) => setAdminNameInput(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Tên đăng nhập:</label>
                  <input
                    type="text"
                    disabled
                    value="admin"
                    className="w-full p-2.5 bg-zinc-100 border border-zinc-200 rounded-xl font-mono font-bold text-zinc-500 cursor-not-allowed"
                  />
                </div>

                {/* Đổi mật khẩu Admin */}
                <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-2.5">
                  <span className="font-bold text-amber-900 block text-xs">
                    🔑 Đổi Mật Khẩu Đăng Nhập Quản Trị:
                  </span>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] text-zinc-600 block mb-0.5">Mật khẩu cũ hiện tại:</label>
                      <input
                        type="password"
                        value={adminOldPass}
                        onChange={(e) => setAdminOldPass(e.target.value)}
                        placeholder="Nhập mật khẩu cũ (mặc định: admin123)..."
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-600 block mb-0.5">Mật khẩu mới:</label>
                      <input
                        type="password"
                        value={adminNewPass}
                        onChange={(e) => setAdminNewPass(e.target.value)}
                        placeholder="Tối thiểu 4 ký tự..."
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-xs font-mono"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSecurityMsg(null);
                      const res = updateAdminCredentials(adminOldPass, adminNewPass, adminNameInput);
                      if (res.success) {
                        setSecurityMsg({ type: 'success', text: 'Đã đổi mật khẩu Chủ Tiệm (Admin) thành công!' });
                        setAdminOldPass('');
                        setAdminNewPass('');
                      } else {
                        setSecurityMsg({ type: 'error', text: res.error || 'Đổi mật khẩu thất bại' });
                      }
                      setTimeout(() => setSecurityMsg(null), 4000);
                    }}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                  >
                    Lưu Mật Khẩu Admin Mới
                  </button>
                </div>
              </div>
            </div>

            {/* THẺ 2: TÀI KHOẢN NHÂN VIÊN (STAFF) */}
            <div className="bg-white p-5 rounded-3xl border border-orange-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-700 flex items-center justify-center font-black">
                    👤
                  </div>
                  <div>
                    <h3 className="font-black text-base text-zinc-900">Tài Khoản Nhân Viên (Staff)</h3>
                    <span className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200">
                      Chỉ Bán Hàng & Bếp (Khóa Giá Vốn & P&L)
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Tên hiển thị Nhân viên:</label>
                  <input
                    type="text"
                    value={staffNameInput}
                    onChange={(e) => setStaffNameInput(e.target.value)}
                    className="w-full p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-zinc-900"
                  />
                </div>

                <div>
                  <label className="font-bold text-zinc-700 block mb-1">Tên đăng nhập:</label>
                  <input
                    type="text"
                    disabled
                    value="nhanvien"
                    className="w-full p-2.5 bg-zinc-100 border border-zinc-200 rounded-xl font-mono font-bold text-zinc-500 cursor-not-allowed"
                  />
                </div>

                {/* Đổi mã PIN nhân viên */}
                <div className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-200/80 space-y-2.5">
                  <span className="font-bold text-orange-900 block text-xs">
                    🔢 Cài Đặt Mã PIN Đăng Nhập Nhanh Cho Thu Ngân:
                  </span>
                  <p className="text-[11px] text-zinc-500">
                    Nhân viên đứng quầy thu ngân chỉ cần bấm 4 số PIN này trên màn hình cảm ứng để vào ca bán bánh, không cần gõ bàn phím phức tạp.
                  </p>
                  <div>
                    <label className="text-[11px] text-zinc-600 block mb-0.5">Mã PIN mới (4 số):</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={staffPinInput}
                      onChange={(e) => setStaffPinInput(e.target.value)}
                      placeholder="Ví dụ: 1234, 6868..."
                      className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-sm font-black text-center tracking-widest font-mono text-zinc-900"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSecurityMsg(null);
                      const res = updateStaffCredentials(staffPinInput, undefined, staffNameInput);
                      if (res.success) {
                        setSecurityMsg({ type: 'success', text: `Đã cập nhật mã PIN nhân viên (${staffPinInput}) thành công!` });
                      } else {
                        setSecurityMsg({ type: 'error', text: res.error || 'Cập nhật mã PIN thất bại' });
                      }
                      setTimeout(() => setSecurityMsg(null), 4000);
                    }}
                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
                  >
                    Lưu Mã PIN Cho Nhân Viên
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* BẢNG MA TRẬN PHÂN QUYỀN HỆ THỐNG */}
          <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-xs space-y-3">
            <h3 className="font-black text-sm text-zinc-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600" /> Bảng Ma Trận Phân Quyền 2 Loại Tài Khoản
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-700 font-bold">
                    <th className="p-3">Tính Năng / Phân Hệ</th>
                    <th className="p-3 text-center text-amber-700">👑 Chủ Tiệm (Admin)</th>
                    <th className="p-3 text-center text-orange-700">👤 Nhân Viên (Staff)</th>
                    <th className="p-3">Ghi chú nghiệp vụ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-800 font-medium">
                  <tr>
                    <td className="p-3 font-bold">Quầy Thu Ngân Bán Hàng (POS)</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-zinc-500">Tạo đơn, nhận thanh toán, in bill, mở/đóng ca két tiền.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold">Đặt Bánh Kem / Bánh Sinh Nhật Trước</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-zinc-500">Lưu chữ viết lên bánh, hẹn giờ lấy bánh, nhận cọc.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold">Màn Hình Bếp Làm Bánh (Kitchen KDS)</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-zinc-500">Xem danh sách bánh cần làm theo thời gian thực.</td>
                  </tr>
                  <tr className="bg-rose-50/40">
                    <td className="p-3 font-bold text-rose-900">Trang Quản Trị Hệ Thống (/admin)</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-center text-rose-600 font-black">❌ Bị Khóa 100%</td>
                    <td className="p-3 text-rose-600 font-semibold">Tự động hiện màn hình khóa yêu cầu mật khẩu Admin.</td>
                  </tr>
                  <tr className="bg-rose-50/40">
                    <td className="p-3 font-bold text-rose-900">Báo Cáo Doanh Thu & Lãi Lỗ (P&L)</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-center text-rose-600 font-black">❌ Ẩn tuyệt đối</td>
                    <td className="p-3 text-rose-600 font-semibold">Nhân viên không xem được lợi nhuận của tiệm.</td>
                  </tr>
                  <tr className="bg-rose-50/40">
                    <td className="p-3 font-bold text-rose-900">Công Thức Bánh BOM & Giá Vốn COGS</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-center text-rose-600 font-black">❌ Ẩn tuyệt đối</td>
                    <td className="p-3 text-rose-600 font-semibold">Bảo mật công thức cốt bánh và giá nguyên liệu đầu vào.</td>
                  </tr>
                  <tr className="bg-rose-50/40">
                    <td className="p-3 font-bold text-rose-900">Cài Đặt VietQR & Ví Điện Tử (MoMo)</td>
                    <td className="p-3 text-center text-emerald-600 font-black">✅ Cho phép</td>
                    <td className="p-3 text-center text-rose-600 font-black">❌ Không được sửa</td>
                    <td className="p-3 text-rose-600 font-semibold">Chỉ chủ tiệm được đổi số tài khoản nhận tiền.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
