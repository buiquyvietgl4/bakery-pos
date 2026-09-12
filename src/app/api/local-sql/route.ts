// src/app/api/local-sql/route.ts
// API route máy chủ phục vụ lưu trữ & đọc CSDL Local SQL trực tiếp vào thư mục ổ cứng máy tính

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { generateMasterSqlDump, generateSchemaSql } from '@/lib/utils/localSqlManager';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dir = searchParams.get('dir');
    if (!dir) {
      return NextResponse.json({ success: false, error: 'Thiếu tham số thư mục' }, { status: 400 });
    }

    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) {
      return NextResponse.json({ success: false, exists: false, path: resolved });
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
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, dirPath, data } = body;

    if (!dirPath) {
      return NextResponse.json({ success: false, error: 'Chưa nhập đường dẫn thư mục' }, { status: 400 });
    }

    const targetDir = path.resolve(dirPath);

    if (action === 'test_or_create') {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      return NextResponse.json({
        success: true,
        message: `Thư mục "${targetDir}" đã sẵn sàng trên ổ đĩa máy tính.`,
        path: targetDir,
      });
    }

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

      const guideText = `============================================================================
HƯỚNG DẪN SỬ DỤNG VÀ CHẠY CSDL LOCAL SQL - TIỆM BÁNH ERP & POS
============================================================================
Đường dẫn thư mục: ${targetDir}
Ngày cập nhật: ${new Date().toLocaleString('vi-VN')}
Trạng thái: Hoạt động Cục bộ (Local SQL Mode) - Hoàn toàn độc lập với Cloud SQL.

DANH SÁCH CÁC TỆP CƠ SỞ DỮ LIỆU TRONG THƯ MỤC NÀY:
1. bakery_master.sql:
   - Tệp chứa toàn bộ câu lệnh CREATE TABLE và INSERT INTO của 100% dữ liệu.
2. bakery_schema.sql:
   - Cấu trúc khung bảng chuẩn (DDL).
3. bakery_local_db.json:
   - Dữ liệu CSDL dạng JSON cấu trúc đầy đủ.
============================================================================`;
      fs.writeFileSync(path.join(targetDir, 'HUONG_DAN_CHAY_SQL_LOCAL.txt'), guideText, 'utf-8');

      return NextResponse.json({
        success: true,
        message: `Đã lưu 100% CSDL vào thư mục "${targetDir}" thành công!`,
        path: targetDir,
      });
    }

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
        message: `Đã nạp dữ liệu từ thư mục "${targetDir}".`,
      });
    }

    return NextResponse.json({ success: false, error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
