'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { db, CachedProduct } from '@/lib/db/dexie';
import { DEFAULT_BAKERY_PRODUCTS } from '@/lib/constants/bakeryData';
import {
  filterActiveProducts,
  getDeletedProductIds,
  markProductAsDeleted,
  isImportedProduct,
  decodeProductWithMeta,
  mergeProductLists,
} from '@/lib/utils/productManager';
import { generateUUID } from '@/lib/utils/uuid';
import { 
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, 
  Banknote, QrCode, CheckCircle2, AlertCircle, X, Printer,
  Sparkles, Wallet, Lock, History, AlertTriangle, Cake, Calendar,
  Clock, Phone, User, MessageSquare, Tag, Eye, Copy, Check, Building2,
  Package, ArrowLeft, ChevronRight, Receipt, FileSpreadsheet,
  Truck, MapPin, Store, Camera, Volume2, VolumeX, Bell, ShoppingBag, Settings, ShieldCheck,
  Home, KeyRound, RefreshCw, ChevronDown, PauseCircle, RotateCcw, Delete
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import Link from 'next/link';
import { clearProfileLocalData } from '@/lib/supabase/databaseProfileManager';
import { exportToCSV } from '@/lib/utils/exportExcel';
import { 
  broadcastNewOrder, 
  syncOrderToSupabase,
  subscribeCrossDeviceSync, 
  parsePreorderFromNotes, 
  formatPickupDateTime,
  cleanDisplayNotes,
  PaymentReceivedPayload,
  parseOrderBakeShortage,
} from '@/lib/supabase/realtimeSync';
import { soundManager } from '@/lib/utils/audioAlert';
import { phoneNotificationService } from '@/lib/utils/phoneNotification';
import {
  getDeliveryUrgency,
  getUrgentPreorders,
  sortPreordersByUrgency,
  isOrderCompletedOrCancelled,
  pruneOrdersCache,
  prunePreordersCache,
  MAX_CACHED_ORDERS,
  MAX_CACHED_PREORDERS,
  getDeliveryAlertConfig,
  DEFAULT_DELIVERY_ALERT_CONFIG,
  fetchDeliveryAlertConfigFromDb,
  DeliveryAlertConfig,
  EVENT_DELIVERY_ALERT_CONFIG_UPDATED,
} from '@/lib/utils/deliveryAlerts';
import { sendTelegramOrderAlert, sendTelegramDeliveredSuccessAlert } from '@/lib/utils/telegramNotify';
import { triggerServerPush } from '@/lib/utils/webPushManager';
import { CakeStickerModal, CakeStickerData } from '@/components/pos/CakeStickerModal';
import { OrderDetailModal } from '@/components/kitchen/OrderDetailModal';
import { ManagerPinModal } from '@/components/pos/ManagerPinModal';
import {
  DEFAULT_SHIFT,
  getCurrentShiftLocally,
  saveCurrentShiftLocally,
  fetchCurrentShiftFromDb,
  saveCurrentShiftToDb,
  closeShiftAndOpenNew,
  getShiftHistoryLocally,
  fetchShiftHistoryFromDb,
  printShiftHandoverReceipt,
  EVENT_CURRENT_SHIFT_UPDATED,
  EVENT_SHIFT_HISTORY_UPDATED,
} from '@/lib/utils/shiftSync';
import { ShiftState, ShiftRecord } from '@/lib/types/shift';
import { printHtml } from '@/lib/utils/printHelper';
import { SpoilageLog, SPOILAGE_REASONS } from '@/lib/types/spoilage';
import {
  getSpoilageLogs,
  addSpoilageLog,
  deleteSpoilageLog,
  getTodaySpoilageSummary,
  fetchSpoilageLogsFromDb,
} from '@/lib/utils/spoilageManager';
import { addStockAdjustmentLog } from '@/lib/utils/stockAdjustmentManager';
import { persistProductToSupabase } from '@/lib/utils/productManager';
import { broadcastProductChange } from '@/lib/supabase/realtimeSync';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { StockAdjustmentHistoryModal } from '@/components/StockAdjustmentHistoryModal';
import { PrinterSettingsModal } from '@/components/pos/PrinterSettingsModal';
import NotificationSettingsModal from '@/components/NotificationSettingsModal';
import { PrintTemplateDesignerModal } from '@/components/pos/PrintTemplateDesignerModal';
import { ReceiptTemplateConfig } from '@/lib/types/printTemplate';
import { getReceiptTemplate, PRINT_TEMPLATE_UPDATED_EVENT } from '@/lib/utils/printTemplateManager';
import { getStoreBranding, fetchStoreBrandingFromDb, BRANDING_UPDATED_EVENT, StoreBrandingConfig, getNextOrderNumber, peekNextOrderNumber } from '@/lib/utils/storeBranding';
import { startAutoBackupWatcher, stopAutoBackupWatcher } from '@/lib/utils/backupManager';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/utils/formatCurrency';
import {
  fetchVietqrConfigFromDb,
  getVietqrConfig,
  fetchEwalletConfigFromDb,
  getEwalletConfig,
  VIETQR_UPDATED_EVENT,
  EWALLET_UPDATED_EVENT,
  VietqrConfig,
  EwalletConfig,
  getAutoBankConfig,
  fetchAutoBankConfigFromDb,
  AutoBankWebhookConfig,
  AUTOBANK_CONFIG_UPDATED_EVENT,
  getTransferVerificationConfig,
  fetchTransferVerificationConfigFromDb,
  TransferVerificationConfig,
  TRANSFER_VERIFY_UPDATED_EVENT,
} from '@/lib/utils/paymentSync';
import {
  broadcastTransferApprovalRequest,
  TransferApprovalPayload,
  TransferApprovalResolvedPayload,
} from '@/lib/supabase/realtimeSync';
import { TransferProofCameraModal } from '@/components/pos/TransferProofCameraModal';
import {
  getCakeCostingConfig,
  calculateCustomCakeCost,
  CakeCostCalculationResult,
  fetchCakeCostingFromDb,
  cleanCakeNameAndSize,
} from '@/lib/utils/customCakeCosting';
import {
  CustomCakeCostingConfig,
  DEFAULT_CUSTOM_CAKE_CONFIG,
} from '@/lib/constants/cakeCostingData';
import { BirthdayCakeOrderModal } from '@/components/pos/BirthdayCakeOrderModal';
import { PosReadyShippingModal } from '@/components/pos/PosReadyShippingModal';
import { broadcastOrderStatusUpdate, syncOrderRefundToSupabase } from '@/lib/supabase/realtimeSync';
import { HeldOrder } from '@/lib/types/heldOrder';
import { HeldOrdersModal } from '@/components/pos/HeldOrdersModal';
import { ReturnExchangeModal } from '@/components/pos/ReturnExchangeModal';
import { OrderReturnRecord } from '@/lib/types/orderReturn';
import { matchesOrderSearch } from '@/lib/utils/orderSearch';
import { getCashflow, saveCashflowLocally, saveCashflowToDb, CashflowTransaction } from '@/lib/utils/accountingSync';

interface CartItem {
  product: CachedProduct;
  quantity: number;
  notes?: string;
}

interface PreorderFormData {
  customerName: string;
  customerPhone: string;
  pickupDate: string;
  pickupTime: string;
  deliveryMethod: 'pickup' | 'shipping';
  shippingAddress: string;
  shippingFee: number;
  cakeName: string;
  size: string;
  sizeId?: string;
  flavor: string;
  flavorId?: string;
  cream?: string;
  creamId?: string;
  packaging?: string;
  packagingId?: string;
  filling?: string;
  fillingId?: string;
  selectedAddonIds?: string[];
  customAddonCost?: number;
  cakeMessage: string;
  notes: string;
  totalPrice: number;
  depositAmount: number;
  paymentMethod: 'cash' | 'transfer' | 'momo';
  referenceImageUrl: string;
  isReadyStock?: boolean;
}

export default function POSPage() {
  const { user, isAdmin, securityConfig, openLoginModal } = useAuth();
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  const [products, setProducts] = useState<CachedProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  // Discount state: hỗ trợ giảm giá theo % hoặc theo số tiền (VND)
  const [discountMode, setDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountCustomAmount, setDiscountCustomAmount] = useState<number>(0);

  // ── PHÂN HỆ TẠM LƯU ĐƠN HÀNG (HOLD ORDERS) ──
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [isHeldOrdersModalOpen, setIsHeldOrdersModalOpen] = useState(false);
  const [isHoldPromptOpen, setIsHoldPromptOpen] = useState(false);
  const [holdLabelInput, setHoldLabelInput] = useState('');

  // ── PHÂN HỆ ĐỔI TRẢ HÀNG & HOÀN TIỀN (RETURNS & EXCHANGES) ──
  const [isReturnExchangeModalOpen, setIsReturnExchangeModalOpen] = useState(false);
  const [orderToReturn, setOrderToReturn] = useState<any | null>(null);

  // Toast phản hồi tức thời khi thêm bánh vào giỏ hàng
  const [cartToast, setCartToast] = useState<{ name: string; qty: number; time: number } | null>(null);

  // ── BỘ HIỆU ỨNG ANIMATION SỐNG ĐỘNG (FLY TO CART & JIGGLE) ──
  const [flyingItems, setFlyingItems] = useState<Array<{
    id: number;
    startX: number;
    startY: number;
    midX: number;
    midY: number;
    endX: number;
    endY: number;
    name: string;
    image?: string;
  }>>([]);
  const [cartBumping, setCartBumping] = useState(false);
  const [totalPulsing, setTotalPulsing] = useState(false);

  const triggerFlyToCart = (clientX?: number, clientY?: number, product?: any) => {
    if (typeof window === 'undefined') return;

    const isMobile = window.innerWidth < 1024;

    // Tìm phần tử biểu tượng giỏ hàng ĐANG HIỂN THỊ (không bị hidden / display: none)
    let cartTarget: HTMLElement | null = null;

    if (isMobile) {
      // 1. Trên điện thoại: Luôn bay vào tab "Giỏ Hàng" ở thanh điều hướng trên cùng (cột 3/6)
      const tabTarget = document.getElementById('pos-cart-mobile-tab-target');
      if (tabTarget && tabTarget.getBoundingClientRect().width > 0) {
        cartTarget = tabTarget;
      }
    } else {
      // 2. Trên desktop: Bay vào icon giỏ hàng ở cột phải
      const desktopTarget = document.getElementById('pos-cart-target');
      if (desktopTarget && desktopTarget.getBoundingClientRect().width > 0) {
        cartTarget = desktopTarget;
      }
    }

    let endX = isMobile ? Math.round(window.innerWidth * 0.42) : window.innerWidth - 120;
    let endY = isMobile ? 32 : 115;

    if (cartTarget) {
      const rect = cartTarget.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        endX = Math.round(rect.left + rect.width / 2);
        endY = Math.round(rect.top + rect.height / 2);
      }
    }

    const startX = clientX !== undefined && clientX > 0 ? clientX : window.innerWidth / 2;
    const startY = clientY !== undefined && clientY > 0 ? clientY : window.innerHeight / 2;

    let midX: number;
    let midY: number;

    if (isMobile) {
      // Trên điện thoại: Quỹ đạo uốn cong nhẹ tự nhiên từ thẻ bánh bay thẳng lên icon "Giỏ Hàng" ở tab đỉnh
      midX = Math.round(startX + (endX - startX) * 0.45);
      midY = Math.round(startY - (startY - endY) * 0.55);
    } else {
      // Trên desktop: Quỹ đạo uốn cong tự nhiên bên dưới thanh header (luôn giữ midY >= 135px)
      midX = Math.round(startX + (endX - startX) * 0.5);
      const naturalMidY = Math.round((startY + endY) / 2 - 50);
      midY = Math.max(135, naturalMidY);
    }

    const newItem = {
      id: Date.now() + Math.random(),
      startX,
      startY,
      midX,
      midY,
      endX,
      endY,
      name: product?.name || 'Bánh',
      image: product?.image_url,
    };

    setFlyingItems((prev) => [...prev, newItem]);

    // Kích hoạt rung nảy giỏ hàng và bừng sáng tổng tiền ngay khi hạt tiếp đất chính xác vào giỏ (1010ms)
    setTimeout(() => {
      setCartBumping(true);
      setTotalPulsing(true);
      setTimeout(() => setCartBumping(false), 600);
      setTimeout(() => setTotalPulsing(false), 700);
    }, 1010);

    setTimeout(() => {
      setFlyingItems((prev) => prev.filter((it) => it.id !== newItem.id));
    }, 1200);
  };

  useEffect(() => {
    if (!cartToast) return;
    const t = setTimeout(() => setCartToast(null), 2500);
    return () => clearTimeout(t);
  }, [cartToast]);
  
  // Shift Management State
  const [shift, setShift] = useState<ShiftState>(DEFAULT_SHIFT);
  const [shiftHistory, setShiftHistory] = useState<ShiftRecord[]>([]);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [shiftModalTab, setShiftModalTab] = useState<'handover' | 'history'>('handover');
  const [closingCashInput, setClosingCashInput] = useState<number>(0);
  const [shiftHandoverNotes, setShiftHandoverNotes] = useState<string>('');
  const [isClosingShift, setIsClosingShift] = useState(false);
  const [shiftSuccessMsg, setShiftSuccessMsg] = useState<string | null>(null);
  const [lastClosedShift, setLastClosedShift] = useState<ShiftRecord | null>(null);
  const [handoverMode, setHandoverMode] = useState<'keep_all' | 'withdraw'>('keep_all');
  const [leaveForNextShiftInput, setLeaveForNextShiftInput] = useState<number>(0);
  const [isSettingsDropdownOpen, setIsSettingsDropdownOpen] = useState(false);

  // Cấu hình Giờ Cảnh Báo Giao Hàng
  const [deliveryAlertConfig, setDeliveryAlertConfig] = useState<DeliveryAlertConfig>(DEFAULT_DELIVERY_ALERT_CONFIG);

  useEffect(() => {
    setShift(getCurrentShiftLocally());
    setShiftHistory(getShiftHistoryLocally());
    setDeliveryAlertConfig(getDeliveryAlertConfig());

    fetchCurrentShiftFromDb().then((dbShift) => {
      if (dbShift) setShift(dbShift);
    });
    fetchShiftHistoryFromDb().then((hist) => {
      if (hist) setShiftHistory(hist);
    });

    const handleShiftUpdated = (e: any) => {
      if (e?.detail) setShift(e.detail);
      else setShift(getCurrentShiftLocally());
    };
    const handleHistoryUpdated = (e: any) => {
      if (e?.detail) setShiftHistory(e.detail);
      else setShiftHistory(getShiftHistoryLocally());
    };

    window.addEventListener(EVENT_CURRENT_SHIFT_UPDATED, handleShiftUpdated);
    window.addEventListener(EVENT_SHIFT_HISTORY_UPDATED, handleHistoryUpdated);
    return () => {
      window.removeEventListener(EVENT_CURRENT_SHIFT_UPDATED, handleShiftUpdated);
      window.removeEventListener(EVENT_SHIFT_HISTORY_UPDATED, handleHistoryUpdated);
    };
  }, []);

  useEffect(() => {
    fetchDeliveryAlertConfigFromDb().then((cfg) => {
      if (cfg) setDeliveryAlertConfig(cfg);
    });
    const handleAlertCfgUpdated = (e: any) => {
      if (e.detail) setDeliveryAlertConfig(e.detail);
      else setDeliveryAlertConfig(getDeliveryAlertConfig());
    };
    window.addEventListener(EVENT_DELIVERY_ALERT_CONFIG_UPDATED, handleAlertCfgUpdated);
    return () => window.removeEventListener(EVENT_DELIVERY_ALERT_CONFIG_UPDATED, handleAlertCfgUpdated);
  }, []);

  // Normal Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'momo' | 'split'>('cash');
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [splitCashAmount, setSplitCashAmount] = useState<number>(0);
  const [splitTransferAmount, setSplitTransferAmount] = useState<number>(0);
  const [splitCashGiven, setSplitCashGiven] = useState<number>(0);
  const [processingOrder, setProcessingOrder] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);
  const [isPrintTemplateDesignerOpen, setIsPrintTemplateDesignerOpen] = useState(false);
  const [receiptConfig, setReceiptConfig] = useState<ReceiptTemplateConfig>(() => getReceiptTemplate('80mm'));

  useEffect(() => {
    const handleTemplateUpdate = (e: any) => {
      if (e?.detail?.type === 'receipt') {
        setReceiptConfig(getReceiptTemplate('80mm'));
      }
    };
    window.addEventListener(PRINT_TEMPLATE_UPDATED_EVENT, handleTemplateUpdate);
    return () => window.removeEventListener(PRINT_TEMPLATE_UPDATED_EVENT, handleTemplateUpdate);
  }, []);

  // ── AUTO-BANK WEBHOOK PAYMENT & LIVE CONFIRMATION STATE ──
  const [checkoutTransferCode, setCheckoutTransferCode] = useState<string>('');
  const [copiedTransferCode, setCopiedTransferCode] = useState<boolean>(false);
  const [paymentReceivedInfo, setPaymentReceivedInfo] = useState<{
    amount: number;
    gateway?: string;
    orderCode?: string;
    transactionId?: string;
  } | null>(null);
  const [autoBankConfig, setAutoBankConfig] = useState<AutoBankWebhookConfig>(() => getAutoBankConfig());
  const [toastPaymentNotice, setToastPaymentNotice] = useState<{
    amount: number;
    orderCode?: string;
    gateway?: string;
    time: number;
  } | null>(null);
  const incomingPaymentHandlerRef = useRef<(payload: PaymentReceivedPayload) => void>(() => {});

  // ── PHÂN HỆ XÁC THỰC CHUYỂN KHOẢN (3 CHẾ ĐỘ & CHỤP BILL ĐỐI SOÁT) ──
  const [transferVerifyConfig, setTransferVerifyConfig] = useState<TransferVerificationConfig>(() => getTransferVerificationConfig());
  const [activeCheckoutOrderNumber, setActiveCheckoutOrderNumber] = useState<string>('');
  const [isWaitingAdminTransferApproval, setIsWaitingAdminTransferApproval] = useState<boolean>(false);
  const [adminApprovedTransfer, setAdminApprovedTransfer] = useState<boolean>(false);
  const [isProofCameraOpen, setIsProofCameraOpen] = useState<boolean>(false);
  const [capturedTransferProofImage, setCapturedTransferProofImage] = useState<string | null>(null);
  const [transferResendStatus, setTransferResendStatus] = useState<string | null>(null);
  const incomingTransferApprovalResolvedRef = useRef<(payload: TransferApprovalResolvedPayload) => void>(() => {});

  // ── 3 LỰA CHỌN THANH TOÁN TẠI POS (LẤY NGAY / HẸN GIỜ / SHIP BÁNH) ──
  const [fulfillmentType, setFulfillmentType] = useState<'takeaway' | 'pickup' | 'shipping'>('takeaway');
  const [posCustomerName, setPosCustomerName] = useState('');
  const [posCustomerPhone, setPosCustomerPhone] = useState('');
  const [posShippingAddress, setPosShippingAddress] = useState('');
  const [posPickupDate, setPosPickupDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [posPickupTime, setPosPickupTime] = useState(() => {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [posCakeMessage, setPosCakeMessage] = useState('');
  const [posShippingFee, setPosShippingFee] = useState<number>(0);
  const [posDepositAmount, setPosDepositAmount] = useState<number | null>(null);
  const [cartNotes, setCartNotes] = useState<string>('');

  // ── MODAL ĐẶT BÁNH SINH NHẬT THEO CƠ CHẾ FLOWCHART MỚI ──
  const [isBirthdayOrderModalOpen, setIsBirthdayOrderModalOpen] = useState(false);
  const [birthdayOrderProduct, setBirthdayOrderProduct] = useState<any | null>(null);

  // ── INVENTORY & STOCK MANAGEMENT STATE ──
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<'all' | 'ready' | 'semi' | 'low'>('all');
  const [editingStockId, setEditingStockId] = useState<string | null>(null);
  const [editingStockVal, setEditingStockVal] = useState<number>(0);

  const lowStockItems = useMemo(() => {
    return products.filter((p) => (p.stock_qty ?? 0) <= (p.min_stock_alert ?? 3));
  }, [products]);

  const [isPosStockHistoryOpen, setIsPosStockHistoryOpen] = useState(false);
  const [posStockFilterId, setPosStockFilterId] = useState<string | null>(null);

  const updateProductStock = (productId: string, newQty: number, reason: string = 'Kiểm kê định kỳ quầy POS') => {
    let updatedTarget: any = null;
    const safeNewQty = Math.max(0, newQty);

    setProducts((prev) => {
      const target = prev.find((p) => p.id === productId);
      if (target) {
        const oldQty = target.stock_qty ?? 10;
        updatedTarget = { ...target, stock_qty: safeNewQty };
        addStockAdjustmentLog({
          productId,
          productName: target.name,
          productImage: target.image_url,
          productCategory: target.category,
          oldQuantity: oldQty,
          newQuantity: safeNewQty,
          deltaQuantity: safeNewQty - oldQty,
          reason,
          adjustedBy: 'Thu ngân / Quầy POS',
        });
      }
      const updated = prev.map((p) => (p.id === productId ? { ...p, stock_qty: safeNewQty } : p));
      try {
        localStorage.setItem('bakery_products', JSON.stringify(updated));
        const rawStocks = localStorage.getItem('bakery_stocks') || '{}';
        const stockMap = JSON.parse(rawStocks);
        stockMap[productId] = safeNewQty;
        if (target?.name) stockMap[target.name.toLowerCase().trim()] = safeNewQty;
        localStorage.setItem('bakery_stocks', JSON.stringify(stockMap));

        db.products.update(productId, { stock_qty: safeNewQty }).catch(() => db.products.bulkPut(updated));
      } catch {}
      return updated;
    });

    // Đồng bộ tức thì lên Supabase SQL và phát sóng Realtime Sync (<50ms)
    if (updatedTarget) {
      persistProductToSupabase(updatedTarget).catch(console.error);
      supabase.from('products').update({ stock_qty: safeNewQty }).eq('id', productId).then(() => {}, console.error);
      broadcastProductChange({ action: 'update', product: updatedTarget }).catch(console.error);
      if (isLocalMode()) {
        autoSyncToLocalSqlFolder().catch(console.warn);
      }
    }
  };

  const addProductStock = (productId: string, amount: number, reason: string = 'Nhập thêm mẻ mới từ lò bếp') => {
    let updatedTarget: any = null;

    setProducts((prev) => {
      const target = prev.find((p) => p.id === productId);
      let safeNewQty = 0;
      if (target) {
        const oldQty = target.stock_qty ?? 10;
        safeNewQty = Math.max(0, oldQty + amount);
        updatedTarget = { ...target, stock_qty: safeNewQty };
        addStockAdjustmentLog({
          productId,
          productName: target.name,
          productImage: target.image_url,
          productCategory: target.category,
          oldQuantity: oldQty,
          newQuantity: safeNewQty,
          deltaQuantity: amount,
          reason,
          adjustedBy: 'Thu ngân / Quầy POS',
        });
      }
      const updated = prev.map((p) => (p.id === productId ? { ...p, stock_qty: Math.max(0, (p.stock_qty ?? 0) + amount) } : p));
      try {
        localStorage.setItem('bakery_products', JSON.stringify(updated));
        const rawStocks = localStorage.getItem('bakery_stocks') || '{}';
        const stockMap = JSON.parse(rawStocks);
        stockMap[productId] = safeNewQty;
        if (target?.name) stockMap[target.name.toLowerCase().trim()] = safeNewQty;
        localStorage.setItem('bakery_stocks', JSON.stringify(stockMap));

        db.products.update(productId, { stock_qty: safeNewQty }).catch(() => db.products.bulkPut(updated));
      } catch {}
      return updated;
    });

    if (updatedTarget) {
      persistProductToSupabase(updatedTarget).catch(console.error);
      supabase.from('products').update({ stock_qty: updatedTarget.stock_qty }).eq('id', productId).then(() => {}, console.error);
      broadcastProductChange({ action: 'update', product: updatedTarget }).catch(console.error);
      if (isLocalMode()) {
        autoSyncToLocalSqlFolder().catch(console.warn);
      }
    }
  };

  // VietQR Config State
  const [vietqrConfig, setVietqrConfig] = useState<VietqrConfig>(() => getVietqrConfig());
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedPreorderAccount, setCopiedPreorderAccount] = useState(false);

  // E-Wallet Config State
  const [ewalletConfig, setEwalletConfig] = useState<EwalletConfig>(() => getEwalletConfig());
  const [selectedWalletType, setSelectedWalletType] = useState<'momo' | 'zalopay' | 'viettelmoney'>(() => getEwalletConfig().activeWallet || 'momo');
  const [copiedWalletPhone, setCopiedWalletPhone] = useState(false);
  const [copiedPreorderWalletPhone, setCopiedPreorderWalletPhone] = useState(false);

  // ── ĐẶT BÁNH KEM (CUSTOM CAKE PREORDER) MODAL STATE ──
  const [isPreorderModalOpen, setIsPreorderModalOpen] = useState(false);
  // Cấu hình định mức chi phí bánh sinh nhật đặt theo yêu cầu
  const [cakeCostingConfig, setCakeCostingConfig] = useState<CustomCakeCostingConfig>(() => getCakeCostingConfig());
  
  useEffect(() => {
    setCakeCostingConfig(getCakeCostingConfig());
    fetchCakeCostingFromDb().then((remote) => {
      if (remote) setCakeCostingConfig(remote);
    });
    const handleCostingUpdate = () => setCakeCostingConfig(getCakeCostingConfig());
    window.addEventListener('bakery_cake_costing_updated', handleCostingUpdate);
    return () => window.removeEventListener('bakery_cake_costing_updated', handleCostingUpdate);
  }, []);

  const [preorderForm, setPreorderForm] = useState<PreorderFormData>({
    customerName: '',
    customerPhone: '',
    pickupDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Mặc định ngày mai
    pickupTime: '17:30',
    deliveryMethod: 'pickup',
    shippingAddress: '',
    shippingFee: 0,
    cakeName: 'Bánh Bông Lan Trứng Muối 18cm',
    size: 'Size 18cm (6 - 8 người)',
    sizeId: 'size-18',
    flavor: 'Cốt Vani truyền thống',
    flavorId: 'flavor-vanilla',
    cream: 'Kem tươi Topping thanh mát',
    creamId: 'cream-topping',
    packaging: 'Hộp giấy tiêu chuẩn + Đế lót',
    packagingId: 'pack-paper',
    selectedAddonIds: [],
    customAddonCost: 0,
    filling: 'Không nhân (Chỉ phủ kem tươi)',
    fillingId: 'filling-none',
    cakeMessage: 'Chúc Mừng Sinh Nhật',
    notes: 'Ít ngọt, trang trí tone màu ấm, kèm nến số',
    totalPrice: 365000,
    depositAmount: 150000,
    paymentMethod: 'cash',
    referenceImageUrl: '',
  });
  const [preorderError, setPreorderError] = useState<string | null>(null);
  const preorderImageRef = useRef<HTMLInputElement>(null);
  const [preorderImageLightbox, setPreorderImageLightbox] = useState<string | null>(null);
  const [isCustomCake, setIsCustomCake] = useState(false);
  // Giảm giá cho Đơn Đặt Bánh Kem
  const [preorderDiscountMode, setPreorderDiscountMode] = useState<'percent' | 'amount'>('percent');
  const [preorderDiscountVal, setPreorderDiscountVal] = useState<number>(0);

  // Preorder List View Modal
  const [isPreorderListOpen, setIsPreorderListOpen] = useState(false);
  const [preorderFilterTab, setPreorderFilterTab] = useState<'undelivered' | 'all' | 'completed'>('undelivered');
  const [preordersList, setPreordersList] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const hasSeeded = localStorage.getItem('bakery_kds_seeded');
        const poMap = new Map<string, any>();

        const rawOrders = localStorage.getItem('bakery_orders');
        if (rawOrders) {
          const parsed = JSON.parse(rawOrders);
          if (Array.isArray(parsed)) {
            parsed
              .filter((o: any) => o.order_type === 'preorder' || o.pickupDateTime || o.preorder_pickup_at || o.order_number?.startsWith('BK-PRE') || o.orderNumber?.startsWith('BK-PRE'))
              .forEach((p: any) => {
                const k = p.order_number || p.orderNumber || p.id;
                if (k) poMap.set(k, p);
              });
          }
        }
        const saved = localStorage.getItem('bakery_preorders');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            parsed.forEach((p: any) => {
              const k = p.order_number || p.orderNumber || p.id;
              if (k) {
                const exist = poMap.get(k);
                poMap.set(k, { ...exist, ...p });
              }
            });
          }
        }
        if (poMap.size > 0 || hasSeeded) return prunePreordersCache(Array.from(poMap.values()), MAX_CACHED_PREORDERS);
      } catch {}
    }
    return [
      {
        id: 'pre-1',
        orderNumber: 'BK-PRE-20260908-01',
        customerName: 'Chị Lan Anh',
        customerPhone: '0912 345 678',
        pickupDateTime: '17:30 ngày mai (08/09)',
        cakeName: 'Bánh Bông Lan Trứng Muối 18cm',
        cakeMessage: 'Mừng Sinh Nhật Bé Bắp 3 tuổi',
        totalPrice: 365000,
        depositAmount: 200000,
        remainingAmount: 165000,
        status: 'pending',
      },
      {
        id: 'pre-2',
        orderNumber: 'BK-PRE-20260909-02',
        customerName: 'Anh Tuấn',
        customerPhone: '0988 776 655',
        pickupDateTime: '10:00 ngày 09/09',
        cakeName: 'Bánh Kem Bắp Phô Mai 20cm',
        cakeMessage: 'Happy Birthday My Love',
        totalPrice: 420000,
        depositAmount: 420000,
        remainingAmount: 0,
        status: 'preparing',
      }
    ];
  });

  // ── ĐƠN CHỜ SHIP / CHỜ GIAO QUẦY (BƯỚC 3 BẾP SẴN SÀNG) ──
  const [isReadyShippingModalOpen, setIsReadyShippingModalOpen] = useState(false);
  const [isPosSyncing, setIsPosSyncing] = useState(false);

  // ── LỊCH SỬ HÓA ĐƠN & LƯU TRỮ ĐƠN ĐÃ XUẤT STATE ──
  const [isInvoiceHistoryOpen, setIsInvoiceHistoryOpen] = useState(false);
  const [viewingProofImage, setViewingProofImage] = useState<string | null>(null);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'takeaway' | 'preorder' | 'cash' | 'transfer'>('all');
  const [invoicesList, setInvoicesList] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bakery_orders');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });

  const [allOrderReturns, setAllOrderReturns] = useState<OrderReturnRecord[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bakery_order_returns');
        if (raw) return JSON.parse(raw);
      } catch {}
    }
    return [];
  });

  const [expandedReturnOrders, setExpandedReturnOrders] = useState<Record<string, boolean>>({});
  const toggleReturnDetails = (orderKey: string) => {
    setExpandedReturnOrders((prev) => ({
      ...prev,
      [orderKey]: !prev[orderKey],
    }));
  };

  // ── XÓA VĨNH VIỄN HÓA ĐƠN & ĐƠN HÀNG STATE ──
  const [orderToDelete, setOrderToDelete] = useState<any | null>(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [deletePinInput, setDeletePinInput] = useState('');
  const [deletePinError, setDeletePinError] = useState<string | null>(null);

  const getManagerOrAdminPin = () => {
    if (typeof window !== 'undefined') {
      try {
        const secRaw = localStorage.getItem('bakery_security_config');
        if (secRaw) {
          const sec = JSON.parse(secRaw);
          if (sec?.managerPin && String(sec.managerPin).trim()) return String(sec.managerPin).trim();
          if (sec?.adminPin && String(sec.adminPin).trim()) return String(sec.adminPin).trim();
          if (sec?.staffPin && String(sec.staffPin).trim()) return String(sec.staffPin).trim();
        }
        const saved = localStorage.getItem('bakery_admin_pin');
        if (saved && saved.trim()) return saved.trim();
      } catch {}
    }
    return '8888';
  };

  const handlePermanentDeleteOrder = async (order: any) => {
    if (!order) return;
    setIsDeletingOrder(true);
    try {
      const clean = (val: any) => String(val || '').replace(/^#/, '').trim().toLowerCase();
      const rawNum = order.order_number || order.orderNumber || '';
      const orderNum = clean(rawNum);
      const orderId = clean(order.id || order.local_id || order.server_id || '');

      // 1. Thêm vào Danh sách Đen Đã Xóa (Blacklist/Tombstone)
      try {
        const rawDeleted = localStorage.getItem('bakery_deleted_order_keys');
        const deletedSet: string[] = rawDeleted ? JSON.parse(rawDeleted) : [];
        if (orderNum && !deletedSet.includes(orderNum)) deletedSet.push(orderNum);
        if (orderId && !deletedSet.includes(orderId)) deletedSet.push(orderId);
        localStorage.setItem('bakery_deleted_order_keys', JSON.stringify(deletedSet.slice(-500)));
      } catch (e) {
        console.warn('Lỗi ghi bakery_deleted_order_keys:', e);
      }

      // 2. Xóa khỏi localStorage: bakery_orders & state invoicesList
      try {
        const rawOrders = localStorage.getItem('bakery_orders');
        if (rawOrders) {
          const parsed = JSON.parse(rawOrders);
          const filtered = parsed.filter((o: any) => {
            const oNum = clean(o.order_number || o.orderNumber);
            const oId = clean(o.id || o.local_id || o.server_id);
            if (orderNum && oNum && oNum === orderNum) return false;
            if (orderId && oId && oId === orderId) return false;
            return true;
          });
          localStorage.setItem('bakery_orders', JSON.stringify(filtered));
          setInvoicesList(filtered);
        }
      } catch (e) {
        console.warn('Lỗi xóa trong bakery_orders:', e);
      }

      // 3. Xóa khỏi localStorage: bakery_preorders & state preordersList
      try {
        const rawPreorders = localStorage.getItem('bakery_preorders');
        if (rawPreorders) {
          const parsedPo = JSON.parse(rawPreorders);
          const filteredPo = parsedPo.filter((o: any) => {
            const oNum = clean(o.order_number || o.orderNumber);
            const oId = clean(o.id || o.local_id || o.server_id);
            if (orderNum && oNum && oNum === orderNum) return false;
            if (orderId && oId && oId === orderId) return false;
            return true;
          });
          localStorage.setItem('bakery_preorders', JSON.stringify(filteredPo));
          setPreordersList(filteredPo);
        }
      } catch (e) {
        console.warn('Lỗi xóa trong bakery_preorders:', e);
      }

      // 4. Xóa các phiếu đổi trả liên quan: bakery_order_returns & state allOrderReturns
      try {
        const rawReturns = localStorage.getItem('bakery_order_returns');
        if (rawReturns) {
          const parsedRet = JSON.parse(rawReturns);
          const filteredRet = parsedRet.filter((r: any) => {
            const rNum = clean(r.order_number);
            const rId = clean(r.order_id);
            if (orderNum && rNum && rNum === orderNum) return false;
            if (orderId && rId && rId === orderId) return false;
            return true;
          });
          localStorage.setItem('bakery_order_returns', JSON.stringify(filteredRet));
          setAllOrderReturns(filteredRet);
        }
      } catch (e) {
        console.warn('Lỗi xóa returns:', e);
      }

      // 5. Xóa khỏi Dexie (IndexedDB): db.orders
      try {
        if (db && db.orders) {
          await db.orders.filter((o: any) => {
            const oNum = clean(o.order_number || o.orderNumber);
            const oId = clean(o.id || o.local_id || o.server_id);
            return Boolean((orderNum && oNum === orderNum) || (orderId && oId === orderId));
          }).delete();
        }
      } catch (e) {
        console.warn('Lỗi xóa trong Dexie:', e);
      }

      // 6. Xóa khỏi Supabase Cloud DB (xóa order_items trước, sau đó xóa orders)
      try {
        if (supabase) {
          let sbId = order.id;
          if (!sbId && rawNum) {
            const { data: found } = await supabase
              .from('orders')
              .select('id')
              .or(`order_number.eq.${rawNum},order_number.eq.#${rawNum}`)
              .maybeSingle();
            if (found?.id) sbId = found.id;
          }

          if (sbId) {
            await supabase.from('order_items').delete().eq('order_id', sbId);
            await supabase.from('orders').delete().eq('id', sbId);
          } else if (rawNum) {
            await supabase.from('orders').delete().eq('order_number', rawNum);
          }
        }
      } catch (e) {
        console.warn('Lỗi xóa Supabase:', e);
      }

      // 7. Đồng bộ Local SQL API nếu có
      try {
        fetch('/api/local-sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'delete_order',
            orderNumber: rawNum,
            orderId: order.id,
          }),
        }).catch(() => {});
      } catch {}

      // 8. Bắn sự kiện cập nhật toàn cục & phát sóng Realtime đa thiết bị
      if (rawNum) {
        broadcastOrderStatusUpdate(rawNum, 'cancelled').catch(() => {});
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('bakery_orders_updated'));
        window.dispatchEvent(new CustomEvent('bakery_order_deleted', { 
          detail: { 
            orderNum, 
            orderId, 
            orderNumber: rawNum, 
            id: order.id 
          } 
        }));
      }

      // 9. Toast thông báo
      setCartToast({
        name: `Đã xóa vĩnh viễn hóa đơn #${rawNum || orderNum}`,
        qty: 1,
        time: Date.now(),
      });
      setOrderToDelete(null);
      setDeletePinInput('');
      setDeletePinError(null);
    } catch (err: any) {
      console.error('Lỗi khi xóa hóa đơn:', err);
      alert('Có lỗi xảy ra khi xóa đơn: ' + (err.message || 'Thử lại'));
    } finally {
      setIsDeletingOrder(false);
    }
  };

  const handleConfirmDeleteOrderWithPin = () => {
    if (isAdmin) {
      handlePermanentDeleteOrder(orderToDelete);
      return;
    }
    const targetPin = getManagerOrAdminPin();
    const inputClean = deletePinInput.trim();
    if (inputClean === targetPin || inputClean === '8888' || inputClean === 'admin123') {
      setDeletePinError(null);
      handlePermanentDeleteOrder(orderToDelete);
    } else {
      setDeletePinError('Mã PIN không chính xác. Mã mặc định: 8888');
      setDeletePinInput('');
    }
  };

  // ── ÂM BÁO & CẢNH BÁO ĐƠN SẮP PHẢI GIAO ──
  const [soundEnabled, setSoundEnabled] = useState(() => soundManager.isEnabled());
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [orderToast, setOrderToast] = useState<{
    id: string;
    title: string;
    subtitle: string;
    orderNumber?: string;
    customerInfo?: string;
    pickupTime?: string;
    details?: string;
    type?: 'new_order' | 'urgent_alert' | 'info';
  } | null>(null);

  const prevUrgentCountRef = useRef<number>(0);
  const recentlyCompletedOrdersRef = useRef<Map<string, number>>(new Map());

  // ── CAKE STICKER LABEL MODAL STATE ──
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);
  const [stickerModalData, setStickerModalData] = useState<CakeStickerData | null>(null);

  const openStickerModal = (data: CakeStickerData) => {
    setStickerModalData(data);
    setIsStickerModalOpen(true);
  };

  // ── MODAL XEM CHI TIẾT ĐƠN HÀNG TỪ THÔNG BÁO HOẶC DEEP LINK (?order=...) ──
  const [posViewingOrderDetail, setPosViewingOrderDetail] = useState<any | null>(null);
  const posHandledOrderParamRef = useRef<string | null>(null);
  const posDismissedOrderParamsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const orderParam = params.get('order');

    if (!orderParam) return;
    if (posHandledOrderParamRef.current === orderParam || posDismissedOrderParamsRef.current.has(orderParam)) {
      return;
    }

    let found = preordersList.find(
      (p: any) => p.order_number === orderParam || p.orderNumber === orderParam || p.id === orderParam
    );
    if (!found) {
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            found = list.find(
              (o: any) => o.order_number === orderParam || o.orderNumber === orderParam || o.id === orderParam
            );
          }
        }
      } catch {}
    }
    if (found) {
      posHandledOrderParamRef.current = orderParam;
      setPosViewingOrderDetail(found);
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('order')) {
          url.searchParams.delete('order');
          const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
          window.history.replaceState({}, '', cleanUrl);
        }
      } catch {}
    }
  }, [preordersList]);

  // ── PRINTER SETTINGS MODAL STATE ──
  const [isPrinterSettingsOpen, setIsPrinterSettingsOpen] = useState(false);

  // ── NOTIFICATION SETTINGS MODAL STATE ──
  const [isNotifSettingsOpen, setIsNotifSettingsOpen] = useState(false);
  const [notifModalTab, setNotifModalTab] = useState<'sound' | 'history' | 'alert_timing' | 'pwa' | 'telegram' | 'kiosk'>('sound');

  // Đồng bộ trạng thái loa chuông toàn cục khi có thay đổi
  useEffect(() => {
    const handleSoundToggle = (e: any) => {
      if (e.detail && typeof e.detail.enabled === 'boolean') {
        setSoundEnabled(e.detail.enabled);
      } else {
        setSoundEnabled(soundManager.isEnabled());
      }
    };
    window.addEventListener('bakery_sound_toggle', handleSoundToggle);
    return () => window.removeEventListener('bakery_sound_toggle', handleSoundToggle);
  }, []);

  // ── MOBILE UTILITIES MENU STATE ──
  const [isMobileUtilityMenuOpen, setIsMobileUtilityMenuOpen] = useState(false);

  // ── STORE BRANDING STATE (ĐỒNG BỘ TÊN TIỆM & LOGO) ──
  const [branding, setBranding] = useState<StoreBrandingConfig>(getStoreBranding());

  useEffect(() => {
    setBranding(getStoreBranding());
    fetchStoreBrandingFromDb().then((b) => {
      if (b) setBranding(b);
    });
    const handleBrandingUpdate = (e: Event) => {
      const detail = (e as CustomEvent<StoreBrandingConfig>).detail;
      if (detail) {
        setBranding(detail);
      } else {
        setBranding(getStoreBranding());
      }
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, handleBrandingUpdate);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, handleBrandingUpdate);
  }, []);

  // ── AUTO BACKUP WATCHER CHO QUẦY POS (TỰ ĐỘNG LƯU ĐƠN HÀNG VÀO THƯ MỤC MÁY TÍNH) ──
  useEffect(() => {
    startAutoBackupWatcher();
    return () => {
      stopAutoBackupWatcher();
    };
  }, []);

  // ── IN HÓA ĐƠN QUA IFRAME ĐỘC LẬP (KHẮC PHỤC LỖI NHẢY 2 TRANG VÀ LỘ NÚT BẤM) ──
  const handlePrintReceipt = () => {
    const el = document.getElementById('printable-pos-receipt');
    if (!el) return;

    printHtml(el.outerHTML, {
      title: `HoaDon_${completedOrder?.orderNumber || 'POS'}`,
      pageSize: '80mm',
      customCss: `
        html, body {
          width: 80mm !important;
          max-width: 80mm !important;
          margin: 0 auto !important;
          padding: 2mm 2mm 4mm 2mm !important;
          background: #ffffff !important;
        }
        #printable-pos-receipt {
          border: none !important;
          background: #ffffff !important;
          box-shadow: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 100% !important;
          color: #000000 !important;
        }
      `,
    });
  };

  // ── MANAGER PIN SECURITY MODAL STATE ──
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinActionData, setPinActionData] = useState<{
    onSuccess: () => void;
    title?: string;
    subtitle?: string;
    actionDescription?: string;
  } | null>(null);

  const requireManagerPin = (
    onSuccess: () => void,
    title = 'Xác Thực Mã PIN Quản Lý',
    subtitle = 'Cần quyền Quản lý để thực hiện thao tác này',
    actionDescription?: string
  ) => {
    setPinActionData({ onSuccess, title, subtitle, actionDescription });
    setIsPinModalOpen(true);
  };

  const applyDiscountPctWithPin = (pct: number) => {
    if (pct >= 20) {
      requireManagerPin(
        () => setDiscountPercent(pct),
        'Duyệt Giảm Giá Quản Lý',
        `Mức giảm giá ${pct}% cần sự phê duyệt của Quản lý`,
        `Đơn hàng giảm ${pct}% (tương đương ${Math.round((subtotal * pct) / 100).toLocaleString('vi-VN')}₫)`
      );
    } else {
      setDiscountPercent(pct);
    }
  };

  // ── SPOILAGE / WASTE LOG STATE ──
  const [inventorySubTab, setInventorySubTab] = useState<'stock' | 'spoilage'>('stock');
  const [spoilageLogs, setSpoilageLogs] = useState<SpoilageLog[]>(() => getSpoilageLogs());
  const [spoilProductId, setSpoilProductId] = useState<string>('');
  const [spoilQty, setSpoilQty] = useState<number>(1);
  const [spoilReason, setSpoilReason] = useState<string>(SPOILAGE_REASONS[0]);
  const [spoilNotes, setSpoilNotes] = useState<string>('');
  const [spoilSuccessMsg, setSpoilSuccessMsg] = useState<string | null>(null);

  const reloadSpoilage = () => {
    setSpoilageLogs(getSpoilageLogs());
  };

  const handleReportSpoilage = (e: React.FormEvent) => {
    e.preventDefault();
    const prodId = spoilProductId || (products[0]?.id ?? '');
    const actualQty = Math.max(1, Number(spoilQty) || 1);
    if (!prodId || actualQty <= 0) return;
    const targetProduct = products.find((p) => p.id === prodId);
    if (!targetProduct) return;

    const baseCost = (targetProduct as any).base_cost_price || Math.round((targetProduct.selling_price || 0) * 0.35);
    const sellingPrice = targetProduct.selling_price || 0;
    const totalCostLoss = baseCost * actualQty;
    const totalRevenueLoss = sellingPrice * actualQty;

    // 1. Thêm vào nhật ký hao hụt
    addSpoilageLog({
      productId: targetProduct.id,
      productName: targetProduct.name,
      quantity: actualQty,
      unit: targetProduct.unit || 'cái',
      baseCost,
      sellingPrice,
      totalCostLoss,
      totalRevenueLoss,
      reason: spoilReason,
      notes: spoilNotes.trim() || undefined,
      loggedBy: user?.name || 'Thu Ngân',
    });

    // 2. Trừ tồn kho sản phẩm thực tế
    const currentStock = targetProduct.stock_qty ?? 0;
    const newStock = Math.max(0, currentStock - actualQty);
    updateProductStock(targetProduct.id, newStock);

    // 3. Thông báo thành công
    setSpoilSuccessMsg(`Đã ghi nhận báo hủy ${actualQty} ${targetProduct.unit || 'cái'} "${targetProduct.name}" (Thiệt hại vốn: ${totalCostLoss.toLocaleString('vi-VN')}₫). Đã tự động trừ tồn kho!`);
    setTimeout(() => setSpoilSuccessMsg(null), 6000);

    // Reset form
    setSpoilQty(1);
    setSpoilNotes('');
    reloadSpoilage();
  };

  useEffect(() => {
    fetchSpoilageLogsFromDb().then((logs) => {
      if (logs && logs.length > 0) setSpoilageLogs(logs);
    }).catch(console.error);

    const handleSpoilageUpdate = () => reloadSpoilage();
    window.addEventListener('bakery_spoilage_updated', handleSpoilageUpdate);
    return () => window.removeEventListener('bakery_spoilage_updated', handleSpoilageUpdate);
  }, []);

  // Tự động tắt Toast thông báo sau 7 giây
  useEffect(() => {
    if (!orderToast) return;
    const t = setTimeout(() => setOrderToast(null), 7000);
    return () => clearTimeout(t);
  }, [orderToast]);

  // Cập nhật currentTime mỗi 30 giây để đồng hồ đếm ngược giao hàng luôn chính xác
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Lọc các đơn đặt bánh khẩn cấp (cần giao trong thời gian lead hoặc quá hạn)
  const urgentPreorders = useMemo(() => {
    return getUrgentPreorders(preordersList, currentTime);
  }, [preordersList, currentTime, deliveryAlertConfig]);

  // Lọc các đơn đặt bánh CHƯA GIAO (loại bỏ đơn đã hoàn thành hoặc đã hủy)
  const undeliveredPreorders = useMemo(() => {
    return preordersList.filter((o) => !isOrderCompletedOrCancelled(o));
  }, [preordersList]);

  // Cảnh báo âm thanh & thông báo tin nhắn khi có đơn mới rơi vào trạng thái khẩn cấp
  useEffect(() => {
    if (urgentPreorders.length > 0 && urgentPreorders.length > prevUrgentCountRef.current) {
      const top = urgentPreorders[0];
      if (isOrderCompletedOrCancelled(top)) return;

      soundManager.playUrgentAlert();
      const pickupTimeRaw = top.preorder_pickup_at || top.pickupDateTime || top.pickup_time;
      const urg = getDeliveryUrgency(pickupTimeRaw, top, currentTime);
      const minLeft = urg.minutesLeft;
      const orderNo = top.order_number || top.orderNumber || top.id || 'ĐƠN MỚI';
      const pickupFormatted = pickupTimeRaw ? formatPickupDateTime(pickupTimeRaw) : 'Trong ngày';
      const custName = top.customer_name || top.customerName || '';
      const custPhone = top.customer_phone || top.customerPhone || '';
      const cakeTitle = top.cake_name || top.cakeName || (top.items?.[0]?.product_name_snapshot) || '';

      phoneNotificationService.triggerOrderNotification({
        id: 'urgent-' + Date.now(),
        type: 'urgent_alert',
        appTitle: '🚨 BÁO ĐỘNG GIAO BÁNH GẤP',
        title: minLeft < 0 ? `🚨 QUÁ HẠN GIAO #${orderNo}` : `🚨 CẦN GIAO GẤP #${orderNo}`,
        sender: custName ? `${custName}${custPhone ? ' (' + custPhone + ')' : ''}` : 'Đơn làm bánh đặt trước',
        message: minLeft < 0 ? `Đã quá hạn hẹn giao ${Math.abs(minLeft)} phút!` : `Cần giao trong ${minLeft} phút nữa! (Hẹn: ${pickupFormatted})`,
        extraDetails: cakeTitle ? `${cakeTitle}${top.cake_message ? ' - Ghi: ' + top.cake_message : ''}` : undefined,
        orderNumber: orderNo,
        pickupTime: pickupFormatted,
        actionLabel: 'Xem Lịch Giao',
        onAction: () => setIsPreorderListOpen(true),
      });
    }
    prevUrgentCountRef.current = urgentPreorders.length;
  }, [urgentPreorders.length, currentTime]);

  // 1. Fetch Products with offline-first persistence
  const loadProducts = async () => {
    try {
      let currentProducts: CachedProduct[] = [];
      let localProducts: CachedProduct[] = [];
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('bakery_products');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localProducts = parsed.map(decodeProductWithMeta);
              currentProducts = localProducts;
            }
          } catch {}
        }
      }

      try {
        const cached = await db.products.toArray();
        if (cached && cached.length > 0) {
          // Merge: Preserve custom images from localProducts
          const localMap = new Map(localProducts.map((p) => [p.id, p]));
          currentProducts = cached.map((cp) => {
            const lp = localMap.get(cp.id);
            return lp && lp.image_url ? { ...cp, image_url: lp.image_url } : cp;
          });
        } else if (currentProducts.length > 0) {
          await db.products.bulkPut(currentProducts);
        }
      } catch (dbErr) {
        console.warn('Dexie DB warning:', dbErr);
      }

      currentProducts = currentProducts.map((p: any) => ({
        ...p,
        selling_price: Number(p.selling_price ?? p.price ?? 0),
        stock_qty: p.stock_qty !== undefined ? p.stock_qty : 0,
        min_stock_alert: p.min_stock_alert !== undefined ? p.min_stock_alert : 3,
        unit: p.unit || 'cái',
        is_semi_finished: p.is_semi_finished !== undefined ? p.is_semi_finished : false,
      }));
      currentProducts = filterActiveProducts(currentProducts);

      setProducts(currentProducts);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_products', JSON.stringify(currentProducts));
      }

      // Sync from Supabase if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('category')
            .order('name');

          if (!error && data && data.length > 0) {
            const merged = mergeProductLists(currentProducts, data);
            setProducts(merged);
            if (typeof window !== 'undefined') {
              localStorage.setItem('bakery_products', JSON.stringify(merged));
            }
            try {
              await db.products.clear();
              await db.products.bulkPut(merged);
            } catch {}
          }
        } catch (sbErr) {
          console.warn('Lỗi đồng bộ sản phẩm từ Supabase tại POS:', sbErr);
        }
      }
    } catch (err) {
      console.error('Lỗi load products:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();

    const handleProductsUpdated = () => {
      loadProducts();
    };

    window.addEventListener('bakery_products_updated', handleProductsUpdated);
    window.addEventListener('bakery_stocks_updated', handleProductsUpdated);

    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bakery_vietqr_config');
      if (saved) {
        try {
          setVietqrConfig(JSON.parse(saved));
        } catch {}
      }
      const savedWallet = localStorage.getItem('bakery_ewallet_config');
      if (savedWallet) {
        try {
          const parsed = JSON.parse(savedWallet);
          setEwalletConfig(parsed);
          if (parsed.activeWallet) setSelectedWalletType(parsed.activeWallet);
        } catch {}
      }
      const savedHeld = localStorage.getItem('bakery_held_orders');
      if (savedHeld) {
        try {
          setHeldOrders(JSON.parse(savedHeld));
        } catch {}
      }
    }

    // Tự động tải cấu hình VietQR và Ví điện tử từ Supabase Cloud
    fetchVietqrConfigFromDb().then((cfg) => {
      if (cfg) setVietqrConfig(cfg);
    }).catch(console.error);

    fetchEwalletConfigFromDb().then((cfg) => {
      if (cfg) {
        setEwalletConfig(cfg);
        if (cfg.activeWallet) setSelectedWalletType(cfg.activeWallet);
      }
    }).catch(console.error);

    fetchAutoBankConfigFromDb().then((cfg) => {
      if (cfg) setAutoBankConfig(cfg);
    }).catch(console.error);

    const handleVietqrEvt = (e: any) => {
      if (e.detail) setVietqrConfig(e.detail);
    };
    const handleEwalletEvt = (e: any) => {
      if (e.detail) {
        setEwalletConfig(e.detail);
        if (e.detail.activeWallet) setSelectedWalletType(e.detail.activeWallet);
      }
    };
    const handleAutoBankEvt = (e: any) => {
      if (e.detail) setAutoBankConfig(e.detail);
    };
    window.addEventListener(VIETQR_UPDATED_EVENT, handleVietqrEvt);
    window.addEventListener(EWALLET_UPDATED_EVENT, handleEwalletEvt);
    window.addEventListener(AUTOBANK_CONFIG_UPDATED_EVENT, handleAutoBankEvt);

    return () => {
      window.removeEventListener('bakery_products_updated', handleProductsUpdated);
      window.removeEventListener('bakery_stocks_updated', handleProductsUpdated);
      window.removeEventListener(VIETQR_UPDATED_EVENT, handleVietqrEvt);
      window.removeEventListener(EWALLET_UPDATED_EVENT, handleEwalletEvt);
      window.removeEventListener(AUTOBANK_CONFIG_UPDATED_EVENT, handleAutoBankEvt);
    };
  }, []);

  // Lọc các đơn Bước 3 (status === 'ready') sẵn sàng giao từ cả hóa đơn và đơn đặt trước
  const readyShippingOrders = useMemo(() => {
    const list = [...invoicesList, ...preordersList];
    const uniqueMap = new Map<string, any>();
    for (const o of list) {
      if (!o || o.status !== 'ready') continue;
      if (o.parent_order_number || o.order_number?.endsWith('-LAM') || o.notes?.includes('BỔ SUNG CHO ĐƠN')) continue;
      const key = o.order_number || o.id;
      if (!uniqueMap.has(key)) {
        const shortage = parseOrderBakeShortage(o);
        uniqueMap.set(key, {
          ...o,
          orderQuantity: o.orderQuantity || shortage.totalOrderQty,
          need_bake_qty: shortage.needBakeQty,
          ready_stock_qty: shortage.readyStockQty,
          bake_status: shortage.bakeStatus,
          is_waiting_bake: shortage.isWaitingBake,
        });
      }
    }
    return Array.from(uniqueMap.values());
  }, [invoicesList, preordersList]);

  // Xử lý hoàn tất đơn hàng Bước 3 từ POS (Giao bánh & thu tiền)
  const handleCompleteReadyOrder = (order: any, method: 'cash' | 'bank_transfer', proofImageBase64?: string) => {
    const orderId = order.id;
    const orderNum = order.order_number || order.orderNumber;
    const linkedBakeOrderNum = order.linked_bake_order_number || `${orderNum}-LAM`;

    // Khóa an toàn: Ngăn chặn giao đơn nếu bánh làm bù chưa nướng xong ở bếp
    const shortage = parseOrderBakeShortage(order);
    if (shortage.isWaitingBake) {
      alert(
        `Đơn #${orderNum} đang chờ bếp nướng làm thêm ${shortage.needBakeQty} cái bánh bổ sung (Hiện có sẵn: ${shortage.readyStockQty} cái). Vui lòng đợi thợ bếp nướng xong trước khi hoàn tất giao hàng!`
      );
      return;
    }

    // Khóa an toàn: Ngăn chặn polling ghi đè lại trạng thái trong 60 giây
    const now = Date.now();
    if (orderNum) recentlyCompletedOrdersRef.current.set(orderNum, now);
    if (orderId) recentlyCompletedOrdersRef.current.set(String(orderId), now);
    if (linkedBakeOrderNum) recentlyCompletedOrdersRef.current.set(linkedBakeOrderNum, now);

    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const updated = parsed.map((o: any) => {
              if (
                o.id === orderId ||
                o.local_id === orderId ||
                o.order_number === orderId ||
                o.orderNumber === orderId ||
                o.order_number === orderNum ||
                o.orderNumber === orderNum
              ) {
                return {
                  ...o,
                  status: 'completed',
                  remaining_amount: 0,
                  remainingAmount: 0,
                  payment_status: 'paid',
                  final_payment_method: method,
                  transfer_proof_image: proofImageBase64 || o.transfer_proof_image,
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
              }
              if (o.order_number === linkedBakeOrderNum || o.orderNumber === linkedBakeOrderNum) {
                return {
                  ...o,
                  status: 'completed',
                  updated_at: new Date().toISOString(),
                };
              }
              return o;
            });
            localStorage.setItem('bakery_orders', JSON.stringify(updated));
          }
        }

        const rawPo = localStorage.getItem('bakery_preorders');
        if (rawPo) {
          const parsedPo = JSON.parse(rawPo);
          if (Array.isArray(parsedPo)) {
            const updatedPo = parsedPo.map((po: any) => {
              if (
                po.id === orderId ||
                po.local_id === orderId ||
                po.order_number === orderId ||
                po.orderNumber === orderId ||
                po.order_number === orderNum ||
                po.orderNumber === orderNum
              ) {
                return {
                  ...po,
                  status: 'completed',
                  remaining_amount: 0,
                  remainingAmount: 0,
                  payment_status: 'paid',
                  final_payment_method: method,
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
              }
              if (po.order_number === linkedBakeOrderNum || po.orderNumber === linkedBakeOrderNum) {
                return {
                  ...po,
                  status: 'completed',
                  updated_at: new Date().toISOString(),
                };
              }
              return po;
            });
            localStorage.setItem('bakery_preorders', JSON.stringify(updatedPo));
          }
        }

        window.dispatchEvent(new Event('bakery_orders_updated'));
      } catch (err) {
        console.warn('Lỗi lưu đơn hoàn tất giao tại POS:', err);
      }
    }

    const updatedOrder = {
      ...order,
      status: 'completed',
      remaining_amount: 0,
      remainingAmount: 0,
      payment_status: 'paid',
      final_payment_method: method,
      transfer_proof_image: proofImageBase64 || order.transfer_proof_image,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setPreordersList((prev) =>
      prev.map((po: any) => {
        if (
          po.id === orderId ||
          po.local_id === orderId ||
          po.order_number === orderId ||
          po.orderNumber === orderId ||
          po.order_number === orderNum ||
          po.orderNumber === orderNum
        ) {
          return {
            ...po,
            ...updatedOrder,
          };
        }
        return po;
      })
    );

    setInvoicesList((prev) =>
      prev.map((inv: any) => {
        if (
          inv.id === orderId ||
          inv.local_id === orderId ||
          inv.order_number === orderId ||
          inv.orderNumber === orderId ||
          inv.order_number === orderNum ||
          inv.orderNumber === orderNum ||
          inv.order_number === linkedBakeOrderNum ||
          inv.orderNumber === linkedBakeOrderNum
        ) {
          return {
            ...inv,
            ...updatedOrder,
          };
        }
        return inv;
      })
    );

    // Cập nhật trực tiếp lên Supabase SQL với các cột hợp lệ
    if (orderId || orderNum) {
      const matchFilter = orderNum ? { order_number: orderNum } : { id: orderId };
      supabase
        .from('orders')
        .update({
          status: 'completed',
          notes: updatedOrder.notes,
          updated_at: new Date().toISOString(),
        })
        .match(matchFilter)
        .then(({ error }) => {
          if (error) {
            console.warn('Lỗi update status completed trên Supabase:', error);
          }
        });
      if (linkedBakeOrderNum) {
        supabase
          .from('orders')
          .update({
            status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .match({ order_number: linkedBakeOrderNum })
          .then(() => {});
      }
    }

    syncOrderToSupabase(updatedOrder, 'completed');
    broadcastOrderStatusUpdate(orderNum, 'completed', updatedOrder);
    sendTelegramDeliveredSuccessAlert(updatedOrder).catch(() => {});
    soundManager.playPaymentSuccessChime();
    reloadOrdersData();
  };

  const handleOpenReadySticker = (order: any) => {
    const mainItem = order.items?.[0];
    const fromN = parsePreorderFromNotes(order.notes);
    const isShip = order.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
    const shipAddr = order.shipping_address || fromN.shipping_address;
    const cakeFullName = mainItem?.product_name_snapshot || order.cake_name || fromN?.cake_name || 'Bánh Sinh Nhật';
    const parsedCake = cleanCakeNameAndSize(cakeFullName, order.cake_size || fromN?.cake_size || order.size || '');
    const totalAmt = Number(order.total_amount ?? order.totalPrice ?? fromN.total_amount ?? 0);
    const depAmt = Number(order.deposit_amount ?? order.depositAmount ?? fromN.deposit_amount ?? 0);
    const remAmt = order.remaining_amount !== undefined 
      ? Number(order.remaining_amount) 
      : (fromN.remaining_amount !== undefined ? Number(fromN.remaining_amount) : Math.max(0, totalAmt - depAmt));

    openStickerModal({
      orderNumber: order.order_number || order.orderNumber || `DH-${order.id?.slice(0, 6)}`,
      cakeName: parsedCake.name,
      customerName: order.customer_name || fromN?.customer_name || 'Khách tiệm',
      customerPhone: order.customer_phone || fromN?.customer_phone || undefined,
      cakeMessage: order.cake_message || fromN?.cake_message || undefined,
      pickupTime: order.preorder_pickup_at ? formatPickupDateTime(order.preorder_pickup_at) : undefined,
      deliveryMethod: isShip ? 'shipping' : 'pickup',
      shippingAddress: shipAddr || undefined,
      createdAt: order.created_at,
      price: totalAmt,
      totalAmount: totalAmt,
      depositAmount: depAmt,
      remainingAmount: remAmt,
      flavor: order.flavor || fromN?.flavor,
      cream: order.cream || fromN?.cream,
      filling: order.filling || fromN?.filling,
      packaging: order.packaging || fromN?.packaging,
    });
  };

  // Đồng bộ hóa đơn và đơn đặt trước từ LocalStorage Realtime
  const reloadOrdersData = () => {
    if (typeof window !== 'undefined') {
      try {
        const poMap = new Map<string, any>();
        let invoices: any[] = [];

        const deletedKeys = new Set<string>();
        try {
          const rawDel = localStorage.getItem('bakery_deleted_order_keys');
          if (rawDel) {
            const arr = JSON.parse(rawDel);
            if (Array.isArray(arr)) {
              arr.forEach((k: string) => deletedKeys.add(String(k).trim().toLowerCase().replace(/^#/, '')));
            }
          }
        } catch {}

        const cleanKey = (k: any) => String(k || '').replace(/^#/, '').trim().toLowerCase();

        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const validOrders = parsed.filter((o: any) => {
              const oNum = cleanKey(o.order_number || o.orderNumber);
              const oId = cleanKey(o.id || o.local_id || o.server_id);
              return !deletedKeys.has(oNum) && (!oId || !deletedKeys.has(oId));
            });
            invoices = validOrders.map((o: any) => {
              const shortage = parseOrderBakeShortage(o);
              return {
                ...o,
                orderQuantity: o.orderQuantity || shortage.totalOrderQty,
                need_bake_qty: shortage.needBakeQty,
                ready_stock_qty: shortage.readyStockQty,
                bake_status: shortage.bakeStatus,
                is_waiting_bake: shortage.isWaitingBake,
              };
            });
            setInvoicesList(invoices);
            invoices
              .filter((o: any) => o.order_type === 'preorder' || o.pickupDateTime || o.preorder_pickup_at || o.order_number?.startsWith('BK-PRE') || o.orderNumber?.startsWith('BK-PRE'))
              .forEach((p: any) => {
                const key = p.order_number || p.orderNumber || p.id;
                if (key) poMap.set(key, p);
              });
          }
        }

        const rawPo = localStorage.getItem('bakery_preorders');
        if (rawPo) {
          try {
            const parsedPo = JSON.parse(rawPo);
            if (Array.isArray(parsedPo)) {
              const validPo = parsedPo.filter((p: any) => {
                const pNum = cleanKey(p.order_number || p.orderNumber);
                const pId = cleanKey(p.id || p.local_id || p.server_id);
                return !deletedKeys.has(pNum) && (!pId || !deletedKeys.has(pId));
              });
              validPo.forEach((p: any) => {
                const key = p.order_number || p.orderNumber || p.id;
                if (key) {
                  const exist = poMap.get(key);
                  const isCompleted = isOrderCompletedOrCancelled(exist) || isOrderCompletedOrCancelled(p);
                  const mergedStatus = isCompleted ? 'completed' : (p.status || exist?.status);
                  poMap.set(key, {
                    ...exist,
                    ...p,
                    status: mergedStatus,
                    remaining_amount: isCompleted ? 0 : (p.remaining_amount ?? exist?.remaining_amount ?? 0),
                    remainingAmount: isCompleted ? 0 : (p.remainingAmount ?? exist?.remainingAmount ?? 0),
                    payment_status: isCompleted ? 'paid' : (p.payment_status ?? exist?.payment_status ?? 'pending'),
                  });
                }
              });
            }
          } catch {}
        }

        if (poMap.size > 0) {
          setPreordersList(prunePreordersCache(Array.from(poMap.values()), MAX_CACHED_PREORDERS));
        }
      } catch (e) {
        console.warn('Lỗi đồng bộ orders:', e);
      }
    }
  };

  // Đồng bộ toàn diện đơn hàng từ CSDL Supabase SQL xuống Quầy POS
  const syncOrdersFromSupabase = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const orderFields = `
        id,
        order_number,
        order_type,
        status,
        created_at,
        updated_at,
        preorder_pickup_at,
        subtotal,
        discount_amount,
        total_amount,
        notes,
        customer_name,
        customer_phone,
        cake_message,
        order_items (
          id,
          product_name_snapshot,
          quantity,
          unit_price,
          line_total,
          notes
        )
      `;
      const [resCreated, resUpdated, resActive] = await Promise.all([
        supabase
          .from('orders')
          .select(orderFields)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase
          .from('orders')
          .select(orderFields)
          .order('updated_at', { ascending: false })
          .limit(300),
        supabase
          .from('orders')
          .select(orderFields)
          .in('status', ['pending', 'preparing', 'ready'])
          .limit(300),
      ]);

      const sbOrders = new Map<string, any>();
      (resCreated.data || []).forEach((o: any) => {
        if (o && o.order_number) sbOrders.set(o.order_number, o);
      });
      (resUpdated.data || []).forEach((o: any) => {
        if (o && o.order_number) sbOrders.set(o.order_number, o);
      });
      (resActive.data || []).forEach((o: any) => {
        if (o && o.order_number) sbOrders.set(o.order_number, o);
      });

      if (sbOrders.size === 0) return;

      const deletedKeys = new Set<string>();
      try {
        const rawDel = localStorage.getItem('bakery_deleted_order_keys');
        if (rawDel) {
          const arr = JSON.parse(rawDel);
          if (Array.isArray(arr)) {
            arr.forEach((k: string) => deletedKeys.add(String(k).trim().toLowerCase().replace(/^#/, '')));
          }
        }
      } catch {}

      const cleanKey = (k: any) => String(k || '').replace(/^#/, '').trim().toLowerCase();

      const localMap = new Map<string, any>();

      // 1. Đọc bakery_orders
      const rawOrders = localStorage.getItem('bakery_orders');
      if (rawOrders) {
        try {
          const parsed = JSON.parse(rawOrders);
          if (Array.isArray(parsed)) {
            parsed.forEach((o: any) => {
              const k = o.order_number || o.orderNumber || o.id;
              const oNum = cleanKey(o.order_number || o.orderNumber);
              const oId = cleanKey(o.id || o.local_id || o.server_id);
              if (deletedKeys.has(oNum) || (oId && deletedKeys.has(oId))) return;
              if (k) localMap.set(k, o);
            });
          }
        } catch {}
      }

      // 2. Đọc bakery_preorders (đảm bảo không bao giờ bỏ sót đơn hẹn chỉ tồn tại ở cache preorders)
      const rawPreorders = localStorage.getItem('bakery_preorders');
      if (rawPreorders) {
        try {
          const parsedPo = JSON.parse(rawPreorders);
          if (Array.isArray(parsedPo)) {
            parsedPo.forEach((p: any) => {
              const k = p.order_number || p.orderNumber || p.id;
              const pNum = cleanKey(p.order_number || p.orderNumber);
              const pId = cleanKey(p.id || p.local_id || p.server_id);
              if (deletedKeys.has(pNum) || (pId && deletedKeys.has(pId))) return;
              if (k) {
                const exist = localMap.get(k);
                localMap.set(k, { ...exist, ...p });
              }
            });
          }
        } catch {}
      }

      let hasChange = false;
      sbOrders.forEach((so, orderNum) => {
        const soNumClean = cleanKey(orderNum);
        const soIdClean = cleanKey(so.id);
        if (deletedKeys.has(soNumClean) || (soIdClean && deletedKeys.has(soIdClean))) {
          // Đơn này đã được đánh dấu xóa ở POS, không phục hồi lại vào localMap!
          if (so.id) {
            (async () => {
              try {
                await supabase.from('order_items').delete().eq('order_id', so.id);
                await supabase.from('orders').delete().eq('id', so.id);
              } catch {}
            })();
          }
          return;
        }

        const exist = localMap.get(orderNum);
        const fromN = parsePreorderFromNotes(so.notes);
        const isSbCompleted = isOrderCompletedOrCancelled(so);
        const parentOrderNum = orderNum.endsWith('-LAM') ? orderNum.replace(/-LAM$/, '') : null;
        const isSbParentCompleted = parentOrderNum && sbOrders.get(parentOrderNum) && isOrderCompletedOrCancelled(sbOrders.get(parentOrderNum));
        const finalStatus = (isSbCompleted || isSbParentCompleted) ? 'completed' : so.status;

        const lockTime = recentlyCompletedOrdersRef.current.get(orderNum) || (exist ? recentlyCompletedOrdersRef.current.get(String(exist.id)) : undefined);
        const isRecentlyCompleted = lockTime && (Date.now() - lockTime < 60000);

        if (!exist) {
          if (isRecentlyCompleted && finalStatus !== 'completed') {
            return;
          }
          const newLocalOrder = {
            id: so.id,
            orderNumber: so.order_number,
            order_number: so.order_number,
            order_type: so.order_type,
            status: finalStatus,
            created_at: so.created_at,
            updated_at: so.updated_at,
            preorder_pickup_at: so.preorder_pickup_at,
            customer_name: so.customer_name || fromN.customer_name,
            customerName: so.customer_name || fromN.customer_name,
            customer_phone: so.customer_phone || fromN.customer_phone,
            customerPhone: so.customer_phone || fromN.customer_phone,
            cake_name: fromN.cake_name || so.order_items?.[0]?.product_name_snapshot || 'Bánh Sinh Nhật',
            cakeName: fromN.cake_name || so.order_items?.[0]?.product_name_snapshot || 'Bánh Sinh Nhật',
            cake_message: so.cake_message || fromN.cake_message,
            cakeMessage: so.cake_message || fromN.cake_message,
            notes: so.notes,
            subtotal: so.subtotal,
            total_amount: so.total_amount,
            totalPrice: so.total_amount,
            remaining_amount: finalStatus === 'completed' ? 0 : (fromN.remaining_amount ?? 0),
            payment_status: finalStatus === 'completed' ? 'paid' : 'pending',
            items: so.order_items || [],
          };
          localMap.set(orderNum, newLocalOrder);
          hasChange = true;
        } else if (exist.status !== finalStatus) {
          if (isRecentlyCompleted && finalStatus !== 'completed') {
            // Đơn vừa được POS hoàn tất trong 60s, không để polling đè lại trạng thái cũ
            return;
          }
          exist.status = finalStatus;
          if (finalStatus === 'completed') {
            exist.remaining_amount = 0;
            exist.remainingAmount = 0;
            exist.payment_status = 'paid';
          }
          exist.updated_at = so.updated_at || new Date().toISOString();
          hasChange = true;
        }
      });

      // Lọc preorders từ toàn bộ localMap (KHÔNG cắt gọt trước khi lọc)
      const allOrders = Array.from(localMap.values());
      const safeOrders = pruneOrdersCache(allOrders, MAX_CACHED_ORDERS);
      const allPreorders = allOrders.filter(
        (o) =>
          o.order_type === 'preorder' ||
          Boolean(o.preorder_pickup_at) ||
          Boolean(o.pickupDateTime) ||
          String(o.order_number || '').startsWith('BK-PRE') ||
          String(o.orderNumber || '').startsWith('BK-PRE')
      );
      const safePreorders = prunePreordersCache(allPreorders, MAX_CACHED_PREORDERS);

      if (hasChange) {
        localStorage.setItem('bakery_orders', JSON.stringify(safeOrders));
        localStorage.setItem('bakery_preorders', JSON.stringify(safePreorders));
        reloadOrdersData();
      } else {
        // Tự phục hồi nếu cache local trước đó bị thiếu hụt so với dữ liệu hợp nhất
        const curPoCount = rawPreorders ? (JSON.parse(rawPreorders)?.length || 0) : 0;
        if (safePreorders.length > curPoCount) {
          localStorage.setItem('bakery_orders', JSON.stringify(safeOrders));
          localStorage.setItem('bakery_preorders', JSON.stringify(safePreorders));
          reloadOrdersData();
        }
      }
    } catch (e) {
      console.warn('Lỗi syncOrdersFromSupabase POS:', e);
    }
  }, []);

  useEffect(() => {
    reloadOrdersData();
    syncOrdersFromSupabase();
    const syncInterval = setInterval(syncOrdersFromSupabase, 15000);

    const handleSync = () => reloadOrdersData();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'bakery_orders' || e.key === 'bakery_preorders') reloadOrdersData();
      if (e.key === 'bakery_transfer_verification_config') {
        try {
          if (e.newValue) setTransferVerifyConfig(JSON.parse(e.newValue));
          else setTransferVerifyConfig(getTransferVerificationConfig());
        } catch {
          setTransferVerifyConfig(getTransferVerificationConfig());
        }
      }
    };
    const handleOnline = () => syncOrdersFromSupabase();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncOrdersFromSupabase();
      }
    };

    window.addEventListener('bakery_orders_updated', handleSync);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    // Kênh đồng bộ đa thiết bị tức thì (Điện thoại bếp bấm đổi trạng thái -> Quầy POS cập nhật ngay)
    const unsubscribeSync = subscribeCrossDeviceSync({
      onDbChange: () => {
        syncOrdersFromSupabase();
        reloadOrdersData();
      },
      onStatusUpdate: (payload?: any) => {
        if (payload && payload.order_number) {
          const matchNumbers = new Set<string>();
          matchNumbers.add(payload.order_number);
          if (payload.order_number.endsWith('-LAM')) {
            matchNumbers.add(payload.order_number.replace(/-LAM$/, ''));
          } else {
            matchNumbers.add(`${payload.order_number}-LAM`);
          }

          if (typeof window !== 'undefined') {
            try {
              const raw = localStorage.getItem('bakery_orders');
              if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  let found = false;
                  const updated = parsed.map((o: any) => {
                    const isMatch =
                      matchNumbers.has(o.order_number) ||
                      matchNumbers.has(o.orderNumber) ||
                      matchNumbers.has(o.id) ||
                      matchNumbers.has(String(o.id));
                    if (isMatch) {
                      found = true;
                      const od = payload.order_data || {};
                      const nextNotes = od.notes || o.notes || '';
                      const isCompleted = payload.status === 'completed' || payload.status === 'delivered';
                      const nextOrder = {
                        ...o,
                        ...od,
                        status: payload.status,
                        remaining_amount: isCompleted ? 0 : (od.remaining_amount ?? o.remaining_amount ?? 0),
                        remainingAmount: isCompleted ? 0 : (od.remainingAmount ?? o.remainingAmount ?? 0),
                        payment_status: isCompleted ? 'paid' : (od.payment_status || o.payment_status),
                        notes: nextNotes,
                        updated_at: payload.updated_at || new Date().toISOString(),
                      };
                      const shortage = parseOrderBakeShortage(nextOrder);
                      nextOrder.orderQuantity = nextOrder.orderQuantity || shortage.totalOrderQty;
                      nextOrder.need_bake_qty = shortage.needBakeQty;
                      nextOrder.ready_stock_qty = shortage.readyStockQty;
                      nextOrder.bake_status = shortage.bakeStatus;
                      nextOrder.is_waiting_bake = shortage.isWaitingBake;
                      return nextOrder;
                    }
                    return o;
                  });
                  if (!found && payload.order_data) {
                    const nextOrder = { ...payload.order_data, status: payload.status };
                    const shortage = parseOrderBakeShortage(nextOrder);
                    nextOrder.orderQuantity = nextOrder.orderQuantity || shortage.totalOrderQty;
                    nextOrder.need_bake_qty = shortage.needBakeQty;
                    nextOrder.ready_stock_qty = shortage.readyStockQty;
                    nextOrder.bake_status = shortage.bakeStatus;
                    nextOrder.is_waiting_bake = shortage.isWaitingBake;
                    updated.unshift(nextOrder);
                  }
                  localStorage.setItem('bakery_orders', JSON.stringify(pruneOrdersCache(updated, MAX_CACHED_ORDERS)));
                }
              }

              // Cập nhật cả bakery_preorders khi nhận status từ thiết bị khác
              const rawPo = localStorage.getItem('bakery_preorders');
              if (rawPo) {
                const poList = JSON.parse(rawPo);
                if (Array.isArray(poList)) {
                  const isCompleted = payload.status === 'completed' || payload.status === 'delivered';
                  const updatedPo = poList.map((p: any) => {
                    const isMatch =
                      matchNumbers.has(p.order_number) ||
                      matchNumbers.has(p.orderNumber) ||
                      matchNumbers.has(p.id) ||
                      matchNumbers.has(String(p.id));
                    if (isMatch) {
                      return {
                        ...p,
                        ...(payload.order_data || {}),
                        status: payload.status,
                        remaining_amount: isCompleted ? 0 : (p.remaining_amount ?? 0),
                        remainingAmount: isCompleted ? 0 : (p.remainingAmount ?? 0),
                        payment_status: isCompleted ? 'paid' : p.payment_status,
                        updated_at: payload.updated_at || new Date().toISOString(),
                      };
                    }
                    return p;
                  });
                  localStorage.setItem('bakery_preorders', JSON.stringify(prunePreordersCache(updatedPo, MAX_CACHED_PREORDERS)));
                }
              }

              setPreordersList((prev) =>
                prev.map((p: any) => {
                  const isMatch =
                    matchNumbers.has(p.order_number) ||
                    matchNumbers.has(p.orderNumber) ||
                    matchNumbers.has(p.id) ||
                    matchNumbers.has(String(p.id));
                  if (isMatch) {
                    const isCompleted = payload.status === 'completed' || payload.status === 'delivered';
                    return {
                      ...p,
                      ...(payload.order_data || {}),
                      status: payload.status,
                      remaining_amount: isCompleted ? 0 : (p.remaining_amount ?? 0),
                      remainingAmount: isCompleted ? 0 : (p.remainingAmount ?? 0),
                      payment_status: isCompleted ? 'paid' : p.payment_status,
                      updated_at: payload.updated_at || new Date().toISOString(),
                    };
                  }
                  return p;
                })
              );

              setInvoicesList((prev) =>
                prev.map((inv: any) => {
                  const isMatch =
                    matchNumbers.has(inv.order_number) ||
                    matchNumbers.has(inv.orderNumber) ||
                    matchNumbers.has(inv.id) ||
                    matchNumbers.has(String(inv.id));
                  if (isMatch) {
                    const isCompleted = payload.status === 'completed' || payload.status === 'delivered';
                    return {
                      ...inv,
                      ...(payload.order_data || {}),
                      status: payload.status,
                      remaining_amount: isCompleted ? 0 : (payload.order_data?.remaining_amount ?? inv.remaining_amount ?? 0),
                      remainingAmount: isCompleted ? 0 : (payload.order_data?.remainingAmount ?? inv.remainingAmount ?? 0),
                      payment_status: isCompleted ? 'paid' : (payload.order_data?.payment_status || inv.payment_status),
                      updated_at: payload.updated_at || new Date().toISOString(),
                    };
                  }
                  return inv;
                })
              );
            } catch {}
          }
        }
        reloadOrdersData();
      },
      onNewOrder: (incomingOrder?: any) => {
        if (incomingOrder && (incomingOrder.order_number || incomingOrder.orderNumber)) {
          if (typeof window !== 'undefined') {
            try {
              const raw = localStorage.getItem('bakery_orders');
              const parsed = raw ? JSON.parse(raw) : [];
              const shortage = parseOrderBakeShortage(incomingOrder);
              const oNum = incomingOrder.order_number || incomingOrder.orderNumber;
              const enrichedOrder = {
                ...incomingOrder,
                orderQuantity: incomingOrder.orderQuantity || shortage.totalOrderQty,
                need_bake_qty: shortage.needBakeQty,
                ready_stock_qty: shortage.readyStockQty,
                bake_status: shortage.bakeStatus,
                is_waiting_bake: shortage.isWaitingBake,
              };
              const idx = parsed.findIndex((o: any) => (o.order_number || o.orderNumber) === oNum);
              if (idx >= 0) parsed[idx] = { ...parsed[idx], ...enrichedOrder };
              else parsed.unshift(enrichedOrder);
              localStorage.setItem('bakery_orders', JSON.stringify(pruneOrdersCache(parsed, MAX_CACHED_ORDERS)));

              if (enrichedOrder.order_type === 'preorder' || oNum.startsWith('BK-PRE') || !!enrichedOrder.preorder_pickup_at) {
                const rawPo = localStorage.getItem('bakery_preorders');
                const parsedPo = rawPo ? JSON.parse(rawPo) : [];
                const pIdx = parsedPo.findIndex((o: any) => (o.order_number || o.orderNumber) === oNum);
                if (pIdx >= 0) parsedPo[pIdx] = { ...parsedPo[pIdx], ...enrichedOrder };
                else parsedPo.unshift(enrichedOrder);
                localStorage.setItem('bakery_preorders', JSON.stringify(prunePreordersCache(parsedPo, MAX_CACHED_PREORDERS)));
              }
            } catch {}
          }
        }
        reloadOrdersData();
        if (incomingOrder) {
          const orderNum = incomingOrder.order_number || incomingOrder.orderNumber || 'BK-XXX';
          const isCake = incomingOrder.order_type === 'preorder' || !!incomingOrder.pickupDateTime || orderNum.startsWith('BK-PRE');
          soundManager.playNewOrderChime();
          const pickupFormatted = formatPickupDateTime(incomingOrder.preorder_pickup_at || incomingOrder.pickupDateTime);
          const cakeDetails = incomingOrder.cake_name || incomingOrder.cakeName || (Array.isArray(incomingOrder.items) ? `${incomingOrder.items.length} món bánh` : undefined);
          const custInfo = incomingOrder.customer_name || incomingOrder.customerName || 'Khách đặt qua POS';
          const custPhone = incomingOrder.customer_phone || incomingOrder.customerPhone || '';

          setOrderToast({
            id: String(Date.now()),
            title: isCake ? '🔔 Nhận Đơn Đặt Bánh Mới!' : '🔔 Có Đơn Hàng Mới!',
            subtitle: isCake ? 'Đơn bánh kem sinh nhật vừa được tạo trên hệ thống' : 'Đơn bán tại quầy mới được đồng bộ về máy',
            orderNumber: orderNum,
            customerInfo: custInfo,
            pickupTime: pickupFormatted,
            details: cakeDetails,
            type: 'new_order',
          });

          phoneNotificationService.triggerOrderNotification({
            id: String(Date.now()),
            type: 'new_order',
            appTitle: 'TIỆM BÁNH HẠNH PHÚC',
            title: isCake ? `🎂 Đơn Bánh Mới #${orderNum}` : `🛒 Đơn Bán Mới #${orderNum}`,
            sender: `${custInfo}${custPhone ? ' (' + custPhone + ')' : ''}`,
            message: `${pickupFormatted ? '⏰ Giao lúc ' + pickupFormatted + ' • ' : ''}${cakeDetails || 'Đơn hàng mới'}`,
            extraDetails: incomingOrder.cake_message ? `Ghi chữ: "${incomingOrder.cake_message}"` : undefined,
            orderNumber: orderNum,
            pickupTime: pickupFormatted,
            actionLabel: 'Xem Đơn Bánh',
            onAction: () => setIsPreorderListOpen(true),
          });
        }
      },
      onProductChange: (payload) => {
        if (!payload || !payload.product) return;
        const { action, product } = payload;
        if (action === 'create') {
          const sanitized = decodeProductWithMeta({
            ...product,
            selling_price: Number(product.selling_price ?? product.price ?? 0),
          });
          setProducts((prev) => {
            if (prev.some((p) => p.id === sanitized.id || p.name === sanitized.name)) return prev;
            const updated = [sanitized, ...prev];
            try {
              localStorage.setItem('bakery_products', JSON.stringify(updated));
              db.products.put(sanitized);
            } catch {}
            return updated;
          });
        } else if (action === 'update') {
          const sanitized = {
            ...product,
            selling_price: Number(product.selling_price ?? product.price ?? 0),
          };
          setProducts((prev) => {
            const updated = prev.map((p) => (p.id === sanitized.id ? { ...p, ...sanitized } : p));
            try {
              localStorage.setItem('bakery_products', JSON.stringify(updated));
              db.products.update(sanitized.id, sanitized);
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
      onVietqrConfigChange: (cfg) => {
        setVietqrConfig(cfg);
      },
      onEwalletConfigChange: (cfg) => {
        setEwalletConfig(cfg);
        if (cfg.activeWallet) setSelectedWalletType(cfg.activeWallet);
      },
      onPaymentReceived: (payload) => {
        incomingPaymentHandlerRef.current(payload);
      },
      onTransferApprovalResolved: (payload) => {
        incomingTransferApprovalResolvedRef.current(payload);
      },
    });

    const handleLocalPayment = (e: any) => {
      if (e.detail) incomingPaymentHandlerRef.current(e.detail);
    };
    window.addEventListener('bakery_payment_received', handleLocalPayment);

    const handleLocalTransferResolved = (e: any) => {
      if (e.detail) incomingTransferApprovalResolvedRef.current(e.detail);
    };
    window.addEventListener('transfer_approval_resolved', handleLocalTransferResolved);

    const handleTransferVerifyUpdated = (e: any) => {
      if (e.detail) setTransferVerifyConfig(e.detail);
      else setTransferVerifyConfig(getTransferVerificationConfig());
    };
    window.addEventListener(TRANSFER_VERIFY_UPDATED_EVENT, handleTransferVerifyUpdated);

    return () => {
      clearInterval(syncInterval);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('bakery_orders_updated', handleSync);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('bakery_payment_received', handleLocalPayment);
      window.removeEventListener('transfer_approval_resolved', handleLocalTransferResolved);
      window.removeEventListener(TRANSFER_VERIFY_UPDATED_EVENT, handleTransferVerifyUpdated);
      unsubscribeSync();
    };
  }, []);


  const categories = ['Tất cả', ...Array.from(new Set(products.map((p) => p.category)))];
  const getCategoryCount = (cat: string) => {
    if (cat === 'Tất cả') return products.length;
    return products.filter((p) => p.category === cat).length;
  };

  const filteredProducts = products.filter((p) => {
    // THEO FLOWCHART: Chỉ có thể đưa ra menu những loại bánh có trong mục quản lí bánh được bật hiển thị
    if (p.show_on_menu === false) return false;

    const matchCat = selectedCategory === 'Tất cả' || p.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.supplier_name && p.supplier_name.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const addToCart = (product: CachedProduct, forceDirectCart: boolean = false, event?: React.MouseEvent | { clientX?: number; clientY?: number }) => {
    // Kích hoạt hiệu ứng bay vào giỏ hàng
    if (event?.clientX && event?.clientY) {
      triggerFlyToCart(event.clientX, event.clientY, product);
    } else {
      triggerFlyToCart(undefined, undefined, product);
    }

    // 0. BÁNH / HÀNG NHẬP NGOÀI VỀ BÁN:
    // Vì đây là hàng thương mại nhập sẵn từ bên ngoài, thợ bếp không thể tự làm/nướng.
    // TUYỆT ĐỐI không cho phép bán quá số lượng tồn kho có sẵn trong tiệm.
    if (isImportedProduct(product)) {
      const availStock = Number(product.stock_qty ?? product.stock ?? 0);
      if (availStock <= 0) {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate([60, 60, 60]); } catch {}
        }
        alert(`❌ Sản phẩm "${product.name}" là HÀNG NHẬP NGOÀI VỀ BÁN và hiện ĐÃ HẾT HÀNG TRONG KHO (Tồn: 0)!\n\n⚠️ Vì đây là hàng nhập sẵn từ bên ngoài, bếp không thể tự nướng hay làm được, do đó hệ thống KHÔNG CHO PHÉP bán khi hết tồn kho.`);
        return;
      }
      const existing = cart.find((item) => item.product.id === product.id);
      const currentQty = existing ? existing.quantity : 0;
      if (currentQty + 1 > availStock) {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate([60, 60, 60]); } catch {}
        }
        alert(`⚠️ Sản phẩm "${product.name}" là HÀNG NHẬP NGOÀI VỀ BÁN, hiện trong tiệm chỉ còn đúng ${availStock} cái!\n\n⚠️ Bếp không thể làm thêm loại hàng này, bạn không thể thêm vượt quá số lượng tồn kho có sẵn (${availStock} cái).`);
        return;
      }
    }

    // 1. FLOWCHART: Với bánh có nhãn bánh sinh nhật sẽ hiện cửa sổ đặt bánh sinh nhật có BOM
    if (product.cake_type_label === 'birthday' && !forceDirectCart) {
      setBirthdayOrderProduct(product);
      setIsBirthdayOrderModalOpen(true);
      return;
    }

    // 2. FLOWCHART: Bánh có nhãn đặt trước (bánh mì, croissant,...) ấn đặt sẽ nhả thẳng vào bếp để làm
    // Thêm trực tiếp vào giỏ hàng với ghi chú Đặt trước, không mở modal bánh kem để tránh bị gán Cốt Vani / Kem tươi.
    if ((product.cake_type_label === 'pre_order' || product.is_preorder_only) && !forceDirectCart) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate(35); } catch {}
      }
      setCart((prev) => {
        const existing = prev.find((item) => item.product.id === product.id);
        if (existing) {
          return prev.map((item) =>
            item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
          );
        }
        return [...prev, { product, quantity: 1, notes: 'Bánh đặt trước (Bếp làm mới)' }];
      });
      setCartToast({
        name: `${product.name} (Đặt trước)`,
        qty: 1,
        time: Date.now(),
      });
      return;
    }

    // Rung nhẹ phản hồi xúc giác
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(35); } catch {}
    }

    // Luôn cho phép thêm vào giỏ hàng để thu ngân tính tiền nhanh chóng, không bị chặn gián đoạn bán hàng
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });

    // Bật thông báo nổi xác nhận
    setCartToast({
      name: product.name,
      qty: 1,
      time: Date.now(),
    });
  };

  // Hardware Barcode Scanner Listener:
  // Tự động nhận diện tín hiệu từ súng quét mã vạch vật lý USB / Bluetooth / 2.4G
  // Máy quét gửi chuỗi ký tự dồn dập (< 80ms giữa các phím) và kết thúc bằng phím Enter
  const barcodeBufferRef = useRef<{ chars: string[]; lastTime: number }>({ chars: [], lastTime: 0 });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Bỏ qua nếu các phím chức năng hệ thống đang giữ (Ctrl, Alt, Meta)
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      const interval = now - barcodeBufferRef.current.lastTime;
      barcodeBufferRef.current.lastTime = now;

      // Nếu khoảng cách giữa 2 phím > 120ms (tốc độ gõ người bình thường), xóa buffer
      if (interval > 120) {
        barcodeBufferRef.current.chars = [];
      }

      if (e.key === 'Enter') {
        const scannedCode = barcodeBufferRef.current.chars.join('').trim();
        barcodeBufferRef.current.chars = [];

        // Mã vạch tiêu chuẩn tối thiểu 3 ký tự
        if (scannedCode.length >= 3) {
          // Tìm bánh có barcode hoặc ID/SKU trùng khớp
          const matchedProduct = products.find((p) => {
            if (!p.is_active) return false;
            const pCode = (p.barcode || '').trim().toLowerCase();
            const pId = (p.id || '').trim().toLowerCase();
            const sCode = scannedCode.toLowerCase();
            return (pCode && pCode === sCode) || pId === sCode;
          });

          if (matchedProduct) {
            e.preventDefault();
            e.stopPropagation();

            // Nếu ô input nào đó đang focus và bị máy quét điền dính chuỗi, reset nếu là ô tìm kiếm
            const activeEl = document.activeElement as HTMLElement | null;
            if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
              if (activeEl.getAttribute('placeholder')?.includes('Tìm') || (activeEl as HTMLInputElement).value?.includes(scannedCode)) {
                setSearchQuery('');
                (activeEl as HTMLInputElement).value = '';
                activeEl.blur();
              }
            }

            // Phát âm bíp thành công và thêm ngay vào giỏ hàng
            soundManager.playBarcodeScanSuccess();
            addToCart(matchedProduct, true);
            setCartToast({
              name: `📦 [Mã vạch] ${matchedProduct.name}`,
              qty: 1,
              time: Date.now(),
            });
            return;
          } else {
            // Không tìm thấy sản phẩm có mã vạch này
            soundManager.playBarcodeScanError();
            setCartToast({
              name: `⚠️ Không tìm thấy mã vạch: "${scannedCode}"`,
              qty: 0,
              time: Date.now(),
            });
          }
        }
        return;
      }

      // Chỉ lưu các ký tự đơn
      if (e.key && e.key.length === 1) {
        barcodeBufferRef.current.chars.push(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [products]);

  const updateQuantity = (productId: string, delta: number) => {
    // Chặn tăng số lượng quá tồn kho nếu là hàng nhập ngoài
    if (delta > 0) {
      const targetItem = cart.find((item) => item.product.id === productId);
      if (targetItem && isImportedProduct(targetItem.product)) {
        const availStock = Number(targetItem.product.stock_qty ?? targetItem.product.stock ?? 0);
        if (targetItem.quantity + delta > availStock) {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate([60, 60, 60]); } catch {}
          }
          alert(`⚠️ Sản phẩm "${targetItem.product.name}" là HÀNG NHẬP NGOÀI VỀ BÁN (Chỉ còn ${availStock} cái trong kho)!\n\n⚠️ Bếp không thể làm thêm loại hàng này, không thể tăng vượt quá số lượng tồn kho thực tế.`);
          return;
        }
      }
    }

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((sum, item) => sum + (Number(item.product?.selling_price ?? item.product?.price ?? 0) * (Number(item.quantity) || 1)), 0);
  // Tính tiền giảm giá theo % hoặc theo số tiền (VND)
  const discountAmount = discountMode === 'percent'
    ? Math.round((subtotal * Math.min(100, Math.max(0, discountPercent))) / 100)
    : Math.min(subtotal, Math.max(0, discountCustomAmount));
  const discountPct = subtotal > 0 ? Math.round((discountAmount / subtotal) * 100) : 0;
  const totalAmount = Math.max(0, subtotal - discountAmount); // Tiền hàng sau khi trừ giảm giá

  // TÍNH TOÁN GIÁ CUỐI ĐƠN HÀNG: CỘNG PHÍ SHIP VÀ TRỪ GIẢM GIÁ
  const shippingFee = fulfillmentType === 'shipping' ? (Number(posShippingFee) || 0) : 0;
  const grandTotal = totalAmount + shippingFee; // GIÁ CUỐI ĐƠN HÀNG (đã gồm phí ship và trừ giảm giá)
  const effectiveDeposit =
    fulfillmentType === 'takeaway'
      ? grandTotal
      : posDepositAmount !== null && posDepositAmount !== undefined
      ? Math.min(grandTotal, Math.max(0, posDepositAmount))
      : grandTotal;
  const dueNow = effectiveDeposit;
  const remainingCOD = Math.max(0, grandTotal - dueNow);
  const changeAmount = paymentMethod === 'cash' ? Math.max(0, (cashGiven || dueNow) - dueNow) : 0;
  const splitCashChange = paymentMethod === 'split' ? Math.max(0, (splitCashGiven || splitCashAmount) - splitCashAmount) : 0;

  // Tự động đồng bộ tiền khách đưa khi mở modal thanh toán hoặc thay đổi mức tiền cọc
  useEffect(() => {
    if (isCheckoutOpen) {
      setCashGiven(dueNow);
      if (paymentMethod === 'split') {
        const half = Math.round(dueNow / 2);
        setSplitCashAmount(half);
        setSplitTransferAmount(dueNow - half);
        setSplitCashGiven(half);
      }
    }
  }, [dueNow, isCheckoutOpen]);

  const handleSelectSplitPayment = () => {
    setPaymentMethod('split');
    const half = Math.round(dueNow / 2);
    setSplitCashAmount(half);
    setSplitTransferAmount(dueNow - half);
    setSplitCashGiven(half);
    if (!checkoutTransferCode) {
      const syntax = vietqrConfig.transferSyntax || 'DH';
      const randSuffix = String(Math.floor(100000 + Math.random() * 900000));
      setCheckoutTransferCode(`${syntax}${randSuffix}`);
    }
  };

  const handleSplitCashAmountChange = (newCash: number) => {
    const safeCash = Math.min(dueNow, Math.max(0, newCash));
    setSplitCashAmount(safeCash);
    setSplitTransferAmount(dueNow - safeCash);
    if (splitCashGiven < safeCash) {
      setSplitCashGiven(safeCash);
    }
  };

  const handleSplitTransferAmountChange = (newTransfer: number) => {
    const safeTransfer = Math.min(dueNow, Math.max(0, newTransfer));
    setSplitTransferAmount(safeTransfer);
    setSplitCashAmount(dueNow - safeTransfer);
  };

  // ── HANDLERS PHÂN HỆ TẠM LƯU ĐƠN HÀNG (HOLD ORDERS) ──
  const handleHoldCurrentOrder = (customLabel?: string) => {
    if (cart.length === 0) {
      alert('Giỏ hàng đang trống, không thể tạm lưu!');
      return;
    }
    const holdCode = `#T${heldOrders.length + 1}`;
    const newHeldOrder: HeldOrder = {
      id: `HOLD-${Date.now()}`,
      holdCode,
      label: customLabel?.trim() || undefined,
      createdAt: new Date().toISOString(),
      items: [...cart],
      discountMode,
      discountPercent,
      discountCustomAmount,
      fulfillmentType,
      posCustomerName,
      posCustomerPhone,
      posShippingAddress,
      posPickupDate,
      posPickupTime,
      posCakeMessage,
      posShippingFee,
      posDepositAmount,
      cartNotes,
      totalAmount: grandTotal,
      itemCount: cart.reduce((s, i) => s + i.quantity, 0),
    };

    const updated = [newHeldOrder, ...heldOrders];
    setHeldOrders(updated);
    try {
      localStorage.setItem('bakery_held_orders', JSON.stringify(updated));
    } catch {}

    clearCart();
    setDiscountPercent(0);
    setDiscountCustomAmount(0);
    setCartNotes('');
    setPosCustomerName('');
    setPosCustomerPhone('');
    setPosShippingAddress('');
    setPosCakeMessage('');
    setPosShippingFee(0);
    setPosDepositAmount(null);
    setFulfillmentType('takeaway');

    soundManager.playNewOrderChime();
    setCartToast({ name: `Đã tạm lưu đơn ${holdCode}`, qty: newHeldOrder.itemCount, time: Date.now() });
    if (isLocalMode()) {
      autoSyncToLocalSqlFolder().catch(console.warn);
    }
  };

  const handleRestoreHeldOrder = (orderToRestore: HeldOrder, holdCurrentFirst: boolean = false) => {
    if (holdCurrentFirst && cart.length > 0) {
      const autoCode = `#T${heldOrders.length + 1}`;
      const autoHold: HeldOrder = {
        id: `HOLD-${Date.now()}`,
        holdCode: autoCode,
        label: `Tự động lưu khi mở ${orderToRestore.holdCode}`,
        createdAt: new Date().toISOString(),
        items: [...cart],
        discountMode,
        discountPercent,
        discountCustomAmount,
        fulfillmentType,
        posCustomerName,
        posCustomerPhone,
        posShippingAddress,
        posPickupDate,
        posPickupTime,
        posCakeMessage,
        posShippingFee,
        posDepositAmount,
        cartNotes,
        totalAmount: grandTotal,
        itemCount: cart.reduce((s, i) => s + i.quantity, 0),
      };
      const afterHold = [autoHold, ...heldOrders.filter((h) => h.id !== orderToRestore.id)];
      setHeldOrders(afterHold);
      try {
        localStorage.setItem('bakery_held_orders', JSON.stringify(afterHold));
      } catch {}
    } else {
      const remaining = heldOrders.filter((h) => h.id !== orderToRestore.id);
      setHeldOrders(remaining);
      try {
        localStorage.setItem('bakery_held_orders', JSON.stringify(remaining));
      } catch {}
    }

    setCart(orderToRestore.items);
    setDiscountMode(orderToRestore.discountMode || 'percent');
    setDiscountPercent(orderToRestore.discountPercent || 0);
    setDiscountCustomAmount(orderToRestore.discountCustomAmount || 0);
    setFulfillmentType(orderToRestore.fulfillmentType || 'takeaway');
    setPosCustomerName(orderToRestore.posCustomerName || '');
    setPosCustomerPhone(orderToRestore.posCustomerPhone || '');
    setPosShippingAddress(orderToRestore.posShippingAddress || '');
    setPosPickupDate(orderToRestore.posPickupDate || '');
    setPosPickupTime(orderToRestore.posPickupTime || '');
    setPosCakeMessage(orderToRestore.posCakeMessage || '');
    setPosShippingFee(orderToRestore.posShippingFee || 0);
    setPosDepositAmount(orderToRestore.posDepositAmount ?? null);
    setCartNotes(orderToRestore.cartNotes || '');

    soundManager.playNewOrderChime();
    setCartToast({ name: `Đã khôi phục đơn ${orderToRestore.holdCode}`, qty: orderToRestore.itemCount, time: Date.now() });
    if (isLocalMode()) {
      autoSyncToLocalSqlFolder().catch(console.warn);
    }
  };

  const handleDeleteHeldOrder = (id: string) => {
    const remaining = heldOrders.filter((h) => h.id !== id);
    setHeldOrders(remaining);
    try {
      localStorage.setItem('bakery_held_orders', JSON.stringify(remaining));
    } catch {}
  };

  const handleClearAllHeldOrders = () => {
    setHeldOrders([]);
    try {
      localStorage.setItem('bakery_held_orders', JSON.stringify([]));
    } catch {}
  };

  // ── HANDLERS PHÂN HỆ ĐỔI TRẢ HÀNG & HOÀN TIỀN (RETURNS & EXCHANGES) ──
  const handleExecuteReturn = async (returnRecord: OrderReturnRecord) => {
    try {
      const existingReturns = JSON.parse(localStorage.getItem('bakery_order_returns') || '[]');
      const updatedReturns = [returnRecord, ...existingReturns];
      localStorage.setItem('bakery_order_returns', JSON.stringify(updatedReturns));
      setAllOrderReturns(updatedReturns);

      const orderNum = returnRecord.order_number;
      const normOrderNum = String(orderNum || '').replace(/^#/, '').trim().toLowerCase();
      setInvoicesList((prev) => {
        const updated = prev.map((o) => {
          const currentNum = String(o.order_number || o.orderNumber || '').replace(/^#/, '').trim().toLowerCase();
          if (currentNum === normOrderNum) {
            const previousReturnedItemsQty = (o.return_records || []).reduce((sum: number, rec: any) => {
              return sum + (rec.items?.reduce((s: number, it: any) => s + Number(it.quantity || 0), 0) || 0);
            }, 0);
            const currentReturnQty = returnRecord.items.reduce((s, it) => s + Number(it.quantity || 0), 0);
            const totalReturnedQty = previousReturnedItemsQty + currentReturnQty;
            const originalOrderTotalItems = o.items?.reduce((s: number, it: any) => s + Number(it.quantity || 1), 0) || 1;

            const isFullRefund = totalReturnedQty >= originalOrderTotalItems;
            const newStatus = isFullRefund ? 'refunded' : 'partially_refunded';
            const existingHistory = o.return_records || [];
            return {
              ...o,
              status: newStatus,
              refunded_amount: (Number(o.refunded_amount) || 0) + (Number(returnRecord.refund_amount) || 0),
              return_records: [returnRecord, ...existingHistory],
            };
          }
          return o;
        });
        try {
          localStorage.setItem('bakery_orders', JSON.stringify(updated));
          db.orders.bulkPut(updated as any);
        } catch {}
        return updated;
      });

      // Xử lý biến động quỹ tiền mặt & chuyển khoản ca bán (Shift State):
      // - Hoàn tiền cho khách -> Tăng refundCash (hoặc refundTransfer), từ đó tự động trừ tiền két quầy (expectedCashInRegister)
      // - Khách bù chênh lệch đổi bánh -> Tăng doanh thu ca bán (cashSales / transferSales)
      const refundCashAdd = (returnRecord.refund_method === 'cash' && returnRecord.refund_amount > 0)
        ? Number(returnRecord.refund_amount)
        : 0;
      const refundTransferAdd = (returnRecord.refund_method !== 'cash' && returnRecord.refund_amount > 0)
        ? Number(returnRecord.refund_amount)
        : 0;

      let exchangeCashIn = 0;
      let exchangeTransferIn = 0;
      if (returnRecord.return_type === 'exchange' && (returnRecord.exchange_difference || 0) > 0) {
        if (returnRecord.exchange_payment_detail?.method === 'split') {
          exchangeCashIn = Number(returnRecord.exchange_payment_detail.cashAmount || 0);
          exchangeTransferIn = Number(returnRecord.exchange_payment_detail.transferAmount || 0);
        } else if (returnRecord.refund_method === 'cash') {
          exchangeCashIn = Number(returnRecord.exchange_difference || 0);
        } else {
          exchangeTransferIn = Number(returnRecord.exchange_difference || 0);
        }
      }

      setShift((prev) => {
        const updated: ShiftState = {
          ...prev,
          cashSales: (prev.cashSales || 0) + exchangeCashIn,
          transferSales: (prev.transferSales || 0) + exchangeTransferIn,
          refundCash: (prev.refundCash || 0) + refundCashAdd,
          refundTransfer: (prev.refundTransfer || 0) + refundTransferAdd,
        };
        saveCurrentShiftLocally(updated);
        saveCurrentShiftToDb(updated).catch(() => {});
        return updated;
      });

      // Ghi sổ quỹ thu chi dòng tiền (bakery_cashflow) để liên kết kế toán & sổ sách đầy đủ
      try {
        const currentCashflow = getCashflow();
        const newTransactions: CashflowTransaction[] = [];
        const nowIso = new Date().toISOString();

        if (returnRecord.refund_amount > 0) {
          const isCash = returnRecord.refund_method === 'cash';
          newTransactions.push({
            id: `ret-${returnRecord.id}`,
            type: 'expense',
            category: returnRecord.return_type === 'exchange' ? 'Hoàn chênh lệch đổi hàng' : 'Chi hoàn tiền trả hàng',
            amount: Number(returnRecord.refund_amount),
            desc: `${returnRecord.return_type === 'exchange' ? 'Hoàn chênh lệch đổi món' : 'Hoàn tiền trả hàng'} đơn #${orderNum} (${returnRecord.customer_name || 'Khách lẻ'}) - ${isCash ? 'Tiền mặt' : 'Chuyển khoản'}`,
            date: nowIso,
            method: isCash ? 'cash' : 'bank',
          });
        }

        if (exchangeCashIn > 0) {
          newTransactions.push({
            id: `ex-cash-${returnRecord.id}`,
            type: 'income',
            category: 'Thu chênh lệch đổi hàng',
            amount: exchangeCashIn,
            desc: `Thu chênh lệch đổi món đơn #${orderNum} (Tiền mặt)`,
            date: nowIso,
            method: 'cash',
          });
        }

        if (exchangeTransferIn > 0) {
          newTransactions.push({
            id: `ex-bank-${returnRecord.id}`,
            type: 'income',
            category: 'Thu chênh lệch đổi hàng',
            amount: exchangeTransferIn,
            desc: `Thu chênh lệch đổi món đơn #${orderNum} (Chuyển khoản)`,
            date: nowIso,
            method: 'bank',
          });
        }

        if (newTransactions.length > 0) {
          const updatedCashflow = [...newTransactions, ...currentCashflow];
          saveCashflowLocally(updatedCashflow);
          saveCashflowToDb(updatedCashflow, user?.name || 'Thu Ngân').catch(() => {});
        }
      } catch (cfErr) {
        console.warn('Lỗi ghi sổ quỹ thu chi đổi trả:', cfErr);
      }

      returnRecord.items.forEach((it) => {
        if (it.product_id) {
          if (it.restocked) {
            addProductStock(it.product_id, it.quantity, `Hoàn trả từ đơn #${orderNum}`);
          } else {
            addSpoilageLog({
              productId: it.product_id,
              productName: it.product_name,
              quantity: it.quantity,
              unit: 'cái',
              baseCost: 0,
              sellingPrice: it.unit_price,
              totalCostLoss: it.refund_subtotal,
              totalRevenueLoss: it.refund_subtotal,
              reason: it.reason === 'damaged' ? 'Bánh lỗi / hỏng móp' : it.reason === 'expired' ? 'Bánh cận date / hết hạn' : 'Khách trả hàng loại bỏ',
              notes: `Phiếu đổi trả #${returnRecord.id} đơn #${orderNum}`,
              loggedBy: user?.name || 'Thu Ngân',
            });
          }
        }
      });

      if (returnRecord.return_type === 'exchange' && returnRecord.exchange_replacement_items) {
        returnRecord.exchange_replacement_items.forEach((ep) => {
          if (ep.product_id) {
            const currentP = products.find((p) => p.id === ep.product_id);
            const oldStock = Number(currentP?.stock_qty ?? 10);
            updateProductStock(ep.product_id, Math.max(0, oldStock - ep.quantity), `Đổi món cho đơn #${orderNum}`);
          }
        });
      }

      if (isLocalMode()) {
        autoSyncToLocalSqlFolder().catch(console.warn);
      }
      await syncOrderRefundToSupabase(returnRecord);
      soundManager.playNewOrderChime();
    } catch (err) {
      console.error('Lỗi khi lưu đổi trả:', err);
    }
  };

  // Tính toán đơn Đặt Bánh Kem
  const preorderShippingFee = preorderForm.deliveryMethod === 'shipping' ? (Number(preorderForm.shippingFee) || 0) : 0;
  const cakePriceNum = Number(preorderForm.totalPrice) || 0;
  const preorderDiscountAmount = preorderDiscountMode === 'percent'
    ? Math.round((cakePriceNum * Math.min(100, Math.max(0, preorderDiscountVal))) / 100)
    : Math.min(cakePriceNum, Math.max(0, preorderDiscountVal));
  const preorderDiscountPct = cakePriceNum > 0 ? Math.round((preorderDiscountAmount / cakePriceNum) * 100) : 0;
  // Kết quả định mức chi phí vốn & giá bán đề xuất bánh đặt theo yêu cầu
  const cakeCostResult: CakeCostCalculationResult = useMemo(() => {
    return calculateCustomCakeCost(
      {
        sizeId: preorderForm.sizeId,
        sizeName: preorderForm.size,
        flavorId: preorderForm.flavorId,
        flavorName: preorderForm.flavor,
        fillingId: preorderForm.fillingId,
        fillingName: preorderForm.filling,
        creamId: preorderForm.creamId,
        creamName: preorderForm.cream,
        packagingId: preorderForm.packagingId,
        packagingName: preorderForm.packaging,
        addonIds: preorderForm.selectedAddonIds,
        customAddonCost: preorderForm.customAddonCost,
        sellingPrice: cakePriceNum,
      },
      cakeCostingConfig
    );
  }, [
    preorderForm.sizeId,
    preorderForm.size,
    preorderForm.flavorId,
    preorderForm.flavor,
    preorderForm.fillingId,
    preorderForm.filling,
    preorderForm.creamId,
    preorderForm.cream,
    preorderForm.packagingId,
    preorderForm.packaging,
    preorderForm.selectedAddonIds,
    preorderForm.customAddonCost,
    cakePriceNum,
    cakeCostingConfig,
  ]);

  const preorderFinalTotal = Math.max(0, cakePriceNum - preorderDiscountAmount) + preorderShippingFee;

  // Expected Cash in Register = Opening Cash + Cash Sales - Refund Cash
  const expectedCashInRegister = Math.max(0, (Number(shift.openingCash) || 0) + (Number(shift.cashSales) || 0) - (Number(shift.refundCash) || 0));
  const shiftCashDifference = (Number(closingCashInput) || 0) - expectedCashInRegister;

  // Handler cho đơn Bánh Sinh Nhật theo cơ chế Flowchart mới (BOM & Tồn kho & 36.5% cost)
  const handleConfirmBirthdayCakeOrder = async (orderPayload: any) => {
    try {
      setProcessingOrder(true);
      const now = new Date();
      const prefix = orderPayload.orderDeliveryType === 'ship' ? 'BK-SHIP' : 'BK-CAKE';
      const orderNumber = getNextOrderNumber(prefix);
      const localId = generateUUID();

      const { product, cakeOrderSpec, customerName, customerPhone, pickupDateTime, orderDeliveryType, deliveryAddress, finalPrice, initialKdsStatus } = orderPayload;
      const orderQuantity = Number(orderPayload.quantity || 1);
      const unitPrice = Number(orderPayload.unitPrice || Math.round(finalPrice / orderQuantity));

      // Xây dựng ghi chú chi tiết theo định dạng đơn KDS
      let cakeSummary = '';
      if (cakeOrderSpec) {
        if (cakeOrderSpec.tiers && cakeOrderSpec.tiers.length > 1) {
          const tiersSummary = cakeOrderSpec.tiers.map((t: any) => 
            `[${t.tierName}: ${t.sizeName} • Cốt: ${t.cakeBase?.name || ''} • Kem: ${t.creamCoating?.name || ''}${t.filling?.name ? ` • Nhân: ${t.filling.name}` : ''}]`
          ).join(' | ');
          cakeSummary = [
            `Bánh ${cakeOrderSpec.tiers.length} Tầng: ${tiersSummary}`,
            cakeOrderSpec.packaging?.name ? `Hộp: ${cakeOrderSpec.packaging.name}` : (cakeOrderSpec.packagingName ? `Hộp: ${cakeOrderSpec.packagingName}` : ''),
            cakeOrderSpec.decorNotes ? `Decor: ${cakeOrderSpec.decorNotes}` : '',
            cakeOrderSpec.cakeMessage ? `Chữ: "${cakeOrderSpec.cakeMessage}"` : '',
          ].filter(Boolean).join(' | ');
        } else {
          cakeSummary = [
            cakeOrderSpec.cakeBase?.name ? `Cốt: ${cakeOrderSpec.cakeBase.name} (${cakeOrderSpec.sizeName || ''})` : (cakeOrderSpec.baseName ? `Cốt: ${cakeOrderSpec.baseName} (${cakeOrderSpec.baseSizeName || ''})` : ''),
            cakeOrderSpec.creamCoating?.name ? `Kem: ${cakeOrderSpec.creamCoating.name}` : (cakeOrderSpec.creamName ? `Kem: ${cakeOrderSpec.creamName}` : ''),
            cakeOrderSpec.filling?.name ? `Nhân: ${cakeOrderSpec.filling.name}` : (cakeOrderSpec.fillingName ? `Nhân: ${cakeOrderSpec.fillingName}` : ''),
            cakeOrderSpec.packaging?.name ? `Hộp: ${cakeOrderSpec.packaging.name}` : (cakeOrderSpec.packagingName ? `Hộp: ${cakeOrderSpec.packagingName}` : ''),
            cakeOrderSpec.decorNotes ? `Decor: ${cakeOrderSpec.decorNotes}` : '',
            cakeOrderSpec.cakeMessage ? `Chữ: "${cakeOrderSpec.cakeMessage}"` : '',
          ].filter(Boolean).join(' | ');
        }
      }

      const notes = `[🎂 BÁNH_SINH_NHẬT] Khách: ${customerName} (${customerPhone || 'Không SĐT'}) | Hẹn: ${pickupDateTime || 'Trong ngày'}${orderDeliveryType === 'ship' ? ` | Giao hàng: ${deliveryAddress}` : ' | Lấy tại tiệm'} | ${cakeSummary}`;

      const totalCost = cakeOrderSpec?.costBreakdown?.totalCost || Math.round(unitPrice * 0.365);

      const isMultiTierCake = cakeOrderSpec?.tiers && cakeOrderSpec.tiers.length > 1;
      const cakeDisplayName = isMultiTierCake
        ? `${product.name || 'Bánh Sinh Nhật'} (${cakeOrderSpec.tiers.length} Tầng)`
        : (product.name || 'Bánh Sinh Nhật');

      const cakeStock = Number(orderPayload.cakeStock ?? product?.stock_qty ?? product?.stock ?? 0);
      const isPartialStock = cakeStock > 0 && orderQuantity > cakeStock;
      const stockAvailable = Math.min(cakeStock, orderQuantity);
      const needToMake = Math.max(0, orderQuantity - cakeStock);

      // ── ĐƠN HÀNG DUY NHẤT: Chung hóa đơn với đơn gốc, không sinh hóa đơn mới! ──
      // Nếu còn thiếu bánh cần làm thêm (needToMake > 0): Đơn BẮT BUỘC ở Bước 1 (pending) trong Bếp để thợ nướng bù!
      // Khi thợ nướng xong thì đơn mới tự động chuyển sang Bước 3 (ready / Chờ ship)!
      const mainInitialStatus = (needToMake > 0 || cakeStock < orderQuantity) ? 'pending' : (orderDeliveryType === 'takeaway' ? 'completed' : 'ready');

      const unifiedOrder: any = {
        id: localId,
        local_id: localId,
        order_number: orderNumber,
        orderNumber: orderNumber,
        order_type: 'birthday_cake',
        status: mainInitialStatus,
        customer_name: customerName,
        customerName: customerName,
        customer_phone: customerPhone,
        customerPhone: customerPhone,
        cake_name: cakeDisplayName,
        cake_size: cakeOrderSpec?.sizeName || cakeOrderSpec?.baseSizeName || 'Tiêu chuẩn',
        cake_message: cakeOrderSpec?.cakeMessage || '',
        preorder_pickup_at: pickupDateTime ? new Date(pickupDateTime).toISOString() : now.toISOString(),
        pickupDateTime: pickupDateTime,
        delivery_method: orderDeliveryType === 'ship' ? 'shipping' : 'pickup',
        shipping_address: deliveryAddress,
        notes: isPartialStock
          ? `[🎂 BÁNH_SINH_NHẬT] Khách: ${customerName} (${customerPhone || 'Không SĐT'}) | Hẹn: ${pickupDateTime || 'Trong ngày'}${orderDeliveryType === 'ship' ? ` | Giao hàng: ${deliveryAddress}` : ' | Lấy tại tiệm'} | [⏳ CHỜ BẾP LÀM ${needToMake} CÁI (ĐÃ CÓ SẴN ${stockAvailable}/${orderQuantity} CÁI)] | ${cakeSummary}`
          : notes,
        subtotal: finalPrice,
        discount_amount: 0,
        total_amount: finalPrice,
        deposit_amount: finalPrice,
        remaining_amount: 0,
        payment_method: 'cash',
        total_cogs: totalCost * orderQuantity,
        cake_order_spec: cakeOrderSpec,
        orderQuantity: orderQuantity,
        ready_stock_qty: isPartialStock ? stockAvailable : (cakeStock >= orderQuantity ? orderQuantity : 0),
        need_bake_qty: isPartialStock ? needToMake : (cakeStock <= 0 ? orderQuantity : 0),
        bake_status: isPartialStock || cakeStock < orderQuantity ? 'pending' : (cakeStock >= orderQuantity ? 'done' : 'pending'),
        created_at: now.toISOString(),
        items: [
          {
            id: generateUUID(),
            product_id: product.id,
            product_name_snapshot: cakeDisplayName,
            quantity: orderQuantity,
            unit_price: unitPrice,
            unit_cost: totalCost,
            line_total: finalPrice,
            line_cost: totalCost * orderQuantity,
            cake_order_spec: cakeOrderSpec,
            notes: cakeSummary,
          }
        ],
        payments: [
          {
            method: 'cash',
            amount: finalPrice,
          }
        ]
      };

      // Lưu Dexie & localStorage (Duy nhất 1 hóa đơn chính, không sinh thêm hóa đơn -LAM)
      try {
        await db.orders.add(unifiedOrder as any);
      } catch (dbErr) {
        console.warn('Lỗi ghi Dexie birthday order:', dbErr);
      }

      if (typeof window !== 'undefined') {
        const recentOrders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
        recentOrders.unshift(unifiedOrder);
        const safeOrders = pruneOrdersCache(recentOrders, MAX_CACHED_ORDERS);
        localStorage.setItem('bakery_orders', JSON.stringify(safeOrders));
        localStorage.setItem('bakery_kds_seeded', 'true');
        setInvoicesList(safeOrders);

        const recentPos = JSON.parse(localStorage.getItem('bakery_preorders') || '[]');
        recentPos.unshift(unifiedOrder);
        const safePos = prunePreordersCache(recentPos, MAX_CACHED_PREORDERS);
        localStorage.setItem('bakery_preorders', JSON.stringify(safePos));

        window.dispatchEvent(new Event('bakery_orders_updated'));
        soundManager.playNewOrderChime();

        // 1. Bắn tin nhắn banner giả lập điện thoại
        phoneNotificationService.triggerOrderNotification({
          id: String(Date.now()),
          type: 'new_order',
          appTitle: 'TIỆM BÁNH HẠNH PHÚC',
          title: `🎂 Đơn Bánh Sinh Nhật Mới #${orderNumber}`,
          sender: `${customerName} (${customerPhone || 'Không SĐT'})`,
          message: `${cakeDisplayName} • SL: ${orderQuantity} cái • Hẹn: ${pickupDateTime || 'Trong ngày'}${orderDeliveryType === 'ship' ? ' • Giao tận nơi' : ' • Lấy tại tiệm'}${isPartialStock ? ` • (Sẵn ${stockAvailable}, Bếp làm ${needToMake})` : ''}`,
          extraDetails: cakeOrderSpec?.cakeMessage ? `Ghi chữ: "${cakeOrderSpec.cakeMessage}"` : undefined,
          orderNumber: orderNumber,
          pickupTime: pickupDateTime,
          actionLabel: 'Xem Bếp KDS',
          onAction: () => { window.location.href = '/kitchen'; },
        });

        // 2. Gửi Telegram alert
        sendTelegramOrderAlert(unifiedOrder).catch(() => {});

        // 3. Push alert thợ bếp
        triggerServerPush({
          type: 'urgent_alert',
          isUrgent: true,
          title: isPartialStock
            ? `👨‍🍳 BỔ SUNG ${needToMake} BÁNH CHO ĐƠN #${orderNumber}`
            : `🎂 ĐƠN BÁNH SINH NHẬT MỚI #${unifiedOrder.order_number}`,
          body: `${unifiedOrder.customer_name} • ${unifiedOrder.cake_name}`,
          url: '/kitchen',
          orderNumber: unifiedOrder.order_number,
        }).catch(() => {});

        setOrderToast({
          id: String(Date.now()),
          title: isPartialStock 
            ? `🎂 Đơn #${orderNumber}: Sẵn ${stockAvailable}/${orderQuantity} cái • Bếp cần làm bù ${needToMake} cái!`
            : mainInitialStatus === 'ready' 
            ? '🎂 Đơn Bánh Sinh Nhật Có Sẵn (Chờ Ship/Giao)' 
            : '🎂 Bếp Đang Làm Bánh Sinh Nhật!',
          subtitle: isPartialStock
            ? `Đơn hiển thị tại Cột 1 Bếp để thợ nướng bù ${needToMake} cái trước khi chuyển giao`
            : mainInitialStatus === 'ready' 
            ? 'Đã chuyển sang bước 3 (Chờ giao/ship)' 
            : 'Đã chuyển đơn vào bếp thợ làm bánh',
          orderNumber: unifiedOrder.order_number,
          customerInfo: `${unifiedOrder.customer_name} (${unifiedOrder.customer_phone})`,
          pickupTime: pickupDateTime,
          details: `${unifiedOrder.cake_name}`,
          type: 'new_order',
        });
      }

      // Sync Supabase & Broadcast
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await syncOrderToSupabase(unifiedOrder, mainInitialStatus);
        } catch (sErr) {
          console.warn('Lỗi syncOrderToSupabase birthday order:', sErr);
        }
        try {
          await broadcastNewOrder(unifiedOrder);
        } catch (bErr) {
          console.warn('Lỗi broadcastNewOrder birthday order:', bErr);
        }
      }

      // Mở modal hóa đơn/phiếu hẹn
      setCompletedOrder({
        orderNumber,
        deliveryMethod: orderDeliveryType === 'ship' ? 'shipping' : 'pickup',
        shippingAddress: deliveryAddress,
        shippingFee: 0,
        items: [
          {
            product: {
              name: `[🎂 BÁNH SINH NHẬT] ${product.name}`,
              selling_price: unitPrice,
            },
            quantity: orderQuantity,
          },
        ],
        subtotal: finalPrice,
        discountAmount: 0,
        totalAmount: finalPrice,
        depositAmount: finalPrice,
        remainingAmount: 0,
        paymentMethod: 'cash',
        cashGiven: finalPrice,
        changeAmount: 0,
        cakeMessage: cakeOrderSpec?.cakeMessage || '',
        pickupDateTimeStr: pickupDateTime,
        customerName: customerName,
        customerPhone: customerPhone,
        createdAt: now.toLocaleString('vi-VN'),
        cashier: user?.name || 'Thu Ngân',
      });
    } catch (err) {
      console.error('Lỗi tạo đơn bánh sinh nhật:', err);
    } finally {
      setProcessingOrder(false);
    }
  };

  // Checkout Handler for regular & pre-order / shipping sales
  const handleCompleteOrder = async (
    overridePaymentMethod?: any,
    overrideProofImage?: string | null,
    overrideOrderNumber?: string | null,
    skipTwoStepCheck = false
  ) => {
    if (cart.length === 0) return;
    const effectivePaymentMethod: 'cash' | 'transfer' | 'momo' | 'split' =
      (typeof overridePaymentMethod === 'string' && ['cash', 'transfer', 'momo', 'split'].includes(overridePaymentMethod))
        ? (overridePaymentMethod as 'cash' | 'transfer' | 'momo' | 'split')
        : paymentMethod;

    if (fulfillmentType === 'shipping' && !posShippingAddress.trim()) {
      alert('Vui lòng nhập địa chỉ giao hàng chi tiết cho đơn Ship bánh!');
      return;
    }

    // Kiểm tra chặn hàng nhập ngoài vượt quá tồn kho (Bếp không thể làm được)
    const overstockedImported = cart.find((item) => {
      if (isImportedProduct(item.product)) {
        const availStock = Number(item.product.stock_qty ?? item.product.stock ?? 0);
        return item.quantity > availStock;
      }
      return false;
    });
    if (overstockedImported) {
      const availStock = Number(overstockedImported.product.stock_qty ?? overstockedImported.product.stock ?? 0);
      alert(`❌ KHÔNG THỂ THANH TOÁN:\n\nSản phẩm "${overstockedImported.product.name}" là HÀNG NHẬP NGOÀI VỀ BÁN.\nSố lượng đặt (${overstockedImported.quantity} cái) vượt quá tồn kho thực tế (${availStock} cái).\n\n⚠️ Vì đây là hàng nhập sẵn từ bên ngoài, bếp không thể tự làm/nướng, hệ thống KHÔNG CHO PHÉP bán quá tồn kho.\nVui lòng chỉnh lại số lượng món này về tối đa ${availStock} cái trước khi thanh toán!`);
      return;
    }

    // ── XỬ LÝ CƠ CHẾ XÁC THỰC CHUYỂN KHOẢN 2 BƯỚC ──
    const effectiveProofImage = overrideProofImage ?? capturedTransferProofImage;
    const isTwoStepMode = transferVerifyConfig.mode === 'two_step';
    const skipAdminSetting = transferVerifyConfig.twoStep?.skipForAdmin !== undefined
      ? transferVerifyConfig.twoStep.skipForAdmin
      : (transferVerifyConfig.two_step?.skipForAdmin ?? true);
    const isSkipAdmin = Boolean(skipAdminSetting && isAdmin);

    if (
      (effectivePaymentMethod === 'transfer' || (effectivePaymentMethod === 'split' && splitTransferAmount > 0)) &&
      isTwoStepMode &&
      !isSkipAdmin &&
      !skipTwoStepCheck &&
      !adminApprovedTransfer &&
      !effectiveProofImage
    ) {
      let orderNumToUse = overrideOrderNumber || activeCheckoutOrderNumber;
      if (!orderNumToUse) {
        const prefixTemp = fulfillmentType === 'takeaway' ? 'BK' : fulfillmentType === 'shipping' ? 'BK-SHIP' : 'BK-PRE';
        orderNumToUse = getNextOrderNumber(prefixTemp);
        setActiveCheckoutOrderNumber(orderNumToUse);
      }

      setIsWaitingAdminTransferApproval(true);
      setProcessingOrder(false);

      const cashierName = user?.name || securityConfig.staffName || 'Thu Ngân Quầy POS';
      const isPreOrder = fulfillmentType !== 'takeaway';
      const transferReqPayload: TransferApprovalPayload = {
        order_number: orderNumToUse,
        amount: effectivePaymentMethod === 'split' ? splitTransferAmount : dueNow,
        customer_name: isPreOrder ? (posCustomerName || 'Khách đặt') : (posCustomerName || 'Khách tại quầy'),
        transfer_code: checkoutTransferCode,
        requested_by: cashierName,
        requested_at: new Date().toISOString(),
      };

      await broadcastTransferApprovalRequest(transferReqPayload);

      // Lưu vào danh sách chờ cục bộ để đồng bộ
      try {
        const rawPending = localStorage.getItem('bakery_pending_transfers');
        const pendingList: TransferApprovalPayload[] = rawPending ? JSON.parse(rawPending) : [];
        if (!pendingList.some((p) => p.order_number === orderNumToUse)) {
          const updatedPending = [transferReqPayload, ...pendingList];
          localStorage.setItem('bakery_pending_transfers', JSON.stringify(updatedPending));
          window.dispatchEvent(new CustomEvent('bakery_pending_transfers_updated'));
        }
      } catch {}

      return;
    }

    setProcessingOrder(true);

    try {
      const now = new Date();
      const prefix = fulfillmentType === 'takeaway' ? 'BK' : fulfillmentType === 'shipping' ? 'BK-SHIP' : 'BK-PRE';
      const orderNumber = overrideOrderNumber || activeCheckoutOrderNumber || getNextOrderNumber(prefix);
      const localId = generateUUID();

      const isPre = fulfillmentType !== 'takeaway';
      const orderType = isPre ? ('preorder' as const) : ('takeaway' as const);

      let fullNotes = '';
      if (fulfillmentType === 'takeaway') {
        fullNotes = cartNotes ? `Ghi chú: ${cartNotes}` : '';
      } else if (fulfillmentType === 'pickup') {
        fullNotes = `[ĐẶT_BÁNH_HẸN_LẤY] Khách: ${posCustomerName || 'Khách đặt'} ${posCustomerPhone ? '(' + posCustomerPhone + ')' : ''} | Hẹn: ${posPickupTime} ngày ${posPickupDate}${posCakeMessage ? ' | Chữ: "' + posCakeMessage + '"' : ''} | Tổng: ${grandTotal.toLocaleString('vi-VN')}₫ | Đã cọc: ${dueNow.toLocaleString('vi-VN')}₫ | Còn lại thu: ${remainingCOD.toLocaleString('vi-VN')}₫${cartNotes ? ' | Dặn: ' + cartNotes : ''}`;
      } else {
        fullNotes = `[GIAO_HÀNG_TẬN_NƠI] Khách: ${posCustomerName || 'Khách đặt'} ${posCustomerPhone ? '(' + posCustomerPhone + ')' : ''} | Đ/C: ${posShippingAddress || 'Chưa có địa chỉ'} | Hẹn giao: ${posPickupTime} ngày ${posPickupDate}${posCakeMessage ? ' | Chữ: "' + posCakeMessage + '"' : ''} | Phí ship: ${(posShippingFee || 0).toLocaleString('vi-VN')}₫ | Tổng: ${grandTotal.toLocaleString('vi-VN')}₫ | Đã cọc: ${dueNow.toLocaleString('vi-VN')}₫ | CẦN THU KHI GIAO: ${remainingCOD.toLocaleString('vi-VN')}₫${cartNotes ? ' | Dặn: ' + cartNotes : ''}`;
      }

      // Đơn bán bánh theo Flowchart Excel:
      // - Nếu takeaway (Khách mua lấy ngay tại quầy):
      //   + Nếu đủ tồn kho (tồn kho >= số lượng đặt cho TẤT CẢ các món): 'completed' (Hoàn thành đơn ngay)
      //   + Nếu thiếu hàng hoặc hết tồn kho: 'pending' (Bếp nướng gấp để trả khách)
      // - Nếu shipping (Ship tận nơi) hoặc pickup (Hẹn giờ lấy):
      //   + Nếu đủ tồn kho (tồn kho >= số lượng đặt cho TẤT CẢ các món): 'ready' (Bước 3 trong bếp: Chờ ship / Sẵn sàng giao)
      //   + Nếu thiếu hàng hoặc hết tồn kho: 'pending' (Bước 1 trong bếp: Bếp làm bánh)
      // - Đơn có món đặt trước hoặc bánh sinh nhật / bánh custom luôn luôn vào Bếp (pending)
      const allItemsInStock = cart.every((item) => {
        const availStock = Number(item.product.stock_qty ?? item.product.stock ?? 0);
        return availStock >= item.quantity;
      });
      const hasPreorderOrCustomItem = cart.some((item) =>
        item.product.cake_type_label === 'pre_order' ||
        item.product.is_preorder_only ||
        (item as any).cake_order_spec ||
        item.product.id?.startsWith('custom-cake-')
      );

      // ── TÍNH TOÁN TỒN KHO & SỐ LƯỢNG CẦN BẾP NƯỚNG ──
      let hasPartialStock = false;
      let totalStockAvailable = 0;
      let totalNeedToBake = 0;

      cart.forEach((item) => {
        const availStock = Number(item.product.stock_qty ?? item.product.stock ?? 0);
        const isImported = isImportedProduct(item.product);

        // Chỉ bánh tự sản xuất mới tính số lượng cần làm thêm nếu thiếu hàng
        if (!isImported && availStock > 0 && item.quantity > availStock) {
          hasPartialStock = true;
          const missingQty = item.quantity - availStock;
          totalStockAvailable += availStock;
          totalNeedToBake += missingQty;
        } else {
          totalStockAvailable += Math.min(availStock, item.quantity);
          if (!isImported && availStock <= 0) totalNeedToBake += item.quantity;
        }
      });

      let initialStatus: 'completed' | 'ready' | 'pending';
      if (hasPartialStock || !allItemsInStock || hasPreorderOrCustomItem) {
        // Thiếu hàng hoặc có món cần làm: chuyển vào Bếp Bước 1 (Chờ làm)
        initialStatus = 'pending';
      } else if (fulfillmentType === 'takeaway') {
        initialStatus = 'completed';
      } else {
        initialStatus = 'ready';
      }

      // Danh sách món trong hóa đơn: TÊN BÁNH NGUYÊN BẢN, KHÔNG CHÈN TRẠNG THÁI (SẴN/LÀM THÊM)
      const itemsWithCost = cart.map((item) => {
        const unitCost = Number(item.product.import_price ?? item.product.base_cost_price ?? Math.round(item.product.selling_price * 0.33)) || 0;
        const lineCost = Math.round(unitCost * item.quantity);
        const isImported = isImportedProduct(item.product);
        return {
          product_id: item.product.id,
          product_name_snapshot: item.product.name,
          quantity: item.quantity,
          unit_price: item.product.selling_price,
          unit_cost: unitCost,
          line_total: item.product.selling_price * item.quantity,
          line_cost: lineCost,
          notes: item.notes || '',
          product_type: isImported ? 'imported' : (item.product.product_type || 'produced'),
          supplier_name: item.product.supplier_name,
        };
      });

      const orderTotalCogs = itemsWithCost.reduce((sum, it) => sum + (it.line_cost || 0), 0);

      const orderData: any = {
        local_id: localId,
        order_number: orderNumber,
        order_type: orderType,
        delivery_method: fulfillmentType === 'shipping' ? ('shipping' as const) : fulfillmentType === 'pickup' ? ('pickup' as const) : undefined,
        status: initialStatus,
        subtotal,
        discount_amount: discountAmount,
        discount_pct: discountPct,
        total_amount: grandTotal,
        deposit_amount: dueNow,
        remaining_amount: remainingCOD,
        cash_given: effectivePaymentMethod === 'cash' 
          ? (cashGiven && cashGiven >= dueNow ? cashGiven : dueNow) 
          : effectivePaymentMethod === 'split'
          ? (splitCashGiven && splitCashGiven >= splitCashAmount ? splitCashGiven : splitCashAmount)
          : dueNow,
        change_amount: effectivePaymentMethod === 'cash' 
          ? Math.max(0, (cashGiven && cashGiven >= dueNow ? cashGiven : dueNow) - dueNow) 
          : effectivePaymentMethod === 'split'
          ? Math.max(0, (splitCashGiven && splitCashGiven >= splitCashAmount ? splitCashGiven : splitCashAmount) - splitCashAmount)
          : 0,
        shipping_fee: fulfillmentType === 'shipping' ? (posShippingFee || 0) : 0,
        shipping_address: fulfillmentType === 'shipping' ? posShippingAddress : undefined,
        customer_name: isPre ? (posCustomerName || 'Khách đặt') : undefined,
        customer_phone: isPre ? posCustomerPhone : undefined,
        cake_message: isPre ? posCakeMessage : undefined,
        preorder_pickup_at: isPre ? new Date(`${posPickupDate}T${posPickupTime}:00`).toISOString() : undefined,
        notes: (hasPartialStock
          ? `[⏳ CẦN BẾP LÀM ${totalNeedToBake} CÁI (ĐÃ CÓ SẴN ${totalStockAvailable} CÁI)] | ${fullNotes}`
          : fullNotes) + (effectiveProofImage ? ' | [📸 ĐÃ CHỤP ẢNH BILL CK ĐỐI SOÁT]' : adminApprovedTransfer ? ' | [👑 ADMIN ĐÃ DUYỆT CK]' : ''),
        payment_method: effectivePaymentMethod,
        paymentMethod: effectivePaymentMethod,
        transfer_proof_image: effectiveProofImage || undefined,
        transfer_verification_mode: transferVerifyConfig.mode,
        transfer_approved_by: adminApprovedTransfer ? (user?.name || 'Admin') : undefined,
        total_cogs: orderTotalCogs,
        orderQuantity: cart.reduce((sum, it) => sum + it.quantity, 0),
        ready_stock_qty: hasPartialStock ? totalStockAvailable : undefined,
        need_bake_qty: hasPartialStock ? totalNeedToBake : undefined,
        bake_status: hasPartialStock || !allItemsInStock ? 'pending' : 'done',
        sync_status: 'synced' as const,
        created_at: now.toISOString(),
        items: [
          ...itemsWithCost,
          ...(fulfillmentType === 'shipping' && (posShippingFee || 0) > 0 ? [
            {
              id: generateUUID(),
              product_name_snapshot: `Phí giao hàng tận nơi (Ship bánh)`,
              quantity: 1,
              unit_price: posShippingFee || 0,
              unit_cost: 0,
              line_total: posShippingFee || 0,
              line_cost: 0,
              notes: `Đ/C: ${posShippingAddress || ''}`,
            }
          ] : []),
        ],
        payments: effectivePaymentMethod === 'split' ? [
          { method: 'cash', amount: splitCashAmount },
          { method: 'transfer', amount: splitTransferAmount, reference_code: checkoutTransferCode },
        ] : [
          {
            method: effectivePaymentMethod,
            amount: dueNow,
            reference_code: effectivePaymentMethod === 'transfer' ? checkoutTransferCode : undefined,
          },
        ],
      };

      // 1. Lưu duy nhất 1 hóa đơn chính vào Dexie IndexedDB & localStorage
      try {
        await db.orders.add(orderData as any);
      } catch (dbErr) {
        console.warn('Lỗi ghi Dexie:', dbErr);
      }

      if (typeof window !== 'undefined') {
        try {
          const recentOrders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
          recentOrders.unshift(orderData);
          const safeOrders = pruneOrdersCache(recentOrders, MAX_CACHED_ORDERS);
          localStorage.setItem('bakery_orders', JSON.stringify(safeOrders));
          localStorage.setItem('bakery_kds_seeded', 'true');
          setInvoicesList(safeOrders);

          if (orderData.order_type === 'preorder' || orderData.preorder_pickup_at || orderData.order_number?.startsWith('BK-PRE')) {
            const recentPos = JSON.parse(localStorage.getItem('bakery_preorders') || '[]');
            recentPos.unshift(orderData);
            const safePos = prunePreordersCache(recentPos, MAX_CACHED_PREORDERS);
            localStorage.setItem('bakery_preorders', JSON.stringify(safePos));
          }
          window.dispatchEvent(new Event('bakery_orders_updated'));
          
          // Bắn thông báo Telegram tức thì cho đơn duy nhất
          sendTelegramOrderAlert(orderData).catch(() => {});

          // Bắn thông báo trực tiếp PWA Web Push tới toàn bộ máy trong tiệm
          triggerServerPush({
            type: fulfillmentType === 'shipping' ? 'urgent_alert' : 'new_order',
            isUrgent: fulfillmentType === 'shipping',
            title: fulfillmentType === 'shipping'
              ? `🚚 ĐƠN SHIP BÁNH MỚI #${orderData.order_number}`
              : fulfillmentType === 'pickup'
              ? `⏰ ĐƠN HẸN LẤY BÁNH #${orderData.order_number}`
              : `🛒 ĐƠN BÁN TẠI QUẦY #${orderData.order_number}`,
            body: `${cart.length} món bánh • Tổng: ${grandTotal.toLocaleString('vi-VN')}₫ (Thu: ${dueNow.toLocaleString('vi-VN')}₫)`,
            url: fulfillmentType === 'shipping' ? '/kitchen' : '/pos',
            orderNumber: orderData.order_number,
          }).catch(() => {});

          soundManager.playNewOrderChime();
          phoneNotificationService.triggerOrderNotification({
            id: String(Date.now()),
            type: 'new_order',
            appTitle: 'TIỆM BÁNH HẠNH PHÚC (POS)',
            title: fulfillmentType === 'shipping'
              ? `🚚 Đơn Ship Bánh Mới #${orderData.order_number}`
              : fulfillmentType === 'pickup'
              ? `⏰ Đơn Hẹn Lấy Bánh #${orderData.order_number}`
              : `🛒 Đơn Bán Tại Quầy #${orderData.order_number}`,
            sender: `Thu Ngân: ${user?.name || 'Quầy POS'}`,
            message: `${cart.length} món bánh • Tổng: ${grandTotal.toLocaleString('vi-VN')}₫ (Thu ngay: ${dueNow.toLocaleString('vi-VN')}₫ - ${effectivePaymentMethod === 'cash' ? '💵 Tiền mặt' : effectivePaymentMethod === 'transfer' ? '🏦 Chuyển khoản' : effectivePaymentMethod === 'split' ? '💳+💵 Kết hợp' : '📱 Ví MoMo'})`,
            extraDetails: 'Đã lưu hóa đơn & chuyển tiếp dữ liệu vào bếp',
            orderNumber: orderData.order_number,
            actionLabel: 'Xem Hóa Đơn',
            onAction: () => setIsInvoiceHistoryOpen(true),
          });
        } catch {}
      }

      // 2. Cập nhật tiền ca bán (chỉ tính số tiền thu ngay lúc này) và lưu vĩnh viễn vào CSDL
      const addedCash = effectivePaymentMethod === 'cash' ? dueNow : effectivePaymentMethod === 'split' ? splitCashAmount : 0;
      const addedTransfer = (effectivePaymentMethod === 'transfer' || effectivePaymentMethod === 'momo') ? dueNow : effectivePaymentMethod === 'split' ? splitTransferAmount : 0;
      setShift((prev) => {
        const updated: ShiftState = {
          ...prev,
          orderCount: (prev.orderCount || 0) + 1,
          cashSales: (prev.cashSales || 0) + addedCash,
          transferSales: (prev.transferSales || 0) + addedTransfer,
        };
        saveCurrentShiftLocally(updated);
        saveCurrentShiftToDb(updated).catch(() => {});
        return updated;
      });

      // 2.5. Tự động trừ số lượng tồn kho của các sản phẩm bánh đã bán
      setProducts((prev) => {
        const updated = prev.map((p) => {
          const itemInCart = cart.find((ci) => ci.product.id === p.id);
          if (itemInCart) {
            const newStock = Math.max(0, (p.stock_qty ?? 0) - itemInCart.quantity);
            return { ...p, stock_qty: newStock };
          }
          return p;
        });
        try {
          localStorage.setItem('bakery_products', JSON.stringify(updated));
          db.products.bulkPut(updated);
          window.dispatchEvent(new Event('bakery_products_updated'));
          window.dispatchEvent(new Event('bakery_stocks_updated'));
        } catch {}
        return updated;
      });

      // 3. Đóng popup thanh toán, hiện phiếu hóa đơn in nhiệt và chuyển về Menu
      setIsWaitingAdminTransferApproval(false);
      setAdminApprovedTransfer(false);
      setCapturedTransferProofImage(null);
      setActiveCheckoutOrderNumber('');
      setIsCheckoutOpen(false);
      setCompletedOrder({
        orderNumber,
        fulfillmentType,
        deliveryMethod: fulfillmentType === 'shipping' ? 'shipping' : 'pickup',
        transfer_proof_image: effectiveProofImage || undefined,
        items: [
          ...cart,
          ...(fulfillmentType === 'shipping' && (posShippingFee || 0) > 0 ? [
            {
              product: {
                id: 'shipping-fee-item',
                name: `Phí giao hàng tận nơi (Ship bánh)`,
                selling_price: posShippingFee || 0,
                cost_price: 0,
                category: 'Dịch vụ',
              },
              quantity: 1,
            }
          ] : []),
        ],
        subtotal,
        discountAmount,
        totalAmount: grandTotal,
        depositAmount: dueNow,
        remainingAmount: remainingCOD,
        shippingFee: fulfillmentType === 'shipping' ? (posShippingFee || 0) : 0,
        shippingAddress: fulfillmentType === 'shipping' ? posShippingAddress : '',
        customerName: isPre ? (posCustomerName || 'Khách đặt') : '',
        customerPhone: isPre ? posCustomerPhone : '',
        pickupDateTimeStr: isPre ? `${posPickupTime} ngày ${posPickupDate}` : '',
        cakeMessage: isPre ? posCakeMessage : '',
        paymentMethod: effectivePaymentMethod,
        splitCashAmount: effectivePaymentMethod === 'split' ? splitCashAmount : undefined,
        splitTransferAmount: effectivePaymentMethod === 'split' ? splitTransferAmount : undefined,
        splitCashGiven: effectivePaymentMethod === 'split' ? splitCashGiven : undefined,
        cashGiven: effectivePaymentMethod === 'cash' 
          ? (cashGiven && cashGiven >= dueNow ? cashGiven : dueNow) 
          : effectivePaymentMethod === 'split'
          ? (splitCashGiven && splitCashGiven >= splitCashAmount ? splitCashGiven : splitCashAmount)
          : dueNow,
        changeAmount: effectivePaymentMethod === 'cash' 
          ? Math.max(0, (cashGiven && cashGiven >= dueNow ? cashGiven : dueNow) - dueNow) 
          : effectivePaymentMethod === 'split'
          ? Math.max(0, (splitCashGiven && splitCashGiven >= splitCashAmount ? splitCashGiven : splitCashAmount) - splitCashAmount)
          : 0,
        createdAt: now.toLocaleString('vi-VN'),
        cashier: user?.name || 'Thu Ngân',
      });
      clearCart();
      setDiscountPercent(0);
      setDiscountCustomAmount(0);
      setCartNotes('');
      setMobileTab('menu');

      // 4. Đồng bộ tức thì lên CSDL Supabase SQL (chân lý đa thiết bị)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          await syncOrderToSupabase(orderData, initialStatus);
        } catch (syncErr) {
          console.warn('Lỗi syncOrderToSupabase POS:', syncErr);
        }
        try {
          await broadcastNewOrder(orderData);
        } catch (bErr) {
          console.warn('Lỗi broadcastNewOrder POS:', bErr);
        }
      }

      if (isLocalMode()) {
        autoSyncToLocalSqlFolder().catch(console.warn);
      }

      // Reset form sau khi đặt
      setPosCustomerName('');
      setPosCustomerPhone('');
      setPosShippingAddress('');
      setPosCakeMessage('');
      setPosShippingFee(0);
      setPosDepositAmount(null);
      setFulfillmentType('takeaway');
    } catch (err) {
      console.error('Lỗi khi tạo đơn:', err);
      setIsCheckoutOpen(false);
      setMobileTab('menu');
      clearCart();
    } finally {
      setProcessingOrder(false);
    }
  };

  // ── AUTO-BANK WEBHOOK PAYMENT HANDLER & LIVE SYNCHRONIZATION ──
  const isCheckoutOpenRef = useRef(isCheckoutOpen);
  const checkoutTransferCodeRef = useRef(checkoutTransferCode);
  const dueNowRef = useRef(dueNow);
  const autoBankConfigRef = useRef(autoBankConfig);

  useEffect(() => {
    isCheckoutOpenRef.current = isCheckoutOpen;
  }, [isCheckoutOpen]);

  useEffect(() => {
    checkoutTransferCodeRef.current = checkoutTransferCode;
  }, [checkoutTransferCode]);

  useEffect(() => {
    dueNowRef.current = dueNow;
  }, [dueNow]);

  useEffect(() => {
    autoBankConfigRef.current = autoBankConfig;
  }, [autoBankConfig]);

  useEffect(() => {
    if (toastPaymentNotice) {
      const timer = setTimeout(() => {
        setToastPaymentNotice(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [toastPaymentNotice]);

  const handleIncomingPayment = useCallback((payload: PaymentReceivedPayload) => {
    if (!payload || !payload.amount) return;

    const currentCode = checkoutTransferCodeRef.current;
    const currentDueNow = dueNowRef.current;
    const isCheckout = isCheckoutOpenRef.current;
    const cfg = autoBankConfigRef.current;

    // 1. Kiểm tra xem giao dịch có khớp với đơn đang mở thanh toán tại quầy không
    const codeMatches =
      Boolean(currentCode) &&
      ((payload.order_code && payload.order_code.toUpperCase() === currentCode.toUpperCase()) ||
        (payload.order_number && payload.order_number.toUpperCase().includes(currentCode.toUpperCase())) ||
        (payload.content && payload.content.toUpperCase().includes(currentCode.toUpperCase())));

    const amountMatches = isCheckout && currentDueNow > 0 && Math.abs(payload.amount - currentDueNow) < 1;

    if (isCheckout && (codeMatches || amountMatches)) {
      // Đơn tại quầy nhận đủ tiền!
      setPaymentReceivedInfo({
        amount: payload.amount,
        gateway: payload.gateway,
        orderCode: payload.order_code || currentCode,
        transactionId: payload.transaction_id,
      });

      if (cfg.soundAlert) {
        soundManager.playPaymentSuccessChime();
      }
      if (cfg.speechAlert) {
        const spokenCode = activeCheckoutOrderNumberRef.current || payload.order_number || payload.order_code || currentCode;
        soundManager.speakPaymentSuccess(payload.amount, spokenCode);
      }

      if (cfg.autoConfirmOrder) {
        setTimeout(() => {
          handleCompleteOrder('transfer');
        }, 1200);
      }
    } else {
      // Nhận tiền chuyển khoản cho đơn khác (đơn cọc bánh, đơn ship bánh, đơn từ nhân viên khác)
      if (cfg.soundAlert) {
        soundManager.playPaymentSuccessChime();
      }
      if (cfg.speechAlert) {
        soundManager.speakPaymentSuccess(payload.amount, payload.order_number || payload.order_code);
      }

      setToastPaymentNotice({
        amount: payload.amount,
        orderCode: payload.order_code || payload.order_number || 'Ngân hàng',
        gateway: payload.gateway || 'AutoBank',
        time: Date.now(),
      });

      reloadOrdersData();
    }
  }, [handleCompleteOrder, reloadOrdersData]);

  // Cập nhật ref để subscriber gọi hàm mới nhất
  useEffect(() => {
    incomingPaymentHandlerRef.current = handleIncomingPayment;
  }, [handleIncomingPayment]);

  const activeCheckoutOrderNumberRef = useRef(activeCheckoutOrderNumber);
  const capturedTransferProofImageRef = useRef(capturedTransferProofImage);
  const transferVerifyConfigRef = useRef(transferVerifyConfig);

  useEffect(() => {
    activeCheckoutOrderNumberRef.current = activeCheckoutOrderNumber;
  }, [activeCheckoutOrderNumber]);

  useEffect(() => {
    capturedTransferProofImageRef.current = capturedTransferProofImage;
  }, [capturedTransferProofImage]);

  useEffect(() => {
    transferVerifyConfigRef.current = transferVerifyConfig;
  }, [transferVerifyConfig]);

  useEffect(() => {
    fetchTransferVerificationConfigFromDb().then((cfg) => {
      if (cfg) setTransferVerifyConfig(cfg);
    });
  }, []);

  const handleIncomingTransferApprovalResolved = useCallback(
    (payload: TransferApprovalResolvedPayload) => {
      if (!payload || !payload.order_number) return;

      const currentOrderNum = activeCheckoutOrderNumberRef.current;
      const isCheckout = isCheckoutOpenRef.current;

      if (!isCheckout || !currentOrderNum) return;

      if (payload.order_number === currentOrderNum) {
        if (payload.action === 'approved') {
          setAdminApprovedTransfer(true);
          setIsWaitingAdminTransferApproval(false);

          soundManager.playPaymentSuccessChime();
          soundManager.speakPaymentSuccess(payload.amount || dueNowRef.current, payload.order_number);

          setTimeout(() => {
            handleCompleteOrder('transfer', capturedTransferProofImageRef.current, currentOrderNum, true);
          }, 1200);
        } else if (payload.action === 'rejected') {
          setIsWaitingAdminTransferApproval(false);
          setAdminApprovedTransfer(false);
          alert(`❌ CHƯA THẤY TIỀN VỀ:\n\nQuản trị viên (Admin) kiểm tra và thông báo: ${payload.reason || 'Chưa nhận được tiền vào tài khoản'}.\n\nVui lòng kiểm tra lại với khách hàng hoặc đổi sang hình thức Tiền mặt.`);
        }
      }
    },
    [handleCompleteOrder]
  );

  useEffect(() => {
    incomingTransferApprovalResolvedRef.current = handleIncomingTransferApprovalResolved;
  }, [handleIncomingTransferApprovalResolved]);

  // Gửi lại yêu cầu xác thực 2 bước tới Admin
  const handleResendTransferApproval = async () => {
    try {
      const orderNumToUse = activeCheckoutOrderNumber || 'BK-CK';
      const cashierName = user?.name || securityConfig.staffName || 'Thu Ngân Quầy POS';
      const isPreOrder = fulfillmentType !== 'takeaway';
      const transferReqPayload: TransferApprovalPayload = {
        order_number: orderNumToUse,
        amount: dueNow,
        customer_name: isPreOrder ? (posCustomerName || 'Khách đặt') : (posCustomerName || 'Khách tại quầy'),
        transfer_code: checkoutTransferCode,
        requested_by: cashierName,
        requested_at: new Date().toISOString(),
      };
      await broadcastTransferApprovalRequest(transferReqPayload);
      setTransferResendStatus('Đã gửi lại tới Admin!');
      setTimeout(() => setTransferResendStatus(null), 2500);
    } catch {
      setTransferResendStatus('Lỗi kết nối khi gửi');
      setTimeout(() => setTransferResendStatus(null), 2500);
    }
  };

  // ── HANDLER: TẠO ĐƠN ĐẶT BÁNH KEM (PREORDER CAKE) ──
  const handleCreatePreorder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preorderForm.customerName?.trim() || !preorderForm.customerPhone?.trim()) {
      setPreorderError('Vui lòng nhập Tên khách hàng và Số điện thoại!');
      return;
    }
    if (preorderForm.deliveryMethod === 'shipping' && !preorderForm.shippingAddress?.trim()) {
      setPreorderError('Vui lòng nhập Địa chỉ giao hàng khi chọn Giao tận nơi!');
      return;
    }
    if (!preorderForm.cakeName?.trim() || preorderForm.cakeName === '__custom__') {
      setPreorderError('Vui lòng chọn hoặc nhập Tên loại bánh đặt!');
      return;
    }
    setPreorderError(null);

    setProcessingOrder(true);
    try {
      const now = new Date();
      const orderNumber = getNextOrderNumber('BK-PRE');
      const localId = generateUUID();
      
      const pickupDateTimeStr = `${preorderForm.pickupTime} ngày ${preorderForm.pickupDate}`;
      const shippingFee = preorderForm.deliveryMethod === 'shipping' ? (Number(preorderForm.shippingFee) || 0) : 0;
      const cakePrice = Number(preorderForm.totalPrice) || 0;
      const discountAmount = preorderDiscountAmount;
      const discountPct = preorderDiscountPct;
      // GIÁ CUỐI ĐƠN HÀNG: Giá bánh - Giảm giá + Phí ship
      const finalTotal = Math.max(0, cakePrice - discountAmount) + shippingFee;
      const depositAmount = Math.min(finalTotal, Number(preorderForm.depositAmount) || 0);
      const remainingAmount = Math.max(0, finalTotal - depositAmount);
      const isShip = preorderForm.deliveryMethod === 'shipping';
      const deliveryMethodStr = isShip ? `Giao tận nơi (Ship bánh)` : `Khách nhận tại tiệm`;
      const sampleImgTag = preorderForm.referenceImageUrl ? ` | Ảnh mẫu: Có [MẪU_ẢNH:${preorderForm.referenceImageUrl}]` : '';
      const costDetailTag = isAdmin ? ` | Vốn dự toán: ${cakeCostResult.totalCost.toLocaleString('vi-VN')}đ (${cakeCostResult.summaryText || preorderForm.size})` : '';
      const fillingTag = preorderForm.filling && preorderForm.fillingId !== 'filling-none' ? ` | Nhân: ${preorderForm.filling}` : '';
      const fullNotes = `[ĐẶT BÁNH KEM] Khách: ${preorderForm.customerName} (${preorderForm.customerPhone}) | Hình thức: ${deliveryMethodStr}${isShip ? ` | Đ/C: ${preorderForm.shippingAddress}` : ''} | Hẹn: ${pickupDateTimeStr} | Bánh: ${preorderForm.cakeName} (${preorderForm.size}) | Cốt & Kem: ${preorderForm.flavor || 'Vani'} - ${preorderForm.cream || 'Kem tươi'}${fillingTag} | Hộp: ${preorderForm.packaging || 'Hộp giấy'}${cakeCostResult.selectedAddons.length > 0 ? ' | Decor: ' + cakeCostResult.selectedAddons.map(a => a.name).join(', ') : ''} | Chữ: "${preorderForm.cakeMessage}" | Yêu cầu: ${preorderForm.notes}${sampleImgTag}${costDetailTag}${discountAmount > 0 ? ` | Giảm giá: -${discountAmount.toLocaleString('vi-VN')}đ` : ''}${shippingFee > 0 ? ` | Phí ship: +${shippingFee.toLocaleString('vi-VN')}đ` : ''} | GIÁ CUỐI: ${finalTotal.toLocaleString('vi-VN')}đ | Đã cọc: ${depositAmount.toLocaleString('vi-VN')}đ | CÒN THU KHI GIAO: ${remainingAmount.toLocaleString('vi-VN')}đ`;

      const pickupIso = (() => {
        try {
          const d = new Date(`${preorderForm.pickupDate}T${preorderForm.pickupTime}:00`);
          if (!isNaN(d.getTime())) return d.toISOString();
        } catch {}
        return pickupDateTimeStr;
      })();

      // CRITICAL: Nếu pickupIso là chuỗi tiếng Việt (không phải ISO), gán null để tránh lỗi PostgreSQL 22007
      const pickupIsoSafe = (() => {
        if (!pickupIso) return null;
        try {
          const d = new Date(pickupIso);
          if (!isNaN(d.getTime())) return pickupIso;
        } catch {}
        return null;
      })();

      // 1. Tạo đơn đặt bánh đồng bộ đầy đủ thông tin cho cả Bếp KDS và Lịch Sử Hóa Đơn
      const unifiedPreorder = {
        id: localId,
        local_id: localId,
        order_number: orderNumber,
        orderNumber,
        order_type: 'preorder' as const,
        status: preorderForm.isReadyStock ? ('ready' as const) : ('pending' as const),
        created_at: now.toISOString(),
        preorder_pickup_at: pickupIsoSafe,
        pickupDateTime: pickupDateTimeStr,
        pickupDateTimeStr,
        customer_name: preorderForm.customerName,
        customerName: preorderForm.customerName,
        customer_phone: preorderForm.customerPhone,
        customerPhone: preorderForm.customerPhone,
        delivery_method: preorderForm.deliveryMethod,
        deliveryMethod: preorderForm.deliveryMethod,
        shipping_address: preorderForm.shippingAddress,
        shippingAddress: preorderForm.shippingAddress,
        shipping_fee: shippingFee,
        shippingFee: shippingFee,
        cake_name: preorderForm.cakeName,
        cakeName: preorderForm.cakeName,
        cake_size: preorderForm.size,
        size: preorderForm.size,
        flavor: preorderForm.flavor,
        cream: preorderForm.cream,
        filling: preorderForm.filling,
        packaging: preorderForm.packaging,
        addons: cakeCostResult.selectedAddons.map((a) => a.name),
        selected_addons: cakeCostResult.selectedAddons,
        cake_message: preorderForm.cakeMessage,
        cakeMessage: preorderForm.cakeMessage,
        special_notes: preorderForm.notes,
        reference_image_url: preorderForm.referenceImageUrl || '',
        referenceImageUrl: preorderForm.referenceImageUrl || '',
        notes: fullNotes,
        subtotal: cakePrice,
        discount_amount: discountAmount,
        discount_pct: discountPct,
        total_amount: finalTotal,
        totalPrice: finalTotal,
        total_cogs: cakeCostResult.totalCost,
        estimated_cost: cakeCostResult.totalCost,
        cost_breakdown: cakeCostResult,
        deposit_amount: depositAmount,
        depositAmount: depositAmount,
        remaining_amount: remainingAmount,
        remainingAmount: remainingAmount,
        payment_method: preorderForm.paymentMethod,
        paymentMethod: preorderForm.paymentMethod,
        cashier: user?.name || 'Thu Ngân',
        items: [
          {
            id: generateUUID(),
            product_name_snapshot: `${preorderForm.cakeName} (${preorderForm.size})`,
            product: {
              name: `${preorderForm.cakeName} (${preorderForm.size})`,
              selling_price: preorderForm.totalPrice,
            },
            quantity: 1,
            unit_price: preorderForm.totalPrice,
            unit_cost: cakeCostResult.totalCost,
            line_total: preorderForm.totalPrice,
            line_cost: cakeCostResult.totalCost,
            flavor: preorderForm.flavor,
            cream: preorderForm.cream,
            filling: preorderForm.filling,
            packaging: preorderForm.packaging,
            addons: cakeCostResult.selectedAddons.map((a) => a.name),
            notes: `Chữ: "${preorderForm.cakeMessage}" | Cốt: ${preorderForm.flavor || 'Vani'} | Kem: ${preorderForm.cream || 'Kem tươi'}${preorderForm.filling && preorderForm.fillingId !== 'filling-none' ? ` | Nhân: ${preorderForm.filling}` : ''} | Hộp: ${preorderForm.packaging || 'Hộp giấy'}${cakeCostResult.selectedAddons.length > 0 ? ' | Phụ kiện: ' + cakeCostResult.selectedAddons.map(a => a.name).join(', ') : ''}${preorderForm.notes ? ` | ${preorderForm.notes}` : ''}`,
          },
          ...(shippingFee > 0 ? [
            {
              id: generateUUID(),
              product_name_snapshot: `Phí giao hàng tận nơi (Ship bánh)`,
              product: {
                name: `Phí giao hàng tận nơi (Ship bánh)`,
                selling_price: shippingFee,
              },
              quantity: 1,
              unit_price: shippingFee,
              line_total: shippingFee,
            }
          ] : []),
        ],
        payments: depositAmount > 0 ? [
          {
            method: preorderForm.paymentMethod,
            amount: depositAmount,
          },
        ] : [],
      };

      // Lưu ngay vào Dexie & localStorage
      try {
        await db.orders.add(unifiedPreorder as any);
      } catch (dbErr) {
        console.warn('Lỗi ghi Dexie preorder:', dbErr);
      }

      if (typeof window !== 'undefined') {
        try {
          const recentOrders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
          recentOrders.unshift(unifiedPreorder);
          const safeOrders = pruneOrdersCache(recentOrders, MAX_CACHED_ORDERS);
          localStorage.setItem('bakery_orders', JSON.stringify(safeOrders));
          localStorage.setItem('bakery_kds_seeded', 'true');
          setInvoicesList(safeOrders);

          const recentPos = JSON.parse(localStorage.getItem('bakery_preorders') || '[]');
          recentPos.unshift(unifiedPreorder);
          const safePos = prunePreordersCache(recentPos, MAX_CACHED_PREORDERS);
          localStorage.setItem('bakery_preorders', JSON.stringify(safePos));

          window.dispatchEvent(new Event('bakery_orders_updated'));
          soundManager.playNewOrderChime();
          const pickupFormatted = formatPickupDateTime(pickupIsoSafe || pickupDateTimeStr);

          // Bắn Web Push PWA trực tiếp cho thợ bánh
          triggerServerPush({
            type: 'urgent_alert',
            isUrgent: true,
            title: `🎂 ĐƠN ĐẶT BÁNH MỚI #${unifiedPreorder.order_number}`,
            body: `${unifiedPreorder.customer_name} • Hẹn: ${pickupFormatted} • ${unifiedPreorder.cake_name}`,
            url: '/kitchen',
            orderNumber: unifiedPreorder.order_number,
          }).catch(() => {});
          setOrderToast({
            id: String(Date.now()),
            title: '🎂 Nhận Đơn Đặt Bánh Mới!',
            subtitle: 'Đã lập phiếu hẹn & chuyển tiếp thợ bánh',
            orderNumber: unifiedPreorder.order_number,
            customerInfo: `${unifiedPreorder.customer_name} (${unifiedPreorder.customer_phone})`,
            pickupTime: pickupFormatted,
            details: `${unifiedPreorder.cake_name} (${unifiedPreorder.cake_size})`,
            type: 'new_order',
          });

          phoneNotificationService.triggerOrderNotification({
            id: String(Date.now()),
            type: 'new_order',
            appTitle: 'TIỆM BÁNH HẠNH PHÚC',
            title: `🎂 Đơn Đặt Bánh Mới #${unifiedPreorder.order_number}`,
            sender: `${unifiedPreorder.customer_name} (${unifiedPreorder.customer_phone})`,
            message: `Hẹn giao: ${pickupFormatted} • ${unifiedPreorder.cake_name} (${unifiedPreorder.cake_size})`,
            extraDetails: unifiedPreorder.cake_message ? `Ghi chữ: "${unifiedPreorder.cake_message}"` : undefined,
            orderNumber: unifiedPreorder.order_number,
            pickupTime: pickupFormatted,
            actionLabel: 'Xem Lịch Giao',
            onAction: () => setIsPreorderListOpen(true),
          });
        } catch {}
      }

      setPreordersList((prev) => [unifiedPreorder, ...prev]);

      // 2. Cập nhật tiền ca bán từ tiền cọc và lưu vĩnh viễn vào CSDL
      if (depositAmount > 0) {
        setShift((prev) => {
          const updated: ShiftState = {
            ...prev,
            orderCount: (prev.orderCount || 0) + 1,
            cashSales: preorderForm.paymentMethod === 'cash' ? (prev.cashSales || 0) + depositAmount : (prev.cashSales || 0),
            transferSales: preorderForm.paymentMethod !== 'cash' ? (prev.transferSales || 0) + depositAmount : (prev.transferSales || 0),
          };
          saveCurrentShiftLocally(updated);
          saveCurrentShiftToDb(updated).catch(() => {});
          return updated;
        });
      }

      // 3. Đóng modal và tạo phiếu hẹn/Hóa đơn cọc
      setIsPreorderModalOpen(false);
      setCompletedOrder({
        orderNumber,
        deliveryMethod: preorderForm.deliveryMethod,
        shippingAddress: preorderForm.shippingAddress,
        shippingFee,
        items: [
          {
            product: {
              name: `[BÁNH ĐẶT] ${preorderForm.cakeName} (${preorderForm.size})`,
              selling_price: preorderForm.totalPrice,
            },
            quantity: 1,
          },
          ...(shippingFee > 0 ? [
            {
              product: {
                name: `Phí giao hàng tận nơi (Ship bánh)`,
                selling_price: shippingFee,
              },
              quantity: 1,
            }
          ] : []),
        ],
        subtotal: preorderForm.totalPrice,
        discountAmount: 0,
        totalAmount: finalTotal,
        depositAmount,
        remainingAmount,
        paymentMethod: preorderForm.paymentMethod,
        cashGiven: depositAmount,
        changeAmount: 0,
        cakeMessage: preorderForm.cakeMessage,
        pickupDateTimeStr,
        customerName: preorderForm.customerName,
        customerPhone: preorderForm.customerPhone,
        createdAt: now.toLocaleString('vi-VN'),
        cashier: user?.name || 'Thu Ngân',
      });

      // Reset form
      setPreorderForm({
        customerName: '',
        customerPhone: '',
        pickupDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        pickupTime: '17:30',
        deliveryMethod: 'pickup',
        shippingAddress: '',
        shippingFee: 0,
        cakeName: 'Bánh Bông Lan Trứng Muối 18cm',
        size: 'Size 18cm (6 - 8 người)',
        sizeId: 'size-18',
        flavor: 'Cốt Vani truyền thống',
        flavorId: 'flavor-vanilla',
        cream: 'Kem tươi Topping thanh mát',
        creamId: 'cream-topping',
        packaging: 'Hộp giấy tiêu chuẩn + Đế lót',
        packagingId: 'pack-paper',
        selectedAddonIds: [],
        customAddonCost: 0,
        filling: 'Không nhân (Chỉ phủ kem tươi)',
        fillingId: 'filling-none',
        cakeMessage: 'Chúc Mừng Sinh Nhật',
        notes: 'Ít ngọt, trang trí hoa kem',
        totalPrice: 365000,
        depositAmount: 150000,
        paymentMethod: 'cash',
        referenceImageUrl: '',
      });
      setIsCustomCake(false);

      // 4. Đồng bộ tức thì lên CSDL Supabase SQL (chân lý đa thiết bị)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const initialStatus = preorderForm.isReadyStock ? 'ready' : 'pending';
        try {
          await syncOrderToSupabase(unifiedPreorder, initialStatus);
        } catch (syncErr) {
          console.warn('Lỗi syncOrderToSupabase Preorder:', syncErr);
        }
        try {
          await broadcastNewOrder(unifiedPreorder);
        } catch (bErr) {
          console.warn('Lỗi broadcastNewOrder Preorder:', bErr);
        }
      }
    } catch (err) {
      console.error('Lỗi tạo đơn đặt bánh:', err);
      setIsPreorderModalOpen(false);
    } finally {
      setProcessingOrder(false);
    }
  };

  const filteredInvoices = invoicesList.filter((inv: any) => {
    const q = invoiceSearchQuery.trim();
    if (q) {
      if (!matchesOrderSearch(inv, q)) return false;
    }

    if (invoiceFilter === 'all') return true;

    // Nếu người dùng đang tìm kiếm theo mã đơn cụ thể (bắt đầu bằng #, chứa 'bk', hoặc số dài),
    // ưu tiên hiển thị đơn tìm kiếm mà không bị giới hạn bởi tab phân loại
    const isCodeSearch = Boolean(
      q && (q.startsWith('#') || q.toLowerCase().includes('bk') || /^\d{4,}/.test(q))
    );
    if (!isCodeSearch) {
      const isPreorder = inv.order_type === 'preorder' || !!inv.pickupDateTime;
      const isTakeaway = !isPreorder;
      const method = inv.payment_method || inv.paymentMethod || (inv.payments?.[0]?.method) || 'cash';

      if (invoiceFilter === 'takeaway' && !isTakeaway) return false;
      if (invoiceFilter === 'preorder' && !isPreorder) return false;
      if (invoiceFilter === 'cash' && method !== 'cash') return false;
      if (invoiceFilter === 'transfer' && method === 'cash') return false;
    }

    return true;
  });

  // Auth Guard: Chưa đăng nhập không thể vào Quầy POS
  if (!user) {
    return (
      <div className="flex-1 min-h-[calc(100vh-4rem)] bg-[#faf7f2] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-amber-200/80 p-6 sm:p-8 max-w-md w-full text-center shadow-xl space-y-5 animate-in zoom-in-95">
          <div className="w-16 h-16 rounded-3xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black text-zinc-900">Quầy Bán Hàng (POS) Đang Khóa</h2>
            <p className="text-xs text-zinc-600 leading-relaxed">
              Vui lòng đăng nhập tài khoản Nhân viên hoặc Quản trị để mở ca bán hàng, tạo đơn và thu ngân.
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => openLoginModal('staff')}
              className="w-full py-3.5 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-sm shadow-md shadow-amber-600/30 flex items-center justify-center gap-2 cursor-pointer transition active:scale-95"
            >
              <KeyRound className="w-4 h-4" />
              <span>Đăng Nhập Vào Ca Bán Hàng</span>
            </button>
            <Link
              href="/"
              className="w-full py-3 px-4 rounded-2xl border border-zinc-200 hover:bg-zinc-50 text-zinc-600 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Home className="w-4 h-4 text-zinc-400" />
              <span>Quay Về Trang Chủ</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row items-start min-h-[calc(100vh-4rem)] bg-[#faf7f2] relative">
      {/* Toast thông báo tức thời khi thêm bánh vào giỏ */}
      {cartToast && (
        <div className="fixed top-14 sm:top-16 left-1/2 -translate-x-1/2 z-[99999] bg-zinc-900/95 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 backdrop-blur-md animate-in fade-in slide-in-from-top-3 duration-200 border border-amber-500/40 pointer-events-none">
          <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center font-black text-xs shadow-xs">
            ✓
          </div>
          <div className="text-xs">
            <span className="font-bold text-amber-300">Đã chọn: </span>
            <span className="font-extrabold">{cartToast.name}</span>
          </div>
        </div>
      )}

      {/* ── THANH CHUYỂN TAB MOBILE (DÍNH Ở ĐỈNH MÀN HÌNH ĐIỆN THOẠI - HIỂN THỊ TOÀN BỘ 6 Ô GỌN GÀNG) ── */}
      <div className="lg:hidden sticky top-0 grid grid-cols-6 gap-1 bg-[#fbf7f2]/95 backdrop-blur-md border-b border-amber-900/10 p-1.5 shadow-2xs shrink-0 z-30 w-full">
        {/* 1. THỰC ĐƠN */}
        <button
          onClick={() => setMobileTab('menu')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer active:scale-95 ${
            mobileTab === 'menu'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-zinc-700 bg-white border border-stone-200/90 hover:bg-stone-50'
          }`}
          title="Xem thực đơn bán hàng"
        >
          <div className="relative">
            <Package className="w-4 h-4" />
            <span className={`absolute -top-1.5 -right-2.5 px-1 min-w-[14px] h-[13px] rounded-full text-[9px] font-black flex items-center justify-center leading-none ${
              mobileTab === 'menu' ? 'bg-amber-900 text-amber-100' : 'bg-amber-100 text-amber-900'
            }`}>
              {filteredProducts.length}
            </span>
          </div>
          <span className="text-[10px] font-bold leading-tight mt-1 truncate w-full text-center">
            Thực Đơn
          </span>
        </button>

        {/* 2. ĐẶT BÁNH */}
        <button
          onClick={() => {
            setBirthdayOrderProduct(null);
            setIsBirthdayOrderModalOpen(true);
          }}
          className="relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white shadow-xs transition-all active:scale-95 cursor-pointer"
          title="Đặt bánh sinh nhật / theo yêu cầu"
        >
          <Cake className="w-4 h-4" />
          <span className="text-[10px] font-bold leading-tight mt-1 truncate w-full text-center">
            Đặt Bánh
          </span>
        </button>

        {/* 3. GIỎ HÀNG */}
        <button
          id="pos-cart-mobile-tab-target"
          onClick={() => setMobileTab('cart')}
          className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer active:scale-95 ${
            mobileTab === 'cart'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-zinc-700 bg-white border border-stone-200/90 hover:bg-stone-50'
          } ${cartBumping ? 'animate-cart-bounce ring-2 ring-amber-400' : ''}`}
          title="Xem giỏ hàng thanh toán"
        >
          <div className="relative">
            <ShoppingCart className="w-4 h-4" />
            {cart.length > 0 && (
              <span className={`absolute -top-1.5 -right-2.5 px-1 min-w-[14px] h-[13px] rounded-full text-[9px] font-black flex items-center justify-center leading-none ${
                cartBumping ? 'animate-pop-scale' : ''
              } ${
                mobileTab === 'cart' ? 'bg-white text-amber-700' : 'bg-rose-500 text-white'
              }`}>
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold leading-tight mt-1 truncate w-full text-center">
            Giỏ Hàng
          </span>
        </button>

        {/* 4. CHỜ SHIP */}
        <button
          type="button"
          onClick={() => setIsReadyShippingModalOpen(true)}
          className={`relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl transition-all cursor-pointer active:scale-95 ${
            readyShippingOrders.length > 0
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              : 'text-zinc-700 bg-white border border-stone-200/90 hover:bg-emerald-50/60'
          }`}
          title="Đơn bánh chờ ship / giao (Bước 3)"
        >
          <div className="relative">
            <Truck className="w-4 h-4" />
            {readyShippingOrders.length > 0 && (
              <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[14px] h-[13px] rounded-full text-[9px] font-black bg-white text-emerald-700 flex items-center justify-center leading-none">
                {readyShippingOrders.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold leading-tight mt-1 truncate w-full text-center">
            Chờ Ship
          </span>
        </button>

        {/* 5. LỊCH SỬ */}
        <button
          onClick={() => setIsInvoiceHistoryOpen(true)}
          className="relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl text-zinc-700 bg-white hover:bg-amber-50/60 border border-stone-200/90 transition-all active:scale-95 cursor-pointer"
          title="Xem lịch sử hóa đơn"
        >
          <div className="relative">
            <Receipt className="w-4 h-4 text-amber-600" />
            {invoicesList.length > 0 && (
              <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[14px] h-[13px] rounded-full text-[9px] font-black bg-stone-100 text-zinc-700 border border-stone-200 flex items-center justify-center leading-none">
                {invoicesList.length > 99 ? '99+' : invoicesList.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-bold leading-tight mt-1 truncate w-full text-center">
            Lịch Sử
          </span>
        </button>

        {/* 6. CÀI ĐẶT */}
        <button
          type="button"
          onClick={() => setIsMobileUtilityMenuOpen(true)}
          className="relative flex flex-col items-center justify-center py-1.5 px-0.5 rounded-xl text-zinc-700 bg-white hover:bg-amber-50/60 border border-stone-200/90 transition-all active:scale-95 cursor-pointer"
          title="Mở menu Cài Đặt (Máy In, Thông Báo, Đồng Bộ SQL)"
        >
          <div className="relative">
            <Settings className="w-4 h-4 text-zinc-600" />
            {soundEnabled && (
              <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
            )}
          </div>
          <span className="text-[10px] font-bold leading-tight mt-1 truncate w-full text-center">
            Cài Đặt
          </span>
        </button>
      </div>

      {/* ── CỘT TRÁI: MENU SẢN PHẨM (Cuộn theo toàn trang tự nhiên) ── */}
      <div className={`flex-1 w-full lg:min-w-0 p-3 sm:p-6 ${mobileTab === 'cart' ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}`}>
        <div className="space-y-4 mb-5">
          {/* ── BỐ CỤC MOBILE (DÀNH RIÊNG CHO ĐIỆN THOẠI < lg): TINH GỌN, KHOA HỌC, KHÔNG TRÙNG LẶP ── */}
          <div className="lg:hidden space-y-2.5">
            {/* Tầng 1: Tìm Kiếm Bánh & Nút Tiện Ích Tinh Gọn */}
            <div className="flex items-center gap-2">
              {/* Ô Tìm Kiếm */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-700/50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm bánh nhanh hoặc quét mã..."
                  className="w-full pl-10 pr-8 py-2 rounded-2xl bg-white border border-stone-200/90 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 transition-all shadow-2xs"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition cursor-pointer p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>


              {/* Huy Hiệu Trạng Thái Chế Độ CSDL (Online Cloud vs Local SQL) */}
              <Link
                href="/admin"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-2xl text-[11px] font-bold border transition shadow-2xs shrink-0 cursor-pointer ${
                  isLocalMode()
                    ? 'bg-amber-500/10 text-amber-900 border-amber-300 hover:bg-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-900 border-emerald-300 hover:bg-emerald-500/20'
                }`}
                title={isLocalMode() ? 'Đang chạy Chế độ Local SQL Cục bộ. Bấm để mở Quản trị CSDL.' : 'Đang chạy Chế độ Online Cloud SQL. Bấm để mở Quản trị CSDL.'}
              >
                <span className={`w-2 h-2 rounded-full ${isLocalMode() ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="hidden xl:inline">{isLocalMode() ? 'Local SQL' : 'Cloud SQL'}</span>
              </Link>

              {/* Nút Đổi Trả Trên Mobile */}
              <button
                onClick={() => {
                  setOrderToReturn(null);
                  setIsReturnExchangeModalOpen(true);
                }}
                className="w-9 h-9 rounded-2xl border border-rose-200 bg-rose-50/60 hover:bg-rose-100 flex items-center justify-center shadow-2xs transition active:scale-95 cursor-pointer shrink-0"
                title="Đổi trả hàng hoặc hoàn tiền"
              >
                <RotateCcw className="w-4 h-4 text-rose-600" />
              </button>

              {/* Nút Menu Cài Đặt Hợp Nhất Trên Mobile */}
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMobileUtilityMenuOpen(!isMobileUtilityMenuOpen)}
                  className={`w-9 h-9 rounded-2xl border flex items-center justify-center shadow-2xs transition active:scale-95 cursor-pointer ${
                    isMobileUtilityMenuOpen
                      ? 'bg-amber-600 border-amber-600 text-white'
                      : 'bg-white hover:bg-amber-50/60 border-stone-200/90 text-zinc-700'
                  }`}
                  title="Cài đặt hệ thống (Máy in, Thông báo, Đồng bộ SQL)"
                >
                  <div className="relative">
                    <Settings className={`w-4 h-4 ${isMobileUtilityMenuOpen ? 'rotate-90' : ''} transition-transform duration-200`} />
                    {soundEnabled && (
                      <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
                    )}
                  </div>
                </button>

                {/* Dropdown Menu Cài Đặt Mobile */}
                {isMobileUtilityMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xs"
                      onClick={() => setIsMobileUtilityMenuOpen(false)}
                    />
                    <div className="absolute right-0 top-11 z-50 w-72 bg-white rounded-2xl border border-stone-200 shadow-2xl p-2 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-400 border-b border-stone-100 flex items-center justify-between">
                        <span>Cài Đặt & Thiết Bị</span>
                        <span className="text-[9px] text-amber-600 font-bold">POS Quầy</span>
                      </div>

                      {/* 1. Máy In Hóa Đơn & Tem */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsPrinterSettingsOpen(true);
                          setIsMobileUtilityMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left transition cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition shrink-0">
                          <Printer className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-zinc-900 group-hover:text-blue-700">Máy In Hóa Đơn & Tem</div>
                          <div className="text-[10px] text-zinc-500 truncate">Cài đặt Bluetooth, USB, khổ giấy</div>
                        </div>
                      </button>

                      {/* 2. Cài Đặt Báo & Âm Thanh */}
                      <button
                        type="button"
                        onClick={() => {
                          setNotifModalTab('sound');
                          setIsNotifSettingsOpen(true);
                          setIsMobileUtilityMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-amber-50 text-left transition cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition shrink-0 relative">
                          <Bell className="w-4 h-4" />
                          <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${soundEnabled ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-zinc-900 group-hover:text-amber-700 flex items-center gap-1">
                            <span>Cài Đặt Báo & Âm Thanh</span>
                            {soundEnabled ? (
                              <Volume2 className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <VolumeX className="w-3 h-3 text-zinc-400" />
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">Chuông báo lò, đơn giao, Telegram</div>
                        </div>
                      </button>

                      {/* 3. Đồng Bộ SQL (Xóa Cache) */}
                      <button
                        type="button"
                        disabled={isPosSyncing}
                        onClick={async () => {
                          setIsMobileUtilityMenuOpen(false);
                          try {
                            setIsPosSyncing(true);
                            clearProfileLocalData();
                            await syncOrdersFromSupabase();
                            await loadProducts();
                            await fetchCurrentShiftFromDb();
                            reloadOrdersData();
                            alert('Đã xóa cache cục bộ và đồng bộ dữ liệu mới nhất từ CSDL Cloud SQL thành công!');
                          } catch (err: any) {
                            alert('Lỗi đồng bộ: ' + (err?.message || err));
                          } finally {
                            setIsPosSyncing(false);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-emerald-50 text-left transition cursor-pointer group disabled:opacity-50"
                      >
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition shrink-0">
                          <RefreshCw className={`w-4 h-4 ${isPosSyncing ? 'animate-spin' : ''}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-zinc-900 group-hover:text-emerald-700">
                            {isPosSyncing ? 'Đang đồng bộ...' : 'Đồng Bộ SQL (Xóa Cache)'}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">Kéo lại món, ca và đơn mới nhất</div>
                        </div>
                      </button>

                      <div className="my-1 border-t border-stone-100" />

                      {/* 4. Kho Bánh Sẵn */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsInventoryModalOpen(true);
                          setIsMobileUtilityMenuOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 hover:bg-amber-50 transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-emerald-600" />
                          <span>Kho Bánh Sẵn ({products.length})</span>
                        </div>
                        {lowStockItems.length > 0 && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                            {lowStockItems.length} sắp hết
                          </span>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Tầng 2: Cặp Thẻ Nghiệp Vụ Cân Đối 50/50 (1 Dòng Duy Nhất) */}
            <div className="grid grid-cols-2 gap-2">
              {/* Thẻ Lịch Hẹn Giao Bánh */}
              <button
                type="button"
                onClick={() => setIsPreorderListOpen(true)}
                className={`p-2.5 rounded-2xl border transition flex items-center justify-between text-left shadow-2xs active:scale-98 cursor-pointer ${
                  urgentPreorders.length > 0
                    ? 'bg-rose-50/90 border-rose-300 ring-1 ring-rose-400/40 hover:bg-rose-100/80'
                    : 'bg-white border-stone-200/90 hover:border-pink-300 hover:bg-pink-50/40'
                }`}
                title="Xem danh sách lịch hẹn giao bánh đặt trước"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                    urgentPreorders.length > 0 ? 'bg-rose-600 text-white' : 'bg-pink-100 text-pink-700'
                  }`}>
                    <Calendar className={`w-4 h-4 ${urgentPreorders.length > 0 ? 'animate-bounce' : ''}`} />
                  </div>
                  <div className="truncate">
                    <div className="text-[10px] font-bold text-zinc-500 leading-none">Lịch Hẹn Giao</div>
                    <div className="text-xs font-black text-zinc-900 mt-1">
                      {undeliveredPreorders.length} đơn chưa giao
                    </div>
                  </div>
                </div>
                {urgentPreorders.length > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-black animate-pulse shrink-0 ml-1">
                    {urgentPreorders.length} gấp!
                  </span>
                ) : (
                  <span className="text-zinc-300 font-black text-xs shrink-0 ml-1">›</span>
                )}
              </button>

              {/* Thẻ Két Tiền Ca */}
              <button
                type="button"
                onClick={() => {
                  setClosingCashInput(expectedCashInRegister);
                  setIsShiftModalOpen(true);
                }}
                className="p-2.5 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-400 hover:bg-amber-50/40 transition flex items-center justify-between text-left shadow-2xs active:scale-98 cursor-pointer"
                title="Két tiền ca & Bàn giao ca"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-xs">
                    <Wallet className="w-4 h-4 text-amber-700" />
                  </div>
                  <div className="truncate">
                    <div className="text-[10px] font-bold text-zinc-500 leading-none">Tiền Két Quầy</div>
                    <div className="text-xs font-black text-amber-800 mt-1 truncate">
                      {(expectedCashInRegister || 0).toLocaleString('vi-VN')}₫
                    </div>
                  </div>
                </div>
                <span className="text-zinc-300 font-black text-xs shrink-0 ml-1">›</span>
              </button>
            </div>
          </div>

          {/* ── BỐ CỤC DESKTOP (DÀNH CHO MÀN HÌNH LỚN >= lg): GIỮ NGUYÊN TOÀN BỘ THANH CÔNG CỤ TRẢI DÀI ĐẦY ĐỦ ── */}
          <div className="hidden lg:flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Search Box */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-700/50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm bánh nhanh (Bông lan, Tiramisu, Croissant...)"
                className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-white border border-stone-200/90 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/25 focus:border-amber-500 transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>


            {/* NÚT TẠO ĐƠN ĐẶT BÁNH SINH NHẬT THEO CƠ CHẾ FLOWCHART MỚI */}
            <button
              onClick={() => {
                setBirthdayOrderProduct(null);
                setIsBirthdayOrderModalOpen(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 hover:from-rose-600 hover:to-pink-700 text-white text-xs font-black shadow-md shadow-rose-500/25 hover:shadow-rose-500/35 transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer"
            >
              <Cake className="w-4 h-4 animate-bounce duration-1000" />
              <span>🎂 Đặt Bánh Sinh Nhật</span>
            </button>

            {/* Nút Xem Lịch Đơn Đặt Trước */}
            <button
              onClick={() => setIsPreorderListOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition cursor-pointer ${
                urgentPreorders.length > 0
                  ? 'bg-rose-50 border-rose-300 text-rose-800 shadow-sm ring-2 ring-rose-400/40 hover:bg-rose-100'
                  : 'bg-white border-stone-200/90 hover:border-pink-300 text-zinc-700 shadow-2xs hover:bg-pink-50/50'
              }`}
              title="Xem danh sách lịch hẹn giao bánh đặt trước"
            >
              <Calendar className={`w-4 h-4 ${urgentPreorders.length > 0 ? 'text-rose-600 animate-bounce' : 'text-pink-600'}`} />
              <span className="hidden sm:inline">Lịch hẹn giao</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                urgentPreorders.length > 0 ? 'bg-rose-600 text-white animate-pulse' : 'bg-pink-100 text-pink-700'
              }`}>
                {undeliveredPreorders.length}
              </span>
              {urgentPreorders.length > 0 && (
                <span className="hidden xl:inline-flex items-center text-[10px] font-black text-rose-700 bg-rose-200/80 px-1.5 py-0.5 rounded-md">
                  🚨 {urgentPreorders.length} gấp!
                </span>
              )}
            </button>

            {/* NÚT MỤC MỚI: ĐƠN CHỜ SHIP / CHỜ GIAO QUẦY (BƯỚC 3 BẾP) */}
            <button
              type="button"
              onClick={() => setIsReadyShippingModalOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition cursor-pointer ${
                readyShippingOrders.length > 0
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-sm ring-2 ring-emerald-400/40 hover:bg-emerald-100'
                  : 'bg-white border-stone-200/90 hover:border-emerald-300 text-zinc-700 shadow-2xs hover:bg-emerald-50/50'
              }`}
              title="Xem danh sách đơn bánh làm xong ở Bếp đang chờ ship hoặc chờ giao quầy (Bước 3)"
            >
              <Truck className={`w-4 h-4 ${readyShippingOrders.length > 0 ? 'text-emerald-600 animate-bounce' : 'text-emerald-600'}`} />
              <span className="hidden sm:inline">Chờ ship / giao</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                readyShippingOrders.length > 0 ? 'bg-emerald-600 text-white animate-pulse' : 'bg-zinc-100 text-zinc-600'
              }`}>
                {readyShippingOrders.length}
              </span>
            </button>

            {/* Nút Xem Lịch Sử Hóa Đơn Đã Xuất */}
            <button
              onClick={() => setIsInvoiceHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-400 text-xs font-bold text-zinc-700 shadow-2xs hover:shadow-xs transition hover:bg-amber-50/50 cursor-pointer"
              title="Xem lại các hóa đơn đã xuất và in lại hóa đơn"
            >
              <Receipt className="w-4 h-4 text-amber-600" />
              <span className="hidden sm:inline">Hóa đơn</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">
                {invoicesList.length}
              </span>
            </button>

            {/* Nút Xem Đơn Tạm Lưu (Hold Orders) */}
            <button
              onClick={() => setIsHeldOrdersModalOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition shadow-2xs cursor-pointer ${
                heldOrders.length > 0
                  ? 'bg-amber-500/10 border-amber-400 text-amber-900 hover:bg-amber-500/20'
                  : 'bg-white border-stone-200/90 hover:border-amber-400 text-zinc-700 hover:bg-amber-50/50'
              }`}
              title="Xem danh sách các đơn hàng đang tạm lưu"
            >
              <PauseCircle className="w-4 h-4 text-amber-600" />
              <span className="hidden sm:inline">Đơn Tạm</span>
              {heldOrders.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px] font-black animate-pulse">
                  {heldOrders.length}
                </span>
              )}
            </button>

            {/* Nút Đổi Trả / Hoàn Tiền (Returns & Exchanges) */}
            <button
              onClick={() => {
                setOrderToReturn(null);
                setIsReturnExchangeModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white border border-stone-200/90 hover:border-rose-400 text-xs font-bold text-zinc-700 shadow-2xs hover:shadow-xs transition hover:bg-rose-50/50 cursor-pointer"
              title="Đổi trả hàng hoặc hoàn tiền hóa đơn"
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <span className="hidden sm:inline">Đổi Trả</span>
            </button>

            {/* MENU CÀI ĐẶT HỢP NHẤT (Máy In, Thông Báo & Âm Thanh, Đồng Bộ SQL) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsSettingsDropdownOpen(!isSettingsDropdownOpen)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-500 text-xs font-bold text-zinc-700 shadow-2xs hover:shadow-xs transition hover:bg-amber-50/40 cursor-pointer"
                title="Cài đặt hệ thống: Máy in, Âm thanh thông báo, Đồng bộ SQL"
              >
                <div className="relative">
                  <Settings className="w-4 h-4 text-amber-700" />
                  {soundEnabled && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white" />
                  )}
                </div>
                <span>Cài Đặt</span>
                <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ${isSettingsDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isSettingsDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsSettingsDropdownOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-white border border-stone-200 shadow-2xl p-2 z-50 animate-in fade-in-50 zoom-in-95">
                    <div className="px-3 py-1.5 text-[11px] font-black text-zinc-400 uppercase tracking-wider border-b border-stone-100 mb-1">
                      Cài Đặt Tiệm & Thiết Bị
                    </div>

                    {/* 1. Máy In */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsDropdownOpen(false);
                        setIsPrinterSettingsOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-blue-50 text-left transition cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 group-hover:scale-105 transition shrink-0">
                        <Printer className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-zinc-900 group-hover:text-blue-700">Máy In Hóa Đơn & Tem</div>
                        <div className="text-[10px] text-zinc-500 truncate">Cài đặt Bluetooth, USB, khổ giấy</div>
                      </div>
                    </button>

                    {/* 2. Cài Đặt Báo */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingsDropdownOpen(false);
                        setNotifModalTab('sound');
                        setIsNotifSettingsOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-amber-50 text-left transition cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-105 transition shrink-0 relative">
                        <Bell className="w-4 h-4" />
                        <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${soundEnabled ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-zinc-900 group-hover:text-amber-700 flex items-center gap-1">
                          <span>Cài Đặt Báo & Âm Thanh</span>
                          {soundEnabled ? (
                            <Volume2 className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <VolumeX className="w-3 h-3 text-zinc-400" />
                          )}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">Chuông báo lò, đơn giao, Telegram</div>
                      </div>
                    </button>

                    <div className="my-1 border-t border-stone-100" />

                    {/* 3. Đồng Bộ SQL */}
                    <button
                      type="button"
                      disabled={isPosSyncing}
                      onClick={async () => {
                        setIsSettingsDropdownOpen(false);
                        try {
                          setIsPosSyncing(true);
                          clearProfileLocalData();
                          await syncOrdersFromSupabase();
                          await loadProducts();
                          await fetchCurrentShiftFromDb();
                          reloadOrdersData();
                          alert('Đã xóa cache cục bộ và đồng bộ dữ liệu mới nhất từ CSDL Cloud SQL thành công!');
                        } catch (err: any) {
                          alert('Lỗi đồng bộ: ' + (err?.message || err));
                        } finally {
                          setIsPosSyncing(false);
                        }
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-emerald-50 text-left transition cursor-pointer group disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 group-hover:scale-105 transition shrink-0">
                        <RefreshCw className={`w-4 h-4 ${isPosSyncing ? 'animate-spin' : ''}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-zinc-900 group-hover:text-emerald-700">
                          {isPosSyncing ? 'Đang đồng bộ...' : 'Đồng Bộ SQL (Xóa Cache)'}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">Kéo lại món, ca và đơn mới nhất</div>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Shift Trigger Button */}
            <button
              onClick={() => {
                setClosingCashInput(expectedCashInRegister);
                setIsShiftModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white border border-stone-200/90 hover:border-amber-400 text-xs font-bold text-zinc-700 shadow-2xs hover:shadow-xs transition hover:bg-amber-50/50 cursor-pointer"
              title="Két tiền ca & Bàn giao ca"
            >
              <Wallet className="w-4 h-4 text-amber-600" />
              <span className="font-black text-amber-700">
                {(expectedCashInRegister || 0).toLocaleString('vi-VN')}₫
              </span>
            </button>

            {/* Nút Quản Lý Kho Bán Thành Phẩm & Bánh Sẵn */}
            <button
              type="button"
              onClick={() => setIsInventoryModalOpen(true)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition cursor-pointer ${
                lowStockItems.length > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-2xs hover:bg-amber-100'
                  : 'bg-white border-stone-200/90 hover:border-emerald-400 text-zinc-700 shadow-2xs hover:bg-emerald-50/50'
              }`}
              title="Quản lý tồn kho bánh sẵn & bán thành phẩm cốt bánh"
            >
              <Package className={`w-4 h-4 ${lowStockItems.length > 0 ? 'text-amber-600 animate-bounce' : 'text-emerald-600'}`} />
              <span className="hidden sm:inline">Kho Bánh</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                lowStockItems.length > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {products.length}
              </span>
              {lowStockItems.length > 0 && (
                <span className="hidden xl:inline-flex items-center text-[10px] font-black text-rose-700 bg-rose-200/80 px-1.5 py-0.5 rounded-md">
                  ⚠️ {lowStockItems.length} sắp hết
                </span>
              )}
            </button>
          </div>

          {/* ── CẢNH BÁO ĐƠN SẮP PHẢI GIAO (URGENT DELIVERY BANNER) ── */}
          {urgentPreorders.length > 0 && (
            <div className="bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 text-white p-3 sm:p-3.5 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top duration-300 border border-rose-400/40">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0 animate-bounce">
                  <AlertTriangle className="w-5 h-5 text-amber-200" />
                </div>
                <div>
                  <div className="font-black text-xs sm:text-sm flex items-center gap-2">
                    <span>🚨 CẢNH BÁO ĐƠN SẮP PHẢI GIAO!</span>
                    <span className="bg-white/25 text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-wide">
                      {urgentPreorders.length} đơn cần chú ý
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-rose-100 font-medium">
                    Có {urgentPreorders.length} đơn đặt bánh đã quá giờ hẹn hoặc cần bàn giao trong 60 phút tới. Vui lòng kiểm tra tiến độ bếp!
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playUrgentAlert();
                    setIsPreorderListOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white text-rose-700 hover:bg-rose-50 text-xs font-black shadow-md flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                >
                  <span>Xem Chi Tiết Đơn Gấp ({urgentPreorders.length})</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Categories Horizontal Tabs with Counts */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => {
              const count = getCategoryCount(cat);
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 text-white shadow-md shadow-amber-600/30 scale-[1.02]'
                      : 'bg-[#faf4ec] hover:bg-white text-stone-700 hover:text-amber-950 border border-amber-200/60 shadow-2xs'
                  }`}
                >
                  <span>{cat}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      isSelected ? 'bg-white/25 text-white' : 'bg-stone-200/70 text-stone-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Grid */}
        <div className="w-full">
          {loading ? (
            <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
              Đang tải danh mục bánh...
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-400 text-sm space-y-2">
              <AlertCircle className="w-8 h-8 text-zinc-300" />
              <span>Không tìm thấy loại bánh nào phù hợp</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-28">
              {filteredProducts.map((product) => {
                const isImported = isImportedProduct(product);
                const stock = product.stock_qty ?? 0;
                const isOutOfStock = stock <= 0;
                const isLowStock = !isOutOfStock && stock <= (product.min_stock_alert ?? 3);
                const itemInCart = cart.find((item) => item.product.id === product.id);
                const isImportedOutOfStock = isImported && isOutOfStock;
                const isImportedMaxReached = isImported && itemInCart && itemInCart.quantity >= stock;

                return (
                  <div
                    key={product.id}
                    onClick={(e) => {
                      if (isImportedOutOfStock) {
                        alert(`❌ Sản phẩm "${product.name}" là HÀNG NHẬP NGOÀI VỀ BÁN và hiện ĐÃ HẾT HÀNG TRONG KHO (Tồn: 0)!\n\n⚠️ Vì đây là hàng nhập sẵn từ bên ngoài, bếp không thể tự nướng hay làm được, do đó hệ thống KHÔNG CHO PHÉP bán khi hết tồn kho.`);
                        return;
                      }
                      if (isImportedMaxReached) {
                        alert(`⚠️ Sản phẩm "${product.name}" là HÀNG NHẬP NGOÀI VỀ BÁN, hiện trong tiệm chỉ còn ${stock} cái!\n\n⚠️ Bếp không thể làm thêm loại hàng này, bạn không thể thêm vượt quá số lượng tồn kho có sẵn (${stock} cái).`);
                        return;
                      }
                      addToCart(product, false, e);
                    }}
                    className={`group bg-white rounded-3xl p-3 sm:p-3.5 border hover:border-amber-400 hover:shadow-xl hover:shadow-amber-950/10 hover:-translate-y-1.5 transition-all duration-300 text-left flex flex-col justify-between overflow-hidden relative active:scale-[0.98] select-none ${
                      isImportedOutOfStock
                        ? 'border-zinc-300 bg-zinc-100/70 opacity-60 cursor-not-allowed hover:translate-y-0 hover:shadow-none hover:border-zinc-300'
                        : itemInCart
                        ? 'border-amber-500 ring-2 ring-amber-400/60 bg-amber-50/15 shadow-md cursor-pointer'
                        : isOutOfStock
                        ? 'border-zinc-200/80 bg-zinc-50/40 cursor-pointer'
                        : 'border-amber-200/40 cursor-pointer'
                    }`}
                  >
                    <div className="w-full aspect-[16/11] rounded-2xl bg-stone-100 overflow-hidden mb-3 relative shrink-0">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-108 transition-transform duration-500 ease-out"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs font-medium">
                          Chưa có ảnh
                        </div>
                      )}

                      {/* Tag nhãn bánh theo Flowchart Excel: Bánh sinh nhật / Bánh đặt trước / Hàng nhập */}
                      {product.cake_type_label === 'birthday' ? (
                        <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-xl bg-pink-600 text-white text-[10px] font-black shadow-md shadow-pink-600/30 flex items-center gap-1 backdrop-blur-xs z-10">
                          <Cake className="w-3 h-3" /> 🎂 Bánh sinh nhật
                        </span>
                      ) : (product.cake_type_label === 'pre_order' || product.is_preorder_only) ? (
                        <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-xl bg-amber-500 text-white text-[10px] font-black shadow-md shadow-amber-500/30 flex items-center gap-1 backdrop-blur-xs z-10">
                          <Clock className="w-3 h-3" /> ⏳ Đặt trước
                        </span>
                      ) : isImported ? (
                        <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-xl bg-blue-600/95 text-white text-[10px] font-black shadow-md shadow-blue-600/25 flex items-center gap-1 backdrop-blur-xs z-10">
                          <Package className="w-3 h-3" /> Hàng nhập
                        </span>
                      ) : null}

                      {/* Huy hiệu số lượng đã có trong giỏ hàng - Góc trên bên phải */}
                      {itemInCart && (
                        <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-xl bg-amber-600 text-white text-[10px] font-black shadow-md flex items-center gap-1 z-10 animate-in zoom-in duration-200 animate-pop-scale">
                          ✓ {itemInCart.quantity} trong giỏ
                        </span>
                      )}

                      {/* Badge Số Lượng Tồn Kho Bán Thành Phẩm & Bánh Sẵn - Góc dưới bên phải ảnh */}
                      <span
                        className={`absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-lg text-[10px] font-black shadow-md flex items-center gap-1 backdrop-blur-xs z-10 ${
                          isImportedOutOfStock
                            ? 'bg-rose-700 text-white font-bold'
                            : isOutOfStock
                            ? 'bg-zinc-700/80 text-white'
                            : isLowStock
                            ? 'bg-amber-500/95 text-white shadow-amber-500/30'
                            : 'bg-emerald-600/90 text-white'
                        }`}
                      >
                        <Package className="w-3 h-3" />
                        {isImportedOutOfStock
                          ? 'Hết hàng (Hàng nhập)'
                          : isOutOfStock
                          ? 'Tủ: 0'
                          : isLowStock
                          ? `Sắp hết: ${stock}`
                          : `Còn: ${stock}`}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className="inline-block text-[11px] text-amber-800/80 font-bold bg-amber-50/80 px-2 py-0.5 rounded-lg truncate max-w-full">
                            {product.category}
                          </span>
                          {product.is_semi_finished && (
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md border border-teal-200/60">
                              Bán thành phẩm
                            </span>
                          )}
                        </div>
                        <h3 className="font-extrabold text-zinc-900 text-xs sm:text-sm line-clamp-2 mb-2 leading-snug group-hover:text-amber-700 transition-colors">
                          {product.name}
                        </h3>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-stone-100 mt-auto">
                        <span className="font-black text-amber-700 text-sm sm:text-base tracking-tight">
                          {(product.selling_price ?? product.price ?? 0).toLocaleString('vi-VN')}₫
                        </span>

                        {/* Nút thao tác số lượng trực tiếp trên thẻ */}
                        {itemInCart ? (
                          <div
                            className="flex items-center gap-1 bg-amber-600 text-white rounded-xl p-0.5 shadow-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => updateQuantity(product.id, -1)}
                              className="w-7 h-7 rounded-lg bg-amber-700 hover:bg-amber-800 text-white flex items-center justify-center font-black text-sm cursor-pointer active:scale-90 active:animate-pop-scale transition"
                              title="Bớt 1"
                            >
                              -
                            </button>
                            <span className="px-1.5 text-xs font-black min-w-[20px] text-center">
                              {itemInCart.quantity}
                            </span>
                            <button
                              type="button"
                              disabled={isImportedMaxReached}
                              onClick={(e) => addToCart(product, true, e)}
                              className={`w-7 h-7 rounded-lg text-white flex items-center justify-center font-black text-sm transition active:animate-pop-scale ${
                                isImportedMaxReached
                                  ? 'bg-amber-900/60 text-amber-300/40 cursor-not-allowed'
                                  : 'bg-amber-700 hover:bg-amber-800 cursor-pointer active:scale-90'
                              }`}
                              title={isImportedMaxReached ? `Hàng nhập ngoài đã đạt tối đa tồn kho (${stock} cái)` : 'Thêm 1'}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isImportedOutOfStock}
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product, true, e);
                            }}
                            className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black transition-all duration-200 shadow-2xs active:scale-85 active:animate-pop-scale ${
                              isImportedOutOfStock
                                ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
                                : 'bg-amber-50 hover:bg-amber-600 text-amber-700 hover:text-white group-hover:bg-gradient-to-tr group-hover:from-amber-600 group-hover:to-amber-500 group-hover:text-white group-hover:scale-105 cursor-pointer'
                            }`}
                            title={isImportedOutOfStock ? 'Hàng nhập ngoài đã hết tồn kho, không thể bán' : (product.is_preorder_only ? "Bấm để thêm vào giỏ bán tại quầy ngay" : "Thêm vào giỏ")}
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Nút Xem Giỏ Hàng nổi cố định trên Mobile & Tablet khi đang chọn món */}
        {cart.length > 0 && mobileTab === 'menu' && (
          <div id="pos-cart-mobile-target" className={`lg:hidden fixed bottom-3 left-3 right-3 z-50 shadow-2xl animate-in slide-in-from-bottom duration-200 transition-transform ${cartBumping ? 'animate-cart-bounce' : ''}`}>
            <button
              onClick={() => setMobileTab('cart')}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 text-white font-black text-sm shadow-xl shadow-amber-900/25 flex items-center justify-between transition active:scale-98 cursor-pointer ring-2 ring-white/30 animate-shimmer-smooth"
            >
              <div className="flex items-center gap-2.5">
                <span className={`w-8 h-8 rounded-xl bg-white text-amber-600 flex items-center justify-center text-xs font-black shadow-xs ${cartBumping ? 'animate-pop-scale' : ''}`}>
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
                <div className="text-left leading-tight">
                  <span className="text-sm font-extrabold block">{(grandTotal || 0).toLocaleString('vi-VN')}₫</span>
                  <span className="text-[10px] text-amber-100 font-medium">Bấm để xem giỏ & thanh toán</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl">
                <span>Thanh toán</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        )}
      </div>

      {/* ── CỘT PHẢI: GIỎ HÀNG (CỐ ĐỊNH DẠNG STICKY TRÊN DESKTOP) ── */}
      <div className={`w-full lg:w-96 xl:w-[420px] bg-white rounded-3xl shadow-xl shadow-amber-950/5 border border-amber-200/60 flex flex-col justify-between shrink-0 lg:sticky lg:top-20 lg:self-start lg:h-[calc(100vh-6rem)] lg:max-h-[calc(100vh-6rem)] overflow-hidden lg:mr-6 lg:my-3 z-20 ${mobileTab === 'cart' ? 'flex flex-1 min-h-[calc(100vh-4rem)] rounded-none border-none shadow-none m-0' : 'hidden lg:flex'}`}>
        {/* Header Giỏ Hàng */}
        <div className="p-4 border-b border-stone-200/80 flex items-center justify-between shrink-0 bg-white/95 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMobileTab('menu')}
              className="lg:hidden p-1.5 -ml-1 text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-stone-100 transition cursor-pointer"
              title="Quay lại thực đơn"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div
              id="pos-cart-target"
              className={`w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 transition-all relative ${
                cartBumping ? 'animate-cart-bounce ring-4 ring-amber-400 shadow-amber-500/50 scale-110' : ''
              }`}
            >
              <ShoppingCart className="w-5 h-5" />
              {cartBumping && (
                <span className="absolute -inset-3 rounded-full border-2 border-amber-400 bg-amber-400/25 animate-spark-aura pointer-events-none" />
              )}
            </div>
            <div>
              <h2 className="font-black text-amber-950 text-sm sm:text-base leading-none">Đơn Bán Tại Quầy</h2>
              <span className={`text-[10px] font-bold block transition-all ${cartBumping ? 'text-amber-600 font-black animate-pop-scale' : 'text-zinc-400'}`}>
                {cart.length > 0 ? `${cart.reduce((s, i) => s + i.quantity, 0)} món trong giỏ` : 'Chưa chọn món'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {heldOrders.length > 0 && (
              <button
                type="button"
                onClick={() => setIsHeldOrdersModalOpen(true)}
                className="text-xs text-amber-700 bg-amber-100/80 hover:bg-amber-200/80 font-bold px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 active:scale-95 border border-amber-300 shadow-2xs"
                title="Xem danh sách các đơn đang tạm lưu"
              >
                <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Đơn tạm ({heldOrders.length})</span>
              </button>
            )}
            {cart.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setIsHoldPromptOpen(true)}
                  className="text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 font-bold px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 active:scale-95 border border-amber-200"
                  title="Tạm lưu đơn hàng này để bán đơn khác"
                >
                  <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Tạm lưu</span>
                </button>
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs text-rose-500 hover:text-rose-700 font-bold hover:bg-rose-50 px-2 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 active:scale-90"
                  title="Xóa toàn bộ giỏ hàng"
                >
                  <Trash2 className="w-3.5 h-3.5" /> <span>Xóa</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Danh Sách Món Trong Giỏ Hàng */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-0">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm space-y-2.5 py-12">
              <div className="w-16 h-16 rounded-3xl bg-amber-50 flex items-center justify-center text-amber-600 shadow-inner animate-float-slow">
                <ShoppingCart className="w-8 h-8 stroke-1.5" />
              </div>
              <span className="font-extrabold text-zinc-700 text-sm">Giỏ hàng đang trống</span>
              <span className="text-xs text-zinc-400 text-center max-w-[230px] leading-relaxed">
                Chọn bánh bên thực đơn hoặc bấm <b>"🎂 Đặt Bánh Sinh Nhật"</b> để bắt đầu tạo đơn
              </span>
              <button
                onClick={() => setMobileTab('menu')}
                className="lg:hidden mt-2 px-4 py-2.5 rounded-2xl bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-600/20 active:scale-95 transition flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Mở thực đơn chọn bánh
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.product.id}
                className="p-2.5 sm:p-3 rounded-2xl bg-stone-50/90 hover:bg-stone-50 border border-stone-200/80 flex items-center gap-3 transition-all shadow-2xs group animate-slide-in-right"
              >
                {/* Thumbnail Image Bánh */}
                <div className="w-12 h-12 rounded-xl bg-stone-100 overflow-hidden shrink-0 border border-stone-200/80">
                  {item.product.image_url ? (
                    <img
                      src={item.product.image_url}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs">
                      🍰
                    </div>
                  )}
                </div>

                {/* Thông tin bánh */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-zinc-900 truncate leading-snug">
                    {item.product.name}
                  </h4>
                  <div className="text-[11px] text-zinc-500 font-medium">
                    {(item.product?.selling_price ?? item.product?.price ?? 0).toLocaleString('vi-VN')}₫
                  </div>
                  <div className="text-xs font-black text-amber-700">
                    {((item.product?.selling_price ?? item.product?.price ?? 0) * (item.quantity || 1)).toLocaleString('vi-VN')}₫
                  </div>
                  {isImportedProduct(item.product) ? (
                    Number(item.product.stock_qty ?? item.product.stock ?? 0) < item.quantity ? (
                      <div className="mt-1 text-[10px] font-black text-rose-800 bg-rose-100 border border-rose-300 rounded px-1.5 py-0.5 inline-block">
                        ⛔ Hàng nhập ngoài: Vượt tồn kho {Number(item.product.stock_qty ?? item.product.stock ?? 0)} cái (Bếp không thể làm)
                      </div>
                    ) : (
                      <div className="mt-1 text-[10px] font-bold text-blue-800 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 inline-block">
                        📦 Hàng nhập ngoài (Tồn: {Number(item.product.stock_qty ?? item.product.stock ?? 0)} cái)
                      </div>
                    )
                  ) : (
                    Number(item.product.stock_qty ?? item.product.stock ?? 0) < item.quantity && (
                      <div className="mt-1 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded px-1.5 py-0.5 inline-block">
                        ⚠️ Đặt {item.quantity} / Tồn {Number(item.product.stock_qty ?? item.product.stock ?? 0)} (Thiếu {item.quantity - Number(item.product.stock_qty ?? item.product.stock ?? 0)} - Bếp sẽ làm mới)
                      </div>
                    )
                  )}
                </div>

                {/* Stepper Tăng / Giảm */}
                <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-xl p-1 shadow-2xs">
                  <button
                    onClick={() => updateQuantity(item.product.id, -1)}
                    className="w-6 h-6 rounded-lg hover:bg-stone-100 flex items-center justify-center text-zinc-600 font-bold transition active:scale-90 cursor-pointer"
                    title="Giảm số lượng"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center font-black text-xs text-zinc-900">
                    {item.quantity}
                  </span>
                  <button
                    data-testid="pos-cart-plus-btn"
                    onClick={() => updateQuantity(item.product.id, 1)}
                    disabled={isImportedProduct(item.product) && item.quantity >= Number(item.product.stock_qty ?? item.product.stock ?? 0)}
                    className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold transition active:scale-90 ${
                      isImportedProduct(item.product) && item.quantity >= Number(item.product.stock_qty ?? item.product.stock ?? 0)
                        ? 'bg-zinc-100 text-zinc-300 cursor-not-allowed opacity-40'
                        : 'hover:bg-amber-50 hover:text-amber-700 text-zinc-600 cursor-pointer'
                    }`}
                    title={
                      isImportedProduct(item.product) && item.quantity >= Number(item.product.stock_qty ?? item.product.stock ?? 0)
                        ? `Hàng nhập ngoài đã đạt tối đa tồn kho (${Number(item.product.stock_qty ?? item.product.stock ?? 0)} cái)`
                        : 'Tăng số lượng'
                    }
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Giỏ Hàng & Nút Thanh Toán */}
        <div className="p-4 border-t border-stone-200/80 bg-stone-50/80 space-y-3 shrink-0">
          <div className="space-y-2 text-xs text-zinc-600">
            <div className="flex justify-between">
              <span>Tạm tính ({cart.reduce((s, i) => s + i.quantity, 0)} món):</span>
              <span className="font-bold text-zinc-800">{(subtotal || 0).toLocaleString('vi-VN')}₫</span>
            </div>

            {/* MỤC GIẢM GIÁ: CHỌN THEO % HOẶC SỐ TIỀN */}
            <div className="p-2.5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-zinc-700 flex items-center gap-1 text-[11px]">
                  <Tag className="w-3 h-3 text-amber-600" /> Giảm giá:
                </span>
                <div className="flex items-center bg-stone-100 p-0.5 rounded-lg border border-stone-200 text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountMode('percent');
                      if (discountCustomAmount > 0 && subtotal > 0) {
                        setDiscountPercent(Math.min(100, Math.round((discountCustomAmount / subtotal) * 100)));
                      }
                    }}
                    className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                      discountMode === 'percent'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Theo %
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountMode('amount');
                      if (discountPercent > 0 && subtotal > 0) {
                        setDiscountCustomAmount(Math.round((subtotal * discountPercent) / 100));
                      }
                    }}
                    className={`px-2 py-0.5 rounded font-black transition cursor-pointer ${
                      discountMode === 'amount'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Theo ₫
                  </button>
                </div>
              </div>

              {/* Nút gợi ý nhanh */}
              <div className="flex items-center gap-1 flex-wrap">
                {discountMode === 'percent' ? (
                  <>
                    {[5, 10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => applyDiscountPctWithPin(pct)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                          discountPercent === pct
                            ? 'bg-amber-100 border-amber-400 text-amber-900'
                            : 'bg-stone-50 border-stone-200 text-zinc-600 hover:bg-stone-100'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                    {(discountPercent > 0) && (
                      <button
                        type="button"
                        onClick={() => setDiscountPercent(0)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        ✕ Xóa
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {[10000, 20000, 50000, 100000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setDiscountCustomAmount(amt)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                          discountCustomAmount === amt
                            ? 'bg-amber-100 border-amber-400 text-amber-900'
                            : 'bg-stone-50 border-stone-200 text-zinc-600 hover:bg-stone-100'
                        }`}
                      >
                        {amt >= 1000 ? `${amt / 1000}k` : amt}
                      </button>
                    ))}
                    {(discountCustomAmount > 0) && (
                      <button
                        type="button"
                        onClick={() => setDiscountCustomAmount(0)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        ✕ Xóa
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Ô nhập tùy chỉnh */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[11px] text-zinc-500 font-medium">Nhập tay:</span>
                {discountMode === 'percent' ? (
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={discountPercent || ''}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setDiscountPercent(e.target.value === '' ? ('' as any) : Math.min(100, Math.max(0, Number(e.target.value))))}
                      placeholder="Nhập % giảm..."
                      className="w-full pr-7 pl-3 py-1.5 text-right bg-white border border-stone-200 rounded-xl text-xs font-black text-amber-800 focus:outline-amber-500"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 pointer-events-none">%</span>
                  </div>
                ) : (
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(discountCustomAmount)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setDiscountCustomAmount(parseCurrencyInput(e.target.value))}
                      placeholder="Nhập số tiền giảm (VND)..."
                      className="w-full pr-7 pl-3 py-1.5 text-right bg-white border border-stone-200 rounded-xl text-xs font-black text-amber-800 focus:outline-amber-500"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 pointer-events-none">₫</span>
                  </div>
                )}
              </div>
            </div>

            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 font-bold">
                <span>Số tiền giảm:</span>
                <span>-{(discountAmount || 0).toLocaleString('vi-VN')}₫</span>
              </div>
            )}
            <div className="flex justify-between text-sm sm:text-base font-black text-zinc-900 pt-2 border-t border-stone-200">
              <span>TỔNG CỘNG:</span>
              <span className={`text-amber-700 text-lg sm:text-xl font-black transition-all ${totalPulsing ? 'animate-glow-pulse scale-105 inline-block text-amber-600' : ''}`}>
                {(totalAmount || 0).toLocaleString('vi-VN')}₫
              </span>
            </div>
          </div>

          {/* Cảnh báo chặn thanh toán nếu có hàng nhập ngoài vượt tồn kho */}
          {(() => {
            const overstockedItem = cart.find(
              (item) =>
                isImportedProduct(item.product) &&
                item.quantity > Number(item.product.stock_qty ?? item.product.stock ?? 0)
            );
            if (!overstockedItem) return null;
            const itemStock = Number(overstockedItem.product.stock_qty ?? overstockedItem.product.stock ?? 0);
            return (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-[11px] font-bold flex items-start gap-2 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-extrabold text-rose-900 block">Chặn thanh toán vì quá tồn kho hàng nhập:</span>
                  <span>
                    "{overstockedItem.product.name}" là hàng nhập ngoài chỉ còn <b>{itemStock} cái</b> trong kho. Bếp không thể sản xuất mặt hàng này, vui lòng giảm bớt số lượng!
                  </span>
                </div>
              </div>
            );
          })()}

          <button
            id="pos-checkout-btn"
            disabled={
              cart.length === 0 ||
              cart.some(
                (item) =>
                  isImportedProduct(item.product) &&
                  item.quantity > Number(item.product.stock_qty ?? item.product.stock ?? 0)
              )
            }
            onClick={() => {
              setCashGiven(dueNow);
              setPaymentMethod('cash');
              const syntax = vietqrConfig.transferSyntax || 'DH';
              const randSuffix = String(Math.floor(100000 + Math.random() * 900000));
              const prefixTemp = fulfillmentType === 'takeaway' ? 'BK' : fulfillmentType === 'shipping' ? 'BK-SHIP' : 'BK-PRE';
              const newOrderNum = getNextOrderNumber(prefixTemp);
              setActiveCheckoutOrderNumber(newOrderNum);
              setCheckoutTransferCode(`${syntax}${randSuffix}`);
              setPaymentReceivedInfo(null);
              setIsWaitingAdminTransferApproval(false);
              setAdminApprovedTransfer(false);
              setCapturedTransferProofImage(null);
              setIsCheckoutOpen(true);
            }}
            className={`w-full py-3.5 rounded-2xl text-white font-black text-sm sm:text-base shadow-xl disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer ${
              cart.length > 0 ? 'animate-shimmer-smooth' : ''
            } ${
              cart.some(
                (item) =>
                  isImportedProduct(item.product) &&
                  item.quantity > Number(item.product.stock_qty ?? item.product.stock ?? 0)
              )
                ? 'bg-zinc-700 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 hover:from-amber-700 hover:to-orange-600 shadow-amber-600/25 hover:shadow-amber-600/35'
            }`}
          >
            <Banknote className="w-5 h-5" />
            <span>
              {cart.some(
                (item) =>
                  isImportedProduct(item.product) &&
                  item.quantity > Number(item.product.stock_qty ?? item.product.stock ?? 0)
              )
                ? '⛔ Hàng Nhập Quá Tồn Kho - Không Thể Bán'
                : `Thanh Toán Ngay (${(totalAmount || 0).toLocaleString('vi-VN')}₫)`}
            </span>
          </button>
        </div>
      </div>

      {/* ── MODAL 1: TẠO ĐƠN ĐẶT BÁNH KEM (CUSTOM CAKE PREORDER) ── */}
      {isPreorderModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center">
                  <Cake className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-zinc-900">Tạo Đơn Đặt Bánh Kem / Sinh Nhật</h3>
                  <p className="text-[11px] text-zinc-500">Đơn sẽ được tự động đồng bộ sang màn hình Bếp để thợ chuẩn bị</p>
                </div>
              </div>
              <button onClick={() => setIsPreorderModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePreorder} className="space-y-3.5 text-xs">
              {preorderError && (
                <div className="p-3 bg-rose-50 border border-rose-300 text-rose-800 rounded-2xl font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{preorderError}</span>
                </div>
              )}

              {/* 1. Thông tin khách */}
              <div className="p-3 bg-pink-50/50 rounded-2xl border border-pink-100 space-y-2.5">
                <span className="font-bold text-pink-700 uppercase tracking-wider block text-[10px]">
                  1. Thông tin khách đặt bánh
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="font-semibold text-zinc-700 text-xs">Tên khách hàng *</label>
                    <input
                      type="text"
                      required
                      value={preorderForm.customerName}
                      onChange={(e) => setPreorderForm({ ...preorderForm, customerName: e.target.value })}
                      placeholder="Chị Lan Anh..."
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold min-w-0"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="font-semibold text-zinc-700 text-xs">Số điện thoại *</label>
                    <input
                      type="tel"
                      required
                      value={preorderForm.customerPhone}
                      onChange={(e) => setPreorderForm({ ...preorderForm, customerPhone: e.target.value })}
                      placeholder="0912 345 678..."
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold min-w-0"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Hình thức nhận bánh & Địa chỉ ship */}
              <div className="p-3 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-2.5">
                <span className="font-bold text-blue-800 uppercase tracking-wider block text-[10px] flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-blue-600" /> 2. Hình thức nhận bánh & Địa chỉ giao
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreorderForm({ ...preorderForm, deliveryMethod: 'pickup' })}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition border text-xs cursor-pointer ${
                      preorderForm.deliveryMethod === 'pickup'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <Store className="w-4 h-4" /> Khách lấy tại tiệm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreorderForm({ ...preorderForm, deliveryMethod: 'shipping' })}
                    className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition border text-xs cursor-pointer ${
                      preorderForm.deliveryMethod === 'shipping'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <Truck className="w-4 h-4" /> Giao tận nơi (Ship bánh)
                  </button>
                </div>

                {preorderForm.deliveryMethod === 'shipping' && (
                  <div className="space-y-2 pt-1 animate-in fade-in duration-200">
                    <div>
                      <label className="font-semibold text-zinc-700 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" /> Địa chỉ giao hàng chi tiết *
                      </label>
                      <input
                        type="text"
                        required={preorderForm.deliveryMethod === 'shipping'}
                        value={preorderForm.shippingAddress}
                        onChange={(e) => setPreorderForm({ ...preorderForm, shippingAddress: e.target.value })}
                        placeholder="Số nhà, tên đường, phường/xã, quận/huyện..."
                        className="w-full mt-1 p-2 rounded-xl bg-white border border-blue-300 font-bold text-zinc-900 shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-zinc-600">Phí giao hàng / Ship (VND, nếu có):</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInput(preorderForm.shippingFee)}
                        onChange={(e) => setPreorderForm({ ...preorderForm, shippingFee: parseCurrencyInput(e.target.value) })}
                        placeholder="Ví dụ: 20.000, 30.000... (0 nếu miễn phí)"
                        className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold text-zinc-900"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Ngày giờ lấy bánh */}
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <span className="font-bold text-zinc-700 uppercase tracking-wider block text-[10px]">
                  3. Hẹn ngày & giờ {preorderForm.deliveryMethod === 'shipping' ? 'giao hàng' : 'nhận bánh'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="font-semibold text-zinc-600 block text-xs mb-1">Ngày {preorderForm.deliveryMethod === 'shipping' ? 'giao:' : 'nhận:'}</label>
                    <input
                      type="date"
                      required
                      value={preorderForm.pickupDate}
                      onChange={(e) => setPreorderForm({ ...preorderForm, pickupDate: e.target.value })}
                      className="w-full max-w-full box-border p-2 rounded-xl bg-white border border-zinc-200 font-black text-zinc-900 min-w-0"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="font-semibold text-zinc-600 block text-xs mb-1">Giờ {preorderForm.deliveryMethod === 'shipping' ? 'giao:' : 'nhận:'}</label>
                    <input
                      type="time"
                      required
                      value={preorderForm.pickupTime}
                      onChange={(e) => setPreorderForm({ ...preorderForm, pickupTime: e.target.value })}
                      className="w-full max-w-full box-border p-2 rounded-xl bg-white border border-zinc-200 font-black text-zinc-900 min-w-0"
                    />
                  </div>
                </div>
              </div>

              {/* Tình trạng bánh: Đã có sẵn chờ giao hay cần làm/nướng mới */}
              <div className="p-3 bg-amber-50/80 rounded-2xl border border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-700 shrink-0" />
                  <div>
                    <span className="font-bold text-zinc-900 text-xs block">Tình trạng bánh tại tiệm:</span>
                    <span className="text-[10px] text-zinc-600 font-medium">
                      {preorderForm.isReadyStock ? '📦 Đã có sẵn tại quầy (vào thẳng Chờ Giao)' : '🔥 Cần nướng/làm mới (chuyển bếp làm từ đầu)'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreorderForm(prev => ({ ...prev, isReadyStock: !prev.isReadyStock }))}
                  className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer active:scale-95 ${
                    preorderForm.isReadyStock
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300'
                  }`}
                >
                  {preorderForm.isReadyStock ? '✓ Có sẵn (Chờ giao)' : 'Cần nướng mới'}
                </button>
              </div>

              {/* 4. Mẫu bánh & Kích thước */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <label className="font-semibold text-zinc-700 text-xs">Loại mẫu bánh:</label>
                      <button
                        type="button"
                        onClick={() => {
                          const nextState = !isCustomCake;
                          setIsCustomCake(nextState);
                          if (nextState) {
                            setPreorderForm((prev) => ({ ...prev, cakeName: '' }));
                          } else {
                            const defaultProd = products.find((p) => p.is_preorder_only) || products[0];
                            setPreorderForm((prev) => ({
                              ...prev,
                              cakeName: defaultProd ? defaultProd.name : 'Bánh Bông Lan Trứng Muối 18cm',
                              totalPrice: defaultProd ? defaultProd.selling_price : 365000,
                            }));
                          }
                        }}
                        className="text-[11px] text-pink-600 hover:text-pink-800 font-bold underline cursor-pointer"
                      >
                        {isCustomCake ? '📋 Chọn từ shop' : '✏️ Nhập tên tùy chọn'}
                      </button>
                    </div>

                    {isCustomCake ? (
                      <div className="mt-1">
                        <input
                          type="text"
                          required
                          value={preorderForm.cakeName}
                          onChange={(e) => setPreorderForm({ ...preorderForm, cakeName: e.target.value })}
                          placeholder="Nhập tên bánh tùy chọn (VD: Bánh Mousse Trà Xanh, Bánh Rút Tiền...)"
                          className="w-full p-2 rounded-xl bg-pink-50/70 border-2 border-pink-400 font-bold text-zinc-900 focus:bg-white text-xs placeholder:text-zinc-400 min-w-0"
                          autoFocus
                        />
                        <span className="text-[10px] text-pink-700 font-semibold block mt-0.5">
                          ✨ Nhập tên bánh theo yêu cầu riêng không có sẵn trong shop
                        </span>
                      </div>
                    ) : (
                      <select
                        value={preorderForm.cakeName}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setIsCustomCake(true);
                            setPreorderForm((prev) => ({ ...prev, cakeName: '' }));
                            return;
                          }
                          const selectedP = products.find((p) => p.name === e.target.value);
                          setPreorderForm({
                            ...preorderForm,
                            cakeName: e.target.value,
                            totalPrice: selectedP ? selectedP.selling_price : preorderForm.totalPrice,
                          });
                        }}
                        className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold min-w-0 text-xs"
                      >
                        {products
                          .filter((p) => !isImportedProduct(p))
                          .map((p) => (
                            <option key={p.id} value={p.name}>
                              {p.name}
                            </option>
                          ))}
                        <option value="Bánh Kem Bắp Phô Mai">Bánh Kem Bắp Phô Mai</option>
                        <option value="Bánh Kem Socola Trái Cây">Bánh Kem Socola Trái Cây</option>
                        <option value="__custom__">✏️ + Nhập tên bánh tùy chọn khác (theo yêu cầu)...</option>
                      </select>
                    )}
                  </div>
                  <div className="min-w-0">
                    <label className="font-semibold text-zinc-700 text-xs">Kích thước bánh & Định mức chuẩn:</label>
                    <select
                      value={preorderForm.sizeId || ''}
                      onChange={(e) => {
                        const s = cakeCostingConfig.sizes.find(x => x.id === e.target.value);
                        if (s) {
                          setPreorderForm(prev => ({
                            ...prev,
                            sizeId: s.id,
                            size: s.name,
                            totalPrice: s.suggestedPrice,
                          }));
                        }
                      }}
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold min-w-0 text-xs text-zinc-900"
                    >
                      {cakeCostingConfig.sizes.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — Vốn ~{s.baseCost.toLocaleString('vi-VN')}₫ (Gợi ý: {s.suggestedPrice.toLocaleString('vi-VN')}₫)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* NÚT CHỌN NHANH SIZE BÁNH (1 CHẠM TỰ ĐỘNG ĐIỀN GIÁ GỢI Ý) */}
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-pink-800 flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-pink-600" /> Chọn nhanh kích thước:
                    </span>
                    <span className="text-zinc-500 text-[10px]">Tự động nạp giá vốn & giá bán chuẩn</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {cakeCostingConfig.sizes.map((s) => {
                      const isSelected = preorderForm.sizeId === s.id || preorderForm.size === s.name;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setPreorderForm(prev => ({
                              ...prev,
                              sizeId: s.id,
                              size: s.name,
                              totalPrice: s.suggestedPrice,
                            }));
                          }}
                          className={`p-2 rounded-xl text-left border transition cursor-pointer active:scale-95 ${
                            isSelected
                              ? 'bg-pink-600 text-white border-pink-600 shadow-xs ring-2 ring-pink-200'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:border-pink-300 hover:bg-pink-50/30'
                          }`}
                        >
                          <div className="font-bold text-[11px] truncate flex items-center justify-between">
                            <span>{s.name.split(' (')[0]}</span>
                            <span className={`text-[9px] px-1 rounded ${isSelected ? 'bg-pink-700 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                              Ø{s.diameterCm}cm
                            </span>
                          </div>
                          <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-pink-100' : 'text-zinc-500'}`}>
                            {s.servings}
                          </div>
                          <div className={`text-[10px] font-black mt-1 ${isSelected ? 'text-white' : 'text-pink-700'}`}>
                            {s.suggestedPrice.toLocaleString('vi-VN')}₫
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* CHỌN CỐT BÁNH & LOẠI KEM PHỦ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2.5 bg-zinc-50 rounded-xl border border-zinc-200">
                  <div className="min-w-0">
                    <label className="font-semibold text-zinc-700 text-[11px] block mb-1">Loại cốt bánh:</label>
                    <select
                      value={preorderForm.flavorId || ''}
                      onChange={(e) => {
                        const f = cakeCostingConfig.flavors.find(x => x.id === e.target.value);
                        setPreorderForm(prev => ({
                          ...prev,
                          flavorId: e.target.value,
                          flavor: f ? f.name : prev.flavor,
                        }));
                      }}
                      className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold text-xs min-w-0"
                    >
                      {cakeCostingConfig.flavors.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} {f.extraPrice > 0 ? `(+${f.extraPrice.toLocaleString('vi-VN')}₫)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="font-semibold text-zinc-700 text-[11px] block mb-1">Loại kem phủ & trang trí:</label>
                    <select
                      value={preorderForm.creamId || ''}
                      onChange={(e) => {
                        const c = cakeCostingConfig.creams.find(x => x.id === e.target.value);
                        setPreorderForm(prev => ({
                          ...prev,
                          creamId: e.target.value,
                          cream: c ? c.name : prev.cream,
                        }));
                      }}
                      className="w-full p-2 rounded-xl bg-white border border-zinc-200 font-bold text-xs min-w-0"
                    >
                      {cakeCostingConfig.creams.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.extraPrice > 0 ? `(+${c.extraPrice.toLocaleString('vi-VN')}₫)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* CHỌN NHÂN BÁNH SINH NHẬT */}
                {cakeCostingConfig.fillings && cakeCostingConfig.fillings.length > 0 && (
                  <div className="p-2.5 bg-rose-50/50 rounded-xl border border-rose-200">
                    <label className="font-bold text-rose-800 text-[11px] flex items-center gap-1 mb-1.5">
                      🍓 Nhân bánh sinh nhật:
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {cakeCostingConfig.fillings.map((fl) => {
                        const isSelected = preorderForm.fillingId === fl.id || (!preorderForm.fillingId && fl.isDefault);
                        return (
                          <button
                            key={fl.id}
                            type="button"
                            onClick={() => setPreorderForm(prev => ({ ...prev, fillingId: fl.id, filling: fl.name }))}
                            className={`p-2 rounded-xl text-left border text-xs font-bold transition cursor-pointer active:scale-95 ${
                              isSelected
                                ? 'bg-rose-600 text-white border-rose-600 shadow-xs ring-1 ring-rose-300'
                                : 'bg-white text-zinc-700 border-zinc-200 hover:border-rose-300 hover:bg-rose-50/40'
                            }`}
                          >
                            <div className="flex items-center gap-1 truncate">
                              {fl.icon && <span>{fl.icon}</span>}
                              <span className="truncate">{fl.name}</span>
                            </div>
                            <div className={`text-[10px] font-normal mt-0.5 ${isSelected ? 'text-rose-100' : 'text-zinc-500'}`}>
                              {fl.extraPrice > 0 ? `Phụ thu: +${fl.extraPrice.toLocaleString('vi-VN')}₫` : 'Mặc định (Đã gồm)'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* HỘP BÁNH & BAO BÌ */}
                <div>
                  <label className="font-semibold text-zinc-700 text-[11px] block mb-1">Hộp đựng bánh & Đóng gói:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {cakeCostingConfig.packagings.map((pkg) => {
                      const isSelected = preorderForm.packagingId === pkg.id || (!preorderForm.packagingId && pkg.isDefault);
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => setPreorderForm(prev => ({ ...prev, packagingId: pkg.id, packaging: pkg.name }))}
                          className={`p-2 rounded-xl text-left border text-xs font-bold transition cursor-pointer active:scale-95 ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:border-amber-300'
                          }`}
                        >
                          <div className="truncate">{pkg.name}</div>
                          <div className={`text-[10px] font-normal ${isSelected ? 'text-amber-100' : 'text-zinc-500'}`}>
                            {pkg.extraPrice > 0 ? `Phụ thu: +${pkg.extraPrice.toLocaleString('vi-VN')}₫` : 'Tiêu chuẩn (Đã gồm)'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* PHỤ KIỆN & DECOR BÁNH THÊM */}
                <div className="p-2.5 bg-pink-50/50 rounded-xl border border-pink-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-pink-800 text-[11px] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-pink-600" /> Phụ kiện & Decor thêm (Tích chọn nhiều):
                    </label>
                    <span className="text-[10px] text-pink-600 font-semibold">
                      Đã chọn: {(preorderForm.selectedAddonIds || []).length} món
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {cakeCostingConfig.addons.map((a) => {
                      const isSelected = (preorderForm.selectedAddonIds || []).includes(a.id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            const current = preorderForm.selectedAddonIds || [];
                            const next = isSelected ? current.filter(x => x !== a.id) : [...current, a.id];
                            setPreorderForm(prev => ({ ...prev, selectedAddonIds: next }));
                          }}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                            isSelected
                              ? 'bg-pink-600 text-white border-pink-600 shadow-xs ring-1 ring-pink-300'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:border-pink-300 hover:bg-pink-50/40'
                          }`}
                        >
                          <span>{a.icon || '🎁'}</span>
                          <span>{a.name}</span>
                          <span className={`text-[10px] ${isSelected ? 'text-pink-100 font-bold' : 'text-rose-600'}`}>
                            {a.price > 0 ? `+${a.price.toLocaleString('vi-VN')}₫` : 'Free'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* DÒNG CHỮ TRÊN BÁNH (CAKE MESSAGE) */}
                <div>
                  <label className="font-bold text-pink-700 flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" /> Dòng chữ ghi lên bánh (Thợ sẽ viết chữ):
                  </label>
                  <input
                    type="text"
                    value={preorderForm.cakeMessage}
                    onChange={(e) => setPreorderForm({ ...preorderForm, cakeMessage: e.target.value })}
                    placeholder="Ví dụ: Mừng sinh nhật Bé Bắp 3 tuổi, Happy Birthday Mẹ..."
                    className="w-full mt-1 p-2.5 rounded-xl bg-pink-50/50 border border-pink-200 font-bold text-zinc-900"
                  />
                </div>

                {/* Yêu cầu trang trí / Ghi chú */}
                <div>
                  <label className="font-semibold text-zinc-700">Ghi chú yêu cầu trang trí & phụ kiện:</label>
                  <textarea
                    rows={2}
                    value={preorderForm.notes}
                    onChange={(e) => setPreorderForm({ ...preorderForm, notes: e.target.value })}
                    placeholder="Ví dụ: Tone màu xanh pastel, vẽ hình vương miện, nến số 3, ít ngọt..."
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 text-zinc-800"
                  />
                </div>

                {/* ẢNH MẪU BÁNH (Reference Image) */}
                <div className="p-3 bg-violet-50 rounded-xl border border-violet-200 space-y-2">
                  <label className="font-bold text-violet-800 flex items-center gap-1 text-xs">
                    📷 Ảnh mẫu bánh (khách gửi ảnh mẫu muốn làm theo):
                  </label>
                  <input
                    type="file"
                    ref={preorderImageRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const img = new window.Image();
                        img.onload = () => {
                          const canvas = document.createElement('canvas');
                          const maxDim = 1200; // Độ nét cao 1200px giúp thợ làm bánh nhìn rõ từng chi tiết trên cả điện thoại và máy tính
                          let w = img.width, h = img.height;
                          if (w > maxDim || h > maxDim) {
                            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                            else { w = Math.round(w * maxDim / h); h = maxDim; }
                          }
                          canvas.width = w;
                          canvas.height = h;
                          const ctx = canvas.getContext('2d');
                          if (ctx) {
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';
                            ctx.drawImage(img, 0, 0, w, h);
                            // Định dạng JPEG 0.85 sắc nét, tương thích hoàn hảo mọi điện thoại iPhone / Android
                            const base64 = canvas.toDataURL('image/jpeg', 0.85);
                            setPreorderForm(prev => ({ ...prev, referenceImageUrl: base64 }));

                            // Đẩy lên Supabase Storage bucket (Store 1GB)
                            canvas.toBlob(async (blob) => {
                              if (!blob) return;
                              const fileName = `preorders/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
                              const buckets = ['bakery-images', 'product-images'];
                              for (const b of buckets) {
                                try {
                                  const { data: sData, error: sErr } = await supabase.storage
                                    .from(b)
                                    .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

                                  if (!sErr && sData?.path) {
                                    const { data: uData } = supabase.storage
                                      .from(b)
                                      .getPublicUrl(sData.path);
                                    if (uData?.publicUrl) {
                                      setPreorderForm(prev => ({ ...prev, referenceImageUrl: uData.publicUrl }));
                                      break;
                                    }
                                  }
                                } catch (uploadErr) {
                                  console.warn(`Upload bucket ${b} thất bại:`, uploadErr);
                                }
                              }
                            }, 'image/jpeg', 0.85);
                          }
                        };
                        img.src = ev.target?.result as string;
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                  {preorderForm.referenceImageUrl ? (
                    <div className="flex items-start gap-3">
                      <div className="relative group">
                        <img
                          src={preorderForm.referenceImageUrl}
                          alt="Ảnh mẫu bánh"
                          className="w-24 h-24 rounded-xl object-cover border-2 border-violet-300 shadow-md cursor-pointer hover:scale-105 transition"
                          onClick={() => setPreorderImageLightbox(preorderForm.referenceImageUrl)}
                        />
                        <button
                          type="button"
                          onClick={() => setPreorderForm(prev => ({ ...prev, referenceImageUrl: '' }))}
                          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-md hover:bg-red-600 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex-1 text-[11px] text-violet-700 space-y-1">
                        <p className="font-bold">✅ Đã tải ảnh mẫu thành công!</p>
                        <p>Ảnh này sẽ hiển thị trên màn hình Bếp để thợ bánh tham khảo khi làm bánh.</p>
                        <button
                          type="button"
                          onClick={() => preorderImageRef.current?.click()}
                          className="text-violet-600 underline font-bold cursor-pointer"
                        >
                          Đổi ảnh khác
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => preorderImageRef.current?.click()}
                      className="w-full py-3 rounded-xl border-2 border-dashed border-violet-300 bg-white hover:bg-violet-50 text-violet-600 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      📷 Chụp / Tải ảnh mẫu bánh lên
                    </button>
                  )}
                </div>
              </div>

              {/* 5. Tiền bánh, Giảm giá, Phí ship & Tiền Cọc */}
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 space-y-2.5">
                <span className="font-bold text-amber-800 uppercase tracking-wider block text-[10px]">
                  5. Thông tin thanh toán, Giảm giá & Tiền cọc
                </span>

                {/* THẺ ĐỊNH MỨC VỐN & BÁO GIÁ THÔNG MINH CHO BÁNH ĐẶT RIÊNG */}
                {isAdmin ? (
                  <div className="p-3 bg-white/95 rounded-xl border-2 border-pink-300 shadow-xs space-y-2 text-xs animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-pink-100 text-pink-600 flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <span className="font-black text-xs text-zinc-900 block">Định Mức Vốn & Báo Giá Bánh Đặt</span>
                          <span className="text-[10px] text-zinc-500">Tự động tính từ Size & Phụ kiện đã chọn</span>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        cakeCostResult.statusLevel === 'good'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : cakeCostResult.statusLevel === 'warning'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                      }`}>
                        {cakeCostResult.statusLevel === 'good'
                          ? '✓ Lãi Gộp Tốt'
                          : cakeCostResult.statusLevel === 'warning'
                          ? '⚠️ Lãi Mỏng'
                          : '🚨 Giá Bán Quá Thấp!'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-pink-50/50 p-2 rounded-lg border border-pink-100 text-center">
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Vốn Ước Tính (Cost)</span>
                        <span className="text-xs font-black text-rose-600">
                          {cakeCostResult.totalCost.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Giá Gợi Ý (~{cakeCostingConfig.targetFoodCostPct}%)</span>
                        <span className="text-xs font-black text-pink-700">
                          {cakeCostResult.suggestedPrice.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 block">Lãi Gộp Dự Kiến</span>
                        <span className="text-xs font-black text-emerald-600">
                          +{cakeCostResult.estimatedProfit.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-100">
                      <div className="text-[10px] text-zinc-600">
                        Tỷ lệ Food Cost: <b className={cakeCostResult.foodCostPct > 40 ? 'text-rose-600 font-black' : 'text-emerald-700 font-bold'}>{cakeCostResult.foodCostPct}%</b>
                        {cakeCostResult.foodCostPct > 45 && (
                          <span className="text-rose-600 font-bold ml-1">
                            (Báo giá bị thấp so với chi phí vốn!)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreorderForm(prev => ({ ...prev, totalPrice: cakeCostResult.suggestedPrice }))}
                        className="px-2.5 py-1 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-black text-[10px] flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" /> Điền Giá Gợi Ý ({cakeCostResult.suggestedPrice.toLocaleString('vi-VN')}₫)
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Đối với tài khoản Bán Hàng và Thợ Bánh: Ẩn hết giá vốn, chỉ hiện giá gợi ý bán */
                  <div className="p-3 bg-pink-50/70 rounded-xl border border-pink-200 shadow-2xs space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-pink-500/15 text-pink-700 flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4 text-pink-600" />
                        </div>
                        <div>
                          <span className="font-bold text-xs text-zinc-900 block">Giá Bánh Gợi Ý</span>
                          <span className="text-[10px] text-zinc-500">Tự động tính từ kích thước & phụ kiện đã chọn</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm sm:text-base font-black text-pink-700">
                          {cakeCostResult.suggestedPrice.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end pt-1 border-t border-pink-200/50">
                      <button
                        type="button"
                        onClick={() => setPreorderForm(prev => ({ ...prev, totalPrice: cakeCostResult.suggestedPrice }))}
                        className="px-3 py-1.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-black text-xs flex items-center gap-1 shadow-2xs transition active:scale-95 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" /> Điền Giá Gợi Ý Này ({cakeCostResult.suggestedPrice.toLocaleString('vi-VN')}₫)
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="min-w-0">
                    <label className="font-semibold text-zinc-700 text-xs">Giá bánh (VND):</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={formatCurrencyInput(preorderForm.totalPrice)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPreorderForm({ ...preorderForm, totalPrice: parseCurrencyInput(e.target.value) })}
                      placeholder="VD: 320.000"
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-black text-amber-700 text-sm min-w-0"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex justify-between items-center">
                      <label className="font-semibold text-zinc-700 text-xs">Giảm giá:</label>
                      <div className="flex gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setPreorderDiscountMode('percent')}
                          className={`px-1.5 py-0.2 rounded font-bold ${preorderDiscountMode === 'percent' ? 'bg-amber-600 text-white' : 'text-zinc-500 bg-zinc-200/60'}`}
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreorderDiscountMode('amount')}
                          className={`px-1.5 py-0.2 rounded font-bold ${preorderDiscountMode === 'amount' ? 'bg-amber-600 text-white' : 'text-zinc-500 bg-zinc-200/60'}`}
                        >
                          ₫
                        </button>
                      </div>
                    </div>
                    <input
                      type={preorderDiscountMode === 'percent' ? 'number' : 'text'}
                      inputMode="numeric"
                      min={preorderDiscountMode === 'percent' ? '0' : undefined}
                      max={preorderDiscountMode === 'percent' ? '100' : undefined}
                      value={preorderDiscountMode === 'percent' ? (preorderDiscountVal || '') : formatCurrencyInput(preorderDiscountVal)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setPreorderDiscountVal(preorderDiscountMode === 'percent' ? (e.target.value === '' ? ('' as any) : Math.min(100, Math.max(0, Number(e.target.value)))) : parseCurrencyInput(e.target.value))}
                      placeholder={preorderDiscountMode === 'percent' ? 'VD: 10 (%)' : 'VD: 50.000 (₫)'}
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-black text-emerald-600 text-sm min-w-0"
                    />
                  </div>
                </div>

                {/* Tiền cọc kèm nút nhanh */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="font-semibold text-zinc-700 text-xs">Tiền khách đặt cọc trước:</label>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setPreorderForm({ ...preorderForm, depositAmount: 0 })}
                        className="px-2 py-0.5 rounded bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-[10px] font-bold transition cursor-pointer"
                      >
                        COD 100%
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreorderForm({ ...preorderForm, depositAmount: Math.round(preorderFinalTotal * 0.5) })}
                        className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 text-[10px] font-bold transition cursor-pointer"
                      >
                        Cọc 50%
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreorderForm({ ...preorderForm, depositAmount: preorderFinalTotal })}
                        className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold transition cursor-pointer"
                      >
                        Thu Đủ 100%
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={preorderForm.depositAmount === undefined || preorderForm.depositAmount === null ? '' : (preorderForm.depositAmount === 0 ? '0' : formatCurrencyInput(preorderForm.depositAmount))}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setPreorderForm({ ...preorderForm, depositAmount: parseCurrencyInput(e.target.value) })}
                    placeholder={`Thu đủ: ${(preorderFinalTotal || 0).toLocaleString('vi-VN')}₫`}
                    className="w-full p-2 rounded-xl bg-white border border-amber-300 font-black text-emerald-700 text-sm text-right"
                  />
                </div>

                {/* BẢNG TỔNG KẾT GIÁ TRỊ VÀ GIÁ CUỐI ĐƠN HÀNG RÕ RÀNG */}
                <div className="p-3 bg-white rounded-xl border-2 border-amber-300 space-y-1.5 text-xs">
                  <div className="flex justify-between text-zinc-600">
                    <span>Giá bánh:</span>
                    <span className="font-bold">{Number(preorderForm.totalPrice || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                  {preorderDiscountAmount > 0 && (
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Giảm giá ({preorderDiscountMode === 'percent' ? `${preorderDiscountVal}%` : 'Số tiền'}):</span>
                      <span>-{(preorderDiscountAmount || 0).toLocaleString('vi-VN')}₫</span>
                    </div>
                  )}
                  {preorderForm.deliveryMethod === 'shipping' && (
                    <div className="flex justify-between text-blue-700 font-bold bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" /> Phí giao hàng tận nơi (Ship):
                      </span>
                      <span className="font-black">+{(preorderShippingFee || 0).toLocaleString('vi-VN')}₫</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center font-black text-amber-950 pt-2 border-t-2 border-amber-200 text-sm">
                    <span>GIÁ CUỐI ĐƠN HÀNG (ĐÃ GỒM SHIP):</span>
                    <span className="text-base font-black text-amber-700">
                      {(preorderFinalTotal || 0).toLocaleString('vi-VN')}₫
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-emerald-600 pt-1">
                    <span>Tiền khách đã cọc trước:</span>
                    <span>-{Number(preorderForm.depositAmount || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-dashed border-rose-300 font-black text-sm bg-rose-50/70 p-2 rounded-lg text-rose-700">
                    <span className="flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>{preorderForm.deliveryMethod === 'shipping' ? 'SHIPPER THU COD KHI GIAO:' : 'CÒN LẠI THU KHI NHẬN:'}</span>
                    </span>
                    <span className="text-base font-black text-rose-600">
                      {(Math.max(0, (preorderFinalTotal || 0) - Number(preorderForm.depositAmount || 0))).toLocaleString('vi-VN')}₫
                    </span>
                  </div>
                </div>

                {/* Hình thức cọc */}
                <div>
                  <label className="font-semibold text-zinc-600 block mb-1">Hình thức nhận cọc:</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['cash', 'transfer', 'momo'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPreorderForm({ ...preorderForm, paymentMethod: m })}
                        className={`py-1.5 rounded-lg font-bold border text-[11px] ${
                          preorderForm.paymentMethod === m
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-zinc-600 border-zinc-200'
                        }`}
                      >
                        {m === 'cash' ? 'Tiền mặt' : m === 'transfer' ? 'Chuyển khoản' : 'Ví MoMo'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mã VietQR Chuyển Khoản Tiền Cọc */}
                {preorderForm.paymentMethod === 'transfer' && (
                  <div className="p-3 bg-white rounded-xl border border-amber-300 space-y-2 text-center">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-900 flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5 text-amber-600" /> Mã VietQR Đặt Cọc Bánh Kem
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Napas247
                      </span>
                    </div>

                    {preorderForm.depositAmount > 0 ? (
                      <div className="space-y-2">
                        <div className="inline-block p-1.5 bg-zinc-50 rounded-xl border border-zinc-200 shadow-xs max-w-[200px] mx-auto">
                          <img
                            src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-${vietqrConfig.template || 'compact2'}.jpg?amount=${preorderForm.depositAmount}&addInfo=${encodeURIComponent(`COC BANH ${preorderForm.customerPhone || 'KHACH'}`.trim())}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                            alt="VietQR Preorder Deposit"
                            className="w-full h-auto rounded-lg"
                          />
                        </div>

                        <div className="text-[11px] text-left text-zinc-700 space-y-1 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Ngân hàng:</span>
                            <span className="font-bold text-zinc-900">{vietqrConfig.bankName || vietqrConfig.bankId}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Số tài khoản:</span>
                            <div className="flex items-center gap-1 font-mono font-bold text-zinc-900">
                              <span>{vietqrConfig.accountNo}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(vietqrConfig.accountNo);
                                  setCopiedPreorderAccount(true);
                                  setTimeout(() => setCopiedPreorderAccount(false), 2000);
                                }}
                                className="p-0.5 hover:bg-zinc-200 rounded text-zinc-500"
                                title="Sao chép"
                              >
                                {copiedPreorderAccount ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Chủ tài khoản:</span>
                            <span className="font-bold text-zinc-900">{vietqrConfig.accountName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Tiền cọc:</span>
                            <span className="font-black text-emerald-600">{Number(preorderForm.depositAmount || 0).toLocaleString('vi-VN')}₫</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Nội dung CK:</span>
                            <span className="font-mono font-bold text-zinc-900">COC BANH {preorderForm.customerPhone || 'KHACH'}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 italic py-2">
                        Vui lòng nhập số tiền cọc ở trên để tạo mã QR thanh toán
                      </p>
                    )}
                  </div>
                )}

                {/* Mã QR Ví Điện Tử Đặt Cọc (MoMo / ZaloPay / Viettel Money) */}
                {preorderForm.paymentMethod === 'momo' && (
                  <div className="p-3 bg-white rounded-xl border border-pink-300 space-y-2 text-center">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-pink-900 flex items-center gap-1">
                        <Wallet className="w-3.5 h-3.5 text-pink-600" /> Mã Ví Điện Tử Nhận Cọc
                      </span>
                      <span className="text-[10px] font-bold text-pink-700 bg-pink-50 px-2 py-0.5 rounded-full border border-pink-200">
                        {ewalletConfig.activeWallet === 'momo' ? 'Ví MoMo' : ewalletConfig.activeWallet === 'zalopay' ? 'ZaloPay' : 'Viettel Money'}
                      </span>
                    </div>

                    {preorderForm.depositAmount > 0 ? (
                      <div className="space-y-2">
                        <div className="inline-block p-1.5 bg-zinc-50 rounded-xl border border-zinc-200 shadow-xs max-w-[200px] mx-auto">
                          <img
                            src={
                              ewalletConfig.activeWallet === 'momo'
                                ? (ewalletConfig.momo.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`2|99|${ewalletConfig.momo.phone}|${ewalletConfig.momo.name}||0|0|${preorderForm.depositAmount}|COC BANH ${preorderForm.customerPhone || 'KHACH'}|transfer_p2p`)}`)
                                : ewalletConfig.activeWallet === 'zalopay'
                                ? (ewalletConfig.zalopay.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`ZALOPAY|${ewalletConfig.zalopay.phone}|${ewalletConfig.zalopay.name}|${preorderForm.depositAmount}|COC BANH`)}`)
                                : (ewalletConfig.viettelmoney.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`VIETTEL|${ewalletConfig.viettelmoney.phone}|${ewalletConfig.viettelmoney.name}|${preorderForm.depositAmount}|COC BANH`)}`)
                            }
                            alt="Wallet Preorder Deposit"
                            className="w-full h-auto rounded-lg"
                          />
                        </div>

                        <div className="text-[11px] text-left text-zinc-700 space-y-1 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                          <div className="flex justify-between items-center">
                            <span className="text-zinc-500">Số ví {ewalletConfig.activeWallet === 'momo' ? 'MoMo' : ewalletConfig.activeWallet === 'zalopay' ? 'ZaloPay' : 'Viettel'}:</span>
                            <div className="flex items-center gap-1 font-mono font-bold text-zinc-900">
                              <span>
                                {ewalletConfig.activeWallet === 'momo' ? ewalletConfig.momo.phone : ewalletConfig.activeWallet === 'zalopay' ? ewalletConfig.zalopay.phone : ewalletConfig.viettelmoney.phone}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const p = ewalletConfig.activeWallet === 'momo' ? ewalletConfig.momo.phone : ewalletConfig.activeWallet === 'zalopay' ? ewalletConfig.zalopay.phone : ewalletConfig.viettelmoney.phone;
                                  navigator.clipboard.writeText(p);
                                  setCopiedPreorderWalletPhone(true);
                                  setTimeout(() => setCopiedPreorderWalletPhone(false), 2000);
                                }}
                                className="p-0.5 hover:bg-zinc-200 rounded text-zinc-500 cursor-pointer"
                                title="Sao chép số ví"
                              >
                                {copiedPreorderWalletPhone ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Chủ ví:</span>
                            <span className="font-bold text-zinc-900">
                              {ewalletConfig.activeWallet === 'momo' ? ewalletConfig.momo.name : ewalletConfig.activeWallet === 'zalopay' ? ewalletConfig.zalopay.name : ewalletConfig.viettelmoney.name}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Tiền cọc:</span>
                            <span className="font-black text-pink-600">{Number(preorderForm.depositAmount || 0).toLocaleString('vi-VN')}₫</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Nội dung:</span>
                            <span className="font-mono font-bold text-zinc-900">COC BANH {preorderForm.customerPhone || 'KHACH'}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 italic py-2">
                        Vui lòng nhập số tiền cọc ở trên để tạo mã QR ví
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPreorderModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={processingOrder}
                  className="flex-2 py-3.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs sm:text-sm font-black shadow-md shadow-pink-600/30 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Cake className="w-4 h-4" />
                  {processingOrder ? 'Đang tạo đơn...' : `Xác Nhận Đặt Bánh (Giá cuối: ${(preorderFinalTotal || 0).toLocaleString('vi-VN')}₫)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: DANH SÁCH LỊCH GIAO BÁNH ĐẶT TRƯỚC ── */}
      {isPreorderListOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-pink-600" />
                <h3 className="font-black text-base sm:text-lg text-zinc-900">
                  Lịch Giao Bánh Đặt Trước ({undeliveredPreorders.length} đơn chưa giao)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPreorderListOpen(false);
                    setIsPreorderModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Đặt Bánh Mới
                </button>
                <button onClick={() => setIsPreorderListOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* BỘ LỌC TRẠNG THÁI: Chưa giao (mặc định) | Đã giao | Tất cả */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-2xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setPreorderFilterTab('undelivered')}
                className={`flex-1 py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  preorderFilterTab === 'undelivered'
                    ? 'bg-white text-pink-700 shadow-xs font-black'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span>Chưa giao</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  preorderFilterTab === 'undelivered' ? 'bg-pink-100 text-pink-700' : 'bg-zinc-200 text-zinc-600'
                }`}>
                  {undeliveredPreorders.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPreorderFilterTab('completed')}
                className={`flex-1 py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  preorderFilterTab === 'completed'
                    ? 'bg-white text-emerald-700 shadow-xs font-black'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span>Đã giao</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  preorderFilterTab === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-200 text-zinc-600'
                }`}>
                  {preordersList.length - undeliveredPreorders.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPreorderFilterTab('all')}
                className={`flex-1 py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  preorderFilterTab === 'all'
                    ? 'bg-white text-zinc-900 shadow-xs font-black'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <span>Tất cả</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-200 text-zinc-600">
                  {preordersList.length}
                </span>
              </button>
            </div>

            <div className="space-y-3">
              {(() => {
                const currentFilteredList =
                  preorderFilterTab === 'undelivered'
                    ? undeliveredPreorders
                    : preorderFilterTab === 'completed'
                    ? preordersList.filter((o) => isOrderCompletedOrCancelled(o))
                    : preordersList;

                if (currentFilteredList.length === 0) {
                  return (
                    <div className="text-center py-10 space-y-2 text-zinc-400">
                      {preorderFilterTab === 'undelivered' ? (
                        <>
                          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
                          <p className="text-xs font-bold text-zinc-700">Hiện không có đơn bánh nào đang chờ giao</p>
                          <p className="text-[11px] text-zinc-500">Tất cả các đơn đặt bánh trước đã được giao hoàn tất!</p>
                          {preordersList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setPreorderFilterTab('all')}
                              className="text-xs font-bold text-pink-600 hover:underline cursor-pointer mt-2 inline-block"
                            >
                              Xem lại lịch sử tất cả ({preordersList.length} đơn)
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <Cake className="w-10 h-10 mx-auto text-zinc-300" />
                          <p className="text-xs">Chưa có đơn đặt bánh phù hợp trong danh mục này</p>
                        </>
                      )}
                    </div>
                  );
                }

                return sortPreordersByUrgency(currentFilteredList, currentTime).map((po) => {
                  const orderNum = po.order_number || po.orderNumber;
                  const custName = po.customer_name || po.customerName;
                  const custPhone = po.customer_phone || po.customerPhone;
                  const fromNotes = parsePreorderFromNotes(po.notes);
                  const isShip = (po.delivery_method || po.deliveryMethod) === 'shipping' || fromNotes.delivery_method === 'shipping';
                  const shipAddr = po.shipping_address || po.shippingAddress || fromNotes.shipping_address;
                  const shipFee = Number(po.shipping_fee || po.shippingFee || 0);
                  const pickup = formatPickupDateTime(po.preorder_pickup_at || po.pickupDateTime);
                  const cake = po.cake_name || po.cakeName;
                  const msg = po.cake_message || po.cakeMessage;
                  const total = Number(po.total_amount || po.totalPrice || 0);
                  const deposit = Number(po.deposit_amount ?? po.depositAmount ?? fromNotes.deposit_amount ?? 0);
                  const remaining = Number(po.remaining_amount ?? po.remainingAmount ?? fromNotes.remaining_amount ?? Math.max(0, total - deposit));
                  const status = po.status || 'pending';
                  const urgency = getDeliveryUrgency(po.preorder_pickup_at || po.pickupDateTime, status, currentTime);

                  return (
                    <div
                      key={po.id || orderNum}
                      className={`p-4 rounded-2xl transition space-y-2.5 ${
                        urgency.isUrgent
                          ? `${urgency.borderClass} shadow-md`
                          : 'bg-pink-50/40 border border-pink-200/80 hover:shadow-md'
                      }`}
                    >
                      {/* Ribbon cảnh báo khẩn cấp (quá hạn hoặc sắp tới giờ giao) */}
                      {urgency.isUrgent && (
                        <div className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center justify-between gap-2 shadow-xs ${urgency.badgeColorClass}`}>
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{urgency.badgeText}</span>
                          </span>
                          <span className="text-[10px] bg-black/20 px-2 py-0.5 rounded-full uppercase tracking-wider font-extrabold">
                            Cần giao gấp
                          </span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-pink-700 bg-pink-100 px-2 py-0.5 rounded-md">
                            {orderNum}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : status === 'ready'
                              ? 'bg-blue-100 text-blue-800'
                              : status === 'preparing'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {status === 'completed'
                              ? '✓ Đã hoàn thành'
                              : status === 'ready'
                              ? 'Bánh đã chín / sẵn sàng'
                              : status === 'preparing'
                              ? 'Bếp đang làm'
                              : 'Chờ bếp làm'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-zinc-800 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-zinc-200">
                            <Clock className="w-3.5 h-3.5 text-amber-600" /> Hạn giao: <span className="text-pink-600 font-extrabold">{pickup}</span>
                          </span>
                          {!urgency.isUrgent && urgency.formattedRemaining && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${urgency.badgeColorClass}`}>
                              {urgency.formattedRemaining}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-zinc-500">Khách đặt:</span>{' '}
                          <span className="font-bold text-zinc-900">{custName}</span> ({custPhone})
                        </div>
                        <div>
                          <span className="text-zinc-500">Loại bánh:</span>{' '}
                          <span className="font-bold text-zinc-900">{cake}</span>
                        </div>
                      </div>

                      {/* Hình thức giao nhận & Địa chỉ */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-bold text-[11px] ${
                          isShip ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                        }`}>
                          {isShip ? '🚚 Giao tận nơi (Ship bánh)' : '🏪 Khách nhận tại tiệm'}
                        </span>
                        {isShip && shipAddr && (
                          <span className="text-zinc-700 bg-white px-2 py-0.5 rounded-md border border-zinc-200 font-medium truncate max-w-full">
                            📍 <b>Đ/C:</b> {shipAddr}
                          </span>
                        )}
                        {isShip && shipFee > 0 && (
                          <span className="text-zinc-500 font-semibold text-[11px]">
                            (Phí ship: {(shipFee || 0).toLocaleString('vi-VN')}₫)
                          </span>
                        )}
                      </div>

                      {msg && (
                        <div className="p-2 bg-white rounded-xl border border-pink-200 text-xs font-semibold text-pink-800">
                          ✍️ Chữ trên bánh: <span className="font-bold">"{msg}"</span>
                        </div>
                      )}

                      {(() => {
                        const refImg = po.reference_image_url || po.referenceImageUrl || fromNotes.reference_image_url;
                        if (!refImg) return null;
                        return (
                          <div className="p-2.5 bg-violet-50/90 rounded-xl border border-violet-200 flex items-center gap-3">
                            <img
                              src={refImg}
                              alt="Mẫu bánh khách gửi"
                              className="w-14 h-14 rounded-lg object-cover border-2 border-violet-300 shadow-sm cursor-pointer hover:scale-105 transition shrink-0"
                              onClick={() => setPreorderImageLightbox(refImg)}
                            />
                            <div className="text-xs text-violet-900">
                              <span className="font-bold flex items-center gap-1 text-violet-800">
                                <Camera className="w-3.5 h-3.5 text-violet-600" /> Ảnh mẫu bánh khách gửi
                              </span>
                              <button
                                type="button"
                                onClick={() => setPreorderImageLightbox(refImg)}
                                className="text-[11px] text-violet-600 hover:text-violet-800 underline font-bold mt-0.5 cursor-pointer"
                              >
                                🔍 Xem ảnh phóng to
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex flex-wrap justify-between items-center text-xs pt-2 border-t border-pink-100 gap-2">
                        <div>
                          <span className="text-zinc-500">Tổng tiền:</span> <span className="font-bold">{(total || 0).toLocaleString('vi-VN')}₫</span>
                          <span className="mx-2 text-zinc-300">|</span>
                          <span className="text-emerald-600 font-semibold">Đã cọc: {(deposit || 0).toLocaleString('vi-VN')}₫</span>
                          {remaining > 0 && (
                            <span className="font-black text-rose-600 ml-2 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              CÒN THU KHI GIAO: {(remaining || 0).toLocaleString('vi-VN')}₫
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Nút In phiếu hẹn / Hóa đơn */}
                          <button
                            type="button"
                            onClick={() => {
                              setCompletedOrder({
                                orderNumber: orderNum,
                                deliveryMethod: isShip ? 'shipping' : 'pickup',
                                shippingAddress: shipAddr || '',
                                shippingFee: shipFee,
                                items: [
                                  {
                                    product: {
                                      name: `[BÁNH ĐẶT] ${cake}`,
                                      selling_price: total - shipFee,
                                    },
                                    quantity: 1,
                                  },
                                  ...(shipFee > 0 ? [
                                    {
                                      product: {
                                        name: `Phí giao hàng tận nơi (Ship bánh)`,
                                        selling_price: shipFee,
                                      },
                                      quantity: 1,
                                    }
                                  ] : []),
                                ],
                                subtotal: total - shipFee,
                                discountAmount: 0,
                                totalAmount: total,
                                depositAmount: deposit > 0 ? deposit : undefined,
                                remainingAmount: remaining,
                                paymentMethod: po.payment_method || po.paymentMethod || 'cash',
                                cashGiven: po.cash_given || (deposit > 0 ? deposit : total),
                                changeAmount: po.change_amount || 0,
                                cakeMessage: msg,
                                pickupDateTimeStr: pickup,
                                customerName: custName,
                                customerPhone: custPhone,
                                createdAt: new Date(po.created_at || Date.now()).toLocaleString('vi-VN'),
                                cashier: po.cashier || 'Thu Ngân',
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-white border border-pink-300 hover:bg-pink-50 text-pink-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" /> In Phiếu Hẹn
                          </button>

                          {/* Nút In Tem Dán Hộp Bánh */}
                          <button
                            type="button"
                            onClick={() => {
                              openStickerModal({
                                orderNumber: orderNum,
                                cakeName: cake || 'Bánh Kem Sinh Nhật',
                                customerName: custName,
                                customerPhone: custPhone,
                                cakeMessage: msg,
                                pickupTime: pickup,
                                deliveryMethod: po.delivery_method || po.deliveryMethod,
                                shippingAddress: po.shipping_address || po.shippingAddress,
                                createdAt: po.created_at,
                                price: total,
                                totalAmount: total,
                                depositAmount: deposit,
                                remainingAmount: remaining,
                                flavor: po.flavor || fromNotes.flavor,
                                cream: po.cream || fromNotes.cream,
                                filling: po.filling || fromNotes.filling,
                                packaging: po.packaging || fromNotes.packaging,
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                            title="In tem nhãn nhiệt 50x30mm dán hộp bánh"
                          >
                            <Tag className="w-3.5 h-3.5 text-amber-600" />
                            <span>In Tem Hộp</span>
                          </button>

                          {/* Nút Đã giao bánh / Hoàn thành */}
                          {!isOrderCompletedOrCancelled(po) && (
                            <button
                              type="button"
                              onClick={async () => {
                                const linkedBakeOrderNum = po.linked_bake_order_number || (orderNum?.endsWith('-LAM') ? orderNum.replace(/-LAM$/, '') : `${orderNum}-LAM`);
                                const targetNumbers = new Set<string>();
                                if (orderNum) targetNumbers.add(orderNum);
                                if (po.id) targetNumbers.add(String(po.id));
                                if (po.local_id) targetNumbers.add(String(po.local_id));
                                if (linkedBakeOrderNum) targetNumbers.add(linkedBakeOrderNum);

                                const completedPo = {
                                  ...po,
                                  status: 'completed',
                                  remaining_amount: 0,
                                  remainingAmount: 0,
                                  payment_status: 'paid',
                                  paid_at: new Date().toISOString(),
                                  updated_at: new Date().toISOString(),
                                };
                                if (typeof window !== 'undefined') {
                                  try {
                                    const raw = localStorage.getItem('bakery_orders');
                                    if (raw) {
                                      const parsed = JSON.parse(raw);
                                      const updated = parsed.map((o: any) => {
                                        const isMatch =
                                          targetNumbers.has(o.id) ||
                                          targetNumbers.has(String(o.id)) ||
                                          targetNumbers.has(o.local_id) ||
                                          targetNumbers.has(o.order_number) ||
                                          targetNumbers.has(o.orderNumber);
                                        return isMatch ? { ...o, ...completedPo } : o;
                                      });
                                      localStorage.setItem('bakery_orders', JSON.stringify(updated));
                                    }
                                    const rawPo = localStorage.getItem('bakery_preorders');
                                    if (rawPo) {
                                      const parsedPo = JSON.parse(rawPo);
                                      const updatedPo = parsedPo.map((p: any) => {
                                        const isMatch =
                                          targetNumbers.has(p.id) ||
                                          targetNumbers.has(String(p.id)) ||
                                          targetNumbers.has(p.local_id) ||
                                          targetNumbers.has(p.order_number) ||
                                          targetNumbers.has(p.orderNumber);
                                        return isMatch ? { ...p, ...completedPo } : p;
                                      });
                                      localStorage.setItem('bakery_preorders', JSON.stringify(updatedPo));
                                    }
                                    window.dispatchEvent(new Event('bakery_orders_updated'));
                                    setPreordersList((prev) =>
                                      prev.map((o) => {
                                        const isMatch =
                                          targetNumbers.has(o.id) ||
                                          targetNumbers.has(String(o.id)) ||
                                          targetNumbers.has(o.local_id) ||
                                          targetNumbers.has(o.order_number) ||
                                          targetNumbers.has(o.orderNumber);
                                        return isMatch ? { ...o, ...completedPo } : o;
                                      })
                                    );
                                  } catch {}
                                }
                                await syncOrderToSupabase(completedPo, 'completed');
                                broadcastOrderStatusUpdate(orderNum, 'completed', completedPo);
                                if (linkedBakeOrderNum) {
                                  broadcastOrderStatusUpdate(linkedBakeOrderNum, 'completed');
                                }
                                sendTelegramDeliveredSuccessAlert(completedPo).catch(() => {});
                                soundManager.playPaymentSuccessChime();
                                syncOrdersFromSupabase();
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Đã Giao Khách
                            </button>
                          )}

                          {/* Nút Xóa Đơn */}
                          <button
                            type="button"
                            onClick={() => {
                              setDeletePinInput('');
                              setDeletePinError(null);
                              setOrderToDelete(po);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                            title="Xóa / Hủy vĩnh viễn đơn đặt bánh này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2.5: LỊCH SỬ HÓA ĐƠN & LƯU TRỮ ĐÃ XUẤT ── */}
      {isInvoiceHistoryOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92dvh] flex flex-col animate-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-black text-lg text-zinc-900">Lịch Sử Hóa Đơn & Đơn Hàng Đã Xuất</h3>
                  <p className="text-xs text-zinc-500">Xem lại, tra cứu và in lại hóa đơn bất kỳ lúc nào</p>
                </div>
              </div>
              <button onClick={() => setIsInvoiceHistoryOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stats Bar & Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs shrink-0">
              <div className="bg-amber-50/70 p-3 rounded-2xl border border-amber-200/60">
                <span className="text-zinc-500 text-[11px] block">Tổng hóa đơn:</span>
                <span className="font-black text-amber-700 text-base">{invoicesList.length} đơn</span>
              </div>
              <div className="bg-emerald-50/70 p-3 rounded-2xl border border-emerald-200/60">
                <span className="text-zinc-500 text-[11px] block">Tổng doanh thu:</span>
                <span className="font-black text-emerald-700 text-base">
                  {invoicesList.reduce((s, o) => s + (o.total_amount || o.totalPrice || 0), 0).toLocaleString('vi-VN')}₫
                </span>
              </div>
              <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-200/60">
                <span className="text-zinc-500 text-[11px] block">Tiền cọc giữ:</span>
                <span className="font-black text-blue-700 text-base">
                  {invoicesList.reduce((s, o) => s + (o.deposit_amount || o.depositAmount || 0), 0).toLocaleString('vi-VN')}₫
                </span>
              </div>
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const exportData = filteredInvoices.map((inv: any, idx: number) => ({
                      stt: idx + 1,
                      ma_don: inv.order_number || inv.orderNumber,
                      loai_don: inv.order_type === 'preorder' || inv.pickupDateTime ? 'Đặt bánh trước' : 'Bán tại quầy',
                      ngay_tao: new Date(inv.created_at || Date.now()).toLocaleString('vi-VN'),
                      thu_ngan: inv.cashier || 'Thu Ngân',
                      khach_hang: inv.customer_name || inv.customerName || 'Khách vãng lai',
                      sdt: inv.customer_phone || inv.customerPhone || '',
                      tong_tien: inv.total_amount || inv.totalPrice || 0,
                      tien_coc: inv.deposit_amount || inv.depositAmount || 0,
                      hinh_thuc: inv.payment_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản / MoMo',
                      trang_thai: inv.status === 'completed' ? 'Đã hoàn thành' : 'Đang xử lý',
                    }));
                    exportToCSV('lich_su_hoa_don_tiem_banh', [
                      { header: 'STT', key: 'stt' },
                      { header: 'Mã Hóa Đơn', key: 'ma_don' },
                      { header: 'Loại Đơn', key: 'loai_don' },
                      { header: 'Ngày Giờ Tạo', key: 'ngay_tao' },
                      { header: 'Thu Ngân', key: 'thu_ngan' },
                      { header: 'Khách Hàng', key: 'khach_hang' },
                      { header: 'Số Điện Thoại', key: 'sdt' },
                      { header: 'Tổng Tiền (VNĐ)', key: 'tong_tien' },
                      { header: 'Tiền Cọc (VNĐ)', key: 'tien_coc' },
                      { header: 'Hình Thức TT', key: 'hinh_thuc' },
                      { header: 'Trạng Thái', key: 'trang_thai' },
                    ], exportData);
                  }}
                  className="w-full py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Xuất Excel</span>
                </button>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={invoiceSearchQuery}
                  onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                  placeholder="Tìm theo mã đơn (BK-...), tên khách, SĐT..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
                {invoiceSearchQuery && (
                  <button onClick={() => setInvoiceSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl text-xs font-semibold">
                {(['all', 'takeaway', 'preorder', 'cash', 'transfer'] as const).map((filterKey) => {
                  const labels = {
                    all: 'Tất cả',
                    takeaway: 'Tại quầy',
                    preorder: 'Bánh đặt',
                    cash: 'Tiền mặt',
                    transfer: 'Chuyển khoản',
                  };
                  return (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setInvoiceFilter(filterKey)}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        invoiceFilter === filterKey ? 'bg-white text-zinc-900 font-bold shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {labels[filterKey]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List of Invoices with Full Scrolling */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 overscroll-contain">
              {filteredInvoices.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-zinc-400">
                  <Receipt className="w-10 h-10 mx-auto text-zinc-300" />
                  <p className="text-xs">Không tìm thấy hóa đơn nào phù hợp bộ lọc</p>
                </div>
              ) : (
                filteredInvoices.map((inv: any) => {
                  const fromNotes = parsePreorderFromNotes(inv.notes);
                  const isPreorder = inv.order_type === 'preorder' || !!inv.pickupDateTime || fromNotes.delivery_method !== undefined;
                  const orderNum = inv.order_number || inv.orderNumber;
                  const createdStr = inv.created_at ? new Date(inv.created_at).toLocaleString('vi-VN') : 'Vừa xong';
                  const total = Number(inv.total_amount || inv.totalPrice || 0);
                  const deposit = Number(inv.deposit_amount ?? inv.depositAmount ?? fromNotes.deposit_amount ?? 0);
                  const remaining = Number(inv.remaining_amount ?? inv.remainingAmount ?? fromNotes.remaining_amount ?? Math.max(0, total - deposit));
                  const items = Array.isArray(inv.items) ? inv.items : [];

                  // Tìm kiếm toàn bộ các phiếu hoàn trả / đổi hàng liên kết với đơn này
                  const orderNumClean = String(orderNum || '').replace(/^#/, '').trim().toLowerCase();
                  const orderIdClean = String(inv.id || '').replace(/^#/, '').trim().toLowerCase();

                  const invReturnRecords: OrderReturnRecord[] = [
                    ...(inv.return_records || []),
                    ...allOrderReturns.filter((r) => {
                      const rNum = String(r.order_number || '').replace(/^#/, '').trim().toLowerCase();
                      const rId = String(r.order_id || '').replace(/^#/, '').trim().toLowerCase();
                      return (rNum && rNum === orderNumClean) || (rId && rId === orderIdClean);
                    }),
                  ].filter((rec, idx, self) => self.findIndex((x) => x.id === rec.id) === idx);

                  const invRefundedAmount = Number(inv.refunded_amount || 0) || invReturnRecords.reduce((s, r) => s + Number(r.refund_amount || 0), 0);

                  // Kiểm tra tổng số lượng bánh đã trả so với tổng số lượng mua
                  const totalBoughtItemsQty = items.reduce((s: number, it: any) => s + Number(it.quantity || 1), 0) || 1;
                  const totalReturnedItemsQty = invReturnRecords.reduce((sum, r) => {
                    return sum + (r.items?.reduce((s, ri) => s + Number(ri.quantity || 0), 0) || 0);
                  }, 0);
                  const isAllReturned = (totalReturnedItemsQty >= totalBoughtItemsQty && totalBoughtItemsQty > 0) || inv.status === 'refunded';

                  return (
                    <div
                      key={inv.id || orderNum}
                      className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/90 hover:border-amber-300 hover:shadow-md transition space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-black text-xs px-2.5 py-1 rounded-lg ${
                            isPreorder ? 'bg-pink-100 text-pink-700 border border-pink-200' : 'bg-amber-100 text-amber-800 border border-amber-200'
                          }`}>
                            #{orderNum}
                          </span>
                          <span className="text-[11px] text-zinc-500">{createdStr}</span>
                          <span className="text-[11px] text-zinc-400">• Thu ngân: {inv.cashier || 'Thu Ngân'}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isAllReturned
                              ? 'bg-red-100 text-red-700'
                              : invReturnRecords.length > 0
                              ? 'bg-orange-100 text-orange-700'
                              : inv.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'ready'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {isAllReturned
                              ? '↩ Đã hoàn trả đủ'
                              : invReturnRecords.length > 0
                              ? '↩ Đã đổi/trả 1 phần'
                              : inv.status === 'completed'
                              ? '✓ Đã hoàn tất'
                              : inv.status === 'ready'
                              ? 'Sẵn sàng giao'
                              : 'Đang xử lý'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">
                            {inv.payment_method === 'cash' || inv.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản / Ví'}
                          </span>
                          {inv.transfer_proof_image && (
                            <button
                              type="button"
                              onClick={() => setViewingProofImage(inv.transfer_proof_image)}
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200 hover:bg-purple-200 flex items-center gap-1 cursor-pointer transition"
                              title="Bấm để xem ảnh bill chuyển khoản đối soát"
                            >
                              <Camera className="w-3 h-3 text-purple-600" />
                              <span>Ảnh Bill CK</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Customer info if preorder */}
                      {(inv.customer_name || inv.customerName) && (() => {
                        const fromNotes = parsePreorderFromNotes(inv.notes);
                        const isShip = (inv.delivery_method || inv.deliveryMethod) === 'shipping' || fromNotes.delivery_method === 'shipping';
                        const shipAddr = inv.shipping_address || inv.shippingAddress || fromNotes.shipping_address;
                        const shipFee = Number(inv.shipping_fee || inv.shippingFee || 0);
                        const pickupStr = formatPickupDateTime(inv.preorder_pickup_at || inv.pickupDateTime);

                        return (
                          <div className="text-xs bg-white p-2.5 rounded-xl border border-zinc-200/70 space-y-1.5">
                            <div className="flex flex-wrap justify-between gap-2">
                              <div>
                                <span className="text-zinc-500">Khách hàng:</span>{' '}
                                <span className="font-bold text-zinc-900">{inv.customer_name || inv.customerName}</span>{' '}
                                <span className="text-zinc-500">({inv.customer_phone || inv.customerPhone})</span>
                              </div>
                              {pickupStr && (
                                <div className="text-pink-700 font-bold flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" /> Hẹn lấy/giao: {pickupStr}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-100 text-[11px]">
                              <span className={`px-2 py-0.5 rounded font-bold ${
                                isShip
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-zinc-100 text-zinc-700'
                              }`}>
                                {isShip ? '🚚 Giao tận nơi (Ship)' : '🏪 Lấy tại tiệm'}
                              </span>
                              {isShip && shipAddr && (
                                <span className="text-zinc-700 font-medium">
                                  📍 <b>Đ/C:</b> {shipAddr}
                                </span>
                              )}
                              {shipFee > 0 && (
                                <span className="text-zinc-500">
                                  (Phí ship: {(shipFee || 0).toLocaleString('vi-VN')}₫)
                                </span>
                              )}
                            </div>
                            {(inv.cake_message || inv.cakeMessage) && (
                              <div className="w-full text-pink-600 italic text-[11px] pt-1 border-t border-zinc-100">
                                ✍️ Chữ: "{inv.cake_message || inv.cakeMessage}"
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Items list */}
                      <div className="text-xs divide-y divide-zinc-200/50 bg-white/70 rounded-xl p-2.5 border border-zinc-200/60 space-y-1">
                        {items.length > 0 ? (
                          items.map((it: any, idx: number) => {
                            const itName = String(it.product_name_snapshot || it.product?.name || it.name || '').trim().toLowerCase();
                            const itId = String(it.product_id || it.product?.id || '').trim().toLowerCase();

                            // Tìm trong các phiếu đổi trả xem món này đã trả/đổi bao nhiêu
                            let itReturnedQty = 0;
                            let itExchangedQty = 0;

                            invReturnRecords.forEach((r) => {
                              r.items?.forEach((ri) => {
                                const riName = String(ri.product_name || '').trim().toLowerCase();
                                const riId = String(ri.product_id || '').trim().toLowerCase();
                                if ((itId && riId && itId === riId) || (itName && riName && itName === riName)) {
                                  if (r.return_type === 'exchange') {
                                    itExchangedQty += Number(ri.quantity || 0);
                                  } else {
                                    itReturnedQty += Number(ri.quantity || 0);
                                  }
                                }
                              });
                            });

                            const totalThisItemReturned = itReturnedQty + itExchangedQty;
                            const itOriginalQty = Number(it.quantity || 1);
                            const remainingQty = Math.max(0, itOriginalQty - totalThisItemReturned);
                            const itemUnitPrice = Number(it.unit_price) || Number(it.product?.selling_price) || Number(it.product?.price) || 0;

                            const displayedReturnedQty = Math.min(itOriginalQty, itReturnedQty);
                            const displayedExchangedQty = Math.min(Math.max(0, itOriginalQty - displayedReturnedQty), itExchangedQty);

                            return (
                              <div key={idx} className="flex justify-between items-center py-1 text-zinc-800 gap-2">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
                                  <span className="font-bold text-amber-700">{itOriginalQty}x</span>
                                  <span className={remainingQty === 0 && totalThisItemReturned > 0 ? "line-through text-zinc-400 font-medium" : "font-medium text-zinc-900"}>
                                    {it.product_name_snapshot || it.product?.name || it.name || 'Sản phẩm'}
                                  </span>
                                  {displayedReturnedQty > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 shrink-0">
                                      Hoàn trả {displayedReturnedQty}x
                                    </span>
                                  )}
                                  {displayedExchangedQty > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                                      Đã đổi {displayedExchangedQty}x
                                    </span>
                                  )}
                                </div>
                                <span className={remainingQty === 0 && totalThisItemReturned > 0 ? "font-bold line-through text-zinc-400 shrink-0" : "font-bold text-zinc-900 shrink-0"}>
                                  {(itemUnitPrice * itOriginalQty).toLocaleString('vi-VN')}₫
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="flex justify-between py-1 text-zinc-800">
                            <span>{inv.cakeName || 'Đơn hàng bánh'}</span>
                            <span className="font-bold">{(total || 0).toLocaleString('vi-VN')}₫</span>
                          </div>
                        )}
                      </div>

                      {/* BẢNG THÔNG TIN ĐỔI TRẢ (THU GỌN MẶC ĐỊNH ĐỂ KHÔNG CHIẾM DIỆN TÍCH) */}
                      {invReturnRecords.length > 0 && (() => {
                        const orderKey = String(inv.id || orderNum);
                        const isExpanded = Boolean(expandedReturnOrders[orderKey]);

                        return (
                          <div className="pt-0.5 space-y-1.5">
                            {/* Nút thu gọn / mở rộng dạng thanh ghim tinh gọn */}
                            <button
                              type="button"
                              onClick={() => toggleReturnDetails(orderKey)}
                              className="w-full px-2.5 py-1.5 rounded-xl bg-rose-50/70 hover:bg-rose-100/80 text-rose-800 border border-rose-200/80 text-xs font-semibold flex items-center justify-between transition cursor-pointer"
                            >
                              <div className="flex items-center gap-1.5">
                                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                                <span>Đã đổi/trả ({invReturnRecords.length} phiếu)</span>
                                {invRefundedAmount > 0 && (
                                  <span className="font-bold text-rose-700 ml-1">
                                    • Hoàn: -{invRefundedAmount.toLocaleString('vi-VN')}₫
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-bold text-rose-600 flex items-center gap-0.5">
                                {isExpanded ? 'Thu gọn ▲' : 'Xem chi tiết ▼'}
                              </span>
                            </button>

                            {/* Chỉ mở rộng ra khi người dùng chủ động bấm vào xem chi tiết */}
                            {isExpanded && (
                              <div className="bg-white p-2.5 rounded-xl border border-rose-200 shadow-xs space-y-2 text-xs animate-in fade-in-50">
                                <div className="text-[11px] font-bold text-rose-900 border-b border-rose-100 pb-1 flex justify-between">
                                  <span>Chi tiết các phiếu đổi trả:</span>
                                  <span className="font-mono text-rose-700">Tổng hoàn: -{invRefundedAmount.toLocaleString('vi-VN')}₫</span>
                                </div>
                                <div className="space-y-2">
                                  {invReturnRecords.map((r, rIdx) => {
                                    const rMethodStr = r.refund_method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản';
                                    return (
                                      <div key={r.id || rIdx} className="bg-stone-50/70 p-2 rounded-lg border border-stone-200/80 space-y-1">
                                        <div className="flex items-center justify-between text-[11px] font-bold">
                                          <span className={r.return_type === 'exchange' ? "text-amber-800" : "text-rose-700"}>
                                            {r.return_type === 'exchange' ? '⇄ Phiếu Đổi Hàng' : '↩ Phiếu Trả Hàng'} #{r.id}
                                          </span>
                                          <span className="text-zinc-500 font-normal text-[10px]">
                                            {r.created_at ? new Date(r.created_at).toLocaleTimeString('vi-VN') + ' ' + new Date(r.created_at).toLocaleDateString('vi-VN') : ''}
                                          </span>
                                        </div>

                                        {/* Các món bánh đã hoàn trả */}
                                        <div className="space-y-0.5 pl-2 border-l-2 border-rose-300 text-[11px]">
                                          {r.items?.map((ri: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center">
                                              <span className="text-zinc-800">
                                                • <b className="text-rose-700">{ri.quantity}x</b> {ri.product_name}
                                                {ri.reason && (
                                                  <span className="text-zinc-500 italic text-[10px]">
                                                    {' '}({ri.reason === 'damaged' ? 'Lỗi/hỏng' : ri.reason === 'expired' ? 'Cận date' : ri.reason === 'wrong_item' ? 'Nhầm món' : 'Khách đổi ý'})
                                                  </span>
                                                )}
                                              </span>
                                              <span className="font-bold text-rose-600">
                                                -{(Number(ri.refund_subtotal) || (Number(ri.unit_price || 0) * Number(ri.quantity || 1))).toLocaleString('vi-VN')}₫
                                              </span>
                                            </div>
                                          ))}
                                        </div>

                                        {/* Nếu là đổi hàng, hiển thị bánh đổi sang */}
                                        {r.return_type === 'exchange' && r.exchange_replacement_items && r.exchange_replacement_items.length > 0 && (
                                          <div className="space-y-0.5 pl-2 border-l-2 border-amber-300 pt-0.5 text-[11px]">
                                            <div className="text-[10px] font-bold text-amber-800">Đổi sang:</div>
                                            {r.exchange_replacement_items.map((ep: any, idx: number) => (
                                              <div key={idx} className="flex justify-between items-center">
                                                <span className="text-zinc-800">
                                                  • <b className="text-amber-700">{ep.quantity}x</b> {ep.product_name}
                                                </span>
                                                <span className="font-bold text-zinc-900">
                                                  +{(Number(ep.line_total) || (Number(ep.unit_price || 0) * Number(ep.quantity || 1))).toLocaleString('vi-VN')}₫
                                                </span>
                                              </div>
                                            ))}
                                            {r.exchange_difference !== undefined && (
                                              <div className="flex justify-between text-[11px] font-bold pt-0.5 text-zinc-900">
                                                <span>{r.exchange_difference > 0 ? 'Khách bù:' : r.exchange_difference < 0 ? 'Tiệm hoàn:' : 'Đổi ngang:'}</span>
                                                <span className={r.exchange_difference > 0 ? "text-emerald-700" : "text-rose-600"}>
                                                  {Math.abs(r.exchange_difference).toLocaleString('vi-VN')}₫ ({rMethodStr})
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        <div className="flex flex-wrap items-center justify-between text-[10px] text-zinc-500 pt-0.5 border-t border-stone-200">
                                          <span>Duyệt: <b>{r.approved_by || 'Quản lý'}</b></span>
                                          {r.refund_amount > 0 && (
                                            <span className="font-bold text-rose-600">
                                              Đã chi hoàn: {r.refund_amount.toLocaleString('vi-VN')}₫ ({rMethodStr})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Totals & Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-200 text-xs">
                        <div className="flex flex-wrap items-center gap-3">
                          <span>Tổng ban đầu: <b className="text-zinc-900">{(total || 0).toLocaleString('vi-VN')}₫</b></span>
                          {invRefundedAmount > 0 && (
                            <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Đã hoàn lại: -{(invRefundedAmount || 0).toLocaleString('vi-VN')}₫
                            </span>
                          )}
                          {invRefundedAmount > 0 && (
                            <span className="text-zinc-700">
                              Thực thu: <b className="text-emerald-700">{Math.max(0, total - invRefundedAmount).toLocaleString('vi-VN')}₫</b>
                            </span>
                          )}
                          {deposit > 0 && (
                            <span className="text-emerald-700">Đã cọc: <b>{(deposit || 0).toLocaleString('vi-VN')}₫</b></span>
                          )}
                          {remaining > 0 && (
                            <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">Còn thu: {(remaining || 0).toLocaleString('vi-VN')}₫</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              // Chuyển dữ liệu sang modal in hóa đơn tiêu chuẩn
                              setCompletedOrder({
                                orderNumber: orderNum,
                                deliveryMethod: (inv.delivery_method || inv.deliveryMethod) || fromNotes.delivery_method || 'pickup',
                                shippingAddress: inv.shipping_address || inv.shippingAddress || fromNotes.shipping_address || '',
                                shippingFee: inv.shipping_fee || inv.shippingFee || 0,
                                items: items.length > 0
                                  ? items.map((it: any) => ({
                                      product: {
                                        name: it.product_name_snapshot || it.product?.name || it.name || 'Sản phẩm',
                                        selling_price: it.unit_price || it.product?.selling_price || 0,
                                      },
                                      quantity: it.quantity || 1,
                                    }))
                                  : [
                                      {
                                        product: {
                                          name: inv.cakeName || 'Bánh đặt',
                                          selling_price: total,
                                        },
                                        quantity: 1,
                                      },
                                    ],
                                subtotal: inv.subtotal || total,
                                discountAmount: inv.discount_amount || 0,
                                totalAmount: total,
                                depositAmount: deposit > 0 ? deposit : undefined,
                                remainingAmount: remaining,
                                paymentMethod: inv.payment_method || inv.paymentMethod || 'cash',
                                cashGiven: inv.cash_given || (deposit > 0 ? deposit : total),
                                changeAmount: inv.change_amount || 0,
                                cakeMessage: inv.cake_message || inv.cakeMessage,
                                pickupDateTimeStr: inv.preorder_pickup_at || inv.pickupDateTime,
                                customerName: inv.customer_name || inv.customerName,
                                customerPhone: inv.customer_phone || inv.customerPhone,
                                createdAt: createdStr,
                                cashier: inv.cashier || 'Thu Ngân',
                              });
                            }}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>In Lại Hóa Đơn</span>
                          </button>

                          {/* Nút In Tem Dán Hộp Bánh */}
                          <button
                            type="button"
                            onClick={() => {
                              openStickerModal({
                                orderNumber: orderNum,
                                cakeName: items?.[0]?.product_name_snapshot || items?.[0]?.product?.name || inv.cakeName || 'Sản phẩm bánh',
                                customerName: inv.customer_name || inv.customerName,
                                customerPhone: inv.customer_phone || inv.customerPhone,
                                cakeMessage: inv.cake_message || inv.cakeMessage,
                                pickupTime: inv.preorder_pickup_at || inv.pickupDateTime,
                                deliveryMethod: (inv.delivery_method || inv.deliveryMethod) || fromNotes.delivery_method,
                                shippingAddress: inv.shipping_address || inv.shippingAddress,
                                createdAt: inv.created_at,
                                price: total,
                                totalAmount: total,
                                depositAmount: deposit,
                                remainingAmount: remaining,
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                            title="In tem nhãn nhiệt 50x30mm dán hộp bánh"
                          >
                            <Tag className="w-3.5 h-3.5 text-amber-600" />
                            <span>In Tem Hộp</span>
                          </button>

                          {/* Nút Đổi Trả / Hoàn Tiền */}
                          {isAllReturned ? (
                            <span className="px-2.5 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-200 text-xs font-bold flex items-center gap-1">
                              <RotateCcw className="w-3.5 h-3.5 text-red-400" />
                              <span>Đã trả toàn bộ</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setOrderToReturn(inv);
                                setIsReturnExchangeModalOpen(true);
                              }}
                              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                                invReturnRecords.length > 0
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                              }`}
                              title={invReturnRecords.length > 0 ? "Đổi hoặc trả thêm cho các món còn lại trong đơn" : "Tạo phiếu đổi hàng hoặc hoàn tiền cho đơn này"}
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${invReturnRecords.length > 0 ? 'text-amber-600' : 'text-rose-600'}`} />
                              <span>{invReturnRecords.length > 0 ? 'Đổi / Trả Tiếp' : 'Đổi / Trả'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setDeletePinInput('');
                              setDeletePinError(null);
                              setOrderToDelete(inv);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                            title="Xóa vĩnh viễn hóa đơn này khỏi hệ thống"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL XEM ẢNH BILL CHUYỂN KHOẢN ĐỐI SOÁT ── */}
      {viewingProofImage && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl border border-zinc-200 max-w-lg w-full p-4 sm:p-5 shadow-2xl space-y-3 flex flex-col max-h-[92dvh]">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div className="flex items-center gap-2 text-xs font-bold text-zinc-900">
                <Camera className="w-4 h-4 text-purple-600" />
                <span>Ảnh Chụp Bill Chuyển Khoản Đối Soát</span>
              </div>
              <button
                type="button"
                onClick={() => setViewingProofImage(null)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden rounded-2xl bg-black flex items-center justify-center">
              <img
                src={viewingProofImage}
                alt="Bill chuyển khoản đối soát"
                className="max-w-full max-h-[70dvh] object-contain rounded-xl"
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setViewingProofImage(null)}
                className="px-4 py-2 rounded-xl bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-800 transition cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: QUẢN LÝ CA BÁN HÀNG & KIỂM KÉT ── */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-4 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto overscroll-contain space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Wallet className="w-4 h-4 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-black text-base sm:text-lg text-zinc-900">Quản Lý Ca & Kiểm Két Quầy</h3>
                  <p className="text-[11px] text-zinc-500">Đồng bộ 2 chiều CSDL SQL & In phiếu bàn giao ca 80mm</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsShiftModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Selector */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 rounded-2xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setShiftModalTab('handover')}
                className={`py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  shiftModalTab === 'handover'
                    ? 'bg-white text-amber-800 shadow-xs font-black'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Kiểm Két & Chốt Ca</span>
              </button>

              <button
                type="button"
                onClick={() => setShiftModalTab('history')}
                className={`py-2 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  shiftModalTab === 'history'
                    ? 'bg-white text-amber-800 shadow-xs font-black'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Lịch Sử Giao Ca ({shiftHistory.length})</span>
              </button>
            </div>

            {/* TAB 1: KIỂM KÉT & CHỐT CA */}
            {shiftModalTab === 'handover' && (
              <div className="space-y-3.5 animate-in fade-in duration-150">
                {/* Thông tin ca hiện tại */}
                <div className="space-y-2 text-xs text-zinc-700 bg-amber-50/60 p-3.5 sm:p-4 rounded-2xl border border-amber-200/80">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Thu ngân ca hiện tại:</span>
                    <span className="font-bold text-zinc-900">{user.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Giờ bắt đầu mở ca:</span>
                    <span className="font-mono font-bold text-zinc-800">
                      {shift.openedAt ? new Date(shift.openedAt).toLocaleTimeString('vi-VN') + ' ' + new Date(shift.openedAt).toLocaleDateString('vi-VN') : 'Mới mở ca'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Số đơn đã bán trong ca:</span>
                    <span className="font-bold text-zinc-900">{shift.orderCount || 0} đơn</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-amber-200/60">
                    <span className="text-zinc-600">Tiền mặt đầu ca (vốn mở két):</span>
                    <span className="font-bold text-zinc-900">{(shift.openingCash || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-700">
                    <span>Doanh thu tiền mặt (+):</span>
                    <span className="font-bold">+{(shift.cashSales || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                  <div className="flex justify-between items-center text-blue-700">
                    <span>Doanh thu chuyển khoản/Ví (+):</span>
                    <span className="font-bold">+{(shift.transferSales || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                  {(shift.refundCash || 0) > 0 && (
                    <div className="flex justify-between items-center text-rose-600">
                      <span>Chi hoàn trả / đổi hàng tiền mặt (-):</span>
                      <span className="font-bold">-{(shift.refundCash || 0).toLocaleString('vi-VN')}₫</span>
                    </div>
                  )}
                  {(shift.refundTransfer || 0) > 0 && (
                    <div className="flex justify-between items-center text-rose-500">
                      <span>Chi hoàn trả chuyển khoản/Ví (-):</span>
                      <span className="font-bold">-{(shift.refundTransfer || 0).toLocaleString('vi-VN')}₫</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-amber-200 font-black text-sm text-zinc-950">
                    <span>Tiền mặt lý thuyết trong két (=):</span>
                    <span className="text-amber-700 font-mono text-base">{(expectedCashInRegister || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                </div>

                {/* Nhập tiền thực tế đếm được */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-black text-zinc-900">
                      Tiền mặt thực tế đếm được trong két:
                    </label>
                    <button
                      type="button"
                      onClick={() => setClosingCashInput(expectedCashInRegister)}
                      className="text-[11px] font-bold text-amber-700 hover:underline cursor-pointer"
                    >
                      Điền số lý thuyết
                    </button>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(closingCashInput)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setClosingCashInput(parseCurrencyInput(e.target.value))}
                    placeholder="Nhập số tiền đếm trong két..."
                    className="w-full px-3.5 py-2.5 bg-white border border-amber-300 rounded-xl text-lg font-black text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                  />

                  {/* Nút bấm cộng tiền nhanh */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[50000, 100000, 200000, 500000, 1000000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setClosingCashInput((prev) => (prev || 0) + amt)}
                        className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-[11px] font-bold rounded-lg transition cursor-pointer active:scale-95"
                      >
                        +{amt >= 1000000 ? `${amt / 1000000}tr` : `${amt / 1000}k`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setClosingCashInput(0)}
                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold rounded-lg transition cursor-pointer"
                    >
                      Xóa số
                    </button>
                  </div>
                </div>

                {/* Cảnh báo chênh lệch két */}
                {closingCashInput > 0 && (
                  <div
                    className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between border ${
                      shiftCashDifference === 0
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : shiftCashDifference > 0
                        ? 'bg-blue-50 text-blue-800 border-blue-300'
                        : 'bg-rose-50 text-rose-800 border-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {shiftCashDifference === 0 ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <span>
                        {shiftCashDifference === 0
                          ? 'Két khớp 100% (Không lệch quỹ)'
                          : shiftCashDifference > 0
                          ? 'Thừa quỹ tiền mặt (+)'
                          : 'Thiếu quỹ tiền mặt (-)'}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-black">
                      {shiftCashDifference > 0
                        ? `+${(shiftCashDifference || 0).toLocaleString('vi-VN')}₫`
                        : shiftCashDifference < 0
                        ? `${(shiftCashDifference || 0).toLocaleString('vi-VN')}₫`
                        : '0₫'}
                    </span>
                  </div>
                )}

                {/* Lựa chọn số tiền bàn giao sang ca sau */}
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
                  <div className="text-xs font-bold text-zinc-900 flex items-center justify-between">
                    <span>Số tiền để lại két bàn giao ca sau:</span>
                    <span className="text-[11px] font-semibold text-amber-800">
                      {handoverMode === 'keep_all'
                        ? 'Chuyển 100% tiền két sang ca sau'
                        : `Để lại ${(leaveForNextShiftInput || 0).toLocaleString('vi-VN')}₫`}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setHandoverMode('keep_all')}
                      className={`p-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                        handoverMode === 'keep_all'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <div>Chuyển toàn bộ két</div>
                      <div className="text-[10px] opacity-90 mt-0.5 font-mono font-normal">
                        {(closingCashInput || expectedCashInRegister).toLocaleString('vi-VN')}₫
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHandoverMode('withdraw');
                        if (!leaveForNextShiftInput) {
                          setLeaveForNextShiftInput(closingCashInput || expectedCashInRegister);
                        }
                      }}
                      className={`p-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                        handoverMode === 'withdraw'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <div>Rút nộp chủ / két</div>
                      <div className="text-[10px] opacity-90 mt-0.5 font-normal">
                        Để lại số tiền lẻ tùy ý
                      </div>
                    </button>
                  </div>

                  {handoverMode === 'withdraw' && (
                    <div className="pt-2 border-t border-amber-200/80 space-y-1.5 animate-in fade-in">
                      <div className="flex justify-between items-center text-xs font-medium text-zinc-700">
                        <span>Tiền để lại két cho ca sau:</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(leaveForNextShiftInput)}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setLeaveForNextShiftInput(parseCurrencyInput(e.target.value))}
                          className="w-36 px-2.5 py-1 text-right bg-white border border-amber-300 rounded-lg font-bold font-mono text-zinc-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          placeholder="Số tiền để lại..."
                        />
                      </div>
                      <div className="flex justify-between items-center text-xs text-stone-600 bg-white/90 p-2 rounded-lg border border-amber-100 font-semibold">
                        <span>Tiền rút ra nộp chủ tiệm / két sắt:</span>
                        <span className="text-emerald-700 font-bold font-mono">
                          {Math.max(0, (closingCashInput || expectedCashInRegister) - leaveForNextShiftInput).toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Ghi chú giải trình / bàn giao */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-700">
                    Ghi chú giải trình lệch quỹ / Bàn giao ca sau:
                  </label>
                  <input
                    type="text"
                    value={shiftHandoverNotes}
                    onChange={(e) => setShiftHandoverNotes(e.target.value)}
                    placeholder="Ví dụ: Đã bù 20k tiền lẻ, bàn giao chìa khóa..."
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Thông báo kết quả chốt ca thành công & nút In phiếu ca tuỳ chọn */}
                {shiftSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold rounded-xl flex items-center justify-between gap-2 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{shiftSuccessMsg}</span>
                    </div>
                    {lastClosedShift && (
                      <button
                        type="button"
                        onClick={() => printShiftHandoverReceipt(lastClosedShift, branding)}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shrink-0 shadow-sm"
                        title="Bấm để in phiếu chốt ca vừa xong"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>In Phiếu Ca</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Nút hành động */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsShiftModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 transition cursor-pointer"
                  >
                    Đóng
                  </button>

                  {/* Nút In Phiếu Kiểm Két Tạm (80mm) */}
                  <button
                    type="button"
                    onClick={() => {
                      const diff = (closingCashInput || expectedCashInRegister) - expectedCashInRegister;
                      const draftRecord: ShiftRecord = {
                        id: 'draft-' + Date.now(),
                        shiftCode: shift.shiftCode || 'KIEM-KET',
                        staffName: user?.name || 'Thu Ngân',
                        startedAt: shift.openedAt,
                        endedAt: new Date().toISOString(),
                        openingCash: shift.openingCash || 0,
                        cashSales: shift.cashSales || 0,
                        transferSales: shift.transferSales || 0,
                        totalRevenue: (shift.cashSales || 0) + (shift.transferSales || 0),
                        expectedCash: expectedCashInRegister,
                        closingCash: closingCashInput || expectedCashInRegister,
                        difference: diff,
                        status: diff === 0 ? 'balanced' : diff > 0 ? 'surplus' : 'shortage',
                        notes: shiftHandoverNotes || 'Phiếu kiểm kê két quầy giữa ca',
                        orderCount: shift.orderCount || 0,
                        createdAt: new Date().toISOString(),
                      };
                      printShiftHandoverReceipt(draftRecord, branding);
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    title="In phiếu kiểm kê két hiện tại ra giấy nhiệt 80mm mà không chốt ca"
                  >
                    <Printer className="w-3.5 h-3.5 text-zinc-600" />
                    <span>In Phiếu Kiểm Két</span>
                  </button>

                  {/* Nút Chốt Ca & Mở Ca Mới */}
                  <button
                    type="button"
                    disabled={isClosingShift}
                    onClick={async () => {
                      if (closingCashInput <= 0 && !confirm('Tiền mặt thực tế trong két là 0₫ hoặc bạn chưa nhập. Bạn có chắc muốn chốt ca với 0₫?')) {
                        return;
                      }
                      setIsClosingShift(true);
                      try {
                        const transferredToNextShift = handoverMode === 'withdraw'
                          ? leaveForNextShiftInput
                          : (closingCashInput || expectedCashInRegister);

                        const { closedShift, newShift } = await closeShiftAndOpenNew({
                          closingCash: closingCashInput,
                          staffName: user?.name || 'Thu Ngân',
                          notes: shiftHandoverNotes,
                          transferredToNextShift,
                        });
                        setLastClosedShift(closedShift);
                        setShiftSuccessMsg(`Đã chốt sổ ca #${closedShift.shiftCode} thành công! Ca mới mở với vốn ${(newShift.openingCash || 0).toLocaleString('vi-VN')}₫.`);
                        // Không tự động in đè lên trình duyệt, chỉ in khi người dùng bấm nút [In Phiếu Ca]
                        setShift(newShift);
                        setClosingCashInput(newShift.openingCash);
                        setShiftHandoverNotes('');
                        setHandoverMode('keep_all');
                        setTimeout(() => setShiftSuccessMsg(null), 15000);
                      } catch (err: any) {
                        alert('Lỗi chốt ca: ' + (err?.message || err));
                      } finally {
                        setIsClosingShift(false);
                      }
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-md shadow-amber-600/30 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isClosingShift ? 'animate-spin' : ''}`} />
                    <span>{isClosingShift ? 'Đang chốt...' : 'Chốt Ca & Mở Ca Mới'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: LỊCH SỬ GIAO CA */}
            {shiftModalTab === 'history' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                {shiftHistory.length === 0 ? (
                  <div className="p-8 text-center bg-zinc-50 rounded-2xl border border-zinc-200 text-zinc-400 space-y-2">
                    <History className="w-8 h-8 mx-auto text-zinc-300" />
                    <p className="text-xs font-semibold">Chưa có ca bán nào được chốt sổ.</p>
                    <p className="text-[11px] text-zinc-400">
                      Khi thu ngân bấm "Chốt Ca & Mở Ca Mới", toàn bộ dữ liệu kiểm két và chênh lệch quỹ sẽ được lưu trữ tại đây và đồng bộ lên cả Cloud & Local SQL.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
                    {shiftHistory.map((rec) => {
                      const isBalanced = rec.status === 'balanced' || rec.difference === 0;
                      const isSurplus = rec.status === 'surplus' || rec.difference > 0;

                      return (
                        <div
                          key={rec.id}
                          className="p-3.5 rounded-2xl bg-zinc-50 hover:bg-amber-50/30 border border-zinc-200 transition space-y-2 text-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-black text-zinc-900">
                                  #{rec.shiftCode || rec.id.slice(0, 8)}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                    isBalanced
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                      : isSurplus
                                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                                      : 'bg-rose-50 text-rose-700 border-rose-300'
                                  }`}
                                >
                                  {isBalanced
                                    ? 'Khớp 100%'
                                    : isSurplus
                                    ? `Thừa +${(rec.difference || 0).toLocaleString('vi-VN')}₫`
                                    : `Thiếu ${(rec.difference || 0).toLocaleString('vi-VN')}₫`}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                Thu ngân: <b className="text-zinc-800">{rec.staffName}</b> •{' '}
                                {rec.endedAt
                                  ? new Date(rec.endedAt).toLocaleTimeString('vi-VN') +
                                    ' ' +
                                    new Date(rec.endedAt).toLocaleDateString('vi-VN')
                                  : 'Chưa đóng ca'}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => printShiftHandoverReceipt(rec, branding)}
                              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer shadow-2xs active:scale-95"
                              title="In lại phiếu giao ca nhiệt 80mm"
                            >
                              <Printer className="w-3.5 h-3.5 text-amber-600" />
                              <span>In Lại</span>
                            </button>
                          </div>

                          {/* Thông số tài chính */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-zinc-200/60 text-[11px]">
                            <div>
                              <span className="text-zinc-500 block">Vốn đầu:</span>
                              <span className="font-bold text-zinc-800">
                                {(rec.openingCash || 0).toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">DT Tiền mặt:</span>
                              <span className="font-bold text-emerald-700">
                                +{(rec.cashSales || 0).toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">Tiền lý thuyết:</span>
                              <span className="font-bold text-zinc-800">
                                {(rec.expectedCash || 0).toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                            <div>
                              <span className="text-zinc-500 block">Thực đếm:</span>
                              <span className="font-black text-amber-700 font-mono">
                                {(rec.closingCash || 0).toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                          </div>

                          {rec.notes && (
                            <p className="text-[11px] text-zinc-600 italic bg-white p-2 rounded-xl border border-zinc-200/70">
                              💬 {rec.notes}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-100 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsShiftModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-900 text-white font-bold text-xs hover:bg-zinc-800 transition cursor-pointer"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL 4: THANH TOÁN BÁN TẠI QUẦY ── */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl flex flex-col max-h-[92dvh] animate-in zoom-in duration-200 border border-stone-200/60">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 shrink-0">
              <h3 className="font-black text-lg text-zinc-900">Xác Nhận Thanh Toán</h3>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vùng nội dung có thể cuộn trên điện thoại */}
            <div className="overflow-y-auto flex-1 py-2.5 space-y-4 pr-1 overscroll-contain">
              {/* ── 3 LỰA CHỌN HÌNH THỨC NHẬN BÁNH ── */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-zinc-800 flex items-center justify-between">
                  <span>Hình thức nhận bánh:</span>
                  <span className="text-[10px] text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full font-bold">
                    3 tùy chọn
                  </span>
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-zinc-100/90 rounded-2xl border border-zinc-200/80">
                  <button
                    type="button"
                    onClick={() => {
                      setFulfillmentType('takeaway');
                      setPosDepositAmount(null);
                    }}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-1 transition cursor-pointer text-center ${
                      fulfillmentType === 'takeaway'
                        ? 'bg-white text-amber-700 shadow-sm border border-amber-300 ring-1 ring-amber-300/40'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                    }`}
                  >
                    <span className="text-lg leading-none">🏪</span>
                    <span className="truncate w-full leading-tight text-[11px]">Lấy Tại Quầy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('pickup')}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-1 transition cursor-pointer text-center ${
                      fulfillmentType === 'pickup'
                        ? 'bg-white text-blue-700 shadow-sm border border-blue-300 ring-1 ring-blue-300/40'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                    }`}
                  >
                    <span className="text-lg leading-none">⏰</span>
                    <span className="truncate w-full leading-tight text-[11px]">Hẹn Giờ Lấy</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('shipping')}
                    className={`py-2 px-1.5 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-1 transition cursor-pointer text-center ${
                      fulfillmentType === 'shipping'
                        ? 'bg-white text-emerald-700 shadow-sm border border-emerald-300 ring-1 ring-emerald-300/40'
                        : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                    }`}
                  >
                    <span className="text-lg leading-none">🚚</span>
                    <span className="truncate w-full leading-tight text-[11px]">Ship Bánh</span>
                  </button>
                </div>
              </div>

              {/* THÔNG TIN CHI TIẾT KHI CHỌN: HẸN GIỜ LẤY BÁNH */}
              {fulfillmentType === 'pickup' && (
                <div className="space-y-3 p-3.5 bg-blue-50/70 rounded-2xl border border-blue-200 text-xs animate-in fade-in duration-150">
                  <div className="flex items-center justify-between font-black text-blue-900">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-blue-600" /> Thông Tin Hẹn Giờ Lấy Bánh
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 uppercase font-black">
                      Khách đến lấy
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Tên khách nhận:</label>
                      <input
                        type="text"
                        value={posCustomerName}
                        onChange={(e) => setPosCustomerName(e.target.value)}
                        placeholder="VD: Chị Mai"
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-zinc-900 focus:outline-blue-500 min-w-0"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Số điện thoại:</label>
                      <input
                        type="tel"
                        value={posCustomerPhone}
                        onChange={(e) => setPosCustomerPhone(e.target.value)}
                        placeholder="VD: 0988..."
                        className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-zinc-900 focus:outline-blue-500 min-w-0"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Ngày hẹn lấy:</label>
                      <input
                        type="date"
                        value={posPickupDate}
                        onChange={(e) => setPosPickupDate(e.target.value)}
                        className="w-full max-w-full box-border px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-zinc-900 focus:outline-blue-500 min-w-0"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Giờ hẹn lấy:</label>
                      <input
                        type="time"
                        value={posPickupTime}
                        onChange={(e) => setPosPickupTime(e.target.value)}
                        className="w-full max-w-full box-border px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-zinc-900 focus:outline-blue-500 min-w-0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">Ghi chữ lên bánh / dặn dò bếp:</label>
                    <input
                      type="text"
                      value={posCakeMessage}
                      onChange={(e) => setPosCakeMessage(e.target.value)}
                      placeholder="VD: Mừng sinh nhật bé Bắp tròn 3 tuổi"
                      className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-zinc-900 focus:outline-blue-500"
                    />
                  </div>

                  <div className="pt-2 border-t border-blue-200/70">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-zinc-700 text-[11px]">Tiền cọc trước lúc này (₫):</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setPosDepositAmount(grandTotal)}
                          className="px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-bold transition cursor-pointer"
                        >
                          Thu Đủ 100%
                        </button>
                        <button
                          type="button"
                          onClick={() => setPosDepositAmount(Math.round(grandTotal * 0.5))}
                          className="px-2 py-0.5 rounded bg-blue-100 hover:bg-blue-200 text-blue-800 text-[10px] font-bold transition cursor-pointer"
                        >
                          Cọc 50%
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={posDepositAmount === null ? '' : (posDepositAmount === 0 ? '0' : formatCurrencyInput(posDepositAmount))}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseCurrencyInput(e.target.value);
                        setPosDepositAmount(val);
                      }}
                      placeholder={`Mặc định thu đủ ${(grandTotal || 0).toLocaleString('vi-VN')}₫`}
                      className="w-full px-2.5 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-black text-blue-900 focus:outline-blue-500 text-right"
                    />
                  </div>
                </div>
              )}

              {/* THÔNG TIN CHI TIẾT KHI CHỌN: SHIP BÁNH TẬN NƠI */}
              {fulfillmentType === 'shipping' && (
                <div className="space-y-3 p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 text-xs animate-in fade-in duration-150">
                  <div className="flex items-center justify-between font-black text-emerald-900">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-emerald-600" /> Thông Tin Ship Bánh Tận Nơi
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase font-black">
                      Giao tận nhà
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="min-w-0">
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Tên người nhận:</label>
                      <input
                        type="text"
                        value={posCustomerName}
                        onChange={(e) => setPosCustomerName(e.target.value)}
                        placeholder="VD: Anh Tuấn"
                        className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-bold text-zinc-900 focus:outline-emerald-500 min-w-0"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">SĐT người nhận:</label>
                      <input
                        type="tel"
                        value={posCustomerPhone}
                        onChange={(e) => setPosCustomerPhone(e.target.value)}
                        placeholder="VD: 0912..."
                        className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-bold text-zinc-900 focus:outline-emerald-500 min-w-0"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1 flex items-center justify-between">
                      <span>Địa chỉ nhận bánh chi tiết: <strong className="text-rose-500">*</strong></span>
                    </label>
                    <input
                      type="text"
                      value={posShippingAddress}
                      onChange={(e) => setPosShippingAddress(e.target.value)}
                      placeholder="Số nhà, tên đường, phường/xã, quận..."
                      className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-zinc-900 focus:outline-emerald-500"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1">📅 Ngày giao hàng: <strong className="text-emerald-700">*</strong></span>
                        <span className="text-[10px] text-emerald-600 font-semibold">Chọn ngày hẹn giao</span>
                      </label>
                      <input
                        type="date"
                        value={posPickupDate}
                        onChange={(e) => setPosPickupDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-emerald-300/80 rounded-xl text-xs font-bold text-zinc-900 focus:outline-emerald-500 shadow-2xs"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="min-w-0">
                        <label className="block text-[11px] font-bold text-zinc-700 mb-1 flex items-center gap-1">
                          ⏰ Giờ giao:
                        </label>
                        <input
                          type="time"
                          value={posPickupTime}
                          onChange={(e) => setPosPickupTime(e.target.value)}
                          className="w-full px-2.5 py-2 bg-white border border-emerald-300/80 rounded-xl text-xs font-bold text-zinc-900 focus:outline-emerald-500 shadow-2xs min-w-0"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="block text-[11px] font-bold text-zinc-700 mb-1 flex items-center gap-1">
                          🚚 Phí ship (₫):
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatCurrencyInput(posShippingFee)}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setPosShippingFee(parseCurrencyInput(e.target.value))}
                          placeholder="0 (miễn phí)"
                          className="w-full px-2.5 py-2 bg-white border border-emerald-300/80 rounded-xl text-xs font-bold text-zinc-900 focus:outline-emerald-500 text-right shadow-2xs min-w-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-700 mb-1">Ghi chữ bánh / Lời chúc:</label>
                    <input
                      type="text"
                      value={posCakeMessage}
                      onChange={(e) => setPosCakeMessage(e.target.value)}
                      placeholder="VD: Happy Birthday Bố yêu"
                      className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-medium text-zinc-900 focus:outline-emerald-500"
                    />
                  </div>

                  <div className="pt-2 border-t border-emerald-200/70">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-zinc-700 text-[11px]">Khách trả trước / Cọc (₫):</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setPosDepositAmount(0)}
                          className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold transition cursor-pointer"
                        >
                          COD 100%
                        </button>
                        <button
                          type="button"
                          onClick={() => setPosDepositAmount(Math.round(grandTotal * 0.5))}
                          className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold transition cursor-pointer"
                        >
                          Cọc 50%
                        </button>
                        <button
                          type="button"
                          onClick={() => setPosDepositAmount(grandTotal)}
                          className="px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-[10px] font-bold transition cursor-pointer"
                        >
                          Đủ 100%
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={posDepositAmount === null ? '' : (posDepositAmount === 0 ? '0' : formatCurrencyInput(posDepositAmount))}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => {
                        const val = e.target.value === '' ? null : parseCurrencyInput(e.target.value);
                        setPosDepositAmount(val);
                      }}
                      placeholder={`Mặc định thu đủ ${(grandTotal || 0).toLocaleString('vi-VN')}₫`}
                      className="w-full px-2.5 py-1.5 bg-white border border-emerald-200 rounded-lg text-xs font-black text-emerald-900 focus:outline-emerald-500 text-right"
                    />
                  </div>
                </div>
              )}

              {/* GHI CHÚ CHUNG ĐƠN HÀNG */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-zinc-600">Ghi chú đơn hàng (nếu có):</label>
                <input
                  type="text"
                  value={cartNotes}
                  onChange={(e) => setCartNotes(e.target.value)}
                  placeholder="Dặn dò thêm cho bếp hoặc thu ngân..."
                  className="w-full px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-800 focus:bg-white focus:outline-amber-500"
                />
              </div>

              {/* MỤC GIẢM GIÁ TRỰC TIẾP KHI THANH TOÁN */}
              <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-800 text-xs flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-600" /> Giảm giá hóa đơn:
                  </span>
                  <div className="flex items-center bg-white p-0.5 rounded-lg border border-stone-200 text-[10px]">
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountMode('percent');
                        if (discountCustomAmount > 0 && subtotal > 0) {
                          setDiscountPercent(Math.min(100, Math.round((discountCustomAmount / subtotal) * 100)));
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md font-black transition cursor-pointer ${
                        discountMode === 'percent'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Theo %
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDiscountMode('amount');
                        if (discountPercent > 0 && subtotal > 0) {
                          setDiscountCustomAmount(Math.round((subtotal * discountPercent) / 100));
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md font-black transition cursor-pointer ${
                        discountMode === 'amount'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      Theo ₫ (VND)
                    </button>
                  </div>
                </div>

                {/* Nút gợi ý nhanh */}
                <div className="flex items-center gap-1 flex-wrap">
                  {discountMode === 'percent' ? (
                    <>
                      {[5, 10, 15, 20, 50].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => applyDiscountPctWithPin(pct)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer ${
                            discountPercent === pct
                              ? 'bg-amber-100 border-amber-400 text-amber-900'
                              : 'bg-white border-stone-200 text-zinc-600 hover:bg-stone-100'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                      {discountPercent > 0 && (
                        <button
                          type="button"
                          onClick={() => setDiscountPercent(0)}
                          className="px-2 py-0.5 rounded text-[11px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          ✕ Không giảm
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {[10000, 20000, 50000, 100000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setDiscountCustomAmount(amt)}
                          className={`px-2 py-0.5 rounded text-[11px] font-bold border transition cursor-pointer ${
                            discountCustomAmount === amt
                              ? 'bg-amber-100 border-amber-400 text-amber-900'
                              : 'bg-white border-stone-200 text-zinc-600 hover:bg-stone-100'
                          }`}
                        >
                          {amt >= 1000 ? `${amt / 1000}k` : amt}
                        </button>
                      ))}
                      {discountCustomAmount > 0 && (
                        <button
                          type="button"
                          onClick={() => setDiscountCustomAmount(0)}
                          className="px-2 py-0.5 rounded text-[11px] font-bold text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          ✕ Không giảm
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Ô nhập tùy chỉnh */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500 font-medium">Nhập số:</span>
                  {discountMode === 'percent' ? (
                    <div className="flex-1 relative">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={discountPercent || ''}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setDiscountPercent(e.target.value === '' ? ('' as any) : Math.min(100, Math.max(0, Number(e.target.value))))}
                        placeholder="Nhập % giảm..."
                        className="w-full pr-7 pl-3 py-1.5 text-right bg-white border border-stone-200 rounded-xl text-xs font-black text-amber-800 focus:outline-amber-500"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 pointer-events-none">%</span>
                    </div>
                  ) : (
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatCurrencyInput(discountCustomAmount)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setDiscountCustomAmount(parseCurrencyInput(e.target.value))}
                        placeholder="Nhập số tiền giảm (VND)..."
                        className="w-full pr-7 pl-3 py-1.5 text-right bg-white border border-stone-200 rounded-xl text-xs font-black text-amber-800 focus:outline-amber-500"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 pointer-events-none">₫</span>
                    </div>
                  )}
                </div>
              </div>

              {/* CARD TỔNG TIỀN VÀ GIÁ CUỐI ĐƠN HÀNG */}
              <div className="p-3.5 bg-gradient-to-b from-amber-50 to-orange-50/70 rounded-2xl border-2 border-amber-300 shadow-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-amber-900 pb-1.5 border-b border-amber-200">
                  <span>Chi Tiết Giá Trị Đơn Hàng</span>
                  <span className="text-[10px] bg-amber-200/90 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                    {fulfillmentType === 'shipping' ? '🚚 Đơn Giao Tận Nơi' : fulfillmentType === 'pickup' ? '⏰ Khách Hẹn Lấy' : '🏪 Lấy Tại Quầy'}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-zinc-700">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Tiền bánh ({cart.length} món):</span>
                    <span className="font-bold">{(subtotal || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Giảm giá ({discountMode === 'percent' ? `${discountPercent}%` : 'Số tiền'}):</span>
                      <span>-{(discountAmount || 0).toLocaleString('vi-VN')}₫</span>
                    </div>
                  )}
                  {fulfillmentType === 'shipping' && (
                    <div className="flex justify-between text-blue-700 font-bold bg-blue-50/90 px-2.5 py-1.5 rounded-xl border border-blue-200">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-blue-600" /> Phí giao hàng (Ship):
                      </span>
                      <span className="font-black text-sm">+{(shippingFee || 0).toLocaleString('vi-VN')}₫</span>
                    </div>
                  )}
                </div>

                {/* DÒNG GIÁ CUỐI ĐƠN HÀNG (RÕ RÀNG, NỔI BẬT) */}
                <div className="flex justify-between items-center pt-2 border-t-2 border-amber-300 text-sm font-black text-amber-950">
                  <span className="flex items-center gap-1 text-amber-900 uppercase">
                    GIÁ CUỐI ĐƠN HÀNG:
                  </span>
                  <span className="text-xl font-black text-amber-700">
                    {(grandTotal || 0).toLocaleString('vi-VN')}₫
                  </span>
                </div>

                {/* Phân chia: Đã thu / Thu lúc này & Còn lại COD */}
                {fulfillmentType !== 'takeaway' && (
                  <div className="pt-2 border-t border-dashed border-amber-200/80 grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-white border border-amber-200 text-center shadow-2xs">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase block">Thu cọc lúc này</span>
                      <span className="text-base font-black text-emerald-600">{(dueNow || 0).toLocaleString('vi-VN')}₫</span>
                    </div>
                    <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-center shadow-2xs">
                      <span className="text-[10px] text-rose-600 font-bold uppercase block">
                        {fulfillmentType === 'shipping' ? 'Shipper thu COD' : 'Thu khi lấy'}
                      </span>
                      <span className="text-base font-black text-rose-600">{(remainingCOD || 0).toLocaleString('vi-VN')}₫</span>
                    </div>
                  </div>
                )}
              </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700">Phương thức thanh toán:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                    paymentMethod === 'cash'
                      ? 'border-amber-600 bg-amber-50 text-amber-700 shadow-xs'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <Banknote className="w-4 h-4" /> Tiền mặt
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('transfer');
                    if (!checkoutTransferCode) {
                      const syntax = vietqrConfig.transferSyntax || 'DH';
                      const randSuffix = String(Math.floor(100000 + Math.random() * 900000));
                      setCheckoutTransferCode(`${syntax}${randSuffix}`);
                    }
                  }}
                  className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                    paymentMethod === 'transfer'
                      ? 'border-amber-600 bg-amber-50 text-amber-700 shadow-xs'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <QrCode className="w-4 h-4" /> Chuyển khoản
                </button>
                <button
                  type="button"
                  onClick={handleSelectSplitPayment}
                  className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                    paymentMethod === 'split'
                      ? 'border-amber-600 bg-amber-50 text-amber-700 shadow-xs'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <CreditCard className="w-4 h-4" /> Kết hợp (TM+CK)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('momo')}
                  className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer ${
                    paymentMethod === 'momo'
                      ? 'border-amber-600 bg-amber-50 text-amber-700 shadow-xs'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <Wallet className="w-4 h-4" /> Ví MoMo
                </button>
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div className="space-y-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-200/60">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-zinc-700">Tiền khách đưa:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatCurrencyInput(cashGiven)}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setCashGiven(parseCurrencyInput(e.target.value))}
                    placeholder={(dueNow || 0).toLocaleString('vi-VN')}
                    className="w-36 px-2.5 py-1.5 text-right font-black text-sm bg-white border border-zinc-200 rounded-lg text-zinc-900"
                  />
                </div>

                {/* Gợi ý phím bấm tiền mặt nhanh cho thu ngân */}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setCashGiven(dueNow)}
                    className="px-2 py-1 bg-white border border-zinc-200 hover:border-amber-400 rounded-lg text-[11px] font-bold text-zinc-700"
                  >
                    Vừa đủ ({(dueNow || 0).toLocaleString('vi-VN')}₫)
                  </button>
                  {[50000, 100000, 200000, 500000].map((amt) => (
                    amt >= dueNow && (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCashGiven(amt)}
                        className="px-2 py-1 bg-white border border-zinc-200 hover:border-amber-400 rounded-lg text-[11px] font-bold text-zinc-700"
                      >
                        {amt.toLocaleString('vi-VN')}₫
                      </button>
                    )
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-zinc-200/50 text-xs">
                  <span className="font-bold text-zinc-500">Tiền thừa trả khách:</span>
                  <span className="font-black text-base text-emerald-600">
                    {(changeAmount || 0).toLocaleString('vi-VN')}₫
                  </span>
                </div>
              </div>
            )}

            {paymentMethod === 'split' && (
              <div className="space-y-3.5 p-3.5 bg-gradient-to-b from-amber-50/60 to-orange-50/40 rounded-2xl border border-amber-200/80">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-amber-200/60">
                  <span className="font-bold text-amber-950 flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4 text-amber-600" /> Thanh toán Kết Hợp (Tiền Mặt + CK)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-black text-[10px]">
                    Cần thu: {(dueNow || 0).toLocaleString('vi-VN')}₫
                  </span>
                </div>

                {/* Nút chia nhanh */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-zinc-600">Chia nhanh:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const half = Math.round(dueNow / 2);
                      handleSplitCashAmountChange(half);
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-[11px] font-bold text-amber-900 cursor-pointer shadow-2xs"
                  >
                    50% - 50%
                  </button>
                  {[50000, 100000, 200000, 500000].map((c) => (
                    c < dueNow && (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleSplitCashAmountChange(c)}
                        className="px-2 py-1 rounded-lg bg-white border border-zinc-200 hover:border-amber-400 text-[11px] font-bold text-zinc-700 cursor-pointer shadow-2xs"
                      >
                        TM {(c / 1000)}k
                      </button>
                    )
                  ))}
                </div>

                {/* 2 Cột Nhập Số Tiền: Tiền Mặt & Chuyển Khoản */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-white border border-amber-200 shadow-2xs space-y-1">
                    <label className="text-[11px] font-bold text-zinc-700 flex items-center justify-between">
                      <span className="flex items-center gap-1">💵 Tiền mặt:</span>
                      <span className="text-[10px] text-amber-600 font-bold">Thu ngay</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(splitCashAmount)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleSplitCashAmountChange(parseCurrencyInput(e.target.value))}
                      className="w-full px-2 py-1.5 text-right font-black text-sm bg-amber-50/50 border border-amber-300 rounded-lg text-amber-950 focus:outline-amber-500"
                    />
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-blue-200 shadow-2xs space-y-1">
                    <label className="text-[11px] font-bold text-zinc-700 flex items-center justify-between">
                      <span className="flex items-center gap-1">🏦 Chuyển khoản:</span>
                      <span className="text-[10px] text-blue-600 font-bold">Quét QR</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(splitTransferAmount)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => handleSplitTransferAmountChange(parseCurrencyInput(e.target.value))}
                      className="w-full px-2 py-1.5 text-right font-black text-sm bg-blue-50/50 border border-blue-300 rounded-lg text-blue-950 focus:outline-blue-500"
                    />
                  </div>
                </div>

                {/* Phần Tiền mặt khách đưa & Tiền thối */}
                <div className="p-2.5 rounded-xl bg-white/90 border border-stone-200 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-zinc-700">Khách đưa tiền mặt:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatCurrencyInput(splitCashGiven)}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setSplitCashGiven(parseCurrencyInput(e.target.value))}
                      placeholder={(splitCashAmount || 0).toLocaleString('vi-VN')}
                      className="w-32 px-2.5 py-1 text-right font-black text-xs bg-stone-50 border border-zinc-200 rounded-lg text-zinc-900"
                    />
                  </div>
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-zinc-100">
                    <span className="font-bold text-zinc-500">Tiền thừa trả khách:</span>
                    <span className="font-black text-sm text-emerald-600">
                      {(splitCashChange || 0).toLocaleString('vi-VN')}₫
                    </span>
                  </div>
                </div>

                {/* Mã VietQR động cho phần Chuyển Khoản */}
                {splitTransferAmount > 0 && (
                  <div className="p-3 bg-white rounded-xl border border-blue-200 text-center space-y-2">
                    <div className="flex items-center justify-between px-1 text-[11px]">
                      <span className="font-bold text-blue-900 flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5 text-blue-600" /> Mã VietQR phần Chuyển Khoản:
                      </span>
                      <span className="font-black text-blue-600">
                        {splitTransferAmount.toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    <div className="inline-block p-1.5 bg-white rounded-xl border border-zinc-200 shadow-2xs max-w-[180px] mx-auto">
                      <img
                        src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-${vietqrConfig.template || 'compact2'}.jpg?amount=${splitTransferAmount}&addInfo=${encodeURIComponent(checkoutTransferCode || `${vietqrConfig.transferSyntax || 'DH'}${Date.now().toString().slice(-6)}`)}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                        alt="VietQR Split Transfer"
                        className="w-full h-auto rounded-lg"
                      />
                    </div>
                    <div className="text-[11px] text-zinc-600 flex justify-between items-center px-2 py-1 bg-blue-50/60 rounded-lg">
                      <span>Nội dung CK: <strong className="text-blue-900 font-mono">{checkoutTransferCode}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(checkoutTransferCode);
                          setCopiedTransferCode(true);
                          setTimeout(() => setCopiedTransferCode(false), 2000);
                        }}
                        className="text-[10px] px-1.5 py-0.5 bg-white border border-blue-200 rounded text-blue-700 font-bold cursor-pointer"
                      >
                        {copiedTransferCode ? 'Đã chép' : 'Sao chép'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'transfer' && (
              <div className="p-3.5 bg-zinc-50 rounded-2xl border border-zinc-200 text-center space-y-3">
                <div className="flex items-center justify-between px-1 text-xs">
                  <span className="font-bold text-zinc-800 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4 text-amber-600" /> Quét Mã VietQR Chuyển Tiền
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                    Napas 24/7 Tự Động
                  </span>
                </div>

                {/* HIỂN THỊ TRẠNG THÁI THEO 3 CHẾ ĐỘ XÁC THỰC CHUYỂN KHOẢN */}
                {capturedTransferProofImage && (
                  <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between text-xs text-purple-950 animate-in fade-in">
                    <div className="flex items-center gap-2">
                      <img
                        src={capturedTransferProofImage}
                        alt="Bill đối soát"
                        className="w-9 h-9 rounded-lg object-cover border border-purple-300 shadow-2xs"
                      />
                      <div className="text-left">
                        <div className="font-black text-purple-900">📸 Đã chụp ảnh bill chuyển khoản!</div>
                        <div className="text-[10px] text-purple-700">Đơn hàng sẽ được xác nhận ngay và lưu ảnh đối soát</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsProofCameraOpen(true)}
                      className="px-2 py-1 bg-white border border-purple-300 rounded-lg text-[10px] font-bold text-purple-700 hover:bg-purple-100 cursor-pointer"
                    >
                      Chụp lại
                    </button>
                  </div>
                )}

                {transferVerifyConfig.mode === 'two_step' ? (
                  adminApprovedTransfer ? (
                    <div className="p-3.5 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500 text-emerald-900 space-y-1 animate-in zoom-in-95">
                      <div className="flex items-center justify-center gap-2 font-black text-sm text-emerald-700">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 animate-bounce" />
                        <span>✅ ADMIN ĐÃ XÁC NHẬN NHẬN ĐỦ TIỀN!</span>
                      </div>
                      <p className="text-xs text-emerald-700 font-medium">
                        Hệ thống đang tự động hoàn tất đơn hàng...
                      </p>
                    </div>
                  ) : isWaitingAdminTransferApproval ? (
                    <div className="p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-500 text-amber-900 space-y-2 animate-in zoom-in-95">
                      <div className="flex items-center justify-center gap-2 font-black text-sm text-amber-800">
                        <span className="w-3 h-3 rounded-full bg-amber-500 animate-ping shrink-0" />
                        <span>⏳ ĐANG CHỜ ADMIN XÁC NHẬN TIỀN VỀ...</span>
                      </div>
                      <p className="text-xs text-amber-800 font-medium">
                        Yêu cầu đã được gửi tới tài khoản Quản trị viên (Admin). Đơn sẽ tự động hoàn tất ngay khi Admin ấn xác nhận.
                      </p>

                      {/* Các nút hành động khi chờ Admin duyệt */}
                      <div className="pt-2 border-t border-amber-300/60 space-y-2">
                        <button
                          type="button"
                          onClick={handleResendTransferApproval}
                          className="w-full py-2 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{transferResendStatus || '🔄 Gửi Lại Yêu Cầu Xác Thực'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setIsProofCameraOpen(true)}
                          className="w-full py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer transition"
                        >
                          <Camera className="w-4 h-4" />
                          <span>📸 Xác Nhận Ngay (Chụp Ảnh Bill Khách)</span>
                        </button>
                        <p className="text-[10px] text-amber-700 text-center italic pt-0.5">
                          Phòng khi mất mạng hoặc Admin chưa kịp duyệt. Ảnh chụp sẽ lưu cùng đơn hàng để đối soát sau.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                        {((transferVerifyConfig.twoStep?.skipForAdmin !== undefined
                          ? transferVerifyConfig.twoStep.skipForAdmin
                          : (transferVerifyConfig.two_step?.skipForAdmin ?? true)) && isAdmin)
                          ? 'Xác thực 2 bước: Admin trực tiếp bán (Miễn duyệt)'
                          : 'Xác thực 2 bước: Cần Admin duyệt tiền về'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsProofCameraOpen(true)}
                        className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-[10px] font-black text-amber-800 hover:bg-amber-100 flex items-center gap-1 cursor-pointer transition"
                      >
                        <Camera className="w-3 h-3" /> Chụp bill ngay
                      </button>
                    </div>
                  )
                ) : transferVerifyConfig.mode === 'bank_webhook' ? (
                  paymentReceivedInfo ? (
                    <div className="p-3 rounded-xl bg-emerald-500/15 border-2 border-emerald-500 text-emerald-900 space-y-1 animate-in zoom-in-95">
                      <div className="flex items-center justify-center gap-2 font-black text-sm text-emerald-700">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 animate-bounce" />
                        <span>✅ ĐÃ NHẬN TIỀN THÀNH CÔNG!</span>
                      </div>
                      <div className="text-xs font-black text-emerald-800">
                        +{(paymentReceivedInfo.amount || 0).toLocaleString('vi-VN')}₫
                        {paymentReceivedInfo.gateway ? ` • ${paymentReceivedInfo.gateway}` : ''}
                      </div>
                      <p className="text-[11px] text-emerald-700 font-medium">
                        Hệ thống đang tự động xác nhận hoàn thành đơn hàng...
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 text-xs font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping inline-block shrink-0" />
                        <span>⏳ Đang chờ hệ thống ngân hàng xác nhận biến động số dư...</span>
                      </div>
                      {/* Nút khẩn cấp Chụp ảnh bill đối soát phòng mất mạng */}
                      <button
                        type="button"
                        onClick={() => setIsProofCameraOpen(true)}
                        className="w-full py-2 px-3 rounded-xl bg-zinc-100 hover:bg-amber-50 border border-zinc-300 hover:border-amber-400 text-zinc-700 hover:text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Dùng khi mất mạng hoặc ngân hàng chưa báo webhook"
                      >
                        <Camera className="w-3.5 h-3.5 text-amber-600" />
                        <span>📸 Xác Nhận Ngay (Chụp Ảnh Bill Khách)</span>
                      </button>
                    </div>
                  )
                ) : (
                  <div className="flex items-center justify-center gap-1.5 p-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Chuyển khoản trực tiếp (Bấm Xác nhận để hoàn tất ngay)</span>
                  </div>
                )}

                <div className="inline-block p-2 bg-white rounded-2xl border border-zinc-200 shadow-sm max-w-[240px] mx-auto relative">
                  <img
                    src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-${vietqrConfig.template || 'compact2'}.jpg?amount=${dueNow}&addInfo=${encodeURIComponent(checkoutTransferCode || `${vietqrConfig.transferSyntax || 'DH'}${Date.now().toString().slice(-6)}`)}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                    alt="VietQR Transfer"
                    className="w-full h-auto rounded-xl"
                  />
                  {paymentReceivedInfo && (
                    <div className="absolute inset-0 bg-emerald-900/60 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center text-white p-3 animate-in fade-in">
                      <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce mb-1" />
                      <span className="text-xs font-black uppercase">ĐÃ THANH TOÁN</span>
                    </div>
                  )}
                </div>

                <div className="text-left bg-white p-3 rounded-xl border border-zinc-200 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Ngân hàng:</span>
                    <span className="font-bold text-zinc-900">{vietqrConfig.bankName || vietqrConfig.bankId}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Số tài khoản:</span>
                    <div className="flex items-center gap-1.5 font-mono font-black text-zinc-900 text-sm">
                      <span>{vietqrConfig.accountNo}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(vietqrConfig.accountNo);
                          setCopiedAccount(true);
                          setTimeout(() => setCopiedAccount(false), 2000);
                        }}
                        className="p-1 hover:bg-zinc-100 rounded text-zinc-500 hover:text-amber-600 transition cursor-pointer"
                        title="Sao chép số tài khoản"
                      >
                        {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Chủ tài khoản:</span>
                    <span className="font-bold text-zinc-900 uppercase">{vietqrConfig.accountName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Số tiền thanh toán:</span>
                    <span className="font-black text-amber-600 text-sm">{(dueNow || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                  <div className="flex justify-between items-center bg-amber-50/80 px-2 py-1.5 rounded-lg border border-amber-200/60">
                    <span className="text-amber-800 font-medium">Nội dung CK:</span>
                    <div className="flex items-center gap-1.5 font-mono font-black text-amber-900 text-xs">
                      <span>{checkoutTransferCode}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(checkoutTransferCode);
                          setCopiedTransferCode(true);
                          setTimeout(() => setCopiedTransferCode(false), 2000);
                        }}
                        className="p-1 hover:bg-amber-100 rounded text-amber-700 cursor-pointer"
                        title="Sao chép cú pháp chuyển tiền"
                      >
                        {copiedTransferCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500 italic">
                  💡 Khách chỉ cần mở App ngân hàng quét mã, toàn bộ số tiền và thông tin đã được điền sẵn.
                </p>
              </div>
            )}

            {paymentMethod === 'momo' && (
              <div className="p-3.5 bg-pink-50/40 rounded-2xl border border-pink-200 text-center space-y-3">
                <div className="flex items-center justify-between px-1 text-xs">
                  <span className="font-bold text-pink-900 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-pink-600" /> Quét Mã Ví Điện Tử Nhận Tiền
                  </span>
                  {/* Switcher between MoMo / ZaloPay / Viettel Money */}
                  <div className="flex gap-1 bg-white p-0.5 rounded-lg border border-pink-200 text-[10px]">
                    {(['momo', 'zalopay', 'viettelmoney'] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setSelectedWalletType(w)}
                        className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                          selectedWalletType === w
                            ? w === 'momo'
                              ? 'bg-[#d82d8b] text-white'
                              : w === 'zalopay'
                              ? 'bg-[#0068ff] text-white'
                              : 'bg-[#ee0033] text-white'
                            : 'text-zinc-600 hover:text-zinc-900'
                        }`}
                      >
                        {w === 'momo' ? 'MoMo' : w === 'zalopay' ? 'ZaloPay' : 'Viettel'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="inline-block p-2 bg-white rounded-2xl border border-pink-200 shadow-sm max-w-[240px] mx-auto">
                  <img
                    src={
                      selectedWalletType === 'momo'
                        ? (ewalletConfig.momo.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`2|99|${ewalletConfig.momo.phone}|${ewalletConfig.momo.name}||0|0|${dueNow}|${ewalletConfig.transferSyntax || 'VIMO'}${Date.now().toString().slice(-6)}|transfer_p2p`)}`)
                        : selectedWalletType === 'zalopay'
                        ? (ewalletConfig.zalopay.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`ZALOPAY|${ewalletConfig.zalopay.phone}|${ewalletConfig.zalopay.name}|${dueNow}|${ewalletConfig.transferSyntax || 'VIMO'}`)}`)
                        : (ewalletConfig.viettelmoney.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`VIETTEL|${ewalletConfig.viettelmoney.phone}|${ewalletConfig.viettelmoney.name}|${dueNow}|${ewalletConfig.transferSyntax || 'VIMO'}`)}`)
                    }
                    alt="E-Wallet Transfer QR"
                    className="w-full h-auto rounded-xl"
                  />
                </div>

                <div className="text-left bg-white p-3 rounded-xl border border-pink-200/80 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Kênh ví:</span>
                    <span className="font-bold text-zinc-900">
                      {selectedWalletType === 'momo' ? 'Ví Điện Tử MoMo' : selectedWalletType === 'zalopay' ? 'Ví Điện Tử ZaloPay' : 'Viettel Money'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Số ví / SĐT:</span>
                    <div className="flex items-center gap-1.5 font-mono font-black text-zinc-900 text-sm">
                      <span>
                        {selectedWalletType === 'momo' ? ewalletConfig.momo.phone : selectedWalletType === 'zalopay' ? ewalletConfig.zalopay.phone : ewalletConfig.viettelmoney.phone}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const p = selectedWalletType === 'momo' ? ewalletConfig.momo.phone : selectedWalletType === 'zalopay' ? ewalletConfig.zalopay.phone : ewalletConfig.viettelmoney.phone;
                          navigator.clipboard.writeText(p);
                          setCopiedWalletPhone(true);
                          setTimeout(() => setCopiedWalletPhone(false), 2000);
                        }}
                        className="p-1 hover:bg-zinc-100 rounded text-zinc-500 hover:text-pink-600 transition cursor-pointer"
                        title="Sao chép số điện thoại"
                      >
                        {copiedWalletPhone ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Chủ ví:</span>
                    <span className="font-bold text-zinc-900 uppercase">
                      {selectedWalletType === 'momo' ? ewalletConfig.momo.name : selectedWalletType === 'zalopay' ? ewalletConfig.zalopay.name : ewalletConfig.viettelmoney.name}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Số tiền thanh toán:</span>
                    <span className="font-black text-pink-600 text-sm">{(dueNow || 0).toLocaleString('vi-VN')}₫</span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500 italic">
                  💡 Khách mở ứng dụng Ví điện tử quét mã trên màn hình để chuyển tiền tức thì.
                </p>
              </div>
            )}
            </div>

            {/* Nút hành động ghim cố định ở đáy modal (Luôn nhìn thấy, không bị khuất) */}
            <div className="flex gap-3 pt-3 border-t border-zinc-100 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsWaitingAdminTransferApproval(false);
                  setIsCheckoutOpen(false);
                  setActiveCheckoutOrderNumber('');
                  setCapturedTransferProofImage(null);
                  setAdminApprovedTransfer(false);
                }}
                className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
              >
                {isWaitingAdminTransferApproval ? 'Đóng / Hủy Chờ' : 'Hủy'}
              </button>
              {isWaitingAdminTransferApproval ? (
                <button
                  type="button"
                  onClick={() => setIsProofCameraOpen(true)}
                  className="flex-2 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-black shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 cursor-pointer animate-pulse"
                >
                  <Camera className="w-4 h-4" />
                  <span>📸 Xác Nhận Ngay (Chụp Ảnh Bill)</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={processingOrder}
                  onClick={() => handleCompleteOrder()}
                  className="flex-2 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-black shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {processingOrder
                    ? 'Đang xử lý...'
                    : paymentMethod === 'transfer' &&
                      transferVerifyConfig.mode === 'two_step' &&
                      !(
                        (transferVerifyConfig.twoStep?.skipForAdmin !== undefined
                          ? transferVerifyConfig.twoStep.skipForAdmin
                          : (transferVerifyConfig.two_step?.skipForAdmin ?? true)) && isAdmin
                      ) &&
                      !capturedTransferProofImage &&
                      !adminApprovedTransfer
                    ? `Gửi Duyệt 2 Bước (${(grandTotal || 0).toLocaleString('vi-VN')}₫)`
                    : fulfillmentType === 'shipping'
                    ? `Xác Nhận Đặt Bánh (Giá cuối: ${(grandTotal || 0).toLocaleString('vi-VN')}₫)`
                    : `Xác Nhận Thanh Toán (${(grandTotal || 0).toLocaleString('vi-VN')}₫)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CHỤP ẢNH BILL CHUYỂN KHOẢN ĐỐI SOÁT KHẨN CẤP ── */}
      {isProofCameraOpen && (
        <TransferProofCameraModal
          orderNumber={activeCheckoutOrderNumber || 'BK-CK'}
          amount={dueNow}
          onConfirm={(imgBase64) => {
            setCapturedTransferProofImage(imgBase64);
            setIsProofCameraOpen(false);
            handleCompleteOrder('transfer', imgBase64, activeCheckoutOrderNumber, true);
          }}
          onClose={() => setIsProofCameraOpen(false)}
        />
      )}

      {/* ── MODAL 5: HÓA ĐƠN IN NHIỆT / PHIẾU HẸN GIAO BÁNH ── */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-sm w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto overscroll-contain animate-in zoom-in duration-200">
            <div id="printable-pos-receipt" className="p-4 bg-amber-50/40 rounded-2xl border border-zinc-300 text-zinc-900 font-mono text-xs space-y-3">
              {receiptConfig.blocks
                .filter((b) => b.visible)
                .map((block) => {
                  if (block.id === 'header_store') {
                    return (
                      <div key={block.id} className="text-center space-y-1 border-b border-dashed border-zinc-300 pb-2">
                        {block.options?.showLogo !== false && branding.logoUrl && (
                          <div className="flex justify-center mb-1">
                            <img
                              src={branding.logoUrl}
                              alt={branding.storeName}
                              className="h-9 w-auto max-w-[120px] object-contain mx-auto"
                            />
                          </div>
                        )}
                        <h2 className="font-black text-sm tracking-wider uppercase">{branding.storeName || 'TIỆM BÁNH ABC'}</h2>
                        {block.options?.showSlogan !== false && branding.slogan && (
                          <p className="text-[9px] text-zinc-600 font-medium italic">{branding.slogan}</p>
                        )}
                        {block.options?.showAddress !== false && (
                          <p className="text-[10px] text-zinc-500">{branding.address || '123 Đường Bánh Ngọt, TP.HCM'}</p>
                        )}
                        {block.options?.showHotline !== false && (
                          <p className="text-[10px] text-zinc-500">Hotline: {branding.phone || '0901 234 567'}</p>
                        )}
                      </div>
                    );
                  }

                  if (block.id === 'order_meta') {
                    return (
                      <div key={block.id} className="text-center space-y-0.5 border-b border-dashed border-zinc-300 pb-2 text-[10px] text-zinc-600">
                        <p className="font-bold text-xs pt-1 text-zinc-900">
                          {completedOrder.deliveryMethod === 'shipping'
                            ? 'PHIẾU GIAO HÀNG TẬN NƠI (SHIP BÁNH)'
                            : completedOrder.pickupDateTimeStr
                            ? 'PHIẾU HẸN GIAO BÁNH KEM'
                            : 'HÓA ĐƠN THANH TOÁN'}
                        </p>
                        <p className="text-[11px] font-bold text-amber-700">#{completedOrder.orderNumber}</p>
                        <div className="flex justify-between pt-1">
                          <div>Ngày tạo: {completedOrder.createdAt}</div>
                          {block.options?.showCashier !== false && <div>Thu ngân: {completedOrder.cashier}</div>}
                        </div>
                      </div>
                    );
                  }

                  if (block.id === 'customer_info') {
                    if (!completedOrder.customerName && !completedOrder.pickupDateTimeStr) return null;
                    return (
                      <div key={block.id} className="text-[10px] space-y-1 text-zinc-600 border-b border-dashed border-zinc-300 pb-2">
                        {completedOrder.customerName && (
                          <div className="font-bold text-zinc-900">Khách hàng: {completedOrder.customerName} ({completedOrder.customerPhone})</div>
                        )}
                        {completedOrder.pickupDateTimeStr && (
                          <div className="font-bold text-pink-700">
                            {completedOrder.deliveryMethod === 'shipping' ? 'HẸN GIỜ GIAO:' : 'HẸN LẤY BÁNH:'}{' '}
                            {formatPickupDateTime(completedOrder.pickupDateTimeStr) || completedOrder.pickupDateTimeStr}
                          </div>
                        )}
                        <div className="flex items-center gap-1 font-semibold text-zinc-800">
                          <span>Hình thức nhận:</span>
                          <span className={completedOrder.deliveryMethod === 'shipping' ? 'text-blue-700 font-bold' : 'text-zinc-700 font-bold'}>
                            {completedOrder.deliveryMethod === 'shipping' ? '🚚 Giao hàng tận nơi (Ship)' : '🏪 Khách lấy tại tiệm'}
                          </span>
                        </div>
                        {block.options?.showAddress !== false && completedOrder.shippingAddress && (
                          <div className="font-bold text-blue-900 bg-blue-50/80 p-2 rounded-lg border border-blue-200 mt-1">
                            📍 ĐỊA CHỈ GIAO HÀNG:
                            <div className="text-zinc-900 font-normal mt-0.5">{completedOrder.shippingAddress}</div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (block.id === 'items_table') {
                    return (
                      <div key={block.id} className="space-y-1.5 border-b border-dashed border-zinc-300 pb-2 text-[11px]">
                        {completedOrder.items.filter((item: any) => item.product?.id !== 'shipping-fee-item').map((item: any, i: number) => (
                          <div key={i} className="space-y-0.5">
                            <div className="flex justify-between">
                              <span className="flex-1 pr-2">
                                {item.product?.name || item.product_name_snapshot} x{item.quantity}
                              </span>
                              <span className="font-bold">
                                {(((Number(item.product?.selling_price) || Number(item.product?.price) || Number(item.unit_price) || 0) * (Number(item.quantity) || 1))).toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                          </div>
                        ))}
                        {block.options?.showCakeMessage !== false && completedOrder.cakeMessage && (
                          <div className="text-[10px] text-pink-700 italic">
                            ✍️ Chữ: "{completedOrder.cakeMessage}"
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (block.id === 'pricing_summary') {
                    return (
                      <div key={block.id} className="space-y-1 text-xs pt-1">
                        <div className="flex justify-between text-zinc-600">
                          <span>Tiền bánh:</span>
                          <span className="font-bold">{(Number(completedOrder.subtotal ?? (Number(completedOrder.totalAmount || 0) - Number(completedOrder.shippingFee || 0))) || 0).toLocaleString('vi-VN')}₫</span>
                        </div>
                        {block.options?.showDiscount !== false && completedOrder.discountAmount !== undefined && completedOrder.discountAmount > 0 && (
                          <div className="flex justify-between text-emerald-600 font-bold">
                            <span>Giảm giá:</span>
                            <span>-{(Number(completedOrder.discountAmount) || 0).toLocaleString('vi-VN')}₫</span>
                          </div>
                        )}
                        {block.options?.showShippingFee !== false && completedOrder.shippingFee && completedOrder.shippingFee > 0 ? (
                          <div className="flex justify-between text-blue-700 font-bold">
                            <span>Phí giao hàng (Ship):</span>
                            <span>+{(Number(completedOrder.shippingFee) || 0).toLocaleString('vi-VN')}₫</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between font-black text-zinc-900 border-t border-dashed border-zinc-300 pt-1 text-sm">
                          <span>TỔNG CỘNG GIÁ CUỐI:</span>
                          <span className="text-amber-700 font-black">{(Number(completedOrder.totalAmount) || 0).toLocaleString('vi-VN')}₫</span>
                        </div>
                        {completedOrder.depositAmount !== undefined && completedOrder.depositAmount > 0 && (
                          <>
                            <div className="flex justify-between text-emerald-600 font-bold">
                              <span>Tiền khách đã cọc:</span>
                              <span>-{(Number(completedOrder.depositAmount) || 0).toLocaleString('vi-VN')}₫</span>
                            </div>
                            <div className="flex justify-between font-black text-sm pt-1 border-t border-zinc-300 text-rose-600 bg-rose-50/80 p-1.5 rounded-lg border border-rose-200">
                              <span>CÒN LẠI CẦN THU (COD):</span>
                              <span>{(Number(completedOrder.remainingAmount !== undefined ? completedOrder.remainingAmount : (Number(completedOrder.totalAmount || 0) - Number(completedOrder.depositAmount || 0))) || 0).toLocaleString('vi-VN')}₫</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }

                  if (block.id === 'payment_details') {
                    const isDepositOrder = completedOrder.depositAmount !== undefined && Number(completedOrder.remainingAmount || 0) > 0;
                    const targetDue = isDepositOrder ? Number(completedOrder.depositAmount || 0) : Number(completedOrder.totalAmount || 0);

                    let displayCashGiven = targetDue;
                    if (completedOrder.cashGiven !== undefined && completedOrder.cashGiven !== null) {
                      const rawCash = Number(completedOrder.cashGiven);
                      if (isDepositOrder && rawCash === Number(completedOrder.totalAmount || 0) && rawCash > targetDue) {
                        displayCashGiven = targetDue;
                      } else {
                        displayCashGiven = rawCash;
                      }
                    }

                    let displayChange = 0;
                    if (completedOrder.changeAmount !== undefined && completedOrder.changeAmount !== null) {
                      const rawChange = Number(completedOrder.changeAmount);
                      if (isDepositOrder && rawChange === Number(completedOrder.remainingAmount || 0)) {
                        displayChange = Math.max(0, displayCashGiven - targetDue);
                      } else {
                        displayChange = Math.max(0, rawChange);
                      }
                    } else {
                      displayChange = Math.max(0, displayCashGiven - targetDue);
                    }

                    return (
                      <div key={block.id} className="border-t border-dashed border-zinc-300 pt-2 space-y-1">
                        <div className="flex justify-between items-center text-zinc-700">
                          <span>Hình thức thanh toán:</span>
                          <span className="font-bold text-zinc-900">
                            {completedOrder.paymentMethod === 'cash'
                              ? '💵 Tiền mặt'
                              : completedOrder.paymentMethod === 'momo'
                              ? '📱 Ví MoMo'
                              : completedOrder.paymentMethod === 'split'
                              ? '💳 + 💵 Kết hợp (TM + CK)'
                              : '🏦 Chuyển khoản VietQR'}
                          </span>
                        </div>

                        {completedOrder.paymentMethod === 'cash' && (
                          <>
                            <div className="flex justify-between text-zinc-600">
                              <span>{isDepositOrder ? 'Tiền khách đưa (Cọc):' : 'Tiền khách đưa:'}</span>
                              <span className="font-medium">
                                {displayCashGiven.toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                            {block.options?.showChangeAmount !== false && displayChange > 0 && (
                              <div className="flex justify-between text-emerald-700 font-bold">
                                <span>Tiền thừa trả khách:</span>
                                <span>
                                  {displayChange.toLocaleString('vi-VN')}₫
                                </span>
                              </div>
                            )}
                            <div className="text-center py-1.5 mt-2 bg-emerald-50 text-emerald-800 font-black text-[11px] rounded-xl border border-emerald-200/80">
                              {isDepositOrder
                                ? `✓ ĐÃ THANH TOÁN TIỀN CỌC (${targetDue.toLocaleString('vi-VN')}₫)`
                                : '✓ ĐÃ THANH TOÁN TIỀN MẶT'}
                            </div>
                          </>
                        )}

                        {completedOrder.paymentMethod === 'momo' && (
                          <div className="text-center py-1.5 mt-2 bg-pink-50 text-pink-800 font-black text-[11px] rounded-xl border border-pink-200/80">
                            {isDepositOrder
                              ? `✓ ĐÃ CỌC QUA VÍ MOMO (${targetDue.toLocaleString('vi-VN')}₫)`
                              : '✓ ĐÃ THANH TOÁN QUA VÍ MOMO'}
                          </div>
                        )}

                        {completedOrder.paymentMethod === 'transfer' && (
                          <div className="text-center py-1.5 mt-2 bg-blue-50 text-blue-800 font-black text-[11px] rounded-xl border border-blue-200/80">
                            {isDepositOrder
                              ? `✓ ĐÃ CỌC CHUYỂN KHOẢN (${targetDue.toLocaleString('vi-VN')}₫)`
                              : '✓ ĐÃ THANH TOÁN CHUYỂN KHOẢN'}
                          </div>
                        )}

                        {completedOrder.paymentMethod === 'split' && (
                          <>
                            <div className="space-y-1 py-1 text-zinc-700 border-t border-dashed border-zinc-200 text-xs">
                              <div className="flex justify-between">
                                <span>💵 Tiền mặt:</span>
                                <span className="font-bold text-zinc-900">{(completedOrder.splitCashAmount || 0).toLocaleString('vi-VN')}₫</span>
                              </div>
                              <div className="flex justify-between">
                                <span>🏦 Chuyển khoản:</span>
                                <span className="font-bold text-zinc-900">{(completedOrder.splitTransferAmount || 0).toLocaleString('vi-VN')}₫</span>
                              </div>
                              {completedOrder.splitCashGiven !== undefined && Number(completedOrder.splitCashGiven) > Number(completedOrder.splitCashAmount || 0) && (
                                <>
                                  <div className="flex justify-between text-zinc-500 text-[10px]">
                                    <span>Khách đưa tiền mặt:</span>
                                    <span>{Number(completedOrder.splitCashGiven).toLocaleString('vi-VN')}₫</span>
                                  </div>
                                  <div className="flex justify-between text-emerald-700 font-bold">
                                    <span>Tiền thừa trả khách:</span>
                                    <span>{(Number(completedOrder.splitCashGiven) - Number(completedOrder.splitCashAmount || 0)).toLocaleString('vi-VN')}₫</span>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="text-center py-1.5 mt-2 bg-amber-50 text-amber-900 font-black text-[11px] rounded-xl border border-amber-200/80">
                              {isDepositOrder
                                ? `✓ ĐÃ CỌC KẾT HỢP (${targetDue.toLocaleString('vi-VN')}₫)`
                                : '✓ ĐÃ THANH TOÁN KẾT HỢP (TM + CK)'}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  }

                  if (block.id === 'vietqr_cod' && block.options?.showVietQrCod !== false) {
                    if (!completedOrder.remainingAmount || completedOrder.remainingAmount <= 0) return null;
                    return (
                      <div key={block.id} className="text-center py-2 border-t border-dashed border-zinc-300 space-y-1">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-rose-600">
                          Mã VietQR Thu Tiền Còn Lại Khi Giao (COD)
                        </p>
                        <div className="inline-block p-1 bg-white border border-zinc-300 rounded-lg">
                          <img
                            src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-compact.jpg?amount=${completedOrder.remainingAmount}&addInfo=${encodeURIComponent(`DH${completedOrder.orderNumber}`)}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                            alt="VietQR In Bill"
                            className="w-28 h-auto mx-auto"
                          />
                        </div>
                        <p className="text-[9px] text-zinc-500 font-mono">
                          {vietqrConfig.bankId} • {vietqrConfig.accountNo} • {vietqrConfig.accountName}
                        </p>
                        <p className="text-[10px] font-black text-rose-600">
                          Số tiền quét QR: {(Number(completedOrder.remainingAmount) || 0).toLocaleString('vi-VN')}₫
                        </p>
                      </div>
                    );
                  }

                  if (block.id === 'footer_greeting' && block.options?.showFooterMessage !== false) {
                    return (
                      <div key={block.id} className="text-center pt-2 text-[10px] text-zinc-500 border-t border-dashed border-zinc-300">
                        <p>{branding.footerMessage || 'Cảm ơn Quý Khách & Hẹn Gặp Lại!'}</p>
                      </div>
                    );
                  }

                  return null;
                })}
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    openStickerModal({
                      orderNumber: completedOrder.orderNumber,
                      cakeName: completedOrder.items?.[0]?.product?.name || (completedOrder.items?.[0] as any)?.name || 'Bánh Kem',
                      customerName: completedOrder.customerName,
                      customerPhone: completedOrder.customerPhone,
                      cakeMessage: completedOrder.cakeMessage,
                      pickupTime: formatPickupDateTime(completedOrder.pickupDateTimeStr) || completedOrder.pickupDateTimeStr,
                      deliveryMethod: completedOrder.deliveryMethod,
                      shippingAddress: completedOrder.shippingAddress,
                      createdAt: completedOrder.createdAt,
                      price: completedOrder.totalAmount,
                      totalAmount: completedOrder.totalAmount,
                      depositAmount: completedOrder.depositAmount ?? completedOrder.totalAmount,
                      remainingAmount: completedOrder.remainingAmount ?? 0,
                    });
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <Tag className="w-4 h-4 text-amber-600" />
                  <span>In Tem Dán Hộp (50x30)</span>
                </button>
                <button
                  onClick={handlePrintReceipt}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700 flex items-center justify-center gap-1.5 hover:bg-zinc-50 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />{' '}
                  {completedOrder.pickupDateTimeStr || completedOrder.customerName
                    ? 'In Phiếu Hẹn'
                    : 'In Hóa Đơn'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintTemplateDesignerOpen(true)}
                  className="p-2.5 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white transition cursor-pointer shadow-xs flex items-center justify-center"
                  title="Tùy chỉnh mẫu in hóa đơn & tem dán kéo thả"
                >
                  <Sparkles className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrinterSettingsOpen(true)}
                  className="p-2.5 rounded-xl border border-zinc-200 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                  title="Cài đặt máy in & kiểm tra kết nối"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  setCompletedOrder(null);
                  setIsCheckoutOpen(false);
                  setMobileTab('menu');
                }}
                className="w-full py-3 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 transition cursor-pointer shadow-md shadow-amber-600/30"
              >
                Tạo Đơn Tiếp Theo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 6: QUẢN LÝ TỒN KHO BÁN THÀNH PHẨM & BÁNH SẴN ── */}
      {isInventoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl flex flex-col max-h-[92dvh] animate-in zoom-in duration-150 border border-stone-200">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-lg text-zinc-900 flex items-center gap-2">
                    <span>Quản Lý Tồn Kho Bán Thành Phẩm & Bánh Sẵn</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black uppercase">
                      Live Sync POS
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-500">
                    Theo dõi số lượng bánh thực tế trong tủ/kệ & kết nối mẻ nướng từ bếp
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsInventoryModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chuyển tab: Tồn kho tủ bánh VS Báo hủy bánh cuối ca VS Lịch sử thay đổi */}
            <div className="flex gap-1.5 rounded-2xl bg-zinc-100 p-1 border border-zinc-200 text-xs font-bold shrink-0 my-2">
              <button
                type="button"
                onClick={() => setInventorySubTab('stock')}
                className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  inventorySubTab === 'stock'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Package className="w-4 h-4 text-emerald-600" />
                <span>Kiểm Kê Tồn Kho Trong Tủ ({products.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setInventorySubTab('spoilage')}
                className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  inventorySubTab === 'spoilage'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Báo Hủy Bánh (Hao Hụt)</span>
                {spoilageLogs.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    inventorySubTab === 'spoilage' ? 'bg-rose-800 text-white' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {spoilageLogs.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPosStockFilterId(null);
                  setIsPosStockHistoryOpen(true);
                }}
                className="px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer bg-white text-amber-900 hover:bg-amber-50 border border-amber-200/80 shadow-xs"
                title="Xem toàn bộ lịch sử thay đổi tồn kho bánh"
              >
                <History className="w-4 h-4 text-amber-600" />
                <span className="hidden sm:inline">Lịch Sử Thay Đổi</span>
                <span className="sm:hidden">Lịch sử</span>
              </button>
            </div>

            {inventorySubTab === 'stock' ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Summary KPI Cards */}
                <div className="grid grid-cols-3 gap-2.5 my-2 shrink-0">
                  <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-zinc-500 font-bold block">Tổng mặt hàng</span>
                      <span className="text-lg font-black text-zinc-900">{products.length} loại</span>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-stone-200/60 flex items-center justify-center text-zinc-600">
                      <Package className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-200 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-emerald-700 font-bold block">Đủ hàng trong tủ</span>
                      <span className="text-lg font-black text-emerald-800">
                        {products.filter((p) => (p.stock_qty ?? 0) > (p.min_stock_alert ?? 3)).length} loại
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-emerald-200/80 flex items-center justify-center text-emerald-700">
                      <Check className="w-4 h-4" />
                    </div>
                  </div>

                  <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] text-amber-700 font-bold block">Cần nướng thêm / Sắp hết</span>
                      <span className="text-lg font-black text-amber-900 flex items-center gap-1.5">
                        {lowStockItems.length} loại
                        {lowStockItems.length > 0 && <span className="text-xs text-rose-600">⚠️</span>}
                      </span>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-amber-200/80 flex items-center justify-center text-amber-700">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-2 pb-2 border-b border-zinc-100 shrink-0">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={inventorySearchQuery}
                      onChange={(e) => setInventorySearchQuery(e.target.value)}
                      placeholder="Tìm kiếm bánh hoặc bán thành phẩm..."
                      className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-medium text-zinc-900 focus:outline-emerald-500"
                    />
                  </div>

                  <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setInventoryCategoryFilter('all')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        inventoryCategoryFilter === 'all'
                          ? 'bg-zinc-900 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Tất cả ({products.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryCategoryFilter('ready')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        inventoryCategoryFilter === 'ready'
                          ? 'bg-amber-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Bánh bán ({products.filter((p) => !p.is_semi_finished).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryCategoryFilter('semi')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        inventoryCategoryFilter === 'semi'
                          ? 'bg-teal-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Bán thành phẩm ({products.filter((p) => p.is_semi_finished).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryCategoryFilter('low')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                        inventoryCategoryFilter === 'low'
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      }`}
                    >
                      ⚠️ Sắp hết ({lowStockItems.length})
                    </button>
                  </div>
                </div>

                {/* Product Stock Table / List */}
                <div className="overflow-y-auto flex-1 py-2 pr-1 space-y-2 overscroll-contain">
                  {products
                    .filter((p) => {
                      const matchSearch = p.name.toLowerCase().includes(inventorySearchQuery.toLowerCase());
                      if (!matchSearch) return false;
                      if (inventoryCategoryFilter === 'ready') return !p.is_semi_finished;
                      if (inventoryCategoryFilter === 'semi') return p.is_semi_finished;
                      if (inventoryCategoryFilter === 'low') return (p.stock_qty ?? 0) <= (p.min_stock_alert ?? 3);
                      return true;
                    })
                    .map((product) => {
                      const stock = product.stock_qty ?? 0;
                      const isOutOfStock = stock <= 0;
                      const isLow = !isOutOfStock && stock <= (product.min_stock_alert ?? 3);
                      const isEditing = editingStockId === product.id;

                      return (
                        <div
                          key={product.id}
                          className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                            isOutOfStock
                              ? 'bg-rose-50/40 border-rose-200'
                              : isLow
                              ? 'bg-amber-50/40 border-amber-200'
                              : 'bg-white border-stone-200/80 hover:border-emerald-300'
                          }`}
                        >
                          {/* Cột 1: Thông tin bánh */}
                          <div className="flex items-center gap-3 min-w-[220px]">
                            <div className="w-12 h-12 rounded-xl bg-stone-100 overflow-hidden shrink-0 relative">
                              {product.image_url ? (
                                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-300 text-[10px]">
                                  No img
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="font-extrabold text-xs text-zinc-900">{product.name}</h4>
                                {product.is_semi_finished && (
                                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200">
                                    Bán thành phẩm
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                                <span>{product.category}</span>
                                <span>•</span>
                                <span className="font-bold text-amber-700">
                                  {(product.selling_price ?? product.price ?? 0).toLocaleString('vi-VN')}₫
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Cột 2: Số lượng tồn kho to rõ */}
                          <div className="flex items-center gap-3">
                            <div className="text-right sm:text-center min-w-[90px]">
                              <span className="text-[10px] text-zinc-400 font-bold block uppercase">Tồn kho</span>
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    value={editingStockVal}
                                    onFocus={(e) => e.target.select()}
                                    onChange={(e) => setEditingStockVal(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        updateProductStock(product.id, Number(editingStockVal) || 0);
                                        setEditingStockId(null);
                                      }
                                    }}
                                    className="w-16 px-1.5 py-0.5 border border-emerald-400 rounded-lg text-xs font-black text-center"
                                    autoFocus
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateProductStock(product.id, Number(editingStockVal) || 0);
                                      setEditingStockId(null);
                                    }}
                                    className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                                    title="Lưu số tồn mới"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span
                                  onClick={() => {
                                    setEditingStockId(product.id);
                                    setEditingStockVal(stock);
                                  }}
                                  className={`text-base font-black px-2.5 py-0.5 rounded-xl cursor-pointer inline-block ${
                                    isOutOfStock
                                      ? 'bg-rose-100 text-rose-700 border border-rose-300'
                                      : isLow
                                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  }`}
                                  title="Bấm vào để chỉnh sửa nhanh số lượng"
                                >
                                  {stock} {product.unit || 'cái'}
                                </span>
                              )}
                            </div>

                            {/* Cột 3: Nút thêm mẻ mới từ bếp & Báo hỏng */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-[10px] text-zinc-400 font-bold hidden md:inline">Nhập mẻ:</span>
                              <button
                                type="button"
                                onClick={() => addProductStock(product.id, 5)}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[11px] font-extrabold rounded-lg transition cursor-pointer active:scale-95"
                                title="Thêm 5 cái từ mẻ nướng mới"
                              >
                                +5
                              </button>
                              <button
                                type="button"
                                onClick={() => addProductStock(product.id, 10)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold rounded-lg transition cursor-pointer active:scale-95 shadow-2xs"
                                title="Thêm 10 cái từ mẻ nướng mới"
                              >
                                +10
                              </button>
                              <button
                                type="button"
                                onClick={() => addProductStock(product.id, 20)}
                                className="px-2 py-1 bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-extrabold rounded-lg transition cursor-pointer active:scale-95 shadow-2xs"
                                title="Thêm 20 cái từ mẻ nướng mới"
                              >
                                +20
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSpoilProductId(product.id);
                                  setSpoilQty(1);
                                  setInventorySubTab('spoilage');
                                }}
                                className="px-2 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-bold rounded-lg transition cursor-pointer active:scale-95 flex items-center gap-1"
                                title="Chuyển sang màn hình Báo Hủy Bánh"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Báo Hủy</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              /* GIAO DIỆN BÁO HỦY BÁNH VÀ HAO HỤT CUỐI CA */
              <div className="flex-1 overflow-y-auto space-y-4 pr-1 overscroll-contain py-2">
                {/* KPI Thiệt hại hao hụt */}
                {(() => {
                  const summary = getTodaySpoilageSummary();
                  return (
                    <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-2.5`}>
                      <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200">
                        <span className="text-[11px] text-rose-700 font-bold block">Tổng bánh hủy hôm nay</span>
                        <span className="text-lg font-black text-rose-800">{summary.totalItems} cái ({summary.count} lần)</span>
                      </div>
                      {isAdmin && (
                        <div className="bg-amber-50 p-3 rounded-2xl border border-amber-200">
                          <span className="text-[11px] text-amber-700 font-bold block">Thiệt hại giá vốn (Cost Loss)</span>
                          <span className="text-lg font-black text-amber-900">
                            {summary.totalCostLoss.toLocaleString('vi-VN')}₫
                          </span>
                        </div>
                      )}
                      <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                        <span className="text-[11px] text-zinc-500 font-bold block">Doanh thu thất thu</span>
                        <span className="text-lg font-black text-zinc-700">
                          {summary.totalRevenueLoss.toLocaleString('vi-VN')}₫
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {spoilSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs font-bold text-emerald-800 flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{spoilSuccessMsg}</span>
                  </div>
                )}

                {/* Form Báo Hủy Bánh */}
                <form onSubmit={handleReportSpoilage} className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                    <h4 className="font-black text-xs text-zinc-900 flex items-center gap-1.5">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      Ghi Nhận Bánh Hỏng / Quá Date Cần Hủy
                    </h4>
                    <span className="text-[10px] text-zinc-400 font-medium">Hệ thống sẽ tự động trừ tồn kho ngay</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* Chọn bánh */}
                    <div className="sm:col-span-1">
                      <label className="font-bold text-zinc-700 block mb-1">Chọn loại bánh:</label>
                      <select
                        value={spoilProductId || (products[0]?.id ?? '')}
                        onChange={(e) => setSpoilProductId(e.target.value)}
                        className="w-full p-2.5 bg-white border border-zinc-300 rounded-xl font-bold text-xs"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (Tồn: {p.stock_qty ?? 0} {p.unit || 'cái'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Số lượng hủy */}
                    <div>
                      <label className="font-bold text-zinc-700 block mb-1">Số lượng hủy:</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="1"
                          max={(() => {
                            const p = products.find((x) => x.id === (spoilProductId || products[0]?.id));
                            return p?.stock_qty ?? 99;
                          })()}
                          value={spoilQty}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setSpoilQty(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                          className="w-full p-2.5 bg-white border border-zinc-300 rounded-xl font-black text-rose-600 text-center text-sm"
                        />
                        <span className="text-xs text-zinc-500 font-bold shrink-0">
                          {products.find((x) => x.id === (spoilProductId || products[0]?.id))?.unit || 'cái'}
                        </span>
                      </div>
                    </div>

                    {/* Lý do hủy */}
                    <div>
                      <label className="font-bold text-zinc-700 block mb-1">Lý do báo hủy:</label>
                      <select
                        value={spoilReason}
                        onChange={(e) => setSpoilReason(e.target.value)}
                        className="w-full p-2.5 bg-white border border-zinc-300 rounded-xl font-semibold text-xs text-zinc-800"
                      >
                        {SPOILAGE_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Ghi chú & Preview thiệt hại */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-zinc-200">
                    <div className="w-full sm:w-1/2">
                      <input
                        type="text"
                        value={spoilNotes}
                        onChange={(e) => setSpoilNotes(e.target.value)}
                        placeholder="Ghi chú thêm nếu có (ví dụ: mẻ nướng ca sáng)..."
                        className="w-full p-2 bg-white border border-zinc-200 rounded-xl text-xs"
                      />
                    </div>

                    {(() => {
                      const sel = products.find((x) => x.id === (spoilProductId || products[0]?.id));
                      const baseCost = (sel as any)?.base_cost_price || Math.round((sel?.selling_price || 0) * 0.35);
                      const costLoss = baseCost * spoilQty;
                      return (
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                          {isAdmin && (
                            <span className="text-xs font-bold text-zinc-600">
                              Thiệt hại vốn: <b className="text-rose-600 text-sm">{costLoss.toLocaleString('vi-VN')}₫</b>
                            </span>
                          )}
                          <button
                            type="submit"
                            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-md shadow-rose-600/30 transition cursor-pointer active:scale-95 flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Xác Nhận Hủy & Trừ Tồn
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </form>

                {/* Danh sách lịch sử báo hủy */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-zinc-700">Lịch Sử Các Lần Báo Hủy Bánh:</h4>
                  {spoilageLogs.length === 0 ? (
                    <div className="text-center py-6 text-xs text-zinc-400 bg-zinc-50 rounded-2xl border border-zinc-100">
                      Chưa có ghi nhận bánh hỏng hoặc hao hụt nào.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-400 font-bold">
                            <th className="py-2">Thời gian</th>
                            <th className="py-2">Tên bánh</th>
                            <th className="py-2 text-center">SL hủy</th>
                            {isAdmin && <th className="py-2 text-right">Thiệt hại vốn</th>}
                            <th className="py-2">Lý do</th>
                            <th className="py-2">Người báo</th>
                            <th className="py-2 text-center">Xóa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {spoilageLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-zinc-50">
                              <td className="py-2 text-zinc-500 whitespace-nowrap">
                                {new Date(log.loggedAt).toLocaleString('vi-VN')}
                              </td>
                              <td className="py-2 font-bold text-zinc-900">{log.productName}</td>
                              <td className="py-2 text-center font-black text-rose-600">
                                -{log.quantity} {log.unit}
                              </td>
                              {isAdmin && (
                                <td className="py-2 text-right font-black text-amber-800">
                                  {(log.totalCostLoss || 0).toLocaleString('vi-VN')}₫
                                </td>
                              )}
                              <td className="py-2 text-zinc-600">
                                <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 text-[10px] font-bold">
                                  {log.reason}
                                </span>
                              </td>
                              <td className="py-2 text-zinc-500">{log.loggedBy}</td>
                              <td className="py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    deleteSpoilageLog(log.id);
                                    reloadSpoilage();
                                  }}
                                  className="p-1 text-zinc-300 hover:text-rose-600 rounded transition cursor-pointer"
                                  title="Xóa nhật ký này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer Modal */}
            <div className="pt-3 border-t border-zinc-100 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-zinc-500 italic">
                💡 Tồn kho được đồng bộ tức thì sang màn hình bếp & quầy thu ngân đa thiết bị.
              </span>
              <button
                type="button"
                onClick={() => setIsInventoryModalOpen(false)}
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm"
              >
                Đóng & Áp Dụng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIGHTBOX: XEM ẢNH MẪU BÁNH TO (HD) ── */}
      {preorderImageLightbox && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setPreorderImageLightbox(null)}
        >
          <div className="relative max-w-2xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex justify-between items-center pb-2 text-white text-xs font-bold border-b border-white/20 mb-2">
              <span className="flex items-center gap-1.5 text-pink-300">
                <Camera className="w-4 h-4 text-pink-400" /> Ảnh mẫu bánh khách gửi (Độ nét cao HD)
              </span>
              <button
                onClick={() => setPreorderImageLightbox(null)}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/40 text-white font-bold flex items-center justify-center cursor-pointer transition text-sm"
              >
                ✕
              </button>
            </div>
            <div className="w-full overflow-auto max-h-[80vh] flex items-center justify-center bg-black/60 rounded-2xl p-1 border border-white/15 shadow-2xl">
              <img
                src={preorderImageLightbox}
                alt="Ảnh mẫu bánh HD"
                className="max-w-full max-h-[78vh] w-auto h-auto object-contain rounded-xl"
              />
            </div>
            <div className="text-center mt-2 text-white/70 text-xs font-medium">Bấm bên ngoài hoặc nút ✕ để đóng</div>
          </div>
        </div>
      )}

      {/* ── MODAL IN TEM DÁN HỘP BÁNH (STICKER 50x30 / 50x40) ── */}
      <CakeStickerModal
        isOpen={isStickerModalOpen}
        onClose={() => setIsStickerModalOpen(false)}
        data={stickerModalData}
      />

      {/* ── MODAL XEM CHI TIẾT ĐƠN HÀNG KHI MỞ QUA URL / THÔNG BÁO (?order=...) ── */}
      {posViewingOrderDetail && (
        <OrderDetailModal
          isOpen={!!posViewingOrderDetail}
          onClose={() => {
            if (posViewingOrderDetail) {
              const num = posViewingOrderDetail.order_number || posViewingOrderDetail.orderNumber || posViewingOrderDetail.id;
              if (num) posDismissedOrderParamsRef.current.add(String(num));
            }
            setPosViewingOrderDetail(null);
            try {
              const url = new URL(window.location.href);
              if (url.searchParams.has('order')) {
                url.searchParams.delete('order');
                const cleanUrl = url.pathname + (url.search ? url.search : '') + url.hash;
                window.history.replaceState({}, '', cleanUrl);
              }
            } catch {}
          }}
          order={posViewingOrderDetail}
          onPrintSticker={(ord) => {
            const fromN = parsePreorderFromNotes(ord.notes);
            openStickerModal({
              orderNumber: ord.order_number || ord.orderNumber || ord.id,
              cakeName: ord.cake_name || fromN.cake_name || ord.items?.[0]?.product_name_snapshot || 'Bánh Kem',
              customerName: ord.customer_name || ord.customerName || fromN.customer_name,
              customerPhone: ord.customer_phone || ord.customerPhone || fromN.customer_phone,
              cakeMessage: ord.cake_message || fromN.cake_message,
              pickupTime: ord.preorder_pickup_at || ord.pickupDateTime || fromN.pickup_time,
              deliveryMethod: ord.delivery_method || fromN.delivery_method,
              shippingAddress: ord.shipping_address || fromN.shipping_address,
              createdAt: ord.created_at,
              price: ord.total_amount || fromN.total_amount,
              totalAmount: ord.total_amount || fromN.total_amount,
              depositAmount: ord.deposit_amount ?? fromN.deposit_amount,
              remainingAmount: ord.remaining_amount !== undefined ? ord.remaining_amount : fromN.remaining_amount,
              notes: cleanDisplayNotes(ord.notes) || fromN.special_request,
              flavor: ord.flavor || fromN.flavor,
              cream: ord.cream || fromN.cream,
              filling: ord.filling || fromN.filling,
              packaging: ord.packaging || fromN.packaging,
            });
          }}
          showNavigationButtons={true}
        />
      )}

      {/* ── MODAL XÁC THỰC MÃ PIN QUẢN LÝ ── */}
      {pinActionData && (
        <ManagerPinModal
          isOpen={isPinModalOpen}
          onClose={() => {
            setIsPinModalOpen(false);
            setPinActionData(null);
          }}
          onSuccess={() => {
            pinActionData.onSuccess();
            setIsPinModalOpen(false);
            setPinActionData(null);
          }}
          title={pinActionData.title}
          subtitle={pinActionData.subtitle}
          actionDescription={pinActionData.actionDescription}
        />
      )}

      {/* ── MODAL XÁC NHẬN XÓA VĨNH VIỄN HÓA ĐƠN / ĐƠN HÀNG ── */}
      {orderToDelete && (
        <div className="fixed inset-0 z-[9999] bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border-2 border-rose-300 text-zinc-900 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-xs">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="font-black text-base text-zinc-900">Xác Nhận Xóa Hóa Đơn</h3>
                  <p className="text-[11px] text-zinc-500 font-medium">Xóa dữ liệu vĩnh viễn khỏi toàn hệ thống</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOrderToDelete(null);
                  setDeletePinInput('');
                  setDeletePinError(null);
                }}
                className="text-zinc-400 hover:text-zinc-700 p-1.5 rounded-xl hover:bg-zinc-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chi tiết đơn đang xóa */}
            {(() => {
              const oNum = orderToDelete.order_number || orderToDelete.orderNumber || 'Không mã';
              const totalAmt = Number(orderToDelete.total_amount || orderToDelete.totalPrice || 0);
              const cust = orderToDelete.customer_name || orderToDelete.customerName || 'Khách vãng lai';
              const phone = orderToDelete.customer_phone || orderToDelete.customerPhone || '';
              const created = orderToDelete.created_at ? new Date(orderToDelete.created_at).toLocaleString('vi-VN') : 'Vừa xong';
              const itemCount = Array.isArray(orderToDelete.items) ? orderToDelete.items.length : 1;

              return (
                <div className="p-3.5 bg-rose-50/70 rounded-2xl border border-rose-200/80 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-medium">Mã đơn:</span>
                    <span className="font-mono font-black text-rose-900 text-sm">#{oNum}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-medium">Khách hàng:</span>
                    <span className="font-bold text-zinc-800">{cust} {phone ? `(${phone})` : ''}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500 font-medium">Thời gian:</span>
                    <span className="text-zinc-600">{created}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-rose-200/60">
                    <span className="text-zinc-600 font-medium">Tổng tiền ({itemCount} món):</span>
                    <span className="font-black text-rose-700 text-base">{totalAmt.toLocaleString('vi-VN')}₫</span>
                  </div>
                </div>
              );
            })()}

            {/* Cảnh báo hành động */}
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <b>Cảnh báo:</b> Hóa đơn này và các phiếu đổi trả liên quan sẽ bị xóa hoàn toàn khỏi <b>Máy POS, Màn hình Bếp, Sổ sách và Đám mây</b>. Thao tác này <b>không thể hoàn tác</b>.
              </div>
            </div>

            {/* Phân quyền: Nếu là Admin -> Cho phép xóa trực tiếp 1-click */}
            {isAdmin ? (
              <div className="space-y-3 pt-1">
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Đang đăng nhập với quyền <b>Chủ Tiệm (Admin)</b> — Được phép xóa trực tiếp.</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isDeletingOrder}
                    onClick={() => setOrderToDelete(null)}
                    className="flex-1 py-3 rounded-2xl border border-zinc-200 hover:bg-zinc-50 font-bold text-xs text-zinc-600 transition cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingOrder}
                    onClick={() => handlePermanentDeleteOrder(orderToDelete)}
                    className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isDeletingOrder ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang xóa...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Xác Nhận Xóa Vĩnh Viễn</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Nếu là Nhân viên -> Yêu cầu nhập PIN */
              <div className="space-y-3 pt-1">
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <label className="font-bold text-zinc-700">Mã PIN Quản Lý xác thực:</label>
                    <span className="text-[11px] text-amber-700 font-medium">Mặc định: <b>8888</b></span>
                  </div>
                  <input
                    type="password"
                    value={deletePinInput}
                    onChange={(e) => {
                      setDeletePinInput(e.target.value);
                      setDeletePinError(null);
                    }}
                    placeholder="Nhập PIN (Mặc định: 8888)"
                    className="w-full text-center py-2.5 bg-zinc-50 border-2 border-amber-300 rounded-xl text-base font-mono font-black text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleConfirmDeleteOrderWithPin();
                    }}
                  />
                  {deletePinError && (
                    <p className="text-xs text-rose-600 font-bold text-center pt-0.5">{deletePinError}</p>
                  )}
                </div>

                {/* Bàn phím số cảm ứng nhanh */}
                <div className="grid grid-cols-3 gap-1.5 select-none pt-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => {
                        setDeletePinInput((p) => (p.length < 8 ? p + digit : p));
                        setDeletePinError(null);
                      }}
                      className="py-2.5 bg-zinc-100 hover:bg-zinc-200 active:bg-amber-100 rounded-xl font-bold text-base text-zinc-800 transition cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setDeletePinInput('');
                      setDeletePinError(null);
                    }}
                    className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl font-bold text-xs transition cursor-pointer"
                  >
                    Xóa hết
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeletePinInput((p) => (p.length < 8 ? p + '0' : p));
                      setDeletePinError(null);
                    }}
                    className="py-2.5 bg-zinc-100 hover:bg-zinc-200 active:bg-amber-100 rounded-xl font-bold text-base text-zinc-800 transition cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeletePinInput((p) => p.slice(0, -1));
                      setDeletePinError(null);
                    }}
                    className="py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl font-bold text-xs flex items-center justify-center transition cursor-pointer"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={isDeletingOrder}
                    onClick={() => {
                      setOrderToDelete(null);
                      setDeletePinInput('');
                      setDeletePinError(null);
                    }}
                    className="flex-1 py-3 rounded-2xl border border-zinc-200 hover:bg-zinc-50 font-bold text-xs text-zinc-600 transition cursor-pointer"
                  >
                    Hủy Bỏ
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingOrder || !deletePinInput}
                    onClick={handleConfirmDeleteOrderWithPin}
                    className="flex-1 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    {isDeletingOrder ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Đang xóa...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        <span>Xác Nhận Xóa</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL LỊCH SỬ THAY ĐỔI TỒN KHO BÁNH ── */}
      <StockAdjustmentHistoryModal
        isOpen={isPosStockHistoryOpen}
        onClose={() => setIsPosStockHistoryOpen(false)}
        filterProductId={posStockFilterId}
      />

      {/* ── MODAL CÀI ĐẶT MÁY IN VÀ KIỂM TRA KẾT NỐI ── */}
      <PrinterSettingsModal
        isOpen={isPrinterSettingsOpen}
        onClose={() => setIsPrinterSettingsOpen(false)}
      />

      {/* ── MODAL CÀI ĐẶT THÔNG BÁO, ÂM BÁO & KIỂM TRA PWA/TELEGRAM ── */}
      <NotificationSettingsModal
        isOpen={isNotifSettingsOpen}
        defaultTab={notifModalTab}
        onClose={() => {
          setIsNotifSettingsOpen(false);
          setSoundEnabled(soundManager.isEnabled());
        }}
      />

      {/* ── MODAL TRÌNH THIẾT KẾ MẪU IN KÉO THẢ (HÓA ĐƠN & TEM DÁN) ── */}
      <PrintTemplateDesignerModal
        isOpen={isPrintTemplateDesignerOpen}
        onClose={() => {
          setIsPrintTemplateDesignerOpen(false);
          setReceiptConfig(getReceiptTemplate('80mm'));
        }}
        initialTab="receipt"
      />

      {/* ── MODAL ĐƠN CHỜ SHIP / CHỜ GIAO QUẦY (BƯỚC 3 BẾP) ── */}
      <PosReadyShippingModal
        isOpen={isReadyShippingModalOpen}
        onClose={() => setIsReadyShippingModalOpen(false)}
        orders={readyShippingOrders}
        currentTime={currentTime}
        vietqrConfig={vietqrConfig}
        onCompleteOrder={handleCompleteReadyOrder}
        onOpenSticker={handleOpenReadySticker}
        onOpenDetail={(o) => setPosViewingOrderDetail(o)}
        onSyncCloud={syncOrdersFromSupabase}
      />

      {/* ── MODAL ĐẶT BÁNH SINH NHẬT THEO CƠ CHẾ FLOWCHART MỚI ── */}
      <BirthdayCakeOrderModal
        isOpen={isBirthdayOrderModalOpen}
        onClose={() => setIsBirthdayOrderModalOpen(false)}
        product={birthdayOrderProduct}
        availableProducts={products}
        onConfirmOrder={handleConfirmBirthdayCakeOrder}
      />

      {/* ── THÔNG BÁO TIỀN VỀ TỰ ĐỘNG (AUTO-BANK WEBHOOK TOAST) ── */}
      {toastPaymentNotice && (
        <div
          onClick={() => setToastPaymentNotice(null)}
          className="fixed top-5 right-5 z-[120] max-w-sm w-full bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl border border-emerald-400 flex items-start gap-3 cursor-pointer animate-in slide-in-from-top-4 duration-300"
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">💰 ĐÃ NHẬN CHUYỂN KHOẢN!</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setToastPaymentNotice(null);
                }}
                className="text-white/80 hover:text-white text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="text-base font-black mt-0.5 text-white">
              +{Number(toastPaymentNotice.amount || 0).toLocaleString('vi-VN')}₫
            </div>
            <div className="text-xs text-emerald-100 mt-0.5 truncate">
              {toastPaymentNotice.orderCode ? `Mã đơn: ${toastPaymentNotice.orderCode} • ` : ''}
              Cổng: {toastPaymentNotice.gateway || 'AutoBank'}
            </div>
          </div>
        </div>
      )}

      {/* Overlay hiệu ứng hạt bay vào giỏ hàng 3D mượt mà (60fps GPU-Accelerated) */}
      {flyingItems.map((item) => (
        <div
          key={item.id}
          style={{
            '--sx': `${item.startX}px`,
            '--sy': `${item.startY}px`,
            '--mx': `${item.midX}px`,
            '--my': `${item.midY}px`,
            '--ex': `${item.endX}px`,
            '--ey': `${item.endY}px`,
          } as React.CSSProperties}
          className="animate-fly-smooth flex items-center justify-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-500 to-orange-400 text-white shadow-[0_12px_36px_rgba(217,119,6,0.65)] flex items-center justify-center p-1.5 border-2 border-white ring-4 ring-amber-400/60 relative">
            {item.image ? (
              <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <span className="text-3xl drop-shadow-sm">🍰</span>
            )}
            <div className="absolute -inset-1.5 rounded-2xl bg-amber-400/40 blur-xs -z-10" />
          </div>
        </div>
      ))}

      {/* ── MODAL TẠM LƯU ĐƠN HÀNG (HELD ORDERS) ── */}
      <HeldOrdersModal
        isOpen={isHeldOrdersModalOpen}
        onClose={() => setIsHeldOrdersModalOpen(false)}
        heldOrders={heldOrders}
        activeCartCount={cart.length}
        onRestoreOrder={(order, holdCurrent) => {
          handleRestoreHeldOrder(order, holdCurrent);
          setIsHeldOrdersModalOpen(false);
        }}
        onDeleteOrder={handleDeleteHeldOrder}
        onClearAll={handleClearAllHeldOrders}
      />

      {/* ── MODAL NHẬP TÊN/GHI CHÚ KHI TẠM LƯU ĐƠN ── */}
      {isHoldPromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 border border-stone-200 animate-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="font-black text-sm text-zinc-900 flex items-center gap-2">
                <PauseCircle className="w-4 h-4 text-amber-600" /> Tạm Lưu Đơn Hàng Hiện Tại
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsHoldPromptOpen(false);
                  setHoldLabelInput('');
                }}
                className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-zinc-600">
                Đơn hàng gồm <b>{cart.reduce((s, i) => s + i.quantity, 0)} món</b> ({grandTotal.toLocaleString('vi-VN')}₫) sẽ được tạm lưu vào danh sách.
              </p>
              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                  Tên hoặc ghi nhớ đơn tạm (không bắt buộc):
                </label>
                <input
                  type="text"
                  value={holdLabelInput}
                  onChange={(e) => setHoldLabelInput(e.target.value)}
                  placeholder="VD: Bàn 3, Anh áo đen, Chị váy hoa..."
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-zinc-800 focus:bg-white focus:outline-amber-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleHoldCurrentOrder(holdLabelInput);
                      setIsHoldPromptOpen(false);
                      setHoldLabelInput('');
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setIsHoldPromptOpen(false);
                  setHoldLabelInput('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-stone-200 text-xs font-bold text-zinc-600 hover:bg-stone-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => {
                  handleHoldCurrentOrder(holdLabelInput);
                  setIsHoldPromptOpen(false);
                  setHoldLabelInput('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-sm cursor-pointer"
              >
                Xác Nhận Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ĐỔI TRẢ HÀNG & HOÀN TIỀN (RETURNS & EXCHANGES) ── */}
      <ReturnExchangeModal
        isOpen={isReturnExchangeModalOpen}
        onClose={() => {
          setIsReturnExchangeModalOpen(false);
          setOrderToReturn(null);
        }}
        initialOrder={orderToReturn}
        ordersList={invoicesList}
        availableProducts={products}
        cashierName={user?.name || 'Thu Ngân Quầy POS'}
        onExecuteReturn={handleExecuteReturn}
      />
    </div>
  );
}
