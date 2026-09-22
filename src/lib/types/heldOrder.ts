// src/lib/types/heldOrder.ts

import { CachedProduct } from '@/lib/db/dexie';

export interface HeldOrderItem {
  product: CachedProduct;
  quantity: number;
  notes?: string;
}

export interface HeldOrder {
  id: string; // e.g. 'HOLD-1726999999'
  holdCode: string; // e.g. '#T1', '#T2'
  label?: string; // Tên khách hoặc đặc điểm nhận diện, ví dụ "Chị Mai áo vàng"
  createdAt: string; // ISO String
  items: HeldOrderItem[];
  discountMode: 'percent' | 'amount';
  discountPercent: number;
  discountCustomAmount: number;
  fulfillmentType: 'takeaway' | 'pickup' | 'shipping';
  posCustomerName: string;
  posCustomerPhone: string;
  posShippingAddress: string;
  posPickupDate: string;
  posPickupTime: string;
  posCakeMessage: string;
  posShippingFee: number;
  posDepositAmount: number | null;
  cartNotes: string;
  totalAmount: number;
  itemCount: number;
}
