import * as XLSX from 'xlsx';

/**
 * Tiện ích xuất file Excel chuyên nghiệp chuẩn OpenXML (.xlsx) và UTF-8 CSV
 * Hỗ trợ tiếng Việt có dấu chuẩn 100%
 * Mở được ngay bằng Microsoft Excel, Google Sheets, LibreOffice, WPS Office, Office 365
 * KHÔNG BAO GIỜ BỊ CẢNH BÁO "The file format and extension don't match"
 */

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  type?: 'string' | 'number' | 'currency' | 'date';
  align?: 'left' | 'center' | 'right';
}

/**
 * Tải xuống file blob về máy người dùng
 */
export function downloadFile(content: BlobPart, filename: string, mimeType: string) {
  if (typeof window === 'undefined') return;
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Xuất file CSV chuẩn UTF-8 (có ký tự BOM \uFEFF giúp Excel không bị lỗi font tiếng Việt)
 */
export function exportToCSV(
  filename: string,
  columns: { header: string; key: string }[],
  data: any[]
) {
  const headers = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const rows = data.map((item) =>
    columns
      .map((col) => {
        const val = item[col.key] !== undefined && item[col.key] !== null ? String(item[col.key]) : '';
        return `"${val.replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
  downloadFile(csvContent, filename.endsWith('.csv') ? filename : `${filename}.csv`, 'text/csv;charset=utf-8;');
}

export interface ExcelSheet {
  name: string;
  title?: string;
  subtitles?: string[];
  columns: ExcelColumn[];
  data: any[];
  notes?: string[];
}

/**
 * Xuất bảng tính Excel đa sheet chuẩn OpenXML (.xlsx) chính thức của Microsoft Office
 * Mở được ngay bằng Microsoft Excel, Google Sheets, LibreOffice, WPS Office, Office 365
 * KHÔNG BAO GIỜ BỊ CẢNH BÁO "The file format and extension don't match"
 */
export function exportMultiSheetExcel(filename: string, sheets: ExcelSheet[]) {
  if (typeof window === 'undefined') return;

  const wb = XLSX.utils.book_new();

  sheets.forEach((sheet) => {
    const aoa: any[][] = [];
    const merges: XLSX.Range[] = [];
    const totalCols = Math.max(1, sheet.columns.length);

    // 1. Tiêu đề chính (title)
    if (sheet.title) {
      aoa.push([sheet.title]);
      merges.push({
        s: { r: aoa.length - 1, c: 0 },
        e: { r: aoa.length - 1, c: totalCols - 1 },
      });
    }

    // 2. Các dòng thông tin phụ (subtitles: Hộ kinh doanh, MST, SĐT, Căn cứ pháp lý...)
    if (sheet.subtitles && sheet.subtitles.length > 0) {
      sheet.subtitles.forEach((sub) => {
        aoa.push([sub]);
        merges.push({
          s: { r: aoa.length - 1, c: 0 },
          e: { r: aoa.length - 1, c: totalCols - 1 },
        });
      });
      // Dòng trống cách quãng
      aoa.push([]);
    }

    // 3. Dòng tiêu đề cột của bảng tính
    const headerRowIndex = aoa.length;
    aoa.push(sheet.columns.map((c) => c.header));

    // 4. Các dòng dữ liệu
    const dataStartRowIndex = aoa.length;
    sheet.data.forEach((row) => {
      const isTotal = Boolean(row._isTotal);
      const rowValues = sheet.columns.map((col) => {
        const val = row[col.key];
        if (val === null || val === undefined) return '';

        if (col.type === 'number' || col.type === 'currency') {
          if (typeof val === 'number') return val;
          const strVal = String(val).trim();
          const cleanStr = strVal.replace(/[,\s]/g, '');
          if (/^-?\d+(\.\d+)?$/.test(cleanStr)) {
            return parseFloat(cleanStr);
          }
          return val; // chuỗi text như "-", "0 đ (Miễn thuế)", "Đã bãi bỏ"
        }

        return val;
      });

      const currentRowIdx = aoa.length;
      aoa.push(rowValues);

      // Nếu là dòng tổng cộng và có từ 5 cột trở lên (ví dụ dòng [29] hoặc [35])
      if (isTotal && totalCols >= 5) {
        merges.push({
          s: { r: currentRowIdx, c: 0 },
          e: { r: currentRowIdx, c: 2 },
        });
      }
    });

    // 5. Ghi chú & Chữ ký người nộp thuế cuối bảng
    if (sheet.notes && sheet.notes.length > 0) {
      aoa.push([]); // Dòng trống ngăn cách
      sheet.notes.forEach((note) => {
        aoa.push([note]);
        merges.push({
          s: { r: aoa.length - 1, c: 0 },
          e: { r: aoa.length - 1, c: totalCols - 1 },
        });
      });
    }

    // 6. Tạo worksheet từ mảng dữ liệu AOA
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // 7. Gán danh sách ô merge
    if (merges.length > 0) {
      ws['!merges'] = merges;
    }

    // 8. Đặt độ rộng cột (wch)
    ws['!cols'] = sheet.columns.map((col) => {
      const defaultWch = Math.max(12, Math.round((col.width || 120) / 7.5));
      return { wch: defaultWch };
    });

    // 9. Format số và tiền tệ
    for (let r = dataStartRowIndex; r < dataStartRowIndex + sheet.data.length; r++) {
      sheet.columns.forEach((col, c) => {
        if (col.type === 'currency' || col.type === 'number') {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          const cell = ws[cellRef];
          if (cell && typeof cell.v === 'number') {
            cell.z = col.type === 'currency' ? '#,##0 "₫"' : '#,##0';
          }
        }
      });
    }

    // Đặt tên sheet an toàn (tối đa 31 ký tự theo chuẩn Excel)
    const cleanSheetName = (sheet.name || 'Sheet1').replace(/[:\\/?*\[\]]/g, '_').substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, cleanSheetName);
  });

  // Tên file xuất ra bắt buộc đuôi chuẩn .xlsx
  const finalFilename = filename.endsWith('.xlsx')
    ? filename
    : filename.endsWith('.xls')
    ? filename.replace(/\.xls$/, '.xlsx')
    : `${filename}.xlsx`;

  try {
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadFile(blob, finalFilename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) {
    console.warn('Fallback sang XLSX.writeFile:', e);
    XLSX.writeFile(wb, finalFilename);
  }
}
