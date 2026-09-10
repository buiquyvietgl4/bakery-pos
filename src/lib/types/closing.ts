// src/lib/types/closing.ts

export type ClosingPeriodType = 'day' | 'week' | 'month' | 'year';

export interface AccountingClosingRecord {
  id: string;
  periodType: ClosingPeriodType;
  periodKey: string; // e.g. "2026-09-10", "2026-W37", "2026-09", "2026"
  periodLabel: string; // e.g. "Ngày 10/09/2026", "Tuần 37 (07/09 - 13/09/2026)", "Tháng 09/2026", "Năm 2026"
  startDate: string;
  endDate: string;
  closedAt: string;
  closedBy: string;

  // Doanh thu
  totalOrders: number;
  totalRevenue: number;
  cashRevenue: number;
  bankRevenue: number;

  // Chi phí & Lợi nhuận
  totalCOGS: number;
  grossProfit: number;
  totalOpex: number;
  spoilageCost: number;
  spoilageQty: number;
  netProfit: number;

  // Kiểm két tiền mặt
  systemCash: number;
  actualCashInRegister: number;
  cashDifference: number; // actualCashInRegister - systemCash

  notes?: string;
  status: 'closed' | 'reopened';
}
