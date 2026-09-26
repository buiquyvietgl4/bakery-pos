// src/lib/utils/backupReconciler.ts

import { 
  BakeryBackupData, 
  ReconciliationReport, 
  ReconciliationItem, 
  MergeMode, 
  EntityType 
} from '@/lib/types/backup';
import { supabase } from '@/lib/supabase/client';
import { db } from '@/lib/db/dexie';
import { getStockAdjustmentLogs, saveStockAdjustmentLogsToDb } from './stockAdjustmentManager';
import { getSpoilageLogs, saveSpoilageLogs, saveSpoilageLogsToDb } from './spoilageManager';
import { saveExpensesToDb } from './accountingSync';
import { saveVietqrConfigToDb, saveEwalletConfigToDb } from './paymentSync';
import { saveStoreBranding, saveStoreBrandingToDb } from './storeBranding';
import { syncCakeBomConfigToDb } from './cakeBomManager';
import { filterActiveProducts } from './productManager';
import { saveSecurityConfigToDb } from '@/lib/auth/AuthContext';
import { saveShiftHistoryToDb, saveCurrentShiftToDb } from './shiftSync';
import { saveClosingRecordsToDb } from './closingManager';
import { saveCakeCostingConfigToDb } from './customCakeCosting';
import { restorePrintTemplatesFromBackup } from './printTemplateManager';

const BASE_BUCKET = 'bakery-images';

/**
 * Hàm hỗ trợ chuyển Base64 Data URL sang File / Blob để tải lên Supabase Storage
 */
function dataUrlToBlob(dataUrl: string, defaultName = 'image.png'): { blob: Blob; fileName: string; contentType: string } {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const contentType = mimeMatch ? mimeMatch[1] : 'image/png';
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([ab], { type: contentType });
  const ext = contentType.split('/')[1] || 'png';
  const fileName = `${defaultName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.${ext}`;
  return { blob, fileName, contentType };
}

/**
 * Lấy toàn bộ dữ liệu hiện tại trong hệ thống (Supabase + LocalStorage + Dexie) để đối soát
 */
async function fetchCurrentSystemState() {
  // 1. Sản phẩm
  let currentProducts: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_products');
      if (raw) currentProducts = filterActiveProducts(JSON.parse(raw));
    } catch {}
  }
  try {
    const { data: dbProds } = await supabase.from('products').select('*').limit(500);
    if (dbProds && dbProds.length > 0) {
      const activeDbProds = filterActiveProducts(dbProds);
      activeDbProds.forEach((dp) => {
        const idx = currentProducts.findIndex((p) => p.id === dp.id || p.name?.toLowerCase().trim() === dp.name?.toLowerCase().trim());
        if (idx >= 0) {
          currentProducts[idx] = { ...currentProducts[idx], ...dp };
        } else {
          currentProducts.push(dp);
        }
      });
    }
  } catch {}
  currentProducts = filterActiveProducts(currentProducts);

  // 2. Nguyên vật liệu
  let currentIngredients: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_ingredients');
      if (raw) currentIngredients = JSON.parse(raw);
    } catch {}
  }
  try {
    const { data: dbIngs } = await supabase.from('ingredients').select('*').limit(500);
    if (dbIngs && dbIngs.length > 0) {
      dbIngs.forEach((di) => {
        const idx = currentIngredients.findIndex((i) => i.id === di.id || i.name?.toLowerCase().trim() === di.name?.toLowerCase().trim());
        if (idx >= 0) {
          currentIngredients[idx] = { ...currentIngredients[idx], ...di };
        } else {
          currentIngredients.push(di);
        }
      });
    }
  } catch {}

  // 3. Công thức
  let currentRecipes: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_recipes');
      if (raw) currentRecipes = JSON.parse(raw);
    } catch {}
  }

  // 4. Lịch sử kho & Hao hụt
  const currentStockAdjustments = getStockAdjustmentLogs();
  const currentSpoilage = getSpoilageLogs();

  // 5. Đơn hàng
  let currentOrders: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('bakery_orders');
      if (raw) currentOrders = JSON.parse(raw);
    } catch {}
  }
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
    if (dbOrders && dbOrders.length > 0) {
      dbOrders.forEach((dbo: any) => {
        const idx = currentOrders.findIndex((o) => o.order_number === dbo.order_number || o.id === dbo.id);
        if (idx >= 0) {
          const STATUS_RANK: Record<string, number> = {
            pending: 1,
            preparing: 2,
            ready: 3,
            completed: 4,
            cancelled: 0,
            refunded: 0,
            partially_refunded: 0,
          };
          const localRank = STATUS_RANK[currentOrders[idx].status || ''] || 0;
          const dbRank = STATUS_RANK[dbo.status || ''] || 0;
          const isRemake = Boolean(
            dbo.remake_reason ||
            currentOrders[idx].remake_reason ||
            dbo.notes?.includes('làm lại từ đầu') ||
            currentOrders[idx].notes?.includes('làm lại từ đầu')
          );
          const isTerminal = dbo.status === 'cancelled' || dbo.status === 'refunded' || dbo.status === 'partially_refunded';
          const bestStatus = (localRank > dbRank && !isTerminal && !isRemake)
            ? currentOrders[idx].status
            : (dbo.status || currentOrders[idx].status);
          currentOrders[idx] = { ...currentOrders[idx], ...dbo, status: bestStatus };
        } else {
          currentOrders.unshift(dbo);
        }
      });
    }
  } catch {}

  // 6. Thu chi
  let currentExpenses: any[] = [];
  let currentCashflow: any[] = [];
  if (typeof window !== 'undefined') {
    try {
      const rawE = localStorage.getItem('bakery_expenses');
      if (rawE) currentExpenses = JSON.parse(rawE);
      const rawC = localStorage.getItem('bakery_cashflow');
      if (rawC) currentCashflow = JSON.parse(rawC);
    } catch {}
  }

  return {
    products: currentProducts,
    ingredients: currentIngredients,
    recipes: currentRecipes,
    stockAdjustments: currentStockAdjustments,
    spoilage: currentSpoilage,
    orders: currentOrders,
    expenses: currentExpenses,
    cashflow: currentCashflow,
  };
}

/**
 * ĐỐI SOÁT THÔNG MINH (SMART RECONCILIATION)
 * So sánh từng bản ghi trong file backup với dữ liệu hiện tại
 * Xác định chính xác: MỚI (new), TRÙNG KHỚP (identical), hay CẬP NHẬT (updated)
 */
export async function reconcileBackupWithCurrentState(backupData: BakeryBackupData): Promise<ReconciliationReport> {
  const current = await fetchCurrentSystemState();

  const byEntity: ReconciliationReport['byEntity'] = {
    orders: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
    products: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
    ingredients: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
    recipes: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
    stock_adjustments: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
    spoilage_logs: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
    expenses: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
    cashflow: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
    images: { total: 0, newCount: 0, identicalCount: 0, updatedCount: 0, items: [] },
  };

  // ── 1. ĐỐI SOÁT ĐƠN HÀNG ──
  const backupOrders = backupData.orders || [];
  byEntity.orders.total = backupOrders.length;
  for (const bo of backupOrders) {
    const existing = current.orders.find(
      (co) => (bo.order_number && co.order_number === bo.order_number) || (bo.id && co.id === bo.id)
    );

    if (!existing) {
      byEntity.orders.newCount++;
      byEntity.orders.items.push({
        entityType: 'orders',
        id: bo.id || bo.order_number,
        identifier: bo.order_number,
        displayName: `Đơn #${bo.order_number} (${bo.customer_name || 'Khách vãng lai'})`,
        status: 'new',
        details: `Đơn mới: ${bo.total_amount?.toLocaleString('vi-VN')} đ, trạng thái ${bo.status}`,
        backupItem: bo,
      });
    } else {
      // Kiểm tra xem có gì thay đổi giữa backup và hiện tại không
      const statusDiff = bo.status !== existing.status;
      const amountDiff = Math.abs((Number(bo.total_amount) || 0) - (Number(existing.total_amount) || 0)) > 1;
      const dbHasItems = Array.isArray(existing.order_items) && existing.order_items.length > 0;
      const localHasItems = Array.isArray(existing.items) && existing.items.length > 0;
      const existingCount = dbHasItems ? existing.order_items.length : (localHasItems ? existing.items.length : 0);
      const itemsCountDiff = (bo.items?.length || 0) !== existingCount;
      const dbMissingItems = (bo.items?.length || 0) > 0 && !dbHasItems;
      const itemsDiff = itemsCountDiff || dbMissingItems;

      if (statusDiff || amountDiff || itemsDiff) {
        byEntity.orders.updatedCount++;
        const changes: string[] = [];
        if (statusDiff) changes.push(`Trạng thái: ${existing.status} ➔ ${bo.status}`);
        if (amountDiff) changes.push(`Tổng tiền: ${existing.total_amount} ➔ ${bo.total_amount}`);
        if (dbMissingItems) changes.push(`Bổ sung chi tiết món lên CSDL Cloud (${bo.items?.length || 0} món)`);
        else if (itemsCountDiff) changes.push(`Số món bánh: ${existingCount} ➔ ${bo.items?.length || 0}`);

        byEntity.orders.items.push({
          entityType: 'orders',
          id: bo.id || bo.order_number,
          identifier: bo.order_number,
          displayName: `Đơn #${bo.order_number} (${bo.customer_name || 'Khách lẻ'})`,
          status: 'updated',
          details: changes.join(', '),
          existingItem: existing,
          backupItem: bo,
        });
      } else {
        byEntity.orders.identicalCount++;
        byEntity.orders.items.push({
          entityType: 'orders',
          id: bo.id || bo.order_number,
          identifier: bo.order_number,
          displayName: `Đơn #${bo.order_number}`,
          status: 'identical',
          details: 'Dữ liệu trùng khớp 100%, không cần ghi đè',
          existingItem: existing,
          backupItem: bo,
        });
      }
    }
  }

  // ── 2. ĐỐI SOÁT SẢN PHẨM ──
  const backupProds = backupData.products || [];
  byEntity.products.total = backupProds.length;
  for (const bp of backupProds) {
    const existing = current.products.find(
      (cp) => (bp.id && cp.id === bp.id) || (bp.name && cp.name?.toLowerCase().trim() === bp.name.toLowerCase().trim())
    );

    if (!existing) {
      byEntity.products.newCount++;
      byEntity.products.items.push({
        entityType: 'products',
        id: bp.id,
        identifier: bp.name,
        displayName: bp.name,
        status: 'new',
        details: `Sản phẩm mới: ${bp.selling_price?.toLocaleString('vi-VN')} đ (${bp.category})`,
        backupItem: bp,
      });
    } else {
      const priceDiff = Math.abs((Number(bp.selling_price) || 0) - (Number(existing.selling_price) || 0)) > 1;
      const imgDiff = !existing.image_url && !!bp.image_url;
      const catDiff = bp.category && existing.category && bp.category !== existing.category;

      if (priceDiff || imgDiff || catDiff) {
        byEntity.products.updatedCount++;
        const changes: string[] = [];
        if (priceDiff) changes.push(`Giá: ${existing.selling_price} ➔ ${bp.selling_price}`);
        if (imgDiff) changes.push('Có ảnh mới trong backup');
        if (catDiff) changes.push(`Danh mục: ${existing.category} ➔ ${bp.category}`);

        byEntity.products.items.push({
          entityType: 'products',
          id: bp.id,
          identifier: bp.name,
          displayName: bp.name,
          status: 'updated',
          details: changes.join(', '),
          existingItem: existing,
          backupItem: bp,
        });
      } else {
        byEntity.products.identicalCount++;
        byEntity.products.items.push({
          entityType: 'products',
          id: bp.id,
          identifier: bp.name,
          displayName: bp.name,
          status: 'identical',
          details: 'Đã tồn tại và hoàn toàn trùng khớp',
          existingItem: existing,
          backupItem: bp,
        });
      }
    }
  }

  // ── 3. ĐỐI SOÁT NGUYÊN VẬT LIỆU ──
  const backupIngs = backupData.ingredients || [];
  byEntity.ingredients.total = backupIngs.length;
  for (const bi of backupIngs) {
    const existing = current.ingredients.find(
      (ci) => bi.name && ci.name?.toLowerCase().trim() === bi.name.toLowerCase().trim()
    );

    if (!existing) {
      byEntity.ingredients.newCount++;
      byEntity.ingredients.items.push({
        entityType: 'ingredients',
        id: bi.id || bi.name,
        identifier: bi.name,
        displayName: bi.name,
        status: 'new',
        details: `Vật tư mới: ${bi.stock_qty} ${bi.unit} (giá vốn ~${(bi.avg_cost || 0).toLocaleString('vi-VN')}₫)`,
        backupItem: bi,
      });
    } else {
      const qtyDiff = Math.abs((Number(bi.stock_qty) || 0) - (Number(existing.stock_qty) || 0)) > 0.01;
      const costDiff = Math.abs((Number(bi.avg_cost) || 0) - (Number(existing.avg_cost) || 0)) > 1;

      if (qtyDiff || costDiff) {
        byEntity.ingredients.updatedCount++;
        const changes: string[] = [];
        if (qtyDiff) changes.push(`Tồn kho: ${existing.stock_qty} ➔ ${bi.stock_qty} ${bi.unit}`);
        if (costDiff) changes.push(`Giá vốn: ${(existing.avg_cost || 0).toLocaleString('vi-VN')}₫ ➔ ${(bi.avg_cost || 0).toLocaleString('vi-VN')}₫`);

        byEntity.ingredients.items.push({
          entityType: 'ingredients',
          id: bi.id || bi.name,
          identifier: bi.name,
          displayName: bi.name,
          status: 'updated',
          details: changes.join(', '),
          existingItem: existing,
          backupItem: bi,
        });
      } else {
        byEntity.ingredients.identicalCount++;
        byEntity.ingredients.items.push({
          entityType: 'ingredients',
          id: bi.id || bi.name,
          identifier: bi.name,
          displayName: bi.name,
          status: 'identical',
          details: 'Đã có trong kho và khớp số liệu',
          existingItem: existing,
          backupItem: bi,
        });
      }
    }
  }

  // ── 4. ĐỐI SOÁT CÔNG THỨC (RECIPES) ──
  const backupRecipes = backupData.recipes || [];
  byEntity.recipes.total = backupRecipes.length;
  for (const br of backupRecipes) {
    const existing = current.recipes.find(
      (cr) => br.name && cr.name?.toLowerCase().trim() === br.name.toLowerCase().trim()
    );

    if (!existing) {
      byEntity.recipes.newCount++;
      byEntity.recipes.items.push({
        entityType: 'recipes',
        id: br.id || br.name,
        identifier: br.name,
        displayName: br.name,
        status: 'new',
        details: `Công thức mới: định lượng ${br.yield_qty} ${br.yield_unit}`,
        backupItem: br,
      });
    } else {
      const itemsCountDiff = (br.items?.length || 0) !== (existing.items?.length || 0);
      if (itemsCountDiff) {
        byEntity.recipes.updatedCount++;
        byEntity.recipes.items.push({
          entityType: 'recipes',
          id: br.id || br.name,
          identifier: br.name,
          displayName: br.name,
          status: 'updated',
          details: `Thành phần nguyên liệu thay đổi (${existing.items?.length || 0} ➔ ${br.items?.length || 0})`,
          existingItem: existing,
          backupItem: br,
        });
      } else {
        byEntity.recipes.identicalCount++;
        byEntity.recipes.items.push({
          entityType: 'recipes',
          id: br.id || br.name,
          identifier: br.name,
          displayName: br.name,
          status: 'identical',
          details: 'Công thức đã có sẵn và trùng khớp',
          existingItem: existing,
          backupItem: br,
        });
      }
    }
  }

  // ── 5. ĐỐI SOÁT LỊCH SỬ KHO (STOCK LOGS) ──
  const backupStock = backupData.stock_adjustments || [];
  byEntity.stock_adjustments.total = backupStock.length;
  for (const bs of backupStock) {
    const existing = current.stockAdjustments.find(
      (cs) => cs.id === bs.id || (cs.productId === bs.productId && cs.adjustedAt === bs.adjustedAt)
    );
    if (!existing) {
      byEntity.stock_adjustments.newCount++;
      byEntity.stock_adjustments.items.push({
        entityType: 'stock_adjustments',
        id: bs.id,
        identifier: bs.productName,
        displayName: `${bs.productName}: ${bs.oldQuantity} ➔ ${bs.newQuantity}`,
        status: 'new',
        details: `Lý do: ${bs.reason || 'Không rõ'} (${bs.adjustedAt?.slice(0, 16)})`,
        backupItem: bs,
      });
    } else {
      byEntity.stock_adjustments.identicalCount++;
      byEntity.stock_adjustments.items.push({
        entityType: 'stock_adjustments',
        id: bs.id,
        identifier: bs.productName,
        displayName: `${bs.productName} (Đã có)`,
        status: 'identical',
        details: 'Bản ghi lịch sử đã có, tự động giữ nguyên',
        existingItem: existing,
        backupItem: bs,
      });
    }
  }

  // ── 6. ĐỐI SOÁT HAO HỤT (SPOILAGE LOGS) ──
  const backupSpoilage = backupData.spoilage_logs || [];
  byEntity.spoilage_logs.total = backupSpoilage.length;
  for (const bsp of backupSpoilage) {
    const existing = current.spoilage.find(
      (csp) => csp.id === bsp.id || (csp.loggedAt === bsp.loggedAt && csp.productName === bsp.productName)
    );
    if (!existing) {
      byEntity.spoilage_logs.newCount++;
      byEntity.spoilage_logs.items.push({
        entityType: 'spoilage_logs',
        id: bsp.id,
        identifier: bsp.productName,
        displayName: `Hỏng ${bsp.quantity} ${bsp.productName}`,
        status: 'new',
        details: `Lý do: ${bsp.reason || 'Không rõ'} (${bsp.loggedAt?.slice(0, 16)})`,
        backupItem: bsp,
      });
    } else {
      byEntity.spoilage_logs.identicalCount++;
      byEntity.spoilage_logs.items.push({
        entityType: 'spoilage_logs',
        id: bsp.id,
        identifier: bsp.productName,
        displayName: `${bsp.productName} (Đã có)`,
        status: 'identical',
        details: 'Bản ghi hao hụt đã tồn tại',
        existingItem: existing,
        backupItem: bsp,
      });
    }
  }

  // ── 7. ĐỐI SOÁT CHI PHÍ & DÒNG TIỀN ──
  const backupExpenses = backupData.expenses || [];
  byEntity.expenses.total = backupExpenses.length;
  for (const be of backupExpenses) {
    const existing = current.expenses.find(
      (ce) => ce.id === be.id || (ce.date === be.date && ce.amount === be.amount && ce.category === be.category)
    );
    if (!existing) {
      byEntity.expenses.newCount++;
      byEntity.expenses.items.push({
        entityType: 'expenses',
        id: be.id,
        identifier: be.category,
        displayName: `Chi ${be.amount?.toLocaleString('vi-VN')} đ: ${be.category}`,
        status: 'new',
        details: be.description || be.date,
        backupItem: be,
      });
    } else {
      byEntity.expenses.identicalCount++;
      byEntity.expenses.items.push({
        entityType: 'expenses',
        id: be.id,
        identifier: be.category,
        displayName: `Khoản chi ${be.amount?.toLocaleString('vi-VN')} đ (Đã có)`,
        status: 'identical',
        details: 'Đã có trong sổ chi tiêu',
        existingItem: existing,
        backupItem: be,
      });
    }
  }

  // ── 8. ĐỐI SOÁT HÌNH ẢNH ──
  const backupImages = backupData.images || [];
  byEntity.images.total = backupImages.length;
  for (const img of backupImages) {
    let alreadyHasImage = false;
    if (img.type === 'product' && img.associatedId) {
      const prod = current.products.find((p) => p.id === img.associatedId);
      if (prod?.image_url && !prod.image_url.startsWith('data:')) {
        alreadyHasImage = true;
      }
    } else if (img.type === 'preorder' && img.associatedId) {
      const ord = current.orders.find((o) => o.order_number === img.associatedId);
      if (ord?.reference_image_url && !ord.reference_image_url.startsWith('data:')) {
        alreadyHasImage = true;
      }
    }

    if (!alreadyHasImage) {
      byEntity.images.newCount++;
      byEntity.images.items.push({
        entityType: 'images',
        id: img.id,
        identifier: img.name,
        displayName: `${img.name} (${Math.round(img.sizeBytes / 1024)} KB)`,
        status: 'new',
        details: `Cần đẩy lên Storage: ${img.type}`,
        backupItem: img,
      });
    } else {
      byEntity.images.identicalCount++;
      byEntity.images.items.push({
        entityType: 'images',
        id: img.id,
        identifier: img.name,
        displayName: `${img.name} (Đã có trên Storage)`,
        status: 'identical',
        details: 'Ảnh đã tồn tại trên Cloud/SQL',
        backupItem: img,
      });
    }
  }

  // TỔNG HỢP TOÀN BỘ
  let totalBackupItems = 0;
  let newItemsCount = 0;
  let identicalItemsCount = 0;
  let updatedItemsCount = 0;

  (Object.keys(byEntity) as EntityType[]).forEach((key) => {
    totalBackupItems += byEntity[key].total;
    newItemsCount += byEntity[key].newCount;
    identicalItemsCount += byEntity[key].identicalCount;
    updatedItemsCount += byEntity[key].updatedCount;
  });

  return {
    summary: {
      totalBackupItems,
      newItemsCount,
      identicalItemsCount,
      updatedItemsCount,
    },
    byEntity,
  };
}

/**
 * THỰC THI ĐẨY DỮ LIỆU LÊN SQL VÀ HỆ THỐNG (RESTORE / PUSH TO SQL)
 * Theo chế độ gộp: Smart Merge, Append Only, hoặc Full Overwrite
 */
export async function executePushToSQL(
  backupData: BakeryBackupData,
  report: ReconciliationReport,
  mergeMode: MergeMode,
  onProgress?: (percent: number, msg: string) => void
): Promise<{
  success: boolean;
  message: string;
  details: {
    productsPushed: number;
    ingredientsPushed: number;
    recipesPushed: number;
    ordersPushed: number;
    imagesUploaded: number;
    stockLogsPushed: number;
    spoilageLogsPushed: number;
    expensesPushed: number;
    brandingPushed: boolean;
  };
}> {
  const details = {
    productsPushed: 0,
    ingredientsPushed: 0,
    recipesPushed: 0,
    ordersPushed: 0,
    imagesUploaded: 0,
    stockLogsPushed: 0,
    spoilageLogsPushed: 0,
    expensesPushed: 0,
    brandingPushed: false,
  };

  const notify = (percent: number, msg: string) => {
    if (onProgress) onProgress(percent, msg);
  };

  try {
    notify(5, 'Đang chuẩn bị và kiểm tra kết nối Supabase...');

    if (typeof window !== 'undefined' && (window as any).__IS_SYSTEM_WIPING__) {
      return { success: false, message: 'Hệ thống đang trong quá trình reset, không thể đẩy dữ liệu.', details };
    }

    // ── BƯỚC 1: TẢI HÌNH ẢNH LÊN SUPABASE STORAGE BUCKET bakery-images ──
    notify(10, 'Đang khôi phục và tải hình ảnh lên Cloud Storage...');
    const uploadedImageUrlMap = new Map<string, string>();

    const imagesToProcess = (backupData.images && backupData.images.length > 0)
      ? report.byEntity.images.items.filter((it) => {
          if (mergeMode === 'append_only') return it.status === 'new';
          if (mergeMode === 'smart_merge') return it.status === 'new';
          return true; // full_overwrite
        })
      : [];

    for (let i = 0; i < imagesToProcess.length; i++) {
      const it = imagesToProcess[i];
      const imgItem = it.backupItem;
      if (imgItem?.dataUrl && imgItem.dataUrl.startsWith('data:image/')) {
        try {
          const { blob, fileName, contentType } = dataUrlToBlob(imgItem.dataUrl, imgItem.associatedId || 'restored_img');
          const path = `restored/${imgItem.type || 'misc'}/${fileName}`;

          const { data: sData, error: sErr } = await supabase.storage
            .from(BASE_BUCKET)
            .upload(path, blob, { contentType, upsert: true });

          if (!sErr && sData?.path) {
            const { data: uData } = supabase.storage.from(BASE_BUCKET).getPublicUrl(sData.path);
            if (uData?.publicUrl) {
              uploadedImageUrlMap.set(imgItem.id, uData.publicUrl);
              if (imgItem.associatedId) {
                uploadedImageUrlMap.set(imgItem.associatedId, uData.publicUrl);
              }
              details.imagesUploaded++;
            }
          }
        } catch (imgErr) {
          console.warn(`Không thể upload ảnh ${imgItem.name} lên storage:`, imgErr);
        }
      }
    }

    // ── BƯỚC 2: ĐẨY SẢN PHẨM LÊN SUPABASE & LOCALSTORAGE ──
    notify(25, 'Đang đối soát và đẩy Sản phẩm vào CSDL...');
    const productsToPush = (backupData.products && backupData.products.length > 0)
      ? report.byEntity.products.items.filter((it) => {
          if (mergeMode === 'append_only') return it.status === 'new';
          if (mergeMode === 'smart_merge') return it.status === 'new' || it.status === 'updated';
          return true; // full_overwrite
        })
      : [];

    if (productsToPush.length > 0) {
      let currentProds: any[] = [];
      try {
        const raw = localStorage.getItem('bakery_products');
        if (raw) currentProds = JSON.parse(raw);
      } catch {}

      for (const item of productsToPush) {
        const bp = item.backupItem;
        const newImgUrl = uploadedImageUrlMap.get(bp.id) || uploadedImageUrlMap.get('img-prod-' + bp.id) || bp.image_url;

        // Chỉ gửi các cột hợp lệ tồn tại trong CSDL Supabase table products:
        // ['id', 'name', 'category', 'image_url', 'base_cost_price', 'selling_price', 'food_cost_pct', 'is_active', 'is_preorder_only', 'recipe_id', 'created_at', 'updated_at']
        const dbProdRecord: any = {
          id: bp.id,
          name: bp.name,
          category: bp.category || 'Bánh Kem',
          selling_price: Number(bp.selling_price || bp.price || 0),
          base_cost_price: Number(bp.base_cost_price || bp.import_price || Math.round((bp.selling_price || 0) * 0.33)),
          image_url: newImgUrl || null,
          is_preorder_only: bp.is_preorder_only ?? false,
          is_active: bp.is_active ?? true,
          updated_at: new Date().toISOString(),
        };
        if (bp.created_at) {
          dbProdRecord.created_at = bp.created_at;
        }

        // Bản ghi đầy đủ mở rộng cho LocalStorage và IndexedDB Dexie
        const localProdRecord = {
          ...dbProdRecord,
          product_type: bp.product_type || 'produced',
          import_price: bp.import_price !== undefined ? Number(bp.import_price) : undefined,
          supplier_name: bp.supplier_name || null,
          barcode: bp.barcode || null,
        };

        try {
          const { error: prodErr } = await supabase.from('products').upsert(dbProdRecord, { onConflict: 'id' });
          if (prodErr) {
            console.warn('Lỗi upsert product Supabase:', prodErr.message);
          }
        } catch (dbErr) {
          console.warn('Lỗi upsert product Supabase:', dbErr);
        }

        try {
          await db.products.put(localProdRecord as any);
        } catch {}

        const idx = currentProds.findIndex((p) => p.id === bp.id || p.name?.toLowerCase().trim() === bp.name?.toLowerCase().trim());
        if (idx >= 0) {
          currentProds[idx] = { ...currentProds[idx], ...localProdRecord };
        } else {
          currentProds.unshift(localProdRecord);
        }

        details.productsPushed++;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_products', JSON.stringify(currentProds));
      }
    }

    // ── BƯỚC 3: ĐẨY NGUYÊN VẬT LIỆU KHO ──
    notify(45, 'Đang đồng bộ Nguyên vật liệu & Tồn kho vào CSDL...');
    const ingredientsToPush = (backupData.ingredients && backupData.ingredients.length > 0)
      ? report.byEntity.ingredients.items.filter((it) => {
          if (mergeMode === 'append_only') return it.status === 'new';
          if (mergeMode === 'smart_merge') return it.status === 'new' || it.status === 'updated';
          return true;
        })
      : [];

    if (ingredientsToPush.length > 0) {
      let currentIngs: any[] = [];
      try {
        const raw = localStorage.getItem('bakery_ingredients');
        if (raw) currentIngs = JSON.parse(raw);
      } catch {}

      for (const item of ingredientsToPush) {
        const bi = item.backupItem;
        const ingRecord = {
          id: bi.id,
          name: bi.name,
          unit: bi.unit || 'g',
          category: bi.category || 'Vật tư làm bánh',
          stock_qty: Number(bi.stock_qty || 0),
          reorder_level: Number(bi.reorder_level || 500),
          avg_cost: Number(bi.avg_cost || 0),
          wastage_pct: Number(bi.wastage_pct || 0),
        };

        try {
          const { data: existDb } = await supabase.from('ingredients').select('id').eq('name', bi.name).maybeSingle();
          if (existDb) {
            await supabase.from('ingredients').update(ingRecord).eq('id', existDb.id);
          } else {
            await supabase.from('ingredients').insert(ingRecord);
          }
        } catch (ingErr) {
          console.warn('Lỗi push ingredient Supabase:', ingErr);
        }

        const idx = currentIngs.findIndex((i) => i.name?.toLowerCase().trim() === bi.name?.toLowerCase().trim());
        if (idx >= 0) {
          currentIngs[idx] = { ...currentIngs[idx], ...ingRecord };
        } else {
          currentIngs.push(ingRecord);
        }

        details.ingredientsPushed++;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_ingredients', JSON.stringify(currentIngs));
      }
    }

    // ── BƯỚC 4: ĐẨY CÔNG THỨC (RECIPES & RECIPE_ITEMS) ──
    notify(60, 'Đang đồng bộ Công thức & Định mức BOM...');
    const recipesToPush = (backupData.recipes && backupData.recipes.length > 0)
      ? report.byEntity.recipes.items.filter((it) => {
          if (mergeMode === 'append_only') return it.status === 'new';
          if (mergeMode === 'smart_merge') return it.status === 'new' || it.status === 'updated';
          return true;
        })
      : [];

    if (recipesToPush.length > 0) {
      let currentRecs: any[] = [];
      try {
        const raw = localStorage.getItem('bakery_recipes');
        if (raw) currentRecs = JSON.parse(raw);
      } catch {}

      // Tải trước danh sách nguyên liệu hiện có từ Supabase để ánh xạ an toàn
      const { data: currentIngredients } = await supabase.from('ingredients').select('id, name');
      const ingNameMap = new Map<string, string>();
      (currentIngredients || []).forEach((ci: any) => {
        if (ci.name && ci.id) ingNameMap.set(ci.name.toLowerCase().trim(), ci.id);
      });

      for (const item of recipesToPush) {
        const br = item.backupItem;
        const isValidUUID = (id?: string) =>
          Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
        const recipeId = isValidUUID(br.id) ? br.id : crypto.randomUUID();

        // Xác định danh sách items chuẩn xác (ưu tiên br.items, fallback qua notes, rồi qua template)
        let effectiveItems: any[] = Array.isArray(br.items) ? br.items : [];
        if (effectiveItems.length === 0 && br.notes && typeof br.notes === 'string' && br.notes.trim().startsWith('{')) {
          try {
            const p = JSON.parse(br.notes);
            if (Array.isArray(p.items) && p.items.length > 0) effectiveItems = p.items;
          } catch {}
        }
        if (effectiveItems.length === 0) {
          const { DEFAULT_BAKERY_RECIPES } = await import('@/lib/constants/bakeryData');
          const matched = DEFAULT_BAKERY_RECIPES.find(
            (dr) => dr.name?.toLowerCase().trim() === br.name?.toLowerCase().trim() || dr.id === br.id
          );
          if (matched && Array.isArray(matched.items)) effectiveItems = matched.items;
        }

        const bakeTime = Number(br.bake_time_minutes) > 0 ? Number(br.bake_time_minutes) : 25;
        const bakeTemp = Number(br.bake_temp_celsius) > 0 ? Number(br.bake_temp_celsius) : 190;
        const notesObj = {
          bake_time_minutes: bakeTime,
          bake_temp_celsius: bakeTemp,
          notes: typeof br.notes === 'string' && !br.notes.startsWith('{') ? br.notes : '',
          items: effectiveItems,
        };

        try {
          await supabase.from('recipes').delete().eq('name', br.name);

          await supabase.from('recipes').insert({
            id: recipeId,
            name: br.name,
            yield_qty: Number(br.yield_qty || 1),
            yield_unit: br.yield_unit || 'chiếc',
            total_material_cost: Number(br.total_material_cost || 0),
            cost_per_unit: Number(br.cost_per_unit || 0),
            notes: JSON.stringify(notesObj),
            is_active: true,
          });

          if (effectiveItems.length > 0) {
            const itemsToInsert = effectiveItems.map((it: any) => {
              let ingId = it.ingredient_id;
              if (!isValidUUID(ingId)) {
                const foundId = ingNameMap.get((it.name || '').toLowerCase().trim());
                if (foundId) ingId = foundId;
              }
              return {
                recipe_id: recipeId,
                ingredient_id: ingId,
                quantity: Number(it.quantity || it.qty || 0),
                unit: it.unit || 'g',
                line_cost: Number(it.line_cost || it.cost || 0),
              };
            }).filter((it: any) => isValidUUID(it.ingredient_id));

            if (itemsToInsert.length > 0) {
              await supabase.from('recipe_items').insert(itemsToInsert);
            }
          }
        } catch (recErr) {
          console.warn('Lỗi push recipe Supabase:', recErr);
        }

        const enrichedRecipe = {
          ...br,
          id: recipeId,
          bake_time_minutes: bakeTime,
          bake_temp_celsius: bakeTemp,
          items: effectiveItems,
        };

        const idx = currentRecs.findIndex((r) => r.name?.toLowerCase().trim() === br.name?.toLowerCase().trim());
        if (idx >= 0) {
          currentRecs[idx] = { ...currentRecs[idx], ...enrichedRecipe };
        } else {
          currentRecs.unshift(enrichedRecipe);
        }

        details.recipesPushed++;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_recipes', JSON.stringify(currentRecs));
      }
    }

    // ── BƯỚC 5: ĐẨY ĐƠN HÀNG VÀ CHI TIẾT ĐƠN (ORDERS & ORDER_ITEMS) ──
    notify(75, 'Đang đối soát và khôi phục Đơn hàng vào CSDL Supabase...');
    const ordersToPush = (backupData.orders && backupData.orders.length > 0)
      ? report.byEntity.orders.items.filter((it) => {
          if (mergeMode === 'append_only') return it.status === 'new';
          if (mergeMode === 'smart_merge') return it.status === 'new' || it.status === 'updated';
          return true;
        })
      : [];

    if (ordersToPush.length > 0) {
      let currentOrders: any[] = [];
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) currentOrders = JSON.parse(raw);
      } catch {}

      const isValidUUID = (id?: string) =>
        Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

      const orderPayloads: any[] = [];
      const orderItemsToInsert: any[] = [];
      const orderIdsToClearItems: string[] = [];

      for (let i = 0; i < ordersToPush.length; i++) {
        const item = ordersToPush[i];
        const bo = item.backupItem;
        const newRefImg =
          uploadedImageUrlMap.get(bo.order_number) ||
          uploadedImageUrlMap.get('img-order-' + bo.order_number) ||
          bo.reference_image_url;

        // Chuẩn hóa order_type theo check constraint của PostgreSQL ('dine_in' | 'takeaway' | 'preorder')
        const dbType = ['dine_in', 'takeaway', 'preorder'].includes(bo.order_type) ? bo.order_type : 'preorder';

        // Chuẩn hóa status theo check constraint của PostgreSQL ('pending' | 'preparing' | 'ready' | 'completed' | 'cancelled')
        const dbStatus =
          bo.status === 'refunded' || bo.status === 'partially_refunded'
            ? 'completed'
            : ['pending', 'preparing', 'ready', 'completed', 'cancelled'].includes(bo.status)
            ? bo.status
            : 'completed';

        // Đảm bảo ID là UUID hợp lệ cho PostgreSQL
        const orderId = isValidUUID(bo.id)
          ? bo.id
          : isValidUUID(bo.local_id)
          ? bo.local_id
          : crypto.randomUUID();

        const orderPayload: any = {
          id: orderId,
          order_number: bo.order_number,
          order_type: dbType,
          status: dbStatus,
          created_at: bo.created_at || new Date().toISOString(),
          updated_at: bo.updated_at || new Date().toISOString(),
          preorder_pickup_at: bo.preorder_pickup_at || bo.pickupDateTime || null,
          customer_name: bo.customer_name || null,
          customer_phone: bo.customer_phone || null,
          cake_message: bo.cake_message || null,
          total_amount: Number(bo.total_amount || 0),
          subtotal: Number(bo.subtotal || bo.total_amount || 0),
          notes: bo.notes || '',
        };

        orderPayloads.push(orderPayload);
        orderIdsToClearItems.push(orderId);

        if (Array.isArray(bo.items) && bo.items.length > 0) {
          bo.items.forEach((it: any) => {
            orderItemsToInsert.push({
              order_id: orderId,
              product_id: isValidUUID(it.product_id) ? it.product_id : null,
              product_name_snapshot: it.product_name_snapshot || it.name || 'Bánh',
              quantity: Number(it.quantity || 1),
              unit_price: Number(it.unit_price || 0),
              unit_cost: Number(it.unit_cost || 0),
              notes: it.notes || '',
            });
          });
        }

        // Lưu giữ nguyên trạng thái chi tiết (refunded, return_records, v.v.) vào bộ nhớ cục bộ
        const ordWithRef = { ...bo, id: orderId, reference_image_url: newRefImg };
        const idx = currentOrders.findIndex((o) => o.order_number === bo.order_number || o.id === orderId);
        if (idx >= 0) {
          currentOrders[idx] = { ...currentOrders[idx], ...ordWithRef };
        } else {
          currentOrders.unshift(ordWithRef);
        }

        details.ordersPushed++;
      }

      // Đẩy orders lên Supabase theo batch 50 để tối ưu tốc độ và an toàn
      for (let i = 0; i < orderPayloads.length; i += 50) {
        const chunk = orderPayloads.slice(i, i + 50);
        try {
          const { error: ordErr } = await supabase.from('orders').upsert(chunk, { onConflict: 'id' });
          if (ordErr) {
            console.warn('Lỗi upsert chunk orders Supabase:', ordErr.message);
          }
        } catch (ordErr) {
          console.warn('Lỗi push order batch Supabase:', ordErr);
        }
        notify(
          75 + Math.round((i / orderPayloads.length) * 12),
          `Đang lưu đơn hàng lên CSDL (${Math.min(i + 50, orderPayloads.length)}/${orderPayloads.length})...`
        );
      }

      // Xóa items cũ và chèn items mới theo batch 100
      try {
        for (let i = 0; i < orderIdsToClearItems.length; i += 50) {
          const idChunk = orderIdsToClearItems.slice(i, i + 50);
          await supabase.from('order_items').delete().in('order_id', idChunk);
        }
        for (let i = 0; i < orderItemsToInsert.length; i += 100) {
          const chunk = orderItemsToInsert.slice(i, i + 100);
          await supabase.from('order_items').insert(chunk);
        }
      } catch (itemErr) {
        console.warn('Lỗi lưu order_items Supabase:', itemErr);
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_orders', JSON.stringify(currentOrders));
        const preorders = currentOrders.filter(
          (o: any) => o.order_type === 'preorder' || Boolean(o.preorder_pickup_at || o.pickupDateTime)
        );
        if (preorders.length > 0) {
          localStorage.setItem('bakery_preorders', JSON.stringify(preorders));
        }
        try {
          if (db.orders) {
            await db.orders.bulkPut(currentOrders);
          }
        } catch {}
      }
    }

    // ── BƯỚC 6: LỊCH SỬ KHO, HAO HỤT, THU CHI & NGHIỆP VỤ ──
    notify(90, 'Đang cập nhật Nhật ký biến động kho & Sổ thu chi lên Đám mây...');
    const newStockLogs = (backupData.stock_adjustments && backupData.stock_adjustments.length > 0)
      ? report.byEntity.stock_adjustments.items
          .filter((it) => (mergeMode === 'append_only' || mergeMode === 'smart_merge' ? it.status === 'new' : true))
          .map((it) => it.backupItem)
      : [];
    if (newStockLogs.length > 0) {
      const currentLogs = getStockAdjustmentLogs();
      const mergedLogs = [...newStockLogs, ...currentLogs].slice(0, 500);
      try {
        localStorage.setItem('bakery_stock_adjustment_logs', JSON.stringify(mergedLogs));
        details.stockLogsPushed = newStockLogs.length;
        await saveStockAdjustmentLogsToDb(mergedLogs).catch(console.error);
      } catch {}
    }

    const newSpoilageLogs = (backupData.spoilage_logs && backupData.spoilage_logs.length > 0)
      ? report.byEntity.spoilage_logs.items
          .filter((it) => (mergeMode === 'append_only' || mergeMode === 'smart_merge' ? it.status === 'new' : true))
          .map((it) => it.backupItem)
      : [];
    if (newSpoilageLogs.length > 0) {
      const currentSpoilage = getSpoilageLogs();
      const mergedSpoilage = [...newSpoilageLogs, ...currentSpoilage];
      saveSpoilageLogs(mergedSpoilage);
      details.spoilageLogsPushed = newSpoilageLogs.length;
      await saveSpoilageLogsToDb(mergedSpoilage).catch(console.error);
    }

    const newExpenses = (backupData.expenses && backupData.expenses.length > 0)
      ? report.byEntity.expenses.items
          .filter((it) => (mergeMode === 'append_only' || mergeMode === 'smart_merge' ? it.status === 'new' : true))
          .map((it) => it.backupItem)
      : [];
    if (newExpenses.length > 0) {
      try {
        const rawE = localStorage.getItem('bakery_expenses');
        const currentE = rawE ? JSON.parse(rawE) : [];
        const mergedE = [...newExpenses, ...currentE];
        localStorage.setItem('bakery_expenses', JSON.stringify(mergedE));
        details.expensesPushed = newExpenses.length;
        await saveExpensesToDb(mergedE).catch(console.error);
      } catch {}
    }

    // ── CA BÁN HÀNG & LỊCH SỬ KÉT TIỀN (SHIFTS & CURRENT SHIFT) ──
    if (backupData.shifts && Array.isArray(backupData.shifts) && backupData.shifts.length > 0) {
      try {
        localStorage.setItem('bakery_shift_history', JSON.stringify(backupData.shifts));
        await saveShiftHistoryToDb(backupData.shifts).catch(console.error);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bakery_shift_history_updated', { detail: backupData.shifts }));
        }
      } catch {}
    }
    if (backupData.current_shift) {
      try {
        localStorage.setItem('bakery_current_shift', JSON.stringify(backupData.current_shift));
        await saveCurrentShiftToDb(backupData.current_shift).catch(console.error);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bakery_current_shift_updated', { detail: backupData.current_shift }));
        }
      } catch {}
    }

    // ── CHỐT SỔ KẾ TOÁN (ACCOUNTING CLOSINGS) ──
    if (backupData.accounting_closings && Array.isArray(backupData.accounting_closings) && backupData.accounting_closings.length > 0) {
      try {
        localStorage.setItem('bakery_closing_records', JSON.stringify(backupData.accounting_closings));
        await saveClosingRecordsToDb(backupData.accounting_closings).catch(console.error);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bakery_closing_records_updated', { detail: backupData.accounting_closings[0] }));
        }
      } catch {}
    }

    // ── LỊCH SỬ ĐỔI TRẢ HÀNG & THÔNG BÁO ──
    if (backupData.order_returns && Array.isArray(backupData.order_returns)) {
      try {
        localStorage.setItem('bakery_order_returns', JSON.stringify(backupData.order_returns));
      } catch {}
    }
    if (backupData.notification_history && Array.isArray(backupData.notification_history)) {
      try {
        localStorage.setItem('bakery_notification_history', JSON.stringify(backupData.notification_history));
        localStorage.setItem('bakery_notifs_initialized', 'true');
      } catch {}
    }

    // ── ĐƠN TẠM GIỮ, MẺ NƯỚNG LÒ, CHUYỂN KHOẢN & METADATA ──
    if (backupData.held_orders && Array.isArray(backupData.held_orders)) {
      try {
        localStorage.setItem('bakery_held_orders', JSON.stringify(backupData.held_orders));
      } catch {}
    }
    if (backupData.oven_batches && Array.isArray(backupData.oven_batches)) {
      try {
        localStorage.setItem('bakery_oven_batches', JSON.stringify(backupData.oven_batches));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bakery_oven_batches_updated', { detail: backupData.oven_batches }));
        }
      } catch {}
    }
    if (backupData.pending_transfers && Array.isArray(backupData.pending_transfers)) {
      try {
        localStorage.setItem('bakery_pending_transfers', JSON.stringify(backupData.pending_transfers));
      } catch {}
    }
    if (backupData.resolved_transfers && Array.isArray(backupData.resolved_transfers)) {
      try {
        localStorage.setItem('bakery_resolved_transfers', JSON.stringify(backupData.resolved_transfers));
      } catch {}
    }
    if (backupData.delivery_alert_config || (backupData.settings as any)?.delivery_alert_config) {
      try {
        const da = backupData.delivery_alert_config || (backupData.settings as any)?.delivery_alert_config;
        localStorage.setItem('bakery_delivery_alert_config', JSON.stringify(da));
      } catch {}
    }
    if (backupData.autobank_config || backupData.settings?.autobank) {
      try {
        const ab = backupData.autobank_config || backupData.settings?.autobank;
        localStorage.setItem('bakery_autobank_config', JSON.stringify(ab));
      } catch {}
    }
    if (backupData.transfer_verify_config || backupData.settings?.transfer_verify) {
      try {
        const tv = backupData.transfer_verify_config || backupData.settings?.transfer_verify;
        localStorage.setItem('bakery_transfer_verification_config', JSON.stringify(tv));
      } catch {}
    }
    if (backupData.product_metadata && typeof backupData.product_metadata === 'object') {
      try {
        localStorage.setItem('bakery_product_metadata', JSON.stringify(backupData.product_metadata));
        localStorage.setItem('bakery_product_metadata_map', JSON.stringify(backupData.product_metadata));
      } catch {}
    }

    // ── CÀI ĐẶT BẢO MẬT & MÃ PIN (SECURITY CONFIG & PIN) ──
    const secConfig = backupData.security_config || backupData.settings?.security;
    if (secConfig) {
      try {
        localStorage.setItem('bakery_security_config', JSON.stringify(secConfig));
        if (secConfig.adminPin) {
          localStorage.setItem('bakery_admin_pin', secConfig.adminPin);
        }
        await saveSecurityConfigToDb(secConfig).catch(console.error);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bakery_security_config_updated', { detail: secConfig }));
        }
      } catch {}
    }
    if (backupData.settings?.admin_pin) {
      try {
        localStorage.setItem('bakery_admin_pin', backupData.settings.admin_pin);
      } catch {}
    }

    // ── CÀI ĐẶT THƯƠNG HIỆU & HỆ THỐNG (BRANDING, VIETQR, PRINTER, EWALLET, CAKE BOM) ──
    notify(95, 'Đang khôi phục thương hiệu và cài đặt hệ thống...');
    const brandingToRestore = backupData.settings?.branding || (backupData.storeName ? {
      storeName: backupData.storeName,
      slogan: 'Artisan Bakery & Coffee • Bánh Tươi Mỗi Ngày',
      logoUrl: '',
      phone: '0901 234 567',
      address: '123 Đường Bánh Ngọt, TP.HCM',
      footerMessage: 'Cảm ơn Quý khách & Hẹn gặp lại!',
      orderNumberPrefix: 'BK',
      orderCounter: 1,
      autoResetDaily: true,
    } : null);

    if (brandingToRestore) {
      try {
        saveStoreBranding(brandingToRestore);
        await saveStoreBrandingToDb(brandingToRestore).catch(console.error);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bakery_branding_updated', { detail: brandingToRestore }));
        }
        details.brandingPushed = true;
      } catch (err) {
        console.warn('Lỗi khi khôi phục thương hiệu:', err);
      }
    }

    if (backupData.settings) {
      try {
        if (backupData.settings.vietqr) {
          localStorage.setItem('bakery_vietqr_config', JSON.stringify(backupData.settings.vietqr));
          await saveVietqrConfigToDb(backupData.settings.vietqr).catch(console.error);
        }
        if (backupData.settings.ewallet) {
          localStorage.setItem('bakery_ewallet_config', JSON.stringify(backupData.settings.ewallet));
          await saveEwalletConfigToDb(backupData.settings.ewallet).catch(console.error);
        }
        if (backupData.settings.printer) {
          localStorage.setItem('bakery_printer_config', JSON.stringify(backupData.settings.printer));
          const { error: printerErr } = await supabase.from('recipes').upsert({
            id: '00000000-0000-0000-0000-000000000018',
            name: 'SYS_CONFIG_PRINTER',
            yield_qty: 1,
            yield_unit: 'config',
            cost_per_unit: 0,
            notes: JSON.stringify(backupData.settings.printer),
            is_active: false,
          }, { onConflict: 'id' });
          if (printerErr) console.error('Lỗi lưu SYS_CONFIG_PRINTER:', printerErr);
        }
        if (backupData.settings.print_templates) {
          restorePrintTemplatesFromBackup(backupData.settings.print_templates);
        }
        if (backupData.settings.full_cake_bom_config) {
          localStorage.setItem('bakery_full_bom_config', JSON.stringify(backupData.settings.full_cake_bom_config));
          await syncCakeBomConfigToDb(backupData.settings.full_cake_bom_config).catch(console.error);
        }
        if (backupData.settings.cake_costing) {
          await saveCakeCostingConfigToDb(backupData.settings.cake_costing).catch(console.error);
        }
        if (backupData.settings.tax_household) {
          localStorage.setItem('bakery_tax_household_config', JSON.stringify(backupData.settings.tax_household));
          const { error: taxErr } = await supabase.from('recipes').upsert({
            id: '00000000-0000-0000-0000-00000000000c',
            name: 'SYS_CONFIG_TAX_HOUSEHOLD',
            yield_qty: 1,
            yield_unit: 'config',
            cost_per_unit: 0,
            notes: JSON.stringify(backupData.settings.tax_household),
            is_active: false,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
          if (taxErr) console.warn('Lỗi lưu SYS_CONFIG_TAX_HOUSEHOLD:', taxErr);
        }
        if (backupData.settings.tax_policy) {
          localStorage.setItem('bakery_tax_policy_config', JSON.stringify(backupData.settings.tax_policy));
          const { error: polErr } = await supabase.from('recipes').upsert({
            id: '00000000-0000-0000-0000-00000000000e',
            name: 'SYS_CONFIG_TAX_POLICY',
            yield_qty: 1,
            yield_unit: 'config',
            cost_per_unit: 0,
            notes: JSON.stringify(backupData.settings.tax_policy),
            is_active: false,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
          if (polErr) console.warn('Lỗi lưu SYS_CONFIG_TAX_POLICY:', polErr);
        }
      } catch {}
    }

    // ── BƯỚC 7: GỠ BỎ MỐC RESET ĐỂ CÁC MÁY KHÁC ĐÓN NHẬN DỮ LIỆU KHÔI PHỤC ──
    notify(95, 'Đang gỡ bỏ mốc Reset và phát sóng đồng bộ toàn bộ máy...');
    try {
      // 1. Xóa mốc SYSTEM_RESET_EPOCH trên Supabase để không chặn dữ liệu sao lưu
      await supabase
        .from('recipes')
        .delete()
        .or('id.eq.00000000-0000-0000-0000-000000000099,name.eq.SYSTEM_RESET_EPOCH');

      // 2. Xóa mốc local epoch & cờ xóa đơn trên máy này
      const { setLocalResetEpoch } = await import('@/lib/utils/systemResetManager');
      setLocalResetEpoch(0);
      localStorage.removeItem('bakery_system_reset_epoch');
      localStorage.removeItem('bakery_deleted_order_keys');
      localStorage.removeItem('bakery_kds_status_locks');
      sessionStorage.removeItem('bakery_wiped_reloaded_epoch');
    } catch (e) {
      console.warn('Lỗi gỡ bỏ SYSTEM_RESET_EPOCH sau khi khôi phục:', e);
    }

    // 3. Phát sóng khẩn cấp tới mọi máy khác để cập nhật giao diện và xóa mốc chặn reset
    try {
      const { broadcastSystemBackupRestored } = await import('@/lib/supabase/realtimeSync');
      await broadcastSystemBackupRestored({
        restored_at: new Date().toISOString(),
        products_count: details.productsPushed,
        orders_count: details.ordersPushed,
      });
    } catch (bErr) {
      console.warn('Lỗi broadcastSystemBackupRestored:', bErr);
    }

    // ── BƯỚC 7: BẮN SỰ KIỆN ĐỒNG BỘ GIAO DIỆN TOÀN HỆ THỐNG ──
    notify(98, 'Đang kích hoạt đồng bộ hiển thị trên toàn màn hình POS & Admin...');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('bakery_products_updated'));
      window.dispatchEvent(new Event('bakery_stocks_updated'));
      window.dispatchEvent(new Event('bakery_orders_updated'));
      window.dispatchEvent(new Event('bakery_spoilage_updated'));
      window.dispatchEvent(new CustomEvent('bakery_stock_adjustment_logs_updated', { detail: null }));
      window.dispatchEvent(new Event('bakery_vietqr_updated'));
      window.dispatchEvent(new Event('bakery_ewallet_updated'));
      window.dispatchEvent(new Event('bakery_printer_updated'));
      window.dispatchEvent(new Event('bakery_branding_updated'));
    }

    notify(100, 'Hoàn thành khôi phục và đẩy dữ liệu lên SQL thành công!');

    return {
      success: true,
      message: `Khôi phục thành công! Đã đẩy ${details.productsPushed} sản phẩm, ${details.ordersPushed} đơn hàng, ${details.ingredientsPushed} nguyên liệu, ${details.imagesUploaded} hình ảnh${details.brandingPushed ? ', thương hiệu tiệm' : ''} lên CSDL Cloud SQL.`,
      details,
    };
  } catch (error: any) {
    console.error('Lỗi nghiêm trọng khi đẩy dữ liệu lên SQL:', error);
    return {
      success: false,
      message: error?.message || 'Có lỗi xảy ra khi đẩy dữ liệu lên SQL',
      details,
    };
  }
}
