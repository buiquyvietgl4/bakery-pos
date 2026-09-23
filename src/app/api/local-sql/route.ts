// src/app/api/local-sql/route.ts
// API route máy chủ phục vụ lưu trữ & đọc CSDL Local SQL trực tiếp vào thư mục ổ cứng máy tính
// Hỗ trợ cơ chế 2 CSDL (Chính & Thử Nghiệm) và đồng bộ tập trung cho các máy con qua port mạng LAN

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateMasterSqlDump, generateSchemaSql } from '@/lib/utils/localSqlManager';

export const dynamic = 'force-dynamic';

export function findFolderPath(folderName: string): string | null {
  if (!folderName || typeof folderName !== 'string') return null;
  const cleaned = folderName.trim().toLowerCase();
  if (!cleaned) return null;

  const defaultProd = 'C:\\Users\\H\\.gemini\\antigravity\\scratch\\bakery-erp\\SQL backup\\SQL LOCAL';
  const defaultTest = 'C:\\Users\\H\\.gemini\\antigravity\\scratch\\bakery-erp\\SQL backup\\SQL TEST';

  if (cleaned.includes('test')) return defaultTest;
  return defaultProd;
}

export type LocalSqlEnvId = 'production' | 'testing';

interface ServerLocalSqlState {
  activeLocalEnv: LocalSqlEnvId;
  production: {
    dirPath: string;
    lastSyncAt?: string;
  };
  testing: {
    dirPath: string;
    lastSyncAt?: string;
  };
  updatedAt: string;
}

const SERVER_STATE_FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), '.local_sql_server_state.json');

function getServerState(): ServerLocalSqlState {
  const defaultState: ServerLocalSqlState = {
    activeLocalEnv: 'production',
    production: { dirPath: '' },
    testing: { dirPath: '' },
    updatedAt: new Date().toISOString(),
  };

  try {
    if (fs.existsSync(SERVER_STATE_FILE)) {
      const raw = fs.readFileSync(SERVER_STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        ...defaultState,
        ...parsed,
        production: { ...defaultState.production, ...(parsed.production || {}) },
        testing: { ...defaultState.testing, ...(parsed.testing || {}) },
      };
    }
  } catch (e) {
    console.warn('[API local-sql] Lỗi đọc server state file:', e);
  }
  return defaultState;
}

function saveServerState(state: Partial<ServerLocalSqlState>): ServerLocalSqlState {
  const current = getServerState();
  const updated: ServerLocalSqlState = {
    ...current,
    ...state,
    production: { ...current.production, ...(state.production || {}) },
    testing: { ...current.testing, ...(state.testing || {}) },
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(SERVER_STATE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    console.warn('[API local-sql] Lỗi ghi server state file:', e);
  }
  return updated;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dir = searchParams.get('dir');
    const findName = searchParams.get('find_name') || searchParams.get('folderName');
    const state = getServerState();

    // Tìm kiếm đường dẫn tuyệt đối theo tên thư mục
    if (findName) {
      const resolvedPath = findFolderPath(findName);
      return NextResponse.json({
        success: true,
        found: !!resolvedPath,
        folderName: findName,
        path: resolvedPath || '',
      });
    }

    // Nếu không truyền dir, trả về trạng thái máy chủ (cho các máy con qua port đồng bộ)
    if (!dir) {
      return NextResponse.json({
        success: true,
        serverState: state,
        activeEnv: state.activeLocalEnv,
      });
    }

    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({
        success: false,
        exists: false,
        path: resolved,
        serverState: state,
      });
    }

    const masterSqlPath = path.join(resolved, 'bakery_master.sql');
    const jsonPath = path.join(resolved, 'bakery_local_db.json');

    return NextResponse.json({
      success: true,
      exists: true,
      path: resolved,
      hasMasterSql: fs.existsSync(masterSqlPath),
      hasJson: fs.existsSync(jsonPath),
      files: fs.readdirSync(resolved),
      serverState: state,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, dirPath, data, env } = body;
    const currentState = getServerState();

    // 1. Lấy trạng thái máy chủ
    if (action === 'get_server_state') {
      return NextResponse.json({
        success: true,
        serverState: currentState,
        activeEnv: currentState.activeLocalEnv,
      });
    }

    // 1b. Dò tìm đường dẫn thư mục theo tên
    if (action === 'resolve_folder_path') {
      const name = body.folderName || body.name;
      const resolvedPath = findFolderPath(name);
      return NextResponse.json({
        success: true,
        found: !!resolvedPath,
        folderName: name,
        path: resolvedPath || '',
      });
    }

    // 2. Chuyển đổi môi trường kích hoạt trên máy chủ (Chính vs Test)
    if (action === 'set_active_env') {
      const targetEnv: LocalSqlEnvId = env === 'testing' ? 'testing' : 'production';
      const patch: Partial<ServerLocalSqlState> = {
        activeLocalEnv: targetEnv,
      };
      if (dirPath) {
        if (targetEnv === 'production') {
          patch.production = { ...currentState.production, dirPath: path.resolve(dirPath) };
        } else {
          patch.testing = { ...currentState.testing, dirPath: path.resolve(dirPath) };
        }
      }
      const updatedState = saveServerState(patch);
      return NextResponse.json({
        success: true,
        message: `Đã kích hoạt môi trường "${targetEnv === 'production' ? 'Local SQL Chính' : 'Local SQL Thử Nghiệm'}" trên máy chủ.`,
        serverState: updatedState,
      });
    }

    // Xác định thư mục đích (nếu không truyền dirPath thì lấy từ server state của môi trường đó)
    let targetDir = dirPath ? path.resolve(dirPath) : '';
    const currentEnv: LocalSqlEnvId = env || currentState.activeLocalEnv;

    if (!targetDir) {
      targetDir = currentEnv === 'testing' ? currentState.testing.dirPath : currentState.production.dirPath;
    }

    if (!targetDir && action !== 'get_server_state') {
      return NextResponse.json({
        success: false,
        error: 'Chưa cấu hình đường dẫn thư mục cho môi trường này.',
      }, { status: 400 });
    }

    // 3. Kiểm tra hoặc tạo thư mục
    if (action === 'test_or_create') {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Cập nhật đường dẫn vào server state nếu cần
      if (currentEnv === 'production') {
        saveServerState({ production: { ...currentState.production, dirPath: targetDir } });
      } else {
        saveServerState({ testing: { ...currentState.testing, dirPath: targetDir } });
      }

      return NextResponse.json({
        success: true,
        message: `Thư mục "${targetDir}" đã sẵn sàng trên ổ đĩa máy tính chủ.`,
        path: targetDir,
        serverState: getServerState(),
      });
    }

    // 4. Lưu toàn bộ CSDL vào thư mục
    if (action === 'save_sql') {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      if (!data) {
        return NextResponse.json({ success: false, error: 'Thiếu dữ liệu để lưu' }, { status: 400 });
      }

      const masterSql = generateMasterSqlDump(data);
      const schemaSql = generateSchemaSql();
      const localDbJson = JSON.stringify(data, null, 2);

      fs.writeFileSync(path.join(targetDir, 'bakery_master.sql'), masterSql, 'utf-8');
      fs.writeFileSync(path.join(targetDir, 'bakery_schema.sql'), schemaSql, 'utf-8');
      fs.writeFileSync(path.join(targetDir, 'bakery_local_db.json'), localDbJson, 'utf-8');

      const isTestEnv = currentEnv === 'testing';
      const envTitle = isTestEnv ? 'THỬ NGHIỆM (TEST & FIX LỖI)' : 'CHÍNH THỨC (PRODUCTION - BÁN HÀNG)';
      const envDesc = isTestEnv
        ? 'Dùng để thử nghiệm tính năng, tạo đơn hàng ảo, thử công thức mà hoàn toàn KHÔNG ảnh hưởng CSDL Chính.'
        : 'Cơ sở dữ liệu bán hàng thực tế của tiệm bánh. Chứa toàn bộ đơn hàng, kho và doanh thu thật.';

      const guideText = `============================================================================
HƯỚNG DẪN SỬ DỤNG VÀ CHẠY CSDL LOCAL SQL - TIỆM BÁNH ERP & POS
============================================================================
MÔI TRƯỜNG: LOCAL SQL ${envTitle}
Mô tả: ${envDesc}
Đường dẫn thư mục: ${targetDir}
Ngày cập nhật: ${new Date().toLocaleString('vi-VN')}
Trạng thái: Hoạt động Cục bộ (Local SQL Mode) - Độc lập hoàn toàn với Cloud SQL.

DANH SÁCH CÁC TỆP CƠ SỞ DỮ LIỆU TRONG THƯ MỤC NÀY:
1. bakery_master.sql:
   - Tệp chứa toàn bộ câu lệnh CREATE TABLE và INSERT INTO của 100% dữ liệu.
   - Chạy được trên SQLite, PostgreSQL, MySQL, DBeaver, Navicat.
2. bakery_schema.sql:
   - Cấu trúc khung bảng chuẩn (DDL).
3. bakery_local_db.json:
   - Dữ liệu CSDL dạng JSON cấu trúc đầy đủ, phục vụ cho phần mềm tiệm bánh nạp
     ngược lại (Restore) ngay lập tức mà không cần mạng.

LƯU Ý DÀNH CHO MẠNG LAN (CÁC MÁY CON KẾT NỐI QUA PORT):
- Thư mục này nằm trực tiếp trên ổ cứng của Máy Chủ (Host PC).
- Khi máy chủ kích hoạt môi trường ${isTestEnv ? 'TEST' : 'CHÍNH'}, mọi thiết bị qua cổng port
  sẽ tự động đồng bộ và lưu dữ liệu vào đúng thư mục này.
============================================================================`;
      fs.writeFileSync(path.join(targetDir, 'HUONG_DAN_CHAY_SQL_LOCAL.txt'), guideText, 'utf-8');

      // Cập nhật thời gian đồng bộ vào server state
      const nowStr = new Date().toISOString();
      if (currentEnv === 'production') {
        saveServerState({
          production: { dirPath: targetDir, lastSyncAt: nowStr },
        });
      } else {
        saveServerState({
          testing: { dirPath: targetDir, lastSyncAt: nowStr },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Đã lưu 100% CSDL vào thư mục ${isTestEnv ? 'Test' : 'Chính'} ("${targetDir}") thành công!`,
        path: targetDir,
        env: currentEnv,
        serverState: getServerState(),
      });
    }

    // 5. Đọc CSDL từ thư mục
    if (action === 'read_sql') {
      const jsonPath = path.join(targetDir, 'bakery_local_db.json');
      if (!fs.existsSync(jsonPath)) {
        return NextResponse.json({
          success: false,
          error: `Không tìm thấy tệp bakery_local_db.json trong thư mục "${targetDir}".`,
        }, { status: 404 });
      }

      const raw = fs.readFileSync(jsonPath, 'utf-8');
      const parsed = JSON.parse(raw);

      return NextResponse.json({
        success: true,
        data: parsed,
        path: targetDir,
        env: currentEnv,
        message: `Đã nạp dữ liệu từ thư mục "${targetDir}".`,
      });
    }

    // 6. Sao chép dữ liệu từ Thư mục Chính sang Thư mục Test (Clone)
    if (action === 'clone_production_to_testing') {
      const prodDir = currentState.production.dirPath ? path.resolve(/*turbopackIgnore: true*/ currentState.production.dirPath) : '';
      const testDir = currentState.testing.dirPath ? path.resolve(/*turbopackIgnore: true*/ currentState.testing.dirPath) : (dirPath ? path.resolve(/*turbopackIgnore: true*/ dirPath) : '');

      if (!prodDir || !fs.existsSync(prodDir)) {
        return NextResponse.json({
          success: false,
          error: 'Thư mục Local SQL Chính chưa tồn tại hoặc chưa có dữ liệu để sao chép.',
        }, { status: 400 });
      }

      if (!testDir) {
        return NextResponse.json({
          success: false,
          error: 'Chưa cấu hình thư mục Local SQL Test.',
        }, { status: 400 });
      }

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const filesToCopy = ['bakery_master.sql', 'bakery_schema.sql', 'bakery_local_db.json'];
      let copiedCount = 0;
      for (const f of filesToCopy) {
        const src = path.join(/*turbopackIgnore: true*/ prodDir, f);
        const dst = path.join(/*turbopackIgnore: true*/ testDir, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst);
          copiedCount++;
        }
      }

      const nowStr = new Date().toISOString();
      saveServerState({
        testing: { dirPath: testDir, lastSyncAt: nowStr },
      });

      return NextResponse.json({
        success: true,
        message: `Đã sao chép thành công ${copiedCount} tệp CSDL từ thư mục Chính sang thư mục Test!`,
        fromDir: prodDir,
        toDir: testDir,
        serverState: getServerState(),
      });
    }

    // 7. Lưu cấu hình bảo mật & phân quyền vào Local SQL
    if (action === 'save_security_config') {
      if (!data) {
        return NextResponse.json({ success: false, error: 'Thiếu dữ liệu cấu hình bảo mật' }, { status: 400 });
      }

      // Lưu vào bakery_local_db.json (cập nhật trường security_config)
      const jsonPath = path.join(targetDir, 'bakery_local_db.json');
      let localDb: any = {};
      try {
        if (fs.existsSync(jsonPath)) {
          localDb = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        }
      } catch {}

      localDb.security_config = data;
      if (localDb.settings) {
        localDb.settings.security = data;
      }

      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.writeFileSync(jsonPath, JSON.stringify(localDb, null, 2), 'utf-8');

      // Tái tạo bakery_master.sql và bakery_schema.sql
      try {
        const masterSql = generateMasterSqlDump(localDb);
        const schemaSql = generateSchemaSql();
        fs.writeFileSync(path.join(targetDir, 'bakery_master.sql'), masterSql, 'utf-8');
        fs.writeFileSync(path.join(targetDir, 'bakery_schema.sql'), schemaSql, 'utf-8');
      } catch (sqlErr) {
        console.warn('[API local-sql] Lỗi tái tạo SQL files:', sqlErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Đã lưu cấu hình bảo mật & phân quyền vào Local SQL thành công!',
        path: targetDir,
        env: currentEnv,
      });
    }

    // 8. Đọc cấu hình bảo mật & phân quyền từ Local SQL
    if (action === 'get_security_config') {
      const jsonPath = path.join(targetDir, 'bakery_local_db.json');
      if (!fs.existsSync(jsonPath)) {
        return NextResponse.json({
          success: false,
          error: 'Chưa có dữ liệu Local SQL để đọc cấu hình bảo mật.',
          data: null,
        });
      }

      try {
        const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const secConfig = raw?.security_config || raw?.security || raw?.settings?.security || null;
        return NextResponse.json({
          success: true,
          data: secConfig,
          path: targetDir,
          env: currentEnv,
        });
      } catch (readErr: any) {
        return NextResponse.json({ success: false, error: readErr.message, data: null });
      }
    }

    return NextResponse.json({ success: false, error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
