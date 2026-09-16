import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { cleanCakeNameAndSize, splitRespectingParentheses } from '@/lib/utils/customCakeCosting';

export interface SyncOrderPayload {
  order_number: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  updated_at: string;
  order_data?: any;
}

type StatusCallback = (payload: SyncOrderPayload) => void;
type NewOrderCallback = (order: any) => void;
type ClearDemoCallback = () => void;
type DbChangeCallback = () => void;
export type ProductChangePayload = {
  action: 'create' | 'update' | 'delete';
  product: any;
};
export type RecipeChangePayload = {
  action: 'create' | 'update' | 'delete';
  recipe?: any;
  id?: string;
};
type ProductChangeCallback = (payload: ProductChangePayload) => void;
type RecipeChangeCallback = (payload: RecipeChangePayload) => void;
type TelegramConfigCallback = (config: any) => void;
type StoreBrandingCallback = (branding: any) => void;
type VietqrConfigCallback = (config: any) => void;
type EwalletConfigCallback = (config: any) => void;

export interface BakeApprovalPayload {
  order_number: string;
  cake_name: string;
  need_bake_qty: number;
  requested_by?: string;
  requested_at?: string;
  order_data?: any;
}

export interface BakeApprovalResolvedPayload {
  order_number: string;
  action: 'approved' | 'rejected';
  resolved_by?: string;
  resolved_at?: string;
  order_data?: any;
}

type BakeApprovalCallback = (payload: BakeApprovalPayload) => void;
type BakeApprovalResolvedCallback = (payload: BakeApprovalResolvedPayload) => void;

const statusListeners = new Set<StatusCallback>();
const newOrderListeners = new Set<NewOrderCallback>();
const clearDemoListeners = new Set<ClearDemoCallback>();
const dbChangeListeners = new Set<DbChangeCallback>();
const productListeners = new Set<ProductChangeCallback>();
const recipeListeners = new Set<RecipeChangeCallback>();
const telegramConfigListeners = new Set<TelegramConfigCallback>();
const storeBrandingListeners = new Set<StoreBrandingCallback>();
const vietqrConfigListeners = new Set<VietqrConfigCallback>();
const ewalletConfigListeners = new Set<EwalletConfigCallback>();
const bakeApprovalListeners = new Set<BakeApprovalCallback>();
const bakeApprovalResolvedListeners = new Set<BakeApprovalResolvedCallback>();

const recentlyNotifiedOrders = new Map<string, number>();

function notifyNewOrderToListeners(order: any) {
  if (!order) return;
  const orderNum = order.order_number || order.orderNumber;
  if (orderNum) {
    const last = recentlyNotifiedOrders.get(orderNum) || 0;
    // Chống kêu chuông lặp 2 lần nếu cả Broadcast và Database Changes cùng báo về trong 4 giây
    if (Date.now() - last < 4000) return;
    recentlyNotifiedOrders.set(orderNum, Date.now());
  }

  newOrderListeners.forEach((cb) => {
    try {
      cb(order);
    } catch (e) {
      console.warn('Lỗi newOrderListener:', e);
    }
  });
}

let syncChannelInstance: any = null;

/**
 * Khởi tạo hoặc kết nối lại kênh Realtime singleton
 */
export function reconnectSyncChannel(force = false) {
  if (syncChannelInstance) {
    if (force || syncChannelInstance.state === 'closed' || syncChannelInstance.state === 'errored') {
      try {
        supabase.removeChannel(syncChannelInstance);
      } catch {}
      syncChannelInstance = null;
      return ensureSyncChannel();
    }
    return syncChannelInstance;
  }
  return ensureSyncChannel();
}

/**
 * Khởi tạo kênh Realtime singleton duy nhất cho toàn hệ thống.
 * Đính kèm TẤT CẢ các bộ lắng nghe (broadcast & postgres_changes) TRƯỚC KHI gọi subscribe()
 * để ngăn chặn hoàn toàn lỗi: "cannot add postgres_changes callbacks after channel has subscribed"
 */
function ensureSyncChannel() {
  if (syncChannelInstance && syncChannelInstance.state !== 'closed' && syncChannelInstance.state !== 'errored') {
    return syncChannelInstance;
  }

  try {
    syncChannelInstance = supabase.channel('bakery_cross_device_sync', {
      config: {
        broadcast: {
          self: false,
        },
      },
    });

    syncChannelInstance
      .on('broadcast', { event: 'kds_status_update' }, ({ payload }: any) => {
        statusListeners.forEach((cb) => {
          try {
            cb(payload);
          } catch (e) {
            console.warn('Lỗi statusListener:', e);
          }
        });
      })
      .on('broadcast', { event: 'pos_order_created' }, ({ payload }: any) => {
        if (payload?.order) {
          notifyNewOrderToListeners(payload.order);
        }
      })
      .on('broadcast', { event: 'kds_clear_demo' }, () => {
        clearDemoListeners.forEach((cb) => {
          try {
            cb();
          } catch (e) {
            console.warn('Lỗi clearDemoListener:', e);
          }
        });
      })
      .on('broadcast', { event: 'product_changed' }, ({ payload }: any) => {
        productListeners.forEach((cb) => {
          try {
            cb(payload);
          } catch (e) {
            console.warn('Lỗi productListener:', e);
          }
        });
      })
      .on('broadcast', { event: 'telegram_config_updated' }, ({ payload }: any) => {
        if (payload?.config) {
          telegramConfigListeners.forEach((cb) => {
            try {
              cb(payload.config);
            } catch (e) {
              console.warn('Lỗi telegramConfigListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'store_branding_updated' }, ({ payload }: any) => {
        if (payload?.branding) {
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('bakery_store_branding', JSON.stringify(payload.branding));
              window.dispatchEvent(new CustomEvent('bakery_branding_updated', { detail: payload.branding }));
            } catch {}
          }
          storeBrandingListeners.forEach((cb) => {
            try {
              cb(payload.branding);
            } catch (e) {
              console.warn('Lỗi storeBrandingListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'vietqr_config_updated' }, ({ payload }: any) => {
        if (payload?.config) {
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('bakery_vietqr_config', JSON.stringify(payload.config));
              window.dispatchEvent(new CustomEvent('bakery_vietqr_updated', { detail: payload.config }));
            } catch {}
          }
          vietqrConfigListeners.forEach((cb) => {
            try {
              cb(payload.config);
            } catch (e) {
              console.warn('Lỗi vietqrConfigListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'ewallet_config_updated' }, ({ payload }: any) => {
        if (payload?.config) {
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('bakery_ewallet_config', JSON.stringify(payload.config));
              window.dispatchEvent(new CustomEvent('bakery_ewallet_updated', { detail: payload.config }));
            } catch {}
          }
          ewalletConfigListeners.forEach((cb) => {
            try {
              cb(payload.config);
            } catch (e) {
              console.warn('Lỗi ewalletConfigListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'recipe_updated' }, ({ payload }: any) => {
        if (payload) {
          recipeListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi recipeListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'bake_approval_requested' }, ({ payload }: any) => {
        if (payload) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bake_approval_requested', { detail: payload }));
          }
          bakeApprovalListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi bakeApprovalListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'bake_approval_resolved' }, ({ payload }: any) => {
        if (payload) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bake_approval_resolved', { detail: payload }));
          }
          bakeApprovalResolvedListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi bakeApprovalResolvedListener:', e);
            }
          });
        }
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload: any) => {
          // 1. Kích hoạt toàn bộ bộ lắng nghe CSDL (Kitchen loadOrders, POS reloadOrdersData)
          dbChangeListeners.forEach((cb) => {
            try {
              cb();
            } catch (e) {
              console.warn('Lỗi dbChangeListener:', e);
            }
          });

          // 2. Nếu có đơn hàng mới vừa được INSERT lên CSDL Supabase
          if (payload?.eventType === 'INSERT' && payload?.new) {
            notifyNewOrderToListeners(payload.new);
          }
          // 3. Nếu đơn hàng được UPDATE trạng thái trên CSDL Supabase
          else if (payload?.eventType === 'UPDATE' && payload?.new) {
            const o = payload.new;
            statusListeners.forEach((cb) => {
              try {
                cb({
                  order_number: o.order_number,
                  status: o.status,
                  updated_at: o.updated_at || new Date().toISOString(),
                  order_data: o,
                });
              } catch (e) {
                console.warn('Lỗi statusListener từ postgres_changes:', e);
              }
            });
          }
        }
      )
      .subscribe();
  } catch (err) {
    console.warn('Lỗi khởi tạo Realtime Channel:', err);
  }

  return syncChannelInstance;
}

/**
 * Lấy channel để gửi dữ liệu
 */
export function getSyncChannel() {
  return ensureSyncChannel();
}

/**
 * Phát sóng cập nhật trạng thái đơn (Mới nhận -> Đang làm -> Sẵn sàng -> Hoàn thành)
 * Tới tất cả điện thoại, máy tính bảng và máy tính đang mở ứng dụng trong vòng ~50ms
 */
export async function broadcastOrderStatusUpdate(
  orderNumber: string,
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled',
  orderData?: any
) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'kds_status_update',
        payload: {
          order_number: orderNumber,
          status,
          updated_at: new Date().toISOString(),
          order_data: orderData,
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastOrderStatusUpdate:', err);
  }
}

/**
 * Phát sóng khi POS tạo đơn hàng mới (bán trực tiếp hoặc đặt bánh sinh nhật)
 */
export async function broadcastNewOrder(order: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'pos_order_created',
        payload: {
          order,
          created_at: new Date().toISOString(),
        },
      });

      // Gửi nhắc lại sau 350ms đề phòng websocket vừa khởi tạo đang hoàn tất bắt tay
      setTimeout(() => {
        try {
          channel.send({
            type: 'broadcast',
            event: 'pos_order_created',
            payload: {
              order,
              created_at: new Date().toISOString(),
            },
          }).catch(() => {});
        } catch {}
      }, 350);
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastNewOrder:', err);
  }
}

/**
 * Phát sóng khi người dùng bấm "Xóa Đơn Mẫu" trên bất kỳ thiết bị nào
 */
export async function broadcastClearDemoOrders() {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'kds_clear_demo',
        payload: {
          cleared_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastClearDemoOrders:', err);
  }
}

/**
 * Phát sóng khi có thay đổi sản phẩm (tạo bánh mới, đổi ảnh bánh, xóa bánh)
 * Để tất cả máy tính và điện thoại đồng bộ tức thì menu và ảnh trong ~50ms
 */
export async function broadcastProductChange(payload: ProductChangePayload) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'product_changed',
        payload,
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastProductChange:', err);
  }
}

/**
 * Phát sóng cập nhật cấu hình Telegram tới tất cả thiết bị
 */
export async function broadcastTelegramConfig(config: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'telegram_config_updated',
        payload: {
          config,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastTelegramConfig:', err);
  }
}

/**
 * Phát sóng cập nhật nhận diện thương hiệu (Tên tiệm, Logo, SĐT, Địa chỉ) tới tất cả thiết bị
 */
export async function broadcastStoreBranding(branding: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'store_branding_updated',
        payload: {
          branding,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastStoreBranding:', err);
  }
}

/**
 * Phát sóng cập nhật cấu hình VietQR tới tất cả thiết bị (POS, Kitchen, Admin trên mọi máy khác)
 */
export async function broadcastVietqrConfig(config: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'vietqr_config_updated',
        payload: {
          config,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastVietqrConfig:', err);
  }
}

/**
 * Phát sóng cập nhật cấu hình Ví điện tử (Momo, ZaloPay, ViettelMoney) tới tất cả thiết bị
 */
export async function broadcastEwalletConfig(config: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'ewallet_config_updated',
        payload: {
          config,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastEwalletConfig:', err);
  }
}

/**
 * Phát sóng cập nhật công thức bánh BOM tới tất cả thiết bị (Admin, Kitchen)
 */
export async function broadcastRecipeChange(action: 'create' | 'update' | 'delete', recipe: any) {
  if (isLocalMode()) return;
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'recipe_updated',
        payload: {
          action,
          recipe,
          id: recipe?.id,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastRecipeChange:', err);
  }
}

/**
 * Đăng ký lắng nghe sự kiện đồng bộ từ các thiết bị khác
 * An toàn tuyệt đối với React StrictMode và Remount
 */
export function subscribeCrossDeviceSync(callbacks: {
  onStatusUpdate?: StatusCallback;
  onNewOrder?: NewOrderCallback;
  onClearDemo?: ClearDemoCallback;
  onDbChange?: DbChangeCallback;
  onProductChange?: ProductChangeCallback;
  onRecipeChange?: RecipeChangeCallback;
  onTelegramConfigChange?: TelegramConfigCallback;
  onStoreBrandingChange?: StoreBrandingCallback;
  onVietqrConfigChange?: VietqrConfigCallback;
  onEwalletConfigChange?: EwalletConfigCallback;
  onBakeApprovalRequest?: BakeApprovalCallback;
  onBakeApprovalResolved?: BakeApprovalResolvedCallback;
}) {
  ensureSyncChannel();

  const {
    onStatusUpdate,
    onNewOrder,
    onClearDemo,
    onDbChange,
    onProductChange,
    onRecipeChange,
    onTelegramConfigChange,
    onStoreBrandingChange,
    onVietqrConfigChange,
    onEwalletConfigChange,
    onBakeApprovalRequest,
    onBakeApprovalResolved,
  } = callbacks;

  if (onStatusUpdate) statusListeners.add(onStatusUpdate);
  if (onNewOrder) newOrderListeners.add(onNewOrder);
  if (onClearDemo) clearDemoListeners.add(onClearDemo);
  if (onDbChange) dbChangeListeners.add(onDbChange);
  if (onProductChange) productListeners.add(onProductChange);
  if (onRecipeChange) recipeListeners.add(onRecipeChange);
  if (onTelegramConfigChange) telegramConfigListeners.add(onTelegramConfigChange);
  if (onStoreBrandingChange) storeBrandingListeners.add(onStoreBrandingChange);
  if (onVietqrConfigChange) vietqrConfigListeners.add(onVietqrConfigChange);
  if (onEwalletConfigChange) ewalletConfigListeners.add(onEwalletConfigChange);
  if (onBakeApprovalRequest) bakeApprovalListeners.add(onBakeApprovalRequest);
  if (onBakeApprovalResolved) bakeApprovalResolvedListeners.add(onBakeApprovalResolved);

  return () => {
    if (onStatusUpdate) statusListeners.delete(onStatusUpdate);
    if (onNewOrder) newOrderListeners.delete(onNewOrder);
    if (onClearDemo) clearDemoListeners.delete(onClearDemo);
    if (onDbChange) dbChangeListeners.delete(onDbChange);
    if (onProductChange) productListeners.delete(onProductChange);
    if (onRecipeChange) recipeListeners.delete(onRecipeChange);
    if (onTelegramConfigChange) telegramConfigListeners.delete(onTelegramConfigChange);
    if (onStoreBrandingChange) storeBrandingListeners.delete(onStoreBrandingChange);
    if (onVietqrConfigChange) vietqrConfigListeners.delete(onVietqrConfigChange);
    if (onEwalletConfigChange) ewalletConfigListeners.delete(onEwalletConfigChange);
    if (onBakeApprovalRequest) bakeApprovalListeners.delete(onBakeApprovalRequest);
    if (onBakeApprovalResolved) bakeApprovalResolvedListeners.delete(onBakeApprovalResolved);
  };
}

/**
 * Phát sóng yêu cầu thợ bếp/nhân viên gửi duyệt nướng xong tới Chủ Tiệm (Admin)
 */
export async function broadcastBakeApprovalRequest(payload: BakeApprovalPayload) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'bake_approval_requested',
        payload: {
          ...payload,
          requested_at: payload.requested_at || new Date().toISOString(),
        },
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bake_approval_requested', { detail: payload }));
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastBakeApprovalRequest:', err);
  }
}

/**
 * Phát sóng khi Chủ Tiệm (Admin) đã Chấp Nhận hoặc Từ Chối duyệt nướng xong
 */
export async function broadcastBakeApprovalResolved(payload: BakeApprovalResolvedPayload) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'bake_approval_resolved',
        payload: {
          ...payload,
          resolved_at: payload.resolved_at || new Date().toISOString(),
        },
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bake_approval_resolved', { detail: payload }));
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastBakeApprovalResolved:', err);
  }
}

/**
 * Kiểm tra chuỗi UUID hợp lệ để không bao giờ gửi id sai định dạng gây lỗi PostgreSQL 22P02
 */
export function isValidUUID(str: any): boolean {
  if (!str || typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
}

/**
 * Phân tích chuỗi ngày giờ hẹn giao sang ISO Timestamp chuẩn
 * Hỗ trợ các định dạng tiếng Việt phổ biến:
 * - "14:02 ngày 10/09/2026" hoặc "14:02 ngày 2026-09-10"
 * - "17:30 ngày mai (15/09)"
 * - "10/09/2026 14:02"
 * - "2026-09-10T14:02:00.000Z"
 * Tuyệt đối trả về ISO string hoặc null (không bao giờ trả về chuỗi tiếng Việt thô)
 */
export function parseToIsoTimestamp(dtStr?: string): string | null {
  if (!dtStr || typeof dtStr !== 'string') return null;
  const s = dtStr.trim();
  if (!s) return null;

  // 1. Nếu đã là chuỗi ISO chuẩn
  if (s.includes('T') || s.includes('Z')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 2. Trích xuất giờ và phút (HH:mm)
  let hours = 17;
  let minutes = 0;
  const timeMatch = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
  }

  // 3. Xử lý "ngày mai" hoặc "hôm nay"
  const lower = s.toLowerCase();
  const now = new Date();
  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth();
  let targetDate = now.getDate();

  if (lower.includes('ngày mai') || lower.includes('mai')) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    targetYear = tomorrow.getFullYear();
    targetMonth = tomorrow.getMonth();
    targetDate = tomorrow.getDate();
  }

  // 4. Định dạng DD/MM/YYYY hoặc DD-MM-YYYY hoặc DD/MM
  const dmyMatch = s.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dmyMatch) {
    targetDate = parseInt(dmyMatch[1], 10);
    targetMonth = parseInt(dmyMatch[2], 10) - 1;
    if (dmyMatch[3]) {
      let y = parseInt(dmyMatch[3], 10);
      if (y < 100) y += 2000;
      targetYear = y;
    }
  } else {
    // Thử dạng YYYY-MM-DD
    const ymdMatch = s.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      targetYear = parseInt(ymdMatch[1], 10);
      targetMonth = parseInt(ymdMatch[2], 10) - 1;
      targetDate = parseInt(ymdMatch[3], 10);
    }
  }

  const d = new Date(targetYear, targetMonth, targetDate, hours, minutes, 0, 0);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }

  // 5. Thử Date.parse(s)
  const directDate = new Date(s);
  if (!isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  return null;
}

/**
 * Đồng bộ trạng thái đơn xuống cơ sở dữ liệu Supabase (PostgreSQL)
 * Nếu đơn chưa có trên Supabase (như đơn demo hoặc đơn offline), tự động INSERT lên Supabase
 */
export async function syncOrderToSupabase(
  order: any,
  nextStatus: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const orderNum = order.order_number || order.orderNumber;
  if (!orderNum) return;

  try {
    // 1. Thử cập nhật trạng thái nếu đơn đã tồn tại trong Supabase
    // LƯU Ý QUAN TRỌNG: Chỉ cập nhật status và updated_at, TUYỆT ĐỐI KHÔNG ghi đè preorder_pickup_at!
    const { data: updatedRows, error: updateErr } = await supabase
      .from('orders')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('order_number', orderNum)
      .select('id');

    // 2. Nếu đơn chưa có trong Supabase (0 dòng cập nhật), tiến hành INSERT đơn lên Supabase
    if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
      const orderPayload: any = {
        order_number: orderNum,
        order_type: order.order_type || (order.preorder_pickup_at || order.pickupDateTime ? 'preorder' : 'takeaway'),
        status: nextStatus,
        notes: order.notes || '',
        subtotal: Number(order.subtotal || order.total_amount || order.totalPrice || 0),
        total_amount: Number(order.total_amount || order.totalPrice || 0),
        discount_amount: Number(order.discount_amount ?? order.discountAmount ?? 0),
        discount_pct: Number(order.discount_pct ?? order.discountPct ?? 0),
        total_cogs: Number(order.total_cogs ?? order.totalCogs ?? 0),
        sync_status: 'synced',
      };

      if (order.local_id || order.id) {
        orderPayload.local_id = String(order.local_id || order.id);
      }

      // Nếu có id dạng UUID hợp lệ thì dùng id đó
      if (order.id && isValidUUID(order.id)) {
        orderPayload.id = order.id;
      }

      // Bảo toàn chính xác giờ hẹn giao ban đầu của khách (TUYỆT ĐỐI KHÔNG gửi chuỗi tiếng Việt thô lên cột timestamptz):
      const rawPickup = order.preorder_pickup_at || order.pickupDateTime;
      if (rawPickup) {
        const parsedIso = parseToIsoTimestamp(rawPickup);
        if (parsedIso) {
          orderPayload.preorder_pickup_at = parsedIso;
        }
      }
      const cName = order.customer_name || order.customerName;
      if (cName) orderPayload.customer_name = cName;
      const cPhone = order.customer_phone || order.customerPhone;
      if (cPhone) orderPayload.customer_phone = cPhone;
      const cMsg = order.cake_message || order.cakeMessage;
      if (cMsg) orderPayload.cake_message = cMsg;

      const { data: insertedOrder, error: insertErr } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id')
        .single();

      if (insertErr) {
        console.error('Lỗi INSERT đơn lên Supabase SQL:', insertErr);
      } else if (insertedOrder) {
        // Ghi các món bánh vào order_items (Chỉ gửi các cột hợp lệ trong CSDL Supabase)
        if (Array.isArray(order.items) && order.items.length > 0) {
          const itemsToInsert = order.items.map((it: any) => {
            const unitPrice = Number(it.unit_price || it.selling_price || it.product?.selling_price || 0);
            const qty = Number(it.quantity || 1);
            const unitCost = Number(it.unit_cost ?? it.unitCost ?? it.cost ?? it.product?.base_cost_price ?? 0);
            const pId = it.product_id || it.productId || it.product?.id || null;
            return {
              order_id: insertedOrder.id,
              product_id: isValidUUID(pId) ? pId : null,
              product_name_snapshot: it.product_name_snapshot || it.name || it.product?.name || 'Bánh',
              quantity: qty,
              unit_price: unitPrice,
              unit_cost: unitCost,
              notes: it.notes || '',
            };
          });

          const { error: itemsErr } = await supabase.from('order_items').insert(itemsToInsert);
          if (itemsErr) {
            console.warn('Lỗi insert order_items lần 1, thử lại với product_id=null:', itemsErr);
            const fallbackItems = itemsToInsert.map((it: any) => ({ ...it, product_id: null }));
            await supabase.from('order_items').insert(fallbackItems);
          }
        }

        // Ghi thanh toán / tiền cọc vào payments
        if (Array.isArray(order.payments) && order.payments.length > 0) {
          const paymentsToInsert = order.payments.map((p: any) => ({
            order_id: insertedOrder.id,
            method: p.method || 'cash',
            amount: Number(p.amount || 0),
            reference_code: p.reference_code || `Thanh toán đơn ${orderNum}`,
          }));

          await supabase.from('payments').insert(paymentsToInsert);
        } else if (order.deposit_amount || order.depositAmount) {
          const depAmt = Number(order.deposit_amount || order.depositAmount || 0);
          if (depAmt > 0) {
            await supabase.from('payments').insert({
              order_id: insertedOrder.id,
              method: order.payment_method || order.paymentMethod || 'cash',
              amount: depAmt,
              reference_code: `Cọc đơn đặt bánh ${orderNum}`,
            });
          }
        }
      }
      return insertedOrder;
    }
    return updatedRows?.[0];
  } catch (err) {
    console.warn('Lỗi syncOrderToSupabase:', err);
  }
}

export interface ParsedPreorderNotes {
  delivery_method?: 'shipping';
  shipping_address?: string;
  total_amount?: number;
  deposit_amount?: number;
  remaining_amount?: number;
  reference_image_url?: string;
  cake_name?: string;
  cake_size?: string;
  flavor?: string;
  cream?: string;
  filling?: string;
  packaging?: string;
  addons?: string[];
  customer_name?: string;
  customer_phone?: string;
  preorder_pickup_at?: string;
  pickup_time?: string;
  cake_message?: string;
  special_request?: string;
}

/**
 * Trích xuất thông tin đặt bánh từ trường ghi chú (notes)
 * Làm chốt an toàn khi dữ liệu đồng bộ qua các hệ thống hoặc thiết bị khác nhau
 */
export function parsePreorderFromNotes(notes?: string): ParsedPreorderNotes {
  if (!notes || typeof notes !== 'string') {
    return {};
  }

  const isShip =
    notes.includes('Hình thức: Giao tận nơi') ||
    notes.includes('Ship bánh') ||
    notes.includes('Đ/C:') ||
    notes.toLowerCase().includes('giao tận nơi') ||
    notes.toLowerCase().includes('ship');

  let shippingAddress: string | undefined = undefined;
  const addrMatch = notes.match(/Đ\/C:\s*([^|]+)/i);
  if (addrMatch && addrMatch[1]) {
    shippingAddress = addrMatch[1].trim();
  }

  let remainingAmount: number | undefined = undefined;
  const remMatch = notes.match(/CÒN (?:LẠI PHẢI|THU KHI GIAO|CẦN THU|LẠI CẦN THU):\s*([\d\.\,]+)/i);
  if (remMatch && remMatch[1]) {
    const cleanNum = parseInt(remMatch[1].replace(/\D/g, ''), 10);
    if (!isNaN(cleanNum)) remainingAmount = cleanNum;
  }

  let depositAmount: number | undefined = undefined;
  const depMatch = notes.match(/Đã cọc:\s*([\d\.\,]+)/i);
  if (depMatch && depMatch[1]) {
    const cleanNum = parseInt(depMatch[1].replace(/\D/g, ''), 10);
    if (!isNaN(cleanNum)) depositAmount = cleanNum;
  }

  let referenceImageUrl: string | undefined = undefined;
  const imgMatch = notes.match(/\[MẪU_ẢNH:([^\]]+)\]/);
  if (imgMatch && imgMatch[1]) {
    referenceImageUrl = imgMatch[1].trim();
  }

  let cakeName: string | undefined = undefined;
  let cakeSize: string | undefined = undefined;
  const cakeMatch = notes.match(/Bánh:\s*([^|]+)/i);
  if (cakeMatch && cakeMatch[1]) {
    const rawCake = cakeMatch[1].trim();
    const parsed = cleanCakeNameAndSize(rawCake);
    cakeName = parsed.name;
    if (parsed.size) cakeSize = parsed.size;
  }

  let customerName: string | undefined = undefined;
  let customerPhone: string | undefined = undefined;
  const custMatch = notes.match(/Khách:\s*([^\(\|]+)(?:\(([^)]+)\))?/i);
  if (custMatch) {
    if (custMatch[1]) customerName = custMatch[1].trim();
    if (custMatch[2]) customerPhone = custMatch[2].trim();
  }

  let pickupTime: string | undefined = undefined;
  const pickupMatch = notes.match(/Hẹn:\s*([^|]+)/i);
  if (pickupMatch && pickupMatch[1]) {
    pickupTime = pickupMatch[1].trim();
  }

  let cakeMessage: string | undefined = undefined;
  const msgMatch = notes.match(/Chữ:\s*\"?([^\"]+)\"?/i);
  if (msgMatch && msgMatch[1]) {
    cakeMessage = msgMatch[1].trim();
  }

  let specialRequest: string | undefined = undefined;
  const reqMatch = notes.match(/Yêu cầu:\s*([^|]+)/i);
  if (reqMatch && reqMatch[1]) {
    specialRequest = reqMatch[1].trim();
  }

  // Cốt bánh & Loại kem
  let flavor: string | undefined = undefined;
  let cream: string | undefined = undefined;
  const comboMatch = notes.match(/Cốt & Kem:\s*([^|]+)/i);
  if (comboMatch && comboMatch[1]) {
    const parts = comboMatch[1].split('-').map((s) => s.trim());
    if (parts[0]) flavor = parts[0];
    if (parts[1]) cream = parts[1];
  } else {
    const fMatch = notes.match(/Cốt:\s*([^|]+)/i);
    if (fMatch && fMatch[1]) flavor = fMatch[1].trim();
    const cMatch = notes.match(/Kem:\s*([^|]+)/i);
    if (cMatch && cMatch[1]) cream = cMatch[1].trim();
  }

  // Nhân bánh
  let filling: string | undefined = undefined;
  const fillMatch = notes.match(/Nhân:\s*([^|]+)/i);
  if (fillMatch && fillMatch[1]) {
    filling = fillMatch[1].trim();
  }

  // Hộp đóng gói
  let packaging: string | undefined = undefined;
  const packMatch = notes.match(/Hộp:\s*([^|]+)/i);
  if (packMatch && packMatch[1]) {
    packaging = packMatch[1].trim();
  }

  // Phụ kiện trang trí / Decor đặt thêm
  let addons: string[] | undefined = undefined;
  const addonMatch = notes.match(/(?:Decor|Phụ kiện|Phụ kiện thêm):\s*([^|]+)/i);
  if (addonMatch && addonMatch[1]) {
    const rawAddons = addonMatch[1].trim();
    if (rawAddons && !rawAddons.toLowerCase().startsWith('không')) {
      addons = splitRespectingParentheses(rawAddons);
    }
  }

  let totalAmount: number | undefined = undefined;
  const totalMatch = notes.match(/GIÁ CUỐI:\s*([\d\.\,]+)/i);
  if (totalMatch && totalMatch[1]) {
    const cleanNum = parseInt(totalMatch[1].replace(/\D/g, ''), 10);
    if (!isNaN(cleanNum)) totalAmount = cleanNum;
  }

  return {
    delivery_method: isShip ? ('shipping' as const) : undefined,
    shipping_address: shippingAddress,
    total_amount: totalAmount,
    deposit_amount: depositAmount,
    remaining_amount: remainingAmount,
    reference_image_url: referenceImageUrl,
    cake_name: cakeName,
    cake_size: cakeSize,
    flavor,
    cream,
    filling,
    packaging,
    addons,
    customer_name: customerName,
    customer_phone: customerPhone,
    preorder_pickup_at: pickupTime,
    pickup_time: pickupTime,
    cake_message: cakeMessage,
    special_request: specialRequest,
  };
}

/**
 * Làm sạch chuỗi ghi chú hiển thị ra giao diện:
 * - Loại bỏ tag hình ảnh Base64
 * - Nếu là chuỗi dữ liệu đặt bánh [ĐẶT BÁNH KEM] thì chỉ trích xuất phần 'Yêu cầu:' thực tế
 */
export function cleanDisplayNotes(notes?: string): string {
  if (!notes || typeof notes !== 'string') return '';
  const cleaned = notes.replace(/\[MẪU_ẢNH:[^\]]+\]/g, '').trim();
  if (cleaned.startsWith('[ĐẶT BÁNH KEM]')) {
    const reqMatch = cleaned.match(/Yêu cầu:\s*([^|]+)/i);
    return reqMatch && reqMatch[1] ? reqMatch[1].trim() : '';
  }
  return cleaned;
}

/**
 * Định dạng ngày giờ hẹn giao / nhận bánh thân thiện cho thợ làm bánh và nhân viên
 * Ví dụ: '2026-09-09T17:30:00+00:00' -> '17:30 ngày 09/09/2026'
 */
export function formatPickupDateTime(dt?: string): string {
  if (!dt || typeof dt !== 'string') return '';

  // Nếu đã ở dạng chuỗi đẹp như "17:30 ngày mai (08/09)" thì giữ nguyên
  if (!dt.includes('T') && !dt.includes('Z')) {
    return dt;
  }

  try {
    const d = new Date(dt);
    if (!isNaN(d.getTime())) {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${hours}:${minutes} ngày ${day}/${month}/${year}`;
    }
  } catch {}

  return dt;
}
