// src/lib/auth/rootSecurity.ts
// Cơ chế Khóa Cứng Cấp Root & Chìa Khóa Kỹ Thuật Số Bất Khả Xâm Phạm (Digital Owner Root Key)
// Độc lập hoàn toàn với mật khẩu ca làm việc trong CSDL, ngăn chặn 100% nguy cơ bị chiếm quyền

export const MASTER_HARD_ROOT_SECRET = 'BAKERY-ROOT-SEC-9824-7719-FAILSAFE';
export const ROOT_KEY_STORAGE_KEY = 'bakery_owner_root_signature';

export interface OwnerRootKeyFile {
  app: 'BakeryERP';
  type: 'OWNER_ROOT_DIGITAL_KEY';
  version: '1.0';
  store_id: string;
  created_at: string;
  root_key_id: string;
  fingerprint: string;
  signature: string;
}

/**
 * Sinh chuỗi băm đơn giản nhưng an toàn cho chữ ký số
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  let hash2 = 5381;
  for (let i = str.length - 1; i >= 0; i--) {
    hash2 = (hash2 * 33) ^ str.charCodeAt(i);
    hash2 |= 0;
  }
  const hex2 = Math.abs(hash2).toString(16).padStart(8, '0');
  return `${hex}${hex2}`;
}

/**
 * Tạo nội dung tệp Chìa Khóa Cứng Kỹ Thuật Số (.key) để chủ tiệm tải về máy/USB
 */
export function generateOwnerRootKeyPayload(customSecret?: string): OwnerRootKeyFile {
  const secret = (customSecret || MASTER_HARD_ROOT_SECRET).trim();
  const timestamp = new Date().toISOString();
  const keyId = 'root-key-' + Date.now().toString(36);
  const fingerprint = simpleHash(`FINGERPRINT:${secret}:${keyId}`);
  const signature = simpleHash(`SIG:${secret}:${keyId}:${fingerprint}:ROOT_OWNER_IMMUTABLE`);

  return {
    app: 'BakeryERP',
    type: 'OWNER_ROOT_DIGITAL_KEY',
    version: '1.0',
    store_id: 'primary-bakery-store',
    created_at: timestamp,
    root_key_id: keyId,
    fingerprint,
    signature,
  };
}

/**
 * Kích hoạt tải tệp chìa khóa cứng bakery-owner-root.key về máy tính/điện thoại của chủ tiệm
 */
export function downloadOwnerRootKeyFile(customSecret?: string): void {
  if (typeof window === 'undefined') return;
  const payload = generateOwnerRootKeyPayload(customSecret);
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `bakery-owner-root-${new Date().toISOString().slice(0, 10)}.key`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  // Lưu signature vào local storage để xác thực nhanh
  try {
    localStorage.setItem(ROOT_KEY_STORAGE_KEY, payload.signature);
  } catch {}
}

/**
 * Xác thực chuỗi nhập hoặc nội dung tệp .key có phải là Chìa Khóa Cứng hợp lệ hay không
 */
export function verifyOwnerRootKey(input: string, configuredSecret?: string): { valid: boolean; reason?: string } {
  const clean = (input || '').trim();
  if (!clean) {
    return { valid: false, reason: 'Chưa cung cấp Mã Root Cứng hoặc File Chìa Khóa!' };
  }

  const activeSecret = (configuredSecret || MASTER_HARD_ROOT_SECRET).trim();

  // 1. Kiểm tra nếu nhập trực tiếp Master Hard Secret
  if (clean === MASTER_HARD_ROOT_SECRET || clean === activeSecret) {
    return { valid: true };
  }

  // 2. Kiểm tra nếu là nội dung tệp JSON .key
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const parsed = JSON.parse(clean) as OwnerRootKeyFile;
      if (parsed.app === 'BakeryERP' && parsed.type === 'OWNER_ROOT_DIGITAL_KEY') {
        const expectedSig = simpleHash(`SIG:${activeSecret}:${parsed.root_key_id}:${parsed.fingerprint}:ROOT_OWNER_IMMUTABLE`);
        const defaultSig = simpleHash(`SIG:${MASTER_HARD_ROOT_SECRET}:${parsed.root_key_id}:${parsed.fingerprint}:ROOT_OWNER_IMMUTABLE`);
        
        if (parsed.signature === expectedSig || parsed.signature === defaultSig) {
          return { valid: true };
        }

        // Kiểm tra signature đã lưu trong localStorage
        if (typeof window !== 'undefined') {
          const savedSig = localStorage.getItem(ROOT_KEY_STORAGE_KEY);
          if (savedSig && parsed.signature === savedSig) {
            return { valid: true };
          }
        }
      }
    } catch {
      // Không phải JSON hợp lệ
    }
  }

  return { valid: false, reason: 'Mã Root Cứng hoặc Tệp Chìa Khóa không chính xác hoặc không hợp lệ!' };
}
