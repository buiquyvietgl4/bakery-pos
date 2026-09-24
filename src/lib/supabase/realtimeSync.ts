import { supabase } from '@/lib/supabase/client';
import { isLocalMode } from '@/lib/utils/sqlModeManager';
import { autoSyncToLocalSqlFolder } from '@/lib/utils/localSqlManager';
import { cleanCakeNameAndSize, splitRespectingParentheses } from '@/lib/utils/customCakeCosting';
import { OrderReturnRecord } from '@/lib/types/orderReturn';

export interface SyncOrderPayload {
  order_number: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded' | 'partially_refunded';
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
export type SecurityConfigCallback = (config: any) => void;

export type SystemGlobalWipePayload = {
  mode: 'operational' | 'full';
  epoch: number;
};
export type SystemGlobalWipeCallback = (payload: SystemGlobalWipePayload) => void;


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

export interface PaymentReceivedPayload {
  order_number?: string;
  order_code?: string;
  amount: number;
  gateway?: string;
  transaction_id?: string;
  account_number?: string;
  content: string;
  received_at: string;
  matched?: boolean;
}

export interface TransferApprovalPayload {
  order_number: string;
  amount: number;
  customer_name?: string;
  transfer_code?: string;
  requested_by?: string;
  cashier?: string;
  order_type?: string;
  timestamp?: string;
  requested_at?: string;
  order_data?: any;
}

export interface TransferApprovalResolvedPayload {
  order_number: string;
  action: 'approved' | 'rejected';
  amount?: number;
  reason?: string;
  resolved_by?: string;
  resolved_at?: string;
}

export interface ReturnApprovalPayload {
  id: string; // ID yêu cầu duyệt: REQ-RET-xxxxxx
  order_number: string;
  order_id?: string;
  return_type: 'refund' | 'exchange';
  refund_amount: number;
  exchange_difference?: number;
  items_summary: string;
  exchange_summary?: string;
  cashier: string;
  requested_at: string;
  return_record?: any;
}

export interface ReturnApprovalResolvedPayload {
  id?: string;
  order_number: string;
  action: 'approved' | 'rejected';
  reason?: string;
  resolved_by?: string;
  resolved_at?: string;
  return_record?: any;
}

type BakeApprovalCallback = (payload: BakeApprovalPayload) => void;
type BakeApprovalResolvedCallback = (payload: BakeApprovalResolvedPayload) => void;
export type PaymentReceivedCallback = (payload: PaymentReceivedPayload) => void;
export type TransferApprovalCallback = (payload: TransferApprovalPayload) => void;
export type TransferApprovalResolvedCallback = (payload: TransferApprovalResolvedPayload) => void;
export type ReturnApprovalCallback = (payload: ReturnApprovalPayload) => void;
export type ReturnApprovalResolvedCallback = (payload: ReturnApprovalResolvedPayload) => void;

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
const securityConfigListeners = new Set<SecurityConfigCallback>();
const bakeApprovalListeners = new Set<BakeApprovalCallback>();
const bakeApprovalResolvedListeners = new Set<BakeApprovalResolvedCallback>();
const paymentReceivedListeners = new Set<PaymentReceivedCallback>();
const transferApprovalListeners = new Set<TransferApprovalCallback>();
const transferApprovalResolvedListeners = new Set<TransferApprovalResolvedCallback>();
const returnApprovalListeners = new Set<ReturnApprovalCallback>();
const returnApprovalResolvedListeners = new Set<ReturnApprovalResolvedCallback>();
const systemGlobalWipeListeners = new Set<SystemGlobalWipeCallback>();

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
      .on('broadcast', { event: 'security_config_updated' }, ({ payload }: any) => {
        if (payload?.config) {
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('bakery_security_config', JSON.stringify(payload.config));
              window.dispatchEvent(new CustomEvent('bakery_security_updated', { detail: payload.config }));
            } catch {}
          }
          securityConfigListeners.forEach((cb) => {
            try {
              cb(payload.config);
            } catch (e) {
              console.warn('Lỗi securityConfigListener:', e);
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
      .on('broadcast', { event: 'payment_received' }, ({ payload }: any) => {
        if (payload) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bakery_payment_received', { detail: payload }));
          }
          paymentReceivedListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi paymentReceivedListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'transfer_approval_requested' }, ({ payload }: any) => {
        if (payload) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('transfer_approval_requested', { detail: payload }));
          }
          transferApprovalListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi transferApprovalListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'transfer_approval_resolved' }, ({ payload }: any) => {
        if (payload) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('transfer_approval_resolved', { detail: payload }));
          }
          transferApprovalResolvedListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi transferApprovalResolvedListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'return_approval_requested' }, ({ payload }: any) => {
        if (payload) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('return_approval_requested', { detail: payload }));
          }
          returnApprovalListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi returnApprovalListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'return_approval_resolved' }, ({ payload }: any) => {
        if (payload) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('return_approval_resolved', { detail: payload }));
          }
          returnApprovalResolvedListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi returnApprovalResolvedListener:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'current_shift_updated' }, ({ payload }: any) => {
        if (payload?.shift && typeof window !== 'undefined') {
          try {
            localStorage.setItem('bakery_current_shift', JSON.stringify(payload.shift));
            window.dispatchEvent(new CustomEvent('bakery_current_shift_updated', { detail: payload.shift }));
          } catch {}
        }
      })
      .on('broadcast', { event: 'shift_history_updated' }, ({ payload }: any) => {
        if (payload?.history && typeof window !== 'undefined') {
          try {
            localStorage.setItem('bakery_shift_history', JSON.stringify(payload.history));
            window.dispatchEvent(new CustomEvent('bakery_shift_history_updated', { detail: payload.history }));
          } catch {}
        }
      })
      .on('broadcast', { event: 'delivery_alert_config_updated' }, ({ payload }: any) => {
        if (payload?.config && typeof window !== 'undefined') {
          try {
            localStorage.setItem('bakery_delivery_alert_config', JSON.stringify(payload.config));
            window.dispatchEvent(new CustomEvent('bakery_delivery_alert_config_updated', { detail: payload.config }));
          } catch {}
        }
      })
      .on('broadcast', { event: 'system_global_wipe' }, ({ payload }: any) => {
        if (payload) {
          console.warn('🚨 [SYSTEM_GLOBAL_WIPE] Nhận lệnh Reset Toàn Bộ Dữ Liệu từ Admin!', payload);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bakery_system_wiped', { detail: payload }));
          }
          systemGlobalWipeListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('Lỗi systemGlobalWipeListener:', e);
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
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded' | 'partially_refunded',
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
 * Đồng bộ nghiệp vụ Đổi Trả / Hoàn Tiền lên CSDL Supabase Cloud SQL và phát sóng Realtime
 */
export async function syncOrderRefundToSupabase(returnRecord: OrderReturnRecord): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return;
  try {
    const { order_number, refund_amount, refund_method, return_type, items } = returnRecord;
    const newStatus = return_type === 'refund' ? 'refunded' : 'partially_refunded';

    // 1. Cập nhật trạng thái đơn hàng trên Supabase
    await supabase
      .from('orders')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('order_number', order_number);

    // 2. Ghi nhận dòng thanh toán hoàn tiền hoặc thu thêm vào payments trên Supabase
    if (refund_amount > 0) {
      const { data: orderRow } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', order_number)
        .maybeSingle();

      if (orderRow?.id) {
        await supabase.from('payments').insert({
          order_id: orderRow.id,
          method: refund_method || 'cash',
          amount: -refund_amount,
          reference_code: `Hoàn tiền phiếu #${returnRecord.id} (${return_type === 'refund' ? 'Trả hàng' : 'Đổi món'})`,
        });
      }
    } else if (returnRecord.exchange_difference && returnRecord.exchange_difference > 0) {
      const { data: orderRow } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', order_number)
        .maybeSingle();

      if (orderRow?.id) {
        await supabase.from('payments').insert({
          order_id: orderRow.id,
          method: returnRecord.refund_method || 'cash',
          amount: returnRecord.exchange_difference,
          reference_code: `Thu thêm đổi bánh phiếu #${returnRecord.id} (${returnRecord.refund_method})`,
        });
      }
    }

    // 3. Cập nhật tồn kho sản phẩm nếu có nhập lại kho
    for (const item of items) {
      if (item.restocked && item.product_id) {
        const { data: pData } = await supabase
          .from('products')
          .select('stock_qty')
          .eq('id', item.product_id)
          .maybeSingle();
        if (pData) {
          const updatedStock = (pData.stock_qty || 0) + item.quantity;
          await supabase.from('products').update({ stock_qty: updatedStock }).eq('id', item.product_id);
        }
      }
    }

    // Trừ kho cho các món đổi mới
    if (return_type === 'exchange' && returnRecord.exchange_replacement_items) {
      for (const repItem of returnRecord.exchange_replacement_items) {
        if (repItem.product_id) {
          const { data: pData } = await supabase
            .from('products')
            .select('stock_qty')
            .eq('id', repItem.product_id)
            .maybeSingle();
          if (pData) {
            const updatedStock = Math.max(0, (pData.stock_qty || 0) - repItem.quantity);
            await supabase.from('products').update({ stock_qty: updatedStock }).eq('id', repItem.product_id);
          }
        }
      }
    }

    // 4. Phát sóng realtime status update để KDS bếp và các quầy khác cập nhật ngay
    await broadcastOrderStatusUpdate(order_number, newStatus);
  } catch (err) {
    console.warn('Lỗi syncOrderRefundToSupabase:', err);
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
 * Phát sóng cập nhật cấu hình bảo mật & ma trận phân quyền tài khoản (Admin, Bếp, Thu Ngân) tới tất cả thiết bị
 */
export async function broadcastSecurityConfig(config: any) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'security_config_updated',
        payload: {
          config,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastSecurityConfig:', err);
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
 * Phát sóng cập nhật ca bán hàng hiện tại (Shift) tới mọi thiết bị
 */
export async function broadcastShiftUpdated(shift: any) {
  if (isLocalMode()) return;
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'current_shift_updated',
        payload: {
          shift,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastShiftUpdated:', err);
  }
}

/**
 * Phát sóng cập nhật danh sách lịch sử giao ca (Shift History) tới mọi thiết bị
 */
export async function broadcastShiftHistoryUpdated(history: any[]) {
  if (isLocalMode()) return;
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'shift_history_updated',
        payload: {
          history,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastShiftHistoryUpdated:', err);
  }
}

/**
 * Phát sóng cập nhật cấu hình thời gian cảnh báo giờ giao (Bếp & Quầy POS)
 */
export async function broadcastDeliveryAlertConfig(config: any) {
  if (isLocalMode()) return;
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'delivery_alert_config_updated',
        payload: {
          config,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastDeliveryAlertConfig:', err);
  }
}

/**
 * Phát sóng khẩn cấp lệnh Reset Toàn Bộ Dữ Liệu tới tất cả thiết bị
 */
export async function broadcastSystemGlobalWipe(payload: SystemGlobalWipePayload) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'system_global_wipe',
        payload,
      });
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastSystemGlobalWipe:', err);
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
  onSecurityConfigChange?: SecurityConfigCallback;
  onBakeApprovalRequest?: BakeApprovalCallback;
  onBakeApprovalResolved?: BakeApprovalResolvedCallback;
  onPaymentReceived?: PaymentReceivedCallback;
  onTransferApprovalRequest?: TransferApprovalCallback;
  onTransferApprovalResolved?: TransferApprovalResolvedCallback;
  onReturnApprovalRequest?: ReturnApprovalCallback;
  onReturnApprovalResolved?: ReturnApprovalResolvedCallback;
  onSystemGlobalWipe?: SystemGlobalWipeCallback;
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
    onSecurityConfigChange,
    onBakeApprovalRequest,
    onBakeApprovalResolved,
    onPaymentReceived,
    onTransferApprovalRequest,
    onTransferApprovalResolved,
    onReturnApprovalRequest,
    onReturnApprovalResolved,
    onSystemGlobalWipe,
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
  if (onSecurityConfigChange) securityConfigListeners.add(onSecurityConfigChange);
  if (onBakeApprovalRequest) bakeApprovalListeners.add(onBakeApprovalRequest);
  if (onBakeApprovalResolved) bakeApprovalResolvedListeners.add(onBakeApprovalResolved);
  if (onPaymentReceived) paymentReceivedListeners.add(onPaymentReceived);
  if (onTransferApprovalRequest) transferApprovalListeners.add(onTransferApprovalRequest);
  if (onTransferApprovalResolved) transferApprovalResolvedListeners.add(onTransferApprovalResolved);
  if (onReturnApprovalRequest) returnApprovalListeners.add(onReturnApprovalRequest);
  if (onReturnApprovalResolved) returnApprovalResolvedListeners.add(onReturnApprovalResolved);
  if (onSystemGlobalWipe) systemGlobalWipeListeners.add(onSystemGlobalWipe);

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
    if (onSecurityConfigChange) securityConfigListeners.delete(onSecurityConfigChange);
    if (onBakeApprovalRequest) bakeApprovalListeners.delete(onBakeApprovalRequest);
    if (onBakeApprovalResolved) bakeApprovalResolvedListeners.delete(onBakeApprovalResolved);
    if (onPaymentReceived) paymentReceivedListeners.delete(onPaymentReceived);
    if (onTransferApprovalRequest) transferApprovalListeners.delete(onTransferApprovalRequest);
    if (onTransferApprovalResolved) transferApprovalResolvedListeners.delete(onTransferApprovalResolved);
    if (onReturnApprovalRequest) returnApprovalListeners.delete(onReturnApprovalRequest);
    if (onReturnApprovalResolved) returnApprovalResolvedListeners.delete(onReturnApprovalResolved);
    if (onSystemGlobalWipe) systemGlobalWipeListeners.delete(onSystemGlobalWipe);
  };
}

/**
 * Đăng ký lắng nghe sự kiện cập nhật bảo mật & ma trận phân quyền
 */
export function subscribeSecurityConfig(callback: SecurityConfigCallback): () => void {
  securityConfigListeners.add(callback);
  return () => {
    securityConfigListeners.delete(callback);
  };
}

/**
 * Đăng ký lắng nghe trực tiếp sự kiện nhận tiền ngân hàng tự động (Auto Bank Webhook)
 */
export function subscribeToPaymentReceived(callback: PaymentReceivedCallback): () => void {
  paymentReceivedListeners.add(callback);
  return () => {
    paymentReceivedListeners.delete(callback);
  };
}

/**
 * Phát sóng sự kiện nhận tiền chuyển khoản thành công từ Webhook tới toàn bộ màn hình POS / Kitchen
 */
export async function broadcastPaymentReceived(payload: PaymentReceivedPayload) {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'payment_received',
        payload: {
          ...payload,
          received_at: payload.received_at || new Date().toISOString(),
        },
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bakery_payment_received', { detail: payload }));
    }
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastPaymentReceived:', err);
  }
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
 * Phát sóng yêu cầu thu ngân gửi duyệt thanh toán chuyển khoản tới Chủ Tiệm (Admin)
 */
// ── ĐỒNG BỘ YÊU CẦU DUYỆT CHUYỂN KHOẢN VÀO SUPABASE (PHÒNG ĐIỆN THOẠI KHÓA MÀN HÌNH) ──
const DB_ROW_PENDING_TRANSFERS_ID = '00000000-0000-0000-0000-00000000000d';
const DB_ROW_PENDING_TRANSFERS_NAME = 'SYS_CONFIG_PENDING_TRANSFERS';

export async function fetchPendingTransfersFromDb(): Promise<TransferApprovalPayload[]> {
  if (isLocalMode()) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_PENDING_TRANSFERS_ID},name.eq.${DB_ROW_PENDING_TRANSFERS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        let resolvedSet = new Set<string>();
        if (typeof window !== 'undefined') {
          try {
            const resRaw = localStorage.getItem('bakery_resolved_transfers');
            if (resRaw) {
              const arr = JSON.parse(resRaw);
              if (Array.isArray(arr)) resolvedSet = new Set(arr);
            }
          } catch {}
        }
        return parsed.filter((p: any) => p && p.order_number && !resolvedSet.has(p.order_number));
      }
    }
  } catch (err) {
    console.warn('Lỗi khi fetchPendingTransfersFromDb:', err);
  }
  return [];
}

export async function savePendingTransferToDb(payload: TransferApprovalPayload): Promise<void> {
  if (!payload?.order_number) return;

  // 1. Cập nhật local storage trước
  if (typeof window !== 'undefined') {
    try {
      const resRaw = localStorage.getItem('bakery_resolved_transfers');
      if (resRaw) {
        const arr = JSON.parse(resRaw);
        if (Array.isArray(arr) && arr.includes(payload.order_number)) {
          return; // Đơn đã được duyệt, không lưu lại
        }
      }

      const raw = localStorage.getItem('bakery_pending_transfers');
      const list: TransferApprovalPayload[] = raw ? JSON.parse(raw) : [];
      if (!list.some((p) => p.order_number === payload.order_number)) {
        const updated = [payload, ...list];
        localStorage.setItem('bakery_pending_transfers', JSON.stringify(updated));
      }
      autoSyncToLocalSqlFolder().catch(() => {});
    } catch {}
  }

  // 2. Lưu vào Supabase Database
  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const { data } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_PENDING_TRANSFERS_ID},name.eq.${DB_ROW_PENDING_TRANSFERS_NAME}`)
      .limit(1)
      .maybeSingle();

    let currentList: TransferApprovalPayload[] = [];
    if (data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (Array.isArray(parsed)) currentList = parsed;
      } catch {}
    }

    const filtered = currentList.filter((p) => p.order_number !== payload.order_number);
    const updatedList = [payload, ...filtered];
    const notesContent = JSON.stringify(updatedList);

    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_PENDING_TRANSFERS_ID,
        name: DB_ROW_PENDING_TRANSFERS_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('Lỗi khi savePendingTransferToDb:', err);
  }
}

export async function removePendingTransferFromDb(orderNumber: string): Promise<void> {
  if (!orderNumber) return;

  // 1. Ghi nhận vĩnh viễn vào danh sách đơn đã duyệt để không bao giờ hiện lại
  if (typeof window !== 'undefined') {
    try {
      const resRaw = localStorage.getItem('bakery_resolved_transfers');
      const resList: string[] = resRaw ? JSON.parse(resRaw) : [];
      if (!resList.includes(orderNumber)) {
        resList.push(orderNumber);
        localStorage.setItem('bakery_resolved_transfers', JSON.stringify(resList.slice(-100)));
        saveResolvedTransfersToDb(resList).catch(() => {});
      }
      const raw = localStorage.getItem('bakery_pending_transfers');
      if (raw) {
        const list: TransferApprovalPayload[] = JSON.parse(raw);
        const updated = list.filter((p) => p.order_number !== orderNumber);
        localStorage.setItem('bakery_pending_transfers', JSON.stringify(updated));
      }
      autoSyncToLocalSqlFolder().catch(() => {});
    } catch {}
  }

  // 2. Cập nhật Supabase Database
  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const { data } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_PENDING_TRANSFERS_ID},name.eq.${DB_ROW_PENDING_TRANSFERS_NAME}`)
      .limit(1)
      .maybeSingle();

    let currentList: TransferApprovalPayload[] = [];
    if (data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (Array.isArray(parsed)) currentList = parsed;
      } catch {}
    }
    const updatedList = currentList.filter((p) => p.order_number !== orderNumber);
    const notesContent = JSON.stringify(updatedList);

    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_PENDING_TRANSFERS_ID,
        name: DB_ROW_PENDING_TRANSFERS_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('Lỗi khi removePendingTransferFromDb:', err);
  }
}

/**
 * Phát sóng yêu cầu thu ngân gửi duyệt thanh toán chuyển khoản tới Chủ Tiệm (Admin)
 */
export async function broadcastTransferApprovalRequest(payload: TransferApprovalPayload) {
  try {
    // 1. Lưu vĩnh viễn vào Database trước để khi Admin mở điện thoại sau khi tắt màn hình vẫn đọc được ngay
    savePendingTransferToDb(payload).catch(console.error);

    // 2. Phát sóng Realtime
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'transfer_approval_requested',
        payload: {
          ...payload,
          requested_at: payload.requested_at || new Date().toISOString(),
        },
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('transfer_approval_requested', { detail: payload }));
    }

    // 3. Bắn Web Push Notification tới máy chủ kèm đầy đủ thông tin trên URL query
    try {
      const deepLinkUrl = `/admin?tab=transfer_verification&approvalOrder=${encodeURIComponent(payload.order_number)}&amount=${payload.amount}&customer=${encodeURIComponent(payload.customer_name || '')}&code=${encodeURIComponent(payload.transfer_code || '')}&by=${encodeURIComponent(payload.requested_by || '')}`;

      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '⚡ YÊU CẦU DUYỆT CHUYỂN KHOẢN (2 BƯỚC)',
          body: `Đơn #${payload.order_number}: ${(Number(payload.amount) || 0).toLocaleString('vi-VN')}₫ từ ${payload.requested_by || 'Thu ngân'}. Bấm để mở duyệt ngay!`,
          url: deepLinkUrl,
          type: 'transfer_approval',
          isUrgent: true,
          orderNumber: payload.order_number,
        }),
      }).catch(() => {});
    } catch {}
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastTransferApprovalRequest:', err);
  }
}

/**
 * Phát sóng khi Chủ Tiệm (Admin) đã Xác Nhận Đã Nhận Tiền hoặc Từ Chối giao dịch chuyển khoản
 */
export async function broadcastTransferApprovalResolved(payload: TransferApprovalResolvedPayload) {
  try {
    // 1. Xóa yêu cầu khỏi Database
    if (payload.order_number) {
      removePendingTransferFromDb(payload.order_number).catch(console.error);
    }

    // 2. Phát sóng Realtime
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'transfer_approval_resolved',
        payload: {
          ...payload,
          resolved_at: payload.resolved_at || new Date().toISOString(),
        },
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('transfer_approval_resolved', { detail: payload }));
    }

    // 3. Bắn Web Push Notification thông báo kết quả duyệt về máy thu ngân
    try {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.action === 'approved' ? '✅ ĐÃ DUYỆT TIỀN VỀ' : '❌ TỪ CHỐI DUYỆT TIỀN',
          body: `Đơn #${payload.order_number}: Quản trị viên đã ${payload.action === 'approved' ? 'xác nhận tiền đã về' : 'từ chối giao dịch'}.`,
          url: '/pos',
          type: 'transfer_resolved',
          isUrgent: false,
          orderNumber: payload.order_number,
        }),
      }).catch(() => {});
    } catch {}
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastTransferApprovalResolved:', err);
  }
}

// ── ĐỒNG BỘ YÊU CẦU DUYỆT ĐỔI TRẢ & HOÀN TIỀN (RETURN APPROVALS) ──
export const DB_ROW_PENDING_RETURNS_ID = '00000000-0000-0000-0000-000000000028';
export const DB_ROW_PENDING_RETURNS_NAME = 'SYS_CONFIG_PENDING_RETURNS';

export async function savePendingReturnToDb(payload: ReturnApprovalPayload): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_pending_returns');
      const list: ReturnApprovalPayload[] = raw ? JSON.parse(raw) : [];
      if (!list.some((p) => p.order_number === payload.order_number)) {
        const updated = [payload, ...list];
        localStorage.setItem('bakery_pending_returns', JSON.stringify(updated));
      }
      autoSyncToLocalSqlFolder().catch(() => {});
    } catch {}
  }

  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const { data } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_PENDING_RETURNS_ID},name.eq.${DB_ROW_PENDING_RETURNS_NAME}`)
      .limit(1)
      .maybeSingle();

    let currentList: ReturnApprovalPayload[] = [];
    if (data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (Array.isArray(parsed)) currentList = parsed;
      } catch {}
    }

    const filtered = currentList.filter((p) => p.order_number !== payload.order_number);
    const updatedList = [payload, ...filtered];
    const notesContent = JSON.stringify(updatedList);

    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_PENDING_RETURNS_ID,
        name: DB_ROW_PENDING_RETURNS_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('Lỗi khi savePendingReturnToDb:', err);
  }
}

export async function removePendingReturnFromDb(orderNumber: string): Promise<void> {
  if (!orderNumber) return;

  if (typeof window !== 'undefined') {
    try {
      const resRaw = localStorage.getItem('bakery_resolved_returns');
      const resList: string[] = resRaw ? JSON.parse(resRaw) : [];
      if (!resList.includes(orderNumber)) {
        resList.push(orderNumber);
        localStorage.setItem('bakery_resolved_returns', JSON.stringify(resList.slice(-100)));
      }
      const raw = localStorage.getItem('bakery_pending_returns');
      if (raw) {
        const list: ReturnApprovalPayload[] = JSON.parse(raw);
        const updated = list.filter((p) => p.order_number !== orderNumber);
        localStorage.setItem('bakery_pending_returns', JSON.stringify(updated));
      }
      autoSyncToLocalSqlFolder().catch(() => {});
    } catch {}
  }

  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const { data } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_PENDING_RETURNS_ID},name.eq.${DB_ROW_PENDING_RETURNS_NAME}`)
      .limit(1)
      .maybeSingle();

    let currentList: ReturnApprovalPayload[] = [];
    if (data?.notes) {
      try {
        const parsed = JSON.parse(data.notes);
        if (Array.isArray(parsed)) currentList = parsed;
      } catch {}
    }
    const updatedList = currentList.filter((p) => p.order_number !== orderNumber);
    const notesContent = JSON.stringify(updatedList);

    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_PENDING_RETURNS_ID,
        name: DB_ROW_PENDING_RETURNS_NAME,
        yield_qty: 1,
        yield_unit: 'chiếc',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: notesContent,
        is_active: false,
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('Lỗi khi removePendingReturnFromDb:', err);
  }
}

export async function fetchPendingReturnsFromDb(): Promise<ReturnApprovalPayload[]> {
  if (isLocalMode()) {
    return typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bakery_pending_returns') || '[]') : [];
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bakery_pending_returns') || '[]') : [];
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_PENDING_RETURNS_ID},name.eq.${DB_ROW_PENDING_RETURNS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('bakery_pending_returns', JSON.stringify(parsed));
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchPendingReturnsFromDb:', err);
  }
  return typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bakery_pending_returns') || '[]') : [];
}

export async function broadcastReturnApprovalRequest(payload: ReturnApprovalPayload) {
  try {
    // 1. Lưu Database & LocalStorage
    savePendingReturnToDb(payload).catch(console.error);

    // 2. Phát sóng Realtime
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'return_approval_requested',
        payload: {
          ...payload,
          requested_at: payload.requested_at || new Date().toISOString(),
        },
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('return_approval_requested', { detail: payload }));
    }

    // 3. Web Push Notification
    try {
      const title = payload.return_type === 'refund' ? '🔄 YÊU CẦU DUYỆT HOÀN TIỀN' : '🔄 YÊU CẦU DUYỆT ĐỔI BÁNH';
      const amountStr = (Number(payload.refund_amount || payload.exchange_difference || 0)).toLocaleString('vi-VN');
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body: `Đơn #${payload.order_number}: Thu ngân ${payload.cashier || 'Quầy'} yêu cầu duyệt ${payload.return_type === 'refund' ? 'hoàn' : 'đổi'} (${amountStr}₫). Bấm để mở duyệt ngay!`,
          url: '/admin',
          type: 'return_approval',
          isUrgent: true,
          orderNumber: payload.order_number,
        }),
      }).catch(() => {});
    } catch {}
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastReturnApprovalRequest:', err);
  }
}

export async function broadcastReturnApprovalResolved(payload: ReturnApprovalResolvedPayload) {
  try {
    // 1. Xóa yêu cầu khỏi Database
    if (payload.order_number) {
      removePendingReturnFromDb(payload.order_number).catch(console.error);
    }

    // 2. Phát sóng Realtime
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'return_approval_resolved',
        payload: {
          ...payload,
          resolved_at: payload.resolved_at || new Date().toISOString(),
        },
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('return_approval_resolved', { detail: payload }));
    }

    // 3. Web Push
    try {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: payload.action === 'approved' ? '✅ ĐÃ DUYỆT ĐỔI TRẢ' : '❌ TỪ CHỐI DUYỆT ĐỔI TRẢ',
          body: `Đơn #${payload.order_number}: Quản trị viên đã ${payload.action === 'approved' ? 'phê duyệt đổi trả thành công' : 'từ chối yêu cầu đổi trả'}.`,
          url: '/pos',
          type: 'return_resolved',
          isUrgent: false,
          orderNumber: payload.order_number,
        }),
      }).catch(() => {});
    } catch {}
  } catch (err) {
    console.warn('Lỗi phát sóng broadcastReturnApprovalResolved:', err);
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
  if (typeof window !== 'undefined' && (window as any).__IS_SYSTEM_WIPING__) return;

  const orderNum = order.order_number || order.orderNumber;
  if (!orderNum) return;

  // 🛡️ ZERO-RESURRECTION GUARD: Kiểm tra CSDL xem có đợt Reset Hệ Thống nào không trước khi đẩy
  try {
    const { checkServerResetEpoch } = await import('@/lib/utils/systemResetManager');
    const { shouldAbort, serverEpoch } = await checkServerResetEpoch();
    if (shouldAbort) {
      const orderCreatedAt = new Date(order.created_at || order.createdAt || Date.now()).getTime();
      if (orderCreatedAt <= serverEpoch) {
        console.warn(`⛔ [syncOrderToSupabase] Chặn đẩy đơn cũ (#${orderNum}) tạo trước mốc Reset CSDL!`);
        return;
      }
      // Đơn hàng sinh ra SAU mốc Reset vẫn được phép đẩy lên máy chủ
    }
  } catch {}

  try {
    // 1. Thử cập nhật trạng thái nếu đơn đã tồn tại trong Supabase
    // Nếu là đơn chính hoàn thành/hủy thì liên đới cả đơn bếp làm bù (${orderNum}-LAM)
    // TUYỆT ĐỐI không liên đới ngược từ đơn -LAM sang làm hoàn thành cả đơn chính!
    const targetNumbers = new Set<string>();
    targetNumbers.add(orderNum);
    if (order.linked_bake_order_number) targetNumbers.add(order.linked_bake_order_number);
    if (!orderNum.endsWith('-LAM')) {
      targetNumbers.add(`${orderNum}-LAM`);
    }

    const updatePayload: any = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    // Lưu ý: Bảng orders trên Supabase PostgreSQL không có các cột remaining_amount / payment_status.
    // Thông tin thanh toán được lưu trữ trong notes hoặc bảng payments.
    if (order.notes) {
      updatePayload.notes = order.notes;
    }
    if (order.transfer_proof_image && !String(updatePayload.notes || '').includes('[PROOF_IMG:')) {
      updatePayload.notes = `${updatePayload.notes || ''}\n[PROOF_IMG:${order.transfer_proof_image}]`.trim();
    }

    const { data: updatedRows, error: updateErr } = await supabase
      .from('orders')
      .update(updatePayload)
      .in('order_number', Array.from(targetNumbers))
      .select('id, order_number');

    if (updateErr) {
      console.warn('Lỗi update orders Supabase:', updateErr);
    }

    if (order.id && isValidUUID(order.id)) {
      await supabase.from('orders').update(updatePayload).eq('id', order.id);
    }

    // Phát sóng cập nhật trạng thái cho tất cả các mã đơn liên quan
    if (nextStatus === 'completed') {
      targetNumbers.forEach((num) => {
        if (num !== orderNum) {
          broadcastOrderStatusUpdate(num, 'completed', { ...order, order_number: num, status: 'completed' }).catch(() => {});
        }
      });
    }

    // 2. Nếu đơn chưa có trong Supabase (0 dòng cập nhật), tiến hành INSERT đơn lên Supabase
    if (!updateErr && (!updatedRows || updatedRows.length === 0)) {
      let initialNotes = order.notes || '';
      if (order.transfer_proof_image && !initialNotes.includes('[PROOF_IMG:')) {
        initialNotes = `${initialNotes}\n[PROOF_IMG:${order.transfer_proof_image}]`.trim();
      }

      const orderPayload: any = {
        order_number: orderNum,
        order_type: order.order_type || (order.preorder_pickup_at || order.pickupDateTime ? 'preorder' : 'takeaway'),
        status: nextStatus,
        notes: initialNotes,
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

            // Tự động gắn tag phân loại thuế cố định vĩnh viễn vào ghi chú của món
            const isImported = it.product_type === 'imported' || 
              (it.category && String(it.category).toLowerCase().includes('nhập')) ||
              (it.supplier_name && !it.bom_preset_id);
            const taxTag = isImported ? '[Hàng nhập 1.5%]' : '[Bánh tiệm 4.5%]';
            let itemNotes = (it.notes || '').trim();
            if (!itemNotes.includes('[Hàng nhập 1.5%]') && !itemNotes.includes('[Bánh tiệm 4.5%]')) {
              itemNotes = `${taxTag} ${itemNotes}`.trim();
            }

            return {
              order_id: insertedOrder.id,
              product_id: isValidUUID(pId) ? pId : null,
              product_name_snapshot: it.product_name_snapshot || it.name || it.product?.name || 'Bánh',
              quantity: qty,
              unit_price: unitPrice,
              unit_cost: unitCost,
              notes: itemNotes,
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
  let cleaned = notes.replace(/\[MẪU_ẢNH:[^\]]+\]/g, '').trim();
  // Lọc bỏ thông tin giá vốn nội bộ khỏi ghi chú đơn hàng hiển thị
  cleaned = cleaned.replace(/\|\s*Vốn dự toán:[^|]+/gi, '').trim();
  cleaned = cleaned.replace(/\|\s*Giá vốn:[^|]+/gi, '').trim();
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

export interface OrderBakeShortageInfo {
  isWaitingBake: boolean;
  needBakeQty: number;
  readyStockQty: number;
  totalOrderQty: number;
  bakeStatus: 'pending' | 'done';
  isDoneBake: boolean;
}

/**
 * Hàm phân tích và nhận diện trạng thái làm bù/thiếu bánh tồn kho từ đơn hàng
 * Chuẩn hóa logic xuyên suốt giữa Máy A (tạo đơn), Máy B (nhận đơn), Bếp và POS
 * Bảo toàn 100% dữ liệu ngay cả khi Supabase chỉ lưu trường notes
 */
export function parseOrderBakeShortage(order: any): OrderBakeShortageInfo {
  if (!order || typeof order !== 'object') {
    return {
      isWaitingBake: false,
      needBakeQty: 0,
      readyStockQty: 0,
      totalOrderQty: 0,
      bakeStatus: 'done',
      isDoneBake: true,
    };
  }

  const notes = typeof order.notes === 'string' ? order.notes : '';

  // 1. Kiểm tra trạng thái đã hoàn thành nướng đủ
  const isExplicitlyDone = Boolean(
    order.bake_status === 'done' || 
    order.status === 'ready' ||
    order.status === 'completed' ||
    notes.includes('ĐÃ BẾP LÀM XONG ĐỦ') ||
    notes.includes('✓ ĐÃ BẾP LÀM XONG ĐỦ')
  );

  // 2. Trích xuất regex từ notes nếu có tag chờ làm bù
  // Khớp với [⏳ CHỜ BẾP LÀM 3 CÁI (ĐÃ CÓ SẴN 7/10 CÁI)] hoặc [⏳ CẦN BẾP LÀM 3 CÁI (ĐÃ CÓ SẴN 9 CÁI)] hoặc CHỜ/CẦN BẾP LÀM 3 CÁI
  const matchBake = isExplicitlyDone ? null : notes.match(/(?:CHỜ|CẦN)\s+BẾP\s+LÀM\s*(\d+)\s*CÁI(?:\s*\(ĐÃ CÓ SẴN\s*(\d+)(?:\/(\d+))?\s*CÁI\))?/i);

  let needBakeQty = 0;
  if (!isExplicitlyDone) {
    if (order.need_bake_qty !== undefined && order.need_bake_qty !== null && Number(order.need_bake_qty) > 0) {
      needBakeQty = Number(order.need_bake_qty);
    } else if (matchBake && matchBake[1]) {
      needBakeQty = Number(matchBake[1]);
    }
  }

  const totalOrderQty = Number(
    order.orderQuantity || 
    (matchBake && matchBake[3] ? Number(matchBake[3]) : undefined) ||
    order.items?.[0]?.quantity || 
    ((order.ready_stock_qty || 0) + needBakeQty) || 
    1
  );

  let readyStockQty = 0;
  if (isExplicitlyDone) {
    readyStockQty = totalOrderQty;
  } else if (order.ready_stock_qty !== undefined && order.ready_stock_qty !== null) {
    readyStockQty = Number(order.ready_stock_qty);
  } else if (matchBake && matchBake[2]) {
    readyStockQty = Number(matchBake[2]);
  } else {
    readyStockQty = Math.max(0, totalOrderQty - needBakeQty);
  }

  const isWaitingBake = needBakeQty > 0 && !isExplicitlyDone;
  const bakeStatus: 'pending' | 'done' = isWaitingBake ? 'pending' : 'done';

  return {
    isWaitingBake,
    needBakeQty,
    readyStockQty,
    totalOrderQty,
    bakeStatus,
    isDoneBake: isExplicitlyDone,
  };
}

// ── ĐỒNG BỘ MẺ NƯỚNG LÒ BẾP (OVEN BATCHES) ĐA THIẾT BỊ ──
export const DB_ROW_OVEN_BATCHES_ID = '00000000-0000-0000-0000-000000000022';
export const DB_ROW_OVEN_BATCHES_NAME = 'SYS_CONFIG_OVEN_BATCHES';
export const OVEN_BATCHES_SYNC_EVENT = 'bakery_oven_batches_synced';

export async function saveOvenBatchesToDb(batches: any[]): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('bakery_oven_batches', JSON.stringify(batches));
    } catch {}
  }

  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_OVEN_BATCHES_ID,
        name: DB_ROW_OVEN_BATCHES_NAME,
        yield_qty: 1,
        yield_unit: 'config',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: JSON.stringify(batches.slice(0, 50)),
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('Lỗi saveOvenBatchesToDb:', err);
  }
}

export async function fetchOvenBatchesFromDb(): Promise<any[]> {
  if (isLocalMode()) {
    return typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bakery_oven_batches') || '[]') : [];
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bakery_oven_batches') || '[]') : [];
  }

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_OVEN_BATCHES_ID},name.eq.${DB_ROW_OVEN_BATCHES_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('bakery_oven_batches', JSON.stringify(parsed));
          window.dispatchEvent(new CustomEvent(OVEN_BATCHES_SYNC_EVENT, { detail: parsed }));
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchOvenBatchesFromDb:', err);
  }
  return typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('bakery_oven_batches') || '[]') : [];
}

export async function broadcastOvenBatches(batches: any[]): Promise<void> {
  try {
    const channel = ensureSyncChannel();
    if (channel) {
      await channel.send({
        type: 'broadcast',
        event: 'oven_batches_updated',
        payload: {
          batches,
          updated_at: new Date().toISOString(),
        },
      });
    }
  } catch (err) {
    console.warn('Lỗi broadcastOvenBatches:', err);
  }
}

// ── ĐỒNG BỘ DANH SÁCH ĐƠN ĐÃ DUYỆT CHUYỂN KHOẢN (RESOLVED TRANSFERS) ──
export const DB_ROW_RESOLVED_TRANSFERS_ID = '00000000-0000-0000-0000-000000000023';
export const DB_ROW_RESOLVED_TRANSFERS_NAME = 'SYS_CONFIG_RESOLVED_TRANSFERS';

export async function saveResolvedTransfersToDb(resolvedList: string[]): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('bakery_resolved_transfers', JSON.stringify(resolvedList.slice(-150)));
    } catch {}
  }

  if (isLocalMode()) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    await supabase.from('recipes').upsert(
      {
        id: DB_ROW_RESOLVED_TRANSFERS_ID,
        name: DB_ROW_RESOLVED_TRANSFERS_NAME,
        yield_qty: 1,
        yield_unit: 'config',
        cost_per_unit: 0,
        total_material_cost: 0,
        notes: JSON.stringify(resolvedList.slice(-150)),
        is_active: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.warn('Lỗi saveResolvedTransfersToDb:', err);
  }
}

export async function fetchResolvedTransfersFromDb(): Promise<string[]> {
  if (isLocalMode()) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];

  try {
    const { data, error } = await supabase
      .from('recipes')
      .select('notes')
      .or(`id.eq.${DB_ROW_RESOLVED_TRANSFERS_ID},name.eq.${DB_ROW_RESOLVED_TRANSFERS_NAME}`)
      .limit(1)
      .maybeSingle();

    if (!error && data?.notes) {
      const parsed = JSON.parse(data.notes);
      if (Array.isArray(parsed)) {
        if (typeof window !== 'undefined') {
          const raw = localStorage.getItem('bakery_resolved_transfers');
          const localList: string[] = raw ? JSON.parse(raw) : [];
          const merged = Array.from(new Set([...localList, ...parsed])).slice(-150);
          localStorage.setItem('bakery_resolved_transfers', JSON.stringify(merged));
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Lỗi fetchResolvedTransfersFromDb:', err);
  }
  return [];
}
