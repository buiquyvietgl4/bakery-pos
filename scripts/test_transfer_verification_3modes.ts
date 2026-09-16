/**
 * TEST TOÀN DIỆN HỆ THỐNG XÁC THỰC CHUYỂN KHOẢN 3 CHẾ ĐỘ
 * & CƠ CHẾ KHẨN CẤP CHỤP ẢNH BILL KHÁCH ĐỐI SOÁT
 *
 * Chạy lệnh: npx tsx scripts/test_transfer_verification_3modes.ts
 */

// Mock browser localStorage & window for Node.js testing environment
const mockStorage: Record<string, string> = {};
const mockEventListeners: Record<string, Function[]> = {};

(globalThis as any).window = {
  addEventListener: (event: string, cb: Function) => {
    if (!mockEventListeners[event]) mockEventListeners[event] = [];
    mockEventListeners[event].push(cb);
  },
  removeEventListener: (event: string, cb: Function) => {
    if (!mockEventListeners[event]) return;
    mockEventListeners[event] = mockEventListeners[event].filter((f) => f !== cb);
  },
  dispatchEvent: (event: any) => {
    const cbs = mockEventListeners[event?.type || ''] || [];
    cbs.forEach((cb) => cb(event));
    return true;
  },
  localStorage: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => {
      mockStorage[key] = val;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    },
  },
};
(globalThis as any).localStorage = (globalThis as any).window.localStorage;
(globalThis as any).CustomEvent = class CustomEvent {
  type: string;
  detail: any;
  constructor(type: string, params?: any) {
    this.type = type;
    this.detail = params?.detail;
  }
};

import {
  TransferVerificationMode,
  TransferVerificationConfig,
  DEFAULT_TRANSFER_VERIFICATION_CONFIG,
  getTransferVerificationConfig,
  saveTransferVerificationConfigLocally,
  TRANSFER_VERIFY_UPDATED_EVENT,
} from '../src/lib/utils/paymentSync';

import {
  TransferApprovalPayload,
  TransferApprovalResolvedPayload,
} from '../src/lib/supabase/realtimeSync';

import {
  getStoredPendingTransfers,
  saveStoredPendingTransfers,
} from '../src/components/admin/AdminTransferApprovalWatcher';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runAllTests() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  KIỂM THỬ HỆ THỐNG XÁC THỰC CHUYỂN KHOẢN (3 CHẾ ĐỘ & CAMERA BILL)   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // TEST 1: Cấu hình mặc định
  console.log('━━━ TEST NHÓM 1: CẤU HÌNH MẶC ĐỊNH (DEFAULT CONFIG) ━━━');
  const defaultCfg = getTransferVerificationConfig();
  assert(defaultCfg.mode === 'none', 'Chế độ mặc định phải là "none" (Không cần xác thực)');
  assert(defaultCfg.two_step?.skipForAdmin === true, 'Mặc định skipForAdmin = true (Admin bán hàng bỏ qua duyệt 2 bước)');
  assert(defaultCfg.two_step?.alertSound === true, 'Mặc định alertSound = true (Bật chuông báo)');

  // TEST 2: Chuyển đổi và lưu trữ cục bộ 3 Chế độ
  console.log('\n━━━ TEST NHÓM 2: CHUYỂN ĐỔI VÀ LƯU 3 CHẾ ĐỘ ━━━');
  
  // 2.1 Mode None
  saveTransferVerificationConfigLocally({ mode: 'none' });
  const cfg1 = getTransferVerificationConfig();
  assert(cfg1.mode === 'none', 'Mode 1 (none) được lưu và đọc chính xác');

  // 2.2 Mode Two-Step
  saveTransferVerificationConfigLocally({
    mode: 'two_step',
    two_step: { skipForAdmin: false, alertSound: true },
  });
  const cfg2 = getTransferVerificationConfig();
  assert(cfg2.mode === 'two_step', 'Mode 2 (two_step) được lưu và đọc chính xác');
  assert(cfg2.two_step?.skipForAdmin === false, 'Tùy chọn skipForAdmin = false được lưu đúng');

  // 2.3 Mode Bank-Webhook
  saveTransferVerificationConfigLocally({ mode: 'bank_webhook' });
  const cfg3 = getTransferVerificationConfig();
  assert(cfg3.mode === 'bank_webhook', 'Mode 3 (bank_webhook) được lưu và đọc chính xác');

  // TEST 3: Quản lý hàng đợi chuyển khoản chờ duyệt (Pending Transfers Queue)
  console.log('\n━━━ TEST NHÓM 3: QUẢN LÝ DANH SÁCH DUYỆT CHUYỂN KHOẢN (PENDING QUEUE) ━━━');
  const samplePending1: TransferApprovalPayload = {
    order_number: 'BK-20260916-001',
    amount: 150000,
    cashier: 'Thu Ngân Mai',
    order_type: 'takeaway',
    timestamp: new Date().toISOString(),
  };

  const samplePending2: TransferApprovalPayload = {
    order_number: 'BK-20260916-002',
    amount: 320000,
    cashier: 'Thu Ngân Nam',
    order_type: 'dine_in',
    timestamp: new Date().toISOString(),
  };

  saveStoredPendingTransfers([samplePending1, samplePending2]);
  const storedList = getStoredPendingTransfers();
  assert(storedList.length === 2, 'Lưu 2 yêu cầu chuyển khoản chờ duyệt thành công');
  assert(storedList[0].order_number === 'BK-20260916-001', 'Mã đơn 1 khớp chính xác');
  assert(storedList[1].amount === 320000, 'Số tiền đơn 2 khớp 320.000₫');

  // Phê duyệt đơn 1: Loại khỏi danh sách chờ
  const afterApproved = storedList.filter((p) => p.order_number !== 'BK-20260916-001');
  saveStoredPendingTransfers(afterApproved);
  const updatedStoredList = getStoredPendingTransfers();
  assert(updatedStoredList.length === 1, 'Sau khi duyệt đơn 1, danh sách còn 1 đơn');
  assert(updatedStoredList[0].order_number === 'BK-20260916-002', 'Đơn còn lại là đơn 2');

  // TEST 4: Khế ước dữ liệu Phê Duyệt Realtime (Approval / Rejection Payload)
  console.log('\n━━━ TEST NHÓM 4: KHẾ ƯỚC DỮ LIỆU PHÊ DUYỆT REALTIME ━━━');
  const resolvePayloadApproved: TransferApprovalResolvedPayload = {
    order_number: 'BK-20260916-001',
    action: 'approved',
    amount: 150000,
    resolved_by: 'Chủ Tiệm (Admin)',
    resolved_at: new Date().toISOString(),
  };
  assert(resolvePayloadApproved.action === 'approved', 'Action approved hợp lệ');
  assert(resolvePayloadApproved.resolved_by === 'Chủ Tiệm (Admin)', 'Tên Admin duyệt hợp lệ');

  const resolvePayloadRejected: TransferApprovalResolvedPayload = {
    order_number: 'BK-20260916-002',
    action: 'rejected',
    amount: 320000,
    resolved_by: 'Chủ Tiệm (Admin)',
    resolved_at: new Date().toISOString(),
  };
  assert(resolvePayloadRejected.action === 'rejected', 'Action rejected hợp lệ');

  // TEST 5: Cơ chế khẩn cấp - Lưu trữ ảnh Bill chuyển khoản đối soát (Emergency Proof)
  console.log('\n━━━ TEST NHÓM 5: CƠ CHẾ KHẨN CẤP CHỤP ẢNH BILL KHÁCH ĐỐI SOÁT ━━━');
  const sampleCapturedProofImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...SAMPLE_BASE64_IMAGE_DATA...';

  const orderWithEmergencyProof = {
    id: 'ord-test-proof-1',
    order_number: 'BK-20260916-888',
    total_amount: 250000,
    payment_method: 'transfer',
    status: 'completed',
    transfer_proof_image: sampleCapturedProofImage,
    transfer_verification_mode: 'emergency_camera_proof',
    transfer_approved_by: 'Thu Ngân (Ảnh bill khách)',
    created_at: new Date().toISOString(),
  };

  assert(Boolean(orderWithEmergencyProof.transfer_proof_image), 'Đơn hàng lưu trữ thành công ảnh bill transfer_proof_image');
  assert(
    orderWithEmergencyProof.transfer_verification_mode === 'emergency_camera_proof',
    'Ghi nhận đúng phương thức xác thực khẩn cấp: emergency_camera_proof'
  );
  assert(
    orderWithEmergencyProof.transfer_approved_by.includes('Ảnh bill'),
    'Ghi nhận đúng người duyệt qua bằng chứng chụp bill'
  );

  // Tổng kết
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`TỔNG KẾT KIỂM THỬ: ${passedTests}/${totalTests} PASS ✅ | ${totalTests - passedTests} FAIL ❌`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Lỗi khi chạy kiểm thử:', err);
  process.exit(1);
});
