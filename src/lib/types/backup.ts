// src/lib/types/backup.ts

import { CachedProduct } from '@/lib/db/dexie';
import { BakeryRecipe } from '@/lib/constants/bakeryData';
import { SpoilageLog } from './spoilage';
import { StockAdjustmentLog } from './stockAdjustment';

export interface BackupImageItem {
  id: string;
  name: string;
  type: 'product' | 'preorder' | 'qr' | 'other';
  dataUrl: string; // Base64 Data URL (image/webp, image/png...)
  hash: string;
  associatedId?: string; // productId or orderId
  sizeBytes: number;
}

export interface BackupOrderItem {
  id?: string;
  product_id?: string;
  product_name_snapshot: string;
  quantity: number;
  unit_price?: number;
  unit_cost?: number;
  line_total?: number;
  line_cost?: number;
  product_type?: 'produced' | 'imported' | 'custom_cake';
  supplier_name?: string;
  notes?: string;
}

export interface BackupOrder {
  id: string;
  order_number: string;
  order_type?: 'dine_in' | 'takeaway' | 'preorder';
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  created_at: string;
  updated_at?: string;
  preorder_pickup_at?: string;
  pickupDateTime?: string;
  delivery_method?: 'pickup' | 'shipping';
  shipping_address?: string;
  shipping_fee?: number;
  customer_name?: string;
  customer_phone?: string;
  cake_name?: string;
  cake_message?: string;
  total_amount?: number;
  subtotal?: number;
  total_cogs?: number;
  deposit_amount?: number;
  remaining_amount?: number;
  notes?: string;
  reference_image_url?: string;
  cake_costing?: any;
  custom_cake?: any;
  items?: BackupOrderItem[];
}

export interface BackupIngredient {
  id?: string;
  name: string;
  unit: string;
  category?: string;
  stock_qty: number;
  reorder_level?: number;
  avg_cost?: number;
  wastage_pct?: number;
}

export interface BackupExpense {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
}

export interface BackupCashflow {
  id: string;
  date: string;
  type: 'in' | 'out';
  amount: number;
  category: string;
  description: string;
}

export interface BakeryBackupData {
  schemaVersion: 'bakery-backup-v2';
  exportedAt: string;
  storeName: string;
  dataHash: string;
  metadata: {
    totalProducts: number;
    totalOrders: number;
    totalRecipes: number;
    totalIngredients: number;
    totalStockLogs: number;
    totalSpoilageLogs: number;
    totalExpenses: number;
    totalImages: number;
    estimatedSizeBytes: number;
  };
  products: CachedProduct[];
  recipes: BakeryRecipe[];
  ingredients: BackupIngredient[];
  stock_adjustments: StockAdjustmentLog[];
  spoilage_logs: SpoilageLog[];
  orders: BackupOrder[];
  expenses: BackupExpense[];
  cashflow: BackupCashflow[];
  images: BackupImageItem[];
  accounting_closings?: any[];
  security_config?: any;
  settings: {
    vietqr?: any;
    ewallet?: any;
    printer?: any;
    telegram?: any;
    branding?: any;
    security?: any;
    cake_costing?: any;
  };
}

export type EntityType = 
  | 'products' 
  | 'orders' 
  | 'ingredients' 
  | 'recipes' 
  | 'stock_adjustments' 
  | 'spoilage_logs' 
  | 'expenses' 
  | 'cashflow' 
  | 'images';

export type ReconciliationStatus = 'new' | 'identical' | 'updated';

export interface ReconciliationItem {
  entityType: EntityType;
  id: string;
  identifier: string; // e.g. order_number or product name
  displayName: string;
  status: ReconciliationStatus;
  details?: string;
  existingItem?: any;
  backupItem: any;
}

export interface ReconciliationReport {
  summary: {
    totalBackupItems: number;
    newItemsCount: number;
    identicalItemsCount: number;
    updatedItemsCount: number;
  };
  byEntity: Record<EntityType, {
    total: number;
    newCount: number;
    identicalCount: number;
    updatedCount: number;
    items: ReconciliationItem[];
  }>;
}

export type MergeMode = 'smart_merge' | 'append_only' | 'full_overwrite';

export interface AutoBackupConfig {
  enabled: boolean;
  intervalMinutes: number; // 5, 15, 30, 60, 1440 (daily)
  folderName: string; // Display name of folder, e.g. "D:\Backup_TiemBanh"
  lastBackupAt?: string;
  lastBackupHash?: string;
  totalBackupsSaved: number;
  autoSaveImages: boolean;
  keepOnlyLatest?: boolean; // Tự động xóa file cũ, chỉ giữ 1 file duy nhất gần nhất
}

