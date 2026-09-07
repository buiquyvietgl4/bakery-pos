'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { ChefHat, Clock, CheckCircle2, ArrowRight, Flame, Sparkles, Cake, AlertCircle, MessageSquare } from 'lucide-react';

interface OrderItem {
  id: string;
  product_name_snapshot: string;
  quantity: number;
  notes?: string;
}

interface KDSOrder {
  id: string;
  order_number: string;
  order_type: 'dine_in' | 'takeaway' | 'preorder';
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  created_at: string;
  preorder_pickup_at?: string;
  notes?: string;
  items: OrderItem[];
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<KDSOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // 1. Fetch active orders
  const loadOrders = async () => {
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
          order_items (
            id,
            product_name_snapshot,
            quantity,
            notes
          )
        `)
        .in('status', ['pending', 'preparing', 'ready'])
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        const formatted: KDSOrder[] = data.map((o: any) => ({
          id: o.id,
          order_number: o.order_number || 'BK-XXX',
          order_type: o.order_type,
          status: o.status,
          created_at: o.created_at,
          preorder_pickup_at: o.preorder_pickup_at,
          notes: o.notes,
          items: o.order_items || [],
        }));
        setOrders(formatted);
      } else {
        // Fallback demo orders including custom birthday cake
        setOrders([
          {
            id: 'kds-demo-1',
            order_number: 'BK-PRE-20260908-01',
            order_type: 'preorder',
            status: 'pending',
            created_at: new Date().toISOString(),
            preorder_pickup_at: '17:30 ngày mai (08/09)',
            notes: 'Mừng Sinh Nhật Bé Bắp 3 tuổi | Ít ngọt, trang trí vương miện, nến số 3',
            items: [
              {
                id: '1',
                product_name_snapshot: 'Bánh Bông Lan Trứng Muối (Size 18cm)',
                quantity: 1,
                notes: 'Chữ: "Mừng Sinh Nhật Bé Bắp 3 tuổi"',
              },
            ],
          },
          {
            id: 'kds-demo-2',
            order_number: 'BK-20260907-002',
            order_type: 'takeaway',
            status: 'preparing',
            created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            items: [
              { id: '2', product_name_snapshot: 'Bánh Croissant Bơ Pháp', quantity: 2 },
              { id: '3', product_name_snapshot: 'Bánh Mì Bơ Tỏi Phô Mai', quantity: 1, notes: 'Nướng vàng giòn' },
            ],
          },
        ]);
      }
    } catch (err) {
      console.error('Lỗi tải đơn KDS:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel('kds-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          loadOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUpdateStatus = async (orderId: string, currentStatus: string) => {
    let nextStatus: 'preparing' | 'ready' | 'completed' = 'preparing';
    if (currentStatus === 'pending') nextStatus = 'preparing';
    else if (currentStatus === 'preparing') nextStatus = 'ready';
    else if (currentStatus === 'ready') nextStatus = 'completed';

    setOrders((prev) =>
      prev
        .map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
        .filter((o) => o.status !== 'completed')
    );

    await supabase.from('orders').update({ status: nextStatus }).eq('id', orderId);
  };

  const pendingOrders = orders.filter((o) => o.status === 'pending');
  const preparingOrders = orders.filter((o) => o.status === 'preparing');
  const readyOrders = orders.filter((o) => o.status === 'ready');

  const getElapsedMinutes = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60)));
  };

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 bg-zinc-900 text-zinc-100 min-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center justify-center">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
              Màn Hình Bếp KDS <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">Realtime</span>
            </h1>
            <p className="text-xs text-zinc-400">Tự động nhận đơn bán tại quầy và các đơn đặt bánh sinh nhật</p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700">
            Tổng đơn cần làm: <span className="font-bold text-orange-400">{orders.length}</span>
          </div>
        </div>
      </div>

      {/* Kanban Board 3 Columns */}
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
            <span className="text-[11px] text-zinc-500">Chờ làm</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3">
            {pendingOrders.map((order) => {
              const isPreorder = order.order_type === 'preorder';
              return (
                <div
                  key={order.id}
                  className={`rounded-2xl p-4 shadow-lg space-y-3 border ${
                    isPreorder
                      ? 'bg-zinc-900 border-pink-500/60 shadow-pink-950/20'
                      : 'bg-zinc-900 border-amber-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono font-black text-sm ${isPreorder ? 'text-pink-400' : 'text-amber-400'}`}>
                      {order.order_number}
                    </span>
                    {isPreorder ? (
                      <span className="flex items-center gap-1 text-[10px] font-extrabold text-pink-300 bg-pink-950/80 border border-pink-700 px-2 py-0.5 rounded-md">
                        <Cake className="w-3 h-3" /> BÁNH ĐẶT TRƯỚC
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md">
                        <Clock className="w-3 h-3" /> {getElapsedMinutes(order.created_at)}p trước
                      </span>
                    )}
                  </div>

                  {/* Preorder Schedule Banner */}
                  {order.preorder_pickup_at && (
                    <div className="p-2.5 bg-pink-950/50 rounded-xl border border-pink-800/80 text-xs space-y-1">
                      <div className="text-pink-300 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-pink-400" />
                        Hạn giao bánh: {order.preorder_pickup_at}
                      </div>
                      {order.notes && (
                        <div className="text-zinc-300 text-[11px] pt-1 border-t border-pink-900/60">
                          {order.notes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items list */}
                  <div className="space-y-1.5 py-1 border-t border-b border-zinc-800/80">
                    {order.items.map((item, idx) => (
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
                    className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md ${
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
            {preparingOrders.map((order) => (
              <div
                key={order.id}
                className="bg-zinc-900 border border-blue-500/40 rounded-2xl p-4 shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-sm text-blue-400">
                    {order.order_number}
                  </span>
                  {order.order_type === 'preorder' && (
                    <span className="text-[10px] font-bold text-pink-300 bg-pink-950 px-2 py-0.5 rounded border border-pink-800">
                      Bánh đặt
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 py-1 border-t border-b border-zinc-800/80">
                  {order.items.map((item, idx) => (
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
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md shadow-blue-600/30"
                >
                  <CheckCircle2 className="w-4 h-4" /> Bánh Đã Chín / Trang Trí Xong
                </button>
              </div>
            ))}
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
            {readyOrders.map((order) => (
              <div
                key={order.id}
                className="bg-zinc-900 border border-emerald-500/40 rounded-2xl p-4 shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-sm text-emerald-400">
                    {order.order_number}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    Chờ khách nhận
                  </span>
                </div>

                <div className="space-y-1 py-1 border-t border-b border-zinc-800/80 text-xs">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="font-semibold text-zinc-300">
                      {item.quantity}x {item.product_name_snapshot}
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleUpdateStatus(order.id, 'ready')}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-md shadow-emerald-600/30"
                >
                  <ArrowRight className="w-4 h-4" /> Đã Giao Cho Khách
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
