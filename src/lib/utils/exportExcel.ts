/**
 * Tiện ích xuất file Excel chuyên nghiệp hỗ trợ tiếng Việt có dấu chuẩn 100%
 * Sử dụng định dạng XML Spreadsheet và UTF-8 CSV có BOM (Byte Order Mark)
 * Mở được ngay bằng Microsoft Excel, Google Sheets, LibreOffice, WPS Office
 */

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  type?: 'string' | 'number' | 'currency' | 'date';
}

/**
 * Tải xuống file blob về máy người dùng
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
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
  columns: ExcelColumn[];
  data: any[];
}

/**
 * Xuất bảng tính Excel đa sheet chuẩn XML Spreadsheet 2003
 * Hỗ trợ tiêu đề đậm, màu nền bảng biểu, định dạng tiền tệ và nhiều sheet trong 1 file
 */
export function exportMultiSheetExcel(filename: string, sheets: ExcelSheet[]) {
  const sanitize = (str: any) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const xmlSheets = sheets.map((sheet) => {
    const colTags = sheet.columns
      .map((col) => `<Column ss:AutoFitWidth="1" ss:Width="${col.width || 120}"/>`)
      .join('\n');

    const headerCells = sheet.columns
      .map(
        (col) =>
          `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${sanitize(col.header)}</Data></Cell>`
      )
      .join('');

    const rowsXml = sheet.data
      .map((row) => {
        const cells = sheet.columns
          .map((col) => {
            const val = row[col.key];
            if (val === null || val === undefined) {
              return `<Cell ss:StyleID="DefaultStyle"><Data ss:Type="String"></Data></Cell>`;
            }
            if (col.type === 'number' || col.type === 'currency') {
              const numVal = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, '')) || 0;
              const styleId = col.type === 'currency' ? 'CurrencyStyle' : 'NumberStyle';
              return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${numVal}</Data></Cell>`;
            }
            return `<Cell ss:StyleID="DefaultStyle"><Data ss:Type="String">${sanitize(val)}</Data></Cell>`;
          })
          .join('');
        return `<Row>${cells}</Row>`;
      })
      .join('\n');

    return `
    <Worksheet ss:Name="${sanitize(sheet.name.substring(0, 31))}">
      <Table>
        ${colTags}
        <Row ss:Height="26">${headerCells}</Row>
        ${rowsXml}
      </Table>
    </Worksheet>`;
  }).join('\n');

  const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#111827"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>
    <Style ss:ID="DefaultStyle">
      <Alignment ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1F2937"/>
    </Style>
    <Style ss:ID="HeaderStyle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#B45309"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D97706"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#D97706" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="NumberStyle">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#1F2937"/>
      <NumberFormat ss:Format="#,##0"/>
    </Style>
    <Style ss:ID="CurrencyStyle">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7EB"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#047857"/>
      <NumberFormat ss:Format="#,##0\ &quot;₫&quot;"/>
    </Style>
  </Styles>
  ${xmlSheets}
</Workbook>`;

  downloadFile(
    xmlContent,
    filename.endsWith('.xls') ? filename : `${filename}.xls`,
    'application/vnd.ms-excel;charset=utf-8'
  );
}
