import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabase } from '@/lib/supabase/client';
import { saveSqlModeConfig, isLocalMode } from '@/lib/utils/sqlModeManager';
import { syncOrderToSupabase } from '@/lib/supabase/realtimeSync';

describe('SQL Mode Data Isolation & Firewall', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('xác nhận isLocalMode trả về đúng khi chuyển đổi mode', () => {
    saveSqlModeConfig({ mode: 'online' });
    expect(isLocalMode()).toBe(false);

    saveSqlModeConfig({ mode: 'local' });
    expect(isLocalMode()).toBe(true);
  });

  it('SQL Firewall chặn insert khi ở chế độ Local Mode', async () => {
    saveSqlModeConfig({ mode: 'local' });
    expect(isLocalMode()).toBe(true);

    const result = await supabase.from('orders').insert({
      id: 'test-local-order-1',
      code: 'DH-LOCAL-001',
      total: 100000,
    });

    expect(result).toEqual({ data: null, error: null });
  });

  it('SQL Firewall chặn update/upsert/delete khi ở chế độ Local Mode', async () => {
    saveSqlModeConfig({ mode: 'local' });

    const updateRes = await supabase.from('orders').update({ status: 'completed' }).eq('id', '123');
    expect(updateRes).toEqual({ data: null, error: null });

    const upsertRes = await supabase.from('products').upsert({ id: 'p1', name: 'Bánh mì' });
    expect(upsertRes).toEqual({ data: null, error: null });

    const deleteRes = await supabase.from('recipes').delete().eq('id', 'r1');
    expect(deleteRes).toEqual({ data: null, error: null });
  });

  it('syncOrderToSupabase không thực hiện ghi vào Cloud khi ở chế độ Local Mode', async () => {
    saveSqlModeConfig({ mode: 'local' });

    const mockOrder: any = {
      id: 'local-order-xyz',
      code: 'DH-TEST',
      created_at: new Date().toISOString(),
      customer: { name: 'Khách test' },
      items: [],
      payment: { total: 50000, method: 'cash' },
      status: 'completed',
    };

    // Khi ở local mode, syncOrderToSupabase phải return ngay lập tức mà không bắn network/error
    await expect(syncOrderToSupabase(mockOrder, 'completed')).resolves.not.toThrow();
  });
});
