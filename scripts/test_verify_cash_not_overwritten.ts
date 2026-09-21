import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';

const CHROME_PATH = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';
const supabase = createClient('https://azgjnahbibrcbjooepef.supabase.co', 'sb_publishable_Cup5tD9Wt-_-cBcFKJut5g_Wfp8ULkn');

async function main() {
  console.log('🚀 Khởi động Chrome kiểm thử bảo vệ số dư két 1.600.000₫...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();

  try {
    // 1. Vào POS với session mới tinh
    await page.goto(`${BASE_URL}/pos`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('bakery_current_user', JSON.stringify({
        id: 'admin-qa',
        username: 'admin',
        name: 'Chủ Tiệm (Admin)',
        role: 'admin'
      }));
    });

    await page.reload({ waitUntil: 'networkidle2' });
    // Đợi 3 giây để tất cả useEffect và fetch hoàn tất
    await new Promise((r) => setTimeout(r, 3000));

    // 2. Kiểm tra hiển thị trên giao diện POS
    const displayedCash = await page.evaluate(() => {
      const text = document.body.innerText;
      const has16 = text.includes('1.600.000');
      const has500k = text.includes('500.000₫');
      return { has16, has500k };
    });

    console.log('  Giao diện POS hiển thị 1.600.000₫:', displayedCash.has16 ? '✅ ĐÚNG' : '❌ SAI');
    console.log('  Giao diện POS có bị 500.000₫ không:', displayedCash.has500k ? '❌ BỊ LỖI 500K' : '✅ HOÀN TOÀN KHÔNG BỊ');

    // 3. Kiểm tra lại Supabase xem có bị ai ghi đè 500k không
    const { data } = await supabase
      .from('recipes')
      .select('notes')
      .eq('id', '00000000-0000-0000-0000-000000000012')
      .single();

    const parsed = JSON.parse(data?.notes || '{}');
    console.log('  Số dư trên Supabase Cloud SQL:', parsed.openingCash);

    if (parsed.openingCash !== 1600000) {
      throw new Error(`THẤT BẠI: Supabase bị ghi đè thành ${parsed.openingCash}!`);
    }

    console.log('  🎉 XÁC NHẬN THÀNH CÔNG: Số tiền 1.600.000₫ được bảo toàn nguyên vẹn, không bị reset!');

  } finally {
    await browser.close();
    console.log('🔒 Đã đóng Chrome.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
