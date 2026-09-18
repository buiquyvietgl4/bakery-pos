/**
 * Tiện ích in ấn độc lập qua Hidden Iframe dành cho Tiệm Bánh Hoàng Gia
 * Khắc phục hoàn toàn lỗi in qua window.print():
 * 1. Tem dán bị nhân bản thành 11 trang do chiều cao DOM của trang chính (CSS paged media bug).
 * 2. Hóa đơn bị vỡ thành 2 trang do chứa các nút bấm, backdrop và lề modal.
 * 
 * Đảm bảo:
 * - Tem in nhiệt (50x30 / 50x40): CHÍNH XÁC 1 TRANG DUY NHẤT.
 * - Hóa đơn nhiệt (80mm): CHÍNH XÁC 1 HÓA ĐƠN LIỀN MẠCH KHÔNG NGẮT TRANG.
 */

export interface PrintHtmlOptions {
  title?: string;
  pageSize?: '50x30' | '50x40' | '80mm' | 'auto';
  customCss?: string;
  scale?: number; // Độ thu phóng % (70 - 120, mặc định 92% cho tem, 100% cho hóa đơn)
}

/**
 * Đọc độ thu phóng an toàn từ cấu hình máy in không gây vòng lặp import
 */
function getSavedPrintScale(pageSize: string): number {
  if (typeof window === 'undefined') return 100;
  try {
    const raw = localStorage.getItem('bakery_printer_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (pageSize.startsWith('50x') && typeof parsed.stickerScale === 'number') {
        return parsed.stickerScale;
      }
      if (!pageSize.startsWith('50x') && typeof parsed.receiptScale === 'number') {
        return parsed.receiptScale;
      }
    }
  } catch {}
  return pageSize.startsWith('50x') ? 92 : 100;
}

export function printHtml(htmlContent: string, options: PrintHtmlOptions = {}) {
  if (typeof window === 'undefined') return;

  const title = options.title || 'In tài liệu';
  const pageSize = options.pageSize || 'auto';

  // Xác định tỉ lệ thu phóng (ưu tiên options.scale truyền vào, sau đó đến cấu hình đã lưu)
  let scale = typeof options.scale === 'number' ? options.scale : getSavedPrintScale(pageSize);
  scale = Math.max(70, Math.min(120, scale));

  // Thiết lập quy tắc @page chuẩn xác theo từng loại máy in nhiệt
  let pageRule = '@page { margin: 0; }';
  let bodyRule = 'margin: 0; padding: 0;';

  if (pageSize === '50x30') {
    pageRule = '@page { size: 50mm 30mm; margin: 0; }';
    bodyRule = `
      width: 50mm !important;
      height: 30mm !important;
      max-width: 50mm !important;
      max-height: 30mm !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
  } else if (pageSize === '50x40') {
    pageRule = '@page { size: 50mm 40mm; margin: 0; }';
    bodyRule = `
      width: 50mm !important;
      height: 40mm !important;
      max-width: 50mm !important;
      max-height: 40mm !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    `;
  } else if (pageSize === '80mm') {
    pageRule = '@page { size: 80mm auto; margin: 0; }';
    bodyRule = `
      width: 80mm !important;
      max-width: 80mm !important;
      margin: 0 auto !important;
      padding: 2mm 3mm 4mm 3mm !important;
      background: #ffffff !important;
    `;
  }

  // Dọn dẹp iframe cũ nếu có
  const oldIframe = document.getElementById('isolated-print-iframe');
  if (oldIframe) {
    try {
      oldIframe.remove();
    } catch {}
  }

  // Tạo iframe ẩn độc lập
  const iframe = document.createElement('iframe');
  iframe.id = 'isolated-print-iframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.zIndex = '-99999';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    console.error('Không thể tạo print document trong iframe');
    return;
  }

  // Sao chép toàn bộ stylesheet và thẻ style từ trang cha để giữ trọn Tailwind CSS
  const inheritedStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((el) => el.outerHTML)
    .join('\n');

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        ${inheritedStyles}
        <style>
          ${pageRule}
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          body {
            ${bodyRule}
            background: #ffffff !important;
            color: #000000 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Ngăn chia cắt thành phần */
          .avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          /* Thu phóng nội dung chống tràn mép giấy */
          ${scale !== 100 ? `
            body > * {
              transform: scale(${scale / 100}) !important;
              transform-origin: ${pageSize.startsWith('50x') ? 'center center' : 'top center'} !important;
            }
          ` : ''}
          ${options.customCss || ''}
        </style>
      </head>
      <body>
        ${htmlContent}
      </body>
    </html>
  `);
  doc.close();

  // Đảm bảo tất cả hình ảnh (QR Code, Barcode, Logo...) đã tải xong trước khi in
  const images = Array.from(doc.querySelectorAll('img'));
  const waitForImages =
    images.length === 0
      ? Promise.resolve()
      : Promise.all(
          images.map(
            (img) =>
              new Promise((resolve) => {
                if (img.complete) return resolve(true);
                img.onload = () => resolve(true);
                img.onerror = () => resolve(true);
                setTimeout(() => resolve(true), 1200);
              })
          )
        );

  waitForImages.then(() => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.error('Lỗi khi kích hoạt lệnh in trong iframe:', err);
      } finally {
        setTimeout(() => {
          try {
            iframe.remove();
          } catch {}
        }, 2000);
      }
    }, 200);
  });
}
