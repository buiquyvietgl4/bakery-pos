'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { db, CachedProduct } from '@/lib/db/dexie';
import { DEFAULT_BAKERY_PRODUCTS } from '@/lib/constants/bakeryData';
import { generateUUID } from '@/lib/utils/uuid';
import { 
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, 
  Banknote, QrCode, CheckCircle2, AlertCircle, X, Printer,
  Sparkles, Wallet, Lock, History, AlertTriangle, Cake, Calendar,
  Clock, Phone, User, MessageSquare, Tag, Eye, Copy, Check, Building2,
  Package, ArrowLeft, ChevronRight, Receipt, FileSpreadsheet
} from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { exportToCSV } from '@/lib/utils/exportExcel';
import { broadcastNewOrder, subscribeCrossDeviceSync } from '@/lib/supabase/realtimeSync';

interface CartItem {
  product: CachedProduct;
  quantity: number;
  notes?: string;
}

interface ShiftState {
  isOpen: boolean;
  openedAt: string | null;
  openingCash: number;
  cashSales: number;
  transferSales: number;
  orderCount: number;
}

interface PreorderFormData {
  customerName: string;
  customerPhone: string;
  pickupDate: string;
  pickupTime: string;
  cakeName: string;
  size: string;
  flavor: string;
  cakeMessage: string;
  notes: string;
  totalPrice: number;
  depositAmount: number;
  paymentMethod: 'cash' | 'transfer' | 'momo';
}

export default function POSPage() {
  const { user } = useAuth();
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');
  const [products, setProducts] = useState<CachedProduct[]>(() => {
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
  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Tất cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  
  // Shift Management State
  const [shift, setShift] = useState<ShiftState>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('bakery_current_shift');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return {
      isOpen: true,
      openedAt: new Date().toISOString(),
      openingCash: 500000,
      cashSales: 0,
      transferSales: 0,
      orderCount: 0,
    };
  });

  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [closingCashInput, setClosingCashInput] = useState<number>(0);

  // Normal Checkout Modal State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'momo'>('cash');
  const [cashGiven, setCashGiven] = useState<number>(0);
  const [processingOrder, setProcessingOrder] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any | null>(null);

  // VietQR Config State
  const [vietqrConfig, setVietqrConfig] = useState({
    bankId: 'MB',
    bankName: 'MBBank (Ngân hàng Quân Đội)',
    accountNo: '0988888888',
    accountName: 'TIEM BANH HOANG GIA',
    template: 'compact2',
    transferSyntax: 'DH',
  });
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copiedPreorderAccount, setCopiedPreorderAccount] = useState(false);

  // E-Wallet Config State
  const [ewalletConfig, setEwalletConfig] = useState({
    activeWallet: 'momo' as 'momo' | 'zalopay' | 'viettelmoney',
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
  const [selectedWalletType, setSelectedWalletType] = useState<'momo' | 'zalopay' | 'viettelmoney'>('momo');
  const [copiedWalletPhone, setCopiedWalletPhone] = useState(false);
  const [copiedPreorderWalletPhone, setCopiedPreorderWalletPhone] = useState(false);

  // ── ĐẶT BÁNH KEM (CUSTOM CAKE PREORDER) MODAL STATE ──
  const [isPreorderModalOpen, setIsPreorderModalOpen] = useState(false);
  const [preorderForm, setPreorderForm] = useState<PreorderFormData>({
    customerName: '',
    customerPhone: '',
    pickupDate: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Mặc định ngày mai
    pickupTime: '17:30',
    cakeName: 'Bánh Bông Lan Trứng Muối 18cm',
    size: 'Size 18cm (6 - 8 người)',
    flavor: 'Cốt bánh Vani sốt phô mai',
    cakeMessage: 'Chúc Mừng Sinh Nhật',
    notes: 'Ít ngọt, trang trí tone màu ấm, kèm nến số',
    totalPrice: 365000,
    depositAmount: 150000,
    paymentMethod: 'cash',
  });
  const [preorderError, setPreorderError] = useState<string | null>(null);

  // Preorder List View Modal
  const [isPreorderListOpen, setIsPreorderListOpen] = useState(false);
  const [preordersList, setPreordersList] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const hasSeeded = localStorage.getItem('bakery_kds_seeded');
        const rawOrders = localStorage.getItem('bakery_orders');
        if (rawOrders) {
          const parsed = JSON.parse(rawOrders);
          if (Array.isArray(parsed)) {
            const pos = parsed.filter((o: any) => o.order_type === 'preorder' || o.pickupDateTime);
            if (pos.length > 0 || hasSeeded) return pos;
          }
        }
        const saved = localStorage.getItem('bakery_preorders');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && (parsed.length > 0 || hasSeeded)) return parsed;
        }
        if (hasSeeded) return [];
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

  // ── LỊCH SỬ HÓA ĐƠN & LƯU TRỮ ĐƠN ĐÃ XUẤT STATE ──
  const [isInvoiceHistoryOpen, setIsInvoiceHistoryOpen] = useState(false);
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

  // 1. Fetch Products with offline-first persistence
  const loadProducts = async () => {
    try {
      let currentProducts: CachedProduct[] = DEFAULT_BAKERY_PRODUCTS;
      let localProducts: CachedProduct[] = [];
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('bakery_products');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              localProducts = parsed;
              currentProducts = parsed;
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

      setProducts(currentProducts);
      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_products', JSON.stringify(currentProducts));
      }

      // Sync from Supabase if online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, category, image_url, selling_price, is_active, is_preorder_only')
          .eq('is_active', true);

        if (!error && data && data.length > 0) {
          setProducts(data);
          if (typeof window !== 'undefined') {
            localStorage.setItem('bakery_products', JSON.stringify(data));
          }
          try {
            await db.products.clear();
            await db.products.bulkPut(data);
          } catch {}
        }
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setProducts((prev) => (prev && prev.length > 0 ? prev : DEFAULT_BAKERY_PRODUCTS));
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
    }

    return () => {
      window.removeEventListener('bakery_products_updated', handleProductsUpdated);
    };
  }, []);

  // Đồng bộ hóa đơn và đơn đặt trước từ LocalStorage Realtime
  const reloadOrdersData = () => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setInvoicesList(parsed);
            const pos = parsed.filter((o: any) => o.order_type === 'preorder' || o.pickupDateTime);
            if (pos.length > 0) {
              setPreordersList(pos);
            }
          }
        }
      } catch (e) {
        console.warn('Lỗi đồng bộ orders:', e);
      }
    }
  };

  useEffect(() => {
    reloadOrdersData();
    const handleSync = () => reloadOrdersData();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'bakery_orders' || e.key === 'bakery_preorders') reloadOrdersData();
    };

    window.addEventListener('bakery_orders_updated', handleSync);
    window.addEventListener('storage', handleStorage);

    // Kênh đồng bộ đa thiết bị tức thì (Điện thoại bếp bấm đổi trạng thái -> Quầy POS cập nhật ngay)
    const unsubscribeSync = subscribeCrossDeviceSync({
      onStatusUpdate: () => reloadOrdersData(),
      onNewOrder: () => reloadOrdersData(),
      onDbChange: () => reloadOrdersData(),
    });

    return () => {
      window.removeEventListener('bakery_orders_updated', handleSync);
      window.removeEventListener('storage', handleStorage);
      unsubscribeSync();
    };
  }, []);

  // Save Shift State
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bakery_current_shift', JSON.stringify(shift));
    }
  }, [shift]);

  const categories = ['Tất cả', ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'Tất cả' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  const addToCart = (product: CachedProduct) => {
    // Nếu bánh chuyên nhận đặt trước, mở ngay Modal Đặt Bánh Kem điền sẵn mẫu bánh!
    if (product.is_preorder_only) {
      setPreorderForm((prev) => ({
        ...prev,
        cakeName: product.name,
        totalPrice: product.selling_price,
        depositAmount: Math.round(product.selling_price * 0.4),
      }));
      setIsPreorderModalOpen(true);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
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

  const subtotal = cart.reduce((sum, item) => sum + item.product.selling_price * item.quantity, 0);
  const discountAmount = Math.round((subtotal * discountPct) / 100);
  const totalAmount = Math.max(0, subtotal - discountAmount);
  const changeAmount = Math.max(0, cashGiven - totalAmount);

  // Expected Cash in Register
  const expectedCashInRegister = shift.openingCash + shift.cashSales;
  const shiftCashDifference = closingCashInput - expectedCashInRegister;

  // Checkout Handler for regular sales
  const handleCompleteOrder = async () => {
    if (cart.length === 0) return;
    setProcessingOrder(true);

    try {
      const now = new Date();
      const orderNumber = `BK-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate()
      ).padStart(2, '0')}-${String(Math.floor(100 + Math.random() * 900))}`;
      const localId = generateUUID();

      const orderData = {
        local_id: localId,
        order_number: orderNumber,
        order_type: 'takeaway' as const,
        status: 'pending' as const,
        subtotal,
        discount_amount: discountAmount,
        discount_pct: discountPct,
        total_amount: totalAmount,
        total_cogs: 0,
        sync_status: 'synced' as const,
        created_at: now.toISOString(),
        items: cart.map((item) => ({
          product_id: item.product.id,
          product_name_snapshot: item.product.name,
          quantity: item.quantity,
          unit_price: item.product.selling_price,
          unit_cost: 0,
          line_total: item.product.selling_price * item.quantity,
          line_cost: 0,
          notes: item.notes || '',
        })),
        payments: [
          {
            method: paymentMethod,
            amount: totalAmount,
          },
        ],
      };

      // 1. Lưu ngay lập tức vào Dexie IndexedDB & localStorage
      try {
        await db.orders.add(orderData);
      } catch (dbErr) {
        console.warn('Lỗi ghi Dexie:', dbErr);
      }

      if (typeof window !== 'undefined') {
        try {
          const recentOrders = JSON.parse(localStorage.getItem('bakery_orders') || '[]');
          recentOrders.unshift(orderData);
          localStorage.setItem('bakery_orders', JSON.stringify(recentOrders.slice(0, 100)));
          localStorage.setItem('bakery_kds_seeded', 'true');
          setInvoicesList(recentOrders.slice(0, 100));
          window.dispatchEvent(new Event('bakery_orders_updated'));
          broadcastNewOrder(orderData);
        } catch {}
      }

      // 2. Cập nhật tiền ca bán
      setShift((prev) => ({
        ...prev,
        orderCount: prev.orderCount + 1,
        cashSales: paymentMethod === 'cash' ? prev.cashSales + totalAmount : prev.cashSales,
        transferSales: paymentMethod !== 'cash' ? prev.transferSales + totalAmount : prev.transferSales,
      }));

      // 3. Đóng popup thanh toán, hiện phiếu hóa đơn in nhiệt và chuyển về Menu
      setIsCheckoutOpen(false);
      setCompletedOrder({
        orderNumber,
        items: [...cart],
        subtotal,
        discountAmount,
        totalAmount,
        paymentMethod,
        cashGiven: paymentMethod === 'cash' ? (cashGiven || totalAmount) : totalAmount,
        changeAmount: paymentMethod === 'cash' ? Math.max(0, (cashGiven || totalAmount) - totalAmount) : 0,
        createdAt: now.toLocaleString('vi-VN'),
        cashier: user?.name || 'Thu Ngân',
      });
      clearCart();
      setMobileTab('menu');

      // 4. Đồng bộ Supabase nền (non-blocking)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        (async () => {
          try {
            const { data: insertedOrder } = await supabase
              .from('orders')
              .insert({
                local_id: localId,
                order_number: orderNumber,
                order_type: 'takeaway',
                status: 'pending',
                subtotal,
                discount_amount: discountAmount,
                discount_pct: discountPct,
                total_amount: totalAmount,
                total_cogs: 0,
              })
              .select('id')
              .single();

            if (insertedOrder) {
              const itemsToInsert = cart
                .map((item) => ({
                  order_id: insertedOrder.id,
                  product_id: item.product.id.length === 36 ? item.product.id : undefined,
                  product_name_snapshot: item.product.name,
                  quantity: item.quantity,
                  unit_price: item.product.selling_price,
                  unit_cost: 0,
                }))
                .filter((i) => i.product_id);

              if (itemsToInsert.length > 0) {
                await supabase.from('order_items').insert(itemsToInsert);
              }

              await supabase.from('payments').insert({
                order_id: insertedOrder.id,
                method: paymentMethod,
                amount: totalAmount,
              });
            }
          } catch (syncErr) {
            console.warn('Sync background notice:', syncErr);
          }
        })();
      }
    } catch (err) {
      console.error('Lỗi khi tạo đơn:', err);
      setIsCheckoutOpen(false);
      setMobileTab('menu');
      clearCart();
    } finally {
      setProcessingOrder(false);
    }
  };

  // ── HANDLER: TẠO ĐƠN ĐẶT BÁNH KEM (PREORDER CAKE) ──
  const handleCreatePreorder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preorderForm.customerName?.trim() || !preorderForm.customerPhone?.trim()) {
      setPreorderError('Vui lòng nhập Tên khách hàng và Số điện thoại!');
      return;
    }
    setPreorderError(null);

    setProcessingOrder(true);
    try {
      const now = new Date();
      const orderNumber = `BK-PRE-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
        now.getDate()
      ).padStart(2, '0')}-${String(Math.floor(100 + Math.random() * 900))}`;
      const localId = generateUUID();
      
      const pickupDateTimeStr = `${preorderForm.pickupTime} ngày ${preorderForm.pickupDate}`;
      const fullNotes = `[ĐẶT BÁNH KEM] Khách: ${preorderForm.customerName} (${preorderForm.customerPhone}) | Lấy: ${pickupDateTimeStr} | Size: ${preorderForm.size} | Chữ trên bánh: "${preorderForm.cakeMessage}" | Yêu cầu: ${preorderForm.notes} | Cọc: ${preorderForm.depositAmount.toLocaleString('vi-VN')}đ | Còn thu: ${(preorderForm.totalPrice - preorderForm.depositAmount).toLocaleString('vi-VN')}đ`;

      // 1. Tạo đơn đặt bánh đồng bộ đầy đủ thông tin cho cả Bếp KDS và Lịch Sử Hóa Đơn
      const unifiedPreorder = {
        id: localId,
        local_id: localId,
        order_number: orderNumber,
        orderNumber,
        order_type: 'preorder' as const,
        status: 'pending' as const,
        created_at: now.toISOString(),
        preorder_pickup_at: pickupDateTimeStr,
        pickupDateTime: pickupDateTimeStr,
        customer_name: preorderForm.customerName,
        customerName: preorderForm.customerName,
        customer_phone: preorderForm.customerPhone,
        customerPhone: preorderForm.customerPhone,
        cake_name: preorderForm.cakeName,
        cakeName: preorderForm.cakeName,
        cake_size: preorderForm.size,
        size: preorderForm.size,
        flavor: preorderForm.flavor,
        cake_message: preorderForm.cakeMessage,
        cakeMessage: preorderForm.cakeMessage,
        special_notes: preorderForm.notes,
        notes: fullNotes,
        subtotal: preorderForm.totalPrice,
        discount_amount: 0,
        discount_pct: 0,
        total_amount: preorderForm.totalPrice,
        totalPrice: preorderForm.totalPrice,
        deposit_amount: preorderForm.depositAmount,
        depositAmount: preorderForm.depositAmount,
        remaining_amount: preorderForm.totalPrice - preorderForm.depositAmount,
        remainingAmount: preorderForm.totalPrice - preorderForm.depositAmount,
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
            line_total: preorderForm.totalPrice,
            notes: `Chữ: "${preorderForm.cakeMessage}"${preorderForm.notes ? ` | ${preorderForm.notes}` : ''}`,
          },
        ],
        payments: preorderForm.depositAmount > 0 ? [
          {
            method: preorderForm.paymentMethod,
            amount: preorderForm.depositAmount,
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
          localStorage.setItem('bakery_orders', JSON.stringify(recentOrders.slice(0, 100)));
          localStorage.setItem('bakery_kds_seeded', 'true');
          setInvoicesList(recentOrders.slice(0, 100));

          const recentPos = JSON.parse(localStorage.getItem('bakery_preorders') || '[]');
          recentPos.unshift(unifiedPreorder);
          localStorage.setItem('bakery_preorders', JSON.stringify(recentPos.slice(0, 100)));

          window.dispatchEvent(new Event('bakery_orders_updated'));
          broadcastNewOrder(unifiedPreorder);
        } catch {}
      }

      setPreordersList((prev) => [unifiedPreorder, ...prev]);

      // 2. Cập nhật tiền ca bán từ tiền cọc
      if (preorderForm.depositAmount > 0) {
        setShift((prev) => ({
          ...prev,
          orderCount: prev.orderCount + 1,
          cashSales: preorderForm.paymentMethod === 'cash' ? prev.cashSales + preorderForm.depositAmount : prev.cashSales,
          transferSales: preorderForm.paymentMethod !== 'cash' ? prev.transferSales + preorderForm.depositAmount : prev.transferSales,
        }));
      }

      // 3. Đóng modal và tạo phiếu hẹn/Hóa đơn cọc
      setIsPreorderModalOpen(false);
      setCompletedOrder({
        orderNumber,
        items: [
          {
            product: {
              name: `[BÁNH ĐẶT] ${preorderForm.cakeName} (${preorderForm.size})`,
              selling_price: preorderForm.totalPrice,
            },
            quantity: 1,
          },
        ],
        subtotal: preorderForm.totalPrice,
        discountAmount: 0,
        totalAmount: preorderForm.totalPrice,
        depositAmount: preorderForm.depositAmount,
        remainingAmount: preorderForm.totalPrice - preorderForm.depositAmount,
        paymentMethod: preorderForm.paymentMethod,
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
        cakeName: 'Bánh Bông Lan Trứng Muối 18cm',
        size: 'Size 18cm (6 - 8 người)',
        flavor: 'Cốt bánh Vani sốt phô mai',
        cakeMessage: 'Chúc Mừng Sinh Nhật',
        notes: 'Ít ngọt, trang trí hoa kem',
        totalPrice: 365000,
        depositAmount: 150000,
        paymentMethod: 'cash',
      });

      // 4. Đồng bộ nền lên Supabase (không chặn UI)
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        (async () => {
          try {
            const { data: insertedOrder } = await supabase
              .from('orders')
              .insert({
                order_number: orderNumber,
                order_type: 'preorder',
                status: 'pending',
                preorder_pickup_at: `${preorderForm.pickupDate}T${preorderForm.pickupTime}:00`,
                subtotal: preorderForm.totalPrice,
                total_amount: preorderForm.totalPrice,
                notes: fullNotes,
                customer_name: preorderForm.customerName,
                customer_phone: preorderForm.customerPhone,
                cake_message: preorderForm.cakeMessage,
              })
              .select('id')
              .single();

            if (insertedOrder) {
              await supabase.from('order_items').insert({
                order_id: insertedOrder.id,
                product_name_snapshot: `${preorderForm.cakeName} (${preorderForm.size})`,
                quantity: 1,
                unit_price: preorderForm.totalPrice,
                notes: `Chữ: "${preorderForm.cakeMessage}" - ${preorderForm.notes}`,
              });

              if (preorderForm.depositAmount > 0) {
                await supabase.from('payments').insert({
                  order_id: insertedOrder.id,
                  method: preorderForm.paymentMethod,
                  amount: preorderForm.depositAmount,
                  reference_code: `Cọc đơn đặt bánh ${orderNumber}`,
                });
              }
            }
          } catch (syncErr) {
            console.warn('Preorder sync notice:', syncErr);
          }
        })();
      }
    } catch (err) {
      console.error('Lỗi tạo đơn đặt bánh:', err);
      setIsPreorderModalOpen(false);
    } finally {
      setProcessingOrder(false);
    }
  };

  const filteredInvoices = invoicesList.filter((inv: any) => {
    const isPreorder = inv.order_type === 'preorder' || !!inv.pickupDateTime;
    const isTakeaway = !isPreorder;
    const method = inv.payment_method || inv.paymentMethod || (inv.payments?.[0]?.method) || 'cash';

    if (invoiceFilter === 'takeaway' && !isTakeaway) return false;
    if (invoiceFilter === 'preorder' && !isPreorder) return false;
    if (invoiceFilter === 'cash' && method !== 'cash') return false;
    if (invoiceFilter === 'transfer' && method === 'cash') return false;

    if (invoiceSearchQuery.trim()) {
      const q = invoiceSearchQuery.toLowerCase();
      const num = String(inv.order_number || inv.orderNumber || '').toLowerCase();
      const name = String(inv.customer_name || inv.customerName || '').toLowerCase();
      const phone = String(inv.customer_phone || inv.customerPhone || '').toLowerCase();
      const cake = String(inv.cakeName || inv.cake_name || '').toLowerCase();
      return num.includes(q) || name.includes(q) || phone.includes(q) || cake.includes(q);
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden bg-zinc-100">
      {/* ── THANH CHUYỂN TAB MOBILE (CHỈ HIỆN TRÊN ĐIỆN THOẠI) ── */}
      <div className="lg:hidden flex items-center bg-white border-b border-zinc-200 p-2 gap-1.5 shadow-xs shrink-0 z-20">
        <button
          onClick={() => setMobileTab('menu')}
          className={`flex-1 py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition ${
            mobileTab === 'menu'
              ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/25'
              : 'text-zinc-600 hover:bg-zinc-100 bg-zinc-50'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Thực Đơn ({filteredProducts.length})</span>
        </button>
        {/* NÚT ĐẶT BÁNH TRỰC TIẾP TRÊN MOBILE */}
        <button
          onClick={() => {
            setPreorderError(null);
            setIsPreorderModalOpen(true);
          }}
          className="flex-1 py-2 px-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition bg-pink-600 text-white shadow-sm shadow-pink-600/25 active:scale-95 cursor-pointer"
        >
          <Cake className="w-3.5 h-3.5" />
          <span>Đặt Bánh</span>
        </button>

        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2 px-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition relative ${
            mobileTab === 'cart'
              ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/25'
              : 'text-zinc-600 hover:bg-zinc-100 bg-zinc-50'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Giỏ Hàng</span>
          {cart.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              mobileTab === 'cart' ? 'bg-white text-amber-600' : 'bg-rose-500 text-white'
            }`}>
              {cart.reduce((s, i) => s + i.quantity, 0)}
            </span>
          )}
        </button>
        <button
          onClick={() => setIsInvoiceHistoryOpen(true)}
          className="flex-1 py-2 px-1.5 rounded-xl text-xs font-black flex items-center justify-center gap-1 text-zinc-700 bg-zinc-50 hover:bg-amber-50 border border-zinc-200/80 transition"
        >
          <Receipt className="w-3.5 h-3.5 text-amber-600" />
          <span>Lịch Sử ({invoicesList.length})</span>
        </button>
      </div>

      {/* ── CỘT TRÁI: MENU SẢN PHẨM (70% desktop, full mobile) ── */}
      <div className={`flex-1 flex flex-col overflow-hidden min-h-0 p-3 sm:p-6 ${mobileTab === 'cart' ? 'hidden lg:flex' : 'flex'}`}>
        {/* Top Controls: Search, Nút Đặt Bánh Kem & Két tiền ca */}
        <div className="space-y-4 mb-4">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            {/* Search Box */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm bánh nhanh (Bông lan, Croissant, Bánh mì...)"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* NÚT TẠO ĐƠN ĐẶT BÁNH KEM (PREORDER BUTTON) */}
            <button
              onClick={() => setIsPreorderModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-700 hover:to-rose-600 text-white text-xs font-extrabold shadow-md shadow-pink-600/25 transition hover:scale-102 cursor-pointer"
            >
              <Cake className="w-4 h-4" />
              <span>🎂 Đặt Bánh Kem</span>
            </button>

            {/* Nút Xem Lịch Đơn Đặt Trước */}
            <button
              onClick={() => setIsPreorderListOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-white border border-zinc-200 hover:border-pink-300 text-xs font-bold text-zinc-700 shadow-xs transition hover:bg-pink-50/40 cursor-pointer"
              title="Xem danh sách lịch hẹn giao bánh đặt trước"
            >
              <Calendar className="w-4 h-4 text-pink-600" />
              <span className="hidden sm:inline">Lịch hẹn giao ({preordersList.length})</span>
            </button>

            {/* Nút Xem Lịch Sử Hóa Đơn Đã Xuất */}
            <button
              onClick={() => setIsInvoiceHistoryOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-white border border-zinc-200 hover:border-amber-400 text-xs font-bold text-zinc-700 shadow-xs transition hover:bg-amber-50/50 cursor-pointer"
              title="Xem lại các hóa đơn đã xuất và in lại hóa đơn"
            >
              <Receipt className="w-4 h-4 text-amber-600" />
              <span className="hidden sm:inline">Lịch sử hóa đơn ({invoicesList.length})</span>
              <span className="sm:hidden">Hóa đơn ({invoicesList.length})</span>
            </button>

            {/* Shift Trigger Button */}
            <button
              onClick={() => {
                setClosingCashInput(expectedCashInRegister);
                setIsShiftModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-white border border-zinc-200 hover:border-amber-400 text-xs font-bold text-zinc-700 shadow-xs transition hover:bg-amber-50/50 cursor-pointer"
            >
              <Wallet className="w-4 h-4 text-amber-600" />
              <span className="font-black text-amber-600">
                {expectedCashInRegister.toLocaleString('vi-VN')}₫
              </span>
            </button>
          </div>

          {/* Categories Horizontal Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200/80'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 pb-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="group bg-white rounded-2xl p-2.5 sm:p-3 border border-zinc-200/80 hover:border-amber-400 hover:shadow-lg transition-all text-left flex flex-col justify-between overflow-hidden relative active:scale-98"
                >
                  <div className="w-full aspect-4/3 rounded-xl bg-zinc-100 overflow-hidden mb-2 relative">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-300 text-xs">
                        Chưa có ảnh
                      </div>
                    )}
                    {product.is_preorder_only && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-pink-500 text-white text-[10px] font-bold shadow-xs flex items-center gap-1">
                        <Cake className="w-2.5 h-2.5" /> Nhận đặt
                      </span>
                    )}
                  </div>

                  <div>
                    <span className="block text-[11px] text-zinc-400 font-medium truncate mb-0.5">
                      {product.category}
                    </span>
                    <h3 className="font-bold text-zinc-900 text-xs sm:text-sm line-clamp-2 mb-1.5 leading-snug group-hover:text-amber-600 transition-colors">
                      {product.name}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-1 border-t border-zinc-100">
                    <span className="font-extrabold text-amber-600 text-xs sm:text-sm">
                      {product.selling_price.toLocaleString('vi-VN')}₫
                    </span>
                    <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center text-sm font-bold group-hover:bg-amber-600 group-hover:text-white transition shadow-2xs">
                      +
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Nút Xem Giỏ Hàng nổi trên Mobile khi đang chọn món */}
        {cart.length > 0 && (
          <div className="lg:hidden pt-2 shrink-0">
            <button
              onClick={() => setMobileTab('cart')}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600 text-white font-black text-sm shadow-lg shadow-amber-600/30 flex items-center justify-between transition active:scale-98"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-full bg-white text-amber-600 flex items-center justify-center text-xs font-black shadow-xs">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
                <span className="text-sm font-extrabold">{totalAmount.toLocaleString('vi-VN')}₫</span>
              </div>
              <div className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide">
                <span>Xem giỏ & Thanh toán</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        )}
      </div>

      {/* ── CỘT PHẢI: GIỎ HÀNG (30% desktop, full mobile) ── */}
      <div className={`w-full lg:w-96 bg-white border-l border-zinc-200 flex flex-col justify-between shadow-xl ${mobileTab === 'cart' ? 'flex flex-1 h-full min-h-0' : 'hidden lg:flex'}`}>
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileTab('menu')}
              className="lg:hidden p-1.5 -ml-1 text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-100"
              title="Quay lại thực đơn"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-zinc-900 text-base">Đơn Bán Tại Quầy</h2>
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-xs text-rose-500 hover:text-rose-700 font-semibold flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Xóa
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 text-sm space-y-2">
              <ShoppingCart className="w-10 h-10 text-zinc-200 stroke-1" />
              <span>Chưa có món nào trong giỏ</span>
              <span className="text-xs text-zinc-400 text-center">
                Chọn bánh bên thực đơn để bán tại quầy<br/>hoặc bấm <b>"🎂 Đặt Bánh Kem"</b> ở trên
              </span>
              <button
                onClick={() => setMobileTab('menu')}
                className="lg:hidden mt-3 px-4 py-2.5 rounded-xl bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-600/20 active:scale-95 transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Mở thực đơn chọn bánh
              </button>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.product.id}
                className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/70 flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-xs text-zinc-800 truncate mb-1">
                    {item.product.name}
                  </h4>
                  <div className="text-xs font-semibold text-amber-600">
                    {(item.product.selling_price * item.quantity).toLocaleString('vi-VN')}₫
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-white border border-zinc-200 rounded-lg p-1 shadow-2xs">
                  <button
                    onClick={() => updateQuantity(item.product.id, -1)}
                    className="w-6 h-6 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-600"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-6 text-center font-bold text-xs text-zinc-900">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product.id, 1)}
                    className="w-6 h-6 rounded-md hover:bg-zinc-100 flex items-center justify-center text-zinc-600"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-zinc-100 bg-zinc-50 space-y-3">
          <div className="space-y-1.5 text-xs text-zinc-600">
            <div className="flex justify-between">
              <span>Tạm tính:</span>
              <span className="font-bold text-zinc-800">{subtotal.toLocaleString('vi-VN')}₫</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Giảm giá (%):</span>
              <input
                type="number"
                min="0"
                max="100"
                value={discountPct || ''}
                onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, Number(e.target.value))))}
                placeholder="0"
                className="w-16 px-2 py-1 text-right bg-white border border-zinc-200 rounded-md text-xs font-bold"
              />
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Số tiền giảm:</span>
                <span className="font-bold">-{discountAmount.toLocaleString('vi-VN')}₫</span>
              </div>
            )}
            <div className="flex justify-between text-base font-black text-zinc-900 pt-2 border-t border-zinc-200">
              <span>TỔNG CỘNG:</span>
              <span className="text-amber-600 text-lg">
                {totalAmount.toLocaleString('vi-VN')}₫
              </span>
            </div>
          </div>

          <button
            disabled={cart.length === 0}
            onClick={() => {
              setCashGiven(totalAmount);
              setIsCheckoutOpen(true);
            }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-600/30 disabled:opacity-50 disabled:pointer-events-none transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Banknote className="w-5 h-5" /> Thanh Toán Ngay
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-zinc-700">Tên khách hàng *</label>
                    <input
                      type="text"
                      required
                      value={preorderForm.customerName}
                      onChange={(e) => setPreorderForm({ ...preorderForm, customerName: e.target.value })}
                      placeholder="Chị Lan Anh..."
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-zinc-700">Số điện thoại *</label>
                    <input
                      type="tel"
                      required
                      value={preorderForm.customerPhone}
                      onChange={(e) => setPreorderForm({ ...preorderForm, customerPhone: e.target.value })}
                      placeholder="0912 345 678..."
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Ngày giờ lấy bánh */}
              <div className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <span className="font-bold text-zinc-700 uppercase tracking-wider block text-[10px]">
                  2. Hẹn ngày & giờ nhận bánh (Rất quan trọng)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-zinc-600">Ngày nhận bánh:</label>
                    <input
                      type="date"
                      required
                      value={preorderForm.pickupDate}
                      onChange={(e) => setPreorderForm({ ...preorderForm, pickupDate: e.target.value })}
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-black text-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-zinc-600">Giờ nhận bánh:</label>
                    <input
                      type="time"
                      required
                      value={preorderForm.pickupTime}
                      onChange={(e) => setPreorderForm({ ...preorderForm, pickupTime: e.target.value })}
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-black text-zinc-900"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Mẫu bánh & Kích thước */}
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-zinc-700">Loại mẫu bánh:</label>
                    <select
                      value={preorderForm.cakeName}
                      onChange={(e) => {
                        const selectedP = products.find(p => p.name === e.target.value);
                        setPreorderForm({
                          ...preorderForm,
                          cakeName: e.target.value,
                          totalPrice: selectedP ? selectedP.selling_price : preorderForm.totalPrice,
                        });
                      }}
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                      <option value="Bánh Kem Bắp Phô Mai">Bánh Kem Bắp Phô Mai</option>
                      <option value="Bánh Kem Socola Trái Cây">Bánh Kem Socola Trái Cây</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-zinc-700">Kích thước bánh:</label>
                    <select
                      value={preorderForm.size}
                      onChange={(e) => setPreorderForm({ ...preorderForm, size: e.target.value })}
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-bold"
                    >
                      <option value="Size 16cm (4 - 6 người)">Size 16cm (4 - 6 người)</option>
                      <option value="Size 18cm (6 - 8 người)">Size 18cm (6 - 8 người)</option>
                      <option value="Size 20cm (8 - 12 người)">Size 20cm (8 - 12 người)</option>
                      <option value="Size 22cm (12 - 16 người)">Size 22cm (12 - 16 người)</option>
                      <option value="Bánh 2 tầng sinh nhật">Bánh 2 tầng sinh nhật</option>
                    </select>
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
              </div>

              {/* 4. Tiền bánh & Tiền Cọc */}
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 space-y-2.5">
                <span className="font-bold text-amber-800 uppercase tracking-wider block text-[10px]">
                  3. Giá trị & Tiền đặt cọc
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-zinc-700">Tổng giá bánh (VND):</label>
                    <input
                      type="number"
                      required
                      value={preorderForm.totalPrice || ''}
                      onChange={(e) => setPreorderForm({ ...preorderForm, totalPrice: Number(e.target.value) })}
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-black text-amber-700 text-sm"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-zinc-700">Tiền khách đặt cọc trước:</label>
                    <input
                      type="number"
                      value={preorderForm.depositAmount || ''}
                      onChange={(e) => setPreorderForm({ ...preorderForm, depositAmount: Number(e.target.value) })}
                      className="w-full mt-1 p-2 rounded-xl bg-white border border-zinc-200 font-black text-emerald-600 text-sm"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-amber-200/80 font-bold">
                  <span className="text-zinc-600">Số tiền còn lại thu khi giao bánh:</span>
                  <span className="font-black text-rose-600 text-sm">
                    {Math.max(0, preorderForm.totalPrice - preorderForm.depositAmount).toLocaleString('vi-VN')}₫
                  </span>
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
                            <span className="font-black text-emerald-600">{preorderForm.depositAmount.toLocaleString('vi-VN')}₫</span>
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
                            <span className="font-black text-pink-600">{preorderForm.depositAmount.toLocaleString('vi-VN')}₫</span>
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
                  className="flex-2 py-3 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold shadow-md shadow-pink-600/30 flex items-center justify-center gap-1.5 transition"
                >
                  <Cake className="w-4 h-4" />
                  {processingOrder ? 'Đang tạo đơn...' : 'Tạo Đơn Đặt & Bắn Sang Bếp'}
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
                <h3 className="font-black text-lg text-zinc-900">Lịch Giao Bánh Kem Đặt Trước ({preordersList.length})</h3>
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

            <div className="space-y-3">
              {preordersList.length === 0 ? (
                <div className="text-center py-10 space-y-2 text-zinc-400">
                  <Cake className="w-10 h-10 mx-auto text-zinc-300" />
                  <p className="text-xs">Chưa có đơn đặt bánh kem nào trong hệ thống</p>
                  <button
                    onClick={() => {
                      setIsPreorderListOpen(false);
                      setIsPreorderModalOpen(true);
                    }}
                    className="text-xs font-bold text-pink-600 hover:underline"
                  >
                    + Tạo đơn đặt bánh đầu tiên
                  </button>
                </div>
              ) : (
                preordersList.map((po) => {
                  const orderNum = po.order_number || po.orderNumber;
                  const custName = po.customer_name || po.customerName;
                  const custPhone = po.customer_phone || po.customerPhone;
                  const pickup = po.preorder_pickup_at || po.pickupDateTime;
                  const cake = po.cake_name || po.cakeName;
                  const msg = po.cake_message || po.cakeMessage;
                  const total = po.total_amount || po.totalPrice || 0;
                  const deposit = po.deposit_amount !== undefined ? po.deposit_amount : (po.depositAmount || 0);
                  const remaining = po.remaining_amount !== undefined ? po.remaining_amount : (po.remainingAmount || (total - deposit));
                  const status = po.status || 'pending';

                  return (
                    <div
                      key={po.id || orderNum}
                      className="p-4 rounded-2xl bg-pink-50/40 border border-pink-200/80 space-y-2.5 hover:shadow-md transition"
                    >
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
                        <span className="text-xs font-bold text-zinc-800 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-zinc-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600" /> Hạn giao: <span className="text-pink-600 font-extrabold">{pickup}</span>
                        </span>
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

                      {msg && (
                        <div className="p-2 bg-white rounded-xl border border-pink-200 text-xs font-semibold text-pink-800">
                          ✍️ Chữ trên bánh: <span className="font-bold">"{msg}"</span>
                        </div>
                      )}

                      <div className="flex flex-wrap justify-between items-center text-xs pt-2 border-t border-pink-100 gap-2">
                        <div>
                          <span className="text-zinc-500">Tổng tiền:</span> <span className="font-bold">{total.toLocaleString('vi-VN')}₫</span>
                          <span className="mx-2 text-zinc-300">|</span>
                          <span className="text-emerald-600 font-semibold">Đã cọc: {deposit.toLocaleString('vi-VN')}₫</span>
                          {remaining > 0 && (
                            <span className="font-black text-rose-600 ml-2">Còn thu: {remaining.toLocaleString('vi-VN')}₫</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Nút In phiếu hẹn / Hóa đơn */}
                          <button
                            type="button"
                            onClick={() => {
                              setCompletedOrder({
                                orderNumber: orderNum,
                                items: [
                                  {
                                    product: {
                                      name: `[BÁNH ĐẶT] ${cake}`,
                                      selling_price: total,
                                    },
                                    quantity: 1,
                                  },
                                ],
                                subtotal: total,
                                discountAmount: 0,
                                totalAmount: total,
                                depositAmount: deposit > 0 ? deposit : undefined,
                                remainingAmount: remaining,
                                paymentMethod: po.payment_method || po.paymentMethod || 'cash',
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

                          {/* Nút Đã giao bánh / Hoàn thành */}
                          {status !== 'completed' && (
                            <button
                              type="button"
                              onClick={() => {
                                if (typeof window !== 'undefined') {
                                  try {
                                    const raw = localStorage.getItem('bakery_orders');
                                    if (raw) {
                                      const parsed = JSON.parse(raw);
                                      const updated = parsed.map((o: any) =>
                                        (o.id === po.id || o.order_number === orderNum || o.orderNumber === orderNum)
                                          ? { ...o, status: 'completed', updated_at: new Date().toISOString() }
                                          : o
                                      );
                                      localStorage.setItem('bakery_orders', JSON.stringify(updated));
                                      window.dispatchEvent(new Event('bakery_orders_updated'));
                                    }
                                    setPreordersList((prev) =>
                                      prev.map((o) => (o.id === po.id || o.orderNumber === orderNum ? { ...o, status: 'completed' } : o))
                                    );
                                  } catch {}
                                }
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
                              if (confirm(`Xác nhận hủy đơn đặt bánh ${orderNum}?`)) {
                                if (typeof window !== 'undefined') {
                                  try {
                                    const raw = localStorage.getItem('bakery_orders');
                                    if (raw) {
                                      const parsed = JSON.parse(raw);
                                      const filtered = parsed.filter((o: any) => (o.order_number || o.orderNumber) !== orderNum && o.id !== po.id);
                                      localStorage.setItem('bakery_orders', JSON.stringify(filtered));
                                      window.dispatchEvent(new Event('bakery_orders_updated'));
                                    }
                                    setPreordersList((prev) => prev.filter((o) => (o.orderNumber || o.order_number) !== orderNum && o.id !== po.id));
                                  } catch {}
                                }
                              }
                            }}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hủy đơn đặt bánh này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
                  const isPreorder = inv.order_type === 'preorder' || !!inv.pickupDateTime;
                  const orderNum = inv.order_number || inv.orderNumber;
                  const createdStr = inv.created_at ? new Date(inv.created_at).toLocaleString('vi-VN') : 'Vừa xong';
                  const total = inv.total_amount || inv.totalPrice || 0;
                  const deposit = inv.deposit_amount !== undefined ? inv.deposit_amount : (inv.depositAmount || 0);
                  const remaining = inv.remaining_amount !== undefined ? inv.remaining_amount : (inv.remainingAmount || (total - deposit));
                  const items = Array.isArray(inv.items) ? inv.items : [];

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
                            inv.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'ready'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {inv.status === 'completed' ? '✓ Đã hoàn tất' : inv.status === 'ready' ? 'Sẵn sàng giao' : 'Đang xử lý'}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-700">
                            {inv.payment_method === 'cash' || inv.paymentMethod === 'cash' ? 'Tiền mặt' : 'Chuyển khoản / Ví'}
                          </span>
                        </div>
                      </div>

                      {/* Customer info if preorder */}
                      {(inv.customer_name || inv.customerName) && (
                        <div className="text-xs bg-white p-2.5 rounded-xl border border-zinc-200/70 flex flex-wrap justify-between gap-2">
                          <div>
                            <span className="text-zinc-500">Khách hàng:</span>{' '}
                            <span className="font-bold text-zinc-900">{inv.customer_name || inv.customerName}</span>{' '}
                            <span className="text-zinc-500">({inv.customer_phone || inv.customerPhone})</span>
                          </div>
                          {(inv.preorder_pickup_at || inv.pickupDateTime) && (
                            <div className="text-pink-700 font-bold flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" /> Hẹn lấy: {inv.preorder_pickup_at || inv.pickupDateTime}
                            </div>
                          )}
                          {(inv.cake_message || inv.cakeMessage) && (
                            <div className="w-full text-pink-600 italic text-[11px] pt-1 border-t border-zinc-100">
                              ✍️ Chữ: "{inv.cake_message || inv.cakeMessage}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* Items list */}
                      <div className="text-xs divide-y divide-zinc-200/50 bg-white/70 rounded-xl p-2.5 border border-zinc-200/60 space-y-1">
                        {items.length > 0 ? (
                          items.map((it: any, idx: number) => (
                            <div key={idx} className="flex justify-between py-1 text-zinc-800">
                              <span>
                                <span className="font-bold text-amber-700 mr-1.5">{it.quantity}x</span>
                                {it.product_name_snapshot || it.product?.name || it.name || 'Sản phẩm'}
                              </span>
                              <span className="font-bold">
                                {((it.unit_price || it.product?.selling_price || 0) * it.quantity).toLocaleString('vi-VN')}₫
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="flex justify-between py-1 text-zinc-800">
                            <span>{inv.cakeName || 'Đơn hàng bánh'}</span>
                            <span className="font-bold">{total.toLocaleString('vi-VN')}₫</span>
                          </div>
                        )}
                      </div>

                      {/* Totals & Actions */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-200 text-xs">
                        <div className="space-x-3">
                          <span>Tổng cộng: <b className="text-zinc-900">{total.toLocaleString('vi-VN')}₫</b></span>
                          {deposit > 0 && (
                            <span className="text-emerald-700">Đã cọc: <b>{deposit.toLocaleString('vi-VN')}₫</b></span>
                          )}
                          {remaining > 0 && (
                            <span className="text-rose-600 font-bold">Còn thu: {remaining.toLocaleString('vi-VN')}₫</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              // Chuyển dữ liệu sang modal in hóa đơn tiêu chuẩn
                              setCompletedOrder({
                                orderNumber: orderNum,
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
                                cashGiven: inv.cash_given || total,
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

                          <button
                            type="button"
                            onClick={() => {
                              if (confirm(`Xác nhận xóa hóa đơn #${orderNum} khỏi lịch sử?`)) {
                                if (typeof window !== 'undefined') {
                                  try {
                                    const raw = localStorage.getItem('bakery_orders');
                                    if (raw) {
                                      const parsed = JSON.parse(raw);
                                      const filtered = parsed.filter((o: any) => (o.order_number || o.orderNumber) !== orderNum);
                                      localStorage.setItem('bakery_orders', JSON.stringify(filtered));
                                      setInvoicesList(filtered);
                                      window.dispatchEvent(new Event('bakery_orders_updated'));
                                    }
                                  } catch {}
                                }
                              }
                            }}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Xóa hóa đơn này"
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

      {/* ── MODAL 3: QUẢN LÝ CA BÁN HÀNG & KIỂM KÉT ── */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl max-h-[90dvh] overflow-y-auto overscroll-contain space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-lg text-zinc-900">Quản Lý Ca Bán Hàng</h3>
              </div>
              <button onClick={() => setIsShiftModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-zinc-700 bg-zinc-50 p-4 rounded-2xl border border-zinc-200/80">
              <div className="flex justify-between">
                <span>Thu ngân phụ trách:</span>
                <span className="font-bold text-zinc-900">{user.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Số đơn đã bán trong ca:</span>
                <span className="font-bold text-zinc-900">{shift.orderCount} đơn</span>
              </div>
              <div className="flex justify-between">
                <span>Tiền mặt đầu ca (vốn mở ca):</span>
                <span className="font-bold">{shift.openingCash.toLocaleString('vi-VN')}₫</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Doanh thu tiền mặt bán được:</span>
                <span className="font-bold">+{shift.cashSales.toLocaleString('vi-VN')}₫</span>
              </div>
              <div className="flex justify-between text-blue-600">
                <span>Doanh thu chuyển khoản/MoMo:</span>
                <span className="font-bold">+{shift.transferSales.toLocaleString('vi-VN')}₫</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-zinc-200 font-black text-sm text-zinc-900">
                <span>Tiền mặt lý thuyết trong két:</span>
                <span className="text-amber-600">{expectedCashInRegister.toLocaleString('vi-VN')}₫</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-800">
                Tiền mặt thực tế đếm được cuối ca:
              </label>
              <input
                type="number"
                value={closingCashInput || ''}
                onChange={(e) => setClosingCashInput(Number(e.target.value))}
                placeholder="Nhập số tiền đếm trong két..."
                className="w-full px-3.5 py-2.5 bg-white border border-zinc-300 rounded-xl text-base font-black text-zinc-900"
              />
            </div>

            {closingCashInput > 0 && (
              <div className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
                shiftCashDifference === 0 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                  : shiftCashDifference > 0
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                <span>Chênh lệch két (Lệch quỹ):</span>
                <span>
                  {shiftCashDifference > 0 ? `Thừa +${shiftCashDifference.toLocaleString('vi-VN')}₫` : shiftCashDifference < 0 ? `Thiếu ${shiftCashDifference.toLocaleString('vi-VN')}₫` : 'Khớp 100%'}
                </span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsShiftModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  alert(`Đã chốt sổ ca bán thành công! Tiền mặt kết chuyển: ${closingCashInput.toLocaleString('vi-VN')}₫`);
                  setShift({
                    isOpen: true,
                    openedAt: new Date().toISOString(),
                    openingCash: closingCashInput,
                    cashSales: 0,
                    transferSales: 0,
                    orderCount: 0,
                  });
                  setIsShiftModalOpen(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30"
              >
                Chốt Ca & Mở Ca Mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: THANH TOÁN BÁN TẠI QUẦY ── */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-4 sm:p-6 shadow-2xl flex flex-col max-h-[92dvh] animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100 shrink-0">
              <h3 className="font-black text-lg text-zinc-900">Xác Nhận Thanh Toán</h3>
              <button onClick={() => setIsCheckoutOpen(false)} className="text-zinc-400 hover:text-zinc-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vùng nội dung có thể cuộn trên điện thoại */}
            <div className="overflow-y-auto flex-1 py-2.5 space-y-4 pr-1 overscroll-contain">
              <div className="text-center py-3 sm:py-4 bg-amber-50 rounded-2xl border border-amber-200/60">
                <span className="text-xs text-amber-700 font-bold uppercase tracking-wider">
                  Số tiền phải thu
                </span>
                <div className="text-2xl sm:text-3xl font-black text-amber-600 mt-0.5">
                  {totalAmount.toLocaleString('vi-VN')}₫
                </div>
              </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700">Phương thức thanh toán:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                    paymentMethod === 'cash'
                      ? 'border-amber-600 bg-amber-50 text-amber-700 shadow-xs'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <Banknote className="w-4 h-4" /> Tiền mặt
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                    paymentMethod === 'transfer'
                      ? 'border-amber-600 bg-amber-50 text-amber-700 shadow-xs'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <QrCode className="w-4 h-4" /> Chuyển khoản
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('momo')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                    paymentMethod === 'momo'
                      ? 'border-amber-600 bg-amber-50 text-amber-700 shadow-xs'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <CreditCard className="w-4 h-4" /> Ví MoMo
                </button>
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div className="space-y-3 p-3 bg-zinc-50 rounded-2xl border border-zinc-200/60">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-zinc-700">Tiền khách đưa:</span>
                  <input
                    type="number"
                    value={cashGiven || ''}
                    onChange={(e) => setCashGiven(Number(e.target.value))}
                    className="w-36 px-2.5 py-1.5 text-right font-black text-sm bg-white border border-zinc-200 rounded-lg text-zinc-900"
                  />
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t border-zinc-200">
                  <span className="font-bold text-zinc-700">Tiền thừa trả khách:</span>
                  <span className="font-black text-base text-emerald-600">
                    {changeAmount.toLocaleString('vi-VN')}₫
                  </span>
                </div>
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

                <div className="inline-block p-2 bg-white rounded-2xl border border-zinc-200 shadow-sm max-w-[240px] mx-auto">
                  <img
                    src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-${vietqrConfig.template || 'compact2'}.jpg?amount=${totalAmount}&addInfo=${encodeURIComponent(`${vietqrConfig.transferSyntax || 'DH'}${Date.now().toString().slice(-6)}`)}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                    alt="VietQR Transfer"
                    className="w-full h-auto rounded-xl"
                  />
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
                    <span className="font-black text-amber-600 text-sm">{totalAmount.toLocaleString('vi-VN')}₫</span>
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
                        ? (ewalletConfig.momo.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`2|99|${ewalletConfig.momo.phone}|${ewalletConfig.momo.name}||0|0|${totalAmount}|${ewalletConfig.transferSyntax || 'VIMO'}${Date.now().toString().slice(-6)}|transfer_p2p`)}`)
                        : selectedWalletType === 'zalopay'
                        ? (ewalletConfig.zalopay.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`ZALOPAY|${ewalletConfig.zalopay.phone}|${ewalletConfig.zalopay.name}|${totalAmount}|${ewalletConfig.transferSyntax || 'VIMO'}`)}`)
                        : (ewalletConfig.viettelmoney.qrUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`VIETTEL|${ewalletConfig.viettelmoney.phone}|${ewalletConfig.viettelmoney.name}|${totalAmount}|${ewalletConfig.transferSyntax || 'VIMO'}`)}`)
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
                    <span className="font-black text-pink-600 text-sm">{totalAmount.toLocaleString('vi-VN')}₫</span>
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
                onClick={() => setIsCheckoutOpen(false)}
                className="flex-1 py-3 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={processingOrder}
                onClick={handleCompleteOrder}
                className="flex-2 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {processingOrder ? 'Đang xử lý...' : 'Hoàn Tất Đơn & In Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 5: HÓA ĐƠN IN NHIỆT / PHIẾU HẸN GIAO BÁNH ── */}
      {completedOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-sm w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[90dvh] overflow-y-auto overscroll-contain animate-in zoom-in duration-200">
            <div className="p-4 bg-amber-50/40 rounded-2xl border border-zinc-300 text-zinc-900 font-mono text-xs space-y-3">
              <div className="text-center space-y-1 border-b border-dashed border-zinc-300 pb-2">
                <h2 className="font-black text-sm tracking-wider">TIỆM BÁNH ABC</h2>
                <p className="text-[10px] text-zinc-500">123 Đường Bánh Ngọt, TP.HCM</p>
                <p className="text-[10px] text-zinc-500">Hotline: 0901 234 567</p>
                <p className="font-bold text-xs pt-1">
                  {completedOrder.pickupDateTimeStr ? 'PHIẾU HẸN GIAO BÁNH KEM' : 'HÓA ĐƠN THANH TOÁN'}
                </p>
                <p className="text-[11px] font-bold text-amber-700">#{completedOrder.orderNumber}</p>
              </div>

              <div className="text-[10px] space-y-0.5 text-zinc-600 border-b border-dashed border-zinc-300 pb-2">
                <div>Ngày tạo: {completedOrder.createdAt}</div>
                <div>Thu ngân: {completedOrder.cashier}</div>
                {completedOrder.customerName && (
                  <>
                    <div className="font-bold text-zinc-900">Khách hàng: {completedOrder.customerName} ({completedOrder.customerPhone})</div>
                    <div className="font-bold text-pink-700">HẸN LẤY BÁNH: {completedOrder.pickupDateTimeStr}</div>
                  </>
                )}
              </div>

              <div className="space-y-1.5 border-b border-dashed border-zinc-300 pb-2 text-[11px]">
                {completedOrder.items.map((item: any, i: number) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="flex-1 pr-2">
                        {item.product.name} x{item.quantity}
                      </span>
                      <span className="font-bold">
                        {(item.product.selling_price * item.quantity).toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                  </div>
                ))}
                {completedOrder.cakeMessage && (
                  <div className="text-[10px] text-pink-700 italic">
                    ✍️ Chữ: "{completedOrder.cakeMessage}"
                  </div>
                )}
              </div>

              <div className="space-y-1 text-xs pt-1">
                <div className="flex justify-between text-zinc-600">
                  <span>Tổng tiền bánh:</span>
                  <span className="font-bold">{completedOrder.totalAmount.toLocaleString('vi-VN')}₫</span>
                </div>
                {completedOrder.depositAmount !== undefined && (
                  <>
                    <div className="flex justify-between text-emerald-600 font-bold">
                      <span>Tiền đã cọc trước:</span>
                      <span>-{completedOrder.depositAmount.toLocaleString('vi-VN')}₫</span>
                    </div>
                    <div className="flex justify-between font-black text-sm pt-1 border-t border-zinc-300 text-rose-600">
                      <span>CÒN LẠI PHẢI THU:</span>
                      <span>{completedOrder.remainingAmount.toLocaleString('vi-VN')}₫</span>
                    </div>
                  </>
                )}
              </div>

              {/* Mã VietQR in trên hóa đơn / Phiếu hẹn */}
              <div className="text-center py-2 border-t border-dashed border-zinc-300 space-y-1">
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">
                  {completedOrder.remainingAmount > 0 ? 'Mã VietQR Thanh Toán Khi Nhận Bánh' : 'Mã VietQR Tiệm Bánh'}
                </p>
                <div className="inline-block p-1 bg-white border border-zinc-300 rounded-lg">
                  <img
                    src={`https://api.vietqr.io/image/${vietqrConfig.bankId}-${vietqrConfig.accountNo}-compact.jpg?amount=${completedOrder.remainingAmount !== undefined && completedOrder.remainingAmount > 0 ? completedOrder.remainingAmount : completedOrder.totalAmount}&addInfo=${encodeURIComponent(`DH${completedOrder.orderNumber}`)}&accountName=${encodeURIComponent(vietqrConfig.accountName)}`}
                    alt="VietQR In Bill"
                    className="w-28 h-auto mx-auto"
                  />
                </div>
                <p className="text-[9px] text-zinc-500 font-mono">
                  {vietqrConfig.bankId} • {vietqrConfig.accountNo} • {vietqrConfig.accountName}
                </p>
              </div>

              <div className="text-center pt-2 text-[10px] text-zinc-500 border-t border-dashed border-zinc-300">
                <p>Cảm ơn Quý Khách & Hẹn Gặp Lại!</p>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700 flex items-center justify-center gap-1.5 hover:bg-zinc-50"
              >
                <Printer className="w-4 h-4" /> In Phiếu Hẹn
              </button>
              <button
                onClick={() => {
                  setCompletedOrder(null);
                  setIsCheckoutOpen(false);
                  setMobileTab('menu');
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
              >
                Tạo Đơn Tiếp Theo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
