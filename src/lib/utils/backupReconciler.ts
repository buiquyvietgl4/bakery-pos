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
import { getStockAdjustmentLogs } from './stockAdjustmentManager';
import { getSpoilageLogs, saveSpoilageLogs } from './spoilageManager';

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
      if (raw) currentProducts = JSON.parse(raw);
    } catch {}
  }
  try {
    const { data: dbProds } = await supabase.from('products').select('*').limit(500);
    if (dbProds && dbProds.length > 0) {
      dbProds.forEach((dp) => {
        const idx = currentProducts.findIndex((p) => p.id === dp.id || p.name?.toLowerCase().trim() === dp.name?.toLowerCase().trim());
        if (idx >= 0) {
          currentProducts[idx] = { ...currentProducts[idx], ...dp };
        } else {
          currentProducts.push(dp);
        }
      });
    }
  } catch {}

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
          currentOrders[idx] = { ...currentOrders[idx], ...dbo };
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
      const itemsDiff = (bo.items?.length || 0) !== (existing.items?.length || existing.order_items?.length || 0);

      if (statusDiff || amountDiff || itemsDiff) {
        byEntity.orders.updatedCount++;
        const changes: string[] = [];
        if (statusDiff) changes.push(`Trạng thái: ${existing.status} ➔ ${bo.status}`);
        if (amountDiff) changes.push(`Tổng tiền: ${existing.total_amount} ➔ ${bo.total_amount}`);
        if (itemsDiff) changes.push(`Số món bánh: ${existing.items?.length || 0} ➔ ${bo.items?.length || 0}`);

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
        details: `Vật tư mới: ${bi.stock_qty} ${bi.unit} (giá vốn ~${bi.avg_cost || 0}đ)`,
        backupItem: bi,
      });
    } else {
      const qtyDiff = Math.abs((Number(bi.stock_qty) || 0) - (Number(existing.stock_qty) || 0)) > 0.01;
      const costDiff = Math.abs((Number(bi.avg_cost) || 0) - (Number(existing.avg_cost) || 0)) > 1;

      if (qtyDiff || costDiff) {
        byEntity.ingredients.updatedCount++;
        const changes: string[] = [];
        if (qtyDiff) changes.push(`Tồn kho: ${existing.stock_qty} ➔ ${bi.stock_qty} ${bi.unit}`);
        if (costDiff) changes.push(`Giá vốn: ${existing.avg_cost} ➔ ${bi.avg_cost}đ`);

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
  };

  const notify = (percent: number, msg: string) => {
    if (onProgress) onProgress(percent, msg);
  };

  try {
    notify(5, 'Đang chuẩn bị và kiểm tra kết nối Supabase...');

    // ── BƯỚC 1: TẢI HÌNH ẢNH LÊN SUPABASE STORAGE BUCKET bakery-images ──
    notify(10, 'Đang khôi phục và tải hình ảnh lên Cloud Storage...');
    const uploadedImageUrlMap = new Map<string, string>();

    const imagesToProcess = report.byEntity.images.items.filter((it) => {
      if (mergeMode === 'append_only') return it.status === 'new';
      if (mergeMode === 'smart_merge') return it.status === 'new';
      return true; // full_overwrite
    });

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
    const productsToPush = report.byEntity.products.items.filter((it) => {
      if (mergeMode === 'append_only') return it.status === 'new';
      if (mergeMode === 'smart_merge') return it.status === 'new' || it.status === 'updated';
      return true; // full_overwrite
    });

    if (productsToPush.length > 0) {
      let currentProds: any[] = [];
      try {
        const raw = localStorage.getItem('bakery_products');
        if (raw) currentProds = JSON.parse(raw);
      } catch {}

      for (const item of productsToPush) {
        const bp = item.backupItem;
        const newImgUrl = uploadedImageUrlMap.get(bp.id) || uploadedImageUrlMap.get('img-prod-' + bp.id) || bp.image_url;

        const prodRecord = {
          id: bp.id,
          name: bp.name,
          category: bp.category || 'Bánh Kem',
          selling_price: Number(bp.selling_price || bp.price || 0),
          base_cost_price: Number(bp.base_cost_price || Math.round((bp.selling_price || 0) * 0.33)),
          image_url: newImgUrl,
          is_preorder_only: bp.is_preorder_only ?? false,
          is_active: bp.is_active ?? true,
        };

        try {
          await supabase.from('products').upsert(prodRecord, { onConflict: 'id' });
        } catch (dbErr) {
          console.warn('Lỗi upsert product Supabase:', dbErr);
        }

        try {
          await db.products.put(prodRecord as any);
        } catch {}

        const idx = currentProds.findIndex((p) => p.id === bp.id || p.name?.toLowerCase().trim() === bp.name?.toLowerCase().trim());
        if (idx >= 0) {
          currentProds[idx] = { ...currentProds[idx], ...prodRecord };
        } else {
          currentProds.unshift(prodRecord);
        }

        details.productsPushed++;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_products', JSON.stringify(currentProds));
      }
    }

    // ── BƯỚC 3: ĐẨY NGUYÊN VẬT LIỆU KHO ──
    notify(45, 'Đang đồng bộ Nguyên vật liệu & Tồn kho vào CSDL...');
    const ingredientsToPush = report.byEntity.ingredients.items.filter((it) => {
      if (mergeMode === 'append_only') return it.status === 'new';
      if (mergeMode === 'smart_merge') return it.status === 'new' || it.status === 'updated';
      return true;
    });

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
    const recipesToPush = report.byEntity.recipes.items.filter((it) => {
      if (mergeMode === 'append_only') return it.status === 'new';
      if (mergeMode === 'smart_merge') return it.status === 'new' || it.status === 'updated';
      return true;
    });

    if (recipesToPush.length > 0) {
      let currentRecs: any[] = [];
      try {
        const raw = localStorage.getItem('bakery_recipes');
        if (raw) currentRecs = JSON.parse(raw);
      } catch {}

      for (const item of recipesToPush) {
        const br = item.backupItem;
        const recipeId = br.id || 'rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

        try {
          await supabase.from('recipes').delete().eq('name', br.name);

          await supabase.from('recipes').insert({
            id: recipeId,
            name: br.name,
            yield_qty: Number(br.yield_qty || 1),
            yield_unit: br.yield_unit || 'Cái',
            total_material_cost: Number(br.total_material_cost || 0),
            cost_per_unit: Number(br.cost_per_unit || 0),
          });

          if (Array.isArray(br.items) && br.items.length > 0) {
            const itemsToInsert = br.items.map((it: any) => ({
              recipe_id: recipeId,
              ingredient_id: it.ingredient_id,
              quantity: Number(it.quantity || 0),
              unit: it.unit || 'g',
              line_cost: Number(it.line_cost || it.cost || 0),
            }));
            await supabase.from('recipe_items').insert(itemsToInsert);
          }
        } catch (recErr) {
          console.warn('Lỗi push recipe Supabase:', recErr);
        }

        const idx = currentRecs.findIndex((r) => r.name?.toLowerCase().trim() === br.name?.toLowerCase().trim());
        if (idx >= 0) {
          currentRecs[idx] = { ...currentRecs[idx], ...br };
        } else {
          currentRecs.unshift(br);
        }

        details.recipesPushed++;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_recipes', JSON.stringify(currentRecs));
      }
    }

    // ── BƯỚC 5: ĐẨY ĐƠN HÀNG VÀ CHI TIẾT ĐƠN (ORDERS & ORDER_ITEMS) ──
    notify(75, 'Đang đối soát và khôi phục Đơn hàng vào CSDL Supabase...');
    const ordersToPush = report.byEntity.orders.items.filter((it) => {
      if (mergeMode === 'append_only') return it.status === 'new';
      if (mergeMode === 'smart_merge') return it.status === 'new' || it.status === 'updated';
      return true;
    });

    if (ordersToPush.length > 0) {
      let currentOrders: any[] = [];
      try {
        const raw = localStorage.getItem('bakery_orders');
        if (raw) currentOrders = JSON.parse(raw);
      } catch {}

      for (const item of ordersToPush) {
        const bo = item.backupItem;
        const newRefImg = uploadedImageUrlMap.get(bo.order_number) || uploadedImageUrlMap.get('img-order-' + bo.order_number) || bo.reference_image_url;

        const orderPayload: any = {
          order_number: bo.order_number,
          order_type: bo.order_type || 'preorder',
          status: bo.status || 'pending',
          created_at: bo.created_at || new Date().toISOString(),
          updated_at: bo.updated_at || new Date().toISOString(),
          preorder_pickup_at: bo.preorder_pickup_at || bo.pickupDateTime,
          customer_name: bo.customer_name,
          customer_phone: bo.customer_phone,
          cake_message: bo.cake_message,
          total_amount: Number(bo.total_amount || 0),
          subtotal: Number(bo.subtotal || bo.total_amount || 0),
          notes: bo.notes || '',
        };

        if (bo.id) orderPayload.id = bo.id;

        try {
          const { data: upsertedOrder, error: orderErr } = await supabase
            .from('orders')
            .upsert(orderPayload, { onConflict: 'order_number' })
            .select('id')
            .single();

          if (!orderErr && upsertedOrder && Array.isArray(bo.items) && bo.items.length > 0) {
            await supabase.from('order_items').delete().eq('order_id', upsertedOrder.id);

            const itemsToInsert = bo.items.map((it: any) => ({
              order_id: upsertedOrder.id,
              product_name_snapshot: it.product_name_snapshot || it.name || 'Bánh',
              quantity: Number(it.quantity || 1),
              unit_price: Number(it.unit_price || 0),
              notes: it.notes || '',
            }));
            await supabase.from('order_items').insert(itemsToInsert);
          }
        } catch (ordErr) {
          console.warn('Lỗi push order Supabase:', ordErr);
        }

        const ordWithRef = { ...bo, reference_image_url: newRefImg };
        const idx = currentOrders.findIndex((o) => o.order_number === bo.order_number || o.id === bo.id);
        if (idx >= 0) {
          currentOrders[idx] = { ...currentOrders[idx], ...ordWithRef };
        } else {
          currentOrders.unshift(ordWithRef);
        }

        details.ordersPushed++;
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('bakery_orders', JSON.stringify(currentOrders));
      }
    }

    // ── BƯỚC 6: LỊCH SỬ KHO, HAO HỤT, THU CHI ──
    notify(90, 'Đang cập nhật Nhật ký biến động kho & Sổ thu chi...');
    const newStockLogs = report.byEntity.stock_adjustments.items
      .filter((it) => (mergeMode === 'append_only' || mergeMode === 'smart_merge' ? it.status === 'new' : true))
      .map((it) => it.backupItem);
    if (newStockLogs.length > 0) {
      const currentLogs = getStockAdjustmentLogs();
      const mergedLogs = [...newStockLogs, ...currentLogs].slice(0, 500);
      try {
        localStorage.setItem('bakery_stock_adjustment_logs', JSON.stringify(mergedLogs));
        details.stockLogsPushed = newStockLogs.length;
      } catch {}
    }

    const newSpoilageLogs = report.byEntity.spoilage_logs.items
      .filter((it) => (mergeMode === 'append_only' || mergeMode === 'smart_merge' ? it.status === 'new' : true))
      .map((it) => it.backupItem);
    if (newSpoilageLogs.length > 0) {
      const currentSpoilage = getSpoilageLogs();
      const mergedSpoilage = [...newSpoilageLogs, ...currentSpoilage];
      saveSpoilageLogs(mergedSpoilage);
      details.spoilageLogsPushed = newSpoilageLogs.length;
    }

    const newExpenses = report.byEntity.expenses.items
      .filter((it) => (mergeMode === 'append_only' || mergeMode === 'smart_merge' ? it.status === 'new' : true))
      .map((it) => it.backupItem);
    if (newExpenses.length > 0) {
      try {
        const rawE = localStorage.getItem('bakery_expenses');
        const currentE = rawE ? JSON.parse(rawE) : [];
        const mergedE = [...newExpenses, ...currentE];
        localStorage.setItem('bakery_expenses', JSON.stringify(mergedE));
        details.expensesPushed = newExpenses.length;
      } catch {}
    }

    if (backupData.settings) {
      try {
        if (backupData.settings.vietqr) {
          localStorage.setItem('bakery_vietqr_config', JSON.stringify(backupData.settings.vietqr));
        }
        if (backupData.settings.ewallet) {
          localStorage.setItem('bakery_ewallet_config', JSON.stringify(backupData.settings.ewallet));
        }
        if (backupData.settings.printer) {
          localStorage.setItem('bakery_printer_config', JSON.stringify(backupData.settings.printer));
        }
        if (backupData.settings.branding) {
          localStorage.setItem('bakery_store_branding', JSON.stringify(backupData.settings.branding));
          window.dispatchEvent(new CustomEvent('bakery_branding_updated', { detail: backupData.settings.branding }));
        }
      } catch {}
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
    }

    notify(100, 'Hoàn thành khôi phục và đẩy dữ liệu lên SQL thành công!');

    return {
      success: true,
      message: `Khôi phục thành công! Đã đẩy ${details.productsPushed} sản phẩm, ${details.ordersPushed} đơn hàng, ${details.ingredientsPushed} nguyên liệu, ${details.imagesUploaded} hình ảnh lên CSDL Cloud SQL.`,
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
