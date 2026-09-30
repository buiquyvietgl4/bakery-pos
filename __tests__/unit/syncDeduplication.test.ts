import { describe, it, expect } from 'vitest';
import { deduplicateSpoilageLogs } from '@/lib/utils/spoilageManager';
import { deduplicateStockAdjustmentLogs } from '@/lib/utils/stockAdjustmentManager';
import { deduplicateShiftHistory } from '@/lib/utils/shiftSync';
import { deduplicateMaterialTransactions } from '@/lib/utils/materialTransactionManager';
import { deduplicateMaterialStockAdjustmentLogs } from '@/lib/utils/materialStockAdjustmentManager';
import { deduplicateClosingRecords } from '@/lib/utils/closingManager';
import { deduplicateOrderReturns } from '@/lib/utils/orderReturnManager';
import { deduplicateHeldOrders } from '@/lib/utils/heldOrderManager';
import { deduplicateNotifications } from '@/lib/utils/notificationHistory';

describe('Comprehensive Deduplication Tests', () => {
  it('deduplicates spoilage logs by ID and fingerprint', () => {
    const raw = [
      { id: 'spoil-1', productName: 'Bánh Kem Bắp', quantity: 2, loggedAt: '2026-09-20T10:00:00.000Z', reason: 'Hết hạn' },
      { id: 'spoil-1', productName: 'Bánh Kem Bắp', quantity: 2, loggedAt: '2026-09-20T10:00:00.000Z', reason: 'Hết hạn' }, // duplicate ID
      { id: 'spoil-2', productName: 'Bánh Kem Bắp', quantity: 2, loggedAt: '2026-09-20T10:00:00.123Z', reason: 'Hết hạn' }, // duplicate fingerprint (different ID)
      { id: 'spoil-3', productName: 'Bánh Su Kem', quantity: 5, loggedAt: '2026-09-20T11:00:00.000Z', reason: 'Rơi vỡ' },
    ];
    const result = deduplicateSpoilageLogs(raw as any);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('spoil-1');
    expect(result[1].id).toBe('spoil-3');
  });

  it('deduplicates stock adjustment logs by ID and fingerprint', () => {
    const raw = [
      { id: 'adj-1', productId: 'p1', oldQuantity: 5, newQuantity: 10, adjustedAt: '2026-09-20T08:00:00.000Z', reason: 'Kiểm kê' },
      { id: 'adj-1', productId: 'p1', oldQuantity: 5, newQuantity: 10, adjustedAt: '2026-09-20T08:00:00.000Z', reason: 'Kiểm kê' },
      { id: 'adj-2', productId: 'p1', oldQuantity: 5, newQuantity: 10, adjustedAt: '2026-09-20T08:00:00.456Z', reason: 'Kiểm kê' },
      { id: 'adj-3', productId: 'p2', oldQuantity: 2, newQuantity: 4, adjustedAt: '2026-09-20T09:00:00.000Z', reason: 'Thêm' },
    ];
    const result = deduplicateStockAdjustmentLogs(raw as any);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('adj-1');
    expect(result[1].id).toBe('adj-3');
  });

  it('deduplicates shift history by ID and shiftCode', () => {
    const raw = [
      { id: 's-1', shiftCode: 'CA-260920-01', staffName: 'Thu Ngân 1', startedAt: '2026-09-20T06:00:00' },
      { id: 's-1', shiftCode: 'CA-260920-01', staffName: 'Thu Ngân 1', startedAt: '2026-09-20T06:00:00' },
      { id: 's-2', shiftCode: 'CA-260920-01', staffName: 'Thu Ngân 1', startedAt: '2026-09-20T06:00:00' },
      { id: 's-3', shiftCode: 'CA-260920-02', staffName: 'Thu Ngân 2', startedAt: '2026-09-20T14:00:00' },
    ];
    const result = deduplicateShiftHistory(raw as any);
    expect(result).toHaveLength(2);
    expect(result[0].shiftCode).toBe('CA-260920-01');
    expect(result[1].shiftCode).toBe('CA-260920-02');
  });

  it('deduplicates material transactions', () => {
    const raw = [
      { id: 'tx-1', materialId: 'm1', type: 'import', quantity: 10, totalAmount: 100000, date: '2026-09-20' },
      { id: 'tx-1', materialId: 'm1', type: 'import', quantity: 10, totalAmount: 100000, date: '2026-09-20' },
      { id: 'tx-2', materialId: 'm1', type: 'import', quantity: 10, totalAmount: 100000, date: '2026-09-20' },
      { id: 'tx-3', materialId: 'm2', type: 'export', quantity: 2, totalAmount: 30000, date: '2026-09-20' },
    ];
    const result = deduplicateMaterialTransactions(raw as any);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('tx-1');
    expect(result[1].id).toBe('tx-3');
  });

  it('deduplicates material stock adjustments', () => {
    const raw = [
      { id: 'msa-1', materialId: 'm1', oldQuantity: 5, newQuantity: 8, adjustedAt: '2026-09-20T10:00:00.000Z', reason: 'Kiểm kê' },
      { id: 'msa-1', materialId: 'm1', oldQuantity: 5, newQuantity: 8, adjustedAt: '2026-09-20T10:00:00.000Z', reason: 'Kiểm kê' },
      { id: 'msa-2', materialId: 'm2', oldQuantity: 1, newQuantity: 3, adjustedAt: '2026-09-20T11:00:00.000Z', reason: 'Bổ sung' },
    ];
    const result = deduplicateMaterialStockAdjustmentLogs(raw as any);
    expect(result).toHaveLength(2);
  });

  it('deduplicates accounting closing records by periodKey and periodType', () => {
    const raw = [
      { id: 'close-1', periodType: 'daily', periodKey: '2026-09-20', totalRevenue: 5000000 },
      { id: 'close-1', periodType: 'daily', periodKey: '2026-09-20', totalRevenue: 5000000 },
      { id: 'close-2', periodType: 'daily', periodKey: '2026-09-20', totalRevenue: 5000000 }, // same period
      { id: 'close-3', periodType: 'monthly', periodKey: '2026-09', totalRevenue: 150000000 },
    ];
    const result = deduplicateClosingRecords(raw as any);
    expect(result).toHaveLength(2);
    expect(result[0].periodKey).toBe('2026-09-20');
    expect(result[1].periodKey).toBe('2026-09');
  });

  it('deduplicates order returns by order and refund amount', () => {
    const raw = [
      { id: 'ret-1', order_id: 'ord-1', refund_amount: 150000, created_at: '2026-09-20T12:00:00.000Z' },
      { id: 'ret-1', order_id: 'ord-1', refund_amount: 150000, created_at: '2026-09-20T12:00:00.000Z' },
      { id: 'ret-2', order_id: 'ord-2', refund_amount: 200000, created_at: '2026-09-20T13:00:00.000Z' },
    ];
    const result = deduplicateOrderReturns(raw as any);
    expect(result).toHaveLength(2);
  });

  it('deduplicates held orders by ID and holdCode', () => {
    const raw = [
      { id: 'h-1', holdCode: '#T1', totalAmount: 100000 },
      { id: 'h-1', holdCode: '#T1', totalAmount: 100000 },
      { id: 'h-2', holdCode: '#T1', totalAmount: 100000 },
      { id: 'h-3', holdCode: '#T2', totalAmount: 250000 },
    ];
    const result = deduplicateHeldOrders(raw as any);
    expect(result).toHaveLength(2);
    expect(result[0].holdCode).toBe('#T1');
    expect(result[1].holdCode).toBe('#T2');
  });

  it('deduplicates notifications by title, message and timestamp', () => {
    const raw = [
      { id: 'n-1', title: 'Đơn mới', message: 'Khách đặt #123', timestamp: 1700000000 },
      { id: 'n-1', title: 'Đơn mới', message: 'Khách đặt #123', timestamp: 1700000000 },
      { id: 'n-2', title: 'Đơn mới', message: 'Khách đặt #123', timestamp: 1700000000 },
      { id: 'n-3', title: 'Bánh chín', message: 'Mẻ bánh đã xong', timestamp: 1700003600 },
    ];
    const result = deduplicateNotifications(raw as any);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('n-1');
    expect(result[1].id).toBe('n-3');
  });
});
