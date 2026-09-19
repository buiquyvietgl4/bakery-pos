import {
  pruneOrdersCache,
  prunePreordersCache,
  isOrderCompletedOrCancelled,
  MAX_CACHED_ORDERS,
  MAX_CACHED_PREORDERS,
} from '../src/lib/utils/deliveryAlerts';

console.log('--- TEST PREORDERS RETENTION ---');
console.log('MAX_CACHED_ORDERS:', MAX_CACHED_ORDERS);
console.log('MAX_CACHED_PREORDERS:', MAX_CACHED_PREORDERS);

const simulatedOrders: any[] = [];
for (let i = 1; i <= 100; i++) {
  simulatedOrders.push({
    id: `preorder-${i}`,
    order_number: `BK-PRE-20260919-${i}`,
    order_type: 'preorder',
    status: 'pending',
    created_at: new Date(Date.now() - i * 60000).toISOString(),
    preorder_pickup_at: new Date(Date.now() + i * 3600000).toISOString(),
  });
}
for (let j = 1; j <= 20; j++) {
  simulatedOrders.push({
    id: `takeaway-${j}`,
    order_number: `BK-POS-20260919-${j}`,
    order_type: 'takeaway',
    status: 'completed',
    created_at: new Date(Date.now() - j * 120000).toISOString(),
  });
}

const prunedOrders = pruneOrdersCache(simulatedOrders, 500);
const preordersOnly = prunedOrders.filter(
  (o) =>
    o.order_type === 'preorder' ||
    Boolean(o.preorder_pickup_at) ||
    String(o.order_number).startsWith('BK-PRE')
);
const activePreorders = preordersOnly.filter((p) => !isOrderCompletedOrCancelled(p));

console.log('Total pruned orders:', prunedOrders.length, '(expected 120)');
console.log('Total preorders:', preordersOnly.length, '(expected 100)');
console.log('Active preorders:', activePreorders.length, '(expected 100, NEVER 95)');

if (activePreorders.length !== 100) throw new Error('Active preorders count is not 100!');

const massivePreorders: any[] = [];
for (let i = 1; i <= 100; i++) {
  massivePreorders.push({
    id: `pre-act-${i}`,
    order_number: `BK-PRE-ACT-${i}`,
    status: 'pending',
    preorder_pickup_at: new Date(Date.now() + i * 60000).toISOString(),
  });
}
for (let j = 1; j <= 250; j++) {
  massivePreorders.push({
    id: `pre-done-${j}`,
    order_number: `BK-PRE-DONE-${j}`,
    status: 'completed',
    created_at: new Date(Date.now() - j * 60000).toISOString(),
  });
}

const prunedPre = prunePreordersCache(massivePreorders, 300);
console.log('Pruned preorders length:', prunedPre.length, '(expected 300)');
const stillActive = prunedPre.filter((p) => !isOrderCompletedOrCancelled(p));
console.log('Still active preorders:', stillActive.length, '(expected 100)');
if (stillActive.length !== 100) throw new Error('Active preorders truncated!');

console.log('✅ ALL TESTS PASSED: ĐƠN CHỜ HẸN KHÔNG BAO GIỜ BỊ RỤNG TỪ 100 VỀ 95!');
