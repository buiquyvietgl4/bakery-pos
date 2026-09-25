// src/app/api/local-sql/route.ts
// API route máy chủ phục vụ lưu trữ & đọc CSDL Local SQL trực tiếp vào thư mục ổ cứng máy tính
// Hỗ trợ cơ chế 2 CSDL (Chính & Thử Nghiệm) và đồng bộ tập trung cho các máy con qua port mạng LAN

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateMasterSqlDump, generateSchemaSql } from '@/lib/utils/localSqlManager';

export const dynamic = 'force-dynamic';

function getServerSupabaseClient() {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://azgjnahbibrcbjooepef.supabase.co';
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn';
  try {
    const profFile = path.join(process.cwd(), '.active_database_profile.json');
    if (fs.existsSync(profFile)) {
      const prof = JSON.parse(fs.readFileSync(profFile, 'utf-8'));
      if (prof.url && prof.anonKey) {
        url = prof.url;
        anonKey = prof.anonKey;
      }
    }
  } catch {}
  return createClient(url, anonKey);
}

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

    // Kiểm tra tệp sao lưu tự động (Auto Backup) trên máy tính chủ
    if (searchParams.get('check_backup') === 'true') {
      const backupDir = path.join(process.cwd(), 'SQL backup', 'auto backup');
      const targetFilePath = path.join(backupDir, 'latest_backup.bakery.json');
      const exists = fs.existsSync(targetFilePath);
      let mtime: string | null = null;
      let sizeBytes = 0;
      let metadata: any = null;
      if (exists) {
        try {
          const stat = fs.statSync(targetFilePath);
          mtime = stat.mtime.toISOString();
          sizeBytes = stat.size;
          const content = fs.readFileSync(targetFilePath, 'utf-8');
          const parsed = JSON.parse(content);
          metadata = {
            totalProducts: parsed.metadata?.totalProducts ?? parsed.products?.length ?? 0,
            totalOrders: parsed.metadata?.totalOrders ?? parsed.orders?.length ?? 0,
            totalImages: parsed.metadata?.totalImages ?? parsed.images?.length ?? 0,
            createdAt: parsed.metadata?.createdAt || mtime,
          };
        } catch {}
      }

      // Quét tìm bản sao lưu bảo vệ an toàn trước khi Reset (Pre-Reset Safety Backup)
      let latestPreResetBackup: any = null;
      try {
        const candidateDirs = [backupDir, path.join(process.cwd(), 'SQL backup')];
        let newestMtime = 0;
        let bestFile = '';
        let bestDirPath = '';

        for (const cDir of candidateDirs) {
          if (fs.existsSync(cDir)) {
            const files = fs.readdirSync(cDir);
            for (const f of files) {
              if (
                f.startsWith('SAO_LUU_CUOI_TRUOC_KHI_RESET_') ||
                f.startsWith('SAO_LUU_TIEM_BANH_TRUOC_KHI_RESET_') ||
                f.startsWith('final_pre_reset_backup_')
              ) {
                try {
                  const stat = fs.statSync(path.join(cDir, f));
                  if (stat.mtimeMs > newestMtime) {
                    newestMtime = stat.mtimeMs;
                    bestFile = f;
                    bestDirPath = cDir;
                  }
                } catch {}
              }
            }
          }
        }

        if (bestFile && bestDirPath) {
          const fullPath = path.join(bestDirPath, bestFile);
          const stat = fs.statSync(fullPath);
          let preMeta: any = null;
          try {
            const raw = fs.readFileSync(fullPath, 'utf-8');
            const parsed = JSON.parse(raw);
            preMeta = {
              totalProducts: parsed.metadata?.totalProducts ?? parsed.products?.length ?? parsed.dexie_products?.length ?? 0,
              totalOrders: parsed.metadata?.totalOrders ?? parsed.orders?.length ?? parsed.dexie_orders?.length ?? 0,
              totalImages: parsed.metadata?.totalImages ?? parsed.images?.length ?? 0,
              createdAt: parsed.metadata?.createdAt || parsed.exported_at || stat.mtime.toISOString(),
            };
          } catch {}
          latestPreResetBackup = {
            filename: bestFile,
            folderPath: bestDirPath,
            mtime: stat.mtime.toISOString(),
            sizeBytes: stat.size,
            metadata: preMeta,
          };
        }
      } catch (scanErr) {
        console.warn('Lỗi quét pre-reset backup:', scanErr);
      }

      // Quét tìm và tự động dọn dẹp các bản sao lưu tạm thời 7 ngày (TTL: 7 ngày)
      const temp7DayBackups: any[] = [];
      const tempDir = path.join(process.cwd(), 'SQL backup', 'tam thoi 7 ngay');
      try {
        if (fs.existsSync(tempDir)) {
          const nowMs = Date.now();
          const files = fs.readdirSync(tempDir);
          for (const f of files) {
            if (f.endsWith('.bakery.json') || f.endsWith('.json')) {
              const fullPath = path.join(tempDir, f);
              try {
                const stat = fs.statSync(fullPath);
                const fileAgeMs = nowMs - stat.mtimeMs;
                // Nếu đã vượt quá 7 ngày -> Tự động dọn dẹp (tự hủy)
                if (fileAgeMs > 7 * 24 * 60 * 60 * 1000) {
                  try {
                    fs.unlinkSync(fullPath);
                    console.log(`[AutoPurge] Đã tự động xóa bản sao lưu tạm thời quá hạn 7 ngày: ${f}`);
                  } catch {}
                  continue;
                }

                // File còn trong hạn 7 ngày
                const expiresAtMs = stat.mtimeMs + 7 * 24 * 60 * 60 * 1000;
                const diffMs = expiresAtMs - nowMs;
                const daysRemaining = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
                const hoursRemaining = Math.max(0, Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)));

                let meta: any = null;
                try {
                  const raw = fs.readFileSync(fullPath, 'utf-8');
                  const parsed = JSON.parse(raw);
                  meta = {
                    totalProducts: parsed.metadata?.totalProducts ?? parsed.products?.length ?? parsed.dexie_products?.length ?? 0,
                    totalOrders: parsed.metadata?.totalOrders ?? parsed.orders?.length ?? parsed.dexie_orders?.length ?? 0,
                    totalImages: parsed.metadata?.totalImages ?? parsed.images?.length ?? 0,
                    createdAt: parsed.metadata?.createdAt || parsed.exported_at || stat.mtime.toISOString(),
                  };
                } catch {}

                temp7DayBackups.push({
                  filename: f,
                  folderPath: tempDir,
                  source: 'local_disk',
                  createdAt: stat.mtime.toISOString(),
                  expiresAt: new Date(expiresAtMs).toISOString(),
                  daysRemaining,
                  hoursRemaining,
                  sizeBytes: stat.size,
                  metadata: meta,
                });
              } catch {}
            }
          }
        }
      } catch (tempErr) {
        console.warn('Lỗi quét temp 7day backups (local):', tempErr);
      }

      // Quét tìm và tự động dọn dẹp các bản sao lưu tạm thời 7 ngày trên CLOUD SQL (Supabase)
      try {
        const supabase = getServerSupabaseClient();
        const { data: cloudRows } = await supabase
          .from('app_settings')
          .select('key, label, description, updated_at, value')
          .eq('category', 'cloud_backup_7day');

        if (cloudRows && cloudRows.length > 0) {
          const nowMs = Date.now();
          for (const row of cloudRows) {
            let meta: any = {};
            try {
              meta = typeof row.description === 'string' ? JSON.parse(row.description) : (row.description || {});
            } catch {}

            const createdAtStr = meta.createdAt || row.updated_at || new Date().toISOString();
            const expiresAtStr = meta.expiresAt || new Date(new Date(createdAtStr).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
            const expiresAtMs = new Date(expiresAtStr).getTime();
            const diffMs = expiresAtMs - nowMs;

            // Nếu đã vượt quá 7 ngày -> Tự động dọn dẹp trên Cloud SQL
            if (diffMs <= 0) {
              try {
                await supabase.from('app_settings').delete().eq('key', row.key);
                console.log(`[CloudAutoPurge] Đã tự động xóa bản sao lưu Cloud SQL quá hạn 7 ngày: ${row.key}`);
              } catch {}
              continue;
            }

            const daysRemaining = Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
            const hoursRemaining = Math.max(0, Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)));

            const val = row.value || {};
            const sizeBytes = meta.sizeBytes || Buffer.byteLength(JSON.stringify(val), 'utf-8');

            temp7DayBackups.push({
              filename: row.label || `${row.key}.bakery.json`,
              cloudKey: row.key,
              source: 'cloud_sql',
              createdAt: createdAtStr,
              expiresAt: expiresAtStr,
              daysRemaining,
              hoursRemaining,
              sizeBytes,
              metadata: {
                totalProducts: meta.productsCount ?? val.products?.length ?? val.dexie_products?.length ?? 0,
                totalOrders: meta.ordersCount ?? val.orders?.length ?? val.dexie_orders?.length ?? 0,
                totalImages: meta.imagesCount ?? val.images?.length ?? 0,
                createdAt: createdAtStr,
              },
            });
          }
        }
      } catch (cloudScanErr) {
        console.warn('Lỗi quét cloud temp backups:', cloudScanErr);
      }

      // Sắp xếp mới nhất lên đầu
      temp7DayBackups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      return NextResponse.json({
        success: true,
        exists,
        folderPath: backupDir,
        folderName: 'SQL backup/auto backup',
        filename: 'latest_backup.bakery.json',
        mtime,
        sizeBytes,
        metadata,
        latestPreResetBackup,
        temp7DayBackups,
      });
    }

    // Đọc trực tiếp nội dung tệp sao lưu (hỗ trợ cả ổ cứng máy chủ và Cloud SQL)
    if (searchParams.get('load_backup') === 'true') {
      const requestedFile = searchParams.get('file') || 'latest_backup.bakery.json';
      const cloudKey = searchParams.get('cloud_key');

      // 1. Kiểm tra nạp từ Cloud SQL nếu có cloudKey hoặc file bắt đầu bằng cloud_temp_backup_
      if (cloudKey || requestedFile.startsWith('cloud_temp_backup_')) {
        const targetKey = cloudKey || requestedFile.replace(/\.bakery\.json$/, '');
        try {
          const supabase = getServerSupabaseClient();
          const { data: row, error } = await supabase
            .from('app_settings')
            .select('key, label, value')
            .eq('key', targetKey)
            .maybeSingle();

          if (!error && row && row.value) {
            return NextResponse.json({
              success: true,
              filename: row.label || `${targetKey}.bakery.json`,
              data: row.value,
              source: 'cloud_sql',
            });
          }
        } catch (cErr: any) {
          return NextResponse.json({ success: false, error: 'Lỗi nạp từ Cloud SQL: ' + cErr.message }, { status: 500 });
        }
      }

      const safeFilename = path.basename(requestedFile);
      const backupDir = path.join(process.cwd(), 'SQL backup', 'auto backup');
      let targetFilePath = path.join(backupDir, safeFilename);

      if (!fs.existsSync(targetFilePath)) {
        const rootPath = path.join(process.cwd(), 'SQL backup', safeFilename);
        if (fs.existsSync(rootPath)) {
          targetFilePath = rootPath;
        } else {
          const tempPath = path.join(process.cwd(), 'SQL backup', 'tam thoi 7 ngay', safeFilename);
          if (fs.existsSync(tempPath)) {
            targetFilePath = tempPath;
          }
        }
      }

      if (fs.existsSync(targetFilePath)) {
        try {
          const content = fs.readFileSync(targetFilePath, 'utf-8');
          const parsed = JSON.parse(content);
          return NextResponse.json({
            success: true,
            filename: safeFilename,
            data: parsed,
          });
        } catch (err: any) {
          return NextResponse.json({ success: false, error: 'Lỗi giải mã file JSON: ' + err.message }, { status: 500 });
        }
      }
      return NextResponse.json({ success: false, error: 'Không tìm thấy file sao lưu trên ổ cứng hoặc Cloud SQL' }, { status: 404 });
    }

    // Tải trực tiếp file sao lưu về máy tính (hỗ trợ cả ổ cứng máy chủ và Cloud SQL)
    if (searchParams.get('download_file') === 'true') {
      const requestedFile = searchParams.get('file') || 'latest_backup.bakery.json';
      const cloudKey = searchParams.get('cloud_key');

      // 1. Kiểm tra tải từ Cloud SQL nếu có cloudKey hoặc file bắt đầu bằng cloud_temp_backup_
      if (cloudKey || requestedFile.startsWith('cloud_temp_backup_')) {
        const targetKey = cloudKey || requestedFile.replace(/\.bakery\.json$/, '');
        try {
          const supabase = getServerSupabaseClient();
          const { data: row, error } = await supabase
            .from('app_settings')
            .select('key, label, value')
            .eq('key', targetKey)
            .maybeSingle();

          if (!error && row && row.value) {
            const jsonStr = JSON.stringify(row.value, null, 2);
            const downloadName = row.label || `${targetKey}.bakery.json`;
            return new NextResponse(jsonStr, {
              status: 200,
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(downloadName)}"`,
              },
            });
          }
        } catch (cErr: any) {
          return NextResponse.json({ success: false, error: 'Lỗi tải từ Cloud SQL: ' + cErr.message }, { status: 500 });
        }
      }

      const safeFilename = path.basename(requestedFile);
      const candidateDirs = [
        path.join(process.cwd(), 'SQL backup', 'tam thoi 7 ngay'),
        path.join(process.cwd(), 'SQL backup', 'auto backup'),
        path.join(process.cwd(), 'SQL backup'),
      ];
      for (const cDir of candidateDirs) {
        const candidatePath = path.join(cDir, safeFilename);
        if (fs.existsSync(candidatePath)) {
          const fileContent = fs.readFileSync(candidatePath, 'utf-8');
          return new NextResponse(fileContent, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': `attachment; filename="${encodeURIComponent(safeFilename)}"`,
            },
          });
        }
      }
      return NextResponse.json({ success: false, error: 'Không tìm thấy file để tải' }, { status: 404 });
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

    // 3b. Lưu tệp Sao lưu tự động (Auto Backup) trực tiếp vào ổ đĩa máy tính (Chạy ngầm không bao giờ mất quyền)
    if (action === 'save_backup') {
      const backupDir = body.folderPath
        ? path.resolve(body.folderPath)
        : path.join(process.cwd(), 'SQL backup', 'auto backup');

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const backupData = body.data;
      if (!backupData) {
        return NextResponse.json({ success: false, error: 'Thiếu dữ liệu backup để lưu' }, { status: 400 });
      }

      const jsonString = JSON.stringify(backupData, null, 2);
      const incomingProdCount = backupData.metadata?.totalProducts ?? backupData.products?.length ?? 0;
      const incomingOrderCount = backupData.metadata?.totalOrders ?? backupData.orders?.length ?? 0;

      let targetFilename = 'latest_backup.bakery.json';
      let targetFilePath = path.join(backupDir, targetFilename);

      // 🛡️ BẢO VỆ CHỐNG GHI ĐÈ TRẮNG DỮ LIỆU SAU RESET:
      // Nếu dữ liệu mới là 0 bánh & 0 đơn, nhưng file latest_backup hiện có trên đĩa đang chứa dữ liệu thực tế (> 0):
      // Tuyệt đối không ghi đè lên latest_backup.bakery.json!
      if (incomingProdCount === 0 && incomingOrderCount === 0 && fs.existsSync(targetFilePath)) {
        try {
          const existingRaw = fs.readFileSync(targetFilePath, 'utf-8');
          const existingParsed = JSON.parse(existingRaw);
          const existingProd = existingParsed.metadata?.totalProducts ?? existingParsed.products?.length ?? 0;
          const existingOrder = existingParsed.metadata?.totalOrders ?? existingParsed.orders?.length ?? 0;
          if (existingProd > 0 || existingOrder > 0) {
            targetFilename = 'post_reset_empty_state.bakery.json';
            targetFilePath = path.join(backupDir, targetFilename);
          }
        } catch {}
      }

      fs.writeFileSync(targetFilePath, jsonString, 'utf-8');

      // Tự động dọn dẹp các file sao lưu cũ tạm thời trong thư mục nếu cần, chỉ giữ lại file latest_backup
      // TUYỆT ĐỐI KHÔNG XÓA CÁC FILE SAO LƯU CUỐI TRƯỚC KHI RESET!
      try {
        const files = fs.readdirSync(backupDir);
        for (const f of files) {
          if (
            f !== targetFilename &&
            f !== 'latest_backup.bakery.json' &&
            f !== 'THU_MUC_SAO_LUU_TIEM_BANH.txt' &&
            f !== 'bakery_master.sql' &&
            f !== 'bakery_schema.sql' &&
            f !== 'bakery_local_db.json' &&
            f !== 'HUONG_DAN_CHAY_SQL_LOCAL.txt' &&
            !f.startsWith('SAO_LUU_CUOI_TRUOC_KHI_RESET_') &&
            !f.startsWith('SAO_LUU_TIEM_BANH_TRUOC_KHI_RESET_') &&
            !f.startsWith('final_pre_reset_backup_') &&
            !f.startsWith('SAO_LUU_TAM_THOI_7_NGAY_') &&
            (f.endsWith('.bakery.json') || f.startsWith('bakery_backup_') || f.includes('.temp.'))
          ) {
            try {
              fs.unlinkSync(path.join(backupDir, f));
            } catch {}
          }
        }
      } catch {}

      // Tạo/Cập nhật file README hướng dẫn
      try {
        const sizeKb = Math.round(Buffer.byteLength(jsonString, 'utf-8') / 1024);
        const prodCount = backupData.metadata?.totalProducts ?? backupData.products?.length ?? 0;
        const orderCount = backupData.metadata?.totalOrders ?? backupData.orders?.length ?? 0;
        const imgCount = backupData.metadata?.totalImages ?? backupData.images?.length ?? 0;

        const infoText = 
`=============================================================
THƯ MỤC NHẬN DỮ LIỆU SAO LƯU TỰ ĐỘNG - TIỆM BÁNH ERP & POS
=============================================================
• Thư mục: ${path.basename(backupDir)} (${backupDir})
• Trạng thái: ĐÃ KẾT NỐI & TỰ ĐỘNG CẬP NHẬT LIÊN TỤC
• Cơ chế lưu trữ: CHỈ GIỮ 1 FILE MỚI NHẤT (Tự động cập nhật không bao giờ mất quyền)
• Tệp sao lưu gần nhất: ${targetFilename} (${sizeKb} KB)
• Lần cập nhật mới nhất: ${new Date().toLocaleString('vi-VN')}
• Thống kê dữ liệu: ${prodCount} loại bánh, ${orderCount} đơn hàng, ${imgCount} hình ảnh

Dữ liệu được cập nhật tự động định kỳ và mỗi khi:
- Quầy POS hoàn tất đơn hàng hoặc đơn đặt bánh mới
- Quản lý cập nhật bánh, giá bán, công thức BOM, kho nguyên liệu
- Ghi nhận hao hụt, phiếu chi OPEX, sổ thu chi két

Để phục hồi dữ liệu: Mở menu Quản trị Admin -> Bấm "Sao Lưu / Phục Hồi" -> 
Chọn "Khôi Phục & Đẩy Lên SQL" và chọn file "${targetFilename}" trong thư mục này.
=============================================================`;
        fs.writeFileSync(path.join(backupDir, 'THU_MUC_SAO_LUU_TIEM_BANH.txt'), infoText, 'utf-8');
      } catch {}

      return NextResponse.json({
        success: true,
        method: 'server_disk',
        filename: targetFilename,
        path: targetFilePath,
        folderPath: backupDir,
        sizeBytes: Buffer.byteLength(jsonString, 'utf-8'),
        savedAt: new Date().toISOString(),
      });
    }

    // 3c. Dọn dẹp các tệp sao lưu cũ thừa trong thư mục máy tính
    if (action === 'clean_backup') {
      const backupDir = body.folderPath
        ? path.resolve(body.folderPath)
        : path.join(process.cwd(), 'SQL backup', 'auto backup');
      let deletedCount = 0;
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir);
        for (const f of files) {
          if (
            f !== 'latest_backup.bakery.json' &&
            f !== 'THU_MUC_SAO_LUU_TIEM_BANH.txt' &&
            f !== 'bakery_master.sql' &&
            f !== 'bakery_schema.sql' &&
            f !== 'bakery_local_db.json' &&
            f !== 'HUONG_DAN_CHAY_SQL_LOCAL.txt' &&
            !f.startsWith('SAO_LUU_CUOI_TRUOC_KHI_RESET_') &&
            !f.startsWith('SAO_LUU_TIEM_BANH_TRUOC_KHI_RESET_') &&
            !f.startsWith('final_pre_reset_backup_') &&
            !f.startsWith('SAO_LUU_TAM_THOI_7_NGAY_') &&
            (f.endsWith('.bakery.json') || f.startsWith('bakery_backup_') || f.includes('.temp.'))
          ) {
            try {
              fs.unlinkSync(path.join(backupDir, f));
              deletedCount++;
            } catch {}
          }
        }
      }
      return NextResponse.json({
        success: true,
        deletedCount,
        message: deletedCount > 0
          ? `Đã dọn dẹp ${deletedCount} tệp sao lưu cũ trong thư mục ổ cứng!`
          : `Thư mục ổ cứng máy tính đã sạch sẽ, chỉ giữ duy nhất tệp dữ liệu mới nhất.`,
      });
    }

    // 3d. Tạo Bản Sao Lưu Bảo Vệ Tối Hậu Trước Khi Reset Hệ Thống (Không bao giờ bị xóa, lưu đa tầng)
    if (action === 'save_critical_pre_reset_backup') {
      const backupDir = body.folderPath
        ? path.resolve(body.folderPath)
        : path.join(process.cwd(), 'SQL backup', 'auto backup');

      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const backupData = body.data;
      if (!backupData) {
        return NextResponse.json({ success: false, error: 'Thiếu dữ liệu để lưu' }, { status: 400 });
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const preResetFilename = `SAO_LUU_CUOI_TRUOC_KHI_RESET_${timeStr}.bakery.json`;
      const targetFilePath = path.join(backupDir, preResetFilename);
      const jsonString = JSON.stringify(backupData, null, 2);

      fs.writeFileSync(targetFilePath, jsonString, 'utf-8');

      // Lưu thêm 1 bản dự phòng kép vào thư mục cha 'SQL backup'
      try {
        const rootBackupDir = path.join(process.cwd(), 'SQL backup');
        if (fs.existsSync(rootBackupDir)) {
          fs.writeFileSync(path.join(rootBackupDir, preResetFilename), jsonString, 'utf-8');
        }
      } catch {}

      return NextResponse.json({
        success: true,
        filename: preResetFilename,
        path: targetFilePath,
        sizeBytes: Buffer.byteLength(jsonString, 'utf-8'),
        savedAt: now.toISOString(),
      });
    }

    // 3e. Lưu bản sao lưu tạm thời 7 ngày trước khi Reset (Tự hủy sau 7 ngày)
    if (action === 'save_temp_7day_backup') {
      const tempDir = path.join(process.cwd(), 'SQL backup', 'tam thoi 7 ngay');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const backupData = body.data;
      if (!backupData) {
        return NextResponse.json({ success: false, error: 'Thiếu dữ liệu để lưu' }, { status: 400 });
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const tempFilename = `SAO_LUU_TAM_THOI_7_NGAY_${timeStr}.bakery.json`;
      const targetFilePath = path.join(tempDir, tempFilename);

      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const enhancedData = {
        ...backupData,
        metadata: {
          ...(backupData.metadata || {}),
          isTemporary7Day: true,
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          retentionDays: 7,
        },
      };

      const jsonString = JSON.stringify(enhancedData, null, 2);
      fs.writeFileSync(targetFilePath, jsonString, 'utf-8');

      // 🔥 BẢO HIỂM CHỐNG XÂM NHẬP: LƯU TRỰC TIẾP LÊN CLOUD SQL (SUPABASE)
      let cloudSaved = false;
      const cloudKey = `cloud_temp_backup_${now.getTime()}`;
      try {
        const supabase = getServerSupabaseClient();
        const cloudMeta = {
          filename: tempFilename,
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          sizeBytes: Buffer.byteLength(jsonString, 'utf-8'),
          productsCount: enhancedData.products?.length || 0,
          ordersCount: enhancedData.orders?.length || 0,
          imagesCount: enhancedData.images?.length || 0,
          isTemporary7Day: true,
          storageType: 'cloud_sql',
        };

        const { error: cloudErr } = await supabase.from('app_settings').upsert({
          key: cloudKey,
          value: enhancedData,
          category: 'cloud_backup_7day',
          label: tempFilename,
          description: JSON.stringify(cloudMeta),
          input_type: 'json',
          updated_at: now.toISOString(),
        });
        if (!cloudErr) {
          cloudSaved = true;
          console.log(`☁️ [API Temp7Days] Đã lưu bản sao lưu 7 ngày lên Cloud SQL: ${cloudKey}`);
        }
      } catch (cErr) {
        console.warn('Lỗi ghi Cloud SQL:', cErr);
      }

      console.log(`📦 [Temp7Days] Đã lưu bản sao lưu tạm thời 7 ngày: ${tempFilename} (Hết hạn: ${expiresAt.toLocaleString('vi-VN')})`);

      return NextResponse.json({
        success: true,
        filename: tempFilename,
        path: targetFilePath,
        cloudKey: cloudSaved ? cloudKey : undefined,
        cloudSaved,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        sizeBytes: Buffer.byteLength(jsonString, 'utf-8'),
      });
    }

    // 3f. Xóa thủ công 1 bản sao lưu tạm thời 7 ngày nếu người dùng yêu cầu
    if (action === 'delete_temp_7day_backup') {
      const filename = body.filename;
      const cloudKey = body.cloudKey;
      let deletedCount = 0;

      // Xóa trên Cloud SQL nếu có cloudKey
      if (cloudKey) {
        try {
          const supabase = getServerSupabaseClient();
          await supabase.from('app_settings').delete().eq('key', cloudKey);
          deletedCount++;
        } catch {}
      }

      // Xóa trên local disk nếu có filename
      if (filename) {
        const safeFilename = path.basename(filename);
        const tempDir = path.join(process.cwd(), 'SQL backup', 'tam thoi 7 ngay');
        const targetFilePath = path.join(tempDir, safeFilename);

        if (fs.existsSync(targetFilePath)) {
          try {
            fs.unlinkSync(targetFilePath);
            deletedCount++;
          } catch {}
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Đã xóa bản sao lưu tạm thời thành công',
        deletedCount,
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
