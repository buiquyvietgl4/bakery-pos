// src/lib/utils/backupManager.ts

import { 
  BakeryBackupData, 
  BackupImageItem, 
  BackupOrder, 
  AutoBackupConfig 
} from '@/lib/types/backup';
import { DEFAULT_BAKERY_PRODUCTS, DEFAULT_BAKERY_RECIPES } from '@/lib/constants/bakeryData';
import { getStockAdjustmentLogs } from './stockAdjustmentManager';
import { getSpoilageLogs } from './spoilageManager';
import { supabase } from '@/lib/supabase/client';
import { getTelegramConfig } from './telegramNotify';
import { getPrinterConfig } from './printerManager';
import { getStoreBranding } from './storeBranding';

const CONFIG_KEY = 'bakery_auto_backup_config';
const DB_NAME = 'bakery_backup_handles_db';
const STORE_NAME = 'dir_handles';

const DEFAULT_CONFIG: AutoBackupConfig = {
  enabled: true,
  intervalMinutes: 15,
  folderName: 'Mặc định (Tải về máy tính)',
  totalBackupsSaved: 0,
  autoSaveImages: true,
};

// ── QUẢN LÝ CẤU HÌNH AUTO BACKUP ──
export function getAutoBackupConfig(): AutoBackupConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

export function saveAutoBackupConfig(config: Partial<AutoBackupConfig>): AutoBackupConfig {
  const current = getAutoBackupConfig();
  const updated = { ...current, ...config };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('bakery_backup_config_updated', { detail: updated }));
    } catch {}
  }
  return updated;
}

// ── LƯU TRỮ VÀ KHÔI PHỤC DIRECTORY HANDLE BẰNG INDEXEDDB NGUYÊN BẢN ──
function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not supported'));
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeDirectoryHandle(handle: any): Promise<void> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(handle, 'backup_dir_handle');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Không thể lưu FileSystemHandle vào IndexedDB:', err);
  }
}

export async function getStoredDirectoryHandle(): Promise<any | null> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get('backup_dir_handle');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// ── KIỂM TRA HỖ TRỢ FILE SYSTEM ACCESS API ──
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// ── CHỌN THƯ MỤC LƯU BACKUP TRÊN MÁY TÍNH ──
export async function selectBackupDirectory(): Promise<{ success: boolean; folderName?: string; error?: string }> {
  if (!isFileSystemAccessSupported()) {
    return {
      success: false,
      error: 'Trình duyệt này không hỗ trợ File System Access API. Hệ thống sẽ dùng chế độ tự động tải file về thư mục Downloads.',
    };
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'documents',
    });

    if (dirHandle) {
      await storeDirectoryHandle(dirHandle);
      const folderName = dirHandle.name || 'Thư mục đã chọn';
      saveAutoBackupConfig({ folderName });
      return { success: true, folderName };
    }
    return { success: false, error: 'Chưa chọn thư mục' };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, error: 'Đã hủy chọn thư mục' };
    }
    return { success: false, error: err.message || 'Lỗi khi mở cửa sổ chọn thư mục' };
  }
}

// ── HÀM BĂM DATA HASH ĐỂ PHÁT HIỆN DỮ LIỆU MỚI ──
export function calculateDataHash(payload: any): string {
  try {
    const str = JSON.stringify({
      orders: payload.orders?.length || 0,
      products: payload.products?.length || 0,
      recipes: payload.recipes?.length || 0,
      stock: payload.stock_adjustments?.length || 0,
      spoilage: payload.spoilage_logs?.length || 0,
      expenses: payload.expenses?.length || 0,
      latestOrder: payload.orders?.[0]?.order_number || '',
      latestStock: payload.stock_adjustments?.[0]?.id || '',
      latestProductCost: payload.products?.[0]?.selling_price || '',
    });
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return 'h-' + Math.abs(hash).toString(36);
  } catch {
    return 'h-' + Date.now();
  }
}

// ── HÀM TRÍCH XUẤT VÀ CHUYỂN ẢNH THÀNH BASE64 AN TOÀN ──
async function urlOrBlobToBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── HÀM TỔNG HỢP 100% DỮ LIỆU CỬA HÀNG KỂ CẢ ẢNH ──
export async function gatherFullBakeryData(): Promise<BakeryBackupData> {
  // 1. Sản phẩm
  let products: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const rawP = localStorage.getItem('bakery_products');
      if (rawP) products = JSON.parse(rawP);
    } catch {}
  }
  if (!products || products.length === 0) {
    products = [...DEFAULT_BAKERY_PRODUCTS];
  }

  // Lấy thêm từ Supabase nếu online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data: dbProducts } = await supabase.from('products').select('*').limit(300);
      if (dbProducts && Array.isArray(dbProducts) && dbProducts.length > 0) {
        dbProducts.forEach((dp) => {
          if (!products.some((p) => p.id === dp.id || p.name === dp.name)) {
            products.push({
              id: dp.id,
              name: dp.name,
              category: dp.category || 'Bánh Kem',
              selling_price: Number(dp.selling_price || 0),
              image_url: dp.image_url,
              is_active: dp.is_active ?? true,
            });
          }
        });
      }
    } catch {}
  }

  // 2. Công thức BOM
  let recipes: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const rawR = localStorage.getItem('bakery_recipes');
      if (rawR) recipes = JSON.parse(rawR);
    } catch {}
  }
  if (!recipes || recipes.length === 0) {
    recipes = [...DEFAULT_BAKERY_RECIPES];
  }

  // 3. Nguyên vật liệu kho
  let ingredients: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const rawI = localStorage.getItem('bakery_ingredients');
      if (rawI) ingredients = JSON.parse(rawI);
    } catch {}
  }

  // 4. Lịch sử biến động kho & Hao hụt
  const stock_adjustments = getStockAdjustmentLogs();
  const spoilage_logs = getSpoilageLogs();

  // 5. Đơn hàng (orders & preorders)
  let orders: BackupOrder[] = [];
  if (typeof window !== 'undefined') {
    try {
      const rawO = localStorage.getItem('bakery_orders');
      if (rawO) orders = JSON.parse(rawO);
    } catch {}
  }

  // Lấy thêm từ Supabase nếu online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const { data: dbOrders } = await supabase
        .from('orders')
        .select(`
          id, order_number, order_type, status, created_at, updated_at,
          preorder_pickup_at, subtotal, total_amount, notes, customer_name,
          customer_phone, cake_message,
          order_items (id, product_name_snapshot, quantity, unit_price, notes)
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (dbOrders && Array.isArray(dbOrders)) {
        dbOrders.forEach((dbo: any) => {
          const exists = orders.some(
            (o) => o.order_number === dbo.order_number || o.id === dbo.id
          );
          if (!exists) {
            orders.unshift({
              id: dbo.id,
              order_number: dbo.order_number || `DH-${dbo.id.slice(0, 6)}`,
              order_type: dbo.order_type || 'preorder',
              status: dbo.status || 'pending',
              created_at: dbo.created_at,
              updated_at: dbo.updated_at,
              preorder_pickup_at: dbo.preorder_pickup_at,
              customer_name: dbo.customer_name,
              customer_phone: dbo.customer_phone,
              cake_message: dbo.cake_message,
              total_amount: Number(dbo.total_amount || 0),
              subtotal: Number(dbo.subtotal || 0),
              notes: dbo.notes,
              items: dbo.order_items || [],
            });
          }
        });
      }
    } catch {}
  }

  // 6. Sổ quỹ thu chi & Chi phí
  let expenses: any[] = [];
  let cashflow: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const rawE = localStorage.getItem('bakery_expenses');
      if (rawE) expenses = JSON.parse(rawE);
      const rawC = localStorage.getItem('bakery_cashflow');
      if (rawC) cashflow = JSON.parse(rawC);
    } catch {}
  }

  // 7. Cấu hình
  let vietqrConfig = null;
  let ewalletConfig = null;
  let printerConfig = null;
  let telegramConfig = null;

  if (typeof window !== 'undefined') {
    try {
      const rawV = localStorage.getItem('bakery_vietqr_config');
      if (rawV) vietqrConfig = JSON.parse(rawV);
      const rawW = localStorage.getItem('bakery_ewallet_config');
      if (rawW) ewalletConfig = JSON.parse(rawW);
    } catch {}
  }
  printerConfig = getPrinterConfig();
  telegramConfig = getTelegramConfig();

  // 8. ĐÓNG GÓI TOÀN BỘ HÌNH ẢNH (ẢNH BÁNH, ẢNH ĐẶT TRƯỚC, MÃ QR)
  const images: BackupImageItem[] = [];
  const seenHashes = new Set<string>();

  // Ảnh sản phẩm
  for (const p of products) {
    if (p.image_url) {
      let dataUrl: string | null = null;
      if (p.image_url.startsWith('data:image/')) {
        dataUrl = p.image_url;
      } else {
        dataUrl = await urlOrBlobToBase64(p.image_url);
      }

      if (dataUrl) {
        const hash = 'img-' + dataUrl.length + '-' + dataUrl.slice(-30).replace(/[^a-zA-Z0-9]/g, '');
        if (!seenHashes.has(hash)) {
          seenHashes.add(hash);
          images.push({
            id: 'img-prod-' + p.id,
            name: p.name || 'Ảnh Bánh',
            type: 'product',
            dataUrl,
            hash,
            associatedId: p.id,
            sizeBytes: Math.round((dataUrl.length * 3) / 4),
          });
        }
      }
    }
  }

  // Ảnh mẫu bánh khách gửi trong đơn đặt trước
  for (const o of orders) {
    if (o.reference_image_url) {
      let dataUrl: string | null = null;
      if (o.reference_image_url.startsWith('data:image/')) {
        dataUrl = o.reference_image_url;
      } else {
        dataUrl = await urlOrBlobToBase64(o.reference_image_url);
      }

      if (dataUrl) {
        const hash = 'img-' + dataUrl.length + '-' + dataUrl.slice(-30).replace(/[^a-zA-Z0-9]/g, '');
        if (!seenHashes.has(hash)) {
          seenHashes.add(hash);
          images.push({
            id: 'img-order-' + o.order_number,
            name: `Ảnh mẫu #${o.order_number}`,
            type: 'preorder',
            dataUrl,
            hash,
            associatedId: o.order_number,
            sizeBytes: Math.round((dataUrl.length * 3) / 4),
          });
        }
      }
    }
  }

  // Ảnh mã QR ví điện tử
  if (ewalletConfig) {
    const wallets: Array<'momo' | 'zalopay' | 'viettelmoney'> = ['momo', 'zalopay', 'viettelmoney'];
    for (const w of wallets) {
      const qUrl = ewalletConfig[w]?.qrUrl;
      if (qUrl) {
        const dataUrl = qUrl.startsWith('data:image/') ? qUrl : await urlOrBlobToBase64(qUrl);
        if (dataUrl) {
          const hash = 'img-qr-' + w + '-' + dataUrl.length;
          if (!seenHashes.has(hash)) {
            seenHashes.add(hash);
            images.push({
              id: 'img-qr-' + w,
              name: `Mã QR ${w.toUpperCase()}`,
              type: 'qr',
              dataUrl,
              hash,
              associatedId: w,
              sizeBytes: Math.round((dataUrl.length * 3) / 4),
            });
          }
        }
      }
    }
  }

  const rawJson = JSON.stringify({
    products,
    recipes,
    ingredients,
    stock_adjustments,
    spoilage_logs,
    orders,
    expenses,
    cashflow,
    images,
  });
  const dataHash = calculateDataHash({ products, orders, stock_adjustments, spoilage_logs, expenses });

  return {
    schemaVersion: 'bakery-backup-v2',
    exportedAt: new Date().toISOString(),
    storeName: getStoreBranding().storeName || 'Tiệm Bánh Hạnh Phúc (Bakery ERP)',
    dataHash,
    metadata: {
      totalProducts: products.length,
      totalOrders: orders.length,
      totalRecipes: recipes.length,
      totalIngredients: ingredients.length,
      totalStockLogs: stock_adjustments.length,
      totalSpoilageLogs: spoilage_logs.length,
      totalExpenses: expenses.length,
      totalImages: images.length,
      estimatedSizeBytes: rawJson.length,
    },
    products,
    recipes,
    ingredients,
    stock_adjustments,
    spoilage_logs,
    orders,
    expenses,
    cashflow,
    images,
    settings: {
      vietqr: vietqrConfig,
      ewallet: ewalletConfig,
      printer: printerConfig,
      telegram: telegramConfig,
      branding: getStoreBranding(),
    },
  };
}

// ── LƯU FILE BACKUP VÀO THƯ MỤC ĐÃ CHỌN HOẶC TẢI VỀ ──
export async function saveBackupToFile(
  data: BakeryBackupData,
  manualDownload = false
): Promise<{ success: boolean; method: 'directory' | 'download'; filename: string; sizeBytes: number; error?: string }> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
  const filename = `bakery_backup_${dateStr}_${timeStr}.bakery.json`;
  const jsonString = JSON.stringify(data, null, 2);
  const sizeBytes = new Blob([jsonString]).size;

  // Nếu người dùng không yêu cầu tải về thủ công và có hỗ trợ File System Access
  if (!manualDownload && isFileSystemAccessSupported()) {
    try {
      const dirHandle = await getStoredDirectoryHandle();
      if (dirHandle) {
        // Kiểm tra quyền ghi
        const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(jsonString);
          await writable.close();

          // Lưu thêm file latest_backup.bakery.json để dễ tìm
          try {
            const latestHandle = await dirHandle.getFileHandle('latest_backup.bakery.json', { create: true });
            const latestWritable = await latestHandle.createWritable();
            await latestWritable.write(jsonString);
            await latestWritable.close();
          } catch {}

          const currentCfg = getAutoBackupConfig();
          saveAutoBackupConfig({
            lastBackupAt: new Date().toISOString(),
            lastBackupHash: data.dataHash,
            totalBackupsSaved: (currentCfg.totalBackupsSaved || 0) + 1,
          });

          return { success: true, method: 'directory', filename, sizeBytes };
        }
      }
    } catch (err: any) {
      console.warn('Lỗi ghi file vào thư mục máy tính, chuyển sang tải file:', err);
    }
  }

  // Fallback: Tự động tải file qua trình duyệt
  if (typeof window !== 'undefined') {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const currentCfg = getAutoBackupConfig();
    saveAutoBackupConfig({
      lastBackupAt: new Date().toISOString(),
      lastBackupHash: data.dataHash,
      totalBackupsSaved: (currentCfg.totalBackupsSaved || 0) + 1,
    });

    return { success: true, method: 'download', filename, sizeBytes };
  }

  return { success: false, method: 'download', filename, sizeBytes: 0, error: 'Không thể xuất file' };
}

// ── VÒNG LẶP KIỂM TRA & TỰ ĐỘNG SAO LƯU (AUTO BACKUP RUNNER) ──
let autoBackupIntervalTimer: NodeJS.Timeout | null = null;

export function startAutoBackupWatcher(onBackupSaved?: (filename: string) => void) {
  if (typeof window === 'undefined') return;
  if (autoBackupIntervalTimer) clearInterval(autoBackupIntervalTimer);

  // Kiểm tra định kỳ mỗi 60 giây xem đã đến lúc sao lưu hay có dữ liệu mới chưa
  autoBackupIntervalTimer = setInterval(async () => {
    const config = getAutoBackupConfig();
    if (!config.enabled) return;

    const lastTime = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0;
    const now = Date.now();
    const intervalMs = config.intervalMinutes * 60 * 1000;

    // Kiểm tra xem đã hết khoảng thời gian cấu hình chưa
    if (now - lastTime >= intervalMs) {
      try {
        const fullData = await gatherFullBakeryData();
        // Nếu có thay đổi so với hash lần trước
        if (fullData.dataHash !== config.lastBackupHash) {
          const res = await saveBackupToFile(fullData, false);
          if (res.success) {
            console.log(`✅ [AutoBackup] Đã tự động sao lưu dữ liệu mới: ${res.filename} (${res.method})`);
            if (onBackupSaved) onBackupSaved(res.filename);
          }
        }
      } catch (e) {
        console.warn('Lỗi trong tiến trình AutoBackup:', e);
      }
    }
  }, 60000);
}

export function stopAutoBackupWatcher() {
  if (autoBackupIntervalTimer) {
    clearInterval(autoBackupIntervalTimer);
    autoBackupIntervalTimer = null;
  }
}
