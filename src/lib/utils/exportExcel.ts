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
  align?: 'left' | 'center' | 'right';
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
  title?: string;
  subtitles?: string[];
  columns: ExcelColumn[];
  data: any[];
  notes?: string[];
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

    const totalCols = Math.max(1, sheet.columns.length);
    const titleXml: string[] = [];

    if (sheet.title) {
      titleXml.push(`
        <Row ss:Height="28">
          <Cell ss:MergeAcross="${totalCols - 1}" ss:StyleID="TitleStyle">
            <Data ss:Type="String">${sanitize(sheet.title)}</Data>
          </Cell>
        </Row>`);
    }

    if (sheet.subtitles && sheet.subtitles.length > 0) {
      sheet.subtitles.forEach((sub) => {
        const isBanner = sub.startsWith('XÁC NHẬN NGHĨA VỤ THUẾ') || sub.startsWith('CĂN CỨ PHÁP LÝ');
        const style = isBanner ? 'BannerStyle' : 'SubtitleStyle';
        titleXml.push(`
        <Row ss:Height="${isBanner ? 24 : 18}">
          <Cell ss:MergeAcross="${totalCols - 1}" ss:StyleID="${style}">
            <Data ss:Type="String">${sanitize(sub)}</Data>
          </Cell>
        </Row>`);
      });
      titleXml.push(`<Row ss:Height="8"></Row>`);
    }

    const headerCells = sheet.columns
      .map(
        (col) =>
          `<Cell ss:StyleID="HeaderStyle"><Data ss:Type="String">${sanitize(col.header)}</Data></Cell>`
      )
      .join('');

    const rowsXml = sheet.data
      .map((row) => {
        const isTotal = Boolean(row._isTotal);
        const cells = sheet.columns
          .map((col) => {
            const val = row[col.key];
            if (val === null || val === undefined) {
              const emptyStyle = isTotal ? 'TotalLabelStyle' : 'DefaultStyle';
              return `<Cell ss:StyleID="${emptyStyle}"><Data ss:Type="String"></Data></Cell>`;
            }

            if (col.type === 'number' || col.type === 'currency') {
              if (typeof val === 'number') {
                const styleId = isTotal
                  ? 'TotalCurrencyStyle'
                  : col.type === 'currency'
                  ? 'CurrencyStyle'
                  : 'NumberStyle';
                return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${val}</Data></Cell>`;
              }
              // Nếu là chuỗi số thuần túy (VD: "31646000" hoặc "31,646,000")
              const strVal = String(val).trim();
              const cleanStr = strVal.replace(/[,\s]/g, '');
              if (/^-?\d+(\.\d+)?$/.test(cleanStr)) {
                const numVal = parseFloat(cleanStr);
                const styleId = isTotal
                  ? 'TotalCurrencyStyle'
                  : col.type === 'currency'
                  ? 'CurrencyStyle'
                  : 'NumberStyle';
                return `<Cell ss:StyleID="${styleId}"><Data ss:Type="Number">${numVal}</Data></Cell>`;
              }
              // Chuỗi text (VD: "-", "Miễn thuế", "0 đ (Miễn thuế)")
              const styleId = isTotal
                ? (col.align === 'center' ? 'TotalCenterStyle' : 'TotalLabelStyle')
                : (col.align === 'center' ? 'CenterStyle' : 'DefaultStyle');
              return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${sanitize(val)}</Data></Cell>`;
            }

            const styleId = isTotal
              ? (col.align === 'center' ? 'TotalCenterStyle' : 'TotalLabelStyle')
              : (col.align === 'center' ? 'CenterStyle' : 'DefaultStyle');
            return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${sanitize(val)}</Data></Cell>`;
          })
          .join('');
        return `<Row ss:Height="${isTotal ? 24 : 20}">${cells}</Row>`;
      })
      .join('\n');

    const noteXml: string[] = [];
    if (sheet.notes && sheet.notes.length > 0) {
      noteXml.push(`<Row ss:Height="10"></Row>`);
      sheet.notes.forEach((n) => {
        noteXml.push(`
        <Row ss:Height="18">
          <Cell ss:MergeAcross="${totalCols - 1}" ss:StyleID="NoteStyle">
            <Data ss:Type="String">${sanitize(n)}</Data>
          </Cell>
        </Row>`);
      });
    }

    return `
    <Worksheet ss:Name="${sanitize(sheet.name.substring(0, 31))}">
      <Table>
        ${colTags}
        ${titleXml.join('\n')}
        <Row ss:Height="26">${headerCells}</Row>
        ${rowsXml}
        ${noteXml.join('\n')}
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
    <Style ss:ID="TitleStyle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="13" ss:Bold="1" ss:Color="#065F46"/>
    </Style>
    <Style ss:ID="SubtitleStyle">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Color="#374151"/>
    </Style>
    <Style ss:ID="BannerStyle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10" ss:Bold="1" ss:Color="#065F46"/>
      <Interior ss:Color="#ECFDF5" ss:Pattern="Solid"/>
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
    <Style ss:ID="CenterStyle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
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
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#059669"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#10B981"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#059669" ss:Pattern="Solid"/>
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
    <Style ss:ID="TotalLabelStyle">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#059669"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#059669"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Bold="1" ss:Color="#065F46"/>
      <Interior ss:Color="#ECFDF5" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="TotalCenterStyle">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#059669"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#059669"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Bold="1" ss:Color="#065F46"/>
      <Interior ss:Color="#ECFDF5" ss:Pattern="Solid"/>
    </Style>
    <Style ss:ID="TotalCurrencyStyle">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#059669"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#A7F3D0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#059669"/>
      </Borders>
      <Font ss:FontName="Segoe UI" ss:Size="10.5" ss:Bold="1" ss:Color="#065F46"/>
      <Interior ss:Color="#ECFDF5" ss:Pattern="Solid"/>
      <NumberFormat ss:Format="#,##0\ &quot;₫&quot;"/>
    </Style>
    <Style ss:ID="NoteStyle">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" ss:Size="9" ss:Italic="1" ss:Color="#6B7280"/>
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
