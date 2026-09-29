import { describe, it, expect } from 'vitest';
import { generateUUID } from '@/lib/utils/uuid';

describe('generateUUID', () => {
  it('tạo chuỗi UUID v4 hợp lệ theo chuẩn RFC4122 (36 ký tự)', () => {
    const uuid = generateUUID();
    expect(uuid).toBeDefined();
    expect(typeof uuid).toBe('string');
    expect(uuid.length).toBe(36);
    // Regex chuẩn UUID v4: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(uuid).toMatch(uuidV4Regex);
  });

  it('các UUID tạo liên tiếp là duy nhất', () => {
    const set = new Set<string>();
    for (let i = 0; i < 100; i++) {
      set.add(generateUUID());
    }
    expect(set.size).toBe(100);
  });
});
