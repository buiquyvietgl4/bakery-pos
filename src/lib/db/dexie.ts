import Dexie, { type Table } from 'dexie';

export interface LocalOrder {
  local_id: string;
  server_id?: string;
  order_number?: string;
  created_by?: string;
  order_type: 'dine_in' | 'takeaway' | 'preorder';
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  items: Array<{
    product_id: string;
    variant_id?: string;
    product_name_snapshot: string;
    quantity: number;
    unit_price: number;
    unit_cost: number;
    line_total: number;
    line_cost: number;
    notes?: string;
  }>;
  payments: Array<{
    method: 'cash' | 'transfer' | 'momo' | 'card';
    amount: number;
    reference_code?: string;
  }>;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  total_cogs: number;
  shift_id?: string;
  sync_status: 'pending' | 'synced' | 'conflict';
  created_at: string;
}

export interface SyncQueueItem {
  id?: number;
  action: 'create_order' | 'update_order_status';
  payload: any;
  attempts: number;
  last_error?: string;
  created_at: string;
}

export interface CachedProduct {
  id: string;
  name: string;
  category: string;
  image_url?: string;
  selling_price: number;
  price?: number;
  base_cost_price?: number;
  import_price?: number;
  product_type?: 'produced' | 'imported' | 'custom_cake';
  supplier_name?: string;
  barcode?: string;
  is_active: boolean;
  is_preorder_only?: boolean;
  stock_qty?: number;
  min_stock_alert?: number;
  unit?: string;
  is_semi_finished?: boolean;
}

export class BakeryDB extends Dexie {
  orders!: Table<LocalOrder>;
  products!: Table<CachedProduct>;
  syncQueue!: Table<SyncQueueItem>;

  constructor() {
    super('bakery-erp-db');
    this.version(1).stores({
      orders: 'local_id, server_id, sync_status, created_at, status',
      products: 'id, category, is_active',
      syncQueue: '++id, action, created_at',
    });
  }
}

export const db = new BakeryDB();
