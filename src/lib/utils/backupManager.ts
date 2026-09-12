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
const SNAPSHOT_STORE = 'snapshots';

const DEFAULT_CONFIG: AutoBackupConfig = {
  enabled: true,
  intervalMinutes: 15,
  folderName: 'Mặc định (Tải về máy tính)',
  totalBackupsSaved: 0,
  autoSaveImages: true,
  keepOnlyLatest: true,
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
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e: any) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
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

// Lưu snapshot dự phòng vào IndexedDB phòng khi người dùng chưa cấp quyền ổ đĩa
export async function storeSnapshotInIndexedDB(data: BakeryBackupData): Promise<void> {
  try {
    const db = await openHandleDB();
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    store.put({
      id: 'latest',
      savedAt: new Date().toISOString(),
      data,
    });
  } catch {}
}

// ── KIỂM TRA HỖ TRỢ FILE SYSTEM ACCESS API ──
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// ── KIỂM TRA VÀ YÊU CẦU QUYỀN TRUY CẬP THƯ MỤC ──
export async function checkDirectoryPermission(dirHandle?: any): Promise<'granted' | 'prompt' | 'denied' | 'no_handle' | 'unsupported'> {
  if (!isFileSystemAccessSupported()) return 'unsupported';
  try {
    const handle = dirHandle || (await getStoredDirectoryHandle());
    if (!handle) return 'no_handle';
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return 'denied';
  }
}

export async function requestDirectoryPermission(dirHandle?: any): Promise<boolean> {
  if (!isFileSystemAccessSupported()) return false;
  try {
    const handle = dirHandle || (await getStoredDirectoryHandle());
    if (!handle) return false;
    const perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      // Sau khi cấp quyền thành công, ngay lập tức tạo 1 bản sao lưu vào thư mục
      try {
        const fullData = await gatherFullBakeryData();
        await saveBackupToFile(fullData, false, false);
      } catch (err) {
        console.warn('Lỗi sao lưu ngay sau khi cấp quyền:', err);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── HÀM QUÉT VÀ XÓA CÁC TỆP SAO LƯU CŨ ĐỂ TIẾT KIỆM BỘ NHỚ Ổ ĐĨA ──
export async function cleanupOldBackupsInDirectory(
  dirHandle: any,
  keepFile = 'latest_backup.bakery.json'
): Promise<{ deletedCount: number; deletedFiles: string[] }> {
  const deletedFiles: string[] = [];
  try {
    const fileNames: string[] = [];
    if (typeof dirHandle.values === 'function') {
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          fileNames.push(entry.name);
        }
      }
    } else if (typeof dirHandle.entries === 'function') {
      for await (const [name, entry] of dirHandle.entries()) {
        if (entry.kind === 'file') {
          fileNames.push(name);
        }
      }
    }

    for (const name of fileNames) {
      // Chỉ giữ lại keepFile và file README hướng dẫn. Xóa tất cả các file sao lưu cũ khác
      if (
        name !== keepFile &&
        name !== 'THU_MUC_SAO_LUU_TIEM_BANH.txt' &&
        (name.endsWith('.bakery.json') || name.startsWith('bakery_backup_') || name.includes('.temp.'))
      ) {
        try {
          await dirHandle.removeEntry(name, { recursive: false });
          deletedFiles.push(name);
          console.log(`[AutoBackup] Đã tự động xóa file cũ: ${name}`);
        } catch (delErr) {
          console.warn(`[AutoBackup] Không thể xóa file ${name}:`, delErr);
        }
      }
    }
  } catch (err) {
    console.warn('[AutoBackup] Lỗi khi dọn dẹp thư mục sao lưu:', err);
  }
  return { deletedCount: deletedFiles.length, deletedFiles };
}

// ── HÀNH ĐỘNG DỌN DẸP FILE CŨ CHỦ ĐỘNG TỪ GIAO DIỆN ──
export async function cleanOldBackupsNow(): Promise<{ success: boolean; deletedCount: number; message: string }> {
  if (!isFileSystemAccessSupported()) {
    return { success: false, deletedCount: 0, message: 'Trình duyệt không hỗ trợ thao tác trực tiếp trên thư mục máy tính.' };
  }
  try {
    const dirHandle = await getStoredDirectoryHandle();
    if (!dirHandle) {
      return { success: false, deletedCount: 0, message: 'Chưa có thư mục nào được liên kết.' };
    }
    const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      const newPerm = await dirHandle.requestPermission({ mode: 'readwrite' });
      if (newPerm !== 'granted') {
        return { success: false, deletedCount: 0, message: 'Chưa được cấp quyền truy cập thư mục.' };
      }
    }
    const res = await cleanupOldBackupsInDirectory(dirHandle, 'latest_backup.bakery.json');
    return {
      success: true,
      deletedCount: res.deletedCount,
      message: res.deletedCount > 0
        ? `Đã dọn dẹp thành công ${res.deletedCount} tệp sao lưu cũ. Thư mục hiện chỉ giữ duy nhất 1 file dữ liệu mới nhất!`
        : `Thư mục đã sạch sẽ! Hiện chỉ lưu duy nhất 1 bản sao lưu mới nhất.`,
    };
  } catch (err: any) {
    return { success: false, deletedCount: 0, message: err.message || 'Lỗi khi quét thư mục' };
  }
}

// ── HÀM GHI TẬP TIN TRỰC TIẾP VÀO DIRECTORY HANDLE (CHỈ GIỮ 1 BẢN MỚI NHẤT, TỰ ĐỘNG XÓA FILE CŨ) ──
async function writeFilesToDirHandle(
  dirHandle: any,
  jsonString: string,
  fullData?: BakeryBackupData
): Promise<string> {
  const targetFilename = 'latest_backup.bakery.json';

  // 1. Ghi đè vào file sao lưu duy nhất latest_backup.bakery.json
  const fileHandle = await dirHandle.getFileHandle(targetFilename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(jsonString);
  await writable.close();

  // 2. 🔥 Tự động quét và xóa sạch các file sao lưu cũ để dung lượng KHÔNG bị phình to
  await cleanupOldBackupsInDirectory(dirHandle, targetFilename);

  // 3. Cập nhật file hướng dẫn nhận biết thư mục tự động
  try {
    const readmeHandle = await dirHandle.getFileHandle('THU_MUC_SAO_LUU_TIEM_BANH.txt', { create: true });
    const readmeWritable = await readmeHandle.createWritable();
    const sizeKb = Math.round(new Blob([jsonString]).size / 1024);
    const prodCount = fullData?.metadata?.totalProducts ?? '---';
    const orderCount = fullData?.metadata?.totalOrders ?? '---';
    const imgCount = fullData?.metadata?.totalImages ?? '---';

    const infoText = 
`=============================================================
THƯ MỤC NHẬN DỮ LIỆU SAO LƯU TỰ ĐỘNG - TIỆM BÁNH ERP & POS
=============================================================
• Thư mục: ${dirHandle.name}
• Trạng thái: ĐÃ KẾT NỐI & TỰ ĐỘNG CẬP NHẬT LIÊN TỤC
• Cơ chế lưu trữ: CHỈ GIỮ 1 FILE MỚI NHẤT (Tự động xóa các file cũ để tối ưu bộ nhớ)
• Tệp sao lưu gần nhất: ${targetFilename} (${sizeKb} KB)
• Lần cập nhật mới nhất: ${new Date().toLocaleString('vi-VN')}
• Thống kê dữ liệu: ${prodCount} loại bánh, ${orderCount} đơn hàng, ${imgCount} hình ảnh

Dữ liệu được cập nhật tự động định kỳ và mỗi khi:
- Quầy POS hoàn tất đơn hàng hoặc đơn đặt bánh mới
- Quản lý cập nhật bánh, giá bán, công thức BOM, kho nguyên liệu
- Ghi nhận hao hụt, phiếu chi OPEX, sổ thu chi két

Để phục hồi dữ liệu: Mở menu Quản trị Admin -> Bấm "Sao Lưu / Phục Hồi" -> 
Chọn "Khôi Phục & Đẩy Lên SQL" và chọn file "${targetFilename}" trong thư mục này.
=============================================================`;
    await readmeWritable.write(infoText);
    await readmeWritable.close();
  } catch {}

  return targetFilename;
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
      saveAutoBackupConfig({ folderName, enabled: true });

      // 🔥 LẬP TỨC SAO LƯU VÀ GHI DỮ LIỆU ĐẦU TIÊN VÀO THƯ MỤC VỪA CHỌN (CHỈ GIỮ 1 FILE MỚI NHẤT, XÓA CŨ)!
      try {
        const fullData = await gatherFullBakeryData();
        const jsonString = JSON.stringify(fullData, null, 2);

        await writeFilesToDirHandle(dirHandle, jsonString, fullData);

        saveAutoBackupConfig({
          lastBackupAt: new Date().toISOString(),
          lastBackupHash: fullData.dataHash,
          totalBackupsSaved: 1,
        });
      } catch (writeErr) {
        console.warn('Lỗi ghi dữ liệu ban đầu vào thư mục vừa chọn:', writeErr);
      }

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
      hash |= 0;
    }
    return 'h-' + Math.abs(hash).toString(36);
  } catch {
    return 'h-' + Date.now();
  }
}

// ── HÀM TRÍCH XUẤT VÀ CHUYỂN ẢNH THÀNH BASE64 AN TOÀN (CÓ TIMEOUT) ──
async function urlOrBlobToBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s tối đa cho mỗi ảnh để không bao giờ bị đơ
    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
    clearTimeout(timeoutId);
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

  // 7. Cấu hình & Chốt sổ
  let vietqrConfig = null;
  let ewalletConfig = null;
  let printerConfig = null;
  let telegramConfig = null;
  let securityConfig = null;
  let cakeCostingConfig: any = null;
  let accountingClosings: any[] = [];

  if (typeof window !== 'undefined') {
    try {
      const rawV = localStorage.getItem('bakery_vietqr_config');
      if (rawV) vietqrConfig = JSON.parse(rawV);
      const rawW = localStorage.getItem('bakery_ewallet_config');
      if (rawW) ewalletConfig = JSON.parse(rawW);
      const rawSec = localStorage.getItem('bakery_security_config');
      if (rawSec) securityConfig = JSON.parse(rawSec);
      const rawCl = localStorage.getItem('bakery_closing_records') || localStorage.getItem('bakery_accounting_closings');
      if (rawCl) accountingClosings = JSON.parse(rawCl);
      const rawCC = localStorage.getItem('bakery_cake_costing_config');
      if (rawCC) cakeCostingConfig = JSON.parse(rawCC);
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
    accounting_closings: accountingClosings,
    security_config: securityConfig,
    settings: {
      vietqr: vietqrConfig,
      ewallet: ewalletConfig,
      printer: printerConfig,
      telegram: telegramConfig,
      branding: getStoreBranding(),
      security: securityConfig,
      cake_costing: cakeCostingConfig,
    },
  };
}

// ── LƯU FILE BACKUP VÀO THƯ MỤC ĐÃ CHỌN HOẶC TẢI VỀ (TỰ ĐỘNG XÓA FILE CŨ, CHỈ GIỮ 1 BẢN MỚI NHẤT) ──
export async function saveBackupToFile(
  data: BakeryBackupData,
  manualDownload = false,
  allowPromptPermission = false
): Promise<{ success: boolean; method: 'directory' | 'download' | 'indexeddb'; filename: string; sizeBytes: number; error?: string }> {
  const filename = 'latest_backup.bakery.json';
  const jsonString = JSON.stringify(data, null, 2);
  const sizeBytes = new Blob([jsonString]).size;

  // Luôn lưu một bản sao an toàn vào IndexedDB dự phòng
  storeSnapshotInIndexedDB(data);

  // 1. Thử ghi vào thư mục máy tính nếu có File System Access API
  if (!manualDownload && isFileSystemAccessSupported()) {
    try {
      const dirHandle = await getStoredDirectoryHandle();
      if (dirHandle) {
        let perm = await dirHandle.queryPermission({ mode: 'readwrite' });
        
        // Nếu quyền là prompt và được phép hỏi (khi người dùng chủ động bấm nút)
        if (perm !== 'granted' && allowPromptPermission) {
          try {
            perm = await dirHandle.requestPermission({ mode: 'readwrite' });
          } catch (e) {
            console.warn('Không thể yêu cầu quyền ghi:', e);
          }
        }

        if (perm === 'granted') {
          const writtenFilename = await writeFilesToDirHandle(dirHandle, jsonString, data);

          const currentCfg = getAutoBackupConfig();
          saveAutoBackupConfig({
            lastBackupAt: new Date().toISOString(),
            lastBackupHash: data.dataHash,
            totalBackupsSaved: (currentCfg.totalBackupsSaved || 0) + 1,
          });

          return { success: true, method: 'directory', filename: writtenFilename, sizeBytes };
        } else {
          console.warn(`[AutoBackup] Thư mục "${dirHandle.name}" đang ở trạng thái quyền: "${perm}".`);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bakery_backup_permission_needed', { detail: { folderName: dirHandle.name, perm } }));
          }
        }
      }
    } catch (err: any) {
      console.warn('Lỗi ghi file vào thư mục máy tính:', err);
    }
  }

  // 2. Nếu là thao tác tải thủ công do người dùng bấm nút tải
  if (manualDownload && typeof window !== 'undefined') {
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

  // Nếu là chạy ngầm tự động và chưa ghi được vào ổ đĩa do thiếu quyền: đã lưu IndexedDB thành công
  return { 
    success: true, 
    method: 'indexeddb', 
    filename, 
    sizeBytes, 
    error: 'Đã lưu an toàn vào cơ sở dữ liệu trình duyệt (cần cấp lại quyền thư mục máy tính để ghi ra file)' 
  };
}

// ── VÒNG LẶP KIỂM TRA & TỰ ĐỘNG SAO LƯU (AUTO BACKUP RUNNER) ──
let autoBackupIntervalTimer: NodeJS.Timeout | null = null;
let isWatcherInitialized = false;
let backupDebounceTimeout: NodeJS.Timeout | null = null;

// Hàm kiểm tra và thực hiện sao lưu nếu thỏa mãn điều kiện
export async function triggerAutoBackupIfDue(onBackupSaved?: (filename: string) => void): Promise<boolean> {
  const config = getAutoBackupConfig();
  if (!config.enabled) return false;

  try {
    const fullData = await gatherFullBakeryData();
    // Nếu có thay đổi so với hash lần trước
    if (fullData.dataHash !== config.lastBackupHash) {
      const res = await saveBackupToFile(fullData, false, false);
      if (res.success) {
        console.log(`✅ [AutoBackup] Đã tự động sao lưu dữ liệu mới: ${res.filename} (${res.method})`);
        if (onBackupSaved) onBackupSaved(res.filename);
        return true;
      }
    }
  } catch (e) {
    console.warn('Lỗi trong tiến trình AutoBackup:', e);
  }
  return false;
}

export function startAutoBackupWatcher(onBackupSaved?: (filename: string) => void) {
  if (typeof window === 'undefined') return;
  if (isWatcherInitialized) return;
  isWatcherInitialized = true;

  // 1. Kiểm tra ngay khi khởi động
  setTimeout(() => {
    triggerAutoBackupIfDue(onBackupSaved);
  }, 3000);

  // 2. Kiểm tra định kỳ mỗi 60 giây
  if (autoBackupIntervalTimer) clearInterval(autoBackupIntervalTimer);
  autoBackupIntervalTimer = setInterval(() => {
    const config = getAutoBackupConfig();
    if (!config.enabled) return;

    const lastTime = config.lastBackupAt ? new Date(config.lastBackupAt).getTime() : 0;
    const now = Date.now();
    const intervalMs = (config.intervalMinutes || 15) * 60 * 1000;

    // Nếu đã qua khoảng thời gian định kỳ hoặc chưa từng sao lưu
    if (now - lastTime >= intervalMs) {
      triggerAutoBackupIfDue(onBackupSaved);
    }
  }, 60000);

  // 3. Lắng nghe các sự kiện phát sinh dữ liệu (Tạo đơn hàng, xuất nhập kho, thay đổi giá bánh)
  const handleDataChange = () => {
    if (backupDebounceTimeout) clearTimeout(backupDebounceTimeout);
    backupDebounceTimeout = setTimeout(() => {
      triggerAutoBackupIfDue(onBackupSaved);
    }, 4000); // Đợi 4 giây sau thao tác cuối cùng để gom cụm sao lưu
  };

  window.addEventListener('bakery_orders_updated', handleDataChange);
  window.addEventListener('bakery_products_updated', handleDataChange);
  window.addEventListener('bakery_stocks_updated', handleDataChange);
  window.addEventListener('bakery_spoilage_updated', handleDataChange);
  window.addEventListener('storage', handleDataChange);
}

export function stopAutoBackupWatcher() {
  if (autoBackupIntervalTimer) {
    clearInterval(autoBackupIntervalTimer);
    autoBackupIntervalTimer = null;
  }
  if (backupDebounceTimeout) {
    clearTimeout(backupDebounceTimeout);
    backupDebounceTimeout = null;
  }
  isWatcherInitialized = false;
}
