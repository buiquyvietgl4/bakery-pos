'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { 
  broadcastOrderStatusUpdate, 
  broadcastClearDemoOrders, 
  subscribeCrossDeviceSync, 
  syncOrderToSupabase,
  parsePreorderFromNotes, 
  formatPickupDateTime,
  cleanDisplayNotes
} from '@/lib/supabase/realtimeSync';
import { 
  ChefHat, Clock, CheckCircle2, ArrowRight, Flame, Sparkles, 
  Cake, AlertCircle, MessageSquare, RefreshCw, Trash2, Check,
  ShoppingBag, Phone, User, Camera, X, AlertTriangle, Volume2, VolumeX, Bell,
  Package, Search, Plus, Minus, ChevronDown, Timer, Play, Calculator, Scale, BookOpen, CheckCheck, Send, History,
  Tag, RotateCcw, Eye, Banknote, DollarSign, ArrowLeft
} from 'lucide-react';
import { soundManager } from '@/lib/utils/audioAlert';
import { phoneNotificationService } from '@/lib/utils/phoneNotification';
import { getDeliveryUrgency, getUrgentPreorders, sortPreordersByUrgency } from '@/lib/utils/deliveryAlerts';
import { 
  sendTelegramReadyForShipAlert, 
  sendTelegramDeliveredSuccessAlert, 
  sendTelegramBakeDoneAlert,
  sendTelegramStartBakeAlert,
  sendTelegramDischargedAlert
} from '@/lib/utils/telegramNotify';
import { triggerServerPush } from '@/lib/utils/webPushManager';
import NotificationSettingsModal from '@/components/NotificationSettingsModal';
import { getUnreadNotificationCount, subscribeNotificationHistory } from '@/lib/utils/notificationHistory';
import { DEFAULT_BAKERY_RECIPES, DEFAULT_BAKERY_PRODUCTS, BakeryRecipe } from '@/lib/constants/bakeryData';
import { db } from '@/lib/db/dexie';
import CakeStickerModal, { CakeStickerData } from '@/components/pos/CakeStickerModal';
import { ConfirmDoneModal } from '@/components/kitchen/ConfirmDoneModal';
import { CancelRemakeModal } from '@/components/kitchen/CancelRemakeModal';
import { OrderDetailModal } from '@/components/kitchen/OrderDetailModal';
import { DeliveryPaymentModal } from '@/components/kitchen/DeliveryPaymentModal';
import { addSpoilageLog } from '@/lib/utils/spoilageManager';

interface OrderItem {
  id: string;
  product_name_snapshot: string;
  quantity: number;
  notes?: string;
  unit_price?: number;
}

interface KDSOrder {
  id: string;
  order_number: string;
  order_type: 'dine_in' | 'takeaway' | 'preorder';
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  created_at: string;
  preorder_pickup_at?: string;
  pickupDateTime?: string;
  delivery_method?: 'pickup' | 'shipping';
  shipping_address?: string;
  shipping_fee?: number;
  notes?: string;
  customer_name?: string;
  customer_phone?: string;
  cake_name?: string;
  cake_message?: string;
  total_amount?: number;
  deposit_amount?: number;
  remaining_amount?: number;
  payment_status?: string;
  final_payment_method?: string;
  reference_image_url?: string;
  remake_reason?: string;
  remake_notes?: string;
  items: OrderItem[];
}

const INITIAL_DEMO_ORDERS: KDSOrder[] = [];

export interface ActiveOvenBatch {
  id: string;
  recipe_id: string;
  product_id?: string;
  cake_name: string;
  quantity: number;
  unit: string;
  bake_temp: number;
  duration_seconds: number;
  started_at: number;
  ends_at: number;
  status: 'baking' | 'done';
  notified?: boolean;
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [referenceImageLightbox, setReferenceImageLightbox] = useState<string | null>(null);

  // ── IN TEM NHÃN DÁN HỘP BÁNH (THERMAL BARCODE STICKER 50x30 / 50x40) ──
  const [isStickerModalOpen, setIsStickerModalOpen] = useState(false);
  const [stickerModalData, setStickerModalData] = useState<CakeStickerData | null>(null);

  const handleOpenCakeSticker = (order: KDSOrder) => {
    const mainItem = order.items?.[0];
    const fromN = parsePreorderFromNotes(order.notes);
    const isShip = order.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
    const shipAddr = order.shipping_address || fromN.shipping_address;

    setStickerModalData({
      orderNumber: order.order_number || (order as any).orderNumber || `DH-${order.id.slice(0, 6)}`,
      cakeName: mainItem?.product_name_snapshot || order.cake_name || fromN?.cake_name || 'Bánh Sinh Nhật',
      customerName: order.customer_name || fromN?.customer_name || 'Khách tiệm',
      customerPhone: order.customer_phone || fromN?.customer_phone || undefined,
      cakeMessage: order.cake_message || fromN?.cake_message || undefined,
      pickupTime: order.preorder_pickup_at ? formatPickupDateTime(order.preorder_pickup_at) : undefined,
      deliveryMethod: isShip ? 'shipping' : 'pickup',
      shippingAddress: shipAddr || undefined,
      createdAt: order.created_at,
    });
    setIsStickerModalOpen(true);
  };

  // ── MODAL XÁC NHẬN HOÀN THÀNH BÁNH / GIAO XONG (TRÁNH ẤN NHẦM) ──
  const [confirmDoneState, setConfirmDoneState] = useState<{
    isOpen: boolean;
    order: KDSOrder | null;
    targetStep: 'ready' | 'completed';
  }>({
    isOpen: false,
    order: null,
    targetStep: 'ready',
  });

  // ── MODAL HỦY BÁNH HỎNG & LÀM LẠI TỪ ĐẦU ──
  const [cancelRemakeState, setCancelRemakeState] = useState<{
    isOpen: boolean;
    order: KDSOrder | null;
  }>({
    isOpen: false,
    order: null,
  });

  // ── MODAL XEM CHI TIẾT ĐƠN ĐẶT BÁNH ──
  const [orderDetailModalData, setOrderDetailModalData] = useState<KDSOrder | null>(null);

  // ── MODAL THANH TOÁN & HOÀN THÀNH GIAO HÀNG (BƯỚC 3) ──
  const [deliveryPaymentModalOrder, setDeliveryPaymentModalOrder] = useState<KDSOrder | null>(null);

  // ── CẤU HÌNH VIETQR CHO THANH TOÁN BẾP ──
  const [vietqrConfig, setVietqrConfig] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bakery_vietqr_config');
        if (raw) setVietqrConfig(JSON.parse(raw));
      } catch {}
    }
  }, []);

  // ── CHẾ ĐỘ MÀN HÌNH BẾP: 'orders' (Đơn Khách & Bán Quầy) vs 'production' (Làm Bánh Bán Theo BOM) ──
  const [kitchenMode, setKitchenMode] = useState<'orders' | 'production'>('orders');

  // ── BOM & SẢN XUẤT LÀM BÁNH BÁN STATE ──
  const [recipes, setRecipes] = useState<BakeryRecipe[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bakery_recipes');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return DEFAULT_BAKERY_RECIPES;
  });

  const [selectedRecipe, setSelectedRecipe] = useState<BakeryRecipe | null>(null);
  const [targetBatchQty, setTargetBatchQty] = useState<number | string>(10);
  const [customBakeMinutes, setCustomBakeMinutes] = useState<number | string>(25);
  const [customBakeTemp, setCustomBakeTemp] = useState<number | string>(190);
  const [productionFilterCat, setProductionFilterCat] = useState<string>('Tất cả');
  const [productionSearch, setProductionSearch] = useState<string>('');
  const [isRecipePickerOpen, setIsRecipePickerOpen] = useState<boolean>(false);

  // ── LÒ NƯỚNG ĐANG HOẠT ĐỘNG (ACTIVE OVEN TIMERS) ──
  const [ovenBatches, setOvenBatches] = useState<ActiveOvenBatch[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bakery_oven_batches');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {}
    }
    return [];
  });

  // ── ĐIỀU HƯỚNG TAB TRÊN ĐIỆN THOẠI (KDS MOBILE TABS) ──
  const [kdsMobileTab, setKdsMobileTab] = useState<'pending' | 'preparing' | 'ready' | 'all'>('pending');

  // ── ÂM BÁO & CẢNH BÁO ĐƠN GẤP & TELEGRAM ──
  const [soundEnabled, setSoundEnabled] = useState(() => soundManager.isEnabled());
  const [isNotifSettingsOpen, setIsNotifSettingsOpen] = useState<boolean>(false);
  const [notifModalTab, setNotifModalTab] = useState<'history' | 'pwa' | 'telegram' | 'kiosk'>('history');
  const [unreadNotifs, setUnreadNotifs] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Lắng nghe số lượng thông báo chưa đọc trong hệ thống
  useEffect(() => {
    const updateUnread = () => {
      setUnreadNotifs(getUnreadNotificationCount());
    };
    updateUnread();
    const unsub = subscribeNotificationHistory(updateUnread);
    return () => unsub();
  }, []);

  // ── XỬ LÝ DEEP LINK XEM CHI TIẾT ĐƠN HÀNG TỪ THÔNG BÁO / URL (?order=...) ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const orderParam = params.get('order');
    if (orderParam && orders.length > 0) {
      const target = orders.find(
        (o) => o.order_number === orderParam || o.id === orderParam || o.order_number?.includes(orderParam)
      );
      if (target) {
        setOrderDetailModalData(target);
      }
    }
  }, [orders]);

  const [kdsToast, setKdsToast] = useState<{
    id: string;
    title: string;
    subtitle: string;
    orderNumber?: string;
    customerInfo?: string;
    pickupTime?: string;
    details?: string;
  } | null>(null);

  const prevUrgentCountRef = useRef<number>(0);

  // Tự động tắt Toast thông báo sau 8 giây
  useEffect(() => {
    if (!kdsToast) return;
    const t = setTimeout(() => setKdsToast(null), 8000);
    return () => clearTimeout(t);
  }, [kdsToast]);

  // Cập nhật currentTime mỗi 30 giây để đồng hồ đếm ngược giao hàng luôn chính xác
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Lọc các đơn cần làm gấp trong 60 phút hoặc đã quá hạn
  const urgentOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      if (!o || o.status === 'completed' || o.status === 'cancelled') return false;
      const pickup = o.preorder_pickup_at;
      if (!pickup) return false;
      return getDeliveryUrgency(pickup, o.status, currentTime).isUrgent;
    });
  }, [orders, currentTime]);

  // Cảnh báo âm thanh & thông báo tin nhắn khi phát hiện có đơn mới rơi vào trạng thái khẩn cấp
  useEffect(() => {
    if (urgentOrders.length > 0 && urgentOrders.length > prevUrgentCountRef.current) {
      soundManager.playUrgentAlert();
      const top: any = urgentOrders[0];
      const orderNo = top.order_number || top.orderNumber || top.id || 'ĐƠN MỚI';
      const pickupTimeRaw = top.preorder_pickup_at || top.pickupDateTime || top.pickup_time || '';
      const urg = getDeliveryUrgency(pickupTimeRaw, top.status, currentTime);
      const pickupFormatted = pickupTimeRaw ? formatPickupDateTime(pickupTimeRaw) : 'Trong ngày';
      const custName = top.customer_name || top.customerName || '';
      const custPhone = top.customer_phone || top.customerPhone || '';

      phoneNotificationService.triggerOrderNotification({
        id: 'kds-urgent-' + Date.now(),
        type: 'urgent_alert',
        appTitle: '🚨 BẾP BÁNH: CẦN GIAO GẤP',
        title: urg.minutesLeft < 0 ? `🚨 BẾP QUÁ HẠN #${orderNo}` : `🚨 BẾP GIAO GẤP #${orderNo}`,
        sender: custName ? `${custName}${custPhone ? ' (' + custPhone + ')' : ''}` : 'Đơn làm bánh',
        message: urg.minutesLeft < 0 ? `Đã quá hạn giao ${Math.abs(urg.minutesLeft)} phút!` : `Cần giao trong ${urg.minutesLeft} phút nữa! (Hẹn: ${pickupFormatted})`,
        extraDetails: top.cake_message ? `Ghi chữ: "${top.cake_message}"` : undefined,
        orderNumber: orderNo,
        pickupTime: pickupFormatted,
        actionLabel: 'Làm Gấp Ngay',
        onAction: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
      });
    }
    prevUrgentCountRef.current = urgentOrders.length;
  }, [urgentOrders.length, currentTime]);

  // ── ĐỒNG BỘ TỒN KHO TỪ QUẦY POS ĐỂ HIỂN THỊ TRÊN CÔNG THỨC ──
  const [productsStockMap, setProductsStockMap] = useState<Record<string, number>>({});

  const refreshStockMap = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bakery_products');
        const list = raw ? JSON.parse(raw) : DEFAULT_BAKERY_PRODUCTS;
        const map: Record<string, number> = {};
        if (Array.isArray(list)) {
          list.forEach((p: any) => {
            if (p.id) map[p.id] = Number(p.stock_qty) || 0;
            if (p.name) map[p.name.toLowerCase().trim()] = Number(p.stock_qty) || 0;
          });
        }
        setProductsStockMap(map);
      } catch {}
    }
  }, []);

  useEffect(() => {
    refreshStockMap();
    const handleStockEvt = () => refreshStockMap();
    window.addEventListener('bakery_products_updated', handleStockEvt);
    window.addEventListener('bakery_stocks_updated', handleStockEvt);
    return () => {
      window.removeEventListener('bakery_products_updated', handleStockEvt);
      window.removeEventListener('bakery_stocks_updated', handleStockEvt);
    };
  }, [refreshStockMap]);

  // ── BỘ LỌC CÔNG THỨC BOM CHO MỤC LÀM BÁNH BÁN ──
  const recipeCategories = useMemo(() => {
    const cats = new Set<string>();
    recipes.forEach((r) => {
      if (r.category) cats.add(r.category);
    });
    return ['Tất cả', ...Array.from(cats)];
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) => {
      const matchCat = productionFilterCat === 'Tất cả' || r.category === productionFilterCat;
      const matchSearch = !productionSearch || 
        r.name.toLowerCase().includes(productionSearch.toLowerCase()) || 
        (r.description && r.description.toLowerCase().includes(productionSearch.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [recipes, productionFilterCat, productionSearch]);

  // ── ĐỒNG HỒ ĐẾM NGƯỢC THỜI GIAN NƯỚNG & PHÁT CHUÔNG BÁO BÁNH CHÍN ──
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let hasChanges = false;

      setOvenBatches((prevBatches) => {
        if (!prevBatches || prevBatches.length === 0) return prevBatches;

        const nextBatches = prevBatches.map((batch) => {
          if (batch.status === 'baking' && now >= batch.ends_at) {
            hasChanges = true;
            if (!batch.notified) {
              // Bánh đã nướng xong! Kêu chuông báo khẩn cấp + thông báo đẩy
              soundManager.playUrgentAlert();
              phoneNotificationService.triggerOrderNotification({
                id: 'oven-done-' + batch.id,
                type: 'urgent_alert',
                appTitle: '🔥 LÒ NƯỚNG: BÁNH ĐÃ CHÍN!',
                title: `🔔 BÁNH ĐÃ NƯỚNG XONG: ${batch.cake_name}`,
                sender: `Lò nướng: ${batch.quantity} ${batch.unit} (${batch.bake_temp}°C)`,
                message: `Mẻ bánh đã nướng xong đủ ${Math.round(batch.duration_seconds / 60)} phút! Vui lòng mở lò lấy bánh ra ngay!`,
                actionLabel: 'Ra Lò & Nhập Kho',
                onAction: () => {
                  setKitchenMode('production');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                },
              });

              // Bắn thông báo lên Telegram nếu đã cấu hình
              sendTelegramBakeDoneAlert({
                cake_name: batch.cake_name,
                quantity: batch.quantity,
                unit: batch.unit,
                bake_temp: batch.bake_temp,
                duration_minutes: Math.round(batch.duration_seconds / 60),
              }).then((res) => {
                if (res && !res.success) {
                  console.warn('Lỗi gửi Telegram khi bánh chín:', res.error);
                } else if (res && res.success) {
                  console.log('Đã gửi thông báo Telegram bánh nướng chín thành công!');
                }
              }).catch((err) => console.warn('Ngoại lệ Telegram khi bánh chín:', err));

              // Bắn Web Push trực tiếp tới điện thoại PWA (không phụ thuộc Telegram)
              triggerServerPush({
                type: 'bake_done',
                isUrgent: true,
                title: `🔔 LÒ NƯỚNG: BÁNH ĐÃ CHÍN!`,
                body: `Mẻ ${batch.quantity} ${batch.unit || 'cái'} ${batch.cake_name} đã nướng xong đủ ${Math.round(batch.duration_seconds / 60)} phút! Vui lòng mở lò lấy bánh ra ngay!`,
                url: '/kitchen',
              }).catch(() => {});

              return { ...batch, status: 'done' as const, notified: true };
            }
            return { ...batch, status: 'done' as const };
          }
          return batch;
        });

        if (hasChanges && typeof window !== 'undefined') {
          try {
            localStorage.setItem('bakery_oven_batches', JSON.stringify(nextBatches));
          } catch {}
        }
        return nextBatches;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ── BẮT ĐẦU CHO MẺ BÁNH VÀO LÒ NƯỚNG ──
  const handleStartBaking = (recipe: BakeryRecipe) => {
    const durationMin = Number(customBakeMinutes) || Number(recipe.bake_time_minutes) || 20;
    const durationSec = durationMin * 60;
    const qty = Number(targetBatchQty) > 0 ? Number(targetBatchQty) : (recipe.yield_qty || 10);
    const temp = Number(customBakeTemp) > 0 ? Number(customBakeTemp) : (recipe.bake_temp_celsius || 190);

    const newBatch: ActiveOvenBatch = {
      id: 'batch-' + Date.now(),
      recipe_id: recipe.id,
      product_id: recipe.product_id,
      cake_name: recipe.name,
      quantity: qty,
      unit: recipe.yield_unit || 'cái',
      bake_temp: temp,
      duration_seconds: durationSec,
      started_at: Date.now(),
      ends_at: Date.now() + durationSec * 1000,
      status: 'baking',
      notified: false,
    };

    const updated = [newBatch, ...ovenBatches];
    setOvenBatches(updated);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('bakery_oven_batches', JSON.stringify(updated));
      } catch {}
    }

    soundManager.playNewOrderChime();
    phoneNotificationService.triggerOrderNotification({
      id: 'batch-started-' + Date.now(),
      type: 'new_order',
      appTitle: '🔥 LÒ NƯỚNG BÁNH',
      title: `Bắt Đầu Nướng: ${recipe.name}`,
      sender: `Thợ Bếp Làm Bánh (${qty} ${recipe.yield_unit})`,
      message: `Đang nướng ở ${temp}°C trong ${durationMin} phút. Hệ thống sẽ báo chuông khi nướng xong!`,
    });

    sendTelegramStartBakeAlert({
      cake_name: recipe.name,
      quantity: qty,
      unit: recipe.yield_unit,
      bake_temp: temp,
      duration_minutes: durationMin,
    }).then((res) => {
      if (res && !res.success) {
        console.warn('Lỗi gửi Telegram bắt đầu nướng:', res.error);
        if (res.error?.includes('Unauthorized') || res.error?.includes('chat not found') || res.error?.includes('Chưa bật')) {
          setKdsToast({
            id: 'toast-tele-warn-' + Date.now(),
            title: '⚠️ LƯU Ý TELEGRAM',
            subtitle: `Chưa gửi tin được (${res.error}). Vui lòng bấm 'Telegram Báo Lò' góc trên để kiểm tra kết nối bot!`,
          });
        }
      } else if (res && res.success) {
        console.log('Đã gửi thông báo Telegram bắt đầu nướng bánh thành công!');
      }
    }).catch((err) => console.warn('Lỗi kết nối Telegram bắt đầu nướng:', err));

    // Bắn Web Push PWA trực tiếp tới máy nhân viên
    triggerServerPush({
      type: 'bake_start',
      title: `🔥 LÒ NƯỚNG: BẮT ĐẦU NƯỚNG!`,
      body: `Mẻ ${qty} ${recipe.yield_unit || 'cái'} ${recipe.name} đang nướng ở ${temp}°C trong ${durationMin} phút.`,
      url: '/kitchen',
    }).catch(() => {});

    setKdsToast({
      id: 'toast-start-' + Date.now(),
      title: `🔥 BẮT ĐẦU NƯỚNG: ${recipe.name}`,
      subtitle: `Mẻ ${qty} ${recipe.yield_unit || 'cái'} • ${temp}°C • ${durationMin} phút`,
    });

    setSelectedRecipe(null);
  };

  // ── RA LÒ & NHẬP KHO THÀNH PHẨM (LINK TỰ ĐỘNG VỚI QUẦY BÁN POS) ──
  const handleCompleteBakeBatch = async (batch: ActiveOvenBatch) => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('bakery_products');
        let products = raw ? JSON.parse(raw) : [...DEFAULT_BAKERY_PRODUCTS];
        let found = false;

        const updatedProducts = products.map((p: any) => {
          if ((batch.product_id && p.id === batch.product_id) || (p.name && p.name.toLowerCase().trim() === batch.cake_name.toLowerCase().trim())) {
            found = true;
            return {
              ...p,
              stock_qty: (Number(p.stock_qty) || 0) + Number(batch.quantity),
            };
          }
          return p;
        });

        if (!found) {
          updatedProducts.push({
            id: batch.product_id || 'prod-' + Date.now(),
            name: batch.cake_name,
            price: 35000,
            selling_price: 35000,
            category: 'Bán thành phẩm',
            stock_qty: Number(batch.quantity),
            unit: batch.unit || 'cái',
            is_semi_finished: true,
          });
        }

        localStorage.setItem('bakery_products', JSON.stringify(updatedProducts));

        // Lưu Dexie DB offline
        try {
          for (const p of updatedProducts) {
            await db.products.put({
              id: p.id,
              name: p.name,
              selling_price: p.selling_price || p.price || 35000,
              is_active: true,
              category: p.category,
              stock_qty: p.stock_qty,
              min_stock_alert: p.min_stock_alert,
              unit: p.unit,
              is_semi_finished: p.is_semi_finished,
              image_url: p.image_url,
            });
          }
        } catch {}

        // Phát sự kiện để quầy POS cập nhật số lượng tồn tức thì
        window.dispatchEvent(new Event('bakery_products_updated'));
        window.dispatchEvent(new CustomEvent('bakery_stocks_updated', {
          detail: { product_id: batch.product_id, added_qty: batch.quantity }
        }));
      } catch (err) {
        console.error('Lỗi cộng tồn kho từ mẻ bánh ra lò:', err);
      }
    }

    // Xóa mẻ khỏi lò nướng
    const remainingBatches = ovenBatches.filter((b) => b.id !== batch.id);
    setOvenBatches(remainingBatches);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('bakery_oven_batches', JSON.stringify(remainingBatches));
      } catch {}
    }

    soundManager.playNewOrderChime();
    phoneNotificationService.triggerOrderNotification({
      id: 'batch-deposited-' + Date.now(),
      type: 'new_order',
      appTitle: '📦 NHẬP KHO BÁN HÀNG THÀNH CÔNG',
      title: `Đã Nhập Kho Quầy POS: +${batch.quantity} ${batch.cake_name}`,
      sender: 'Bếp Bánh Ra Lò -> Quầy Thu Ngân',
      message: `Đã cộng thêm ${batch.quantity} ${batch.unit} vào số lượng tồn kho hiển thị tại quầy POS!`,
    });

    sendTelegramDischargedAlert({
      cake_name: batch.cake_name,
      quantity: batch.quantity,
      unit: batch.unit,
    }).then((res) => {
      if (res && !res.success) {
        console.warn('Lỗi gửi Telegram khi ra lò:', res.error);
        if (res.error?.includes('Unauthorized') || res.error?.includes('chat not found') || res.error?.includes('Chưa bật')) {
          setKdsToast({
            id: 'toast-tele-warn-' + Date.now(),
            title: '⚠️ LƯU Ý TELEGRAM',
            subtitle: `Chưa gửi tin được (${res.error}). Vui lòng bấm 'Telegram Báo Lò' góc trên để kiểm tra kết nối bot!`,
          });
        }
      } else if (res && res.success) {
        console.log('Đã gửi thông báo Telegram bánh ra lò thành công!');
      }
    }).catch((err) => console.warn('Lỗi kết nối Telegram bánh ra lò:', err));

    // Bắn Web Push PWA trực tiếp tới máy nhân viên
    triggerServerPush({
      type: 'bake_discharge',
      title: `🥖 BÁNH RA LÒ: ĐÃ NHẬP KHO POS!`,
      body: `Mẻ bánh +${batch.quantity} ${batch.unit || 'cái'} ${batch.cake_name} vừa ra lò, đã nhập kho quầy bán!`,
      url: '/pos',
    }).catch(() => {});

    setKdsToast({
      id: 'toast-discharge-' + Date.now(),
      title: `🥖 BÁNH RA LÒ: +${batch.quantity} ${batch.cake_name}`,
      subtitle: `Đã cộng trực tiếp vào tồn kho POS!`,
    });

    refreshStockMap();
  };

  // HỦY MẺ NƯỚNG KHỎI LÒ
  const handleCancelBakeBatch = (batchId: string) => {
    if (confirm('Bạn có chắc muốn xóa mẻ này khỏi lò nướng?')) {
      const remainingBatches = ovenBatches.filter((b) => b.id !== batchId);
      setOvenBatches(remainingBatches);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('bakery_oven_batches', JSON.stringify(remainingBatches));
        } catch {}
      }
    }
  };

  // NHẬP KHO TRỰC TIẾP KHÔNG QUA LÒ (CHO BÁN THÀNH PHẨM HOẶC BÁNH LÀM SẴN)
  const handleDirectProduceAndDeposit = async (recipe: BakeryRecipe, qty: number) => {
    await handleCompleteBakeBatch({
      id: 'direct-' + Date.now(),
      recipe_id: recipe.id,
      product_id: recipe.product_id,
      cake_name: recipe.name,
      quantity: qty,
      unit: recipe.yield_unit || 'cái',
      bake_temp: recipe.bake_temp_celsius,
      duration_seconds: 0,
      started_at: Date.now(),
      ends_at: Date.now(),
      status: 'done',
    });
    setSelectedRecipe(null);
  };

  // 1. Tải toàn bộ đơn bếp từ nguồn Offline-first (localStorage) và Supabase
  const loadOrders = useCallback(async () => {
    try {
      let localOrders: KDSOrder[] = [];

      if (typeof window !== 'undefined') {
        const hasSeeded = localStorage.getItem('bakery_kds_seeded');
        const rawLocal = localStorage.getItem('bakery_orders');

        if (!rawLocal && !hasSeeded) {
          // Lần đầu mở ứng dụng: Khởi tạo 2 đơn mẫu vào localStorage
          localStorage.setItem('bakery_orders', JSON.stringify(INITIAL_DEMO_ORDERS));
          localStorage.setItem('bakery_kds_seeded', 'true');
          localOrders = [...INITIAL_DEMO_ORDERS];
        } else if (rawLocal) {
          try {
            const parsed = JSON.parse(rawLocal);
            if (Array.isArray(parsed)) {
              localOrders = parsed
                .filter((o: any) => o && typeof o === 'object')
                .map((o: any) => {
                  const fromNotes = parsePreorderFromNotes(o.notes);
                  const isShip = (o.delivery_method || o.deliveryMethod) === 'shipping' || fromNotes.delivery_method === 'shipping';
                  return {
                    id: String(o.id || o.local_id || o.order_number || Math.random()),
                    order_number: String(o.order_number || o.orderNumber || 'BK-XXX'),
                    order_type: o.order_type || (o.pickupDateTime ? 'preorder' : 'takeaway'),
                    status: o.status || 'pending',
                    created_at: o.created_at || new Date().toISOString(),
                    preorder_pickup_at: o.preorder_pickup_at || o.pickupDateTime || '',
                    delivery_method: isShip ? ('shipping' as const) : ('pickup' as const),
                    shipping_address: o.shipping_address || o.shippingAddress || fromNotes.shipping_address || '',
                    shipping_fee: Number(o.shipping_fee || o.shippingFee || 0),
                    total_amount: o.total_amount || o.totalPrice || 0,
                    deposit_amount: o.deposit_amount !== undefined ? o.deposit_amount : (o.depositAmount !== undefined ? o.depositAmount : fromNotes.deposit_amount),
                    remaining_amount: o.remaining_amount !== undefined ? o.remaining_amount : (o.remainingAmount !== undefined ? o.remainingAmount : fromNotes.remaining_amount),
                    customer_name: o.customer_name || o.customerName || '',
                    customer_phone: o.customer_phone || o.customerPhone || '',
                    cake_message: o.cake_message || o.cakeMessage || '',
                    notes: o.notes || '',
                    reference_image_url: o.reference_image_url || o.referenceImageUrl || fromNotes.reference_image_url || '',
                    items: Array.isArray(o.items) && o.items.length > 0
                      ? o.items.filter((it: any) => it && typeof it === 'object').map((it: any, idx: number) => ({
                          id: String(it.id || `it-${idx}`),
                          product_name_snapshot: it.product_name_snapshot || it.product?.name || it.name || 'Sản phẩm',
                          quantity: Number(it.quantity) || 1,
                          notes: it.notes || '',
                        }))
                      : o.cakeName
                      ? [
                          {
                            id: 'cake-1',
                            product_name_snapshot: String(o.cakeName),
                            quantity: 1,
                            notes: o.cakeMessage ? `Chữ: "${o.cakeMessage}"` : '',
                          },
                        ]
                      : [],
                  };
                });
            }
          } catch (e) {
            console.warn('Lỗi đọc bakery_orders:', e);
          }
        }
      }

      // 2. Đồng bộ từ Supabase nếu có kết nối mạng
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from('orders')
            .select(`
              id,
              order_number,
              order_type,
              status,
              created_at,
              preorder_pickup_at,
              notes,
              customer_name,
              customer_phone,
              cake_message,
              order_items (
                id,
                product_name_snapshot,
                quantity,
                notes
              )
            `)
            .order('created_at', { ascending: false })
            .limit(50);

          if (!error && data && data.length > 0) {
            // Map từ Supabase
            const sbMap = new Map<string, any>();
            data.forEach((so: any) => {
              if (so.order_number) sbMap.set(so.order_number, so);
            });

            // Gộp đơn: Trạng thái từ Supabase luôn được ưu tiên cao nhất
            // Nếu một đơn đã được điện thoại bấm sang "preparing" hoặc "completed" trên Supabase,
            // máy tính sẽ tự động cập nhật theo trạng thái mới nhất đó!
            const mergedMap = new Map<string, KDSOrder>();

            // 1. Đưa các đơn cục bộ vào trước
            localOrders.forEach((lo) => {
              if (lo.order_number) mergedMap.set(lo.order_number, lo);
            });

            // 2. Phủ dữ liệu Supabase lên (dữ liệu Supabase là chân lý giữa các thiết bị)
            data.forEach((so: any) => {
              if (!so || !so.order_number) return;
              const existing = mergedMap.get(so.order_number);
              const sbNotes = parsePreorderFromNotes(so.notes);
              const isShip = so.delivery_method === 'shipping' || existing?.delivery_method === 'shipping' || sbNotes.delivery_method === 'shipping';
              const merged: KDSOrder = {
                id: String(so.id || existing?.id || so.order_number),
                order_number: String(so.order_number || existing?.order_number || 'BK-XXX'),
                order_type: so.order_type || existing?.order_type || 'takeaway',
                status: so.status || existing?.status || 'pending',
                created_at: so.created_at || existing?.created_at || new Date().toISOString(),
                preorder_pickup_at: so.preorder_pickup_at || existing?.preorder_pickup_at || sbNotes.preorder_pickup_at || '',
                delivery_method: isShip ? ('shipping' as const) : ('pickup' as const),
                shipping_address: so.shipping_address || existing?.shipping_address || sbNotes.shipping_address || '',
                shipping_fee: so.shipping_fee || existing?.shipping_fee || 0,
                notes: so.notes || existing?.notes || '',
                customer_name: so.customer_name || existing?.customer_name || '',
                customer_phone: so.customer_phone || existing?.customer_phone || '',
                cake_message: so.cake_message || existing?.cake_message || '',
                total_amount: so.total_amount || existing?.total_amount,
                deposit_amount: so.deposit_amount !== undefined ? so.deposit_amount : (existing?.deposit_amount !== undefined ? existing?.deposit_amount : sbNotes.deposit_amount),
                remaining_amount: so.remaining_amount !== undefined ? so.remaining_amount : (existing?.remaining_amount !== undefined ? existing?.remaining_amount : sbNotes.remaining_amount),
                reference_image_url: so.reference_image_url || existing?.reference_image_url || sbNotes.reference_image_url || '',
                items: Array.isArray(so.order_items) && so.order_items.length > 0
                  ? so.order_items
                      .filter((it: any) => it && typeof it === 'object')
                      .map((it: any) => ({
                        id: String(it.id || Math.random()),
                        product_name_snapshot: it.product_name_snapshot || 'Bánh',
                        quantity: Number(it.quantity) || 1,
                        notes: it.notes || '',
                      }))
                  : existing?.items && existing.items.length > 0
                  ? existing.items
                  : (sbNotes.cake_name || so.cake_name)
                  ? [
                      {
                        id: 'cake-item-sb',
                        product_name_snapshot: sbNotes.cake_name || so.cake_name || 'Bánh Đặt Trước',
                        quantity: 1,
                        notes: so.cake_message ? `Chữ: "${so.cake_message}"` : '',
                      }
                    ]
                  : [],
              };
              mergedMap.set(so.order_number, merged);
            });

            localOrders = Array.from(mergedMap.values());

            // Lưu ngược lại localStorage để các lần mở sau luôn có dữ liệu mới nhất
            if (typeof window !== 'undefined') {
              try {
                localStorage.setItem('bakery_orders', JSON.stringify(localOrders));
              } catch {}
            }
          }
        } catch (sbErr) {
          console.warn('Supabase KDS notice:', sbErr);
        }
      }

      // 3. Chỉ hiển thị các đơn còn đang cần làm: pending, preparing, ready
      // Các đơn completed hoặc cancelled sẽ hoàn toàn không xuất hiện trên bảng bếp
      const activeOrders = (localOrders || []).filter(
        (o) => o && (o.status === 'pending' || o.status === 'preparing' || o.status === 'ready')
      );

      setOrders(activeOrders);
      setLastUpdated(new Date().toLocaleTimeString('vi-VN'));
    } catch (err) {
      console.error('Lỗi tải đơn KDS:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    // 1. Lắng nghe sự kiện đồng bộ cục bộ (cùng máy khác tab)
    const handleLocalUpdate = () => {
      loadOrders();
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'bakery_orders' || e.key === 'bakery_preorders') {
        loadOrders();
      }
    };

    window.addEventListener('bakery_orders_updated', handleLocalUpdate);
    window.addEventListener('storage', handleStorageChange);

    // 2. Polling định kỳ mỗi 3 giây làm chốt an toàn
    const pollTimer = setInterval(loadOrders, 3000);

    // 3. Kênh Supabase Realtime Broadcast & Postgres Changes (Đồng bộ đa thiết bị tức thì ~50ms)
    const unsubscribeSync = subscribeCrossDeviceSync({
      onStatusUpdate: (payload) => {
        if (!payload || !payload.order_number) return;
        // Nhận lệnh đổi bước từ điện thoại hoặc máy khác
        setOrders((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const exists = list.some((o) => o && (o.order_number === payload.order_number || o.id === payload.order_number));
          if (payload.status === 'completed' || payload.status === 'cancelled') {
            return list.filter((o) => o && o.order_number !== payload.order_number && o.id !== payload.order_number);
          }
          if (exists) {
            return list.map((o) => {
              if (o && (o.order_number === payload.order_number || o.id === payload.order_number)) {
                const notesParse = parsePreorderFromNotes(o.notes || payload.order_data?.notes);
                const isShip = o.delivery_method === 'shipping' || payload.order_data?.delivery_method === 'shipping' || notesParse.delivery_method === 'shipping';
                return { 
                  ...o, 
                  status: payload.status,
                  delivery_method: isShip ? ('shipping' as const) : ('pickup' as const),
                  shipping_address: o.shipping_address || payload.order_data?.shipping_address || notesParse.shipping_address || '',
                  shipping_fee: o.shipping_fee || payload.order_data?.shipping_fee || 0,
                  remaining_amount: o.remaining_amount !== undefined ? o.remaining_amount : (payload.order_data?.remaining_amount !== undefined ? payload.order_data?.remaining_amount : notesParse.remaining_amount),
                  reference_image_url: o.reference_image_url || payload.order_data?.reference_image_url || payload.order_data?.referenceImageUrl || '',
                  preorder_pickup_at: o.preorder_pickup_at || payload.order_data?.preorder_pickup_at || notesParse.preorder_pickup_at || '',
                };
              }
              return o;
            });
          }
          if (payload.order_data) {
            const od = payload.order_data;
            const odNotes = parsePreorderFromNotes(od.notes);
            const isShip = od.delivery_method === 'shipping' || od.deliveryMethod === 'shipping' || odNotes.delivery_method === 'shipping';
            return [
              ...list,
              {
                id: String(od.id || payload.order_number),
                order_number: String(od.order_number || payload.order_number),
                order_type: od.order_type || 'takeaway',
                status: payload.status,
                created_at: od.created_at || new Date().toISOString(),
                preorder_pickup_at: od.preorder_pickup_at || od.pickupDateTime || '',
                delivery_method: isShip ? ('shipping' as const) : ('pickup' as const),
                shipping_address: od.shipping_address || od.shippingAddress || odNotes.shipping_address || '',
                shipping_fee: od.shipping_fee || od.shippingFee || 0,
                notes: od.notes || '',
                customer_name: od.customer_name || od.customerName || '',
                customer_phone: od.customer_phone || od.customerPhone || '',
                cake_message: od.cake_message || od.cakeMessage || '',
                total_amount: od.total_amount || od.totalPrice,
                deposit_amount: od.deposit_amount !== undefined ? od.deposit_amount : (od.depositAmount !== undefined ? od.depositAmount : odNotes.deposit_amount),
                remaining_amount: od.remaining_amount !== undefined ? od.remaining_amount : (od.remainingAmount !== undefined ? od.remainingAmount : odNotes.remaining_amount),
                reference_image_url: od.reference_image_url || od.referenceImageUrl || '',
                items: Array.isArray(od.items) ? od.items : [],
              },
            ];
          }
          return list;
        });

        // Cập nhật ngay vào localStorage của máy này
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('bakery_orders');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const updated = parsed.map((o: any) => {
                  if (o.order_number === payload.order_number || o.id === payload.order_number) {
                    const fromN = parsePreorderFromNotes(o.notes || payload.order_data?.notes);
                    const isS = o.delivery_method === 'shipping' || payload.order_data?.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
                    return {
                      ...o,
                      status: payload.status,
                      updated_at: payload.updated_at,
                      delivery_method: isS ? 'shipping' : 'pickup',
                      shipping_address: o.shipping_address || payload.order_data?.shipping_address || fromN.shipping_address || '',
                      remaining_amount: o.remaining_amount !== undefined ? o.remaining_amount : (payload.order_data?.remaining_amount !== undefined ? payload.order_data?.remaining_amount : fromN.remaining_amount),
                      reference_image_url: o.reference_image_url || payload.order_data?.reference_image_url || payload.order_data?.referenceImageUrl || '',
                      preorder_pickup_at: o.preorder_pickup_at || payload.order_data?.preorder_pickup_at || fromN.preorder_pickup_at || '',
                    };
                  }
                  return o;
                });
                localStorage.setItem('bakery_orders', JSON.stringify(updated));
              }
            }
          } catch {}
        }
      },
      onNewOrder: (incomingOrder?: any) => {
        if (incomingOrder && (incomingOrder.order_number || incomingOrder.orderNumber)) {
          const fromN = parsePreorderFromNotes(incomingOrder.notes);
          const isShip = (incomingOrder.delivery_method || incomingOrder.deliveryMethod) === 'shipping' || fromN.delivery_method === 'shipping';
          const normalizedOrder: KDSOrder = {
            id: String(incomingOrder.id || incomingOrder.local_id || incomingOrder.order_number || Math.random()),
            order_number: String(incomingOrder.order_number || incomingOrder.orderNumber),
            order_type: incomingOrder.order_type || (incomingOrder.pickupDateTime ? 'preorder' : 'takeaway'),
            status: incomingOrder.status || 'pending',
            created_at: incomingOrder.created_at || new Date().toISOString(),
            preorder_pickup_at: incomingOrder.preorder_pickup_at || incomingOrder.pickupDateTime || '',
            delivery_method: isShip ? 'shipping' : 'pickup',
            shipping_address: incomingOrder.shipping_address || incomingOrder.shippingAddress || fromN.shipping_address || '',
            shipping_fee: Number(incomingOrder.shipping_fee || incomingOrder.shippingFee || 0),
            total_amount: incomingOrder.total_amount || incomingOrder.totalPrice || 0,
            deposit_amount: incomingOrder.deposit_amount !== undefined ? incomingOrder.deposit_amount : (incomingOrder.depositAmount !== undefined ? incomingOrder.depositAmount : fromN.deposit_amount),
            remaining_amount: incomingOrder.remaining_amount !== undefined ? incomingOrder.remaining_amount : (incomingOrder.remainingAmount !== undefined ? incomingOrder.remainingAmount : fromN.remaining_amount),
            customer_name: incomingOrder.customer_name || incomingOrder.customerName || '',
            customer_phone: incomingOrder.customer_phone || incomingOrder.customerPhone || '',
            cake_message: incomingOrder.cake_message || incomingOrder.cakeMessage || '',
            notes: incomingOrder.notes || '',
            reference_image_url: incomingOrder.reference_image_url || incomingOrder.referenceImageUrl || fromN.reference_image_url || '',
            items: Array.isArray(incomingOrder.items) && incomingOrder.items.length > 0 
              ? incomingOrder.items 
              : incomingOrder.cake_name || fromN.cake_name
              ? [
                  {
                    id: 'cake-item-auto',
                    product_name_snapshot: incomingOrder.cake_name || fromN.cake_name || 'Bánh Đặt Trước',
                    quantity: 1,
                    notes: incomingOrder.cake_message ? `Chữ: "${incomingOrder.cake_message}"` : '',
                  }
                ]
              : [],
          };

          setOrders((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const idx = list.findIndex(o => o.order_number === normalizedOrder.order_number || o.id === normalizedOrder.id);
            if (idx >= 0) {
              const updated = [...list];
              updated[idx] = { ...updated[idx], ...normalizedOrder };
              return updated;
            }
            return [normalizedOrder, ...list];
          });

          try {
            const raw = localStorage.getItem('bakery_orders');
            const parsed = raw ? JSON.parse(raw) : [];
            const idx = parsed.findIndex((o: any) => o.order_number === normalizedOrder.order_number);
            if (idx >= 0) parsed[idx] = { ...parsed[idx], ...normalizedOrder };
            else parsed.unshift(normalizedOrder);
            localStorage.setItem('bakery_orders', JSON.stringify(parsed));

            // Đồng bộ luôn vào bakery_preorders nếu là đơn đặt bánh
            if (normalizedOrder.order_type === 'preorder' || normalizedOrder.order_number?.startsWith('BK-PRE') || !!normalizedOrder.preorder_pickup_at) {
              const rawPo = localStorage.getItem('bakery_preorders');
              const parsedPo = rawPo ? JSON.parse(rawPo) : [];
              const pIdx = parsedPo.findIndex((o: any) => (o.order_number || o.orderNumber) === normalizedOrder.order_number);
              if (pIdx >= 0) parsedPo[pIdx] = { ...parsedPo[pIdx], ...normalizedOrder };
              else parsedPo.unshift(normalizedOrder);
              localStorage.setItem('bakery_preorders', JSON.stringify(parsedPo));
            }
          } catch {}

          soundManager.playNewOrderChime();
          const isCake = normalizedOrder.order_type === 'preorder' || normalizedOrder.order_number?.startsWith('BK-PRE') || !!normalizedOrder.preorder_pickup_at;
          const itemsDesc = normalizedOrder.items && normalizedOrder.items.length > 0
            ? normalizedOrder.items.map(it => `${it.quantity}x ${it.product_name_snapshot}`).join(', ')
            : 'Đơn bánh mới';
          const pickupFormatted = normalizedOrder.preorder_pickup_at ? formatPickupDateTime(normalizedOrder.preorder_pickup_at) : undefined;
          const custInfo = normalizedOrder.customer_name ? `${normalizedOrder.customer_name} (${normalizedOrder.customer_phone || ''})` : undefined;

          setKdsToast({
            id: String(Date.now()),
            title: isCake ? '🎂 BẾP NHẬN ĐƠN BÁNH MỚI!' : '🔔 BẾP CÓ ĐƠN HÀNG MỚI!',
            subtitle: isCake ? 'Đơn đặt bánh sinh nhật vừa vào bếp, vui lòng kiểm tra giờ hẹn' : 'Đơn bán tại quầy vừa chuyển vào bếp làm bánh',
            orderNumber: normalizedOrder.order_number,
            customerInfo: custInfo,
            pickupTime: pickupFormatted,
            details: itemsDesc,
          });

          phoneNotificationService.triggerOrderNotification({
            id: String(Date.now()),
            type: 'new_order',
            appTitle: 'BẾP BÁNH (KDS)',
            title: isCake ? `🎂 Bếp Nhận Đơn Bánh #${normalizedOrder.order_number}` : `🔔 Bếp Nhận Đơn #${normalizedOrder.order_number}`,
            sender: custInfo || 'Đơn chuyển vào bếp làm bánh',
            message: `${pickupFormatted ? '⏰ Giao: ' + pickupFormatted + ' • ' : ''}${itemsDesc}`,
            extraDetails: normalizedOrder.cake_message ? `Ghi chữ: "${normalizedOrder.cake_message}"` : undefined,
            orderNumber: normalizedOrder.order_number,
            pickupTime: pickupFormatted,
            actionLabel: 'Xem Bếp Làm',
            onAction: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
          });
        }
        // Trì hoãn 1s trước khi fetch lại Supabase để không bị chèn ép trạng thái đang insert
        setTimeout(() => loadOrders(), 1000);
      },
      onDbChange: () => {
        // Nhận tín hiệu thay đổi CSDL Postgres từ Supabase (máy khác vừa tạo/sửa đơn)
        loadOrders();
      },
      onClearDemo: () => {
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('bakery_orders');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const filtered = parsed.filter(
                  (o: any) =>
                    o.id !== 'kds-demo-1' &&
                    o.id !== 'kds-demo-2' &&
                    o.order_number !== 'BK-PRE-20260908-01' &&
                    o.order_number !== 'BK-20260907-002'
                );
                localStorage.setItem('bakery_orders', JSON.stringify(filtered));
              }
            }
            localStorage.setItem('bakery_kds_seeded', 'true');
            window.dispatchEvent(new Event('bakery_orders_updated'));
          } catch {}
        }
        loadOrders();
      },
    });

    return () => {
      window.removeEventListener('bakery_orders_updated', handleLocalUpdate);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollTimer);
      unsubscribeSync();
    };
  }, [loadOrders]);

  // Cập nhật trạng thái đơn (Mới nhận -> Đang làm -> Sẵn sàng -> Hoàn thành)
  const handleUpdateStatus = async (orderId: string, currentStatus: string) => {
    let nextStatus: 'preparing' | 'ready' | 'completed' = 'preparing';
    if (currentStatus === 'pending') nextStatus = 'preparing';
    else if (currentStatus === 'preparing') nextStatus = 'ready';
    else if (currentStatus === 'ready') nextStatus = 'completed';

    const targetOrder = orders.find((o) => o.id === orderId || o.order_number === orderId);
    const orderNum = targetOrder?.order_number || orderId;

    // 1. Cập nhật ngay trên giao diện React của thiết bị hiện tại
    setOrders((prev) =>
      prev
        .map((o) => (o.id === orderId || o.order_number === orderId || o.order_number === orderNum ? { ...o, status: nextStatus } : o))
        .filter((o) => o.status !== 'completed')
    );

    // 2. Lưu trạng thái vĩnh viễn vào localStorage để reload trang KHÔNG BAO GIỜ bị hiện lại
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
                o.order_number === orderNum
              ) {
                const fromN = parsePreorderFromNotes(o.notes || targetOrder?.notes);
                const isS = o.delivery_method === 'shipping' || targetOrder?.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
                return { 
                  ...o, 
                  status: nextStatus, 
                  updated_at: new Date().toISOString(),
                  delivery_method: isS ? 'shipping' : 'pickup',
                  shipping_address: o.shipping_address || targetOrder?.shipping_address || fromN.shipping_address || '',
                  remaining_amount: o.remaining_amount !== undefined ? o.remaining_amount : (targetOrder?.remaining_amount !== undefined ? targetOrder?.remaining_amount : fromN.remaining_amount),
                  reference_image_url: o.reference_image_url || targetOrder?.reference_image_url || '',
                  preorder_pickup_at: o.preorder_pickup_at || targetOrder?.preorder_pickup_at || fromN.preorder_pickup_at || '',
                  pickupDateTime: o.pickupDateTime || targetOrder?.pickupDateTime || o.preorder_pickup_at || fromN.preorder_pickup_at || '',
                };
              }
              return o;
            });
            localStorage.setItem('bakery_orders', JSON.stringify(updated));
          }
        }

        // Đồng bộ cả bakery_preorders nếu có
        const rawPo = localStorage.getItem('bakery_preorders');
        if (rawPo) {
          const parsedPo = JSON.parse(rawPo);
          if (Array.isArray(parsedPo)) {
            const updatedPo = parsedPo.map((po: any) => {
              if (po.id === orderId || po.orderNumber === orderId || po.orderNumber === orderNum) {
                return { ...po, status: nextStatus };
              }
              return po;
            });
            localStorage.setItem('bakery_preorders', JSON.stringify(updatedPo));
          }
        }

        // Phát sự kiện để các tab khác trên cùng máy nhận biết ngay
        window.dispatchEvent(new Event('bakery_orders_updated'));
      } catch (err) {
        console.warn('Lỗi lưu trạng thái đơn vào localStorage:', err);
      }
    }

    // 3. PHÁT SÓNG REALTIME BROADCAST SANG CÁC THIẾT BỊ KHÁC (Điện thoại <-> Máy tính)
    // Máy tính sẽ nhận được cập nhật tức thì trong vòng ~50ms mà không cần F5!
    await broadcastOrderStatusUpdate(orderNum, nextStatus, targetOrder);

    // 4. Đồng bộ nền lên Supabase Database (PostgreSQL) để lưu vĩnh viễn
    if (targetOrder) {
      syncOrderToSupabase(targetOrder, nextStatus);
    }

    // Tự động chuyển tab trên điện thoại nếu đơn vừa chuyển sang bước tiếp theo
    if (nextStatus === 'preparing' && kdsMobileTab === 'pending' && pendingOrders.length <= 1) {
      setKdsMobileTab('preparing');
    } else if (nextStatus === 'ready' && kdsMobileTab === 'preparing' && preparingOrders.length <= 1) {
      setKdsMobileTab('ready');
    }

    // 5. THÔNG BÁO TỰ ĐỘNG THEO YÊU CẦU:
    // A. Hoàn thành bước 2 (Bánh chín/xong -> Chờ ship / Sẵn sàng)
    if (nextStatus === 'ready') {
      const fromN = parsePreorderFromNotes(targetOrder?.notes);
      const isS =
        targetOrder?.delivery_method === 'shipping' ||
        fromN.delivery_method === 'shipping' ||
        (targetOrder?.notes && targetOrder.notes.includes('Giao tận nơi'));

      sendTelegramReadyForShipAlert(targetOrder || { id: orderId, order_number: orderNum }).catch(() => {});

      soundManager.playNewOrderChime();
      phoneNotificationService.triggerOrderNotification({
        id: String(Date.now()),
        type: 'new_order',
        appTitle: 'BẾP LÀM BÁNH (KDS)',
        title: isS ? `🛵 Bánh Đã Xong - Chờ Ship! #${orderNum}` : `🎂 Bánh Đã Xong - Sẵn Sàng Tại Quầy! #${orderNum}`,
        sender: 'Thợ Bánh Hoàn Thành Bước 2',
        message: `${targetOrder?.cake_name || fromN.cake_name || targetOrder?.items?.[0]?.product_name_snapshot || 'Bánh tươi'} đã trang trí & đóng hộp hoàn tất!`,
        orderNumber: orderNum,
      });
    }
    // B. Ship xong / Giao xong nhấn Hoàn Thành
    else if (nextStatus === 'completed') {
      const fromN = parsePreorderFromNotes(targetOrder?.notes);
      const isS =
        targetOrder?.delivery_method === 'shipping' ||
        fromN.delivery_method === 'shipping' ||
        (targetOrder?.notes && targetOrder.notes.includes('Giao tận nơi'));

      sendTelegramDeliveredSuccessAlert(targetOrder || { id: orderId, order_number: orderNum }).catch(() => {});

      soundManager.playNewOrderChime();
      phoneNotificationService.triggerOrderNotification({
        id: String(Date.now()),
        type: 'new_order',
        appTitle: 'GIAO HÀNG THÀNH CÔNG',
        title: `🎉 Giao Thành Công Đơn #${orderNum}`,
        sender: isS ? 'Shipper Giao Tận Nơi' : 'Thu Ngân Quầy POS',
        message: `Đơn hàng #${orderNum} đã được bàn giao thành công cho khách hàng!`,
        orderNumber: orderNum,
      });
    }
  };

  // Hủy bánh hỏng & Chuyển về bước đầu làm lại từ đầu (Pending)
  const handleCancelAndRemakeOrder = async (
    order: KDSOrder,
    reason: string,
    notes: string,
    logSpoilage: boolean
  ) => {
    const orderId = order.id;
    const orderNum = order.order_number || orderId;

    // 1. Cập nhật ngay trên giao diện React đưa về status: 'pending'
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId || o.order_number === orderId || o.order_number === orderNum
          ? { ...o, status: 'pending' as const, remake_reason: reason, remake_notes: notes }
          : o
      )
    );

    // 2. Lưu trạng thái vào localStorage
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
                o.order_number === orderNum
              ) {
                return {
                  ...o,
                  status: 'pending',
                  updated_at: new Date().toISOString(),
                  remake_reason: reason,
                  remake_notes: notes,
                };
              }
              return o;
            });
            localStorage.setItem('bakery_orders', JSON.stringify(updated));
          }
        }

        // Cập nhật cả bakery_preorders nếu có
        const rawPo = localStorage.getItem('bakery_preorders');
        if (rawPo) {
          const parsedPo = JSON.parse(rawPo);
          if (Array.isArray(parsedPo)) {
            const updatedPo = parsedPo.map((po: any) => {
              if (po.id === orderId || po.orderNumber === orderId || po.orderNumber === orderNum) {
                return { ...po, status: 'pending', remake_reason: reason };
              }
              return po;
            });
            localStorage.setItem('bakery_preorders', JSON.stringify(updatedPo));
          }
        }

        window.dispatchEvent(new Event('bakery_orders_updated'));
      } catch (err) {
        console.warn('Lỗi cập nhật localStorage khi hủy làm lại bánh:', err);
      }
    }

    // 3. Phát sóng realtime sang các thiết bị khác (POS, máy tính, tablet)
    await broadcastOrderStatusUpdate(orderNum, 'pending', {
      ...order,
      status: 'pending',
      remake_reason: reason,
    });

    // 4. Đồng bộ Supabase Database
    syncOrderToSupabase({ ...order, status: 'pending', remake_reason: reason }, 'pending');

    // 5. Ghi nhận hao hụt vào Spoilage Manager nếu được chọn
    if (logSpoilage) {
      try {
        const mainItem = order.items?.[0];
        const cakeName = mainItem?.product_name_snapshot || order.cake_name || 'Bánh Kem Theo Yêu Cầu';
        const qty = mainItem?.quantity || 1;
        const unitPrice = mainItem?.unit_price || (order.total_amount ? Math.round(order.total_amount / qty) : 250000);
        const estCost = Math.round(unitPrice * 0.45);

        addSpoilageLog({
          productId: mainItem?.id || 'remake-' + orderNum,
          productName: `${cakeName} (Hỏng đơn #${orderNum})`,
          quantity: qty,
          unit: 'cái',
          baseCost: estCost,
          sellingPrice: unitPrice,
          totalCostLoss: estCost * qty,
          totalRevenueLoss: unitPrice * qty,
          reason: `Làm lại KDS: ${reason}`,
          notes: notes ? `${notes} (Đơn #${orderNum} làm lại từ đầu)` : `Đơn #${orderNum} làm lại từ đầu`,
          loggedBy: 'Thợ Bếp (KDS)',
        });
      } catch (e) {
        console.warn('Lỗi ghi sổ hao hụt bánh:', e);
      }
    }

    // 6. Âm báo & thông báo điện thoại
    soundManager.playUrgentAlert();
    phoneNotificationService.triggerOrderNotification({
      id: String(Date.now()),
      type: 'new_order',
      appTitle: 'BẾP LÀM LẠI BÁNH',
      title: `🔄 Làm Lại Bánh #${orderNum}`,
      sender: 'Thợ Bếp Báo Hỏng',
      message: `Đơn #${orderNum} (${order.cake_name || order.items?.[0]?.product_name_snapshot || 'Bánh'}) đã hủy và quay về bước đầu làm lại do: ${reason}!`,
      orderNumber: orderNum,
    });

    // 7. Chuyển tab trên mobile sang 'pending' để thợ nhìn thấy đơn ngay
    setKdsMobileTab('pending');
  };

  // Hàm trích xuất thông tin bánh tinh gọn cho thợ bếp: Tên bánh, Kích thước, Lời nhắn, Yêu cầu
  const getCakeDisplayInfo = (order: KDSOrder) => {
    const fromN = parsePreorderFromNotes(order.notes);
    const mainItem = order.items?.[0];
    const rawFullName = mainItem?.product_name_snapshot || order.cake_name || fromN.cake_name || 'Bánh Kem Theo Yêu Cầu';

    let name = rawFullName;
    let size = fromN.cake_size || '';
    const sizeMatch = rawFullName.match(/\(([^)]+)\)/);
    if (sizeMatch) {
      if (!size) size = sizeMatch[1];
      name = rawFullName.replace(/\s*\([^)]+\)/g, '').trim();
    } else if (!size) {
      const cmMatch = rawFullName.match(/(\d+\s*cm)/i);
      if (cmMatch) size = cmMatch[1].toUpperCase();
    }

    return {
      fullName: rawFullName,
      name: name || rawFullName,
      size: size || fromN.cake_size || '',
      quantity: mainItem?.quantity || 1,
      cakeMessage: order.cake_message || fromN.cake_message || '',
      specialRequest: fromN.special_request || cleanDisplayNotes(order.notes) || '',
    };
  };

  // Xác nhận thanh toán & hoàn thành giao hàng ở Bước 3
  const handleConfirmPaymentAndComplete = async (order: KDSOrder, paymentMethod: 'cash' | 'bank_transfer') => {
    const orderId = order.id;
    const orderNum = order.order_number;

    // 1. Cập nhật state cục bộ ngay lập tức (xóa khỏi KDS)
    setOrders((prev) => prev.filter((o) => o.id !== orderId && o.order_number !== orderNum));

    // 2. Cập nhật vĩnh viễn vào localStorage
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
                o.order_number === orderNum
              ) {
                return {
                  ...o,
                  status: 'completed',
                  remaining_amount: 0,
                  remainingAmount: 0,
                  payment_status: 'paid',
                  final_payment_method: paymentMethod,
                  paid_at: new Date().toISOString(),
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
              if (po.id === orderId || po.orderNumber === orderId || po.orderNumber === orderNum) {
                return {
                  ...po,
                  status: 'completed',
                  remaining_amount: 0,
                  remainingAmount: 0,
                  payment_status: 'paid',
                  final_payment_method: paymentMethod,
                  paid_at: new Date().toISOString(),
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
        console.warn('Lỗi lưu đơn hoàn tất giao:', err);
      }
    }

    // 3. Phát sóng realtime sang POS và các thiết bị khác
    const updatedOrder: KDSOrder = {
      ...order,
      status: 'completed' as const,
      remaining_amount: 0,
    };
    await broadcastOrderStatusUpdate(orderNum, 'completed', updatedOrder);

    // 4. Đồng bộ CSDL Supabase
    syncOrderToSupabase(updatedOrder, 'completed');

    // 5. Gửi thông báo Telegram
    sendTelegramDeliveredSuccessAlert(updatedOrder).catch(() => {});
  };

  // Nút xóa sạch đơn mẫu thử nghiệm
  const handleClearDemoOrders = () => {
    if (confirm('Bạn có chắc muốn dọn sạch các đơn mẫu / đơn thử nghiệm? Bảng bếp sẽ trở về trạng thái sạch để đón nhận các đơn thực tế từ quầy bán hàng.')) {
      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('bakery_orders');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter((o: any) => {
                if (!o) return false;
                const id = String(o.id || '');
                const orderNum = String(o.order_number || o.orderNumber || '');
                const name = String(o.customer_name || '');
                const isDemo =
                  id.startsWith('kds-demo') ||
                  id.startsWith('sim-') ||
                  orderNum === 'BK-PRE-20260908-01' ||
                  orderNum === 'BK-20260907-002' ||
                  name === 'Chị Lan Anh' ||
                  name === 'Chị Minh Thư' ||
                  name === 'Anh Hoàng Nam' ||
                  name === 'Cô Thu Hương' ||
                  name === 'Bác Quang Huy' ||
                  name === 'Bạn Thùy Trang';
                return !isDemo;
              });
              localStorage.setItem('bakery_orders', JSON.stringify(filtered));
            }
          }
          localStorage.setItem('bakery_kds_seeded', 'true');
          localStorage.removeItem('bakery_auto_demo_enabled');
          window.dispatchEvent(new Event('bakery_orders_updated'));
          loadOrders();
        } catch (e) {
          console.warn('Lỗi dọn đơn mẫu:', e);
        }
      }
      // Phát sóng để tất cả điện thoại/máy tính khác cùng xóa đơn mẫu
      broadcastClearDemoOrders();
    }
  };

  const pendingOrders = (orders || []).filter((o) => o && o.status === 'pending');
  const preparingOrders = (orders || []).filter((o) => o && o.status === 'preparing');
  const readyOrders = (orders || []).filter((o) => o && o.status === 'ready');

  const getElapsedMinutes = (dateStr?: string) => {
    if (!dateStr) return 0;
    try {
      const time = new Date(dateStr).getTime();
      if (isNaN(time)) return 0;
      const diff = Date.now() - time;
      return Math.max(0, Math.floor(diff / (1000 * 60)));
    } catch {
      return 0;
    }
  };

  return (
    <div className="flex-1 flex flex-col p-3 sm:p-6 bg-zinc-950 text-zinc-100 min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              Màn Hình Bếp KDS <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Realtime</span>
            </h1>
            <p className="text-xs text-zinc-400">Tự động nhận đơn bán tại quầy và các đơn đặt bánh sinh nhật</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {urgentOrders.length > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-950/80 border border-rose-600 text-rose-300 font-black flex items-center gap-1.5 shadow-sm animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>{urgentOrders.length} Đơn Gấp!</span>
            </div>
          )}

          <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-2">
            <span>Tổng đơn:</span>
            <span className="font-black text-orange-400 text-sm">{(orders || []).length}</span>
          </div>

          {/* Nút Bật/Tắt Âm Báo Chuông Bếp */}
          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              soundManager.setEnabled(next);
              if (next) soundManager.playNewOrderChime();
            }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              soundEnabled
                ? 'bg-amber-950/60 border-amber-500/50 text-amber-300 hover:bg-amber-900/60'
                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800'
            }`}
            title={soundEnabled ? 'Chuông báo đơn mới & đơn gấp: ĐANG BẬT (click để tắt)' : 'Chuông báo: ĐANG TẮT (click để bật)'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-amber-400 animate-pulse" />
            ) : (
              <VolumeX className="w-4 h-4 text-zinc-500" />
            )}
            <span className="hidden sm:inline">{soundEnabled ? 'Chuông: Bật' : 'Chuông: Tắt'}</span>
          </button>

          {/* Nút Xem Lịch Sử Thông Báo Bếp & Lò */}
          <button
            type="button"
            onClick={() => {
              setNotifModalTab('history');
              setIsNotifSettingsOpen(true);
            }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 ${
              unreadNotifs > 0
                ? 'border-rose-500/60 bg-rose-950/60 text-rose-300 hover:bg-rose-900/80 ring-2 ring-rose-500/30'
                : 'border-amber-500/40 bg-amber-950/50 hover:bg-amber-900/70 text-amber-300'
            }`}
            title="Xem lại toàn bộ lịch sử thông báo đơn hàng, nướng bánh ra lò & đơn khẩn cấp"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span>Lịch Sử Báo</span>
            {unreadNotifs > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black animate-pulse">
                {unreadNotifs}
              </span>
            )}
          </button>

          {/* Nút Cài đặt & Kiểm tra Telegram Báo Lò */}
          <button
            type="button"
            onClick={() => {
              setNotifModalTab('telegram');
              setIsNotifSettingsOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl border border-sky-500/40 bg-sky-950/50 hover:bg-sky-900/70 text-sky-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
            title="Cài đặt bot và nhận tin nhắn Telegram khi nướng bánh & ra lò"
          >
            <Send className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Telegram Báo Lò</span>
            <span className="sm:hidden">Telegram</span>
          </button>

          <button
            onClick={loadOrders}
            title="Tải lại danh sách đơn"
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-orange-400" />
            <span className="hidden sm:inline">Làm Mới</span>
          </button>

          {/* Nút xóa đơn mẫu nếu còn tồn tại */}
          {(orders || []).some((o) => o && (o.id === 'kds-demo-1' || o.id === 'kds-demo-2' || o.order_number === 'BK-PRE-20260908-01')) && (
            <button
              onClick={handleClearDemoOrders}
              className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800 text-rose-300 font-bold transition flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Xóa Đơn Mẫu</span>
            </button>
          )}

          {lastUpdated && (
            <span className="text-[11px] text-zinc-500 hidden md:inline">
              Cập nhật: {lastUpdated}
            </span>
          )}
        </div>
      </div>

      {/* ── CHUYỂN CHẾ ĐỘ MÀN HÌNH BẾP: ĐƠN HÀNG VS LÀM BÁNH BÁN THEO CÔNG THỨC BOM ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
        <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-2xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setKitchenMode('orders')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              kitchenMode === 'orders'
                ? 'bg-orange-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <ChefHat className="w-4 h-4" />
            <span>🎂 Đơn Khách & Bán Quầy ({orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setKitchenMode('production')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 cursor-pointer ${
              kitchenMode === 'production'
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Flame className="w-4 h-4 text-orange-400" />
            <span>🥖 Làm Bánh Bán (BOM & Lò Nướng)</span>
            {ovenBatches.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                ovenBatches.some((b) => b.status === 'done')
                  ? 'bg-rose-500 text-white animate-bounce'
                  : 'bg-orange-500/30 text-orange-300 border border-orange-500/40'
              }`}>
                {ovenBatches.length} lò
              </span>
            )}
          </button>
        </div>

        {kitchenMode === 'production' && (
          <div className="text-xs text-zinc-400 hidden sm:flex items-center gap-2">
            <span>Tự động tính BOM & Khối lượng cân nguyên liệu</span>
          </div>
        )}
      </div>

      {/* ── BANNER NHẮC LÒ NƯỚNG KHI ĐANG Ở CHẾ ĐỘ ĐƠN HÀNG ── */}
      {kitchenMode === 'orders' && ovenBatches.length > 0 && (
        <div className="mt-3 bg-gradient-to-r from-amber-950/80 via-orange-950/70 to-zinc-900 border border-amber-500/60 p-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-amber-400 animate-spin" />
            </div>
            <div>
              <div className="text-xs font-black text-amber-200 flex items-center gap-2">
                <span>🔥 LÒ NƯỚNG: Đang nướng {ovenBatches.length} mẻ bánh</span>
                {ovenBatches.some((b) => b.status === 'done') && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black animate-bounce">
                    🔔 BÁNH ĐÃ CHÍN!
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400">
                {ovenBatches.map((b) => `${b.quantity}x ${b.cake_name} (${b.status === 'done' ? 'CHÍN XONG' : Math.max(0, Math.ceil((b.ends_at - Date.now()) / 60000)) + 'p'})`).join(' • ')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setKitchenMode('production')}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black transition cursor-pointer shadow flex items-center gap-1 shrink-0"
          >
            <span>Mở Lò Nướng</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── CHẾ ĐỘ 1: ĐƠN HÀNG BÁN TẠI QUẦY & ĐƠN ĐẶT BÁNH SINH NHẬT ── */}
      {kitchenMode === 'orders' && (
        <>
          {/* ── CẢNH BÁO BẾP: ĐƠN SẮP PHẢI GIAO HOẶC QUÁ HẠN ── */}
          {urgentOrders.length > 0 && (
            <div className="mt-4 bg-gradient-to-r from-rose-950 via-rose-900 to-amber-950 border-2 border-rose-500/90 text-white p-3.5 sm:p-4 rounded-3xl shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-rose-600/40">
              <AlertTriangle className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div>
              <h2 className="font-black text-sm sm:text-base text-rose-100 flex items-center gap-2">
                <span>🚨 CẢNH BÁO BẾP: CÓ {urgentOrders.length} ĐƠN CẦN GIAO GẤP TRONG 60 PHÚT HOẶC ĐÃ QUÁ HẠN!</span>
              </h2>
              <p className="text-xs text-rose-200/90">
                Các đơn hàng có viền đỏ nhấp nháy bên dưới cần được thợ ưu tiên hoàn thành và đóng hộp ngay để kịp giờ giao khách!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => soundManager.playUrgentAlert()}
            className="px-3.5 py-1.5 rounded-xl bg-white text-rose-900 hover:bg-rose-100 text-xs font-black shadow-md flex items-center gap-1.5 transition cursor-pointer active:scale-95"
          >
            <span>Thử chuông báo</span>
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Thông báo nếu không có đơn nào cần làm */}
      {orders.length === 0 && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shadow-lg">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-lg font-black text-zinc-200">Khu Vực Bếp Đang Trống</h2>
          <p className="text-xs text-zinc-500 max-w-sm">
            Tất cả các món bánh đã hoàn thành hoặc đã giao cho khách. Khi quầy POS tạo đơn mới hoặc đơn đặt bánh, màn hình sẽ tự động cập nhật ngay tức thì.
          </p>
        </div>
      )}

      {/* ── THANH CHUYỂN TAB TRÊN ĐIỆN THOẠI (KDS MOBILE TABS) ── */}
      {orders.length > 0 && (
        <div className="md:hidden mt-2 mb-1 grid grid-cols-4 gap-1 p-1 bg-zinc-900/95 rounded-2xl border border-zinc-800 sticky top-16 z-30 backdrop-blur-md shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setKdsMobileTab('pending');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`py-2 px-1 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-1 transition cursor-pointer relative ${
              kdsMobileTab === 'pending'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/25 ring-2 ring-amber-400'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">🟡 Mới Nhận</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                kdsMobileTab === 'pending'
                  ? 'bg-zinc-950 text-amber-300'
                  : 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
              }`}>
                {pendingOrders.length}
              </span>
            </div>
            {pendingOrders.some((o) => urgentOrders.some((u) => u.id === o.id)) && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute top-1 right-1"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setKdsMobileTab('preparing');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`py-2 px-1 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-1 transition cursor-pointer relative ${
              kdsMobileTab === 'preparing'
                ? 'bg-blue-500 text-zinc-950 shadow-md shadow-blue-500/25 ring-2 ring-blue-400'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">🔵 Đang Làm</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                kdsMobileTab === 'preparing'
                  ? 'bg-zinc-950 text-blue-300'
                  : 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
              }`}>
                {preparingOrders.length}
              </span>
            </div>
            {preparingOrders.some((o) => urgentOrders.some((u) => u.id === o.id)) && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute top-1 right-1"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setKdsMobileTab('ready');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`py-2 px-1 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-1 transition cursor-pointer relative ${
              kdsMobileTab === 'ready'
                ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">🟢 Chờ Ship</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                kdsMobileTab === 'ready'
                  ? 'bg-zinc-950 text-emerald-300'
                  : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
              }`}>
                {readyOrders.length}
              </span>
            </div>
            {readyOrders.some((o) => urgentOrders.some((u) => u.id === o.id)) && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping absolute top-1 right-1"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setKdsMobileTab('all');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className={`py-2 px-1 rounded-xl text-xs font-black flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
              kdsMobileTab === 'all'
                ? 'bg-zinc-100 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <div className="flex items-center gap-1">
              <span className="text-[11px]">📑 Tất Cả</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                kdsMobileTab === 'all'
                  ? 'bg-zinc-950 text-zinc-200'
                  : 'bg-zinc-800 text-zinc-400'
              }`}>
                {orders.length}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Kanban Board 3 Columns */}
      {orders.length > 0 && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-5 mt-4 sm:mt-5">
          {/* ── CỘT 1: ĐƠN MỚI NHẬN (PENDING) ── */}
          <div className={`flex-col bg-zinc-950/80 rounded-3xl border border-zinc-800/80 p-3.5 sm:p-4 ${
            kdsMobileTab === 'pending' || kdsMobileTab === 'all' ? 'flex' : 'hidden md:flex'
          }`}>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
                <h2 className="font-black text-sm uppercase tracking-wider text-amber-400">
                  1. Mới Nhận ({pendingOrders.length})
                </h2>
              </div>
              <span className="text-[11px] text-zinc-500">Chờ nướng / Làm bánh</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {pendingOrders.length === 0 && (
                <div className="py-12 text-center text-zinc-500 text-xs italic bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800/80 p-4">
                  <p className="font-semibold text-zinc-400">Không có đơn nào mới nhận.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">Đơn từ quầy POS hoặc đơn đặt trước sẽ xuất hiện tại đây.</p>
                </div>
              )}
              {sortPreordersByUrgency(pendingOrders, currentTime).map((order) => {
                const isPreorder = order.order_type === 'preorder' || order.order_number?.startsWith('BK-PRE') || !!order.preorder_pickup_at;
                const urgency = getDeliveryUrgency(order.preorder_pickup_at, order.status, currentTime);
                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl p-4 shadow-lg space-y-3 border transition ${
                      urgency.isUrgent
                        ? 'bg-zinc-900 border-2 border-rose-500 ring-2 ring-rose-500/50 shadow-rose-950/40'
                        : isPreorder
                        ? 'bg-zinc-900 border-pink-500/60 shadow-pink-950/20 ring-1 ring-pink-500/30'
                        : 'bg-zinc-900 border-amber-500/30'
                    }`}
                  >
                    {/* Ribbon cảnh báo khẩn cấp (quá hạn hoặc sắp giao) */}
                    {urgency.isUrgent && (
                      <div className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center justify-between shadow-xs ${urgency.badgeColorClass}`}>
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{urgency.badgeText}</span>
                        </span>
                        <span className="text-[9px] uppercase font-black bg-black/30 px-1.5 py-0.5 rounded">ƯU TIÊN 1</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className={`font-mono font-black text-sm ${isPreorder ? 'text-pink-400' : 'text-amber-400'}`}>
                        {order.order_number}
                      </span>
                      {isPreorder ? (
                        <span className="flex items-center gap-1 text-[10px] font-extrabold text-pink-300 bg-pink-950/80 border border-pink-700 px-2 py-0.5 rounded-md">
                          <Cake className="w-3 h-3 text-pink-400" /> BÁNH ĐẶT TRƯỚC
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md">
                          <Clock className="w-3 h-3" /> {getElapsedMinutes(order.created_at)}p trước
                        </span>
                      )}
                    </div>

                    {/* Banner cảnh báo đơn làm lại từ đầu do báo hỏng */}
                    {order.remake_reason && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs font-black flex items-center justify-between shadow-xs">
                        <span className="flex items-center gap-1.5 truncate">
                          <RotateCcw className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="truncate">LÀM LẠI: {order.remake_reason}</span>
                        </span>
                        <span className="text-[9px] uppercase bg-rose-900 px-1.5 py-0.5 rounded font-black text-white shrink-0">BÁO HỎNG</span>
                      </div>
                    )}

                    {/* Thân thẻ tinh gọn: Tên bánh & Kích thước, Thời gian giao, Xem chi tiết */}
                    {(() => {
                      const cakeInfo = getCakeDisplayInfo(order);
                      const fromN = parsePreorderFromNotes(order.notes);
                      const isShip = order.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';

                      return (
                        <div className="space-y-2.5">
                          {/* 1. Tên bánh & Kích thước (Nổi bật, dễ nhìn) */}
                          <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/90 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-black text-sm sm:text-base text-zinc-100 uppercase leading-snug">
                                {cakeInfo.name}
                              </h3>
                              {cakeInfo.quantity > 1 && (
                                <span className="shrink-0 px-2 py-0.5 rounded-lg bg-pink-600 text-white font-black text-xs">
                                  {cakeInfo.quantity}x
                                </span>
                              )}
                            </div>
                            {cakeInfo.size && (
                              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-pink-950/80 border border-pink-700/80 text-pink-300 font-extrabold text-xs">
                                <span>📐 Kích thước:</span>
                                <span className="text-white">{cakeInfo.size}</span>
                              </div>
                            )}
                          </div>

                          {/* 2. Hạn giao & Hình thức & Ghi chữ ngắn gọn */}
                          <div className="p-2.5 rounded-xl bg-pink-950/30 border border-pink-900/50 text-xs space-y-1.5">
                            {order.preorder_pickup_at && (
                              <div className="flex items-center justify-between">
                                <div className="text-pink-300 font-bold flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-pink-400" />
                                  <span>Hạn giao: {formatPickupDateTime(order.preorder_pickup_at)}</span>
                                </div>
                                {!urgency.isUrgent && urgency.formattedRemaining && (
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${urgency.badgeColorClass}`}>
                                    {urgency.formattedRemaining}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center justify-between text-[11px] pt-0.5">
                              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                isShip ? 'bg-blue-900 text-blue-200 border border-blue-700' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                              }`}>
                                {isShip ? '🚚 Ship tận nơi' : '🏪 Lấy tại tiệm'}
                              </span>
                              {order.customer_name && (
                                <span className="text-zinc-300 truncate max-w-[140px]">
                                  Khách: <strong>{order.customer_name}</strong>
                                </span>
                              )}
                            </div>
                            {cakeInfo.cakeMessage && (
                              <div className="text-pink-200 text-[11px] font-semibold pt-1 border-t border-pink-900/40 truncate">
                                ✍️ Chữ: &ldquo;{cakeInfo.cakeMessage}&rdquo;
                              </div>
                            )}
                          </div>

                          {/* 3. Nút Xem chi tiết & In tem & Chuyển bước */}
                          <div className="space-y-2 pt-1">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setOrderDetailModalData(order)}
                                className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-xs"
                                title="Xem đầy đủ ảnh mẫu, chữ ghi bánh, yêu cầu và địa chỉ"
                              >
                                <Eye className="w-3.5 h-3.5 text-amber-400" />
                                <span>Xem chi tiết</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCakeSticker(order)}
                                className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0 active:scale-95 shadow-xs"
                                title="In tem nhãn dán hộp bánh"
                              >
                                <Tag className="w-3.5 h-3.5 text-amber-400" />
                                <span>Tem Hộp</span>
                              </button>
                            </div>

                            <button
                              onClick={() => handleUpdateStatus(order.id, 'pending')}
                              className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer active:scale-95 ${
                                isPreorder
                                  ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/30'
                                  : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                              }`}
                            >
                              <Flame className="w-4 h-4" /> Bắt Đầu Nướng / Trang Trí
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── CỘT 2: ĐANG LÀM / ĐANG NƯỚNG (PREPARING) ── */}
          <div className={`flex-col bg-zinc-950/80 rounded-3xl border border-zinc-800/80 p-3.5 sm:p-4 ${
            kdsMobileTab === 'preparing' || kdsMobileTab === 'all' ? 'flex' : 'hidden md:flex'
          }`}>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></span>
                <h2 className="font-black text-sm uppercase tracking-wider text-blue-400">
                  2. Đang Nướng / Làm Bánh ({preparingOrders.length})
                </h2>
              </div>
              <span className="text-[11px] text-zinc-500">Trong lò / Bắt kem</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {preparingOrders.length === 0 && (
                <div className="py-12 text-center text-zinc-500 text-xs italic bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800/80 p-4">
                  <p className="font-semibold text-zinc-400">Chưa có đơn nào đang làm.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">Nhấn &quot;Bắt Đầu Nướng / Trang Trí&quot; ở mục Mới Nhận để chuyển đơn sang đây.</p>
                </div>
              )}
              {sortPreordersByUrgency(preparingOrders, currentTime).map((order) => {
                const isPreorder = order.order_type === 'preorder' || order.order_number?.startsWith('BK-PRE') || !!order.preorder_pickup_at;
                const urgency = getDeliveryUrgency(order.preorder_pickup_at, order.status, currentTime);
                return (
                  <div
                    key={order.id}
                    className={`bg-zinc-900 rounded-2xl p-4 shadow-lg space-y-3 border transition ${
                      urgency.isUrgent
                        ? 'border-2 border-rose-500 ring-2 ring-rose-500/50 shadow-rose-950/40'
                        : isPreorder
                        ? 'border-pink-500/50'
                        : 'border-blue-500/40'
                    }`}
                  >
                    {/* Ribbon cảnh báo khẩn cấp */}
                    {urgency.isUrgent && (
                      <div className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center justify-between shadow-xs ${urgency.badgeColorClass}`}>
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{urgency.badgeText}</span>
                        </span>
                        <span className="text-[9px] uppercase font-black bg-black/30 px-1.5 py-0.5 rounded">ƯU TIÊN LÀM GẤP</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className={`font-mono font-black text-sm ${isPreorder ? 'text-pink-400' : 'text-blue-400'}`}>
                        {order.order_number}
                      </span>
                      {isPreorder ? (
                        <span className="text-[10px] font-bold text-pink-300 bg-pink-950 px-2 py-0.5 rounded border border-pink-800 flex items-center gap-1">
                          <Cake className="w-3 h-3 text-pink-400" /> Bánh đặt
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                          {getElapsedMinutes(order.created_at)}p
                        </span>
                      )}
                    </div>

                    {isPreorder ? (
                      (() => {
                        const cakeInfo = getCakeDisplayInfo(order);
                        const fromN = parsePreorderFromNotes(order.notes);
                        const isShip = order.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';

                        return (
                          <div className="space-y-2.5">
                            {/* 1. Tên bánh & Kích thước (Nổi bật nhất) */}
                            <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/90 space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-black text-sm sm:text-base text-zinc-100 uppercase leading-snug">
                                  {cakeInfo.name}
                                </h3>
                                {cakeInfo.quantity > 1 && (
                                  <span className="shrink-0 px-2 py-0.5 rounded-lg bg-blue-600 text-white font-black text-xs">
                                    {cakeInfo.quantity}x
                                  </span>
                                )}
                              </div>
                              {cakeInfo.size && (
                                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/80 border border-blue-700/80 text-blue-300 font-extrabold text-xs">
                                  <span>📐 Kích thước:</span>
                                  <span className="text-white">{cakeInfo.size}</span>
                                </div>
                              )}
                            </div>

                            {/* 2. Hạn giao & Hình thức & Ghi chữ ngắn gọn */}
                            <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-900/50 text-xs space-y-1.5">
                              {order.preorder_pickup_at && (
                                <div className="flex items-center justify-between">
                                  <div className="text-blue-300 font-bold flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Hạn giao: {formatPickupDateTime(order.preorder_pickup_at)}</span>
                                  </div>
                                  {!urgency.isUrgent && urgency.formattedRemaining && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${urgency.badgeColorClass}`}>
                                      {urgency.formattedRemaining}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center justify-between text-[11px] pt-0.5">
                                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                  isShip ? 'bg-blue-900 text-blue-200 border border-blue-700' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                }`}>
                                  {isShip ? '🚚 Ship tận nơi' : '🏪 Lấy tại tiệm'}
                                </span>
                                {order.customer_name && (
                                  <span className="text-zinc-300 truncate max-w-[140px]">
                                    Khách: <strong>{order.customer_name}</strong>
                                  </span>
                                )}
                              </div>
                              {cakeInfo.cakeMessage && (
                                <div className="text-blue-200 text-[11px] font-semibold pt-1 border-t border-blue-900/40 truncate">
                                  ✍️ Chữ: &ldquo;{cakeInfo.cakeMessage}&rdquo;
                                </div>
                              )}
                            </div>

                            {/* 3. Nút Xem chi tiết, Tem Hộp, Báo Hỏng, Hoàn Thành Bước 2 */}
                            <div className="space-y-2 pt-1">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setOrderDetailModalData(order)}
                                  className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-xs"
                                  title="Xem chi tiết đầy đủ nội dung đặt bánh"
                                >
                                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Xem chi tiết</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenCakeSticker(order)}
                                  className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0 active:scale-95 shadow-xs"
                                  title="In tem nhãn dán hộp bánh"
                                >
                                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Tem Hộp</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCancelRemakeState({ isOpen: true, order })}
                                  className="py-2 px-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 hover:text-rose-100 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0 active:scale-95 shadow-xs"
                                  title="Bánh hỏng - Hủy để làm lại từ đầu"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                                  <span>Làm Lại</span>
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => setConfirmDoneState({ isOpen: true, order, targetStep: 'ready' })}
                                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md shadow-blue-600/30 cursor-pointer active:scale-95"
                              >
                                <CheckCircle2 className="w-4 h-4" /> Bánh Đã Xong / Sẵn Sàng
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1.5 py-1 border-t border-b border-zinc-800/80">
                          {(order.items || []).map((item, idx) => (
                            <div key={idx} className="text-xs space-y-0.5">
                              <div className="flex justify-between items-start">
                                <span className="font-bold text-zinc-200">
                                  <span className="text-blue-400 font-extrabold mr-1.5">{item.quantity}x</span>
                                  {item.product_name_snapshot}
                                </span>
                              </div>
                              {item.notes && (
                                <div className="text-[11px] text-amber-300 italic bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/50">
                                  {item.notes}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        <div className="space-y-2 pt-1">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenCakeSticker(order)}
                              className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0 active:scale-95"
                              title="In tem nhãn dán hộp bánh"
                            >
                              <Tag className="w-3.5 h-3.5 text-amber-400" /> Tem Hộp
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelRemakeState({ isOpen: true, order })}
                              className="flex-1 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 hover:text-rose-100 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
                              title="Báo hỏng làm lại"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-rose-400" /> Làm Lại
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setConfirmDoneState({ isOpen: true, order, targetStep: 'ready' })}
                            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md shadow-blue-600/30 cursor-pointer active:scale-95"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Bánh Đã Xong / Sẵn Sàng
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── CỘT 3: SẴN SÀNG GIAO (READY) ── */}
          <div className={`flex-col bg-zinc-950/80 rounded-3xl border border-zinc-800/80 p-3.5 sm:p-4 ${
            kdsMobileTab === 'ready' || kdsMobileTab === 'all' ? 'flex' : 'hidden md:flex'
          }`}>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <h2 className="font-black text-sm uppercase tracking-wider text-emerald-400">
                  3. Sẵn Sàng Giao ({readyOrders.length})
                </h2>
              </div>
              <span className="text-[11px] text-zinc-500">Đã đóng hộp tại quầy</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {readyOrders.length === 0 && (
                <div className="py-12 text-center text-zinc-500 text-xs italic bg-zinc-900/30 rounded-2xl border border-dashed border-zinc-800/80 p-4">
                  <p className="font-semibold text-zinc-400">Chưa có đơn nào chờ ship / sẵn sàng.</p>
                  <p className="text-[11px] text-zinc-600 mt-1">Bánh làm xong Bước 2 sẽ chuyển sang đây để bàn giao cho khách hoặc shipper.</p>
                </div>
              )}
              {sortPreordersByUrgency(readyOrders, currentTime).map((order) => {
                const fromN = parsePreorderFromNotes(order.notes);
                const isPreorder = order.order_type === 'preorder' || order.order_number?.startsWith('BK-PRE') || !!order.preorder_pickup_at || fromN.delivery_method !== undefined;
                const isShip = order.delivery_method === 'shipping' || fromN.delivery_method === 'shipping';
                const shipAddr = order.shipping_address || fromN.shipping_address;

                // Tính toán số tiền cần thu chính xác
                const totalAmt = Number(order.total_amount ?? fromN.total_amount ?? 0);
                const depAmt = Number(order.deposit_amount ?? fromN.deposit_amount ?? 0);
                const parsedRem = order.remaining_amount !== undefined 
                  ? Number(order.remaining_amount) 
                  : (fromN.remaining_amount !== undefined ? Number(fromN.remaining_amount) : Math.max(0, totalAmt - depAmt));
                const isPaid100 = order.payment_status === 'paid' || parsedRem <= 0;
                const remAmt = isPaid100 ? 0 : parsedRem;

                const urgency = getDeliveryUrgency(order.preorder_pickup_at, order.status, currentTime);
                const cakeInfo = getCakeDisplayInfo(order);

                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl p-4 shadow-lg space-y-3 border transition ${
                      urgency.isUrgent
                        ? 'bg-zinc-900 border-2 border-rose-500 ring-2 ring-rose-500/50 shadow-rose-950/40'
                        : isPaid100
                        ? 'bg-zinc-900 border border-emerald-500/50 shadow-emerald-950/20'
                        : 'bg-zinc-900 border-2 border-amber-500/60 shadow-amber-950/30'
                    }`}
                  >
                    {/* Ribbon cảnh báo giao gấp */}
                    {urgency.isUrgent && (
                      <div className={`px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center justify-between shadow-xs ${urgency.badgeColorClass}`}>
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{urgency.badgeText}</span>
                        </span>
                        <span className="text-[9px] uppercase font-black bg-black/30 px-1.5 py-0.5 rounded">GIAO GẤP</span>
                      </div>
                    )}

                    {/* Mã đơn & Badge phương thức */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-sm text-emerald-400">
                        {order.order_number}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                        isShip 
                          ? 'bg-blue-950 text-blue-300 border-blue-800' 
                          : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      }`}>
                        {isPreorder ? (isShip ? '🚚 Chờ ship' : '🏪 Khách đến lấy') : 'Chờ giao quầy'}
                      </span>
                    </div>

                    {/* 1. Tên bánh & Kích thước */}
                    {isPreorder ? (
                      <div className="bg-zinc-950/80 p-3 rounded-2xl border border-zinc-800/90 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-black text-sm sm:text-base text-zinc-100 uppercase leading-snug">
                            {cakeInfo.name}
                          </h3>
                          {cakeInfo.quantity > 1 && (
                            <span className="shrink-0 px-2 py-0.5 rounded-lg bg-emerald-600 text-white font-black text-xs">
                              {cakeInfo.quantity}x
                            </span>
                          )}
                        </div>
                        {cakeInfo.size && (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-700/80 text-emerald-300 font-extrabold text-xs">
                            <span>📐 Kích thước:</span>
                            <span className="text-white">{cakeInfo.size}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 py-1 border-t border-b border-zinc-800/80 text-xs">
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} className="font-semibold text-zinc-300">
                            {item.quantity}x {item.product_name_snapshot}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 2. Hạn giao & Địa chỉ / Khách hàng */}
                    <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-xs space-y-1.5">
                      {order.preorder_pickup_at && (
                        <div className="flex items-center justify-between">
                          <div className="text-emerald-300 font-bold flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Hạn giao: {formatPickupDateTime(order.preorder_pickup_at)}</span>
                          </div>
                          {!urgency.isUrgent && urgency.formattedRemaining && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${urgency.badgeColorClass}`}>
                              {urgency.formattedRemaining}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] pt-0.5">
                        <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                          isShip ? 'bg-blue-900 text-blue-200 border border-blue-700' : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                        }`}>
                          {isShip ? '🚚 Ship tận nơi' : '🏪 Lấy tại tiệm'}
                        </span>
                        {order.customer_name && (
                          <span className="text-zinc-300 truncate max-w-[140px]">
                            Khách: <strong>{order.customer_name}</strong>
                          </span>
                        )}
                      </div>
                      {isShip && shipAddr && (
                        <div className="text-[11px] text-blue-300 truncate font-normal pt-0.5">
                          📍 {shipAddr}
                        </div>
                      )}
                    </div>

                    {/* 3. THÔNG TIN SỐ TIỀN CẦN THU (Theo yêu cầu: Đã thanh toán 100% vs Mới chỉ cọc) */}
                    {isPaid100 ? (
                      <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-700/80 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-300 font-black text-xs">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>ĐÃ THANH TOÁN 100%</span>
                        </div>
                        <span className="text-[11px] font-bold text-emerald-400 bg-emerald-900/80 px-2 py-0.5 rounded-md border border-emerald-600/50">
                          Cần thu: 0₫
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-rose-950/80 border-2 border-rose-600/80 shadow-md shadow-rose-950/50 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-rose-200 font-extrabold flex items-center gap-1.5">
                            <Banknote className="w-4 h-4 text-rose-400 animate-pulse" />
                            <span>SỐ TIỀN CẦN THU:</span>
                          </span>
                          <span className="font-black text-white text-base tracking-wide bg-rose-600 px-2.5 py-0.5 rounded-lg shadow-sm">
                            {remAmt.toLocaleString('vi-VN')}₫
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-rose-300/80 pt-0.5 border-t border-rose-900/50">
                          <span>Đã cọc: {depAmt.toLocaleString('vi-VN')}₫</span>
                          <span>Tổng tiền: {totalAmt.toLocaleString('vi-VN')}₫</span>
                        </div>
                      </div>
                    )}

                    {/* 4. Các nút thao tác */}
                    <div className="space-y-2 pt-1">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setOrderDetailModalData(order)}
                          className="flex-1 py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-xs"
                          title="Xem chi tiết nội dung đặt bánh"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-400" />
                          <span>Xem chi tiết</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCakeSticker(order)}
                          className="py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0 active:scale-95 shadow-xs"
                          title="In tem nhãn dán hộp bánh"
                        >
                          <Tag className="w-3.5 h-3.5 text-amber-400" />
                          <span>Tem Hộp</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setCancelRemakeState({ isOpen: true, order })}
                          className="py-2 px-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 hover:text-rose-100 font-bold text-xs flex items-center justify-center gap-1 transition cursor-pointer shrink-0 active:scale-95 shadow-xs"
                          title="Bánh bị hỏng tại quầy - Hủy để làm lại từ đầu"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                          <span>Làm Lại</span>
                        </button>
                      </div>

                      {/* Nút hành động giao hàng: 100% vs Cần thu tiền */}
                      {isPaid100 ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDoneState({ isOpen: true, order, targetStep: 'completed' })}
                          className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-600/30 cursor-pointer active:scale-95"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Hoàn Thành Giao Bánh
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeliveryPaymentModalOrder(order)}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-rose-600/30 cursor-pointer active:scale-95 animate-pulse"
                        >
                          <Banknote className="w-4 h-4" /> Giao Hàng & Thu Tiền ({remAmt.toLocaleString('vi-VN')}₫)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* ── CHẾ ĐỘ 2: LÀM BÁNH BÁN THEO CÔNG THỨC BOM & LÒ NƯỚNG ── */}
      {kitchenMode === 'production' && (
        <div className="mt-4 space-y-6 flex-1 flex flex-col">
          {/* 1. KHU VỰC CÁC MẺ ĐANG NƯỚNG TRONG LÒ */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center justify-center">
                  <Flame className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>🔥 Lò Nướng Bếp Bánh Đang Chạy</span>
                    <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 text-xs font-bold border border-orange-500/30">
                      {ovenBatches.length} mẻ
                    </span>
                  </h2>
                  <p className="text-[11px] text-zinc-400">Đồng hồ đếm ngược từng giây, tự động báo chuông và thông báo khi bánh chín</p>
                </div>
              </div>

              {ovenBatches.length > 0 && (
                <div className="text-xs text-amber-300 font-bold bg-amber-950/60 px-3 py-1.5 rounded-xl border border-amber-800/60 flex items-center gap-1.5 self-start sm:self-auto">
                  <Timer className="w-4 h-4 text-amber-400 animate-spin" />
                  <span>Đang theo dõi tự động</span>
                </div>
              )}
            </div>

            {/* Danh sách các mẻ đang nướng */}
            {ovenBatches.length === 0 ? (
              <div className="py-8 px-4 text-center rounded-2xl bg-zinc-950/50 border border-zinc-800/60 flex flex-col items-center justify-center space-y-2">
                <Flame className="w-8 h-8 text-zinc-600" />
                <p className="text-xs font-bold text-zinc-400">Hiện chưa có mẻ bánh nào trong lò nướng</p>
                <p className="text-[11px] text-zinc-500 max-w-md">
                  Chọn một công thức bánh bên dưới, nhấn "👩‍🍳 Làm Mẻ Bánh Này" rồi bấm "Cho Vào Lò" để kích hoạt đồng hồ đếm ngược và thông báo tự động!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {ovenBatches.map((batch) => {
                  const now = Date.now();
                  const isDone = batch.status === 'done' || now >= batch.ends_at;
                  const secsLeft = Math.max(0, Math.floor((batch.ends_at - now) / 1000));
                  const mins = Math.floor(secsLeft / 60);
                  const secs = secsLeft % 60;
                  const progress = batch.duration_seconds > 0
                    ? Math.min(100, Math.max(0, ((batch.duration_seconds - secsLeft) / batch.duration_seconds) * 100))
                    : 100;

                  return (
                    <div
                      key={batch.id}
                      className={`p-4 rounded-2xl border transition shadow-lg flex flex-col justify-between gap-3 ${
                        isDone
                          ? 'bg-gradient-to-br from-amber-950/90 via-orange-950/80 to-zinc-900 border-amber-400 ring-2 ring-amber-400/50 animate-pulse'
                          : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isDone
                                  ? 'bg-amber-400 text-zinc-950'
                                  : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                              }`}>
                                {isDone ? '🔔 BÁNH ĐÃ CHÍN!' : '🔥 ĐANG NƯỚNG'}
                              </span>
                              <span className="text-[11px] text-zinc-400 font-bold">
                                🌡️ {batch.bake_temp}°C
                              </span>
                            </div>
                            <h3 className="font-black text-sm text-white mt-1">
                              {batch.cake_name}
                            </h3>
                            <div className="text-xs text-amber-300 font-bold">
                              Số lượng: {batch.quantity} {batch.unit}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCancelBakeBatch(batch.id)}
                            className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg hover:bg-zinc-800 transition cursor-pointer"
                            title="Hủy mẻ nướng"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Đồng hồ đếm ngược */}
                        <div className="mt-3 p-3 rounded-xl bg-zinc-900/90 border border-zinc-800/80 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-bold text-zinc-400 block uppercase tracking-wider">
                              {isDone ? 'Trạng thái' : 'Thời gian còn lại'}
                            </span>
                            <span className={`text-2xl font-black tracking-wider ${
                              isDone ? 'text-amber-300' : 'text-orange-400'
                            }`}>
                              {isDone ? '00:00 - XONG' : `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`}
                            </span>
                          </div>

                          <div className="text-right text-[11px] text-zinc-400">
                            <div>Tổng nướng: {Math.round(batch.duration_seconds / 60)}p</div>
                            <div className="text-zinc-500 text-[10px]">{Math.round(progress)}% hoàn tất</div>
                          </div>
                        </div>

                        {/* Thanh tiến độ */}
                        <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden mt-2">
                          <div
                            className={`h-full transition-all duration-1000 ${
                              isDone ? 'bg-amber-400' : 'bg-gradient-to-r from-orange-500 to-amber-400'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Nút thao tác mẻ nướng */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => handleCompleteBakeBatch(batch)}
                          className={`w-full py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md ${
                            isDone
                              ? 'bg-amber-400 hover:bg-amber-300 text-zinc-950 ring-2 ring-amber-300 shadow-amber-500/30 active:scale-95'
                              : 'bg-zinc-800 hover:bg-emerald-700 text-zinc-200 hover:text-white border border-zinc-700'
                          }`}
                        >
                          <Package className="w-4 h-4" />
                          <span>
                            {isDone ? `🥖 Ra Lò & Tự Động Nhập Kho POS (+${batch.quantity} ${batch.unit})` : `Ra lò sớm & Nhập kho (+${batch.quantity})`}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. KHU VỰC CÔNG THỨC BOM & CHỌN LOẠI BÁNH CẦN LÀM */}
          <div className="bg-zinc-900/90 border border-zinc-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                    <span>📖 Công Thức BOM & Kế Hoạch Làm Bánh</span>
                  </h2>
                  <p className="text-[11px] text-zinc-400">
                    {selectedRecipe ? `Đang mở công thức: ${selectedRecipe.name}` : 'Chọn bánh bên dưới để mở công thức và tự động tính khối lượng nguyên liệu'}
                  </p>
                </div>
              </div>

              {/* Chỉ hiện nút Đổi Bánh khi ĐÃ CÓ bánh được chọn */}
              {selectedRecipe && (
                <button
                  type="button"
                  onClick={() => setSelectedRecipe(null)}
                  className="py-1.5 px-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white font-bold text-xs flex items-center gap-1.5 transition active:scale-95 cursor-pointer self-start sm:self-auto border border-zinc-700"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Chọn Bánh Khác</span>
                </button>
              )}
            </div>

            {/* TRƯỜNG HỢP 1: CHƯA CHỌN BÁNH NÀO -> HIỆN TRỰC TIẾP KHÔNG GIAN CHỌN BÁNH KHOA HỌC */}
            {!selectedRecipe ? (
              <div className="space-y-3.5">
                {/* 1. Thanh tìm kiếm & Tabs lọc danh mục */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {/* Ô tìm kiếm */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Tìm nhanh công thức bánh (Croissant, Bông lan, Mousse...)"
                      value={productionSearch}
                      onChange={(e) => setProductionSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    {productionSearch && (
                      <button
                        onClick={() => setProductionSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition cursor-pointer p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Tabs danh mục */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
                    {recipeCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setProductionFilterCat(cat)}
                        className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer text-xs shrink-0 ${
                          productionFilterCat === cat
                            ? 'bg-amber-500 text-zinc-950 font-black shadow-xs'
                            : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Lưới danh sách bánh (Grid 2 cột trên mobile, 3 cột trên tablet/desktop) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {filteredRecipes.map((r) => {
                    const curStock = productsStockMap[r.product_id || ''] ?? productsStockMap[r.name.toLowerCase().trim()] ?? null;
                    const isLowStock = curStock !== null && curStock <= 5;

                    return (
                      <div
                        key={r.id}
                        onClick={() => {
                          setSelectedRecipe(r);
                          setTargetBatchQty(r.yield_qty || 10);
                          setCustomBakeMinutes(r.bake_time_minutes || 25);
                          setCustomBakeTemp(r.bake_temp_celsius || 190);
                        }}
                        className="group bg-zinc-950/90 hover:bg-zinc-900 border border-zinc-800/90 hover:border-amber-500/50 p-3 sm:p-3.5 rounded-2xl transition-all duration-200 cursor-pointer flex flex-col justify-between gap-2.5 active:scale-[0.98] shadow-xs hover:shadow-md"
                      >
                        <div>
                          {/* Header thẻ: Tag phân loại & Tồn quầy POS */}
                          <div className="flex items-center justify-between gap-1.5 mb-1.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 group-hover:bg-amber-500/20 group-hover:text-amber-300 transition">
                              {r.category || 'Bánh bán'}
                            </span>
                            {curStock !== null && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                isLowStock
                                  ? 'bg-rose-950/90 text-rose-300 border border-rose-800/80 animate-pulse'
                                  : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              }`}>
                                {isLowStock ? `⚠️ Quầy còn: ${curStock}` : `Quầy còn: ${curStock}`}
                              </span>
                            )}
                          </div>

                          {/* Tên bánh */}
                          <h4 className="font-black text-sm text-zinc-100 group-hover:text-amber-400 transition leading-snug line-clamp-1">
                            {r.name}
                          </h4>

                          {/* Mô tả ngắn */}
                          {r.description && (
                            <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                              {r.description}
                            </p>
                          )}
                        </div>

                        {/* Footer thẻ: Thông số nướng & Nút bấm */}
                        <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between text-[11px] text-zinc-400">
                          <span title="Thời gian & Nhiệt độ nướng">
                            ⏱️ {r.bake_time_minutes || 25}p • {r.bake_temp_celsius || 190}°C
                          </span>
                          <span className="text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                            Mở BOM ›
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredRecipes.length === 0 && (
                  <div className="text-center py-8 bg-zinc-950/50 rounded-2xl border border-dashed border-zinc-800 text-zinc-500 text-xs">
                    Không tìm thấy công thức bánh nào phù hợp với từ khóa "{productionSearch}"
                  </div>
                )}
              </div>
            ) : (
              /* TRƯỜNG HỢP 2: ĐÃ CHỌN BÁNH -> HIỆN DUY NHẤT CÔNG THỨC & BẢNG TÍNH NGUYÊN LIỆU CHO BÁNH NÀY */
              <div className="space-y-4">
                {/* Header bánh được chọn */}
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                        {selectedRecipe.category}
                      </span>
                      {(() => {
                        const curStock = productsStockMap[selectedRecipe.product_id || ''] ?? productsStockMap[selectedRecipe.name.toLowerCase().trim()] ?? null;
                        if (curStock === null) return null;
                        return (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            curStock <= 5
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            Tồn quầy POS: {curStock} {selectedRecipe.yield_unit}
                          </span>
                        );
                      })()}
                    </div>
                    <h3 className="text-lg sm:text-xl font-black text-white mt-1">
                      {selectedRecipe.name}
                    </h3>
                    {selectedRecipe.description && (
                      <p className="text-xs text-zinc-400 mt-0.5">{selectedRecipe.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsRecipePickerOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Đổi Bánh Khác</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedRecipe(null)}
                      className="p-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
                      title="Đóng công thức"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Nhập số lượng làm mẻ này (NHẬP TỰ DO & NÚT BẤM + / -) */}
                <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                        <Calculator className="w-4 h-4 text-amber-400" />
                        <span>Số lượng bánh muốn làm mẻ này:</span>
                      </label>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        Chuẩn 1 mẻ công thức gốc: <strong className="text-zinc-300">{selectedRecipe.yield_qty} {selectedRecipe.yield_unit}</strong>
                      </div>
                    </div>

                    {/* Ô nhập số lượng tự do kèm nút bấm + / - */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const cur = Number(targetBatchQty) || 1;
                          setTargetBatchQty(Math.max(1, cur - 1));
                        }}
                        className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 hover:text-white flex items-center justify-center font-black transition cursor-pointer border border-zinc-700"
                        title="Giảm 1"
                      >
                        <Minus className="w-4 h-4" />
                      </button>

                      <input
                        type="text"
                        inputMode="numeric"
                        value={targetBatchQty}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d+$/.test(val)) {
                            setTargetBatchQty(val);
                          }
                        }}
                        onBlur={() => {
                          if (!targetBatchQty || Number(targetBatchQty) < 1) {
                            setTargetBatchQty(1);
                          }
                        }}
                        className="w-24 px-3 py-2 rounded-xl bg-zinc-900 border-2 border-amber-500 text-amber-300 font-black text-center text-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                        placeholder="1"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const cur = Number(targetBatchQty) || 0;
                          setTargetBatchQty(cur + 1);
                        }}
                        className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 hover:text-white flex items-center justify-center font-black transition cursor-pointer border border-zinc-700"
                        title="Tăng 1"
                      >
                        <Plus className="w-4 h-4" />
                      </button>

                      <span className="text-sm font-bold text-zinc-300 ml-1">
                        {selectedRecipe.yield_unit}
                      </span>
                    </div>
                  </div>

                  {/* Nút chọn nhanh số lượng: Hỗ trợ cả số lẻ 1, 2, 3, 5, 10, 20... */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-zinc-400 font-semibold mr-1">Chọn nhanh:</span>
                    {[1, 2, 3, 5, 10, 20, selectedRecipe.yield_qty]
                      .filter((v, idx, arr) => arr.indexOf(v) === idx)
                      .sort((a, b) => a - b)
                      .map((qty) => (
                        <button
                          key={qty}
                          type="button"
                          onClick={() => setTargetBatchQty(qty)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            Number(targetBatchQty) === qty
                              ? 'bg-amber-500 text-zinc-950 shadow-sm'
                              : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800 border border-zinc-700/60'
                          }`}
                        >
                          {qty} {selectedRecipe.yield_unit} {qty === selectedRecipe.yield_qty ? '(Chuẩn)' : ''}
                        </button>
                      ))}
                  </div>

                  {/* Hệ số nhân tỉ lệ */}
                  <div className="text-[11px] text-amber-300 bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-900/40 flex items-center justify-between">
                    <span>Tỉ lệ nhân công thức:</span>
                    <span className="font-black text-xs text-amber-200">
                      x{((Math.max(1, Number(targetBatchQty) || 1)) / (selectedRecipe.yield_qty || 1)).toFixed(2)} lần mẻ chuẩn
                    </span>
                  </div>
                </div>

                {/* Bảng tính định lượng nguyên liệu tự động */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-emerald-400" />
                      <span>Khối Lượng Cân Nguyên Liệu ({Math.max(1, Number(targetBatchQty) || 1)} {selectedRecipe.yield_unit})</span>
                    </h3>
                    <span className="text-[11px] text-zinc-500 font-medium">
                      {(selectedRecipe.items || []).length} loại nguyên liệu
                    </span>
                  </div>

                  <div className="border border-zinc-800 rounded-2xl overflow-hidden bg-zinc-950/60">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-zinc-900 text-zinc-400 border-b border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-3 font-bold">Nguyên Liệu</th>
                          <th className="py-2.5 px-3 font-bold text-right">Chuẩn ({selectedRecipe.yield_qty})</th>
                          <th className="py-2.5 px-3 font-black text-right text-amber-300 bg-amber-950/20">
                            Cần Cân ({Math.max(1, Number(targetBatchQty) || 1)})
                          </th>
                          <th className="py-2.5 px-3 font-bold text-center">ĐVT</th>
                          <th className="py-2.5 px-3 font-bold hidden sm:table-cell">Lưu Ý Kỹ Thuật</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {(selectedRecipe.items || []).map((item: any, idx: number) => {
                          const currentQty = Math.max(1, Number(targetBatchQty) || 1);
                          const mult = currentQty / (selectedRecipe.yield_qty || 1);
                          const scaledVal = (item.qty || 0) * mult;
                          let displayVal: string | number;
                          if (scaledVal >= 10 || item.unit === 'g' || item.unit === 'ml') {
                            displayVal = Number.isInteger(scaledVal) ? scaledVal : Number(scaledVal.toFixed(1));
                          } else {
                            displayVal = Number(scaledVal.toFixed(2));
                          }

                          return (
                            <tr key={idx} className="hover:bg-zinc-900/40 transition">
                              <td className="py-2.5 px-3 font-bold text-zinc-200">{item.name}</td>
                              <td className="py-2.5 px-3 text-right text-zinc-400">{item.qty}</td>
                              <td className="py-2.5 px-3 text-right font-black text-amber-300 bg-amber-950/30 text-sm">
                                {displayVal}
                              </td>
                              <td className="py-2.5 px-3 text-center text-zinc-300 font-semibold">{item.unit}</td>
                              <td className="py-2.5 px-3 text-zinc-400 text-[11px] hidden sm:table-cell">{item.note || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Thông số nướng lò */}
                <div className="bg-gradient-to-r from-orange-950/40 via-amber-950/30 to-zinc-950 p-4 rounded-2xl border border-orange-500/30 space-y-3">
                  <div className="text-xs font-black text-orange-300 flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-orange-400" />
                    <span>Thông Số Nướng & Nhiệt Độ Lò Chuẩn</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                        ⏱️ Thời gian nướng (phút):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={customBakeMinutes}
                          onChange={(e) => setCustomBakeMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-bold text-center text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                        <span className="text-xs font-bold text-zinc-400">phút</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-zinc-400 block mb-1">
                        🌡️ Nhiệt độ lò (°C):
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={50}
                          max={300}
                          value={customBakeTemp}
                          onChange={(e) => setCustomBakeTemp(Math.max(50, parseInt(e.target.value) || 150))}
                          className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-white font-bold text-center text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                        <span className="text-xs font-bold text-zinc-400">°C</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-zinc-400">
                    💡 <em>Khi bấm bắt đầu nướng hoặc khi ra lò, hệ thống sẽ tự động phát chuông, đẩy thông báo và gửi tin nhắn Telegram thông báo!</em>
                  </div>
                </div>

                {/* Các nút hành động chính */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleStartBaking(selectedRecipe)}
                    className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-orange-600/30 cursor-pointer transition active:scale-95"
                  >
                    <Flame className="w-4 h-4" />
                    <span>🔥 Cho Vào Lò & Bắt Đầu Nướng ({customBakeMinutes} phút)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDirectProduceAndDeposit(selectedRecipe, Math.max(1, Number(targetBatchQty) || 1))}
                    className="py-3 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-emerald-700/20 active:scale-95"
                    title="Bánh không cần nướng hoặc đã có sẵn, nhập trực tiếp vào quầy bán POS"
                  >
                    <Package className="w-4 h-4" />
                    <span>Ra Lò / Nhập Kho Ngay (+{Math.max(1, Number(targetBatchQty) || 1)})</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: CHỌN LOẠI BÁNH CẦN LÀM THEO CÔNG THỨC BOM ── */}
      {isRecipePickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    Chọn Loại Bánh Cần Làm
                  </h2>
                  <p className="text-[11px] text-zinc-400">Chọn bánh để mở bảng tính định lượng nguyên liệu chuẩn</p>
                </div>
              </div>
              <button
                onClick={() => setIsRecipePickerOpen(false)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ô tìm kiếm & Tabs lọc */}
            <div className="space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Tìm bánh theo tên..."
                  value={productionSearch}
                  onChange={(e) => setProductionSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {recipeCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setProductionFilterCat(cat)}
                    className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap transition cursor-pointer text-xs ${
                      productionFilterCat === cat
                        ? 'bg-amber-500 text-zinc-950 font-black'
                        : 'bg-zinc-950 text-zinc-400 hover:text-white border border-zinc-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Danh sách các loại bánh để chọn */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[55vh]">
              {filteredRecipes.map((recipe) => {
                const curStock = productsStockMap[recipe.product_id || ''] ?? productsStockMap[recipe.name.toLowerCase().trim()] ?? null;
                const isCurrent = selectedRecipe?.id === recipe.id;

                return (
                  <div
                    key={recipe.id}
                    onClick={() => {
                      setSelectedRecipe(recipe);
                      setTargetBatchQty(recipe.yield_qty || 10);
                      setCustomBakeMinutes(recipe.bake_time_minutes || 25);
                      setCustomBakeTemp(recipe.bake_temp_celsius || 190);
                      setIsRecipePickerOpen(false);
                    }}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                      isCurrent
                        ? 'bg-amber-950/40 border-amber-500/80 ring-1 ring-amber-500/40'
                        : 'bg-zinc-950 hover:bg-zinc-800/80 border-zinc-800 hover:border-amber-500/40'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {recipe.category}
                        </span>
                        {curStock !== null && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            curStock <= 5
                              ? 'bg-rose-950/80 text-rose-300 border border-rose-800'
                              : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                          }`}>
                            Tồn quầy: {curStock} {recipe.yield_unit}
                          </span>
                        )}
                      </div>
                      <h4 className="font-black text-sm text-white truncate">
                        {recipe.name}
                      </h4>
                      <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-3">
                        <span>Mẻ chuẩn: <strong className="text-zinc-300">{recipe.yield_qty} {recipe.yield_unit}</strong></span>
                        <span>⏱️ {recipe.bake_time_minutes}p</span>
                        <span>🌡️ {recipe.bake_temp_celsius}°C</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black text-xs shrink-0 transition"
                    >
                      {isCurrent ? 'Đang chọn' : 'Chọn Bánh Này'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}


      {/* ── LIGHTBOX: XEM ẢNH MẪU BÁNH CHO BẾP (HD) ── */}
      {referenceImageLightbox && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setReferenceImageLightbox(null)}
        >
          <div className="relative max-w-2xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex items-center justify-between pb-3 mb-2 text-white border-b border-zinc-700">
              <span className="font-black text-sm flex items-center gap-2 text-pink-300">
                <Camera className="w-4 h-4 text-pink-400" /> Ảnh mẫu bánh khách yêu cầu làm theo (HD)
              </span>
              <button
                onClick={() => setReferenceImageLightbox(null)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center cursor-pointer transition text-sm"
              >
                ✕
              </button>
            </div>
            <div className="w-full overflow-auto max-h-[80vh] flex items-center justify-center bg-zinc-950 rounded-2xl p-1 border border-zinc-700 shadow-2xl">
              <img
                src={referenceImageLightbox}
                alt="Ảnh mẫu bánh chi tiết HD"
                className="max-w-full max-h-[78vh] w-auto h-auto object-contain rounded-xl"
              />
            </div>
            <div className="text-center mt-2.5 text-zinc-400 text-xs font-semibold">
              🔍 Thợ làm bánh quan sát chi tiết màu sắc, tạo hình và phụ kiện trên ảnh mẫu này — Bấm ngoài để đóng
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CÀI ĐẶT BOT TELEGRAM & XEM LỊCH SỬ THÔNG BÁO BẾP ── */}
      <NotificationSettingsModal
        isOpen={isNotifSettingsOpen}
        defaultTab={notifModalTab}
        onClose={() => setIsNotifSettingsOpen(false)}
      />

      {/* ── MODAL XÁC NHẬN HOÀN THÀNH BÁNH / GIAO XONG (TRÁNH ẤN NHẦM) ── */}
      <ConfirmDoneModal
        isOpen={confirmDoneState.isOpen}
        onClose={() => setConfirmDoneState((prev) => ({ ...prev, isOpen: false }))}
        order={confirmDoneState.order}
        targetStep={confirmDoneState.targetStep}
        onConfirm={() => {
          if (confirmDoneState.order) {
            handleUpdateStatus(confirmDoneState.order.id, confirmDoneState.order.status);
          }
        }}
      />

      {/* ── MODAL HỦY BÁNH HỎNG & LÀM LẠI TỪ ĐẦU ── */}
      <CancelRemakeModal
        isOpen={cancelRemakeState.isOpen}
        onClose={() => setCancelRemakeState((prev) => ({ ...prev, isOpen: false }))}
        order={cancelRemakeState.order}
        onConfirm={(reason, notes, logSpoilage) => {
          if (cancelRemakeState.order) {
            handleCancelAndRemakeOrder(cancelRemakeState.order, reason, notes, logSpoilage);
          }
        }}
      />

      {/* ── MODAL XEM CHI TIẾT ĐƠN ĐẶT BÁNH ── */}
      <OrderDetailModal
        isOpen={!!orderDetailModalData}
        onClose={() => setOrderDetailModalData(null)}
        order={orderDetailModalData}
        onPrintSticker={(order) => {
          handleOpenCakeSticker(order);
        }}
        onOpenLightbox={(url) => setReferenceImageLightbox(url)}
      />

      {/* ── MODAL THANH TOÁN THU TIỀN KHI GIAO HÀNG (BƯỚC 3) ── */}
      <DeliveryPaymentModal
        isOpen={!!deliveryPaymentModalOrder}
        onClose={() => setDeliveryPaymentModalOrder(null)}
        order={deliveryPaymentModalOrder}
        vietqrConfig={vietqrConfig}
        onConfirmPaymentAndComplete={(order, method) => {
          handleConfirmPaymentAndComplete(order, method);
          setDeliveryPaymentModalOrder(null);
        }}
      />

      {/* ── MODAL IN TEM DÁN HỘP BÁNH (THERMAL BARCODE STICKER 50x30 / 50x40 - LUÔN HIỆN TRÊN CÙNG) ── */}
      <CakeStickerModal
        isOpen={isStickerModalOpen}
        onClose={() => setIsStickerModalOpen(false)}
        data={stickerModalData}
      />

    </div>
  );
}
