'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { 
  broadcastOrderStatusUpdate, 
  broadcastClearDemoOrders, 
  subscribeCrossDeviceSync, 
  syncOrderToSupabase 
} from '@/lib/supabase/realtimeSync';
import { 
  ChefHat, Clock, CheckCircle2, ArrowRight, Flame, Sparkles, 
  Cake, AlertCircle, MessageSquare, RefreshCw, Trash2, Check,
  ShoppingBag, Phone, User
} from 'lucide-react';

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
  notes?: string;
  customer_name?: string;
  customer_phone?: string;
  cake_message?: string;
  total_amount?: number;
  deposit_amount?: number;
  remaining_amount?: number;
  items: OrderItem[];
}

const INITIAL_DEMO_ORDERS: KDSOrder[] = [
  {
    id: 'kds-demo-1',
    order_number: 'BK-PRE-20260908-01',
    order_type: 'preorder',
    status: 'pending',
    created_at: new Date().toISOString(),
    preorder_pickup_at: '17:30 ngày mai (08/09)',
    customer_name: 'Chị Lan Anh',
    customer_phone: '0912 345 678',
    cake_message: 'Mừng Sinh Nhật Bé Bắp 3 tuổi',
    notes: 'Ít ngọt, trang trí vương miện tone hồng ấm, nến số 3',
    items: [
      {
        id: 'item-demo-1',
        product_name_snapshot: 'Bánh Bông Lan Trứng Muối (Size 18cm)',
        quantity: 1,
        notes: 'Chữ: "Mừng Sinh Nhật Bé Bắp 3 tuổi" | Nến số 3',
      },
    ],
  },
  {
    id: 'kds-demo-2',
    order_number: 'BK-20260907-002',
    order_type: 'takeaway',
    status: 'preparing',
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    items: [
      { id: 'item-demo-2', product_name_snapshot: 'Bánh Croissant Bơ Pháp', quantity: 2 },
      { id: 'item-demo-3', product_name_snapshot: 'Bánh Mì Bơ Tỏi Phô Mai', quantity: 1, notes: 'Nướng vàng giòn, cắt đôi' },
    ],
  },
];

export default function KitchenPage() {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

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
                .map((o: any) => ({
                  id: String(o.id || o.local_id || o.order_number || Math.random()),
                  order_number: String(o.order_number || o.orderNumber || 'BK-XXX'),
                  order_type: o.order_type || (o.pickupDateTime ? 'preorder' : 'takeaway'),
                  status: o.status || 'pending',
                  created_at: o.created_at || new Date().toISOString(),
                  preorder_pickup_at: o.preorder_pickup_at || o.pickupDateTime || '',
                  customer_name: o.customer_name || o.customerName || '',
                  customer_phone: o.customer_phone || o.customerPhone || '',
                  cake_message: o.cake_message || o.cakeMessage || '',
                  notes: o.notes || '',
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
                }));
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
              const merged: KDSOrder = {
                id: String(so.id || existing?.id || so.order_number),
                order_number: String(so.order_number || existing?.order_number || 'BK-XXX'),
                order_type: so.order_type || existing?.order_type || 'takeaway',
                status: so.status || existing?.status || 'pending',
                created_at: so.created_at || existing?.created_at || new Date().toISOString(),
                preorder_pickup_at: so.preorder_pickup_at || existing?.preorder_pickup_at || '',
                notes: so.notes || existing?.notes || '',
                customer_name: so.customer_name || existing?.customer_name || '',
                customer_phone: so.customer_phone || existing?.customer_phone || '',
                cake_message: so.cake_message || existing?.cake_message || '',
                items: Array.isArray(so.order_items) && so.order_items.length > 0
                  ? so.order_items
                      .filter((it: any) => it && typeof it === 'object')
                      .map((it: any) => ({
                        id: String(it.id || Math.random()),
                        product_name_snapshot: it.product_name_snapshot || 'Bánh',
                        quantity: Number(it.quantity) || 1,
                        notes: it.notes || '',
                      }))
                  : (existing?.items || []),
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
            return list.map((o) =>
              (o && (o.order_number === payload.order_number || o.id === payload.order_number))
                ? { ...o, status: payload.status }
                : o
            );
          }
          if (payload.order_data) {
            const od = payload.order_data;
            return [
              ...list,
              {
                id: String(od.id || payload.order_number),
                order_number: String(od.order_number || payload.order_number),
                order_type: od.order_type || 'takeaway',
                status: payload.status,
                created_at: od.created_at || new Date().toISOString(),
                preorder_pickup_at: od.preorder_pickup_at || '',
                notes: od.notes || '',
                customer_name: od.customer_name || '',
                customer_phone: od.customer_phone || '',
                cake_message: od.cake_message || '',
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
                const updated = parsed.map((o: any) =>
                  (o.order_number === payload.order_number || o.id === payload.order_number)
                    ? { ...o, status: payload.status, updated_at: payload.updated_at }
                    : o
                );
                localStorage.setItem('bakery_orders', JSON.stringify(updated));
              }
            }
          } catch {}
        }
      },
      onNewOrder: () => {
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
      onDbChange: () => {
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
                return { ...o, status: nextStatus, updated_at: new Date().toISOString() };
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
  };

  // Nút xóa sạch đơn mẫu thử nghiệm
  const handleClearDemoOrders = () => {
    if (confirm('Bạn có chắc muốn xóa 2 đơn mẫu thử nghiệm? Bảng bếp sẽ trở về trạng thái sạch để đón nhận các đơn thực tế từ quầy bán hàng.')) {
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
          <div className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center gap-2">
            <span>Tổng đơn cần làm:</span>
            <span className="font-black text-orange-400 text-sm">{(orders || []).length}</span>
          </div>

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

      {/* Kanban Board 3 Columns */}
      {orders.length > 0 && (
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
          {/* ── CỘT 1: ĐƠN MỚI NHẬN (PENDING) ── */}
          <div className="flex flex-col bg-zinc-950/80 rounded-3xl border border-zinc-800/80 p-4">
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
              {pendingOrders.map((order) => {
                const isPreorder = order.order_type === 'preorder';
                return (
                  <div
                    key={order.id}
                    className={`rounded-2xl p-4 shadow-lg space-y-3 border transition ${
                      isPreorder
                        ? 'bg-zinc-900 border-pink-500/60 shadow-pink-950/20 ring-1 ring-pink-500/30'
                        : 'bg-zinc-900 border-amber-500/30'
                    }`}
                  >
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

                    {/* Preorder Schedule Banner */}
                    {isPreorder && (
                      <div className="p-2.5 bg-pink-950/50 rounded-xl border border-pink-800/80 text-xs space-y-1">
                        {order.preorder_pickup_at && (
                          <div className="text-pink-300 font-bold flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-pink-400" />
                            Hạn giao: {order.preorder_pickup_at}
                          </div>
                        )}
                        {order.customer_name && (
                          <div className="text-zinc-300 text-[11px] flex items-center gap-1">
                            <User className="w-3 h-3 text-zinc-400" />
                            <span>{order.customer_name} {order.customer_phone ? `(${order.customer_phone})` : ''}</span>
                          </div>
                        )}
                        {order.cake_message && (
                          <div className="text-pink-200 text-[11px] pt-1 border-t border-pink-900/60 font-semibold">
                            ✍️ Chữ: "{order.cake_message}"
                          </div>
                        )}
                        {order.notes && (
                          <div className="text-zinc-300 text-[11px] pt-1 border-t border-pink-900/60">
                            Yêu cầu: {order.notes}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Items list */}
                    <div className="space-y-1.5 py-1 border-t border-b border-zinc-800/80">
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} className="text-xs space-y-0.5">
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-zinc-200">
                              <span className={`${isPreorder ? 'text-pink-400' : 'text-amber-400'} font-extrabold mr-1.5`}>
                                {item.quantity}x
                              </span>
                              {item.product_name_snapshot}
                            </span>
                          </div>
                          {item.notes && (
                            <div className="text-[11px] text-pink-300 italic bg-pink-950/40 px-2 py-1 rounded border border-pink-900/50 flex items-start gap-1">
                              <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 text-pink-400" />
                              <span>{item.notes}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleUpdateStatus(order.id, 'pending')}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md cursor-pointer ${
                        isPreorder
                          ? 'bg-pink-600 hover:bg-pink-500 text-white shadow-pink-600/30'
                          : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                      }`}
                    >
                      <Flame className="w-4 h-4" /> Bắt Đầu Nướng / Trang Trí
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── CỘT 2: ĐANG LÀM / ĐANG NƯỚNG (PREPARING) ── */}
          <div className="flex flex-col bg-zinc-950/80 rounded-3xl border border-zinc-800/80 p-4">
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
              {preparingOrders.map((order) => {
                const isPreorder = order.order_type === 'preorder';
                return (
                  <div
                    key={order.id}
                    className={`bg-zinc-900 rounded-2xl p-4 shadow-lg space-y-3 border ${
                      isPreorder ? 'border-pink-500/50' : 'border-blue-500/40'
                    }`}
                  >
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

                    {isPreorder && order.preorder_pickup_at && (
                      <div className="text-[11px] text-pink-300 font-semibold bg-pink-950/40 p-2 rounded-xl border border-pink-900/40">
                        ⏰ Hạn giao: {order.preorder_pickup_at}
                      </div>
                    )}

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

                    <button
                      onClick={() => handleUpdateStatus(order.id, 'preparing')}
                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md shadow-blue-600/30 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Bánh Đã Chín / Trang Trí Xong
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── CỘT 3: SẴN SÀNG GIAO (READY) ── */}
          <div className="flex flex-col bg-zinc-950/80 rounded-3xl border border-zinc-800/80 p-4">
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
              {readyOrders.map((order) => {
                const isPreorder = order.order_type === 'preorder';
                return (
                  <div
                    key={order.id}
                    className="bg-zinc-900 border border-emerald-500/40 rounded-2xl p-4 shadow-lg space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-sm text-emerald-400">
                        {order.order_number}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {isPreorder ? 'Chờ khách nhận bánh' : 'Chờ giao tại quầy'}
                      </span>
                    </div>

                    {isPreorder && (
                      <div className="text-[11px] text-emerald-300 bg-emerald-950/40 p-2 rounded-xl border border-emerald-900/40 space-y-0.5">
                        {order.customer_name && (
                          <div className="font-bold">Khách: {order.customer_name} {order.customer_phone}</div>
                        )}
                        {order.preorder_pickup_at && (
                          <div>Giờ hẹn: {order.preorder_pickup_at}</div>
                        )}
                      </div>
                    )}

                    <div className="space-y-1 py-1 border-t border-b border-zinc-800/80 text-xs">
                      {(order.items || []).map((item, idx) => (
                        <div key={idx} className="font-semibold text-zinc-300">
                          {item.quantity}x {item.product_name_snapshot}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleUpdateStatus(order.id, 'ready')}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md shadow-emerald-600/30 cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4" /> Đã Giao Cho Khách
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
